"""
Modo LAN: el cliente sirve el dashboard en la red local y le manda la
telemetria por un WebSocket local, sin pasar por el relay de Railway. Para
celular/tablet en la misma WiFi es la ruta de menos latencia y la que no
sufre los cortes periodicos del proxy de Railway; el modo cloud (pairing
code) sigue funcionando en paralelo para todo lo demas.

Dos servidores en el PC:
  - HTTP  (puerto 27765): sirve una copia del web app (index.html, app.js,
    ...) bajada de trucksim-dash.com al arrancar (cache en %LOCALAPPDATA%),
    asi el modo LAN siempre corre la misma version que el sitio sin tener
    que re-empaquetar el .exe.
  - WS    (puerto 27766): broadcast de cada payload de telemetria a los
    viewers conectados + comandos de la botonera (mismo protocolo que el
    backend).

Por que hace falta servir la web localmente y no usar la pagina de
trucksim-dash.com directo: una pagina https no puede abrir un WebSocket
ws:// a una IP de la LAN (mixed content, lo bloquean todos los navegadores)
- la pagina tiene que ser http tambien.
"""

import asyncio
import errno
import http.server
import json
import logging
import os
import socket
import threading
from urllib.request import urlopen

import client as client_lib

# Overridables por env para correr una segunda instancia (desarrollo) al lado del .exe.
HTTP_PORT = int(os.environ.get("TRUCKDASH_HTTP_PORT", 27765))
WS_PORT = int(os.environ.get("TRUCKDASH_WS_PORT", 27766))
WEB_ORIGIN = "https://trucksim-dash.com"
WEB_FILES = [
    "app/index.html", "app/app.js", "app/app.css", "app/i18n.js", "app/pure.js",
    "app/manifest.json", "app/assets/logo.svg", "app/assets/icon-192.png", "app/assets/icon-512.png",
]


def cache_dir() -> str:
    base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    path = os.path.join(base, "TruckDash", "webcache")
    os.makedirs(os.path.join(path, "app", "assets"), exist_ok=True)
    return path


def lan_ip() -> str | None:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except OSError:
        return None


def refresh_web_cache() -> bool:
    """Baja la ultima version del web app a la cache local. Devuelve True si
    hay una copia servible (nueva o anterior)."""
    target = cache_dir()
    ok = 0
    for rel in WEB_FILES:
        try:
            with urlopen(f"{WEB_ORIGIN}/{rel}", timeout=15) as resp:
                data = resp.read()
            with open(os.path.join(target, rel.replace("/", os.sep)), "wb") as f:
                f.write(data)
            ok += 1
        except Exception as exc:
            logging.warning("No se pudo bajar %s para el modo LAN: %s", rel, exc)
    if ok:
        logging.info("Web cache actualizada (%d/%d archivos)", ok, len(WEB_FILES))
    return os.path.exists(os.path.join(target, "app", "index.html"))


# Lo setea tray_client: abre la ventana de Setup de ESTA instancia cuando
# llega un segundo arranque (ver /__show-setup mas abajo).
on_show_setup = None


class _StaticHandler(http.server.SimpleHTTPRequestHandler):
    """Sirve la web app y los datos (/data/*.json) pidiendolos primero al
    sitio (asi el modo LAN corre siempre la version actual de la web sin
    depender de cuando arranco el cliente) y cayendo a la copia en cache si
    no hay internet."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=cache_dir(), **kwargs)

    def do_GET(self):
        # Los archivos se referencian con ?v=... para cache-busting - el query
        # se ignora. "/" y "/app" van al index.
        path = self.path.split("?", 1)[0]
        # Un segundo arranque del .exe (issue #4) no abre otra instancia: le
        # pide a esta que muestre su ventana de Setup y se va. Solo desde la
        # misma maquina, no desde la red.
        if path == "/__show-setup":
            local = self.client_address[0] in ("127.0.0.1", "::1", "::ffff:127.0.0.1")
            if local and on_show_setup:
                try:
                    on_show_setup()
                except Exception:
                    logging.exception("on_show_setup fallo")
            self.send_response(204 if local else 403)
            self.end_headers()
            return
        if path in ("/", "/app", "/app/"):
            path = "/app/index.html"
        if path.startswith("/app/") or path.startswith("/data/"):
            rel = path.lstrip("/")
            local_path = os.path.join(cache_dir(), rel.replace("/", os.sep))
            if _refresh_file(rel, local_path):
                pass  # cache actualizada
            elif not os.path.exists(local_path):
                self.send_error(404, "Not cached and site unreachable")
                return
        self.path = path
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, format, *args):
        pass


def _refresh_file(rel: str, local_path: str) -> bool:
    """Baja rel (ej. app/app.js) del sitio a local_path. False si no se pudo
    (sin internet, 404) - el llamador usa la copia anterior si existe."""
    if ".." in rel:
        return False
    try:
        with urlopen(f"{WEB_ORIGIN}/{rel}", timeout=6) as resp:
            data = resp.read()
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        with open(local_path, "wb") as f:
            f.write(data)
        return True
    except Exception:
        return False



class _ViewerOutbox:
    """Cola de salida de un viewer LAN: la telemetria se pisa (solo el ultimo
    tick), los mensajes de estado se encolan y no se pierden."""

    def __init__(self, ws, on_dead):
        self.ws = ws
        self.on_dead = on_dead
        self.latest = None
        self.control = []
        self.wake = asyncio.Event()
        self.task = asyncio.create_task(self._run())

    def push(self, text, must_deliver=False):
        if must_deliver:
            self.control.append(text)
        else:
            self.latest = text
        self.wake.set()

    async def _run(self):
        try:
            while True:
                await self.wake.wait()
                self.wake.clear()
                while self.control:
                    await self.ws.send(self.control.pop(0))
                if self.latest is not None:
                    text, self.latest = self.latest, None
                    await self.ws.send(text)
        except asyncio.CancelledError:
            pass
        except Exception:
            self.on_dead()

    def close(self):
        self.task.cancel()

class LocalServer:
    def __init__(self, keybinds: dict):
        self.keybinds = keybinds
        self.viewers: set = set()
        self._outboxes: dict = {}
        self.last_status_message: str | None = None
        self.http_server: http.server.ThreadingHTTPServer | None = None
        self.ws_server = None
        self.web_ready = False
        self.error: str | None = None
        self.port_in_use = False

    @property
    def url(self) -> str | None:
        ip = lan_ip()
        return f"http://{ip}:{HTTP_PORT}/app/?local=1" if ip else None

    async def start(self):
        import websockets

        self.web_ready = await asyncio.to_thread(refresh_web_cache)
        try:
            self.http_server = http.server.ThreadingHTTPServer(("0.0.0.0", HTTP_PORT), _StaticHandler)
            threading.Thread(target=self.http_server.serve_forever, daemon=True).start()
            self.ws_server = await websockets.serve(self._handle_viewer, "0.0.0.0", WS_PORT)
            logging.info("Servidor LAN escuchando en http://0.0.0.0:%d (ws %d)", HTTP_PORT, WS_PORT)
        except OSError as exc:
            # El puerto ocupado es el caso comun (otra instancia, u otro
            # programa): la ventana mostraba el OSError crudo de Python. Se
            # marca aparte para que la UI diga algo legible (issue #4).
            self.error = str(exc)
            self.port_in_use = getattr(exc, "errno", None) == errno.EADDRINUSE or "10048" in str(exc)
            # Si el HTTP levanto y fallo el WS, no dejar medio servidor arriba:
            # el modo LAN no sirve sin los dos y el puerto queda tomado.
            if self.http_server is not None:
                try:
                    self.http_server.shutdown()
                    self.http_server.server_close()
                except Exception:
                    logging.exception("No se pudo cerrar el HTTP a medio levantar")
                self.http_server = None
            logging.warning("No se pudo levantar el servidor LAN: %s", exc)

    async def _handle_viewer(self, ws):
        self.viewers.add(ws)
        try:
            await ws.send(json.dumps({"type": "session_state", "client_connected": True, "client_status": None, "local": True}))
            if self.last_status_message:
                await ws.send(self.last_status_message)
            async for message in ws:
                await client_lib.handle_control_message(message, self.keybinds, ws.send)
        except Exception:
            pass
        finally:
            self.viewers.discard(ws)
            ob = self._outboxes.pop(ws, None)
            if ob is not None:
                ob.close()

    async def broadcast(self, text: str, is_status: bool = False):
        """Manda a todos los viewers LAN sin esperar a ninguno: cada viewer
        tiene su propia task de envio y la telemetria se pisa (solo importa el
        ultimo tick). Antes el loop de telemetria esperaba el send de cada
        viewer en orden: un tablet lento en el wifi frenaba el loop entero
        (incluido el envio a la nube) y la web se quedaba minutos atras."""
        if is_status:
            self.last_status_message = text
        if not self.viewers:
            return
        for viewer in list(self.viewers):
            self._outbox(viewer).push(text, must_deliver=is_status)

    def _outbox(self, viewer):
        ob = self._outboxes.get(viewer)
        if ob is None:
            ob = _ViewerOutbox(viewer, on_dead=lambda v=viewer: self._drop_viewer(v))
            self._outboxes[viewer] = ob
        return ob

    def _drop_viewer(self, viewer):
        self.viewers.discard(viewer)
        ob = self._outboxes.pop(viewer, None)
        if ob is not None:
            ob.close()


def qr_image(url: str, box_size: int = 3):
    """QR de la URL de LAN, en modulos OSCUROS sobre fondo CLARO y con la zona
    silenciosa de 4 modulos que pide la norma.

    Antes se dibujaba al reves (claro sobre el gris oscuro del panel) porque
    quedaba lindo con el tema de la ventana: la camara de Samsung (y la de
    varios Android) no lee un QR invertido y la de otros telefonos si, asi que
    parecia un QR "roto" al azar (issue #3). Un lector tiene que poder asumir
    oscuro = 1.
    """
    import qrcode

    qr = qrcode.QRCode(box_size=box_size, border=4)
    qr.add_data(url)
    qr.make(fit=True)
    return qr.make_image(fill_color="black", back_color="white").convert("RGB")

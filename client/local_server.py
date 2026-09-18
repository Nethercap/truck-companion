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


class LocalServer:
    def __init__(self, keybinds: dict):
        self.keybinds = keybinds
        self.viewers: set = set()
        self.last_status_message: str | None = None
        self.http_server: http.server.ThreadingHTTPServer | None = None
        self.ws_server = None
        self.web_ready = False
        self.error: str | None = None

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
            self.error = str(exc)
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

    async def broadcast(self, text: str, is_status: bool = False):
        if is_status:
            self.last_status_message = text
        if not self.viewers:
            return
        dead = []
        for viewer in list(self.viewers):
            try:
                await viewer.send(text)
            except Exception:
                dead.append(viewer)
        for viewer in dead:
            self.viewers.discard(viewer)

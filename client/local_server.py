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
import ipaddress
import json
import logging
import os
import re
import socket
import stat
import threading
import time
from http import HTTPStatus
from urllib.parse import parse_qs, urlencode, urlsplit

import red

import client as client_lib

# Overridables por env para correr una segunda instancia (desarrollo) al lado del .exe.
HTTP_PORT = int(os.environ.get("TRUCKDASH_HTTP_PORT", 27765))
WS_PORT = int(os.environ.get("TRUCKDASH_WS_PORT", 27766))
WEB_ORIGIN = "https://trucksim-dash.com"
WEB_FILES = [
    "app/index.html", "app/app.js", "app/app.css", "app/i18n.js", "app/i18n_en_es.js",
    "app/pure.js", "app/manifest.json",
    # Estos tres faltaban desde siempre: en LAN se bajaban al vuelo si habia
    # internet, y sin internet la app quedaba sin variantes de mapa, sin
    # convoy y sin mapa en vivo. Justo lo que el modo LAN promete resolver.
    "app/variants.js", "app/convoy.js", "app/livemap.js",
    "app/assets/logo.svg", "app/assets/icon-192.png", "app/assets/icon-512.png",
    # El mapa. Antes venian de jsDelivr y en LAN sin internet no habia mapa.
    "app/vendor/maplibre-gl-4.7.1.js", "app/vendor/maplibre-gl-4.7.1.css",
    "app/vendor/pmtiles-3.2.0.js", "app/vendor/proj4-2.15.0.js",
    # El panel de tablero: la app lo muestra a pantalla completa y
    # ademas se sirve solo en /dash/ para un segundo dispositivo.
    "dash/index.html", "dash/dash.js", "dash/dash.css", "dash/page.js",
    "dash/page.css", "dash/manifest.json", "dash/classic.js", "dash/classic.css",
    # Guia por voz: el catalogo y un paquete por voz (la version va en el
    # nombre, como vendor/: no se vuelven a bajar). Ver tools/build_voice_packs.py.
    "app/voice/voices.json",
    "app/voice/en-kristin-v4.json", "app/voice/en-joe-v4.json", "app/voice/es-daniela-v4.json",
    "app/voice/es-claude-v4.json", "app/voice/de-thorsten-v4.json", "app/voice/fr-siwis-v4.json",
    "app/voice/pt-cadu-v4.json", "app/voice/pl-gosia-v4.json", "app/voice/ru-dmitri-v4.json",
    # Las letras de los nombres del mapa (app.js, localGlyphs): sin internet,
    # el mapa LAN quedaba sin nombres de ciudades.
] + [f"app/vendor/glyphs-open-sans-omt2/{r}.pbf" for r in (
    "0-255", "256-511", "512-767", "768-1023", "1024-1279", "7680-7935", "8192-8447")]


def cache_dir() -> str:
    base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    path = os.path.join(base, "TruckDash", "webcache")
    os.makedirs(os.path.join(path, "app", "assets"), exist_ok=True)
    os.makedirs(os.path.join(path, "app", "vendor"), exist_ok=True)
    os.makedirs(os.path.join(path, "app", "voice"), exist_ok=True)
    os.makedirs(os.path.join(path, "dash"), exist_ok=True)
    return path


# Que dispositivos de la red llegaron, una vez por IP y por puerto: sin esto
# el log no distinguia al celular de la pestana de la propia PC, y con "no me
# conecta por LAN" no habia forma de saber si el celular llegaba a la pagina,
# solo a la pagina (27766 cerrado) o a nada (firewall, red Publica, router
# con aislamiento). Log de un usuario del 10-10.
_remotos_vistos: set = set()
_remotos_lock = threading.Lock()


def anotar_remoto(ip, que: str) -> None:
    if not ip or ip.startswith("127.") or ip == "::1":
        return
    with _remotos_lock:
        if (ip, que) in _remotos_vistos:
            return
        _remotos_vistos.add((ip, que))
    logging.info("LAN: %s desde %s", que, ip)


# El WebSocket de datos (27766) solo atiende a las paginas que sirve este
# mismo cliente en el 27765 (la app en modo LAN y /dash/). Antes no miraba el
# Origin y se le conectaba cualquier pagina, tambien una web de otro lado que
# usaba el cliente como si fuera suyo (19-10). Sin header Origin no es un
# navegador (como en el relay, backend/main.py): pasa.
# La pagina se abre por la IP (el QR y "Abrir aca"), localhost o el nombre de
# la PC; un dominio con punto que no sea de la red local lo podria registrar
# cualquiera y apuntarlo a una IP de la casa, asi que no.
_NOMBRES_DE_LA_RED = (".local", ".lan", ".home.arpa", ".internal")
_CGNAT = ipaddress.ip_network("100.64.0.0/10")  # VPN de malla (Tailscale)
_origenes_rechazados: dict = {}


def origen_permitido(origin: str | None) -> bool:
    if origin is None:
        return True
    try:
        url = urlsplit(origin)
        puerto = url.port
    except ValueError:
        return False
    host = (url.hostname or "").lower()
    if url.scheme != "http" or puerto != HTTP_PORT or not host or url.path or url.query:
        return False
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return (host == "localhost" or bool(re.fullmatch(r"[a-z0-9-]+", host))
                or (host.endswith(_NOMBRES_DE_LA_RED) and bool(re.fullmatch(r"[a-z0-9.-]+", host))))
    return ip.is_loopback or ip.is_private or ip.is_link_local or ip in _CGNAT


# A quien le contesta el 27765 con CORS (lo que otra pagina puede leer). Lo
# pide trucksim-dash.com en la misma PC: los mapas armados en la PC
# (/localmap/, ver localMapRoot en app.js). Las paginas del cliente son del
# mismo origen y no lo necesitan, pero pasan igual que en el 27766
# (origen_permitido), y localhost en cualquier puerto (un servidor de
# desarrollo de docs/). Antes era "*" para cualquier pagina (19-10).
ORIGENES_WEB = ("https://trucksim-dash.com", "https://www.trucksim-dash.com")


def origen_cors(origin: str | None) -> str | None:
    """El Origin a devolver en Access-Control-Allow-Origin, o None."""
    if not origin:
        return None
    if origin in ORIGENES_WEB or origen_permitido(origin):
        return origin
    try:
        url = urlsplit(origin)
        url.port  # un puerto roto tira ValueError
    except ValueError:
        return None
    if url.scheme == "http" and (url.hostname or "").lower() in ("localhost", "127.0.0.1", "::1") \
            and not url.path and not url.query:
        return origin
    return None


# /__show-setup pide este header: una pagina no lo puede mandar sin un
# preflight que el 27765 no autoriza, asi que una web abierta en la PC ya no
# abre la ventana de Setup con un <img> (19-10). Lo manda _focus_running_instance.
SHOW_SETUP_HEADER = "X-TruckDash"
SHOW_SETUP_VALUE = "show-setup"


def _solo_paginas_del_cliente(connection, request):
    """process_request del WebSocket: 403 a una pagina de otro origen, y una
    linea en el log por origen y por hora (por si uno legitimo quedo afuera)."""
    origenes = request.headers.get_all("Origin")
    origin = origenes[0] if len(origenes) == 1 else (None if not origenes else "")
    if origen_permitido(origin):
        return None
    ahora = time.time()
    if ahora - _origenes_rechazados.get(origin, 0) > 3600:
        _origenes_rechazados[origin] = ahora
        logging.warning("LAN: datos (27766) rechazados a una pagina de %s", origin or "origen invalido")
    return connection.respond(HTTPStatus.FORBIDDEN, "origin not allowed\n")


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
    solo_lectura = []
    for rel in WEB_FILES:
        local = os.path.join(target, rel.replace("/", os.sep))
        os.makedirs(os.path.dirname(local), exist_ok=True)
        # Las librerias llevan la version en el nombre y no cambian nunca:
        # no hace falta volver a bajar un mega en cada arranque.
        versionado = rel.startswith("app/vendor/") or (rel.startswith("app/voice/") and rel != "app/voice/voices.json")
        if versionado and os.path.exists(local):
            ok += 1
            continue
        try:
            with red.abrir(f"{WEB_ORIGIN}/{rel}", timeout=15) as resp:
                data = resp.read()
            # Un mod (18-10) deja index.html, app.js, app.css y pure.js en
            # solo lectura para que no se los pisen: al volver al cliente
            # oficial quedaban los del mod mezclados con el resto nuevo y el
            # modo LAN andaba raro. La cache es nuestra, se le saca.
            if os.path.exists(local) and not os.access(local, os.W_OK):
                os.chmod(local, os.stat(local).st_mode | stat.S_IWRITE)
                solo_lectura.append(rel)
            with open(local, "wb") as f:
                f.write(data)
            ok += 1
        except Exception as exc:
            logging.warning("No se pudo bajar %s para el modo LAN: %s", rel, exc)
    if solo_lectura:
        logging.warning("Web cache: estaban en solo lectura y se pisaron igual: %s", ", ".join(solo_lectura))
    if ok:
        logging.info("Web cache actualizada (%d/%d archivos)", ok, len(WEB_FILES))
    return os.path.exists(os.path.join(target, "app", "index.html"))


# Lo setea tray_client: abre la ventana de Setup de ESTA instancia cuando
# llega un segundo arranque (ver /__show-setup mas abajo).
on_show_setup = None


# Mapa armado en esta PC ("Build my map", ver map_builder.py): juego ->
# carpeta. Lo actualiza la bandeja cuando hay un mapa que coincide con los
# mods activos. Se sirve en /localmap/<juego>/... con los mismos nombres de
# archivo que una variante de R2.
local_map_dirs: dict = {}


class _StaticHandler(http.server.SimpleHTTPRequestHandler):
    """Sirve la web app y los datos (/data/*.json) pidiendolos primero al
    sitio (asi el modo LAN corre siempre la version actual de la web sin
    depender de cuando arranco el cliente) y cayendo a la copia en cache si
    no hay internet."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=cache_dir(), **kwargs)

    # Parametros que ya dicen como conectarse: si viene alguno, no se toca.
    CONNECT_PARAMS = ("local", "demo", "code", "backend", "live", "convoy")

    def do_OPTIONS(self):
        # Preflight de Chrome para una pagina publica (trucksim-dash.com) que
        # le pide algo a 127.0.0.1: sin Allow-Private-Network lo corta. Solo
        # a los origenes de origen_cors: a los demas, sin permisos.
        self.send_response(204)
        if origen_cors(self.headers.get("Origin")):
            self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Range")
            self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_HEAD(self):
        if self.path.startswith("/localmap/"):
            self._serve_local_map(head=True)
            return
        super().do_HEAD()

    def _serve_local_map(self, head: bool = False):
        """Archivos del mapa armado, con rangos (pmtiles pide de a pedazos y
        SimpleHTTPRequestHandler no sabe responder 206)."""
        partes = self.path.split("?", 1)[0].split("/")[2:]  # ['ats', 'vector', 'local_ats.pmtiles']
        base = local_map_dirs.get(partes[0]) if partes else None
        rel = "/".join(partes[1:])
        if not base or not rel or ".." in partes:
            self.send_error(404)
            return
        ruta = os.path.normpath(os.path.join(base, *partes[1:]))
        if not ruta.startswith(os.path.normpath(base) + os.sep) or not os.path.isfile(ruta):
            self.send_error(404)
            return
        total = os.path.getsize(ruta)
        inicio, fin = 0, total - 1
        rango = self.headers.get("Range")
        if rango and rango.startswith("bytes="):
            try:
                a, b = rango[6:].split(",")[0].split("-")
                if a:
                    inicio, fin = int(a), (int(b) if b else total - 1)
                else:
                    inicio, fin = max(0, total - int(b)), total - 1
                fin = min(fin, total - 1)
            except ValueError:
                inicio, fin = 0, total - 1
            if inicio > fin:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{total}")
                self.end_headers()
                return
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {inicio}-{fin}/{total}")
        else:
            self.send_response(200)
        # Los logos de empresa (company-icons/) los usa tambien un <img> del buscador.
        tipo = ("application/json" if ruta.endswith(".json")
                else "image/png" if ruta.endswith(".png") else "application/octet-stream")
        self.send_header("Content-Type", tipo)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(fin - inicio + 1))
        self.send_header("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()
        if head:
            return
        with open(ruta, "rb") as f:
            f.seek(inicio)
            falta = fin - inicio + 1
            while falta > 0:
                bloque = f.read(min(1 << 16, falta))
                if not bloque:
                    break
                self.wfile.write(bloque)
                falta -= len(bloque)

    def do_GET(self):
        anotar_remoto(self.client_address[0] if self.client_address else None, "pagina (27765)")
        if self.path.startswith("/localmap/"):
            self._serve_local_map()
            return
        # Los archivos se referencian con ?v=... para cache-busting - el query
        # se ignora. "/" y "/app" van al index.
        path = self.path.split("?", 1)[0]
        # Entrar por la IP pelada (http://192.168.x.x:27765) servia el tablero
        # pero sin ?local=1, asi que no se autoconectaba y pedia codigo; y en
        # "/" los assets relativos (app.js, app.css) ni siquiera resuelven.
        # Se redirige a /app/?local=1. Idea y codigo original: Vladimir
        # Kutkovoy (PR #1).
        url = urlsplit(self.path)
        base = "/dash/" if url.path.startswith("/dash") else "/app/"
        if url.path in ("/", "/app", "/app/", "/app/index.html",
                        "/dash", "/dash/", "/dash/index.html"):
            query = parse_qs(url.query, keep_blank_values=True)
            needs_local = not any(k in query for k in self.CONNECT_PARAMS)
            if url.path in ("/", "/app", "/dash") or needs_local:
                if needs_local:
                    query["local"] = ["1"]
                location = base + ("?" + urlencode(query, doseq=True) if query else "")
                self.send_response(302)
                self.send_header("Location", location)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
        # Un segundo arranque del .exe (issue #4) no abre otra instancia: le
        # pide a esta que muestre su ventana de Setup y se va. Solo desde la
        # misma maquina, no desde la red, y con SHOW_SETUP_HEADER.
        if path == "/__show-setup":
            local = (self.client_address[0] in ("127.0.0.1", "::1", "::ffff:127.0.0.1")
                     and self.headers.get(SHOW_SETUP_HEADER) == SHOW_SETUP_VALUE)
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
        if path == "/dash" or path == "/dash/":
            path = "/dash/index.html"
        if path.startswith("/app/") or path.startswith("/dash/") or path.startswith("/data/"):
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
        pedido = getattr(self, "headers", None)  # un pedido roto llega sin headers
        origen = origen_cors(pedido.get("Origin") if pedido is not None else None)
        if origen:
            self.send_header("Access-Control-Allow-Origin", origen)
        self.send_header("Vary", "Origin")
        super().end_headers()

    def log_message(self, format, *args):
        pass


def _refresh_file(rel: str, local_path: str) -> bool:
    """Baja rel (ej. app/app.js) del sitio a local_path. False si no se pudo
    (sin internet, 404) - el llamador usa la copia anterior si existe."""
    if ".." in rel:
        return False
    try:
        with red.abrir(f"{WEB_ORIGIN}/{rel}", timeout=6) as resp:
            data = resp.read()
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        with open(local_path, "wb") as f:
            f.write(data)
        return True
    except Exception:
        return False



def pedido_live_share(message) -> str | None:
    """El set_live_share del tablero por LAN, armado de nuevo con solo sus
    campos para mandarlo al relay; None si el mensaje es otra cosa. El relay
    valida cada campo y decide (por LAN, el reenvio automatico no prende)."""
    try:
        payload = json.loads(message)
    except (TypeError, ValueError):
        return None
    if not isinstance(payload, dict) or payload.get("type") != "set_live_share":
        return None
    pedido = {"type": "set_live_share", "enabled": payload.get("enabled") is True}
    for clave in ("explicit", "mapVariant", "nick"):
        if clave in payload:
            pedido[clave] = payload[clave]
    return json.dumps(pedido)


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

# Al abrir a la red, cuantas veces mas probar si el puerto sigue tomado, y cada
# cuanto (ver LocalServer._escuchar_o_solo_aca).
REINTENTOS_EN_LA_RED = 2
ESPERA_REINTENTO_S = 1.0


def lan_al_arrancar(settings: dict) -> bool:
    """Si el modo LAN escucha en la red desde que arranca el cliente.

    Escuchar en la red hace que Windows pregunte por el firewall, y a un
    usuario estandar le pide la clave de administrador aunque nunca vaya a
    usar el celular por WiFi (FioJon, 18-10). A quien recien instala se le
    abre recien cuando lo pide (Setup o el menu de la bandeja) y queda
    guardado en "lan_open". Quien ya usaba el cliente lo tenia siempre en la
    red y ya contesto esa pregunta: sigue igual."""
    if "lan_open" in settings:
        return bool(settings["lan_open"])
    return bool(settings.get("first_run_done"))


class LocalServer:
    def __init__(self, keybinds: dict, en_la_red: bool = True):
        self.keybinds = keybinds
        self.viewers: set = set()
        self._outboxes: dict = {}
        self.last_status_message: str | None = None
        self.http_server: http.server.ThreadingHTTPServer | None = None
        self.ws_server = None
        self.web_ready = False
        self.error: str | None = None
        self.port_in_use = False
        # Sin la red solo atiende a esta PC (127.0.0.1): "Abrir aca", los mapas
        # armados en la PC y el /__show-setup andan igual, y Windows no pregunta
        # por el firewall. Ver lan_al_arrancar y abrir_a_la_red.
        self.en_la_red = en_la_red
        self._escucho = False  # start() ya intento escuchar (bien o con error)
        self._lock = asyncio.Lock()
        # "Compartir mi posicion" es de la sesion del relay y el tablero por
        # LAN no habla con el relay: su tilde se manda por al_relay (el send
        # de la conexion al relay, lo pone la bandeja) y el estado real llega
        # por avisar_live_share. None: el relay todavia no lo dijo.
        self.al_relay = None
        self.live_share: bool | None = None
        # El relay y el codigo de la sesion ({"backend", "code"}, o None sin
        # codigo todavia): el tablero por LAN abre con eso una conexion solo
        # de plan al relay, y comparte waypoints, voz y ajustes de ruta con
        # los otros dispositivos (plan de ruta compartido, 22-10). Lo pone la
        # bandeja; se lee en cada conexion, asi va el codigo de ahora.
        self.plan_relay = None

    @property
    def url(self) -> str | None:
        ip = lan_ip()
        return f"http://{ip}:{HTTP_PORT}/app/?local=1" if ip else None

    async def start(self):
        self.web_ready = await asyncio.to_thread(refresh_web_cache)
        async with self._lock:
            await self._escuchar_o_solo_aca()
            self._escucho = True

    async def abrir_a_la_red(self) -> None:
        """Pasa de escuchar solo en esta PC a escuchar en la red (de 127.0.0.1
        a 0.0.0.0). Los tableros conectados se caen un momento y reconectan."""
        await self._poner_en_la_red(True)

    async def cerrar_a_la_red(self) -> None:
        """Vuelve a escuchar solo en esta PC: los celulares y tablets por WiFi
        se desconectan, y Windows deja de tener algo que preguntar."""
        await self._poner_en_la_red(False)

    async def _poner_en_la_red(self, en_la_red: bool) -> None:
        async with self._lock:
            if self.en_la_red == en_la_red:
                return
            self.en_la_red = en_la_red
            if not self._escucho:
                return  # start() todavia baja la web: va a escuchar ya como corresponde
            await self._cerrar()
            self.error = None
            self.port_in_use = False
            await self._escuchar_o_solo_aca()

    async def _escuchar_o_solo_aca(self):
        """En la red si esta prendido, con reintentos si el puerto sigue tomado:
        al pasar de 127.0.0.1 a 0.0.0.0 las conexiones recien cerradas quedan
        en TIME_WAIT, y asyncio en Windows (y bajo Wine, con las reglas de
        Linux) no pone SO_REUSEADDR. Si igual no se puede, vuelve a esta PC:
        "Abrir aca", los mapas armados y /__show-setup siguen andando, y el
        error queda para que Setup lo diga."""
        await self._escuchar("0.0.0.0" if self.en_la_red else "127.0.0.1")
        if not self.en_la_red:
            return
        for _ in range(REINTENTOS_EN_LA_RED):
            if not self.port_in_use:
                break
            await asyncio.sleep(ESPERA_REINTENTO_S)
            self.error = None
            self.port_in_use = False
            await self._escuchar("0.0.0.0")
        if self.error:
            error, ocupado = self.error, self.port_in_use
            await self._escuchar("127.0.0.1")
            self.error, self.port_in_use = error, ocupado

    async def _cerrar(self):
        if self.http_server is not None:
            server, self.http_server = self.http_server, None
            await asyncio.to_thread(server.shutdown)
            server.server_close()
        if self.ws_server is not None:
            ws_server, self.ws_server = self.ws_server, None
            ws_server.close()
            await ws_server.wait_closed()

    async def _escuchar(self, host: str):
        import websockets

        try:
            self.http_server = http.server.ThreadingHTTPServer((host, HTTP_PORT), _StaticHandler)
            threading.Thread(target=self.http_server.serve_forever, daemon=True).start()
            self.ws_server = await websockets.serve(self._handle_viewer, host, WS_PORT,
                                                    process_request=_solo_paginas_del_cliente)
            if host != "127.0.0.1":
                logging.info("Servidor LAN escuchando en http://0.0.0.0:%d (ws %d), direccion %s",
                             HTTP_PORT, WS_PORT, self.url or "sin IP de LAN")
            elif self.en_la_red:
                logging.info("Servidor LAN solo para esta PC en http://127.0.0.1:%d (ws %d): "
                             "no pudo escuchar en la red", HTTP_PORT, WS_PORT)
            else:
                logging.info("Servidor LAN solo para esta PC en http://127.0.0.1:%d (ws %d): "
                             "la red se abre desde Setup", HTTP_PORT, WS_PORT)
        except OSError as exc:
            # El puerto ocupado es el caso comun (otra instancia, u otro
            # programa): la ventana mostraba el OSError crudo de Python. Se
            # marca aparte para que la UI diga algo legible (issue #4).
            self.error = str(exc)
            self.port_in_use = getattr(exc, "errno", None) == errno.EADDRINUSE or "10048" in str(exc)
            # Si el HTTP levanto y fallo el WS, no dejar medio servidor arriba:
            # el modo LAN no sirve sin los dos y el puerto queda tomado.
            try:
                await self._cerrar()
            except Exception:
                logging.exception("No se pudo cerrar el HTTP a medio levantar")
            logging.warning("No se pudo levantar el servidor LAN en %s: %s", host, exc)

    async def _handle_viewer(self, ws):
        anotar_remoto((getattr(ws, "remote_address", None) or (None,))[0], "datos (27766)")
        self.viewers.add(ws)
        try:
            # liveShare: con la clave, la pagina sabe que este cliente le pasa
            # su tilde al relay (uno viejo no, y la casilla queda gris).
            estado = {"type": "session_state", "client_connected": True, "client_status": None,
                      "local": True, "liveShare": self.live_share}
            relay = self.plan_relay() if self.plan_relay is not None else None
            if relay:
                estado["planRelay"] = relay
            await ws.send(json.dumps(estado))
            if self.last_status_message:
                await ws.send(self.last_status_message)
            async for message in ws:
                pedido = pedido_live_share(message)
                if pedido is not None:
                    if self.al_relay is not None:
                        await self.al_relay(pedido)
                    continue
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

    def avisar_live_share(self, enabled: bool) -> None:
        """Lo que dice el relay de "compartir mi posicion", a los tableros por
        LAN (y en el session_state a los que conecten despues)."""
        self.live_share = enabled
        texto = json.dumps({"type": "live_share_state", "enabled": enabled})
        for viewer in list(self.viewers):
            self._outbox(viewer).push(texto, must_deliver=True)

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

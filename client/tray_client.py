"""
Version con icono de bandeja del sistema del cliente de Truck Companion.

Es la que se empaqueta como .exe (ver build_exe.ps1). Corre el mismo loop de
client.py en un hilo de fondo, y muestra un icono en la bandeja con el estado
de conexion y el codigo de pairing actual.

Uso (antes de empaquetar, para probar):
  python tray_client.py
  python tray_client.py --backend wss://tu-backend.up.railway.app
"""

import argparse
import asyncio
import http.server
import functools
import os
import socket
import sys
import threading
import tkinter as tk
import urllib.parse
import webbrowser

import pystray
from PIL import Image, ImageDraw

import client as client_lib

# En modo --windowed (sin consola) PyInstaller deja sys.stdout/stderr en None,
# no solo silenciados. Cualquier print() o log interno (como el logging propio
# de http.server en cada request) revienta con AttributeError al escribir en
# None, lo que mata el hilo del servidor a mitad de una respuesta (por eso
# el navegador ve ERR_EMPTY_RESPONSE). Se redirigen a un sumidero inofensivo.
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")

# Ubicacion de la carpeta de la web. Por ahora asume que el checkout completo
# del proyecto esta al lado (D:\ets2-companion\truck-companion-web), como en
# esta maquina de desarrollo. Cuando la web quede hosteada publicamente, esto
# se reemplaza por abrir directo esa URL en vez de levantar un server local.
#
# Ojo: cuando corre como .exe (PyInstaller), __file__ NO apunta a la carpeta
# original del proyecto, y el ejecutable ademas vive un par de niveles mas
# adentro (dist/TruckCompanion/TruckCompanion.exe). Por eso se calcula distinto
# segun si esta "frozen" (empaquetado) o corriendo como script normal.
def _default_web_dir() -> str:
    if getattr(sys, "frozen", False):
        exe_dir = os.path.dirname(os.path.abspath(sys.executable))
        # exe_dir = .../truck-companion-client/dist/TruckCompanion
        return os.path.normpath(os.path.join(exe_dir, "..", "..", "..", "truck-companion-web"))
    return os.path.normpath(
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "truck-companion-web")
    )


DEFAULT_WEB_DIR = _default_web_dir()


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("0.0.0.0", 0))
        return s.getsockname()[1]


def get_lan_ip() -> str | None:
    # Truco estandar: no hace falta que el paquete llegue a destino, alcanza
    # con que el SO elija la interfaz de red correcta para saber que IP local
    # usaria para salir a internet (no manda datos de verdad).
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except OSError:
        return None


def start_web_server(web_dir: str) -> int | None:
    if not os.path.isdir(web_dir):
        print(f"No se encontro la carpeta de la web en: {web_dir}")
        return None
    port = find_free_port()
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=web_dir)
    # 0.0.0.0 (no 127.0.0.1) para que tambien sea accesible desde otros
    # dispositivos en la misma red local (ej. el celular), no solo esta PC.
    # Windows puede pedir permiso de firewall la primera vez - hay que
    # permitirlo para redes privadas.
    httpd = http.server.ThreadingHTTPServer(("0.0.0.0", port), handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return port


class AppState:
    def __init__(self):
        self.status = "Iniciando..."
        self.code = None
        self.icon = None
        self.web_port = None
        self.backend_url = None

    def set_status(self, status: str):
        self.status = status
        if self.icon:
            self.icon.title = f"Truck Companion — {self.status}"

    def set_code(self, code: str):
        self.code = code


state = AppState()

GAME_LABELS = {"ats": "American Truck Simulator", "ets2": "Euro Truck Simulator 2"}


def make_icon_image():
    size = 64
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse((2, 2, size - 2, size - 2), fill=(59, 158, 255, 255))
    draw.rectangle((16, 26, 48, 42), fill=(255, 255, 255, 255))
    draw.rectangle((16, 18, 34, 26), fill=(255, 255, 255, 255))
    draw.ellipse((18, 40, 28, 50), fill=(30, 30, 30, 255))
    draw.ellipse((36, 40, 46, 50), fill=(30, 30, 30, 255))
    return img


def show_code_notification(icon, item):
    if state.code:
        show_text_dialog("Truck Companion", "Codigo de pairing:", copy_value=state.code)
    else:
        show_text_dialog("Truck Companion", "Todavia no hay codigo de pairing.")


def quit_app(icon, item):
    icon.stop()


_browser_opened = False


def build_web_url(host: str = "127.0.0.1") -> str | None:
    if state.web_port is None or not state.code or not state.backend_url:
        return None
    query = urllib.parse.urlencode({"backend": state.backend_url, "code": state.code})
    return f"http://{host}:{state.web_port}/index.html?{query}"


def show_text_dialog(title: str, message: str, copy_value: str | None = None):
    def _show():
        root = tk.Tk()
        root.title(title)
        root.attributes("-topmost", True)
        root.resizable(False, False)
        tk.Label(root, text=message, padx=12).pack(pady=(12, 6))
        if copy_value:
            entry = tk.Entry(root, width=max(40, len(copy_value) + 2), justify="center")
            entry.insert(0, copy_value)
            entry.pack(padx=12, pady=(0, 6))
            entry.focus()
            entry.select_range(0, tk.END)
            root.clipboard_clear()
            root.clipboard_append(copy_value)
            tk.Label(root, text="(ya copiado al portapapeles)", fg="#4caf50", padx=12).pack()
        tk.Button(root, text="Cerrar", command=root.destroy, padx=20, pady=4).pack(pady=12)
        root.mainloop()

    threading.Thread(target=_show, daemon=True).start()


def show_mobile_url(icon, item):
    lan_ip = get_lan_ip()
    if not lan_ip:
        show_text_dialog("Truck Companion", "No se pudo detectar la IP de tu red local.")
        return
    url = build_web_url(host=lan_ip)
    if not url:
        show_text_dialog("Truck Companion", "Todavia no hay codigo de pairing.")
        return
    show_text_dialog("Truck Companion", "Abri esto en el celular (misma wifi):", copy_value=url)


def open_web_ui(backend_url: str, code: str):
    global _browser_opened
    state.backend_url = backend_url
    if _browser_opened:
        return
    _browser_opened = True
    url = build_web_url()
    if url:
        webbrowser.open(url)


def open_web_menu_item(icon, item):
    url = build_web_url()
    if url:
        webbrowser.open(url)
    else:
        show_text_dialog("Truck Companion", "Todavia no hay codigo de pairing.")


async def run_client(backend_url: str, fixed_code: str | None):
    code = fixed_code
    if code is None:
        state.set_status("Solicitando codigo de pairing...")
        try:
            code = await asyncio.to_thread(client_lib.request_pairing_code, backend_url)
        except Exception as exc:
            state.set_status(f"Error obteniendo codigo: {exc}")
            return
    state.set_code(code)
    state.set_status(f"Codigo {code} - conectando...")
    open_web_ui(backend_url, code)

    import truck_telemetry
    import websockets
    import json

    url = f"{backend_url}/ws/client/{code}"
    while True:
        try:
            truck_telemetry.init()
        except Exception:
            state.set_status(f"Codigo {code} - esperando que se abra el juego...")
            await asyncio.sleep(client_lib.RECONNECT_DELAY_SECONDS)
            continue

        try:
            async with websockets.connect(url) as ws:
                state.set_status(f"Codigo {code} - conectado")
                last_game = None
                while True:
                    raw = truck_telemetry.get_data()
                    # ver comentario equivalente en client.py: se descarta el
                    # primer frame hasta que el SDK confirme sync real.
                    if raw.get("sdkActive"):
                        payload = client_lib.build_payload(raw)
                        game = payload.get("game")
                        if game != last_game:
                            last_game = game
                            game_label = GAME_LABELS.get(game, "juego detectado")
                            state.set_status(f"Codigo {code} - jugando {game_label}")
                        await ws.send(json.dumps(payload))
                    await asyncio.sleep(client_lib.SEND_INTERVAL_SECONDS)
        except (websockets.ConnectionClosed, OSError) as exc:
            state.set_status(f"Codigo {code} - reconectando...")
            await asyncio.sleep(client_lib.RECONNECT_DELAY_SECONDS)
        except Exception:
            state.set_status(f"Codigo {code} - esperando al juego...")
            await asyncio.sleep(client_lib.RECONNECT_DELAY_SECONDS)


def start_asyncio_thread(backend_url: str, fixed_code: str | None):
    def runner():
        asyncio.run(run_client(backend_url, fixed_code))

    thread = threading.Thread(target=runner, daemon=True)
    thread.start()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", default="wss://truck-companion-production.up.railway.app")
    parser.add_argument("--code", default=None)
    parser.add_argument("--web-dir", default=DEFAULT_WEB_DIR, help="Carpeta de la web a servir localmente")
    args = parser.parse_args()

    state.web_port = start_web_server(args.web_dir)

    start_asyncio_thread(args.backend, args.code)

    menu = pystray.Menu(
        pystray.MenuItem("Abrir web", open_web_menu_item, default=True),
        pystray.MenuItem("Mostrar codigo de pairing", show_code_notification),
        pystray.MenuItem("Mostrar URL para el celular", show_mobile_url),
        pystray.MenuItem("Salir", quit_app),
    )
    icon = pystray.Icon("truck-companion", make_icon_image(), "Truck Companion", menu)
    state.icon = icon
    icon.run()
    sys.exit(0)


if __name__ == "__main__":
    main()

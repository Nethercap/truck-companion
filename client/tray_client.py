"""
Version con icono de bandeja del sistema del cliente de Truck Dash.

Es la que se empaqueta como .exe. Corre el mismo loop de client.py en un
hilo de fondo, y muestra un icono en la bandeja con el estado de conexion
y el codigo de pairing actual. Al conseguir el codigo, abre el navegador
directo en la web publica (trucksim-dash.com/app) ya conectado.

Uso (antes de empaquetar, para probar):
  python tray_client.py
  python tray_client.py --backend wss://tu-backend.up.railway.app --web-url https://trucksim-dash.com/app/
"""

import argparse
import asyncio
import os
import sys
import threading
import tkinter as tk
import urllib.parse
import webbrowser

import pystray
from PIL import Image, ImageDraw

import client as client_lib

# En modo --windowed (sin consola) PyInstaller deja sys.stdout/stderr en None,
# no solo silenciados. Cualquier print() o log interno revienta con
# AttributeError al escribir en None. Se redirigen a un sumidero inofensivo.
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")

DEFAULT_WEB_URL = "https://trucksim-dash.com/app/"


class AppState:
    def __init__(self):
        self.status = "Iniciando..."
        self.code = None
        self.icon = None
        self.backend_url = None
        self.web_url = DEFAULT_WEB_URL

    def set_status(self, status: str):
        self.status = status
        if self.icon:
            self.icon.title = f"Truck Dash — {self.status}"

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


def show_code_notification(icon, item):
    if state.code:
        show_text_dialog("Truck Dash", "Codigo de pairing:", copy_value=state.code)
    else:
        show_text_dialog("Truck Dash", "Todavia no hay codigo de pairing.")


def show_mobile_info(icon, item):
    if not state.code:
        show_text_dialog("Truck Dash", "Todavia no hay codigo de pairing.")
        return
    show_text_dialog(
        "Truck Dash",
        f"En el celular, abri trucksim-dash.com/app e ingresa este codigo:",
        copy_value=state.code,
    )


def quit_app(icon, item):
    icon.stop()


_browser_opened = False


def build_web_url() -> str | None:
    if not state.code or not state.backend_url:
        return None
    query = urllib.parse.urlencode({"backend": state.backend_url, "code": state.code})
    return f"{state.web_url}?{query}"


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
        show_text_dialog("Truck Dash", "Todavia no hay codigo de pairing.")


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
                    # sdkActive en False significa que el SDK todavia no
                    # sincronizo el primer frame real del juego (ver
                    # comentario equivalente en client.py).
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
    parser.add_argument("--backend", default="wss://truck-companion-production-7184.up.railway.app")
    parser.add_argument("--code", default=None)
    parser.add_argument("--web-url", default=DEFAULT_WEB_URL, help="URL de la web a abrir (para desarrollo local)")
    args = parser.parse_args()

    state.web_url = args.web_url

    start_asyncio_thread(args.backend, args.code)

    menu = pystray.Menu(
        pystray.MenuItem("Abrir web", open_web_menu_item, default=True),
        pystray.MenuItem("Mostrar codigo de pairing", show_code_notification),
        pystray.MenuItem("Mostrar codigo para el celular", show_mobile_info),
        pystray.MenuItem("Salir", quit_app),
    )
    icon = pystray.Icon("truck-dash", make_icon_image(), "Truck Dash", menu)
    state.icon = icon
    icon.run()
    sys.exit(0)


if __name__ == "__main__":
    main()

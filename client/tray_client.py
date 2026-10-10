"""
Version con icono de bandeja del sistema del cliente de Truck Dash.

Es la que se empaqueta como .exe. Corre el mismo loop de client.py en un
hilo de fondo, muestra un icono en la bandeja con el estado de conexion y el
codigo de pairing actual, y una ventana de "Setup & status" (tkinter) que
detecta la instalacion del juego, instala el plugin de telemetria con un
click, muestra el estado en vivo y permite activar el inicio con Windows.

Uso (antes de empaquetar, para probar):
  python tray_client.py
  python tray_client.py --backend wss://tu-backend.up.railway.app --web-url https://trucksim-dash.com/app/
"""

import argparse
import asyncio
import json
import logging
import os
import sys
import queue
import threading
import time
import tkinter as tk
from tkinter import filedialog
import urllib.parse
from urllib.request import urlopen

import red

try:
    import pystray
    PYSTRAY_ERROR = None
except Exception as _exc:  # falta GTK, no hay AppIndicator, no hay display...
    # En Linux la bandeja no esta garantizada: GNOME no tiene uno propio y
    # depende de una extension, y pystray revienta al IMPORTARSE si no
    # encuentra backend. Morir ahi seria absurdo: la bandeja es la puerta de
    # entrada, pero el trabajo lo hacen los hilos de fondo.
    pystray = None
    PYSTRAY_ERROR = _exc
from PIL import Image, ImageDraw

import client as client_lib
import discord_presence
import local_server
import map_builder
import overlay
import account
import account_sync
import plugin_installer
import win_integration
import i18n
from i18n import T

# En modo --windowed (sin consola) PyInstaller deja sys.stdout/stderr en None,
# no solo silenciados. Cualquier print() o log interno revienta con
# AttributeError al escribir en None. Se redirigen a un sumidero inofensivo.
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")

DEFAULT_WEB_URL = "https://trucksim-dash.com/app/"
URL_CUENTA = "https://trucksim-dash.com/account/"
DONATE_URL = "https://tecito.app/truckdash"  # Tecito. Vacio, el item "Apoyar" del menu no aparece

LOG_PATH = os.path.join(win_integration.base_dir(), "truckdash.log")
# Con rotacion (2 MB y dos copias) y en UTF-8: el log crecia sin limite (2,7
# MB en dos dias y medio de un usuario) y en cp1252 una ciudad o un mod con
# letras de otro alfabeto se perdia. Si al lado del .exe no se puede escribir
# (Program Files), %LOCALAPPDATA%: antes la app no arrancaba.
def _abrir_log(path):
    from logging.handlers import RotatingFileHandler
    return RotatingFileHandler(path, maxBytes=2 * 1024 * 1024, backupCount=2, encoding="utf-8")


try:
    _log_handler = _abrir_log(LOG_PATH)
except OSError:
    LOG_PATH = os.path.join(os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), "TruckDash", "truckdash.log")
    os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
    _log_handler = _abrir_log(LOG_PATH)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", handlers=[_log_handler])
# "connection open/closed" de cada visor LAN no dice nada util.
logging.getLogger("websockets").setLevel(logging.WARNING)

GAME_LABELS = {"ats": "American Truck Simulator", "ets2": "Euro Truck Simulator 2"}

# Estados del cliente - el mismo string viaja a la web (mensaje client_status)
# para que el dashboard pueda decir "el cliente esta conectado pero el juego
# no esta abierto" en vez de un generico "waiting for telemetry".
STATUS_KEYS = ("starting", "waiting_game", "plugin_not_installed", "plugin_missing", "waiting_truck", "live")
CLOUD_KEYS = ("connecting", "connected", "offline", "reconnecting")


# El texto del icono de la bandeja va a un WCHAR[128] de Windows (szTip), y
# pystray tira ValueError si no entra. Como set_status corre adentro del bucle
# de telemetria, esa excepcion lo mataba: en castellano, "plugin_missing" +
# "Conectado" mide 129, y el cliente abierto antes que el juego se quedaba
# para siempre sin leerlo (29-09-2026).
TITULO_MAX = 127


def recortar_titulo(texto: str) -> str:
    return texto if len(texto) <= TITULO_MAX else texto[:TITULO_MAX - 3].rstrip() + "..."


def vigilar(task: asyncio.Task, nombre: str) -> asyncio.Task:
    """Deja en el log si una tarea de fondo muere. Con create_task pelado la
    excepcion queda guardada en la tarea y nadie la ve: el cliente sigue
    abierto, sin hacer nada y sin decir por que."""
    def _al_terminar(t: asyncio.Task):
        if not t.cancelled() and t.exception() is not None:
            logging.error("La tarea %s murio", nombre, exc_info=t.exception())
    task.add_done_callback(_al_terminar)
    return task


class AppState:
    def __init__(self):
        self.status = "starting"  # estado de la telemetria (ver STATUS_TEXT)
        # Si el juego estuvo abierto en esta corrida. Sin esto, el cierre
        # automatico apagaria el cliente al minuto de arrancarlo con el juego
        # todavia cerrado, que es justo lo que hace quien lo deja en el inicio
        # de Windows.
        self.vio_el_juego = False
        # Acumulador + cola de la cuenta. Sin cuenta vinculada no
        # acumula nada; ver account_sync.
        self.cuenta = account_sync.Sincronizador()
        self.status_detail: str | None = None  # diagnostico fino (ingles) cuando status == plugin_missing
        self.map_mods: dict | None = None  # {'ets2': {promods,..}|None, 'ats': {...}|None} leido de game.log.txt
        self.map_mods_read_at = 0.0
        # Nombres de los mods activos por juego: la web los manda al relay
        # solo si el camion queda fuera del mapa (un mapa que no conocemos).
        self.active_mods: dict | None = None
        # DLC de mapa instalados por juego ({'ats': ['co', ...]}), de los
        # dlc_*.scs de la carpeta del juego: la web los usa para que las
        # rutas eviten los que no tenes.
        self.map_dlcs: dict | None = None
        # Mapa armado en esta PC (map_builder.py). Rutas de los mods montados
        # por juego, el mapa armado que coincide con ellos, los juegos donde
        # la web vio el camion fuera del mapa (eso es lo que hace ofrecerlo),
        # y el armado en curso.
        self.mounted_mods: dict | None = None
        self.local_maps: dict = {}
        self.offmap_games: set = set()
        self.cloud_viewers = None  # tableros conectados por el relay (None: no se sabe todavia)
        self.last_known_mods: dict = {}  # ultimos mods de mapa no-None por juego
        self.offmap_notified: set = set()
        self.map_build: dict | None = None  # {'game', 'step', 'error', 'running'}
        self.map_build_cancel = threading.Event()
        self.cloud = "connecting"  # estado de la conexion al backend (ver CLOUD_TEXT)
        self.game = None
        self.vehicle = None  # "Marca Modelo" mientras esta en vivo, para el log
        self.code = None
        self.icon = None
        self.backend_url = None
        self.web_url = DEFAULT_WEB_URL
        self.autostart_mode = False  # lanzado por el inicio automatico de Windows
        self.update_available = None  # (version, download_url, sha256) o None
        self.installs = []  # ver plugin_installer.find_game_installs()
        self.plugins_revisados_at = 0.0  # ver actualizar_plugins_viejos
        self.local: local_server.LocalServer | None = None  # modo LAN (ver local_server.py)
        # Rich Presence de Discord: se prende desde Ajustes, apagado por defecto.
        self.discord = discord_presence.DiscordPresence()
        # Overlay en el juego (overlay.py): apagado por defecto. La ventana
        # lee la esquina y el tamano de aca, sin ir al disco en cada cuadro.
        self.overlay_data = overlay.OverlayData()
        self.overlay_layout = (overlay.DEFAULT_CORNER, overlay.DEFAULT_SIZE, overlay.ITEMS, None)
        self.overlay = overlay.Overlay(self.overlay_data, lambda: self.overlay_layout,
                                       lambda: (T("overlay_remaining"), T("overlay_arrival"),
                                                T("overlay_arrival_game"), T("overlay_turn_hint")))
        # Arrastrado en el modo Mover: queda en esa posicion.
        self.overlay.al_mover = lambda fx, fy: set_overlay_layout(corner=overlay.CUSTOM, pos=(fx, fy))
        # Tecla rapida que prende y apaga el overlay desde el juego.
        self.overlay_tecla = overlay.TeclaRapida(lambda: tecla_del_overlay())

    def status_text(self) -> str:
        text = T(f"status_{self.status}") if self.status in STATUS_KEYS else self.status
        if self.status == "live" and self.game:
            text = T("status_live_playing", game=GAME_LABELS.get(self.game, self.game))
        cloud = T(f"cloud_{self.cloud}") if self.cloud in CLOUD_KEYS else self.cloud
        return f"{text} ({cloud})"

    def refresh_title(self):
        if self.icon:
            code_part = f" - code {self.code}" if self.code else ""
            self.icon.title = recortar_titulo(f"Truck Dash{code_part} - {self.status_text()}")

    def set_status(self, status: str, game: str | None = None, vehicle: str | None = None):
        changed = status != self.status or game != self.game
        # Una linea por cambio, no por frame: sin esto un log no dice si el
        # tablero llego a estar en vivo ni con que vehiculo (los autos de
        # ATS 1.61 usan los mismos canales que el camion).
        if changed or vehicle != self.vehicle:
            detalle = ", ".join(p for p in (game, vehicle) if p)
            logging.info("Status: %s%s", status, f" ({detalle})" if detalle else "")
        self.status = status
        self.game = game
        self.vehicle = vehicle
        self.refresh_title()
        return changed

    def set_cloud(self, cloud: str):
        self.cloud = cloud
        self.refresh_title()

    def set_code(self, code: str | None):
        self.code = code

    def refresh_installs(self):
        try:
            self.installs = plugin_installer.find_game_installs()
        except Exception:
            logging.exception("Failed to detect game installs")
            self.installs = []
        # Carpetas agregadas a mano (instalaciones fuera de Steam)
        for bin_dir in win_integration.load_settings().get("extra_game_dirs", []):
            # tiene_ejecutable y no isdir: una carpeta que quedo vacia tras
            # desinstalar el juego no es una instalacion, y mostrarla solo
            # suma una fila que no se puede usar.
            if (plugin_installer.tiene_ejecutable(bin_dir)
                    and not any(plugin_installer.same_dir(i["bin_dir"], bin_dir) for i in self.installs)):
                self.installs.append(plugin_installer.describe_install(
                    plugin_installer.game_for_bin_dir(bin_dir), bin_dir, origen="manual"))
        try:
            dlcs = client_lib.read_installed_dlcs(self.installs)
        except Exception:
            logging.exception("read_installed_dlcs failed")
            dlcs = self.map_dlcs
        if dlcs != self.map_dlcs:
            logging.info("Map DLCs detected: %s", {g: len(v) for g, v in (dlcs or {}).items()})
        self.map_dlcs = dlcs
        return self.installs

    def any_plugin_installed(self) -> bool:
        return any(i["state"] in ("installed", "outdated") or i.get("other_plugin")
                   for i in self.installs)


state = AppState()


def make_icon_image():
    # Logo real (mismo que la web), empaquetado como data - con fallback al
    # dibujo generico si no esta (ej. corriendo desde fuente sin assets).
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    for candidate in (os.path.join(base, "assets", "icon.png"), os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "icon.png")):
        if os.path.exists(candidate):
            try:
                return Image.open(candidate).convert("RGBA").resize((64, 64), Image.LANCZOS)
            except Exception:
                pass
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
        tk.Label(root, text=message, padx=12, justify="left").pack(pady=(12, 6))
        if copy_value:
            entry = tk.Entry(root, width=max(40, min(90, len(copy_value) + 2)), justify="center")
            entry.insert(0, copy_value)
            entry.pack(padx=12, pady=(0, 6))
            entry.focus()
            entry.select_range(0, tk.END)
            root.clipboard_clear()
            root.clipboard_append(copy_value)
            tk.Label(root, text=T("copied"), fg="#4caf50", padx=12).pack()
        tk.Button(root, text=T("close"), command=root.destroy, padx=20, pady=4).pack(pady=12)
        root.mainloop()

    threading.Thread(target=_show, daemon=True).start()


def abrir_ajustes_de_red() -> None:
    """Configuracion de Windows > Red, donde se cambia el perfil a Privada."""
    try:
        os.startfile("ms-settings:network-status")
    except (AttributeError, OSError):
        logging.exception("No se pudo abrir la configuracion de red")


def abrir_navegador(url: str) -> None:
    """Toda apertura del navegador pasa por aca (ver
    win_integration.open_in_browser: bajo Proton, webbrowser tiraba abajo el
    cliente). Si no se pudo lanzar nada, la direccion queda en pantalla y en
    el portapapeles.

    Bajo Wine la direccion se muestra siempre: que winebrowser arranque no
    dice nada, porque lanza el navegador del lado de Linux sin esperarlo. Con
    Proton, xdg-open corre adentro del contenedor de Steam y puede no llegar
    al navegador de la sesion (paso en Reddit con Zen), y el boton quedaba
    mudo."""
    try:
        abierto = win_integration.open_in_browser(url)
    except Exception:
        logging.exception("Could not open the browser")
        abierto = False
    if not abierto:
        show_text_dialog("Truck Dash", T("dlg_open_manually"), copy_value=url)
    elif win_integration.is_wine():
        show_text_dialog("Truck Dash", T("dlg_open_if_not_opened"), copy_value=url)


# ---------------------------------------------------------------------------
# Ventana de Setup & status (tkinter, en su propio hilo, una sola instancia)
# ---------------------------------------------------------------------------

_setup_window_open = False
_setup_window_lock = threading.Lock()

BG = "#14171c"
FG = "#f2f3f5"
MUTED = "#9aa4b2"
PAUSA_APROBACION = 3  # segundos entre consultas al vincular

# Cuanto tiene que estar ausente la memoria compartida para dar el juego por
# cerrado. Es holgado a proposito: el costo de equivocarse para arriba es
# esperar un minuto de mas antes de soltar el prefijo de Proton, y el de
# equivocarse para abajo es cerrarse encima de alguien que esta jugando.
GRACIA_CIERRE = 60

# La seccion de cuenta esta escrita y probada, pero apagada hasta haber
# manejado de verdad con ella y comprobado que los kilometros del perfil
# coinciden con los del juego. Anunciar viajes guardados y que los numeros
# esten corridos es peor que no tenerlos.
#
# Se puede prender sin tocar el codigo:
#     set TRUCKDASH_CUENTAS=1  (Windows)   export TRUCKDASH_CUENTAS=1 (Linux)
# Asi la prueba no pasa por editar un archivo que despues hay que acordarse
# de volver atras antes de publicar.
# Encendidas desde la 1.5.27. TRUCKDASH_CUENTAS=0 las esconde (para probar
# como se ve el cliente sin ellas).
CUENTAS_VISIBLES = os.environ.get("TRUCKDASH_CUENTAS", "1") != "0"


def cuentas_visibles() -> bool:
    """Prendidas en este build y no apagadas desde el relay (ver
    aplicar_interruptor)."""
    return CUENTAS_VISIBLES and account.cuentas_encendidas(win_integration.load_settings())


def aplicar_interruptor(data: dict) -> None:
    """Lo que dice /version del relay sobre las cuentas. Solo se escribe si
    cambio, y un relay viejo (sin el campo) no toca nada."""
    valor = data.get("accounts") if isinstance(data, dict) else None
    if not isinstance(valor, bool):
        return
    settings = win_integration.load_settings()
    if account.cuentas_encendidas(settings) == valor:
        return
    settings[account.CLAVE_INTERRUPTOR] = valor
    win_integration.save_settings(settings)
    logging.info("Cuentas %s desde el relay", "encendidas" if valor else "apagadas")


def debe_cerrarse(vio_el_juego: bool, opcion_activa: bool,
                  sin_memoria_desde: float | None, ahora: float) -> bool:
    """Si corresponde cerrar el cliente porque el juego se fue.

    Las tres condiciones tienen que darse juntas, y cada una tapa una forma
    distinta de cerrarse cuando no hay que hacerlo:

    - El juego estuvo abierto en esta corrida. Si no, el cliente dejado en el
      inicio de Windows se apagaria solo al minuto, antes de que nadie juegue.
    - La opcion esta activa. Viene prendida solo bajo Proton.
    - La memoria compartida lleva un rato ausente. Que falte UN momento no
      alcanza: aparece y desaparece entre cargas de partida.
    """
    if not (vio_el_juego and opcion_activa) or sin_memoria_desde is None:
        return False
    return (ahora - sin_memoria_desde) > GRACIA_CIERRE
BLUE = "#3b9eff"
GREEN = "#4caf50"
ORANGE = "#ff8a3d"
RED = "#ff6b6b"
CARD = "#1a2130"  # el recuadro de la cuenta


def open_account_menu_item(icon=None, item=None):
    """Con cuenta, a la web de la cuenta; sin cuenta, a Setup, que es donde
    se vincula y donde esta la explicacion."""
    if account.token_guardado(win_integration.load_settings()):
        abrir_navegador(URL_CUENTA)
    else:
        open_setup_window()


def anunciar_cuentas(icon) -> bool:
    """Una sola vez, a quien ya usaba el cliente antes de las cuentas: un
    aviso de Windows de que existen y donde se vinculan. Quien recien
    instala ve la explicacion en Setup, que se abre sola la primera vez.
    Devuelve si aviso."""
    settings = win_integration.load_settings()
    if (not cuentas_visibles() or settings.get("accounts_announced")
            or account.token_guardado(settings) or not settings.get("first_run_done")):
        return False
    settings["accounts_announced"] = True
    win_integration.save_settings(settings)
    try:
        icon.notify(T("notify_accounts"), "Truck Dash")
    except Exception as exc:  # bajo Wine o sin soporte de avisos: no pasa nada
        logging.info("No se pudo mostrar el aviso de cuentas: %s", exc)
    return True


def texto_menu(clave: str):
    """Texto de un item de la bandeja que se traduce al abrir el menu, no al
    arrancar: asi el idioma elegido en Setup vale enseguida."""
    return lambda item: T(clave)


def set_client_language(codigo: str) -> None:
    """Idioma del cliente elegido en Setup ("auto" = el de Windows)."""
    settings = win_integration.load_settings()
    settings["language"] = codigo
    win_integration.save_settings(settings)
    i18n.set_language(codigo)
    logging.info("Idioma del cliente: %s (%s)", codigo, i18n.LANG)
    state.refresh_title()
    if state.icon is not None:
        try:
            state.icon.update_menu()
        except Exception:
            pass


def open_setup_window(icon=None, item=None):
    global _setup_window_open
    with _setup_window_lock:
        if _setup_window_open:
            return
        _setup_window_open = True
    threading.Thread(target=_setup_window_main, daemon=True).start()


def _setup_window_main():
    global _setup_window_open
    try:
        # Al cambiar el idioma la ventana se cierra y se vuelve a abrir, ya
        # escrita en el idioma nuevo.
        while True:
            ventana = SetupWindow()
            ventana.run()
            if not ventana.reabrir:
                break
    except Exception:
        logging.exception("Setup window crashed")
    finally:
        with _setup_window_lock:
            _setup_window_open = False


class SetupWindow:
    def __init__(self):
        self.root = tk.Tk()
        self.reabrir = False
        self.root.title(T("win_title", v=client_lib.CLIENT_VERSION))
        self.root.configure(bg=BG)
        self.root.resizable(False, False)
        self.root.attributes("-topmost", True)
        self.root.after(300, lambda: self.root.attributes("-topmost", False))
        self.install_rows = []
        # Los hilos no tocan Tk: dejan una funcion aca y la corre el hilo
        # principal. root.after() desde otro hilo no es seguro, y falla de
        # una forma que en un build sin consola no se ve nunca.
        self._cola = queue.Queue()
        self._armar_scroll()
        self.build()
        self._bombear_cola()

    # --- scroll ---
    # Con la seccion de cuenta la ventana pasa los 1000 px, y en una laptop
    # de 768 se cortaba abajo, justo los botones de actualizar y cerrar. Las
    # secciones van en un marco con scroll; la barra de actualizacion y el pie
    # quedan fijos abajo, siempre a la vista. Sin pantalla chica no hay barra.

    def _armar_scroll(self):
        self.abajo = tk.Frame(self.root, bg=BG)
        self.abajo.pack(side="bottom", fill="x")
        marco = tk.Frame(self.root, bg=BG)
        marco.pack(side="top", fill="both", expand=True)
        self._canvas = tk.Canvas(marco, bg=BG, highlightthickness=0, bd=0)
        self._barra = tk.Scrollbar(marco, orient="vertical", command=self._canvas.yview)
        self._canvas.configure(yscrollcommand=self._barra.set)
        self._canvas.pack(side="left", fill="both", expand=True)
        self.body = tk.Frame(self._canvas, bg=BG)
        self._ventana_body = self._canvas.create_window((0, 0), window=self.body, anchor="nw")
        # El contenido toma el ancho del canvas: el pie (fuera del scroll)
        # puede ser mas ancho que las secciones, y quedaba una franja vacia.
        self._canvas.bind("<Configure>", lambda e: self._canvas.itemconfigure(
            self._ventana_body, width=e.width))
        self.body.bind("<Configure>", self._ajustar_alto)
        self.abajo.bind("<Configure>", self._ajustar_alto)
        # La toplevel esta en los bindtags de todos sus widgets: la rueda
        # funciona sobre cualquiera. Button-4/5 es la rueda en Linux.
        self.root.bind("<MouseWheel>", lambda e: self._rueda(-1 if e.delta > 0 else 1))
        self.root.bind("<Button-4>", lambda e: self._rueda(-1))
        self.root.bind("<Button-5>", lambda e: self._rueda(1))

    def _alto_disponible(self) -> int:
        """Lo que entra en la pantalla, descontando barra de tareas y titulo."""
        return self.root.winfo_screenheight() - 120

    def con_scroll(self) -> bool:
        return bool(self._barra.winfo_manager())

    def _ajustar_alto(self, _evento=None):
        ancho, alto = self.body.winfo_reqwidth(), self.body.winfo_reqheight()
        tope = max(300, self._alto_disponible() - self.abajo.winfo_reqheight())
        self._canvas.configure(width=ancho, height=min(alto, tope),
                               scrollregion=(0, 0, ancho, alto))
        if alto > tope:
            if not self.con_scroll():
                self._barra.pack(side="right", fill="y")
        elif self.con_scroll():
            self._barra.pack_forget()
            self._canvas.yview_moveto(0)

    def _rueda(self, pasos):
        if self.con_scroll():
            self._canvas.yview_scroll(pasos * 3, "units")

    def label(self, parent, text, **kw):
        opts = dict(bg=BG, fg=FG, anchor="w", justify="left")
        opts.update(kw)
        return tk.Label(parent, text=text, **opts)

    def button(self, parent, text, command, primary=False, **kw):
        opts = dict(command=command, padx=12, pady=3, relief="flat", cursor="hand2",
                    bg=BLUE if primary else "#262b33", fg="#fff", activebackground="#2b8ef0" if primary else "#333940", activeforeground="#fff")
        opts.update(kw)
        return tk.Button(parent, text=text, **opts)

    def section(self, title):
        frame = tk.Frame(self.body, bg=BG, padx=16, pady=8)
        frame.pack(fill="x")
        self.label(frame, title, fg=ORANGE, font=("Segoe UI", 10, "bold")).pack(anchor="w")
        return frame

    def build(self):
        header = tk.Frame(self.body, bg=BG, padx=16, pady=12)
        header.pack(fill="x")
        self.label(header, "Truck Dash", font=("Segoe UI", 16, "bold")).pack(side="left")
        self.label(header, T("tagline"), fg=MUTED).pack(side="left")

        # --- Estado de conexion ---
        status_frame = self.section(T("sec_status"))
        self.status_label = self.label(status_frame, "", wraplength=520)
        self.status_label.pack(anchor="w", pady=(4, 2))
        code_row = tk.Frame(status_frame, bg=BG)
        code_row.pack(anchor="w", pady=(2, 4))
        self.label(code_row, T("pairing_code"), fg=MUTED).pack(side="left")
        self.code_label = self.label(code_row, "-", font=("Consolas", 14, "bold"), fg=BLUE)
        self.code_label.pack(side="left")
        self.button(code_row, T("copy"), self.copy_code).pack(side="left", padx=(10, 4))
        self.button(code_row, T("new_code"), self.new_code).pack(side="left", padx=4)
        self.button(code_row, T("open_dashboard"), self.open_dashboard, primary=True).pack(side="left", padx=4)
        self.label(status_frame, T("phone_hint"), fg=MUTED, wraplength=520).pack(anchor="w")

        # --- Cuenta ---
        # Opcional a proposito: todo el cliente funciona sin vincular nada, y
        # esto solo agrega que los viajes queden guardados. Va arriba, despues
        # del estado: es lo nuevo, y abajo de las opciones nadie la veia.
        if cuentas_visibles():
            self.build_account_section()

        # --- Modo LAN ---
        lan_frame = self.section(T("sec_lan"))
        lan_row = tk.Frame(lan_frame, bg=BG)
        lan_row.pack(anchor="w", pady=(4, 0), fill="x")
        self.qr_label = tk.Label(lan_row, bg=BG)
        self.qr_label.pack(side="left", padx=(0, 12))
        lan_text = tk.Frame(lan_row, bg=BG)
        lan_text.pack(side="left", fill="x", expand=True)
        self.lan_url_label = self.label(lan_text, "", fg=BLUE, font=("Consolas", 11, "bold"), wraplength=380)
        self.lan_url_label.pack(anchor="w")
        self.lan_hint_label = self.label(lan_text, T("lan_hint"), fg=MUTED, wraplength=380)
        self.lan_hint_label.pack(anchor="w", pady=(4, 0))
        lan_btns = tk.Frame(lan_text, bg=BG)
        lan_btns.pack(anchor="w", pady=(6, 0))
        self.button(lan_btns, T("copy_address"), self.copy_lan_url).pack(side="left")
        # Los dos puertos, aca y no solo en el README: es donde esta la
        # persona cuando el tablero carga y se queda vacio, que parece un
        # cliente roto y no un puerto cerrado.
        self.label(lan_frame, T("lan_ports"), fg=MUTED, wraplength=520).pack(
            anchor="w", pady=(6, 0))
        # Red en Publica: casi siempre es por eso que el celular no conecta.
        self.lan_public_frame = tk.Frame(lan_frame, bg=BG)
        self.label(self.lan_public_frame, T("lan_public_network"), fg=ORANGE, wraplength=520,
                   justify="left").pack(anchor="w")
        self.button(self.lan_public_frame, T("lan_network_settings"),
                    abrir_ajustes_de_red).pack(anchor="w", pady=(4, 0))
        self.button(lan_btns, T("open_here"), self.open_lan_here).pack(side="left", padx=6)
        self.render_lan()

        # --- Juegos / plugin ---
        self.games_frame = self.section(T("sec_games"))
        self.games_body = tk.Frame(self.games_frame, bg=BG)
        self.games_body.pack(fill="x", pady=(4, 0))
        self.render_installs()
        row = tk.Frame(self.games_frame, bg=BG)
        row.pack(anchor="w", pady=(6, 0))
        self.button(row, T("add_game_folder"), self.add_game_folder).pack(side="left")
        self.button(row, T("rescan"), self.rescan).pack(side="left", padx=6)
        self.label(self.games_frame, T("plugin_note", v=plugin_installer.PLUGIN_DLL_VERSION), fg=MUTED, wraplength=520).pack(anchor="w", pady=(6, 0))

        # --- Mapa armado en la PC ---
        # Solo aparece si hace falta (la web vio el camion fuera del mapa con
        # mods activos), si ya hay un mapa armado o si se esta armando.
        self.local_map_frame = self.section(T("sec_local_map"))
        self.local_map_body = tk.Frame(self.local_map_frame, bg=BG)
        self.local_map_body.pack(fill="x", pady=(4, 0))
        self._local_map_sig = None
        self.render_local_map()

        # --- Opciones ---
        options = self.section(T("sec_options"))
        fila = tk.Frame(options, bg=BG)
        fila.pack(anchor="w", pady=(4, 2))
        # "Language" entre parentesis si el cliente esta en otro idioma: quien
        # lo ve en uno que no entiende igual encuentra donde cambiarlo.
        etiqueta = T("language") + ("" if i18n.LANG == "en" else " (Language)")
        self.label(fila, etiqueta, fg=MUTED).pack(side="left", padx=(0, 8))
        opciones = [("auto", T("language_auto"))] + list(i18n.LANGUAGE_NAMES.items())
        elegido = win_integration.load_settings().get("language")
        elegido = elegido if elegido in i18n.LANGUAGE_NAMES else "auto"
        por_texto = {texto: clave for clave, texto in opciones}
        self.language_var = tk.StringVar(master=self.root, value=dict(opciones)[elegido])
        menu = tk.OptionMenu(fila, self.language_var, *por_texto,
                             command=lambda texto: self.change_language(por_texto[texto]))
        menu.configure(bg="#262b33", fg=FG, activebackground="#2f3540", activeforeground=FG,
                       highlightthickness=0, bd=0)
        menu["menu"].configure(bg="#262b33", fg=FG)
        menu.pack(side="left")
        self.autostart_var = tk.BooleanVar(value=win_integration.is_autostart_enabled())
        chk = tk.Checkbutton(options, text=T("autostart"), variable=self.autostart_var,
                             command=self.toggle_autostart, bg=BG, fg=FG, selectcolor="#262b33", activebackground=BG, activeforeground=FG)
        chk.pack(anchor="w", pady=(4, 0))
        if not win_integration.exe_path():
            chk.configure(state="disabled")
            self.label(options, T("autostart_packaged_only"), fg=MUTED).pack(anchor="w")

        # Rich Presence: apagado por defecto, lo que se publica lo ve cualquiera
        # que mire el perfil (ver discord_presence.py).
        self.discord_var = tk.BooleanVar(value=bool(win_integration.load_settings().get("discord_presence")))
        dchk = tk.Checkbutton(options, text=T("discord_presence"), variable=self.discord_var,
                              command=self.toggle_discord, bg=BG, fg=FG, selectcolor="#262b33",
                              activebackground=BG, activeforeground=FG, wraplength=520, justify="left")
        dchk.pack(anchor="w", pady=(2, 0))
        if not discord_presence.APPLICATION_ID:
            dchk.configure(state="disabled")

        # Bajo Proton el cliente retiene el wineserver del prefijo y Steam
        # sigue viendo el juego como "Running". Por eso viene activado ahi y
        # apagado en Windows, donde quedarse en la bandeja es lo mejor.
        self.quit_var = tk.BooleanVar(value=win_integration.quit_on_game_close_enabled())
        qchk = tk.Checkbutton(options, text=T("quit_on_game_close"), variable=self.quit_var,
                              command=self.toggle_quit_on_game_close, bg=BG, fg=FG,
                              selectcolor="#262b33", activebackground=BG, activeforeground=FG,
                              wraplength=520, justify="left")
        qchk.pack(anchor="w", pady=(2, 0))

        # Prendido por defecto. Se apaga para quien abre el tablero en el
        # celular o en otra PC: ahi la ventana en la maquina donde juega no
        # aporta nada, y bajo gamescope ademas le roba el foco al juego, que
        # deja de recibir teclas hasta que hace clic de vuelta (issue #6).
        self.dashboard_var = tk.BooleanVar(value=win_integration.open_dashboard_enabled())
        bchk = tk.Checkbutton(options, text=T("open_dashboard_on_start"), variable=self.dashboard_var,
                              command=self.toggle_open_dashboard, bg=BG, fg=FG,
                              selectcolor="#262b33", activebackground=BG, activeforeground=FG,
                              wraplength=520, justify="left")
        bchk.pack(anchor="w", pady=(2, 0))

        # --- Overlay en el juego (overlay.py) ---
        # Seccion propia. Solo Windows: bajo Wine las ventanas transparentes
        # que dejan pasar el clic no andan.
        if win_integration.overlay_supported():
            self.build_overlay_section()
        elif win_integration.is_wine():
            # Bajo Proton la seccion no aparecia y no se sabia por que ("the
            # overlay options aren't in here", Discord 10-10): se dice.
            sec = self.section(T("sec_overlay"))
            self.label(sec, T("overlay_wine"), fg=MUTED, wraplength=540,
                       justify="left").pack(anchor="w", pady=(4, 6))

        # --- Update ---
        # --- Update ---
        self.update_frame = tk.Frame(self.abajo, bg="#1f2a3a", padx=16, pady=8)
        self.update_label = self.label(self.update_frame, "", bg="#1f2a3a", wraplength=400)
        self.update_label.pack(side="left")
        # Con winget el .exe no se pisa solo (ver installed_by_winget): el
        # boton copia el comando para actualizar desde una terminal.
        self.via_winget = win_integration.installed_by_winget()
        if self.via_winget:
            self.update_button = self.button(self.update_frame, T("copy"), self.copy_winget_command, primary=True)
        else:
            self.update_button = self.button(self.update_frame, T("update_now"), self.do_update, primary=True)
        self.update_button.pack(side="right")

        footer = self.footer = tk.Frame(self.abajo, bg=BG, padx=16, pady=12)
        footer.pack(fill="x")
        self.button(footer, T("check_updates"), self.check_updates).pack(side="left")
        self.button(footer, T("show_log"), lambda: show_log_location(None, None)).pack(side="left", padx=6)
        self.button(footer, T("report_problem"), lambda: report_problem(None, None)).pack(side="left", padx=6)
        self.button(footer, T("close"), self.root.destroy).pack(side="right")

        self.refresh_status()

    def render_installs(self):
        for child in self.games_body.winfo_children():
            child.destroy()
        installs = state.refresh_installs()
        if not installs:
            self.label(self.games_body, T("no_steam_install"), fg=MUTED, wraplength=520).pack(anchor="w")
            return
        # Mas de una copia del mismo juego es normal (dos bibliotecas de
        # Steam, una carpeta movida, la version de 32 bits). Cuando pasa, dos
        # filas con el mismo nombre no se pueden distinguir, asi que en ese
        # caso se muestra la carpeta de cada una.
        repetidos = {n for n in (i["name"] for i in installs)
                     if [x["name"] for x in installs].count(n) > 1}
        for install in installs:
            row = tk.Frame(self.games_body, bg=BG)
            row.pack(fill="x", pady=2)
            self.label(row, install["name"], width=26).pack(side="left")
            if install["state"] == "installed":
                self.label(row, T("plugin_installed"), fg=GREEN).pack(side="left")
            elif install["state"] == "outdated":
                self.label(row, T("plugin_other_version"), fg=ORANGE).pack(side="left")
                self.button(row, T("replace"), lambda i=install: self.install_for(i)).pack(side="left", padx=8)
            elif install.get("other_plugin"):
                # Solo un scs-telemetry.dll (de otra app o de un cliente
                # viejo): hay telemetria, sin los trabajos con auto. El
                # nuestro se suma al lado; ese no se toca.
                self.label(row, T("plugin_other_version"), fg=ORANGE).pack(side="left")
                self.button(row, T("install_plugin"), lambda i=install: self.install_for(i)).pack(side="left", padx=8)
            else:
                self.label(row, T("plugin_not_installed"), fg=RED).pack(side="left")
                self.button(row, T("install_plugin"), lambda i=install: self.install_for(i), primary=True).pack(side="left", padx=8)
            # Quitar solo las agregadas a mano: una de Steam volveria a
            # aparecer en el proximo re-scan y el boton mentiria.
            if install.get("origen") == "manual":
                self.button(row, T("remove_folder"),
                            lambda i=install: self.remove_game_folder(i)).pack(side="left", padx=4)
            if install["name"] in repetidos:
                self.label(self.games_body, install["bin_dir"], fg=MUTED,
                           wraplength=520, font=("Segoe UI", 8)).pack(anchor="w", padx=(8, 0))

    def install_for(self, install):
        try:
            path = plugin_installer.install_plugin(install["bin_dir"])
            logging.info("Installed telemetry plugin at %s", path)
            self.flash(T("installed_ok", name=install['name']), GREEN)
        except PermissionError:
            self.flash(T("install_perm_error", dir=install['bin_dir']), RED)
        except Exception as exc:
            logging.exception("Plugin install failed")
            self.flash(T("install_error", err=exc), RED)
        self.render_installs()

    def remove_game_folder(self, install):
        """Saca una carpeta agregada a mano. Es la salida cuando queda una
        entrada de una copia del juego que ya no esta o que nunca sirvio."""
        settings = win_integration.load_settings()
        extra = settings.get("extra_game_dirs", [])
        quedan = [x for x in extra
                  if not plugin_installer.same_dir(x, install["bin_dir"])]
        if len(quedan) != len(extra):
            settings["extra_game_dirs"] = quedan
            win_integration.save_settings(settings)
            logging.info("Removed game folder %s from Setup", install["bin_dir"])
            self.flash(T("folder_removed"), MUTED)
        self.render_installs()

    def build_account_section(self):
        cuenta = self.section(T("sec_account"))
        # Recuadro con borde azul: sin vincular, explica en dos lineas que
        # gana uno; vinculado, queda solo el estado y el boton a la cuenta.
        caja = tk.Frame(cuenta, bg=CARD, padx=12, pady=10,
                        highlightbackground=BLUE, highlightthickness=1)
        caja.pack(fill="x", pady=(4, 0))
        self.account_pitch_title = self.label(caja, T("account_pitch_title"), bg=CARD,
                                              font=("Segoe UI", 10, "bold"))
        self.account_pitch = self.label(caja, T("account_pitch"), bg=CARD, fg=MUTED,
                                        wraplength=500)
        self.account_label = self.label(caja, "", bg=CARD, wraplength=500)
        self.account_label.pack(anchor="w")
        fila = tk.Frame(caja, bg=CARD)
        fila.pack(anchor="w", pady=(6, 0))
        self.account_button = self.button(fila, T("account_link"),
                                          self.link_account, primary=True)
        self.account_button.pack(side="left")
        # Vinculado: a la cuenta en la web, que es donde estan los viajes.
        self.account_open = self.button(fila, T("account_open"), self.open_account, primary=True)
        self.account_code = self.label(fila, "", bg=CARD, font=("Consolas", 16, "bold"), fg=BLUE)
        self.account_code.pack(side="left", padx=12)
        # Aparece solo con un codigo a la vista: el que se escribe en la web.
        self.account_copy = self.button(fila, T("copy"), self.copy_account_code)
        self.refresh_account()

    def _mostrar_pitch(self, ver: bool):
        """La explicacion solo sin cuenta; vinculado ya no hace falta venderla."""
        for w in (self.account_pitch_title, self.account_pitch):
            w.pack_forget()
        if ver:
            self.account_pitch_title.pack(anchor="w", before=self.account_label)
            self.account_pitch.pack(anchor="w", pady=(2, 6), before=self.account_label)
        # El de ir a la cuenta va primero cuando hay cuenta; desvincular queda
        # al lado, gris.
        self.account_open.pack_forget()
        if not ver:
            self.account_open.pack(side="left", padx=(0, 6), before=self.account_button)
        self.account_button.configure(bg="#262b33" if not ver else BLUE,
                                      activebackground="#333940" if not ver else "#2b8ef0")

    def open_account(self):
        abrir_navegador(URL_CUENTA)

    def set_account_code(self, codigo: str):
        self.account_code.configure(text=codigo)
        if codigo:
            self.account_copy.pack(side="left")
        else:
            self.account_copy.pack_forget()

    def copy_account_code(self):
        codigo = self.account_code.cget("text")
        if codigo:
            self.root.clipboard_clear()
            self.root.clipboard_append(codigo)
            self.flash(T("copied"), MUTED)

    def _bombear_cola(self):
        """Corre en el hilo principal lo que dejaron los hilos de fondo."""
        try:
            while True:
                try:
                    tarea = self._cola.get_nowait()
                except queue.Empty:
                    break
                try:
                    tarea()
                except Exception:
                    logging.exception("Fallo una tarea de la cola de la ventana")
        finally:
            try:
                self.root.after(100, self._bombear_cola)
            except tk.TclError:
                pass  # la ventana se cerro

    def en_ventana(self, funcion):
        """Lo que quiera tocar la ventana desde un hilo pasa por aca."""
        self._cola.put(funcion)

    def refresh_account(self):
        """Muestra con que cuenta esta vinculado, si lo esta.

        Se consulta en un hilo: la API puede tardar o no estar, y la ventana
        no puede quedarse colgada por eso.
        """
        token = account.token_guardado(win_integration.load_settings())
        self._mostrar_pitch(not token)
        if not token:
            self.account_label.configure(text=T("account_none"))
            self.account_button.configure(text=T("account_link"), state="normal")
            return
        self.account_label.configure(text=T("account_checking"))

        def consultar():
            usuario = account.quien_soy(token, win_integration.load_settings())
            def pintar():
                if usuario:
                    nombre = usuario.get("username") or T("account_no_name")
                    self.account_label.configure(text=T("account_linked", name=nombre))
                    self.account_button.configure(text=T("account_unlink"), state="normal")
                else:
                    # Puede ser que el token ya no valga o que no haya
                    # internet. No se borra nada: borrarlo por un corte de
                    # wifi obligaria a vincular de nuevo cada vez.
                    self.account_label.configure(text=T("account_unreachable"))
                    self.account_button.configure(text=T("account_unlink"), state="normal")
            self.en_ventana(pintar)

        threading.Thread(target=consultar, daemon=True).start()

    def link_account(self):
        """Pide un codigo y espera a que lo aprueben desde la web."""
        settings = win_integration.load_settings()
        if account.token_guardado(settings):
            # El boton dice "desvincular" cuando ya hay cuenta. Solo borra el
            # token de esta PC; la sesion se corta del todo desde la web.
            settings.pop(account.CLAVE_TOKEN, None)
            win_integration.save_settings(settings)
            self.set_account_code("")
            self.flash(T("account_unlinked"), MUTED)
            self.refresh_account()
            return

        self.account_button.configure(state="disabled")
        self.account_label.configure(text=T("account_asking"))

        def pedir():
            import socket
            pedido = account.pedir_codigo(socket.gethostname() or "Truck Dash",
                                          win_integration.load_settings())
            if not pedido:
                self.en_ventana(lambda: (
                    self.account_label.configure(text=T("account_unreachable")),
                    self.account_button.configure(state="normal")))
                return

            def mostrar():
                self.set_account_code(pedido["code"])
                self.account_label.configure(text=T("account_enter_code", url=pedido["url"]))
                abrir_navegador(pedido["url"])
            self.en_ventana(mostrar)
            self.esperar_aprobacion(pedido)

        threading.Thread(target=pedir, daemon=True).start()

    def esperar_aprobacion(self, pedido):
        """Pregunta cada tres segundos hasta que lo aprueben o se venza.

        Corre en el hilo que ya venia del boton, y todo lo que toca la
        ventana pasa por root.after: Tk no es seguro desde otro hilo.
        """
        import time
        limite = time.time() + pedido.get("expires_in", 600)
        while time.time() < limite:
            time.sleep(PAUSA_APROBACION)
            estado, token = account.consultar_codigo(
                pedido["secret"], win_integration.load_settings())
            if estado == "sin_red":
                continue  # un corte no es un rechazo: se sigue esperando
            if estado == "listo":
                settings = win_integration.load_settings()
                settings[account.CLAVE_TOKEN] = token
                win_integration.save_settings(settings)
                logging.info("Cuenta vinculada")
                self.en_ventana(lambda: (
                    self.set_account_code(""),
                    self.flash(T("account_ok"), GREEN),
                    self.refresh_account()))
                return
            if estado == "vencido":
                break
        self.en_ventana(lambda: (
            self.set_account_code(""),
            self.account_label.configure(text=T("account_expired")),
            self.account_button.configure(state="normal")))

    def toggle_quit_on_game_close(self):
        win_integration.set_quit_on_game_close(self.quit_var.get())

    def toggle_open_dashboard(self):
        win_integration.set_open_dashboard(self.dashboard_var.get())

    def build_overlay_section(self):
        sec = self.section(T("sec_overlay"))
        self.overlay_var = tk.BooleanVar(value=state.overlay.enabled)
        tk.Checkbutton(sec, text=T("overlay_option"), variable=self.overlay_var,
                       command=self.toggle_overlay, bg=BG, fg=FG, selectcolor="#262b33",
                       activebackground=BG, activeforeground=FG).pack(anchor="w", pady=(4, 0))
        self.label(sec, T("overlay_hint"), fg=MUTED, wraplength=540, justify="left").pack(anchor="w", pady=(0, 6))
        grilla = tk.Frame(sec, bg=BG)
        grilla.pack(anchor="w", padx=(4, 0))
        corner, size, items, _pos = state.overlay_layout
        nombre_tecla = lambda k: overlay.nombre_tecla(k) if k else T("hotkey_none")
        self.overlay_corner_var = tk.StringVar(value=T(f"pos_{corner}"))
        self.overlay_size_var = tk.StringVar(value=T(f"size_{size}"))
        self.overlay_hotkey_var = tk.StringVar(value=nombre_tecla(state.overlay_tecla.actual))
        filas = (
            (T("overlay_position"), self.overlay_corner_var, [(c, T(f"pos_{c}")) for c in overlay.CORNERS],
             lambda c: set_overlay_layout(corner=c)),
            (T("overlay_size"), self.overlay_size_var, [(k, T(f"size_{k}")) for k in overlay.SIZES],
             lambda k: set_overlay_layout(size=k)),
            (T("overlay_hotkey"), self.overlay_hotkey_var, [(k, nombre_tecla(k)) for k in overlay.HOTKEYS],
             set_overlay_hotkey),
        )
        for fila, (etiqueta, var, opciones, al_elegir) in enumerate(filas):
            self.label(grilla, etiqueta, fg=MUTED).grid(row=fila, column=0, sticky="w", padx=(0, 8), pady=2)
            por_texto = {texto: clave for clave, texto in opciones}
            menu = tk.OptionMenu(grilla, var, *por_texto,
                                 command=lambda texto, m=por_texto, f=al_elegir: f(m[texto]))
            menu.configure(bg="#262b33", fg=FG, activebackground="#2f3540", activeforeground=FG,
                           highlightthickness=0, bd=0, width=18, anchor="w")
            menu["menu"].configure(bg="#262b33", fg=FG)
            menu.grid(row=fila, column=1, sticky="w", pady=2)
        # Mover: el overlay se arrastra con el mouse hasta tocar Listo.
        self.overlay_move_button = self.button(grilla, T("overlay_move"), self.toggle_overlay_move)
        self.overlay_move_button.grid(row=0, column=2, sticky="w", padx=(8, 0))
        self.overlay_move_hint = self.label(sec, T("overlay_move_hint"), fg=BLUE)
        # Que se muestra: cada parte se prende o apaga por separado.
        self.label(grilla, T("overlay_show"), fg=MUTED).grid(row=3, column=0, sticky="nw", padx=(0, 8), pady=(4, 0))
        casillas = tk.Frame(grilla, bg=BG)
        casillas.grid(row=3, column=1, columnspan=2, sticky="w", pady=(2, 0))
        self.overlay_item_vars = {}
        for i, clave in enumerate(overlay.ITEMS):
            var = tk.BooleanVar(value=clave in items)
            self.overlay_item_vars[clave] = var
            tk.Checkbutton(casillas, text=T(f"item_{clave}"), variable=var, command=self.change_overlay_items,
                           bg=BG, fg=FG, selectcolor="#262b33", activebackground=BG,
                           activeforeground=FG).grid(row=i // 3, column=i % 3, sticky="w", padx=(0, 6))

    def toggle_overlay_move(self):
        mover = not state.overlay.mover
        if mover and not state.overlay.enabled:
            # Para moverlo tiene que estar prendido.
            self.overlay_var.set(True)
            set_overlay(True)
        state.overlay.mover = mover
        self.overlay_move_button.configure(text=T("overlay_move_done" if mover else "overlay_move"))
        if mover:
            self.overlay_move_hint.pack(anchor="w", pady=(4, 0))
        else:
            self.overlay_move_hint.pack_forget()

    def change_language(self, codigo: str):
        set_client_language(codigo)
        self.reabrir = True
        self.root.destroy()

    def toggle_overlay(self):
        set_overlay(self.overlay_var.get())

    def change_overlay_items(self):
        set_overlay_layout(items=[k for k in overlay.ITEMS if self.overlay_item_vars[k].get()])

    def add_game_folder(self):
        chosen = filedialog.askdirectory(title=T("pick_folder_title"))
        if not chosen:
            return
        bin_dir = plugin_installer.resolve_bin_dir(os.path.normpath(chosen))
        if not bin_dir:
            self.flash(T("not_game_folder"), RED)
            return
        settings = win_integration.load_settings()
        extra = settings.setdefault("extra_game_dirs", [])
        # Ni repetida dentro de la lista, ni una que la deteccion automatica
        # ya encuentra sola: en los dos casos terminaba duplicando la entrada.
        # state.installs y no self.installs: la lista vive en AppState. Con
        # self.installs esto tiraba AttributeError, que en un build sin
        # consola no se ve, asi que el boton parecia no hacer nada.
        ya_esta = any(plugin_installer.same_dir(x, bin_dir) for x in extra) \
            or any(plugin_installer.same_dir(i["bin_dir"], bin_dir) for i in state.installs)
        if not ya_esta:
            extra.append(bin_dir)
            win_integration.save_settings(settings)
        self.render_installs()

    def rescan(self):
        self.render_installs()

    def _local_map_signature(self):
        build = state.map_build or {}
        return (tuple(sorted((g, m.get("fingerprint")) for g, m in state.local_maps.items())),
                tuple(g for g in ("ats", "ets2") if needs_map_build(g)),
                build.get("game"), build.get("step"), build.get("error"), build.get("running"))

    def render_local_map(self):
        sig = self._local_map_signature()
        if sig == self._local_map_sig:
            return
        self._local_map_sig = sig
        for child in self.local_map_body.winfo_children():
            child.destroy()
        build = state.map_build or {}
        filas = 0
        for game in ("ats", "ets2"):
            nombre = GAME_LABELS.get(game, game)
            if build.get("game") == game and build.get("running"):
                fila = tk.Frame(self.local_map_body, bg=BG)
                fila.pack(fill="x", pady=2)
                self.label(fila, T(f"local_map_step_{build.get('step')}"), fg=BLUE).pack(side="left")
                self.button(fila, T("local_map_cancel"), state.map_build_cancel.set).pack(side="left", padx=8)
            elif game in state.local_maps:
                man = state.local_maps[game]
                self.label(self.local_map_body, T("local_map_ready", game=nombre, cities=man.get("cities", "?"),
                                                  date=str(man.get("built", ""))[:10]),
                           fg=GREEN, wraplength=520).pack(anchor="w", pady=2)
            elif needs_map_build(game):
                self.label(self.local_map_body, T("local_map_needed", game=nombre), wraplength=520).pack(anchor="w", pady=(2, 0))
                self.label(self.local_map_body, T("local_map_requirements"), fg=MUTED, wraplength=520).pack(anchor="w", pady=(2, 4))
                self.button(self.local_map_body, T("local_map_build"), lambda g=game: self.build_my_map(g),
                            primary=True).pack(anchor="w")
            else:
                continue
            filas += 1
            if build.get("game") == game and build.get("step") == "error":
                self.label(self.local_map_body, T("local_map_error", err=build.get("error")), fg=RED,
                           wraplength=520).pack(anchor="w", pady=(4, 0))
            elif build.get("game") == game and build.get("step") == "cancelled":
                self.label(self.local_map_body, T("local_map_cancelled"), fg=MUTED).pack(anchor="w", pady=(4, 0))
        if filas:
            if not self.local_map_frame.winfo_ismapped():
                self.local_map_frame.pack(fill="x", after=self.games_frame)
        else:
            self.local_map_frame.pack_forget()

    def build_my_map(self, game):
        if map_builder.game_running():
            self.flash_local_map(T("local_map_game_running"), RED)
            return
        libre = map_builder.free_memory_gb()
        if libre is not None and libre < map_builder.MIN_FREE_GB:
            from tkinter import messagebox
            if not messagebox.askyesno("Truck Dash", T("local_map_low_memory", free=f"{libre:.1f}"), parent=self.root):
                return
        if not game_dir_for(game):
            self.flash_local_map(T("local_map_no_game_dir", game=GAME_LABELS.get(game, game)), RED)
            return
        start_map_build(game)
        self.render_local_map()

    def flash_local_map(self, text, color):
        self.label(self.local_map_body, text, fg=color, wraplength=520).pack(anchor="w", pady=(4, 0))

    def flash(self, text, color):
        if not hasattr(self, "flash_label"):
            self.flash_label = self.label(self.games_frame, "", wraplength=520)
            self.flash_label.pack(anchor="w", pady=(4, 0))
        self.flash_label.configure(text=text, fg=color)

    def toggle_discord(self):
        enabled = bool(self.discord_var.get())
        settings = win_integration.load_settings()
        settings["discord_presence"] = enabled
        win_integration.save_settings(settings)
        state.discord.set_enabled(enabled)

    def toggle_autostart(self):
        if self.autostart_var.get() and win_integration.in_temp_location():
            # Ver in_temp_location(): desde el zip no sirve y Defender lo marca.
            self.autostart_var.set(False)
            self.flash(T("autostart_temp_folder"), ORANGE)
            return
        ok = win_integration.set_autostart(self.autostart_var.get())
        if not ok:
            self.autostart_var.set(win_integration.is_autostart_enabled())

    def new_code(self):
        """Pide un codigo nuevo: los links guardados con el anterior dejan de
        funcionar. Para cuando el codigo se filtro (stream, captura) o se
        quiere cortar el acceso de un dispositivo."""
        if rotate_pairing_code():
            self.flash(T("new_code_done"), ORANGE)

    def copy_code(self):
        if state.code:
            self.root.clipboard_clear()
            self.root.clipboard_append(state.code)

    def render_lan(self):
        if win_integration.red_publica():
            self.lan_public_frame.pack(anchor="w", pady=(6, 0), fill="x")
        else:
            self.lan_public_frame.pack_forget()
        srv = state.local
        url = srv.url if srv else None
        if not srv or srv.error or not srv.web_ready or not url:
            if not srv:
                reason = T("lan_starting")
            elif getattr(srv, "port_in_use", False):
                reason = T("lan_port_busy", port=local_server.HTTP_PORT)
            else:
                reason = srv.error or T("lan_no_web")
            self.lan_url_label.configure(text=T("lan_unavailable", reason=reason), fg=MUTED)
            self.qr_label.configure(image="", text="")
            return
        self.lan_url_label.configure(text=url, fg=BLUE)
        try:
            from PIL import ImageTk
            img = local_server.qr_image(url)
            self._qr_photo = ImageTk.PhotoImage(img, master=self.root)
            self.qr_label.configure(image=self._qr_photo)
        except Exception:
            logging.exception("QR render failed")
            self.qr_label.configure(image="", text="")

    def copy_lan_url(self):
        url = state.local.url if state.local else None
        if url:
            self.root.clipboard_clear()
            self.root.clipboard_append(url)

    def open_lan_here(self):
        if state.local and state.local.web_ready:
            abrir_navegador(f"http://127.0.0.1:{local_server.HTTP_PORT}/app/?local=1")

    def open_dashboard(self):
        url = build_web_url()
        if url:
            abrir_navegador(url)

    def check_updates(self):
        def _run():
            latest, url, sha = check_for_update(state.backend_url or "")
            if latest:
                state.update_available = (latest, url, sha)
            else:
                self.root.after(0, lambda: self.flash(T("up_to_date", v=client_lib.CLIENT_VERSION), GREEN))
        threading.Thread(target=_run, daemon=True).start()

    def copy_winget_command(self):
        self.root.clipboard_clear()
        self.root.clipboard_append(win_integration.winget_upgrade_command())
        self.flash(T("copied"), GREEN)

    def do_update(self):
        if not state.update_available:
            return
        version, url, sha = state.update_available
        self.update_button.configure(state="disabled")

        def progress(key):
            self.root.after(0, lambda: self.update_label.configure(text=T(key)))

        def _run():
            try:
                staged = win_integration.stage_update(url, sha, progress)
                progress("restarting")
                time.sleep(0.4)
                # El reemplazo lo hace el .exe nuevo desde afuera: este
                # proceso solo se va, que es la condicion para que el
                # archivo se pueda pisar.
                win_integration.start_updater(staged, [win_integration.AUTOSTART_FLAG] if state.autostart_mode else None)
                state.cuenta.cerrar_sesion()
                win_integration.stop_and_exit(stop_callback=lambda: state.icon and state.icon.stop())
            except Exception as exc:
                logging.exception("Update failed")
                self.root.after(0, lambda: (self.update_label.configure(text=T("update_failed", err=exc)), self.update_button.configure(state="normal")))
        threading.Thread(target=_run, daemon=True).start()

    def refresh_status(self):
        color = {"live": GREEN, "waiting_truck": BLUE, "waiting_game": FG, "plugin_missing": ORANGE, "plugin_not_installed": ORANGE}.get(state.status, FG)
        if state.cloud in ("offline", "reconnecting") and state.status != "live":
            color = RED if state.cloud == "offline" else ORANGE
        text = state.status_text()
        if state.status == "plugin_missing" and state.status_detail:
            text += "\n" + state.status_detail
        self.status_label.configure(text=text, fg=color)
        self.code_label.configure(text=state.code or "-")
        if hasattr(self, "overlay_var") and self.overlay_var.get() != state.overlay.enabled:
            self.overlay_var.set(state.overlay.enabled)  # se toco desde la bandeja o con la tecla
        if hasattr(self, "overlay_corner_var"):
            # Arrastrado en el modo Mover: pasa a "Personalizada".
            texto = T(f"pos_{state.overlay_layout[0]}")
            if self.overlay_corner_var.get() != texto:
                self.overlay_corner_var.set(texto)
        self.render_local_map()
        lan_url = state.local.url if (state.local and state.local.web_ready and not state.local.error) else None
        # La deteccion de la red Publica llega despues (PowerShell, en un hilo).
        clave_lan = (lan_url, win_integration.red_publica())
        if getattr(self, "_last_lan_url", "?") != clave_lan:
            self._last_lan_url = clave_lan
            self.render_lan()
        if state.update_available:
            version = state.update_available[0]
            if not self.update_frame.winfo_ismapped():
                if self.via_winget:
                    self.update_label.configure(text=T("update_available_winget", new=version, cur=client_lib.CLIENT_VERSION,
                                                       cmd=win_integration.winget_upgrade_command()))
                else:
                    self.update_label.configure(text=T("update_available", new=version, cur=client_lib.CLIENT_VERSION))
                self.update_frame.pack(fill="x", before=self.footer)
        try:
            self.root.after(500, self.refresh_status)
        except tk.TclError:
            pass

    def run(self):
        self.root.mainloop()
        # Cerrar Setup a mitad de mover el overlay no lo deja agarrable.
        state.overlay.mover = False


# ---------------------------------------------------------------------------
# Menu de bandeja
# ---------------------------------------------------------------------------

def show_code_notification(icon, item):
    if state.code:
        show_text_dialog("Truck Dash", T("dlg_pairing_code"), copy_value=state.code)
    else:
        show_text_dialog("Truck Dash", T("dlg_no_code"))


def show_log_location(icon, item):
    show_text_dialog("Truck Dash", T("dlg_log"), copy_value=LOG_PATH)
    try:
        os.startfile(os.path.dirname(LOG_PATH))
    except Exception:
        pass


def apagar() -> None:
    """Cierra la aplicacion desde cualquier hilo.

    quit_app sirve solo desde el menu de la bandeja (recibe el icono). Esto
    lo llama tambien el loop de telemetria, que corre en el hilo de asyncio,
    y tiene que funcionar igual sin bandeja (Linux sin GTK).
    """
    # Antes de irse: la sesion de manejo se cierra y queda en la cola.
    # Lo que no se llegue a mandar sale en el proximo arranque.
    state.cuenta.cerrar_sesion()
    state.discord.close()
    icono = state.icon
    win_integration.stop_and_exit(icono.stop if icono is not None else None)


def quit_app(icon, item):
    # Salir de la bandeja tambien termina la sesion de manejo, igual que
    # apagar(); sin esto quedaba abierta en el servidor para siempre.
    state.cuenta.cerrar_sesion()
    # Sin esto Discord deja colgado el "jugando a Truck Dash" hasta que nota
    # que el proceso murio.
    state.discord.close()
    icon.stop()


_browser_opened = False


def build_web_url() -> str | None:
    if not state.code or not state.backend_url:
        return None
    query = urllib.parse.urlencode({"backend": state.backend_url, "code": state.code})
    return f"{state.web_url}?{query}"


def open_web_ui():
    global _browser_opened
    # Quien lo abre en el celular o en otra PC no necesita ninguna ventana en
    # la maquina donde juega, y bajo gamescope esa ventana le roba el foco al
    # juego, que deja de recibir teclas hasta que hace clic de vuelta
    # (issue #6). Se consulta cada vez y no una sola: la casilla se puede
    # apagar con el cliente ya abierto.
    if not win_integration.open_dashboard_enabled():
        return
    if _browser_opened:
        return
    _browser_opened = True
    # Si ya hay un tablero conectado (la pestana de la vez anterior, el
    # celular) no se abre otro: se abria uno en cada arranque, quedaban
    # varios con el mismo codigo y el overlay saltaba entre ellos
    # (auditoria del 10-10).
    lan = len(state.local.viewers) if state.local else 0
    if (state.cloud_viewers or 0) > 0 or lan > 0:
        logging.info("Ya hay un tablero abierto (%s por internet, %d por LAN): no se abre otro",
                     state.cloud_viewers, lan)
        return
    url = build_web_url()
    if url:
        abrir_navegador(url)


async def abrir_tablero_al_arrancar():
    """Abre el tablero al arrancar, despues de saber (o de esperar un poco a
    saber) cuantos hay conectados. Un relay viejo no lo dice: se abre igual."""
    for _ in range(16):
        if state.cloud_viewers is not None:
            break
        await asyncio.sleep(0.5)
    open_web_ui()


def open_web_menu_item(icon, item):
    url = build_web_url()
    if url:
        abrir_navegador(url)
    else:
        show_text_dialog("Truck Dash", T("dlg_no_code"))


def show_lan_menu_item(icon, item):
    srv = state.local
    if srv and srv.web_ready and not srv.error and srv.url:
        show_text_dialog("Truck Dash", T("dlg_lan"), copy_value=srv.url)
    else:
        show_text_dialog("Truck Dash", T("dlg_lan_unavailable"))


def check_for_update(backend_url: str):
    """(latest_version, download_url, sha256) si hay una version mas nueva,
    o (None, None, None) si esta al dia o fallo la consulta (no es critico)."""
    try:
        url = client_lib.http_base_url(backend_url) + "/version"
        with red.abrir(url, timeout=10) as resp:
            data = json.loads(resp.read())
        aplicar_interruptor(data)
        latest = data.get("latest_client_version")
        if latest and client_lib.is_newer_version(latest, client_lib.CLIENT_VERSION):
            return latest, data.get("download_url"), data.get("sha256")
    except Exception:
        logging.exception("Failed to check for updates")
    return None, None, None


async def vigilar_interruptor(backend_url: str, cada_s: float = 1800) -> None:
    """Vuelve a mirar /version cada 30 minutos: apagar las cuentas desde el
    relay tiene que llegar tambien a quien deja el cliente abierto dias."""
    while True:
        await asyncio.sleep(cada_s)
        await asyncio.to_thread(check_for_update, backend_url)


def check_for_update_silent(backend_url: str):
    latest, download_url, sha = check_for_update(backend_url)
    if latest:
        logging.info("Update available: v%s (running v%s)", latest, client_lib.CLIENT_VERSION)
        state.update_available = (latest, download_url, sha)
        if not state.autostart_mode:
            open_setup_window()


def check_for_update_menu_item(icon, item):
    if not state.backend_url:
        show_text_dialog("Truck Dash", T("dlg_not_connected"))
        return
    latest, download_url, sha = check_for_update(state.backend_url)
    if latest:
        state.update_available = (latest, download_url, sha)
        open_setup_window()
    else:
        show_text_dialog("Truck Dash", T("up_to_date", v=client_lib.CLIENT_VERSION))


def report_problem(icon, item):
    """Abre un issue de GitHub con el diagnostico ya cargado (version, estado,
    juegos detectados, LAN, Windows y las ultimas lineas del log). El usuario
    ve y edita todo antes de publicar - no se manda nada solo."""
    import platform
    import urllib.parse

    try:
        with open(LOG_PATH, encoding="utf-8", errors="ignore") as f:
            tail = "".join(f.readlines()[-25:])[-2500:]
    except OSError:
        tail = "(no log)"
    installs = ", ".join(f"{i['game']}={i['state']}" for i in state.installs) or "none detected"
    lan = state.local
    lan_text = "unavailable" if not lan or lan.error or not lan.web_ready else "ok"
    body = "\n".join([
        "**What happened?**", "", "(describe the problem here)", "", "**Steps to reproduce**", "", "1. ", "",
        "---", "<details><summary>Diagnostics (auto-filled)</summary>", "",
        f"- Client version: {client_lib.CLIENT_VERSION}",
        f"- Telemetry state: {state.status} (game: {state.game or '-'})",
        f"- Server link: {state.cloud}",
        f"- Games / plugin: {installs}",
        f"- LAN mode: {lan_text}",
        f"- Autostart: {win_integration.is_autostart_enabled()}",
        f"- Windows: {platform.platform()}",
        "", "Last log lines:", "```", tail.strip(), "```", "</details>",
    ])
    query = urllib.parse.urlencode({"title": "[client] ", "body": body, "labels": "bug"})
    abrir_navegador(f"https://github.com/Nethercap/truck-companion/issues/new?{query}")


def set_overlay(enabled: bool) -> None:
    """Prende o apaga el overlay en el juego y lo guarda. El cambio llega a la
    web con el proximo client_status (publish_status lo mira en cada vuelta)."""
    win_integration.save_overlay_settings(enabled=bool(enabled))
    state.overlay.set_enabled(bool(enabled))


def set_overlay_layout(corner: str | None = None, size: str | None = None, items=None, pos=None) -> None:
    actual_corner, actual_size, actual_items, actual_pos = state.overlay_layout
    state.overlay_layout = (corner or actual_corner, size or actual_size,
                            tuple(items) if items is not None else actual_items,
                            tuple(pos) if pos is not None else actual_pos)
    corner, size, items, pos = state.overlay_layout
    win_integration.save_overlay_settings(corner=corner, size=size, items=items, pos=pos)


def set_overlay_hotkey(combinacion: str) -> None:
    win_integration.save_overlay_settings(hotkey=combinacion)
    state.overlay_tecla.poner(combinacion)


def tecla_del_overlay() -> None:
    """La tecla rapida, solo con el juego al frente: Ctrl+Shift+O es tambien
    abrir los favoritos en Chrome y Edge, y prendia o apagaba el overlay (y
    quedaba guardado) sin que nadie se enterara."""
    import window_compat
    if window_compat.game_window_in_front():
        set_overlay(not state.overlay.enabled)


def toggle_overlay_menu_item(icon, item):
    set_overlay(not state.overlay.enabled)


def toggle_autostart_menu_item(icon, item):
    if not win_integration.is_autostart_enabled() and win_integration.in_temp_location():
        show_text_dialog("Truck Dash", T("autostart_temp_folder"))
        return
    win_integration.set_autostart(not win_integration.is_autostart_enabled())


def open_donate(icon, item):
    abrir_navegador(DONATE_URL)


# ---------------------------------------------------------------------------
# Loop principal: backend + telemetria
# ---------------------------------------------------------------------------

def actualizar_plugins_viejos(ahora: float | None = None) -> None:
    """Pone nuestro plugin en los juegos que tengan uno de una version
    anterior, o solo el scs-telemetry.dll de otra app o de un cliente viejo
    (ver plugin_installer.update_own_plugin). Corre al arrancar y mientras se
    espera el juego, como mucho una vez por minuto: con el juego abierto la
    DLL esta en uso y el reemplazo falla, asi que el momento es con el juego
    cerrado, y la proxima vez que se abra ya carga el nuevo."""
    ahora = time.time() if ahora is None else ahora
    if ahora - state.plugins_revisados_at < 60:
        return
    state.plugins_revisados_at = ahora
    for bin_dir in plugin_installer.update_own_plugin(state.installs):
        logging.info("Telemetry plugin updated to v%s in %s",
                     plugin_installer.PLUGIN_DLL_VERSION, bin_dir)


GAME_LOADING_GRACE_S = 90
FROZEN_FRAME_SECONDS = 10
_juego_visto_desde = None


def telemetry_status_when_unavailable() -> str:
    """Por que no hay telemetria: el juego no esta abierto, o esta abierto
    pero el plugin no carga. En ese caso se mira el proceso que corre para
    decir CUAL es el problema (state.status_detail, que viaja a la web):
    plugin ausente en esa copia del juego, juego elevado, o plugin presente
    pero no cargado (falta reiniciar / aceptar el dialogo del SDK)."""
    global _juego_visto_desde
    hwnd = client_lib.find_game_window()
    if hwnd:
        if _juego_visto_desde is None:
            _juego_visto_desde = time.time()
        detalle = diagnose_running_game(hwnd)
        # La ventana aparece antes de que el plugin cree la memoria: en cada
        # arranque del juego se decia "falta el plugin, reinicia el juego"
        # durante 15 a 60 s (log del 10-10). Mientras carga se sigue en
        # "esperando el juego"; plugin ausente o juego elevado se dicen ya.
        if detalle in (None, DETAIL_NOT_LOADED) and time.time() - _juego_visto_desde < GAME_LOADING_GRACE_S:
            state.status_detail = None
            return "waiting_game"
        state.status_detail = detalle
        return "plugin_missing"
    _juego_visto_desde = None
    state.status_detail = None
    if state.installs and not state.any_plugin_installed():
        return "plugin_not_installed"
    return "waiting_game"


_diagnosed_dirs = set()

DETAIL_PLUGIN_ABSENT = "The running game ({bin_dir}) has no telemetry plugin. Open Setup & status and click Install plugin for that folder, then restart the game."
DETAIL_ELEVATED = "The game is running as administrator, so Truck Dash can't read its telemetry. Run the game normally (not as admin), or run TruckDash as administrator too."
DETAIL_NOT_LOADED = "The plugin file is in place but the game hasn't loaded it: restart the game, and click OK on the in-game 'Advanced SDK features' dialog the first time."


def diagnose_running_game(hwnd) -> str | None:
    try:
        info = client_lib.running_game_info(hwnd)
    except Exception:
        logging.exception("running_game_info failed")
        return None
    if not info or not info.get("exe_path"):
        return None
    # Solo el juego de verdad: con la busqueda por titulo, Chrome o el
    # Explorador terminaban en extra_game_dirs como "carpeta del juego sin
    # plugin" (log del 10-10). Con ventana de otro .exe no hay diagnostico.
    import window_compat
    if sys.platform == "win32" and os.path.basename(info["exe_path"]).lower() not in window_compat.GAME_EXES:
        return None
    bin_dir = os.path.normpath(os.path.dirname(info["exe_path"]))
    if (plugin_installer.plugin_state(bin_dir) == "missing"
            and not plugin_installer.has_other_plugin(bin_dir)):
        # Copia del juego distinta a las detectadas por Steam (Epic, otra
        # biblioteca, carpeta movida): se suma a la lista de Setup para que el
        # boton "Install plugin" apunte a ESTA.
        if bin_dir not in _diagnosed_dirs:
            _diagnosed_dirs.add(bin_dir)
            settings = win_integration.load_settings()
            extra = settings.setdefault("extra_game_dirs", [])
            # same_dir y no comparacion de texto: la misma carpeta llega
            # escrita distinto segun de donde salga (ruta del proceso, Steam,
            # una junction), y comparando cadenas se agregaba igual y
            # aparecia una segunda vez en Setup.
            ya_esta = any(plugin_installer.same_dir(x, bin_dir) for x in extra) \
                or any(plugin_installer.same_dir(i["bin_dir"], bin_dir) for i in state.installs)
            if not ya_esta:
                extra.append(bin_dir)
                win_integration.save_settings(settings)
                state.refresh_installs()
            logging.info("Game running from %s without the plugin", bin_dir)
        return DETAIL_PLUGIN_ABSENT.format(bin_dir=bin_dir)
    if info.get("elevated_guess"):
        return DETAIL_ELEVATED
    return DETAIL_NOT_LOADED


def status_message() -> str:
    return json.dumps({
        "type": "client_status",
        "status": state.status,
        "game": state.game,
        "clientVersion": client_lib.CLIENT_VERSION,
        "detail": state.status_detail,
        "mapMods": state.map_mods,
        "activeMods": state.active_mods,
        "mapDlcs": state.map_dlcs,
        # Mapas armados en esta PC que coinciden con los mods activos. La web
        # los lee de /localmap/ del servidor local: en modo LAN del mismo
        # origen, y con el codigo de emparejamiento desde 127.0.0.1 (solo
        # sirve en esta misma PC; en otro dispositivo sigue con el de R2).
        "localMaps": local_maps_summary(),
        "localMapPort": local_server.HTTP_PORT if (state.local and not state.local.error) else None,
        # Con el overlay prendido la web manda el giro y lo que falta
        # ({"type": "nav_hud"}); apagado no manda nada.
        "overlay": state.overlay.enabled,
    })


def local_maps_summary() -> dict:
    return {g: {k: m.get(k) for k in ("variant", "fingerprint", "built", "cities", "mods")}
            for g, m in state.local_maps.items()}


def refresh_map_mods(force: bool = False) -> bool:
    """Relee game.log.txt (cada 10 s como mucho: es chico) para saber que
    mods de mapa tiene activos el perfil cargado. Devuelve True si cambio."""
    now = time.time()
    if not force and now - state.map_mods_read_at < 10:
        return False
    state.map_mods_read_at = now
    try:
        mods = client_lib.read_map_mods()
    except Exception:
        logging.exception("read_map_mods failed")
        return False
    try:
        nombres = client_lib.read_active_mod_names()
    except Exception:
        logging.exception("read_active_mod_names failed")
        nombres = state.active_mods
    cambio_nombres = nombres != state.active_mods
    state.active_mods = nombres
    try:
        state.mounted_mods = client_lib.read_mounted_mods()
    except Exception:
        logging.exception("read_mounted_mods failed")
    cambio_nombres = refresh_local_maps() or cambio_nombres
    if mods != state.map_mods:
        state.map_mods = mods
        logging.info("Map mods detected: %s", mods)
        # Si cambiaron los mods de un juego (no el None de mientras carga), el
        # "fuera del mapa" que habia dicho la web era de otro mapa: Setup
        # seguia ofreciendo "Build my map" toda la sesion (usuario del 10-10,
        # con un aviso que ademas era falso).
        for game, valor in (mods or {}).items():
            if valor is not None and valor != state.last_known_mods.get(game):
                if game in state.last_known_mods:
                    state.offmap_games.discard(game)
                state.last_known_mods[game] = valor
        # Para etiquetar la sesion y el viaje de la cuenta con los mods. Con
        # el None de mientras carga el juego se mantienen los ultimos: la
        # sesion salia sin mapa (auditoria del 10-10).
        if getattr(state, "cuenta", None) is not None:
            sostenidos = {g: (v if v is not None else state.last_known_mods.get(g)) for g, v in (mods or {}).items()}
            state.cuenta.poner_mods(sostenidos if mods is not None else mods)
        return True
    return cambio_nombres


# ---------------------------------------------------------------------------
# Mapa armado en la PC ("Build my map", ver map_builder.py)
# ---------------------------------------------------------------------------

def game_dir_for(game: str) -> str | None:
    """Carpeta del juego (la de los .scs) a partir de bin/win_x64."""
    for install in state.installs:
        if install.get("game") == game:
            return os.path.dirname(os.path.dirname(install["bin_dir"]))
    return None


def refresh_local_maps() -> bool:
    """Que mapa armado sirve para los mods activos ahora (huella igual). Le
    dice al servidor local que carpeta servir. Devuelve True si cambio."""
    nuevos = {}
    for game, rutas in (state.mounted_mods or {}).items():
        carpeta = game_dir_for(game)
        if not rutas or not carpeta:
            continue
        try:
            man = map_builder.built_map(game, map_builder.fingerprint(game, carpeta, rutas))
        except Exception:
            logging.exception("built_map failed")
            man = None
        if man:
            nuevos[game] = man
    cambio = {g: m.get("fingerprint") for g, m in nuevos.items()} != \
        {g: m.get("fingerprint") for g, m in state.local_maps.items()}
    state.local_maps = nuevos
    local_server.local_map_dirs.clear()
    local_server.local_map_dirs.update({g: m["dir"] for g, m in nuevos.items()})
    if cambio:
        logging.info("Local maps in use: %s", {g: m.get("fingerprint") for g, m in nuevos.items()} or "none")
    return cambio


def needs_map_build(game: str) -> bool:
    """Se ofrece armar el mapa si la web vio el camion fuera del mapa, hay
    mods activos y no hay ya un mapa armado para ellos."""
    return (game in state.offmap_games and game not in state.local_maps
            and bool((state.mounted_mods or {}).get(game)) and game_dir_for(game) is not None)


def on_offmap(game: str):
    """La web avisa que el camion quedo fuera del mapa que conoce."""
    if game in state.offmap_games:
        return
    state.offmap_games.add(game)
    logging.info("Dashboard reports the truck off the known %s map", game)
    if needs_map_build(game) and game not in state.offmap_notified and state.icon:
        state.offmap_notified.add(game)
        try:
            state.icon.notify(T("notify_local_map"), "Truck Dash")
        except Exception as exc:
            logging.info("No se pudo mostrar el aviso del mapa: %s", exc)


def start_map_build(game: str) -> bool:
    """Arma el mapa en un hilo. False si ya hay uno en curso."""
    if state.map_build and state.map_build.get("running"):
        return False
    rutas = list((state.mounted_mods or {}).get(game) or [])
    carpeta = game_dir_for(game)
    nombres = list((state.active_mods or {}).get(game) or [])
    state.map_build_cancel.clear()
    state.map_build = {"game": game, "step": "download", "error": None, "running": True}

    def paso(nombre):
        state.map_build["step"] = nombre

    def correr():
        try:
            map_builder.build_map(game, carpeta, rutas, client_lib.CLIENT_VERSION, progress=paso,
                                  cancel=state.map_build_cancel, mod_names=nombres)
            refresh_local_maps()
            state.map_build = {"game": game, "step": "done", "error": None, "running": False}
        except map_builder.BuildCancelled:
            logging.info("Map build cancelled")
            state.map_build = {"game": game, "step": "cancelled", "error": None, "running": False}
        except Exception as exc:
            logging.exception("Map build failed")
            state.map_build = {"game": game, "step": "error", "error": str(exc), "running": False}

    threading.Thread(target=vigilar_hilo(correr, "map build"), daemon=True).start()
    return True


def vigilar_hilo(funcion, nombre):
    """Que una excepcion en un hilo deje rastro en el log."""
    def envuelta():
        try:
            funcion()
        except Exception:
            logging.exception("Thread %s died", nombre)
    return envuelta


class CloudLink:
    """Conexion al backend (relay). Reconecta sola; expone send() que
    descarta en silencio si no hay conexion en ese momento."""

    def __init__(self, backend_url: str, code: str, keybinds: dict):
        self.url = f"{backend_url}/ws/client/{code}"
        self.keybinds = keybinds
        self.ws = None

    async def send(self, text: str):
        ws = self.ws
        if ws is None:
            return
        try:
            await ws.send(text)
        except Exception:
            pass

    async def run(self):
        import websockets

        # Una sola ruta por link: lo que aprendio (proxy o directo) sirve
        # para los reintentos siguientes.
        ruta = red.Ruta(self.url)
        while True:
            conecto = False
            try:
                async with websockets.connect(self.url, **ruta.opciones()) as ws:
                    conecto = True
                    self.ws = ws
                    state.set_cloud("connected")
                    logging.info("Connected to backend")
                    await ws.send(status_message())
                    await client_lib.receive_commands(ws, self.keybinds)
            except (websockets.ConnectionClosed, OSError) as exc:
                logging.warning("Backend connection lost: %s", exc)
            except Exception:
                logging.exception("Unexpected error in backend link")
            finally:
                self.ws = None
                if not conecto:
                    ruta.fallo_al_conectar()
            state.set_cloud("reconnecting")
            await asyncio.sleep(client_lib.RECONNECT_DELAY_SECONDS)


async def telemetry_loop(cloud: CloudLink, local: local_server.LocalServer):
    """Lee el SDK a 1 Hz y publica cada payload por los dos caminos (cloud y
    LAN). Independiente de si el backend esta accesible: sin internet, el
    modo LAN sigue andando."""
    import telemetry_compat

    telemetry_ready = False
    inactive_since = None
    last_status_sent = None
    last_cloud_send = 0.0

    async def publish_status():
        nonlocal last_status_sent
        refresh_map_mods()
        key = (state.status, state.status_detail, json.dumps(state.map_mods, sort_keys=True),
               json.dumps(state.active_mods, sort_keys=True), json.dumps(state.map_dlcs, sort_keys=True),
               json.dumps(local_maps_summary(), sort_keys=True), state.overlay.enabled)
        if key != last_status_sent:
            last_status_sent = key
            msg = status_message()
            await cloud.send(msg)
            await local.broadcast(msg, is_status=True)

    sin_memoria_desde = None
    ultimo_render, render_cambio_en, avisado_congelado = None, time.time(), False

    while True:
        if not telemetry_ready:
            try:
                telemetry_compat.init()
                client_lib.reset_event_state()
                telemetry_ready = True
                logging.info("Telemetry opened: %s", telemetry_compat.opened_block())
            except Exception:
                new_status = telemetry_status_when_unavailable()
                if new_status != state.status:
                    logging.info("Telemetry unavailable: %s", new_status)
                state.set_status(new_status)
                # Con el juego cerrado: al arrancar sin juego y cada vez que
                # se cierra (la memoria compartida se va y se cae aca).
                if new_status == "waiting_game":
                    actualizar_plugins_viejos()
                await publish_status()

                # El juego se fue de verdad: cuando se cierra, el plugin
                # desmapea la memoria compartida y init() deja de funcionar.
                # Mientras init() ande, el juego esta ahi aunque estemos en un
                # menu y aunque la ventana no se encuentre.
                if sin_memoria_desde is None:
                    sin_memoria_desde = time.time()
                if debe_cerrarse(state.vio_el_juego,
                                 win_integration.quit_on_game_close_enabled(),
                                 sin_memoria_desde, time.time()):
                    logging.info("El juego se cerro (la memoria compartida no esta "
                                 "hace %ss) y esta activo el cierre automatico: "
                                 "saliendo para soltar el prefijo", GRACIA_CIERRE)
                    apagar()
                    return
                await asyncio.sleep(client_lib.RECONNECT_DELAY_SECONDS)
                continue
            sin_memoria_desde = None
            state.vio_el_juego = True

        try:
            raw = telemetry_compat.get_data()
        except Exception:
            logging.exception("get_data() failed, re-initializing telemetry")
            telemetry_ready = False
            await asyncio.sleep(client_lib.RECONNECT_DELAY_SECONDS)
            continue

        # El plugin solo pone sdkActive en false cuando el juego se cierra
        # bien: si crashea o se cuelga, el ultimo cuadro queda en la memoria
        # con el camion andando y se seguian sumando horas de manejo a la
        # cuenta (log del 09-10: viaje clavado en 727 km con las horas
        # subiendo). renderTime avanza en cada frame, incluso en pausa: si no
        # cambia en FROZEN_FRAME_SECONDS, el cuadro es viejo. Sin el campo
        # (otra version del plugin) no se aplica.
        render = raw.get("renderTime")
        if render is None or render != ultimo_render:
            ultimo_render, render_cambio_en = render, time.time()
        congelado = render is not None and time.time() - render_cambio_en > FROZEN_FRAME_SECONDS
        if congelado and not avisado_congelado:
            logging.info("El juego no manda frames hace %d s: se toma como cerrado o colgado", FROZEN_FRAME_SECONDS)
        avisado_congelado = congelado

        if raw.get("sdkActive") and not congelado:
            inactive_since = None
            client_lib.update_job_snapshot(raw)
            payload = client_lib.build_payload(raw)
            client_lib.attach_job_snapshot_if_finished(payload, raw)
            state.overlay_data.telemetria(payload)
            game = payload.get("game")
            vehiculo = " ".join(p for p in (payload.get("truckBrand"), payload.get("truckName")) if p) or None
            if state.set_status("live", game, vehiculo):
                open_web_ui()  # en modo autostart, recien aca (juego detectado) se abre el navegador
            state.discord.update(payload)
            # La cuenta se alimenta del MISMO payload que va al tablero, no
            # del bloque crudo: si se calcularan de fuentes distintas,
            # terminarian mostrando dos numeros para el mismo viaje.
            state.cuenta.tick(payload, raw)
            text = json.dumps(payload)
            now_send = time.time()
            if now_send - last_cloud_send >= client_lib.CLOUD_SEND_INTERVAL_SECONDS or client_lib.payload_has_event(payload):
                last_cloud_send = now_send
                await cloud.send(text)
            await local.broadcast(text)
        else:
            # Sin frame real del juego: en el menu, o el juego se cerro (la
            # memoria compartida sobrevive mientras tengamos el handle). Si la
            # ventana del juego ya no existe, se cierra el handle para volver
            # a "esperando el juego".
            if inactive_since is None:
                inactive_since = time.time()
            if time.time() - inactive_since > 5 and not client_lib.find_game_window():
                telemetry_compat.deinit()
                telemetry_ready = False
                inactive_since = None
                state.set_status("waiting_game")
                state.discord.update(None)
                # Se cerro el juego: la sesion de manejo termino. El viaje
                # no se cierra, porque cerrar el juego no entrega nada: el
                # servidor lo dara por abandonado si nunca vuelve.
                state.cuenta.cerrar_sesion()
                # OJO: aca NO se cierra la aplicacion. Que sdkActive este en
                # falso y que no se encuentre la ventana significa "no hay
                # frame del juego ahora mismo", que pasa en un menu, en pausa
                # o con el camion parado en una estacion. Bajo gamescope la
                # ventana ademas no se encuentra nunca. Cerrarse aca dejaba
                # sin cliente a alguien que estaba jugando.
                # El cierre real se decide mas abajo, cuando la memoria
                # compartida desaparece: eso solo pasa si el juego se fue.
            else:
                state.set_status("waiting_truck")
        await publish_status()
        await asyncio.sleep(client_lib.SEND_INTERVAL_SECONDS)


async def run_client(backend_url: str, fixed_code: str | None):
    logging.info("Starting client v%s, backend=%s", client_lib.CLIENT_VERSION, backend_url)
    state.cloud_viewers = None  # codigo nuevo = sesion nueva del relay
    state.refresh_installs()
    keybinds = client_lib.load_keybinds()

    # El servidor LAN arranca primero y no depende del backend: sin internet
    # el dashboard sigue disponible en la red local. Una sola instancia: si
    # run_client se relanza (Disconnect -> codigo nuevo) se reusa la que ya
    # tiene los puertos tomados.
    if state.local is None:
        state.local = local_server.LocalServer(keybinds)
        asyncio.create_task(state.local.start())
        threading.Thread(target=win_integration.detectar_red_publica,
                         args=(local_server.lan_ip(),), daemon=True).start()
    local = state.local
    local.keybinds = keybinds

    # Placeholder sin conexion hasta tener codigo: telemetry_loop publica por
    # LAN igual y descarta el envio cloud mientras tanto.
    cloud = CloudLink(backend_url, "", keybinds)
    telemetry_task = vigilar(asyncio.create_task(telemetry_loop(cloud, local)), "telemetria")
    # Vacia la cola de la cuenta cada tanto. Aparte del bucle de
    # telemetria a proposito: que la API este caida no puede frenar
    # el tablero.
    cuenta_task = vigilar(asyncio.create_task(account_sync.bucle(state.cuenta)), "cuenta")

    # El mismo codigo de siempre si ya hay uno guardado: el link del celular
    # sigue funcionando entre arranques (ver win_integration.saved_pairing_code).
    code = fixed_code or win_integration.saved_pairing_code()
    while code is None:
        state.set_cloud("connecting")
        try:
            code = await asyncio.to_thread(client_lib.request_pairing_code, backend_url)
            win_integration.save_pairing_code(code)
        except Exception:
            logging.exception("Failed to get pairing code")
            state.set_cloud("offline")
            await asyncio.sleep(10)
    state.set_code(code)
    logging.info("Got pairing code %s", code)
    if not state.autostart_mode:
        # Un momento, para que el relay diga si ya hay un tablero conectado.
        asyncio.create_task(abrir_tablero_al_arrancar())
    asyncio.create_task(asyncio.to_thread(check_for_update_silent, backend_url))
    vigilar(asyncio.create_task(vigilar_interruptor(backend_url)), "interruptor de cuentas")

    cloud.url = f"{backend_url}/ws/client/{code}"
    try:
        await cloud.run()
    finally:
        telemetry_task.cancel()
        cuenta_task.cancel()


_loop: asyncio.AbstractEventLoop | None = None
_client_task: asyncio.Task | None = None


def _start_client_task(backend_url: str, fixed_code: str | None):
    global _client_task
    _client_task = _loop.create_task(run_client(backend_url, fixed_code))


def start_asyncio_thread(backend_url: str, fixed_code: str | None):
    def runner():
        global _loop
        _loop = asyncio.new_event_loop()
        asyncio.set_event_loop(_loop)
        _start_client_task(backend_url, fixed_code)
        _loop.run_forever()

    thread = threading.Thread(target=runner, daemon=True)
    thread.start()


def rotate_pairing_code() -> bool:
    """Tira el codigo actual y pide uno nuevo sin reiniciar el programa. Desde
    1.5.9 el codigo se guarda y se reusa, asi que hay que olvidarlo primero:
    si no, "pedir codigo nuevo" devolvia el mismo de siempre y los links
    viejos seguian funcionando."""
    global _browser_opened
    if _loop is None:
        return False
    logging.info("Rotando el codigo de pairing")
    win_integration.forget_pairing_code()

    def _do():
        global _browser_opened
        if _client_task:
            _client_task.cancel()
        state.set_code(None)
        state.set_cloud("connecting")
        _browser_opened = False
        _start_client_task(state.backend_url, None)

    _loop.call_soon_threadsafe(_do)
    return True


def disconnect_session(icon, item):
    rotate_pairing_code()


def _focus_running_instance() -> bool:
    """Le pide a la instancia que ya esta corriendo que muestre su ventana de
    Setup (ver /__show-setup en local_server). Si no contesta -version vieja,
    modo LAN caido- devuelve False y se avisa con un cartel."""
    try:
        with urlopen(f"http://127.0.0.1:{local_server.HTTP_PORT}/__show-setup", timeout=3) as resp:
            return resp.status in (200, 204)
    except Exception:
        return False


def _message_box(text: str) -> None:
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(None, text, "Truck Dash", 0x40)  # MB_ICONINFORMATION
    except Exception:
        logging.info(text)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", default="wss://truck-companion-production.up.railway.app")
    parser.add_argument("--code", default=None)
    parser.add_argument("--web-url", default=DEFAULT_WEB_URL, help="Web URL to open (for local development)")
    parser.add_argument("--autostart", action="store_true", help="Launched by Windows startup: no setup window, browser opens when the game starts")
    parser.add_argument("--apply-update", default=None, help=argparse.SUPPRESS)
    parser.add_argument("--finish-update", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--target", default=None, help=argparse.SUPPRESS)
    parser.add_argument("--wait-pid", type=int, default=None, help=argparse.SUPPRESS)
    parser.add_argument("--relaunch", action="store_true", help=argparse.SUPPRESS)  # relanzado por la instancia anterior: esperar a que suelte el mutex  # URL de un zip: aplica la actualizacion y relanza (para probar el flujo real)
    args = parser.parse_args()
    # El idioma elegido en Setup, antes de escribir cualquier texto.
    i18n.set_language(win_integration.load_settings().get("language"))

    # Modo ayudante: lo lanza la version vieja y lo unico que hace es esperar
    # a que muera, pisarla y arrancar la nueva. Va antes que todo lo demas, y
    # sobre todo antes del mutex de instancia unica: no es una instancia.
    if args.finish_update:
        relaunch = [win_integration.AUTOSTART_FLAG] if args.autostart else None
        return win_integration.finish_update(args.target, args.wait_pid, relaunch)

    if args.apply_update:
        logging.info("Applying update from %s (test flag)", args.apply_update)
        staged = win_integration.stage_update(args.apply_update, None, progress=lambda k: logging.info("update: %s", k))
        win_integration.start_updater(staged)
        win_integration.stop_and_exit()
        return

    # Issue #4: una sola instancia. Un segundo doble clic trae al frente la
    # ventana de la que ya esta corriendo, que es lo que espera cualquiera.
    if not win_integration.acquire_single_instance(wait_seconds=12.0 if args.relaunch else 0.0):
        logging.info("Ya hay una instancia corriendo, se le pide que muestre la ventana")
        if not _focus_running_instance():
            _message_box(T("already_running"))
        return

    local_server.on_show_setup = open_setup_window
    client_lib.on_offmap = on_offmap
    client_lib.on_nav_hud = state.overlay_data.navegacion
    client_lib.on_viewers = lambda n: setattr(state, "cloud_viewers", n)
    ajustes_overlay = win_integration.overlay_settings()
    state.overlay_layout = (ajustes_overlay["corner"], ajustes_overlay["size"], ajustes_overlay["items"],
                            ajustes_overlay["pos"])
    if ajustes_overlay["enabled"]:
        state.overlay.set_enabled(True)
    if win_integration.overlay_supported():
        state.overlay_tecla.poner(ajustes_overlay["hotkey"])
    state.discord.set_enabled(bool(win_integration.load_settings().get("discord_presence")))
    win_integration.cleanup_old_exe()
    state.web_url = args.web_url
    state.backend_url = args.backend
    state.autostart_mode = args.autostart

    start_asyncio_thread(args.backend, args.code)

    settings = win_integration.load_settings()
    if not settings.get("first_run_done") and not args.autostart:
        settings["first_run_done"] = True
        win_integration.save_settings(settings)
        open_setup_window()

    if pystray is None:
        # Sin bandeja se sigue igual: la ventana de Setup pasa a ser la
        # interfaz principal y el codigo de pairing se ve ahi. En modo
        # autostart no hay ventana que mostrar, asi que solo se espera.
        logging.warning(f"Sin bandeja del sistema ({PYSTRAY_ERROR}); se sigue sin icono.")
        if args.autostart:
            threading.Event().wait()
        else:
            SetupWindow().run()
        sys.exit(0)

    menu_items = [
        pystray.MenuItem(texto_menu("menu_setup"), open_setup_window, default=True),
        pystray.MenuItem(texto_menu("menu_open_dashboard"), open_web_menu_item),
        pystray.MenuItem(texto_menu("menu_account"), open_account_menu_item,
                         visible=lambda item: cuentas_visibles()),
        pystray.MenuItem(texto_menu("menu_show_code"), show_code_notification),
        pystray.MenuItem(texto_menu("menu_lan"), show_lan_menu_item),
        pystray.MenuItem(texto_menu("menu_overlay"), toggle_overlay_menu_item,
                         checked=lambda item: state.overlay.enabled,
                         visible=win_integration.overlay_supported()),
        pystray.MenuItem(texto_menu("menu_disconnect"), disconnect_session),
        pystray.MenuItem(texto_menu("menu_autostart"), toggle_autostart_menu_item, checked=lambda item: win_integration.is_autostart_enabled(), enabled=lambda item: win_integration.exe_path() is not None),
        pystray.MenuItem(texto_menu("menu_check_updates"), check_for_update_menu_item),
        pystray.MenuItem(texto_menu("menu_show_log"), show_log_location),
        pystray.MenuItem(texto_menu("menu_report"), report_problem),
    ]
    if DONATE_URL:
        menu_items.append(pystray.MenuItem(texto_menu("menu_support"), open_donate))
    menu_items.append(pystray.MenuItem(texto_menu("menu_quit"), quit_app))
    icon = pystray.Icon("truck-dash", make_icon_image(), "Truck Dash", pystray.Menu(*menu_items))
    state.icon = icon

    def _al_mostrar_el_icono(ic):
        # pystray pide hacerlo visible a mano cuando se le pasa setup.
        ic.visible = True
        # El aviso espera unos segundos: recien arrancado Windows lo pierde.
        threading.Timer(8, lambda: anunciar_cuentas(ic)).start()

    icon.run(setup=_al_mostrar_el_icono)
    sys.exit(0)


if __name__ == "__main__":
    main()

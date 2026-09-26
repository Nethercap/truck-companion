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
import webbrowser
from urllib.request import urlopen

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
import account
import plugin_installer
import win_integration
from i18n import T

# En modo --windowed (sin consola) PyInstaller deja sys.stdout/stderr en None,
# no solo silenciados. Cualquier print() o log interno revienta con
# AttributeError al escribir en None. Se redirigen a un sumidero inofensivo.
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")

DEFAULT_WEB_URL = "https://trucksim-dash.com/app/"
DONATE_URL = ""  # Ko-fi / GitHub Sponsors - vacio hasta tener uno (el item del menu no aparece)

LOG_PATH = os.path.join(win_integration.base_dir(), "truckdash.log")
logging.basicConfig(filename=LOG_PATH, level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

GAME_LABELS = {"ats": "American Truck Simulator", "ets2": "Euro Truck Simulator 2"}

# Estados del cliente - el mismo string viaja a la web (mensaje client_status)
# para que el dashboard pueda decir "el cliente esta conectado pero el juego
# no esta abierto" en vez de un generico "waiting for telemetry".
STATUS_KEYS = ("starting", "waiting_game", "plugin_not_installed", "plugin_missing", "waiting_truck", "live")
CLOUD_KEYS = ("connecting", "connected", "offline", "reconnecting")


class AppState:
    def __init__(self):
        self.status = "starting"  # estado de la telemetria (ver STATUS_TEXT)
        # Si el juego estuvo abierto en esta corrida. Sin esto, el cierre
        # automatico apagaria el cliente al minuto de arrancarlo con el juego
        # todavia cerrado, que es justo lo que hace quien lo deja en el inicio
        # de Windows.
        self.vio_el_juego = False
        self.status_detail: str | None = None  # diagnostico fino (ingles) cuando status == plugin_missing
        self.map_mods: dict | None = None  # {'ets2': {promods,..}|None, 'ats': {...}|None} leido de game.log.txt
        self.map_mods_read_at = 0.0
        self.cloud = "connecting"  # estado de la conexion al backend (ver CLOUD_TEXT)
        self.game = None
        self.code = None
        self.icon = None
        self.backend_url = None
        self.web_url = DEFAULT_WEB_URL
        self.autostart_mode = False  # lanzado por el inicio automatico de Windows
        self.update_available = None  # (version, download_url, sha256) o None
        self.installs = []  # ver plugin_installer.find_game_installs()
        self.local: local_server.LocalServer | None = None  # modo LAN (ver local_server.py)
        # Rich Presence de Discord: se prende desde Ajustes, apagado por defecto.
        self.discord = discord_presence.DiscordPresence()

    def status_text(self) -> str:
        text = T(f"status_{self.status}") if self.status in STATUS_KEYS else self.status
        if self.status == "live" and self.game:
            text = T("status_live_playing", game=GAME_LABELS.get(self.game, self.game))
        cloud = T(f"cloud_{self.cloud}") if self.cloud in CLOUD_KEYS else self.cloud
        return f"{text} ({cloud})"

    def refresh_title(self):
        if self.icon:
            code_part = f" - code {self.code}" if self.code else ""
            self.icon.title = f"Truck Dash{code_part} - {self.status_text()}"

    def set_status(self, status: str, game: str | None = None):
        changed = status != self.status or game != self.game
        self.status = status
        self.game = game
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
        return self.installs

    def any_plugin_installed(self) -> bool:
        return any(i["state"] in ("installed", "outdated") for i in self.installs)


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
        SetupWindow().run()
    except Exception:
        logging.exception("Setup window crashed")
    finally:
        with _setup_window_lock:
            _setup_window_open = False


class SetupWindow:
    def __init__(self):
        self.root = tk.Tk()
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
        self.build()
        self._bombear_cola()

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
        frame = tk.Frame(self.root, bg=BG, padx=16, pady=8)
        frame.pack(fill="x")
        self.label(frame, title, fg=ORANGE, font=("Segoe UI", 10, "bold")).pack(anchor="w")
        return frame

    def build(self):
        header = tk.Frame(self.root, bg=BG, padx=16, pady=12)
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

        # --- Opciones ---
        options = self.section(T("sec_options"))
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

        # --- Cuenta ---
        # Opcional a proposito: todo el cliente funciona sin vincular nada, y
        # esto solo agrega que los viajes queden guardados.
        cuenta = self.section(T("sec_account"))
        self.account_label = self.label(cuenta, "", wraplength=520)
        self.account_label.pack(anchor="w")
        fila_cuenta = tk.Frame(cuenta, bg=BG)
        fila_cuenta.pack(anchor="w", pady=(6, 0))
        self.account_button = self.button(fila_cuenta, T("account_link"),
                                          self.link_account, primary=True)
        self.account_button.pack(side="left")
        self.account_code = self.label(fila_cuenta, "", font=("Consolas", 16, "bold"),
                                       fg=BLUE)
        self.account_code.pack(side="left", padx=12)
        self.refresh_account()

        # --- Update ---
        self.update_frame = tk.Frame(self.root, bg="#1f2a3a", padx=16, pady=8)
        self.update_label = self.label(self.update_frame, "", bg="#1f2a3a", wraplength=400)
        self.update_label.pack(side="left")
        self.update_button = self.button(self.update_frame, T("update_now"), self.do_update, primary=True)
        self.update_button.pack(side="right")

        footer = tk.Frame(self.root, bg=BG, padx=16, pady=12)
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
            self.account_code.configure(text="")
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
                self.account_code.configure(text=pedido["code"])
                self.account_label.configure(text=T("account_enter_code", url=pedido["url"]))
                webbrowser.open(pedido["url"])
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
                    self.account_code.configure(text=""),
                    self.flash(T("account_ok"), GREEN),
                    self.refresh_account()))
                return
            if estado == "vencido":
                break
        self.en_ventana(lambda: (
            self.account_code.configure(text=""),
            self.account_label.configure(text=T("account_expired")),
            self.account_button.configure(state="normal")))

    def toggle_quit_on_game_close(self):
        win_integration.set_quit_on_game_close(self.quit_var.get())

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
            self._qr_photo = ImageTk.PhotoImage(img)
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
            webbrowser.open(f"http://127.0.0.1:{local_server.HTTP_PORT}/app/?local=1")

    def open_dashboard(self):
        url = build_web_url()
        if url:
            webbrowser.open(url)

    def check_updates(self):
        def _run():
            latest, url, sha = check_for_update(state.backend_url or "")
            if latest:
                state.update_available = (latest, url, sha)
            else:
                self.root.after(0, lambda: self.flash(T("up_to_date", v=client_lib.CLIENT_VERSION), GREEN))
        threading.Thread(target=_run, daemon=True).start()

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
        lan_url = state.local.url if (state.local and state.local.web_ready and not state.local.error) else None
        if getattr(self, "_last_lan_url", "?") != lan_url:
            self._last_lan_url = lan_url
            self.render_lan()
        if state.update_available:
            version = state.update_available[0]
            if not self.update_frame.winfo_ismapped():
                self.update_label.configure(text=T("update_available", new=version, cur=client_lib.CLIENT_VERSION))
                self.update_frame.pack(fill="x", before=self.root.winfo_children()[-1])
        try:
            self.root.after(500, self.refresh_status)
        except tk.TclError:
            pass

    def run(self):
        self.root.mainloop()


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
    state.discord.close()
    icono = state.icon
    win_integration.stop_and_exit(icono.stop if icono is not None else None)


def quit_app(icon, item):
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
        with urlopen(url, timeout=10) as resp:
            data = json.loads(resp.read())
        latest = data.get("latest_client_version")
        if latest and client_lib.is_newer_version(latest, client_lib.CLIENT_VERSION):
            return latest, data.get("download_url"), data.get("sha256")
    except Exception:
        logging.exception("Failed to check for updates")
    return None, None, None


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
    webbrowser.open(f"https://github.com/Nethercap/truck-companion/issues/new?{query}")


def toggle_autostart_menu_item(icon, item):
    if not win_integration.is_autostart_enabled() and win_integration.in_temp_location():
        show_text_dialog("Truck Dash", T("autostart_temp_folder"))
        return
    win_integration.set_autostart(not win_integration.is_autostart_enabled())


def open_donate(icon, item):
    webbrowser.open(DONATE_URL)


# ---------------------------------------------------------------------------
# Loop principal: backend + telemetria
# ---------------------------------------------------------------------------

def telemetry_status_when_unavailable() -> str:
    """Por que no hay telemetria: el juego no esta abierto, o esta abierto
    pero el plugin no carga. En ese caso se mira el proceso que corre para
    decir CUAL es el problema (state.status_detail, que viaja a la web):
    plugin ausente en esa copia del juego, juego elevado, o plugin presente
    pero no cargado (falta reiniciar / aceptar el dialogo del SDK)."""
    hwnd = client_lib.find_game_window()
    if hwnd:
        state.status_detail = diagnose_running_game(hwnd)
        return "plugin_missing"
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
    bin_dir = os.path.normpath(os.path.dirname(info["exe_path"]))
    if plugin_installer.plugin_state(bin_dir) == "missing":
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
    })


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
    if mods != state.map_mods:
        state.map_mods = mods
        logging.info("Map mods detected: %s", mods)
        return True
    return False


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

        while True:
            try:
                async with websockets.connect(self.url) as ws:
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
            state.set_cloud("reconnecting")
            await asyncio.sleep(client_lib.RECONNECT_DELAY_SECONDS)


async def telemetry_loop(cloud: CloudLink, local: local_server.LocalServer):
    """Lee el SDK a 1 Hz y publica cada payload por los dos caminos (cloud y
    LAN). Independiente de si el backend esta accesible: sin internet, el
    modo LAN sigue andando."""
    import truck_telemetry

    telemetry_ready = False
    inactive_since = None
    last_status_sent = None
    last_cloud_send = 0.0

    async def publish_status():
        nonlocal last_status_sent
        refresh_map_mods()
        key = (state.status, state.status_detail, json.dumps(state.map_mods, sort_keys=True))
        if key != last_status_sent:
            last_status_sent = key
            msg = status_message()
            await cloud.send(msg)
            await local.broadcast(msg, is_status=True)

    sin_memoria_desde = None

    while True:
        if not telemetry_ready:
            try:
                truck_telemetry.init()
                telemetry_ready = True
                logging.info("truck_telemetry.init() succeeded")
            except Exception:
                new_status = telemetry_status_when_unavailable()
                if new_status != state.status:
                    logging.info("Telemetry unavailable: %s", new_status)
                state.set_status(new_status)
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
            raw = truck_telemetry.get_data()
        except Exception:
            logging.exception("get_data() failed, re-initializing telemetry")
            telemetry_ready = False
            await asyncio.sleep(client_lib.RECONNECT_DELAY_SECONDS)
            continue

        if raw.get("sdkActive"):
            inactive_since = None
            client_lib.update_job_snapshot(raw)
            payload = client_lib.build_payload(raw)
            client_lib.attach_job_snapshot_if_finished(payload, raw)
            game = payload.get("game")
            if state.set_status("live", game):
                open_web_ui()  # en modo autostart, recien aca (juego detectado) se abre el navegador
            state.discord.update(payload)
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
                truck_telemetry.deinit()
                telemetry_ready = False
                inactive_since = None
                state.set_status("waiting_game")
                state.discord.update(None)
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
    state.refresh_installs()
    keybinds = client_lib.load_keybinds()

    # El servidor LAN arranca primero y no depende del backend: sin internet
    # el dashboard sigue disponible en la red local. Una sola instancia: si
    # run_client se relanza (Disconnect -> codigo nuevo) se reusa la que ya
    # tiene los puertos tomados.
    if state.local is None:
        state.local = local_server.LocalServer(keybinds)
        asyncio.create_task(state.local.start())
    local = state.local
    local.keybinds = keybinds

    # Placeholder sin conexion hasta tener codigo: telemetry_loop publica por
    # LAN igual y descarta el envio cloud mientras tanto.
    cloud = CloudLink(backend_url, "", keybinds)
    telemetry_task = asyncio.create_task(telemetry_loop(cloud, local))

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
        open_web_ui()
    asyncio.create_task(asyncio.to_thread(check_for_update_silent, backend_url))

    cloud.url = f"{backend_url}/ws/client/{code}"
    try:
        await cloud.run()
    finally:
        telemetry_task.cancel()


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
        pystray.MenuItem(T("menu_setup"), open_setup_window, default=True),
        pystray.MenuItem(T("menu_open_dashboard"), open_web_menu_item),
        pystray.MenuItem(T("menu_show_code"), show_code_notification),
        pystray.MenuItem(T("menu_lan"), show_lan_menu_item),
        pystray.MenuItem(T("menu_disconnect"), disconnect_session),
        pystray.MenuItem(T("menu_autostart"), toggle_autostart_menu_item, checked=lambda item: win_integration.is_autostart_enabled(), enabled=lambda item: win_integration.exe_path() is not None),
        pystray.MenuItem(T("menu_check_updates"), check_for_update_menu_item),
        pystray.MenuItem(T("menu_show_log"), show_log_location),
        pystray.MenuItem(T("menu_report"), report_problem),
    ]
    if DONATE_URL:
        menu_items.append(pystray.MenuItem(T("menu_support"), open_donate))
    menu_items.append(pystray.MenuItem(T("menu_quit"), quit_app))
    icon = pystray.Icon("truck-dash", make_icon_image(), "Truck Dash", pystray.Menu(*menu_items))
    state.icon = icon
    icon.run()
    sys.exit(0)


if __name__ == "__main__":
    main()

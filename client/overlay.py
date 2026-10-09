"""Overlay en el juego: una ventanita arriba del juego, sin bordes, que deja
pasar los clics y no se lleva el foco.

Es la etapa siguiente a la ventana flotante del navegador (Document
Picture-in-Picture, en app.js): aquella pide tener el tablero abierto en
Chrome o Edge en la misma PC, tiene barra de titulo y se come el clic. Esta
la dibuja el cliente y sirve aunque el tablero este en el celular.

De donde sale cada cosa:
- velocidad y limite: de la telemetria, en esta PC (10 por segundo);
- giro, proxima ciudad, lo que falta y la llegada: los calcula la web, que es
  la que tiene el mapa y la ruta, y los manda como texto ya traducido
  ({"type": "nav_hud"}, por el relay o directo en LAN). La web solo los manda
  si el cliente avisa en client_status que el overlay esta prendido;
- sin web (o si deja de mandar, por ejemplo con el celular bloqueado), lo que
  falta sale de la ruta del GPS del propio juego, y el giro no se muestra.

Se ve solo con el juego al frente y el camion andando: en el escritorio, en
otra ventana o con el juego en pausa (menu) se esconde. Funciona con el juego
en ventana o en pantalla completa sin bordes, que es lo que usan ETS2 y ATS
desde la 1.50; en pantalla completa exclusiva Windows no deja dibujar encima.
Solo Windows (bajo Wine/Proton no se ofrece).
"""

import logging
import threading
import time

KM_TO_MI = 0.621371

CORNERS = ("top_left", "top_center", "top_right", "bottom_left", "bottom_right")
DEFAULT_CORNER = "top_center"
SIZES = {"s": 0.8, "m": 1.0, "l": 1.3}
DEFAULT_SIZE = "m"
# Lo que se puede elegir mostrar (Setup): el giro con la proxima ciudad, la
# velocidad con el limite, lo que falta, la hora de llegada real (la de tu
# reloj, la calcula la web) y la del reloj del juego (la que importa contra
# el plazo del trabajo).
ITEMS = ("turn", "speed", "remaining", "arrival", "game_arrival")
DATOS = ("turn", "speed", "remaining", "arrival", "game_arrival")

# Cuanto vale lo que manda la web: el giro dice "en 400 m" y a 90 km/h eso
# cambia rapido. Si la web deja de mandar (pestana cerrada, celular
# bloqueado) el giro se saca antes de que mienta.
NAV_FRESH_SECONDS = 6.0
# Sin telemetria hace esto, el juego se cerro o se fue al menu principal.
TELEMETRY_FRESH_SECONDS = 2.0

BG = "#14171c"
FG = "#f2f3f5"
MUTED = "#9aa4b2"
RED = "#e53935"


def _texto(valor, largo=160) -> str:
    """Lo que llega de la web es texto para mostrar, nada mas: se recorta y
    se descarta lo que no sea str."""
    if not isinstance(valor, str):
        return ""
    return valor.strip()[:largo]


def limpiar_nav(msg: dict) -> dict:
    """El mensaje nav_hud de la web, con solo lo que se usa."""
    return {
        "turn": _texto(msg.get("turn")),
        "next": _texto(msg.get("next")),
        "remaining": _texto(msg.get("remaining"), 24),
        "arrival": _texto(msg.get("arrival"), 24),
        "remainingLabel": _texto(msg.get("remainingLabel"), 24),
        "arrivalLabel": _texto(msg.get("arrivalLabel"), 24),
        "imperial": msg.get("imperial") if isinstance(msg.get("imperial"), bool) else None,
    }


def formato_distancia(km: float, imperial: bool) -> str:
    if imperial:
        mi = km * KM_TO_MI
        return f"{mi:.1f} mi" if mi < 10 else f"{round(mi)} mi"
    return f"{km:.1f} km" if km < 10 else f"{round(km)} km"


def llegada_en_juego(tele: dict) -> str:
    """La hora del reloj del juego a la que se llega por la ruta del GPS del
    juego ("21:59", con "+1d" si cae otro dia), o "" si el juego no tiene
    ruta. routeTimeSeconds es tiempo de juego, igual que gameTimeMinutes."""
    ahora = tele.get("gameTimeMinutes")
    falta = tele.get("routeTimeSeconds")
    if not isinstance(ahora, (int, float)) or not isinstance(falta, (int, float)) or falta <= 0:
        return ""
    llega = ahora + falta / 60
    hora = int(llega) % 1440
    dias = int(llega // 1440) - int(ahora // 1440)
    return f"{hora // 60:02d}:{hora % 60:02d}" + (f" +{dias}d" if dias > 0 else "")


def contenido(tele: dict | None, tele_ts: float, nav: dict | None, nav_ts: float,
              ahora: float, imperial_default: bool | None = None,
              etiqueta_falta: str = "Remaining", etiqueta_llega: str = "Arrival (real)",
              etiqueta_juego: str = "Arrival (game)", items=ITEMS) -> dict | None:
    """Lo que hay que dibujar, o None si el overlay no tiene que verse.

    tele es el payload que va al tablero (el mismo dict); nav lo ultimo que
    mando la web (limpiar_nav). Devuelve textos ya formateados: la ventana
    solo los pinta, asi se puede probar sin abrir nada."""
    if not tele or ahora - tele_ts > TELEMETRY_FRESH_SECONDS or tele.get("paused"):
        return None
    nav_ok = bool(nav) and ahora - nav_ts <= NAV_FRESH_SECONDS
    if nav and nav.get("imperial") is not None:
        imperial = nav["imperial"]  # lo que eligio el usuario en la web, aunque ya no mande
    elif imperial_default is not None:
        imperial = imperial_default
    else:
        imperial = tele.get("game") == "ats"

    factor = KM_TO_MI if imperial else 1.0
    velocidad = round(abs(tele.get("speedKmh") or 0) * factor)
    limite_kmh = tele.get("speedLimitKmh") or 0
    limite = round(limite_kmh * factor) if limite_kmh > 0 else None

    falta = llega = ""
    if nav_ok and nav.get("remaining"):
        falta, llega = nav["remaining"], nav.get("arrival", "")
    else:
        # El GPS del juego: lo que falta de SU ruta, que es la que el jugador
        # ve en el juego. La llegada no: routeTimeSeconds es tiempo de juego
        # y pasarlo a la hora real pide la escala que mide la web.
        km = tele.get("routeDistanceKm") or 0
        if km > 0:
            falta = formato_distancia(km, imperial)

    ver_giro, ver_vel = "turn" in items, "speed" in items
    datos = {
        "turn": nav["turn"] if nav_ok and ver_giro else "",
        "next": nav.get("next", "") if nav_ok and ver_giro else "",
        "speed": str(velocidad) if ver_vel else "",
        "unit": "mph" if imperial else "km/h",
        "limit": str(limite) if limite and ver_vel else "",
        "over": ver_vel and bool(limite) and velocidad > limite + 2,
        "remaining": falta if "remaining" in items else "",
        "arrival": llega if "arrival" in items else "",
        "game_arrival": llegada_en_juego(tele) if "game_arrival" in items else "",
        "remainingLabel": (nav_ok and nav.get("remainingLabel")) or etiqueta_falta,
        # Las dos llegadas con su aclaracion, siempre del cliente: la de la
        # web dice solo "Llegada" y al lado de la del juego se confunden.
        "arrivalLabel": etiqueta_llega,
        "gameArrivalLabel": etiqueta_juego,
    }
    # Nada para mostrar (todo destildado, o solo el giro y no hay ruta): no
    # se deja un recuadro vacio arriba del juego.
    if not any(datos[k] for k in DATOS):
        return None
    return datos


def posicion(rect, ancho: int, alto: int, esquina: str, margen: int) -> tuple[int, int]:
    """Donde va la ventana adentro del rectangulo (izq, arriba, der, abajo)
    de la ventana del juego."""
    izq, arriba, der, abajo = rect
    if esquina.endswith("left"):
        x = izq + margen
    elif esquina.endswith("right"):
        x = der - margen - ancho
    else:
        x = izq + (der - izq - ancho) // 2
    y = arriba + margen if esquina.startswith("top") else abajo - margen - alto
    return int(x), int(y)


class OverlayData:
    """Lo ultimo que se sabe, compartido entre el hilo de la telemetria
    (asyncio) y el de la ventana (tk)."""

    def __init__(self):
        self._lock = threading.Lock()
        self.tele = None
        self.tele_ts = 0.0
        self.nav = None
        self.nav_ts = 0.0

    def telemetria(self, payload: dict) -> None:
        with self._lock:
            self.tele = payload
            self.tele_ts = time.time()

    def navegacion(self, msg: dict) -> None:
        with self._lock:
            self.nav = limpiar_nav(msg)
            self.nav_ts = time.time()

    def foto(self):
        with self._lock:
            return self.tele, self.tele_ts, self.nav, self.nav_ts


# --- Win32 -------------------------------------------------------------------
GWL_EXSTYLE = -20
WS_EX_TOPMOST = 0x00000008
WS_EX_TRANSPARENT = 0x00000020
WS_EX_TOOLWINDOW = 0x00000080
WS_EX_LAYERED = 0x00080000
WS_EX_NOACTIVATE = 0x08000000
SW_HIDE = 0
SW_SHOWNOACTIVATE = 4
HWND_TOPMOST = -1
SWP_NOSIZE = 0x0001
SWP_NOMOVE = 0x0002
SWP_NOACTIVATE = 0x0010
SWP_FRAMECHANGED = 0x0020
DWMWA_WINDOW_CORNER_PREFERENCE = 33
DWMWCP_ROUND = 2


def _user32():
    import ctypes
    from ctypes import wintypes
    u = ctypes.windll.user32
    u.GetWindowLongPtrW.restype = ctypes.c_ssize_t
    u.GetWindowLongPtrW.argtypes = [wintypes.HWND, ctypes.c_int]
    u.SetWindowLongPtrW.restype = ctypes.c_ssize_t
    u.SetWindowLongPtrW.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_ssize_t]
    u.SetWindowPos.argtypes = [wintypes.HWND, wintypes.HWND, ctypes.c_int, ctypes.c_int,
                               ctypes.c_int, ctypes.c_int, ctypes.c_uint]
    u.GetParent.restype = wintypes.HWND
    u.GetParent.argtypes = [wintypes.HWND]
    return u


def _rect_de(hwnd):
    import ctypes
    from ctypes import wintypes
    r = wintypes.RECT()
    if not ctypes.windll.user32.GetWindowRect(hwnd, ctypes.byref(r)):
        return None
    return (r.left, r.top, r.right, r.bottom)


class Overlay:
    """La ventana. Corre en su propio hilo con su propio Tk, como la ventana
    de Setup.

    Se crea la primera vez que se prende y despues vive hasta que se cierra
    el cliente: apagarla la esconde. Crear una ventana de Tk la activa, y con
    la tecla rapida eso pasaria con el juego al frente; esconder y mostrar
    con ShowWindow no le saca el foco a nadie."""

    TICK_MS = 100

    def __init__(self, data: OverlayData, ajustes, etiquetas):
        self.data = data
        self.ajustes = ajustes      # () -> (esquina, tamano, que se muestra)
        self.etiquetas = etiquetas  # () -> (falta, llegada real, llegada del juego), idioma del cliente
        self._activo = False
        self._hilo = None

    @property
    def enabled(self) -> bool:
        return self._activo

    def set_enabled(self, prender: bool) -> None:
        prender = bool(prender)
        if prender != self._activo:
            logging.info("Overlay en el juego %s", "prendido" if prender else "apagado")
        self._activo = prender
        if prender and (self._hilo is None or not self._hilo.is_alive()):
            self._hilo = threading.Thread(target=self._correr, name="overlay", daemon=True)
            self._hilo.start()

    def _correr(self):
        try:
            _Ventana(self).loop()
        except Exception:
            logging.exception("El overlay se cerro por un error")


class _Ventana:
    def __init__(self, overlay: Overlay):
        import ctypes
        import tkinter as tk

        self.ov = overlay
        # Si al crearse la ventana se lleva el foco, se lo devuelve a quien lo
        # tenia (el juego, si se prendio con la tecla rapida).
        frente_antes = ctypes.windll.user32.GetForegroundWindow()
        # Con escalado de Windows (125 %, 150 %) un proceso sin DPI propio se
        # dibuja chico y Windows lo estira: el texto queda borroso. Solo este
        # hilo pasa a medir en pixeles reales; Setup sigue como estaba.
        try:
            ctypes.windll.user32.SetThreadDpiAwarenessContext(ctypes.c_void_p(-4))  # PER_MONITOR_AWARE_V2
        except Exception:
            pass
        self.tk = tk
        self.root = tk.Tk()
        self.root.withdraw()
        self.root.overrideredirect(True)
        self.root.configure(bg=BG)
        self.root.attributes("-topmost", True)
        self.root.attributes("-alpha", 0.88)
        self.canvas = tk.Canvas(self.root, bg=BG, highlightthickness=0, bd=0)
        self.canvas.pack(fill="both", expand=True)
        # Tk crea la ventana de Windows recien al mostrarla. Se la muestra
        # fuera de la pantalla para tener el handle y ponerle los estilos, y
        # desde ahi se muestra y esconde con ShowWindow, que no le saca el
        # foco al juego (deiconify si).
        self.root.geometry("10x10+-32000+-32000")
        self.root.deiconify()
        self.root.update_idletasks()
        self.root.update()
        self.u = _user32()
        self.hwnd = self.u.GetParent(self.root.winfo_id()) or self.root.winfo_id()
        ex = self.u.GetWindowLongPtrW(self.hwnd, GWL_EXSTYLE)
        ex |= WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_TOPMOST
        self.u.SetWindowLongPtrW(self.hwnd, GWL_EXSTYLE, ex)
        self.u.SetWindowPos(self.hwnd, HWND_TOPMOST, 0, 0, 0, 0,
                            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED)
        try:
            v = ctypes.c_int(DWMWCP_ROUND)
            ctypes.windll.dwmapi.DwmSetWindowAttribute(self.hwnd, DWMWA_WINDOW_CORNER_PREFERENCE,
                                                       ctypes.byref(v), ctypes.sizeof(v))
        except Exception:
            pass
        self.u.ShowWindow(self.hwnd, SW_HIDE)
        if frente_antes and self.u.GetForegroundWindow() != frente_antes:
            self.u.SetForegroundWindow(frente_antes)
        self.visible = False
        self.dibujado = None   # (contenido, escala) de lo que esta en pantalla
        self.lugar = None      # (x, y, ancho, alto)
        self.ultimo_topmost = 0.0
        self.parpadeo = False

    def loop(self):
        self.root.after(self.ov.TICK_MS, self.tick)
        self.root.mainloop()

    def esconder(self):
        if self.visible:
            self.u.ShowWindow(self.hwnd, SW_HIDE)
            self.visible = False

    def tick(self):
        try:
            self._tick()
        except Exception:
            logging.exception("Error en el overlay")
        self.root.after(self.ov.TICK_MS, self.tick)

    def _tick(self):
        import window_compat

        juego = window_compat.game_window_in_front() if self.ov.enabled else None
        if not juego:
            self.esconder()
            return
        tele, tele_ts, nav, nav_ts = self.ov.data.foto()
        falta, llega, llega_juego = self.ov.etiquetas()
        esquina, tamano, items = self.ov.ajustes()
        datos = contenido(tele, tele_ts, nav, nav_ts, time.time(), etiqueta_falta=falta,
                          etiqueta_llega=llega, etiqueta_juego=llega_juego, items=items)
        rect = _rect_de(juego)
        if datos is None or rect is None:
            self.esconder()
            return
        # Todo se mide contra la altura del juego: a 1080 p "m" es la escala 1.
        escala = max(0.6, (rect[3] - rect[1]) / 1080) * SIZES.get(tamano, 1.0)
        self.parpadeo = datos["over"] and int(time.monotonic() * 2) % 2 == 0
        clave = (datos, escala, self.parpadeo)
        if clave != self.dibujado:
            ancho, alto = self.dibujar(datos, escala)
            self.dibujado = clave
        else:
            ancho, alto = self.lugar[2], self.lugar[3]
        x, y = posicion(rect, ancho, alto, esquina, round(24 * escala))
        self.lugar = (x, y, ancho, alto)
        # Se compara contra donde esta de verdad: el primer geometry despues
        # de mostrarla fuera de la pantalla cambia el tamano pero no la mueve.
        if _rect_de(self.hwnd) != (x, y, x + ancho, y + alto):
            self.root.geometry(f"{ancho}x{alto}+{x}+{y}")
            self.u.SetWindowPos(self.hwnd, HWND_TOPMOST, x, y, ancho, alto, SWP_NOACTIVATE)
        ahora = time.monotonic()
        if not self.visible:
            self.u.ShowWindow(self.hwnd, SW_SHOWNOACTIVATE)
            self.visible = True
        if ahora - self.ultimo_topmost > 2:
            # Algunos juegos se ponen arriba de todo al tomar el foco: se
            # vuelve a pedir cada tanto, sin activar la ventana.
            self.ultimo_topmost = ahora
            self.u.SetWindowPos(self.hwnd, HWND_TOPMOST, 0, 0, 0, 0,
                                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)

    def dibujar(self, d: dict, k: float) -> tuple[int, int]:
        from tkinter import font as tkfont

        c = self.canvas
        c.delete("all")
        fuente = lambda px, negrita=False: ("Segoe UI", -max(8, round(px * k)), "bold" if negrita else "normal")
        mide = lambda texto, f: tkfont.Font(root=self.root, font=f).measure(texto)
        pad = round(14 * k)
        sep = round(16 * k)
        fila = round(46 * k)
        # De derecha a izquierda: llegada del juego, llegada real, lo que falta.
        columnas = [(d[v], d[e]) for v, e in (("game_arrival", "gameArrivalLabel"), ("arrival", "arrivalLabel"),
                                               ("remaining", "remainingLabel")) if d[v]]
        # El ancho sale de lo que hay que mostrar: con todo prendido no entra
        # en el minimo y los numeros se pisaban con la velocidad.
        izquierda = 0
        if d["limit"]:
            izquierda += fila + round(12 * k)
        if d["speed"]:
            izquierda += mide(d["speed"], fuente(34, True)) + round(4 * k) + mide(d["unit"], fuente(13))
        derecha_total = sum(max(mide(v, fuente(19, True)), mide(e, fuente(11))) + sep for v, e in columnas)
        ancho = max(round(420 * k), 2 * pad + izquierda + round(8 * k) + derecha_total)
        y = pad
        if d["turn"]:
            t = c.create_text(pad, y, text=d["turn"], fill=FG, anchor="nw",
                              font=fuente(24, True), width=ancho - 2 * pad)
            y = c.bbox(t)[3] + round(2 * k)
            if d["next"]:
                t = c.create_text(pad, y, text=d["next"], fill=MUTED, anchor="nw",
                                  font=fuente(14), width=ancho - 2 * pad)
                y = c.bbox(t)[3]
            y += round(8 * k)

        if not (d["speed"] or columnas):
            alto = y - round(8 * k) + pad
            c.configure(width=ancho, height=alto)
            return ancho, alto
        medio = y + fila // 2
        x = pad
        if d["limit"]:
            r = fila // 2
            borde = max(3, round(5 * k))
            anillo = RED if not (d["over"] and self.parpadeo) else "#ff8a80"
            c.create_oval(x, medio - r, x + 2 * r, medio + r, fill="#ffffff", outline=anillo, width=borde)
            c.create_text(x + r, medio, text=d["limit"], fill="#111111",
                          font=fuente(17 if len(d["limit"]) < 3 else 14, True))
            x += 2 * r + round(12 * k)
        if d["speed"]:
            v = c.create_text(x, medio, text=d["speed"], fill=RED if d["over"] else FG, anchor="w",
                              font=fuente(34, True))
            x = c.bbox(v)[2] + round(4 * k)
            c.create_text(x, medio + round(6 * k), text=d["unit"], fill=MUTED, anchor="w", font=fuente(13))

        derecha = ancho - pad
        for valor, etiqueta in columnas:
            a = c.create_text(derecha, medio - round(2 * k), text=valor, fill=FG, anchor="se", font=fuente(19, True))
            b = c.create_text(derecha, medio + round(1 * k), text=etiqueta, fill=MUTED, anchor="ne", font=fuente(11))
            derecha = min(c.bbox(a)[0], c.bbox(b)[0]) - sep
        alto = y + fila + pad
        c.configure(width=ancho, height=alto)
        return ancho, alto


# --- Tecla rapida ------------------------------------------------------------
# Prende y apaga el overlay sin salir del juego.
#
# No es RegisterHotKey: ETS2 lee el teclado como raw input con las teclas
# rapidas de otros programas anuladas (RIDEV_NOHOTKEYS), y con el juego al
# frente no llegaba nunca (probado el 09-10). Tampoco un hook de teclado de
# bajo nivel: cada tecla del juego pasaria por Python antes de llegarle, y
# con el GIL ocupado eso es demora al manejar. Se mira el estado del teclado
# 20 veces por segundo (GetAsyncKeyState), que no depende de como lea el
# juego. La contra: el juego tambien ve la combinacion, por eso son
# combinaciones que ETS2 y ATS no usan por defecto.
HOTKEYS = ("ctrl+shift+o", "ctrl+shift+h", "ctrl+alt+o", "alt+shift+o", "")
DEFAULT_HOTKEY = "ctrl+shift+o"
MOD_ALT, MOD_CONTROL, MOD_SHIFT = 0x1, 0x2, 0x4
_MODS = {"ctrl": MOD_CONTROL, "alt": MOD_ALT, "shift": MOD_SHIFT}
# Tecla virtual de cada modificador (cualquiera de los dos lados).
_VK_MODS = {MOD_CONTROL: 0x11, MOD_ALT: 0x12, MOD_SHIFT: 0x10}
POLL_SECONDS = 0.05


def tecla(combinacion: str) -> tuple[int, int] | None:
    """"ctrl+shift+o" -> (modificadores, codigo de tecla virtual), o None."""
    partes = [p for p in (combinacion or "").lower().split("+") if p]
    if not partes or len(partes[-1]) != 1 or not partes[-1].isalnum():
        return None
    mods = 0
    for m in partes[:-1]:
        if m not in _MODS:
            return None
        mods |= _MODS[m]
    return mods, ord(partes[-1].upper())


def nombre_tecla(combinacion: str) -> str:
    """Como se muestra: "Ctrl+Shift+O"."""
    return "+".join(p.capitalize() if len(p) > 1 else p.upper() for p in combinacion.split("+"))


def combinacion_apretada(mods: int, vk: int, abajo) -> bool:
    """Si esta apretada exactamente esa combinacion. abajo(vk) dice si una
    tecla virtual esta abajo. Exacta: con Ctrl+Shift+O, Ctrl+Alt+Shift+O no
    cuenta."""
    if not abajo(vk):
        return False
    return all(abajo(v) == bool(mods & m) for m, v in _VK_MODS.items())


class TeclaRapida:
    """Mira una combinacion en su propio hilo y llama a al_apretar una vez
    por apretada (al bajar, no mientras se mantiene). poner() la cambia;
    "" la saca."""

    def __init__(self, al_apretar):
        self.al_apretar = al_apretar
        self._hilo = None
        self._parar = None
        self.actual = ""

    def poner(self, combinacion: str) -> None:
        if self._parar is not None:
            self._parar.set()
        self._hilo = self._parar = None
        self.actual = combinacion if tecla(combinacion) else ""
        if not self.actual:
            return
        self._parar = threading.Event()
        self._hilo = threading.Thread(target=self._mirar, args=(self.actual, self._parar),
                                      name="tecla-overlay", daemon=True)
        self._hilo.start()
        logging.info("Tecla del overlay: %s", nombre_tecla(self.actual))

    def _mirar(self, combinacion: str, parar: threading.Event) -> None:
        import ctypes
        estado = ctypes.windll.user32.GetAsyncKeyState
        abajo = lambda vk: bool(estado(vk) & 0x8000)
        mods, vk = tecla(combinacion)
        antes = combinacion_apretada(mods, vk, abajo)  # si ya estaba apretada al arrancar, no cuenta
        while not parar.wait(POLL_SECONDS):
            ahora = combinacion_apretada(mods, vk, abajo)
            if ahora and not antes:
                try:
                    self.al_apretar()
                except Exception:
                    logging.exception("Error al usar la tecla del overlay")
            antes = ahora

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
  falta sale de la ruta del GPS del propio juego, y en lugar del giro va un
  aviso chico de que el giro sale del tablero (en Discord preguntaban si hacia
  falta el navegador abierto para el overlay: no, salvo para el giro).

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
# Donde lo dejo uno arrastrandolo (modo Mover): la esquina de arriba a la
# izquierda del overlay, en proporcion a la ventana del juego, para que siga
# en su lugar si cambia la resolucion.
CUSTOM = "custom"
# Tamano en por ciento (100 = el de siempre a 1080 p). Antes eran tres
# opciones fijas; pedian poder achicarlo o agrandarlo a gusto para ubicarlo
# mejor (Discord, 13-10). Lo guardado como letra se pasa a su por ciento.
SIZE_MIN, SIZE_MAX = 50, 200
DEFAULT_SIZE = 100
SIZES_VIEJOS = {"s": 80, "m": 100, "l": 130}
SIZE_STEP = 5
# Opacidad de la ventana entera, en por ciento. Por debajo de 30 el texto ya
# no se lee arriba del juego.
OPACITY_MIN, OPACITY_MAX = 30, 100
DEFAULT_OPACITY = 90  # antes fija en 88; de a SIZE_STEP como el deslizador
# Lo que se puede elegir mostrar (Setup): el giro con la proxima ciudad, la
# velocidad con el limite, la del control de crucero (solo si esta puesto),
# la marcha, lo que falta, la hora de llegada real (la de tu reloj, la
# calcula la web) y la del reloj del juego (la que importa contra el plazo).
ITEMS = ("turn", "speed", "cruise", "gear", "remaining", "arrival", "game_arrival", "stops")
DATOS = ("turn", "speed", "cruise", "gear", "remaining", "arrival", "game_arrival")
# La barra de la ruta ("stops", idea del usuario del 09-10): de aca al
# destino, con el tramo donde conviene cargar combustible y el tramo donde
# conviene dormir, solo con colores. Cada tramo es el ultimo cuarto antes de
# quedarse sin combustible o sin poder manejar mas (al menos 20 km).
PARADA_VENTANA, PARADA_VENTANA_MIN_KM = 0.25, 20.0
# Para pasar los minutos de juego hasta el descanso a km: la velocidad media
# de la ruta del GPS del juego, entre estos topes; sin ruta, la del medio.
VEL_MEDIA_MIN, VEL_MEDIA_MAX, VEL_MEDIA_DEFECTO = 40.0, 100.0, 70.0
BARRA_FONDO, BARRA_COMBUSTIBLE, BARRA_DESCANSO = "#2a3644", "#ffa726", "#9c7cf0"
CRUISE = "#7cc243"  # el verde del crucero, el mismo del overlay de OBS

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
GRIP = 18  # lado de la esquina que estira en el modo Mover, a escala 1
# Carriles: los colores del tablero (app.css .navLane) sobre el fondo del overlay
CARRIL_ON, CARRIL_OFF = "#20405f", "#22252a"
CARRIL_APAGADO, CARRIL_OTRA = "#4d545e", "#8a93a0"


def _cuadratica(p0, c, p1, pasos=8):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0],
             (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1])
            for t in (i / pasos for i in range(pasos + 1))]


def _espejo(puntos):
    return [(24 - x, y) for x, y in puntos]


def _formas_carril():
    """LANE_PATHS de pure.js en puntos, en el mismo cuadro de 24 x 30: el
    trazo desde la punta del tronco (12, 17) y la cabeza de la flecha."""
    import math
    derecha = _cuadratica((12, 17), (12, 11), (18, 11))
    vuelta = ([(12, 17), (12, 9.5)]
              + [(8.5 + 3.5 * math.cos(a), 9.5 - 3.5 * math.sin(a)) for a in (i * math.pi / 10 for i in range(11))]
              + [(5, 17)])
    formas = {
        "straight": ([(12, 17), (12, 6)], [(8, 9), (12, 3.5), (16, 9)]),
        "right": (derecha, [(16, 7), (21.5, 11), (16, 15)]),
        "slightRight": ([(12, 17), (17.5, 8.5)], [(14, 6.5), (19.8, 5), (19, 10.8)]),
        "uturn": (vuelta, [(1.5, 14.5), (5, 20), (8.5, 14.5)]),
    }
    formas["left"] = (_espejo(formas["right"][0]), _espejo(formas["right"][1]))
    formas["slightLeft"] = (_espejo(formas["slightRight"][0]), _espejo(formas["slightRight"][1]))
    return formas


CARRIL_FORMAS = _formas_carril()


def _texto(valor, largo=160) -> str:
    """Lo que llega de la web es texto para mostrar, nada mas: se recorta y
    se descarta lo que no sea str."""
    if not isinstance(valor, str):
        return ""
    return valor.strip()[:largo]


# Las flechas de carril (LANE_ARROW_BITS de docs/app/pure.js), de izquierda
# a derecha como las dibuja el tablero.
CARRIL_BITS = {"left": 1, "slightLeft": 2, "straight": 4, "slightRight": 8, "right": 16, "uturn": 32}
CARRIL_ORDEN = ("uturn", "left", "slightLeft", "straight", "slightRight", "right")


def _entero(v, maximo) -> bool:
    return isinstance(v, int) and not isinstance(v, bool) and 0 <= v <= maximo


def carriles_validos(rec):
    """Los carriles del giro como llegan en nav_hud (laneHudRecord de la
    web), o None. Solo enteros chicos: llega por el relay."""
    if not isinstance(rec, dict):
        return None
    n, mask, giro, flechas = rec.get("count"), rec.get("mask"), rec.get("turn"), rec.get("arrows")
    if not (_entero(n, 8) and n >= 2 and _entero(mask, 255) and _entero(giro, 63)
            and isinstance(flechas, list) and len(flechas) >= n and all(_entero(f, 63) for f in flechas[:n])):
        return None
    return {"count": n, "mask": mask, "turn": giro, "arrows": flechas[:n]}


def carriles(rec):
    """Para dibujar (laneGuidance de pure.js): por carril, de izquierda a
    derecha, sus direcciones, si sirve para el giro y cual es la del giro."""
    if not rec:
        return None
    giro = next((d for d in CARRIL_ORDEN if rec["turn"] & CARRIL_BITS[d]), None)
    return [{"dirs": [d for d in CARRIL_ORDEN if bits & CARRIL_BITS[d]], "on": bool(rec["mask"] >> k & 1), "giro": giro}
            for k, bits in enumerate(rec["arrows"][:rec["count"]])]


def limpiar_nav(msg: dict) -> dict:
    """El mensaje nav_hud de la web, con solo lo que se usa."""
    return {
        "lanes": carriles_validos(msg.get("lanes")),
        "turn": _texto(msg.get("turn")),
        "next": _texto(msg.get("next")),
        "remaining": _texto(msg.get("remaining"), 24),
        "arrival": _texto(msg.get("arrival"), 24),
        # Lo que falta como numero (el de OBS): para la barra de paradas
        "remainingKm": msg.get("remainingKm") if _numero(msg.get("remainingKm")) and msg.get("remainingKm") >= 0 else None,
        "remainingLabel": _texto(msg.get("remainingLabel"), 24),
        "arrivalLabel": _texto(msg.get("arrivalLabel"), 32),
        "gameArrivalLabel": _texto(msg.get("gameArrivalLabel"), 32),
        "imperial": msg.get("imperial") if isinstance(msg.get("imperial"), bool) else None,
        # 12 o 24 h, el de Ajustes del tablero: la llegada del juego la arma
        # el cliente y tiene que salir igual que la real, que llega hecha
        "clock12": msg.get("clock12") is True,
    }


def _con_ruta(nav: dict) -> bool:
    return bool(nav.get("turn") or nav.get("remaining"))


def formato_distancia(km: float, imperial: bool) -> str:
    if imperial:
        mi = km * KM_TO_MI
        return f"{mi:.1f} mi" if mi < 10 else f"{round(mi)} mi"
    return f"{km:.1f} km" if km < 10 else f"{round(km)} km"


def _numero(valor) -> bool:
    """Un numero de verdad: ni bool, ni NaN, ni infinito (round() tira)."""
    return isinstance(valor, (int, float)) and not isinstance(valor, bool) and float("-inf") < valor < float("inf")


def formato_marcha(marcha) -> str:
    """La marcha como la muestra el tablero: "N" en punto muerto (o si no
    llega), "R" o "R2" atras, el numero adelante. Es la del tablero del
    camion (gearDashboard), no la de la caja."""
    if not _numero(marcha) or int(marcha) == 0:
        return "N"
    marcha = int(marcha)
    if marcha < 0:
        return "R" if marcha == -1 else f"R{-marcha}"
    return str(marcha)


def _a_paso(valor, minimo, maximo) -> int:
    """Redondeado de a SIZE_STEP y dentro del rango: el deslizador de Setup
    va de a 5 y un valor suelto lo hacia saltar."""
    return int(min(max(round(valor / SIZE_STEP) * SIZE_STEP, minimo), maximo))


def tamano_valido(valor, defecto=DEFAULT_SIZE) -> int:
    """El tamano guardado, en por ciento y dentro del rango. Acepta la letra
    de antes ("s", "m", "l")."""
    if isinstance(valor, str):
        return SIZES_VIEJOS.get(valor, defecto)
    if not _numero(valor):
        return defecto
    return _a_paso(valor, SIZE_MIN, SIZE_MAX)


def opacidad_valida(valor, defecto=DEFAULT_OPACITY) -> int:
    if not _numero(valor):
        return defecto
    return _a_paso(valor, OPACITY_MIN, OPACITY_MAX)


def _zona_parada(punto_km, total_km):
    """El tramo (desde, hasta) en fraccion de la ruta donde conviene parar
    antes de `punto_km`, o None si se llega sin parar."""
    if not _numero(punto_km) or not _numero(total_km) or total_km <= 0 or punto_km >= total_km:
        return None
    punto = max(0.0, punto_km)
    desde = max(0.0, punto - max(PARADA_VENTANA * punto, PARADA_VENTANA_MIN_KM))
    hasta = max(punto, desde + 0.02 * total_km)  # que se vea aunque haya que parar ya
    return (round(desde / total_km, 4), round(min(1.0, hasta / total_km), 4))


# Con la fatiga apagada el juego manda 0 o mas de un dia hasta el descanso:
# eso es sin dato, no "parar ya" (como restMinutesOf de la web y el panel).
DESCANSO_MAX_MIN = 24 * 60


def minutos_de_descanso(tele: dict):
    """Los minutos de juego hasta el proximo descanso, o None si no dicen nada."""
    m = tele.get("restStopMinutes")
    return m if _numero(m) and 0 < m < DESCANSO_MAX_MIN else None


def barra_paradas(tele: dict, total_km) -> dict | None:
    """La barra de la ruta: {"fuel": tramo o None, "rest": tramo o None},
    o None si no hay ruta. total_km: lo que falta (del tablero o del GPS
    del juego); la autonomia y el descanso salen del juego."""
    if not _numero(total_km) or total_km <= 0:
        return None
    combustible = _zona_parada(tele.get("fuelRangeKm"), total_km)
    km_ruta, s_ruta = tele.get("routeDistanceKm"), tele.get("routeTimeSeconds")
    vel = (km_ruta / (s_ruta / 3600) if _numero(km_ruta) and _numero(s_ruta) and km_ruta > 0 and s_ruta > 0
           else VEL_MEDIA_DEFECTO)
    vel = min(max(vel, VEL_MEDIA_MIN), VEL_MEDIA_MAX)
    descanso_min = minutos_de_descanso(tele)
    descanso = _zona_parada(descanso_min / 60 * vel, total_km) if descanso_min is not None else None
    return {"fuel": combustible, "rest": descanso}


def formato_hora(horas: int, minutos: int, doce: bool) -> str:
    """"15:45" o "3:45 PM": formatClockHM de docs/app/pure.js."""
    if not doce:
        return f"{horas:02d}:{minutos:02d}"
    return f"{horas % 12 or 12}:{minutos:02d} {'AM' if horas < 12 else 'PM'}"


def llegada_en_juego(tele: dict, doce: bool = False) -> str:
    """La hora del reloj del juego a la que se llega por la ruta del GPS del
    juego ("21:59", con "+1d" si cae otro dia), o "" si el juego no tiene
    ruta. routeTimeSeconds es tiempo de juego, igual que gameTimeMinutes.
    doce: en 12 h ("9:59 PM"), como lo eligio el tablero."""
    ahora = tele.get("gameTimeMinutes")
    falta = tele.get("routeTimeSeconds")
    if not isinstance(ahora, (int, float)) or not isinstance(falta, (int, float)) or falta <= 0:
        return ""
    llega = ahora + falta / 60
    hora = int(llega) % 1440
    dias = int(llega // 1440) - int(ahora // 1440)
    return formato_hora(hora // 60, hora % 60, doce) + (f" +{dias}d" if dias > 0 else "")


def contenido(tele: dict | None, tele_ts: float, nav: dict | None, nav_ts: float,
              ahora: float, imperial_default: bool | None = None,
              etiqueta_falta: str = "Remaining", etiqueta_llega: str = "Arrival (real)",
              etiqueta_juego: str = "Arrival (game)", items=ITEMS,
              aviso_giro: str = "") -> dict | None:
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
    crucero_kmh = tele.get("cruiseControlSpeedKmh") or 0
    crucero = (str(round(crucero_kmh * factor))
               if "cruise" in items and tele.get("cruiseControl") and crucero_kmh > 0 else "")

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
    # Con ruta en el juego y el giro elegido pero sin tablero que lo mande,
    # se dice de donde sale en vez de dejar el lugar vacio sin explicacion.
    con_ruta = (tele.get("routeDistanceKm") or 0) > 0
    datos = {
        "turn": nav["turn"] if nav_ok and ver_giro else "",
        # Las flechas de carril van con el giro (abajo del texto)
        "lanes": carriles(nav.get("lanes")) if nav_ok and ver_giro and nav.get("turn") else None,
        "hint": aviso_giro if ver_giro and not nav_ok and con_ruta else "",
        "next": nav.get("next", "") if nav_ok and ver_giro else "",
        "speed": str(velocidad) if ver_vel else "",
        "unit": "mph" if imperial else "km/h",
        "limit": str(limite) if limite and ver_vel else "",
        "over": ver_vel and bool(limite) and velocidad > limite + 2,
        "cruise": crucero,
        "gear": formato_marcha(tele.get("gear")) if "gear" in items else "",
        "remaining": falta if "remaining" in items else "",
        "arrival": llega if "arrival" in items else "",
        # El formato vale aunque el tablero ya no mande: es una preferencia
        "game_arrival": llegada_en_juego(tele, bool(nav and nav.get("clock12")))
        if "game_arrival" in items else "",
        # Lo que falta: el del tablero si manda (su ruta tiene los waypoints),
        # si no el del GPS del juego
        "stops": barra_paradas(tele, nav["remainingKm"] if nav_ok and nav.get("remainingKm") else tele.get("routeDistanceKm"))
        if "stops" in items else None,
        # Las etiquetas, en el idioma del tablero aunque ya no mande (el giro
        # viene en ese idioma); las del cliente (idioma de Windows) solo si
        # nunca hubo tablero.
        "remainingLabel": (nav and nav.get("remainingLabel")) or etiqueta_falta,
        "arrivalLabel": (nav and nav.get("arrivalLabel")) or etiqueta_llega,
        "gameArrivalLabel": (nav and nav.get("gameArrivalLabel")) or etiqueta_juego,
    }
    # Nada para mostrar (todo destildado, o solo el giro y no hay ruta): no
    # se deja un recuadro vacio arriba del juego.
    if not any(datos[k] for k in DATOS) and not datos["hint"] and not datos["stops"]:
        return None
    return datos


def posicion(rect, ancho: int, alto: int, esquina: str, margen: int,
             relativa=None) -> tuple[int, int]:
    """Donde va la ventana adentro del rectangulo (izq, arriba, der, abajo)
    de la ventana del juego."""
    izq, arriba, der, abajo = rect
    if esquina == CUSTOM and relativa:
        # Siempre adentro del juego entero, aunque haya crecido el recuadro.
        x = izq + relativa[0] * (der - izq)
        y = arriba + relativa[1] * (abajo - arriba)
        x = max(izq, min(x, der - ancho))
        y = max(arriba, min(y, abajo - alto))
        return int(x), int(y)
    if esquina.endswith("left"):
        x = izq + margen
    elif esquina.endswith("right"):
        x = der - margen - ancho
    else:
        x = izq + (der - izq - ancho) // 2
    y = arriba + margen if esquina.startswith("top") else abajo - margen - alto
    return int(x), int(y)


def relativa_de(rect, x: int, y: int) -> tuple[float, float]:
    """Al reves de posicion() con CUSTOM: de un lugar en pantalla a la
    proporcion dentro del juego, entre 0 y 1."""
    izq, arriba, der, abajo = rect
    fx = (x - izq) / max(1, der - izq)
    fy = (y - arriba) / max(1, abajo - arriba)
    return round(min(max(fx, 0.0), 1.0), 4), round(min(max(fy, 0.0), 1.0), 4)


def ejemplo(items, etiquetas) -> dict:
    """Lo que se ve en el modo Mover si no hay datos del juego: el tamano de
    verdad, para saber donde queda."""
    falta, llega, llega_juego = etiquetas
    d = {"turn": "\u21b1 400 m", "next": "", "speed": "72", "unit": "km/h", "limit": "80", "over": False,
         "cruise": "80", "gear": "8", "remaining": "123 km", "arrival": "14:32", "game_arrival": "21:59",
         "remainingLabel": falta, "arrivalLabel": llega, "gameArrivalLabel": llega_juego,
         "lanes": carriles({"count": 3, "mask": 0b110, "turn": CARRIL_BITS["right"],
                            "arrows": [CARRIL_BITS["straight"], CARRIL_BITS["straight"] | CARRIL_BITS["right"],
                                       CARRIL_BITS["right"]]})}
    d["stops"] = {"fuel": (0.45, 0.6), "rest": (0.7, 0.93)} if "stops" in items else None
    if "turn" not in items:
        d["turn"] = ""
        d["lanes"] = None
    if "speed" not in items:
        d["speed"] = d["limit"] = ""
    for k in ("cruise", "gear", "remaining", "arrival", "game_arrival"):
        if k not in items:
            d[k] = ""
    if not any(d[k] for k in DATOS):
        d["speed"], d["limit"] = "72", "80"
    return d


class OverlayData:
    """Lo ultimo que se sabe, compartido entre el hilo de la telemetria
    (asyncio) y el de la ventana (tk)."""

    def __init__(self):
        self._lock = threading.Lock()
        self.tele = None
        self.tele_ts = 0.0
        self.nav = None
        self.nav_ts = 0.0
        self.nav_src = None

    def telemetria(self, payload: dict) -> None:
        with self._lock:
            self.tele = payload
            self.tele_ts = time.time()

    def navegacion(self, msg: dict) -> None:
        # Con dos tableros abiertos (la pestana de la PC y el celular) cada
        # uno manda lo suyo, con su ruta y sus unidades, y el overlay saltaba
        # de uno a otro ("kept bouncing the distance remaining around",
        # Discord 10-10). Se queda con el que venia mandando mientras siga
        # fresco; si se calla (pestana cerrada, celular bloqueado) toma el
        # otro. Una pestana de antes del deploy no manda src: cuenta como un
        # tablero mas (None), si no le sacaba el lugar al de verdad en cada
        # mensaje. Excepcion: si el que manda no tiene ruta y el otro si, se
        # pasa al que tiene (un celular en modo Lite, el mapa cargando).
        src = msg.get("src") if isinstance(msg.get("src"), str) else None
        nuevo = limpiar_nav(msg)
        ahora = time.time()
        with self._lock:
            if (self.nav is not None and src != self.nav_src
                    and ahora - self.nav_ts <= NAV_FRESH_SECONDS
                    and (_con_ruta(self.nav) or not _con_ruta(nuevo))):
                return
            self.nav = nuevo
            self.nav_ts = ahora
            self.nav_src = src

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
LWA_ALPHA = 0x2
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
    u.SetLayeredWindowAttributes.argtypes = [wintypes.HWND, wintypes.DWORD, ctypes.c_ubyte, wintypes.DWORD]
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
        # () -> {"corner", "size", "items", "pos", "opacity"}, como overlay_settings()
        self.ajustes = ajustes
        self.etiquetas = etiquetas  # () -> (falta, llegada real, llegada del juego, aviso del giro), idioma del cliente
        self._activo = False
        self._hilo = None
        # Modo Mover (boton de Setup): el overlay se ve aunque el juego no
        # este al frente, deja de pasar los clics y se arrastra con el mouse.
        # Al soltarlo se llama a al_mover(fx, fy) con la proporcion nueva.
        # Desde la esquina de abajo a la derecha (o con la rueda) se agranda
        # o achica: al soltar, al_redimensionar(tamano en por ciento).
        self.mover = False
        self.al_mover = None
        self.al_redimensionar = None

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
        # La primera Tk() del proceso queda como raiz por defecto, y todo lo
        # que Setup crea sin decir de quien es (BooleanVar, la imagen del QR)
        # iba a parar a ESTE interprete, en otro hilo: Setup lo esperaba a
        # el, y en modo Mover este esperaba a Setup (WM_GETTEXT al buscar el
        # juego). Se trabo el cliente entero (09-10). Esta nunca es la raiz.
        if getattr(tk, "_default_root", None) is self.root:
            tk._default_root = None
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
        self.clics = False      # si la ventana recibe el mouse (modo Mover)
        self.agarre = None      # (dx, dy) del puntero mientras se arrastra
        self.estira = None      # (x del puntero, tamano, ancho) al agarrar la esquina
        self.tamano_vivo = None  # el tamano mientras se estira, sin guardar todavia
        self.tamano = DEFAULT_SIZE  # el del ultimo cuadro
        self.escala = 1.0       # la del ultimo cuadro (para medir la esquina)
        self.alfa = None        # la opacidad puesta en la ventana, 0-255
        self.rect = None        # el rectangulo del juego del ultimo cuadro
        self.juego_mover = (0.0, None)  # (cuando se busco, hwnd) en modo Mover
        self.canvas.bind("<ButtonPress-1>", self._agarrar)
        self.canvas.bind("<B1-Motion>", self._arrastrar)
        self.canvas.bind("<ButtonRelease-1>", self._soltar)
        self.canvas.bind("<Motion>", self._puntero)
        self.canvas.bind("<MouseWheel>", self._rueda)

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

    def _cursor(self):
        import ctypes
        from ctypes import wintypes
        p = wintypes.POINT()
        ctypes.windll.user32.GetCursorPos(ctypes.byref(p))
        return p.x, p.y

    def _en_esquina(self, x, y, r) -> bool:
        """Si el puntero esta sobre la esquina de abajo a la derecha, la que
        estira (se dibuja en el modo Mover)."""
        lado = max(14, round(GRIP * self.escala))
        return x >= r[2] - lado and y >= r[3] - lado

    def _puntero(self, _evento):
        if not self.ov.mover or self.agarre or self.estira:
            return
        r = _rect_de(self.hwnd)
        if r:
            esquina = self._en_esquina(*self._cursor(), r)
            self.canvas.configure(cursor="size_nw_se" if esquina else "fleur")

    def _agarrar(self, _evento):
        if not self.ov.mover:
            return
        r = _rect_de(self.hwnd)
        x, y = self._cursor()
        if self._en_esquina(x, y, r):
            self.estira = (x, self.tamano, max(1, r[2] - r[0]))
        else:
            self.agarre = (x - r[0], y - r[1])

    def _arrastrar(self, _evento):
        x, y = self._cursor()
        if self.estira is not None:
            # El tamano crece en la misma proporcion que el ancho: la esquina
            # sigue al puntero. Se ve en el proximo cuadro; se guarda al soltar.
            x0, tamano0, ancho0 = self.estira
            self.tamano_vivo = tamano_valido(tamano0 * (ancho0 + x - x0) / ancho0)
            return
        if self.agarre is None:
            return
        self.u.SetWindowPos(self.hwnd, HWND_TOPMOST, x - self.agarre[0], y - self.agarre[1], 0, 0,
                            SWP_NOSIZE | SWP_NOACTIVATE)

    def _soltar(self, _evento):
        if self.estira is not None:
            self.estira = None
            if self.tamano_vivo is not None and self.ov.al_redimensionar:
                self.ov.al_redimensionar(self.tamano_vivo)
            self.tamano_vivo = None
            return
        if self.agarre is None:
            return
        self.agarre = None
        r = _rect_de(self.hwnd)
        if r and self.rect and self.ov.al_mover:
            self.ov.al_mover(*relativa_de(self.rect, r[0], r[1]))

    def _rueda(self, evento):
        """En el modo Mover la rueda agranda o achica de a SIZE_STEP."""
        if not self.ov.mover or self.estira or not self.ov.al_redimensionar or not evento.delta:
            return
        paso = SIZE_STEP if evento.delta > 0 else -SIZE_STEP
        self.ov.al_redimensionar(tamano_valido(self.tamano + paso))

    def _modo_clics(self, recibir: bool):
        """En modo Mover la ventana recibe el mouse; fuera de el, los clics
        pasan al juego."""
        if recibir == self.clics:
            return
        self.clics = recibir
        ex = self.u.GetWindowLongPtrW(self.hwnd, GWL_EXSTYLE)
        ex = (ex & ~WS_EX_TRANSPARENT) if recibir else (ex | WS_EX_TRANSPARENT)
        self.u.SetWindowLongPtrW(self.hwnd, GWL_EXSTYLE, ex)
        self.canvas.configure(cursor="fleur" if recibir else "")
        self.dibujado = None

    def _juego_para_mover(self):
        """En modo Mover el juego no esta al frente (se toco el boton de
        Setup): se lo busca entre todas las ventanas, cada 2 s. Solo por el
        .exe: leer los titulos le manda un mensaje a cada ventana de este
        mismo proceso (Setup) y espera la respuesta."""
        import window_compat
        cuando, hwnd = self.juego_mover
        if time.monotonic() - cuando > 2:
            hwnd = window_compat.game_window_by_exe()
            self.juego_mover = (time.monotonic(), hwnd)
        return hwnd

    def _pantalla(self):
        import ctypes
        m = ctypes.windll.user32.GetSystemMetrics
        return (0, 0, m(0), m(1))

    def _tick(self):
        import window_compat

        mover = self.ov.mover and self.ov.enabled
        self._modo_clics(mover)
        if mover:
            juego = self._juego_para_mover()
        else:
            juego = window_compat.game_window_in_front() if self.ov.enabled else None
            if not juego:
                self.esconder()
                return
        tele, tele_ts, nav, nav_ts = self.ov.data.foto()
        falta, llega, llega_juego, *resto = self.ov.etiquetas()
        aj = self.ov.ajustes()
        esquina, items, relativa = aj["corner"], aj["items"], aj["pos"]
        tamano = self.tamano_vivo if self.tamano_vivo is not None else aj["size"]
        self.tamano = tamano
        alfa = round(opacidad_valida(aj.get("opacity")) * 255 / 100)
        if alfa != self.alfa:
            # Directo con Win32 y no con el -alpha de Tk: Tk, al llegar a 1.0,
            # le saca WS_EX_LAYERED y rehace la ventana (otro hwnd), y sin
            # LAYERED los clics ya no pasan al juego.
            self.u.SetLayeredWindowAttributes(self.hwnd, 0, alfa, LWA_ALPHA)
            self.alfa = alfa
        datos = contenido(tele, tele_ts, nav, nav_ts, time.time(), etiqueta_falta=falta,
                          etiqueta_llega=llega, etiqueta_juego=llega_juego, items=items,
                          aviso_giro=resto[0] if resto else "")
        rect = _rect_de(juego) if juego else None
        if mover:
            # Sin juego abierto se acomoda sobre la pantalla principal.
            rect = rect or self._pantalla()
            datos = datos or ejemplo(items, (falta, llega, llega_juego))
        if datos is None or rect is None:
            self.esconder()
            return
        self.rect = rect
        # Todo se mide contra la altura del juego: a 1080 p "m" es la escala 1.
        escala = max(0.6, (rect[3] - rect[1]) / 1080) * tamano / 100
        self.escala = escala
        self.parpadeo = datos["over"] and int(time.monotonic() * 2) % 2 == 0
        clave = (datos, escala, self.parpadeo, self.clics)
        if clave != self.dibujado:
            ancho, alto = self.dibujar(datos, escala)
            self.dibujado = clave
        else:
            ancho, alto = self.lugar[2], self.lugar[3]
        x, y = posicion(rect, ancho, alto, esquina, round(24 * escala), relativa)
        self.lugar = (x, y, ancho, alto)
        # Se compara contra donde esta de verdad: el primer geometry despues
        # de mostrarla fuera de la pantalla cambia el tamano pero no la mueve.
        # Mientras se arrastra, manda el mouse.
        if self.agarre is None and _rect_de(self.hwnd) != (x, y, x + ancho, y + alto):
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
        hueco = round(12 * k)
        icono = round(17 * k)          # el reloj del crucero
        caja = round(36 * k)           # alto del recuadro de la marcha
        # De derecha a izquierda: llegada del juego, llegada real, lo que falta.
        columnas = [(d[v], d[e]) for v, e in (("game_arrival", "gameArrivalLabel"), ("arrival", "arrivalLabel"),
                                               ("remaining", "remainingLabel")) if d[v]]
        ancho_marcha = max(caja, mide(d["gear"], fuente(20, True)) + round(14 * k)) if d["gear"] else 0
        # El ancho sale de lo que hay que mostrar: con todo prendido no entra
        # en el minimo y los numeros se pisaban con la velocidad.
        izquierda = 0
        if d["limit"]:
            izquierda += fila + hueco
        if d["speed"]:
            izquierda += mide(d["speed"], fuente(34, True)) + round(4 * k) + mide(d["unit"], fuente(13))
        if d["cruise"]:
            izquierda += hueco + icono + round(4 * k) + mide(d["cruise"], fuente(17, True))
        if d["gear"]:
            izquierda += hueco + ancho_marcha
        derecha_total = sum(max(mide(v, fuente(19, True)), mide(e, fuente(11))) + sep for v, e in columnas)
        ancho = max(round(420 * k), 2 * pad + izquierda + round(8 * k) + derecha_total)
        lanes = d.get("lanes") or []
        carril_w, carril_h, carril_sep = round(30 * k), round(36 * k), round(4 * k)
        if lanes:
            ancho = max(ancho, 2 * pad + len(lanes) * (carril_w + carril_sep) - carril_sep)
        y = pad
        if d["turn"]:
            t = c.create_text(pad, y, text=d["turn"], fill=FG, anchor="nw",
                              font=fuente(24, True), width=ancho - 2 * pad)
            y = c.bbox(t)[3] + round(2 * k)
            if lanes:
                y += round(3 * k)
                for i, carril in enumerate(lanes):
                    self._carril(pad + i * (carril_w + carril_sep), y, carril_w, carril_h, carril, k)
                y += carril_h + round(4 * k)
            if d["next"]:
                t = c.create_text(pad, y, text=d["next"], fill=MUTED, anchor="nw",
                                  font=fuente(14), width=ancho - 2 * pad)
                y = c.bbox(t)[3]
            y += round(8 * k)
        elif d.get("hint"):
            t = c.create_text(pad, y, text=d["hint"], fill=MUTED, anchor="nw",
                              font=fuente(14), width=ancho - 2 * pad)
            y = c.bbox(t)[3] + round(8 * k)

        if not (d["speed"] or d["cruise"] or d["gear"] or columnas):
            alto = self._barra_paradas(d.get("stops"), y - round(8 * k), ancho, pad, k) + pad
            self._marco_mover(ancho, alto, k)
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
            x += 2 * r + hueco
        if d["speed"]:
            v = c.create_text(x, medio, text=d["speed"], fill=RED if d["over"] else FG, anchor="w",
                              font=fuente(34, True))
            x = c.bbox(v)[2] + round(4 * k)
            u = c.create_text(x, medio + round(6 * k), text=d["unit"], fill=MUTED, anchor="w", font=fuente(13))
            x = c.bbox(u)[2]
        if d["cruise"]:
            # Como en el overlay de OBS: un relojito y la velocidad fijada, en verde.
            x += hueco if x > pad else 0
            r = icono // 2
            grueso = max(2, round(2.4 * k))
            c.create_oval(x, medio - r, x + 2 * r, medio + r, outline=CRUISE, width=grueso)
            c.create_line(x + r, medio, x + r + round(r * 0.6), medio - round(r * 0.6),
                          fill=CRUISE, width=grueso, capstyle="round")
            t = c.create_text(x + 2 * r + round(4 * k), medio, text=d["cruise"], fill=CRUISE, anchor="w",
                              font=fuente(17, True))
            x = c.bbox(t)[2]
        if d["gear"]:
            x += hueco if x > pad else 0
            c.create_rectangle(x, medio - caja // 2, x + ancho_marcha, medio + caja // 2,
                               outline=MUTED, width=max(1, round(2 * k)))
            c.create_text(x + ancho_marcha // 2, medio, text=d["gear"], fill=FG, font=fuente(20, True))
            x += ancho_marcha

        derecha = ancho - pad
        for valor, etiqueta in columnas:
            a = c.create_text(derecha, medio - round(2 * k), text=valor, fill=FG, anchor="se", font=fuente(19, True))
            b = c.create_text(derecha, medio + round(1 * k), text=etiqueta, fill=MUTED, anchor="ne", font=fuente(11))
            derecha = min(c.bbox(a)[0], c.bbox(b)[0]) - sep
        alto = self._barra_paradas(d.get("stops"), y + fila, ancho, pad, k) + pad
        self._marco_mover(ancho, alto, k)
        c.configure(width=ancho, height=alto)
        return ancho, alto

    def _barra_paradas(self, barra, y: int, ancho: int, pad: int, k: float) -> int:
        """La barra de la ruta debajo de todo: de aca (izquierda) al destino,
        arriba el tramo para cargar combustible y abajo el de dormir. Devuelve
        donde termina."""
        if not barra:
            return y
        c = self.canvas
        y += round(8 * k)
        alto_b = max(8, round(12 * k))
        x0, x1 = pad, ancho - pad
        c.create_rectangle(x0, y, x1, y + alto_b, fill=BARRA_FONDO, outline="")
        mitad = alto_b // 2
        for clave, color, arriba in (("fuel", BARRA_COMBUSTIBLE, True), ("rest", BARRA_DESCANSO, False)):
            tramo = barra.get(clave)
            if tramo:
                a, b = x0 + tramo[0] * (x1 - x0), x0 + tramo[1] * (x1 - x0)
                ya = y if arriba else y + mitad
                c.create_rectangle(a, ya, max(a + 2, b), ya + (mitad if arriba else alto_b - mitad), fill=color, outline="")
        return y + alto_b

    def _carril(self, x: int, y: int, w: int, h: int, carril: dict, k: float) -> None:
        """Un carril como en el tablero (lanesHtml): caja azul si sirve, la
        flecha del giro en blanco y las demas apagadas."""
        c = self.canvas
        r = max(2, round(4 * k))
        fondo = CARRIL_ON if carril["on"] else CARRIL_OFF
        # Caja con las puntas redondeadas: Tk no tiene, va como poligono suave
        puntos = [x + r, y, x + w - r, y, x + w, y, x + w, y + r, x + w, y + h - r, x + w, y + h,
                  x + w - r, y + h, x + r, y + h, x, y + h, x, y + h - r, x, y + r, x, y]
        c.create_polygon(puntos, fill=fondo, outline="", smooth=True)
        # El dibujo de 24 x 30 adentro, con el margen de la caja del tablero
        esc = (w - 6 * k) / 24
        ox, oy = x + 3 * k, y + (h - 30 * esc) / 2
        pt = lambda p: (ox + p[0] * esc, oy + p[1] * esc)
        grueso = max(1.5, 2.6 * esc)
        color = (lambda dd: "#ffffff" if dd == carril["giro"] else CARRIL_OTRA) if carril["on"] else (lambda dd: CARRIL_APAGADO)
        c.create_line(*pt((12, 28)), *pt((12, 17)), fill="#ffffff" if carril["on"] else CARRIL_APAGADO,
                      width=grueso, capstyle="round")
        # La del giro al final, para que quede arriba de las otras
        for dd in sorted(carril["dirs"], key=lambda dd: dd == carril["giro"]):
            trazo, cabeza = CARRIL_FORMAS[dd]
            c.create_line(*[v for p in trazo for v in pt(p)], fill=color(dd), width=grueso,
                          capstyle="round", joinstyle="round")
            c.create_polygon(*[v for p in cabeza for v in pt(p)], fill=color(dd), outline="")

    def _marco_mover(self, ancho: int, alto: int, k: float) -> None:
        """Modo Mover: un borde para que se vea que se puede agarrar, y la
        esquina de abajo a la derecha, que estira."""
        if not self.clics:
            return
        c = self.canvas
        grueso = max(2, round(2 * k))
        c.create_rectangle(1, 1, ancho - 2, alto - 2, outline="#4a90d9", width=grueso, dash=(6, 4))
        lado = max(14, round(GRIP * k))
        for i in (1, 2, 3):
            d = round(lado * i / 3)
            c.create_line(ancho - 3 - d, alto - 3, ancho - 3, alto - 3 - d, fill="#4a90d9", width=grueso)


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

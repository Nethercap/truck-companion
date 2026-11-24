"""Los botones del camion por el SDK de entrada de SCS, sin teclas.

El plugin registra en el juego un dispositivo "semantical" con los 13 botones
de la botonera (plugin/scs-telemetry/src/truckdash_input.cpp) y aca se le pide
cada toque, en un bloque de memoria aparte ("TruckDashInput"). El juego recibe
la accion directo: no hace falta que tenga una tecla asignada, no depende del
teclado ni de su distribucion, y con el juego al frente no se toca el foco.

`Botones.apretar` devuelve True si el juego lo tomo. Con False no se apreto
nada y client.py sigue con la tecla de siempre. Pasa si:

- no esta el bloque: el juego cerrado, un plugin de antes, el de RenCloud, o
  apagado con truckdash-no-input.txt al lado de la DLL;
- el juego no pide entrada ni trayendolo al frente. Sin foco no la pide (lo
  mismo le pasa a ETS2LA, que usa un dispositivo igual): con el juego atras se
  lo trae al frente, como con las teclas, y se espera que vuelva a pedirla;
- no lo tomo a tiempo (cargando, trabado). Un pedido vencido el plugin no lo
  aprieta nunca, asi que la tecla no lo duplica;
- el juego lo tomo pero en la telemetria no cambio nada (`EFECTO`), por ejemplo
  si TruckersMP bloquea esa entrada. Con dos de esos, esta partida sigue con
  las teclas; con uno que si cambio algo, no se mira mas.

La disposicion del bloque es la de truckdash_input.hpp: si cambia alla, cambia
aca y sube REVISION en los dos (test_entrada_sdk.py los compara).
"""

import logging
import mmap
import os
import struct
import sys
import threading
import time

IS_WINDOWS = sys.platform == "win32"
NOMBRE = "Local\\TruckDashInput"  # TD_INPUT_MMF_NAME
RUTA = "/tmp/TruckDashInput" if sys.platform == "darwin" else "/dev/shm/TruckDashInput"
REVISION = 1                      # TD_INPUT_REVISION
TAMANO = 64

# Los mixes de controls.sii que declara el plugin, en el mismo orden (kInputs):
# se piden por indice, asi que uno nuevo va al final.
BOTONES = ("flasher4way", "beacon", "diflock", "parkingbrake", "engine", "attach", "camcycle",
           "cruiectrl", "light", "hblight", "infotainment", "liftaxle", "wipers")

# Nativos ("@") a proposito: escriben el numero de una vez. Con "<" Python lo
# hace de a un byte y el plugin podia leer un pedido por la mitad.
_U32 = struct.Struct("@I")
_U64 = struct.Struct("@Q")
CAMPOS = {  # tdInputMap_t
    "revision": (0, _U32), "buttons": (4, _U32), "active": (8, _U32), "frames": (12, _U32),
    "tick": (16, _U64), "session": (24, _U32), "presses": (28, _U32), "result": (32, _U32),
    "done": (36, _U32),
    "button": (40, _U32), "request": (44, _U32), "requestTick": (48, _U64), "requestEnd": (56, _U32),
}

APRETADO = 1  # TD_INPUT_PRESSED
ACEPTA_MS = 300  # TD_INPUT_ACCEPT_MS: pasado esto el plugin ya no lo aprieta
# Cuanto se espera la respuesta. Mas que ACEPTA_MS, con margen para el paso
# del reloj (GetTickCount64 avanza de a 16 ms): despues de esto la tecla no
# puede caer junto con el toque del SDK.
ESPERA_S = 0.45
# El juego pide entrada en cada cuadro: si hace mas que no la pide, no la toma
# (sin foco, cargando, colgado).
QUIETO_MS = 1000
# Cuanto se espera que vuelva a pedirla despues de traerlo al frente.
ACTIVAR_S = 0.6
# Cuanto se espera que el toque se vea en la telemetria, y cuantos sin efecto
# alcanzan para volver a las teclas hasta que se reinicie el juego.
EFECTO_S = 1.0
FALLOS_MAX = 2

# Los botones que cambian algo en la telemetria siempre y en el momento. Los
# demas no sirven para saber si el juego hace caso: el motor tarda, la baliza
# puede no estar puesta, el crucero pide velocidad, el limpiaparabrisas sube de
# velocidad sin cambiar el dato, y la camara no sale en la telemetria.
EFECTO = {
    "flasher4way": ("lightsHazards",),
    "light": ("lightsParking", "lightsBeamLow"),
    "parkingbrake": ("parkBrake",),
}

SIN_PLUGIN, QUIETO, ACTIVO = "sin_plugin", "quieto", "activo"


def ahora_ms() -> int:
    """El reloj del bloque (now_ms del plugin)."""
    if IS_WINDOWS:
        import ctypes
        funcion = ctypes.windll.kernel32.GetTickCount64
        funcion.restype = ctypes.c_uint64
        return funcion()
    return time.monotonic_ns() // 1_000_000


class Bloque:
    """El bloque abierto. Se abre para cada toque y se cierra: asi no queda
    vivo, con lo ultimo que dijo, despues de que el juego se cerro."""

    def __init__(self, buf, cerrar):
        self._buf = buf
        self._cerrar = cerrar

    def leer(self, campo: str) -> int:
        donde, formato = CAMPOS[campo]
        return formato.unpack_from(self._buf, donde)[0]

    def escribir(self, campo: str, valor: int) -> None:
        donde, formato = CAMPOS[campo]
        formato.pack_into(self._buf, donde, valor)

    def cerrar(self) -> None:
        self._buf = None
        self._cerrar()


def abrir() -> Bloque | None:
    """El bloque del plugin, o None si no existe."""
    try:
        if IS_WINDOWS:
            from multiprocessing.shared_memory import SharedMemory
            memoria = SharedMemory(name=NOMBRE, create=False)
            if memoria.size < TAMANO:
                memoria.close()
                return None
            return Bloque(memoria.buf, memoria.close)
        fd = os.open(RUTA, os.O_RDWR)
        try:
            mapa = mmap.mmap(fd, TAMANO)
        finally:
            os.close(fd)
        return Bloque(mapa, mapa.close)
    except (OSError, ValueError):
        return None


def estado(bloque: Bloque | None) -> str:
    """SIN_PLUGIN, QUIETO (el juego no pide entrada ahora) o ACTIVO."""
    if bloque is None or bloque.leer("revision") != REVISION:
        return SIN_PLUGIN
    if not bloque.leer("active") or ahora_ms() - bloque.leer("tick") > QUIETO_MS:
        return QUIETO
    return ACTIVO


def pedir(bloque: Bloque, boton: int) -> bool:
    """Pide un toque y espera que el juego lo tome. False: no se apreto ni se
    va a apretar."""
    ident = (bloque.leer("request") + 1) & 0xFFFFFFFF or 1
    bloque.escribir("button", boton)
    bloque.escribir("requestTick", ahora_ms())
    bloque.escribir("request", ident)
    bloque.escribir("requestEnd", ident)
    limite = time.monotonic() + ESPERA_S
    while bloque.leer("done") != ident:
        if time.monotonic() >= limite:
            bloque.escribir("requestEnd", 0)  # vencido: que no lo mire mas
            break
        time.sleep(0.005)
    return bloque.leer("done") == ident and bloque.leer("result") == APRETADO


def _raw_de_la_telemetria() -> dict | None:
    import telemetry_compat
    try:
        return telemetry_compat.get_data()
    except Exception:  # sin abrir todavia, o cerrandose
        return None


class Botones:
    """Los botones de esta PC. Un toque por vez: pueden llegar a la vez del
    relay y de la red local, cada uno en su thread."""

    def __init__(self):
        self._candado = threading.Lock()
        self._sesion = None       # la del plugin (una por arranque del juego)
        self._hace_caso = False   # un toque ya cambio algo en la telemetria
        self._sin_efecto = 0
        self._sin_activar = 0
        # Para los tests.
        self.abrir = abrir
        self.leer_raw = _raw_de_la_telemetria

    def apretar(self, mix: str, al_frente) -> bool:
        """Aprieta el boton de ese mix. `al_frente` trae la ventana del juego
        al frente y devuelve False si no la encuentra. False: no se apreto."""
        if mix not in BOTONES:
            return False
        with self._candado:
            bloque = self.abrir()
            if bloque is None:
                return False
            try:
                motivo = self._apretar(bloque, mix, al_frente)
            except Exception as exc:  # que un boton no se quede sin su tecla
                logging.exception("Button through the game's SDK")
                motivo = str(exc)
            finally:
                bloque.cerrar()
        if motivo is None:
            return True
        logging.info("Button %s not sent through the game's SDK (%s), using the key", mix, motivo)
        return False

    def _apretar(self, bloque: Bloque, mix: str, al_frente) -> str | None:
        """None si el juego lo tomo, o por que no."""
        como = estado(bloque)
        if como == SIN_PLUGIN:
            return "no buttons in the plugin"
        sesion = bloque.leer("session")
        if sesion != self._sesion:
            self._sesion, self._hace_caso = sesion, False
            self._sin_efecto = self._sin_activar = 0
        boton = BOTONES.index(mix)
        if boton >= bloque.leer("buttons"):
            return "older plugin"
        if self._sin_efecto >= FALLOS_MAX:
            return "the game ignores them"
        if como == QUIETO:
            if self._sin_activar >= FALLOS_MAX:
                return "the game isn't taking input"
            if not al_frente():
                return "no game window"
            if not self._esperar_activo(bloque):
                self._sin_activar += 1
                return "the game isn't taking input"
        self._sin_activar = 0
        antes = self._efecto(mix)
        inicio = time.monotonic()
        if not pedir(bloque, boton):
            return "not taken in time"
        logging.info("Button %s sent through the game's SDK (%d ms%s)", mix,
                     (time.monotonic() - inicio) * 1000, ", game brought to the front" if como == QUIETO else "")
        if not self._se_nota(mix, antes):
            self._sin_efecto += 1
            return "taken, but nothing changed in the game"
        return None

    @staticmethod
    def _esperar_activo(bloque: Bloque) -> bool:
        limite = time.monotonic() + ACTIVAR_S
        while time.monotonic() < limite:
            time.sleep(0.02)
            if estado(bloque) == ACTIVO:
                return True
        return False

    def _efecto(self, mix: str) -> tuple | None:
        """Lo que ese boton cambia en la telemetria, o None si ahora no se
        puede saber: el juego en pausa, sin electricidad o sin aire (el freno
        de mano no se suelta)."""
        if self._hace_caso or mix not in EFECTO:
            return None
        raw = self.leer_raw()
        if (not raw or not raw.get("sdkActive") or raw.get("paused") or not raw.get("electricEnabled")
                or raw.get("airPressureWarning") or raw.get("airPressureEmergency")):
            return None
        return tuple(bool(raw.get(campo)) for campo in EFECTO[mix])

    def _se_nota(self, mix: str, antes: tuple | None) -> bool:
        """Si el toque cambio algo. Ante la duda, si."""
        if antes is None:
            return True
        limite = time.monotonic() + EFECTO_S
        while time.monotonic() < limite:
            time.sleep(0.05)
            despues = self._efecto(mix)
            if despues is None:
                return True
            if despues != antes:
                self._hace_caso = True
                return True
        return False

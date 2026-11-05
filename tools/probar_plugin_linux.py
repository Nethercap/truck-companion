"""Carga el plugin de Linux como el juego nativo y mira que el cliente lo lea.

Uso: python tools/probar_plugin_linux.py <ruta a truckdash-telemetry.so>

Dos pasadas, cada una en un proceso aparte (si el plugin se cae, se ve en el
codigo de salida del hijo):
- "init": dlopen, scs_telemetry_init con un juego de mentira que guarda los
  eventos y canales que registra el plugin, un "started", dos cuadros con
  velocidad y posicion, y despues la lectura con el lector del cliente
  (client/telemetry_compat.py) y con el check-telemetry.py del paquete de
  prueba (plugin/linux/): los dos tienen que ver lo mismo que se mando.
  Despues scs_telemetry_shutdown (sdkActive apagado) y dlclose, que vuelve a
  llamar a shutdown desde el destructor.
- "sin-init": dlopen y dlclose, como cuando init falla y el juego suelta el
  plugin (en macOS eso se caia).

El plugin escribia en /tmp/TruckDashTelemetry y el cliente lee
/dev/shm/TruckDashTelemetry: el bloque no le llegaba nunca a nadie, y nadie
lo habia probado (05-11, issue #7). Esto es lo que lo hubiera visto.

Necesita truck_telemetry (client/requirements.txt). Usa el bloque de verdad:
con el juego abierto en esta PC le pisaria los datos, y si no existia antes lo
borra al terminar.
"""

import ctypes
import importlib.util
import os
import struct
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "client"))

PASADAS = ("init", "sin-init")
TELEMETRY_1_01 = (1 << 16) | 1
ATS_SDK_1_05 = (1 << 16) | 5
EVENTO_FRAME_START = 1
EVENTO_STARTED = 4
TIPO_FLOAT = 5
TIPO_DPLACEMENT = 11
CANAL_VELOCIDAD = b"truck.speed"
CANAL_POSICION = b"truck.world.placement"


class Valor(ctypes.Structure):  # scs_value_t: tipo, relleno y la union (48 bytes)
    _fields_ = [("tipo", ctypes.c_uint32), ("_relleno", ctypes.c_uint32),
                ("datos", ctypes.c_ubyte * 40)]


class Cuadro(ctypes.Structure):  # scs_telemetry_frame_start_t
    _fields_ = [("flags", ctypes.c_uint32), ("_relleno", ctypes.c_uint32),
                ("render_time", ctypes.c_uint64), ("simulation_time", ctypes.c_uint64),
                ("paused_simulation_time", ctypes.c_uint64)]


LOG = ctypes.CFUNCTYPE(None, ctypes.c_int32, ctypes.c_char_p)
REG_EVENTO = ctypes.CFUNCTYPE(ctypes.c_int32, ctypes.c_uint32, ctypes.c_void_p, ctypes.c_void_p)
UNREG_EVENTO = ctypes.CFUNCTYPE(ctypes.c_int32, ctypes.c_uint32)
REG_CANAL = ctypes.CFUNCTYPE(ctypes.c_int32, ctypes.c_char_p, ctypes.c_uint32, ctypes.c_uint32,
                             ctypes.c_uint32, ctypes.c_void_p, ctypes.c_void_p)
UNREG_CANAL = ctypes.CFUNCTYPE(ctypes.c_int32, ctypes.c_char_p, ctypes.c_uint32, ctypes.c_uint32)
CB_EVENTO = ctypes.CFUNCTYPE(None, ctypes.c_uint32, ctypes.c_void_p, ctypes.c_void_p)
CB_CANAL = ctypes.CFUNCTYPE(None, ctypes.c_char_p, ctypes.c_uint32, ctypes.POINTER(Valor),
                            ctypes.c_void_p)


class Params(ctypes.Structure):  # scs_telemetry_init_params_v101_t
    _fields_ = [("game_name", ctypes.c_char_p), ("game_id", ctypes.c_char_p),
                ("game_version", ctypes.c_uint32), ("log", LOG),
                ("register_for_event", REG_EVENTO), ("unregister_from_event", UNREG_EVENTO),
                ("register_for_channel", REG_CANAL), ("unregister_from_channel", UNREG_CANAL)]


class JuegoFalso:
    """Lo que el juego le da a scs_telemetry_init: guarda los eventos y los
    canales que registra el plugin para poder dispararlos despues."""

    def __init__(self):
        self.eventos = {}
        self.canales = {}
        self.params = Params(b"American Truck Simulator", b"ats", ATS_SDK_1_05,
                             LOG(lambda tipo, texto: None),
                             REG_EVENTO(self._evento), UNREG_EVENTO(lambda *a: 0),
                             REG_CANAL(self._canal), UNREG_CANAL(lambda *a: 0))

    def _evento(self, evento, funcion, contexto):
        self.eventos[evento] = (CB_EVENTO(funcion), contexto)
        return 0

    def _canal(self, nombre, indice, tipo, flags, funcion, contexto):
        self.canales[(nombre, indice)] = (CB_CANAL(funcion), contexto, tipo)
        return 0

    def evento(self, evento, info=None):
        funcion, contexto = self.eventos[evento]
        funcion(evento, ctypes.cast(ctypes.pointer(info), ctypes.c_void_p) if info else None, contexto)

    def canal(self, nombre, tipo, *valores, formato):
        funcion, contexto, registrado = self.canales[(nombre, 0xFFFFFFFF)]
        if registrado != tipo:
            raise SystemExit(f"{nombre.decode()} registrado con tipo {registrado}, no {tipo}")
        valor = Valor(tipo=tipo)
        struct.pack_into("<" + formato, valor.datos, 0, *valores)
        funcion(nombre, 0xFFFFFFFF, ctypes.pointer(valor), contexto)


def _check_telemetry():
    ruta = os.path.join(RAIZ, "plugin", "linux", "check-telemetry.py")
    spec = importlib.util.spec_from_file_location("check_telemetry", ruta)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def _comparar(que, leido, esperado):
    for clave, valor in esperado.items():
        if isinstance(valor, float):
            igual = abs(leido[clave] - valor) < 1e-3
        else:
            igual = leido[clave] == valor
        if not igual:
            raise SystemExit(f"{que}: {clave} = {leido[clave]!r}, se mando {valor!r}")


def _pasada_init(so: str) -> None:
    import telemetry_compat

    check = _check_telemetry()
    juego = JuegoFalso()
    lib = ctypes.CDLL(so, mode=os.RTLD_NOW)
    lib.scs_telemetry_shutdown.restype = None
    r = lib.scs_telemetry_init(TELEMETRY_1_01, ctypes.byref(juego.params))
    if r != 0:
        raise SystemExit(f"init devolvio {r}")
    if (CANAL_VELOCIDAD, 0xFFFFFFFF) not in juego.canales:
        raise SystemExit("el plugin no registro truck.speed")

    juego.evento(EVENTO_STARTED)
    juego.evento(EVENTO_FRAME_START, Cuadro(render_time=1_000_000, simulation_time=1_000_000,
                                            paused_simulation_time=1_000_000))
    juego.canal(CANAL_VELOCIDAD, TIPO_FLOAT, 22.5, formato="f")
    juego.canal(CANAL_POSICION, TIPO_DPLACEMENT, -25691.5, 12.25, 21145.75, 0.5, 0.0, 0.0,
                formato="dddfff")
    juego.evento(EVENTO_FRAME_START, Cuadro(render_time=1_016_000, simulation_time=1_016_000,
                                            paused_simulation_time=1_016_000))

    # renderTime cuenta desde el primer cuadro (telemetry_frame_start): 16 ms.
    esperado = {"sdkActive": True, "paused": False, "renderTime": 16_000,
                "telemetry_plugin_revision": 12, "game": 2, "version_major": 1,
                "version_minor": 5, "speed": 22.5, "coordinateX": -25691.5,
                "coordinateY": 12.25, "coordinateZ": 21145.75}

    telemetry_compat.init()
    try:
        if telemetry_compat.opened_block() != check.BLOQUE:
            raise SystemExit(f"el cliente abrio {telemetry_compat.opened_block()}, no {check.BLOQUE}")
        _comparar("cliente", telemetry_compat.get_data(), esperado)
        leido = check.leer()
        if leido is None:
            raise SystemExit(f"check-telemetry.py no encontro {check.BLOQUE}")
        # Las posiciones de check-telemetry.py contra el parser del cliente,
        # campo por campo (los textos estan vacios: el juego falso no manda
        # la configuracion del camion).
        datos = telemetry_compat.get_data()
        for nombre, _, _ in check.CAMPOS:
            if leido[nombre] != datos[nombre]:
                raise SystemExit(f"check-telemetry.py: {nombre} = {leido[nombre]!r}, "
                                 f"el cliente lee {datos[nombre]!r}")
        _comparar("check-telemetry.py", leido, esperado)

        lib.scs_telemetry_shutdown()
        if check.leer()["sdkActive"]:
            raise SystemExit("despues de shutdown sdkActive sigue prendido")
    finally:
        telemetry_compat.deinit()

    import _ctypes
    _ctypes.dlclose(lib._handle)


def _pasada_sin_init(so: str) -> None:
    import _ctypes
    lib = ctypes.CDLL(so, mode=os.RTLD_NOW)
    _ctypes.dlclose(lib._handle)


def _hijo(pasada: str, so: str) -> None:
    {"init": _pasada_init, "sin-init": _pasada_sin_init}[pasada](so)
    print(f"{pasada}: ok")


def probar(so: str) -> list[str]:
    """Corre cada pasada en un proceso aparte. Devuelve los errores."""
    from telemetry_compat import LINUX_PATHS
    bloque = LINUX_PATHS[0]
    existia = os.path.exists(bloque)
    errores = []
    try:
        for pasada in PASADAS:
            r = subprocess.run([sys.executable, os.path.abspath(__file__), "--hijo", pasada, so],
                               capture_output=True, text=True)
            sys.stdout.write(r.stdout)
            if r.returncode != 0:
                detalle = (r.stderr.strip().splitlines() or [""])[-1]
                if r.returncode < 0:
                    detalle = f"se cayo con la senal {-r.returncode}. {detalle}"
                errores.append(f"{pasada}: {detalle}")
    finally:
        if not existia and os.path.exists(bloque):
            os.remove(bloque)
    return errores


def main(argv: list[str]) -> int:
    if len(argv) == 4 and argv[1] == "--hijo":
        _hijo(argv[2], argv[3])
        return 0
    if len(argv) != 2:
        print(__doc__.strip().splitlines()[2])
        return 2
    errores = probar(os.path.abspath(argv[1]))
    for e in errores:
        print("ERROR", e)
    return 1 if errores else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

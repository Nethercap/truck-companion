"""Carga el plugin de Linux como el juego nativo y mira que el cliente lo lea.

Uso: python tools/probar_plugin_linux.py <ruta a truckdash-telemetry.so>

Dos pasadas, cada una en un proceso aparte (si el plugin se cae, se ve en el
codigo de salida del hijo):
- "init": dlopen, scs_telemetry_init con un juego de mentira que guarda los
  eventos y canales que registra el plugin, un "started", dos cuadros con
  velocidad y posicion, y despues la lectura con el lector del cliente
  (client/telemetry_compat.py) y con el check-telemetry.py del paquete de
  prueba (plugin/linux/): los dos tienen que ver lo mismo que se mando.
  Despues un trabajo de bus de punta a punta (`_trabajo_de_bus`), y
  scs_telemetry_shutdown (sdkActive apagado) y dlclose, que vuelve a
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
EVENTO_CONFIGURACION = 5
EVENTO_GAMEPLAY = 6
TIPO_S32 = 2
TIPO_U32 = 3
TIPO_U64 = 4
TIPO_FLOAT = 5
TIPO_DPLACEMENT = 11
TIPO_STRING = 12
TIPO_S64 = 13
FORMATOS = {TIPO_S32: "i", TIPO_U32: "I", TIPO_U64: "Q", TIPO_FLOAT: "f", TIPO_S64: "q"}
SIN_INDICE = 0xFFFFFFFF  # SCS_U32_NIL
LOG_MENSAJE = 0  # SCS_LOG_TYPE_message
CANAL_VELOCIDAD = b"truck.speed"
CANAL_POSICION = b"truck.world.placement"


class Valor(ctypes.Structure):  # scs_value_t: tipo, relleno y la union (48 bytes)
    _fields_ = [("tipo", ctypes.c_uint32), ("_relleno", ctypes.c_uint32),
                ("datos", ctypes.c_ubyte * 40)]


class ValorConNombre(ctypes.Structure):  # scs_named_value_t (64 bytes en 64 bits)
    _fields_ = [("nombre", ctypes.c_char_p), ("indice", ctypes.c_uint32),
                ("_relleno", ctypes.c_uint32), ("valor", Valor)]


class ConAtributos(ctypes.Structure):
    # scs_telemetry_configuration_t y scs_telemetry_gameplay_event_t: un id y
    # los atributos, terminados en uno sin nombre.
    _fields_ = [("id", ctypes.c_char_p), ("atributos", ctypes.POINTER(ValorConNombre))]


def con_atributos(ident: bytes, atributos: list):
    """El id y los atributos [(nombre, tipo, valor)] como los arma el juego,
    o (nombre, tipo, valor, indice) para uno con indice (las etapas de un
    trabajo de bus). Devuelve la estructura y lo que tiene que seguir vivo
    mientras se usa (los textos)."""
    lista = (ValorConNombre * (len(atributos) + 1))()
    textos = []
    for item, (nombre, tipo, valor, *indice) in zip(lista, atributos):
        item.nombre = nombre
        item.indice = indice[0] if indice else SIN_INDICE
        item.valor.tipo = tipo
        if tipo == TIPO_STRING:
            texto = ctypes.create_string_buffer(valor)
            textos.append(texto)
            struct.pack_into("<Q", item.valor.datos, 0, ctypes.addressof(texto))
        else:
            struct.pack_into("<" + FORMATOS[tipo], item.valor.datos, 0, valor)
    return ConAtributos(ident, lista), (lista, textos)


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
        self.log = []  # (tipo, texto) de lo que el plugin escribe en game.log.txt
        self.params = Params(b"American Truck Simulator", b"ats", ATS_SDK_1_05,
                             LOG(lambda tipo, texto: self.log.append((tipo, texto.decode()))),
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


def _config_de_bus(actual: int = 0, salidas=(0, 0), llegadas=(0, 0)) -> list:
    """La configuracion `bus_job` del game.log.txt de un usuario (12-11-2026,
    turismo Oulu -> mirador de Viitasaari -> Oulu, en el orden en que la
    mando el juego). Cambia de una a otra la etapa en curso y las salidas y
    llegadas reales de cada etapa (salidas[i], llegadas[i]; 0 = todavia no)."""
    etapas = [
        (b"city", b"oulu", b"Oulu", b"viewpoints", b"pocviitasaar", b"Viitasaari",
         256620, 256880, 25, 0),
        (b"viewpoints", b"pocviitasaar", b"Viitasaari", b"city", b"oulu", b"Oulu",
         257000, 257250, 0, 25),
    ]
    atributos = [
        (b"bus.stages.count", TIPO_U32, 2),
        (b"bus.stages.current", TIPO_U32, actual),
        (b"income", TIPO_U64, 6718),
        (b"planned_distance.km", TIPO_U32, 396),
        (b"bus_job.market", TIPO_STRING, b"tourist_job"),
    ]
    for i, (st, si, sn, dt, di, dn, sale, llega, suben, bajan) in enumerate(etapas):
        atributos += [
            (b"source_stop.type", TIPO_STRING, st, i),
            (b"source_stop.id", TIPO_STRING, si, i),
            (b"source_stop.name", TIPO_STRING, sn, i),
            (b"destination_stop.type", TIPO_STRING, dt, i),
            (b"destination_stop.id", TIPO_STRING, di, i),
            (b"destination_stop.name", TIPO_STRING, dn, i),
            (b"source_stop.departure_time.planned", TIPO_U32, sale, i),
        ]
        if salidas[i]:
            atributos.append((b"source_stop.departure_time.actual", TIPO_U32, salidas[i], i))
        atributos.append((b"destination_stop.arrival_time.planned", TIPO_U32, llega, i))
        if llegadas[i]:
            atributos.append((b"destination_stop.arrival_time.actual", TIPO_U32, llegadas[i], i))
        atributos += [
            (b"source_stop.entering_passengers.planned", TIPO_U32, suben, i),
            (b"destination_stop.leaving_passengers.planned", TIPO_U32, bajan, i),
        ]
    return atributos


def _trabajo_de_bus(juego: JuegoFalso, leer) -> None:
    """Un trabajo de bus del DLC Coaches (ETS2 1.62.3, 12-11-2026): la
    configuracion `bus_job` con sus etapas y, al terminar, el evento
    `bus_job.completed`, no `.delivered` (los nombres de los eventos salen de
    eurotrucks2.exe; con solo `.delivered` la entrega no le llegaba a nadie).
    Las etapas van a la zona de bus del bloque, que el cliente lee en
    raw["bus"] y trabajo_bus pasa a paradas; ninguna sale en game.log.txt
    como "attribute not handled"."""
    import trabajo_bus

    antes = leer()["jobDelivered"]
    config, vivos = con_atributos(b"bus_job", _config_de_bus())
    juego.evento(EVENTO_CONFIGURACION, config)
    datos = leer()
    _comparar("bus_job", datos, {"onJob": True, "jobMarket": "tourist_job", "jobIncome": 6718,
                                 "plannedDistanceKm": 396, "isCargoLoaded": True,
                                 "cityDst": "", "citySrc": ""})
    bus = datos["bus"]
    if not bus or bus["stageCount"] != 2 or bus["stageCurrent"] != 0 or bus["updates"] != 1:
        raise SystemExit(f"zona de bus: {bus!r}")
    _comparar("etapa 0, origen", bus["stages"][0]["source"],
              {"type": "city", "id": "oulu", "name": "Oulu", "departurePlanned": 256620,
               "departureActual": 0, "enteringPlanned": 25})
    _comparar("etapa 1, destino", bus["stages"][1]["destination"],
              {"type": "city", "id": "oulu", "name": "Oulu", "arrivalPlanned": 257250,
               "leavingPlanned": 25})
    paradas = trabajo_bus.del_raw(datos)
    esperadas = [
        {"type": "city", "id": "oulu", "name": "Oulu", "departurePlanned": 256620,
         "boardingPlanned": 25},
        {"type": "viewpoints", "id": "pocviitasaar", "name": "Viitasaari",
         "arrivalPlanned": 256880, "departurePlanned": 257000},
        {"type": "city", "id": "oulu", "name": "Oulu", "arrivalPlanned": 257250,
         "alightingPlanned": 25},
    ]
    if paradas != {"stage": 0, "stages": 2, "updates": 1, "stops": esperadas}:
        raise SystemExit(f"trabajo_bus.del_raw: {paradas!r}")

    # Lo que mando el juego despues, segun el game.log.txt del trabajo
    # terminado (12-11): la configuracion entera otra vez en cada cambio, y la
    # zona se rehace cada vez.
    # - Al empezar el embarque, la salida real de la primera etapa.
    config, vivos = con_atributos(b"bus_job", _config_de_bus(salidas=(256620, 0)))
    juego.evento(EVENTO_CONFIGURACION, config)
    bus = leer()["bus"]
    _comparar("salida real", bus["stages"][0]["source"], {"departureActual": 256620})
    # - Al llegar al mirador: la etapa 1, la llegada real (antes de hora) y ya
    #   la salida real de la etapa siguiente (el juego adelanta el reloj
    #   durante la parada).
    config, vivos = con_atributos(b"bus_job", _config_de_bus(1, (256620, 257000), (256852, 0)))
    juego.evento(EVENTO_CONFIGURACION, config)
    datos = leer()
    paradas = trabajo_bus.del_raw(datos)
    if (datos["bus"]["updates"] != 3 or paradas["stage"] != 1
            or paradas["stops"][1].get("arrivalActual") != 256852
            or paradas["stops"][1].get("departureActual") != 257000
            or trabajo_bus.proxima_parada(paradas)["name"] != "Oulu"):
        raise SystemExit(f"etapa 1: {paradas!r}")
    # - Al llegar a Oulu, la ultima: la etapa sigue en 1 y llega la llegada real.
    config, vivos = con_atributos(b"bus_job", _config_de_bus(1, (256620, 257000), (256852, 257190)))
    juego.evento(EVENTO_CONFIGURACION, config)
    datos = leer()
    paradas = trabajo_bus.del_raw(datos)
    if (datos["bus"]["updates"] != 4 or paradas["stage"] != 1 or not datos["onJob"]
            or paradas["stops"][2].get("arrivalActual") != 257190):
        raise SystemExit(f"llegada a Oulu: {paradas!r}")

    # Y 37 s despues (la escena de la parada) el evento, con los atributos de
    # ese log: revenue (s64, el log decia "unknown"), earned.xp,
    # passenger.satisfaction, distance.km y delivery.time.
    fin, vivos = con_atributos(b"bus_job.completed", [
        (b"revenue", TIPO_S64, 6718),
        (b"earned.xp", TIPO_S32, 639),
        (b"passenger.satisfaction", TIPO_FLOAT, 0.994682),
        (b"distance.km", TIPO_FLOAT, 410.0),
        (b"delivery.time", TIPO_U32, 570),
    ])
    juego.evento(EVENTO_GAMEPLAY, fin)
    datos = leer()
    _comparar("bus_job.completed", datos, {"jobDelivered": not antes, "onJob": False,
                                           "jobDeliveredRevenue": 6718,
                                           "jobDeliveredEarnedXp": 639,
                                           "jobDeliveredDistanceKm": 410.0,
                                           "jobDeliveredDeliveryTime": 570, "bus": None})
    # Despues el juego manda la configuracion vacia: el trabajo ya termino y
    # no tiene que volver a abrirse.
    vacia, vivos = con_atributos(b"bus_job", [])
    juego.evento(EVENTO_CONFIGURACION, vacia)
    _comparar("bus_job vacio", leer(), {"onJob": False, "jobDelivered": not antes, "bus": None})

    # Un trabajo de camion despues no trae etapas viejas.
    config, vivos = con_atributos(b"bus_job", _config_de_bus())
    juego.evento(EVENTO_CONFIGURACION, config)
    camion, vivos2 = con_atributos(b"job", [(b"cargo", TIPO_STRING, b"Chemicals"),
                                            (b"destination.city", TIPO_STRING, b"Wien")])
    juego.evento(EVENTO_CONFIGURACION, camion)
    _comparar("job despues de bus_job", leer(), {"cityDst": "Wien", "bus": None})

    # Los valores del trabajo de bus van a game.log.txt como mensaje (no como
    # error), con el indice de cada etapa, para ver en un log de verdad que
    # manda el juego en cada parada. La configuracion vacia no se anota.
    mensajes = [texto for tipo, texto in juego.log if tipo == LOG_MENSAJE]
    for esperado in ("Configuration: bus_job", " source_stop.id[1] string = pocviitasaar",
                     " bus.stages.count u32 = 2", "^Gameplayevents: bus_job.completed",
                     " passenger.satisfaction float = 0.994682", " revenue s64 = 6718",
                     " destination_stop.arrival_time.actual[1] u32 = 257190"):
        if esperado not in mensajes:
            raise SystemExit(f"game.log.txt: falta {esperado!r}")
    if mensajes.count("Configuration: bus_job") != 5:
        raise SystemExit("game.log.txt: la configuracion bus_job vacia tambien se anoto")
    # id 5 es configType job (el evento de entrega tiene los suyos sin guardar,
    # como passenger.satisfaction, y esos no son de esto).
    sueltos = [texto for _, texto in juego.log if "attribute not handled id: 5" in texto]
    if sueltos:
        raise SystemExit(f"game.log.txt: {sueltos[0]!r}")


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

        _trabajo_de_bus(juego, telemetry_compat.get_data)

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

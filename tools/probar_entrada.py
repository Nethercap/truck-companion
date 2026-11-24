"""Los botones del plugin (truckdash_input.cpp) con un juego de mentira.

Lo usan probar_plugin.py (la DLL) y probar_plugin_linux.py (el .so): registran
el dispositivo, llaman a los callbacks como el juego, cuadro por cuadro, y los
toques los pide el cliente de verdad (client/entrada_sdk.py).

Se corre dos veces, con el juego apagando first_in_frame en las llamadas
repetidas de un cuadro (lo que dice el SDK) y dejandolo prendido (lo que hace,
segun TruckTel): tiene que dar lo mismo.

Usa el bloque de verdad ("TruckDashInput"): con el juego abierto en esta PC le
mandaria los toques de la prueba.
"""

import ctypes
import os
import shutil
import sys
import tempfile
import threading
import time

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "client"))

import entrada_sdk  # noqa: E402

INPUT_1_00 = 1 << 16
SEMANTICAL = 2  # SCS_INPUT_DEVICE_TYPE_semantical
TIPO_BOOL = 1
OK, NO_SOPORTADO, NO_HAY, ERROR = 0, -1, -4, -7
PRIMERA_DEL_CUADRO, PRIMERA_ACTIVO = 1, 2
VENCIDO, DESCONOCIDO = 2, 3  # TD_INPUT_EXPIRED, TD_INPUT_UNKNOWN
APAGADO = "truckdash-no-input.txt"  # TD_INPUT_OFF_FILE


class EntradaSdk(ctypes.Structure):  # scs_input_device_input_t
    _fields_ = [("name", ctypes.c_char_p), ("display_name", ctypes.c_char_p),
                ("value_type", ctypes.c_uint32), ("_padding", ctypes.c_uint32)]


class Evento(ctypes.Structure):  # scs_input_event_t
    _fields_ = [("input_index", ctypes.c_uint32), ("valor", ctypes.c_ubyte * 24)]


class Dispositivo(ctypes.Structure):  # scs_input_device_t
    _fields_ = [("name", ctypes.c_char_p), ("display_name", ctypes.c_char_p),
                ("type", ctypes.c_uint32), ("input_count", ctypes.c_uint32),
                ("inputs", ctypes.POINTER(EntradaSdk)), ("callback_context", ctypes.c_void_p),
                ("input_active_callback", ctypes.c_void_p), ("input_event_callback", ctypes.c_void_p)]


LOG = ctypes.CFUNCTYPE(None, ctypes.c_int32, ctypes.c_char_p)
REGISTRAR = ctypes.CFUNCTYPE(ctypes.c_int32, ctypes.POINTER(Dispositivo))
CB_ACTIVO = ctypes.CFUNCTYPE(None, ctypes.c_uint8, ctypes.c_void_p)
CB_EVENTO = ctypes.CFUNCTYPE(ctypes.c_int32, ctypes.POINTER(Evento), ctypes.c_uint32, ctypes.c_void_p)


class Params(ctypes.Structure):  # scs_input_init_params_v100_t
    _fields_ = [("game_name", ctypes.c_char_p), ("game_id", ctypes.c_char_p),
                ("game_version", ctypes.c_uint32), ("log", LOG), ("register_device", REGISTRAR)]


for _tipo, _tamano in ((EntradaSdk, 24), (Evento, 28), (Dispositivo, 56), (Params, 40)):
    if ctypes.sizeof(_tipo) != _tamano:
        raise SystemExit(f"{_tipo.__name__} mide {ctypes.sizeof(_tipo)}, no {_tamano}")


class JuegoFalso:
    def __init__(self, acepta: bool = True, bandera_fija: bool = False):
        self.acepta = acepta
        self.bandera_fija = bandera_fija
        self.registrados = []  # (nombre, tipo, [(mix, tipo del valor)])
        self.log = []
        self.cuadros = 0
        self.params = Params(b"Euro Truck Simulator 2", b"eut2", 1 << 16,
                             LOG(lambda tipo, texto: self.log.append(texto.decode())),
                             REGISTRAR(self._registrar))

    def _registrar(self, puntero):
        d = puntero.contents
        self.registrados.append((d.name.decode(), d.type,
                                 [(d.inputs[i].name.decode(), d.inputs[i].value_type)
                                  for i in range(d.input_count)]))
        if not self.acepta:
            return ERROR
        self._activo = CB_ACTIVO(d.input_active_callback)
        self._evento = CB_EVENTO(d.input_event_callback)
        self._contexto = d.callback_context
        return OK

    def activo(self, si: bool) -> None:
        self._activo(1 if si else 0, self._contexto)

    def cuadro(self, tras_activar: bool = False) -> list:
        """Lo que el plugin da en un cuadro: se le pregunta hasta que dice que
        no hay mas."""
        self.cuadros += 1
        eventos = []
        for vuelta in range(50):
            flags = 0
            if vuelta == 0 or self.bandera_fija:
                flags = PRIMERA_DEL_CUADRO | (PRIMERA_ACTIVO if tras_activar else 0)
            evento = Evento(input_index=0xFFFFFFFF)
            r = self._evento(ctypes.byref(evento), flags, self._contexto)
            if r == NO_HAY:
                return eventos
            if r != OK:
                raise SystemExit(f"el callback devolvio {r}: el juego desconecta el dispositivo")
            eventos.append((evento.input_index, evento.valor[0]))
        raise SystemExit("el plugin no termina nunca el cuadro")


def _fallar(que: str) -> None:
    raise SystemExit(f"entrada: {que}")


def _botones() -> "entrada_sdk.Botones":
    botones = entrada_sdk.Botones()
    botones.leer_raw = lambda: None  # sin telemetria: no mira si hizo efecto
    return botones


def _correr(juego: JuegoFalso, *mixes, cuadro_s: float = 0.01) -> tuple:
    """El cliente aprieta esos mixes mientras el juego corre a 100 fps.
    Devuelve lo que dijo cada uno y los eventos (ms, cuadro, indice, valor)."""
    botones, dichos, eventos = _botones(), [], []
    hilo = threading.Thread(target=lambda: dichos.extend(botones.apretar(m, lambda: False) for m in mixes))
    juego.cuadro()  # el juego ya estaba pidiendo entrada
    hilo.start()
    limite = time.monotonic() + 5
    de_mas = 0
    while de_mas < 15:
        for indice, valor in juego.cuadro():
            eventos.append((time.monotonic() * 1000, juego.cuadros, indice, valor))
        de_mas = de_mas + 1 if not hilo.is_alive() else 0
        if time.monotonic() > limite:
            _fallar(f"{mixes}: no termina ({eventos})")
        time.sleep(cuadro_s)
    hilo.join()
    return dichos, eventos


def _es_un_toque(eventos: list, indice: int, que: str) -> None:
    if [(i, v) for _, _, i, v in eventos] != [(indice, 1), (indice, 0)]:
        _fallar(f"{que}: el juego recibio {eventos}")
    (t1, c1, _, _), (t2, c2, _, _) = eventos
    if c2 - c1 < 3 or not 60 <= t2 - t1 < 400:
        _fallar(f"{que}: apretado {t2 - t1:.0f} ms y {c2 - c1} cuadros")


def _pedido(bloque, boton=0, edad_ms=0, fin=True) -> int:
    """Un pedido escrito a mano, sin esperar la respuesta."""
    ident = bloque.leer("request") + 1
    bloque.escribir("button", boton)
    bloque.escribir("requestTick", entrada_sdk.ahora_ms() - edad_ms)
    bloque.escribir("request", ident)
    if fin:
        bloque.escribir("requestEnd", ident)
    return ident


def _pasada(lib, bandera_fija: bool) -> None:
    juego = JuegoFalso(bandera_fija=bandera_fija)
    if lib.scs_input_init(2 << 16, ctypes.byref(juego.params)) != NO_SOPORTADO or juego.registrados:
        _fallar("acepto una version de la API que no conoce")
    if lib.scs_input_init(INPUT_1_00, ctypes.byref(juego.params)) != OK:
        _fallar("init no devolvio ok")
    esperado = ("truckdash", SEMANTICAL, [(m, TIPO_BOOL) for m in entrada_sdk.BOTONES])
    if juego.registrados != [esperado]:
        _fallar(f"registro {juego.registrados}")

    bloque = entrada_sdk.abrir()
    if bloque is None or bloque.leer("revision") != entrada_sdk.REVISION:
        _fallar("el cliente no encuentra el bloque")
    if bloque.leer("buttons") != len(entrada_sdk.BOTONES) or not bloque.leer("session"):
        _fallar("cabecera del bloque")
    if entrada_sdk.estado(bloque) != entrada_sdk.QUIETO:
        _fallar("activo sin que el juego haya pedido nada")

    # Sin pedidos no manda nada: un 0 por cuadro tambien es mandar.
    if any(juego.cuadro() for _ in range(30)):
        _fallar("mando algo sin que nadie lo pidiera")
    if entrada_sdk.estado(bloque) != entrada_sdk.ACTIVO:
        _fallar("el juego pide entrada y el bloque dice que no")
    juego.activo(False)
    if entrada_sdk.estado(bloque) != entrada_sdk.QUIETO:
        _fallar("el juego lo desactivo y el bloque dice activo")
    juego.activo(True)

    # Cada boton, pedido por el cliente: un toque y nada mas.
    for indice, mix in enumerate(entrada_sdk.BOTONES):
        dichos, eventos = _correr(juego, mix)
        if dichos != [True]:
            _fallar(f"{mix}: el cliente dice que no se apreto")
        _es_un_toque(eventos, indice, mix)
    # Dos seguidos del mismo son dos toques, con el boton suelto en el medio.
    dichos, eventos = _correr(juego, "light", "light")
    if dichos != [True, True] or len(eventos) != 4:
        _fallar(f"dos toques: {dichos} {eventos}")
    _es_un_toque(eventos[:2], 8, "primer toque")
    _es_un_toque(eventos[2:], 8, "segundo toque")
    if eventos[2][1] - eventos[1][1] < 2:
        _fallar("el segundo toque llega en el mismo cuadro que se suelta el primero")
    # A 12 fps los 80 ms son un cuadro: tienen que ser tres igual.
    dichos, eventos = _correr(juego, "engine", cuadro_s=0.08)
    if dichos != [True]:
        _fallar("a 12 fps no aprieta")
    _es_un_toque(eventos, 4, "a 12 fps")
    if bloque.leer("presses") != len(entrada_sdk.BOTONES) + 3:
        _fallar(f"presses = {bloque.leer('presses')}")

    # Un pedido viejo no se aprieta nunca: el cliente ya uso la tecla.
    ident = _pedido(bloque, 8, edad_ms=entrada_sdk.ACEPTA_MS + 100)
    if [e for _ in range(20) for e in juego.cuadro()] or bloque.leer("done") != ident or bloque.leer("result") != VENCIDO:
        _fallar("apreto un pedido vencido")
    # Uno con el reloj de mas adelante, tampoco.
    ident = _pedido(bloque, 8, edad_ms=-entrada_sdk.ACEPTA_MS - 100)
    if [e for _ in range(20) for e in juego.cuadro()] or bloque.leer("result") != VENCIDO:
        _fallar("apreto un pedido del futuro")
    # Un boton que no tiene.
    ident = _pedido(bloque, len(entrada_sdk.BOTONES))
    if [e for _ in range(20) for e in juego.cuadro()] or bloque.leer("done") != ident or bloque.leer("result") != DESCONOCIDO:
        _fallar("apreto un boton que no existe")
    # A medio escribir (todavia sin requestEnd) y despues retirado.
    ident = _pedido(bloque, 8, fin=False)
    if [e for _ in range(5) for e in juego.cuadro()] or bloque.leer("done") == ident:
        _fallar("apreto un pedido a medio escribir")
    bloque.escribir("requestEnd", ident + 7)
    if [e for _ in range(5) for e in juego.cuadro()] or bloque.leer("done") == ident + 7:
        _fallar("apreto un pedido con el numero escrito por la mitad")
    bloque.escribir("requestEnd", 0)
    if [e for _ in range(5) for e in juego.cuadro()] or bloque.leer("done") == ident:
        _fallar("apreto un pedido retirado")
    # El bloque en cero (otro juego que se abre lo limpia) no es un pedido.
    bloque.escribir("request", 0)
    bloque.escribir("requestTick", entrada_sdk.ahora_ms())
    if [e for _ in range(5) for e in juego.cuadro()]:
        _fallar("apreto sin numero de pedido")
    bloque.escribir("request", ident)

    # El juego pierde el foco con el boton apretado: al volver se suelta una
    # vez, y lo que se pidio mientras no estaba no se aprieta en ese cuadro.
    _pedido(bloque, 6)
    if juego.cuadro() != [(6, 1)]:
        _fallar("no apreto la camara")
    juego.activo(False)
    time.sleep(0.02)
    juego.activo(True)
    _pedido(bloque, 8)
    if juego.cuadro(tras_activar=True) != [(6, 0)]:
        _fallar("volvio el foco y el boton quedo apretado")
    siguen = [e for _ in range(5) for e in juego.cuadro()]
    if siguen[:1] != [(8, 1)]:
        _fallar(f"despues de volver el foco: {siguen}")
    time.sleep(0.1)
    if [e for _ in range(5) for e in juego.cuadro()] != [(8, 0)]:
        _fallar("el toque de despues de volver el foco no se solto")
    # Pedido con el juego atras (el cliente lo trae al frente): se aprieta
    # despues del cuadro en que vuelve, no en ese.
    juego.activo(False)
    _pedido(bloque, 10)
    juego.activo(True)
    if juego.cuadro(tras_activar=True) or juego.cuadro() != [(10, 1)]:
        _fallar("el pedido hecho con el juego atras")
    time.sleep(0.1)
    if [e for _ in range(5) for e in juego.cuadro()] != [(10, 0)]:
        _fallar("el pedido hecho con el juego atras no se solto")

    # Sin cuadros (cargando, colgado) deja de estar activo solo.
    time.sleep(entrada_sdk.QUIETO_MS / 1000 + 0.1)
    if entrada_sdk.estado(bloque) != entrada_sdk.QUIETO:
        _fallar("activo sin cuadros hace mas de un segundo")
    inicio = time.monotonic()
    if _botones().apretar("light", lambda: False) or time.monotonic() - inicio > 0.3:
        _fallar("sin cuadros el cliente no cayo a la tecla")

    # Se apaga, se prende otra vez (la consola del juego tiene "sdk reinit") y
    # sigue andando, en otra sesion.
    sesion, ultimo = bloque.leer("session"), bloque.leer("done")
    lib.scs_input_shutdown()
    if entrada_sdk.estado(bloque) != entrada_sdk.SIN_PLUGIN:
        _fallar("apagado y el bloque sigue diciendo que esta")
    if juego.cuadro():
        _fallar("apagado y sigue mandando")
    juego.activo(True)
    lib.scs_input_shutdown()
    bloque.cerrar()
    time.sleep(0.02)
    if lib.scs_input_init(INPUT_1_00, ctypes.byref(juego.params)) != OK:
        _fallar("no vuelve a prender")
    bloque = entrada_sdk.abrir()
    if bloque.leer("session") == sesion:
        _fallar("la sesion nueva dice que es la de antes")
    bloque.escribir("request", ultimo - 1)  # el mismo numero que el ultimo de antes
    dichos, eventos = _correr(juego, "wipers")
    if dichos != [True]:
        _fallar("despues de apagar y prender no aprieta")
    _es_un_toque(eventos, 12, "despues de apagar y prender")
    bloque.cerrar()
    lib.scs_input_shutdown()

    # Si el juego no registra el dispositivo, init dice que si igual (la
    # telemetria es del mismo plugin) y no queda bloque.
    terco = JuegoFalso(acepta=False)
    if lib.scs_input_init(INPUT_1_00, ctypes.byref(terco.params)) != OK or not terco.log:
        _fallar("con el registro rechazado")
    sobra = entrada_sdk.abrir()
    if entrada_sdk.estado(sobra) != entrada_sdk.SIN_PLUGIN:
        _fallar("con el registro rechazado quedo el bloque")
    if sobra is not None:
        sobra.cerrar()
    lib.scs_input_shutdown()


def probar(lib) -> None:
    """Corre todo con una biblioteca ya cargada. SystemExit si algo falla."""
    for nombre in ("scs_input_init", "scs_input_shutdown"):
        if not hasattr(lib, nombre):
            _fallar(f"no exporta {nombre}")
    lib.scs_input_init.restype = ctypes.c_int32
    lib.scs_input_init.argtypes = [ctypes.c_uint32, ctypes.c_void_p]
    lib.scs_input_shutdown.restype = None
    _pasada(lib, bandera_fija=False)
    _pasada(lib, bandera_fija=True)


def probar_apagado(cargar, dll: str) -> None:
    """Con truckdash-no-input.txt al lado de la DLL no se registra nada.
    `cargar` abre una copia de la DLL y devuelve (lib, soltar). Solo Windows."""
    carpeta = tempfile.mkdtemp(prefix="truckdash-entrada-")
    try:
        copia = os.path.join(carpeta, "truckdash-telemetry.dll")
        shutil.copyfile(dll, copia)
        with open(os.path.join(carpeta, APAGADO), "w"):
            pass
        lib, soltar = cargar(copia)
        lib.scs_input_init.restype = ctypes.c_int32
        lib.scs_input_init.argtypes = [ctypes.c_uint32, ctypes.c_void_p]
        juego = JuegoFalso()
        if lib.scs_input_init(INPUT_1_00, ctypes.byref(juego.params)) != OK or juego.registrados:
            _fallar(f"con {APAGADO} registro igual el dispositivo")
        bloque = entrada_sdk.abrir()
        if entrada_sdk.estado(bloque) != entrada_sdk.SIN_PLUGIN:
            _fallar(f"con {APAGADO} el cliente ve los botones")
        soltar()
    finally:
        shutil.rmtree(carpeta, ignore_errors=True)

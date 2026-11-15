"""Carga y descarga el plugin de Windows como el juego, para ver que no se cae.

Uso: python tools/probar_plugin.py <ruta a la DLL>

Cuatro pasadas, cada una en un proceso aparte:
- "init": scs_telemetry_init, scs_telemetry_shutdown y FreeLibrary, que es lo
  que hace el juego al abrir y al cerrar. Al soltar la DLL, DllMain vuelve a
  llamar a scs_telemetry_shutdown.
- "sin-init": LoadLibrary y FreeLibrary, como cuando init falla y el juego
  suelta el plugin.
- "tmp": la parte de TruckersMP (truckersmp_players.cpp) con un cliente de
  TMP de mentira (TmpFalso): jugadores que entran y salen, cada cuadro, la
  desconexion y truckersmp_shutdown. Lo que publica el plugin se lee con el
  lector del cliente (client/tmp_players.py) y se compara con lo que dio el
  TMP falso. Al final no tiene que quedar ningun listener ni nada sin
  liberar.
- "tmp-rechazado": un TMP sin la parte de jugadores. truckersmp_init tiene
  que decir que no, sin dejar listeners, y TMP suelta la DLL sin llamar a
  truckersmp_shutdown.
- "tmp-overlay": el overlay adentro del juego (truckersmp_overlay.cpp) con un
  dispositivo D3D11 de verdad (WARP, el de software de Windows) que el TMP
  falso da como el suyo. El cliente escribe una imagen en el bloque
  (client/overlay_juego.py), se dispara el evento de despues de dibujar con un
  render target atado, y se leen sus pixeles: la imagen en su lugar, mezclada
  con su alfa, nada afuera, y el estado del pipeline como estaba. Tambien en
  un render target sRGB, con OpenGL (no dibuja y lo dice) y oculto.

La DLL del 30-09 se caia en las dos primeras: la segunda llamada a shutdown
escribia en el bloque ya desmapeado, y sin init en un puntero nulo.
FreeLibrary se traga esa excepcion, pero el juego no: en el Visor de eventos
quedaba un access violation en truckdash-telemetry.dll+0x537d en cada cierre
de ETS2 y de ATS. Por eso el proceso de prueba pone un manejador vectorizado,
que ve la excepcion antes que el loader, como el del juego.

Antes de las pasadas mira que DLLs importa (`runtime_de_visual_cpp`): con el
runtime de C++ en una DLL aparte (MSVCP140, VCRUNTIME140) el plugin no carga
en una PC sin el Visual C++ Redistributable, el juego no muestra el dialogo
del SDK y Setup dice "the game hasn't loaded it" (Reddit, 25-10, Windows 11).
El runner de Actions trae ese runtime y la carga de aca no lo ve.

Lo corren "Build plugin" antes de fijar una DLL nueva, los tests con la DLL
recien compilada y el test del cliente con la que trae el cliente.
"""

import ctypes
import os
import re
import struct
import subprocess
import sys
import time

PASADAS = ("init", "sin-init", "tmp", "tmp-rechazado", "tmp-overlay")
# Las DLLs del Visual C++ Redistributable, que Windows no trae. El CRT
# universal (ucrtbase, api-ms-win-crt-*) y msvcrt.dll si vienen con Windows.
RUNTIME_VISUAL_CPP = re.compile(r"^(vcruntime|msvcp|msvcr|concrt|vccorlib|vcomp)\d", re.IGNORECASE)
ACCESS_VIOLATION = 0xC0000005
# SCS_TELEMETRY_VERSION_1_01 y la version del SDK de ETS2 de los headers
# (SCS_MAKE_VERSION(1, 18)): con esas init registra todos los canales.
TELEMETRY_1_01 = (1 << 16) | 1
ETS2_SDK_1_18 = (1 << 16) | 18

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _cargar(dll: str):
    """LoadLibrary con el manejador vectorizado puesto. Devuelve kernel32 y
    el handle de la DLL."""
    from ctypes import wintypes as w

    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    k32.LoadLibraryW.argtypes = [w.LPCWSTR]
    k32.LoadLibraryW.restype = w.HMODULE
    k32.FreeLibrary.argtypes = [w.HMODULE]
    k32.GetCurrentProcess.restype = w.HANDLE
    k32.TerminateProcess.argtypes = [w.HANDLE, w.UINT]
    k32.AddVectoredExceptionHandler.argtypes = [w.ULONG, ctypes.c_void_p]
    k32.AddVectoredExceptionHandler.restype = ctypes.c_void_p

    h = k32.LoadLibraryW(dll)
    if not h:
        raise SystemExit(f"no carga: error {ctypes.get_last_error()}")
    # Donde quedo la DLL en memoria (SizeOfImage de la cabecera PE32+): solo
    # cuentan los access violation de adentro de ella.
    pe = h + ctypes.c_int32.from_address(h + 0x3C).value
    fin = h + ctypes.c_uint32.from_address(pe + 0x50).value

    def manejador(info):
        # EXCEPTION_POINTERS -> EXCEPTION_RECORD: ExceptionCode y, a +16,
        # ExceptionAddress.
        registro = ctypes.c_void_p.from_address(info).value
        codigo = ctypes.c_uint32.from_address(registro).value
        donde = ctypes.c_void_p.from_address(registro + 16).value or 0
        if codigo == ACCESS_VIOLATION and h <= donde < fin:
            print(f"access violation en +{donde - h:#x}", flush=True)
            k32.TerminateProcess(k32.GetCurrentProcess(), ACCESS_VIOLATION)
        return 0  # EXCEPTION_CONTINUE_SEARCH

    veh = ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_void_p)(manejador)
    k32.AddVectoredExceptionHandler(1, veh)
    # El callback tiene que vivir hasta que termine el proceso.
    _cargar.vivos = [veh]
    return k32, h


def _pasada_scs(dll: str, h, con_init: bool) -> None:
    if not con_init:
        return
    # scs_telemetry_init_params_v101_t: los parametros comunes del SDK y las
    # cuatro funciones de registro, que aca solo dicen que si.
    log = ctypes.CFUNCTYPE(None, ctypes.c_int32, ctypes.c_char_p)
    reg_evento = ctypes.CFUNCTYPE(ctypes.c_int32, ctypes.c_uint32, ctypes.c_void_p, ctypes.c_void_p)
    unreg_evento = ctypes.CFUNCTYPE(ctypes.c_int32, ctypes.c_uint32)
    reg_canal = ctypes.CFUNCTYPE(ctypes.c_int32, ctypes.c_char_p, ctypes.c_uint32, ctypes.c_uint32,
                                 ctypes.c_uint32, ctypes.c_void_p, ctypes.c_void_p)
    unreg_canal = ctypes.CFUNCTYPE(ctypes.c_int32, ctypes.c_char_p, ctypes.c_uint32, ctypes.c_uint32)

    class Params(ctypes.Structure):
        _fields_ = [("game_name", ctypes.c_char_p), ("game_id", ctypes.c_char_p),
                    ("game_version", ctypes.c_uint32), ("log", log),
                    ("register_for_event", reg_evento), ("unregister_from_event", unreg_evento),
                    ("register_for_channel", reg_canal), ("unregister_from_channel", unreg_canal)]

    params = Params(b"Euro Truck Simulator 2", b"eut2", ETS2_SDK_1_18,
                    log(lambda tipo, texto: None), reg_evento(lambda *a: 0), unreg_evento(lambda *a: 0),
                    reg_canal(lambda *a: 0), unreg_canal(lambda *a: 0))
    lib = ctypes.CDLL(dll, handle=h)
    lib.scs_telemetry_shutdown.restype = None
    r = lib.scs_telemetry_init(TELEMETRY_1_01, ctypes.byref(params))
    if r != 0:
        raise SystemExit(f"init devolvio {r}")
    lib.scs_telemetry_shutdown()


# ------------------------------------------------------------- TruckersMP

# plugin/truckersmp_sdk/include/TruckersMP/TruckersMP.h
TMP_SDK_1_1_0 = 0x01000100
API_CORE = 0x611C12F8A74565EC
API_NETWORK = 0x9C2C7FB50B69537D
API_PLAYERS = 0x91BF40DFAD9C41EB
API_PLAYER_HANDLE = 0x8EE27B0CCFAEE795
API_RENDER = 0xE679194985C097E0
API_VEHICLE = 0x246B095F10333D2F
EVT_DISCONNECTED = 0xA9E12170E5CA1702
EVT_STREAM_IN = 0x095C1192F5DA21CD
EVT_STREAM_OUT = 0x702C3C15A6DFF3EE
EVT_PRE_RENDER = 0x62B8AFF307976B31
EVT_POST_RENDER = 0xE4C430A67C63B3BE

# Cuaterniones (w, x, y, z): mirando al norte (-Z, el frente del vehiculo) y
# girado 90 grados sobre Y, al oeste.
NORTE = (1.0, 0.0, 0.0, 0.0)
OESTE = (0.70710678, 0.0, 0.70710678, 0.0)


class _Texto(ctypes.Structure):  # TruckersMP_String
    _fields_ = [("ptr", ctypes.c_void_p), ("size", ctypes.c_uint32)]


class _Lista(ctypes.Structure):  # TruckersMP_List
    _fields_ = [("items", ctypes.c_void_p), ("count", ctypes.c_uint32), ("stride", ctypes.c_uint32)]


class _Ubicacion(ctypes.Structure):  # TruckersMP_Placement
    _fields_ = [("x", ctypes.c_double), ("y", ctypes.c_double), ("z", ctypes.c_double),
                ("qw", ctypes.c_float), ("qx", ctypes.c_float), ("qy", ctypes.c_float), ("qz", ctypes.c_float)]


class _Host(ctypes.Structure):  # TruckersMP_Host
    _fields_ = [("size", ctypes.c_uint32), ("ctx", ctypes.c_void_p), ("DeclareVersion", ctypes.c_void_p),
                ("GetApi", ctypes.c_void_p), ("Free", ctypes.c_void_p)]


class _Desc(ctypes.Structure):  # TruckersMP_PluginDesc
    _fields_ = [("size", ctypes.c_uint32), ("name", ctypes.c_char * 64), ("author", ctypes.c_char * 64),
                ("version", ctypes.c_char * 32), ("description", ctypes.c_char * 512)]


# Todas las funciones de las tablas reciben el contexto primero. En x64 un
# handle (struct de 8 bytes) va como un entero, y un struct de mas de 8
# bytes por valor (TruckersMP_String en LogMessage) va como puntero a una
# copia: por eso aca son c_uint64 y c_void_p.
_P = ctypes.c_void_p
_SALIDA = ctypes.CFUNCTYPE(ctypes.c_bool, _P, _P)                    # (ctx, out)
_SALIDA_DE = ctypes.CFUNCTYPE(ctypes.c_bool, _P, ctypes.c_uint64, _P)  # (ctx, handle, out)
_POR_ID = ctypes.CFUNCTYPE(ctypes.c_bool, _P, ctypes.c_int32, _P)
_OYENTE = ctypes.CFUNCTYPE(ctypes.c_int32, _P, ctypes.c_uint64, _P, _P)
_LOG = ctypes.CFUNCTYPE(ctypes.c_int32, _P, ctypes.c_int32, _P)
_NADA = ctypes.CFUNCTYPE(ctypes.c_bool)  # lo que el plugin no usa: no hay dato
_VERSION = ctypes.CFUNCTYPE(ctypes.c_int32, _P, ctypes.c_uint32)
_API = ctypes.CFUNCTYPE(_P, _P, ctypes.c_uint64)
_LIBERAR = ctypes.CFUNCTYPE(None, _P, _P)
_EVENTO = ctypes.CFUNCTYPE(None, _P, ctypes.c_uint64, _P, ctypes.c_uint32)


class TmpFalso:
    """Un cliente de TruckersMP de mentira, con las tablas del Client SDK que
    usa el plugin. Los jugadores son {handle: dict}; el local es LOCAL."""

    LOCAL = 100

    def __init__(self, jugadores: dict, con_jugadores: bool = True, dispositivo=None):
        self.jugadores = jugadores
        # El render: el ID3D11Device que da GetDeviceHandle (None: no da
        # nada, como hasta ahora) y el renderer (1 DirectX 11, 0 OpenGL).
        self.dispositivo = dispositivo
        self.renderer = 1
        self.cargados = []  # lo que devuelve GetAllPlayers
        self.conectado = True
        self.oyentes = []  # (evento, funcion, contexto)
        self.vivos = {}  # lo entregado al plugin que tiene que devolver con Free
        self.errores = []
        self.logs = []
        self._cbs = []
        nada = self._cb(_NADA, lambda *a: False)

        def tabla(*funciones):
            t = (_P * len(funciones))(*[ctypes.cast(f, _P) for f in funciones])
            self._cbs.append(t)
            return t

        self.tablas = {
            API_CORE: tabla(self._cb(_OYENTE, self._agregar), self._cb(_OYENTE, self._sacar), nada,
                            self._cb(_LOG, self._log), nada, nada),
            API_NETWORK: tabla(self._cb(_SALIDA, self._conectado), nada,
                               self._cb(_SALIDA, lambda c, o: self._escribir(o, ctypes.c_uint64, 2))),
            API_RENDER: tabla(self._cb(_SALIDA, self._renderer), self._cb(_SALIDA, self._dispositivo)),
            API_VEHICLE: tabla(nada, self._cb(_SALIDA_DE, self._ubicacion),
                               self._cb(_SALIDA_DE, self._velocidad), nada, nada),
        }
        if con_jugadores:
            self.tablas[API_PLAYERS] = tabla(
                self._cb(_SALIDA, lambda c, o: self._escribir(o, ctypes.c_uint64, self.LOCAL)),
                self._cb(_POR_ID, self._por_id), self._cb(_SALIDA, self._todos))
            handle = [nada] * 18
            handle[0] = self._cb(_SALIDA_DE, lambda c, h, o: self._dato(h, o, "id", ctypes.c_int32))
            handle[1] = self._cb(_SALIDA_DE, lambda c, h, o: self._dato(h, o, "cuenta", ctypes.c_uint64))
            handle[3] = self._cb(_SALIDA_DE, self._nombre)
            handle[13] = self._cb(_SALIDA_DE, self._vehiculo)
            handle[15] = self._cb(_SALIDA_DE, lambda c, h, o: self._dato(h, o, "distancia", ctypes.c_float))
            self.tablas[API_PLAYER_HANDLE] = tabla(*handle)

        self.host = _Host(ctypes.sizeof(_Host), 1,
                          ctypes.cast(self._cb(_VERSION, self._version), _P),
                          ctypes.cast(self._cb(_API, self._api), _P),
                          ctypes.cast(self._cb(_LIBERAR, self._liberar), _P))

    def _cb(self, tipo, funcion):
        cb = tipo(funcion)
        self._cbs.append(cb)
        return cb

    @staticmethod
    def _escribir(salida, tipo, valor) -> bool:
        tipo.from_address(salida).value = valor
        return True

    def _version(self, ctx, version):
        return 0 if version == TMP_SDK_1_1_0 else 4  # Ok / NotSupported

    def _api(self, ctx, ident):
        tabla = self.tablas.get(ident)
        return ctypes.addressof(tabla) if tabla is not None else None

    def _entregar(self, buffer) -> int:
        direccion = ctypes.addressof(buffer)
        self.vivos[direccion] = buffer
        return direccion

    def _liberar(self, ctx, puntero):
        if self.vivos.pop(puntero, None) is None:
            self.errores.append(f"Free de algo que no se entrego ({puntero})")

    def _agregar(self, ctx, evento, funcion, contexto):
        self.oyentes.append((evento, funcion, contexto))
        return 0

    def _sacar(self, ctx, evento, funcion, contexto):
        if (evento, funcion, contexto) not in self.oyentes:
            self.errores.append(f"RemoveListener de un listener que no estaba ({evento:#x})")
            return 2
        self.oyentes.remove((evento, funcion, contexto))
        return 0

    def _log(self, ctx, nivel, texto):
        t = _Texto.from_address(texto)
        self.logs.append((nivel, ctypes.string_at(t.ptr, t.size).decode("utf-8", "replace")))
        return 0

    def _renderer(self, ctx, salida):
        return self.dispositivo is not None and self._escribir(salida, ctypes.c_int32, self.renderer)

    def _dispositivo(self, ctx, salida):
        return self.dispositivo is not None and self._escribir(salida, ctypes.c_uint64, self.dispositivo)

    def _conectado(self, ctx, salida):
        return self._escribir(salida, ctypes.c_bool, self.conectado)

    def _por_id(self, ctx, ident, salida):
        for handle, j in self.jugadores.items():
            if j["id"] == ident:
                return self._escribir(salida, ctypes.c_uint64, handle)
        return False

    def _todos(self, ctx, salida):
        handles = (ctypes.c_uint64 * len(self.cargados))(*self.cargados)
        lista = _Lista.from_address(salida)
        lista.items = self._entregar(handles)
        lista.count = len(self.cargados)
        lista.stride = 8
        return True

    def _dato(self, handle, salida, campo, tipo):
        j = self.jugadores.get(handle)
        return j is not None and self._escribir(salida, tipo, j[campo])

    def _nombre(self, ctx, handle, salida):
        j = self.jugadores.get(handle)
        if j is None:
            return False
        datos = j["nombre"].encode("utf-8")
        texto = _Texto.from_address(salida)
        texto.ptr = self._entregar(ctypes.create_string_buffer(datos, len(datos)))
        texto.size = len(datos)
        return True

    # El vehiculo de un jugador es su handle + 1000.
    def _vehiculo(self, ctx, handle, salida):
        j = self.jugadores.get(handle)
        if j is None or j.get("pos") is None:
            return False
        return self._escribir(salida, ctypes.c_uint64, handle + 1000)

    def _ubicacion(self, ctx, vehiculo, salida):
        j = self.jugadores.get(vehiculo - 1000)
        if j is None:
            return False
        u = _Ubicacion.from_address(salida)
        u.x, u.y, u.z = j["pos"]
        u.qw, u.qx, u.qy, u.qz = j["giro"]
        return True

    def _velocidad(self, ctx, vehiculo, salida):
        j = self.jugadores.get(vehiculo - 1000)
        if j is None:
            return False
        (ctypes.c_float * 3).from_address(salida)[:] = j["vel"]
        return True

    def disparar(self, evento, handle=None):
        """Llama a los listeners de ese evento, con el jugador como payload
        (TruckersMP_Evt_PlayerStreamIn/Out) si hay uno."""
        payload = ctypes.c_uint64(handle) if handle is not None else None
        for ev, funcion, contexto in list(self.oyentes):
            if ev == evento:
                _EVENTO(funcion)(contexto, ev, ctypes.byref(payload) if payload is not None else None,
                                 8 if payload is not None else 0)


def _jugadores():
    return {
        TmpFalso.LOCAL: {"id": 1, "cuenta": 4000, "nombre": "Yo", "pos": (0.0, 0.0, 0.0), "giro": NORTE,
                         "vel": (0.0, 0.0, 0.0), "distancia": 0.0},
        101: {"id": 7, "cuenta": 5001, "nombre": "Ana", "pos": (100.0, 2.0, -50.0), "giro": OESTE,
              "vel": (-10.0, 0.0, 0.0), "distancia": 120.0},
        # Con letras de mas de un byte en UTF-8.
        102: {"id": 9, "cuenta": 5002, "nombre": "Łukasz", "pos": (-20.0, 1.0, 30.0), "giro": NORTE,
              "vel": (0.0, 0.0, -5.0), "distancia": 40.0},
        # Sin vehiculo (a pie o recien conectado): no se publica.
        103: {"id": 12, "cuenta": 5003, "nombre": "Bo", "pos": None, "distancia": 10.0},
    }


def _pasada_tmp(dll: str, h, con_jugadores: bool) -> None:
    sys.path.insert(0, os.path.join(RAIZ, "client"))
    import tmp_players

    lib = ctypes.CDLL(dll, handle=h)
    if not hasattr(lib, "truckersmp_init"):
        raise SystemExit("la DLL no exporta truckersmp_init")
    lib.truckersmp_init.restype = ctypes.c_bool
    lib.truckersmp_init.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
    lib.truckersmp_shutdown.restype = None

    tmp = TmpFalso(_jugadores(), con_jugadores)
    tmp.cargados = [TmpFalso.LOCAL, 101, 103]
    desc = _Desc(ctypes.sizeof(_Desc))
    aceptado = lib.truckersmp_init(ctypes.byref(tmp.host), ctypes.byref(desc))

    def fallar(motivo):
        raise SystemExit(f"{motivo} (logs: {tmp.logs}, errores: {tmp.errores})")

    if desc.name != b"Truck Dash":
        fallar(f"el plugin se presenta como {desc.name!r}")
    if not con_jugadores:
        # Rechazado: TMP lo suelta sin truckersmp_shutdown, asi que init ya
        # tiene que haber limpiado todo.
        if aceptado:
            fallar("truckersmp_init acepto un TMP sin la parte de jugadores")
        if tmp.oyentes or tmp.vivos or tmp.errores:
            fallar(f"quedaron {len(tmp.oyentes)} listeners y {len(tmp.vivos)} cosas sin liberar")
        return
    if not aceptado:
        fallar("truckersmp_init dijo que no")

    lector = tmp_players.Lector()

    def leer(que):
        jugadores = lector.leer()
        if jugadores is None:
            fallar(f"{que}: el lector no encontro el bloque")
        return [(j["id"], j["name"], j["x"], j["z"], j["heading"], j["speedKmh"]) for j in jugadores]

    def cuadro():
        # El plugin escribe como mucho cada 250 ms.
        time.sleep(0.3)
        tmp.disparar(EVT_PRE_RENDER)

    ana = (7, "Ana", 100.0, -50.0, 270, 36)
    lukasz = (9, "Łukasz", -20.0, 30.0, 0, 18)
    # init publica lo de GetAllPlayers: Ana. Bo no tiene vehiculo y el local
    # no va.
    if leer("despues de init") != [ana]:
        fallar(f"despues de init: {leer('despues de init')}")
    tmp.disparar(EVT_STREAM_IN, 102)
    cuadro()
    if leer("con Lukasz") != [lukasz, ana]:  # el mas cercano primero
        fallar(f"con Lukasz: {leer('con Lukasz')}")
    tmp.disparar(EVT_STREAM_OUT, 101)
    cuadro()
    if leer("sin Ana") != [lukasz]:
        fallar(f"sin Ana: {leer('sin Ana')}")
    # El overlay adentro del juego, sin dispositivo de TMP: no dibuja y lo dice
    import overlay_juego
    bloque = overlay_juego.Bloque()
    tmp.disparar(EVT_POST_RENDER)
    if bloque.plugin(overlay_juego.ahora_ms())["estado"] != "no_device":
        fallar(f"sin dispositivo el overlay dice {bloque.plugin(overlay_juego.ahora_ms())}")
    bloque.cerrar()
    tmp.conectado = False
    tmp.disparar(EVT_DISCONNECTED)
    if leer("desconectado") != []:
        fallar(f"desconectado: {leer('desconectado')}")

    lib.truckersmp_shutdown()
    if leer("despues de shutdown") != []:
        fallar("despues de shutdown el bloque sigue con jugadores")
    lector.cerrar()
    if tmp.oyentes:
        fallar(f"quedaron {len(tmp.oyentes)} listeners despues de truckersmp_shutdown")
    if tmp.vivos:
        fallar(f"quedaron {len(tmp.vivos)} cosas sin liberar con Free")
    if tmp.errores:
        fallar("errores del TMP falso")


# ------------------------------------------------------- overlay en D3D11

# Lugares en la tabla de cada interfaz (d3d11.h): los de IUnknown (0-2) y,
# en el contexto, los de ID3D11DeviceChild (3-6), van antes.
D3D_DEVICE_CREATE_TEXTURE2D = 5
D3D_DEVICE_CREATE_RTV = 9
CTX_MAP, CTX_UNMAP = 14, 15
CTX_IA_SET_TOPOLOGY = 24
CTX_OM_SET_RENDER_TARGETS = 33
CTX_RS_SET_VIEWPORTS = 44
CTX_COPY_RESOURCE = 47
CTX_CLEAR_RTV = 50
CTX_IA_GET_TOPOLOGY = 83
CTX_OM_GET_RENDER_TARGETS = 89
CTX_RS_GET_VIEWPORTS = 95
R8G8B8A8_UNORM, R8G8B8A8_UNORM_SRGB = 28, 29
DRIVER_WARP, DRIVER_HARDWARE = 5, 1


class _DescTextura(ctypes.Structure):  # D3D11_TEXTURE2D_DESC
    _fields_ = [(n, ctypes.c_uint32) for n in ("Width", "Height", "MipLevels", "ArraySize", "Format",
                                               "SampleCount", "SampleQuality", "Usage", "BindFlags",
                                               "CPUAccessFlags", "MiscFlags")]


class _Viewport(ctypes.Structure):  # D3D11_VIEWPORT
    _fields_ = [(n, ctypes.c_float) for n in ("x", "y", "w", "h", "zmin", "zmax")]


class _Mapeado(ctypes.Structure):  # D3D11_MAPPED_SUBRESOURCE
    _fields_ = [("pData", ctypes.c_void_p), ("RowPitch", ctypes.c_uint32), ("DepthPitch", ctypes.c_uint32)]


def _metodo(objeto, lugar, *argtypes, restype=ctypes.c_long):
    """El metodo de ese lugar de la tabla de una interfaz COM, ya atado."""
    tabla = ctypes.cast(objeto, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p))).contents
    funcion = ctypes.WINFUNCTYPE(restype, ctypes.c_void_p, *argtypes)(tabla[lugar])
    return lambda *a: funcion(objeto, *a)


def _soltar(objeto) -> None:
    if objeto:
        _metodo(objeto, 2, restype=ctypes.c_ulong)()


class _D3D:
    """Un dispositivo D3D11 (WARP, o el de la placa si no hay: bajo Wine) con
    un render target de ancho x alto atado en el contexto inmediato."""

    def __init__(self, ancho: int, alto: int, formato: int = R8G8B8A8_UNORM):
        d3d11 = ctypes.WinDLL("d3d11")
        crear = d3d11.D3D11CreateDevice
        crear.restype = ctypes.c_long
        crear.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p, ctypes.c_uint, ctypes.c_void_p,
                          ctypes.c_uint, ctypes.c_uint, ctypes.POINTER(ctypes.c_void_p),
                          ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_void_p)]
        self.dispositivo, self.contexto = ctypes.c_void_p(), ctypes.c_void_p()
        nivel = ctypes.c_int()
        for driver in (DRIVER_WARP, DRIVER_HARDWARE):
            if crear(None, driver, None, 0, None, 0, 7, ctypes.byref(self.dispositivo), ctypes.byref(nivel),
                     ctypes.byref(self.contexto)) >= 0:
                break
        else:
            raise SystemExit("no hay dispositivo D3D11")
        self.ancho, self.alto = ancho, alto
        self.textura = self._textura(formato, usage=0, bind=0x20)  # DEFAULT, RENDER_TARGET
        self.copia = self._textura(formato, usage=3, bind=0, cpu=0x20000)  # STAGING, CPU_ACCESS_READ
        self.rtv = ctypes.c_void_p()
        hr = _metodo(self.dispositivo.value, D3D_DEVICE_CREATE_RTV, ctypes.c_void_p, ctypes.c_void_p,
                     ctypes.POINTER(ctypes.c_void_p))(self.textura, None, ctypes.byref(self.rtv))
        if hr < 0:
            raise SystemExit(f"CreateRenderTargetView: {hr & 0xFFFFFFFF:#x}")
        c = self.contexto.value
        self._om_set = _metodo(c, CTX_OM_SET_RENDER_TARGETS, ctypes.c_uint, ctypes.POINTER(ctypes.c_void_p),
                               ctypes.c_void_p, restype=None)
        self._om_get = _metodo(c, CTX_OM_GET_RENDER_TARGETS, ctypes.c_uint, ctypes.POINTER(ctypes.c_void_p),
                               ctypes.c_void_p, restype=None)
        self._limpiar = _metodo(c, CTX_CLEAR_RTV, ctypes.c_void_p, ctypes.POINTER(ctypes.c_float), restype=None)
        self._vp_set = _metodo(c, CTX_RS_SET_VIEWPORTS, ctypes.c_uint, ctypes.POINTER(_Viewport), restype=None)
        self._vp_get = _metodo(c, CTX_RS_GET_VIEWPORTS, ctypes.POINTER(ctypes.c_uint), ctypes.POINTER(_Viewport),
                               restype=None)
        self._topo_set = _metodo(c, CTX_IA_SET_TOPOLOGY, ctypes.c_int, restype=None)
        self._topo_get = _metodo(c, CTX_IA_GET_TOPOLOGY, ctypes.POINTER(ctypes.c_int), restype=None)
        self._copiar = _metodo(c, CTX_COPY_RESOURCE, ctypes.c_void_p, ctypes.c_void_p, restype=None)
        self._map = _metodo(c, CTX_MAP, ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_uint,
                            ctypes.POINTER(_Mapeado))
        self._unmap = _metodo(c, CTX_UNMAP, ctypes.c_void_p, ctypes.c_uint, restype=None)

    def _textura(self, formato, usage, bind, cpu=0):
        desc = _DescTextura(self.ancho, self.alto, 1, 1, formato, 1, 0, usage, bind, cpu, 0)
        t = ctypes.c_void_p()
        hr = _metodo(self.dispositivo.value, D3D_DEVICE_CREATE_TEXTURE2D, ctypes.POINTER(_DescTextura),
                     ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p))(ctypes.byref(desc), None, ctypes.byref(t))
        if hr < 0:
            raise SystemExit(f"CreateTexture2D: {hr & 0xFFFFFFFF:#x}")
        return t.value

    def preparar(self, color):
        """Limpia el render target a color (RGBA 0-1) y lo deja atado, con un
        viewport y una topologia que el plugin tiene que devolver como estaban."""
        self._limpiar(self.rtv, (ctypes.c_float * 4)(*color))
        self._om_set(1, ctypes.byref(self.rtv), None)
        self._vp_set(1, ctypes.byref(_Viewport(3, 4, 50, 60, 0, 1)))
        self._topo_set(4)  # TRIANGLELIST

    def estado(self):
        """(render target atado, viewport, topologia), para ver que quedo igual."""
        rtv = ctypes.c_void_p()
        self._om_get(1, ctypes.byref(rtv), None)
        atado = rtv.value == self.rtv.value
        _soltar(rtv.value)
        n, vp = ctypes.c_uint(1), _Viewport()
        self._vp_get(ctypes.byref(n), ctypes.byref(vp))
        topo = ctypes.c_int()
        self._topo_get(ctypes.byref(topo))
        return atado, (n.value, vp.x, vp.y, vp.w, vp.h), topo.value

    def pixeles(self) -> dict:
        """{(x, y): (r, g, b, a)} de todo el render target."""
        self._copiar(self.copia, self.textura)
        m = _Mapeado()
        hr = self._map(self.copia, 0, 1, 0, ctypes.byref(m))  # MAP_READ
        if hr < 0:
            raise SystemExit(f"Map: {hr & 0xFFFFFFFF:#x}")
        datos = ctypes.string_at(m.pData, m.RowPitch * self.alto)
        fila = m.RowPitch
        self._unmap(self.copia, 0)
        return lambda x, y: tuple(datos[y * fila + x * 4:y * fila + x * 4 + 4])

    def cerrar(self):
        for o in (self.rtv.value, self.copia, self.textura, self.contexto.value, self.dispositivo.value):
            _soltar(o)


class _Imagen:
    """Lo que overlay_juego.Bloque.publicar usa de una imagen de Pillow, sin
    Pillow (Build plugin no instala el cliente)."""

    def __init__(self, ancho, alto, pixel):
        self.width, self.height, self.size = ancho, alto, (ancho, alto)
        self._datos = b"".join(bytes(pixel(x, y)) for y in range(alto) for x in range(ancho))

    def tobytes(self, *_):
        return self._datos


def _cerca(a, b, tolerancia=3) -> bool:
    return all(abs(x - y) <= tolerancia for x, y in zip(a, b))


def _pasada_overlay(dll: str, h) -> None:
    sys.path.insert(0, os.path.join(RAIZ, "client"))
    import overlay_juego

    lib = ctypes.CDLL(dll, handle=h)
    lib.truckersmp_init.restype = ctypes.c_bool
    lib.truckersmp_init.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
    lib.truckersmp_shutdown.restype = None
    d3d = _D3D(320, 180)
    tmp = TmpFalso(_jugadores(), dispositivo=d3d.dispositivo.value)
    tmp.renderer = 0  # empieza en OpenGL

    def fallar(motivo):
        raise SystemExit(f"{motivo} (logs: {tmp.logs}, errores: {tmp.errores})")

    if not lib.truckersmp_init(ctypes.byref(tmp.host), ctypes.byref(_Desc(ctypes.sizeof(_Desc)))):
        fallar("truckersmp_init dijo que no")
    bloque = overlay_juego.Bloque()
    verde = (0.0, 128 / 255, 0.0, 1.0)

    def cuadro():
        tmp.disparar(EVT_POST_RENDER)
        return bloque.plugin(overlay_juego.ahora_ms())

    # En OpenGL no dibuja, y lo dice
    if cuadro() != {"listo": False, "estado": "not_dx11", "cuadro": None}:
        fallar(f"en OpenGL el plugin dice {cuadro()}")
    tmp.renderer = 1
    d3d.preparar(verde)
    antes = d3d.estado()
    # Sin imagen todavia: listo, con el tamano del render target
    if cuadro() != {"listo": True, "estado": "ready", "cuadro": (320, 180)}:
        fallar(f"con DirectX 11 el plugin dice {cuadro()}")
    # Mitad izquierda rojo opaco, derecha azul al 50 %; arriba a la izquierda
    # un pixel gris opaco
    img = _Imagen(40, 20, lambda x, y: (128, 128, 128, 255) if (x, y) == (0, 0)
                  else (255, 0, 0, 255) if x < 20 else (0, 0, 255, 128))
    bloque.publicar(img, 100, 50, overlay_juego.ahora_ms())
    d3d.preparar(verde)
    cuadro()
    px = d3d.pixeles()
    esperado = {(110, 60): (255, 0, 0, 255), (130, 60): (0, 64, 128, 255), (139, 69): (0, 64, 128, 255),
                (100, 50): (128, 128, 128, 255), (99, 50): (0, 128, 0, 255), (140, 60): (0, 128, 0, 255),
                (110, 70): (0, 128, 0, 255), (110, 49): (0, 128, 0, 255), (5, 5): (0, 128, 0, 255)}
    malos = {p: px(*p) for p, c in esperado.items() if not _cerca(px(*p), c)}
    if malos:
        fallar(f"pixeles distintos: {malos}")
    if d3d.estado() != antes:
        fallar(f"el pipeline no quedo como estaba: {antes} -> {d3d.estado()}")
    # Movida: se dibuja en el lugar nuevo con la misma imagen
    bloque.publicar(img, 0, 0, overlay_juego.ahora_ms())
    d3d.preparar(verde)
    cuadro()
    px = d3d.pixeles()
    if not _cerca(px(10, 10), (255, 0, 0, 255)) or not _cerca(px(110, 60), (0, 128, 0, 255)):
        fallar(f"movida: {px(10, 10)} y {px(110, 60)}")
    # Oculta: nada
    bloque.ocultar(overlay_juego.ahora_ms())
    d3d.preparar(verde)
    cuadro()
    if not _cerca(d3d.pixeles()(10, 10), (0, 128, 0, 255)):
        fallar("oculta se dibujo igual")
    lib.truckersmp_shutdown()
    if bloque.plugin(overlay_juego.ahora_ms())["estado"] != "none":
        fallar("despues de truckersmp_shutdown el bloque sigue diciendo que dibuja")
    if tmp.oyentes:
        fallar(f"quedaron {len(tmp.oyentes)} listeners despues de truckersmp_shutdown")
    d3d.cerrar()

    # En un render target sRGB el gris sale gris: el plugin lo pasa a luz
    # lineal y la placa lo vuelve a codificar (sin eso, 188).
    d3d = _D3D(64, 32, R8G8B8A8_UNORM_SRGB)
    tmp = TmpFalso(_jugadores(), dispositivo=d3d.dispositivo.value)
    if not lib.truckersmp_init(ctypes.byref(tmp.host), ctypes.byref(_Desc(ctypes.sizeof(_Desc)))):
        fallar("truckersmp_init dijo que no (sRGB)")
    gris = _Imagen(8, 8, lambda x, y: (128, 128, 128, 255))
    bloque.publicar(gris, 4, 4, overlay_juego.ahora_ms())
    d3d.preparar((0.0, 0.0, 0.0, 1.0))
    cuadro()
    if not _cerca(d3d.pixeles()(6, 6), (128, 128, 128, 255)):
        fallar(f"en sRGB el gris salio {d3d.pixeles()(6, 6)}")
    lib.truckersmp_shutdown()
    bloque.cerrar()
    d3d.cerrar()
    if tmp.vivos or tmp.errores:
        fallar("cosas sin liberar o errores del TMP falso")


def _hijo(pasada: str, dll: str) -> None:
    k32, h = _cargar(dll)
    if pasada in ("init", "sin-init"):
        _pasada_scs(dll, h, pasada == "init")
    elif pasada == "tmp-overlay":
        _pasada_overlay(dll, h)
    else:
        _pasada_tmp(dll, h, pasada == "tmp")
    k32.FreeLibrary(h)


def dlls_importadas(dll: str) -> list[str]:
    """Los nombres de la tabla de importaciones de una DLL (PE32 o PE32+),
    leida del archivo: anda en cualquier sistema, sin cargarla."""
    with open(dll, "rb") as f:
        datos = f.read()
    pe = struct.unpack_from("<I", datos, 0x3C)[0]
    if datos[:2] != b"MZ" or datos[pe:pe + 4] != b"PE\0\0":
        raise ValueError(f"{dll} no es una DLL")
    secciones_n, opcional_tam = struct.unpack_from("<H12xH", datos, pe + 6)
    opcional = pe + 24
    # El directorio de importaciones es el segundo de la lista, que empieza
    # en 96 (PE32) o en 112 (PE32+) de la cabecera opcional.
    dirs = opcional + (112 if struct.unpack_from("<H", datos, opcional)[0] == 0x20B else 96)
    importaciones = struct.unpack_from("<I", datos, dirs + 8)[0]
    secciones = [struct.unpack_from("<8xIIII", datos, opcional + opcional_tam + 40 * i)
                 for i in range(secciones_n)]

    def en_archivo(rva):
        for tam_virtual, va, tam_crudo, crudo in secciones:
            if va <= rva < va + max(tam_virtual, tam_crudo):
                return rva - va + crudo
        raise ValueError(f"RVA {rva:#x} fuera de las secciones")

    nombres = []
    if not importaciones:
        return nombres
    descriptor = en_archivo(importaciones)
    while True:
        entrada = datos[descriptor:descriptor + 20]
        if entrada == bytes(20):
            return nombres
        nombre = en_archivo(struct.unpack_from("<I", entrada, 12)[0])
        nombres.append(datos[nombre:datos.index(b"\0", nombre)].decode("ascii"))
        descriptor += 20


def runtime_de_visual_cpp(dll: str) -> list[str]:
    """Las DLLs del Visual C++ Redistributable que pide la DLL (vacia si
    lleva el runtime adentro, /MT)."""
    return [n for n in dlls_importadas(dll) if RUNTIME_VISUAL_CPP.match(n)]


def probar(dll: str) -> list[str]:
    """Las pasadas en las que la DLL se cayo o hizo algo mal (vacia si
    ninguna). "runtime" si pide el Visual C++ Redistributable."""
    caidas = []
    runtime = runtime_de_visual_cpp(dll)
    print(f"runtime: {'ok' if not runtime else 'pide ' + ', '.join(runtime) + ' (compilar con /MT)'}")
    if runtime:
        caidas.append("runtime")
    for pasada in PASADAS:
        r = subprocess.run([sys.executable, "-I", os.path.abspath(__file__), "--hijo", pasada, dll],
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        salida = (r.stdout + r.stderr).strip()
        print(f"{pasada}: {'ok' if r.returncode == 0 else f'codigo {r.returncode & 0xFFFFFFFF:#x}'}"
              + (f" ({salida})" if salida else ""))
        if r.returncode != 0:
            caidas.append(pasada)
    return caidas


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "--hijo":
        _hijo(sys.argv[2], sys.argv[3])
    elif len(sys.argv) == 2:
        sys.exit(1 if probar(os.path.abspath(sys.argv[1])) else 0)
    else:
        raise SystemExit(__doc__)

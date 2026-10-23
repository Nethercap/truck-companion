"""Carga y descarga el plugin de Windows como el juego, para ver que no se cae.

Uso: python tools/probar_plugin.py <ruta a la DLL>

Dos pasadas, cada una en un proceso aparte:
- "init": scs_telemetry_init, scs_telemetry_shutdown y FreeLibrary, que es lo
  que hace el juego al abrir y al cerrar. Al soltar la DLL, DllMain vuelve a
  llamar a scs_telemetry_shutdown.
- "sin-init": LoadLibrary y FreeLibrary, como cuando init falla y el juego
  suelta el plugin.

La DLL del 30-09 se caia en las dos: la segunda llamada a shutdown escribia
en el bloque ya desmapeado, y sin init en un puntero nulo. FreeLibrary se
traga esa excepcion, pero el juego no: en el Visor de eventos quedaba un
access violation en truckdash-telemetry.dll+0x537d en cada cierre de ETS2 y
de ATS. Por eso el proceso de prueba pone un manejador vectorizado, que ve la
excepcion antes que el loader, como el del juego.

Lo corren "Build plugin" antes de fijar una DLL nueva, los tests con la DLL
recien compilada y el test del cliente con la que trae el cliente.
"""

import ctypes
import os
import subprocess
import sys

PASADAS = ("init", "sin-init")
ACCESS_VIOLATION = 0xC0000005
# SCS_TELEMETRY_VERSION_1_01 y la version del SDK de ETS2 de los headers
# (SCS_MAKE_VERSION(1, 18)): con esas init registra todos los canales.
TELEMETRY_1_01 = (1 << 16) | 1
ETS2_SDK_1_18 = (1 << 16) | 18


def _hijo(pasada: str, dll: str) -> None:
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

    if pasada == "init":
        # scs_telemetry_init_params_v101_t: los parametros comunes del SDK y
        # las cuatro funciones de registro, que aca solo dicen que si.
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
    k32.FreeLibrary(h)


def probar(dll: str) -> list[str]:
    """Las pasadas en las que la DLL se cayo (vacia si ninguna)."""
    caidas = []
    for pasada in PASADAS:
        r = subprocess.run([sys.executable, "-I", os.path.abspath(__file__), "--hijo", pasada, dll],
                           capture_output=True, text=True)
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

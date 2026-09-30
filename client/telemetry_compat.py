"""Lectura de la telemetria, en Windows y en Linux.

El paquete truck_telemetry abre el bloque por su nombre de Windows
("Local\\SCSTelemetry"), asi que en Linux no sirve tal cual. Pero el bloque es
el mismo: el plugin portado publica los mismos 32 KB, con el mismo contenido,
en /dev/shm/SCSTelemetry. Alcanza con abrirlo como corresponda en cada
sistema y reusar el parser del paquete, que es puro Python.

OJO en Linux: NO se usa multiprocessing.shared_memory. Aunque se abra con
create=False, su resource_tracker le hace unlink al salir el proceso y se
lleva puesto el bloque del plugin, dejando al juego publicando en el vacio
hasta que se reinicie. Comprobado. Por eso aca se mapea el archivo a mano,
que ademas es menos codigo.

Hay dos bloques posibles. El plugin que instala Truck Dash (plugin/, fork
de RenCloud) publica en "TruckDashTelemetry"; el de RenCloud, y cualquier
otro scs-telemetry.dll que ya tenga el juego, en "SCSTelemetry". Son dos
nombres a proposito: el nuestro se instala AL LADO del scs-telemetry.dll de
otras apps (Trucky lo trae y protesta si alguien se lo cambia), y los dos
plugins corren a la vez. Se prefiere el nuestro, que trae los trabajos con
auto de ATS 1.61; si no esta, el de siempre, que sirve para todo lo demas.

Uso identico al de truck_telemetry:
    telemetry_compat.init()
    datos = telemetry_compat.get_data()
"""

import mmap
import os
import sys

IS_WINDOWS = sys.platform == "win32"
WINDOWS_NAME = "Local\\SCSTelemetry"
LINUX_PATH = "/dev/shm/SCSTelemetry"
# El del plugin de Truck Dash (SCS_PLUGIN_MMF_NAME en plugin/) y despues el
# de siempre, en orden de preferencia.
WINDOWS_NAMES = ("Local\\TruckDashTelemetry", WINDOWS_NAME)
LINUX_PATHS = ("/dev/shm/TruckDashTelemetry", LINUX_PATH)
BLOCK_SIZE = 32 * 1024  # SCS_PLUGIN_MMF_SIZE

_mem = None      # SharedMemory en Windows
_map = None      # mmap en Linux
_fd = None
_buf = None
_version = None
_abierto = None  # nombre del bloque que se abrio


def _open_buffer():
    """Devuelve algo indexable con el contenido del primer bloque que
    exista. Si no hay ninguno, levanta la excepcion del ultimo."""
    global _abierto
    error = None
    for nombre in (WINDOWS_NAMES if IS_WINDOWS else LINUX_PATHS):
        try:
            buf = _open_named(nombre)
        except OSError as exc:
            error = exc
            continue
        _abierto = nombre
        return buf
    raise error


def _open_named(nombre):
    global _mem, _map, _fd
    if IS_WINDOWS:
        from multiprocessing.shared_memory import SharedMemory
        _mem = SharedMemory(name=nombre, create=False)
        return _mem.buf
    _fd = os.open(nombre, os.O_RDONLY)
    # Se devuelve el mmap pelado, no un memoryview: el parser lo lee igual
    # (soporta el protocolo de buffer) y ademas un memoryview vivo impide
    # cerrarlo despues ("cannot close exported pointers exist").
    _map = mmap.mmap(_fd, BLOCK_SIZE, mmap.MAP_SHARED, mmap.PROT_READ)
    return _map


def init():
    """Abre el bloque publicado por el plugin. Levanta excepcion si no esta:
    el juego no arranco, o el plugin no quedo instalado."""
    global _buf, _version
    from truck_telemetry.telemetry_version import v1_10, v1_12

    _buf = _open_buffer()
    for version in (v1_10, v1_12):
        if version.is_same_version(_buf):
            _version = version
            break
    if _version is None:
        deinit()
        raise Exception("Not support this telemetry sdk version")


def get_data():
    return _version.parse_data(_buf)


def get_version_number():
    return _version.get_version_number() if _version is not None else 0


def opened_block():
    """El bloque que se esta leyendo (para el log), o None."""
    return _abierto


def deinit():
    global _mem, _map, _fd, _buf, _version, _abierto
    _buf = None
    _version = None
    _abierto = None
    if _mem is not None:
        _mem.close()
        _mem = None
    if _map is not None:
        _map.close()
        _map = None
    if _fd is not None:
        os.close(_fd)
        _fd = None


def block_name():
    """Para los mensajes de error: donde se espera encontrar el bloque."""
    return " or ".join(WINDOWS_NAMES if IS_WINDOWS else LINUX_PATHS)

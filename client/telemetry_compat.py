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
BLOCK_SIZE = 32 * 1024  # SCS_PLUGIN_MMF_SIZE

_mem = None      # SharedMemory en Windows
_map = None      # mmap en Linux
_fd = None
_buf = None
_version = None


def _open_buffer():
    """Devuelve algo indexable con el contenido del bloque."""
    global _mem, _map, _fd
    if IS_WINDOWS:
        from multiprocessing.shared_memory import SharedMemory
        _mem = SharedMemory(name=WINDOWS_NAME, create=False)
        return _mem.buf
    _fd = os.open(LINUX_PATH, os.O_RDONLY)
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


def deinit():
    global _mem, _map, _fd, _buf, _version
    _buf = None
    _version = None
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
    return WINDOWS_NAME if IS_WINDOWS else LINUX_PATH

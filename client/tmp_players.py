"""Los jugadores de TruckersMP alrededor del camion, para el mapa de la app.

Con TruckersMP abierto, su cliente carga nuestro plugin tambien como plugin
suyo (truckersmp_init, plugin/scs-telemetry/src/truckersmp_players.cpp, con
el Client SDK de TruckersMP) y este publica en "Local\\TruckDashTMP" los
jugadores que TMP tiene cargados cerca: nombre, posicion, rumbo y velocidad.
Sin TruckersMP el bloque no existe y no se manda nada.

El lazo de la telemetria lo lee una vez por segundo (CADA_S) y lo suma al
payload como "tmpPlayers", con los A_LA_WEB mas cercanos: a 4 Hz y con
decenas de jugadores en Calais-Duisburg serian varios KB por segundo de mas
al relay. Solo la app los dibuja; el mapa en vivo publico y el overlay de OBS
no los muestran.

La disposicion del bloque es la de truckersmp_players.hpp: si cambia alla,
cambia aca y sube REVISION en los dos.
"""

import struct
import sys

IS_WINDOWS = sys.platform == "win32"
NOMBRE = "Local\\TruckDashTMP"  # TMP_PLAYERS_MMF_NAME
REVISION = 1                    # TMP_PLAYERS_REVISION
MAXIMO = 64                     # TMP_PLAYERS_MAX
# revision, sequence, tick, serverId, localId, connected, (3 de relleno),
# count, (relleno): 40 bytes, como tmpPlayersMap_t hasta players.
CABECERA = struct.Struct("<IIQQiB3xII")
# x, y, z, accountId, id, heading, speed, distance, name[64]: tmpPlayer_t.
JUGADOR = struct.Struct("<dddQifff64s")
TAMANO = CABECERA.size + JUGADOR.size * MAXIMO

CADA_S = 1.0
A_LA_WEB = 32
# El plugin escribe cuatro veces por segundo. Si TMP se cierra (o se cuelga)
# el bloque sigue vivo mientras lo tengamos abierto, con lo ultimo que vio:
# sin escribir hace 3 s, no hay TMP.
VIEJO_MS = 3000


def parsear(datos: bytes, ahora_ms: int):
    """Los jugadores de una copia del bloque, o None si la copia no sirve:
    otra revision, a medio escribir (sequence impar) o vieja. Sin conexion a
    un servidor, lista vacia: TMP esta abierto pero no hay nadie."""
    if len(datos) < TAMANO:
        return None
    revision, sequence, tick, _servidor, _local, conectado, cuantos, _ = CABECERA.unpack_from(datos, 0)
    if revision != REVISION or sequence % 2 or tick == 0 or ahora_ms - tick > VIEJO_MS:
        return None
    if not conectado:
        return []
    jugadores = []
    for i in range(min(cuantos, MAXIMO, A_LA_WEB)):
        x, _y, z, _cuenta, ident, rumbo, velocidad, _dist, nombre = JUGADOR.unpack_from(
            datos, CABECERA.size + i * JUGADOR.size)
        jugadores.append({
            "id": ident,
            "name": nombre.split(b"\0", 1)[0].decode("utf-8", "replace"),
            "x": round(x, 1),
            "z": round(z, 1),
            # Como heading_deg de client.py: el plugin lo deja como el SDK,
            # <0,1) antihorario desde el norte; la web espera grados de
            # brujula (horario).
            "heading": round((360.0 - (rumbo % 1.0) * 360.0) % 360.0),
            "speedKmh": round(velocidad * 3.6),
        })
    return jugadores


def _ahora_ms() -> int:
    # El mismo reloj que usa el plugin (GetTickCount64), no time.time().
    import ctypes
    funcion = ctypes.windll.kernel32.GetTickCount64
    funcion.restype = ctypes.c_uint64
    return funcion()


class Lector:
    """Abre el bloque cuando aparece y lo deja abierto: si TMP se cierra y
    vuelve, el plugin reusa el mismo (CreateFileMapping con el mismo nombre)."""

    def __init__(self):
        self._memoria = None

    def leer(self):
        """La lista para "tmpPlayers", o None si no hay TruckersMP."""
        if not IS_WINDOWS:
            return None
        if self._memoria is None:
            from multiprocessing.shared_memory import SharedMemory
            try:
                self._memoria = SharedMemory(name=NOMBRE, create=False)
            except OSError:
                return None
        try:
            buf = self._memoria.buf
            if len(buf) < TAMANO:
                return None
            # Si el plugin escribia justo mientras se copiaba, sequence
            # cambio: se prueba otra vez (escribe en microsegundos cada 250 ms).
            for _ in range(3):
                antes = CABECERA.unpack_from(buf, 0)[1]
                datos = bytes(buf[:TAMANO])
                if CABECERA.unpack_from(buf, 0)[1] == antes:
                    return parsear(datos, _ahora_ms())
        except (OSError, ValueError, BufferError, struct.error):
            # Lo corre el lazo de la telemetria: un bloque raro no lo puede
            # tirar abajo. Se vuelve a abrir la proxima vez.
            self.cerrar()
        return None

    def cerrar(self):
        if self._memoria is not None:
            self._memoria.close()
            self._memoria = None

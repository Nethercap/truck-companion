"""El overlay adentro del juego: el bloque que comparte el cliente con el plugin.

Con "Dibujar adentro del juego" (Setup), el cliente escribe la imagen del
overlay (overlay_imagen.py) en "Local\\TruckDashOverlay" y el plugin la pega en
cada cuadro del juego desde el evento de despues de dibujar de TruckersMP
(plugin/scs-telemetry/src/truckersmp_overlay.cpp): asi sale en los clips y en
lo que graba solo la imagen del juego. TruckersMP le da a sus plugins ese
evento y el dispositivo D3D11 para esto; sin TruckersMP no hay donde
engancharse sin tocar el juego, y el cliente sigue con su ventana.

El plugin avisa en el mismo bloque si esta dibujando (pluginTick, el
GetTickCount64 del ultimo cuadro en que pudo) y el tamano del cuadro, que el
cliente usa para ubicarlo y escalarlo como la ventana contra la del juego. Si
el plugin se calla (TruckersMP cerrado, el juego en OpenGL), vuelve la
ventana: el overlay nunca desaparece por elegir la opcion.

La disposicion es la de truckersmp_overlay.hpp: si cambia alla, cambia aca y
sube REVISION en los dos.
"""

import struct
import sys

IS_WINDOWS = sys.platform == "win32"
NOMBRE = "Local\\TruckDashOverlay"  # TD_OVERLAY_MMF_NAME
REVISION = 1                        # TD_OVERLAY_REVISION
MAX_ANCHO = 4096                    # TD_OVERLAY_MAX_WIDTH
MAX_ALTO = 2048                     # TD_OVERLAY_MAX_HEIGHT
# revision, sequence, visible, x, y, width, height, (relleno), clientTick:
# lo que escribe el cliente, 40 bytes
CLIENTE = struct.Struct("<IIIiiIIIQ")
# pluginTick, frameWidth, frameHeight, status, pluginRevision: lo del plugin
PLUGIN = struct.Struct("<QIIII")
PLUGIN_EN = CLIENTE.size
PIXELES_EN = 64
TAMANO = PIXELES_EN + MAX_ANCHO * MAX_ALTO * 4
_VISIBLE_EN, _POS_EN, _TAM_EN, _TICK_EN = 8, 12, 20, 32

# TD_OVERLAY_STATUS_*
ESTADOS = {0: "none", 1: "ready", 2: "not_dx11", 3: "no_device", 4: "no_shaders", 5: "no_target"}
LISTO = 1
# El plugin escribe en cada cuadro (60 por segundo o mas). Sin cuadros hace
# esto, no esta dibujando: TruckersMP se cerro, se colgo o el juego no dibuja
# (minimizado). Mas que el tick del overlay (100 ms) y que un tiron de carga.
PLUGIN_VIEJO_MS = 1500


def ahora_ms() -> int:
    # El mismo reloj que el plugin (GetTickCount64), no time.time().
    import ctypes
    funcion = ctypes.windll.kernel32.GetTickCount64
    funcion.restype = ctypes.c_uint64
    return funcion()


def _abrir_windows():
    import mmap
    # Crea el bloque o abre el del plugin, si ya esta (mismo nombre y tamano).
    return mmap.mmap(-1, TAMANO, tagname=NOMBRE)


def entra(ancho: int, alto: int) -> bool:
    """Si una imagen de ese tamano entra en el bloque."""
    return 0 < ancho <= MAX_ANCHO and 0 < alto <= MAX_ALTO


class Bloque:
    """El bloque abierto por el cliente. abrir: () -> un buffer escribible del
    tamano TAMANO (el de Windows por defecto; los tests le pasan otro)."""

    def __init__(self, abrir=None):
        self._abrir = abrir or (_abrir_windows if IS_WINDOWS else None)
        self.buf = None
        self._imagen = None   # la ultima imagen escrita (la misma: no se copia otra vez)
        self.visible = False

    def abrir(self) -> bool:
        if self.buf is not None:
            return True
        if self._abrir is None:
            return False
        try:
            self.buf = self._abrir()
        except (OSError, ValueError):
            self.buf = None
            return False
        # Si quedo a medio escribir (un cliente que se cerro escribiendo), par
        sec = self._secuencia()
        if sec % 2:
            struct.pack_into("<I", self.buf, 4, (sec + 1) & 0xFFFFFFFF)
        struct.pack_into("<I", self.buf, 0, REVISION)
        return True

    def _secuencia(self) -> int:
        return struct.unpack_from("<I", self.buf, 4)[0]

    def plugin(self, ahora: int):
        """Lo que dice el plugin: {"listo": puede dibujar ahora, "estado" (de
        ESTADOS, "revision" si es de otra), "cuadro": (ancho, alto) o None}.
        listo es False si no escribe hace PLUGIN_VIEJO_MS."""
        if not self.abrir():
            return {"listo": False, "estado": "none", "cuadro": None}
        tick, ancho, alto, estado, revision = PLUGIN.unpack_from(self.buf, PLUGIN_EN)
        # El plugin escribe en cada cuadro, pueda dibujar o no: un tick viejo
        # es que no hay nadie (y el estado es de entonces).
        fresco = tick != 0 and 0 <= ahora - tick <= PLUGIN_VIEJO_MS
        if not fresco:
            return {"listo": False, "estado": "none", "cuadro": None}
        if revision != REVISION:
            return {"listo": False, "estado": "revision", "cuadro": None}
        cuadro = (ancho, alto) if ancho > 0 and alto > 0 else None
        return {"listo": estado == LISTO and cuadro is not None, "estado": ESTADOS.get(estado, "none"),
                "cuadro": cuadro}

    def publicar(self, imagen, x: int, y: int, ahora: int) -> bool:
        """Deja la imagen (RGBA de Pillow) para que el plugin la dibuje con su
        esquina de arriba a la izquierda en (x, y) del cuadro. La misma imagen
        que la vez anterior no se vuelve a copiar: solo la posicion y el latido."""
        if not self.abrir() or not entra(*imagen.size):
            return False
        if imagen is not self._imagen:
            datos = imagen.tobytes("raw", "RGBA")
            sec = self._secuencia()
            struct.pack_into("<I", self.buf, 4, (sec + 1) & 0xFFFFFFFF)  # impar: escribiendo
            struct.pack_into("<II", self.buf, _TAM_EN, imagen.width, imagen.height)
            self.buf[PIXELES_EN:PIXELES_EN + len(datos)] = datos
            struct.pack_into("<I", self.buf, 4, (sec + 2) & 0xFFFFFFFF)  # par: listo
            self._imagen = imagen
        struct.pack_into("<ii", self.buf, _POS_EN, int(x), int(y))
        struct.pack_into("<I", self.buf, _VISIBLE_EN, 1)
        struct.pack_into("<Q", self.buf, _TICK_EN, ahora)
        self.visible = True
        return True

    def ocultar(self, ahora: int) -> None:
        """Que el plugin no dibuje nada (el overlay apagado, en pausa o de
        vuelta en la ventana). Sigue latiendo: el bloque queda listo."""
        if self.buf is None:
            return
        struct.pack_into("<I", self.buf, _VISIBLE_EN, 0)
        struct.pack_into("<Q", self.buf, _TICK_EN, ahora)
        self.visible = False

    def cerrar(self) -> None:
        """Al salir del cliente: nada dibujado desde ya, sin esperar a que el
        latido quede viejo."""
        if self.buf is None:
            return
        try:
            struct.pack_into("<I", self.buf, _VISIBLE_EN, 0)
            struct.pack_into("<Q", self.buf, _TICK_EN, 0)
            if hasattr(self.buf, "close"):
                self.buf.close()
        except (ValueError, OSError):
            pass
        self.buf = None
        self._imagen = None
        self.visible = False

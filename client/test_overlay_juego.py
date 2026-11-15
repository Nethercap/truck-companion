"""El bloque del overlay adentro del juego (overlay_juego.py), como lo lee el
plugin (truckersmp_overlay.hpp). Con la DLL de verdad y un dispositivo D3D11
lo prueba tools/probar_plugin.py en Windows."""

import os
import re
import struct

from PIL import Image

import overlay_juego as oj

AHORA = 5_000_000


def bloque():
    buf = bytearray(oj.TAMANO)
    return oj.Bloque(abrir=lambda: buf), buf


def plugin_escribe(buf, tick=AHORA - 16, cuadro=(1920, 1080), estado=oj.LISTO, revision=oj.REVISION):
    oj.PLUGIN.pack_into(buf, oj.PLUGIN_EN, tick, cuadro[0], cuadro[1], estado, revision)


def leer_como_el_plugin(buf):
    """Lo que hace truckersmp_overlay.cpp: la imagen solo si la secuencia es
    par y no cambio mientras se copiaba."""
    rev, sec, visible, x, y, w, h, _, tick = oj.CLIENTE.unpack_from(buf, 0)
    if sec % 2:
        return None
    pixeles = bytes(buf[oj.PIXELES_EN:oj.PIXELES_EN + w * h * 4])
    return {"rev": rev, "sec": sec, "visible": visible, "pos": (x, y), "tam": (w, h), "tick": tick,
            "pixeles": pixeles}


def test_publica_la_imagen_donde_va_y_late():
    b, buf = bloque()
    img = Image.new("RGBA", (3, 2), (10, 20, 30, 128))
    img.putpixel((2, 1), (255, 0, 0, 255))
    assert b.publicar(img, 100, 40, AHORA)
    leido = leer_como_el_plugin(buf)
    assert leido["rev"] == oj.REVISION and leido["visible"] == 1
    assert leido["pos"] == (100, 40) and leido["tam"] == (3, 2) and leido["tick"] == AHORA
    assert leido["sec"] == 2  # escribio una vez: impar mientras, par al terminar
    # Fila de arriba primero, RGBA sin premultiplicar
    assert leido["pixeles"][:4] == bytes((10, 20, 30, 128))
    assert leido["pixeles"][-4:] == bytes((255, 0, 0, 255))


def test_la_misma_imagen_no_se_copia_otra_vez():
    b, buf = bloque()
    img = Image.new("RGBA", (4, 4), (1, 2, 3, 255))
    b.publicar(img, 0, 0, AHORA)
    b.publicar(img, 50, 60, AHORA + 100)
    leido = leer_como_el_plugin(buf)
    assert leido["sec"] == 2 and leido["pos"] == (50, 60) and leido["tick"] == AHORA + 100
    b.publicar(Image.new("RGBA", (4, 4), (9, 9, 9, 255)), 50, 60, AHORA + 200)
    assert leer_como_el_plugin(buf)["sec"] == 4


def test_ocultar_y_cerrar():
    b, buf = bloque()
    b.publicar(Image.new("RGBA", (2, 2)), 0, 0, AHORA)
    b.ocultar(AHORA + 100)
    leido = leer_como_el_plugin(buf)
    assert leido["visible"] == 0 and leido["tick"] == AHORA + 100 and not b.visible
    b.publicar(Image.new("RGBA", (2, 2)), 0, 0, AHORA + 200)
    b.cerrar()
    # Al salir del cliente: nada dibujado, sin esperar a que el latido envejezca
    leido = leer_como_el_plugin(buf)
    assert leido["visible"] == 0 and leido["tick"] == 0
    b.ocultar(AHORA)  # cerrado: no hace nada ni rompe


def test_una_imagen_que_no_entra_no_se_publica():
    b, buf = bloque()
    assert not b.publicar(Image.new("RGBA", (oj.MAX_ANCHO + 1, 2)), 0, 0, AHORA)
    assert leer_como_el_plugin(buf)["visible"] == 0
    assert oj.entra(oj.MAX_ANCHO, oj.MAX_ALTO) and not oj.entra(0, 10) and not oj.entra(10, oj.MAX_ALTO + 1)


def test_un_bloque_a_medio_escribir_queda_par_al_abrir():
    buf = bytearray(oj.TAMANO)
    struct.pack_into("<I", buf, 4, 7)  # un cliente que se cerro escribiendo
    b = oj.Bloque(abrir=lambda: buf)
    assert b.abrir()
    assert struct.unpack_from("<I", buf, 4)[0] == 8
    b.publicar(Image.new("RGBA", (1, 1)), 0, 0, AHORA)
    assert leer_como_el_plugin(buf)["sec"] == 10


def test_lo_que_dice_el_plugin():
    b, buf = bloque()
    # Sin plugin nunca (sin TruckersMP): no hay cuadro ni latido
    assert b.plugin(AHORA) == {"listo": False, "estado": "none", "cuadro": None}
    plugin_escribe(buf)
    assert b.plugin(AHORA) == {"listo": True, "estado": "ready", "cuadro": (1920, 1080)}
    # Se callo: TruckersMP cerrado o el juego sin dibujar
    assert b.plugin(AHORA + oj.PLUGIN_VIEJO_MS + 100)["listo"] is False
    assert b.plugin(AHORA + oj.PLUGIN_VIEJO_MS + 100)["estado"] == "none"
    # Late pero no puede: el juego en OpenGL
    plugin_escribe(buf, estado=2)
    assert b.plugin(AHORA) == {"listo": False, "estado": "not_dx11", "cuadro": (1920, 1080)}
    plugin_escribe(buf, estado=4, cuadro=(0, 0))
    assert b.plugin(AHORA) == {"listo": False, "estado": "no_shaders", "cuadro": None}
    # Otro plugin (otra disposicion): no se usa
    plugin_escribe(buf, revision=oj.REVISION + 1)
    assert b.plugin(AHORA)["listo"] is False and b.plugin(AHORA)["estado"] == "revision"


def test_sin_bloque_no_hace_nada():
    b = oj.Bloque(abrir=None)
    b._abrir = None
    assert not b.abrir()
    assert b.plugin(AHORA)["listo"] is False
    assert not b.publicar(Image.new("RGBA", (1, 1)), 0, 0, AHORA)

    def falla():
        raise OSError("sin memoria")
    assert not oj.Bloque(abrir=falla).abrir()


def test_la_disposicion_es_la_del_plugin():
    """overlay_juego.py y truckersmp_overlay.hpp tienen que coincidir: el
    plugin lee lo que escribe el cliente con esos offsets."""
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "plugin", "scs-telemetry", "inc", "truckersmp_overlay.hpp")
    with open(ruta, encoding="utf-8") as f:
        hpp = f.read()

    def define(nombre):
        return re.search(rf"#define {nombre} (\S+)", hpp).group(1)

    assert define("TD_OVERLAY_MMF_NAME") == 'L"Local\\\\TruckDashOverlay"' and oj.NOMBRE == "Local\\TruckDashOverlay"
    assert int(define("TD_OVERLAY_REVISION")) == oj.REVISION
    assert int(define("TD_OVERLAY_MAX_WIDTH")) == oj.MAX_ANCHO
    assert int(define("TD_OVERLAY_MAX_HEIGHT")) == oj.MAX_ALTO
    for nombre, valor in oj.ESTADOS.items():
        assert int(define(f"TD_OVERLAY_STATUS_{valor.upper()}")) == nombre
    assert "offsetof(tdOverlayMap_t, clientTick) == 32" in hpp and oj.CLIENTE.size == 40
    assert "offsetof(tdOverlayMap_t, pluginTick) == 40" in hpp and oj.PLUGIN_EN == 40
    assert "offsetof(tdOverlayMap_t, pixels) == 64" in hpp and oj.PIXELES_EN == oj.PLUGIN_EN + oj.PLUGIN.size
    # Los campos del cliente en el orden del struct
    campos = re.findall(r"^\s+u?int(?:32|64)_t (\w+);", hpp.split("struct tdOverlayMap_t")[1], re.MULTILINE)
    assert campos == ["revision", "sequence", "visible", "x", "y", "width", "height", "padding", "clientTick",
                      "pluginTick", "frameWidth", "frameHeight", "status", "pluginRevision"]

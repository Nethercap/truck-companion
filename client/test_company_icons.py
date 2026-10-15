"""tools/build_company_icons.py: los logos de empresa que se suben a R2.

Vive en client/ porque CI corre pytest sobre client/ (igual que pin_plugin).
"""

import importlib.util
import json
import os

import pytest
from PIL import Image


def _tool():
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools", "build_company_icons.py")
    spec = importlib.util.spec_from_file_location("build_company_icons", ruta)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _logo(path, size, caja, color=(200, 30, 30, 255)):
    """PNG transparente de size con un rectangulo opaco en caja (x0, y0, x1, y1)."""
    im = Image.new("RGBA", size, (0, 0, 0, 0))
    im.paste(Image.new("RGBA", (caja[2] - caja[0], caja[3] - caja[1]), color), caja[:2])
    im.save(path)


def test_recorta_el_borde_y_entra_en_la_caja():
    tool = _tool()
    im = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    im.paste(Image.new("RGBA", (200, 100), (255, 255, 255, 255)), (28, 78))
    logo = tool.normalize_logo(im)
    # 200x100 recortado, escalado al alto de la caja (64): 128x64
    assert logo.size == (128, 64)


def test_logo_muy_ancho_lo_limita_el_ancho():
    tool = _tool()
    logo = tool.normalize_logo(Image.new("RGBA", (600, 100), (1, 2, 3, 255)))
    assert logo.size == (192, 32)


def test_logo_chico_se_agranda_para_que_todos_tengan_el_mismo_alto():
    tool = _tool()
    logo = tool.normalize_logo(Image.new("RGBA", (40, 20), (1, 2, 3, 255)))
    assert logo.size == (128, 64)


def test_logo_todo_transparente_no_cuenta():
    tool = _tool()
    assert tool.normalize_logo(Image.new("RGBA", (64, 64), (0, 0, 0, 0))) is None


def test_gana_la_primera_carpeta_y_las_demas_completan(tmp_path):
    tool = _tool()
    vainilla, mod = tmp_path / "vainilla", tmp_path / "mod"
    vainilla.mkdir()
    mod.mkdir()
    _logo(vainilla / "flv_food_str.png", (128, 64), (0, 0, 128, 64), color=(0, 255, 0, 255))
    _logo(mod / "flv_food_str.png", (128, 64), (0, 0, 128, 64), color=(255, 0, 0, 255))
    _logo(mod / "solo_mod.png", (128, 64), (0, 0, 128, 64))
    # PNG vacio: el parser conoce el icono pero no lo pudo dibujar
    (vainilla / "vacio.png").write_bytes(b"")
    _logo(mod / "vacio.png", (128, 64), (0, 0, 128, 64))
    salida = tmp_path / "salida"

    found, missing = tool.build_game("ats", str(salida), [str(vainilla), str(mod)],
                                     {"flv_food_str", "solo_mod", "vacio", "sin_logo"})

    assert found == ["flv_food_str", "solo_mod", "vacio"]
    assert missing == ["sin_logo"]
    carpeta = salida / "vector" / "company-icons" / "ats"
    assert json.loads((carpeta / "index.json").read_text()) == {"pixelRatio": 2, "icons": found}
    with Image.open(carpeta / "flv_food_str.png") as im:
        assert im.getpixel((10, 10)) == (0, 255, 0, 255)  # el de la primera carpeta
    assert not (carpeta / "sin_logo.png").exists()


def test_no_quedan_logos_de_una_corrida_anterior(tmp_path):
    tool = _tool()
    iconos = tmp_path / "iconos"
    iconos.mkdir()
    _logo(iconos / "uno.png", (64, 64), (0, 0, 64, 64))
    carpeta = tmp_path / "salida" / "vector" / "company-icons" / "ets2"
    carpeta.mkdir(parents=True)
    (carpeta / "viejo.png").write_bytes(b"x")

    tool.build_game("ets2", str(tmp_path / "salida"), [str(iconos)], {"uno"})

    assert sorted(os.listdir(carpeta)) == ["index.json", "uno.png"]


def test_sin_ningun_logo_no_hay_index(tmp_path):
    """Un index.json vacio no rompe nada, pero no hay por que subirlo."""
    tool = _tool()
    found, missing = tool.build_game("ats", str(tmp_path), [str(tmp_path)], {"nada"})
    assert found == [] and missing == ["nada"]
    assert not (tmp_path / "vector" / "company-icons" / "ats" / "index.json").exists()


def test_tokens_de_las_variantes_del_juego(tmp_path):
    tool = _tool()
    (tmp_path / "pois-ats.json").write_text(json.dumps({"companies": [
        [0, 0, "flv_food_str", "Flavorfair", "topeka"],
        [1, 1, "../../x", "Raro", "topeka"],          # no es un token: va en una URL
        [2, 2, "token_demasiado_largo", "Largo", "x"],
        [3, 3, None, "Sin token", "x"],
    ]}))
    (tmp_path / "pois-ats_c2c.json").write_text(json.dumps({"companies": [[0, 0, "c2c_only", "C2C", "miami"]]}))
    (tmp_path / "pois-ets2.json").write_text(json.dumps({"companies": [[0, 0, "posped", "Posped", "berlin"]]}))

    assert tool.company_tokens("ats", str(tmp_path)) == {"flv_food_str", "c2c_only"}
    assert tool.company_tokens("ets2", str(tmp_path)) == {"posped"}


def test_icons_extra_pide_juego_y_carpeta():
    tool = _tool()
    assert tool.parse_extra(["ats=D:/x", "ets2=D:/y"]) == {"ats": ["D:/x"], "ets2": ["D:/y"]}
    with pytest.raises(SystemExit):
        tool.parse_extra(["D:/sin_juego"])

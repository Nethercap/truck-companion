"""El montaje (juego/montaje.py): el juego, sus DLC y los mods como los ve el
juego, con el ultimo que se monta ganando."""

import io
import zipfile

from juego.montaje import SistemaDeArchivos, archivos_del_juego, dlcs_del_juego, montar_juego
from juego.archivos import abrir


def _zip(ruta, archivos):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for nombre, datos in archivos.items():
            z.writestr(nombre, datos)
    ruta.write_bytes(buf.getvalue())
    return str(ruta)


def test_el_ultimo_gana_y_las_carpetas_se_juntan(tmp_path):
    a = abrir(_zip(tmp_path / "a.scs", {"def/city.sii": b"a", "def/a.sii": b"solo a"}))
    b = abrir(_zip(tmp_path / "b.scs", {"def/city.sii": b"b", "map/x.base": b"x"}))
    with SistemaDeArchivos([a, b]) as fs:
        assert fs.leer("def/city.sii") == b"b"
        assert fs.leer("def/a.sii") == b"solo a"
        assert fs.de_donde("def/city.sii") is b and fs.de_donde("def/a.sii") is a
        assert fs.de_donde("no/esta.sii") is None and fs.leer("no/esta.sii") is None
        assert sorted(fs.carpeta("").subcarpetas) == ["def", "map"]
        assert sorted(fs.carpeta("def").archivos) == ["a.sii", "city.sii"]
        assert sorted(fs.recorrer()) == ["def/a.sii", "def/city.sii", "map/x.base"]


def test_montar_juego_con_dlc_y_mods_en_partes(tmp_path):
    juego = tmp_path / "juego"
    juego.mkdir()
    _zip(juego / "base.scs", {"def/city.sii": b"base"})
    _zip(juego / "def.scs", {"def/city.sii": b"def"})
    _zip(juego / "dlc_wa.scs", {"def/city.sii": b"dlc"})
    _zip(juego / "effect.scs", {"def/city.sii": b"efectos"})  # no hace falta para el mapa
    (juego / "roto.scs").write_bytes(b"nada")
    assert [p.split("\\")[-1].split("/")[-1] for p in archivos_del_juego(str(juego))] == [
        "base.scs", "def.scs", "dlc_wa.scs"]
    assert dlcs_del_juego(str(juego)) == {"dlc_wa"}
    mod = _zip(tmp_path / "expansion.scs", {"base/def/city.sii": b"mod base", "dlc_wa/map/x.base": b"x",
                                            "dlc_id/map/y.base": b"y"})
    mod_roto = tmp_path / "roto.scs"
    mod_roto.write_bytes(b"tampoco")
    with montar_juego(str(juego), [mod, str(mod_roto)]) as fs:
        assert fs.leer("def/city.sii") == b"mod base"
        assert fs.leer("map/x.base") == b"x" and fs.leer("map/y.base") is None
        avisos = fs.todos_los_avisos()
        assert any("roto.scs" in a and "se saltea" in a for a in avisos)
        assert any("en partes" in a for a in avisos)
    with montar_juego(str(juego), con_dlc=False) as fs:
        assert fs.leer("def/city.sii") == b"def"

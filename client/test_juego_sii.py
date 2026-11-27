"""Los lectores de .sii (juego/sii.py): texto general, locale y BSII completo.

El descifrado ScsC y la lectura de partidas (BSII y texto con `claves`) tienen
sus tests en test_partida_gps.py, que sigue usandolos por partida_gps.
"""

import struct

import pytest

from juego.sii import SiiIlegible, leer_bsii, leer_locale, leer_unidades, texto_de

DEF = """SiiNunit
{
# un comentario de numeral
// y uno de barras
/* y uno
   de varias lineas */
city_data : city.berlin
{
    city_name: "Berlin"
    country: germany
    population: 3500000
    scale: 1.5
    pos: (1.5, -2, 3e-1)
    rot: (&3f800000; 0, 0, 0)
    flags: 0x10
    capital: true
    nada: nil
    vehicle_brands[]: man
    vehicle_brands[]: mercedes
    tags: 2
    tags[0]: "a"
    tags[1]: "b \\"con comillas\\" y \\x41\\xc3\\xb1o"
}
company_def : company.permanent.tradeaux
{
    name: "Tradeaux"
    city[2]: paris
}
}
"""


def test_unidades_con_todo_lo_que_trae_un_def():
    unidades = leer_unidades(DEF)
    assert [(u.tipo, u.nombre) for u in unidades] == [
        ("city_data", "city.berlin"), ("company_def", "company.permanent.tradeaux")]
    c = unidades[0]
    assert c.get("city_name") == "Berlin" and c.get("country") == "germany"
    assert c.get("population") == 3500000 and c.get("scale") == 1.5
    assert c.get("pos") == [1.5, -2, 0.3]
    assert c.get("rot") == [1.0, 0, 0, 0]  # float en hexa y ";" de cuaternion
    assert c.get("flags") == 16 and c.get("capital") is True and c.get("nada") is None
    assert c.get("vehicle_brands") == ["man", "mercedes"]
    # "tags: 2" es el largo del arreglo que sigue
    assert c.get("tags") == ["a", 'b "con comillas" y Año']
    assert unidades[1].get("city") == [None, None, "paris"]


def test_include_relativo_a_la_carpeta_del_archivo():
    archivos = {
        "def/city/berlin.sui": 'city_data : city.berlin { city_name: "Berlin" }',
        "def/comun.sui": "@include \"city/berlin.sui\"\ncity_data : city.paris { city_name: Paris }",
    }
    texto = 'SiiNunit\n{\n@include "comun.sui"\n@include "/def/city/berlin.sui"\n@include "no_existe.sui"\n}\n'
    unidades = leer_unidades(texto, archivos.get, "def/city.sii")
    assert [u.nombre for u in unidades] == ["city.berlin", "city.paris", "city.berlin"]
    # sin quien lea los includes, se saltean
    assert leer_unidades(texto) == []


def test_include_adentro_de_una_unidad():
    archivos = {"def/extra.sui": "population: 10\nname: x"}
    texto = 'SiiNunit { city_data : city.a {\n@include "extra.sui"\ncountry: de\n} }'
    (u,) = leer_unidades(texto, archivos.get, "def/a.sii")
    assert u.atributos == {"population": 10, "name": "x", "country": "de"}


def test_un_archivo_cortado_no_se_toma():
    with pytest.raises(SiiIlegible):
        leer_unidades("SiiNunit { city_data : city.a { name: x ")
    with pytest.raises(SiiIlegible):
        leer_unidades("SiiNunit { esto no es una unidad }")


def test_bom_y_nombres_entre_comillas():
    (u,) = leer_unidades('﻿SiiNunit { localization_db : .localization { } }')
    assert u.nombre == ".localization"


def test_locale():
    texto = """SiiNunit {
    localization_db : .localization {
        key[]: "city_berlin"
        val[]: "Berlín"
        key[]: "vacio"
        val[]: ""
    }
    }"""
    assert leer_locale(texto) == {"city_berlin": "Berlín", "vacio": ""}


def test_texto_de_un_archivo():
    assert texto_de(b"\xef\xbb\xbfSiiNunit { }") == "SiiNunit { }"
    with pytest.raises(SiiIlegible):
        texto_de(b"BSII\x02\x00\x00\x00")


# ------------------------------------------------------------------ BSII


def _bsii(estructuras, datos):
    """Un BSII v2 armado a mano. estructuras: [(id, nombre, [(tipo, campo, ordinales?)])];
    datos: [(id_estructura, nombre_unidad, bytes de los valores)]."""
    salida = bytearray(b"BSII" + struct.pack("<I", 2))
    for ident, nombre, campos in estructuras:
        salida += struct.pack("<IBII", 0, 1, ident, len(nombre)) + nombre.encode()
        for tipo, campo, *resto in campos:
            salida += struct.pack("<II", tipo, len(campo)) + campo.encode()
            if tipo == 0x37:
                ordinales = resto[0]
                salida += struct.pack("<I", len(ordinales))
                for k, v in ordinales.items():
                    salida += struct.pack("<II", k, len(v)) + v.encode()
        salida += struct.pack("<I", 0)
    for ident, unidad, valores in datos:
        tokens = unidad.split(".")
        salida += struct.pack("<IB", ident, len(tokens))
        for t in tokens:
            salida += struct.pack("<Q", _a_token(t))
        salida += valores
    return bytes(salida)


def _a_token(texto):
    caracteres = "0123456789abcdefghijklmnopqrstuvwxyz_"
    valor = 0
    for c in reversed(texto):
        valor = valor * 38 + caracteres.index(c) + 1
    return valor


def test_bsii_con_claves_none_lee_todo():
    campos = [
        (0x01, "nombre"), (0x02, "textos"), (0x03, "token"), (0x05, "f"), (0x06, "fs"),
        (0x09, "pos"), (0x11, "ipos"), (0x25, "i"), (0x27, "u"), (0x2B, "u16"),
        (0x31, "i64"), (0x35, "b"), (0x36, "bs"), (0x37, "ord", {7: "siete"}), (0x39, "id"),
        (0x3A, "ids"), (0x19, "ubic"),
    ]

    def texto(s):
        return struct.pack("<I", len(s)) + s.encode()

    valores = (
        texto("Berlin")
        + struct.pack("<I", 2) + texto("a") + texto("bc")
        + struct.pack("<Q", _a_token("man"))
        + struct.pack("<f", 1.5)
        + struct.pack("<I", 2) + struct.pack("<2f", 1.0, 2.0)
        + struct.pack("<3f", 1.0, 2.0, 3.0)
        + struct.pack("<3i", 1, -2, 3)
        + struct.pack("<i", -5) + struct.pack("<I", 7) + struct.pack("<H", 9)
        + struct.pack("<q", -1) + b"\x01"
        + struct.pack("<I", 3) + b"\x01\x00\x01"
        + struct.pack("<I", 7)
        + struct.pack("<B", 1) + struct.pack("<Q", _a_token("city"))
        + struct.pack("<I", 2) + struct.pack("<BQ", 0xFF, 0x1234) + struct.pack("<B", 0)
        + struct.pack("<8f", *range(8))
    )
    datos = _bsii([(5, "city_data", campos)], [(5, "city.berlin", valores)])
    (tipo, v), = leer_bsii(datos).values()
    assert tipo == "city_data"
    assert v["nombre"] == "Berlin" and v["textos"] == ["a", "bc"] and v["token"] == "man"
    assert v["f"] == 1.5 and v["fs"] == [1.0, 2.0] and v["pos"] == [1.0, 2.0, 3.0] and v["ipos"] == [1, -2, 3]
    assert v["i"] == -5 and v["u"] == 7 and v["u16"] == 9 and v["i64"] == -1
    assert v["b"] is True and v["bs"] == [True, False, True] and v["ord"] == "siete"
    assert v["id"] == "city" and v["ids"] == ["_nameless.1234", "null"]
    assert v["ubic"] == [float(k) for k in range(8)]
    assert list(leer_bsii(datos)) == ["city.berlin"]


def test_bsii_con_claves_solo_lo_pedido():
    campos = [(0x01, "nombre"), (0x25, "i")]
    valores = struct.pack("<I", 2) + b"ab" + struct.pack("<i", 3)
    datos = _bsii([(1, "a", campos), (2, "b", campos)], [(1, "x.a", valores), (2, "x.b", valores)])
    assert leer_bsii(datos, {"a": {"i"}}) == {"x.a": ("a", {"i": 3})}


def test_bsii_cortado():
    campos = [(0x25, "i")]
    datos = _bsii([(1, "a", campos)], [(1, "x", struct.pack("<i", 3))])
    with pytest.raises(SiiIlegible):
        leer_bsii(datos[:-2])

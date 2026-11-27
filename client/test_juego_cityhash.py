"""CityHash64 propio (juego/cityhash.py) contra el modulo nativo de cityhash.

Los valores salen de city64 de cityhash.cc compilado (el modulo nativo del
parser de truckermudgeon, en el taller), para textos de 0 a 299 bytes: los
cuatro caminos de la funcion (hasta 16, 32, 64 y mas de 64 bytes, con varias
vueltas del bucle) y UTF-8 de mas de un byte.
"""

from juego.cityhash import city64

# (texto, hash del nativo)
NATIVO = [
    ("", 11160318154034397263),
    ("a", 2603192927274642682),
    ("ab", 1725057946192985918),
    ("abc", 4220206313085259313),
    ("abcd", 17823623939509273229),
    ("def", 3201855508716831834),
    ("def/city.sii", 11122960805439046185),
    ("map", 3838170918628451923),
    ("map/europe.mbd", 11415890111128459311),
]


def _cargar_resto():
    """El resto de los vectores, en un archivo aparte para no llenar este."""
    import json
    import os
    ruta = os.path.join(os.path.dirname(__file__), "juego", "vectores_cityhash.json")
    with open(ruta, encoding="utf-8") as f:
        return [(t, int(h)) for t, h in json.load(f)]


def test_igual_al_nativo_en_los_casos_cortos():
    for texto, esperado in NATIVO:
        assert city64(texto) == esperado, texto


def test_igual_al_nativo_en_todos_los_largos():
    vectores = _cargar_resto()
    assert len(vectores) >= 60
    largos = {len(t.encode("utf-8")) for t, _ in vectores}
    # los cuatro caminos de la funcion
    assert any(n <= 16 for n in largos) and any(16 < n <= 32 for n in largos)
    assert any(32 < n <= 64 for n in largos) and any(n > 128 for n in largos)
    malos = [t for t, h in vectores if city64(t) != h]
    assert not malos, malos[:3]


def test_texto_y_bytes_dan_lo_mismo():
    assert city64("locale/en_us/local.sui") == city64(b"locale/en_us/local.sui")
    assert city64("Ünïcödé/ruta") == city64("Ünïcödé/ruta".encode("utf-8"))

"""rumbo.py contra la web: los valores salen de correr gridHeadingToGeo de
pure.js con las proyecciones de app.js (proj4 de docs/app/vendor), en
Seattle, Bakersfield, Utah, Iowa y Texas (ATS) y en Bretana, Birmingham (con
el hack de UK), Uppsala y Bohemia (ETS2)."""

import math

import pytest

import rumbo

# (juego, x, z, rumbo de la grilla, rumbo real de la web)
RUMBOS = [
    ('ats', -111000, -60000, 0, 341.79),
    ('ats', -111000, -60000, 45, 26.728),
    ('ats', -111000, -60000, 90, 71.787),
    ('ats', -111000, -60000, 200, 181.75),
    ('ats', -111000, -60000, 359.5, 341.291),
    ('ats', -104900, 7188, 0, 345.47),
    ('ats', -104900, 7188, 45, 30.408),
    ('ats', -104900, 7188, 90, 75.468),
    ('ats', -104900, 7188, 200, 185.431),
    ('ats', -104900, 7188, 359.5, 344.971),
    ('ats', -67487, -11540, 0, 350.082),
    ('ats', -67487, -11540, 45, 35.02),
    ('ats', -67487, -11540, 90, 80.08),
    ('ats', -67487, -11540, 200, 190.043),
    ('ats', -67487, -11540, 359.5, 349.583),
    ('ats', 7245, -14697, 0, 1.084),
    ('ats', 7245, -14697, 45, 46.023),
    ('ats', 7245, -14697, 90, 91.083),
    ('ats', 7245, -14697, 200, 201.046),
    ('ats', 7245, -14697, 359.5, 0.585),
    ('ats', -13248, 54085, 0, 358.32),
    ('ats', -13248, 54085, 45, 43.259),
    ('ats', -13248, 54085, 90, 88.319),
    ('ats', -13248, 54085, 200, 198.282),
    ('ats', -13248, 54085, 359.5, 357.821),
    ('ets2', -60000, 10000, 0, 344.094),
    ('ets2', -60000, 10000, 45, 29.317),
    ('ets2', -60000, 10000, 90, 74.091),
    ('ets2', -60000, 10000, 200, 184.238),
    ('ets2', -60000, 10000, 359.5, 343.59),
    ('ets2', -45000, -20000, 0, 346.606),
    ('ets2', -45000, -20000, 45, 31.83),
    ('ets2', -45000, -20000, 90, 76.604),
    ('ets2', -45000, -20000, 200, 186.751),
    ('ets2', -45000, -20000, 359.5, 346.102),
    ('ets2', 24060, -51876, 0, 2.041),
    ('ets2', 24060, -51876, 45, 47.264),
    ('ets2', 24060, -51876, 90, 92.039),
    ('ets2', 24060, -51876, 200, 202.188),
    ('ets2', 24060, -51876, 359.5, 1.537),
    ('ets2', 10000, 5000, 0, 358.555),
    ('ets2', 10000, 5000, 45, 43.779),
    ('ets2', 10000, 5000, 90, 88.553),
    ('ets2', 10000, 5000, 200, 198.701),
    ('ets2', 10000, 5000, 359.5, 358.051),
]

# (juego, x, z, lon, lat de la web)
LUGARES = [
    ('ats', -111000, -60000, -124.884349, 46.500258),
    ('ats', -104900, 7188, -119.047266, 35.346873),
    ('ats', -67487, -11540, -111.731475, 40.014142),
    ('ats', 7245, -14697, -94.280195, 41.603632),
    ('ats', -13248, 54085, -98.66448, 29.381507),
    ('ets2', -60000, 10000, -5.256415, 47.060671),
    ('ets2', -45000, -20000, -2.057089, 52.356087),
    ('ets2', 24060, -51876, 17.599645, 59.857622),
    ('ets2', 10000, 5000, 13.159978, 49.834761),
]


def _dif(a, b):
    return abs((a - b + 180) % 360 - 180)


@pytest.mark.parametrize("juego,x,z,lon,lat", LUGARES)
def test_proyecciones_como_la_web(juego, x, z, lon, lat):
    plon, plat = rumbo.PROYECCIONES[juego](x, z)
    assert plon == pytest.approx(lon, abs=1e-5)
    assert plat == pytest.approx(lat, abs=1e-5)


@pytest.mark.parametrize("juego,x,z,grilla,real", RUMBOS)
def test_rumbo_real_como_la_web(juego, x, z, grilla, real):
    assert _dif(rumbo.rumbo_geografico(grilla, x, z, juego), real) < 0.01


def test_la_grilla_no_es_el_norte_en_seattle():
    # Rumbo 0 de la grilla en la costa de Washington es casi NNO real: con la
    # grilla tal cual, 10 grados al este del norte real salia NE.
    real = rumbo.rumbo_geografico(0, -111000, -60000, "ats")
    assert _dif(real, 341.79) < 0.01
    tele = {"game": "ats", "heading": 30.0, "position": {"x": -111000, "z": -60000}}
    assert rumbo.PUNTOS[rumbo.punto_cardinal(tele)] == "N"


def test_punto_cardinal_en_el_centro_de_la_proyeccion():
    # Sobre el meridiano central de ATS (-96) la grilla y el norte coinciden
    base = {"game": "ats", "position": {"x": 7245, "z": -14697}}
    esperado = {0: "N", 44: "NE", 90: "E", 136: "SE", 180: "S", 226: "SW", 270: "W", 316: "NW", 350: "N"}
    for grados, punto in esperado.items():
        assert rumbo.PUNTOS[rumbo.punto_cardinal({**base, "heading": grados})] == punto, grados


def test_sin_datos_no_hay_rumbo():
    assert rumbo.punto_cardinal(None) is None
    assert rumbo.punto_cardinal({"game": "ats", "heading": None, "position": {"x": 1, "z": 2}}) is None
    assert rumbo.punto_cardinal({"game": "ats", "heading": 10.0, "position": {"x": None, "z": 2}}) is None
    assert rumbo.punto_cardinal({"game": "ats", "heading": float("nan"), "position": {"x": 1, "z": 2}}) is None
    assert rumbo.punto_cardinal({"game": "ats", "heading": True, "position": {"x": 1, "z": 2}}) is None
    # Sin juego conocido, el de la grilla
    assert rumbo.PUNTOS[rumbo.punto_cardinal({"game": None, "heading": 95.0, "position": {"x": 1, "z": 2}})] == "E"

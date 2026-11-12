"""El rumbo del camion como punto cardinal (N, NE, E...), para el overlay.

El juego da el rumbo sobre la GRILLA de su mapa (heading_deg en client.py:
0 = -z, sentido horario), y la grilla no apunta al norte: los mapas del juego
son una proyeccion conica (Lambert) y los meridianos convergen. En ATS la
diferencia es 14 grados en Los Angeles y 17 en Seattle; con 8 puntos de 45
grados eso cambiaba el punto en un tercio de los rumbos. La web lo resuelve
con gridHeadingToGeo (pure.js) y las proyecciones de app.js (atsToLngLat,
ets2ToLngLat, con el hack de UK); esto es lo mismo en Python, para que el
overlay diga el rumbo aunque el tablero no este abierto. test_rumbo.py lo
compara con valores sacados de correr la web.

Grand Utopia (mapa standalone, ETS2) tiene otra proyeccion en la web; el
cliente no sabe que mapa se maneja y usa la de ETS2. Su norte es inventado.
"""

import math

EARTH_RADIUS_M = 6370997  # los de app.js
LENGTH_OF_DEGREE = EARTH_RADIUS_M * math.pi / 180

PUNTOS = ("N", "NE", "E", "SE", "S", "SW", "W", "NW")


def _lcc_inversa(lat1: float, lat2: float, lat0: float, lon0: float):
    """Lambert conica conforme sobre la esfera, de metros a (lon, lat): la
    inversa de +proj=lcc +R de proj4."""
    f1, f2, f0 = (math.radians(v) for v in (lat1, lat2, lat0))
    n = math.log(math.cos(f1) / math.cos(f2)) / math.log(
        math.tan(math.pi / 4 + f2 / 2) / math.tan(math.pi / 4 + f1 / 2))
    f = math.cos(f1) * math.tan(math.pi / 4 + f1 / 2) ** n / n
    rho0 = EARTH_RADIUS_M * f / math.tan(math.pi / 4 + f0 / 2) ** n

    def inversa(x: float, y: float) -> tuple[float, float]:
        rho = math.copysign(math.hypot(x, rho0 - y), n)
        th = math.atan2(x, rho0 - y)
        lat = 2 * math.atan((EARTH_RADIUS_M * f / rho) ** (1 / n)) - math.pi / 2
        return lon0 + math.degrees(th / n), math.degrees(lat)
    return inversa


# ATS_DEF y ETS2_DEF de app.js
_ATS = _lcc_inversa(33, 45, 39, -96)
_ATS_FACTOR = (-0.00017706234, 0.000176689948)
_ETS2 = _lcc_inversa(37, 65, 50, 15)
_ETS2_FACTOR = (-0.000171570875, 0.0001729241463)
_ETS2_OFFSET = (16660, 4150)
_UK_ESCALA, _CALAIS = 0.75, (-31100, -5500)


def ats_a_lnglat(x: float, z: float) -> tuple[float, float]:
    return _ATS(x * _ATS_FACTOR[1] * LENGTH_OF_DEGREE, z * _ATS_FACTOR[0] * LENGTH_OF_DEGREE)


def ets2_a_lnglat(x: float, z: float) -> tuple[float, float]:
    """ets2ToLngLat de app.js: lo que cae arriba a la izquierda del sector de
    Calais es Reino Unido y va a escala 0,75 (el hack de truckermudgeon)."""
    sx, sz = math.floor(x / 4000), math.floor(z / 4000)
    x -= _ETS2_OFFSET[0]
    z -= _ETS2_OFFSET[1]
    if sx <= -8 and sz <= -2 and not (sx == -8 and sz == -2):
        x = (x + _CALAIS[0] / 2) * _UK_ESCALA
        z = (z + _CALAIS[1] / 2) * _UK_ESCALA
    return _ETS2(x * _ETS2_FACTOR[1] * LENGTH_OF_DEGREE, z * _ETS2_FACTOR[0] * LENGTH_OF_DEGREE)


PROYECCIONES = {"ats": ats_a_lnglat, "ets2": ets2_a_lnglat}


def _bearing(a: tuple[float, float], b: tuple[float, float]) -> float:
    """geoBearingDeg de pure.js."""
    dlng = math.radians(b[0] - a[0])
    lat1, lat2 = math.radians(a[1]), math.radians(b[1])
    y = math.sin(dlng) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlng)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def _metros(a: tuple[float, float], b: tuple[float, float]) -> float:
    kx = 111320 * math.cos(math.radians((a[1] + b[1]) / 2))
    return math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * 110540)


def rumbo_geografico(rumbo: float, x: float, z: float, juego: str, paso_m: float = 10.0):
    """gridHeadingToGeo de pure.js: se proyectan la posicion y un punto unos
    metros adelante y se mide el bearing entre los dos. Si ese punto cae del
    otro lado de un corte de la proyeccion (el borde del hack de UK) la
    distancia no cierra, y se mide con un punto hacia atras. Sin proyeccion
    para ese juego, el de la grilla."""
    a_lnglat = PROYECCIONES.get(juego)
    if a_lnglat is None:
        return rumbo
    rad = math.radians(rumbo)
    dx, dz = math.sin(rad) * paso_m, -math.cos(rad) * paso_m
    aca = a_lnglat(x, z)
    adelante = a_lnglat(x + dx, z + dz)
    if _metros(aca, adelante) < paso_m * 3:
        return _bearing(aca, adelante)
    return _bearing(a_lnglat(x - dx, z - dz), aca)


def _numero(valor) -> bool:
    return isinstance(valor, (int, float)) and not isinstance(valor, bool) and math.isfinite(valor)


def punto_cardinal(tele: dict | None):
    """El indice en PUNTOS (0 = norte, de a 45 grados) del rumbo del camion,
    o None si la telemetria no trae rumbo o posicion."""
    if not tele:
        return None
    rumbo = tele.get("heading")
    pos = tele.get("position") or {}
    x, z = pos.get("x"), pos.get("z")
    if not (_numero(rumbo) and _numero(x) and _numero(z)):
        return None
    try:
        real = rumbo_geografico(float(rumbo), float(x), float(z), tele.get("game"))
    except (ValueError, ZeroDivisionError, OverflowError):
        real = float(rumbo)
    return int(((real % 360) + 22.5) // 45) % 8

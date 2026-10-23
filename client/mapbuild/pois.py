"""POIs de un mapa a partir de la salida del parser de truckermudgeon/maps:
estaciones de servicio, areas de descanso, talleres, garages, concesionarias,
basculas, estacionamientos para auto, el Atlas del Road Trip y las empresas
(con token + ciudad, para ubicar el punto exacto de carga/descarga de un
trabajo a partir de compSrcId/citySrcId de la telemetria).

Lo usan tools/build_pois.py (las variantes de R2) y el mapa armado en la PC.

Formato compacto (coordenadas de juego, redondeadas al metro):
  {
    "facilities": [[x, z, "g"], ...],          # g gas, p parking/rest, s service,
                                              # r garage, d dealer, w weigh station,
                                              # c estacionamiento para auto (ATS),
                                              # f surtidores solo para auto (ATS)
    "companies":  [[x, z, "token", "Label", "city_token"], ...],
    "cities":     {"city_token": "City Name", ...},
    "countries":  {"city_token": "country_token", ...},  # estado/pais del juego
                                              # ("wyoming"): la web lo muestra
                                              # en las ciudades repetidas
    "atlas":      [[x, z, "t", "Name"], ...],   # solo ATS: t tourist board,
                                              # o point of interest (Road Trip)
    "areas":      [[x, z, ancho, alto], ...]  # areas de ciudad (esquina de
                                              # arriba a la izquierda): adentro
                                              # el juego va a escala 1:3
  }
"""

import json
import math
import os
import re

FACILITY_CODES = {
    "gas_ico": "g",
    "parking_ico": "p",
    "service_ico": "s",
    "garage_large_ico": "r",
    "dealer_ico": "d",
    # Dos tokens para lo mismo, y el juego les dibuja el MISMO icono: en ETS2
    # hay 17 weigh_station_ico y 34 weigh_ico, y solo 4 de los segundos estan
    # cerca de uno de los primeros. Con uno solo en la lista, dos tercios de
    # las basculas no aparecian ni en el mapa ni en la busqueda.
    "weigh_station_ico": "w",
    "weigh_ico": "w",
}

# Nombres del Atlas (clave del locale -> texto en ingles), sacados del
# locale.scs de ATS por build_atlas_names.py del taller. Viaja con el cliente
# para que el mapa armado en la PC tambien tenga los nombres.
ATLAS_NAMES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "atlas-names-ats.json")
ATLAS_KEY = re.compile(r"(tb|poi)_[a-z]{2}\d+(_\d+)?")

# Surtidores solo para auto (ATS 1.61): los techos de surtidores para auto
# (prefab/gas/us_gas_<marca>_car_<N>rows...) tienen surtidor desde el Road
# Trip, y en camion no se entra. El juego no los muestra en su mapa yendo en
# camion; Truck Dash si, y en Spearfish mandaba a un camion a una estacion
# donde no podia cargar (Discord, 12-10). Las paradas de camiones tienen los
# dos techos, cada uno con su prefab: el de camion es "_truck_<N>rows".
# Solo en ATS: en ETS2 no se maneja auto.
CAR_FUEL_PREFAB = re.compile(r"_car_\d+rows")


def facility_code(p, prefix):
    """El codigo de un POI de servicio del parser (ver FACILITY_CODES), o None."""
    code = FACILITY_CODES.get(p.get("icon"))
    if code == "g" and prefix == "usa" and CAR_FUEL_PREFAB.search(p.get("prefabPath") or ""):
        return "f"
    return code


# Plazas para auto (ATS 1.61): triggers "parking_car", una por lugar de
# estacionar. Se agrupan en lugares (~150 m) y se guarda el centro de cada
# uno. Los "hud_parking" son los de camion, que ya vienen como parking_ico.
CAR_PARKING_RADIUS_M = 150

# Ciudades que tienen empresas pero no salen en <prefijo>-cities.json del
# parser (pasa con algunas de C2C, Rusia de ETS2 y ProMods/Roextended): sin
# nombre, buscar la ciudad no daba nada ("can't find the city", Discord
# 10-10). Las que no estan aca toman el token con mayusculas.
CITY_NAMES_EXTRA = {
    "gulfport": "Gulfport", "meridian": "Meridian",
    "kirishi": "Kirishi", "v_novgorod": "Veliky Novgorod", "volkhov": "Volkhov",
    "longyearbyem": "Longyearbyen", "strzelcekraj": "Strzelce Krajeńskie",
    "alakurtti_rm": "Alakurtti", "kandalrm": "Kandalaksha", "kola_rm": "Kola", "murmansk_rm": "Murmansk",
    "cernihiv": "Chernihiv", "rivnne": "Rivne", "ribnita": "Rîbnița",
}


def _cargar(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_atlas_names():
    try:
        return _cargar(ATLAS_NAMES_PATH)
    except OSError:
        return {}


def car_parking(parser_dir, prefix):
    path = os.path.join(parser_dir, f"{prefix}-triggers.json")
    if not os.path.exists(path):
        return []
    grupos = []  # [suma_x, suma_z, n]
    for t in _cargar(path):
        if not any(a and a[0] == "parking_car" for a in t.get("actions") or []):
            continue
        for g in grupos:
            if abs(g[0] / g[2] - t["x"]) < CAR_PARKING_RADIUS_M and abs(g[1] / g[2] - t["y"]) < CAR_PARKING_RADIUS_M:
                g[0] += t["x"]; g[1] += t["y"]; g[2] += 1
                break
        else:
            grupos.append([t["x"], t["y"], 1])
    return [[round(gx / n), round(gz / n), "c"] for gx, gz, n in grupos]


def atlas_items(parser_dir, prefix, names=None):
    """Tourist Boards y Points of Interest del Atlas (Road Trip de ATS). El
    parser los saca como cutscenes: la accion "rt_tb" o "rt_poi" dice que son
    y el ultimo tag es la clave del nombre ("tb_ca1", "poi_ca1_01")."""
    path = os.path.join(parser_dir, f"{prefix}-cutscenes.json")
    if not os.path.exists(path):
        return []
    names = load_atlas_names() if names is None else names
    out = []
    for c in _cargar(path):
        params = c.get("actionStringParams") or []
        kind = "t" if "rt_tb" in params else "o" if "rt_poi" in params else None
        if not kind or not c.get("tags"):
            continue
        key = c["tags"][-1]
        # Solo las claves del Atlas de SCS: un mod de ETS2 usa la misma accion
        # con otra clave ("poi_tag_sw01") y no es un lugar del Atlas.
        if not ATLAS_KEY.fullmatch(key):
            continue
        out.append([round(c["x"]), round(c["y"]), kind, names.get(key, key)])
    # Los tourist boards primero: son los destinos del Atlas
    out.sort(key=lambda a: (a[2] != "t", a[3]))
    return out


def build(parser_dir, prefix, work_points=None, atlas_names=None):
    """El dict de POIs, o None si esa carpeta no tiene salida del parser.

    work_points: {"token|ciudad": [x, z]} con el centro de los puntos de
    trabajo de cada empresa (build_company_points.py del taller); sin eso, la
    posicion del icono."""
    path = os.path.join(parser_dir, f"{prefix}-pois.json")
    if not os.path.exists(path):
        return None
    work_points = work_points or {}
    facilities = []
    companies = []
    seen = set()
    del_parser = _cargar(path)
    # Los garajes del jugador traen un surtidor en el prefab (un spawn GasPos,
    # que el parser vuelve gas_ico), pero el juego no lo muestra en su mapa y
    # la web no sabe cuales son del jugador (no lee la partida): cada garaje,
    # comprado o no, salia como estacion de servicio (Discord 23-10,
    # Chillaxingone). Es el surtidor del mismo prefab que el lugar de comprar
    # el garaje (BuyPos, garage_large_ico): asi tambien los garajes de los
    # mods, que no estan en prefab/garage_player ni en garage_scandinavia.
    garajes = {p["prefabUid"] for p in del_parser if p.get("icon") == "garage_large_ico" and p.get("prefabUid")}
    for p in del_parser:
        x, z = round(p["x"]), round(p["y"])
        if p.get("icon") == "gas_ico" and p.get("prefabUid") in garajes:
            continue
        # Se filtra por ICONO y no por tipo: weigh_ico viene como type="road"
        # (es el cartel de la bascula al costado de la ruta, no un prefab con
        # playa), y con el filtro por tipo se caian los 34 de ETS2.
        if p.get("type") != "company" and p.get("icon") in FACILITY_CODES:
            key = (x, z, p["icon"])
            if key in seen:
                continue
            seen.add(key)
            facilities.append([x, z, facility_code(p, prefix)])
        elif p.get("type") == "company" and p.get("icon"):
            # La posicion que se guarda NO es la del icono sino la del centro
            # de los puntos de trabajo del prefab (muelles de descarga y
            # lugares de trailer), que es adonde el juego te manda de verdad.
            # El icono se equivoca por 53 m de mediana y hasta 214 m; el
            # centro, por 29 m, y gana en el 99% de las empresas.
            ciudad = p.get("cityToken") or ""
            punto = work_points.get(f'{p["icon"]}|{ciudad}')
            px, pz = (punto[0], punto[1]) if punto else (x, z)
            companies.append([px, pz, p["icon"], p.get("label") or p["icon"], ciudad])
    cities = {}
    # El estado de cada ciudad: hay tres Jackson en ATS + C2C, y en el
    # buscador no se sabia cual era cual (Discord, 11-10).
    countries = {}
    areas = []
    try:
        for c in _cargar(os.path.join(parser_dir, f"{prefix}-cities.json")):
            if c.get("token") and c.get("name"):
                cities[c["token"]] = c["name"]
                if c.get("countryToken"):
                    countries[c["token"]] = c["countryToken"]
            areas.extend(city_areas(c))
    except OSError:
        pass
    # Dos surtidores de la misma estacion (o dos plazas del mismo parking)
    # aparecen como POIs separados a pocos metros - se deja uno solo por
    # tipo dentro de un radio de ~120 m para que la lista no repita.
    grid = {}
    deduped = []
    for x, z, code in facilities:
        cell = (x // 120, z // 120, code)
        if any(abs(x - ox) < 120 and abs(z - oz) < 120 for ox, oz in grid.get(cell, [])):
            continue
        grid.setdefault(cell, []).append((x, z))
        deduped.append([x, z, code])
    out = {"facilities": deduped + car_parking(parser_dir, prefix), "companies": companies, "cities": cities}
    if countries:
        out["countries"] = countries
    atlas = atlas_items(parser_dir, prefix, atlas_names)
    if atlas:
        out["atlas"] = atlas
    if areas:
        out["areas"] = areas
    fill_missing_cities(out)
    return out


def city_areas(city):
    """Las areas de una ciudad del parser como [x, z, ancho, alto], en metros.

    Adentro de esas cajas el juego corre a escala 1:3 (reloj y distancias) en
    vez de la 1:19/1:20 de la ruta: la web media todo a 1:20 y en Rockford
    decia 25,5 mi (y "2h 21m") a un waypoint con el GPS del juego en 4,0 mi
    (Discord, 14-10). Van tambien las ocultas (hidden): no muestran el nombre
    pero son ciudad igual, y en ATS son casi todas (las de Rockford, todas).
    x, y es la esquina de arriba a la izquierda: con esa lectura el 93% de
    las empresas de ATS cae adentro de su ciudad; tomandola como centro, el
    28%.
    Se redondea para afuera: hay cajas de menos de un metro de ancho (ProMods)
    y redondeadas al metro quedaban en 0."""
    out = []
    for a in city.get("areas") or []:
        try:
            x, z, w, h = float(a["x"]), float(a["y"]), float(a["width"]), float(a["height"])
        except (KeyError, TypeError, ValueError):
            continue
        if w > 0 and h > 0:
            x0, z0 = math.floor(x), math.floor(z)
            out.append([x0, z0, math.ceil(x + w) - x0, math.ceil(z + h) - z0])
    return out


def city_name_from_token(token):
    return CITY_NAMES_EXTRA.get(token) or " ".join(w[:1].upper() + w[1:] for w in token.split("_"))


def fill_missing_cities(pois):
    """Agrega a "cities" las ciudades de las empresas que no tienen nombre.
    Devuelve los tokens agregados."""
    cities = pois.setdefault("cities", {})
    nuevos = sorted({c[4] for c in pois.get("companies", []) if c[4] and c[4] not in cities})
    for tok in nuevos:
        cities[tok] = city_name_from_token(tok)
    return nuevos


def write(pois, out_path):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(pois, f, ensure_ascii=False, separators=(",", ":"))

"""
Genera docs/data/pois-<variante>.json a partir del output del parser de
truckermudgeon/maps (<prefijo>-pois.json): estaciones de servicio, areas de
descanso, talleres, garages, concesionarias, basculas, y las empresas
(con token + ciudad, para ubicar el punto exacto de carga/descarga de un
trabajo a partir de compSrcId/citySrcId de la telemetria).

Formato compacto (coordenadas de juego, redondeadas al metro):
  {
    "facilities": [[x, z, "g"], ...],          # g gas, p parking/rest, s service,
                                              # r garage, d dealer, w weigh station
    "companies":  [[x, z, "token", "Label", "city_token"], ...],
    "cities":     {"city_token": "City Name", ...}
  }

Uso (rutas relativas a D:\\ets2-companion, ver VARIANTS):
  python tools/build_pois.py
"""

import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARSER_ROOT = os.path.dirname(ROOT)  # D:\ets2-companion
OUT_DIR = os.path.join(ROOT, "docs", "data")

# variante de mapa en la web -> (carpeta del parser, prefijo)
VARIANTS = {
    "ats": ("parser-output-ats", "usa"),
    "ats_c2c": ("parser-output-ats_c2c", "usa"),  # Coast to Coast 2.23.61.0
    "ats_promods": ("parser-output-ats-promods-v164", "usa"),
    "ats_c2c_promods": ("parser-output-ats_c2c_promods", "usa"),  # C2C 2.23.61.0 + ProMods Canada 1.64
    "ats_reforma": ("parser-output-ats_reforma", "usa"),  # Reforma 2.9.9.160 + Mega Resources + Sierra Nevada 1.16
    "ats_reforma_c2c_promods": ("parser-output-ats_reforma_c2c_promods", "usa"),  # + C2C + ProMods Canada + OtherMaps Patch 37
    "ets2": ("parser-output-ets2", "europe"),
    "ets2_promods": ("parser-output-ets2_promods", "europe"),  # ProMods 2.84 + ME 2.84 + Maghreb 1.04 + TGS 1.70
    "ets2_promods_rusmap": ("parser-output-ets2_promods_rusmap", "europe"),  # + RusMap 2.61 + conector 2.84/2.61
    "ets2_promods_roex": ("parser-output-ets2_promods_roex", "europe"),  # ProMods + Roextended Hybrid 1.61 v3 + ROEX53PMME284
    "ets2_promods_rusmap_roex": ("parser-output-ets2_promods_rusmap_roex", "europe"),  # + RusMap + ROEX53RM261
    "ets2_gu": ("parser-output-ets2_gu", "europe"),  # Grand Utopia 1.20c (standalone)
    "ets2_tmp": ("parser-output-ets2_tmp", "europe"),  # TruckersMP (sede TMP + CD road)
}

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


def build(variant, folder, prefix):
    path = os.path.join(PARSER_ROOT, folder, f"{prefix}-pois.json")
    if not os.path.exists(path):
        # variante todavia no parseada en esta maquina: se conserva el json publicado
        print(f"  {variant}: sin {path}, se saltea")
        return
    with open(path, encoding="utf-8") as f:
        pois = json.load(f)
    # Puntos de trabajo por empresa. Si el archivo no esta (variante todavia
    # no procesada en esta maquina), se cae al icono y no se rompe nada.
    work_points = {}
    wp_path = os.path.join(PARSER_ROOT, f"company-points-{variant}.json")
    if os.path.exists(wp_path):
        with open(wp_path, encoding="utf-8") as f:
            work_points = json.load(f)
    facilities = []
    companies = []
    seen = set()
    for p in pois:
        x, z = round(p["x"]), round(p["y"])
        # Se filtra por ICONO y no por tipo: weigh_ico viene como type="road"
        # (es el cartel de la bascula al costado de la ruta, no un prefab con
        # playa), y con el filtro por tipo se caian los 34 de ETS2.
        if p.get("type") != "company" and p.get("icon") in FACILITY_CODES:
            key = (x, z, p["icon"])
            if key in seen:
                continue
            seen.add(key)
            facilities.append([x, z, FACILITY_CODES[p["icon"]]])
        elif p.get("type") == "company" and p.get("icon"):
            # La posicion que se guarda NO es la del icono sino la del centro
            # de los puntos de trabajo del prefab (muelles de descarga y
            # lugares de trailer), que es adonde el juego te manda de verdad.
            # El icono se equivoca por 53 m de mediana y hasta 214 m; el
            # centro, por 29 m, y gana en el 99% de las empresas. Lo calcula
            # build_company_points.py, que vive en el pipeline porque necesita
            # prefabs, descripciones y nodos (cientos de MB).
            ciudad = p.get("cityToken") or ""
            punto = work_points.get(f'{p["icon"]}|{ciudad}')
            px, pz = (punto[0], punto[1]) if punto else (x, z)
            companies.append([px, pz, p["icon"], p.get("label") or p["icon"], ciudad])
    cities = {}
    try:
        with open(os.path.join(PARSER_ROOT, folder, f"{prefix}-cities.json"), encoding="utf-8") as f:
            for c in json.load(f):
                if c.get("token") and c.get("name"):
                    cities[c["token"]] = c["name"]
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
    facilities = deduped
    out = {"facilities": facilities, "companies": companies, "cities": cities}
    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, f"pois-{variant}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  {variant}: {len(facilities)} facilities, {len(companies)} companies -> {os.path.getsize(out_path) // 1024}KB")


if __name__ == "__main__":
    for variant, (folder, prefix) in VARIANTS.items():
        build(variant, folder, prefix)

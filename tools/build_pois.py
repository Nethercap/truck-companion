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
    "weigh_station_ico": "w",
}


def build(variant, folder, prefix):
    path = os.path.join(PARSER_ROOT, folder, f"{prefix}-pois.json")
    if not os.path.exists(path):
        # variante todavia no parseada en esta maquina: se conserva el json publicado
        print(f"  {variant}: sin {path}, se saltea")
        return
    with open(path, encoding="utf-8") as f:
        pois = json.load(f)
    facilities = []
    companies = []
    seen = set()
    for p in pois:
        x, z = round(p["x"]), round(p["y"])
        if p.get("type") == "facility" and p.get("icon") in FACILITY_CODES:
            key = (x, z, p["icon"])
            if key in seen:
                continue
            seen.add(key)
            facilities.append([x, z, FACILITY_CODES[p["icon"]]])
        elif p.get("type") == "company" and p.get("icon"):
            companies.append([x, z, p["icon"], p.get("label") or p["icon"], p.get("cityToken") or ""])
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

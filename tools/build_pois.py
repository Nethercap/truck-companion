"""
Genera docs/data/pois-<variante>.json para cada variante de R2 a partir del
output del parser de truckermudgeon/maps. La logica vive en
client/mapbuild/pois.py, que el cliente usa tambien para el mapa armado en la
PC; aca solo se recorren las variantes y se suman los puntos de trabajo de
las empresas (company-points-<variante>.json del taller).

Uso (rutas relativas a D:\\ets2-companion, ver VARIANTS):
  python tools/build_pois.py
"""

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARSER_ROOT = os.path.dirname(ROOT)  # D:\ets2-companion
OUT_DIR = os.path.join(ROOT, "docs", "data")

sys.path.insert(0, os.path.join(ROOT, "client"))
from mapbuild import pois as mapbuild_pois  # noqa: E402
from mapbuild.pois import FACILITY_CODES  # noqa: E402,F401  (lo importa check_map_data.py)

# variante de mapa en la web -> (carpeta del parser, prefijo)
VARIANTS = {
    "ats": ("parser-output-ats", "usa"),
    "ats_c2c": ("parser-output-ats_c2c", "usa"),  # Coast to Coast 2.24.61.0
    "ats_promods": ("parser-output-ats-promods-v164", "usa"),
    "ats_c2c_promods": ("parser-output-ats_c2c_promods", "usa"),  # C2C 2.24.61.0 + ProMods Canada 1.64
    "ats_reforma": ("parser-output-ats_reforma", "usa"),  # Reforma 3.0.1.161 + Mega Resources + Sierra Nevada 1.19
    "ats_reforma_c2c_promods": ("parser-output-ats_reforma_c2c_promods", "usa"),  # Reforma 2.9.9 + C2C + ProMods Canada + OtherMaps Patch 37
    "ats_canada": ("parser-output-ats_canada", "usa"),  # Western Canada Expansion 1.7.3 + Eastern 1.2.1
    "ats_c2c_canada": ("parser-output-ats_c2c_canada", "usa"),  # C2C 2.24.61.0 + Western/Eastern Canada + sus conectores C2C
    "ets2": ("parser-output-ets2", "europe"),
    "ets2_promods": ("parser-output-ets2_promods", "europe"),  # ProMods 2.84 + ME 2.84 + Maghreb 1.04 + TGS 1.70
    "ets2_promods_rusmap": ("parser-output-ets2_promods_rusmap", "europe"),  # + RusMap 2.61 + conector 2.84/2.61
    "ets2_promods_roex": ("parser-output-ets2_promods_roex", "europe"),  # ProMods + Roextended Hybrid 1.61 v3 + ROEX53PMME284
    "ets2_promods_rusmap_roex": ("parser-output-ets2_promods_rusmap_roex", "europe"),  # + RusMap + ROEX53RM261
    "ets2_gu": ("parser-output-ets2_gu", "europe"),  # Grand Utopia 1.20c (standalone)
    "ets2_eugu": ("parser-output-ets2_eugu", "europe"),  # European Grand Utopia 1.12 + GU 1.20d
    "ets2_promods_eugu": ("parser-output-ets2_promods_eugu", "europe"),  # ProMods + EUGU 1.12 (+ su parche para ProMods)
    "ets2_tmp": ("parser-output-ets2_tmp", "europe"),  # TruckersMP (sede TMP + CD road)
}


def build(variant, folder, prefix):
    # Puntos de trabajo por empresa. Si el archivo no esta (variante todavia
    # no procesada en esta maquina), se cae al icono y no se rompe nada.
    work_points = {}
    wp_path = os.path.join(PARSER_ROOT, f"company-points-{variant}.json")
    if os.path.exists(wp_path):
        with open(wp_path, encoding="utf-8") as f:
            work_points = json.load(f)
    pois = mapbuild_pois.build(os.path.join(PARSER_ROOT, folder), prefix, work_points)
    if pois is None:
        # variante todavia no parseada en esta maquina: se conserva el json publicado
        print(f"  {variant}: sin {folder}/{prefix}-pois.json, se saltea")
        return
    out_path = os.path.join(OUT_DIR, f"pois-{variant}.json")
    mapbuild_pois.write(pois, out_path)
    facilities, atlas = pois["facilities"], pois.get("atlas") or []
    autos = sum(1 for f in facilities if f[2] == "c")
    extra = (f", {len(atlas)} atlas" if atlas else "") + (f", {autos} car parking" if autos else "")
    print(f"  {variant}: {len(facilities)} facilities, {len(pois['companies'])} companies{extra} -> {os.path.getsize(out_path) // 1024}KB")


if __name__ == "__main__":
    for variant, (folder, prefix) in VARIANTS.items():
        build(variant, folder, prefix)

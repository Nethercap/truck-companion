"""Valida los POIs publicados (docs/data/pois-<variante>.json), sin el juego.

check_map_data.py compara contra la salida del parser y solo corre en la PC
que la tiene; esto mira lo que ya esta publicado y corre en CI. Cada chequeo
sale de un bug real:

  - cada variante del manifest tiene su pois-<variante>.json;
  - toda empresa tiene nombre de ciudad en "cities": Gulfport, Meridian y
    otras de C2C, Rusia y ProMods no estaban, y buscar la ciudad no daba
    nada ("can't find the city I'm going to", Discord 10-10);
  - forma de cada fila (coordenadas numericas, codigos que la web conoce).

Uso:
  python tools/check_pois.py          sale con 1 si algo falla
  python tools/check_pois.py --fix    completa los nombres de ciudad que falten
"""

import glob
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "docs", "data")

sys.path.insert(0, os.path.join(ROOT, "client"))
from mapbuild import pois as mapbuild_pois  # noqa: E402

# Codigos de facilities: los de los iconos del juego, mas los estacionamientos
# para auto ("c", car_parking) que no salen de un icono.
FACILITY_CODES = set(mapbuild_pois.FACILITY_CODES.values()) | {"c"}
ATLAS_KINDS = {"t", "o"}  # tourist board / otro punto del Atlas


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def check_file(path, fix=False):
    errores = []
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    for k in ("facilities", "companies", "cities"):
        if k not in d:
            errores.append(f"falta '{k}'")
    if errores:
        return errores
    for fila in d["facilities"]:
        if len(fila) != 3 or not (_num(fila[0]) and _num(fila[1])) or fila[2] not in FACILITY_CODES:
            errores.append(f"facility rara: {fila}")
            break
    for fila in d["companies"]:
        if len(fila) != 5 or not (_num(fila[0]) and _num(fila[1])) or not fila[2] or not isinstance(fila[3], str):
            errores.append(f"empresa rara: {fila}")
            break
    for fila in d.get("atlas") or []:
        if len(fila) != 4 or not (_num(fila[0]) and _num(fila[1])) or fila[2] not in ATLAS_KINDS or not fila[3]:
            errores.append(f"atlas raro: {fila}")
            break
    if not all(isinstance(v, str) and v.strip() for v in d["cities"].values()):
        errores.append("ciudad sin nombre en 'cities'")
    if fix:
        if mapbuild_pois.fill_missing_cities(d):
            mapbuild_pois.write(d, path)
    sin_nombre = sorted({c[4] for c in d["companies"] if c[4] and c[4] not in d["cities"]})
    if sin_nombre:
        errores.append(f"{len(sin_nombre)} ciudades con empresas y sin nombre: {', '.join(sin_nombre[:10])}"
                       " (python tools/check_pois.py --fix)")
    return errores


def main():
    fix = "--fix" in sys.argv[1:]
    with open(os.path.join(DATA_DIR, "map-manifest.json"), encoding="utf-8") as f:
        variantes = json.load(f)["variants"]
    fallas = 0
    for v in variantes:
        if not os.path.exists(os.path.join(DATA_DIR, f"pois-{v}.json")):
            print(f"FALLA {v}: no hay pois-{v}.json")
            fallas += 1
    for path in sorted(glob.glob(os.path.join(DATA_DIR, "pois-*.json"))):
        nombre = os.path.basename(path)
        errores = check_file(path, fix)
        for e in errores:
            print(f"FALLA {nombre}: {e}")
        if not errores:
            print(f"ok    {nombre}")
        fallas += len(errores)
    sys.exit(1 if fallas else 0)


if __name__ == "__main__":
    main()

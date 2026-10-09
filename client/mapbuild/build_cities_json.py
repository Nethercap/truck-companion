"""
Convierte el usa-cities.json/europe-cities.json crudo del parser (token, name,
countryToken, population, x, y, ...) al Cities.json minimo que consume la web
(solo usa Name/X/Y - ver docs/app/index.html, loadCities/citiesByName).

Uso:
  python build_cities_json.py <usa-cities.json> <Cities.json salida>
"""

import json
import sys


def main(argv=None):
    argv = sys.argv if argv is None else argv
    if len(argv) != 3:
        print("Uso: python build_cities_json.py <cities.json entrada> <salida>")
        sys.exit(1)

    with open(argv[1], encoding="utf-8") as f:
        raw = json.load(f)

    # Name = nombre localizado (en_us) que muestra la web; Token = id de ciudad
    # del juego (cityDstId de la telemetria, matchea en cualquier idioma);
    # Native = nombre nativo del def cuando difiere (ej. "Москва" vs "Moscow").
    out = []
    for c in raw:
        item = {"Name": c["name"], "X": c["x"], "Y": c["y"], "Token": c.get("token")}
        if c.get("nameNative"):
            item["Native"] = c["nameNative"]
        out.append(item)

    with open(argv[2], "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)

    print(f"{len(out)} ciudades escritas en {argv[2]}")


if __name__ == "__main__":
    main()

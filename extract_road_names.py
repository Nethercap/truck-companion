"""
Extrae nombres de ruta reales (US-75, I-70, etc.) desde los carteles ya
parseados por truckermudgeon/maps (usa-signs.json), para usarlos en las
indicaciones de navegacion GPS en vez del generico "gira en Xm".

Cada entrada de usa-signs.json es un cartel de la ruta con su posicion (x,y,
mismo sistema de coordenadas que route-graph-usa.json y Cities.json) y una
lista de textItems que mezcla texto plano y referencias a sprites del atlas
(ej. "/def/sign/atlas/us_75.sii" para el escudo de la US-75). Esta funcion
busca los sprites de tipo interestatal (is_NN) y ruta US (us_NN) - los mas
comunes y los unicos con un patron de nombre limpio y consistente - y guarda
un archivo compacto {x, y, label} para cada uno.

Uso:
  python extract_road_names.py <usa-signs.json> <salida.json>
"""

import json
import re
import sys

SHIELD_RE = re.compile(r"/def/sign/atlas/(us|is)_(\d+)\.sii")


def extract(signs: list) -> list:
    out = []
    seen = set()
    for sign in signs:
        x, y = sign.get("x"), sign.get("y")
        if x is None or y is None:
            continue
        for item in sign.get("textItems", []):
            m = SHIELD_RE.match(item)
            if not m:
                continue
            kind, number = m.groups()
            label = f"I-{number}" if kind == "is" else f"US-{number}"
            # Un mismo cartel fisico puede repetir el mismo escudo en varios
            # textItems (ej. cuando el cartel indica "ir y luego seguir" con
            # flechas intermedias) - se deduplica por (x redondeado, label)
            # para no inflar el archivo con puntos casi identicos.
            key = (round(x), round(y), label)
            if key in seen:
                continue
            seen.add(key)
            out.append({"x": round(x, 1), "y": round(y, 1), "label": label, "kind": "road"})
    return out


def main():
    if len(sys.argv) != 3:
        print("Uso: python extract_road_names.py <usa-signs.json> <salida.json>")
        sys.exit(1)

    with open(sys.argv[1], encoding="utf-8") as f:
        signs = json.load(f)

    result = extract(signs)
    with open(sys.argv[2], "w", encoding="utf-8") as f:
        json.dump(result, f, separators=(",", ":"))

    print(f"{len(signs)} carteles procesados -> {len(result)} escudos de ruta extraidos")
    print(f"Escrito en {sys.argv[2]}")


if __name__ == "__main__":
    main()

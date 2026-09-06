"""
Extrae nombres de destino reales (ciudades/cruces) desde los carteles ya
parseados de ETS2 (europe-signs.json), para usarlos en las indicaciones GPS.

A diferencia de ATS (donde los escudos de ruta US-NN/I-NN vienen en un sprite
de nombre limpio y consistente, ver extract_road_names.py), en ETS2 el numero
de ruta (A7, E45, etc.) esta baked dentro de texturas de cartel especificas
por pais sin un patron de nombre de archivo reutilizable - no hay forma
confiable de extraerlo con una regex simple. Lo que SI es limpio y consistente
en todos los paises es el texto plano de los carteles con nombres de ciudad/
cruce (ej. "Prag/Praha", "Frankfurt a.M.", "Kreuz Erfurt"), asi que en vez de
"gira hacia la A4" mostramos "gira hacia Praga" - mismo valor practico para
el usuario (un cartel real dice lo mismo), con datos confiables.

Uso:
  python extract_road_names_ets2.py <europe-signs.json> <salida.json>
"""

import json
import re
import sys

# Cualquier textItem que no sea una referencia a sprite/fuente (empiezan con
# "/"), no tenga markup de formato (<sub>...), no sea solo numeros/distancias
# ("2800 m", "71") y tenga al menos una letra, se toma como candidato a
# nombre real de destino/cruce.
NUMERIC_OR_DISTANCE_RE = re.compile(r"^[\d.,\s]+m?$")
HAS_LETTER_RE = re.compile(r"[A-Za-zÀ-ÿ]")
MIN_LEN, MAX_LEN = 2, 40


def looks_like_name(text: str) -> bool:
    if text.startswith("/"):
        return False
    if "<" in text or ">" in text:
        return False
    if not (MIN_LEN <= len(text) <= MAX_LEN):
        return False
    if NUMERIC_OR_DISTANCE_RE.match(text):
        return False
    return bool(HAS_LETTER_RE.search(text))


def extract(signs: list) -> list:
    out = []
    seen = set()
    for sign in signs:
        x, y = sign.get("x"), sign.get("y")
        if x is None or y is None:
            continue
        for item in sign.get("textItems", []):
            if not looks_like_name(item):
                continue
            key = (round(x), round(y), item)
            if key in seen:
                continue
            seen.add(key)
            out.append({"x": round(x, 1), "y": round(y, 1), "label": item, "kind": "city"})
    return out


def main():
    if len(sys.argv) != 3:
        print("Uso: python extract_road_names_ets2.py <europe-signs.json> <salida.json>")
        sys.exit(1)

    with open(sys.argv[1], encoding="utf-8") as f:
        signs = json.load(f)

    result = extract(signs)
    with open(sys.argv[2], "w", encoding="utf-8") as f:
        json.dump(result, f, separators=(",", ":"), ensure_ascii=False)

    print(f"{len(signs)} carteles procesados -> {len(result)} nombres de destino extraidos")
    print(f"Escrito en {sys.argv[2]}")


if __name__ == "__main__":
    main()

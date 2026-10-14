"""
Extrae nombres de ruta reales (US-75, I-70, etc.) desde los carteles ya
parseados por truckermudgeon/maps (usa-signs.json), para usarlos en las
indicaciones de navegacion GPS en vez del generico "gira en Xm".

Cada entrada de usa-signs.json es un cartel de la ruta con su posicion (x,y,
mismo sistema de coordenadas que route-graph-usa.json y Cities.json) y una
lista de textItems que mezcla texto plano y referencias a sprites del atlas
(ej. "/def/sign/atlas/us_75.sii" para el escudo de la US-75). Esta funcion
busca los escudos de interestatal (is_NN), ruta US (us_NN) e interestatal
business (bu_NN, el verde) y guarda un archivo compacto {x, y, label} para
cada uno.

El nombre lleva el cartelito de abajo del escudo cuando lo hay: "US-20 Bus"
y no "US-20" en Rockford, donde la calle es la Business US-20 (West State
St) y el tablero decia "Keep right onto US-20" (Discord, 14-10). El
cartelito viene de dos lados: del nombre del sprite (us_71b business,
us_16a alternate, us_54_bus_nm, us_66_h historica) o de un texto del
cartel ("BUSINESS", "ALT", "BYPASS"...) despues del escudo.

Uso:
  python extract_road_names.py <usa-signs.json> <salida.json>
"""

import json
import re
import sys

# El escudo y sus variantes de dibujo: us_385_2, us_50_guide,
# us_101_ca_guide_2, is_580_ca, us_54_black, bu_10_white... Antes solo se
# leia us_NN / is_NN exacto y se perdian unos 3.800 escudos por mapa de ATS.
# Letra pegada al numero: us_71b, us_16a, is_35e, is_35w.
SHIELD_RE = re.compile(r"/def/sign/atlas/(us|is|bu)_(\d+)([a-z]?)((?:_[a-z0-9]+)*)\.sii$")

# Cartelitos escritos en el cartel, y como quedan en el nombre.
PLATE_WORDS = {
    "BUSINESS": "Bus", "BUS": "Bus",
    "ALT": "Alt", "ALTERNATE": "Alt",
    "BYPASS": "Byp", "BYP": "Byp",
    "TRUCK": "Truck", "LOOP": "Loop", "SPUR": "Spur",
}
# Lo que puede haber entre el escudo y su cartelito: el sentido (NORTH...),
# flechas y otros sprites. Cualquier otro texto (una ciudad, "TO", la
# salida) corta: el cartelito que sigue ya no es de ese escudo.
DIRECTIONS = {"NORTH", "SOUTH", "EAST", "WEST", ""}


def _text(item):
    """El texto de un textItem sin el marcado del juego, en mayusculas:
    "<sub scale=1.16>E</sub>AST" -> "EAST"."""
    return " ".join(re.sub(r"<[^>]*>", "", item).split()).upper()


def _shield(item):
    """(nombre base, cartelito o None) de un sprite de escudo, o None."""
    m = SHIELD_RE.match(item)
    if not m:
        return None
    kind, number, letter, rest = m.groups()
    tokens = [t for t in rest.split("_") if t]
    plate = None
    if kind == "bu" or letter == "b" or "bus" in tokens:
        plate = "Bus"
    elif letter == "a" or "alt" in tokens:
        plate = "Alt"
    elif any(t == "historic" or re.fullmatch(r"h\d*", t) for t in tokens):
        plate = "Hist"
    if kind == "us":
        return f"US-{number}", plate
    # I-35E / I-35W: la letra es parte del numero de la interestatal
    suffix = letter.upper() if kind == "is" and letter in ("e", "w", "n", "s") else ""
    return f"I-{number}{suffix}", plate


def sign_labels(items):
    """Los nombres de ruta de un cartel, en orden y sin repetir."""
    shields = []  # [[base, cartelito], ...]
    # Los escudos que todavia pueden recibir un cartelito: los que vinieron
    # desde el ultimo texto que corta. "us_20 us_20 BUSINESS BUSINESS" son
    # dos Business US-20 (las dos manos, en Rockford): cada cartelito va al
    # escudo sin cartelito mas cercano para atras.
    group = []
    plates_seen = []
    for item in items or []:
        if not isinstance(item, str) or item.startswith("/font/"):
            continue
        sh = _shield(item)
        if sh:
            shields.append(list(sh))
            group.append(len(shields) - 1)
            continue
        if item.startswith("/"):
            continue  # flecha u otro sprite: no corta
        text = _text(item)
        if text in PLATE_WORDS:
            plates_seen.append(PLATE_WORDS[text])
            for i in reversed(group):
                if shields[i][1] is None:
                    shields[i][1] = PLATE_WORDS[text]
                    break
            continue
        if text not in DIRECTIONS:
            group = []
    # Una sola ruta en el cartel: el cartelito es de ella aunque este antes
    # ("BUSINESS" arriba del escudo) o separado por otro texto.
    if plates_seen and len({base for base, _ in shields}) == 1 and all(p is None for _, p in shields):
        for s in shields:
            s[1] = plates_seen[0]
    out = []
    for base, plate in shields:
        label = f"{base} {plate}" if plate else base
        if label not in out:
            out.append(label)
    return out


def extract(signs: list) -> list:
    out = []
    seen = set()
    for sign in signs:
        x, y = sign.get("x"), sign.get("y")
        if x is None or y is None:
            continue
        for label in sign_labels(sign.get("textItems", [])):
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


def main(argv=None):
    argv = sys.argv if argv is None else argv
    if len(argv) != 3:
        print("Uso: python extract_road_names.py <usa-signs.json> <salida.json>")
        sys.exit(1)

    with open(argv[1], encoding="utf-8") as f:
        signs = json.load(f)

    result = extract(signs)
    with open(argv[2], "w", encoding="utf-8") as f:
        json.dump(result, f, separators=(",", ":"))

    print(f"{len(signs)} carteles procesados -> {len(result)} escudos de ruta extraidos")
    print(f"Escrito en {argv[2]}")


if __name__ == "__main__":
    main()

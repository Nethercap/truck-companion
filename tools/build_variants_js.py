"""Genera docs/app/variants.js a partir de docs/data/map-manifest.json.

Antes, publicar una variante pedia editarla a mano en cinco lugares: la tabla
MAP_DATA_VERSION, la entrada de GAME_MAPS, el radio de Ajustes, la deteccion
automatica y el manifest. Los tres primeros son la misma informacion repetida,
asi que salen de aca; el manifest es la fuente y la deteccion queda en codigo
porque es criterio, no datos (que pack usar cuando hay varios mods activos).

Se genera un .js en vez de leer el JSON en vivo para que la app siga siendo
sincrona al arrancar: app.js usa MAP_DATA_VERSION apenas carga.

Correr despues de tocar el manifest:
  python tools/build_variants_js.py
  python tools/build_variants_js.py --check   (falla si quedo desactualizado)
"""

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "docs", "data", "map-manifest.json")
OUT = os.path.join(ROOT, "docs", "app", "variants.js")

# Proyeccion a lng/lat por variante: las de ATS y las de ETS2 comparten la del
# juego; Grand Utopia es standalone y cae en la zona del hack de UK, por eso
# usa la suya (ver guToLngLat en app.js).
PROJECTIONS = {"ets2_gu": "gu"}

# Valor del selector manual de Ajustes (atsMod / ets2Mod). Sin entrada, la
# variante no se ofrece a mano.
MANUAL = {
    "ats": "none", "ats_c2c": "c2c", "ats_promods": "promods_canada",
    "ats_c2c_promods": "c2c_promods_canada", "ats_reforma": "reforma",
    "ats_reforma_c2c_promods": "reforma_c2c_promods_canada",
    "ets2": "none", "ets2_promods": "promods", "ets2_promods_rusmap": "promods_rusmap",
    "ets2_promods_roex": "promods_roex", "ets2_promods_rusmap_roex": "promods_rusmap_roex",
    "ets2_gu": "gu", "ets2_tmp": "tmp",
}


def build():
    with open(MANIFEST, encoding="utf-8") as f:
        manifest = json.load(f)
    versions, meta = {}, {}
    for name, var in manifest["variants"].items():
        if var.get("planned"):
            continue  # cableada pero todavia no publicada en R2
        versions[name] = var["mapDataVersion"]
        meta[name] = {
            # appLabel es la etiqueta larga que muestra la app ("American Truck
            # Simulator + Coast to Coast"); label es la corta del panel de admin.
            "label": var.get("appLabel") or var["label"],
            "game": var["game"],
            "projection": PROJECTIONS.get(name, var["game"]),
            "origin": var["origin"],
            "manual": MANUAL.get(name),
            "mods": var["mods"],
        }
    lines = [
        "// GENERADO por tools/build_variants_js.py desde docs/data/map-manifest.json.",
        "// No editar a mano: se regenera al publicar o actualizar una variante.",
        f"// Fuente: manifest del {manifest.get('updated', '?')}.",
        "const MAP_DATA_VERSION = " + json.dumps(versions, ensure_ascii=False, indent=2) + ";",
        "",
        "// Metadatos por variante: etiqueta, juego, que proyeccion usa, que valor",
        "// le corresponde en el selector manual de Ajustes y que mods incluye.",
        "const VARIANT_META = " + json.dumps(meta, ensure_ascii=False, indent=2) + ";",
        "",
    ]
    return "\n".join(lines)


def main():
    generated = build()
    if "--check" in sys.argv:
        current = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
        if current.strip() != generated.strip():
            print("docs/app/variants.js quedo desactualizado: corre python tools/build_variants_js.py")
            return 1
        print("docs/app/variants.js al dia")
        return 0
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(generated)
    count = generated.count('"label"')
    print(f"docs/app/variants.js generado ({count} variantes publicadas)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

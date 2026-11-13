"""Genera client/mapbuild/viewpoints-ets2.json: el id de cada mirador de ETS2
(album.viewpoints.<id>) con el uid del cutscene que lo dibuja en el mapa y la
clave de su nombre.

Un trabajo de turismo del DLC Coaches tiene paradas en miradores, y el juego
las manda con ese id ("pocviitasaar", tipo "viewpoints"), no con un lugar.
El album de fotos de los miradores (def/photo_album/viewpoints.sui, adentro
de def.scs) dice que objeto del mapa es cada uno (objects_uid), y ese uid es
el del cutscene que el parser de truckermudgeon saca en europe-cutscenes.json
con su posicion. client/mapbuild/pois.py junta las dos cosas en la clave
"viewpoints" de pois-<variante>.json (y del mapa armado en la PC).

La clave del nombre ("@@poc_cut_viitasaari@@") la lleva tambien la accion del
cutscene (ui_value): sirve cuando un mod rehizo el sector y el cutscene tiene
otro uid. Medido el 13-11: con el uid, 137 de 137 en ETS2 y 95 en ProMods;
con la clave, ProMods llega a 121 (los que faltan son de Islandia, que esa
variante no tiene, y lugares que ProMods cambio).

Uso:
  python tools/build_viewpoints_ets2.py <def extraido>/def/photo_album/viewpoints.sui

El .sui se saca de def.scs con extract_mod.py del taller. Volver a correrlo
cuando el juego sume miradores (un DLC de mapa nuevo).
"""

import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.path.join(RAIZ, "client", "mapbuild", "viewpoints-ets2.json")

ITEM = re.compile(r"photo_album_item\s*:\s*album\.viewpoints\.(\w+)\s*\{(.*?)\}", re.S)
UID = re.compile(r"objects_uid\[\]\s*:\s*0x([0-9A-Fa-f]{1,16})")
NOMBRE = re.compile(r'\bname:\s*"(@@\w+@@)"')


def leer(texto: str) -> dict:
    """{id: {"key": "@@...@@", "uids": [uid, ...]}} con los uid en minusculas
    y 16 cifras, como los da el parser. Un mirador sin objeto en el mapa ni
    clave no va."""
    salida = {}
    for ident, cuerpo in ITEM.findall(texto):
        uids = [u.lower().rjust(16, "0") for u in UID.findall(cuerpo)]
        nombre = NOMBRE.search(cuerpo)
        if uids or nombre:
            salida[ident] = {"key": nombre.group(1) if nombre else None, "uids": uids}
    return salida


def main(argv):
    if len(argv) != 2:
        print(__doc__.strip().splitlines()[-4])
        return 2
    with open(argv[1], encoding="utf-8", errors="replace") as f:
        tabla = leer(f.read())
    with open(SALIDA, "w", encoding="utf-8") as f:
        json.dump(dict(sorted(tabla.items())), f, separators=(",", ":"))
        f.write("\n")
    print(f"{len(tabla)} miradores -> {SALIDA}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

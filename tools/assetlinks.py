"""Escribe docs/.well-known/assetlinks.json para la app de Android (TWA).

Con este archivo Android sabe que la app com.trucksimdash.app es del sitio y
abre trucksim-dash.com a pantalla completa, sin la barra de direccion de
Chrome. Lleva la huella SHA-256 del certificado con el que Play firma la app
(Play Console -> la app -> Prueba y lanzamiento -> Configuracion -> Integridad
de la app -> Firma de apps: "Huella digital del certificado SHA-256") y, para
probar un AAB bajado de Actions antes de pasar por Play, la de la clave de
subida. Las huellas son publicas: no son secretos.

  python tools/assetlinks.py AA:BB:...  [CC:DD:...]
"""

import json
import os
import re
import sys

PAQUETE = "com.trucksimdash.app"
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.path.join(RAIZ, "docs", ".well-known", "assetlinks.json")


def huella(texto: str) -> str:
    limpio = re.sub(r"[^0-9A-Fa-f]", "", texto).upper()
    if len(limpio) != 64:
        sys.exit(f"No es una huella SHA-256 (64 digitos hex): {texto}")
    return ":".join(limpio[i:i + 2] for i in range(0, 64, 2))


def main():
    huellas = [huella(h) for h in sys.argv[1:]]
    if not huellas:
        sys.exit(__doc__)
    datos = [{
        "relation": ["delegate_permission/common.handle_all_urls"],
        "target": {"namespace": "android_app", "package_name": PAQUETE, "sha256_cert_fingerprints": huellas},
    }]
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", encoding="utf-8", newline="\n") as f:
        json.dump(datos, f, indent=2)
        f.write("\n")
    print(f"{SALIDA}: {len(huellas)} huella(s)")


if __name__ == "__main__":
    main()

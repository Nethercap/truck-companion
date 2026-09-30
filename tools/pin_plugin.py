"""Fija una DLL del plugin como la que trae el cliente.

Uso: python tools/pin_plugin.py <ruta a la DLL compilada>

Copia la DLL a client/vendor/truckdash-telemetry.dll y actualiza
PLUGIN_DLL_SHA256 en client/plugin_installer.py. Lo corre el workflow "Build
plugin" con la DLL que acaba de compilar desde plugin/; a mano solo tiene
sentido para probar.

Con el hash, Setup decide si el plugin instalado en el juego es el de este
cliente ("installed") o uno nuestro de otra version ("outdated"), que el
cliente reemplaza solo: el archivo lleva nuestro nombre, asi que no hace
falta llevar la lista de hashes anteriores.
"""

import hashlib
import os
import re
import shutil
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENDOR = os.path.join(RAIZ, "client", "vendor", "truckdash-telemetry.dll")
INSTALLER = os.path.join(RAIZ, "client", "plugin_installer.py")
# Sin "$": en el runner de Windows el checkout trae CRLF, y "$" no calza
# antes de un "\r".
PATRON = re.compile(r'^PLUGIN_DLL_SHA256 = "([0-9a-f]{64})"', re.MULTILINE)


def fijar(dll: str, vendor: str = VENDOR, installer: str = INSTALLER) -> str:
    with open(dll, "rb") as f:
        datos = f.read()
    if datos[:2] != b"MZ":
        raise SystemExit(f"{dll} no es una DLL")
    sha = hashlib.sha256(datos).hexdigest()
    shutil.copyfile(dll, vendor)
    with open(installer, encoding="utf-8", newline="") as f:
        texto = f.read()
    if not PATRON.search(texto):
        raise SystemExit("no encontre PLUGIN_DLL_SHA256 en plugin_installer.py")
    nuevo = PATRON.sub(f'PLUGIN_DLL_SHA256 = "{sha}"', texto, count=1)
    with open(installer, "w", encoding="utf-8", newline="") as f:
        f.write(nuevo)
    return sha


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    print(fijar(sys.argv[1]))

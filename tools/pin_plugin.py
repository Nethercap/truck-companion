"""Fija una DLL del plugin como la que trae el cliente.

Uso: python tools/pin_plugin.py <ruta a scs-telemetry.dll>

Copia la DLL a client/vendor/ y actualiza PLUGIN_DLL_SHA256 en
client/plugin_installer.py. Lo corre el workflow "Build plugin" con la DLL
que acaba de compilar desde plugin/; a mano solo tiene sentido para probar.

Con el hash, Setup decide si el plugin instalado en el juego es el nuestro
("installed") o hay que ofrecer actualizarlo ("outdated").
"""

import hashlib
import os
import re
import shutil
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENDOR = os.path.join(RAIZ, "client", "vendor", "scs-telemetry.dll")
INSTALLER = os.path.join(RAIZ, "client", "plugin_installer.py")
PATRON = re.compile(r'^PLUGIN_DLL_SHA256 = "[0-9a-f]{64}"$', re.MULTILINE)


def fijar(dll: str) -> str:
    with open(dll, "rb") as f:
        datos = f.read()
    if datos[:2] != b"MZ":
        raise SystemExit(f"{dll} no es una DLL")
    sha = hashlib.sha256(datos).hexdigest()
    shutil.copyfile(dll, VENDOR)
    with open(INSTALLER, encoding="utf-8", newline="") as f:
        texto = f.read()
    nuevo, cambios = PATRON.subn(f'PLUGIN_DLL_SHA256 = "{sha}"', texto)
    if cambios != 1:
        raise SystemExit("no encontre PLUGIN_DLL_SHA256 en plugin_installer.py")
    with open(INSTALLER, "w", encoding="utf-8", newline="") as f:
        f.write(nuevo)
    return sha


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    print(fijar(sys.argv[1]))

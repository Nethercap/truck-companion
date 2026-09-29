"""Fija una DLL del plugin como la que trae el cliente.

Uso: python tools/pin_plugin.py <ruta a scs-telemetry.dll>

Copia la DLL a client/vendor/ y actualiza PLUGIN_DLL_SHA256 en
client/plugin_installer.py. Lo corre el workflow "Build plugin" con la DLL
que acaba de compilar desde plugin/; a mano solo tiene sentido para probar.

Con el hash, Setup decide si el plugin instalado en el juego es el nuestro
("installed") o hay que ofrecer actualizarlo ("outdated"). El hash que se
reemplaza pasa a PREVIOUS_PLUGIN_SHA256: los clientes nuevos reconocen esa
DLL como una que pusimos nosotros y la actualizan solos.
"""

import hashlib
import os
import re
import shutil
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENDOR = os.path.join(RAIZ, "client", "vendor", "scs-telemetry.dll")
INSTALLER = os.path.join(RAIZ, "client", "plugin_installer.py")
# Sin "$" y con el salto capturado: en el runner de Windows el checkout trae
# CRLF, y "$" no calza antes de un "\r".
PATRON = re.compile(r'^PLUGIN_DLL_SHA256 = "([0-9a-f]{64})"', re.MULTILINE)
PREVIOS = re.compile(r"^PREVIOUS_PLUGIN_SHA256 = frozenset\(\{(\r?\n)", re.MULTILINE)


def fijar(dll: str, vendor: str = VENDOR, installer: str = INSTALLER) -> str:
    with open(dll, "rb") as f:
        datos = f.read()
    if datos[:2] != b"MZ":
        raise SystemExit(f"{dll} no es una DLL")
    sha = hashlib.sha256(datos).hexdigest()
    shutil.copyfile(dll, vendor)
    with open(installer, encoding="utf-8", newline="") as f:
        texto = f.read()
    m = PATRON.search(texto)
    p = PREVIOS.search(texto)
    if not m or not p:
        raise SystemExit("no encontre PLUGIN_DLL_SHA256 o PREVIOUS_PLUGIN_SHA256 en plugin_installer.py")
    anterior = m.group(1)
    nuevo = texto
    if anterior != sha and f'"{anterior}"' not in texto[p.end():]:
        salto = p.group(1)
        nuevo = nuevo[:p.end()] + f'    "{anterior}",{salto}' + nuevo[p.end():]
    nuevo = PATRON.sub(f'PLUGIN_DLL_SHA256 = "{sha}"', nuevo, count=1)
    with open(installer, "w", encoding="utf-8", newline="") as f:
        f.write(nuevo)
    return sha


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    print(fijar(sys.argv[1]))

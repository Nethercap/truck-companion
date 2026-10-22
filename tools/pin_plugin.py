"""Fija un plugin compilado como el que trae el cliente.

Uso: python tools/pin_plugin.py <ruta a la DLL o la .dylib compilada>

La DLL de Windows va a client/vendor/truckdash-telemetry.dll con su hash en
PLUGIN_DLL_SHA256, y la .dylib de macOS a client/vendor/truckdash-
telemetry.dylib con PLUGIN_DYLIB_SHA256, en client/plugin_installer.py. Se
distinguen por los primeros bytes. Lo corre el workflow "Build plugin" con el
plugin que acaba de compilar desde plugin/; a mano solo tiene sentido para
probar.

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
VENDOR_DYLIB = os.path.join(RAIZ, "client", "vendor", "truckdash-telemetry.dylib")
INSTALLER = os.path.join(RAIZ, "client", "plugin_installer.py")
# Sin "$": en el runner de Windows el checkout trae CRLF, y "$" no calza
# antes de un "\r".
PATRON = re.compile(r'^PLUGIN_DLL_SHA256 = "([0-9a-f]{64})"', re.MULTILINE)
# Vacio hasta que se compila la primera .dylib.
PATRON_DYLIB = re.compile(r'^PLUGIN_DYLIB_SHA256 = "([0-9a-f]{64})?"', re.MULTILINE)

# Mach-O: universal (las dos arquitecturas, lo que arma plugin/build.sh) o de
# una sola, de 64 bits.
MACHO = (b"\xca\xfe\xba\xbe", b"\xcf\xfa\xed\xfe")


def tipo(datos: bytes) -> str:
    if datos[:2] == b"MZ":
        return "dll"
    if datos[:4] in MACHO:
        return "dylib"
    raise SystemExit("no es una DLL ni una .dylib")


def fijar(plugin: str, vendor: str | None = None, installer: str = INSTALLER) -> str:
    with open(plugin, "rb") as f:
        datos = f.read()
    es_dll = tipo(datos) == "dll"
    patron, constante = (PATRON, "PLUGIN_DLL_SHA256") if es_dll else (PATRON_DYLIB, "PLUGIN_DYLIB_SHA256")
    if vendor is None:
        vendor = VENDOR if es_dll else VENDOR_DYLIB
    sha = hashlib.sha256(datos).hexdigest()
    with open(installer, encoding="utf-8", newline="") as f:
        texto = f.read()
    if not patron.search(texto):
        raise SystemExit(f"no encontre {constante} en plugin_installer.py")
    shutil.copyfile(plugin, vendor)
    nuevo = patron.sub(f'{constante} = "{sha}"', texto, count=1)
    with open(installer, "w", encoding="utf-8", newline="") as f:
        f.write(nuevo)
    return sha


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    print(fijar(sys.argv[1]))

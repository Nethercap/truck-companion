"""Verifica que el bootloader de PyInstaller instalado no sea el precompilado.

Uso: python tools/bootloader_propio.py

"Build client" instala PyInstaller desde el codigo fuente con
PYINSTALLER_COMPILE_BOOTLOADER=1, para que TruckDash.exe arranque con un
bootloader compilado en el runner y no con el que trae la rueda de PyPI: ese es
el mismo en miles de programas armados con PyInstaller, malware incluido, y los
antivirus por heuristica o machine learning lo marcan (issue #2; Defender marco
la 1.5.37 como Trojan:Script/Sabsik.EN.A!ml al bajarla).

Si alguien cambia la linea de instalacion y vuelve la rueda, el build no falla
solo: anda igual y los falsos positivos vuelven sin que nadie lo note. Esto baja
la rueda oficial de la misma version y compara archivo por archivo; sale con
error si alguno es identico.
"""

import hashlib
import os
import subprocess
import sys
import tempfile
import zipfile


def sha256(datos: bytes) -> str:
    return hashlib.sha256(datos).hexdigest()


def iguales(instalados: dict, oficiales: dict) -> list:
    """Los nombres que estan en los dos con el mismo hash."""
    return sorted(n for n, h in instalados.items() if oficiales.get(n) == h)


def main() -> int:
    import PyInstaller
    from PyInstaller import PLATFORM

    carpeta = os.path.join(os.path.dirname(PyInstaller.__file__), "bootloader", PLATFORM)
    instalados = {}
    for nombre in sorted(os.listdir(carpeta)):
        with open(os.path.join(carpeta, nombre), "rb") as f:
            instalados[nombre] = sha256(f.read())
    if not instalados:
        print(f"No hay bootloader en {carpeta}")
        return 1

    with tempfile.TemporaryDirectory() as tmp:
        # Solo para comparar: no se instala ni se ejecuta nada de esta rueda.
        subprocess.run(
            [sys.executable, "-m", "pip", "download", "--quiet", "--no-deps", "--only-binary", ":all:",
             f"pyinstaller=={PyInstaller.__version__}", "-d", tmp],
            check=True)
        ruedas = [n for n in os.listdir(tmp) if n.endswith(".whl")]
        if len(ruedas) != 1:
            print(f"Se esperaba una rueda de PyInstaller {PyInstaller.__version__}, hay {ruedas}")
            return 1
        prefijo = f"PyInstaller/bootloader/{PLATFORM}/"
        with zipfile.ZipFile(os.path.join(tmp, ruedas[0])) as z:
            oficiales = {n[len(prefijo):]: sha256(z.read(n))
                         for n in z.namelist() if n.startswith(prefijo) and not n.endswith("/")}

    print(f"PyInstaller {PyInstaller.__version__}, {PLATFORM}, contra {ruedas[0]}:")
    for nombre, h in instalados.items():
        print(f"  {nombre}: {h} (rueda: {oficiales.get(nombre, 'no esta')})")
    repetidos = iguales(instalados, oficiales)
    if repetidos:
        print(f"Bootloader precompilado: {', '.join(repetidos)} son los de la rueda de PyPI. "
              "PyInstaller tiene que instalarse con --no-binary pyinstaller y PYINSTALLER_COMPILE_BOOTLOADER=1.")
        return 1
    print("El bootloader es propio.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

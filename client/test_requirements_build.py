"""requirements-build.txt (lo que entra al .exe) tiene que cubrir requirements.txt.

PyInstaller no falla cuando le falta un modulo: arma el .exe igual y el
programa muere al arrancar. Si alguien suma una dependencia a requirements.txt
y no regenera requirements-build.txt, los tests pasan (instalan
requirements.txt) y la release sale rota. Esto lo frena antes.
"""

import os
import re

from packaging.requirements import Requirement
from packaging.utils import canonicalize_name

AQUI = os.path.dirname(os.path.abspath(__file__))


def _lineas_logicas(ruta):
    """Las lineas del archivo sin comentarios, con las continuaciones (\\) unidas."""
    with open(ruta, encoding="utf-8") as f:
        texto = f.read().replace("\\\n", " ")
    for linea in texto.splitlines():
        linea = linea.split(" #", 1)[0].strip()
        if linea and not linea.startswith("#"):
            yield linea


def _pedidas():
    return [Requirement(linea) for linea in _lineas_logicas(os.path.join(AQUI, "requirements.txt"))]


def _fijadas():
    """{nombre: (version, cantidad de hashes)} de requirements-build.txt."""
    fijadas = {}
    for linea in _lineas_logicas(os.path.join(AQUI, "requirements-build.txt")):
        hashes = re.findall(r"--hash=sha256:[0-9a-f]{64}", linea)
        req = Requirement(re.sub(r"\s--hash=\S+", "", linea).strip())
        versiones = [s.version for s in req.specifier if s.operator == "=="]
        assert len(versiones) == 1, f"{req.name} tiene que ir con == en requirements-build.txt: {linea}"
        fijadas[canonicalize_name(req.name)] = (versiones[0], len(hashes))
    return fijadas


def test_cada_dependencia_esta_fijada_y_cumple_requirements():
    fijadas = _fijadas()
    for req in _pedidas():
        nombre = canonicalize_name(req.name)
        assert nombre in fijadas, (
            f"{req.name} esta en requirements.txt y no en requirements-build.txt: "
            "regenerarlo (el comando esta arriba de ese archivo)")
        version, _ = fijadas[nombre]
        assert req.specifier.contains(version, prereleases=True), (
            f"requirements-build.txt fija {req.name}=={version}, que no cumple '{req.specifier}'")


def test_cada_paquete_fijado_lleva_hash():
    # pip con --require-hashes rechaza todo el archivo si a uno le falta.
    for nombre, (_, hashes) in _fijadas().items():
        assert hashes, f"{nombre} no tiene --hash en requirements-build.txt"


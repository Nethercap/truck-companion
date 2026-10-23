"""Los avisos de licencia de lo que va adentro de TruckDash.exe.

Uso: python tools/avisos_de_terceros.py SALIDA.txt

Lo corre "Build client" al armar el zip (y el tarball de Linux), con el mismo
Python que compilo el exe: asi salen las versiones y los textos de licencia
de los paquetes que entraron de verdad, no una lista escrita a mano que se
queda vieja. Sale de client/requirements.txt (sin pyinstaller, que no va
adentro; su bootloader si, con su excepcion) y de las dependencias de cada
uno para esta plataforma. Despues van el plugin de telemetria, el SDK de
SCS, Python y Tcl/Tk.

Las licencias MIT y BSD piden ir con cada copia, y la LGPL de pystray pide
que vayan sus textos (GPL y LGPL): por eso se copian enteros.
"""

import importlib.metadata as md
import os
import re
import sys
import sysconfig

from packaging.requirements import Requirement

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REQUIREMENTS = os.path.join(RAIZ, "client", "requirements.txt")
NO_VAN = {"pyinstaller"}  # herramienta de build: lo que va es su bootloader, aparte
ARCHIVO_DE_LICENCIA = re.compile(r"(^|/)(LICEN[CS]E|COPYING|NOTICE)[^/]*$", re.IGNORECASE)
SEPARADOR = "=" * 78

ENCABEZADO = """\
Truck Dash
Copyright (C) 2026 Nethercap (Truck Dash)

Truck Dash is free software under the GNU Affero General Public License v3.0
(see LICENSE.txt). It comes with no warranty. The source code is at
https://github.com/Nethercap/truck-companion

The license covers the code, not the Truck Dash name or logo.

TruckDash.exe also contains the third-party software listed below, each under
its own license.
"""


def _nombre(texto: str) -> str:
    return re.sub(r"[-_.]+", "-", texto).lower()


def raices(path: str = REQUIREMENTS) -> list[Requirement]:
    reqs = []
    with open(path, encoding="utf-8") as f:
        for linea in f:
            linea = linea.split("#", 1)[0].strip()
            if not linea:
                continue
            req = Requirement(linea)
            if _nombre(req.name) in NO_VAN:
                continue
            if req.marker and not req.marker.evaluate():
                continue
            reqs.append(req)
    return reqs


def paquetes(reqs: list[Requirement]) -> list[md.Distribution]:
    """Los paquetes instalados que pide reqs, con sus dependencias para esta
    plataforma (sin extras), cada uno una vez."""
    vistos: dict[str, md.Distribution] = {}
    pendientes = list(reqs)
    while pendientes:
        req = pendientes.pop()
        clave = _nombre(req.name)
        if clave in vistos or clave in NO_VAN:
            continue
        dist = md.distribution(req.name)
        vistos[clave] = dist
        for texto in dist.requires or []:
            dep = Requirement(texto)
            if dep.marker and not dep.marker.evaluate({"extra": ""}):
                continue
            pendientes.append(dep)
    return sorted(vistos.values(), key=lambda d: _nombre(d.metadata["Name"]))


def _licencia(dist: md.Distribution) -> str:
    meta = dist.metadata
    texto = meta.get("License-Expression") or ""
    if not texto:
        corta = (meta.get("License") or "").strip()
        if corta and "\n" not in corta and len(corta) < 80 and corta.upper() != "UNKNOWN":
            texto = corta
    if not texto:
        clases = [c.split("::")[-1].strip() for c in meta.get_all("Classifier") or []
                  if c.startswith("License ::")]
        texto = ", ".join(clases)
    return texto or "see the license text below"


def _url(dist: md.Distribution) -> str:
    meta = dist.metadata
    for entrada in meta.get_all("Project-URL") or []:
        etiqueta, _, url = entrada.partition(",")
        if etiqueta.strip().lower() in ("source", "source code", "repository", "homepage", "home"):
            return url.strip()
    return meta.get("Home-page") or f"https://pypi.org/project/{meta['Name']}/"


def _textos(dist: md.Distribution) -> list[tuple[str, str]]:
    textos = []
    for archivo in dist.files or []:
        ruta = str(archivo).replace("\\", "/")
        # Solo los de la metadata: packaging/licenses/__init__.py no es una licencia.
        if ".dist-info/" not in ruta or not ARCHIVO_DE_LICENCIA.search(ruta):
            continue
        with open(archivo.locate(), encoding="utf-8", errors="replace") as f:
            textos.append((ruta.rsplit("/", 1)[-1], f.read()))
    return textos


def _python_license() -> str | None:
    for carpeta in (sys.base_prefix, sysconfig.get_paths()["stdlib"]):
        for nombre in ("LICENSE.txt", "LICENSE"):
            ruta = os.path.join(carpeta, nombre)
            if os.path.isfile(ruta):
                return open(ruta, encoding="utf-8", errors="replace").read()
    return None


def _tcl_tk_license() -> str | None:
    # Se busca el archivo sin abrir un interprete de Tcl: uno suelto, en los
    # tests, dejaba variables de tkinter de otro test sin poder borrarse.
    try:
        import _tkinter
    except ImportError:
        return None
    version = _tkinter.TCL_VERSION
    # El de Tk es el mismo texto, y en Windows (python.org) es el que viene.
    carpetas = [os.path.join(base, f"{lib}{version}") for lib in ("tcl", "tk")
                for base in (os.path.join(sys.base_prefix, "tcl"), os.path.join(sys.base_prefix, "lib"),
                             "/usr/share/tcltk", "/usr/lib", "/usr/share")]
    for carpeta in carpetas:
        ruta = os.path.join(carpeta, "license.terms")
        if os.path.isfile(ruta):
            return open(ruta, encoding="utf-8", errors="replace").read()
    return None


def _bloque(titulo: str, detalle: list[str], textos: list[tuple[str, str]]) -> str:
    partes = [SEPARADOR, titulo, *detalle]
    for nombre, texto in textos:
        partes += ["", f"--- {nombre} ---", texto.strip()]
    return "\n".join(partes) + "\n"


def armar() -> str:
    bloques = [ENCABEZADO]
    for dist in paquetes(raices()):
        meta = dist.metadata
        bloques.append(_bloque(f"{meta['Name']} {dist.version}",
                               [f"License: {_licencia(dist)}", f"Source: {_url(dist)}"], _textos(dist)))

    def leer(*partes):
        return open(os.path.join(RAIZ, *partes), encoding="utf-8").read()

    if sys.platform == "win32":
        bloques.append(_bloque(
            "Truck Dash telemetry plugin (vendor/truckdash-telemetry.dll)",
            ["A fork of RenCloud's scs-sdk-plugin, built with the TruckersMP Client SDK.",
             "License: MIT",
             "Source: https://github.com/Nethercap/truck-companion/tree/main/plugin"],
            [("LICENSE", leer("client", "vendor", "LICENSE-scs-sdk-plugin.txt")),
             ("SCS SDK license", leer("plugin", "scs_sdk", "sdk_license.txt")),
             ("TruckersMP Client SDK license", leer("plugin", "truckersmp_sdk", "LICENSE"))]))
    bloques.append(_bloque(
        "PyInstaller bootloader",
        ["License: GPL-2.0-or-later with the PyInstaller bootloader exception, which",
         "allows distributing programs built with it under any license.",
         "Source: https://github.com/pyinstaller/pyinstaller"], []))
    python = _python_license()
    bloques.append(_bloque(
        f"Python {sys.version.split()[0]}",
        ["License: PSF License Version 2 (Python and the libraries its build bundles,",
         "such as OpenSSL, libffi, zlib and bzip2, listed in the text below)",
         "Source: https://www.python.org/"],
        [("LICENSE", python)] if python else []))
    tcl = _tcl_tk_license()
    if tcl:
        bloques.append(_bloque("Tcl/Tk", ["License: Tcl/Tk License (BSD-style)", "Source: https://www.tcl.tk/"],
                               [("license.terms", tcl)]))
    return "\n".join(bloques)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    texto = armar()
    with open(sys.argv[1], "w", encoding="utf-8", newline="\n") as f:
        f.write(texto)
    print(f"{sys.argv[1]}: {texto.count(SEPARADOR)} componentes, {len(texto) // 1024} KB")


if __name__ == "__main__":
    main()

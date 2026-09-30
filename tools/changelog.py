"""La seccion de una version en CHANGELOG.md.

Uso: python tools/changelog.py v1.2.3   (o 1.2.3)

Imprime el cuerpo de "## 1.2.3 (fecha)" hasta la seccion siguiente, sin el
titulo. Sale con error si no esta o esta vacia. Lo usa "Build client" para
el cuerpo de la release en GitHub; test_client.py exige que CLIENT_VERSION
tenga su seccion, asi una release no sale sin changelog.
"""

import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHANGELOG = os.path.join(RAIZ, "CHANGELOG.md")


def seccion(texto: str, version: str) -> str | None:
    version = version.lstrip("v")
    # El titulo es "## 1.2.3" seguido de fin de linea o de un espacio (la
    # fecha): "## 1.2.30" no es "## 1.2.3".
    titulo = re.compile(r"^## " + re.escape(version) + r"(?:[ \t].*)?$", re.MULTILINE)
    m = titulo.search(texto)
    if not m:
        return None
    siguiente = re.compile(r"^## ", re.MULTILINE).search(texto, m.end())
    cuerpo = texto[m.end():siguiente.start() if siguiente else len(texto)].strip()
    return cuerpo or None


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    with open(CHANGELOG, encoding="utf-8") as f:
        cuerpo = seccion(f.read().replace("\r\n", "\n"), sys.argv[1])
    if not cuerpo:
        raise SystemExit(f"CHANGELOG.md no tiene seccion para {sys.argv[1]}")
    sys.stdout.reconfigure(encoding="utf-8")
    print(cuerpo)

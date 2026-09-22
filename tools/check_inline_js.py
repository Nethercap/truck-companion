"""Valida la sintaxis del JavaScript embebido en las paginas HTML.

Existe por un bug real (2026-09-22): un apostrofo sin escapar dentro de un
string de una traduccion ("it's a false positive") rompio TODO el script
inline de la landing en produccion. La pagina se seguia viendo, pero el
carrusel, el lightbox, el selector de idioma, las estadisticas en vivo y el
consentimiento de cookies quedaron muertos, y nada lo detectaba.

Uso:  python tools/check_inline_js.py
Requiere node en el PATH (solo para `node --check`).
"""

import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = [
    "docs/index.html",
    "docs/es/index.html",
    "docs/app/index.html",
    "docs/live/index.html",
    "docs/admin.html",
]
SCRIPT_RE = re.compile(r"<script(?![^>]*\bsrc=)(?![^>]*\btype=)[^>]*>(.*?)</script>", re.S | re.I)


def main() -> int:
    errors = 0
    checked = 0
    for page in PAGES:
        path = os.path.join(ROOT, page)
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as f:
            html = f.read()
        for i, body in enumerate(SCRIPT_RE.findall(html)):
            if not body.strip():
                continue
            with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8", newline="\n") as tmp:
                tmp.write(body)
                tmp_path = tmp.name
            try:
                proc = subprocess.run(["node", "--check", tmp_path], capture_output=True, text=True)
            finally:
                os.unlink(tmp_path)
            checked += 1
            if proc.returncode != 0:
                errors += 1
                print(f"FALLA {page} script[{i}]:\n{proc.stderr.strip()[:1200]}\n")
    print(f"{checked} bloques inline revisados, {errors} con error de sintaxis")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())

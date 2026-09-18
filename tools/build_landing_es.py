"""
Genera docs/es/index.html a partir de docs/index.html (la landing en ingles,
que es la unica que se edita a mano).

Google no indexa el texto que un toggle de idioma cambia por JS, asi que la
version en espanol tiene que ser una pagina real, con los textos ya
"horneados" en el HTML (y hreflang apuntando de una a la otra). Este script
toma cada elemento con data-i18n / data-i18n-content / data-i18n-text y le
reemplaza el contenido por la traduccion ES que ya vive en el bloque
TRANSLATIONS del propio index.html - una sola fuente de verdad para ambas.

Correr despues de cada cambio en docs/index.html:
  python tools/build_landing_es.py
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "docs", "index.html")
OUT_DIR = os.path.join(ROOT, "docs", "es")
OUT = os.path.join(OUT_DIR, "index.html")


def js_string_to_python(raw: str) -> str:
    # Los strings del bloque TRANSLATIONS usan comillas simples con \' como
    # unico escape (mas \\ ). Se convierte a JSON para decodificar de forma
    # segura sin evaluar JS.
    unescaped = raw.replace("\\'", "'")
    return json.loads('"' + unescaped.replace("\\", "\\\\").replace('"', '\\"') + '"')


def extract_es_translations(html: str) -> dict:
    m = re.search(r"^\s*es: \{\n(.*?)^\s*\},\n\};", html, re.S | re.M)
    if not m:
        sys.exit("No se encontro el bloque 'es: {' en TRANSLATIONS")
    block = m.group(1)
    result = {}
    for line in block.splitlines():
        line = line.strip()
        mm = re.match(r"^(\w+): '(.*)',$", line)
        if mm:
            result[mm.group(1)] = js_string_to_python(mm.group(2))
    return result


def replace_inner(html: str, attr: str, key: str, value: str) -> str:
    # Reemplaza el contenido interno del PRIMER tag que tenga attr="key"
    # (hay claves repetidas, ej. navFeatures en nav y sidebar - se itera).
    pattern = re.compile(r'(<(\w+)[^>]*\b' + attr + r'="' + re.escape(key) + r'"[^>]*>)(.*?)(</\2>)', re.S)

    def repl(m):
        return m.group(1) + value + m.group(4)

    return pattern.sub(repl, html)


def main():
    with open(SRC, encoding="utf-8") as f:
        html = f.read()
    es = extract_es_translations(html)

    out = html
    for key, value in es.items():
        out = replace_inner(out, "data-i18n", key, value)
        # meta content="..."
        out = re.sub(
            r'(data-i18n-content="' + re.escape(key) + r'" content=")[^"]*(")',
            lambda m: m.group(1) + value.replace('"', "&quot;") + m.group(2),
            out,
        )
        out = re.sub(
            r'(content=")[^"]*(" data-i18n-content="' + re.escape(key) + r'")',
            lambda m: m.group(1) + value.replace('"', "&quot;") + m.group(2),
            out,
        )
    # <title>
    out = re.sub(r"<title data-i18n-text=\"metaTitle\">.*?</title>", f"<title data-i18n-text=\"metaTitle\">{es['metaTitle']}</title>", out, flags=re.S)

    out = out.replace('<html lang="en">', '<html lang="es">')
    out = out.replace("const DEFAULT_LANG = 'en';", "const DEFAULT_LANG = 'es';")
    out = out.replace('href="https://trucksim-dash.com/" data-canonical', 'href="https://trucksim-dash.com/es/" data-canonical')
    out = out.replace('content="https://trucksim-dash.com/" data-og-url', 'content="https://trucksim-dash.com/es/" data-og-url')
    out = out.replace('data-og-locale content="en_US"', 'data-og-locale content="es_ES"')
    out = out.replace('data-lang-link href="/es/">ES<', 'data-lang-link href="/">EN<')

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(out)
    missing = [k for k in es if f'data-i18n="{k}"' in html and es[k] not in out]
    print(f"docs/es/index.html generado ({len(es)} claves ES)")
    if missing:
        print("ATENCION, no se pudieron reemplazar:", missing)


if __name__ == "__main__":
    main()

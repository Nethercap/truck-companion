"""
Genera las landings traducidas (docs/<idioma>/index.html) a partir de
docs/index.html (la landing en ingles, que es la unica que se edita a mano).

Google no indexa el texto que un toggle de idioma cambia por JS, asi que cada
idioma tiene que ser una pagina real, con los textos ya "horneados" en el
HTML (y hreflang apuntando de una a las otras). Este script toma cada
elemento con data-i18n / data-i18n-content / data-i18n-text y le reemplaza el
contenido por la traduccion.

De donde sale cada idioma:
- es: el bloque TRANSLATIONS del propio index.html (como siempre);
- de, fr, pt (Brasil), pl, tr, ru: tools/landing_i18n/<idioma>.txt, con el
  mismo formato de lineas (clave: 'texto',). No van en index.html para no
  hacer bajar los ocho idiomas a quien entra en ingles; cada pagina generada
  lleva solo su bloque, que el JS necesita (si no, applyTranslations volvia
  a poner el ingles).

Corre tambien sobre docs/sitemap.xml (las entradas de la landing).

Correr despues de cada cambio en docs/index.html o en tools/landing_i18n/:
  python tools/build_landing_es.py
y despues python tools/check_inline_js.py.
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "docs", "index.html")
SITEMAP = os.path.join(ROOT, "docs", "sitemap.xml")
I18N_DIR = os.path.join(ROOT, "tools", "landing_i18n")
BASE = "https://trucksim-dash.com/"

# carpeta, codigo de idioma (lang/hreflang), og:locale, etiqueta del selector
IDIOMAS = {
    "es": ("es", "es_ES", "ES"),
    "de": ("de", "de_DE", "DE"),
    "fr": ("fr", "fr_FR", "FR"),
    "pt": ("pt-BR", "pt_BR", "PT"),
    "pl": ("pl", "pl_PL", "PL"),
    "tr": ("tr", "tr_TR", "TR"),
    "ru": ("ru", "ru_RU", "RU"),
}


def js_string_to_python(raw: str) -> str:
    # Los strings del bloque TRANSLATIONS usan comillas simples con \' como
    # unico escape (mas \\ ). Se convierte a JSON para decodificar de forma
    # segura sin evaluar JS.
    unescaped = raw.replace("\\'", "'")
    return json.loads('"' + unescaped.replace("\\", "\\\\").replace('"', '\\"') + '"')


def parse_lines(block: str) -> dict:
    result = {}
    for line in block.splitlines():
        line = line.strip()
        mm = re.match(r"^(\w+): '(.*)',$", line)
        if mm:
            result[mm.group(1)] = js_string_to_python(mm.group(2))
    return result


def extract_block(html: str, lang: str) -> dict:
    m = re.search(r"^\s*" + lang + r": \{\n(.*?)^\s*\},\n", html, re.S | re.M)
    if not m:
        sys.exit(f"No se encontro el bloque '{lang}: {{' en TRANSLATIONS")
    return parse_lines(m.group(1))


def load_lang(html: str, lang: str) -> dict:
    if lang == "es":
        return extract_block(html, "es")
    with open(os.path.join(I18N_DIR, f"{lang}.txt"), encoding="utf-8") as f:
        return parse_lines(f.read())


def check(lang: str, tr: dict, en: dict) -> list:
    """Avisos: claves que faltan o sobran, y HTML distinto del ingles (un
    <span class="accent"> o un link que se perdio en la traduccion)."""
    problemas = []
    faltan = [k for k in en if k not in tr]
    sobran = [k for k in tr if k not in en]
    if faltan:
        problemas.append(f"{lang}: faltan {faltan}")
    if sobran:
        problemas.append(f"{lang}: sobran {sobran}")
    tag = re.compile(r"<[^>]+>|\{n\}")
    for k, v in tr.items():
        if k in en and sorted(tag.findall(v)) != sorted(tag.findall(en[k])):
            problemas.append(f"{lang}.{k}: el HTML no coincide con el ingles")
    return problemas


def replace_inner(html: str, attr: str, key: str, value: str) -> str:
    # Reemplaza el contenido interno de cada tag que tenga attr="key" (hay
    # claves repetidas, ej. navFeatures en nav y sidebar).
    pattern = re.compile(r'(<(\w+)[^>]*\b' + attr + r'="' + re.escape(key) + r'"[^>]*>)(.*?)(</\2>)', re.S)
    return pattern.sub(lambda m: m.group(1) + value + m.group(4), html)


def build(html: str, lang: str, tr: dict) -> str:
    code, locale, label = IDIOMAS[lang]
    out = html
    for key, value in tr.items():
        out = replace_inner(out, "data-i18n", key, value)
        out = re.sub(r'(data-i18n-content="' + re.escape(key) + r'" content=")[^"]*(")',
                     lambda m: m.group(1) + value.replace('"', "&quot;") + m.group(2), out)
        out = re.sub(r'(content=")[^"]*(" data-i18n-content="' + re.escape(key) + r'")',
                     lambda m: m.group(1) + value.replace('"', "&quot;") + m.group(2), out)
    out = re.sub(r"<title data-i18n-text=\"metaTitle\">.*?</title>",
                 lambda m: f"<title data-i18n-text=\"metaTitle\">{tr['metaTitle']}</title>", out, flags=re.S)
    out = out.replace('<html lang="en">', f'<html lang="{code}">')
    out = out.replace("const DEFAULT_LANG = 'en';", f"const DEFAULT_LANG = '{lang}';")
    url = f"{BASE}{lang}/"
    out = out.replace(f'href="{BASE}" data-canonical', f'href="{url}" data-canonical')
    out = out.replace(f'content="{BASE}" data-og-url', f'content="{url}" data-og-url')
    out = out.replace('data-og-locale content="en_US"', f'data-og-locale content="{locale}"')
    # Selector: la etiqueta del idioma de la pagina y cual es el actual
    out = out.replace('aria-label="Language">EN</summary>', f'aria-label="Language">{label}</summary>')
    out = out.replace(' aria-current="true"', "")
    out = out.replace(f'href="/{lang}/" hreflang="{code}" lang="{code}">',
                      f'href="/{lang}/" hreflang="{code}" lang="{code}" aria-current="true">')
    if lang != "es":
        # El bloque de este idioma adentro de TRANSLATIONS (antes del cierre)
        bloque = "  " + lang + ": " + json.dumps(tr, ensure_ascii=False) + ",\n"
        m = re.search(r"^\s*es: \{\n.*?^\s*\},\n", out, re.S | re.M)
        out = out[:m.end()] + bloque + out[m.end():]
    return out


def sitemap_entries() -> str:
    alternos = [("en", "")] + [(IDIOMAS[l][0], f"{l}/") for l in IDIOMAS]
    links = "".join(f'    <xhtml:link rel="alternate" hreflang="{c}" href="{BASE}{p}" />\n' for c, p in alternos)
    links += f'    <xhtml:link rel="alternate" hreflang="x-default" href="{BASE}" />\n'
    out = ""
    for c, p in alternos:
        prioridad = "1.0" if not p else "0.9"
        out += f"  <url>\n    <loc>{BASE}{p}</loc>\n{links}    <changefreq>weekly</changefreq>\n    <priority>{prioridad}</priority>\n  </url>\n"
    return out


def update_sitemap():
    with open(SITEMAP, encoding="utf-8") as f:
        xml = f.read()
    landings = {BASE} | {f"{BASE}{l}/" for l in IDIOMAS}
    # Saca las entradas de la landing y pone las de los 8 idiomas al principio
    bloques = re.findall(r"  <url>\n.*?  </url>\n", xml, re.S)
    resto = [b for b in bloques if re.search(r"<loc>(.*?)</loc>", b).group(1) not in landings]
    inicio = xml[:xml.index("  <url>")]
    fin = xml[xml.rindex("</url>\n") + len("</url>\n"):]
    with open(SITEMAP, "w", encoding="utf-8", newline="\n") as f:
        f.write(inicio + sitemap_entries() + "".join(resto) + fin)


def main():
    with open(SRC, encoding="utf-8") as f:
        html = f.read()
    en = extract_block(html, "en")
    problemas = []
    for lang in IDIOMAS:
        tr = load_lang(html, lang)
        problemas += check(lang, tr, en)
        out = build(html, lang, tr)
        os.makedirs(os.path.join(ROOT, "docs", lang), exist_ok=True)
        with open(os.path.join(ROOT, "docs", lang, "index.html"), "w", encoding="utf-8", newline="\n") as f:
            f.write(out)
        faltan = [k for k in tr if f'data-i18n="{k}"' in html and tr[k] not in out]
        print(f"docs/{lang}/index.html generado ({len(tr)} claves)" + (f", sin reemplazar: {faltan}" if faltan else ""))
    update_sitemap()
    print("docs/sitemap.xml al dia")
    if problemas:
        print("ATENCION:\n  " + "\n  ".join(problemas))
        sys.exit(1)


if __name__ == "__main__":
    main()

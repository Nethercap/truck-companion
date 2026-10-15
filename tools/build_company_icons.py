"""
Logos de empresa para el mapa de la web: vector/company-icons/<juego>/ en R2.

Los tiles traen cada empresa como poi con poiType 'company' y sprite = token
de la empresa, y el parser de truckermudgeon/maps deja su logo
(material/ui/company/small del juego o del mod) en
parser-output-<variante>/icons/<token>.png. A R2 solo se habian subido los
iconos genericos (vector/icons, POI_ICONS en app.js), asi que el mapa de la
web no tenia con que dibujar las empresas.

Sale una carpeta lista para upload_to_r2.py:
  r2-upload-company-icons/vector/company-icons/ats/<token>.png
  r2-upload-company-icons/vector/company-icons/ats/index.json
  (y lo mismo con ets2)

Una carpeta por juego: el mismo token puede ser otra empresa en ATS y en
ETS2. Las empresas salen de los pois publicados (docs/data), asi que entran
tambien las de los mods. El logo se busca en las carpetas de --icons, despues
en la salida del juego sin mods y despues en la de cada variante con mods
(orden de VARIANTS en build_pois.py): gana la primera que lo tiene.

index.json lista los logos que hay y la web pide un PNG solo si esta ahi: asi
nunca pide un archivo que no esta en R2 (la regla "Mapas R2" de Cloudflare
guarda tambien los 404).

Cada logo se recorta (afuera el borde transparente) y se escala para entrar
en LOGO_BOX: asi todos se ven del mismo alto en el mapa, venga el original
de 64 o de 256 px.

Uso (rutas relativas a D:\\ets2-companion):
  python tools/build_company_icons.py
  python tools/build_company_icons.py --icons ats=D:\\ets2-companion\\iconos-ats
  python tools/build_company_icons.py --verify ats

Si se borro la salida del parser (build_variant.py --clean), los logos del
juego sin mods salen rapido con el parser en modo iconos:
  npx tsx packages/clis/parser/index.ts -i <juego> -o <carpeta> -m icons --includeDlc
y esa carpeta/icons se pasa con --icons. Los de los mods necesitan la salida
entera de su variante.

Para publicar: subir la carpeta (py upload_to_r2.py <carpeta>
trucksim-dash-maps), correr --verify y recien ahi poner la version en
"companyIcons" de docs/data/map-manifest.json y regenerar variants.js
(build_variants_js.py). Antes de eso la web no pide nada.
"""

import argparse
import json
import os
import re
import shutil
import sys
import time
import urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARSER_ROOT = os.path.dirname(ROOT)  # D:\ets2-companion
DATA_DIR = os.path.join(ROOT, "docs", "data")
OUT_DEFAULT = os.path.join(PARSER_ROOT, "r2-upload-company-icons")
R2_BASE = "https://maps.trucksim-dash.com"
REMOTE_DIR = "vector/company-icons"

sys.path.insert(0, os.path.join(ROOT, "tools"))
from build_pois import VARIANTS  # noqa: E402

GAMES = {"usa": "ats", "europe": "ets2"}
# Los tokens del juego: hasta 12 caracteres de [a-z0-9_]. Van en la URL del
# PNG, asi que la web aplica la misma regla (COMPANY_TOKEN_RE en pure.js).
TOKEN_RE = re.compile(r"^[a-z0-9_]{1,12}$")
# pixelRatio 2: el PNG tiene el doble de pixeles que lo que ocupa en pantalla
# a icon-size 1, y se ve nitido en celulares.
PIXEL_RATIO = 2
LOGO_BOX = (192, 64)  # ancho y alto maximos del PNG


def variants_of(game):
    return [(variant, folder) for variant, (folder, prefix) in VARIANTS.items() if GAMES[prefix] == game]


def company_tokens(game, data_dir=DATA_DIR):
    """Los tokens de empresa de todas las variantes publicadas del juego."""
    tokens = set()
    for variant, _folder in variants_of(game):
        path = os.path.join(data_dir, f"pois-{variant}.json")
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as f:
            pois = json.load(f)
        for c in pois.get("companies") or []:
            if len(c) > 2 and isinstance(c[2], str) and TOKEN_RE.match(c[2]):
                tokens.add(c[2])
    return tokens


def icon_dirs(game, extra=(), parser_root=PARSER_ROOT):
    """Donde buscar los logos, en orden de preferencia."""
    dirs = list(extra) + [os.path.join(parser_root, folder, "icons") for _v, folder in variants_of(game)]
    return [d for d in dirs if os.path.isdir(d)]


def normalize_logo(img, box=LOGO_BOX):
    """Recorta el borde transparente y escala para entrar en box.

    None si la imagen es toda transparente: no hay nada que dibujar.
    """
    img = img.convert("RGBA")
    bbox = img.getchannel("A").getbbox()
    if not bbox:
        return None
    img = img.crop(bbox)
    w, h = img.size
    scale = min(box[0] / w, box[1] / h)
    size = (max(1, round(w * scale)), max(1, round(h * scale)))
    if size != img.size:
        img = img.resize(size, Image.LANCZOS)
    return img


def find_logo(token, dirs):
    for d in dirs:
        path = os.path.join(d, token + ".png")
        # Un PNG vacio es un icono que el parser conoce pero no pudo dibujar
        # (parche 0003 de tm-maps): se sigue buscando en la carpeta siguiente.
        if os.path.isfile(path) and os.path.getsize(path) > 0:
            return path
    return None


def build_game(game, out_root, dirs, tokens):
    """Escribe los logos y el index.json del juego. Devuelve (con logo, sin logo)."""
    out_dir = os.path.join(out_root, *REMOTE_DIR.split("/"), game)
    shutil.rmtree(out_dir, ignore_errors=True)  # que no queden logos de una corrida anterior
    found, missing = [], []
    for token in sorted(tokens):
        src = find_logo(token, dirs)
        logo = None
        if src:
            try:
                with Image.open(src) as im:
                    logo = normalize_logo(im)
            except (OSError, ValueError) as err:
                print(f"  {game}: {token}.png no se pudo leer ({err})")
        if logo is None:
            missing.append(token)
            continue
        os.makedirs(out_dir, exist_ok=True)
        logo.save(os.path.join(out_dir, token + ".png"), optimize=True)
        found.append(token)
    if found:
        with open(os.path.join(out_dir, "index.json"), "w", encoding="utf-8", newline="\n") as f:
            json.dump({"pixelRatio": PIXEL_RATIO, "icons": found}, f, separators=(",", ":"))
            f.write("\n")
    return found, missing


def _get(url):
    # Con el User-Agent de Python, Cloudflare devuelve 403.
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; TruckDash-check)"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.read()


def verify(game, out_root, base=R2_BASE, sample=25):
    """Compara lo subido a R2 con la carpeta local. Correr DESPUES de subir.

    Pide con ?verify=<hora> y no con el ?v= de la web: si algo falta, el 404
    que Cloudflare guarda queda en otra URL y no en la que va a pedir la app.
    """
    local_dir = os.path.join(out_root, *REMOTE_DIR.split("/"), game)
    with open(os.path.join(local_dir, "index.json"), encoding="utf-8") as f:
        local = json.load(f)
    q = f"verify={int(time.time())}"
    problems = []
    try:
        remote = json.loads(_get(f"{base}/{REMOTE_DIR}/{game}/index.json?{q}"))
    except Exception as err:  # noqa: BLE001 - cualquier falla de red es "no esta"
        print(f"  {game}: index.json no responde ({err})")
        return False
    if remote != local:
        problems.append("index.json distinto del local")
    icons = local["icons"]
    step = max(1, len(icons) // sample)
    for token in icons[::step]:
        try:
            data = _get(f"{base}/{REMOTE_DIR}/{game}/{token}.png?{q}")
        except Exception as err:  # noqa: BLE001
            problems.append(f"{token}.png: {err}")
            continue
        with open(os.path.join(local_dir, token + ".png"), "rb") as f:
            if f.read() != data:
                problems.append(f"{token}.png distinto del local")
    for p in problems:
        print(f"  {game}: {p}")
    print(f"  {game}: {'bien' if not problems else 'MAL'} ({len(icons)} logos, {len(icons[::step])} revisados)")
    return not problems


def parse_extra(values):
    extra = {"ats": [], "ets2": []}
    for value in values or []:
        game, sep, path = value.partition("=")
        if not sep or game not in extra:
            raise SystemExit(f"--icons espera juego=carpeta (ats o ets2), no {value!r}")
        extra[game].append(path)
    return extra


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=OUT_DEFAULT, help="carpeta de salida (la que se sube a R2)")
    ap.add_argument("--icons", action="append", metavar="JUEGO=CARPETA",
                    help="carpeta de logos extra, antes que las del parser")
    ap.add_argument("--verify", nargs="+", choices=sorted(GAMES.values()), metavar="JUEGO",
                    help="comparar R2 con la carpeta local (despues de subir)")
    args = ap.parse_args(argv)

    if args.verify:
        return 0 if all([verify(game, args.out) for game in args.verify]) else 1

    extra = parse_extra(args.icons)
    for game in ("ats", "ets2"):
        dirs = icon_dirs(game, extra[game])
        if not dirs:
            print(f"  {game}: sin carpetas de iconos (parser-output-*/icons o --icons), se saltea")
            continue
        tokens = company_tokens(game)
        found, missing = build_game(game, args.out, dirs, tokens)
        print(f"  {game}: {len(found)} logos de {len(tokens)} empresas ({len(dirs)} carpetas)")
        if missing:
            print(f"  {game}: sin logo ({len(missing)}): {' '.join(missing[:40])}{' ...' if len(missing) > 40 else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

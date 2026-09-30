"""Capturas de la guia (docs/guide/img/<idioma>/) sacadas de la demo en
produccion, una tanda por idioma: el mapa apaisado, el modo navegacion en un
celular y el tablero.

Uso: python tools/guide_screenshots.py [idioma ...]   (por defecto los ocho)
Necesita Playwright con Chromium y Pillow. La demo corre en ATS; la zona
horaria es de EE. UU. para que la paga salga solo en dolares, sin la
conversion a la moneda de quien saca las fotos.
"""
import io
import os
import sys
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

LANGS = sys.argv[1:] or ["en", "es", "de", "fr", "pt", "pl", "tr", "ru"]
OUT = Path(__file__).resolve().parent.parent / "docs" / "guide" / "img"
# GUIDE_URL=http://localhost:8791/app/?demo=1 para sacarlas de la copia local
# antes de publicar (servidor "docs" del taller).
URL = os.environ.get("GUIDE_URL", "https://trucksim-dash.com/app/?demo=1")
# El tour, los avisos de novedades y el "destino aproximado" de la demo no
# son parte de lo que se quiere mostrar. Los botones del mapa, siempre
# visibles aunque este activo "atenuarlos al manejar".
CSS = ("#tourOverlay, .onboardTip, .tourTip, #routeApprox { display: none !important; }"
       " .tourHighlight { box-shadow: none !important; }"
       " body.fadeBtns.btnsIdle .mapBtn { opacity: 1 !important; }")
LISTO = ("() => typeof currentRouteWorldPoints !== 'undefined' && currentRouteWorldPoints"
         " && currentRouteWorldPoints.length > 10")


def guardar(png, destino, ancho):
    im = Image.open(io.BytesIO(png)).convert("RGB")
    if im.width > ancho:
        im = im.resize((ancho, round(im.height * ancho / im.width)), Image.LANCZOS)
    destino.parent.mkdir(parents=True, exist_ok=True)
    im.save(destino, "WEBP", quality=78, method=6)
    print(destino.relative_to(OUT.parent), f"{destino.stat().st_size // 1024} KB")


def pagina(b, lang, **ctx):
    c = b.new_context(service_workers="block", timezone_id="America/Denver", locale="en-US", **ctx)
    c.add_init_script(f"try {{ localStorage.setItem('truckdash_lang', '{lang}'); }} catch (e) {{}}")
    pg = c.new_page()
    pg.goto(URL)
    pg.add_style_tag(content=CSS)
    pg.wait_for_function(LISTO, timeout=120000)
    pg.wait_for_timeout(6000)
    pg.evaluate("document.querySelectorAll('.tourHighlight').forEach(e => e.classList.remove('tourHighlight'))")
    return c, pg


with sync_playwright() as p:
    for lang in LANGS:
        # Un navegador por idioma: con varias paginas WebGL seguidas en el
        # mismo, swiftshader a veces pierde el contexto.
        b = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
        c, pg = pagina(b, lang, viewport={"width": 1280, "height": 720}, device_scale_factor=1.25)
        guardar(pg.screenshot(), OUT / lang / "map.webp", 1600)
        pg.click("#dashBtn")
        pg.wait_for_timeout(3000)
        guardar(pg.screenshot(), OUT / lang / "dash.webp", 1600)
        c.close()
        c, pg = pagina(b, lang, viewport={"width": 390, "height": 844}, device_scale_factor=2,
                       is_mobile=True, has_touch=True)
        pg.click("#navToggleBtn")
        pg.wait_for_timeout(7000)
        guardar(pg.screenshot(), OUT / lang / "phone.webp", 780)
        c.close()
        b.close()

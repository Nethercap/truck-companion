"""
Graba el modo demo de la app (/app/?demo=1) con Chromium headless y arma
docs/assets/demo.webp (animado) para la landing y los posts. Se corre a
mano cuando cambia algo visible en la app:

  python tools/record_demo.py                # usa https://trucksim-dash.com
  python tools/record_demo.py http://localhost:8804   # contra un server local

Requiere: pip install playwright && python -m playwright install chromium
"""

import io
import os
import sys
import time

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "assets", "demo.webp")
BASE = sys.argv[1] if len(sys.argv) > 1 else "https://trucksim-dash.com"

WIDTH, HEIGHT = 960, 600   # viewport de captura (relacion 16:10, mas cerca de una notebook)
OUT_WIDTH = 720            # ancho final del webp
FPS = 4
SECONDS = 14


def main():
    frames = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": WIDTH, "height": HEIGHT}, device_scale_factor=1)
        # Sin tour y en ingles, decidido ANTES de que cargue la app (el tour
        # arranca solo en la primera visita y el idioma se lee al inicio).
        # fadeButtons viene prendido de fabrica y en la grabacion no hay quien
        # toque la pantalla: los botones se apagaban a los 6 segundos y el
        # resto del clip se veian a medio borrar.
        page.add_init_script("localStorage.setItem('truckdash_tour_seen', '1'); localStorage.setItem('truckdash_lang', 'en');"
                             " localStorage.setItem('truckdash_settings', JSON.stringify({ fadeButtons: false }));")
        page.goto(f"{BASE}/app/?demo=1", wait_until="load")
        # Esperar a que la demo arranque (posicion + ruta calculada) y a que
        # bajen los tiles.
        page.wait_for_function("() => typeof lastWorldPos !== 'undefined' && lastWorldPos && currentRouteWorldPoints", timeout=60000)
        page.evaluate("() => setNavMode(true)")
        time.sleep(4)
        for _ in range(FPS * SECONDS):
            t0 = time.time()
            frames.append(Image.open(io.BytesIO(page.screenshot(type="png"))).convert("RGB"))
            time.sleep(max(0, 1 / FPS - (time.time() - t0)))
        browser.close()

    ratio = OUT_WIDTH / WIDTH
    frames = [f.resize((OUT_WIDTH, round(HEIGHT * ratio)), Image.LANCZOS) for f in frames]
    frames[0].save(OUT, "WEBP", save_all=True, append_images=frames[1:], duration=int(1000 / FPS), loop=0, quality=70, method=6)
    print(f"{OUT}: {len(frames)} frames, {os.path.getsize(OUT) // 1024} KB")


if __name__ == "__main__":
    main()

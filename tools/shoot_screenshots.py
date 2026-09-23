"""
Vuelve a sacar las capturas de la landing desde el modo demo de la app, para
no tener que acordarse del encuadre de cada una. Se corre a mano cuando
cambia algo visible:

  python tools/shoot_screenshots.py                     # contra trucksim-dash.com
  python tools/shoot_screenshots.py http://127.0.0.1:8804   # contra un server local

Deja los PNG en docs/assets/ con el mismo nombre y tamano que los de antes
(la landing los referencia con width/height fijos). Despues hay que correr
tools/build_assets.py, que es el que arma los .webp que usa la pagina.

Requiere: pip install playwright && python -m playwright install chromium
"""

import os
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "docs", "assets")
BASE = sys.argv[1] if len(sys.argv) > 1 else "https://trucksim-dash.com"

# Los tamanos finales son los de siempre: la landing trae width/height en el
# HTML y cambiarlos moveria el layout. Se capturan a 2x y por eso el viewport
# es la mitad.
DESKTOP = (958, 600)     # -> 1916x1200 a 2x
# Un celular de verdad: 421 CSS de ancho a 3x. Con 632 a 2x da el mismo PNG
# pero la interfaz sale diminuta, con la botonera en cinco columnas en vez de
# tres, que no es lo que ve nadie en la mano.
PHONE = (421, 927)       # -> 1263x2781 a 3x, se ajusta a 1264x2780
PHONE_PNG = (1264, 2780)

# El desvanecido de botones viene prendido de fabrica, pero en una captura
# quieta se verian a medio apagar, que no es lo que ve alguien usando la app.
PREFS = """
localStorage.setItem('truckdash_tour_seen','1');
localStorage.setItem('truckdash_lang','en');
localStorage.setItem('truckdash_settings', JSON.stringify({ fadeButtons: false }));
"""


def settle(page, tries=12):
    """Espera a que el mapa termine de dibujar: sin esto salen tiles a medio
    cargar, que en una captura se nota mucho."""
    for _ in range(tries):
        time.sleep(1.2)
        try:
            if page.evaluate("() => map && map.areTilesLoaded() && map.loaded()"):
                return
        except Exception:
            pass


def open_app(ctx, size):
    page = ctx.new_page()
    page.set_viewport_size({"width": size[0], "height": size[1]})
    page.goto(f"{BASE}/app/?demo=1", wait_until="load")
    page.wait_for_function("() => typeof mapReady !== 'undefined' && mapReady && currentGame", timeout=180000)
    time.sleep(4)
    settle(page)
    return page


def centered_clip(page, element_id, width, height):
    """Un recorte de width x height (en px CSS) centrado dentro de ese
    elemento."""
    r = page.evaluate(f"() => {{ const b = document.getElementById('{element_id}').getBoundingClientRect();"
                      " return { x: b.x, y: b.y, w: b.width, h: b.height }; }")
    return {"x": r["x"] + (r["w"] - width) / 2, "y": r["y"] + (r["h"] - height) / 2,
            "width": width, "height": height}


def shot(page, name, clip=None, size=None):
    path = os.path.join(ASSETS, name + ".png")
    page.screenshot(path=path, clip=clip)
    if size:
        # El recorte redondea y sale con un pixel de menos; la landing trae
        # width/height fijos en el HTML, asi que se deja clavado el tamano.
        from PIL import Image
        im = Image.open(path)
        if im.size != size:
            im.resize(size, Image.LANCZOS).save(path)
    try:
        z = page.evaluate("() => +map.getZoom().toFixed(1)")
    except Exception:
        z = "?"
    print(f"  {name}.png  {os.path.getsize(path)/1024:.0f} KB  (zoom {z})")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # --- escritorio ----------------------------------------------------
        ctx = browser.new_context(viewport={"width": DESKTOP[0], "height": DESKTOP[1]},
                                  device_scale_factor=2, locale="en-US")
        ctx.add_init_script(PREFS)
        page = open_app(ctx, DESKTOP)
        # Un poco mas lejos que el seguimiento automatico: se ve la ruta
        # entera y el agua, que es de lo que se trata la captura.
        page.evaluate("() => { pauseMapFollow(); map.jumpTo({ center: truckMarker.getLngLat(), zoom: 6.8 }); }")
        settle(page)
        shot(page, "screenshot-dashboard")

        # La ruta del demo tarda en calcularse: sin esperarla, el source
        # 'route' esta vacio y las coordenadas salen undefined.
        page.wait_for_function(
            "() => typeof currentRouteWorldPoints !== 'undefined' && currentRouteWorldPoints"
            " && currentRouteWorldPoints.length > 50", timeout=120000)

        # Waypoints: dos paradas sobre la ruta que ya calculo el demo, no en
        # coordenadas inventadas (caian en el desierto, lejos de todo).
        page.evaluate("""() => {
          clearWaypoint();
          // currentRouteWorldPoints viene en coordenadas del juego, no en
          // lng/lat: hay que proyectarlo.
          const wp = currentRouteWorldPoints;
          const pa = wp[Math.floor(wp.length * 0.12)], pb = wp[Math.floor(wp.length * 0.32)];
          const a = toLngLat(pa[0], pa[1]), b = toLngLat(pb[0], pb[1]);
          addWaypoint(fromLngLat(a[0], a[1]), a, false, null);
          addWaypoint(fromLngLat(b[0], b[1]), b, false, null);
          // Encuadre de las dos paradas y despues un paso atras: el recorte
          // es mas chico que el panel, asi caen bien adentro. Con el relleno
          // calculado a mano MapLibre se pasaba de rosca y terminaba en
          // zoom negativo.
          // Ordenado suroeste/noreste: pasandole [a, b] al reves, MapLibre
          // entiende una caja que da la vuelta al mundo y termina en zoom 0.
          const sw = [Math.min(a[0], b[0]), Math.min(a[1], b[1])];
          const ne = [Math.max(a[0], b[0]), Math.max(a[1], b[1])];
          map.fitBounds([sw, ne], { padding: 60, duration: 0 });
          map.jumpTo({ center: map.getCenter(), zoom: map.getZoom() - 0.6 });
          document.getElementById('routeSummary').style.visibility = 'hidden';
        }""")
        settle(page)
        # Recorte centrado dentro del mapa: con coordenadas fijas agarraba el
        # encabezado de la pagina y cortaba los marcadores.
        shot(page, "screenshot-waypoints", clip=centered_clip(page, "mapPanel", 400.5, 278),
             size=(801, 556))
        page.evaluate("() => { clearWaypoint(); document.getElementById('routeSummary').style.visibility = ''; }")

        # Buscar cerca: el panel abierto, recortado a su ancho.
        page.click("#poiBtn")
        page.wait_for_selector("#poiModal", state="visible", timeout=30000)
        time.sleep(2.5)
        # La tarjeta entera, a su tamano natural: recortarla a un ancho fijo
        # le cortaba la columna de distancias de la derecha.
        card = page.query_selector("#poiModal .settingsCard") or page.query_selector("#poiModal > div")
        path = os.path.join(ASSETS, "screenshot-find-nearby.png")
        card.screenshot(path=path)
        from PIL import Image
        print(f"  screenshot-find-nearby.png  {os.path.getsize(path)/1024:.0f} KB  {Image.open(path).size}")
        page.keyboard.press("Escape")
        page.close()

        # --- celular -------------------------------------------------------
        ctx2 = browser.new_context(viewport={"width": PHONE[0], "height": PHONE[1]},
                                   device_scale_factor=3, locale="en-US",
                                   has_touch=True, is_mobile=True)
        ctx2.add_init_script(PREFS)
        page = open_app(ctx2, PHONE)

        # 1: la ruta entera, con el rastro y la red de rutas.
        page.evaluate("() => { pauseMapFollow(); map.jumpTo({ center: truckMarker.getLngLat(), zoom: 6.6 }); }")
        settle(page)
        shot(page, "screenshot-gps-1", size=PHONE_PNG)

        # 2 y 3: modo navegacion, lejos y encima del cruce.
        page.evaluate("() => { if (!navMode) document.getElementById('navToggleBtn').click(); }")
        time.sleep(4)
        # Zoom fijo: el del modo navegacion es dinamico y en una captura
        # quieta cae donde le toque, a veces encima del cruce (que es
        # justamente la captura siguiente).
        page.evaluate("() => { navAutoZoomPaused = true; map.jumpTo({ zoom: 11.5 }); }")
        time.sleep(3)
        settle(page)
        shot(page, "screenshot-gps-2", size=PHONE_PNG)

        page.evaluate("() => { navAutoZoomPaused = true; map.jumpTo({ zoom: 14.5 }); }")
        time.sleep(3)
        settle(page)
        shot(page, "screenshot-gps-3", size=PHONE_PNG)

        # 4: la botonera.
        page.evaluate("() => { if (navMode) document.getElementById('navToggleBtn').click(); }")
        time.sleep(2)
        # En vertical la botonera no es un boton del mapa: es la tercera
        # pagina del swipe del panel de info (ver placeCommandsPanel).
        page.evaluate("""() => {
          const sw = document.getElementById('panelSwipe');
          sw.scrollLeft = sw.clientWidth * 2;
          sw.dispatchEvent(new Event('scroll'));
        }""")
        time.sleep(2.5)
        shot(page, "screenshot-buttonbox", size=PHONE_PNG)
        page.close()
        browser.close()

    print("\nListo. Ahora: python tools/build_assets.py")


if __name__ == "__main__":
    sys.exit(main())

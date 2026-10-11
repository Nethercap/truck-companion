"""Test de humo de la web en un navegador de verdad (Chromium sin ventana).

Los tests de docs/app/test_pure.js prueban la logica, pero nadie abria la
pagina: un error al arrancar app.js (una libreria que no carga, un nombre mal
escrito) dejaba el tablero muerto y solo se veia en produccion. Esto sirve
docs/ en local y comprueba:

  - la demo de ATS: mapa, ciudades, grafo de rutas y POIs (de R2, los de
    produccion) y la ruta armada, sin errores en la pagina;
  - sin WebGL: el cartel que lo explica, y el tablero sin errores;
  - la landing (ingles y castellano), la guia y la cuenta cargan sin errores.

Uso: python tools/smoke_web.py   (pide: pip install playwright && playwright install chromium)
Sale con 1 si algo falla. Lo corre el job web-smoke de .github/workflows/tests.yml.
"""

import functools
import http.server
import os
import sys
import threading

from playwright.sync_api import sync_playwright

DOCS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs")
# Sin GPU (CI): WebGL por software. --enable-unsafe-swiftshader lo pide Chrome
# desde que dejo de usar SwiftShader solo.
CON_WEBGL = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
SIN_WEBGL = ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"]
# Errores de consola que no son de la pagina: recursos de terceros que un
# runner de CI puede no alcanzar (fuentes de Google, el contador del relay).
IGNORAR = ("fonts.googleapis", "fonts.gstatic", "Failed to load resource", "net::ERR")

fallas = []


def chequear(nombre, ok, detalle=""):
    print(("ok    " if ok else "FALLA ") + nombre + (f"  ({detalle})" if detalle else ""), flush=True)
    if not ok:
        fallas.append(nombre)


class _Mudo(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def servidor():
    handler = functools.partial(_Mudo, directory=DOCS)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}"


def pagina(p, args, base):
    b = p.chromium.launch(args=args)
    ctx = b.new_context(viewport={"width": 1280, "height": 800}, service_workers="block")
    page = ctx.new_page()
    errores = []
    page.on("pageerror", lambda e: errores.append(str(e)[:200]))
    page.on("console", lambda m: errores.append(m.text[:200])
            if m.type == "error" and not any(x in m.text for x in IGNORAR) else None)
    return b, page, errores


def main():
    srv, base = servidor()
    with sync_playwright() as p:
        # 1) La demo de ATS de punta a punta
        b, page, errores = pagina(p, CON_WEBGL, base)
        page.goto(base + "/app/?demo=1")
        try:
            page.wait_for_function(
                "() => typeof map !== 'undefined' && map && routeGraph && citiesAll.length > 0"
                " && pois && currentRouteWorldPoints && currentRouteWorldPoints.length > 1",
                timeout=120000)
            listo = True
        except Exception as exc:
            listo = False
            chequear("demo: mapa, grafo, ciudades, POIs y ruta", False, str(exc)[:120])
        if listo:
            r = page.evaluate("""() => ({ variante: currentGame, ciudades: citiesAll.length,
                puntos: currentRouteWorldPoints.length, empresas: pois.companies.length,
                velocidad: document.getElementById('miniSpeedBig').textContent })""")
            chequear("demo: mapa, grafo, ciudades, POIs y ruta", r["ciudades"] > 100 and r["empresas"] > 100,
                     f"{r['variante']}, {r['ciudades']} ciudades, ruta de {r['puntos']} puntos")
            page.wait_for_timeout(3000)
            vel = page.evaluate("document.getElementById('miniSpeedBig').textContent")
            chequear("demo: el tablero recibe datos", vel.strip() not in ("", "--"), f"velocidad {vel}")
        chequear("demo: sin errores en la pagina", not errores, "; ".join(errores[:3]))
        b.close()

        # 2) Sin WebGL: el cartel en lugar del mapa
        b, page, errores = pagina(p, SIN_WEBGL, base)
        page.goto(base + "/app/?demo=1")
        page.wait_for_timeout(4000)
        aviso = page.evaluate("!document.getElementById('mapNoWebgl').hidden")
        chequear("sin WebGL: aparece el aviso", aviso)
        chequear("sin WebGL: sin errores en la pagina", not errores, "; ".join(errores[:3]))
        b.close()

        # 3) Las demas paginas cargan sin errores de JavaScript
        b, page, errores = pagina(p, CON_WEBGL, base)
        for ruta, selector in (("/", "#mods"), ("/es/", "#mods"), ("/guide/", "body"), ("/account/", "body")):
            errores.clear()
            page.goto(base + ruta)
            page.wait_for_timeout(2500)
            hay = page.query_selector(selector) is not None
            # La API de cuentas solo acepta pedidos desde trucksim-dash.com: desde
            # 127.0.0.1 el navegador los corta por CORS, y eso no es de la pagina.
            propios = [e for e in errores if ruta != "/account/" or not ("CORS policy" in e or "Failed to fetch" in e)]
            chequear(f"{ruta}: carga sin errores", hay and not propios, "; ".join(propios[:3]))
        b.close()

        # 4) Dos pestanas en el mismo navegador (el cliente abria una por
        # arranque y el celular suma otra): una sola habla y graba, al cerrar
        # esa la otra toma el lugar, y los ajustes de una no pisan los de la
        # otra (supuestos 1 y 9 del CLAUDE.md, 10-10).
        b, page, errores = pagina(p, CON_WEBGL, base)
        otra = page.context.new_page()
        otra.on("pageerror", lambda e: errores.append("otra: " + str(e)[:200]))
        for pg in (page, otra):
            pg.goto(base + "/app/?demo=1")
        for pg in (page, otra):
            pg.wait_for_function("() => typeof isLeaderTab !== 'undefined' && settingsBaseline", timeout=60000)
        page.wait_for_timeout(2000)
        lideres = [pg.evaluate("isLeaderTab") for pg in (page, otra)]
        chequear("dos pestanas: una sola lider", lideres.count(True) == 1, f"{lideres}")
        antes = page.evaluate("useImperial")
        page.evaluate("toggleUnits()")
        otra.evaluate("truckSize = 2; saveSettings()")
        guardado = page.evaluate("JSON.parse(localStorage.getItem('truckdash_settings'))")
        chequear("dos pestanas: los ajustes de una no pisan los de la otra",
                 guardado.get("useImperial") == (not antes) and guardado.get("truckSize") == 2,
                 f"useImperial {guardado.get('useImperial')}, truckSize {guardado.get('truckSize')}")
        lider, resto = (page, otra) if lideres[0] else (otra, page)
        lider.close()
        try:
            resto.wait_for_function("() => isLeaderTab", timeout=10000)
            tomo = True
        except Exception:
            tomo = False
        chequear("dos pestanas: al cerrar la lider, la otra toma el lugar", tomo)
        chequear("dos pestanas: sin errores en la pagina", not errores, "; ".join(errores[:3]))
        b.close()
    srv.shutdown()
    print(f"\n{len(fallas)} fallas" if fallas else "\ntodo bien")
    return 1 if fallas else 0


if __name__ == "__main__":
    sys.exit(main())

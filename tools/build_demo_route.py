"""Guarda la ruta de la demo en docs/app/demo-route-<juego>.json.

La demo de la app (/app/?demo=1) arranca con esta ruta ya calculada, sin
esperar el grafo de ruteo (4,5 MB): en 4G lento el grafo llegaba a los 30 s y
la demo se rendia (auditoria del 12-10). La ruta sale de computeDemoPath() de
docs/app/app.js, el mismo findRoute que usa la demo cuando tiene el grafo, en
un Chromium sin ventana con docs/ servido en local y los mapas de R2.

demoPathUsable (pure.js) descarta el archivo si se calculo con otro grafo:
guarda la revision (ROUTE_GRAPH_V3_REV) y la version de los datos del mapa
(MAP_DATA_VERSION). Correr de nuevo despues de subir cualquiera de las dos:

  python tools/build_demo_route.py

El smoke de la web (tools/smoke_web.py) bloquea el grafo y comprueba que la
demo arranque igual: si este archivo quedo viejo, falla ahi.
"""

import functools
import http.server
import json
import os
import threading

from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(RAIZ, "docs")
WEBGL = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]


class _Mudo(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    handler = functools.partial(_Mudo, directory=DOCS)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}"
    with sync_playwright() as p:
        b = p.chromium.launch(args=WEBGL)
        ctx = b.new_context(viewport={"width": 1280, "height": 800}, service_workers="block")
        page = ctx.new_page()
        page.goto(base + "/app/?demo=1")
        # Con los POIs: la ruta va de empresa a empresa, no entre centros de ciudad
        page.wait_for_function(
            "() => typeof routeGraph !== 'undefined' && routeGraph && pois"
            " && citiesByName[DEMO_ROUTE.from] && citiesByName[DEMO_ROUTE.to]",
            timeout=180000)
        datos = page.evaluate("""() => {
            const path = computeDemoPath();
            return {
                game: DEMO_ROUTE.game,
                rev: ROUTE_GRAPH_V3_REV,
                mapData: MAP_DATA_VERSION[DEMO_ROUTE.game],
                from: DEMO_ROUTE.companyFromId + '@' + DEMO_ROUTE.fromId,
                to: DEMO_ROUTE.companyToId + '@' + DEMO_ROUTE.toId,
                // A 10 cm: el juego mide en metros y sobra
                path: path ? path.map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]) : null,
            };
        }""")
        b.close()
    srv.shutdown()
    if not datos["path"] or len(datos["path"]) < 2:
        raise SystemExit("computeDemoPath() no devolvio ruta")
    salida = os.path.join(DOCS, "app", f"demo-route-{datos['game']}.json")
    with open(salida, "w", encoding="utf-8", newline="\n") as f:
        json.dump(datos, f, separators=(",", ":"))
        f.write("\n")
    print(f"{os.path.relpath(salida, RAIZ)}: {len(datos['path'])} puntos, grafo rev {datos['rev']}, "
          f"datos {datos['mapData']}, {os.path.getsize(salida) // 1024} KB")


if __name__ == "__main__":
    main()

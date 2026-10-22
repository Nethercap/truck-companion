"""Prueba de punta a punta del plan de ruta y la voz compartidos por la sesion
(Discord 22-10): el relay de backend/ en local, un cliente falso que manda la
telemetria de la demo con una posicion en Salt Lake City, y dos navegadores
separados (dos dispositivos) con el mismo codigo, mas un tercero por LAN con
un servidor LAN falso en el 27766 (el session_state con el relay y el codigo,
como el de client/local_server.py). Mira que un waypoint vaya y vuelva, que
los dos calculen la misma ruta, que la voz pase de uno a otro, que los ajustes
de ruta y el plan crucen entre la LAN y el codigo, y que despues de reiniciar
el relay el plan y la voz vuelvan desde las pestanas.

Uso: python tools/probar_dispositivos.py   (pide uvicorn, websockets y
playwright; baja mapas y grafos de R2 como smoke_web.py). Sale con 1 si algo
falla.
"""
import asyncio
import functools
import http.server
import json
import os
import subprocess
import sys
import threading
import time
import urllib.request

import websockets
from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUERTO = 8765
RELAY = f"http://127.0.0.1:{PUERTO}"
fallas = []


def chequear(nombre, ok, detalle=""):
    print(("ok    " if ok else "FALLA ") + nombre + (f"  ({detalle})" if detalle else ""), flush=True)
    if not ok:
        fallas.append(nombre)


def arrancar_relay():
    env = dict(os.environ, TRUCKDASH_ORIGENES="avisar", ADMIN_KEY="x")
    for k in ("R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"):
        env.pop(k, None)
    proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "main:app", "--port", str(PUERTO), "--log-level", "warning"],
                            cwd=os.path.join(RAIZ, "backend"), env=env)
    for _ in range(100):
        try:
            urllib.request.urlopen(RELAY + "/health", timeout=1)
            return proc
        except Exception:
            time.sleep(0.2)
    raise RuntimeError("el relay no arranco")


class _Mudo(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def servidor():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(_Mudo, directory=os.path.join(RAIZ, "docs")))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}"


def cliente_falso(code, parar):
    """Manda la telemetria de la demo con posicion, y vuelve a conectar si se corta."""
    tick = json.loads(subprocess.check_output(["node", "-e", (
        "const p = require('./docs/app/pure.js'); const t = p.createDemoTelemetry({}).next();"
        " t.position = { x: -67313, y: 0, z: -16853 }; t.heading = 0.25; process.stdout.write(JSON.stringify(t));")],
        cwd=RAIZ))

    async def loop():
        while not parar.is_set():
            try:
                async with websockets.connect(f"ws://127.0.0.1:{PUERTO}/ws/client/{code}") as ws:
                    await ws.send(json.dumps({"type": "client_status", "status": "live", "game": "ats", "clientVersion": "9.9.9"}))
                    while not parar.is_set():
                        tick["ts"] = time.time()
                        await ws.send(json.dumps(tick))
                        await asyncio.sleep(0.25)
            except Exception:
                await asyncio.sleep(0.5)

    asyncio.run(loop())


def servidor_lan_falso(code, parar):
    """El 27766 del cliente: session_state LAN con planRelay y la telemetria."""
    tick = json.loads(subprocess.check_output(["node", "-e", (
        "const p = require('./docs/app/pure.js'); const t = p.createDemoTelemetry({}).next();"
        " t.position = { x: -67313, y: 0, z: -16853 }; t.heading = 0.25; process.stdout.write(JSON.stringify(t));")],
        cwd=RAIZ))

    async def atender(ws):
        await ws.send(json.dumps({"type": "session_state", "client_connected": True, "client_status": None,
                                  "local": True, "liveShare": None,
                                  "planRelay": {"backend": f"ws://127.0.0.1:{PUERTO}", "code": code}}))
        await ws.send(json.dumps({"type": "client_status", "status": "live", "game": "ats", "clientVersion": "9.9.9"}))
        try:
            while not parar.is_set():
                tick["ts"] = time.time()
                await ws.send(json.dumps(tick))
                await asyncio.sleep(0.25)
        except Exception:
            pass

    async def loop():
        async with websockets.serve(atender, "127.0.0.1", 27766):
            while not parar.is_set():
                await asyncio.sleep(0.2)

    asyncio.run(loop())


def pestana_lan(browser, base, errores):
    ctx = browser.new_context(viewport={"width": 1280, "height": 800}, service_workers="block")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errores.append(f"lan: {str(e)[:200]}"))
    page.goto(f"{base}/app/?local=1")
    page.wait_for_function("() => typeof planShared !== 'undefined' && conn.local && planShared && lanPlanWs"
                           " && currentGame === 'ats' && toLngLat", timeout=90000)
    return page


def pestana(browser, base, code, errores, nombre):
    ctx = browser.new_context(viewport={"width": 1280, "height": 800}, service_workers="block")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errores.append(f"{nombre}: {str(e)[:200]}"))
    page.goto(f"{base}/app/?backend=ws://127.0.0.1:{PUERTO}&code={code}")
    page.wait_for_function("() => typeof planShared !== 'undefined' && planShared && currentGame === 'ats' && toLngLat", timeout=90000)
    return page


def esperar(page, expr, timeout=10000):
    try:
        page.wait_for_function(expr, timeout=timeout)
        return True
    except Exception:
        return False


def main():
    relay = arrancar_relay()
    srv, base = servidor()
    code = json.loads(urllib.request.urlopen(urllib.request.Request(RELAY + "/pair/new", method="POST")).read())["code"]
    parar = threading.Event()
    threading.Thread(target=cliente_falso, args=(code, parar), daemon=True).start()
    threading.Thread(target=servidor_lan_falso, args=(code, parar), daemon=True).start()
    errores = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
            tablet = pestana(b, base, code, errores, "tablet")
            celular = pestana(b, base, code, errores, "celular")
            ids = [pg.evaluate("DEVICE_ID") for pg in (tablet, celular)]
            chequear("dos dispositivos con id distinto", ids[0] != ids[1], str(ids))

            for pg in (tablet, celular):
                esperar(pg, "() => routeGraph", 60000)
            # 1) Waypoint puesto en la tablet: aparece en el celular
            tablet.evaluate("addWaypoint([-67000, -17200], toLngLat(-67000, -17200), true, 'Parada de prueba', 'g')")
            llego = esperar(celular, "() => waypoints.length === 1 && waypoints[0].label === 'Parada de prueba'")
            chequear("el waypoint de la tablet llega al celular", llego)
            rev_t = tablet.evaluate("JSON.parse(localStorage.getItem('truckdash_waypoints')).ats")
            rev_c = celular.evaluate("JSON.parse(localStorage.getItem('truckdash_waypoints')).ats")
            chequear("los dos guardan el mismo rev y nada pendiente", rev_t["rev"] > 0 and rev_t["rev"] == rev_c["rev"]
                     and not rev_t["pending"] and not rev_c["pending"], f"{rev_t} / {rev_c}")
            # Con trabajo, el waypoint es una parada en el camino al destino: los
            # dos tienen que calcular la misma ruta, que pasa por el
            expr = ("() => currentRouteTarget && currentRouteWorldPoints && currentRouteWorldPoints.length > 1"
                    " && currentRouteWorldPoints.some(p => Math.hypot(p[0] + 67000, p[1] + 17200) < 400)")
            listos = esperar(tablet, expr, 60000) and esperar(celular, expr, 60000)
            # Cada uno rutea solo; con el grafo entero (decimas y prefabs) la ruta es la misma
            for pg in (tablet, celular):
                esperar(pg, "() => routeGraph && routeGraph.edgePrefab && routeGraph.edgeT", 60000)
            tablet.wait_for_timeout(1500)
            rutas = [pg.evaluate("currentRouteWorldPoints.map(p => [Math.round(p[0]), Math.round(p[1])]).join(';')") for pg in (tablet, celular)]
            chequear("los dos calculan la misma ruta, por el waypoint", listos and rutas[0] == rutas[1])

            # 2) Sacarlo en el celular lo saca en la tablet
            celular.evaluate("removeWaypoint(0)")
            chequear("sacarlo en el celular lo saca en la tablet", esperar(tablet, "() => waypoints.length === 0"))

            # 3) La voz: prenderla en el celular la trae ahi y calla la tablet
            for pg in (tablet, celular):
                pg.evaluate("voiceOn = true")
            celular.evaluate("claimVoice()")
            chequear("la tablet sabe que la voz esta en el celular",
                     esperar(tablet, f"() => voiceDevice && voiceDevice.device === '{ids[1]}'"))
            chequear("habla solo el celular", tablet.evaluate("voiceHere()") is False and celular.evaluate("voiceHere()") is True)
            tablet.evaluate("renderVoiceDeviceHint()")
            texto = tablet.evaluate("document.getElementById('voiceOtherDeviceHint').hidden ? '' : document.getElementById('voiceOtherDeviceText').textContent")
            chequear("la tablet dice donde esta la voz", "Chrome" in texto or "·" in texto, texto)
            tablet.evaluate("document.getElementById('voiceSpeakHereBtn').click()")
            chequear("'Speak here' en la tablet la trae", esperar(celular, f"() => voiceDevice && voiceDevice.device === '{ids[0]}'"))

            # 4) Por LAN: el plan, la voz y los ajustes de ruta cruzan con los del codigo
            lan = pestana_lan(b, base, errores)
            id_lan = lan.evaluate("DEVICE_ID")
            tablet.evaluate("addWaypoint([-67000, -17200], toLngLat(-67000, -17200), true, 'Para la LAN')")
            chequear("el waypoint de la tablet llega a la pestana por LAN",
                     esperar(lan, "() => waypoints.length === 1 && waypoints[0].label === 'Para la LAN'"))
            lan.evaluate("removeWaypoint(0)")
            chequear("sacarlo por LAN lo saca en el celular", esperar(celular, "() => waypoints.length === 0"))
            lan.evaluate("voiceOn = true; claimVoice()")
            chequear("prender la voz por LAN la trae ahi",
                     esperar(tablet, f"() => voiceDevice && voiceDevice.device === '{id_lan}'")
                     and lan.evaluate("voiceHere()") is True)
            lan.evaluate("document.getElementById('setRouteShortest').checked = true;"
                         " document.getElementById('setRouteShortest').dispatchEvent(new Event('change'))")
            chequear("'Mas corta' por LAN pasa a los demas",
                     esperar(tablet, "() => routeProfile === 'shortest'") and esperar(celular, "() => routeProfile === 'shortest'"))
            celular.evaluate("dlcOff = normalizeDlcOff({ ats: ['co'], ets2: [] }); dlcAuto = false; saveSettings(); routePrefsChanged()")
            chequear("los DLC apagados en el celular pasan a la LAN",
                     esperar(lan, "() => !dlcAuto && dlcOff.ats.includes('co')"))
            tablet.evaluate("document.getElementById('voiceSpeakHereBtn').click()")
            esperar(lan, f"() => voiceDevice && voiceDevice.device === '{ids[0]}'")

            # 5) El relay se reinicia: el plan vuelve desde las pestanas
            tablet.evaluate("addWaypoint([-66500, -17500], toLngLat(-66500, -17500), true, 'Despues del reinicio')")
            esperar(celular, "() => waypoints.length === 1")
            relay.terminate()
            relay.wait(10)
            relay = arrancar_relay()
            # El cliente falso vuelve a pedir el codigo: en el relay nuevo no existe
            # hasta que el cliente se conecta (lo crea), y las pestanas reintentan.
            ok = esperar(tablet, "() => planShared", 60000) and esperar(celular, "() => planShared", 60000)
            chequear("las pestanas vuelven a saludar despues del reinicio", ok)
            nueva = pestana(b, base, code, errores, "pc")
            chequear("un dispositivo nuevo recibe el plan que recupero el relay",
                     esperar(nueva, "() => waypoints.length === 1 && waypoints[0].label === 'Despues del reinicio'", 20000))
            chequear("y la voz sigue en la tablet",
                     esperar(nueva, f"() => voiceDevice && voiceDevice.device === '{ids[0]}'", 10000))
            chequear("y los ajustes de ruta tambien", esperar(nueva, "() => routeProfile === 'shortest' && dlcOff.ats.includes('co')", 10000))
            chequear("la pestana por LAN vuelve a saludar despues del reinicio", esperar(lan, "() => planShared && lanPlanWs", 90000))
            chequear("sin errores en las paginas", not errores, "; ".join(errores[:3]))
            b.close()
    finally:
        parar.set()
        relay.terminate()
        srv.shutdown()
    print(f"\n{len(fallas)} fallas" if fallas else "\ntodo bien")
    return 1 if fallas else 0


if __name__ == "__main__":
    sys.exit(main())

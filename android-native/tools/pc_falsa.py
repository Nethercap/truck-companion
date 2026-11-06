"""Una PC falsa para probar la app nativa sin juego: un camion que anda por la ruta
demo de ATS (Salt Lake City -> Las Vegas, docs/app/demo-route-ats.json), con los
mensajes armados por build_payload del cliente de verdad.

  python android-native/tools/pc_falsa.py --lan
      Hace de cliente por la red local: en la app, modo red local con 10.0.2.2 en
      el emulador, o la IP de esta PC en un telefono.

  python android-native/tools/pc_falsa.py --relay http://127.0.0.1:8123
      Pide un codigo a un relay LOCAL (python -m uvicorn main:app --port 8123, en
      backend/) y le manda telemetria. En Ajustes de la app de debug, relay
      ws://10.0.2.2:8123. No apuntar a produccion: cuenta como una sesion real.

Muestra lo que la app le manda (comandos, compartir, nav_hud) para ver que llegue.

  --codigo X   vuelve a esa sesion en vez de pedir otra, como un cliente que reconecta.
  --plan-relay URL  por LAN, pasa ese relay LOCAL y un codigo: el plan y la voz van por ahi.
  --viejo      el cliente dice ser de una version vieja: la app avisa que hay otra.
  --overlay    el cliente dice que tiene el overlay del juego: la app le manda nav_hud.
  --poco       poco combustible y poco descanso: la app sugiere una parada.
"""
import argparse
import asyncio
import json
import math
import os
import sys
import time
import urllib.request

import websockets

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(RAIZ, "client"))

import client as cliente  # noqa: E402

PUERTO_LAN = 27766
HZ = 4
# Unidades del juego por segundo: bastante mas rapido que un camion, para que en
# un minuto de prueba se vea avanzar el rastro.
VELOCIDAD_RUTA = 90.0
VELOCIDAD_KMH = 88.0
# Lo prenden --overlay y --poco.
CON_OVERLAY = False
COMBUSTIBLE = 410.0
DESCANSO_MIN = 412
# keybinds.json del cliente, en memoria: get_keybinds y set_keybinds.
TECLAS = {"toggle_hazards": "f", "toggle_engine": "e", "cycle_camera": None}
# Lo prende --viejo: la app avisa que hay una version nueva.
VERSION_CLIENTE = None
# Lo prende --plan-relay.
PLAN_RELAY = None

with open(os.path.join(RAIZ, "docs", "app", "demo-route-ats.json"), encoding="utf-8") as f:
    RUTA = json.load(f)["path"]


class Camion:
    def __init__(self):
        self.tramo = 0
        self.en_tramo = 0.0
        self.inicio = time.time()
        self.tick = 0
        self.nivel = COMBUSTIBLE

    def avanzar(self):
        queda = VELOCIDAD_RUTA / HZ
        while queda > 0:
            if self.tramo >= len(RUTA) - 1:
                self.tramo, self.en_tramo = 0, 0.0
            a, b = RUTA[self.tramo], RUTA[self.tramo + 1]
            largo = math.hypot(b[0] - a[0], b[1] - a[1])
            libre = largo - self.en_tramo
            if queda < libre:
                self.en_tramo += queda
                queda = 0
            else:
                queda -= libre
                self.tramo += 1
                self.en_tramo = 0.0
        self.tick += 1
        self.nivel = max(40.0, self.nivel - 0.02)

    def mensaje(self):
        a, b = RUTA[self.tramo], RUTA[min(self.tramo + 1, len(RUTA) - 1)]
        largo = math.hypot(b[0] - a[0], b[1] - a[1]) or 1.0
        t = self.en_tramo / largo
        x = a[0] + (b[0] - a[0]) * t
        z = a[1] + (b[1] - a[1]) * t
        # Brujula sobre la grilla: 0 = -z, 90 = +x, y el SDK lo da antihorario en <0,1).
        rumbo = math.degrees(math.atan2(b[0] - a[0], -(b[1] - a[1]))) % 360
        kmh = VELOCIDAD_KMH + math.sin(self.tick / 28) * 8
        faltan = sum(
            math.hypot(RUTA[i + 1][0] - RUTA[i][0], RUTA[i + 1][1] - RUTA[i][1])
            for i in range(self.tramo, len(RUTA) - 1)
        ) * 20
        crudo = {
            "game": 2, "paused": False, "coordinateX": x, "coordinateY": 20.0, "coordinateZ": z,
            "rotationX": (1 - rumbo / 360) % 1, "speed": kmh / 3.6, "speedLimit": 105 / 3.6,
            "cargo": "Bulldozer", "cargoMass": 18189.0, "citySrc": "Salt Lake City", "cityDst": "Las Vegas",
            "compSrc": "Coastline Mining", "compDst": "Bitumen", "compSrcId": "cm_min_svc", "compDstId": "bit_rd_svc",
            "citySrcId": "salt_lake", "cityDstId": "las_vegas", "jobMarket": "cargo_market",
            "onJob": True, "isCargoLoaded": True, "engineRpm": 1400 + math.sin(self.tick / 9) * 150, "engineRpmMax": 2500.0,
            "gearDashboard": 11, "routeDistance": faltan, "routeTime": faltan / 25, "restStop": DESCANSO_MIN,
            "time_abs": 4200 + self.tick // 2, "time_abs_delivery": 5600, "truckBrand": "Volvo", "truckName": "VNL",
            "truckBrandId": "volvo", "truckOdometer": 184220.0 + self.tick / 40, "fuel": self.nivel, "fuelCapacity": 600.0,
            "fuelRange": self.nivel * 3, "wearEngine": 0.04, "wearTransmission": 0.02, "wearCabin": 0.13, "wearChassis": 0.06,
            "wearWheels": 0.29, "jobIncome": 61158, "fuelAvgConsumption": 0.33, "cruiseControl": True,
            "cruiseControlSpeed": 88 / 3.6, "lightsBeamLow": True, "lightsBeamHigh": False, "lightsHazards": False,
            "lightsBeacon": False, "blinkerLeftOn": self.tick % 40 < 10, "blinkerRightOn": False, "lightsParking": True,
            "wipers": False, "engineEnabled": True, "parkBrake": False, "differentialLock": False,
            "liftAxleIndicator": False, "motorBrake": False, "retarderBrake": 0, "retarderStepCount": 4,
            "trailer": [{"attached": True}], "airPressureWarning": False, "fuelWarning": False,
        }
        return json.dumps(cliente.build_payload(crudo))


def relay_del_plan(base):
    """Lo que el cliente pasa por LAN: el relay y un codigo, para el plan y la voz."""
    pedido = urllib.request.Request(base.rstrip("/") + "/pair/new", data=b"", method="POST")
    with urllib.request.urlopen(pedido, timeout=10) as r:
        codigo = json.loads(r.read())["code"]
    print("CODIGO:", codigo, flush=True)
    # Del emulador, la PC es 10.0.2.2.
    backend = base.rstrip("/").replace("http://", "ws://").replace("127.0.0.1", "10.0.2.2")
    return {"backend": backend, "code": codigo}


def estado_cliente():
    return {
        "type": "client_status", "status": "live", "game": "ats", "clientVersion": VERSION_CLIENTE or cliente.CLIENT_VERSION,
        "detail": None, "mapMods": {"ats": {}, "ets2": None}, "activeMods": {}, "mapDlcs": {}, "localMaps": {},
        "localMapPort": None, "overlay": CON_OVERLAY,
    }


def contestar(texto):
    """Lo que la app le manda a la PC. Los comandos dan error a proposito cada tanto."""
    try:
        d = json.loads(texto)
    except ValueError:
        return None
    print("<- app:", texto[:200], flush=True)
    if d.get("type") == "command" and d.get("action") == "cycle_camera":
        return json.dumps({"type": "command_result", "action": d.get("action"), "ok": False, "reason": "no_key"})
    if d.get("type") == "set_live_share":
        return json.dumps({"type": "live_share_state", "enabled": bool(d.get("enabled"))})
    if d.get("type") == "get_keybinds":
        return json.dumps({"type": "keybinds", "data": TECLAS})
    if d.get("type") == "set_keybinds":
        TECLAS.update(d.get("data") or {})
        return json.dumps({"type": "keybinds", "data": TECLAS})
    return None


async def lan():
    async def atender(ws):
        print("app conectada por LAN", flush=True)
        await ws.send(json.dumps({
            "type": "session_state", "client_connected": True, "client_status": estado_cliente(), "liveShare": False,
            **({"planRelay": PLAN_RELAY} if PLAN_RELAY else {}),
        }))

        async def escuchar():
            async for texto in ws:
                r = contestar(texto)
                if r:
                    await ws.send(r)

        tarea = asyncio.create_task(escuchar())
        camion = Camion()
        try:
            while True:
                camion.avanzar()
                await ws.send(camion.mensaje())
                await asyncio.sleep(1 / HZ)
        except websockets.ConnectionClosed:
            print("app desconectada", flush=True)
        finally:
            tarea.cancel()

    async with websockets.serve(atender, "0.0.0.0", PUERTO_LAN):
        print(f"PC falsa por LAN en el puerto {PUERTO_LAN}", flush=True)
        await asyncio.Future()


async def relay(base, codigo=None):
    if "railway.app" in base or "trucksim-dash" in base:
        sys.exit("Esto es para un relay local: contra produccion contaria como una sesion real.")
    if not codigo:
        pedido = urllib.request.Request(base.rstrip("/") + "/pair/new", data=b"", method="POST")
        with urllib.request.urlopen(pedido, timeout=10) as r:
            codigo = json.loads(r.read())["code"]
    print("CODIGO:", codigo, flush=True)
    url = base.rstrip("/").replace("https://", "wss://").replace("http://", "ws://") + f"/ws/client/{codigo}"
    async with websockets.connect(url) as ws:
        await ws.send(json.dumps(estado_cliente()))

        async def escuchar():
            async for texto in ws:
                r = contestar(texto)
                if r and json.loads(r)["type"] in ("command_result", "keybinds"):
                    await ws.send(r)

        tarea = asyncio.create_task(escuchar())
        camion = Camion()
        try:
            while True:
                camion.avanzar()
                await ws.send(camion.mensaje())
                await asyncio.sleep(1 / HZ)
        finally:
            tarea.cancel()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    modo = ap.add_mutually_exclusive_group(required=True)
    modo.add_argument("--lan", action="store_true")
    modo.add_argument("--relay", metavar="URL")
    ap.add_argument("--codigo", help="volver a una sesion que ya existe: como un cliente que reconecta")
    ap.add_argument("--plan-relay", metavar="URL", help="por LAN, un relay LOCAL para el plan y la voz")
    ap.add_argument("--viejo", action="store_true")
    ap.add_argument("--overlay", action="store_true")
    ap.add_argument("--poco", action="store_true")
    args = ap.parse_args()
    # Redirigido a un archivo en Windows es cp1252: una flecha de nav_hud tiraba la tarea
    # que lee, sin avisar, y a los 40 s se cortaba la conexion por falta de pong.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    global CON_OVERLAY, COMBUSTIBLE, DESCANSO_MIN, PLAN_RELAY, VERSION_CLIENTE
    if args.viejo:
        VERSION_CLIENTE = "0.9.0"
    if args.plan_relay:
        PLAN_RELAY = relay_del_plan(args.plan_relay)
    CON_OVERLAY = args.overlay
    if args.poco:
        COMBUSTIBLE, DESCANSO_MIN = 50.0, 40
    asyncio.run(lan() if args.lan else relay(args.relay, args.codigo))


if __name__ == "__main__":
    main()

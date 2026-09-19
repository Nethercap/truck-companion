"""Camiones simulados para probar el modo convoy sin amigos ni segundo juego.

Cada camion falso pide un codigo de pairing, se conecta al backend como si
fuera el cliente TruckDash y manda telemetria a 4 Hz avanzando por la I-15
al sur de Salt Lake City (ATS). Con los codigos que imprime abris la web
(/app/?code=XXXXXXXX) en otra pestana o celular y ese "camion" se une al
convoy con otro apodo.

Uso:
  python tools/convoy_fake_drivers.py                  # 2 camiones contra produccion
  python tools/convoy_fake_drivers.py --drivers 3
  python tools/convoy_fake_drivers.py --backend http://127.0.0.1:8000   # backend local

Requiere: pip install websockets. Cada camion cuenta como una sesion en las
estadisticas del backend (son pocas, no importa), y se ve en "otros
jugadores cerca" solo si esa pestana lo activa.
"""
import argparse
import asyncio
import json
import math
import time
import urllib.request

import websockets

# Tramo de I-15 al sur de Salt Lake City, en coordenadas crudas del juego.
PATH = [(-68324, -17436), (-68078, -15219), (-67407, -15097), (-67300, -14000), (-67200, -12500), (-67100, -11000), (-67050, -9500)]
CARGOS = ["Bulldozer", "Beans", "Lumber", "Frozen Fish", "Excavator"]
TRUCKS = [("Kenworth", "W900"), ("Peterbilt", "579"), ("Volvo", "VNL"), ("Freightliner", "Cascadia"), ("Mack", "Anthem")]


def pair(backend: str) -> str:
    req = urllib.request.Request(f"{backend}/pair/new", method="POST", data=b"{}", headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=10))["code"]


def point_at(dist: float):
    total = sum(math.hypot(PATH[i + 1][0] - PATH[i][0], PATH[i + 1][1] - PATH[i][1]) for i in range(len(PATH) - 1))
    d = dist % total
    for i in range(len(PATH) - 1):
        seg = math.hypot(PATH[i + 1][0] - PATH[i][0], PATH[i + 1][1] - PATH[i][1])
        if d <= seg:
            f = d / seg
            return PATH[i][0] + (PATH[i + 1][0] - PATH[i][0]) * f, PATH[i][1] + (PATH[i + 1][1] - PATH[i][1]) * f
        d -= seg
    return PATH[-1]


async def drive(backend: str, code: str, idx: int):
    ws_url = backend.replace("https://", "wss://").replace("http://", "ws://") + f"/ws/client/{code}"
    offset = idx * 700.0            # metros crudos de separacion entre camiones
    speed = 22.0 - idx * 0.8        # m/s
    cargo = CARGOS[idx % len(CARGOS)]
    brand, name = TRUCKS[idx % len(TRUCKS)]
    while True:
        try:
            async with websockets.connect(ws_url) as ws:
                await ws.send(json.dumps({"type": "client_status", "status": "live", "game": "ats", "clientVersion": "1.5.3"}))
                t0 = time.time()
                while True:
                    x, z = point_at(offset + (time.time() - t0) * speed)
                    payload = {
                        "game": "ats", "paused": False, "position": {"x": x, "y": 0, "z": z}, "speedKmh": round(speed * 3.6, 1),
                        "cargo": cargo, "cargoMassKg": 12000 + idx * 3000, "citySrc": "Salt Lake City", "cityDst": "Las Vegas",
                        "routeTimeSeconds": 5400 - idx * 300, "routeDistanceKm": 120.0 - idx * 5, "fuel": 400 - idx * 60, "fuelCapacity": 800,
                        "restStopMinutes": 300, "truckBrand": brand, "truckName": name, "jobIncome": 12345 + idx * 1000,
                        "gameTimeMinutes": 1000 + (time.time() - t0) / 3, "event": {}, "lights": {}, "clientVersion": "1.5.3",
                    }
                    await ws.send(json.dumps(payload))
                    await asyncio.sleep(0.25)
        except Exception as exc:
            print(f"[{code}] desconectado ({exc}), reintento en 3 s", flush=True)
            await asyncio.sleep(3)


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--backend", default="https://truck-companion-production.up.railway.app")
    ap.add_argument("--drivers", type=int, default=2)
    args = ap.parse_args()
    codes = [pair(args.backend) for _ in range(args.drivers)]
    print("Camiones simulados listos. Abri cada uno en una pestana distinta:")
    for i, c in enumerate(codes):
        base = "https://trucksim-dash.com/app/" if "railway" in args.backend else "http://localhost:8804/app/"
        extra = "" if "railway" in args.backend else f"&backend={args.backend.replace('http://', 'ws://')}"
        print(f"  camion {i + 1}: {base}?code={c}{extra}")
    print("Ctrl+C para cerrarlos.", flush=True)
    await asyncio.gather(*(drive(args.backend, c, i) for i, c in enumerate(codes)))


if __name__ == "__main__":
    asyncio.run(main())

"""
Cliente local del companion de ETS2/ATS.

Lee la telemetria del juego (via truck_telemetry) y la manda por WebSocket
al backend, que la reenvia a la web conectada con el mismo codigo de pairing.

Uso:
  python client.py                          # local, contra backend en localhost:8123
  python client.py --backend wss://tu-backend.up.railway.app

Al arrancar, si no se paso --code, pide uno nuevo al backend (POST /pair/new)
y lo muestra en consola para que el usuario lo tipee en la web.
"""

import argparse
import asyncio
import json
import sys
import time

import truck_telemetry
import websockets
from urllib.request import urlopen, Request

SEND_INTERVAL_SECONDS = 1.0
RECONNECT_DELAY_SECONDS = 3.0


def http_base_url(ws_url: str) -> str:
    return ws_url.replace("wss://", "https://").replace("ws://", "http://")


def request_pairing_code(backend_ws_url: str) -> str:
    url = http_base_url(backend_ws_url) + "/pair/new"
    req = Request(url, method="POST")
    with urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read())
    return data["code"]


def build_payload(raw: dict) -> dict:
    speed_kmh = (raw.get("speed") or 0) * 3.6
    # el SDK devuelve speedLimit en m/s igual que speed, hay que convertirlo
    # tambien - antes se mandaba crudo y quedaba ~3.6x mas bajo de lo real.
    speed_limit_kmh = (raw.get("speedLimit") or 0) * 3.6
    return {
        "ts": time.time(),
        "paused": raw.get("paused"),
        "game": {0: None, 1: "ets2", 2: "ats"}.get(raw.get("game")),
        "position": {
            "x": raw.get("coordinateX"),
            "y": raw.get("coordinateY"),
            "z": raw.get("coordinateZ"),
        },
        "speedKmh": round(speed_kmh, 1),
        "speedLimitKmh": round(speed_limit_kmh, 1),
        "cargo": raw.get("cargo") or None,
        "cargoMassKg": raw.get("cargoMass"),
        "citySrc": raw.get("citySrc") or None,
        "companySrc": raw.get("companySrc") or None,
        "cityDst": raw.get("cityDst") or None,
        "companyDst": raw.get("companyDst") or None,
        "routeDistanceKm": (raw.get("routeDistance") or 0) / 1000,
        "routeTimeSeconds": raw.get("routeTime"),
        "restStopSeconds": raw.get("restStop"),
        "truckBrand": raw.get("truckBrand") or None,
        "truckName": raw.get("truckName") or None,
        "odometerKm": raw.get("truckOdometer"),
        "fuel": raw.get("fuel"),
        "fuelCapacity": raw.get("fuelCapacity"),
        "fuelRangeKm": raw.get("fuelRange"),
        "wear": {
            "engine": raw.get("wearEngine"),
            "transmission": raw.get("wearTransmission"),
            "cabin": raw.get("wearCabin"),
            "chassis": raw.get("wearChassis"),
            "wheels": raw.get("wearWheels"),
        },
        "jobIncome": raw.get("jobIncome"),
        "fuelAvgConsumption": raw.get("fuelAvgConsumption"),
        "cruiseControl": raw.get("cruiseControl"),
        "cruiseControlSpeedKmh": (raw.get("cruiseControlSpeed") or 0) * 3.6,
        "lights": {
            "beamLow": raw.get("lightsBeamLow"),
            "beamHigh": raw.get("lightsBeamHigh"),
            "hazards": raw.get("lightsHazards"),
            "beacon": raw.get("lightsBeacon"),
            "blinkerLeft": raw.get("blinkerLeftOn"),
            "blinkerRight": raw.get("blinkerRightOn"),
        },
        "wipers": raw.get("wipers"),
        # el SDK no tiene alerta dedicada de temperatura de aceite, solo de
        # presion de aire/agua/bateria - la de aceite se infiere en la web
        # con un umbral simple sobre oilTemperature.
        "mechanicalWarnings": {
            "airPressure": raw.get("airPressureWarning"),
            "waterTemperature": raw.get("waterTemperatureWarning"),
            "batteryVoltage": raw.get("batteryVoltageWarning"),
        },
        "airPressure": raw.get("airPressure"),
        "waterTemperature": raw.get("waterTemperature"),
        "oilTemperature": raw.get("oilTemperature"),
        "batteryVoltage": raw.get("batteryVoltage"),
        "event": {
            "tollgate": raw.get("tollgate"),
            "tollgatePayAmount": raw.get("tollgatePayAmount"),
            "fined": raw.get("fined"),
            "fineAmount": raw.get("fineAmount"),
            "ferry": raw.get("ferry"),
            "ferryPayAmount": raw.get("ferryPayAmount"),
            "train": raw.get("train"),
            "trainPayAmount": raw.get("trainPayAmount"),
        },
    }


async def run(backend_ws_url: str, code: str):
    truck_telemetry.init()
    print("Conectado al SDK de telemetria del juego.")

    url = f"{backend_ws_url}/ws/client/{code}"
    while True:
        try:
            async with websockets.connect(url) as ws:
                print(f"Conectado al backend. Codigo de pairing: {code}")
                while True:
                    raw = truck_telemetry.get_data()
                    # sdkActive en False significa que el SDK todavia no
                    # sincronizo el primer frame real del juego (justo
                    # despues de init() puede devolver datos viejos/en cero,
                    # lo que se veia como el camion en una posicion rara
                    # hasta arrancar a manejar). Se descarta ese frame.
                    if raw.get("sdkActive"):
                        payload = build_payload(raw)
                        await ws.send(json.dumps(payload))
                    await asyncio.sleep(SEND_INTERVAL_SECONDS)
        except (websockets.ConnectionClosed, OSError) as exc:
            print(f"Conexion perdida ({exc}). Reintentando en {RECONNECT_DELAY_SECONDS}s...")
            await asyncio.sleep(RECONNECT_DELAY_SECONDS)
        except Exception as exc:
            print(f"Error leyendo telemetria (juego cerrado?): {exc}")
            await asyncio.sleep(RECONNECT_DELAY_SECONDS)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", default="wss://truck-companion-production.up.railway.app", help="URL base del backend (ws:// o wss://)")
    parser.add_argument("--code", default=None, help="Codigo de pairing existente (si no se pasa, se pide uno nuevo)")
    args = parser.parse_args()

    code = args.code
    if code is None:
        try:
            code = request_pairing_code(args.backend)
        except Exception as exc:
            print(f"No se pudo obtener codigo de pairing del backend ({args.backend}): {exc}")
            sys.exit(1)
        print(f"\n>>> Codigo de pairing: {code}  (ingresalo en la web) <<<\n")

    asyncio.run(run(args.backend, code))


if __name__ == "__main__":
    main()

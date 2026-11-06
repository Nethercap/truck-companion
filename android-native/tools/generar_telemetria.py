# Un mensaje de telemetria de verdad, armado con build_payload del cliente, para
# el test de contrato de la app nativa (TelemetriaTest). Si el cliente renombra un
# campo, este archivo cambia y el test de Kotlin avisa.
#
#   python android-native/tools/generar_telemetria.py          reescribe
#   python android-native/tools/generar_telemetria.py --check  falla si no coincide
import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(RAIZ, "client"))

import client as cliente  # noqa: E402

SALIDA = os.path.join(RAIZ, "android-native", "app", "src", "test", "resources", "telemetria-cliente.json")

CRUDO = {
    "game": 2, "paused": False, "coordinateX": -48320.5, "coordinateY": 20.0, "coordinateZ": -6177.25,
    "rotationX": 0.25, "speed": 25.0, "speedLimit": 27.5, "cargo": "Madera", "cargoMass": 18000.0,
    "citySrc": "Denver", "cityDst": "Salt Lake City", "compSrc": "Wal", "compDst": "Sell", "compSrcId": "wal_mkt",
    "onJob": True, "isCargoLoaded": True, "engineRpm": 1450.0, "engineRpmMax": 2500.0, "gearDashboard": 9,
    "routeDistance": 150000.0, "routeTime": 7200.0, "restStop": 300, "time_abs": 10000, "time_abs_delivery": 10600,
    "truckBrand": "Kenworth", "truckName": "T680", "truckOdometer": 123456.0, "fuel": 400.0, "fuelCapacity": 800.0,
    "fuelRange": 1200.0, "wearEngine": 0.05, "wearTransmission": 0.02, "wearCabin": 0.01, "wearChassis": 0.03,
    "wearWheels": 0.04, "jobIncome": 15000, "fuelAvgConsumption": 0.35, "cruiseControl": True, "cruiseControlSpeed": 25.0,
    "lightsBeamLow": True, "lightsBeamHigh": False, "lightsHazards": False, "lightsBeacon": True,
    "blinkerLeftOn": True, "blinkerRightOn": False, "lightsParking": True, "wipers": True, "engineEnabled": True,
    "parkBrake": False, "differentialLock": False, "liftAxleIndicator": True, "motorBrake": True, "retarderBrake": 2,
    "retarderStepCount": 4, "trailer": [{"attached": True}], "airPressureWarning": True, "fuelWarning": False,
    "fined": True, "fineAmount": 500,
}

payload = cliente.build_payload(CRUDO)
# ts cambia en cada corrida y a la app no le importa.
payload.pop("ts", None)
payload.pop("clientVersion", None)
texto = json.dumps(payload, indent=1, sort_keys=True, ensure_ascii=False) + "\n"

if "--check" in sys.argv:
    actual = open(SALIDA, encoding="utf-8").read() if os.path.exists(SALIDA) else ""
    if actual != texto:
        print("El mensaje del cliente cambio: correr android-native/tools/generar_telemetria.py y revisar parsearTelemetria.")
        sys.exit(1)
    print("Contrato de telemetria al dia.")
else:
    with open(SALIDA, "w", encoding="utf-8", newline="\n") as f:
        f.write(texto)
    print(SALIDA)

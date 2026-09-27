"""
Paso 1 del plan: probar truck_telemetry contra el juego corriendo (ETS2 o ATS)
y loguear a consola los campos relevantes para confirmar que el SDK realmente
los expone antes de construir el resto del pipeline (backend + web).

Requiere:
  - ETS2 o ATS instalado y CORRIENDO.
  - Plugin de telemetria (scs-telemetry.dll de RenCloud/scs-sdk-plugin,
    https://github.com/RenCloud/scs-sdk-plugin) copiado a la carpeta de
    INSTALACION del juego (no Documentos), dentro de bin\\win_x64\\plugins\\
    Ej: .../Euro Truck Simulator 2/bin/win_x64/plugins/scs-telemetry.dll
  - pip install -r requirements.txt

Uso:
  python probe_telemetry.py
"""

import time

import truck_telemetry


def format_job(data: dict) -> str:
    origen = f"{data.get('citySrc', '?')} ({data.get('companySrc', '?')})"
    destino = f"{data.get('cityDst', '?')} ({data.get('companyDst', '?')})"
    return f"{origen} -> {destino}"


def main():
    print("Conectando a la shared memory del SDK de telemetria...")
    truck_telemetry.init()
    print("Conectado. Si no ves datos cambiar, fijate que el juego este con un viaje activo.\n")

    last_paused = None
    while True:
        try:
            data = truck_telemetry.get_data()
        except Exception as exc:
            print(f"Error leyendo telemetria (juego cerrado?): {exc}")
            time.sleep(2)
            continue

        paused = data.get("paused")
        if paused != last_paused:
            print(f"[estado] paused={paused}")
            last_paused = paused

        speed_kmh = data.get("speed", 0) * 3.6 if data.get("speed") is not None else None
        speed_limit = data.get("speedLimit")

        print(
            "pos=({x:.1f},{y:.1f},{z:.1f}) "
            "vel={speed} km/h limite={limit} "
            "cargo={cargo!r} peso={mass} kg "
            "job=[{job}] "
            "distRestante={dist:.1f} km tiempoRestante={rt:.0f} s".format(
                x=data.get("coordinateX", 0.0),
                y=data.get("coordinateY", 0.0),
                z=data.get("coordinateZ", 0.0),
                speed=f"{speed_kmh:.0f}" if speed_kmh is not None else "?",
                limit=speed_limit,
                cargo=data.get("cargo"),
                mass=data.get("cargoMass"),
                job=format_job(data),
                dist=data.get("routeDistance", 0.0) / 1000,
                rt=data.get("routeTime", 0.0),
            )
        )

        # Campos nuevos del panel. Se imprimen con la unidad que asumimos al
        # reenviarlos (psi para las presiones, Celsius para las
        # temperaturas, litros para el AdBlue): eso viene del encabezado del
        # plugin, no de haberlo visto. Si aca sale 9.6 donde esperamos 139,
        # el plugin da bar y el panel estaria mostrando un numero
        # equivocado con toda confianza.
        remolques = [t for t in (data.get("trailer") or []) if t.get("attached")]
        print(
            "    aceite={oilp} psi aire={airp} psi frenos={brakes} C "
            "adblue={adblue} l de {adbluemax} retarder={ret}/{rets} "
            "frenoMotor={mb} luces(pos/freno/atras)={lp}/{lb}/{lr} "
            "remolque={rem} danoCarga={dano}".format(
                oilp=data.get("oilPressure"),
                airp=data.get("airPressure"),
                brakes=data.get("brakeTemperature"),
                adblue=data.get("adblue"),
                adbluemax=data.get("adblueCapacity"),
                ret=data.get("retarderBrake"),
                rets=data.get("retarderStepCount"),
                mb=data.get("motorBrake"),
                lp=data.get("lightsParking"),
                lb=data.get("lightsBrake"),
                lr=data.get("lightsReverse"),
                rem=[(t.get("wearChassis"), t.get("wearWheels"), t.get("wearBody")) for t in remolques],
                dano=[t.get("cargoDamage") for t in remolques],
            )
        )

        time.sleep(1)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Mira si el plugin de Truck Dash publica la telemetria del juego nativo de
Linux. Es para quien prueba el paquete (issue #7): sin dependencias, solo la
biblioteca estandar de Python 3, y lo que imprime va en ingles.

Uso, con el juego abierto y manejando:

    python3 check-telemetry.py

Lee /dev/shm/TruckDashTelemetry (SCS_PLUGIN_MMF_NAME en plugin/) dos veces,
con dos segundos de diferencia, y dice si el juego lo esta llenando. Despues
suma lo que hace falta para un reporte: la distro, la glibc y las lineas del
game.log.txt que hablan de plugins.

Las posiciones de cada dato son las del bloque de la revision 12
(scsTelemetryMap_t en plugin/scs-telemetry/inc/scs-telemetry-common.hpp).
tools/probar_plugin_linux.py las compara con el lector del cliente
(client/telemetry_compat.py, que usa truck_telemetry), asi que si cambia el
bloque falla ese probador y no este script en la PC de alguien.
"""

import glob
import os
import platform
import struct
import sys
import time

BLOQUE = "/dev/shm/TruckDashTelemetry"
# El del plugin de RenCloud y otras apps, por si hay otro plugin instalado.
OTRO_BLOQUE = "/dev/shm/SCSTelemetry"
TAMANO = 32 * 1024
REVISION = 12

# (nombre, formato de struct, posicion)
CAMPOS = (
    ("sdkActive", "?", 0),
    ("paused", "?", 4),
    ("time", "Q", 8),
    ("renderTime", "Q", 24),
    ("telemetry_plugin_revision", "I", 40),
    ("version_major", "I", 44),
    ("version_minor", "I", 48),
    ("game", "I", 52),
    ("time_abs", "I", 64),
    ("speed", "f", 948),
    ("coordinateX", "d", 2200),
    ("coordinateY", "d", 2208),
    ("coordinateZ", "d", 2216),
)
TEXTOS = (
    ("truckBrand", 2364),
    ("truckName", 2492),
)
LARGO_TEXTO = 64
JUEGOS = {1: "Euro Truck Simulator 2", 2: "American Truck Simulator"}


def leer(ruta=BLOQUE):
    """Los datos del bloque en un dict, o None si no existe."""
    try:
        with open(ruta, "rb") as f:
            datos = f.read(TAMANO)
    except FileNotFoundError:
        return None
    if len(datos) < TAMANO:
        raise SystemExit(f"{ruta} is {len(datos)} bytes, expected {TAMANO}.")
    salida = {}
    for nombre, formato, posicion in CAMPOS:
        salida[nombre] = struct.unpack_from("<" + formato, datos, posicion)[0]
    for nombre, posicion in TEXTOS:
        crudo = datos[posicion:posicion + LARGO_TEXTO].split(b"\0", 1)[0]
        salida[nombre] = crudo.decode("utf-8", "replace")
    return salida


def _glibc():
    try:
        return os.confstr("CS_GNU_LIBC_VERSION") or "?"
    except (ValueError, OSError):
        return "?"


def _distro():
    try:
        with open("/etc/os-release", encoding="utf-8") as f:
            for linea in f:
                if linea.startswith("PRETTY_NAME="):
                    return linea.split("=", 1)[1].strip().strip('"')
    except OSError:
        pass
    return platform.platform()


def _lineas_de_plugins():
    """Las lineas del game.log.txt de cada juego que hablan de plugins o del
    SDK, de la ultima vez que se abrio."""
    base = os.path.expanduser("~/.local/share")
    salida = []
    for juego in ("Euro Truck Simulator 2", "American Truck Simulator"):
        for ruta in sorted(glob.glob(os.path.join(base, juego, "game.log.txt"))):
            try:
                with open(ruta, encoding="utf-8", errors="replace") as f:
                    lineas = [l.rstrip() for l in f
                              if "plugin" in l.lower() or "[sdk]" in l.lower()
                              or "truckdash" in l.lower()]
            except OSError:
                continue
            cuando = time.strftime("%Y-%m-%d %H:%M", time.localtime(os.path.getmtime(ruta)))
            salida.append(f"{ruta} (last written {cuando}):")
            if lineas:
                salida.extend("    " + l for l in lineas[-20:])
            else:
                salida.append("    (no plugin lines)")
    return salida


def _mostrar(d):
    juego = JUEGOS.get(d["game"], f"unknown ({d['game']})")
    print(f"  game: {juego}, SDK {d['version_major']}.{d['version_minor']}")
    print(f"  plugin revision: {d['telemetry_plugin_revision']}"
          + ("" if d["telemetry_plugin_revision"] == REVISION else f" (expected {REVISION})"))
    print(f"  sdkActive: {d['sdkActive']}, paused: {d['paused']}")
    print(f"  truck: {d['truckBrand'] or '-'} {d['truckName']}".rstrip())
    print(f"  speed: {d['speed'] * 3.6:.1f} km/h")
    print(f"  position: x {d['coordinateX']:.1f}, y {d['coordinateY']:.1f}, z {d['coordinateZ']:.1f}")


def main():
    ruta = sys.argv[1] if len(sys.argv) > 1 else BLOQUE
    print("Truck Dash native Linux telemetry check")
    print(f"  system: {_distro()}, {_glibc()}, {platform.machine()}")
    print()

    primero = leer(ruta)
    if primero is None:
        print(f"RESULT: {ruta} does not exist.")
        print("  The plugin has not been loaded. Is the game running, and is it the native")
        print("  build (not Proton)? The game log lines below say whether it found the plugin.")
        if os.path.exists(OTRO_BLOQUE):
            print(f"  Note: {OTRO_BLOQUE} exists, so another telemetry plugin is loaded.")
    else:
        time.sleep(2)
        segundo = leer(ruta) or primero
        print(f"Block {ruta}:")
        _mostrar(segundo)
        print()
        avanza = segundo["renderTime"] != primero["renderTime"]
        if not segundo["sdkActive"]:
            print("RESULT: the plugin was loaded, but the game has closed it (sdkActive is off).")
            print("  Is the game still running?")
        elif not avanza:
            print("RESULT: the plugin is loaded, but no new frames arrived in 2 seconds.")
            print("  Get into a truck and drive (the game sends nothing in the main menu),")
            print("  then run this again.")
        else:
            print("RESULT: OK, the game is sending telemetry through the Truck Dash plugin.")
            if segundo["paused"]:
                print("  (The game is paused right now: unpause and drive to see the speed change.)")

    print()
    print("Game log:")
    lineas = _lineas_de_plugins()
    for linea in lineas or ["  no game.log.txt found under ~/.local/share"]:
        print(linea)


if __name__ == "__main__":
    main()

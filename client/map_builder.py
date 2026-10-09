"""
"Build my map": arma en esta PC el mapa del juego con los mods activos, para
mapas que no estan en los servidores de Truck Dash (un mod de Sudamerica,
Alaska, una combinacion que no publicamos).

Usa el armador (builder/ del repo, GPL): parser, generator y tiles de
truckermudgeon/maps con nuestros parches, empaquetados con node.exe. Se baja
aparte la primera vez, de la misma release del cliente, y se verifica contra
SHA256SUMS. El grafo de rutas, las ciudades, los nombres de ruta y los POIs
salen de mapbuild/, el mismo codigo que arma las variantes de R2.

El resultado queda en %LOCALAPPDATA%\\TruckDash\\maps\\<juego>-<huella>\\ con
los nombres de archivo que la web espera de una variante ("local_ats",
"local_ets2"), y el servidor local lo sirve en /localmap/. Solo se usa si la
huella coincide con los mods activos ahora: cambiar de mods lo deja de lado.

Pide el juego cerrado (el parser llega a ~6-7 GB de memoria) y corre con
prioridad baja.
"""

import hashlib
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import zipfile

import red

# Sube cuando cambia lo que se arma (formato, archivos): un mapa armado con
# otro formato no se usa y se ofrece armarlo de nuevo.
MAP_FORMAT = 1
NODE_MEMORY_MB = 8192
# Memoria libre por debajo de la cual se avisa antes de arrancar (el parser
# llega a ~7 GB con mapas grandes).
MIN_FREE_GB = 7.0
BUILDER_ZIP = "TruckDash-MapBuilder-{version}.zip"
RELEASE_URL = "https://github.com/Nethercap/truck-companion/releases/download/v{version}/{name}"

PREFIX = {"ats": "usa", "ets2": "europe"}
LAYER = {"ats": "ats", "ets2": "ets2"}

_MODS_HEADER_RE = re.compile(r"\[mods\] Active (\d+) mods")
_MOUNT_RE = re.compile(r"\[fs\] device (?P<path>.+?) mounted to mod pool\.")


# ---------------------------------------------------------------- mods activos


def mounted_mod_paths(log_text: str) -> list | None:
    """Rutas de los mods del ULTIMO perfil cargado, en el orden en que el juego
    los monta (el ultimo pisa a los anteriores, igual que en el parser), o
    None si el log no tiene lista de mods. El juego escribe la ruta completa:
    no hace falta buscar en Workshop ni en la carpeta mod."""
    ultimo = None
    for m in _MODS_HEADER_RE.finditer(log_text):
        ultimo = m
    if ultimo is None:
        return None
    rutas = []
    for m in _MOUNT_RE.finditer(log_text, ultimo.end()):
        ruta = os.path.normpath(m.group("path").strip())
        if ruta not in rutas:
            rutas.append(ruta)
    return rutas


def _huella_de(ruta: str) -> str:
    """Tamano y fecha de un mod: si se actualiza, cambia. Una carpeta (mod de
    Workshop sin empaquetar) se mira por sus archivos de primer nivel y los de
    def/ y map/, que es lo que cambia cuando cambia el mapa."""
    try:
        if os.path.isfile(ruta):
            st = os.stat(ruta)
            return f"{st.st_size}:{int(st.st_mtime)}"
        partes = []
        for sub in ("", "def", "map"):
            carpeta = os.path.join(ruta, sub)
            if not os.path.isdir(carpeta):
                continue
            for nombre in sorted(os.listdir(carpeta)):
                p = os.path.join(carpeta, nombre)
                if os.path.isfile(p):
                    st = os.stat(p)
                    partes.append(f"{sub}/{nombre}:{st.st_size}:{int(st.st_mtime)}")
        return "|".join(partes)
    except OSError:
        return "?"


def fingerprint(game: str, game_dir: str, mod_paths: list) -> str:
    """Huella de juego + version + mods (en orden). Doce hex alcanzan para
    distinguir las combinaciones de una misma PC."""
    h = hashlib.sha1()
    h.update(f"{MAP_FORMAT}|{game}|".encode())
    h.update(_huella_de(os.path.join(game_dir, "version.scs")).encode())
    for ruta in mod_paths:
        h.update(f"|{ruta.lower()}={_huella_de(ruta)}".encode())
    return h.hexdigest()[:12]


# ---------------------------------------------------------------- lugares


def data_dir() -> str:
    base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    return os.path.join(base, "TruckDash")


def maps_dir() -> str:
    return os.path.join(data_dir(), "maps")


def variant_id(game: str) -> str:
    return f"local_{game}"


def built_map(game: str, fp: str) -> dict | None:
    """El manifest del mapa armado para esa huella, o None si no esta (o
    quedo a medias: el manifest se escribe al final)."""
    path = os.path.join(maps_dir(), f"{game}-{fp}", "manifest.json")
    try:
        with open(path, encoding="utf-8") as f:
            man = json.load(f)
    except (OSError, ValueError):
        return None
    if man.get("format") != MAP_FORMAT or man.get("fingerprint") != fp:
        return None
    man["dir"] = os.path.dirname(path)
    return man


def prune_old_maps(game: str, keep: str, max_keep: int = 2):
    """Cada mapa armado pesa ~100 MB: se quedan los ultimos de cada juego."""
    try:
        nombres = [n for n in os.listdir(maps_dir()) if n.startswith(f"{game}-")]
    except OSError:
        return
    nombres.sort(key=lambda n: os.path.getmtime(os.path.join(maps_dir(), n)), reverse=True)
    for n in nombres[max_keep:]:
        if n != f"{game}-{keep}":
            shutil.rmtree(os.path.join(maps_dir(), n), ignore_errors=True)


# ---------------------------------------------------------------- chequeos


def free_memory_gb() -> float | None:
    if sys.platform != "win32":
        return None
    import ctypes

    class MEMORYSTATUSEX(ctypes.Structure):
        _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                    ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                    ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                    ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]

    st = MEMORYSTATUSEX()
    st.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
    if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(st)):
        return None
    return st.ullAvailPhys / 1024 ** 3


def game_running() -> bool:
    """Si alguno de los dos juegos esta abierto (por el nombre del proceso)."""
    if sys.platform != "win32":
        return False
    try:
        salida = subprocess.run(["tasklist", "/FO", "CSV", "/NH"], capture_output=True, text=True,
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0), timeout=15).stdout.lower()
    except Exception:
        return False
    return '"eurotrucks2.exe"' in salida or '"amtrucks.exe"' in salida


# ---------------------------------------------------------------- armador


class BuildCancelled(Exception):
    pass


def builder_dir(version: str) -> str:
    return os.path.join(data_dir(), "map-builder", version)


def _builder_ok(carpeta: str) -> bool:
    return all(os.path.isfile(os.path.join(carpeta, "bin", f)) for f in ("parser.mjs", "generator.mjs", "tiles.mjs"))


def ensure_builder(version: str, progress=lambda texto: None) -> str:
    """Carpeta del armador, bajandolo si hace falta. TRUCKDASH_MAP_BUILDER
    apunta a uno ya armado (desarrollo: builder/build.sh)."""
    propio = os.environ.get("TRUCKDASH_MAP_BUILDER")
    if propio:
        if not _builder_ok(propio):
            raise RuntimeError(f"TRUCKDASH_MAP_BUILDER={propio} is not a map builder folder")
        return propio
    destino = builder_dir(version)
    if _builder_ok(destino) and os.path.isfile(os.path.join(destino, "node.exe")):
        return destino
    nombre = BUILDER_ZIP.format(version=version)
    progress("download")
    with red.abrir(RELEASE_URL.format(version=version, name="SHA256SUMS.txt"), timeout=30) as resp:
        sumas = resp.read().decode("utf-8", "replace")
    esperado = None
    for linea in sumas.splitlines():
        partes = linea.split()
        if len(partes) == 2 and partes[1].lstrip("*") == nombre:
            esperado = partes[0].lower()
    if not esperado:
        raise RuntimeError(f"{nombre} is not in this release's SHA256SUMS.txt")
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    zip_path = destino + ".zip.part"
    h = hashlib.sha256()
    with red.abrir(RELEASE_URL.format(version=version, name=nombre), timeout=60) as resp, open(zip_path, "wb") as f:
        while True:
            bloque = resp.read(1 << 20)
            if not bloque:
                break
            h.update(bloque)
            f.write(bloque)
    if h.hexdigest() != esperado:
        os.remove(zip_path)
        raise RuntimeError("The map builder download did not match its checksum")
    tmp = destino + ".part"
    shutil.rmtree(tmp, ignore_errors=True)
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(tmp)
    os.remove(zip_path)
    # El zip trae una carpeta truckdash-map-builder/ adentro
    raiz = os.path.join(tmp, "truckdash-map-builder")
    shutil.rmtree(destino, ignore_errors=True)
    os.replace(raiz if os.path.isdir(raiz) else tmp, destino)
    shutil.rmtree(tmp, ignore_errors=True)
    if not _builder_ok(destino):
        raise RuntimeError("The map builder download is incomplete")
    return destino


def _node(builder: str) -> str:
    propio = os.path.join(builder, "node.exe")
    return propio if os.path.isfile(propio) else (shutil.which("node") or "node")


def _correr(cmd: list, log_path: str, cancel: threading.Event, env: dict):
    """Un paso del armador, con prioridad baja y sin ventana. Corta si se
    cancela. La salida va al log (el parser escribe mucho)."""
    flags = 0
    if sys.platform == "win32":
        flags = subprocess.BELOW_NORMAL_PRIORITY_CLASS | subprocess.CREATE_NO_WINDOW
    with open(log_path, "a", encoding="utf-8", errors="replace") as log:
        log.write(f"\n$ {' '.join(cmd)}\n")
        log.flush()
        proc = subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT, env=env, creationflags=flags)
        while proc.poll() is None:
            if cancel.is_set():
                proc.kill()
                proc.wait()
                raise BuildCancelled()
            time.sleep(0.5)
    if proc.returncode != 0:
        raise RuntimeError(f"{os.path.basename(cmd[1])} failed (exit {proc.returncode}), see {log_path}")


STEPS = ("download", "parser", "generator", "tiles", "graph", "finish")


def build_map(game: str, game_dir: str, mod_paths: list, client_version: str,
              progress=lambda paso: None, cancel: threading.Event | None = None,
              mod_names: list | None = None) -> dict:
    """Arma el mapa y devuelve su manifest. progress(paso) con un nombre de
    STEPS. Tira BuildCancelled si se cancela y RuntimeError si algo falla (el
    detalle queda en build.log de la carpeta a medias)."""
    from mapbuild import build_cities_json, build_route_graph, extract_road_names
    from mapbuild import pois as mapbuild_pois

    cancel = cancel or threading.Event()
    fp = fingerprint(game, game_dir, mod_paths)
    variante = variant_id(game)
    prefijo = PREFIX[game]
    final = os.path.join(maps_dir(), f"{game}-{fp}")
    tmp = final + ".part"
    shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(os.path.join(tmp, "parser"))
    os.makedirs(os.path.join(tmp, "vec"))
    os.makedirs(os.path.join(tmp, variante))
    os.makedirs(os.path.join(tmp, "vector"))
    log_path = os.path.join(tmp, "build.log")
    t0 = time.time()

    builder = ensure_builder(client_version, progress)
    node = _node(builder)
    env = dict(os.environ)
    env["NODE_OPTIONS"] = f"--max-old-space-size={NODE_MEMORY_MB}"
    env["TM_SECTORS_ONLY_MOD"] = "0"
    env["TM_NO_UK_HACK"] = "0"
    bin_ = os.path.join(builder, "bin")

    progress("parser")
    _correr([node, os.path.join(bin_, "parser.mjs"), game_dir, ",".join(mod_paths), os.path.join(tmp, "parser")],
            log_path, cancel, env)
    progress("generator")
    _correr([node, os.path.join(bin_, "generator.mjs"), "map", "-m", prefijo, "-i", os.path.join(tmp, "parser"),
             "-o", os.path.join(tmp, "vec"), "-t", "geojson"], log_path, cancel, env)
    progress("tiles")
    _correr([node, os.path.join(bin_, "tiles.mjs"), os.path.join(tmp, "vec", f"{LAYER[game]}.geojson"), LAYER[game],
             os.path.join(tmp, "vector", f"{variante}.pmtiles")], log_path, cancel, env)

    progress("graph")
    parser_dir = os.path.join(tmp, "parser")
    salida = os.path.join(tmp, variante)
    grafo_json = os.path.join(tmp, f"route-graph-{variante}.json")
    build_route_graph.main(["", parser_dir, prefijo, grafo_json])
    for sufijo in (".bin", "-v3.bin"):
        os.replace(grafo_json[:-5] + sufijo, os.path.join(salida, f"route-graph-{variante}{sufijo}"))
    if cancel.is_set():
        raise BuildCancelled()
    build_cities_json.main(["", os.path.join(parser_dir, f"{prefijo}-cities.json"), os.path.join(salida, "Cities.json")])
    extract_road_names.main(["", os.path.join(parser_dir, f"{prefijo}-signs.json"), os.path.join(salida, "road-names.json")])
    pois = mapbuild_pois.build(parser_dir, prefijo)
    if pois is not None:
        mapbuild_pois.write(pois, os.path.join(tmp, f"pois-{variante}.json"))

    progress("finish")
    # Lo intermedio pesa GB: solo se quedan los archivos que sirve la web
    with open(os.path.join(parser_dir, f"{prefijo}-cities.json"), encoding="utf-8") as f:
        ciudades = len(json.load(f))
    for sobra in ("parser", "vec"):
        shutil.rmtree(os.path.join(tmp, sobra), ignore_errors=True)
    for sobra in (grafo_json,):
        if os.path.exists(sobra):
            os.remove(sobra)
    manifest = {
        "format": MAP_FORMAT, "game": game, "variant": variante, "fingerprint": fp,
        "built": time.strftime("%Y-%m-%dT%H:%M:%S"), "seconds": round(time.time() - t0),
        "cities": ciudades, "mods": mod_names or [os.path.basename(p) for p in mod_paths],
        "clientVersion": client_version,
    }
    with open(os.path.join(tmp, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    shutil.rmtree(final, ignore_errors=True)
    os.replace(tmp, final)
    prune_old_maps(game, fp)
    logging.info("Map built for %s (%s): %d cities in %d s", game, fp, ciudades, manifest["seconds"])
    manifest["dir"] = final
    return manifest

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
import ctypes
import glob
import json
import logging
import os
import re
import sys
import time

import pydirectinput
import truck_telemetry
import websockets
from urllib.request import urlopen, Request

# pydirectinput por defecto pausa 0.1s despues de cada tecla (pensado para
# macros/automatizacion) - para un boton individual eso se siente como
# lag, no hace falta ese delay aca.
pydirectinput.PAUSE = 0

# Usa el almacen de certificados nativo de Windows/macOS/Linux para validar
# TLS, en vez del bundle de certificados que trae empaquetado Python (via
# certifi) - asi valida exactamente igual que el navegador del usuario. Sin
# esto, algunas PCs ven "certificate has expired" en el cliente (bundle
# desactualizado, ej. la cadena vieja de Let's Encrypt via DST Root CA X3,
# que expiro en 2021) mientras Chrome/Edge, que si usan el almacen del SO,
# ven el mismo certificado como valido.
import truststore
truststore.inject_into_ssl()

# Tasa de envio. La web interpola entre ticks: a 1 Hz el camion "salta" y
# los giros llegan tarde; a 4 Hz por el relay (unos 5 KB/s por sesion) se ve
# fluido, y en LAN (sin costo de red) va a 10 Hz. El loop corre a la tasa
# LAN y manda al relay solo cada CLOUD_SEND_INTERVAL - salvo que el tick
# traiga un evento (entrega, peaje, multa...), que se manda siempre.
SEND_INTERVAL_SECONDS = 0.1
CLOUD_SEND_INTERVAL_SECONDS = 0.25
RECONNECT_DELAY_SECONDS = 3.0

# Se bumpea a mano en cada release nueva del .exe (junto con /admin/stats/seed
# {"latest_client_version": "..."} en el backend) - se manda en cada payload
# para que /app pueda avisar si el cliente conectado quedo desactualizado.
CLIENT_VERSION = "1.5.9"

# Comandos que la web puede mandar para simular una tecla en el juego. Estos
# son solo el ultimo respaldo si no se pudo detectar nada real - ver
# detect_keybinds_from_controls_sii() mas abajo, que lee el controls.sii del
# perfil del juego y devuelve las teclas que el usuario tiene configuradas de
# verdad (mucho mas confiable que adivinar).
DEFAULT_KEYBINDS = {
    "toggle_hazards": "z",
    "toggle_beacon": "o",
    "toggle_differential_lock": None,
    "toggle_parking_brake": ".",
    "toggle_engine": "e",
    "toggle_trailer": None,
    "cycle_camera": "f1",
    "toggle_cruise_control": "c",
    "cycle_lights": "l",
    "toggle_high_beam": "k",
    "toggle_infotainment": None,
    "toggle_lift_axle": None,
    "toggle_wipers": "p",
}

GAME_WINDOW_TITLES = ("Euro Truck Simulator 2", "American Truck Simulator")

_user32 = ctypes.windll.user32
_kernel32 = ctypes.windll.kernel32
_shell32 = ctypes.windll.shell32

# Nombre de nuestra accion -> nombre interno que usa SCS en controls.sii
# (linea "mix <nombre_scs> `...`"). Se saco leyendo un controls.sii real -
# no esta documentado oficialmente, puede variar entre versiones del juego.
ACTION_TO_SCS_ACTION = {
    "toggle_hazards": "flasher4way",
    "toggle_beacon": "beacon",
    "toggle_differential_lock": "diflock",
    "toggle_parking_brake": "parkingbrake",
    "toggle_engine": "engine",
    "toggle_trailer": "attach",
    "cycle_camera": "camcycle",
    "toggle_cruise_control": "cruiectrl",
    "cycle_lights": "light",
    "toggle_high_beam": "hblight",
    "toggle_infotainment": "infotainment",
    "toggle_lift_axle": "liftaxle",
    "toggle_wipers": "wipers",
}

# Nombres de tecla que usa SCS en controls.sii -> nombre que espera
# pydirectinput. No hace falta que sea exhaustivo (solo lo que realmente
# puede terminar asignado a estos comandos), las teclas no listadas se pasan
# tal cual (funciona para la mayoria de las letras sueltas).
_SCS_KEY_TO_PYDIRECTINPUT = {
    "space": "space", "esc": "esc", "tab": "tab", "backspace": "backspace",
    "enter": "enter", "numenter": "enter",
    "del": "delete", "ins": "insert", "home": "home", "end": "end",
    "pgup": "pageup", "pgdn": "pagedown",
    "uarrow": "up", "darrow": "down", "larrow": "left", "rarrow": "right",
    "lshift": "shiftleft", "rshift": "shiftright",
    "lctrl": "ctrlleft", "rctrl": "ctrlright",
    "lalt": "altleft", "ralt": "altright",
    "grave": "`", "minus": "-", "equals": "=",
    "lbracket": "[", "rbracket": "]", "backslash": "\\",
    "semicolon": ";", "apostrophe": "'", "comma": ",", "period": ".", "slash": "/",
    "numplus": "add", "numminus": "subtract", "nummultiply": "multiply", "numslash": "divide",
}
for _i in range(10):
    _SCS_KEY_TO_PYDIRECTINPUT[f"key{_i}"] = str(_i)
for _i in range(1, 13):
    _SCS_KEY_TO_PYDIRECTINPUT[f"f{_i}"] = f"f{_i}"

_MIX_LINE_RE = re.compile(r'"mix\s+([a-zA-Z0-9_]+)\s+`([^`]*)`"')
_KEYBOARD_BIND_RE = re.compile(r"keyboard\.([a-zA-Z0-9_]+)")


def documents_folder() -> str:
    # No asumir "~/Documents" - OneDrive puede redirigir la carpeta de
    # Documentos a otro lado (ej. "OneDrive/Documentos"), y ahi es donde el
    # juego realmente guarda los perfiles.
    class _Guid(ctypes.Structure):
        _fields_ = [
            ("Data1", ctypes.c_ulong), ("Data2", ctypes.c_ushort), ("Data3", ctypes.c_ushort),
            ("Data4", ctypes.c_ubyte * 8),
        ]
    folderid_documents = _Guid(0xFDD39AD0, 0x238F, 0x46AF, (ctypes.c_ubyte * 8)(0xAD, 0xB4, 0x6C, 0x85, 0x48, 0x03, 0x69, 0xC7))
    path_ptr = ctypes.c_wchar_p()
    try:
        if _shell32.SHGetKnownFolderPath(ctypes.byref(folderid_documents), 0, 0, ctypes.byref(path_ptr)) == 0:
            path = path_ptr.value
            ctypes.windll.ole32.CoTaskMemFree(path_ptr)
            return path
    except Exception:
        pass
    return os.path.expanduser("~/Documents")


# ---------------------------------------------------------------------------
# Deteccion de mods de mapa activos, leyendo game.log.txt (texto plano que el
# juego reescribe en cada arranque y donde lista los mods del perfil al
# cargarlo). Asi la web elige sola el mapa (ProMods, Coast to Coast, ProMods
# Canada) en vez de pedirle al usuario que marque que tiene instalado.
# ---------------------------------------------------------------------------
_MOD_LINE_RE = re.compile(r"\[mods\] Active (?:local|workshop) mod (?:ID )?(?P<file>\S+) \(name: (?P<name>.*?), version: (?P<version>.*?), author: (?P<author>.*?)\)")
_MODS_HEADER_RE = re.compile(r"\[mods\] Active (\d+) mods")


def game_log_paths() -> dict:
    docs = documents_folder()
    return {
        "ets2": os.path.join(docs, "Euro Truck Simulator 2", "game.log.txt"),
        "ats": os.path.join(docs, "American Truck Simulator", "game.log.txt"),
    }


def parse_active_mods(log_text: str) -> list | None:
    """Lista de mods activos del ULTIMO perfil cargado segun el log, como
    [{file, name, version, author}], o None si el log no tiene ninguna lista
    de mods todavia (el juego no llego a cargar un perfil)."""
    last_header = None
    for m in _MODS_HEADER_RE.finditer(log_text):
        last_header = m
    if last_header is None:
        return None
    mods = []
    for m in _MOD_LINE_RE.finditer(log_text, last_header.end()):
        mods.append({"file": m.group("file"), "name": m.group("name"), "version": m.group("version"), "author": m.group("author")})
    return mods


def detect_map_mods(mods: list) -> dict:
    """{promods, promods_canada, c2c} a partir de nombres/archivos de mods.
    ProMods Europa y sus addons (ME, Maghreb, TGS) cuentan como 'promods';
    'ProMods Canada' es el pack de ATS."""
    flags = {"promods": False, "promods_canada": False, "c2c": False, "rusmap": False, "reforma": False, "roextended": False, "grand_utopia": False, "truckersmp": False}
    for mod in mods:
        text = f"{mod.get('file', '')} {mod.get('name', '')}".lower()
        if "promods" in text or "pm-" in text or "cnx-pm" in text:
            if "canada" in text or "promods-ats" in text or "pm-ats" in text:
                flags["promods_canada"] = True
            else:
                flags["promods"] = True
        if "coast to coast" in text or "coast2coast" in text or re.search(r"c2c", text):
            flags["c2c"] = True
        if "rusmap" in text:
            flags["rusmap"] = True
        # Reforma, Mega Resources, Sierra Nevada y el OtherMaps Patch llevan "reforma" en el nombre
        if "reforma" in text:
            flags["reforma"] = True
        # Roextended: los conectores se llaman ROEX53..., el mapa Hybrid "161Hybrid2v3"
        if "roex" in text or re.search(r"\d{3}hybrid\d", text):
            flags["roextended"] = True
        if "grand utopia" in text or "grandutopia" in text or "grand_utopia" in text:
            flags["grand_utopia"] = True
    return flags


_TMP_MOUNT_RE = re.compile(r"\[fs\] device .*truckersmp.*\.mp mounted to mod pool", re.IGNORECASE)


def is_truckersmp_session(log_text: str) -> bool:
    """El launcher de TruckersMP monta sus paquetes .mp desde
    %APPDATA%/TruckersMP/installation/... y el juego lo escribe en el log
    ("[fs] device C:/.../TruckersMP/installation/data/ets2/mods/data1.mp
    mounted to mod pool."); en una sesion normal no aparece. Ojo: en esas
    sesiones el log NO trae la lista "[mods] Active N mods"."""
    return bool(_TMP_MOUNT_RE.search(log_text))


def read_map_mods() -> dict:
    """{'ets2': {...flags} | None, 'ats': {...} | None} - None = sin datos
    (el log no existe o no tiene lista de mods)."""
    result = {}
    for game, path in game_log_paths().items():
        try:
            with open(path, encoding="utf-8", errors="ignore") as f:
                text = f.read()
        except OSError:
            result[game] = None
            continue
        mods = parse_active_mods(text)
        flags = detect_map_mods(mods) if mods is not None else None
        if is_truckersmp_session(text):
            flags = flags or detect_map_mods([])
            flags["truckersmp"] = True
        result[game] = flags
    return result


def find_controls_sii_files() -> list:
    docs = documents_folder()
    files = []
    for game_dir in ("Euro Truck Simulator 2", "American Truck Simulator"):
        for pattern in ("steam_profiles/*/controls.sii", "profiles/*/controls.sii"):
            files.extend(glob.glob(os.path.join(docs, game_dir, pattern)))
    # Los backups de perfil tras un update de version (ej. "steam_profiles(1.61.x).bak")
    # no son el perfil activo, hay que descartarlos.
    return [f for f in files if ".bak" not in f.lower()]


def parse_controls_sii(text: str) -> dict:
    """{accion_scs: tecla_pydirectinput o None} de cada linea 'mix' del
    controls.sii - solo mira el primer binding de teclado de cada una,
    ignora binds de joystick/mouse."""
    result = {}
    for match in _MIX_LINE_RE.finditer(text):
        action, expr = match.group(1), match.group(2)
        key_match = _KEYBOARD_BIND_RE.search(expr)
        if key_match:
            scs_key = key_match.group(1)
            result[action] = _SCS_KEY_TO_PYDIRECTINPUT.get(scs_key, scs_key)
        else:
            result[action] = None
    return result


def detect_keybinds_from_controls_sii() -> dict:
    """Lee el controls.sii real del juego (el perfil modificado mas
    recientemente, de cualquiera de los dos juegos) y devuelve nuestras
    acciones mapeadas a la tecla que el usuario tiene configurada de verdad.
    Best-effort: cualquier error (no encontro el archivo, formato
    inesperado) devuelve {} sin romper nada - el llamador sigue teniendo los
    defaults hardcodeados como respaldo."""
    files = find_controls_sii_files()
    if not files:
        return {}
    newest = max(files, key=os.path.getmtime)
    try:
        with open(newest, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()
        scs_binds = parse_controls_sii(text)
    except Exception as exc:
        logging.warning(f"No se pudo leer/parsear controls.sii ({exc})")
        return {}
    return {
        our_action: scs_binds.get(scs_action)
        for our_action, scs_action in ACTION_TO_SCS_ACTION.items()
        if scs_action in scs_binds
    }


def keybinds_path() -> str:
    # Al lado del .exe (o del script, corriendo desde fuente) - no en el
    # directorio de trabajo actual, que puede variar segun como se lance.
    base_dir = os.path.dirname(sys.executable if getattr(sys, "frozen", False) else os.path.abspath(__file__))
    return os.path.join(base_dir, "keybinds.json")


def load_keybinds() -> dict:
    path = keybinds_path()
    keybinds = dict(DEFAULT_KEYBINDS)
    try:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                keybinds.update(json.load(f))
    except Exception as exc:
        logging.warning(f"No se pudo leer keybinds.json ({exc}), se usan los binds detectados/por defecto.")
    # Lo detectado del controls.sii pisa tanto los defaults como lo guardado
    # - es la fuente mas confiable (la tecla que el juego tiene de verdad
    # asignada ahora mismo), mucho mejor que un valor viejo cacheado.
    keybinds.update({k: v for k, v in detect_keybinds_from_controls_sii().items() if v})
    if not os.path.exists(path):
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(keybinds, f, indent=2)
        except Exception as exc:
            logging.warning(f"No se pudo crear keybinds.json ({exc})")
    return keybinds


def save_keybinds(keybinds: dict) -> None:
    try:
        with open(keybinds_path(), "w", encoding="utf-8") as f:
            json.dump(keybinds, f, indent=2)
    except Exception as exc:
        logging.warning(f"No se pudo guardar keybinds.json ({exc})")


def find_game_window():
    for title in GAME_WINDOW_TITLES:
        hwnd = _user32.FindWindowW(None, title)
        if hwnd:
            return hwnd
    return None


_PROCESS_QUERY_INFORMATION = 0x0400
_PROCESS_QUERY_LIMITED_INFORMATION = 0x1000


def running_game_info(hwnd) -> dict | None:
    """Ruta del .exe del juego que esta corriendo y si parece estar elevado
    (como administrador). Sirve para diagnosticar "juego abierto pero sin
    telemetria": plugin instalado en OTRA copia del juego, o juego elevado
    (un proceso normal no puede abrir la memoria compartida de uno elevado).
    La heuristica de elevacion: si desde aca (no elevados) no podemos abrir
    el proceso con QUERY_INFORMATION pero si con QUERY_LIMITED, el juego
    corre con mayor integridad que nosotros."""
    pid = ctypes.c_ulong(0)
    _user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    if not pid.value:
        return None
    handle = _kernel32.OpenProcess(_PROCESS_QUERY_LIMITED_INFORMATION, False, pid.value)
    if not handle:
        return None
    try:
        buf = ctypes.create_unicode_buffer(1024)
        size = ctypes.c_ulong(1024)
        exe_path = buf.value if _kernel32.QueryFullProcessImageNameW(handle, 0, buf, ctypes.byref(size)) else None
    finally:
        _kernel32.CloseHandle(handle)
    full = _kernel32.OpenProcess(_PROCESS_QUERY_INFORMATION, False, pid.value)
    elevated_guess = (not full) and not _shell32.IsUserAnAdmin()
    if full:
        _kernel32.CloseHandle(full)
    return {"pid": pid.value, "exe_path": exe_path, "elevated_guess": bool(elevated_guess)}


_VK_MENU = 0x12  # Alt
_KEYEVENTF_KEYUP = 0x0002
_SW_RESTORE = 9


def bring_window_to_foreground(hwnd) -> None:
    # Windows por default no deja que un proceso en segundo plano le robe el
    # foco a otro (para que no te pisen la ventana sin que lo pidas). Con el
    # dashboard abierto en el celular esto rara vez hace falta (el foco en la
    # PC ya suele estar en el juego, nada en el celular se lo puede robar),
    # pero abriendo el dashboard en la MISMA PC (navegador con foco) es
    # justo el caso donde Windows bloquea mas fuerte el robo de foco -
    # AttachThreadInput solo no siempre alcanza ahi. Un tap de Alt (invisible,
    # no llega a abrir ningun menu) resetea el lock de foreground justo antes
    # de pedirlo - truco bien conocido en automatizacion de Windows, se
    # combina con AttachThreadInput para maxima confiabilidad. Best-effort:
    # en casos raros Windows igual lo bloquea, no hay forma 100% garantizada
    # sin tocar politicas del sistema.
    foreground_hwnd = _user32.GetForegroundWindow()
    current_thread_id = _kernel32.GetCurrentThreadId()
    foreground_thread_id = _user32.GetWindowThreadProcessId(foreground_hwnd, None)
    target_thread_id = _user32.GetWindowThreadProcessId(hwnd, None)
    _user32.AttachThreadInput(current_thread_id, foreground_thread_id, True)
    _user32.AttachThreadInput(current_thread_id, target_thread_id, True)
    try:
        _user32.keybd_event(_VK_MENU, 0, 0, 0)
        _user32.keybd_event(_VK_MENU, 0, _KEYEVENTF_KEYUP, 0)
        if _user32.IsIconic(hwnd):
            _user32.ShowWindow(hwnd, _SW_RESTORE)
        _user32.SetForegroundWindow(hwnd)
    finally:
        _user32.AttachThreadInput(current_thread_id, foreground_thread_id, False)
        _user32.AttachThreadInput(current_thread_id, target_thread_id, False)


# Teclas que pydirectinput no trae de fabrica (scancodes DirectInput): el
# teclado numerico (el juego lo distingue de la fila de numeros) y F13-F24.
_EXTRA_SCANCODES = {"num0": 0x52, "num1": 0x4F, "num2": 0x50, "num3": 0x51, "num4": 0x4B, "num5": 0x4C, "num6": 0x4D, "num7": 0x47, "num8": 0x48, "num9": 0x49,
                    "f13": 0x64, "f14": 0x65, "f15": 0x66, "f16": 0x67, "f17": 0x68, "f18": 0x69, "f19": 0x6A, "f20": 0x6B, "f21": 0x6C, "f22": 0x6D, "f23": 0x6E, "f24": 0x6F}
pydirectinput.KEYBOARD_MAPPING.update(_EXTRA_SCANCODES)

# Botones custom de la web: la tecla viaja con el comando ("ctrl+shift+f5"),
# se valida contra esta lista blanca (nada de Win, nada de Alt+F4) y se
# aprieta con los modificadores sostenidos.
CUSTOM_KEY_MODIFIERS = ("ctrl", "shift", "alt")
CUSTOM_KEY_ALLOWED = (
    set("abcdefghijklmnopqrstuvwxyz0123456789")
    | {f"f{i}" for i in range(1, 25)}
    | {f"num{i}" for i in range(10)}
    | {"space", "enter", "tab", "esc", "backspace", "delete", "insert", "home", "end", "pageup", "pagedown",
       "up", "down", "left", "right", "add", "subtract", "multiply", "divide", "decimal",
       ";", "'", ",", ".", "/", "\\", "[", "]", "-", "=", "`"}
)


def parse_custom_key(spec) -> list | None:
    """'ctrl+shift+f5' -> ['ctrl', 'shift', 'f5'] (modificadores primero,
    sin repetir), o None si algo no esta en la lista blanca."""
    if not isinstance(spec, str):
        return None
    parts = [p.strip().lower() for p in spec.split("+")]
    if not parts or any(not p for p in parts) or len(parts) > 4:
        return None
    mods, key = parts[:-1], parts[-1]
    if len(set(mods)) != len(mods) or any(m not in CUSTOM_KEY_MODIFIERS for m in mods):
        return None
    if key not in CUSTOM_KEY_ALLOWED or ("alt" in mods and key == "f4"):
        return None
    return mods + [key]


def send_custom_key(spec) -> str:
    combo = parse_custom_key(spec)
    if not combo:
        return "bad_key"
    hwnd = find_game_window()
    if not hwnd:
        return "no_window"
    try:
        bring_window_to_foreground(hwnd)
        mods, key = combo[:-1], combo[-1]
        for m in mods:
            pydirectinput.keyDown(m)
        try:
            pydirectinput.press(key)
        finally:
            for m in reversed(mods):
                pydirectinput.keyUp(m)
        return "ok"
    except Exception as exc:
        logging.warning(f"No se pudo enviar la tecla custom '{spec}': {exc}")
        return str(exc)


def send_game_command(action: str, keybinds: dict) -> str:
    """Devuelve un codigo de resultado ("ok", "no_key", "no_window", o el
    texto de la excepcion) - la web lo usa para avisar cuando algo no
    funciono, en vez de fallar en silencio sin que nadie se de cuenta."""
    key = keybinds.get(action)
    if not key:
        logging.info(f"Comando '{action}' no tiene tecla asignada en keybinds.json, se ignora.")
        return "no_key"
    hwnd = find_game_window()
    if not hwnd:
        logging.info("No se encontro la ventana del juego, se ignora el comando.")
        return "no_window"
    try:
        bring_window_to_foreground(hwnd)
        pydirectinput.press(key)
        return "ok"
    except Exception as exc:
        logging.warning(f"No se pudo enviar el comando '{action}' (tecla '{key}'): {exc}")
        return str(exc)


def http_base_url(ws_url: str) -> str:
    return ws_url.replace("wss://", "https://").replace("ws://", "http://")


def is_newer_version(a: str, b: str) -> bool:
    """True si la version a es mas nueva que b, comparando como tuplas de
    enteros (ej. "1.2.10" > "1.2.9", a diferencia de una comparacion de
    strings que fallaria en ese caso)."""
    def parts(v: str):
        return tuple(int(x) for x in v.split(".") if x.isdigit())
    return parts(a) > parts(b)


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
        "clientVersion": CLIENT_VERSION,
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
        "cityDst": raw.get("cityDst") or None,
        # El SDK llama a estos campos compSrc/compDst (no companySrc) - el
        # nombre viejo hacia que siempre salieran vacios. Los *Id son los
        # tokens internos (ej. "wal_mkt", "kansas_city"): la web los cruza
        # con los POIs del mapa para rutear a la empresa exacta de
        # carga/descarga en vez de al centro de la ciudad.
        "companySrc": raw.get("compSrc") or None,
        "companySrcId": raw.get("compSrcId") or None,
        "citySrcId": raw.get("citySrcId") or None,
        "companyDst": raw.get("compDst") or None,
        "companyDstId": raw.get("compDstId") or None,
        "cityDstId": raw.get("cityDstId") or None,
        "onJob": bool(raw.get("onJob")),
        "isCargoLoaded": bool(raw.get("isCargoLoaded")),
        "engineRpm": raw.get("engineRpm"),
        "engineRpmMax": raw.get("engineRpmMax"),
        "gear": raw.get("gearDashboard"),
        "routeDistanceKm": (raw.get("routeDistance") or 0) / 1000,
        "routeTimeSeconds": raw.get("routeTime"),
        # restStop viene en MINUTOS de tiempo de juego (hasta el proximo descanso
        # obligatorio por fatiga). restStopSeconds es el nombre viejo, mal
        # puesto, que la web sigue aceptando; los dos traen minutos.
        "restStopSeconds": raw.get("restStop"),
        "restStopMinutes": raw.get("restStop"),
        # Reloj del juego en minutos: la web lo usa para medir la escala de
        # tiempo real (ETA real, descanso en tiempo real).
        "gameTimeMinutes": raw.get("time_abs"),
        # time_abs/time_abs_delivery vienen en minutos de tiempo de juego (no
        # tiempo real) - la diferencia es cuanto falta para el deadline de
        # entrega del trabajo actual. Sin trabajo activo, time_abs_delivery
        # suele venir en 0, lo que daria un numero negativo enorme - se
        # descarta ese caso mandando None.
        "jobDeadlineSeconds": (
            (raw.get("time_abs_delivery") - raw.get("time_abs")) * 60
            if raw.get("time_abs_delivery") else None
        ),
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
        # el SDK reporta esto en litros/km, no litros/100km como se asumia -
        # por eso el mpg calculado en la web daba absurdamente alto (~600).
        "fuelAvgConsumption": (raw.get("fuelAvgConsumption") or 0) * 100 or None,
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
        # Estados usados para resaltar los botones de comandos como activos
        # en la web (no se piden por separado, ya vienen en el SDK).
        "engineEnabled": raw.get("engineEnabled"),
        "parkingBrake": raw.get("parkBrake"),
        "differentialLock": raw.get("differentialLock"),
        "liftAxle": raw.get("liftAxleIndicator"),
        "trailerAttached": bool((raw.get("trailer") or [{}])[0].get("attached")),
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
            # jobDelivered/jobCancelled son "pulso": el SDK los pone en True
            # por un solo frame en el momento exacto que termina el trabajo,
            # igual que tollgate/fined/ferry/train de arriba.
            "jobDelivered": raw.get("jobDelivered"),
            "jobDeliveredRevenue": raw.get("jobDeliveredRevenue"),
            "jobDeliveredDistanceKm": raw.get("jobDeliveredDistanceKm"),
            "jobCancelled": raw.get("jobCancelled"),
            "jobCancelledPenalty": raw.get("jobCancelledPenalty"),
        },
    }


# Al momento exacto en que el SDK pulsa jobDelivered/jobCancelled, los campos
# del trabajo (citySrc/cityDst/cargo/truckBrand/truckName) ya vienen vacios -
# el juego los limpia antes o al mismo tiempo que dispara el pulso, no
# despues como sugiere la doc del plugin. Por eso se cachea el ultimo snapshot
# valido mientras el trabajo esta activo (onJob=True) y se lo pega al evento
# recien en el momento de la entrega/cancelacion.
_last_job_snapshot = {"citySrc": None, "cityDst": None, "truckBrand": None, "truckName": None, "cargo": None}


def update_job_snapshot(raw: dict):
    global _last_job_snapshot
    if raw.get("onJob") and raw.get("cityDst"):
        _last_job_snapshot = {
            "citySrc": raw.get("citySrc") or None,
            "cityDst": raw.get("cityDst") or None,
            "truckBrand": raw.get("truckBrand") or None,
            "truckName": raw.get("truckName") or None,
            "cargo": raw.get("cargo") or None,
        }


# jobDelivered/jobCancelled NO son un pulso de un frame en la memoria
# compartida: el plugin los deja en true hasta que el juego los limpia (minutos,
# hasta el proximo trabajo). Si se mandaran tal cual, cada reconexion del
# cliente o reinicio del backend volveria a "entregar" el mismo trabajo. Se
# manda true solo en la transicion false -> true vista por este proceso; el
# primer tick despues de arrancar solo fija el estado (None = desconocido).
_last_event_state = {"jobDelivered": None, "jobCancelled": None}


def edge_filter_job_events(payload: dict) -> None:
    event = payload.get("event") or {}
    for key in ("jobDelivered", "jobCancelled"):
        current = bool(event.get(key))
        previous = _last_event_state[key]
        _last_event_state[key] = current
        event[key] = current and previous is False


def attach_job_snapshot_if_finished(payload: dict):
    edge_filter_job_events(payload)
    event = payload.get("event") or {}
    if event.get("jobDelivered") or event.get("jobCancelled"):
        event["jobSrc"] = _last_job_snapshot["citySrc"]
        event["jobDst"] = _last_job_snapshot["cityDst"]
        event["jobTruckBrand"] = _last_job_snapshot["truckBrand"]
        event["jobTruckName"] = _last_job_snapshot["truckName"]
        event["jobCargo"] = _last_job_snapshot["cargo"]


EVENT_FLAGS = ("jobDelivered", "jobCancelled", "tollgate", "fined", "ferry", "train")


def payload_has_event(payload: dict) -> bool:
    event = payload.get("event") or {}
    return any(event.get(k) for k in EVENT_FLAGS)


async def handle_control_message(message: str, keybinds: dict, send) -> None:
    """Procesa un mensaje de control de la web (comando de botonera, get/set
    de keybinds) y responde via `send` (coroutine que manda un str). Lo usan
    tanto la conexion al backend (cloud) como el servidor LAN local."""
    try:
        payload = json.loads(message)
        msg_type = payload.get("type")
        if msg_type == "command":
            action = payload.get("action", "")
            if action == "custom":
                result = await asyncio.to_thread(send_custom_key, payload.get("key"))
            else:
                result = await asyncio.to_thread(send_game_command, action, keybinds)
            if result != "ok":
                await send(json.dumps({"type": "command_result", "action": action, "ok": False, "reason": result}))
        elif msg_type == "get_keybinds":
            detected = await asyncio.to_thread(detect_keybinds_from_controls_sii)
            live = dict(keybinds)
            live.update({a: k for a, k in detected.items() if k})
            await send(json.dumps({"type": "keybinds", "data": live}))
        elif msg_type == "set_keybinds":
            incoming = payload.get("data") or {}
            keybinds.update({k: (v or None) for k, v in incoming.items() if k in DEFAULT_KEYBINDS})
            await asyncio.to_thread(save_keybinds, keybinds)
            await send(json.dumps({"type": "keybinds", "data": keybinds}))
    except Exception as exc:
        logging.warning(f"Comando invalido recibido ({exc}): {message!r}")


async def receive_commands(ws, keybinds: dict):
    """Escucha en paralelo al envio de telemetria - la web puede mandar
    comandos de botonera (on/off balizas, motor, etc.) por el mismo socket,
    en cualquier momento, no como respuesta a nada que mandemos nosotros.
    Tambien atiende get/set de keybinds, para el modal de remapeo de la web -
    keybinds se muta in-place (mismo dict que usa send_game_command) para que
    un cambio aplique de inmediato, sin reconectar.

    Todo lo que hace I/O bloqueante (leer controls.sii del disco, mandar la
    tecla) corre en un thread aparte (asyncio.to_thread) - si no, bloquea el
    event loop entero mientras dura, lo que puede llegar a atrasar el
    ping/pong del websocket lo suficiente como para que el servidor lo de
    por muerto y corte la conexion (notado con controls.sii en una carpeta
    de OneDrive, que puede tardar en resolver)."""
    async for message in ws:
        await handle_control_message(message, keybinds, ws.send)


async def run(backend_ws_url: str, code: str):
    truck_telemetry.init()
    print("Conectado al SDK de telemetria del juego.")
    keybinds = load_keybinds()

    url = f"{backend_ws_url}/ws/client/{code}"
    while True:
        try:
            async with websockets.connect(url) as ws:
                print(f"Conectado al backend. Codigo de pairing: {code}")
                recv_task = asyncio.create_task(receive_commands(ws, keybinds))
                try:
                    while True:
                        raw = truck_telemetry.get_data()
                        # sdkActive en False significa que el SDK todavia no
                        # sincronizo el primer frame real del juego (justo
                        # despues de init() puede devolver datos viejos/en cero,
                        # lo que se veia como el camion en una posicion rara
                        # hasta arrancar a manejar). Se descarta ese frame.
                        if raw.get("sdkActive"):
                            update_job_snapshot(raw)
                            payload = build_payload(raw)
                            attach_job_snapshot_if_finished(payload)
                            await ws.send(json.dumps(payload))
                        await asyncio.sleep(CLOUD_SEND_INTERVAL_SECONDS)
                finally:
                    recv_task.cancel()
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

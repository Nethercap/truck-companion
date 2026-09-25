"""
Deteccion de la instalacion de ETS2/ATS e instalacion del plugin de
telemetria de SCS (scs-telemetry.dll, de RenCloud/scs-sdk-plugin, MIT) en
bin\\win_x64\\plugins\\ del juego.

Antes esto era el paso 1 manual de la landing ("baja el zip, copia SOLO el
.dll a esta carpeta...") y el lugar donde mas gente se perdia. Ahora el
cliente trae el .dll adentro (client/vendor/, empaquetado por PyInstaller)
y lo copia solo.

Todo es best-effort y sin permisos de administrador: la carpeta de Steam es
escribible por el usuario (Steam mismo actualiza los juegos sin admin).
Instalaciones fuera de Steam se pueden indicar a mano (install_plugin acepta
cualquier carpeta bin\\win_x64).
"""

import hashlib
import os
import re
import shutil
import sys

PLUGIN_DLL_NAME = "scs-telemetry.dll"
PLUGIN_DLL_VERSION = "1.12.1"
PLUGIN_DLL_SHA256 = "1d03dbc7a975e72203c60a7b9998021ceb8800b836bf28a131279979ad386cd4"

GAMES = {
    "ets2": "Euro Truck Simulator 2",
    "ats": "American Truck Simulator",
}

_LIBRARY_PATH_RE = re.compile(r'"path"\s+"([^"]+)"')


def bundled_dll_path() -> str:
    # Empaquetado: PyInstaller extrae los datas en sys._MEIPASS. Desde fuente:
    # client/vendor/ al lado de este archivo.
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, "vendor", PLUGIN_DLL_NAME)


def sha256_of(path: str) -> str | None:
    try:
        with open(path, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()
    except OSError:
        return None


def find_steam_path() -> str | None:
    try:
        import winreg
    except ImportError:
        return None
    candidates = [
        (winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam", "SteamPath"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Valve\Steam", "InstallPath"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Valve\Steam", "InstallPath"),
    ]
    for hive, key, value_name in candidates:
        try:
            with winreg.OpenKey(hive, key) as key_handle:
                value, _ = winreg.QueryValueEx(key_handle, value_name)
                if value and os.path.isdir(value):
                    return os.path.normpath(value)
        except OSError:
            continue
    return None


def parse_libraryfolders(text: str) -> list[str]:
    """Rutas de todas las bibliotecas de Steam listadas en libraryfolders.vdf
    (el formato usa backslashes escapados: "D:\\\\Games\\\\Steam")."""
    paths = []
    for raw in _LIBRARY_PATH_RE.findall(text):
        path = os.path.normpath(raw.replace("\\\\", "\\"))
        if path not in paths:
            paths.append(path)
    return paths


def steam_library_paths() -> list[str]:
    steam = find_steam_path()
    if not steam:
        return []
    libs = [steam]
    vdf = os.path.join(steam, "steamapps", "libraryfolders.vdf")
    try:
        with open(vdf, encoding="utf-8", errors="ignore") as f:
            for path in parse_libraryfolders(f.read()):
                if path not in libs:
                    libs.append(path)
    except OSError:
        pass
    return libs


def plugin_path_for(bin_dir: str) -> str:
    return os.path.join(bin_dir, "plugins", PLUGIN_DLL_NAME)


def plugin_state(bin_dir: str) -> str:
    """'installed' (mismo .dll que traemos), 'outdated' (hay otro .dll, de
    otra version o de otro origen) o 'missing'."""
    path = plugin_path_for(bin_dir)
    if not os.path.exists(path):
        return "missing"
    return "installed" if sha256_of(path) == PLUGIN_DLL_SHA256 else "outdated"


def same_dir(a: str, b: str) -> bool:
    """Si dos rutas apuntan al MISMO directorio, aunque se escriban distinto.

    Comparar cadenas no alcanza: bajo Proton, Wine expone la misma carpeta de
    Linux por Z:\\ y por cualquier letra mapeada, asi que la deteccion
    automatica y la carpeta agregada a mano daban dos entradas para un solo
    juego (reportado por un tester con 4 entradas para 2 juegos). samefile
    compara el archivo de verdad; si el sistema no puede decirlo, se cae a la
    comparacion de texto de siempre.
    """
    try:
        return os.path.samefile(a, b)
    except OSError:
        return os.path.normcase(os.path.abspath(a)) == os.path.normcase(os.path.abspath(b))


GAME_EXES = ("eurotrucks2.exe", "amtrucks.exe")


def tiene_ejecutable(bin_dir: str) -> bool:
    """Si en esa carpeta hay de verdad un juego.

    No alcanza con que el directorio exista. Al desinstalar, Steam borra lo
    que bajo el, pero NO la carpeta plugins\\ que creamos nosotros, asi
    arbol sobrevive con nuestro .dll adentro: la copia fantasma seguia
    apareciendo en Setup, y encima como "Plugin installed", al lado de la
    instalacion de verdad.
    """
    return any(os.path.exists(os.path.join(bin_dir, exe)) for exe in GAME_EXES)


def find_game_installs() -> list[dict]:
    """[{game, name, bin_dir, plugin_path, state, origen}, ...] para cada
    juego encontrado en alguna biblioteca de Steam."""
    found = []
    for lib in steam_library_paths():
        for game, name in GAMES.items():
            bin_dir = os.path.join(lib, "steamapps", "common", name, "bin", "win_x64")
            if (tiene_ejecutable(bin_dir)
                    and not any(same_dir(f["bin_dir"], bin_dir) for f in found)):
                found.append(describe_install(game, bin_dir))
    return found


def describe_install(game: str, bin_dir: str, origen: str = "steam") -> dict:
    """origen: 'steam' si la encontro la deteccion automatica, 'manual' si la
    agrego el usuario o el diagnostico. Solo las de 'manual' se pueden quitar
    desde Setup: las de Steam volverian a aparecer en el siguiente re-scan."""
    return {
        "game": game,
        "name": GAMES.get(game, game),
        "bin_dir": bin_dir,
        "plugin_path": plugin_path_for(bin_dir),
        "state": plugin_state(bin_dir),
        "origen": origen,
    }


def install_plugin(bin_dir: str) -> str:
    """Copia el .dll empaquetado a <bin_dir>\\plugins\\. Devuelve la ruta
    instalada; levanta OSError si no se pudo escribir (el llamador muestra el
    mensaje) o FileNotFoundError si el .dll empaquetado no esta."""
    src = bundled_dll_path()
    if not os.path.exists(src):
        raise FileNotFoundError(f"bundled {PLUGIN_DLL_NAME} not found at {src}")
    if sha256_of(src) != PLUGIN_DLL_SHA256:
        raise ValueError(f"bundled {PLUGIN_DLL_NAME} does not match the expected SHA-256")
    dst = plugin_path_for(bin_dir)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copyfile(src, dst)
    if sha256_of(dst) != PLUGIN_DLL_SHA256:
        raise OSError(f"copied file at {dst} does not match the expected SHA-256")
    return dst


def looks_like_game_bin_dir(path: str) -> bool:
    """Para cuando el usuario elige una carpeta a mano: acepta la carpeta del
    juego, bin\\ o bin\\win_x64 y devuelve si ahi adentro hay un ejecutable
    del juego."""
    return resolve_bin_dir(path) is not None


def resolve_bin_dir(path: str) -> str | None:
    candidates = [path, os.path.join(path, "win_x64"), os.path.join(path, "bin", "win_x64")]
    for candidate in candidates:
        if tiene_ejecutable(candidate):
            return os.path.normpath(candidate)
    return None


def game_for_bin_dir(bin_dir: str) -> str:
    return "ets2" if os.path.exists(os.path.join(bin_dir, "eurotrucks2.exe")) else "ats"

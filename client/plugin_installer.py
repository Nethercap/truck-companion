"""
Deteccion de la instalacion de ETS2/ATS e instalacion del plugin de
telemetria (truckdash-telemetry.dll, nuestro fork de RenCloud/scs-sdk-plugin,
MIT; fuente en plugin/) en bin\\win_x64\\plugins\\ del juego.

El plugin va con nombre propio y publica en su propio bloque de memoria
("TruckDashTelemetry"), al lado de cualquier scs-telemetry.dll que ya tenga
el juego. El scs-telemetry.dll no se toca nunca: es el de RenCloud y lo
instalan otras apps. Trucky lo trae en su paquete de Overwolf y, si alguien
lo cambia, no arranca ("[SECURITY] Package file replaced on disk"); la 1.5.21
lo reemplazaba por el nuestro y le paso a usuarios de las dos apps.

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
import logging
import os
import re
import shutil
import sys

PLUGIN_DLL_NAME = "truckdash-telemetry.dll"
# El nombre del plugin de RenCloud, que puede haber puesto cualquiera: otra
# app, el usuario a mano, o un cliente nuestro hasta la 1.5.21. Solo se mira
# si esta, para saber que el juego ya publica telemetria (en "SCSTelemetry",
# que el cliente tambien lee).
OTHER_DLL_NAME = "scs-telemetry.dll"
# Fork de RenCloud 1.12.1 con los trabajos con auto de ATS 1.61 (plugin/).
# La DLL y su hash los escribe el workflow "Build plugin" (tools/pin_plugin.py).
PLUGIN_DLL_VERSION = "1.12.1-truckdash.2"
PLUGIN_DLL_SHA256 = "de81c1a25856d2f83a956feb06842ddfcd23788d6eb32d3a7584bcda4bf7d183"
# El mismo plugin para macOS, universal (Intel y Apple Silicon): la .dylib y
# su hash tambien los escribe "Build plugin" (plataforma macos, con
# plugin/build.sh). Sin la .dylib en vendor/ o sin hash, no se instala nada.
PLUGIN_DYLIB_NAME = "truckdash-telemetry.dylib"
PLUGIN_DYLIB_SHA256 = "07434fb806e13a56824350cad12f605189a510af65e618d1f49c9262f169a404"

GAMES = {
    "ets2": "Euro Truck Simulator 2",
    "ats": "American Truck Simulator",
}

_LIBRARY_PATH_RE = re.compile(r'"path"\s+"([^"]+)"')


def plugin_filename_for(bin_dir: str | None = None) -> str:
    if bin_dir and ("Contents/MacOS" in bin_dir.replace("\\", "/") or (sys.platform == "darwin" and "win_x64" not in bin_dir)):
        return PLUGIN_DYLIB_NAME
    return PLUGIN_DLL_NAME


def plugin_expected_sha256_for(bin_dir: str | None = None) -> str:
    if plugin_filename_for(bin_dir) == PLUGIN_DYLIB_NAME:
        return PLUGIN_DYLIB_SHA256
    return PLUGIN_DLL_SHA256


def bundled_dll_path(bin_dir: str | None = None) -> str:
    # Empaquetado: PyInstaller extrae los datas en sys._MEIPASS. Desde fuente:
    # client/vendor/ al lado de este archivo.
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    target = plugin_filename_for(bin_dir)
    path = os.path.join(base, "vendor", target)
    if not os.path.exists(path):
        path = os.path.join(base, "vendor", PLUGIN_DLL_NAME)
    return path


def sha256_of(path: str) -> str | None:
    try:
        with open(path, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()
    except OSError:
        return None


def find_steam_path() -> str | None:
    if sys.platform == "darwin":
        mac_steam = os.path.expanduser("~/Library/Application Support/Steam")
        if os.path.isdir(mac_steam):
            return mac_steam
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


def unix_a_wine(ruta: str) -> str:
    """/home/x/... -> Z:\\home\\x\\... : Wine monta la raiz de Linux en Z:."""
    if ruta.startswith("/"):
        return "Z:" + ruta.replace("/", "\\")
    return ruta


def linux_steam_roots(env=None, existe=os.path.isdir) -> list[str]:
    """Bajo Proton, el Steam de Linux visto desde Wine. El del registro es uno
    de mentira dentro del prefijo, sin juegos: sin esto la instalacion solo
    aparecia con el juego ya abierto (issue #7, Nobara). Proton pasa la
    carpeta de Steam y la del prefijo (STEAM_COMPAT_CLIENT_INSTALL_PATH,
    STEAM_COMPAT_DATA_PATH, que vive en <biblioteca>/steamapps/compatdata/<id>)
    y el HOME de Linux; en Windows ninguna existe como carpeta."""
    env = os.environ if env is None else env
    candidatas = []
    if env.get("STEAM_COMPAT_CLIENT_INSTALL_PATH", "").startswith("/"):
        candidatas.append(env["STEAM_COMPAT_CLIENT_INSTALL_PATH"].rstrip("/"))
    datos = env.get("STEAM_COMPAT_DATA_PATH", "").rstrip("/")
    if datos.startswith("/") and "/steamapps/compatdata/" in datos:
        candidatas.append(datos.split("/steamapps/compatdata/")[0])
    home = env.get("HOME", "")
    if home.startswith("/"):
        for sub in (".local/share/Steam", ".steam/steam", ".var/app/com.valvesoftware.Steam/.local/share/Steam"):
            candidatas.append(home.rstrip("/") + "/" + sub)
    raices = []
    for c in candidatas:
        ruta = unix_a_wine(c)
        if ruta not in raices and existe(ruta):
            raices.append(ruta)
    return raices


def parse_libraryfolders(text: str) -> list[str]:
    """Rutas de todas las bibliotecas de Steam listadas en libraryfolders.vdf
    (el formato usa backslashes escapados: "D:\\\\Games\\\\Steam")."""
    paths = []
    for raw in _LIBRARY_PATH_RE.findall(text):
        clean_raw = raw.replace("\\\\", "/")
        path = os.path.normpath(unix_a_wine(raw.replace("\\\\", "\\")))
        if path not in paths:
            paths.append(path)
        if clean_raw.startswith("/") and clean_raw not in paths:
            paths.append(clean_raw)
    return paths


def steam_library_paths() -> list[str]:
    raices = [r for r in [find_steam_path()] if r] + linux_steam_roots()
    libs = []
    for steam in raices:
        if steam not in libs:
            libs.append(steam)
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
    return os.path.join(bin_dir, "plugins", plugin_filename_for(bin_dir))


def plugin_state(bin_dir: str) -> str:
    """Del plugin nuestro: 'installed' (el mismo archivo que traemos),
    'outdated' (el nuestro, de otra version) o 'missing'."""
    path = plugin_path_for(bin_dir)
    if not os.path.exists(path):
        return "missing"
    expected = plugin_expected_sha256_for(bin_dir)
    if not expected:
        return "installed"
    return "installed" if sha256_of(path) == expected else "outdated"


def has_other_plugin(bin_dir: str) -> bool:
    """Si el juego tiene un scs-telemetry.dll / scs-telemetry.dylib: con ese
    solo ya hay telemetria, sin los trabajos con auto de ATS 1.61."""
    other_names = [OTHER_DLL_NAME, "scs-telemetry.dylib", "libscs-telemetry.dylib"]
    return any(os.path.exists(os.path.join(bin_dir, "plugins", name)) for name in other_names)


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


GAME_EXES = ("eurotrucks2.exe", "amtrucks.exe", "eurotrucks2", "amtrucks")


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
            candidates = [
                os.path.join(lib, "steamapps", "common", name, "bin", "win_x64"),
                os.path.join(lib, "steamapps", "common", name, f"{name}.app", "Contents", "MacOS"),
            ]
            for bin_dir in candidates:
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
        "other_plugin": has_other_plugin(bin_dir),
        "origen": origen,
    }


def install_plugin(bin_dir: str) -> str:
    """Copia el plugin empaquetado a <bin_dir>/plugins/. Devuelve la ruta
    instalada; levanta OSError si no se pudo escribir (el llamador muestra el
    mensaje) o FileNotFoundError si el plugin empaquetado no esta."""
    try:
        src = bundled_dll_path(bin_dir)
    except TypeError:
        src = bundled_dll_path()
    if not os.path.exists(src):
        try:
            src = bundled_dll_path()
        except TypeError:
            pass
    if not os.path.exists(src):
        raise FileNotFoundError(f"bundled plugin not found at {src}")
    expected_sha = plugin_expected_sha256_for(bin_dir) if os.path.basename(src) == PLUGIN_DYLIB_NAME else PLUGIN_DLL_SHA256
    if expected_sha and sha256_of(src) != expected_sha:
        raise ValueError(f"bundled {os.path.basename(src)} does not match the expected SHA-256")
    dst = plugin_path_for(bin_dir)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    tmp = dst + ".new"
    try:
        shutil.copyfile(src, tmp)
        os.replace(tmp, dst)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    if expected_sha and sha256_of(dst) != expected_sha:
        raise OSError(f"copied file at {dst} does not match the expected SHA-256")
    return dst


def update_own_plugin(installs: list[dict]) -> list[str]:
    """Pone el plugin que trae este cliente donde haga falta, sin preguntar:
    - donde esta el nuestro de otra version (el archivo lleva nuestro nombre:
      lo pusimos nosotros);
    - donde no esta el nuestro pero si un scs-telemetry.dll. Esa persona ya
      tiene la telemetria andando (con un cliente viejo o con otra app), y
      sumar un archivo al lado no cambia el de nadie.
    Donde no hay ningun plugin no se instala nada: eso lo decide el usuario
    en Setup.

    Con el juego abierto Windows no deja reemplazar la DLL: esa carpeta queda
    como estaba y se reintenta la proxima vez. Devuelve las carpetas
    actualizadas y les deja el estado en "installed"."""
    actualizados = []
    for install in installs:
        if install.get("state") == "installed":
            continue
        if install.get("state") == "missing" and not install.get("other_plugin"):
            continue
        try:
            install_plugin(install["bin_dir"])
        except (OSError, ValueError) as exc:
            logging.info("Plugin in %s not updated yet (%s)", install["bin_dir"], exc)
            continue
        install["state"] = "installed"
        actualizados.append(install["bin_dir"])
    return actualizados


def looks_like_game_bin_dir(path: str) -> bool:
    """Para cuando el usuario elige una carpeta a mano: acepta la carpeta del
    juego, bin\\ o bin\\win_x64 o .app/Contents/MacOS y devuelve si ahi adentro
    hay un ejecutable del juego."""
    return resolve_bin_dir(path) is not None


def resolve_bin_dir(path: str) -> str | None:
    candidates = [
        path,
        os.path.join(path, "win_x64"),
        os.path.join(path, "bin", "win_x64"),
        os.path.join(path, "Contents", "MacOS"),
    ]
    for name in GAMES.values():
        candidates.append(os.path.join(path, f"{name}.app", "Contents", "MacOS"))
        candidates.append(os.path.join(path, "bin", "win_x64"))
    for candidate in candidates:
        if tiene_ejecutable(candidate):
            return os.path.normpath(candidate)
    return None


def game_for_bin_dir(bin_dir: str) -> str:
    files = ("eurotrucks2.exe", "eurotrucks2")
    return "ets2" if any(os.path.exists(os.path.join(bin_dir, f)) for f in files) else "ats"

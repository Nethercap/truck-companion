"""
Integracion con Windows del cliente: inicio automatico con la sesion
(clave Run de HKCU, sin admin), settings persistidos al lado del .exe, y
auto-update (bajar el zip nuevo, reemplazar el .exe y relanzar).
"""

import hashlib
import io
import json
import logging
import os
import subprocess
import sys
import tempfile
import zipfile
from urllib.request import urlopen

RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
RUN_VALUE_NAME = "TruckDash"
AUTOSTART_FLAG = "--autostart"


def base_dir() -> str:
    return os.path.dirname(sys.executable if getattr(sys, "frozen", False) else os.path.abspath(__file__))


def exe_path() -> str | None:
    return sys.executable if getattr(sys, "frozen", False) else None


def settings_path() -> str:
    return os.path.join(base_dir(), "settings.json")


def load_settings() -> dict:
    try:
        with open(settings_path(), encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_settings(settings: dict) -> None:
    try:
        with open(settings_path(), "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=2)
    except Exception as exc:
        logging.warning(f"No se pudo guardar settings.json ({exc})")


def in_temp_location(path: str | None = None) -> bool:
    """True si el .exe esta corriendo desde una carpeta temporal, que es lo que
    pasa cuando alguien lo abre con doble clic desde adentro del zip (7-Zip y
    el Explorador lo extraen a %TEMP%\\7zXXXX o similar).

    Registrarlo en el arranque desde ahi es doblemente malo: la ruta desaparece
    cuando se limpia el temporal, y "programa en carpeta temporal que se agrega
    a la clave Run" es justo el patron que Windows Defender marca como
    Behavior:Win32/Persistence.A!ml (reportado en el issue #2)."""
    path = path or exe_path()
    if not path:
        return False
    path = os.path.normcase(os.path.abspath(path))
    candidates = [os.environ.get("TEMP"), os.environ.get("TMP"),
                  os.path.join(os.environ.get("LOCALAPPDATA", ""), "Temp")]
    for base in candidates:
        if not base:
            continue
        base = os.path.normcase(os.path.abspath(base))
        if path == base or path.startswith(base + os.sep):
            return True
    return os.sep + "temp" + os.sep in path


def autostart_command() -> str | None:
    exe = exe_path()
    if not exe:
        return None
    return f'"{exe}" {AUTOSTART_FLAG}'


def is_autostart_enabled() -> bool:
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY) as key:
            value, _ = winreg.QueryValueEx(key, RUN_VALUE_NAME)
            return bool(value)
    except OSError:
        return False


def set_autostart(enabled: bool) -> bool:
    """Devuelve True si quedo como se pidio. Solo tiene sentido empaquetado
    (corriendo desde fuente no hay un .exe que registrar)."""
    if enabled and in_temp_location():
        logging.warning("Inicio automatico no registrado: el .exe corre desde una carpeta temporal")
        return False
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as key:
            if enabled:
                command = autostart_command()
                if not command:
                    return False
                winreg.SetValueEx(key, RUN_VALUE_NAME, 0, winreg.REG_SZ, command)
            else:
                try:
                    winreg.DeleteValue(key, RUN_VALUE_NAME)
                except FileNotFoundError:
                    pass
        return True
    except OSError as exc:
        logging.warning(f"No se pudo cambiar el inicio automatico ({exc})")
        return False


def cleanup_old_exe() -> None:
    # Despues de un auto-update, el .exe viejo queda renombrado al lado (no
    # se puede borrar un .exe mientras corre) - se limpia en el proximo inicio.
    exe = exe_path()
    if not exe:
        return
    old = exe + ".old"
    if os.path.exists(old):
        try:
            os.remove(old)
        except OSError:
            pass


def download_and_apply_update(download_url: str, expected_sha256: str | None, progress=None) -> str:
    """Baja el zip del release, saca TruckDash.exe, lo pone en el lugar del
    actual (renombrando el actual a .old) y relanza. Devuelve la ruta del
    .exe nuevo. Levanta una excepcion con mensaje legible si algo falla, sin
    dejar el .exe actual roto (solo se toca al final, cuando ya se verifico
    el nuevo)."""
    exe = exe_path()
    if not exe:
        raise RuntimeError("Auto-update only works with the packaged TruckDash.exe")

    if progress:
        progress("downloading")
    with urlopen(download_url, timeout=60) as resp:
        data = resp.read()

    if expected_sha256:
        actual = hashlib.sha256(data).hexdigest()
        if actual.lower() != expected_sha256.lower():
            raise RuntimeError("Downloaded file does not match the published SHA-256, update aborted")

    if progress:
        progress("unpacking")
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        members = [m for m in zf.namelist() if m.lower().endswith("truckdash.exe")]
        if not members:
            raise RuntimeError("TruckDash.exe not found inside the downloaded zip")
        new_exe_bytes = zf.read(members[0])

    tmp_dir = tempfile.mkdtemp(prefix="truckdash-update-")
    new_exe_tmp = os.path.join(tmp_dir, "TruckDash.exe")
    with open(new_exe_tmp, "wb") as f:
        f.write(new_exe_bytes)

    if progress:
        progress("installing")
    old = exe + ".old"
    if os.path.exists(old):
        os.remove(old)
    os.rename(exe, old)
    try:
        os.replace(new_exe_tmp, exe)
    except OSError:
        os.rename(old, exe)  # volver atras, el actual sigue sano
        raise
    return exe


def child_environment() -> dict:
    """Entorno para lanzar OTRA copia del .exe empaquetado. PyInstaller (modo
    onefile) le pasa al proceso hijo variables internas (_MEIPASS2 en
    versiones viejas, _PYI_* en las nuevas) que apuntan a la carpeta temporal
    ya extraida del proceso actual. Si el .exe nuevo las hereda, usa ESA
    carpeta (codigo viejo) en vez de extraer la suya, y cuando el proceso
    viejo sale intenta borrarla debajo del nuevo: "Failed to remove temporary
    directory" y la ventana de Setup del nuevo rota. Se limpian todas."""
    return {k: v for k, v in os.environ.items() if not k.startswith("_PYI_") and k != "_MEIPASS2"}


def relaunch_and_exit(exe: str, extra_args: list[str] | None = None, stop_callback=None) -> None:
    """Lanza el .exe nuevo como proceso independiente y cierra este. Con
    stop_callback (ej. parar el icono de la bandeja) el cierre es ordenado, y
    el bootloader de PyInstaller limpia su carpeta temporal sin quejarse; si
    en 5 s no termino, se fuerza."""
    flags = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    subprocess.Popen([exe, *(extra_args or [])], close_fds=True, env=child_environment(), cwd=os.path.dirname(exe), creationflags=flags)
    if stop_callback:
        import threading
        threading.Timer(5.0, lambda: os._exit(0)).start()
        try:
            stop_callback()
            return
        except Exception:
            pass
    os._exit(0)

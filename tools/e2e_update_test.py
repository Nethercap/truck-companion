"""
Prueba de punta a punta del auto-update, con dos .exe de verdad.

El auto-update es de esas cosas que no se pueden probar con tests comunes: lo
que falla es un .exe onefile reemplazandose a si mismo con Windows y el
antivirus de por medio (ver issue #5). Esto compila una sonda chiquita dos
veces (version A y version B), "instala" la A, publica la B como si fuera el
zip de un release, corre la A con --apply-update y verifica que el archivo
quedo reemplazado y que la B arranco sola.

La sonda usa el mismo win_integration del cliente pero sin bandeja, sin mutex
de instancia unica y sin backend: prueba el unico camino que importa sin
abrir ventanas ni pelearse con el cliente que este corriendo.

  python tools/e2e_update_test.py

Requiere PyInstaller. Tarda un par de minutos: son dos compilaciones.
"""

import http.server
import io
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLIENT = os.path.join(ROOT, "client")
WORK = os.path.join(ROOT, ".e2e-update")

PROBE = '''"""Sonda del test de auto-update (la genera tools/e2e_update_test.py)."""
import argparse
import logging
import os
import sys

import win_integration

VERSION = "__VERSION__"


def main():
    logging.basicConfig(filename=os.path.join(os.path.dirname(sys.executable), "probe.log"),
                        level=logging.INFO, format="%(asctime)s [" + VERSION + "] %(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply-update", default=None)
    ap.add_argument("--finish-update", action="store_true")
    ap.add_argument("--target", default=None)
    ap.add_argument("--wait-pid", type=int, default=None)
    ap.add_argument("--mark", default=None)
    args = ap.parse_args()
    logging.info("arranca %s pid=%s exe=%s", sys.argv[1:], os.getpid(), sys.executable)

    if args.mark:
        with open(args.mark, "w", encoding="utf-8") as f:
            f.write(VERSION)
        return 0

    if args.finish_update:
        mark = os.path.join(os.path.dirname(args.target), "arranco.txt")
        rc = win_integration.finish_update(args.target, args.wait_pid, ["--mark", mark])
        logging.info("finish_update -> %s", rc)
        return rc

    if args.apply_update:
        staged = win_integration.stage_update(args.apply_update, None,
                                              progress=lambda k: logging.info("update: %s", k))
        win_integration.start_updater(staged)
        win_integration.stop_and_exit()
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
'''


def build(version: str) -> str:
    build_dir = os.path.join(WORK, "build-" + version)
    os.makedirs(build_dir, exist_ok=True)
    script = os.path.join(build_dir, "probe.py")
    io.open(script, "w", encoding="utf-8", newline="\n").write(PROBE.replace("__VERSION__", version))
    cmd = [sys.executable, "-m", "PyInstaller", "--onefile", "--noconsole", "--clean",
           "--name", "TruckDash", "--distpath", os.path.join(build_dir, "dist"),
           "--workpath", os.path.join(build_dir, "work"),
           "--specpath", build_dir, "--paths", CLIENT, script]
    print("compilando", version, "...", flush=True)
    result = subprocess.run(cmd, capture_output=True, text=True)
    exe = os.path.join(build_dir, "dist", "TruckDash.exe")
    if result.returncode != 0 or not os.path.exists(exe):
        print(result.stdout[-2000:])
        print(result.stderr[-2000:])
        raise SystemExit("no compilo " + version)
    print(f"  -> {exe} ({os.path.getsize(exe)/1e6:.1f} MB)")
    return exe


def serve(directory: str) -> int:
    def handler(*a, **kw):
        return http.server.SimpleHTTPRequestHandler(*a, directory=directory, **kw)

    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return port


def main() -> int:
    shutil.rmtree(WORK, ignore_errors=True)
    os.makedirs(WORK, exist_ok=True)

    exe_a = build("A")
    exe_b = build("B")
    bytes_b = open(exe_b, "rb").read()

    install = os.path.join(WORK, "install")
    os.makedirs(install, exist_ok=True)
    target = os.path.join(install, "TruckDash.exe")
    shutil.copy2(exe_a, target)

    pub = os.path.join(WORK, "pub")
    os.makedirs(pub, exist_ok=True)
    zip_path = os.path.join(pub, "TruckDash-windows.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(exe_b, "TruckDash/TruckDash.exe")
    url = f"http://127.0.0.1:{serve(pub)}/TruckDash-windows.zip"
    print("release en", url)

    mark = os.path.join(install, "arranco.txt")
    print("corriendo la A con --apply-update ...", flush=True)
    subprocess.Popen([target, "--apply-update", url], cwd=install)

    arranco = False
    for _ in range(120):
        time.sleep(1)
        if os.path.exists(mark):
            arranco = True
            break

    reemplazado = open(target, "rb").read() == bytes_b
    print()
    print("la version nueva arranco sola:", arranco,
          "->", io.open(mark, encoding="utf-8").read() if arranco else "-")
    print("TruckDash.exe quedo reemplazado:", reemplazado)
    log = os.path.join(install, "probe.log")
    if os.path.exists(log):
        print("--- probe.log ---")
        print(io.open(log, encoding="utf-8", errors="replace").read())
    ok = arranco and reemplazado
    print("RESULTADO:", "OK" if ok else "FALLO")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

# -*- mode: python ; coding: utf-8 -*-
# Build: cd client && pyinstaller TruckDash.spec
# (mismo comando que corre .github/workflows/build-client.yml)

# --- Metadatos del .exe (issue #2: falsos positivos de antivirus) ---
# Un .exe sin recurso de version, empaquetado con UPX y sin firmar es el
# retrato robot del malware para los motores heuristicos/ML. La firma digital
# es lo unico que lo resuelve del todo (SignPath, en tramite), pero el recurso
# de version + no comprimir con UPX quitan dos de las tres senales.
import re

_src = open("client.py", encoding="utf-8").read()
CLIENT_VERSION = re.search(r'^CLIENT_VERSION = "([0-9.]+)"', _src, re.M).group(1)
_v = tuple(int(n) for n in (CLIENT_VERSION.split(".") + ["0", "0", "0"])[:4])

with open("version_info.txt", "w", encoding="utf-8") as _f:
    _f.write(f"""VSVersionInfo(
  ffi=FixedFileInfo(filevers={_v}, prodvers={_v}, mask=0x3f, flags=0x0, OS=0x40004, fileType=0x1, subtype=0x0, date=(0, 0)),
  kids=[
    StringFileInfo([StringTable('040904B0', [
      StringStruct('CompanyName', 'Nethercap'),
      StringStruct('FileDescription', 'Truck Dash - telemetry client for ETS2 / ATS'),
      StringStruct('FileVersion', '{CLIENT_VERSION}'),
      StringStruct('InternalName', 'TruckDash'),
      StringStruct('LegalCopyright', 'Copyright (c) 2026 Nethercap - MIT License'),
      StringStruct('OriginalFilename', 'TruckDash.exe'),
      StringStruct('ProductName', 'Truck Dash'),
      StringStruct('ProductVersion', '{CLIENT_VERSION}'),
      StringStruct('Comments', 'Open source: https://github.com/Nethercap/truck-companion'),
    ])]),
    VarFileInfo([VarStruct('Translation', [1033, 1200])]),
  ],
)
""")

a = Analysis(
    ['tray_client.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('vendor/scs-telemetry.dll', 'vendor'),  # plugin de telemetria que el cliente instala en el juego
        ('assets/icon.png', 'assets'),          # icono de la bandeja (logo real)
    ],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='TruckDash',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,  # comprimir con UPX dispara detecciones heuristicas (issue #2)
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='assets/icon.ico',
    version='version_info.txt',
)

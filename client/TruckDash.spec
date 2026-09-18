# -*- mode: python ; coding: utf-8 -*-
# Build: cd client && pyinstaller TruckDash.spec
# (mismo comando que corre .github/workflows/build-client.yml)

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
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='assets/icon.ico',
)

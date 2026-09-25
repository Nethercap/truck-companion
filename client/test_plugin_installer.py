"""Tests de plugin_installer.py y win_integration.py (sin registro real ni Steam)."""

import hashlib
import io
import os
import zipfile

import plugin_installer
import win_integration

SAMPLE_VDF = r'''
"libraryfolders"
{
	"0"
	{
		"path"		"D:\Program Files (x86)\Steam"
		"label"		""
	}
	"1"
	{
		"path"		"E:\SteamLibrary"
		"label"		"Games"
	}
	"2"
	{
		"path"		"D:\Program Files (x86)\Steam"
	}
}
'''


def test_parse_libraryfolders_unescapes_and_dedupes():
    paths = plugin_installer.parse_libraryfolders(SAMPLE_VDF)
    assert paths == [os.path.normpath(r"D:\Program Files (x86)\Steam"), os.path.normpath(r"E:\SteamLibrary")]


def test_plugin_state_missing_installed_outdated(tmp_path, monkeypatch):
    bin_dir = tmp_path / "bin" / "win_x64"
    bin_dir.mkdir(parents=True)
    assert plugin_installer.plugin_state(str(bin_dir)) == "missing"

    plugins = bin_dir / "plugins"
    plugins.mkdir()
    (plugins / "scs-telemetry.dll").write_bytes(b"something else")
    assert plugin_installer.plugin_state(str(bin_dir)) == "outdated"

    real = b"fake dll bytes"
    monkeypatch.setattr(plugin_installer, "PLUGIN_DLL_SHA256", hashlib.sha256(real).hexdigest())
    (plugins / "scs-telemetry.dll").write_bytes(real)
    assert plugin_installer.plugin_state(str(bin_dir)) == "installed"


def test_install_plugin_copies_bundled_dll_and_creates_plugins_dir(tmp_path, monkeypatch):
    fake_dll = tmp_path / "vendor" / "scs-telemetry.dll"
    fake_dll.parent.mkdir()
    fake_dll.write_bytes(b"dll contents")
    monkeypatch.setattr(plugin_installer, "bundled_dll_path", lambda: str(fake_dll))
    monkeypatch.setattr(plugin_installer, "PLUGIN_DLL_SHA256", hashlib.sha256(b"dll contents").hexdigest())

    bin_dir = tmp_path / "game" / "bin" / "win_x64"
    bin_dir.mkdir(parents=True)
    installed = plugin_installer.install_plugin(str(bin_dir))
    assert installed == os.path.join(str(bin_dir), "plugins", "scs-telemetry.dll")
    assert open(installed, "rb").read() == b"dll contents"
    assert plugin_installer.plugin_state(str(bin_dir)) == "installed"


def test_install_plugin_refuses_tampered_bundled_dll(tmp_path, monkeypatch):
    fake_dll = tmp_path / "scs-telemetry.dll"
    fake_dll.write_bytes(b"tampered")
    monkeypatch.setattr(plugin_installer, "bundled_dll_path", lambda: str(fake_dll))
    try:
        plugin_installer.install_plugin(str(tmp_path))
    except ValueError:
        pass
    else:
        raise AssertionError("expected ValueError for SHA mismatch")


def test_bundled_dll_matches_pinned_sha256():
    # El .dll vendoreado en el repo tiene que ser exactamente el que dice el
    # codigo - si se actualiza uno sin el otro, install_plugin va a rechazarlo.
    path = plugin_installer.bundled_dll_path()
    assert os.path.exists(path), path
    assert plugin_installer.sha256_of(path) == plugin_installer.PLUGIN_DLL_SHA256


def test_resolve_bin_dir_accepts_game_root_bin_or_win_x64(tmp_path):
    root = tmp_path / "American Truck Simulator"
    win = root / "bin" / "win_x64"
    win.mkdir(parents=True)
    (win / "amtrucks.exe").write_bytes(b"")
    expected = os.path.normpath(str(win))
    assert plugin_installer.resolve_bin_dir(str(root)) == expected
    assert plugin_installer.resolve_bin_dir(str(root / "bin")) == expected
    assert plugin_installer.resolve_bin_dir(str(win)) == expected
    assert plugin_installer.resolve_bin_dir(str(tmp_path)) is None
    assert plugin_installer.game_for_bin_dir(expected) == "ats"


def _fake_zip():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("TruckDash/TruckDash.exe", b"new exe")
    return buf.getvalue()


def _fake_urlopen(monkeypatch, payload):
    class FakeResp:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            return payload

    monkeypatch.setattr(win_integration, "urlopen", lambda url, timeout=0: FakeResp())


def test_stage_update_verifies_sha_and_leaves_the_running_exe_alone(tmp_path, monkeypatch):
    exe = tmp_path / "TruckDash.exe"
    exe.write_bytes(b"old exe")
    monkeypatch.setattr(win_integration, "exe_path", lambda: str(exe))
    zip_bytes = _fake_zip()
    _fake_urlopen(monkeypatch, zip_bytes)

    try:
        win_integration.stage_update("https://x/y.zip", "0" * 64)
    except RuntimeError as exc:
        assert "SHA-256" in str(exc)
    else:
        raise AssertionError("expected SHA mismatch to abort")
    assert exe.read_bytes() == b"old exe"
    assert not (tmp_path / "TruckDash.new.exe").exists()

    staged = win_integration.stage_update("https://x/y.zip", hashlib.sha256(zip_bytes).hexdigest())
    assert staged == str(tmp_path / "TruckDash.new.exe")
    # Lo nuevo queda al lado; el que corre sigue intacto hasta que lo pise el
    # ayudante desde afuera.
    assert (tmp_path / "TruckDash.new.exe").read_bytes() == b"new exe"
    assert exe.read_bytes() == b"old exe"


def test_finish_update_replaces_the_target_and_launches_it(tmp_path, monkeypatch):
    exe = tmp_path / "TruckDash.exe"
    exe.write_bytes(b"old exe")
    staged = tmp_path / "TruckDash.new.exe"
    staged.write_bytes(b"new exe")
    monkeypatch.setattr(win_integration, "exe_path", lambda: str(staged))

    waited = []
    monkeypatch.setattr(win_integration, "wait_for_process", lambda pid, timeout=0: waited.append(pid) or True)
    launched = []
    monkeypatch.setattr(win_integration.subprocess, "Popen", lambda args, **kw: launched.append(args))

    assert win_integration.finish_update(str(exe), 4321, ["--autostart"]) == 0
    assert waited == [4321]           # espera al viejo, no duerme un rato fijo
    assert exe.read_bytes() == b"new exe"
    assert launched == [[str(exe), "--autostart"]]


def test_finish_update_retries_while_the_file_is_locked(tmp_path, monkeypatch):
    exe = tmp_path / "TruckDash.exe"
    exe.write_bytes(b"old exe")
    staged = tmp_path / "TruckDash.new.exe"
    staged.write_bytes(b"new exe")
    monkeypatch.setattr(win_integration, "exe_path", lambda: str(staged))
    monkeypatch.setattr(win_integration, "wait_for_process", lambda pid, timeout=0: True)
    monkeypatch.setattr(win_integration, "UPDATE_COPY_WAIT", 0)
    monkeypatch.setattr(win_integration.subprocess, "Popen", lambda args, **kw: None)

    real_copy = win_integration.shutil.copy2
    intentos = []

    def flaky(src, dst):
        intentos.append(1)
        if len(intentos) < 3:
            raise PermissionError("el antivirus lo tiene tomado")
        return real_copy(src, dst)

    monkeypatch.setattr(win_integration.shutil, "copy2", flaky)
    assert win_integration.finish_update(str(exe), None) == 0
    assert len(intentos) == 3
    assert exe.read_bytes() == b"new exe"


def test_finish_update_gives_up_instead_of_hanging(tmp_path, monkeypatch):
    exe = tmp_path / "TruckDash.exe"
    exe.write_bytes(b"old exe")
    staged = tmp_path / "TruckDash.new.exe"
    staged.write_bytes(b"new exe")
    monkeypatch.setattr(win_integration, "exe_path", lambda: str(staged))
    monkeypatch.setattr(win_integration, "wait_for_process", lambda pid, timeout=0: True)
    monkeypatch.setattr(win_integration, "UPDATE_COPY_WAIT", 0)
    monkeypatch.setattr(win_integration, "UPDATE_COPY_TRIES", 3)
    launched = []
    monkeypatch.setattr(win_integration.subprocess, "Popen", lambda args, **kw: launched.append(args))

    def always_locked(src, dst):
        raise PermissionError("nunca se suelta")

    monkeypatch.setattr(win_integration.shutil, "copy2", always_locked)
    # Devuelve error en vez de quedarse esperando, y no arranca nada roto.
    assert win_integration.finish_update(str(exe), None) == 1
    assert exe.read_bytes() == b"old exe"
    assert launched == []


def test_cleanup_removes_both_leftovers(tmp_path, monkeypatch):
    exe = tmp_path / "TruckDash.exe"
    exe.write_bytes(b"exe")
    monkeypatch.setattr(win_integration, "exe_path", lambda: str(exe))
    (tmp_path / "TruckDash.exe.old").write_bytes(b"viejo")
    (tmp_path / "TruckDash.new.exe").write_bytes(b"ayudante")

    win_integration.cleanup_old_exe()
    assert not (tmp_path / "TruckDash.exe.old").exists()
    assert not (tmp_path / "TruckDash.new.exe").exists()
    assert exe.exists()


def test_child_environment_drops_pyinstaller_internals(monkeypatch):
    monkeypatch.setenv("_MEIPASS2", r"C:\Temp\_MEI1")
    monkeypatch.setenv("_PYI_ARCHIVE_FILE", "x")
    monkeypatch.setenv("_PYI_PARENT_PROCESS_LEVEL", "1")
    monkeypatch.setenv("PATH_KEEP_ME", "1")
    env = win_integration.child_environment()
    assert "_MEIPASS2" not in env
    assert not any(k.startswith("_PYI_") for k in env)
    assert env["PATH_KEEP_ME"] == "1"


def test_same_dir_reconoce_la_misma_carpeta_por_dos_rutas(tmp_path):
    r"""Bajo Proton, Wine expone la misma carpeta de Linux por Z:\ y por
    cualquier letra mapeada. Comparando cadenas, la deteccion automatica y la
    carpeta agregada a mano daban dos entradas del mismo juego: un tester
    quedo con 4 para 2 juegos."""
    import os
    real = tmp_path / "Euro Truck Simulator 2" / "bin" / "win_x64"
    real.mkdir(parents=True)
    assert plugin_installer.same_dir(str(real), str(real)) is True
    # La misma carpeta escrita distinto: con separadores redundantes, con
    # un ".." en el medio y con otra capitalizacion.
    otra = os.path.join(str(tmp_path), "Euro Truck Simulator 2", "bin", "..", "bin", "win_x64")
    assert plugin_installer.same_dir(str(real), otra) is True
    assert plugin_installer.same_dir(str(real), str(real).upper()) is True
    # Y dos carpetas distintas siguen siendo distintas.
    otra_real = tmp_path / "American Truck Simulator" / "bin" / "win_x64"
    otra_real.mkdir(parents=True)
    assert plugin_installer.same_dir(str(real), str(otra_real)) is False


def test_same_dir_no_explota_con_rutas_que_no_existen():
    """samefile necesita que los dos existan; si no, se cae a comparar texto
    en vez de tirar una excepcion en medio del listado de juegos."""
    assert plugin_installer.same_dir("/no/existe/a", "/no/existe/b") is False
    assert plugin_installer.same_dir("/no/existe/a", "/no/existe/a") is True


def _fake_install(raiz, nombre, con_exe=True, con_plugin=False):
    """Arma <raiz>/steamapps/common/<nombre>/bin/win_x64 y devuelve esa ruta."""
    bin_dir = raiz / "steamapps" / "common" / nombre / "bin" / "win_x64"
    bin_dir.mkdir(parents=True)
    if con_exe:
        exe = "eurotrucks2.exe" if "Euro" in nombre else "amtrucks.exe"
        (bin_dir / exe).write_bytes(b"MZ")
    if con_plugin:
        (bin_dir / "plugins").mkdir()
        (bin_dir / "plugins" / plugin_installer.PLUGIN_DLL_NAME).write_bytes(b"dll")
    return bin_dir


def test_tiene_ejecutable_distingue_una_carpeta_fantasma(tmp_path):
    r"""Al desinstalar, Steam borra lo suyo pero NO la carpeta plugins\ que
    creamos nosotros, asi que el arbol sobrevive. Esa copia no es un juego."""
    viva = _fake_install(tmp_path, "American Truck Simulator")
    fantasma = _fake_install(tmp_path / "vieja", "American Truck Simulator",
                             con_exe=False, con_plugin=True)
    assert os.path.isdir(str(fantasma))  # el directorio existe igual
    assert plugin_installer.tiene_ejecutable(str(viva)) is True
    assert plugin_installer.tiene_ejecutable(str(fantasma)) is False


def test_find_game_installs_ignora_las_carpetas_sin_juego(tmp_path, monkeypatch):
    """Es el reporte de Kesh: ATS listado varias veces, una de ellas una copia
    que ya no esta instalada."""
    buena = tmp_path / "biblioteca"
    vieja = tmp_path / "vieja"
    _fake_install(buena, "American Truck Simulator")
    _fake_install(vieja, "American Truck Simulator", con_exe=False, con_plugin=True)
    monkeypatch.setattr(plugin_installer, "steam_library_paths",
                        lambda: [str(buena), str(vieja)])
    encontrados = plugin_installer.find_game_installs()
    assert len(encontrados) == 1
    assert plugin_installer.same_dir(
        encontrados[0]["bin_dir"],
        str(buena / "steamapps" / "common" / "American Truck Simulator" / "bin" / "win_x64"))


def test_find_game_installs_no_repite_la_misma_biblioteca(tmp_path, monkeypatch):
    """La raiz de Steam aparece por el registro y otra vez en el .vdf."""
    lib = tmp_path / "Steam"
    _fake_install(lib, "American Truck Simulator")
    _fake_install(lib, "Euro Truck Simulator 2")
    monkeypatch.setattr(plugin_installer, "steam_library_paths",
                        lambda: [str(lib), str(lib), os.path.join(str(lib), "otra", "..")])
    encontrados = plugin_installer.find_game_installs()
    assert sorted(i["game"] for i in encontrados) == ["ats", "ets2"]


def test_find_game_installs_si_acepta_dos_copias_de_verdad(tmp_path, monkeypatch):
    """Dos instalaciones reales en bibliotecas distintas son dos entradas
    legitimas: lo que se saca son las fantasma, no las repetidas de verdad."""
    a, b = tmp_path / "a", tmp_path / "b"
    _fake_install(a, "American Truck Simulator")
    _fake_install(b, "American Truck Simulator")
    monkeypatch.setattr(plugin_installer, "steam_library_paths", lambda: [str(a), str(b)])
    encontrados = plugin_installer.find_game_installs()
    assert len(encontrados) == 2
    # Y como se llaman igual, la UI necesita la carpeta para distinguirlas.
    assert encontrados[0]["bin_dir"] != encontrados[1]["bin_dir"]


def test_describe_install_marca_el_origen(tmp_path):
    bin_dir = _fake_install(tmp_path, "American Truck Simulator")
    auto = plugin_installer.describe_install("ats", str(bin_dir))
    mano = plugin_installer.describe_install("ats", str(bin_dir), origen="manual")
    assert auto["origen"] == "steam"
    assert mano["origen"] == "manual"

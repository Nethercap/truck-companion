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


def test_download_and_apply_update_verifies_sha_and_swaps_exe(tmp_path, monkeypatch):
    exe = tmp_path / "TruckDash.exe"
    exe.write_bytes(b"old exe")
    monkeypatch.setattr(win_integration, "exe_path", lambda: str(exe))

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("TruckDash/TruckDash.exe", b"new exe")
    zip_bytes = buf.getvalue()

    class FakeResp:
        def __enter__(self):
            return self
        def __exit__(self, *a):
            return False
        def read(self):
            return zip_bytes

    monkeypatch.setattr(win_integration, "urlopen", lambda url, timeout=0: FakeResp())

    try:
        win_integration.download_and_apply_update("https://x/y.zip", "0" * 64)
    except RuntimeError as exc:
        assert "SHA-256" in str(exc)
    else:
        raise AssertionError("expected SHA mismatch to abort")
    assert exe.read_bytes() == b"old exe"  # no se toco

    good_sha = hashlib.sha256(zip_bytes).hexdigest()
    result = win_integration.download_and_apply_update("https://x/y.zip", good_sha)
    assert result == str(exe)
    assert exe.read_bytes() == b"new exe"
    assert (tmp_path / "TruckDash.exe.old").read_bytes() == b"old exe"

    win_integration.cleanup_old_exe()
    assert not (tmp_path / "TruckDash.exe.old").exists()

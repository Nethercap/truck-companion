"""Tests del soporte de macOS (PR #87): lo de Mac solo en Mac, y Windows y
Linux como antes."""

import hashlib
import os
import sys

import pytest

import client
import keys_compat
import map_builder
import plugin_installer

VDF_LINUX = r'''
"libraryfolders"
{
	"0"
	{
		"path"		"/home/ana/.steam/steam"
	}
}
'''


def _app_mac(tmp_path):
    macos = tmp_path / "Euro Truck Simulator 2" / "Euro Truck Simulator 2.app" / "Contents" / "MacOS"
    macos.mkdir(parents=True)
    (macos / "eurotrucks2").write_bytes(b"")
    return macos


def test_libraryfolders_la_ruta_cruda_solo_en_mac(monkeypatch):
    # Bajo Proton la ruta de Linux va por Z: de Wine; la cruda no existe ahi
    monkeypatch.setattr(sys, "platform", "linux")
    assert "/home/ana/.steam/steam" not in plugin_installer.parse_libraryfolders(VDF_LINUX)
    monkeypatch.setattr(sys, "platform", "darwin")
    assert "/home/ana/.steam/steam" in plugin_installer.parse_libraryfolders(VDF_LINUX)


def test_el_ejecutable_sin_exe_solo_cuenta_en_mac(tmp_path, monkeypatch):
    # En Linux, bin/linux_x64 (el juego nativo) tiene esos nombres y no lleva nuestra .dll
    (tmp_path / "eurotrucks2").write_bytes(b"")
    monkeypatch.setattr(sys, "platform", "linux")
    assert plugin_installer.tiene_ejecutable(str(tmp_path)) is False
    monkeypatch.setattr(sys, "platform", "darwin")
    assert plugin_installer.tiene_ejecutable(str(tmp_path)) is True


def test_en_mac_sin_la_dylib_o_sin_su_hash_no_se_instala_nada(tmp_path, monkeypatch):
    macos = _app_mac(tmp_path)
    vendor = tmp_path / "vendor"
    vendor.mkdir()
    (vendor / plugin_installer.PLUGIN_DLL_NAME).write_bytes(b"dll de windows")
    monkeypatch.setattr(sys, "_MEIPASS", str(tmp_path), raising=False)
    # Nunca la .dll de Windows en un juego de Mac
    with pytest.raises(FileNotFoundError):
        plugin_installer.install_plugin(str(macos))
    assert not (macos / "plugins").exists()
    # La dylib sin hash conocido tampoco: no se puede verificar
    (vendor / plugin_installer.PLUGIN_DYLIB_NAME).write_bytes(b"dylib")
    monkeypatch.setattr(plugin_installer, "PLUGIN_DYLIB_SHA256", "")
    with pytest.raises(ValueError):
        plugin_installer.install_plugin(str(macos))
    assert not (macos / "plugins").exists()
    # Con su hash, se instala la dylib
    monkeypatch.setattr(plugin_installer, "PLUGIN_DYLIB_SHA256", hashlib.sha256(b"dylib").hexdigest())
    dst = plugin_installer.install_plugin(str(macos))
    assert os.path.basename(dst) == plugin_installer.PLUGIN_DYLIB_NAME
    assert plugin_installer.plugin_state(str(macos)) == "installed"
    # Sin hash conocido, el instalado no se da por nuestro
    monkeypatch.setattr(plugin_installer, "PLUGIN_DYLIB_SHA256", "")
    assert plugin_installer.plugin_state(str(macos)) == "outdated"


def test_dlc_de_mapa_en_mac(tmp_path):
    macos = _app_mac(tmp_path)
    resources = macos.parent / "Resources"
    resources.mkdir()
    (resources / "dlc_east.scs").write_bytes(b"")
    (tmp_path / "Euro Truck Simulator 2" / "dlc_north.scs").write_bytes(b"")
    assert client.read_installed_dlcs([{"game": "ets2", "bin_dir": str(macos)}]) == {"ets2": ["east", "north"]}


def test_teclas_del_perfil_en_mac(tmp_path, monkeypatch):
    perfil = tmp_path / "Euro Truck Simulator 2" / "profiles" / "abc"
    perfil.mkdir(parents=True)
    (perfil / "controls.sii").write_text("")
    (perfil / "controls_osx.sii").write_text("")
    monkeypatch.setattr(client, "documents_folder", lambda: str(tmp_path))
    monkeypatch.setattr(sys, "platform", "darwin")
    assert [os.path.basename(f) for f in client.find_controls_sii_files()] == ["controls_osx.sii"]
    monkeypatch.setattr(sys, "platform", "win32")
    assert [os.path.basename(f) for f in client.find_controls_sii_files()] == ["controls.sii"]


def test_teclas_de_mac_sin_f21_a_f24():
    assert keys_compat.MAC_KEYCODES["f20"] == 0x5A
    assert not any(k in keys_compat.MAC_KEYCODES for k in ("f21", "f22", "f23", "f24"))


def test_accesibilidad_se_pide_una_vez_por_corrida(monkeypatch):
    abiertos = []
    monkeypatch.setattr(keys_compat.MacOSBackend, "is_trusted", staticmethod(lambda: False))
    monkeypatch.setattr(keys_compat.MacOSBackend, "request_accessibility", staticmethod(lambda: abiertos.append(1)))
    monkeypatch.setattr(keys_compat.MacOSBackend, "_accessibility_prompted", False)
    backend = object.__new__(keys_compat.MacOSBackend)
    for _ in range(3):
        backend._check_and_prompt_accessibility()
    assert abiertos == [1]


def test_armador_sin_node_exe_se_baja_de_nuevo_en_windows(tmp_path, monkeypatch):
    """Un antivirus que pone node.exe en cuarentena: la carpeta se baja de nuevo."""
    destino = tmp_path / "builder"
    (destino / "bin").mkdir(parents=True)
    for nombre in ("parser.mjs", "generator.mjs", "tiles.mjs"):
        (destino / "bin" / nombre).write_text("")
    monkeypatch.delenv("TRUCKDASH_MAP_BUILDER", raising=False)
    monkeypatch.setattr(map_builder, "builder_dir", lambda version: str(destino))
    monkeypatch.setattr(sys, "platform", "win32")

    class Bajando(Exception):
        pass

    def abrir(*args, **kwargs):
        raise Bajando()

    monkeypatch.setattr(map_builder.red, "abrir", abrir)
    with pytest.raises(Bajando):
        map_builder.ensure_builder("1.0")
    (destino / "node.exe").write_bytes(b"")
    assert map_builder.ensure_builder("1.0") == str(destino)

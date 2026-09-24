"""Tests de las funciones puras de client.py (sin tocar el SDK/websocket real)."""

import inspect
import os
import sys
import tempfile

import client
import i18n
import keys_compat
import win_integration


def test_http_base_url_converts_ws_schemes():
    assert client.http_base_url("wss://foo.up.railway.app") == "https://foo.up.railway.app"
    assert client.http_base_url("ws://localhost:8123") == "http://localhost:8123"


def test_is_newer_version_numeric_not_lexicographic():
    assert client.is_newer_version("1.2.10", "1.2.9") is True
    assert client.is_newer_version("1.2.9", "1.2.10") is False
    assert client.is_newer_version("1.0.1", "1.0.1") is False
    assert client.is_newer_version("2.0.0", "1.9.9") is True


def test_build_payload_converts_speed_from_ms_to_kmh():
    raw = {"speed": 27.78, "speedLimit": 22.22, "game": 2}
    payload = client.build_payload(raw)
    assert payload["speedKmh"] == round(27.78 * 3.6, 1)
    assert payload["speedLimitKmh"] == round(22.22 * 3.6, 1)
    assert payload["game"] == "ats"


def test_build_payload_maps_game_enum():
    assert client.build_payload({"game": 0})["game"] is None
    assert client.build_payload({"game": 1})["game"] == "ets2"
    assert client.build_payload({"game": 2})["game"] == "ats"


def test_build_payload_fuel_avg_consumption_scaled_to_per_100km():
    # el SDK reporta litros/km; se multiplica por 100 para litros/100km.
    payload = client.build_payload({"fuelAvgConsumption": 0.35})
    assert payload["fuelAvgConsumption"] == 35.0


def test_build_payload_fuel_avg_consumption_none_when_zero():
    payload = client.build_payload({"fuelAvgConsumption": 0})
    assert payload["fuelAvgConsumption"] is None


def test_build_payload_handles_missing_fields_gracefully():
    payload = client.build_payload({})
    assert payload["speedKmh"] == 0
    assert payload["cargo"] is None
    assert payload["position"] == {"x": None, "y": None, "z": None}


def test_build_payload_job_deadline_seconds_from_game_minutes():
    payload = client.build_payload({"time_abs": 1000, "time_abs_delivery": 1090})
    assert payload["jobDeadlineSeconds"] == 90 * 60


def test_build_payload_job_deadline_none_without_active_job():
    payload = client.build_payload({"time_abs": 1000, "time_abs_delivery": 0})
    assert payload["jobDeadlineSeconds"] is None
    payload = client.build_payload({})
    assert payload["jobDeadlineSeconds"] is None


def test_build_payload_includes_control_states_for_command_highlighting():
    payload = client.build_payload({
        "engineEnabled": True, "parkBrake": True, "differentialLock": False,
        "liftAxleIndicator": True, "trailer": [{"attached": True}],
    })
    assert payload["engineEnabled"] is True
    assert payload["parkingBrake"] is True
    assert payload["differentialLock"] is False
    assert payload["liftAxle"] is True
    assert payload["trailerAttached"] is True


def test_build_payload_trailer_attached_false_when_no_trailer_data():
    assert client.build_payload({})["trailerAttached"] is False
    assert client.build_payload({"trailer": []})["trailerAttached"] is False


def test_send_game_command_ignored_when_no_key_assigned(monkeypatch):
    called = []
    monkeypatch.setattr(client, "find_game_window", lambda: called.append("find_window"))
    client.send_game_command("toggle_differential_lock", client.DEFAULT_KEYBINDS)
    assert called == []  # ni siquiera busca la ventana si no hay tecla asignada


def test_send_game_command_ignored_when_game_window_not_found(monkeypatch):
    monkeypatch.setattr(client, "find_game_window", lambda: None)
    called = []
    monkeypatch.setattr(client.keys_compat, "press", lambda key: called.append(key))
    client.send_game_command("toggle_hazards", client.DEFAULT_KEYBINDS)
    assert called == []


def test_send_game_command_presses_key_and_focuses_window(monkeypatch):
    monkeypatch.setattr(client, "find_game_window", lambda: 12345)
    focused = []
    monkeypatch.setattr(client, "bring_window_to_foreground", lambda hwnd: focused.append(hwnd))
    pressed = []
    monkeypatch.setattr(client.keys_compat, "press", lambda key: pressed.append(key))
    client.send_game_command("toggle_hazards", client.DEFAULT_KEYBINDS)
    assert focused == [12345]
    assert pressed == ["z"]


def test_save_and_load_keybinds_roundtrip(tmp_path, monkeypatch):
    fake_path = str(tmp_path / "keybinds.json")
    monkeypatch.setattr(client, "keybinds_path", lambda: fake_path)
    # Sin esto, load_keybinds() detecta el controls.sii real de la maquina
    # que corre el test (si el juego esta instalado) y pisa lo que guardamos.
    monkeypatch.setattr(client, "detect_keybinds_from_controls_sii", lambda: {})
    client.save_keybinds({**client.DEFAULT_KEYBINDS, "toggle_hazards": "x"})
    loaded = client.load_keybinds()
    assert loaded["toggle_hazards"] == "x"
    assert loaded["toggle_engine"] == "e"  # el resto se mantiene


class _FakeWs:
    def __init__(self, messages):
        self._messages = list(messages)
        self.sent = []

    def __aiter__(self):
        return self

    async def __anext__(self):
        if not self._messages:
            raise StopAsyncIteration
        return self._messages.pop(0)

    async def send(self, text):
        self.sent.append(text)


def test_receive_commands_replies_to_get_keybinds(monkeypatch):
    import asyncio
    monkeypatch.setattr(client, "detect_keybinds_from_controls_sii", lambda: {})
    ws = _FakeWs([client.json.dumps({"type": "get_keybinds"})])
    keybinds = dict(client.DEFAULT_KEYBINDS)
    asyncio.run(client.receive_commands(ws, keybinds))
    assert len(ws.sent) == 1
    reply = client.json.loads(ws.sent[0])
    assert reply["type"] == "keybinds"
    assert reply["data"]["toggle_hazards"] == "z"


def test_receive_commands_applies_and_persists_set_keybinds(tmp_path, monkeypatch):
    import asyncio
    fake_path = str(tmp_path / "keybinds.json")
    monkeypatch.setattr(client, "keybinds_path", lambda: fake_path)
    monkeypatch.setattr(client, "detect_keybinds_from_controls_sii", lambda: {})
    ws = _FakeWs([client.json.dumps({"type": "set_keybinds", "data": {"toggle_hazards": "x", "unknown_action": "q"}})])
    keybinds = dict(client.DEFAULT_KEYBINDS)
    asyncio.run(client.receive_commands(ws, keybinds))
    assert keybinds["toggle_hazards"] == "x"
    assert "unknown_action" not in keybinds  # se ignoran acciones desconocidas
    assert client.load_keybinds()["toggle_hazards"] == "x"  # quedo persistido


_SAMPLE_CONTROLS_SII = r"""SiiNunit
{
input_config : _nameless.1 {
 config_lines[0]: "device keyboard `di8.keyboard`"
 config_lines[1]: "mix beacon `unbound?0 || long_press(joy.b3?0) | semantical.beacon?0`"
 config_lines[2]: "mix liftaxle `keyboard.u?0 || long_press(joy.b4?0) | semantical.liftaxle?0`"
 config_lines[3]: "mix parkingbrake `keyboard.space?0 || short_press(joy.b4?0) | semantical.parkingbrake?0`"
 config_lines[4]: "mix engine `keyboard.e?0 | joy.b24?0 | semantical.engine?0`"
 config_lines[5]: "mix attach `keyboard.t?0 || long_press(joy.pov1_left?0) | semantical.attach?0`"
 config_lines[6]: "mix camcycle `keyboard.key9?0 || long_press(joy.pov1_up?0) | semantical.camcycle?0`"
 config_lines[7]: "mix diflock `keyboard.v?0 | semantical.diflock?0`"
 config_lines[8]: "mix wipers `keyboard.p?0 || short_press(joy.b3?0) | semantical.wipers?0`"
 config_lines[9]: "mix cruiectrl `keyboard.c?0 || short_press(joy.b2?0) | semantical.cruiectrl?0`"
 config_lines[10]: "mix light `keyboard.l?0 || short_press(joy.pov1_down?0) | semantical.light?0`"
 config_lines[11]: "mix flasher4way `keyboard.f?0 || long_press(joy.b2?0) | semantical.flasher4way?0`"
 config_lines[12]: "mix infotainment `keyboard.o?0 | semantical.infotainment?0`"
}
}
"""


def test_parse_controls_sii_extracts_keyboard_binding_per_action():
    result = client.parse_controls_sii(_SAMPLE_CONTROLS_SII)
    assert result["engine"] == "e"
    assert result["parkingbrake"] == "space"
    assert result["camcycle"] == "9"  # "key9" -> "9"
    assert result["flasher4way"] == "f"
    assert result["beacon"] is None  # solo bind de joystick (unbound en teclado)


def test_detect_keybinds_from_controls_sii_maps_to_our_action_names(tmp_path, monkeypatch):
    sii_file = tmp_path / "controls.sii"
    sii_file.write_text(_SAMPLE_CONTROLS_SII, encoding="utf-8")
    monkeypatch.setattr(client, "find_controls_sii_files", lambda: [str(sii_file)])
    detected = client.detect_keybinds_from_controls_sii()
    assert detected["toggle_engine"] == "e"
    assert detected["toggle_parking_brake"] == "space"
    assert detected["cycle_camera"] == "9"
    assert detected["toggle_hazards"] == "f"
    assert detected["toggle_infotainment"] == "o"
    assert detected["toggle_wipers"] == "p"
    assert detected["toggle_beacon"] is None


def test_detect_keybinds_from_controls_sii_returns_empty_without_files(monkeypatch):
    monkeypatch.setattr(client, "find_controls_sii_files", lambda: [])
    assert client.detect_keybinds_from_controls_sii() == {}


def test_find_controls_sii_files_excludes_bak_folders(monkeypatch, tmp_path):
    good = tmp_path / "Euro Truck Simulator 2" / "steam_profiles" / "ABC" / "controls.sii"
    good.parent.mkdir(parents=True)
    good.write_text("x", encoding="utf-8")
    bak = tmp_path / "Euro Truck Simulator 2" / "steam_profiles(1.60.bak)" / "ABC" / "controls.sii"
    bak.parent.mkdir(parents=True)
    bak.write_text("x", encoding="utf-8")
    monkeypatch.setattr(client, "documents_folder", lambda: str(tmp_path))
    files = client.find_controls_sii_files()
    assert str(good) in files
    assert not any(".bak" in f.lower() for f in files)


def test_update_job_snapshot_only_updates_while_on_job_with_destination():
    client._last_job_snapshot = {
        "citySrc": None, "cityDst": None, "truckBrand": None,
        "truckName": None, "cargo": None,
    }
    client.update_job_snapshot({"onJob": True, "cityDst": "Denver", "citySrc": "Phoenix", "cargo": "Steel"})
    assert client._last_job_snapshot["cityDst"] == "Denver"
    assert client._last_job_snapshot["cargo"] == "Steel"

    # sin onJob o sin cityDst, no debe pisar el snapshot anterior
    client.update_job_snapshot({"onJob": False, "cityDst": "OtroLugar"})
    assert client._last_job_snapshot["cityDst"] == "Denver"
    client.update_job_snapshot({"onJob": True, "cityDst": None})
    assert client._last_job_snapshot["cityDst"] == "Denver"


def test_attach_job_snapshot_if_finished_attaches_on_delivered_or_cancelled():
    client._last_job_snapshot = {
        "citySrc": "Phoenix", "cityDst": "Denver",
        "truckBrand": "Kenworth", "truckName": "T680", "cargo": "Steel",
    }
    # Primero un tick sin evento (estado conocido = false), despues la entrega:
    # una entrega vista en el primer tick del proceso es un flag heredado, no
    # se adjunta nada (ver edge_filter_job_events).
    client._last_event_state.update({"jobDelivered": None, "jobCancelled": None})
    client.attach_job_snapshot_if_finished({"event": {"jobDelivered": False, "jobCancelled": False}})
    payload = {"event": {"jobDelivered": True}}
    client.attach_job_snapshot_if_finished(payload)
    assert payload["event"]["jobSrc"] == "Phoenix"
    assert payload["event"]["jobDst"] == "Denver"
    assert payload["event"]["jobCargo"] == "Steel"


def test_attach_job_snapshot_if_finished_noop_when_no_event():
    payload = {"event": {"jobDelivered": False, "jobCancelled": False}}
    client.attach_job_snapshot_if_finished(payload)
    assert "jobSrc" not in payload["event"]


def test_job_delivered_sent_only_on_rising_edge_never_on_first_tick():
    client._last_event_state.update({"jobDelivered": None, "jobCancelled": None})
    def tick(delivered):
        payload = {"event": {"jobDelivered": delivered, "jobCancelled": False}}
        client.attach_job_snapshot_if_finished(payload)
        return payload["event"]["jobDelivered"]
    assert tick(True) is False    # flag heredado de antes de arrancar: no es una entrega nueva
    assert tick(True) is False
    assert tick(False) is False
    assert tick(True) is True     # transicion real
    assert tick(True) is False    # sigue en true: no se repite


SAMPLE_LOG = (
    "00:00:24.567 : [mods] Active 3 mods (local: 2, workshop: 1)\n"
    "00:00:24.567 : [mods] Active workshop mod ID 645553604 (name: SiSL's Mega Pack, version: 3.3, author: SiSL)\n"
    "00:00:24.567 : [mods] Active local mod promods-def-v284 (name: ProMods Definition Package, version: 2.84, author: ProMods Team)\n"
    "00:00:24.567 : [mods] Active local mod promods-me-defmap-v284 (name: ProMods Middle East Addon, version: 2.84, author: ProMods Team)\n"
)


def test_parse_active_mods_takes_last_profile_block():
    log = (
        "00:00:10.000 : [mods] Active 1 mods (local: 1, workshop: 0)\n"
        "00:00:10.000 : [mods] Active local mod coast2coast (name: Coast to Coast, version: 2.15, author: Mantrid)\n"
    ) + SAMPLE_LOG
    mods = client.parse_active_mods(log)
    assert [m["file"] for m in mods] == ["645553604", "promods-def-v284", "promods-me-defmap-v284"]
    assert mods[1]["name"] == "ProMods Definition Package"


def test_parse_active_mods_none_without_list():
    assert client.parse_active_mods("00:00:01 : [hashfs] base.scs: Created") is None


NO_MODS = {"promods": False, "promods_canada": False, "c2c": False, "rusmap": False, "reforma": False, "roextended": False, "grand_utopia": False, "truckersmp": False}


def test_parse_custom_key():
    assert client.parse_custom_key("f5") == ["f5"]
    assert client.parse_custom_key("Ctrl+Shift+F5") == ["ctrl", "shift", "f5"]
    assert client.parse_custom_key("num7") == ["num7"]
    assert client.parse_custom_key("alt+f4") is None
    assert client.parse_custom_key("win+r") is None
    assert client.parse_custom_key("ctrl+ctrl+a") is None
    assert client.parse_custom_key("ctrl+") is None
    assert client.parse_custom_key("") is None
    assert client.parse_custom_key(None) is None
    # F24 no viene de fabrica en ninguno de los tres backends: si se acepta
    # en la lista blanca, los tres tienen que saber mandarla.
    assert client.parse_custom_key("f24") == ["f24"]
    assert "f24" in keys_compat.WINDOWS_EXTRA_SCANCODES
    assert "f24" in keys_compat.LINUX_KEYCODES
    assert keys_compat.x11_keysym_name("f24") == "F24"


def test_is_truckersmp_session():
    # linea real de un game.log.txt jugando por el launcher de TruckersMP (2026-09-21)
    real = r"00:00:01.855 : [fs] device C:\Users\x\AppData\Roaming\TruckersMP\installation/data/ets2/mods/data1.mp mounted to mod pool."
    assert client.is_truckersmp_session(real)
    assert not client.is_truckersmp_session(SAMPLE_LOG)
    # un mod cualquiera con "truckersmp" en el nombre no cuenta
    assert not client.is_truckersmp_session("[mods] Active local mod truckersmp_skin (name: TruckersMP skin, version: 1, author: x)")


def test_detect_map_mods_flags():
    assert client.detect_map_mods(client.parse_active_mods(SAMPLE_LOG)) == {**NO_MODS, "promods": True}
    mods = [
        {"file": "promods-ats-canada-v164", "name": "ProMods Canada", "version": "1.64", "author": "ProMods"},
        {"file": "coast2coast_v2.15", "name": "Coast to Coast", "version": "2.15", "author": "Mantrid"},
    ]
    assert client.detect_map_mods(mods) == {**NO_MODS, "promods_canada": True, "c2c": True}
    assert client.detect_map_mods([]) == NO_MODS


def test_detect_map_mods_rusmap_with_promods():
    mods = [{"file": "promods-eu-map-v284.scs", "name": "ProMods Europe"}, {"file": "RusMap_Map.scs", "name": "RusMap 2.61"}, {"file": "cnx-pm-v284-rm-v261.scs", "name": "ProMods 2.84 - RusMap 2.61 Connector"}]
    assert client.detect_map_mods(mods) == {**NO_MODS, "promods": True, "rusmap": True}


def test_detect_map_mods_reforma_roex_gu():
    ats = [{"file": "Reforma_2_9_9_160.scs", "name": "Reforma 2.9.9.160"}, {"file": "Reforma_MegaResources_v2_9_9_160.scs", "name": "Reforma Mega Resources"}, {"file": "Coast_to_Coast_v2.23.61.0.scs", "name": "Coast to Coast v2.23.61.0"}]
    assert client.detect_map_mods(ats) == {**NO_MODS, "reforma": True, "c2c": True}
    roex = [{"file": "ROEX53PMME284.scs", "name": "ROEX53PMME284"}, {"file": "161Hybrid2v3.scs", "name": "161Hybrid2v3"}, {"file": "promods-eu-map-v284.scs", "name": "ProMods Europe"}]
    assert client.detect_map_mods(roex) == {**NO_MODS, "roextended": True, "promods": True}
    assert client.detect_map_mods([{"file": "161Hybrid2v3.scs", "name": "161Hybrid2v3"}]) == {**NO_MODS, "roextended": True}
    gu = [{"file": "GU - Grand Utopia (v1.20c).scs", "name": "Grand Utopia"}]
    assert client.detect_map_mods(gu) == {**NO_MODS, "grand_utopia": True}


def test_qr_image_is_dark_on_light_with_quiet_zone():
    """Issue #3: el QR salia invertido (claro sobre oscuro) y la camara de
    Samsung no lo leia. Esquina = zona silenciosa clara, centro del patron de
    posicion = oscuro."""
    import local_server

    img = local_server.qr_image("http://192.168.1.50:27765", box_size=4)
    assert img.getpixel((0, 0)) == (255, 255, 255)          # zona silenciosa
    assert img.getpixel((4 * 6, 4 * 6)) == (0, 0, 0)        # centro del ojo (modulo 6,6)
    assert img.size[0] >= 4 * (21 + 8)                      # borde de 4 modulos por lado


def test_in_temp_location_detects_zip_extraction(monkeypatch, tmp_path):
    """Issue #2: abierto desde adentro del zip, Windows lo extrae a %TEMP%\7zXXXX
    y registrar el arranque desde ahi es lo que Defender marca como persistencia.
    En Linux el equivalente es un AppImage corrido desde /tmp: la ruta que
    guarda el .desktop de autostart desaparece cuando se limpia el temporal."""
    import win_integration

    temp = tmp_path / "Temp"
    (temp / "7zOC649DA39").mkdir(parents=True)
    monkeypatch.setenv("TEMP", str(temp))
    monkeypatch.setenv("TMP", str(temp))
    monkeypatch.setenv("TMPDIR", str(temp))
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    assert win_integration.in_temp_location(str(temp / "7zOC649DA39" / "TruckDash.exe")) is True
    assert win_integration.in_temp_location(None) is False

    if sys.platform == "win32":
        assert win_integration.in_temp_location(r"C:\Games\TruckDash\TruckDash.exe") is False
        assert win_integration.in_temp_location(r"D:\Temp\TruckDash.exe") is True  # cualquier carpeta "Temp"
    else:
        # Una ruta con barras invertidas en Linux no es una ruta, es UN nombre
        # de archivo, asi que las de arriba no probarian nada aca.
        assert win_integration.in_temp_location("/opt/truckdash/TruckDash") is False
        assert win_integration.in_temp_location("/tmp/.mount_abc123/TruckDash") is True


def test_pairing_code_is_reused_between_runs(monkeypatch, tmp_path):
    """Pedido de Discord: el link guardado en el celular tiene que seguir
    sirviendo, asi que el codigo se guarda y se reusa (solo si es valido)."""
    import win_integration

    monkeypatch.setattr(win_integration, "settings_path", lambda: str(tmp_path / "settings.json"))
    assert win_integration.saved_pairing_code() is None
    win_integration.save_pairing_code("AB12CD34")
    assert win_integration.saved_pairing_code() == "AB12CD34"
    win_integration.save_pairing_code("no-es-un-codigo")
    assert win_integration.saved_pairing_code() is None      # basura guardada = se pide uno nuevo
    win_integration.save_pairing_code("AB12CD34")
    win_integration.forget_pairing_code()
    assert win_integration.saved_pairing_code() is None


def test_single_instance_guard(monkeypatch):
    """Issue #4: la segunda instancia no arranca. Se usa un nombre de mutex
    propio del test para no chocar con un Truck Dash real abierto."""
    import uuid
    import win_integration

    monkeypatch.setattr(win_integration, "SINGLE_INSTANCE_MUTEX", rf"Local\TruckDashTest-{uuid.uuid4().hex}")
    monkeypatch.setattr(win_integration, "_single_instance_handle", None)
    assert win_integration.acquire_single_instance() is True
    assert win_integration.acquire_single_instance() is False          # ya tomado
    assert win_integration.acquire_single_instance(0.5) is False       # y esperar no lo libera


def test_relaunch_passes_the_wait_flag(monkeypatch):
    """El .exe nuevo tiene que esperar a que el viejo suelte el mutex, si no
    el auto-update y el boton 'Codigo nuevo' dejarian de arrancar."""
    import win_integration

    launched = {}
    monkeypatch.setattr(win_integration.subprocess, "Popen",
                        lambda cmd, **kw: launched.setdefault("cmd", cmd))
    monkeypatch.setattr(win_integration.os, "_exit", lambda code: None)
    win_integration.relaunch_and_exit(r"C:\TruckDash\TruckDash.exe", ["--autostart"])
    assert launched["cmd"][1:] == ["--autostart", win_integration.RELAUNCH_FLAG]


def test_discord_activity_from_telemetry():
    """Rich Presence: lo que ve la gente en el perfil. Sin juego no se publica
    nada, y en pausa no se muestra el viaje como si siguiera andando."""
    import discord_presence as dp

    act = dp.activity_from_telemetry(
        {"game": "ats", "citySrc": "Salt Lake City", "cityDst": "Las Vegas",
         "cargo": "Bulldozer", "routeDistanceKm": 712.4}, started_at=1000)
    assert act["details"] == "Salt Lake City \u2192 Las Vegas"
    assert "712" in act["state"] and "Bulldozer" in act["state"]
    assert act["assets"]["small_image"] == "ats"
    assert act["timestamps"] == {"start": 1000}

    assert dp.activity_from_telemetry({"game": None}) is None
    assert dp.activity_from_telemetry(None) is None
    pausada = dp.activity_from_telemetry({"game": "ets2", "cityDst": "Praha", "paused": True})
    assert "Praha" in pausada["details"] and "km" not in pausada["state"]


def test_discord_frame_encoding():
    import struct
    import discord_presence as dp

    frame = dp.encode_frame(dp.OP_HANDSHAKE, {"v": 1, "client_id": "123"})
    op, length = struct.unpack("<II", frame[:8])
    assert op == dp.OP_HANDSHAKE and length == len(frame) - 8
    assert b'"client_id": "123"' in frame


def test_discord_stays_quiet_without_application_id():
    """Sin ID configurado no se abre ningun hilo ni se toca el pipe."""
    import discord_presence as dp

    presence = dp.DiscordPresence(application_id="")
    presence.set_enabled(True)
    assert presence._thread is None
    presence.close()


def test_telemetry_compat_elige_el_bloque_segun_el_sistema(monkeypatch):
    """En Windows el bloque tiene nombre de objeto; en Linux es un archivo en
    /dev/shm. Y en Linux NO se usa multiprocessing.shared_memory, que al
    cerrar le hace unlink al bloque del plugin y deja al juego publicando en
    el vacio (comprobado en WSL)."""
    import telemetry_compat

    assert telemetry_compat.BLOCK_SIZE == 32 * 1024
    assert telemetry_compat.WINDOWS_NAME == r"Local\SCSTelemetry"
    assert telemetry_compat.LINUX_PATH == "/dev/shm/SCSTelemetry"

    fuente = inspect.getsource(telemetry_compat._open_buffer)
    rama_linux = fuente.split("if IS_WINDOWS:")[1].split("return _mem.buf")[1]
    assert "SharedMemory" not in rama_linux, "en Linux hay que mapear el archivo a mano"
    assert "mmap.mmap" in rama_linux


def test_todas_las_teclas_permitidas_existen_en_los_tres_backends():
    """La lista blanca de teclas custom es una sola, pero se manda por tres
    caminos distintos (pydirectinput, XTEST, uinput). Si alguien suma una
    tecla a la lista y se olvida de mapearla, en Linux fallaria recien
    cuando un usuario la apriete."""
    for key in sorted(client.CUSTOM_KEY_ALLOWED | set(client.CUSTOM_KEY_MODIFIERS)):
        assert key in keys_compat.LINUX_KEYCODES, f"{key} no tiene keycode de Linux"
        assert keys_compat.x11_keysym_name(key), f"{key} no tiene keysym de X11"


def test_los_keycodes_de_linux_no_se_repiten():
    codigos = list(keys_compat.LINUX_KEYCODES.values())
    repetidos = {c for c in codigos if codigos.count(c) > 1}
    assert not repetidos, f"dos teclas comparten codigo: {repetidos}"


def test_en_linux_no_se_manda_nada_por_pydirectinput(monkeypatch):
    """pydirectinput no existe fuera de Windows: el backend de Linux tiene
    que ser XTEST o uinput, nunca ese."""
    monkeypatch.setattr(keys_compat, "IS_WINDOWS", False)
    intentados = []

    class Falla:
        def __init__(self, *a, **k):
            intentados.append(self.name)
            raise RuntimeError("no disponible en el test")

    class XTestFalla(Falla):
        name = "xtest"

    class UinputFalla(Falla):
        name = "uinput"

    monkeypatch.setattr(keys_compat, "XTestBackend", XTestFalla)
    monkeypatch.setattr(keys_compat, "UinputBackend", UinputFalla)
    monkeypatch.setattr(keys_compat, "_backend", None)
    monkeypatch.setattr(keys_compat, "_tried", False)
    monkeypatch.setattr(keys_compat, "_reason", "")

    assert keys_compat.available() is False
    # XTEST primero (no pide permisos), uinput despues.
    assert intentados == ["xtest", "uinput"]
    # El motivo que ve el usuario nombra los dos caminos que fallaron.
    assert "xtest" in keys_compat.unavailable_reason()
    assert "uinput" in keys_compat.unavailable_reason()
    keys_compat._tried = False
    keys_compat._backend = None


# --------------------------------------------------------------------------
# Integracion con Linux: el inicio automatico es un .desktop y la instancia
# unica un flock. Se prueba la logica pura, que es igual en los dos sistemas.
# --------------------------------------------------------------------------

def test_autostart_desktop_respeta_xdg_config_home(monkeypatch, tmp_path):
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path / "cfg"))
    ruta = win_integration.autostart_desktop_path()
    assert ruta == str(tmp_path / "cfg" / "autostart" / "truckdash.desktop")
    monkeypatch.delenv("XDG_CONFIG_HOME")
    assert win_integration.autostart_desktop_path().endswith(
        os.path.join(".config", "autostart", "truckdash.desktop"))


def test_autostart_desktop_entry_cita_la_ruta(monkeypatch):
    """Casi todas las instalaciones de Steam viven en rutas con espacios, y un
    Exec= sin comillas se parte en dos y no arranca nada."""
    monkeypatch.setattr(win_integration, "exe_path", lambda: "/home/x/mis apps/Truck Dash.AppImage")
    entry = win_integration.autostart_desktop_entry()
    exec_line = [l for l in entry.splitlines() if l.startswith("Exec=")][0]
    assert "'/home/x/mis apps/Truck Dash.AppImage'" in exec_line
    assert exec_line.endswith(win_integration.AUTOSTART_FLAG)
    assert entry.startswith("[Desktop Entry]")

    monkeypatch.setattr(win_integration, "exe_path", lambda: None)
    assert win_integration.autostart_desktop_entry() is None


def test_lock_de_instancia_unica_va_en_el_runtime_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("XDG_RUNTIME_DIR", str(tmp_path))
    assert win_integration.single_instance_lock_path() == str(
        tmp_path / win_integration.SINGLE_INSTANCE_LOCK)
    # Si la variable apunta a algo que no existe se cae al temporal, no se
    # revienta: sin lock es preferible dejar arrancar.
    monkeypatch.setenv("XDG_RUNTIME_DIR", str(tmp_path / "no-existe"))
    assert win_integration.runtime_dir() == tempfile.gettempdir()


def test_exe_path_prefiere_el_appimage(monkeypatch):
    """Adentro de un AppImage sys.executable es el binario extraido en el
    montaje, que desaparece al cerrar; para el inicio automatico hay que
    guardar la ruta del .AppImage."""
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "executable", "/tmp/.mount_abc/truckdash")
    monkeypatch.setenv("APPIMAGE", "/home/x/TruckDash.AppImage")
    assert win_integration.exe_path() == "/home/x/TruckDash.AppImage"
    monkeypatch.delenv("APPIMAGE")
    assert win_integration.exe_path() == "/tmp/.mount_abc/truckdash"


def test_idioma_desde_el_entorno(monkeypatch):
    """En Linux el idioma sale del entorno. LANGUAGE puede traer una lista
    ('pt_BR:pt:en') y manda el primero."""
    monkeypatch.setattr(i18n.sys, "platform", "linux")
    for var in ("LANGUAGE", "LC_ALL", "LC_MESSAGES", "LANG"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("LANGUAGE", "pt_BR:pt:en")
    assert i18n.detect_language() == "pt"
    monkeypatch.delenv("LANGUAGE")
    monkeypatch.setenv("LANG", "de_DE.UTF-8")
    assert i18n.detect_language() == "de"
    # "C" no es un idioma: hay que seguir buscando, no devolver 'c'.
    monkeypatch.setenv("LC_ALL", "C")
    assert i18n.detect_language() == "de"

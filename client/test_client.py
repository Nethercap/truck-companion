"""Tests de las funciones puras de client.py (sin tocar el SDK/websocket real)."""

import client


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
    monkeypatch.setattr(client.pydirectinput, "press", lambda key: called.append(key))
    client.send_game_command("toggle_hazards", client.DEFAULT_KEYBINDS)
    assert called == []


def test_send_game_command_presses_key_and_focuses_window(monkeypatch):
    monkeypatch.setattr(client, "find_game_window", lambda: 12345)
    focused = []
    monkeypatch.setattr(client, "bring_window_to_foreground", lambda hwnd: focused.append(hwnd))
    pressed = []
    monkeypatch.setattr(client.pydirectinput, "press", lambda key: pressed.append(key))
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


def test_detect_map_mods_flags():
    assert client.detect_map_mods(client.parse_active_mods(SAMPLE_LOG)) == {"promods": True, "promods_canada": False, "c2c": False}
    mods = [
        {"file": "promods-ats-canada-v164", "name": "ProMods Canada", "version": "1.64", "author": "ProMods"},
        {"file": "coast2coast_v2.15", "name": "Coast to Coast", "version": "2.15", "author": "Mantrid"},
    ]
    assert client.detect_map_mods(mods) == {"promods": False, "promods_canada": True, "c2c": True}
    assert client.detect_map_mods([]) == {"promods": False, "promods_canada": False, "c2c": False}

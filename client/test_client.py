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


def test_receive_commands_replies_to_get_keybinds():
    import asyncio
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
    ws = _FakeWs([client.json.dumps({"type": "set_keybinds", "data": {"toggle_hazards": "x", "unknown_action": "q"}})])
    keybinds = dict(client.DEFAULT_KEYBINDS)
    asyncio.run(client.receive_commands(ws, keybinds))
    assert keybinds["toggle_hazards"] == "x"
    assert "unknown_action" not in keybinds  # se ignoran acciones desconocidas
    assert client.load_keybinds()["toggle_hazards"] == "x"  # quedo persistido


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
    payload = {"event": {"jobDelivered": True}}
    client.attach_job_snapshot_if_finished(payload)
    assert payload["event"]["jobSrc"] == "Phoenix"
    assert payload["event"]["jobDst"] == "Denver"
    assert payload["event"]["jobCargo"] == "Steel"


def test_attach_job_snapshot_if_finished_noop_when_no_event():
    payload = {"event": {"jobDelivered": False, "jobCancelled": False}}
    client.attach_job_snapshot_if_finished(payload)
    assert "jobSrc" not in payload["event"]

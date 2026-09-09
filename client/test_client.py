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

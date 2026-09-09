"""
Tests automatizados del backend. Usan TestClient (sin levantar un server real)
y mockean `_r2_client` para que `_load_stats`/`_save_stats` nunca toquen R2 de
verdad: cada test arranca con `main._stats_cache = None` y un dict en memoria.
"""

import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def main(monkeypatch):
    """Reimporta main.py con ADMIN_KEY fijo y R2 deshabilitado (sin credenciales)."""
    monkeypatch.setenv("ADMIN_KEY", "test-admin-key")
    monkeypatch.delenv("R2_ENDPOINT", raising=False)
    monkeypatch.delenv("R2_ACCESS_KEY_ID", raising=False)
    monkeypatch.delenv("R2_SECRET_ACCESS_KEY", raising=False)
    import main as main_module

    importlib.reload(main_module)
    return main_module


@pytest.fixture
def client(main):
    return TestClient(main.app)


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_pair_new_returns_unique_code(client, main):
    resp = client.post("/pair/new")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["code"]) == main.PAIRING_CODE_LENGTH
    assert body["code"] in main.sessions


def test_generate_code_avoids_collisions(main):
    main.sessions["AAAAAAAA"] = main.Session("AAAAAAAA")
    codes = {main.generate_code() for _ in range(50)}
    assert "AAAAAAAA" not in codes


def test_rate_limit_blocks_after_max_attempts(main):
    ip = "1.2.3.4"
    for _ in range(main.RATE_LIMIT_MAX_ATTEMPTS):
        assert main.check_rate_limit(ip) is True
    assert main.check_rate_limit(ip) is False


def test_rate_limit_is_per_ip(main):
    for _ in range(main.RATE_LIMIT_MAX_ATTEMPTS):
        main.check_rate_limit("1.1.1.1")
    assert main.check_rate_limit("2.2.2.2") is True


def test_cleanup_expired_sessions_removes_only_unconnected_and_old(main):
    import time

    fresh = main.Session("FRESH000")
    stale = main.Session("STALE000")
    stale.created_at = time.time() - main.PAIRING_CODE_TTL_SECONDS - 1
    connected_stale = main.Session("CONN0000")
    connected_stale.created_at = time.time() - main.PAIRING_CODE_TTL_SECONDS - 1
    connected_stale.client_ws = object()

    main.sessions.update(
        {"FRESH000": fresh, "STALE000": stale, "CONN0000": connected_stale}
    )
    main.cleanup_expired_sessions()

    assert "FRESH000" in main.sessions
    assert "STALE000" not in main.sessions
    assert "CONN0000" in main.sessions  # tiene client_ws, no se limpia aunque sea vieja


def test_admin_stats_requires_correct_key(client):
    assert client.get("/admin/stats").status_code == 403
    assert client.get("/admin/stats", headers={"X-Admin-Key": "wrong"}).status_code == 403
    resp = client.get("/admin/stats", headers={"X-Admin-Key": "test-admin-key"})
    assert resp.status_code == 200


def test_admin_stats_includes_live_active_sessions(client, main):
    main.sessions["AAAAAAAA"] = main.Session("AAAAAAAA")
    main.sessions["BBBBBBBB"] = main.Session("BBBBBBBB")
    resp = client.get("/admin/stats", headers={"X-Admin-Key": "test-admin-key"})
    assert resp.json()["active_sessions"] == 2


def test_admin_stats_403_when_admin_key_not_configured(client, main, monkeypatch):
    monkeypatch.setattr(main, "ADMIN_KEY", None)
    resp = client.get("/admin/stats", headers={"X-Admin-Key": "anything"})
    assert resp.status_code == 403


def test_stats_seed_updates_numeric_and_list_fields(client, main):
    headers = {"X-Admin-Key": "test-admin-key"}
    resp = client.post(
        "/admin/stats/seed",
        json={
            "total_sessions": 42,
            "latest_client_version": "1.0.1",
            "latest_jobs": [{"revenue": 100}] * 10,
        },
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_sessions"] == 42
    assert body["latest_client_version"] == "1.0.1"
    # se trunca a LATEST_JOBS_MAX aunque se manden mas
    assert len(body["latest_jobs"]) == main.LATEST_JOBS_MAX


def test_stats_seed_ignores_unknown_and_wrong_typed_fields(client, main):
    headers = {"X-Admin-Key": "test-admin-key"}
    resp = client.post(
        "/admin/stats/seed",
        json={"total_sessions": "not-a-number", "some_random_field": 123},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "some_random_field" not in body
    assert body.get("total_sessions", 0) != "not-a-number"


def test_stats_public_defaults_to_zero(client):
    resp = client.get("/stats/public")
    assert resp.status_code == 200
    body = resp.json()
    assert body == {
        "total_sessions": 0,
        "jobs_delivered": 0,
        "total_revenue": 0,
        "latest_jobs": [],
    }


def test_record_session_started_increments_totals(main):
    main.record_session_started()
    main.record_session_started()
    stats = main._load_stats()
    assert stats["total_sessions"] == 2
    assert sum(stats["daily"].values()) == 2


def test_record_job_delivered_tracks_revenue_and_latest(main):
    main.record_job_delivered({"revenue": 1500, "cargo": "Steel"})
    main.record_job_delivered({"revenue": 500, "cargo": "Wood"})
    stats = main._load_stats()
    assert stats["jobs_delivered"] == 2
    assert stats["total_revenue"] == 2000
    assert stats["latest_jobs"][0]["cargo"] == "Wood"  # el mas reciente va primero


def test_record_job_delivered_ignores_duplicate_within_window(main):
    # Dos procesos del cliente (dos pairing codes) reportando la misma
    # entrega real - mismo route/cargo/pay/distancia, sin pasar por la misma
    # Session (ese guard no alcanza aca), pero el fingerprint global si lo
    # detecta y lo descarta.
    job = {
        "citySrc": "Bakersfield",
        "cityDst": "Santa Cruz",
        "cargo": "Scaffolding",
        "revenue": 11295,
        "distanceKm": 525,
    }
    main.record_job_delivered(job)
    main.record_job_delivered(dict(job))  # duplicado exacto
    stats = main._load_stats()
    assert stats["jobs_delivered"] == 1
    assert stats["total_revenue"] == 11295
    assert len(stats["latest_jobs"]) == 1


def test_record_job_delivered_allows_same_route_after_window(main, monkeypatch):
    job = {
        "citySrc": "Bakersfield",
        "cityDst": "Santa Cruz",
        "cargo": "Scaffolding",
        "revenue": 11295,
        "distanceKm": 525,
    }
    main.record_job_delivered(job)
    # simula que paso mas tiempo que la ventana de dedupe
    stats = main._load_stats()
    stats["_last_job_time"] -= main.JOB_DEDUPE_WINDOW_SECONDS + 1
    main.record_job_delivered(dict(job))
    stats = main._load_stats()
    assert stats["jobs_delivered"] == 2


def test_notify_discord_job_delivered_noop_without_webhook_url(main, monkeypatch):
    monkeypatch.setattr(main, "DISCORD_WEBHOOK_URL", None)
    called = []
    monkeypatch.setattr(main.urllib.request, "urlopen", lambda *a, **k: called.append(1))
    main.notify_discord_job_delivered({"citySrc": "A", "cityDst": "B"})
    assert called == []


def test_notify_discord_job_delivered_posts_embed_with_job_fields(main, monkeypatch):
    monkeypatch.setattr(main, "DISCORD_WEBHOOK_URL", "https://discord.com/api/webhooks/fake")
    captured = {}

    class FakeResponse:
        def close(self):
            pass

    def fake_urlopen(req, timeout=10):
        captured["url"] = req.full_url
        captured["body"] = main.json.loads(req.data)
        return FakeResponse()

    monkeypatch.setattr(main.urllib.request, "urlopen", fake_urlopen)
    main.notify_discord_job_delivered({
        "citySrc": "Bakersfield", "cityDst": "Santa Cruz",
        "truckBrand": "Kenworth", "truckName": "T680",
        "cargo": "Scaffolding", "revenue": 11295, "distanceKm": 525, "game": "ats",
    })
    embed = captured["body"]["embeds"][0]
    assert embed["title"] == "Bakersfield -> Santa Cruz"
    fields = {f["name"]: f["value"] for f in embed["fields"]}
    assert fields["Truck"] == "Kenworth T680"
    assert fields["Cargo"] == "Scaffolding"
    assert fields["Game"] == "ATS"
    assert fields["Distance"] == "525 km"
    assert fields["Pay"] == "$11,295"


def test_notify_discord_job_delivered_swallows_network_errors(main, monkeypatch):
    monkeypatch.setattr(main, "DISCORD_WEBHOOK_URL", "https://discord.com/api/webhooks/fake")

    def raise_error(*a, **k):
        raise OSError("network down")

    monkeypatch.setattr(main.urllib.request, "urlopen", raise_error)
    # no debe lanzar - solo loguear
    main.notify_discord_job_delivered({"citySrc": "A", "cityDst": "B"})


def test_record_job_delivered_calls_discord_notify(main, monkeypatch):
    called = []
    monkeypatch.setattr(main, "notify_discord_job_delivered", lambda job_info: called.append(job_info))
    job = {"citySrc": "A", "cityDst": "B", "cargo": "X", "revenue": 100, "distanceKm": 10}
    main.record_job_delivered(job)
    assert len(called) == 1
    assert called[0]["cityDst"] == "B"


def test_version_endpoint_defaults(client, main):
    resp = client.get("/version")
    assert resp.status_code == 200
    body = resp.json()
    assert body["latest_client_version"] == main.DEFAULT_CLIENT_VERSION
    assert body["download_url"] == main.CLIENT_DOWNLOAD_URL

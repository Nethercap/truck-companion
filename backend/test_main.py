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


def test_health_connected_clients_only_counts_sessions_with_client_ws(client, main):
    main.sessions["AAAAAAAA"] = main.Session("AAAAAAAA")  # sin client_ws (solo pairing code emitido)
    connected = main.Session("BBBBBBBB")
    connected.client_ws = object()
    main.sessions["BBBBBBBB"] = connected
    resp = client.get("/health")
    body = resp.json()
    assert body["active_sessions"] == 2
    assert body["connected_clients"] == 1


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


def test_broadcast_live_positions_filters_by_variant_and_excludes_self(main):
    import asyncio

    class FakeWs:
        def __init__(self):
            self.sent = []

        async def send_text(self, text):
            self.sent.append(text)

    async def run():
        s1 = main.Session("AAAAAAAA")
        s1.share_position = True
        s1.map_variant = "ats_promods"
        s1.last_position = {"x": 1.0, "z": 2.0, "ts": main.time.time()}
        ws1 = FakeWs()
        s1.viewer_ws_list = [ws1]

        s2 = main.Session("BBBBBBBB")
        s2.share_position = True
        s2.map_variant = "ats_promods"
        s2.last_position = {"x": 3.0, "z": 4.0, "ts": main.time.time()}

        s3 = main.Session("CCCCCCCC")  # otra variante de mapa, no deberia verse
        s3.share_position = True
        s3.map_variant = "ets2"
        s3.last_position = {"x": 9.0, "z": 9.0, "ts": main.time.time()}

        main.sessions.update({s1.code: s1, s2.code: s2, s3.code: s3})
        main.broadcast_live_positions()
        await asyncio.sleep(0)  # deja correr los create_task del broadcast

        assert len(ws1.sent) == 1
        body = main.json.loads(ws1.sent[0])
        assert body["type"] == "live_players"
        assert [p["id"] for p in body["players"]] == ["BBBBBBBB"]

    asyncio.run(run())


def test_broadcast_live_positions_excludes_not_sharing_and_stale(main):
    import asyncio

    class FakeWs:
        def __init__(self):
            self.sent = []

        async def send_text(self, text):
            self.sent.append(text)

    async def run():
        viewer = main.Session("AAAAAAAA")
        viewer.share_position = True
        viewer.map_variant = "ats"
        viewer.last_position = {"x": 0.0, "z": 0.0, "ts": main.time.time()}
        ws = FakeWs()
        viewer.viewer_ws_list = [ws]

        not_sharing = main.Session("BBBBBBBB")
        not_sharing.share_position = False
        not_sharing.map_variant = "ats"
        not_sharing.last_position = {"x": 1.0, "z": 1.0, "ts": main.time.time()}

        stale = main.Session("CCCCCCCC")
        stale.share_position = True
        stale.map_variant = "ats"
        stale.last_position = {"x": 2.0, "z": 2.0, "ts": main.time.time() - main.LIVE_POSITION_STALE_SECONDS - 1}

        main.sessions.update({viewer.code: viewer, not_sharing.code: not_sharing, stale.code: stale})
        main.broadcast_live_positions()
        await asyncio.sleep(0)

        assert len(ws.sent) == 1
        body = main.json.loads(ws.sent[0])
        assert body["players"] == []

    asyncio.run(run())


def test_set_live_share_via_websocket_updates_session(client, main):
    code = client.post("/pair/new").json()["code"]
    with client.websocket_connect(f"/ws/live/{code}") as ws:
        ws.send_text(main.json.dumps({"type": "set_live_share", "enabled": True, "mapVariant": "ats_promods"}))
        # No hay nada que leer de vuelta - se confirma via el estado de la sesion.
        import time as _time
        _time.sleep(0.05)
        session = main.sessions[code]
        assert session.share_position is True
        assert session.map_variant == "ats_promods"

        ws.send_text(main.json.dumps({"type": "set_live_share", "enabled": False}))
        _time.sleep(0.05)
        assert session.share_position is False
        assert session.map_variant is None


def test_version_endpoint_defaults(client, main):
    resp = client.get("/version")
    assert resp.status_code == 200
    body = resp.json()
    assert body["latest_client_version"] == main.DEFAULT_CLIENT_VERSION
    assert body["download_url"] == main.CLIENT_DOWNLOAD_URL


def test_viewer_receives_session_state_on_connect_and_when_client_connects(client, main):
    code = client.post("/pair/new").json()["code"]
    with client.websocket_connect(f"/ws/live/{code}") as viewer:
        first = main.json.loads(viewer.receive_text())
        assert first == {"type": "session_state", "client_connected": False, "client_status": None}

        with client.websocket_connect(f"/ws/client/{code}") as local_client:
            connected = main.json.loads(viewer.receive_text())
            assert connected["type"] == "session_state"
            assert connected["client_connected"] is True

            local_client.send_text(main.json.dumps({"type": "client_status", "status": "waiting_game", "game": None, "clientVersion": "1.3.0"}))
            relayed = main.json.loads(viewer.receive_text())
            assert relayed["type"] == "client_status"
            assert relayed["status"] == "waiting_game"
            assert main.sessions[code].last_client_status["status"] == "waiting_game"

        disconnected = main.json.loads(viewer.receive_text())
        assert disconnected["client_connected"] is False
        # El ultimo estado se conserva para un viewer que llegue despues
        assert disconnected["client_status"]["status"] == "waiting_game"


def test_cleanup_removes_idle_used_sessions_but_keeps_watched_ones(main):
    import time

    idle = main.Session("IDLE0000")
    idle.counted = True
    idle.last_seen = time.time() - main.IDLE_SESSION_TTL_SECONDS - 1
    watched = main.Session("WATCH000")
    watched.counted = True
    watched.last_seen = time.time() - main.IDLE_SESSION_TTL_SECONDS - 1
    watched.viewer_ws_list.append(object())
    recent = main.Session("RECENT00")
    recent.counted = True
    recent.last_seen = time.time() - 60

    main.sessions.update({"IDLE0000": idle, "WATCH000": watched, "RECENT00": recent})
    main.cleanup_expired_sessions()

    assert "IDLE0000" not in main.sessions
    assert "WATCH000" in main.sessions
    assert "RECENT00" in main.sessions


def test_version_endpoint_exposes_seeded_sha256(client, main):
    client.post("/admin/stats/seed", json={"latest_client_version": "1.3.0", "latest_client_sha256": "abc123"}, headers={"X-Admin-Key": "test-admin-key"})
    body = client.get("/version").json()
    assert body["latest_client_version"] == "1.3.0"
    assert body["sha256"] == "abc123"

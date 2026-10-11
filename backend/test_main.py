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
    """Todas las conexiones del test en el mismo event loop, como en
    produccion (uvicorn). Sin portal compartido, TestClient corre cada
    websocket_connect en un loop y un thread propios, y el relay manda de una
    conexion a otra (web -> cliente, cliente -> web): cruzar threads sobre los
    streams de anyio a veces perdia el mensaje y el test se colgaba (CI del
    10-10, test_el_aviso_de_fuera_del_mapa_llega_al_cliente). Sin entrar al
    TestClient con "with", que ademas correria los startup del relay."""
    from anyio.from_thread import start_blocking_portal
    c = TestClient(main.app)
    with start_blocking_portal(**c.async_backend) as portal:
        c.portal = portal
        yield c
        c.portal = None


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
        # id publico, nunca el codigo de pairing (con el codigo se le mandan comandos al camion)
        assert [p["id"] for p in body["players"]] == [s2.public_id]
        assert "BBBBBBBB" not in ws1.sent[0]

    asyncio.run(run())


def test_broadcast_live_positions_recorta_a_cada_uno_sin_romper_el_json(main):
    """El mensaje de cada sesion se arma recortando la lista compartida:
    tiene que salir JSON valido con todos menos uno mismo, sea el primero,
    uno del medio, el ultimo o el unico del mapa."""
    import asyncio

    class FakeWs:
        def __init__(self):
            self.sent = []

        async def send_text(self, text):
            self.sent.append(text)

    async def run():
        ahora = main.time.time()
        grupo = []
        for i, codigo in enumerate(["AAAAAAAA", "BBBBBBBB", "CCCCCCCC"]):
            s = main.Session(codigo)
            s.share_position = True
            s.map_variant = "ets2"
            s.last_position = {"x": 1000.123456789 * (i + 1), "z": -2.0 * i, "ts": ahora}
            s.viewer_ws_list = [FakeWs()]
            grupo.append(s)
        solo = main.Session("DDDDDDDD")
        solo.share_position = True
        solo.map_variant = "ats"
        solo.last_position = {"x": 5.0, "z": 5.0, "ts": ahora}
        solo.viewer_ws_list = [FakeWs()]

        main.sessions.update({s.code: s for s in grupo + [solo]})
        main.broadcast_live_positions()
        await asyncio.sleep(0)

        for s in grupo:
            (texto,) = s.viewer_ws_list[0].sent
            body = main.json.loads(texto)
            assert body["type"] == "live_players"
            assert [p["id"] for p in body["players"]] == [
                o.public_id for o in grupo if o is not s]
        primero = main.json.loads(grupo[1].viewer_ws_list[0].sent[0])["players"][0]
        assert primero == {"id": grupo[0].public_id, "x": 1000.1, "z": 0.0}
        assert main.json.loads(solo.viewer_ws_list[0].sent[0])["players"] == []

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
        # Y enseguida el estado real de "compartir posicion"
        assert main.json.loads(viewer.receive_text()) == {"type": "live_share_state", "enabled": False}

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


def test_el_aviso_de_fuera_del_mapa_llega_al_cliente(client, main):
    """La web avisa "offmap" y el cliente ofrece armar el mapa en la PC."""
    code = client.post("/pair/new").json()["code"]
    with client.websocket_connect(f"/ws/live/{code}") as viewer:
        viewer.receive_text()
        viewer.receive_text()  # live_share_state
        with client.websocket_connect(f"/ws/client/{code}") as local_client:
            viewer.receive_text()
            assert main.json.loads(local_client.receive_text()) == {"type": "viewers", "count": 1}
            aviso = {"type": "offmap", "game": "ats"}
            viewer.send_text(main.json.dumps(aviso))
            assert main.json.loads(local_client.receive_text()) == aviso


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


def test_client_reconnect_with_unknown_code_recreates_session_without_counting(client, main):
    # Simula un redeploy: el cliente tiene un codigo valido que ya no esta en memoria.
    assert "ABCD1234" not in main.sessions
    with client.websocket_connect("/ws/client/ABCD1234"):
        session = main.sessions["ABCD1234"]
        assert session.client_ws is not None
        assert session.counted is True  # no infla total_sessions
        with client.websocket_connect("/ws/live/ABCD1234") as viewer:
            first = main.json.loads(viewer.receive_text())
            assert first["client_connected"] is True


def test_client_with_malformed_code_is_rejected(client, main):
    from starlette.websockets import WebSocketDisconnect
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/ws/client/short"):
            pass
    assert exc.value.code == 4404
    assert "short" not in main.sessions


def test_viewer_with_unknown_code_is_still_rejected(client, main):
    """Se acepta y recien ahi se cierra con 4404. Cerrando antes del accept el
    handshake queda rechazado y el WebSocket del navegador reporta 1006 sin el
    codigo, asi que la web no podia distinguir "codigo invalido" de "se corto"
    (ni saber que al link guardado del celular solo le falta que abran el
    cliente en la PC)."""
    from starlette.websockets import WebSocketDisconnect
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/ws/live/ZZZZ9999") as ws:
            ws.receive_text()
    assert exc.value.code == 4404
    assert "ZZZZ9999" not in main.sessions


def test_cliente_nuevo_reemplaza_al_viejo_sin_que_el_viejo_lo_borre(client, main):
    """Dos conexiones del cliente con el mismo codigo (corte que el servidor
    no detecto, o el .exe abierto dos veces): la vieja se cierra con 4409 y,
    cuando termina, no deja la sesion sin cliente ni le avisa a la web que
    se desconecto (auditoria del 10-10)."""
    import time as _time
    from starlette.websockets import WebSocketDisconnect
    code = client.post("/pair/new").json()["code"]
    with client.websocket_connect(f"/ws/live/{code}") as viewer:
        viewer.receive_text()  # session_state
        viewer.receive_text()  # live_share_state
        with client.websocket_connect(f"/ws/client/{code}") as viejo:
            viewer.receive_text()  # session_state (conectado)
            viejo.receive_text()  # viewers
            with client.websocket_connect(f"/ws/client/{code}") as nuevo:
                assert main.json.loads(viewer.receive_text())["client_connected"] is True
                with pytest.raises(WebSocketDisconnect) as exc:
                    viejo.receive_text()
                assert exc.value.code == 4409
                viejo.close()  # termina el handler viejo: corre su finally
                _time.sleep(0.1)
                assert main.sessions[code].client_ws is not None
                nuevo.send_text(main.json.dumps({"type": "client_status", "status": "live"}))
                # Lo proximo que ve la web es el cliente nuevo, no un "desconectado"
                assert main.json.loads(viewer.receive_text())["type"] == "client_status"


def test_job_delivered_true_on_first_tick_of_a_session_is_not_counted(client, main, monkeypatch):
    # El flag del SDK queda en true un buen rato despues de entregar: un
    # cliente que (re)conecta con el flag ya en true no debe generar una
    # entrega nueva. Solo cuenta la transicion false -> true vista en la sesion.
    recorded = []
    monkeypatch.setattr(main, "record_job_delivered", lambda info: recorded.append(info))
    code = client.post("/pair/new").json()["code"]
    tick = lambda delivered: main.json.dumps({"citySrc": "A", "cityDst": "B", "cargo": "C", "event": {"jobDelivered": delivered, "jobDeliveredRevenue": 100, "jobDeliveredDistanceKm": 10}})
    with client.websocket_connect(f"/ws/client/{code}") as ws:
        ws.send_text(tick(True))   # estado heredado: no cuenta
        ws.send_text(tick(True))
        ws.send_text(tick(False))
        ws.send_text(tick(True))   # transicion real: cuenta
        import time as _time
        _time.sleep(0.1)
    assert len(recorded) == 1


def test_client_status_message_does_not_seed_the_delivery_edge(client, main, monkeypatch):
    # Secuencia real de una reconexion: client_status primero, despues
    # telemetria con el flag heredado en true. No debe contar.
    recorded = []
    monkeypatch.setattr(main, "record_job_delivered", lambda info: recorded.append(info))
    code = client.post("/pair/new").json()["code"]
    tick = lambda delivered: main.json.dumps({"citySrc": "A", "cityDst": "B", "cargo": "C", "event": {"jobDelivered": delivered, "jobDeliveredRevenue": 100, "jobDeliveredDistanceKm": 10}})
    with client.websocket_connect(f"/ws/live/{code}") as viewer:
        viewer.receive_text()  # session_state
        viewer.receive_text()  # live_share_state
        with client.websocket_connect(f"/ws/client/{code}") as ws:
            viewer.receive_text()  # session_state (cliente conectado)
            ws.send_text(main.json.dumps({"type": "client_status", "status": "live", "game": "ets2", "clientVersion": "1.4.2"}))
            relayed = main.json.loads(viewer.receive_text())
            assert relayed["type"] == "client_status"  # se sigue reenviando a los viewers
            ws.send_text(tick(True))
            viewer.receive_text()
            ws.send_text(tick(True))
            viewer.receive_text()
            import time as _time
            _time.sleep(0.1)
    assert recorded == []


def test_modded_economy_jobs_are_flagged_and_excluded_from_revenue(main, monkeypatch):
    monkeypatch.setattr(main, "notify_discord_job_delivered", lambda info: None)
    main._stats_cache = None
    main.record_job_delivered({"citySrc": "Krakow", "cityDst": "Katowice", "cargo": "Wool", "revenue": 2168054, "distanceKm": 119})
    main.record_job_delivered({"citySrc": "A", "cityDst": "B", "cargo": "Steel", "revenue": 12000, "distanceKm": 400})
    stats = main._load_stats()
    assert stats["jobs_delivered"] == 2
    assert stats["total_revenue"] == 12000
    assert stats["latest_jobs"][1]["modded"] is True
    assert stats["latest_jobs"][0]["modded"] is False


def test_format_money_symbols_prefix_suffix_and_unknown(main):
    assert main.format_money(11295, "USD") == "$11,295"
    assert main.format_money(12345.4, "EUR") == "€12,345"
    assert main.format_money(53000, "PLN") == "53,000 zł"
    assert main.format_money(500, "XXX") == "500 XXX"
    assert main.format_money(500, None) == "500"


def test_convert_money_uses_eur_base_table(main, monkeypatch):
    monkeypatch.setattr(main, "get_rates", lambda: {"base": "EUR", "rates": {"EUR": 1.0, "USD": 1.1, "GBP": 0.85}})
    assert round(main.convert_money(1100, "USD", "GBP")) == 850
    assert round(main.convert_money(100, "EUR", "USD")) == 110
    assert main.convert_money(100, "EUR", "ARS") is None  # no esta en la tabla


def test_convert_money_without_rates_is_none(main, monkeypatch):
    monkeypatch.setattr(main, "get_rates", lambda: None)
    assert main.convert_money(100, "EUR", "USD") is None


def test_notify_discord_pay_uses_game_currency_and_local_equivalent(main, monkeypatch):
    monkeypatch.setattr(main, "DISCORD_WEBHOOK_URL", "https://discord.com/api/webhooks/fake")
    captured = {}

    class FakeResponse:
        def close(self):
            pass

    def fake_urlopen(req, timeout=10):
        captured["body"] = main.json.loads(req.data)
        return FakeResponse()

    monkeypatch.setattr(main.urllib.request, "urlopen", fake_urlopen)
    main.notify_discord_job_delivered({
        "citySrc": "Verona", "cityDst": "Kiel", "cargo": "Beans", "revenue": 12345, "distanceKm": 1400,
        "game": "ets2", "currency": "EUR", "localCurrency": "GBP", "localRevenue": 10604,
    })
    fields = {f["name"]: f["value"] for f in captured["body"]["embeds"][0]["fields"]}
    assert fields["Pay"] == "€12,345 · ≈ £10,604"

    # ETS2 sin moneda local: solo euros (antes salia con "$")
    main.notify_discord_job_delivered({"citySrc": "A", "cityDst": "B", "revenue": 500, "game": "ets2"})
    fields = {f["name"]: f["value"] for f in captured["body"]["embeds"][0]["fields"]}
    assert fields["Pay"] == "€500"


def test_record_job_delivered_converts_to_local_currency(main, monkeypatch, tmp_path):
    monkeypatch.setattr(main, "_r2_client", lambda: None)
    monkeypatch.setattr(main, "_stats_cache", {"total_sessions": 0, "daily": {}})
    monkeypatch.setattr(main, "notify_discord_job_delivered", lambda job: None)
    monkeypatch.setattr(main, "get_rates", lambda: {"base": "EUR", "rates": {"EUR": 1.0, "USD": 1.1, "GBP": 0.85}})
    job = {"game": "ets2", "citySrc": "A", "cityDst": "B", "cargo": "C", "revenue": 1000, "distanceKm": 100,
           "currency": "EUR", "localCurrency": "GBP"}
    main.record_job_delivered(job)
    assert job["localRevenue"] == 850
    # misma moneda que el juego: no hay nada que convertir
    job2 = {"game": "ets2", "citySrc": "A", "cityDst": "C", "cargo": "C", "revenue": 1000, "distanceKm": 100,
            "currency": "EUR", "localCurrency": "EUR"}
    main.record_job_delivered(job2)
    assert job2["localCurrency"] is None and "localRevenue" not in job2


def test_is_valid_currency(main):
    assert main.is_valid_currency("GBP")
    assert main.is_valid_currency("ars")
    assert not main.is_valid_currency("EURO")
    assert not main.is_valid_currency("12$")
    assert not main.is_valid_currency(None)


def test_viewer_outbox_coalesces_telemetry_but_keeps_control_in_order(main):
    import asyncio

    class SlowWs:
        def __init__(self):
            self.sent = []

        async def send_text(self, text):
            self.sent.append(text)
            await asyncio.sleep(0.05)  # viewer lento

    async def scenario():
        ws = SlowWs()
        ob = main.ViewerOutbox(ws)
        for i in range(6):
            ob.push_telemetry(f"t{i}")
            await asyncio.sleep(0.005)  # llegan mucho mas rapido de lo que el viewer consume
        ob.push_control("c1")
        ob.push_control("c2")
        ob.push_telemetry("t6")
        await asyncio.sleep(0.4)
        ob.close()
        return ws.sent, ob.dropped

    sent, dropped = asyncio.run(scenario())
    assert sent[0] == "t0"                      # el primero sale enseguida
    assert "t6" in sent and sent[-1] == "t6"    # el ultimo siempre llega
    assert dropped >= 3                          # los del medio se pisaron
    assert [m for m in sent if m.startswith("c")] == ["c1", "c2"]  # control: todos y en orden
    assert len(sent) < 9



# ---- convoy (beta) --------------------------------------------------------

class _ConvoyWs:
    def __init__(self):
        self.sent = []

    async def send_text(self, text):
        import json as _json
        self.sent.append(_json.loads(text))


def _convoy_session(main, code, nick_ws=True):
    s = main.Session(code)
    s.client_ws = object()  # "conectado"
    ws = _ConvoyWs()
    s.viewer_ws_list = [ws]
    s.viewer_outboxes[ws] = main.ViewerOutbox(ws)
    main.sessions[code] = s
    return s, ws


def _drain(main):
    import asyncio
    async def run():
        for _ in range(5):
            await asyncio.sleep(0.01)
    asyncio.run(run())


def test_convoy_create_join_state_and_leave(main):
    import asyncio

    async def scenario():
        main.convoys.clear()
        a, wa = _convoy_session(main, "AAAAAAAA")
        b, wb = _convoy_session(main, "BBBBBBBB")
        a.last_summary = main.summarize_for_convoy({"position": {"x": 0, "z": 0}, "game": "ats", "speedKmh": 80, "cargo": "Beans"}, None, main.time.time())
        r = main.handle_convoy_message(a, wa, "convoy_create", {"nickname": "Netherman", "mapVariant": "ats", "postSummary": False})
        assert r is None
        code = a.convoy_code
        assert code and len(code) == 6 and code in main.convoys
        r = main.handle_convoy_message(b, wb, "convoy_join", {"nickname": "Cobra", "code": code.lower(), "mapVariant": "ats_c2c"})
        assert r is None and b.convoy_code == code
        await asyncio.sleep(0.05)
        states = [m for m in wb.sent if m.get("type") == "convoy_state"]
        assert states, wb.sent
        st = states[-1]
        assert st["code"] == code and st["you"] and len(st["members"]) == 2
        me = next(m for m in st["members"] if m["id"] == st["you"])
        other = next(m for m in st["members"] if m["id"] != st["you"])
        assert me["nickname"] == "Cobra" and me["variant"] == "ats_c2c" and not me["creator"]
        assert other["creator"] and other["online"] and other["speedKmh"] == 80 and other["cargo"] == "Beans"
        assert "jobIncome" not in other            # pago oculto por defecto
        assert "AAAAAAAA" not in main.json.dumps(st)  # el codigo de pairing nunca viaja
        # mensaje rapido + rate limit
        main.handle_convoy_message(b, wb, "convoy_msg", {"key": "fuel"})
        main.handle_convoy_message(b, wb, "convoy_msg", {"key": "go"})
        await asyncio.sleep(0.05)
        msgs = [m for m in wa.sent if m.get("type") == "convoy_msg"]
        assert [m["key"] for m in msgs] == ["fuel"]
        # ruta del lider llega al otro
        main.handle_convoy_message(a, wa, "convoy_route", {"points": [[0, 0], [10, 10], [20, 25]]})
        await asyncio.sleep(0.05)
        routes = [m for m in wb.sent if m.get("type") == "convoy_route"]
        assert routes and routes[-1]["points"] == [[0, 0], [10, 10], [20, 25]]
        # expulsar: solo el creador; el expulsado no puede volver
        main.handle_convoy_message(b, wb, "convoy_kick", {"id": me["id"]})
        assert b.convoy_code == code
        main.handle_convoy_message(a, wa, "convoy_kick", {"id": me["id"]})
        assert b.convoy_code is None
        r = main.handle_convoy_message(b, wb, "convoy_join", {"nickname": "Cobra", "code": code})
        assert r == {"type": "convoy_error", "reason": "banned"}
        await asyncio.sleep(0.05)
        kicked = [m for m in wb.sent if m.get("type") == "convoy_state" and m.get("kicked")]
        assert kicked
        # apodo invalido / codigo inexistente
        assert main.handle_convoy_message(b, wb, "convoy_join", {"nickname": "<x>", "code": code})["reason"] == "bad_nickname"
        assert main.handle_convoy_message(b, wb, "convoy_join", {"nickname": "Zed", "code": "ZZZZZZ"})["reason"] == "not_found"
        # el creador se va: sala vacia, expira
        main.handle_convoy_message(a, wa, "convoy_leave", {})
        assert a.convoy_code is None and not main.convoys[code].members
        main.convoys[code].empty_since = main.time.time() - 10_000
        main.convoy_tick()
        assert code not in main.convoys

    asyncio.run(scenario())


def test_convoy_una_sola_pestana_maneja_y_otra_la_reclama_si_se_va(main):
    """Con la PC y el celular abiertos, solo la pestana que maneja manda la
    ruta del miembro (la otra mandaba la suya, vacia, y los demas la veian
    aparecer y desaparecer). Si esa pestana se cierra o se recarga, el estado
    dice driverless y la que queda la reclama (antes nadie volvia a mandar
    la ruta despues de recargar)."""
    import asyncio

    async def scenario():
        main.convoys.clear()
        a, wa = _convoy_session(main, "AAAAAAAA")
        wa2 = _ConvoyWs()  # segunda pestana de la misma sesion
        a.viewer_ws_list.append(wa2)
        a.viewer_outboxes[wa2] = main.ViewerOutbox(wa2)
        b, wb = _convoy_session(main, "BBBBBBBB")
        main.handle_convoy_message(a, wa, "convoy_create", {"nickname": "Netherman", "mapVariant": "ats"})
        code = a.convoy_code
        main.handle_convoy_message(b, wb, "convoy_join", {"nickname": "Cobra", "code": code})
        member = main.convoys[code].member_of(a)
        assert member.driver_ws is wa
        await asyncio.sleep(0.05)
        ultimo = lambda w: [m for m in w.sent if m.get("type") == "convoy_state"][-1]
        assert ultimo(wa)["driver"] is True and ultimo(wa2)["driver"] is False
        assert ultimo(wa)["driverless"] is False
        # la otra pestana no pisa la ruta ni la variante, ni la reclama sin force
        main.handle_convoy_message(a, wa, "convoy_route", {"points": [[0, 0], [10, 10]]})
        main.handle_convoy_message(a, wa2, "convoy_route", {"points": []})
        main.handle_convoy_message(a, wa2, "convoy_variant", {"mapVariant": "ets2"})
        main.handle_convoy_message(a, wa2, "convoy_claim", {})
        assert member.route == [[0, 0], [10, 10]] and member.variant == "ats" and member.driver_ws is wa
        # se cierra la que manejaba: driverless, y la que queda la reclama
        del a.viewer_outboxes[wa]
        a.viewer_ws_list.remove(wa)
        main.convoy_tick()
        await asyncio.sleep(0.05)
        assert ultimo(wa2)["driverless"] is True
        main.handle_convoy_message(a, wa2, "convoy_claim", {})
        assert member.driver_ws is wa2
        await asyncio.sleep(0.05)
        assert ultimo(wa2)["driver"] is True and ultimo(wa2)["driverless"] is False
        main.handle_convoy_message(a, wa2, "convoy_route", {"points": [[5, 5], [6, 6]]})
        assert member.route == [[5, 5], [6, 6]]
        # tocar algo en otra pestana (force) la pasa a manejar aunque la otra siga viva
        wa3 = _ConvoyWs()
        a.viewer_ws_list.append(wa3)
        a.viewer_outboxes[wa3] = main.ViewerOutbox(wa3)
        main.handle_convoy_message(a, wa3, "convoy_claim", {"force": True})
        assert member.driver_ws is wa3

    asyncio.run(scenario())


def test_convoy_web_vieja_sin_claim_maneja_si_no_hay_nadie(main):
    """Una pestana con la web de antes no manda convoy_claim: si no hay
    pestana viva manejando, la que manda la ruta se queda con el lugar."""
    import asyncio

    async def scenario():
        main.convoys.clear()
        a, wa = _convoy_session(main, "AAAAAAAA")
        main.handle_convoy_message(a, wa, "convoy_create", {"nickname": "Netherman"})
        member = main.convoys[a.convoy_code].member_of(a)
        member.driver_ws = None  # p. ej. la pestana que entro se recargo
        main.handle_convoy_message(a, wa, "convoy_route", {"points": [[1, 1], [2, 2]]})
        assert member.driver_ws is wa and member.route == [[1, 1], [2, 2]]

    asyncio.run(scenario())


def test_convoy_summary_heading_and_km(main):
    import asyncio

    async def scenario():
        main.convoys.clear()
        a, wa = _convoy_session(main, "DDDDDDDD")
        main.handle_convoy_message(a, wa, "convoy_create", {"nickname": "Solo", "mapVariant": "ets2"})
        t = main.time.time()
        a.last_summary = main.summarize_for_convoy({"position": {"x": 0, "z": 0}, "game": "ets2"}, None, t)
        main.convoy_tick()
        a.last_summary = main.summarize_for_convoy({"position": {"x": 0, "z": -100}, "game": "ets2"}, a.last_summary, t + 1)
        assert round(a.last_summary["heading"]) == 0  # hacia el norte (z decrece)
        main.convoy_tick()
        m = main.convoys[a.convoy_code].members[a.code]
        assert abs(m.km - 100 * 19 / 1000) < 1e-6  # 100 m crudos = 1.9 km mostrados en ETS2

    asyncio.run(scenario())


def test_convoy_create_again_with_own_code_is_a_rejoin(main):
    import asyncio

    async def scenario():
        main.convoys.clear()
        a, wa = _convoy_session(main, "EEEEEEEE")
        main.handle_convoy_message(a, wa, "convoy_create", {"nickname": "Netherman", "mapVariant": "ats"})
        code = a.convoy_code
        # la pestana se reconecta y vuelve a mandar create con el mismo codigo
        main.handle_convoy_message(a, wa, "convoy_create", {"nickname": "Netherman", "mapVariant": "ats", "code": code})
        assert a.convoy_code == code and len(main.convoys) == 1
        assert main.convoys[code].members[a.code].nickname == "Netherman"

    asyncio.run(scenario())


def test_convoy_resumen_suma_los_km_de_los_que_se_fueron(main, monkeypatch):
    """convoy_close saca a todos antes de armar el resumen: los km tienen que
    quedar en el convoy al salir cada uno, y una sola vez aunque el que se va
    sea una sesion muerta que limpia convoy_tick (auditoria del 10-10)."""
    import asyncio

    async def scenario():
        main.convoys.clear()
        a, wa = _convoy_session(main, "FFFFFFFF")
        b, wb = _convoy_session(main, "GGGGGGGG")
        c, wc = _convoy_session(main, "HHHHHHHH")
        main.handle_convoy_message(a, wa, "convoy_create", {"nickname": "Lider", "mapVariant": "ets2"})
        code = a.convoy_code
        convoy = main.convoys[code]
        main.handle_convoy_message(b, wb, "convoy_join", {"nickname": "Dos", "code": code})
        main.handle_convoy_message(c, wc, "convoy_join", {"nickname": "Tres", "code": code})
        convoy.members[a.code].km = 100.0
        convoy.members[b.code].km = 40.0
        convoy.members[c.code].km = 7.0
        main.handle_convoy_message(b, wb, "convoy_leave", {})  # se va a mano
        del main.sessions[c.code]                               # su sesion murio
        main.convoy_tick()
        main.convoy_tick()                                      # no se cuenta dos veces
        assert c.convoy_code is None
        assert abs(convoy.km_left - 47.0) < 1e-6
        main.handle_convoy_message(a, wa, "convoy_close", {})  # saca a todos y termina
        assert code not in main.convoys and not convoy.members

        captured = {}

        class FakeResponse:
            def close(self):
                pass

        def fake_urlopen(req, timeout=10):
            captured["body"] = main.json.loads(req.data)
            return FakeResponse()

        monkeypatch.setattr(main, "DISCORD_CONVOY_WEBHOOK_URL", "https://discord.com/api/webhooks/fake")
        monkeypatch.setattr(main.urllib.request, "urlopen", fake_urlopen)
        main.post_convoy_summary(convoy)
        fields = {f["name"]: f["value"] for f in captured["body"]["embeds"][0]["fields"]}
        assert fields["Distance"] == "147 km"

    asyncio.run(scenario())


def test_convoy_y_mapa_en_vivo_cierran_despues_del_accept(client, main):
    """Cerrando antes del accept el navegador ve 1006 sin el codigo y
    reintenta para siempre un convoy terminado o un mapa lleno. El handshake
    se tiene que completar y recien ahi llega el cierre con su codigo."""
    from starlette.websockets import WebSocketDisconnect
    main.convoys.clear()
    with client.websocket_connect("/ws/convoy/ZZZZZZ") as ws:
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_text()
    assert exc.value.code == 4404
    for i in range(main.LIVE_MAP_MAX_SPECTATORS_PER_VARIANT):
        main.live_map_spectators["ats"][f"lleno{i}"] = None
    with client.websocket_connect("/ws/livemap/ats") as ws:
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_text()
    assert exc.value.code == 4403


# ---------------------------------------------------------------- mapa en vivo publico (/live/)

def _sharing_session(main, code, variant, nick=None, summary=None):
    s = main.Session(code)
    s.share_position = True
    s.map_variant = variant
    s.live_nick = nick
    s.last_position = {"x": 10.0, "z": 20.0, "ts": main.time.time()}
    s.last_summary = summary
    main.sessions[code] = s
    return s


def test_coerce_map_variant_follows_the_telemetry_game(main):
    # la web puede mandar "ats" antes de saber el juego: la telemetria manda
    assert main.coerce_map_variant("ats", "ets2") == "ets2"
    assert main.coerce_map_variant("ats_promods", "ets2") == "ets2"
    assert main.coerce_map_variant("ets2_promods_rusmap", "ats") == "ats"
    # coincide o no hay datos: se respeta lo que eligio la web
    assert main.coerce_map_variant("ets2_promods_rusmap", "ets2") == "ets2_promods_rusmap"
    assert main.coerce_map_variant("ats_c2c", None) == "ats_c2c"
    assert main.coerce_map_variant(None, "ets2") is None


def test_live_summary_counts_sharing_sessions_per_variant(client, main):
    _sharing_session(main, "AAAAAAAA", "ats_promods")
    _sharing_session(main, "BBBBBBBB", "ats_promods")
    _sharing_session(main, "CCCCCCCC", "ets2")
    hidden = _sharing_session(main, "DDDDDDDD", "ets2")
    hidden.share_position = False  # no comparte: no cuenta
    stale = _sharing_session(main, "EEEEEEEE", "ets2")
    stale.last_position["ts"] -= main.LIVE_POSITION_STALE_SECONDS + 1

    body = client.get("/live/summary").json()
    assert body["variants"] == {"ats_promods": 2, "ets2": 1}
    assert body["total"] == 3


def test_live_map_spectator_gets_players_of_its_variant_without_pairing_codes(client, main):
    _sharing_session(main, "AAAAAAAA", "ats_promods", nick="Cobra",
                     summary={"heading": 90.0, "speedKmh": 80, "paused": False, "truck": "Kenworth W900",
                              "cargo": "Logs", "citySrc": "Boise", "cityDst": "Reno"})
    _sharing_session(main, "BBBBBBBB", "ets2")  # otra variante: no aparece
    with client.websocket_connect("/ws/livemap/ats_promods") as ws:
        first = main.json.loads(ws.receive_text())
        assert first["type"] == "live_players"
        assert first["variant"] == "ats_promods"
        assert len(first["players"]) == 1
        p = first["players"][0]
        assert p["id"] == main.sessions["AAAAAAAA"].public_id
        assert p["nick"] == "Cobra" and p["truck"] == "Kenworth W900" and p["cityDst"] == "Reno"
        assert p["heading"] == 90.0
        raw = main.json.dumps(first)
        assert "AAAAAAAA" not in raw and "BBBBBBBB" not in raw


def test_live_map_rejects_bad_variant(client, main):
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/ws/livemap/Bad Variant!") as ws:
            ws.receive_text()
    assert exc.value.code == 4404


def test_set_live_share_stores_trimmed_nick_and_clears_when_disabled(client, main):
    code = client.post("/pair/new").json()["code"]
    with client.websocket_connect(f"/ws/live/{code}") as ws:
        ws.send_text(main.json.dumps({"type": "set_live_share", "enabled": True, "mapVariant": "ets2",
                                      "nick": "  Tomás   Nether " + "x" * 40}))
        import time as _time
        _time.sleep(0.05)
        session = main.sessions[code]
        assert session.live_nick == ("Tomás Nether " + "x" * 40)[:main.LIVE_NICK_MAX_LEN]
        ws.send_text(main.json.dumps({"type": "set_live_share", "enabled": False}))
        _time.sleep(0.05)
        assert session.live_nick is None


def test_set_live_share_descarta_una_variante_que_no_es_un_nombre(client, main):
    """Una lista o un dict como mapVariant rompia broadcast_live_positions y
    /live/summary para todos (auditoria del 10-10)."""
    import time as _time
    code = client.post("/pair/new").json()["code"]
    with client.websocket_connect(f"/ws/live/{code}") as ws:
        session = main.sessions[code]
        for malo in (["ats"], {"a": 1}, "Bad Variant!"):
            ws.send_text(main.json.dumps({"type": "set_live_share", "enabled": True, "mapVariant": malo}))
            _time.sleep(0.05)
            assert session.share_position is True and session.map_variant is None
        session.last_position = {"x": 1.0, "z": 2.0, "ts": main.time.time()}
        main.broadcast_live_positions()  # no revienta
        assert client.get("/live/summary").json()["total"] == 0


def test_la_limpieza_de_sesiones_corre_aunque_el_broadcast_falle(main, monkeypatch):
    import asyncio
    limpiezas = []

    def roto():
        raise TypeError("variante rara")

    monkeypatch.setattr(main, "LIVE_POSITIONS_BROADCAST_INTERVAL_SECONDS", 0.001)
    monkeypatch.setattr(main, "broadcast_live_positions", roto)
    monkeypatch.setattr(main, "cleanup_expired_sessions", lambda: limpiezas.append(1))
    monkeypatch.setattr(main.logging, "exception", lambda *a, **k: None)

    async def run():
        task = asyncio.create_task(main.broadcast_live_positions_loop())
        for _ in range(200):
            if limpiezas:
                break
            await asyncio.sleep(0.01)
        task.cancel()

    asyncio.run(run())
    assert limpiezas


def test_el_reenvio_automatico_no_vuelve_a_prender_lo_que_el_usuario_apago(client, main):
    """share_position es uno por sesion y cada pestana lo reenvia al
    (re)conectar con su default (prendido): un segundo dispositivo o una
    reconexion volvia a publicar la posicion despues de que el usuario la
    apago a mano (auditoria del 10-10). explicit=True es el tilde tocado,
    explicit=False el reenvio automatico; sin la clave, una web vieja."""
    import time as _time
    code = client.post("/pair/new").json()["code"]

    def enviar(ws, enabled, **extra):
        ws.send_text(main.json.dumps({"type": "set_live_share", "enabled": enabled, "mapVariant": "ats", **extra}))

    def estado(ws):
        msg = main.json.loads(ws.receive_text())
        assert msg["type"] == "live_share_state"
        return msg["enabled"]

    with client.websocket_connect(f"/ws/live/{code}") as tab1:
        tab1.receive_text()  # session_state
        assert estado(tab1) is False
        session = main.sessions[code]
        enviar(tab1, True, explicit=False)   # primera vez: el default prendido aplica
        assert estado(tab1) is True
        enviar(tab1, False, explicit=True)   # el usuario lo apaga
        assert estado(tab1) is False
        assert session.share_off_by_user is True

        with client.websocket_connect(f"/ws/live/{code}") as tab2:
            tab2.receive_text()  # session_state
            assert estado(tab2) is False     # el dispositivo nuevo se entera del estado real
            enviar(tab2, True, explicit=False)  # su reenvio automatico se ignora
            assert estado(tab2) is False
            assert estado(tab1) is False     # le llega a todas las pestanas
            assert session.share_position is False and session.map_variant is None

            enviar(tab2, True, explicit=True)   # prender a mano si
            assert estado(tab2) is True and estado(tab1) is True
            assert session.share_off_by_user is False and session.map_variant == "ats"

            enviar(tab1, False, explicit=False)  # apagar siempre se puede
            assert estado(tab1) is False and estado(tab2) is False
            assert session.share_position is False and session.share_off_by_user is True

            enviar(tab2, True)  # web vieja (sin explicit): se aplica como antes
            assert estado(tab2) is True
            _time.sleep(0.05)
            assert session.share_position is True


# --------------------------------------------------------- eventos TruckersMP

def test_evento_tmp_se_recorta_y_marca_la_hora_como_utc(main):
    """Las horas de TruckersMP vienen sin zona y SON UTC (lo dice la pagina
    de cada evento, no la documentacion). Sin la Z el navegador las lee como
    hora local y el convoy aparece una o dos horas corrido."""
    crudo = {
        "id": 1, "name": "Convoy", "game": "ETS2",
        "event_type": {"key": "convoy", "name": "Convoy"},
        "server": {"id": 37, "name": "Event Server"},
        "departure": {"location": "Container Port", "city": "Mannheim"},
        "arrive": {"location": "Slots", "city": "Liege"},
        "meetup_at": "2026-10-03 16:00:00", "start_at": "2026-10-03 17:00:00",
        "attendances": {"confirmed": 100}, "dlcs": [], "language": "English",
        "url": "/events/1-convoy", "description": "x" * 5000, "rule": "y" * 5000,
    }
    e = main._tmp_evento(crudo)
    assert e["start_at"] == "2026-10-03T17:00:00Z"
    assert e["meetup_at"] == "2026-10-03T16:00:00Z"
    assert e["from_city"] == "Mannheim"
    assert e["url"] == "https://truckersmp.com/events/1-convoy"
    # Lo pesado no se reenvia: son la mayor parte de los 70 KB del original.
    assert "description" not in e and "rule" not in e


def test_los_eventos_de_promods_cuentan_como_ets2(main):
    """El campo game trae "ETS2 - ProMods". Filtrar por igualdad exacta los
    descartaba en silencio, justo una variante que soportamos."""
    base = {"id": 2, "departure": {}, "arrive": {}, "server": {}, "attendances": {}}
    assert main._tmp_evento({**base, "game": "ETS2 - ProMods"})["game"] == "ets2"
    assert main._tmp_evento({**base, "game": "ETS2 - ProMods"})["game_label"] == "ETS2 - ProMods"
    assert main._tmp_evento({**base, "game": "ETS2"})["game"] == "ets2"
    assert main._tmp_evento({**base, "game": "ATS"})["game"] == "ats"


def test_el_punto_de_encuentro_es_texto_libre_y_no_un_tipo(main):
    """departure.location describe donde juntarse dentro de la ciudad
    ("Slots", "Container Port"); NO dice si es una ciudad. La ciudad viene
    aparte y viene siempre."""
    e = main._tmp_evento({"id": 3, "game": "ETS2", "server": {}, "attendances": {},
                          "departure": {"location": "Slots", "city": "Calais"},
                          "arrive": {"location": "City", "city": "Duisburg"}})
    assert e["from_city"] == "Calais"
    assert e["from_spot"] == "Slots"


def test_si_la_api_de_tmp_falla_no_se_pierde_lo_ultimo_bueno(main, monkeypatch):
    """Que se caiga su API no tiene por que vaciarnos la lista."""
    main._tmp_events_cache = {"events": {"today": []}, "fetched_at": 0}
    monkeypatch.setattr(main, "_fetch_tmp_events", lambda: None)
    main._refresh_tmp_events_blocking()
    assert main._tmp_events_cache is not None


def test_tmp_events_filtra_por_juego(main, client, monkeypatch):
    def falso():
        return {"events": {"today": [
            {"id": 1, "game": "ets2", "name": "A"},
            {"id": 2, "game": "ats", "name": "B"},
        ]}, "fetched_at": 9e9}
    monkeypatch.setattr(main, "get_tmp_events", falso)
    r = client.get("/tmp/events?game=ats")
    assert r.status_code == 200
    assert [e["id"] for e in r.json()["events"]["today"]] == [2]
    assert client.get("/tmp/events").json()["events"]["today"][0]["id"] == 1


def test_version_dice_si_las_cuentas_estan_prendidas(client, main):
    """El interruptor de las cuentas: prendido por defecto, se apaga con la
    admin key y llega a todos los clientes en su proxima consulta."""
    assert client.get("/version").json()["accounts"] is True
    client.post("/admin/stats/seed", json={"accounts_enabled": False},
                headers={"X-Admin-Key": "test-admin-key"})
    assert client.get("/version").json()["accounts"] is False
    # Solo un booleano: un texto no lo apaga ni lo prende por error.
    client.post("/admin/stats/seed", json={"accounts_enabled": "si"},
                headers={"X-Admin-Key": "test-admin-key"})
    assert client.get("/version").json()["accounts"] is False
    client.post("/admin/stats/seed", json={"accounts_enabled": True},
                headers={"X-Admin-Key": "test-admin-key"})
    assert client.get("/version").json()["accounts"] is True



# --------------------------------------------------------- rutas en el mapa en vivo

def test_clean_live_route_valida_y_recorta(main):
    assert main.clean_live_route([[1.4, 2.6], [3, 4]]) == [[1, 3], [3, 4]]
    assert main.clean_live_route([[1, 2]]) is None                 # un punto no es ruta
    assert main.clean_live_route("nada") is None
    assert main.clean_live_route([[1, 2], ["x", 3]]) is None
    assert main.clean_live_route([[1, 2], [float("nan"), 3]]) is None
    largo = [[i, i] for i in range(main.LIVE_ROUTE_MAX_POINTS + 50)]
    assert len(main.clean_live_route(largo)) == main.LIVE_ROUTE_MAX_POINTS


def test_live_route_llega_al_espectador_y_se_borra_al_dejar_de_compartir(client, main):
    import time as _time
    code = client.post("/pair/new").json()["code"]
    with client.websocket_connect(f"/ws/live/{code}") as viewer:
        viewer.send_text(main.json.dumps({"type": "set_live_share", "enabled": True, "mapVariant": "ats"}))
        _time.sleep(0.05)
        session = main.sessions[code]
        session.last_position = {"x": 10.0, "z": 20.0, "ts": main.time.time()}
        viewer.send_text(main.json.dumps({"type": "live_route", "points": [[0, 0], [100.4, 50.6], [200, 80]]}))
        _time.sleep(0.05)
        assert session.live_route == [[0, 0], [100, 51], [200, 80]] and session.live_route_rev == 1
        # Un espectador que entra despues recibe las posiciones y la ruta vigente
        with client.websocket_connect("/ws/livemap/ats") as spec:
            players = main.json.loads(spec.receive_text())
            assert players["players"][0]["routeRev"] == 1
            ruta = main.json.loads(spec.receive_text())
            assert ruta["type"] == "live_route" and ruta["id"] == session.public_id
            assert ruta["points"][1] == [100, 51]
            assert code not in main.json.dumps(ruta)
        # La misma ruta otra vez no suma revision
        viewer.send_text(main.json.dumps({"type": "live_route", "points": [[0, 0], [100.4, 50.6], [200, 80]]}))
        _time.sleep(0.05)
        assert session.live_route_rev == 1
        viewer.send_text(main.json.dumps({"type": "set_live_share", "enabled": False}))
        _time.sleep(0.05)
        assert session.live_route is None
        # Sin compartir, una ruta nueva no se guarda
        viewer.send_text(main.json.dumps({"type": "live_route", "points": [[0, 0], [9, 9]]}))
        _time.sleep(0.05)
        assert session.live_route is None



# --------------------------------------------------------- mapas que no conocemos

def test_clean_offmap_report_valida_y_limpia(main):
    r = main.clean_offmap_report({"variant": "ets2", "x": -659907.4, "z": 131729.6,
                                  "mods": ["Mapa  Sudamerica", "Mapa Sudamerica", 7, "x" * 200]})
    assert r == {"variant": "ets2", "x": -659907, "z": 131730,
                 "mods": ["Mapa Sudamerica", "x" * main.OFFMAP_MOD_NAME_LEN]}
    assert main.clean_offmap_report({"variant": "Bad!", "x": 1, "z": 1}) is None
    assert main.clean_offmap_report({"variant": "ets2", "x": "nan", "z": 1}) is None
    assert main.clean_offmap_report({"variant": "ets2", "x": 1, "z": 2})["mods"] is None


def test_offmap_report_se_acumula_una_vez_por_sesion_y_variante(client, main, monkeypatch):
    import time as _time
    monkeypatch.setattr(main, "_stats_cache", {"total_sessions": 0, "daily": {}})
    monkeypatch.setattr(main, "_save_stats", lambda: None)
    code = client.post("/pair/new").json()["code"]
    msg = {"type": "offmap_report", "variant": "ets2", "x": -660000, "z": 131000,
           "mods": ["Mapa Sudamerica", "Scania sounds"]}
    with client.websocket_connect(f"/ws/live/{code}") as ws:
        ws.send_text(main.json.dumps(msg))
        ws.send_text(main.json.dumps({**msg, "x": -650000}))  # repetido: no cuenta
        _time.sleep(0.2)
    code2 = client.post("/pair/new").json()["code"]
    with client.websocket_connect(f"/ws/live/{code2}") as ws:
        ws.send_text(main.json.dumps({**msg, "x": -670000, "z": 132000, "mods": ["Mapa Sudamerica"]}))
        ws.send_text(main.json.dumps({"type": "offmap_report", "variant": "ats", "x": 1, "z": 2}))
        _time.sleep(0.2)
    off = main._stats_cache["offmap"]
    assert off["ets2"]["reports"] == 2
    assert off["ets2"]["mods"] == {"Mapa Sudamerica": 2, "Scania sounds": 1}
    assert off["ets2"]["box"] == [-670000, -660000, 131000, 132000]
    assert off["ats"]["reports"] == 1 and off["ats"]["noMods"] == 1
    assert code not in main.json.dumps(off) and code2 not in main.json.dumps(off)


def test_dlc_de_mapa_del_cliente_saneados(main):
    assert main.clean_map_dlcs({"ats": ["co", "sd", "co"], "ets2": ["east"]}) == {"ats": ["co", "sd"], "ets2": ["east"]}
    assert main.clean_map_dlcs({"ats": ["co", "<script>", 3, "x" * 40], "otro": ["a"]}) == {"ats": ["co"]}
    assert main.clean_map_dlcs({"ats": "co"}) is None
    assert main.clean_map_dlcs(None) is None


def test_mods_de_mapa_del_cliente_saneados(main):
    assert main.clean_map_mods({"ats": {"c2c": True, "canada_expansion": 1}, "ets2": None}) == {
        "ats": {"c2c": True, "canada_expansion": True}, "ets2": None}
    sucio = {"ats": {"c2c": "si", "Bad Key": True, "x" * 40: True, "<script>": True, 3: True},
             "ets2": ["promods"], "otro": {"a": True}}
    assert main.clean_map_mods(sucio) == {"ats": {"c2c": True}, "ets2": None}
    largo = {"ats": {f"m{i}": True for i in range(100)}}
    assert len(main.clean_map_mods(largo)["ats"]) == main.MAP_MOD_FLAGS_MAX
    assert main.clean_map_mods(None) is None
    assert main.clean_map_mods("c2c") is None


def test_viewer_que_entra_despues_recibe_los_mods_de_mapa(client, main):
    """El cliente solo reenvia client_status cuando algo cambia: una pestana
    que abre o recarga despues tiene que recibir los mods de mapa en el
    session_state, o carga el mapa base y la ciudad "no existe" (auditoria
    del 10-10). Los nombres de los mods (activeMods) no se guardan."""
    code = client.post("/pair/new").json()["code"]
    with client.websocket_connect(f"/ws/client/{code}") as local_client:
        local_client.send_text(main.json.dumps({
            "type": "client_status", "status": "live", "game": "ats",
            "mapMods": {"ats": {"c2c": True, "canada_expansion": True, "Basura!": True}, "ets2": None},
            "activeMods": ["Coast to Coast", "Canada Expansion"],
        }))
        import time as _time
        _time.sleep(0.1)
        with client.websocket_connect(f"/ws/live/{code}") as viewer:
            estado = main.json.loads(viewer.receive_text())
            assert estado["type"] == "session_state"
            status = estado["client_status"]
            assert status["mapMods"] == {"ats": {"c2c": True, "canada_expansion": True}, "ets2": None}
            assert "activeMods" not in status
            assert "Coast to Coast" not in main.json.dumps(estado)


def test_mapas_armados_del_cliente_saneados(main):
    bueno = {"ats": {"variant": "local_ats", "fingerprint": "17445ca6a572", "built": "2026-10-09T00:08:24",
                     "cities": 563, "mods": ["Western Canada Expansion"]}}
    assert main.clean_local_maps(bueno) == bueno
    assert main.clean_local_maps({"ats": {"variant": "ets2", "fingerprint": "abcdef"}}) is None
    assert main.clean_local_maps({"ats": {"variant": "local_ats", "fingerprint": "<script>"}}) is None
    assert main.clean_local_maps({"nope": bueno["ats"]}) is None
    assert main.clean_local_maps("x") is None
    assert main.clean_port(27765) == 27765
    assert main.clean_port("27765") is None and main.clean_port(80) is None


def test_el_cliente_sabe_cuantos_tableros_hay(client, main):
    """Para no abrir otra pestana en cada arranque si ya hay un tablero
    conectado (auditoria del 10-10)."""
    code = client.post("/pair/new").json()["code"]
    with client.websocket_connect(f"/ws/live/{code}") as viewer:
        viewer.receive_text()
        viewer.receive_text()
        with client.websocket_connect(f"/ws/client/{code}") as local_client:
            assert main.json.loads(local_client.receive_text()) == {"type": "viewers", "count": 1}
            with client.websocket_connect(f"/ws/live/{code}") as otro:
                otro.receive_text()
                assert main.json.loads(local_client.receive_text()) == {"type": "viewers", "count": 2}
            assert main.json.loads(local_client.receive_text()) == {"type": "viewers", "count": 1}


# Campos del client_status que el relay NO guarda para las pestanas que abren
# despues, y por que. Cualquier otro campo que el cliente mande tiene que
# llegar en el session_state: si no, un tablero abierto despues anda distinto
# que uno abierto antes (mods de mapa y "detail" se perdian asi, 10-10).
CLIENT_STATUS_NO_GUARDADO = {
    "type": "es el tipo del mensaje",
    "activeMods": "nombres de mods del usuario: privacidad, solo viajan en vivo",
}


def _campos_de_status_message():
    """Las claves del dict que arma status_message() en el cliente."""
    import ast
    import pathlib
    src = pathlib.Path(__file__).resolve().parent.parent / "client" / "tray_client.py"
    arbol = ast.parse(src.read_text(encoding="utf-8"))
    func = next(n for n in ast.walk(arbol) if isinstance(n, ast.FunctionDef) and n.name == "status_message")
    dic = next(n for n in ast.walk(func) if isinstance(n, ast.Dict))
    return {k.value for k in dic.keys if isinstance(k, ast.Constant)}


def test_contrato_client_status(client, main):
    campos = _campos_de_status_message()
    assert {"status", "game", "mapMods", "detail"} <= campos  # el parseo encontro el dict correcto
    code = client.post("/pair/new").json()["code"]
    with client.websocket_connect(f"/ws/client/{code}") as local_client:
        local_client.send_text(main.json.dumps({
            "type": "client_status", "status": "plugin_missing", "game": "ats", "clientVersion": "1.5.30",
            "detail": "The running game (D:\\ATS\\bin\\win_x64) has no telemetry plugin.",
            "mapMods": {"ats": {"c2c": True}, "ets2": None}, "activeMods": ["Coast to Coast"],
            "mapDlcs": None, "localMaps": None, "localMapPort": 27765, "overlay": True,
        }))
        import time as _time
        _time.sleep(0.1)
        with client.websocket_connect(f"/ws/live/{code}") as viewer:
            estado = main.json.loads(viewer.receive_text())
            assert estado["type"] == "session_state"
            guardado = estado["client_status"]
            faltan = campos - set(CLIENT_STATUS_NO_GUARDADO) - set(guardado)
            assert not faltan, f"el relay no guarda {sorted(faltan)}: agregarlos o explicar en CLIENT_STATUS_NO_GUARDADO"
            assert guardado["detail"].startswith("The running game")
            assert "activeMods" not in guardado


def test_client_status_detail_acotado(client, main):
    code = client.post("/pair/new").json()["code"]
    with client.websocket_connect(f"/ws/client/{code}") as local_client:
        local_client.send_text(main.json.dumps({"type": "client_status", "status": "live", "detail": "x" * 5000}))
        import time as _time
        _time.sleep(0.1)
        with client.websocket_connect(f"/ws/live/{code}") as viewer:
            assert len(main.json.loads(viewer.receive_text())["client_status"]["detail"]) == 400


# --------------------------------------------------------- empresas que faltan

def test_clean_missing_company_valida_y_limpia(main):
    bueno = {"variant": "ats_c2c", "company": "homburg_frt", "city": "gulfport", "kind": "pickup",
             "companyName": "  Homburg   Freight ", "cityName": "Gulfport", "x": -12345.6, "z": 6789.4}
    assert main.clean_missing_company(bueno) == {
        "variant": "ats_c2c", "company": "homburg_frt", "city": "gulfport", "kind": "pickup",
        "companyName": "Homburg Freight", "cityName": "Gulfport", "x": -12346, "z": 6789}
    assert main.clean_missing_company({**bueno, "company": "<script>"}) is None
    assert main.clean_missing_company({**bueno, "city": None}) is None
    assert main.clean_missing_company({**bueno, "variant": "local_ats"}) is None
    assert main.clean_missing_company({**bueno, "kind": "otro"}) is None
    assert main.clean_missing_company({**bueno, "x": "nan"}) is None
    assert main.clean_missing_company({**bueno, "companyName": 7})["companyName"] is None
    assert len(main.clean_missing_company({**bueno, "companyName": "x" * 500})["companyName"]) == 60


def test_missing_company_se_acumula_una_vez_por_sesion(client, main, monkeypatch):
    import time as _time
    monkeypatch.setattr(main, "_stats_cache", {"total_sessions": 0, "daily": {}})
    monkeypatch.setattr(main, "_save_stats", lambda: None)
    msg = {"type": "missing_company", "variant": "ats_c2c", "company": "homburg_frt", "city": "gulfport",
           "kind": "pickup", "companyName": "Homburg Freight", "x": 100, "z": 200}
    code = client.post("/pair/new").json()["code"]
    with client.websocket_connect(f"/ws/live/{code}") as ws:
        ws.send_text(main.json.dumps(msg))
        ws.send_text(main.json.dumps({**msg, "kind": "dest", "x": 101}))  # repetida en la sesion: no cuenta
        _time.sleep(0.2)
    code2 = client.post("/pair/new").json()["code"]
    with client.websocket_connect(f"/ws/live/{code2}") as ws:
        ws.send_text(main.json.dumps({**msg, "kind": "dest", "x": 102, "z": 202}))
        _time.sleep(0.2)
    todo = main._stats_cache["missing_companies"]
    e = todo["ats_c2c|homburg_frt|gulfport"]
    assert e["reports"] == 2 and e["companyName"] == "Homburg Freight"
    assert e["points"] == [[100, 200, "pickup"], [102, 202, "dest"]]
    assert code not in main.json.dumps(todo)
    # se ve en el panel de admin y no en las stats publicas
    assert "missing_companies" in client.get("/admin/stats", headers={"X-Admin-Key": "test-admin-key"}).json()
    assert "missing_companies" not in client.get("/stats/public").json()


def test_missing_company_lista_acotada(main, monkeypatch):
    monkeypatch.setattr(main, "_stats_cache", {"total_sessions": 0, "daily": {}})
    monkeypatch.setattr(main, "_save_stats", lambda: None)
    monkeypatch.setattr(main, "MISSING_COMPANIES_KEPT", 3)
    for i in range(5):
        main.record_missing_company({"variant": "ets2", "company": f"c{i}", "city": "x", "kind": "dest", "x": 0, "z": 0})
    assert len(main._stats_cache["missing_companies"]) == 3

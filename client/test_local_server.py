import http.server
import threading
from urllib.request import urlopen
from urllib.parse import urljoin, urlsplit, parse_qs

import local_server


def test_bundled_dashboard_is_served_without_downloading(monkeypatch, tmp_path):
    app = tmp_path / "app"
    app.mkdir()
    (app / "index.html").write_text("bundled dashboard", encoding="utf-8")
    (app / "app.js").write_text("bundled map changes", encoding="utf-8")
    (app / "app.css").write_text("body { color: red; }", encoding="utf-8")
    monkeypatch.setattr(local_server, "BUNDLED_WEB_ROOT", str(tmp_path))

    def no_network(*args, **kwargs):
        raise AssertionError("Bundled UI must not be replaced with the website")

    monkeypatch.setattr(local_server, "urlopen", no_network)
    assert local_server.refresh_web_cache()
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), local_server._StaticHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base = f"http://127.0.0.1:{server.server_port}"
        for path in ("/", "/app", "/app/", "/app/index.html", "/app/?local=1"):
            with urlopen(base + path) as response:
                assert response.read() == b"bundled dashboard"
                final_url = response.geturl()
                assert parse_qs(urlsplit(final_url).query)["local"] == ["1"]
            # Resolve assets exactly as the browser does after navigation.
            with urlopen(urljoin(final_url, "app.css?v=test")) as response:
                assert response.read() == b"body { color: red; }"
            with urlopen(urljoin(final_url, "app.js?v=test")) as response:
                assert response.read() == b"bundled map changes"
        with urlopen(base + "/?demo=1&lang=ru") as response:
            assert parse_qs(urlsplit(response.geturl()).query) == {"demo": ["1"], "lang": ["ru"]}
        with urlopen(base + "/app/app.js?v=test") as response:
            assert response.read() == b"bundled map changes"
        assert not (tmp_path.parent / "webcache").exists()
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def test_map_proxy_preserves_byte_ranges(monkeypatch, tmp_path):
    import io
    from urllib.request import Request
    (tmp_path / "app").mkdir()
    (tmp_path / "app" / "index.html").write_text("app")
    monkeypatch.setattr(local_server, "BUNDLED_WEB_ROOT", str(tmp_path))
    seen = []

    def remote(request, timeout):
        seen.append(request)
        response = io.BytesIO(b"tiles")
        response.status = 206
        response.headers = {"Content-Type": "application/octet-stream", "Content-Length": "5", "Content-Range": "bytes 10-14/100", "ETag": '"v1"'}
        return response

    monkeypatch.setattr(local_server, "urlopen", remote)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), local_server._StaticHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with urlopen(Request(f"http://127.0.0.1:{server.server_port}/map-assets/vector/ets2.pmtiles?v=1", headers={"Range": "bytes=10-14"})) as response:
            assert response.status == 206
            assert response.headers["Content-Range"] == "bytes 10-14/100"
            assert response.read() == b"tiles"
        assert seen[0].full_url == "https://maps.trucksim-dash.com/vector/ets2.pmtiles?v=1"
        assert seen[0].get_header("Range") == "bytes=10-14"
    finally:
        server.shutdown()
        server.server_close()
        thread.join()

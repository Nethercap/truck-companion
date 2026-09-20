import http.server
import threading
from urllib.request import urlopen

import local_server


def test_bundled_dashboard_is_served_without_downloading(monkeypatch, tmp_path):
    app = tmp_path / "app"
    app.mkdir()
    (app / "index.html").write_text("bundled dashboard", encoding="utf-8")
    (app / "app.js").write_text("bundled map changes", encoding="utf-8")
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
        for path in ("/", "/app", "/app/?local=1"):
            with urlopen(base + path) as response:
                assert response.read() == b"bundled dashboard"
        with urlopen(base + "/app/app.js?v=test") as response:
            assert response.read() == b"bundled map changes"
        assert not (tmp_path.parent / "webcache").exists()
    finally:
        server.shutdown()
        server.server_close()
        thread.join()

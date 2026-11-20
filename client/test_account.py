"""account.py contra un servidor HTTP local: que estado y que motivo saca de
cada respuesta. La API de verdad no se toca."""

import http.server
import json
import threading
import urllib.request

import pytest

import account


class _Manejador(http.server.BaseHTTPRequestHandler):
    # ruta -> (codigo, tipo, cuerpo)
    respuestas: dict = {}

    def _responder(self):
        codigo, tipo, cuerpo = self.respuestas.get(self.path, (404, "text/plain", "no"))
        datos = cuerpo.encode()
        self.send_response(codigo)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)

    def do_GET(self):
        self._responder()

    def do_POST(self):
        self.rfile.read(int(self.headers.get("Content-Length") or 0))
        self._responder()

    def log_message(self, *args):
        pass


@pytest.fixture
def api(monkeypatch):
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Manejador)
    hilo = threading.Thread(target=srv.serve_forever, daemon=True)
    hilo.start()
    # Directo, sin el proxy del sistema (en CI puede haber uno).
    directo = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    monkeypatch.setattr(account.red, "abrir",
                        lambda pedido, timeout: directo.open(pedido, timeout=timeout))
    _Manejador.respuestas = {}
    yield _Manejador.respuestas, {"accounts_url": f"http://127.0.0.1:{srv.server_address[1]}"}
    srv.shutdown()
    srv.server_close()


def _json(codigo, datos):
    return (codigo, "application/json", json.dumps(datos))


def test_un_token_que_vale_da_el_usuario(api):
    respuestas, settings = api
    respuestas["/auth/me"] = _json(200, {"usuario": {"username": "Netherman"}})
    assert account.quien_soy("tok", settings) == ("vinculado", {"username": "Netherman"}, "")


def test_usuario_null_es_un_token_cerrado_no_un_corte(api):
    """Asi contesta la API a un token de una sesion cerrada desde la web
    (/auth/me de truckdash-loginapp: 200 con usuario null, no 401)."""
    respuestas, settings = api
    respuestas["/auth/me"] = _json(200, {"usuario": None})
    assert account.quien_soy("tok", settings) == ("revocado", None, "")
    respuestas["/auth/me"] = _json(401, {"error": "no_autenticado"})
    assert account.quien_soy("tok", settings)[0] == "revocado"


def test_un_403_de_cloudflare_dice_su_codigo(api):
    respuestas, settings = api
    respuestas["/auth/me"] = (403, "text/plain", "error code: 1010\n")
    assert account.quien_soy("tok", settings) == ("sin_respuesta", None,
                                                  "HTTP 403, Cloudflare 1010")
    respuestas["/auth/device/start"] = (429, "text/html",
                                        "<html><title>Access denied | Error 1015</title></html>")
    assert account.pedir_codigo("PC", settings) == (None, "HTTP 429, Cloudflare 1015")


def test_un_error_de_la_api_dice_su_clave(api):
    respuestas, settings = api
    respuestas["/auth/device/start"] = _json(500, {"error": "base_caida"})
    assert account.pedir_codigo("PC", settings) == (None, "HTTP 500: base_caida")


def test_un_200_que_no_es_nuestro_json_es_como_sin_red(api):
    """El portal de un wifi publico o un filtro contestan 200 con su pagina."""
    respuestas, settings = api
    respuestas["/auth/me"] = (200, "text/html",
                              "<html><head><title>Hotel WiFi Login</title></head></html>")
    assert account.quien_soy("tok", settings) == ("sin_respuesta", None,
                                                  "HTTP 200, Hotel WiFi Login")
    # Y no se toma por un token cerrado: no hay "usuario" en la respuesta.
    respuestas["/auth/me"] = _json(200, {"ok": True})
    assert account.quien_soy("tok", settings)[0] == "sin_respuesta"


def test_pedir_codigo_devuelve_el_pedido(api):
    respuestas, settings = api
    pedido = {"secret": "s", "code": "ACDE-3456", "expires_in": 600, "url": "http://x/"}
    respuestas["/auth/device/start"] = _json(200, pedido)
    assert account.pedir_codigo("PC", settings) == (pedido, "")


def test_sin_servidor_dice_lo_que_dijo_la_red(monkeypatch):
    def abrir(pedido, timeout):
        raise urllib.error.URLError(TimeoutError("timed out"))
    monkeypatch.setattr(account.red, "abrir", abrir)
    assert account.quien_soy("tok") == ("sin_respuesta", None, "timed out")
    assert account._pedir(account.base_api() + "/auth/me") == (0, {})


def test_el_motivo_no_pasa_del_largo_maximo():
    largo = account._motivo_http(502, "x" * 500, None)
    assert len(largo) == account.MOTIVO_MAX and largo.endswith("...")

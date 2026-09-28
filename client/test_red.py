"""El proxy del sistema se prueba primero; si falla, se va directo.

Los proxies se controlan parcheando urllib.request.getproxies y proxy_bypass:
en Windows salen del registro y en CI (o en una maquina con HTTPS_PROXY) de
las variables de entorno, y ninguna de las dos cosas puede decidir el test.
"""

import io
import urllib.error
import urllib.request

import pytest

import red

RELAY_WS = "wss://truck-companion-production.up.railway.app/ws/client/ABCDEFGH"
RELAY_HTTP = "https://truck-companion-production.up.railway.app/version"


@pytest.fixture
def sin_proxy(monkeypatch):
    monkeypatch.setattr(urllib.request, "getproxies", lambda: {})
    monkeypatch.setattr(urllib.request, "proxy_bypass", lambda host: False)


@pytest.fixture
def con_proxy(monkeypatch):
    monkeypatch.setattr(urllib.request, "getproxies",
                        lambda: {"https": "http://usuario:clave@10.0.0.5:8080",
                                 "http": "http://usuario:clave@10.0.0.5:8080"})
    monkeypatch.setattr(urllib.request, "proxy_bypass", lambda host: False)


def test_sin_proxy_en_el_sistema_no_hay_nada_que_alternar(sin_proxy):
    ruta = red.Ruta(RELAY_WS)
    assert ruta.proxy is None
    assert ruta.opciones() == {}
    ruta.fallo_al_conectar()
    ruta.fallo_al_conectar()
    # Pasarle proxy=None a websockets sin que haya proxy seria inofensivo,
    # pero la ruta no tiene por que cambiar: no hay dos caminos.
    assert ruta.opciones() == {}


def test_con_proxy_alterna_despues_de_cada_fallo_al_conectar(con_proxy):
    ruta = red.Ruta(RELAY_WS)
    assert ruta.proxy
    assert ruta.opciones() == {}, "primero como diria el sistema"
    ruta.fallo_al_conectar()
    assert ruta.opciones() == {"proxy": None}, "despues directo"
    ruta.fallo_al_conectar()
    assert ruta.opciones() == {}, "y si directo tampoco, de nuevo por el proxy"


def test_un_socks_del_sistema_tambien_cuenta(monkeypatch):
    # En Windows un SOCKS declarado en las opciones de internet llega como
    # {"socks": "http://host:port"}: es el caso que rompia seguro, porque el
    # .exe no trae python-socks.
    monkeypatch.setattr(urllib.request, "getproxies", lambda: {"socks": "http://127.0.0.1:1080"})
    monkeypatch.setattr(urllib.request, "proxy_bypass", lambda host: False)
    assert red.proxy_para(RELAY_WS) == "socks5h://127.0.0.1:1080"


def test_un_host_excluido_del_proxy_no_tiene_proxy(monkeypatch, con_proxy):
    monkeypatch.setattr(urllib.request, "proxy_bypass", lambda host: True)
    assert red.proxy_para(RELAY_WS) is None
    assert red.proxy_para(RELAY_HTTP) is None


def test_el_log_no_muestra_la_clave_del_proxy():
    assert red.sin_credenciales("http://usuario:clave@10.0.0.5:8080") == "http://10.0.0.5:8080"
    assert "clave" not in red.sin_credenciales("socks5h://u:clave@proxy.local")


class _Respuesta(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _abridor_directo(monkeypatch, llamadas):
    class Directo:
        def open(self, pedido, timeout=None):
            llamadas.append(("directo", pedido))
            return _Respuesta(b"directo")

    def build_opener(*handlers):
        # Directo quiere decir un ProxyHandler vacio, no cualquier opener.
        assert any(isinstance(h, urllib.request.ProxyHandler) and h.proxies == {} for h in handlers)
        return Directo()

    monkeypatch.setattr(urllib.request, "build_opener", build_opener)


def test_abrir_reintenta_directo_si_el_proxy_no_llega(monkeypatch, con_proxy):
    llamadas = []

    def urlopen(pedido, timeout=None):
        llamadas.append(("sistema", pedido))
        raise urllib.error.URLError("Tunnel connection failed")

    monkeypatch.setattr(urllib.request, "urlopen", urlopen)
    _abridor_directo(monkeypatch, llamadas)
    with red.abrir(RELAY_HTTP, timeout=5) as r:
        assert r.read() == b"directo"
    assert [q for q, _ in llamadas] == ["sistema", "directo"]


def test_abrir_reintenta_directo_si_el_proxy_pide_clave(monkeypatch, con_proxy):
    llamadas = []

    def urlopen(pedido, timeout=None):
        llamadas.append(("sistema", pedido))
        raise urllib.error.HTTPError(RELAY_HTTP, 407, "Proxy Authentication Required", {}, None)

    monkeypatch.setattr(urllib.request, "urlopen", urlopen)
    _abridor_directo(monkeypatch, llamadas)
    with red.abrir(RELAY_HTTP, timeout=5) as r:
        assert r.read() == b"directo"


def test_abrir_no_reintenta_lo_que_contesto_el_servidor(monkeypatch, con_proxy):
    # Un 404 lo dio el relay: el proxy anduvo, y directo daria lo mismo. La
    # API de cuentas lee esos codigos, asi que tienen que llegarle intactos.
    llamadas = []

    def urlopen(pedido, timeout=None):
        llamadas.append(("sistema", pedido))
        raise urllib.error.HTTPError(RELAY_HTTP, 404, "Not Found", {}, None)

    monkeypatch.setattr(urllib.request, "urlopen", urlopen)
    _abridor_directo(monkeypatch, llamadas)
    with pytest.raises(urllib.error.HTTPError) as exc:
        red.abrir(RELAY_HTTP, timeout=5)
    assert exc.value.code == 404
    assert [q for q, _ in llamadas] == ["sistema"]


def test_abrir_sin_proxy_no_inventa_un_segundo_intento(monkeypatch, sin_proxy):
    llamadas = []

    def urlopen(pedido, timeout=None):
        llamadas.append(("sistema", pedido))
        raise urllib.error.URLError("sin internet")

    monkeypatch.setattr(urllib.request, "urlopen", urlopen)
    _abridor_directo(monkeypatch, llamadas)
    with pytest.raises(urllib.error.URLError):
        red.abrir(RELAY_HTTP, timeout=5)
    assert [q for q, _ in llamadas] == ["sistema"]


def test_abrir_acepta_un_request_con_cuerpo(monkeypatch, con_proxy):
    # El pedido del codigo de pairing es un POST: el reintento tiene que
    # mandar el mismo Request, no rearmarlo desde la URL.
    llamadas = []

    def urlopen(pedido, timeout=None):
        raise urllib.error.URLError("Tunnel connection failed")

    monkeypatch.setattr(urllib.request, "urlopen", urlopen)
    _abridor_directo(monkeypatch, llamadas)
    pedido = urllib.request.Request(RELAY_HTTP, data=b"{}", method="POST")
    red.abrir(pedido, timeout=5)
    assert llamadas == [("directo", pedido)]

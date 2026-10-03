"""Salir a internet por el proxy de Windows, o sin el si ese proxy no anda.

websockets (desde la 15) y urllib usan solos el proxy configurado en el
sistema: el de las opciones de internet de Windows o las variables
HTTPS_PROXY y compania. Eso esta bien para quien lo necesita para salir a
internet, pero hay gente que pone un proxy de sistema para jugar (un "ping
booster", Proxifier con una regla para todo) y ese proxy se come tambien al
cliente. Si no deja pasar la conexion al relay, el cliente reintentaba para
siempre y el tablero quedaba sin telemetria sin que nada dijera por que. Con
un proxy SOCKS era seguro: el .exe no trae python-socks y websockets levanta
ImportError en cada intento.

Por eso: se prueba primero como diria el sistema, y si falla y hay un proxy
de por medio, se prueba directo.
"""

import logging
import urllib.error
import urllib.request
from urllib.parse import urlsplit

# Respuestas que puede dar el proxy y no el servidor: el proxy pide clave, o
# no pudo llegar. Un 404 o un 400 los dio el servidor, y directo seria igual.
ERRORES_DEL_PROXY = (407, 502, 503, 504)

# Cloudflare, delante de api.trucksim-dash.com, contesta 403 a cualquier
# pedido con el agente de urllib ("Python-urllib/3.x"): con ese, el cliente
# no podia vincular la cuenta ni mandar un viaje. client.py le suma la version.
AGENTE = "TruckDash"


def proxy_para(url: str) -> str | None:
    """El proxy que se usaria para url segun el sistema, o None."""
    try:
        partes = urlsplit(url)
        if partes.scheme in ("ws", "wss"):
            # La misma cuenta que hace websockets al conectar.
            from websockets.proxy import get_proxy
            from websockets.uri import parse_uri
            return get_proxy(parse_uri(url))
        if urllib.request.proxy_bypass(partes.hostname or ""):
            return None
        return urllib.request.getproxies().get(partes.scheme)
    except Exception:
        return None


def sin_credenciales(proxy: str) -> str:
    """Para el log: un proxy puede traer usuario:clave@ adelante."""
    partes = urlsplit(proxy if "://" in proxy else "http://" + proxy)
    host = partes.hostname or "?"
    return f"{partes.scheme}://{host}" + (f":{partes.port}" if partes.port else "")


class Ruta:
    """Por donde se conecta el WebSocket al relay.

    Arranca por el proxy del sistema, porque hay quien lo necesita. Si un
    intento de conexion falla y hay proxy, el siguiente va directo, y asi
    alternando hasta que uno ande; el que anda se queda. Una conexion que
    anduvo y despues se corto no cambia la ruta: eso es la red, no el proxy.
    """

    def __init__(self, url: str):
        self.proxy = proxy_para(url)
        self.directo = False
        if self.proxy:
            logging.info("System proxy for the relay: %s", sin_credenciales(self.proxy))

    def opciones(self) -> dict:
        """kwargs para websockets.connect."""
        return {"proxy": None} if self.directo else {}

    def fallo_al_conectar(self):
        if not self.proxy:
            return
        self.directo = not self.directo
        logging.warning("Relay connection failed; next attempt goes %s",
                        "direct, without the system proxy" if self.directo else "through the system proxy")


def abrir(pedido, timeout: float):
    """urllib.request.urlopen, y si fallo por la red con un proxy del
    sistema de por medio, una vez mas sin proxy."""
    pedido = _con_agente(pedido)
    try:
        return urllib.request.urlopen(pedido, timeout=timeout)
    except urllib.error.HTTPError as exc:
        if exc.code not in ERRORES_DEL_PROXY or not proxy_para(_url(pedido)):
            raise
        error = exc
    except (urllib.error.URLError, OSError) as exc:
        if not proxy_para(_url(pedido)):
            raise
        error = exc
    logging.warning("Request through the system proxy failed (%s), retrying without it", error)
    directo = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    return directo.open(pedido, timeout=timeout)


def _con_agente(pedido) -> urllib.request.Request:
    """El mismo Request (el reintento tiene que mandar ese, con su cuerpo),
    con nuestro User-Agent si no trae uno."""
    if not isinstance(pedido, urllib.request.Request):
        pedido = urllib.request.Request(pedido)
    if not pedido.has_header("User-agent"):
        pedido.add_header("User-Agent", AGENTE)
    return pedido


def _url(pedido) -> str:
    return pedido.full_url if isinstance(pedido, urllib.request.Request) else pedido

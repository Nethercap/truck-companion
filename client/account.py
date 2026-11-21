"""Cuenta de Truck Dash, desde el cliente.

La cuenta es OPCIONAL. Todo lo que el cliente hace hoy sigue funcionando sin
ella; vincularla solo agrega que los viajes queden guardados. Por eso nada de
este archivo puede tirar una excepcion hacia afuera ni bloquear: si la API no
responde, el tablero tiene que seguir andando igual.

El cliente es open source y corre en la PC de cualquiera, asi que no puede
guardar un secreto de aplicacion: no hay forma de que pida un token por su
cuenta y que eso signifique algo. Pide un codigo, la persona lo aprueba desde
la web ya logueada, y recien ahi retira el token.
"""

import ipaddress
import json
import logging
import re
import socket
import urllib.error
import urllib.request
from urllib.parse import urlsplit

import red

API_POR_DEFECTO = "https://api.trucksim-dash.com"

# Cortos a proposito: esto corre al lado del bucle de telemetria y nada aca
# vale la pena esperar. Si tarda, se reintenta en el proximo ciclo.
TIMEOUT = 8

CLAVE_TOKEN = "account_token"
# Lo ultimo que dijo el relay sobre si las cuentas estan prendidas (ver
# backend /version). Se guarda para que un relay caido no las prenda ni las
# apague: vale lo ultimo que se supo, y sin dato, prendidas.
CLAVE_INTERRUPTOR = "accounts_remote"


def cuentas_encendidas(settings: dict | None) -> bool:
    return (settings or {}).get(CLAVE_INTERRUPTOR, True) is not False
CLAVE_API = "accounts_url"


def base_api(settings: dict | None = None) -> str:
    settings = settings or {}
    return (settings.get(CLAVE_API) or API_POR_DEFECTO).rstrip("/")


def _pedir(url: str, cuerpo: dict | None = None, token: str | None = None,
           metodo: str | None = None) -> tuple[int, dict]:
    """Devuelve (codigo, datos). Nunca levanta: un fallo de red es
    (0, {}) y el que llama decide si reintenta."""
    codigo, datos, _ = _pedir_con_motivo(url, cuerpo, token, metodo)
    return codigo, datos


# Cuanto del motivo se muestra en la ventana y en el log.
MOTIVO_MAX = 120


def _pedir_con_motivo(url: str, cuerpo: dict | None = None, token: str | None = None,
                      metodo: str | None = None, mirar_dns: bool = False) -> tuple[int, dict, str]:
    """Como _pedir, mas por que fallo ("" si anduvo).

    Sin el motivo, un 403 de Cloudflare, un DNS que no resuelve, un
    certificado que no valida y un timeout decian todos "no se puede
    contactar al servicio de cuentas", y el log no decia nada: no habia
    como saber cual era (Discord 20-11, Aerista: el tablero andaba y la
    cuenta no, en ninguno de los dos pasos).

    mirar_dns: en un fallo de red, ver tambien a que resuelve el nombre
    (_resuelve_a_local). Solo desde la ventana: la cola de viajes reintenta
    cada minuto sin internet y no muestra el motivo.
    """
    datos = json.dumps(cuerpo or {}).encode() if cuerpo is not None else None
    cabeceras = {"Content-Type": "application/json"}
    if token:
        cabeceras["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=datos, headers=cabeceras,
                                 method=metodo or ("POST" if datos is not None else "GET"))
    try:
        with red.abrir(req, timeout=TIMEOUT) as r:
            codigo = r.status
            texto = r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        try:
            texto = e.read().decode("utf-8", "replace")
        except Exception:
            texto = ""
        try:
            respuesta = json.loads(texto or "{}")
        except ValueError:
            respuesta = None
        return (e.code, respuesta if isinstance(respuesta, dict) else {},
                _motivo_http(e.code, texto, respuesta))
    except Exception as exc:  # red caida, DNS, timeout, certificado
        motivo = _motivo_red(exc, url if mirar_dns else "")
        logging.debug(f"La API de cuentas no respondio ({motivo})")
        return 0, {}, motivo
    try:
        respuesta = json.loads(texto or "{}")
    except ValueError:
        respuesta = None
    if not isinstance(respuesta, dict):
        # Un 200 que no es nuestro JSON lo dio otro: el portal de un wifi
        # publico, un proxy o un filtro. Para quien llama es como sin red.
        return 0, {}, f"HTTP {codigo}, {_resumen_texto(texto) or 'empty'}"
    return codigo, respuesta, ""


def _motivo_http(codigo: int, texto: str, respuesta) -> str:
    """'HTTP 403, Cloudflare 1010', 'HTTP 500', 'HTTP 400: pedido_vencido'."""
    if isinstance(respuesta, dict) and isinstance(respuesta.get("error"), str):
        return _cortar(f"HTTP {codigo}: {respuesta['error']}")
    # Las paginas de error de Cloudflare: "error code: 1010" en texto, o un
    # HTML con "Error 1015" en el titulo.
    cf = re.search(r"error(?: code)?:?\s*(1\d{3})\b", texto or "", re.I)
    if cf:
        return f"HTTP {codigo}, Cloudflare {cf.group(1)}"
    resumen = _resumen_texto(texto)
    return _cortar(f"HTTP {codigo}" + (f", {resumen}" if resumen else ""))


def _motivo_red(exc: Exception, url: str = "") -> str:
    """Lo que dijo la red, sin el nombre de la excepcion si ya se entiende:
    'timed out', '[Errno 11001] getaddrinfo failed', '[SSL: ...]'.

    Si el nombre de la API da una direccion local, eso va primero: es un
    filtro de DNS (el del router, un Pi-hole, un antivirus) que la bloquea,
    y lo de la red ("connection refused") no lo dice. El router eero de
    Aerista contestaba api.trucksim-dash.com con su propia 192.168.4.1
    (Discord 21-11), y con una VPN andaba.
    """
    razon = getattr(exc, "reason", None) or exc
    texto = str(razon).strip() or type(razon).__name__
    local = _resuelve_a_local(url)
    if local:
        texto = f"{urlsplit(url).hostname} resolves to {local}, a local address: a DNS filter? {texto}"
    return _cortar(texto)


def _resuelve_a_local(url: str) -> str | None:
    """La direccion local (privada, loopback, 0.0.0.0) a la que resuelve el
    nombre de url, si resuelve solo a esas; None si no, o si url ya es una
    IP o localhost (un servidor de prueba). Solo se mira despues de un fallo."""
    host = urlsplit(url).hostname if url else None
    if not host or host == "localhost":
        return None
    try:
        ipaddress.ip_address(host)
        return None  # ya es una direccion, no hay DNS de por medio
    except ValueError:
        pass
    try:
        ips = {info[4][0] for info in socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)}
        locales = [ip for ip in ips if _es_local(ip)]
    except Exception:
        return None
    return sorted(locales)[0] if locales and len(locales) == len(ips) else None


def _es_local(ip: str) -> bool:
    try:
        d = ipaddress.ip_address(ip.split("%")[0])
    except ValueError:
        return False
    return d.is_private or d.is_loopback or d.is_unspecified or d.is_link_local


def _resumen_texto(texto: str) -> str:
    """Una pista de que es una respuesta que no es JSON: el titulo de una
    pagina o el comienzo del texto."""
    texto = (texto or "").strip()
    titulo = re.search(r"<title[^>]*>(.*?)</title>", texto, re.I | re.S)
    if titulo:
        texto = titulo.group(1)
    elif texto.startswith("<"):
        return "HTML"
    return _cortar(" ".join(texto.split()))


def _cortar(texto: str) -> str:
    return texto if len(texto) <= MOTIVO_MAX else texto[:MOTIVO_MAX - 3] + "..."


# ---------------------------------------------------------------- vincular

def pedir_codigo(nombre_equipo: str, settings: dict | None = None) -> tuple[dict | None, str]:
    """Arranca la vinculacion. Devuelve ({'code', 'secret', 'expires_in',
    'url'}, "") o (None, motivo) si no se pudo."""
    url = base_api(settings) + "/auth/device/start"
    codigo, datos, motivo = _pedir_con_motivo(url, {"device_name": nombre_equipo},
                                              mirar_dns=True)
    if codigo != 200 or "secret" not in datos:
        motivo = motivo or f"HTTP {codigo}, no secret"
        logging.warning("Account: couldn't get a link code from %s (%s)", url, motivo)
        return None, motivo
    return datos, ""


def consultar_codigo(secret: str, settings: dict | None = None) -> tuple[str, str | None]:
    """Pregunta si ya lo aprobaron.

    Devuelve (estado, token): 'pendiente', 'listo', 'vencido' o 'sin_red'. El
    estado se separa del token para que la ventana sepa si seguir esperando,
    dejar de esperar, o no decir nada porque fue un corte de internet.
    """
    codigo, datos = _pedir(base_api(settings) + "/auth/device/poll", {"secret": secret})
    if codigo == 0:
        return "sin_red", None
    if codigo == 200 and datos.get("pendiente"):
        return "pendiente", None
    if codigo == 200 and datos.get("token"):
        return "listo", datos["token"]
    return "vencido", None


# ------------------------------------------------------------------- token

def token_guardado(settings: dict) -> str | None:
    valor = (settings or {}).get(CLAVE_TOKEN)
    return valor or None


# Lo que puede contestar quien_soy.
VINCULADO = "vinculado"
REVOCADO = "revocado"        # el servidor dijo que ese token ya no vale
SIN_RESPUESTA = "sin_respuesta"


def quien_soy(token: str, settings: dict | None = None) -> tuple[str, dict | None, str]:
    """De quien es ese token: (estado, usuario, motivo).

    - (VINCULADO, usuario, "")
    - (REVOCADO, None, ""): la API contesto y el token no es de nadie. Asi
      contesta /auth/me (200 con usuario null, no 401) a un token de una
      sesion cerrada desde la web, o de antes de cambiar la contrasena. Hasta
      el 20-11 la ventana lo mostraba como "no se puede contactar".
    - (SIN_RESPUESTA, None, motivo): no hubo respuesta que sirva (sin red, un
      403 de Cloudflare, un 500). No dice nada del token: borrarlo por un
      corte de wifi obligaria a vincular de nuevo cada vez.
    """
    url = base_api(settings) + "/auth/me"
    codigo, datos, motivo = _pedir_con_motivo(url, token=token, mirar_dns=True)
    if codigo == 200 and datos.get("usuario"):
        return VINCULADO, datos["usuario"], ""
    if codigo == 401 or (codigo == 200 and "usuario" in datos and datos["usuario"] is None):
        logging.warning("Account: the API says this PC's link is no longer valid")
        return REVOCADO, None, ""
    motivo = motivo or f"HTTP {codigo}"
    logging.warning("Account: couldn't check the link with %s (%s)", url, motivo)
    return SIN_RESPUESTA, None, motivo

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

import json
import logging
import urllib.error
import urllib.request

API_POR_DEFECTO = "https://api.trucksim-dash.com"

# Cortos a proposito: esto corre al lado del bucle de telemetria y nada aca
# vale la pena esperar. Si tarda, se reintenta en el proximo ciclo.
TIMEOUT = 8

CLAVE_TOKEN = "account_token"
CLAVE_API = "accounts_url"


def base_api(settings: dict | None = None) -> str:
    settings = settings or {}
    return (settings.get(CLAVE_API) or API_POR_DEFECTO).rstrip("/")


def _pedir(url: str, cuerpo: dict | None = None, token: str | None = None,
           metodo: str | None = None) -> tuple[int, dict]:
    """Devuelve (codigo, datos). Nunca levanta: un fallo de red es
    (0, {}) y el que llama decide si reintenta."""
    datos = json.dumps(cuerpo or {}).encode() if cuerpo is not None else None
    cabeceras = {"Content-Type": "application/json"}
    if token:
        cabeceras["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=datos, headers=cabeceras,
                                 method=metodo or ("POST" if datos is not None else "GET"))
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return r.status, json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8") or "{}")
        except Exception:
            return e.code, {}
    except Exception as exc:  # red caida, DNS, timeout
        logging.debug(f"La API de cuentas no respondio ({exc})")
        return 0, {}


# ---------------------------------------------------------------- vincular

def pedir_codigo(nombre_equipo: str, settings: dict | None = None) -> dict | None:
    """Arranca la vinculacion. Devuelve {'code', 'secret', 'expires_in',
    'url'} o None si no se pudo."""
    codigo, datos = _pedir(base_api(settings) + "/auth/device/start",
                           {"device_name": nombre_equipo})
    if codigo != 200 or "secret" not in datos:
        return None
    return datos


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


def quien_soy(token: str, settings: dict | None = None) -> dict | None:
    """El usuario de ese token, o None.

    None puede ser "el token ya no vale" o "no hay internet", y para la
    ventana no es lo mismo, asi que se distingue con esta_vencido().
    """
    codigo, datos = _pedir(base_api(settings) + "/auth/me", token=token)
    if codigo != 200:
        return None
    return datos.get("usuario")


def esta_vencido(token: str, settings: dict | None = None) -> bool:
    """True solo si el servidor DIJO que no vale.

    Un corte de internet no es una sesion cerrada: borrar el token porque no
    hubo respuesta obligaria a vincular de nuevo cada vez que se cae el wifi.
    """
    codigo, _ = _pedir(base_api(settings) + "/auth/me", token=token)
    return codigo == 401

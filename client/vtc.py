"""La empresa virtual (VTC) de la cuenta, desde el cliente.

El modo (los trabajos cuentan para la empresa, o son personales) vive en la API:
vale en todas las PCs de la persona y se cambia tambien desde la web. Aca se lee
para mostrarlo en la bandeja, en Setup y en el tablero, y se cambia con el token
del cliente (`PATCH /vtc/me`, que alcanza al viaje que este abierto).

Como en account.py, nada de esto levanta ni bloquea: sin cuenta, sin empresa, con
las VTC apagadas o sin internet, el cliente anda igual y no muestra nada. Que la
API no conteste no es dejar la empresa: queda lo ultimo que se supo.

Con la misma lectura llega el pase del mapa en vivo de la empresa (vtc_pase.py de
la API, 12 minutos): el cliente se lo pasa al relay, que asi sabe de que empresa
es esta sesion. Solo manejando para la empresa (`pase_para_relay`): en personal no
sale en ningun mapa.
"""

import logging
import re
import threading
import time

import account

MODOS = ("vtc", "personal")
# Cada cuanto se vuelve a preguntar: el modo se pudo cambiar en la web o en otra
# PC. Con el juego en vivo mas seguido, que es cuando importa.
CADA_S_EN_VIVO = 300
CADA_S = 900
# Un pedido a mano (se abrio Setup, se tomo un trabajo) no repite uno recien hecho.
MINIMO_S = 20

_TAG = re.compile(r"[A-Za-z0-9]{1,8}")
_COLOR = re.compile(r"#[0-9a-fA-F]{6}")
NOMBRE_MAX = 40

SIN_DATO = object()  # la API no contesto, o contesto algo que no se entiende
PASE_MAX = 4096


def de_la_api(datos) -> dict | None:
    """{"tag", "name", "color", "mode"} de la respuesta de /vtc/me, o None si
    no hay empresa (o las VTC estan apagadas para esta cuenta)."""
    if not isinstance(datos, dict) or datos.get("enabled") is not True:
        return None
    empresa, miembro = datos.get("vtc"), datos.get("member")
    if not isinstance(empresa, dict) or not isinstance(miembro, dict):
        return None
    tag, modo = empresa.get("tag"), miembro.get("mode")
    if not isinstance(tag, str) or not _TAG.fullmatch(tag) or modo not in MODOS:
        return None
    nombre, color = empresa.get("name"), empresa.get("color")
    return {"tag": tag,
            "name": " ".join(nombre.split())[:NOMBRE_MAX] if isinstance(nombre, str) else "",
            "color": color if isinstance(color, str) and _COLOR.fullmatch(color) else None,
            "mode": modo}


def pase_de_la_api(datos) -> str | None:
    """El pase del mapa en vivo de la respuesta de /vtc/me?live_pass=1, si vino."""
    vivo = datos.get("live_pass") if isinstance(datos, dict) else None
    pase = vivo.get("pass") if isinstance(vivo, dict) else None
    return pase if isinstance(pase, str) and 0 < len(pase) <= PASE_MAX and pase.count(".") == 1 else None


def traer_con_pase(token: str, settings: dict):
    """(la empresa de ese token o None si no tiene, el pase o None), o
    (SIN_DATO, None)."""
    codigo, datos = account._pedir(account.base_api(settings) + "/vtc/me?live_pass=1", token=token)
    if codigo == 200:
        empresa = de_la_api(datos)
        return empresa, pase_de_la_api(datos) if empresa else None
    # 401: el token ya no vale. 403 y 404: una API sin VTC, o apagada.
    return (None, None) if codigo in (401, 403, 404) else (SIN_DATO, None)


def traer(token: str, settings: dict):
    """La empresa de ese token, None si no tiene, o SIN_DATO."""
    return traer_con_pase(token, settings)[0]


def poner(token: str, modo: str, settings: dict) -> int:
    """El codigo de la API al cambiar el modo (0 sin red)."""
    codigo, datos = account._pedir(account.base_api(settings) + "/vtc/me", {"mode": modo},
                                   token=token, metodo="PATCH")
    # Un 200 que no dice el modo pedido no lo cambio.
    return codigo if codigo != 200 or datos.get("mode") == modo else 500


class Vtc:
    """Lo que se sabe de la empresa, para los hilos que lo miran (la bandeja,
    Setup y el bucle que le habla al tablero)."""

    def __init__(self, leer_settings, prendida=lambda: True, al_cambiar=None, ahora=time.monotonic):
        self._settings = leer_settings
        self._prendida = prendida
        self._al_cambiar = al_cambiar
        self._ahora = ahora
        self.actual: dict | None = None
        self.pase: str | None = None  # el del mapa en vivo, ver pase_para_relay
        self._rev = 0  # sube con cada cambio de modo hecho aca
        self._candado = threading.Lock()   # actual y _rev
        self._cambiando = threading.Lock()  # un cambio de modo por vez
        self._ya = threading.Event()
        self._pedida_at = None

    def refrescar(self) -> None:
        settings = self._settings()
        token = account.token_guardado(settings)
        rev = self._rev
        self._pedida_at = self._ahora()
        nueva, pase = traer_con_pase(token, settings) if token and self._prendida() else (None, None)
        with self._candado:
            # Se cambio el modo mientras la respuesta viajaba: es la de antes.
            if nueva is SIN_DATO or rev != self._rev:
                return
            antes, self.actual, self.pase = self.actual, nueva, pase
        self._avisar(antes, nueva)

    def pase_para_relay(self) -> str | None:
        """El pase que va al relay: solo manejando para la empresa. En personal
        la empresa no ve nada, ni que se esta manejando (el relay tambien lo
        mira en el pase, pero asi pasar a personal vale en el acto)."""
        with self._candado:
            return self.pase if self.actual and self.actual["mode"] == "vtc" else None

    def poner_modo(self, modo: str) -> bool:
        """Cambia el modo en la API. Tarda lo que tarde la red: se llama desde
        un hilo. False si no se pudo."""
        if modo not in MODOS:
            return False
        with self._cambiando:
            antes = self.actual
            settings = self._settings()
            token = account.token_guardado(settings)
            if antes is None or not token or not self._prendida():
                return False
            codigo = poner(token, modo, settings)
            if codigo != 200:
                logging.warning("VTC: no se pudo pasar a %s (%s)", modo, codigo or "sin red")
                # Ya no es miembro, o el cambio llego y la respuesta no.
                self.despertar(forzar=True)
                return False
            with self._candado:
                self._rev += 1
                nueva = {**antes, "mode": modo}
                self.actual = nueva
        self._avisar(antes, nueva)
        # El pase dice el modo de antes: uno nuevo.
        self.despertar(forzar=True)
        return True

    def despertar(self, forzar: bool = False) -> None:
        """Que vigilar() pregunte ahora, salvo que lo haya hecho recien."""
        if forzar or self._pedida_at is None or self._ahora() - self._pedida_at >= MINIMO_S:
            self._ya.set()

    def vigilar(self, en_vivo=lambda: False) -> None:
        """El hilo que la mantiene al dia. No vuelve."""
        while True:
            try:
                self.refrescar()
            except Exception:
                logging.exception("Fallo mirando la VTC")
            self._ya.wait(CADA_S_EN_VIVO if en_vivo() else CADA_S)
            self._ya.clear()

    def _avisar(self, antes, nueva) -> None:
        if antes == nueva:
            return
        logging.info("VTC: %s", f"[{nueva['tag']}], modo {nueva['mode']}" if nueva else "ninguna")
        if self._al_cambiar:
            try:
                self._al_cambiar()
            except Exception:
                logging.exception("Fallo avisando el cambio de VTC")

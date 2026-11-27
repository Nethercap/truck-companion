"""Lo que tiene cargado el GPS del juego, leido de la partida guardada.

La telemetria del juego dice cuantos km faltan por el GPS, pero no a donde va.
La partida guardada (game.sii de cada carpeta de save/ del perfil) si lo tiene:
los waypoints que quedan por delante (economy.stored_gps_ahead_waypoints, cada
uno un gps_waypoint_storage con la posicion del nodo de navegacion) y el
trabajo elegido en el mercado y todavia no empezado (player.selected_job, un
job_info con la empresa de origen y la de destino). Asi la web puede rutear al
remolque de un trabajo recien elegido, a un pin puesto en el mapa del juego o a
una parada del Atlas del Road Trip.

Esto solo LEE: nunca escribe ni aprieta nada. Lee la partida mas nueva que el
juego escribio por su cuenta (los autoguardados) o con un F5 de quien juega.
Discord, 15-11: de las dos formas que se propusieron (solo leer, o apretar el
guardado rapido desde el plugin, como hace TruckSim GPS), la gente eligio solo
leer, preguntando la primera vez.

El game.sii viene casi siempre cifrado ("ScsC": AES-256-CBC con una clave que
es la misma para todos, y zlib) y en binario ("BSII"); con g_save_format 2, en
texto ("SiiNunit"). Se leen los tres. El cifrado va con la libreria del
sistema (bcrypt en Windows, libcrypto en Linux) y, si no hay, con el AES de
aca, mas lento.
"""

from __future__ import annotations

import glob
import logging
import os

from juego import sii as _sii
from juego.sii import (  # noqa: F401 (los tests y tray_client los usan por aca)
    _CARACTERES,
    _SBOX,
    CLAVE_SII,
    TAMANO_MAXIMO,
    _descifradores,
    _leer_id,
    _token,
    aes_cbc_descifrar,
)
from juego.sii import SiiIlegible as PartidaIlegible

CARPETAS_DEL_JUEGO = {"ets2": "Euro Truck Simulator 2", "ats": "American Truck Simulator"}

# El numero de cada juego en Steam: su carpeta dentro de userdata/<cuenta>.
APPS_DE_STEAM = {"ets2": "227300", "ats": "270880"}

# nav_node_position va en punto fijo: el entero sobre 256 es el metro del juego.
ESCALA_NODO = 256.0

# Las unidades y las claves que se guardan; del resto solo se avanza.
CLAVES = {
    "economy": {"stored_gps_ahead_waypoints"},
    "player": {"current_job", "selected_job"},
    "job_info": {"source_company", "target_company", "cargo", "is_cargo_market_job", "car", "planned_distance_km"},
    "gps_waypoint_storage": {"nav_node_position"},
}


# ------------------------------------------------------------------ donde estan


def carpetas_de_perfiles(game: str, documentos: str, raices_steam=()) -> list:
    """Las carpetas de perfil de ese juego. Las locales, en Documentos
    (profiles). Las de Steam Cloud, en la carpeta de Steam
    (userdata/<cuenta>/<juego>/remote/profiles): en Documentos/steam_profiles
    esos perfiles dejan solo los controles y la configuracion de esta PC. Hasta
    la 1.5.46 se miraba ahi y con Steam Cloud no se leia ninguna partida
    (24-11); lo que confundio fueron las copias que deja una actualizacion del
    juego ("steam_profiles(1.61.x).bak"), que si traen partidas pero no son
    perfiles en uso."""
    base = os.path.join(documentos, CARPETAS_DEL_JUEGO[game])
    carpetas = []
    for tipo in ("steam_profiles", "profiles"):
        carpetas.extend(glob.glob(os.path.join(glob.escape(base), tipo, "*")))
    for raiz in raices_steam:
        carpetas.extend(glob.glob(os.path.join(glob.escape(raiz), "userdata", "*", APPS_DE_STEAM[game], "remote", "profiles", "*")))
    return [c for c in carpetas if os.path.isdir(c) and ".bak" not in c.lower()]


def partida_mas_nueva(game: str, documentos: str, raices_steam=()):
    """(ruta, fecha) del game.sii escrito mas recientemente en cualquier perfil
    de ese juego, o None. El que se esta jugando es el que guarda: el mas nuevo
    es de ese perfil (autoguardado, guardado rapido o uno a mano)."""
    mejor = None
    for perfil in carpetas_de_perfiles(game, documentos, raices_steam):
        for ruta in glob.glob(os.path.join(glob.escape(perfil), "save", "*", "game.sii")):
            try:
                fecha = os.path.getmtime(ruta)
            except OSError:
                continue
            if mejor is None or fecha > mejor[1]:
                mejor = (ruta, fecha)
    return mejor


# ------------------------------------------------------------------ descifrar y leer

# El descifrado y los lectores de .sii viven en juego/sii.py, que usa tambien
# el parser propio. Aca quedan con los nombres de siempre y las claves de una
# partida por defecto.


def descifrar(datos: bytes) -> bytes:
    return _sii.descifrar(datos, _descifradores())


def leer_bsii(datos: bytes, claves: dict = CLAVES) -> dict:
    return _sii.leer_bsii(datos, claves)


def leer_texto(texto: str, claves: dict = CLAVES) -> dict:
    return _sii.leer_texto(texto, claves)


# ------------------------------------------------------------------ lo que sirve


def _empresa(id_empresa) -> dict | None:
    """"company.volatile.tradeaux.berlin" -> {company, city}."""
    partes = id_empresa.split(".") if isinstance(id_empresa, str) else []
    if len(partes) < 4 or partes[0] != "company":
        return None
    return {"company": partes[-2], "city": partes[-1]}


def gps_de_unidades(unidades: dict) -> dict:
    """Lo que se manda a la web: los waypoints que quedan por delante [[x, z],
    ...] en orden, el trabajo elegido y no empezado (o None) y si la partida
    tenia un trabajo en curso."""
    economia = next((v for t, v in unidades.values() if t == "economy"), {})
    jugador = next((v for t, v in unidades.values() if t == "player"), {})
    waypoints = []
    for id_wp in economia.get("stored_gps_ahead_waypoints") or []:
        tipo, valores = unidades.get(id_wp, (None, {}))
        pos = valores.get("nav_node_position") if tipo == "gps_waypoint_storage" else None
        if isinstance(pos, list) and len(pos) == 3 and all(isinstance(v, (int, float)) for v in pos):
            waypoints.append([round(pos[0] / ESCALA_NODO, 1), round(pos[2] / ESCALA_NODO, 1)])
    trabajo = None
    elegido = jugador.get("selected_job")
    tipo, job = unidades.get(elegido, (None, {})) if isinstance(elegido, str) else (None, {})
    if tipo == "job_info":
        origen, destino = _empresa(job.get("source_company")), _empresa(job.get("target_company"))
        if origen:
            trabajo = {
                "srcCompany": origen["company"], "srcCity": origen["city"],
                "dstCompany": destino["company"] if destino else None,
                "dstCity": destino["city"] if destino else None,
                "market": ("dispatch_job" if job.get("car") not in (None, "null")
                           else "cargo_market" if job.get("is_cargo_market_job") else "freight_market"),
            }
    en_curso = jugador.get("current_job")
    return {
        "waypoints": waypoints,
        "job": trabajo,
        "jobActive": isinstance(en_curso, str) and en_curso != "null",
    }


def leer_gps(ruta: str) -> dict:
    """Lo que tiene el GPS segun ese game.sii (ver gps_de_unidades), con la
    fecha del archivo en `savedAt` (segundos). PartidaIlegible si no se pudo."""
    try:
        fecha = os.path.getmtime(ruta)
        with open(ruta, "rb") as f:
            datos = f.read()
    except OSError as exc:
        raise PartidaIlegible(str(exc)) from exc
    contenido = descifrar(datos)
    if contenido[:4] == b"BSII":
        unidades = leer_bsii(contenido)
    elif contenido.lstrip(b"\xef\xbb\xbf")[:8] == b"SiiNunit":
        unidades = leer_texto(contenido.decode("utf-8", "replace"))
    else:
        raise PartidaIlegible(f"formato desconocido {contenido[:4]!r}")
    resultado = gps_de_unidades(unidades)
    resultado["savedAt"] = int(fecha)
    return resultado


CLAVE_AJUSTE = "read_saves"


def para_el_payload(gps: dict | None, game: str | None) -> dict | None:
    """Lo que va en `gameGps` del dato a la web, o None: solo lo de la partida
    del juego que se esta jugando. Campos nuevos son opcionales (una web vieja
    no lo mira, y un cliente viejo no lo manda)."""
    if not gps or not game or gps.get("game") != game:
        return None
    return {"savedAt": gps["savedAt"], "waypoints": gps["waypoints"], "job": gps["job"], "jobActive": gps["jobActive"]}


def hay_que_preguntar(ajustes: dict, setup_abierto: bool, inicio_automatico: bool, vio_el_juego: bool) -> bool:
    """Si es momento del aviso de la primera vez: nadie contesto todavia (la
    clave no esta), no hay otra ventana de Truck Dash abierta (el primer
    arranque abre Setup, y dos ventanas de tk en dos hilos se pisan) y, si
    arranco con Windows, recien con el juego abierto (al iniciar sesion
    nadie lo espera)."""
    if CLAVE_AJUSTE in ajustes:
        return False
    if setup_abierto:
        return False
    return vio_el_juego or not inicio_automatico


class Vigia:
    """Mira la partida mas nueva de un juego y la relee cuando cambia. Una
    recien escrita espera QUIETA_S a que el juego termine de escribirla; una
    que no se pudo leer se prueba otra vez cuando vuelve a cambiar."""

    QUIETA_S = 1.5

    def __init__(self, documentos: str, raices_steam=()):
        self.documentos = documentos
        self.raices_steam = list(raices_steam)
        self.ultimo = None      # lo ultimo leido (dict de leer_gps) o None
        self._visto = None      # (game, ruta, fecha) ya procesado
        self._sin_partidas = set()  # juegos sin ninguna: se anota una vez

    def mirar(self, game: str, ahora: float) -> dict | None:
        """Lo leido para ese juego (puede ser de antes), o None."""
        if game not in CARPETAS_DEL_JUEGO:
            return None
        nueva = partida_mas_nueva(game, self.documentos, self.raices_steam)
        if nueva is None:
            # Sin esto, buscar en el lugar equivocado no dejaba rastro.
            if game not in self._sin_partidas:
                self._sin_partidas.add(game)
                logging.info("Ninguna partida de %s para leer (en %s y %d carpetas de Steam)", game,
                             os.path.join(self.documentos, CARPETAS_DEL_JUEGO[game]), len(self.raices_steam))
            return None
        ruta, fecha = nueva
        clave = (game, ruta, fecha)
        if clave != self._visto and ahora - fecha >= self.QUIETA_S:
            self._visto = clave
            try:
                self.ultimo = dict(leer_gps(ruta), game=game)
                logging.info("Partida leida (%s): %d waypoints en el GPS%s", os.path.basename(os.path.dirname(ruta)),
                             len(self.ultimo["waypoints"]), ", con un trabajo elegido" if self.ultimo["job"] else "")
            except PartidaIlegible as exc:
                logging.info("No se pudo leer la partida %s: %s", ruta, exc)
        if self.ultimo and self.ultimo.get("game") == game:
            return self.ultimo
        return None

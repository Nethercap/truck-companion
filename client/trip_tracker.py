"""Detectar un trabajo en la telemetria y saber cuando empieza y termina.

Todo lo de aca es PURO: entra un diccionario de telemetria y sale otro. Sin
red, sin archivos, sin reloj. Asi se puede probar cada transicion sin tener
el juego abierto, que es justo lo que uno no puede reproducir a voluntad: el
momento exacto en que alguien cancela un trabajo a mitad de camino.

El SDK no da un id de trabajo. Lo que si da son dos campos que **no cambian
mientras manejas y sobreviven a guardar y recargar**, porque son tiempo de
juego absoluto: `jobStartingTime` (cuando se tomo) y `time_abs_delivery` (el
deadline). Con eso mas el cargamento y las dos ciudades, dos trabajos
distintos no se confunden y el mismo se reconoce despues de apagar la PC.
"""

# Lo que identifica al trabajo. Nada de lo que cambia mientras manejas: si
# entrara, por ejemplo, la distancia restante, cada lectura pareceria un
# trabajo nuevo.
CAMPOS_HUELLA = ("job_started_game_time", "deadline_game_time", "cargo_id",
                 "city_src_id", "city_dst_id")


def hay_trabajo(raw: dict) -> bool:
    """Si en este momento hay un trabajo tomado.

    Se pide tambien la ciudad de destino y no solo onJob: al cargar una
    partida, el SDK pone onJob en True uno o dos frames antes de completar
    el resto, y abrir un viaje con todo en blanco crearia una huella basura
    que despues no coincide con nada.
    """
    return bool(raw.get("onJob")) and bool(raw.get("cityDstId") or raw.get("cityDst"))


def datos_del_trabajo(raw: dict) -> dict | None:
    """Lo que hay que mandarle a la API para abrir el viaje, o None."""
    if not hay_trabajo(raw):
        return None
    return {
        "game": juego(raw),
        # --- huella ---
        "job_started_game_time": _entero(raw.get("jobStartingTime")),
        "deadline_game_time": _entero(raw.get("time_abs_delivery")),
        "cargo_id": raw.get("cargoId") or None,
        "city_src_id": raw.get("citySrcId") or None,
        "city_dst_id": raw.get("cityDstId") or None,
        # --- del trabajo, para mostrarlo ---
        "city_src": raw.get("citySrc") or None,
        "city_dst": raw.get("cityDst") or None,
        "company_src": raw.get("compSrc") or None,
        "company_dst": raw.get("compDst") or None,
        "cargo": raw.get("cargo") or None,
        "cargo_mass": _numero(raw.get("cargoMass")),
        "revenue": _numero(raw.get("jobIncome")),
        "distance_planned_km": _numero(raw.get("plannedDistanceKm")),
    }


def juego(raw: dict) -> str:
    """ets2 o ats. El SDK no lo dice directo, pero la telemetria trae el
    nombre del juego; si faltara, ets2 es el mas probable y de todas formas
    se corrige en el proximo trabajo."""
    nombre = (raw.get("game") or raw.get("gameName") or "").lower()
    if "american" in nombre or nombre == "ats":
        return "ats"
    return "ets2"


def huella(datos: dict | None) -> tuple | None:
    """Los campos que identifican el trabajo, como algo comparable."""
    if not datos:
        return None
    return tuple(datos.get(c) for c in CAMPOS_HUELLA)


def que_paso(anterior: dict | None, actual: dict | None,
             evento: dict | None = None) -> str | None:
    """Que transicion hubo entre dos lecturas.

    Devuelve 'tomado', 'entregado', 'cancelado', 'cambiado' o None.

    El evento viene aparte porque jobDelivered y jobCancelled son un pulso
    de un instante: cuando llegan, los campos del trabajo ya se vaciaron. El
    cliente ya los filtra por flanco (ver edge_filter_job_events), asi que
    aca solo se los consulta.
    """
    evento = evento or {}
    # El pulso manda sobre la comparacion: es la unica forma de distinguir
    # una entrega de un abandono, porque desde los campos las dos se ven
    # igual (habia trabajo, ya no hay).
    if evento.get("jobDelivered"):
        return "entregado"
    if evento.get("jobCancelled"):
        return "cancelado"

    antes, ahora = huella(anterior), huella(actual)
    if antes == ahora:
        return None
    if antes is None:
        return "tomado"
    if ahora is None:
        # Desaparecio sin pulso de entrega ni de cancelacion. Puede ser que
        # se cerro el juego, que se cargo otra partida, o que el pulso se
        # perdio. No se inventa una entrega: el servidor lo dara por
        # abandonado solo si nunca vuelve.
        return None
    return "cambiado"


def datos_del_cierre(raw: dict, evento: dict | None = None) -> dict:
    """Los numeros que solo existen en el instante de la entrega.

    Se leen del evento y no de los campos del trabajo: cuando el pulso
    llega, los campos ya estan en blanco.
    """
    evento = evento or {}
    datos = {"status": "delivered" if evento.get("jobDelivered") else "cancelled"}
    if evento.get("jobDeliveredRevenue") is not None:
        datos["revenue"] = _numero(evento.get("jobDeliveredRevenue"))
    if evento.get("jobDeliveredDistanceKm") is not None:
        datos["distance_game_km"] = _numero(evento.get("jobDeliveredDistanceKm"))
    # A tiempo o tarde lo decide el servidor comparando con el deadline que
    # ya tiene guardado: aca solo se le dice cuando se entrego.
    entrega = raw.get("time_abs")
    if entrega is not None:
        datos["delivered_game_time"] = _entero(entrega)
    return datos


def _entero(valor):
    try:
        return int(valor) if valor is not None else None
    except (TypeError, ValueError):
        return None


def _numero(valor):
    try:
        numero = float(valor) if valor is not None else None
    except (TypeError, ValueError):
        return None
    # El SDK devuelve 0 para lo que no aplica. Guardar un cero como si fuera
    # un dato real ensucia los promedios; None dice "no se sabe".
    return numero if numero else None

"""Los trabajos de bus del DLC Coaches (ETS2 1.62.3), como los lee el cliente.

El juego manda una etapa por indice, cada una con su parada de origen y la de
destino (`source_stop.*`, `destination_stop.*`). El plugin las guarda en su zona
de bus (plugin/, `scsTelemetryMap_t.bus`) ya como paradas en orden (la parada k
es el destino de la etapa k-1 y el origen de la etapa k) y
telemetry_compat.get_data() las deja en `raw["bus"]`. El de la 1.5.40 a la
1.5.48 guardaba las dos puntas de cada etapa: aca se juntan igual.

Lo que no entra en el bloque (mas de 64 etapas, o mas de 16 con aquel plugin: un
trabajo de 30 paradas en HaulMP, 25-11-2026) va como parada sin datos: el total
y la etapa en curso son los de verdad, y la proxima parada queda sin saberse. Con
la lista cortada, desde la parada 18 el tablero mandaba de vuelta a la 17.

Lo visto en el game.log.txt de un trabajo de bus de punta a punta (12-11-2026,
turismo Oulu -> mirador de Viitasaari -> Oulu): dos etapas, el tipo de parada
"city" (el id es la ciudad) o "viewpoints" (el id es el del album de
miradores, `album.viewpoints.<id>`), horarios planificados en minutos de juego
absolutos y los reales recien cuando pasan. El juego manda la configuracion
entera de nuevo en cada cambio: al empezar el embarque (la salida real), al
llegar al mirador (`bus.stages.current` pasa a 1, con la llegada real y ya la
salida real de la etapa siguiente: el reloj se adelanta en la parada) y al
llegar a la ultima (la etapa queda en 1 y llega la llegada real). Unos 40 s
despues, `bus_job.completed`. Ningun evento en las paradas del medio.
"""

# Un numero de etapas mas grande no es de un trabajo de verdad, y la lista de
# paradas viaja en cada dato.
ETAPAS_MAX = 255

# (campo de la parada que arma esto, campo de la etapa del plugin, de que lado
# de la etapa es propio). La llegada y los que bajan son del destino de la etapa
# anterior; la salida y los que suben, del origen de la etapa siguiente.
CAMPOS = (
    ("arrivalPlanned", "arrivalPlanned", "destination"),
    ("arrivalActual", "arrivalActual", "destination"),
    ("departurePlanned", "departurePlanned", "source"),
    ("departureActual", "departureActual", "source"),
    ("boardingPlanned", "enteringPlanned", "source"),
    ("boardingActual", "enteringActual", "source"),
    ("alightingPlanned", "leavingPlanned", "destination"),
    ("alightingActual", "leavingActual", "destination"),
)


def _parada(llegada: dict | None, salida: dict | None) -> dict:
    """Una parada con lo que se sabe de ella: la punta de destino de la etapa
    que llega (`llegada`) y la de origen de la que sale (`salida`). Cada campo
    sale del lado que le corresponde y, si ahi esta en 0, del otro (por si el
    juego lo manda de los dos lados). Lo que esta en 0 o vacio no va: la tabla
    viaja en cada dato al relay."""
    lados = {"destination": llegada or {}, "source": salida or {}}
    parada = {}
    for clave in ("type", "id", "name"):
        valor = lados["source"].get(clave) or lados["destination"].get(clave)
        if valor:
            parada[clave] = valor
    for clave, campo, propio in CAMPOS:
        otro = "source" if propio == "destination" else "destination"
        valor = lados[propio].get(campo) or lados[otro].get(campo)
        if valor:
            parada[clave] = valor
    return parada


def del_raw(raw: dict) -> dict | None:
    """El trabajo de bus en curso, o None si no hay (o el plugin es uno sin la
    zona de bus):

        {"stage": 0, "stages": 2, "updates": 3,
         "stops": [{"type": "city", "id": "oulu", "name": "Oulu",
                    "departurePlanned": 256620, "boardingPlanned": 25}, ...]}

    `stage` es la etapa en curso, que va de stops[stage] a stops[stage + 1].
    `updates` cuenta las configuraciones `bus_job` que llegaron (sirve para
    ver en el log cuando el juego cambia algo). Una parada que no entro en el
    bloque del plugin es un dict vacio."""
    bus = raw.get("bus")
    if not raw.get("onJob") or not bus:
        return None
    paradas = [_parada(p, p) for p in bus.get("stops") or []] or _de_las_etapas(bus.get("stages") or [])
    if len(paradas) < 2 or not any(p.get("id") or p.get("name") for p in paradas):
        return None
    total = min(max(bus.get("stageCount") or 0, len(paradas) - 1), ETAPAS_MAX)
    paradas += [{} for _ in range(total + 1 - len(paradas))]
    actual = bus.get("stageCurrent") or 0
    return {
        "stage": min(max(actual, 0), total - 1),
        "stages": total,
        "updates": bus.get("updates") or 0,
        "stops": paradas,
    }


def _de_las_etapas(etapas: list) -> list:
    """Las paradas de un plugin con la revision 1 de la zona."""
    if not etapas:
        return []
    paradas = [_parada(None, etapas[0].get("source"))]
    for i, etapa in enumerate(etapas):
        siguiente = etapas[i + 1].get("source") if i + 1 < len(etapas) else None
        paradas.append(_parada(etapa.get("destination"), siguiente))
    return paradas


def proxima_parada(bus: dict) -> dict:
    """A donde va el bus ahora: el destino de la etapa en curso."""
    return bus["stops"][bus["stage"] + 1]


def ultima_parada(bus: dict) -> dict:
    """La ultima que se sabe cual es (las que no entraron no tienen datos)."""
    return next(p for p in reversed(bus["stops"]) if p.get("id") or p.get("name"))


def es_ciudad(parada: dict) -> bool:
    """Si el id de la parada es el de una ciudad (lo que la web sabe buscar)."""
    return parada.get("type") == "city" and bool(parada.get("id"))


def descripcion(bus: dict) -> str:
    """Para el log: "oulu -> pocviitasaar -> oulu, etapa 1 de 2"."""
    paradas = " -> ".join(p.get("id") or p.get("name") or "?" for p in bus["stops"])
    return f"{paradas}, etapa {bus['stage'] + 1} de {bus['stages']}"

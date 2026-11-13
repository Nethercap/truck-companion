"""Los trabajos de bus del DLC Coaches (ETS2 1.62.3), como los lee el cliente.

El plugin guarda las etapas del trabajo en su zona de bus (plugin/,
`scsTelemetryMap_t.bus`) y telemetry_compat.get_data() las deja en
`raw["bus"]`: una etapa por indice, cada una con su parada de origen y la de
destino, como las manda el juego (`source_stop.*`, `destination_stop.*`). Aca
se pasan a una lista de paradas en orden, que es lo que sirve para mostrar:
la parada k es el destino de la etapa k-1 y el origen de la etapa k.

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
    ver en el log cuando el juego cambia algo)."""
    bus = raw.get("bus")
    if not raw.get("onJob") or not bus:
        return None
    etapas = bus.get("stages") or []
    if not etapas:
        return None
    paradas = [_parada(None, etapas[0].get("source"))]
    for i, etapa in enumerate(etapas):
        siguiente = etapas[i + 1].get("source") if i + 1 < len(etapas) else None
        paradas.append(_parada(etapa.get("destination"), siguiente))
    if not any(p.get("id") or p.get("name") for p in paradas):
        return None
    actual = bus.get("stageCurrent") or 0
    return {
        "stage": min(max(actual, 0), len(etapas) - 1),
        "stages": len(etapas),
        "updates": bus.get("updates") or 0,
        "stops": paradas,
    }


def proxima_parada(bus: dict) -> dict:
    """A donde va el bus ahora: el destino de la etapa en curso."""
    return bus["stops"][bus["stage"] + 1]


def es_ciudad(parada: dict) -> bool:
    """Si el id de la parada es el de una ciudad (lo que la web sabe buscar)."""
    return parada.get("type") == "city" and bool(parada.get("id"))


def descripcion(bus: dict) -> str:
    """Para el log: "oulu -> pocviitasaar -> oulu, etapa 1 de 2"."""
    paradas = " -> ".join(p.get("id") or p.get("name") or "?" for p in bus["stops"])
    return f"{paradas}, etapa {bus['stage'] + 1} de {bus['stages']}"

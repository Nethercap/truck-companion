"""Acumulador de la cuenta: cuanto se manejo, y cuanto de eso fue un viaje.

**Sesion primero, viaje como capa encima.** Volver vacio al garage, la
conduccion libre y los kilometros entre una entrega y el siguiente trabajo
no son viaje, y son la mitad de lo que hace mucha gente. El mismo tick
alimenta las dos cuentas; los numeros del viaje son un subconjunto de los de
la sesion, y por eso NUNCA se suman las dos.

Todo lo de aca es PURO: entran diccionarios y un reloj, sale una lista de
cosas para mandar. Sin red, sin archivos, sin hilos. Quien las manda (y las
guarda cuando no hay internet) es otra pieza.

**Los numeros salen del payload, no del bloque crudo del SDK.** El payload
es el mismo diccionario que consume el tablero de la web, asi que la cuenta
y el tablero no pueden separarse: si se calcularan de fuentes distintas,
tarde o temprano mostrarian dos numeros para el mismo viaje y no habria
forma de saber a cual creerle. Del crudo solo sale la identidad del trabajo,
que tiene campos que el payload no manda (ver trip_tracker).

Cuatro reglas que no son obvias y que estan probadas una por una:

- **Los kilometros salen del odometro por diferencias**, no de restar el
  final menos el inicial: cambiar de camion reinicia el odometro.
- **El tope de cuanto pudo avanzar el odometro se calcula con tiempo DE
  JUEGO, no real.** El reloj del juego corre unas 19 veces mas rapido, asi
  que a 80 km/h el odometro sube 0,42 km por segundo tuyo; un tope en
  segundos reales rechazaria como teletransporte un avance normal.
- **El combustible suma solo las bajas del tanque.** Una subida es cargar.
- **Un hueco grande entre dos ticks no se cuenta.** Un ferry, un viaje
  rapido o una reconexion mueven el odometro decenas de kilometros sin que
  nadie haya manejado. Se prefiere quedarse corto: un numero de menos se
  nota menos que uno inventado.
"""

import math
import uuid

import trip_tracker

# Lo maximo que se cuenta entre dos ticks. Mas que esto es que el cliente
# estuvo dormido, no que alguien manejo diez minutos sin que lo veamos.
HUECO_MAXIMO_S = 10
# Escala de tiempo de juego que se asume cuando el payload no trae reloj.
# Es la mas rapida que usa el juego, para no rechazar avances validos.
ESCALA_MAXIMA = 25
# Solo para acotar el odometro. No es un limite de velocidad: es "mas que
# esto es imposible".
VELOCIDAD_MAXIMA_KMH = 200
# Por debajo de esto el camion esta detenido, no manejando despacio.
VELOCIDAD_MINIMA_KMH = 1.0

# Cada cuanto se manda. El viaje mas seguido que la sesion porque es lo que
# la web muestra en vivo; la sesion solo tiene que sobrevivir a un corte.
CHECKPOINT_VIAJE_S = 120
CHECKPOINT_SESION_S = 300

# Recorrido. Se guarda un punto cada tantos metros y se simplifica cuando
# hay demasiados: un viaje de 1500 km son 300.000 puntos crudos y la API
# espera unos 300.
PASO_RECORRIDO_M = 50
PUNTOS_OBJETIVO = 300
PUNTOS_MAXIMOS_VIVOS = 1200
# Un silencio mas largo que esto parte el recorrido en dos segmentos: se
# manejo con el cliente cerrado y unir los extremos con una recta seria
# dibujar un tramo que nunca se hizo.
CORTE_SEGMENTO_S = 30

PIEZAS_CAMION = ("engine", "transmission", "cabin", "chassis", "wheels")


def simplificar(puntos, epsilon):
    """Douglas-Peucker: saca los puntos que no cambian la forma de la linea.

    Iterativo y no recursivo a proposito: un tramo largo de autopista son
    miles de puntos casi alineados, y la version recursiva se queda sin pila
    justo en el viaje mas largo de alguien.
    """
    if len(puntos) < 3:
        return list(puntos)
    guardar = [False] * len(puntos)
    guardar[0] = guardar[-1] = True
    pila = [(0, len(puntos) - 1)]
    while pila:
        inicio, fin = pila.pop()
        if fin <= inicio + 1:
            continue
        peor, distancia_peor = -1, 0.0
        for i in range(inicio + 1, fin):
            d = _distancia_a_recta(puntos[i], puntos[inicio], puntos[fin])
            if d > distancia_peor:
                peor, distancia_peor = i, d
        if distancia_peor > epsilon:
            guardar[peor] = True
            pila.append((inicio, peor))
            pila.append((peor, fin))
    return [p for p, quedarse in zip(puntos, guardar) if quedarse]


def _distancia_a_recta(punto, a, b):
    (px, py), (ax, ay), (bx, by) = punto, a, b
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    # Area del paralelogramo sobre el largo de la base.
    return abs(dy * px - dx * py + bx * ay - by * ax) / math.hypot(dx, dy)


def _achicar(segmentos, objetivo=PUNTOS_OBJETIVO):
    """Baja el total de puntos al objetivo subiendo la tolerancia.

    Se sube de a poco y no de una: la tolerancia que deja 300 puntos depende
    de si el viaje fue todo autopista recta o todo montaña.
    """
    total = sum(len(s) for s in segmentos)
    if total <= objetivo:
        return [list(s) for s in segmentos]
    epsilon = 5.0
    achicados = segmentos
    for _ in range(20):
        achicados = [simplificar(s, epsilon) for s in segmentos]
        if sum(len(s) for s in achicados) <= objetivo:
            break
        epsilon *= 2
    return achicados


class Acumulador:
    """Estado de la sesion actual y del viaje en curso, si hay."""

    def __init__(self, id_sesion=None, map_variant=None):
        self.map_variant = map_variant
        self._sesion = None
        self._viaje = None
        self._id_sesion_forzado = id_sesion
        # Ultimos valores vistos, para sacar diferencias.
        self._ultimo = {}
        self._trabajo_anterior = None
        self._ultimo_envio_sesion = 0.0

    # --- lo que el que envia le pide ---

    def sesion(self):
        """Cuerpo para PUT /sessions/{client_id}, o None si no hay sesion."""
        if self._sesion is None:
            return None
        s = self._sesion
        return {
            "client_id": s["client_id"],
            "game": s["game"],
            "map_variant": self.map_variant,
            "started_at": s["started_at"],
            "ended_at": s.get("ended_at"),
            "distance_km": round(s["distance_km"], 3),
            "game_hours": round(s["game_minutes"] / 60, 4),
            "real_hours": round(s["real_seconds"] / 3600, 4),
            "max_speed": round(s["max_speed"], 1) or None,
            "fuel_used": round(s["fuel_used"], 2) or None,
        }

    def viaje(self, con_recorrido=True):
        """Cuerpo del checkpoint del viaje en curso, o None."""
        if self._viaje is None:
            return None
        v = self._viaje
        datos = dict(v["datos"])
        datos.update(self._totales_del_viaje())
        # El ultimo camion visto: al abrir el viaje (por ejemplo al arrancar
        # el cliente con el trabajo ya tomado) puede no haber llegado todavia.
        datos["truck_brand"] = v.get("truck_brand")
        datos["truck_name"] = v.get("truck_name")
        if con_recorrido:
            datos["route"] = _achicar(v["segmentos"])
        return datos

    def hay_viaje(self):
        return self._viaje is not None

    def _totales_del_viaje(self):
        v = self._viaje
        horas_juego = v["game_minutes"] / 60
        return {
            "distance_tracked_km": round(v["distance_km"], 3),
            "game_hours": round(horas_juego, 4),
            "real_hours": round(v["real_seconds"] / 3600, 4),
            # En horas DE JUEGO: 88 km a 48 km/h son 1,8 horas de juego y
            # unos seis minutos tuyos. Dividir por los reales daria 750.
            "avg_speed": round(v["distance_km"] / horas_juego, 1) if horas_juego > 0.01 else None,
            "max_speed": round(v["max_speed"], 1) or None,
            "tolls": round(v["tolls"], 2) or None,
            "ferries": round(v["ferries"], 2) or None,
            "fines": round(v["fines"], 2) or None,
            "fuel_used": round(v["fuel_used"], 2) or None,
            "damage_delta": self._dano(),
        }

    def _dano(self):
        """Cuanto se daño el camion en este viaje, en puntos de porcentaje.

        Promedio de las cinco piezas y no la peor: un raspon en la cabina no
        es lo mismo que reventar el motor, pero la metrica que interesa es
        "cuanto cuidado se manejo", y para eso el promedio es mas estable.
        """
        v = self._viaje
        if not v["desgaste_inicial"] or not v["desgaste_ultimo"]:
            return None
        subas = []
        for pieza in PIEZAS_CAMION:
            antes = v["desgaste_inicial"].get(pieza)
            ahora = v["desgaste_ultimo"].get(pieza)
            if antes is None or ahora is None:
                continue
            subas.append(max(0.0, (ahora - antes) * 100))
        if not subas:
            return None
        return round(sum(subas) / len(subas), 3) or None

    # --- el tick ---

    def tick(self, payload, raw, ahora):
        """Procesa una lectura. Devuelve una lista de cosas para mandar.

        Cada una es {"tipo": ..., "datos": ...} con tipo en
        session | trip_open | trip_checkpoint | trip_close.
        """
        acciones = []
        juego = payload.get("game") or trip_tracker.juego(raw)

        # Cambiar de juego es empezar de cero: una sesion tiene un solo
        # juego, y mezclar los kilometros de ETS2 con los de ATS no le dice
        # nada a nadie.
        if self._sesion is not None and self._sesion["game"] != juego:
            acciones.extend(self.cerrar(ahora))
        if self._sesion is None:
            self._empezar_sesion(juego, ahora)

        avance = self._diferencias(payload, ahora)
        self._sumar(self._sesion, avance, payload)

        acciones.extend(self._mirar_el_trabajo(payload, raw, ahora))

        if self._viaje is not None:
            self._sumar(self._viaje, avance, payload)
            if payload.get("truckBrand"):
                self._viaje["truck_brand"] = payload["truckBrand"]
                self._viaje["truck_name"] = payload.get("truckName")
            self._anotar_recorrido(payload, ahora)
            if ahora - self._viaje["ultimo_envio"] >= CHECKPOINT_VIAJE_S:
                self._viaje["ultimo_envio"] = ahora
                acciones.append({"tipo": "trip_checkpoint", "datos": self.viaje()})

        if ahora - self._ultimo_envio_sesion >= CHECKPOINT_SESION_S:
            self._ultimo_envio_sesion = ahora
            acciones.append({"tipo": "session", "datos": self.sesion()})
        return acciones

    def cerrar(self, ahora, iso=None):
        """El juego se cerro o el cliente se va. Cierra la sesion.

        El viaje NO se cierra: que el juego se cierre no entrega nada. Queda
        en curso y el servidor lo dara por abandonado si nunca vuelve.
        """
        if self._sesion is None:
            return []
        self._sesion["ended_at"] = iso or _iso(ahora)
        datos = self.sesion()
        self._sesion = None
        self._viaje = None
        self._trabajo_anterior = None
        self._ultimo = {}
        return [{"tipo": "session", "datos": datos}]

    # --- adentro ---

    def _empezar_sesion(self, juego, ahora):
        self._sesion = {
            "client_id": self._id_sesion_forzado or str(uuid.uuid4()),
            "game": juego,
            "started_at": _iso(ahora),
            "distance_km": 0.0, "game_minutes": 0.0, "real_seconds": 0.0,
            "max_speed": 0.0, "fuel_used": 0.0,
        }
        self._id_sesion_forzado = None
        self._ultimo_envio_sesion = ahora
        self._ultimo = {}

    def _diferencias(self, payload, ahora):
        """Cuanto avanzo todo desde el tick anterior, ya acotado."""
        anterior = self._ultimo
        dt = 0.0
        if anterior.get("ts") is not None:
            dt = min(max(ahora - anterior["ts"], 0.0), HUECO_MAXIMO_S)

        # Minutos de juego. Un salto de mas de una hora no es manejar: es
        # dormir, un ferry o un viaje rapido.
        minutos = None
        reloj = payload.get("gameTimeMinutes")
        if reloj is not None and anterior.get("reloj") is not None:
            salto = reloj - anterior["reloj"]
            if 0 < salto < 60:
                minutos = salto
        horas_de_juego = minutos / 60 if minutos is not None else (dt / 3600) * ESCALA_MAXIMA

        velocidad = payload.get("speedKmh") or 0.0
        moviendose = not payload.get("paused") and velocidad > VELOCIDAD_MINIMA_KMH

        # Cambiar de camion reinicia el odometro y llena el tanque.
        camion = (payload.get("game"), payload.get("truckBrand"), payload.get("truckName"))
        otro_camion = anterior.get("camion") is not None and camion != anterior["camion"]

        km = 0.0
        odo = payload.get("odometerKm")
        if odo is not None and anterior.get("odo") is not None and not otro_camion:
            adelanto = odo - anterior["odo"]
            if 0 < adelanto <= horas_de_juego * VELOCIDAD_MAXIMA_KMH + 0.05:
                km = adelanto

        litros = 0.0
        tanque = payload.get("fuel")
        if tanque is not None and anterior.get("fuel") is not None and not otro_camion:
            bajo = anterior["fuel"] - tanque
            if 0 < bajo < 20:
                litros = bajo

        self._ultimo = {"ts": ahora, "reloj": reloj, "odo": odo,
                        "fuel": tanque, "camion": camion}
        return {"dt": dt if moviendose else 0.0,
                "minutos": (minutos or 0.0) if moviendose else 0.0,
                "km": km, "litros": litros,
                "velocidad": 0.0 if payload.get("paused") else velocidad}

    @staticmethod
    def _sumar(destino, avance, payload):
        destino["distance_km"] += avance["km"]
        destino["real_seconds"] += avance["dt"]
        destino["game_minutes"] += avance["minutos"]
        destino["fuel_used"] += avance["litros"]
        if avance["velocidad"] < VELOCIDAD_MAXIMA_KMH:
            destino["max_speed"] = max(destino["max_speed"], avance["velocidad"])

    def _mirar_el_trabajo(self, payload, raw, ahora):
        actual = trip_tracker.datos_del_trabajo(raw)
        paso = trip_tracker.que_paso(self._trabajo_anterior, actual,
                                     payload.get("event"))
        acciones = []
        if paso in ("entregado", "cancelado") and self._viaje is not None:
            datos = self.viaje()
            datos.update(trip_tracker.datos_del_cierre(raw, payload.get("event")))
            acciones.append({"tipo": "trip_close", "datos": datos})
            self._viaje = None
        elif paso == "cambiado" and self._viaje is not None:
            # Otro trabajo sin pulso de entrega. No se inventa una entrega:
            # se manda lo acumulado y el servidor lo dara por abandonado si
            # nunca vuelve.
            acciones.append({"tipo": "trip_checkpoint", "datos": self.viaje()})
            self._viaje = None

        if actual is not None and self._viaje is None:
            self._empezar_viaje(actual, payload, ahora)
            acciones.append({"tipo": "trip_open", "datos": self.viaje()})
        self._trabajo_anterior = actual
        return acciones

    def _empezar_viaje(self, datos, payload, ahora):
        self._viaje = {
            "datos": datos,
            "distance_km": 0.0, "game_minutes": 0.0, "real_seconds": 0.0,
            "max_speed": 0.0, "fuel_used": 0.0,
            "tolls": 0.0, "ferries": 0.0, "fines": 0.0,
            "desgaste_inicial": dict(payload.get("wear") or {}),
            "desgaste_ultimo": dict(payload.get("wear") or {}),
            "segmentos": [], "ultimo_punto": None, "ultimo_punto_ts": None,
            "ultimo_envio": ahora,
        }

    def _anotar_recorrido(self, payload, ahora):
        v = self._viaje
        if payload.get("wear"):
            v["desgaste_ultimo"] = dict(payload["wear"])
        self._sumar_eventos(payload.get("event") or {})

        pos = payload.get("position") or {}
        x, z = pos.get("x"), pos.get("z")
        if x is None or z is None:
            return
        punto = [float(x), float(z)]
        previo, previo_ts = v["ultimo_punto"], v["ultimo_punto_ts"]
        corte = previo_ts is None or (ahora - previo_ts) > CORTE_SEGMENTO_S
        if previo is not None and not corte:
            if math.hypot(punto[0] - previo[0], punto[1] - previo[1]) < PASO_RECORRIDO_M:
                return
        if corte or not v["segmentos"]:
            v["segmentos"].append([])
        v["segmentos"][-1].append(punto)
        v["ultimo_punto"], v["ultimo_punto_ts"] = punto, ahora

        if sum(len(s) for s in v["segmentos"]) > PUNTOS_MAXIMOS_VIVOS:
            v["segmentos"] = _achicar(v["segmentos"], PUNTOS_OBJETIVO)
            v["ultimo_punto"] = v["segmentos"][-1][-1] if v["segmentos"][-1] else None

    def _sumar_eventos(self, evento):
        """Peajes, multas y ferries. El cliente ya filtra por flanco los
        pulsos de entrega; estos no, asi que se comparan contra el anterior.
        """
        v = self._viaje
        previo = v.setdefault("evento_previo", {})
        for clave, campo, monto in (("tollgate", "tolls", "tollgatePayAmount"),
                                    ("fined", "fines", "fineAmount"),
                                    ("ferry", "ferries", "ferryPayAmount"),
                                    ("train", "ferries", "trainPayAmount")):
            ahora_activo = bool(evento.get(clave))
            if ahora_activo and not previo.get(clave):
                v[campo] += float(evento.get(monto) or 0)
            previo[clave] = ahora_activo


def _iso(ts):
    import datetime as dt
    return dt.datetime.fromtimestamp(ts, dt.timezone.utc).isoformat()

# -*- coding: utf-8 -*-
"""Acumulador de la cuenta.

Los casos de las cuatro reglas dificiles son los MISMOS que los del
acumulador del tablero web (docs/app/test_pure.js). Estan repetidos a
proposito: son dos implementaciones que tienen que dar el mismo numero para
el mismo viaje, y la unica forma de que no se separen es que fallen juntas.
"""

import accumulator


def payload(ts_juego, **cambios):
    base = {
        "game": "ets2", "paused": False,
        "speedKmh": 80.0, "gameTimeMinutes": ts_juego,
        "truckBrand": "Scania", "truckName": "S",
        "wear": {"engine": 0.0, "transmission": 0.0, "cabin": 0.0,
                 "chassis": 0.0, "wheels": 0.0},
        "event": {},
    }
    base.update(cambios)
    return base


SIN_TRABAJO = {"onJob": False}

TRABAJO = {
    "onJob": True,
    "jobStartingTime": 1000,
    "time_abs_delivery": 2000,
    "cargoId": "cement",
    "citySrcId": "berlin",
    "cityDstId": "praga",
    "citySrc": "Berlin",
    "cityDst": "Praga",
    "cargo": "Cemento",
    "jobIncome": 12500,
    "plannedDistanceKm": 350,
}


def conducir(acc, raw=None, segundos=600, kmh=80.0, escala=19.0,
             t0=1000.0, odo=500000.0, fuel=400.0, litros_por_100=33.0):
    """Un viaje sintetico, un tick por segundo real.

    El odometro corre en TIEMPO DE JUEGO: a 80 km/h con escala 19 sube
    0,42 km por segundo tuyo. Escribirlo mal fue el bug que encontro el
    mismo test del lado de la web.
    """
    raw = raw if raw is not None else SIN_TRABAJO
    km, litros, reloj = odo, fuel, 600.0
    acciones = []
    for i in range(segundos + 1):
        km += kmh * (escala / 3600)
        litros -= kmh * (escala / 3600) * litros_por_100 / 100
        reloj += escala / 60
        acciones += acc.tick(payload(reloj, odometerKm=km, fuel=litros, speedKmh=kmh),
                             raw, t0 + i)
    return acciones


# --- las cuatro reglas, mismos casos que en la web -------------------------

def test_la_velocidad_promedio_se_mide_en_horas_de_juego():
    acc = accumulator.Acumulador()
    conducir(acc, raw=TRABAJO, segundos=600, kmh=80, escala=19)
    v = acc.viaje()
    # 10 min reales x 19 = 190 min de juego = 3,17 h a 80 km/h.
    assert abs(v["distance_tracked_km"] - 253.3) < 1, v["distance_tracked_km"]
    assert abs(v["avg_speed"] - 80) < 1, v["avg_speed"]
    # El tiempo al volante si es real: 10 minutos.
    assert abs(v["real_hours"] - 600 / 3600) < 0.01, v["real_hours"]


def test_cambiar_de_camion_no_resta_kilometros_ni_inventa_consumo():
    acc = accumulator.Acumulador()
    conducir(acc, segundos=120)
    antes = acc.sesion()
    acc.tick(payload(800, odometerKm=12, fuel=900, speedKmh=0,
                     truckBrand="Volvo", truckName="FH"), SIN_TRABAJO, 2000.0)
    acc.tick(payload(800.4, odometerKm=12.01, fuel=899.9, speedKmh=50,
                     truckBrand="Volvo", truckName="FH"), SIN_TRABAJO, 2001.0)
    ahora = acc.sesion()
    assert ahora["distance_km"] >= antes["distance_km"]
    assert ahora["distance_km"] < antes["distance_km"] + 1
    assert ahora["fuel_used"] - antes["fuel_used"] < 0.2


def test_cargar_combustible_no_cuenta_como_consumo_negativo():
    acc = accumulator.Acumulador()
    acc.tick(payload(600, odometerKm=10, fuel=100, speedKmh=0), SIN_TRABAJO, 1.0)
    acc.tick(payload(601, odometerKm=10, fuel=95, speedKmh=0), SIN_TRABAJO, 2.0)
    acc.tick(payload(602, odometerKm=10, fuel=600, speedKmh=0), SIN_TRABAJO, 3.0)
    acc.tick(payload(603, odometerKm=10, fuel=597, speedKmh=0), SIN_TRABAJO, 4.0)
    assert abs(acc.sesion()["fuel_used"] - 8) < 0.01
    # Y una carga CHICA tambien es carga. Sin este caso, un tope por valor
    # absoluto ("cualquier cambio menor a 20 l es consumo") pasaba los tests
    # contando diez litros cargados como diez gastados.
    otro = accumulator.Acumulador()
    for litros in (100, 95, 105, 103):
        otro.tick(payload(600, odometerKm=10, fuel=litros, speedKmh=0),
                  SIN_TRABAJO, float(litros))
    assert abs(otro.sesion()["fuel_used"] - 7) < 0.01, otro.sesion()["fuel_used"]


def test_un_ferry_no_suma_kilometros_manejados():
    acc = accumulator.Acumulador()
    acc.tick(payload(600, odometerKm=1000, speedKmh=60), SIN_TRABAJO, 1.0)
    acc.tick(payload(600.3, odometerKm=1000.02, speedKmh=60), SIN_TRABAJO, 2.0)
    # El ferry deja el camion 140 km mas alla y adelanta el reloj una noche.
    acc.tick(payload(720, odometerKm=1140, speedKmh=0), SIN_TRABAJO, 3.0)
    assert acc.sesion()["distance_km"] < 1


def test_una_reconexion_larga_no_regala_kilometros():
    acc = accumulator.Acumulador()
    acc.tick(payload(600, odometerKm=1000, speedKmh=80), SIN_TRABAJO, 1.0)
    # Media hora sin datos y 40 km mas en el odometro.
    acc.tick(payload(600 + 30 * 19, odometerKm=1040, speedKmh=80), SIN_TRABAJO, 1801.0)
    s = acc.sesion()
    assert s["distance_km"] < 1, s["distance_km"]
    # Y el tiempo al volante suma el hueco maximo, no media hora.
    assert s["real_hours"] <= accumulator.HUECO_MAXIMO_S / 3600 + 0.001


# --- sesion primero --------------------------------------------------------

def test_manejar_sin_trabajo_suma_a_la_sesion_y_no_crea_viaje():
    """La razon de ser de la tabla de sesiones: volver vacio al garage."""
    acc = accumulator.Acumulador()
    acciones = conducir(acc, segundos=300)
    assert acc.hay_viaje() is False
    assert acc.viaje() is None
    assert acc.sesion()["distance_km"] > 100
    assert not [a for a in acciones if a["tipo"].startswith("trip")]


def test_los_kilometros_del_viaje_son_un_subconjunto_de_los_de_la_sesion():
    """La regla que impide contar dos veces: el mismo tick alimenta las dos
    cuentas, asi que sumar las dos tablas duplicaria los kilometros."""
    acc = accumulator.Acumulador()
    conducir(acc, segundos=120)                    # sin trabajo
    conducir(acc, raw=TRABAJO, segundos=120, t0=3000.0, odo=600000.0)
    sesion, viaje = acc.sesion(), acc.viaje()
    assert viaje["distance_tracked_km"] < sesion["distance_km"]
    assert sesion["distance_km"] > 2 * viaje["distance_tracked_km"] * 0.9


def test_cambiar_de_juego_cierra_la_sesion_y_abre_otra():
    acc = accumulator.Acumulador()
    conducir(acc, segundos=60)
    primera = acc.sesion()["client_id"]
    acciones = acc.tick(payload(600, game="ats", odometerKm=1, speedKmh=0),
                        SIN_TRABAJO, 5000.0)
    cerradas = [a for a in acciones if a["tipo"] == "session" and a["datos"]["ended_at"]]
    assert len(cerradas) == 1
    assert cerradas[0]["datos"]["client_id"] == primera
    assert acc.sesion()["game"] == "ats"
    assert acc.sesion()["client_id"] != primera


def test_cerrar_no_entrega_el_viaje():
    """Que se cierre el juego no entrega nada. El viaje queda en curso y el
    servidor lo dara por abandonado si nunca vuelve."""
    acc = accumulator.Acumulador()
    conducir(acc, raw=TRABAJO, segundos=30)
    acciones = acc.cerrar(2000.0)
    assert [a["tipo"] for a in acciones] == ["session"]
    assert acciones[0]["datos"]["ended_at"] is not None


# --- el viaje como capa encima ---------------------------------------------

def test_tomar_y_entregar_un_trabajo():
    acc = accumulator.Acumulador()
    abiertos = conducir(acc, raw=TRABAJO, segundos=60)
    aperturas = [a for a in abiertos if a["tipo"] == "trip_open"]
    assert len(aperturas) == 1
    assert aperturas[0]["datos"]["city_dst"] == "Praga"
    assert aperturas[0]["datos"]["distance_planned_km"] == 350

    entrega = {"jobDelivered": True, "jobDeliveredRevenue": 13000,
               "jobDeliveredDistanceKm": 352}
    acciones = acc.tick(payload(700, odometerKm=1, speedKmh=0, event=entrega),
                        {"onJob": False, "time_abs": 1900}, 2000.0)
    cierres = [a for a in acciones if a["tipo"] == "trip_close"]
    assert len(cierres) == 1
    datos = cierres[0]["datos"]
    assert datos["status"] == "delivered"
    assert datos["revenue"] == 13000
    assert datos["distance_game_km"] == 352
    assert datos["delivered_game_time"] == 1900
    assert datos["distance_tracked_km"] > 10
    assert acc.hay_viaje() is False


def test_peajes_multas_y_ferries_se_cuentan_una_vez():
    """El flag del SDK queda en true varios ticks: no son tres peajes."""
    acc = accumulator.Acumulador()
    conducir(acc, raw=TRABAJO, segundos=5)
    for i in range(3):
        acc.tick(payload(700 + i, odometerKm=1, speedKmh=0,
                         event={"tollgate": True, "tollgatePayAmount": 12}),
                 TRABAJO, 2000.0 + i)
    acc.tick(payload(705, odometerKm=1, speedKmh=0, event={}), TRABAJO, 2005.0)
    acc.tick(payload(706, odometerKm=1, speedKmh=0,
                     event={"tollgate": True, "tollgatePayAmount": 12}), TRABAJO, 2006.0)
    acc.tick(payload(707, odometerKm=1, speedKmh=0,
                     event={"fined": True, "fineAmount": 300}), TRABAJO, 2007.0)
    v = acc.viaje()
    assert v["tolls"] == 24
    assert v["fines"] == 300


def test_el_dano_es_el_promedio_de_las_cinco_piezas():
    acc = accumulator.Acumulador()
    acc.tick(payload(600, odometerKm=1, speedKmh=40), TRABAJO, 1.0)
    roto = {"engine": 0.02, "transmission": 0.0, "cabin": 0.03,
            "chassis": 0.0, "wheels": 0.0}
    acc.tick(payload(601, odometerKm=1, speedKmh=40, wear=roto), TRABAJO, 2.0)
    # (2 + 0 + 3 + 0 + 0) / 5 = 1 punto de porcentaje.
    assert abs(acc.viaje()["damage_delta"] - 1.0) < 0.001


def test_sin_desgaste_en_la_telemetria_el_dano_es_desconocido():
    acc = accumulator.Acumulador()
    acc.tick(payload(600, odometerKm=1, speedKmh=40, wear={}), TRABAJO, 1.0)
    acc.tick(payload(601, odometerKm=1, speedKmh=40, wear={}), TRABAJO, 2.0)
    assert acc.viaje()["damage_delta"] is None


# --- recorrido -------------------------------------------------------------

def test_un_silencio_largo_parte_el_recorrido_en_dos_segmentos():
    """Manejar con el cliente cerrado deja un agujero, y unir los extremos
    con una recta seria dibujar un tramo que nunca se hizo."""
    acc = accumulator.Acumulador()
    for i in range(5):
        acc.tick(payload(600 + i, odometerKm=1 + i * 0.4, speedKmh=60,
                         position={"x": i * 100.0, "z": 0.0}), TRABAJO, 1.0 + i)
    for i in range(5):
        acc.tick(payload(700 + i, odometerKm=50 + i * 0.4, speedKmh=60,
                         position={"x": 5000.0 + i * 100, "z": 0.0}),
                 TRABAJO, 500.0 + i)
    recorrido = acc.viaje()["route"]
    assert len(recorrido) == 2
    assert all(len(s) >= 2 for s in recorrido)


def test_el_recorrido_se_simplifica_pero_conserva_las_puntas():
    acc = accumulator.Acumulador()
    for i in range(1500):
        acc.tick(payload(600 + i * 0.3, odometerKm=1 + i * 0.1, speedKmh=60,
                         position={"x": i * 100.0, "z": (i % 7) * 3.0}),
                 TRABAJO, 1.0 + i)
    recorrido = acc.viaje()["route"]
    puntos = sum(len(s) for s in recorrido)
    assert puntos <= accumulator.PUNTOS_OBJETIVO * 1.2, puntos
    assert recorrido[0][0][0] == 0.0
    assert recorrido[-1][-1][0] > 100000


def test_simplificar_deja_una_recta_en_dos_puntos():
    recta = [[float(i), 0.0] for i in range(100)]
    assert accumulator.simplificar(recta, 1.0) == [[0.0, 0.0], [99.0, 0.0]]


def test_simplificar_conserva_un_desvio_grande():
    linea = [[0.0, 0.0], [50.0, 500.0], [100.0, 0.0]]
    assert accumulator.simplificar(linea, 1.0) == linea


def test_simplificar_no_revienta_la_pila_con_una_recta_enorme():
    """La version recursiva se queda sin pila justo en el viaje mas largo."""
    recta = [[float(i), 0.0] for i in range(60000)]
    assert len(accumulator.simplificar(recta, 1.0)) == 2


# --- cadencia --------------------------------------------------------------

def test_los_checkpoints_no_salen_en_cada_tick():
    acc = accumulator.Acumulador()
    acciones = conducir(acc, raw=TRABAJO, segundos=600)
    checkpoints = [a for a in acciones if a["tipo"] == "trip_checkpoint"]
    sesiones = [a for a in acciones if a["tipo"] == "session"]
    assert 3 <= len(checkpoints) <= 6, len(checkpoints)
    assert 1 <= len(sesiones) <= 3, len(sesiones)

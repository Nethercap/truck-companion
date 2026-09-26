"""Deteccion de trabajos en la telemetria.

Todo esto es puro, asi que se pueden probar transiciones que en el juego uno
no puede reproducir a voluntad: cancelar a mitad de camino, cargar una
partida vieja, o tomar un trabajo nuevo sin cerrar el anterior.
"""

import trip_tracker as tt

CON_TRABAJO = {
    "onJob": True,
    "jobStartingTime": 1000,
    "time_abs_delivery": 2000,
    "time_abs": 1500,
    "cargoId": "cement",
    "citySrcId": "berlin",
    "cityDstId": "praga",
    "citySrc": "Berlin",
    "cityDst": "Praga",
    "cargo": "Cemento",
    "cargoMass": 22000.0,
    "jobIncome": 12500,
    "plannedDistanceKm": 350.0,
}

SIN_TRABAJO = {"onJob": False, "time_abs": 1600}


def test_reconoce_que_hay_trabajo():
    assert tt.hay_trabajo(CON_TRABAJO) is True
    assert tt.hay_trabajo(SIN_TRABAJO) is False


def test_al_cargar_una_partida_no_se_abre_un_viaje_a_medio_llenar():
    """El SDK pone onJob en True uno o dos frames antes de completar el
    resto. Abrir el viaje ahi crearia una huella basura que despues no
    coincide con nada, y quedaria un viaje fantasma para siempre."""
    a_medias = {"onJob": True, "jobStartingTime": 0, "cityDstId": "", "cityDst": ""}
    assert tt.hay_trabajo(a_medias) is False


def test_los_datos_del_trabajo_traen_la_huella_completa():
    d = tt.datos_del_trabajo(CON_TRABAJO)
    for campo in tt.CAMPOS_HUELLA:
        assert d[campo] is not None, campo
    assert d["city_dst"] == "Praga" and d["distance_planned_km"] == 350.0


def test_la_huella_sobrevive_manejar_y_distingue_otro_trabajo():
    manejando = dict(CON_TRABAJO)
    manejando.update({"time_abs": 1800, "speed": 22.5, "plannedDistanceKm": 120.0})
    assert tt.huella(tt.datos_del_trabajo(manejando)) == \
        tt.huella(tt.datos_del_trabajo(CON_TRABAJO))

    otro = dict(CON_TRABAJO, jobStartingTime=9999)
    assert tt.huella(tt.datos_del_trabajo(otro)) != \
        tt.huella(tt.datos_del_trabajo(CON_TRABAJO))


def test_tomar_un_trabajo():
    assert tt.que_paso(None, tt.datos_del_trabajo(CON_TRABAJO)) == "tomado"


def test_entregar_y_cancelar_se_distinguen_solo_por_el_pulso():
    """Desde los campos las dos se ven igual: habia trabajo, ya no hay. La
    unica diferencia es el evento."""
    antes = tt.datos_del_trabajo(CON_TRABAJO)
    assert tt.que_paso(antes, None, {"jobDelivered": True}) == "entregado"
    assert tt.que_paso(antes, None, {"jobCancelled": True}) == "cancelado"


def test_si_el_trabajo_desaparece_sin_pulso_no_se_inventa_una_entrega():
    """Cerrar el juego o cargar otra partida se ve igual que entregar. Dar
    por entregado algo que no se entrego le sumaria a alguien un viaje que
    nunca hizo; el servidor ya lo da por abandonado si nunca vuelve."""
    antes = tt.datos_del_trabajo(CON_TRABAJO)
    assert tt.que_paso(antes, None, {}) is None


def test_tomar_otro_trabajo_sin_cerrar_el_anterior():
    antes = tt.datos_del_trabajo(CON_TRABAJO)
    otro = tt.datos_del_trabajo(dict(CON_TRABAJO, jobStartingTime=5000,
                                     cityDstId="viena", cityDst="Viena"))
    assert tt.que_paso(antes, otro) == "cambiado"


def test_mientras_no_pasa_nada_no_pasa_nada():
    d = tt.datos_del_trabajo(CON_TRABAJO)
    assert tt.que_paso(d, d) is None
    assert tt.que_paso(None, None) is None


def test_los_numeros_del_cierre_salen_del_evento():
    """Cuando el pulso llega, los campos del trabajo ya estan en blanco."""
    d = tt.datos_del_cierre(SIN_TRABAJO, {"jobDelivered": True,
                                          "jobDeliveredRevenue": 12800,
                                          "jobDeliveredDistanceKm": 214.0})
    assert d["status"] == "delivered"
    assert d["revenue"] == 12800 and d["distance_game_km"] == 214.0
    # El servidor decide a tiempo o tarde: aca solo se le dice cuando fue.
    assert d["delivered_game_time"] == 1600

    c = tt.datos_del_cierre(SIN_TRABAJO, {"jobCancelled": True})
    assert c["status"] == "cancelled"


def test_un_cero_del_sdk_no_es_un_dato():
    """El SDK devuelve 0 para lo que no aplica. Guardarlo como si fuera real
    ensucia los promedios de todos; None dice 'no se sabe'."""
    d = tt.datos_del_trabajo(dict(CON_TRABAJO, jobIncome=0, cargoMass=0,
                                  plannedDistanceKm=0))
    assert d["revenue"] is None
    assert d["cargo_mass"] is None
    assert d["distance_planned_km"] is None


def test_el_juego_sale_del_nombre_y_cae_en_ets2():
    assert tt.juego({"game": "American Truck Simulator"}) == "ats"
    assert tt.juego({"game": "Euro Truck Simulator 2"}) == "ets2"
    assert tt.juego({}) == "ets2"

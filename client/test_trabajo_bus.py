"""Los trabajos de bus del DLC Coaches: la zona de bus del bloque del plugin
(telemetry_compat.leer_bus), las paradas (trabajo_bus), lo que va al tablero
(build_payload) y el viaje de la cuenta (trip_tracker). El trabajo es el de un
game.log.txt de verdad (12-11-2026): turismo Oulu -> mirador de Viitasaari ->
Oulu. Con el plugin de verdad lo prueba tools/probar_plugin_linux.py."""

import logging
import os
import re

import client
import telemetry_compat
import trabajo_bus
import trip_tracker
from accumulator import Acumulador

# (tipo, id, nombre) de las dos puntas y los numeros de cada etapa, como los
# manda el juego: salida y suben del origen, llegada y bajan del destino.
ETAPAS = [
    (("city", "oulu", "Oulu"), ("viewpoints", "pocviitasaar", "Viitasaari"),
     {"departurePlanned": 256620, "enteringPlanned": 25}, {"arrivalPlanned": 256880}),
    (("viewpoints", "pocviitasaar", "Viitasaari"), ("city", "oulu", "Oulu"),
     {"departurePlanned": 257000}, {"arrivalPlanned": 257250, "leavingPlanned": 25}),
]


def bloque(etapas=ETAPAS, actual=0, cambios=1, revision=telemetry_compat.BUS_ZONE_REVISION,
           cantidad=None):
    """El bloque de 32 KB con la zona de bus como la escribe el plugin: una
    parada por punta de etapa en la revision 2, y las dos puntas de cada etapa
    (hasta 16) en la revision 1."""
    datos = bytearray(telemetry_compat.BLOCK_SIZE)
    telemetry_compat._BUS_CABEZA.pack_into(
        datos, telemetry_compat.BUS_OFFSET, revision,
        len(etapas) if cantidad is None else cantidad, actual, cambios)
    base = telemetry_compat.BUS_OFFSET + telemetry_compat._BUS_CABEZA.size
    if revision == 1:
        for i, (origen, destino, nums_origen, nums_destino) in enumerate(etapas[:16]):
            for j, (punta, nums) in enumerate(((origen, nums_origen), (destino, nums_destino))):
                telemetry_compat._BUS_R1_PARADA.pack_into(
                    datos, base + (2 * i + j) * telemetry_compat._BUS_R1_PARADA.size,
                    *(t.encode("utf-8") for t in punta),
                    *[nums.get(c, 0) for c in telemetry_compat._BUS_CAMPOS])
        return bytes(datos)
    paradas = {}
    for i, (origen, destino, nums_origen, nums_destino) in enumerate(etapas):
        paradas.setdefault(i, [None, {}])[0] = origen
        paradas[i][1].update(nums_origen)
        siguiente = paradas.setdefault(i + 1, [None, {}])
        siguiente[0] = siguiente[0] or destino
        siguiente[1].update(nums_destino)
    for k, (punta, nums) in paradas.items():
        if k < telemetry_compat.BUS_STOPS_MAX:
            telemetry_compat._BUS_PARADA.pack_into(
                datos, base + k * telemetry_compat._BUS_PARADA.size,
                *(t.encode("utf-8") for t in punta),
                *[nums.get(c, 0) for c in telemetry_compat._BUS_CAMPOS])
    return bytes(datos)


def linea(paradas):
    """Las etapas de una linea de ese largo: c0 -> c1 -> c2..."""
    return [(("city", f"c{i}", f"Parada {i}"), ("city", f"c{i + 1}", f"Parada {i + 1}"),
             {"departurePlanned": 1005 + 10 * i, "enteringPlanned": 30 + i},
             {"arrivalPlanned": 1010 + 10 * i, "leavingPlanned": 1 + i})
            for i in range(paradas - 1)]


def raw_de_bus(**cambios):
    raw = {"onJob": True, "game": 1, "jobMarket": "tourist_job", "jobIncome": 6718,
           "plannedDistanceKm": 396, "isCargoLoaded": True, "time_abs": 256600,
           "time_abs_delivery": 0, "jobStartingTime": 256590, "cityDst": "", "citySrc": "",
           "bus": telemetry_compat.leer_bus(bloque())}
    raw.update(cambios)
    return raw


PARADAS = [
    {"type": "city", "id": "oulu", "name": "Oulu", "departurePlanned": 256620,
     "boardingPlanned": 25},
    {"type": "viewpoints", "id": "pocviitasaar", "name": "Viitasaari",
     "arrivalPlanned": 256880, "departurePlanned": 257000},
    {"type": "city", "id": "oulu", "name": "Oulu", "arrivalPlanned": 257250,
     "alightingPlanned": 25},
]


def test_lee_la_zona_de_bus_del_bloque():
    bus = telemetry_compat.leer_bus(bloque(actual=1, cambios=3))
    assert (bus["stageCount"], bus["stageCurrent"], bus["updates"]) == (2, 1, 3)
    assert bus["stops"][0]["id"] == "oulu"
    assert bus["stops"][0]["departurePlanned"] == 256620
    assert bus["stops"][0]["arrivalActual"] == 0
    assert bus["stops"][1]["arrivalPlanned"] == 256880
    assert bus["stops"][1]["departurePlanned"] == 257000
    assert bus["stops"][2]["name"] == "Oulu"
    assert bus["stops"][2]["leavingPlanned"] == 25
    assert len(bus["stops"]) == 3


def test_sin_la_zona_no_hay_bus():
    """Un plugin de Truck Dash hasta la 1.5.39 deja la zona en 0 (revision 0),
    y sin trabajo de bus no hay etapas."""
    assert telemetry_compat.leer_bus(bytes(telemetry_compat.BLOCK_SIZE)) is None
    assert telemetry_compat.leer_bus(bloque(revision=0)) is None
    # Una zona de un plugin mas nuevo, con otra disposicion: no se adivina.
    assert telemetry_compat.leer_bus(bloque(revision=telemetry_compat.BUS_ZONE_REVISION + 1)) is None
    assert telemetry_compat.leer_bus(bloque(etapas=[])) is None


def test_no_lee_mas_paradas_que_las_que_entran():
    assert len(telemetry_compat.leer_bus(bloque(cantidad=40))["stops"]) == 41
    bus = telemetry_compat.leer_bus(bloque(cantidad=400))
    assert len(bus["stops"]) == telemetry_compat.BUS_STOPS_MAX == 65
    assert bus["stageCount"] == 400
    bus = telemetry_compat.leer_bus(bloque(cantidad=40, revision=1))
    assert len(bus["stages"]) == telemetry_compat.BUS_R1_STAGES_MAX == 16
    assert "stops" not in bus


def test_un_trabajo_de_30_paradas_va_entero():
    """HaulMP, 25-11: el tablero decia 16 y desde la parada 18 mandaba a la 17."""
    for actual in range(29):
        bus = trabajo_bus.del_raw(raw_de_bus(bus=telemetry_compat.leer_bus(bloque(linea(30), actual))))
        assert (bus["stage"], bus["stages"], len(bus["stops"])) == (actual, 29, 30)
        assert trabajo_bus.proxima_parada(bus)["id"] == f"c{actual + 1}"
    assert bus["stops"][0] == {"type": "city", "id": "c0", "name": "Parada 0",
                               "departurePlanned": 1005, "boardingPlanned": 30}
    assert bus["stops"][20] == {"type": "city", "id": "c20", "name": "Parada 20",
                                "arrivalPlanned": 1200, "departurePlanned": 1205,
                                "boardingPlanned": 50, "alightingPlanned": 20}
    assert bus["stops"][29] == {"type": "city", "id": "c29", "name": "Parada 29",
                                "arrivalPlanned": 1290, "alightingPlanned": 29}
    assert trabajo_bus.ultima_parada(bus)["id"] == "c29"


def test_con_el_plugin_de_antes_no_manda_a_una_parada_que_ya_paso():
    """La revision 1 guarda 16 etapas: lo que sigue no se sabe, pero el total
    y la etapa si, y la proxima parada no puede ser la ultima guardada."""
    def en(actual):
        return trabajo_bus.del_raw(raw_de_bus(
            bus=telemetry_compat.leer_bus(bloque(linea(30), actual, revision=1))))
    bus = en(15)
    assert (bus["stage"], bus["stages"], len(bus["stops"])) == (15, 29, 30)
    assert trabajo_bus.proxima_parada(bus)["id"] == "c16"
    for actual in (16, 20, 28):
        bus = en(actual)
        assert (bus["stage"], bus["stages"]) == (actual, 29)
        assert trabajo_bus.proxima_parada(bus) == {}
        # El viaje de la cuenta sigue siendo el mismo: de la primera a la
        # ultima que se sabe (la huella no cambia en el medio).
        assert trabajo_bus.ultima_parada(bus)["id"] == "c16"
        raw = raw_de_bus(bus=telemetry_compat.leer_bus(bloque(linea(30), actual, revision=1)))
        datos = trip_tracker.datos_del_trabajo(raw)
        assert (datos["city_dst_id"], datos["deadline_game_time"]) == ("c16", 1160)
        payload = client.build_payload(raw)
        assert payload["cityDst"] is None and payload["cityDstId"] is None
    assert trabajo_bus.descripcion(en(20)).endswith("c16 -> " + " -> ".join("?" * 13) + ", etapa 21 de 29")


def test_una_cantidad_de_etapas_imposible_no_arma_una_lista_enorme():
    bus = trabajo_bus.del_raw(raw_de_bus(bus=telemetry_compat.leer_bus(bloque(cantidad=4_000_000_000))))
    assert bus["stages"] == trabajo_bus.ETAPAS_MAX and len(bus["stops"]) == trabajo_bus.ETAPAS_MAX + 1


def test_las_dos_revisiones_dan_lo_mismo():
    for etapas in (ETAPAS, linea(2), linea(17)):
        nueva, vieja = (trabajo_bus.del_raw(raw_de_bus(bus=telemetry_compat.leer_bus(
            bloque(etapas, actual=1, cambios=4, revision=r)))) for r in (2, 1))
        assert nueva == vieja


def test_30_paradas_entran_en_el_dato():
    """La tabla viaja en cada dato: 4 por segundo al relay."""
    import json
    raw = raw_de_bus(bus=telemetry_compat.leer_bus(bloque(linea(30), 10)))
    assert len(json.dumps(client.build_payload(raw)["bus"])) < 6000


def test_un_texto_de_64_bytes_sin_cero_no_rompe():
    """El plugin corta los textos y pone el 0, pero el lector no confia."""
    largo = "Ä" * 40  # 80 bytes en UTF-8
    etapas = [((largo, "x" * 70, "Ñandú"), ("city", "oulu", "Oulu"), {}, {})]
    origen = telemetry_compat.leer_bus(bloque(etapas))["stops"][0]
    assert origen["type"] == "Ä" * 12
    assert origen["id"] == "x" * 48
    assert origen["name"] == "Ñandú"
    origen = telemetry_compat.leer_bus(bloque(etapas, revision=1))["stages"][0]["source"]
    assert origen["type"] == "Ä" * 32
    assert origen["id"] == "x" * 64
    assert origen["name"] == "Ñandú"


def test_get_data_lee_la_zona_solo_en_nuestro_bloque(monkeypatch):
    class Version:
        @staticmethod
        def parse_data(buf):
            return {"onJob": True}

    monkeypatch.setattr(telemetry_compat, "_version", Version)
    monkeypatch.setattr(telemetry_compat, "_buf", bloque())
    monkeypatch.setattr(telemetry_compat, "_abierto", telemetry_compat.WINDOWS_NAMES[0])
    assert telemetry_compat.get_data()["bus"]["stageCount"] == 2
    monkeypatch.setattr(telemetry_compat, "_abierto", telemetry_compat.LINUX_PATHS[0])
    assert telemetry_compat.get_data()["bus"]["stageCount"] == 2
    # El de RenCloud no tiene la zona: lo que haya ahi no es nuestro.
    monkeypatch.setattr(telemetry_compat, "_abierto", telemetry_compat.WINDOWS_NAME)
    assert telemetry_compat.get_data()["bus"] is None
    # Un bloque mas chico que la zona no se lleva puesto el dato.
    monkeypatch.setattr(telemetry_compat, "_abierto", telemetry_compat.WINDOWS_NAMES[0])
    monkeypatch.setattr(telemetry_compat, "_buf", bytes(100))
    assert telemetry_compat.get_data() == {"onJob": True, "bus": None}


def test_la_disposicion_es_la_del_plugin():
    """telemetry_compat y scs-telemetry-common.hpp tienen que coincidir."""
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "plugin", "scs-telemetry", "inc", "scs-telemetry-common.hpp")
    with open(ruta, encoding="utf-8") as f:
        hpp = f.read()

    def define(nombre):
        return int(re.search(rf"#define {nombre}\s+(\d+)", hpp).group(1))

    assert define("BUS_ZONE_REVISION") == telemetry_compat.BUS_ZONE_REVISION
    assert define("BUS_STOPS_MAX") == telemetry_compat.BUS_STOPS_MAX
    assert "offsetof(scsTelemetryMap_t, bus) == %d" % telemetry_compat.BUS_OFFSET in hpp
    assert "sizeof(scsBusStop_t) == %d" % telemetry_compat._BUS_PARADA.size in hpp
    textos = (define("BUS_TYPE_SIZE"), define("BUS_ID_SIZE"), define("stringsize"))
    assert telemetry_compat._BUS_PARADA.format == "<%ds%ds%ds8I" % textos
    assert telemetry_compat._BUS_CABEZA.size == 16
    fin = (telemetry_compat.BUS_OFFSET + 16
           + telemetry_compat.BUS_STOPS_MAX * telemetry_compat._BUS_PARADA.size)
    assert fin <= telemetry_compat.BLOCK_SIZE
    assert "OFFSET %d -----//" % (fin - 1) in hpp
    # El orden de los numeros de la parada es el del struct.
    campos = re.search(r"typedef struct \{(.*?)\}scsBusStop_t;", hpp, re.S).group(1)
    assert re.findall(r"unsigned int (\w+);", campos) == list(telemetry_compat._BUS_CAMPOS)


def test_las_etapas_pasan_a_paradas_en_orden():
    assert trabajo_bus.del_raw(raw_de_bus()) == {
        "stage": 0, "stages": 2, "updates": 1, "stops": PARADAS}


def test_la_parada_del_medio_junta_las_dos_etapas():
    """La llegada real es de la etapa que llega y la salida real de la que sale."""
    etapas = [ETAPAS[0][:3] + ({"arrivalPlanned": 256880, "arrivalActual": 256871},),
              ETAPAS[1][:2] + ({"departurePlanned": 257000, "departureActual": 257004},
                               ETAPAS[1][3])]
    bus = trabajo_bus.del_raw(raw_de_bus(bus=telemetry_compat.leer_bus(bloque(etapas, actual=1))))
    assert bus["stops"][1] == {"type": "viewpoints", "id": "pocviitasaar", "name": "Viitasaari",
                               "arrivalPlanned": 256880, "arrivalActual": 256871,
                               "departurePlanned": 257000, "departureActual": 257004}
    assert trabajo_bus.proxima_parada(bus)["name"] == "Oulu"


def test_sin_trabajo_o_sin_paradas_no_hay_bus():
    assert trabajo_bus.del_raw(raw_de_bus(onJob=False)) is None
    assert trabajo_bus.del_raw(raw_de_bus(bus=None)) is None
    vacias = [(("", "", ""), ("", "", ""), {}, {})]
    assert trabajo_bus.del_raw(raw_de_bus(bus=telemetry_compat.leer_bus(bloque(vacias)))) is None


def test_una_etapa_actual_de_mas_no_se_sale_de_la_lista():
    bus = trabajo_bus.del_raw(raw_de_bus(bus=telemetry_compat.leer_bus(bloque(actual=7))))
    assert bus["stage"] == 1
    assert trabajo_bus.proxima_parada(bus)["id"] == "oulu"


def test_el_tablero_recibe_las_paradas():
    payload = client.build_payload(raw_de_bus())
    assert payload["bus"]["stops"] == PARADAS
    assert payload["citySrc"] == "Oulu" and payload["citySrcId"] == "oulu"
    # La proxima parada es un mirador: no va como ciudad, la web diria que
    # "Viitasaari" no esta en el mapa.
    assert payload["cityDst"] is None and payload["cityDstId"] is None
    # El plazo es el horario de la proxima parada: 280 minutos de juego.
    assert payload["jobDeadlineSeconds"] == 280 * 60


def test_si_la_proxima_parada_es_una_ciudad_va_como_destino():
    raw = raw_de_bus(bus=telemetry_compat.leer_bus(bloque(actual=1)))
    payload = client.build_payload(raw)
    assert (payload["cityDst"], payload["cityDstId"]) == ("Oulu", "oulu")
    assert payload["jobDeadlineSeconds"] == (257250 - 256600) * 60


def test_sin_bus_el_payload_no_cambia():
    """La clave `bus` solo existe con un trabajo de bus: la app nativa compara
    el payload contra un golden."""
    raw = {"onJob": True, "cityDst": "Wien", "cityDstId": "wien", "time_abs": 100,
           "time_abs_delivery": 160, "bus": None}
    payload = client.build_payload(raw)
    assert "bus" not in payload
    assert payload["cityDst"] == "Wien" and payload["jobDeadlineSeconds"] == 3600


def test_el_log_dice_las_paradas_y_cada_cambio(caplog, monkeypatch):
    monkeypatch.setattr(client, "_last_job_log", None)
    with caplog.at_level(logging.INFO):
        client.log_job_change(raw_de_bus())
        client.log_job_change(raw_de_bus())
        bus = telemetry_compat.leer_bus(bloque(actual=1, cambios=2))
        client.log_job_change(raw_de_bus(bus=bus))
    lineas = [r.getMessage() for r in caplog.records if r.getMessage().startswith("Trabajo:")]
    assert lineas == [
        "Trabajo: tourist_job, bus oulu -> pocviitasaar -> oulu, etapa 1 de 2, carga si, "
        "remolque no, GPS del juego 0.0 km",
        "Trabajo: tourist_job, bus oulu -> pocviitasaar -> oulu, etapa 2 de 2, carga si, "
        "remolque no, GPS del juego 0.0 km",
    ]


def test_el_aviso_de_entrega_dice_de_donde_a_donde_fue(monkeypatch):
    monkeypatch.setattr(client, "_last_job_snapshot", dict(client._last_job_snapshot))
    client.update_job_snapshot(raw_de_bus(bus=telemetry_compat.leer_bus(bloque(actual=1))))
    assert client._last_job_snapshot["citySrc"] == "Oulu"
    assert client._last_job_snapshot["cityDst"] == "Oulu"
    assert client._last_job_snapshot["jobMarket"] == "tourist_job"


def test_un_trabajo_de_bus_abre_viaje():
    """Antes no: sin ciudad de destino, hay_trabajo daba False (log del 12-11)."""
    raw = raw_de_bus()
    assert trip_tracker.hay_trabajo(raw)
    datos = trip_tracker.datos_del_trabajo(raw)
    assert datos["city_src_id"] == "oulu" and datos["city_dst_id"] == "oulu"
    assert datos["city_src"] == "Oulu" and datos["city_dst"] == "Oulu"
    assert datos["deadline_game_time"] == 257250
    assert datos["job_started_game_time"] == 256590
    assert datos["revenue"] == 6718 and datos["distance_planned_km"] == 396
    assert datos["cargo"] is None and datos["job_kind"] == "bus"
    assert datos["currency"] == "EUR"


def test_la_huella_no_cambia_de_etapa_en_etapa():
    antes = trip_tracker.datos_del_trabajo(raw_de_bus())
    etapas = [ETAPAS[0][:3] + ({"arrivalPlanned": 256880, "arrivalActual": 256871},), ETAPAS[1]]
    despues = trip_tracker.datos_del_trabajo(
        raw_de_bus(bus=telemetry_compat.leer_bus(bloque(etapas, actual=1, cambios=3))))
    assert trip_tracker.huella(antes) == trip_tracker.huella(despues)


def test_la_cuenta_sigue_el_mismo_viaje_toda_la_linea():
    """Abre al tomarlo, no se parte al pasar de etapa y cierra con la entrega
    (el plugin pulsa jobDelivered con `bus_job.completed`)."""
    acc = Acumulador(id_sesion="s")
    payload = client.build_payload(raw_de_bus())
    acciones = acc.tick(payload, raw_de_bus(), 1000.0)
    assert [a["tipo"] for a in acciones if a["tipo"].startswith("trip")] == ["trip_open"]
    etapa_2 = raw_de_bus(bus=telemetry_compat.leer_bus(bloque(actual=1, cambios=3)))
    acciones = acc.tick(client.build_payload(etapa_2), etapa_2, 1001.0)
    assert not [a for a in acciones if a["tipo"] in ("trip_open", "trip_close")]
    fin = dict(etapa_2, onJob=False, bus=None)
    payload = client.build_payload(fin)
    payload["event"]["jobDelivered"] = True
    # Lo que trajo el bus_job.completed del log real (12-11).
    payload["event"]["jobDeliveredRevenue"] = 6718
    payload["event"]["jobDeliveredDistanceKm"] = 410.0
    acciones = acc.tick(payload, fin, 1002.0)
    cierres = [a for a in acciones if a["tipo"] == "trip_close"]
    assert len(cierres) == 1 and cierres[0]["datos"]["status"] == "delivered"
    assert cierres[0]["datos"]["city_dst"] == "Oulu"
    assert cierres[0]["datos"]["distance_game_km"] == 410.0
    assert cierres[0]["datos"]["deadline_game_time"] == 257250


def test_el_viaje_de_la_cuenta_lleva_las_paradas_y_sus_llegadas():
    """La cuenta muestra cada etapa: el viaje abre con las paradas planificadas
    y, como la huella no cambia de etapa en etapa, las llegadas reales llegan
    con el checkpoint y el cierre (las del juego al llegar al mirador)."""
    acc = Acumulador(id_sesion="s")
    acciones = acc.tick(client.build_payload(raw_de_bus()), raw_de_bus(), 1000.0)
    abierto = next(a for a in acciones if a["tipo"] == "trip_open")["datos"]
    assert abierto["bus_stops"] == PARADAS
    etapas = [ETAPAS[0][:3] + ({"arrivalPlanned": 256880, "arrivalActual": 256871},), ETAPAS[1]]
    etapa_2 = raw_de_bus(bus=telemetry_compat.leer_bus(bloque(etapas, actual=1, cambios=3)))
    acc.tick(client.build_payload(etapa_2), etapa_2, 1001.0)
    assert acc.viaje()["bus_stops"][1]["arrivalActual"] == 256871
    fin = dict(etapa_2, onJob=False, bus=None)
    payload = client.build_payload(fin)
    payload["event"]["jobDelivered"] = True
    cierre = next(a for a in acc.tick(payload, fin, 1002.0) if a["tipo"] == "trip_close")["datos"]
    assert [p["id"] for p in cierre["bus_stops"]] == ["oulu", "pocviitasaar", "oulu"]
    assert cierre["bus_stops"][1]["arrivalActual"] == 256871
    assert cierre["job_kind"] == "bus"


def test_los_miradores_salen_por_uid_o_por_la_clave_del_nombre(tmp_path):
    """mapbuild/pois.viewpoints: el id del album -> lugar del cutscene. Por el
    uid; si un mod rehizo el sector (otro uid), por la clave del nombre en la
    accion del cutscene. Solo en ETS2."""
    import json as _json
    from mapbuild import pois

    cutscenes = [
        {"uid": "5e3e4694e4990000", "x": 43560.36, "y": -73397.83, "actionStringParams": [
            "create", "viewpoint", 'ui_value 0.0 "ui" "@@poc_cut_viitasaari@@"']},
        {"uid": "aaaa000000000001", "x": 100.4, "y": 200.6, "actionStringParams": [
            'ui_value 0.0 "ui" "@@de_cut_hannover@@"']},
    ]
    (tmp_path / "europe-cutscenes.json").write_text(_json.dumps(cutscenes), encoding="utf-8")
    tabla = {
        "pocviitasaar": {"key": "@@poc_cut_viitasaari@@", "uids": ["5e3e4694e4990000"]},
        "dehannover": {"key": "@@de_cut_hannover@@", "uids": ["ffff000000000000"]},
        "isgeyser": {"key": "@@is_cut_geyser@@", "uids": ["bbbb000000000000"]},
    }
    etiquetas = {(43560, -73398): "Viitasaari"}
    assert pois.viewpoints(str(tmp_path), "europe", etiquetas, tabla) == {
        "dehannover": [100, 201, "dehannover"],
        "pocviitasaar": [43560, -73398, "Viitasaari"],
    }
    assert pois.viewpoints(str(tmp_path), "usa", etiquetas, tabla) == {}
    assert pois.viewpoints(str(tmp_path / "nada"), "europe", etiquetas, tabla) == {}


def test_las_terminales_de_bus_salen_de_los_busstop_del_mapa(tmp_path):
    """mapbuild/pois.bus_stations: el BusStop del mapa da la ciudad y el
    lugar. Uno con la escena de turismo al lado (tag "tj") va aparte; uno sin
    ciudad no va (ningun trabajo lo nombra); dos del mismo tipo en una ciudad,
    el de uid menor. Valores de ETS2 1.62.3."""
    import json as _json
    from mapbuild import pois

    busstops = [
        # Tallinn: terminal de prefab, sin escena en el mapa
        {"uid": "b2", "x": 44519.4, "y": -50561.2, "cityToken": "tallinn", "prefabUid": "1"},
        # Joensuu: parada armada con escena de linea y otra de turismo
        {"uid": "c1", "x": 55088.0, "y": -71260.0, "cityToken": "joensuu", "prefabUid": "2"},
        {"uid": "c2", "x": 57167.0, "y": -69782.0, "cityToken": "joensuu", "prefabUid": "3"},
        # Valmiera: dos de linea a 30 m
        {"uid": "d2", "x": 47771.0, "y": -40898.0, "cityToken": "valmiera", "prefabUid": "4"},
        {"uid": "d1", "x": 47776.0, "y": -40872.0, "cityToken": "valmiera", "prefabUid": "5"},
        # turismo sin ciudad, y una fila rota
        {"uid": "e1", "x": 1.0, "y": 2.0, "cityToken": "", "prefabUid": "6"},
        {"uid": "e2", "x": None, "y": 2.0, "cityToken": "riga", "prefabUid": "7"},
    ]
    cutscenes = [
        {"uid": "s1", "x": 55070.0, "y": -71250.0, "tags": ["bus_stop", "load"]},
        {"uid": "s2", "x": 57150.0, "y": -69770.0, "tags": ["bus_stop", "load", "tj"]},
        {"uid": "s3", "x": 3.0, "y": 2.0, "tags": ["bus_stop", "load", "tj"]},
        {"uid": "s4", "x": 47770.0, "y": -40880.0, "tags": ["bus_stop", "load"]},
        # una escena de turismo a 100 m no hace de turismo a una terminal
        {"uid": "s5", "x": 44519.0, "y": -50461.0, "tags": ["bus_stop", "load", "tj"]},
        {"uid": "s6", "x": 0.0, "y": 0.0, "tags": ["game_intro", "tallinn"]},
    ]
    (tmp_path / "europe-busStops.json").write_text(_json.dumps(busstops), encoding="utf-8")
    (tmp_path / "europe-cutscenes.json").write_text(_json.dumps(cutscenes), encoding="utf-8")
    lineas, turismo = pois.bus_stations(str(tmp_path), "europe")
    assert lineas == {"tallinn": [44519, -50561], "joensuu": [55088, -71260], "valmiera": [47776, -40872]}
    assert turismo == {"joensuu": [57167, -69782]}
    # ATS y una salida del parser sin el parche (mapas armados antes): nada
    assert pois.bus_stations(str(tmp_path), "usa") == ({}, {})
    assert pois.bus_stations(str(tmp_path / "nada"), "europe") == ({}, {})


def test_una_parada_sobre_una_calle_lleva_el_punto_de_su_calle(tmp_path):
    """mapbuild/pois.bus_stop_roads: el BusStop atado a un road (prefabUid es
    el uid de un road) lleva el punto de esa calle al lado del cartel, sobre la
    curva del road (Hermite con la rotacion de los nodos), no sobre la recta
    entre sus nodos. La web termina la ruta pasando por ahi: por el nodo de
    patio, la de Stuttgart terminaba en el retorno 103 m mas alla (16-11).
    Los nodos van como los escribe el parser (con sangria y la rotacion en
    cuaternion adentro), y se leen sin cargar el archivo entero."""
    import json as _json
    from mapbuild import pois

    busstops = [
        # Stuttgart (ETS2 1.62.3): sobre una calle de una mano al oeste
        {"uid": "6319e8245f1f0000", "x": -5230.125, "y": 9775.32421875, "cityToken": "stuttgart",
         "prefabUid": "49cdd6b4464f1c6c", "nodeUid": "6319e8243d9f0003"},
        # una calle en curva, de (0, 0) al este hasta (100, 100) al sur
        {"uid": "c1", "x": 80.0, "y": 20.0, "cityToken": "curva", "prefabUid": "r2"},
        # una calle oculta, un prefab (terminal) y un road sin un nodo: sin punto
        {"uid": "c2", "x": 500.0, "y": 0.0, "cityToken": "oculta", "prefabUid": "r3"},
        {"uid": "c3", "x": 44519.4, "y": -50561.2, "cityToken": "tallinn", "prefabUid": "p1"},
        {"uid": "c4", "x": 0.0, "y": 0.0, "cityToken": "sin_nodo", "prefabUid": "r4"},
    ]
    roads = [
        {"uid": "49cdd6b4464f1c6c", "type": 3, "roadLookToken": "ger9",
         "startNodeUid": "49cdd6b44bcf58d6", "endNodeUid": "49cdd6b4548f5884", "length": 115.976},
        {"uid": "r2", "startNodeUid": "n1", "endNodeUid": "n2", "length": 160},
        {"uid": "r3", "startNodeUid": "n1", "endNodeUid": "n2", "hidden": True},
        {"uid": "r4", "startNodeUid": "n1", "endNodeUid": "falta"},
        {"uid": "r5", "startNodeUid": "n9", "endNodeUid": "n9"},
    ]
    nodos = [
        {"uid": "49cdd6b44bcf58d6", "x": -5111.32421875, "y": 9767.11328125, "z": 300.0,
         "rotation": 2.9642248102741267, "rotationQuat": [0.1, 0, 0.99, 0], "forwardItemUid": "0"},
        {"uid": "49cdd6b4548f5884", "x": -5225.08984375, "y": 9789.13671875, "z": 300.0,
         "rotation": 2.9267066298183453, "rotationQuat": [0.1, 0, 0.99, 0], "forwardItemUid": "0"},
        {"uid": "n1", "x": 0.0, "y": 0.0, "rotation": 0.0, "rotationQuat": [1, 0, 0, 0]},
        {"uid": "n2", "x": 100.0, "y": 100.0, "rotation": 1.5707963267948966, "rotationQuat": [0.7, 0, 0.7, 0]},
        {"uid": "n9", "x": 1.0, "y": 1.0, "rotation": None},
    ]
    (tmp_path / "europe-busStops.json").write_text(_json.dumps(busstops), encoding="utf-8")
    (tmp_path / "europe-roads.json").write_text(_json.dumps(roads, indent=2), encoding="utf-8")
    (tmp_path / "europe-nodes.json").write_text(_json.dumps(nodos, indent=2), encoding="utf-8")
    calles = pois.bus_stop_roads(str(tmp_path), "europe", busstops)
    # Stuttgart: la punta oeste de su calle (el cartel queda pasado esa punta)
    assert calles["6319e8245f1f0000"] == [-5225, 9789]
    # sobre la curva (su punto del medio, 67,7 / 32,3), no sobre la recta (50, 50)
    assert calles["c1"] == [68, 32]
    assert set(calles) == {"6319e8245f1f0000", "c1"}
    # en la tabla de la web va despues del cartel; la terminal de prefab, sola
    lineas, turismo = pois.bus_stations(str(tmp_path), "europe")
    assert lineas["stuttgart"] == [-5230, 9775, -5225, 9789]
    assert lineas["tallinn"] == [44519, -50561]
    assert lineas["oculta"] == [500, 0]
    assert turismo == {}
    # sin roads ni nodes (una salida del parser vieja): sin puntos, y la tabla de antes
    (tmp_path / "europe-roads.json").unlink()
    assert pois.bus_stop_roads(str(tmp_path), "europe", busstops) == {}
    assert pois.bus_stations(str(tmp_path), "europe")[0]["stuttgart"] == [-5230, 9775]


def test_la_tabla_de_miradores_sale_del_album_del_juego():
    """tools/build_viewpoints_ets2.py lee def/photo_album/viewpoints.sui."""
    import importlib.util
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "tools", "build_viewpoints_ets2.py")
    spec = importlib.util.spec_from_file_location("build_viewpoints_ets2", ruta)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    sui = """SiiNunit
{
photo_album_group : album.viewpoints
{
	items[]: album.viewpoints.pocviitasaar
}
photo_album_item : album.viewpoints.pocviitasaar
{
	name: "@@poc_cut_viitasaari@@"
	desc: "@@poc_cut_viitasaari_desc@@"
	dlc_id: eut2_nordic
	objects_uid[]: 0x5E3E4694E4990000
}
photo_album_item : album.viewpoints.corto
{
	name: "@@corto@@"
	objects_uid[]: 0x1
}
}"""
    assert modulo.leer(sui) == {
        "pocviitasaar": {"key": "@@poc_cut_viitasaari@@", "uids": ["5e3e4694e4990000"]},
        "corto": {"key": "@@corto@@", "uids": ["0000000000000001"]},
    }
    # La tabla que viaja con el cliente tiene los 137 de ETS2 1.62.3.
    tabla = pois_tabla()
    assert len(tabla) >= 137 and tabla["pocviitasaar"]["uids"] == ["5e3e4694e4990000"]


def pois_tabla():
    from mapbuild import pois
    return pois.load_viewpoint_table()

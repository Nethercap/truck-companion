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
    """El bloque de 32 KB con la zona de bus como la escribe el plugin."""
    datos = bytearray(telemetry_compat.BLOCK_SIZE)
    telemetry_compat._BUS_CABEZA.pack_into(
        datos, telemetry_compat.BUS_OFFSET, revision,
        len(etapas) if cantidad is None else cantidad, actual, cambios)
    base = telemetry_compat.BUS_OFFSET + telemetry_compat._BUS_CABEZA.size
    for i, (origen, destino, nums_origen, nums_destino) in enumerate(etapas):
        for j, (punta, nums) in enumerate(((origen, nums_origen), (destino, nums_destino))):
            numeros = [nums.get(c, 0) for c in telemetry_compat._BUS_CAMPOS]
            telemetry_compat._BUS_PARADA.pack_into(
                datos, base + (2 * i + j) * telemetry_compat._BUS_PARADA.size,
                *(t.encode("utf-8") for t in punta), *numeros)
    return bytes(datos)


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
    assert bus["stages"][0]["source"]["id"] == "oulu"
    assert bus["stages"][0]["source"]["departurePlanned"] == 256620
    assert bus["stages"][0]["source"]["arrivalActual"] == 0
    assert bus["stages"][1]["destination"]["name"] == "Oulu"
    assert bus["stages"][1]["destination"]["leavingPlanned"] == 25


def test_sin_la_zona_no_hay_bus():
    """Un plugin de Truck Dash hasta la 1.5.39 deja la zona en 0 (revision 0),
    y sin trabajo de bus no hay etapas."""
    assert telemetry_compat.leer_bus(bytes(telemetry_compat.BLOCK_SIZE)) is None
    assert telemetry_compat.leer_bus(bloque(revision=0)) is None
    assert telemetry_compat.leer_bus(bloque(etapas=[])) is None


def test_no_lee_mas_etapas_que_las_que_entran():
    bus = telemetry_compat.leer_bus(bloque(cantidad=40))
    assert len(bus["stages"]) == telemetry_compat.BUS_STAGES_MAX


def test_un_texto_de_64_bytes_sin_cero_no_rompe():
    """El plugin corta los textos a 63 y pone el 0, pero el lector no confia."""
    largo = "Ä" * 40  # 80 bytes en UTF-8
    etapas = [((largo, "x" * 70, "Ñandú"), ("city", "oulu", "Oulu"), {}, {})]
    origen = telemetry_compat.leer_bus(bloque(etapas))["stages"][0]["source"]
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
        return int(re.search(rf"#define {nombre} (\d+)", hpp).group(1))

    assert define("BUS_ZONE_REVISION") == telemetry_compat.BUS_ZONE_REVISION
    assert define("BUS_STAGES_MAX") == telemetry_compat.BUS_STAGES_MAX
    assert "offsetof(scsTelemetryMap_t, bus) == %d" % telemetry_compat.BUS_OFFSET in hpp
    assert "sizeof(scsBusStage_t) == %d" % (2 * telemetry_compat._BUS_PARADA.size) in hpp
    assert telemetry_compat._BUS_PARADA.size == 224 and telemetry_compat._BUS_CABEZA.size == 16
    fin = (telemetry_compat.BUS_OFFSET + 16
           + telemetry_compat.BUS_STAGES_MAX * 2 * telemetry_compat._BUS_PARADA.size)
    assert fin <= telemetry_compat.BLOCK_SIZE
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
    payload["event"]["jobDeliveredRevenue"] = 6718
    acciones = acc.tick(payload, fin, 1002.0)
    cierres = [a for a in acciones if a["tipo"] == "trip_close"]
    assert len(cierres) == 1 and cierres[0]["datos"]["status"] == "delivered"
    assert cierres[0]["datos"]["city_dst"] == "Oulu"

# -*- coding: utf-8 -*-
"""La cola local de la cuenta.

Lo que se prueba aca es casi todo sobre cortes: sin internet, con la API
caida, con el cliente cerrado a mitad de una escritura. Es el caso normal y
no el raro, porque esto corre en la PC de otra persona.
"""

import json
import os

import trip_queue

VIAJE = {
    "game": "ets2",
    "job_started_game_time": 1000, "deadline_game_time": 2000,
    "cargo_id": "cement", "city_src_id": "berlin", "city_dst_id": "praga",
    "city_dst": "Praga", "distance_tracked_km": 10.0,
}
SESION = {"client_id": "abc", "game": "ets2", "started_at": "2026-09-27T10:00:00+00:00",
          "distance_km": 12.0}


def viaje(**cambios):
    datos = dict(VIAJE)
    datos.update(cambios)
    return {"tipo": "trip_checkpoint", "datos": datos}


def cola(tmp_path):
    return trip_queue.Cola(str(tmp_path / "cola.json"))


class ApiFalsa:
    """Registra los pedidos y responde lo que le digan."""

    def __init__(self, respuestas=None, por_defecto=(200, {})):
        self.pedidos = []
        self.respuestas = respuestas or {}
        self.por_defecto = por_defecto

    def __call__(self, url, cuerpo=None, token=None, metodo=None):
        self.pedidos.append((metodo or ("POST" if cuerpo is not None else "GET"), url))
        for trozo, respuesta in self.respuestas.items():
            if trozo in url:
                return respuesta
        return self.por_defecto


ABRIO = (200, {"trip": {"id": "t1"}, "creado": True})


# --- la cola ---------------------------------------------------------------

def test_lo_nuevo_reemplaza_a_lo_viejo_de_la_misma_cosa():
    """Cinco checkpoints del mismo viaje son cinco fotos de los totales, no
    cinco incrementos: solo importa la ultima. Y si llegaran desordenadas,
    una vieja pisaria los numeros nuevos."""
    import tempfile
    c = trip_queue.Cola(os.path.join(tempfile.mkdtemp(), "cola.json"))
    for km in (10, 20, 30):
        c.encolar(viaje(distance_tracked_km=km))
    assert len(c) == 1
    assert c.pendientes()[0]["datos"]["distance_tracked_km"] == 30


def test_dos_viajes_distintos_son_dos_entradas(tmp_path):
    c = cola(tmp_path)
    c.encolar(viaje())
    c.encolar(viaje(cargo_id="madera", job_started_game_time=9999))
    assert len(c) == 2


def test_una_sesion_y_un_viaje_no_se_pisan(tmp_path):
    c = cola(tmp_path)
    c.encolar(viaje())
    c.encolar({"tipo": "session", "datos": SESION})
    assert len(c) == 2


def test_el_reemplazo_conserva_el_lugar_en_la_fila(tmp_path):
    """Lo que espera hace mas tiempo sigue saliendo primero aunque se haya
    actualizado; si no, un viaje que se actualiza seguido nunca saldria."""
    c = cola(tmp_path)
    c.encolar(viaje())
    c.encolar({"tipo": "session", "datos": SESION})
    c.encolar(viaje(distance_tracked_km=99))
    assert c.pendientes()[0]["clave"].startswith("trip:")


def test_sobrevive_a_cerrar_el_cliente(tmp_path):
    ruta = str(tmp_path / "cola.json")
    trip_queue.Cola(ruta).encolar(viaje())
    assert len(trip_queue.Cola(ruta)) == 1


def test_un_archivo_corrupto_no_impide_arrancar(tmp_path):
    """Perder lo pendiente es malo; no abrir el cliente es peor."""
    ruta = str(tmp_path / "cola.json")
    with open(ruta, "w", encoding="utf-8") as f:
        f.write("{esto no es json")
    c = trip_queue.Cola(ruta)
    assert len(c) == 0
    c.encolar(viaje())
    assert len(trip_queue.Cola(ruta)) == 1


def test_no_deja_el_archivo_a_medio_escribir(tmp_path):
    """Se escribe a un temporal y se renombra, asi que el archivo siempre es
    JSON valido entero."""
    ruta = str(tmp_path / "cola.json")
    c = trip_queue.Cola(ruta)
    for i in range(20):
        c.encolar(viaje(job_started_game_time=i))
    with open(ruta, encoding="utf-8") as f:
        assert len(json.load(f)) == 20
    assert not [n for n in os.listdir(str(tmp_path)) if n.endswith(".tmp")]


def test_hay_un_tope(tmp_path):
    c = trip_queue.Cola(str(tmp_path / "cola.json"), maximo=5)
    for i in range(12):
        c.encolar(viaje(job_started_game_time=i))
    assert len(c) == 5
    # Se tira lo mas viejo, se conserva lo ultimo.
    assert c.pendientes()[-1]["datos"]["job_started_game_time"] == 11


# --- el enviador -----------------------------------------------------------

def test_un_viaje_se_abre_y_despues_se_actualiza(tmp_path):
    c = cola(tmp_path)
    c.encolar(viaje())
    api = ApiFalsa({"/trips/open": ABRIO})
    resumen = trip_queue.Enviador(c, api).drenar("tok", "https://api")
    assert resumen["enviados"] == 1
    assert [u for _, u in api.pedidos] == ["https://api/trips/open",
                                           "https://api/trips/t1/checkpoint"]
    assert len(c) == 0


def test_se_abre_aunque_no_haya_apertura_pendiente(tmp_path):
    """La cola guarda el ultimo estado, no la historia: la apertura pudo
    haber sido reemplazada por un checkpoint y el id sigue haciendo falta."""
    c = cola(tmp_path)
    c.encolar({"tipo": "trip_open", "datos": dict(VIAJE)})
    c.encolar(viaje(distance_tracked_km=40))
    assert len(c) == 1
    api = ApiFalsa({"/trips/open": ABRIO})
    trip_queue.Enviador(c, api).drenar("tok", "https://api")
    assert "https://api/trips/open" in [u for _, u in api.pedidos]


def test_cerrar_usa_close_y_manda_el_estado(tmp_path):
    c = cola(tmp_path)
    datos = dict(VIAJE)
    datos["status"] = "delivered"
    c.encolar({"tipo": "trip_close", "datos": datos})
    api = ApiFalsa({"/trips/open": ABRIO})
    trip_queue.Enviador(c, api).drenar("tok", "https://api")
    assert api.pedidos[-1][1] == "https://api/trips/t1/close"


def test_una_sesion_va_por_put_con_su_client_id(tmp_path):
    c = cola(tmp_path)
    c.encolar({"tipo": "session", "datos": SESION})
    api = ApiFalsa()
    trip_queue.Enviador(c, api).drenar("tok", "https://api")
    assert api.pedidos == [("PUT", "https://api/sessions/abc")]
    assert len(c) == 0


def test_sin_internet_no_se_pierde_nada_y_se_corta(tmp_path):
    """Si no hay red para el primero no la hay para el segundo: seguir
    intentando solo gasta tiempo al lado del bucle de telemetria."""
    c = cola(tmp_path)
    c.encolar({"tipo": "session", "datos": SESION})
    c.encolar(viaje())
    api = ApiFalsa(por_defecto=(0, {}))
    resumen = trip_queue.Enviador(c, api).drenar("tok", "https://api")
    assert resumen["sin_conexion"] is True
    assert resumen["enviados"] == 0
    assert len(c) == 2
    assert len(api.pedidos) == 1


def test_una_entrada_rechazada_no_tapa_la_cola(tmp_path):
    """Sin esto, una sola cosa mal hace perder todo lo que venga despues."""
    c = cola(tmp_path)
    c.encolar({"tipo": "session", "datos": SESION})
    c.encolar(viaje())
    api = ApiFalsa({"/sessions/": (400, {"error": "fecha_futura"}),
                    "/trips/open": ABRIO})
    resumen = trip_queue.Enviador(c, api).drenar("tok", "https://api")
    assert resumen["descartados"] == 1
    assert resumen["enviados"] == 1
    assert len(c) == 0


def test_un_500_no_descarta_nada(tmp_path):
    """La API caida un rato no es lo mismo que la API diciendo que no."""
    c = cola(tmp_path)
    c.encolar(viaje())
    api = ApiFalsa(por_defecto=(500, {}))
    resumen = trip_queue.Enviador(c, api).drenar("tok", "https://api")
    assert resumen["descartados"] == 0
    assert len(c) == 1


def test_un_token_vencido_no_descarta_nada(tmp_path):
    """Se espera a que la persona vuelva a vincular, no se tiran sus viajes."""
    c = cola(tmp_path)
    c.encolar(viaje())
    api = ApiFalsa(por_defecto=(401, {}))
    resumen = trip_queue.Enviador(c, api).drenar("tok", "https://api")
    assert resumen["token_invalido"] is True
    assert len(c) == 1


def test_sin_token_no_se_intenta_nada(tmp_path):
    c = cola(tmp_path)
    c.encolar(viaje())
    api = ApiFalsa()
    trip_queue.Enviador(c, api).drenar("", "https://api")
    assert api.pedidos == []
    assert len(c) == 1


def test_el_id_del_viaje_se_recuerda_entre_envios(tmp_path):
    c = cola(tmp_path)
    api = ApiFalsa({"/trips/open": ABRIO})
    enviador = trip_queue.Enviador(c, api)
    for km in (10, 20):
        c.encolar(viaje(distance_tracked_km=km))
        enviador.drenar("tok", "https://api")
    aperturas = [u for _, u in api.pedidos if u.endswith("/trips/open")]
    assert len(aperturas) == 1


def test_si_el_viaje_ya_no_existe_se_vuelve_a_abrir(tmp_path):
    """Alguien borro el viaje desde la web: el id cacheado murio y hay que
    olvidarlo, no reintentar para siempre contra un id muerto."""
    c = cola(tmp_path)
    api = ApiFalsa({"/trips/open": ABRIO, "/checkpoint": (404, {})})
    enviador = trip_queue.Enviador(c, api)
    c.encolar(viaje())
    enviador.drenar("tok", "https://api")
    assert enviador._ids == {}


def test_dos_tramos_del_mismo_viaje_no_se_pisan_en_la_cola(tmp_path):
    """Lo pendiente del tramo anterior (el cliente se cerro antes de mandarlo)
    no lo reemplaza el primer checkpoint del tramo nuevo."""
    cola = trip_queue.Cola(str(tmp_path / "cola.json"))
    base = {"job_started_game_time": 1, "deadline_game_time": 2, "cargo_id": "x",
            "city_src_id": "a", "city_dst_id": "b"}
    cola.encolar({"tipo": "trip_checkpoint", "datos": dict(base, run_id="r1", distance_tracked_km=46.6)})
    cola.encolar({"tipo": "trip_checkpoint", "datos": dict(base, run_id="r2", distance_tracked_km=1.2)})
    assert [e["datos"]["distance_tracked_km"] for e in cola.pendientes()] == [46.6, 1.2]

# -*- coding: utf-8 -*-
"""El sincronizador: acumulador + cola + API, al lado del bucle.

Lo que importa probar aca no son los numeros (eso ya esta en
test_accumulator) sino las dos reglas de convivencia: que sin cuenta no se
guarde nada, y que nada de esto pueda tumbar el tablero.
"""

import asyncio

import account_sync
import win_integration


def payload(**cambios):
    base = {"game": "ets2", "paused": False, "speedKmh": 80.0,
            "gameTimeMinutes": 600.0, "odometerKm": 1000.0, "fuel": 400.0,
            "truckBrand": "Scania", "truckName": "S", "wear": {}, "event": {}}
    base.update(cambios)
    return base


SIN_TRABAJO = {"onJob": False}


def sincronizador(tmp_path, monkeypatch, token="tok"):
    monkeypatch.setattr(win_integration, "load_settings",
                        lambda: {"account_token": token} if token else {})
    reloj = {"t": 1000.0}
    sync = account_sync.Sincronizador(ruta=str(tmp_path / "cola.json"),
                                      ahora=lambda: reloj["t"])
    return sync, reloj


def conducir(sync, reloj, segundos=10, raw=SIN_TRABAJO):
    odo, juego = 1000.0, 600.0
    for _ in range(segundos):
        reloj["t"] += 1
        odo += 80 * 19 / 3600
        juego += 19 / 60
        sync.tick(payload(odometerKm=odo, gameTimeMinutes=juego), raw)


def test_sin_cuenta_no_se_guarda_nada(tmp_path, monkeypatch):
    """Guardar en disco por donde anduvo alguien que nunca dijo que si, por
    las dudas de que algun dia se registre, es justo lo que no queremos."""
    sync, reloj = sincronizador(tmp_path, monkeypatch, token=None)
    # Mas largo que el intervalo de checkpoint a proposito: con 30 segundos
    # la cola quedaba vacia aunque el acumulador estuviera corriendo, y el
    # test pasaba sin probar nada.
    conducir(sync, reloj, account_sync.INTERVALO_DRENAJE_S * 8)
    assert sync.pendientes() == 0
    assert sync._acumulador is None


def test_con_cuenta_se_acumula_y_se_encola(tmp_path, monkeypatch):
    sync, reloj = sincronizador(tmp_path, monkeypatch)
    conducir(sync, reloj, 30)
    sync.cerrar_sesion()
    assert sync.pendientes() == 1


def test_vincular_a_mitad_de_partida_empieza_a_andar_sin_reiniciar(tmp_path, monkeypatch):
    settings = {}
    monkeypatch.setattr(win_integration, "load_settings", lambda: dict(settings))
    reloj = {"t": 1000.0}
    sync = account_sync.Sincronizador(ruta=str(tmp_path / "cola.json"),
                                      ahora=lambda: reloj["t"])
    conducir(sync, reloj, 5)
    assert sync.pendientes() == 0
    settings["account_token"] = "tok"
    reloj["t"] += account_sync.INTERVALO_TOKEN_S + 1  # se relee el token
    conducir(sync, reloj, 5)
    sync.cerrar_sesion()
    assert sync.pendientes() == 1


def test_desvincular_cierra_la_sesion_en_la_cola(tmp_path, monkeypatch):
    """Lo ya acumulado no se tira: queda esperando a que se vuelva a
    vincular."""
    settings = {"account_token": "tok"}
    monkeypatch.setattr(win_integration, "load_settings", lambda: dict(settings))
    reloj = {"t": 1000.0}
    sync = account_sync.Sincronizador(ruta=str(tmp_path / "cola.json"),
                                      ahora=lambda: reloj["t"])
    conducir(sync, reloj, 10)
    settings.pop("account_token")
    reloj["t"] += account_sync.INTERVALO_TOKEN_S + 1
    sync.tick(payload(), SIN_TRABAJO)
    assert sync.pendientes() == 1
    assert sync._cola.pendientes()[0]["datos"]["ended_at"] is not None


def test_un_acumulador_roto_no_tumba_el_tablero(tmp_path, monkeypatch):
    """La cuenta es opcional; el tablero es lo que la persona vino a usar."""
    sync, reloj = sincronizador(tmp_path, monkeypatch)
    conducir(sync, reloj, 3)

    class Explota:
        def tick(self, *a, **k):
            raise RuntimeError("boom")

        def cerrar(self, *a, **k):
            raise RuntimeError("boom")

    sync._acumulador = Explota()
    sync.tick(payload(), SIN_TRABAJO)   # no levanta
    sync.cerrar_sesion()                # tampoco


def test_drenar_no_levanta_aunque_la_api_explote(tmp_path, monkeypatch):
    def rompe(*a, **k):
        raise OSError("sin red")

    monkeypatch.setattr(win_integration, "load_settings",
                        lambda: {"account_token": "tok"})
    sync = account_sync.Sincronizador(ruta=str(tmp_path / "cola.json"), pedir=rompe)
    sync.tick(payload(), SIN_TRABAJO)
    sync.cerrar_sesion()
    assert asyncio.run(sync.drenar()) == {}
    # Y no se perdio nada.
    assert sync.pendientes() == 1


def test_drenar_manda_lo_pendiente(tmp_path, monkeypatch):
    pedidos = []

    def falso(url, cuerpo=None, token=None, metodo=None):
        pedidos.append(url)
        return 200, {"trip": {"id": "t1"}}

    monkeypatch.setattr(win_integration, "load_settings",
                        lambda: {"account_token": "tok"})
    sync = account_sync.Sincronizador(ruta=str(tmp_path / "cola.json"), pedir=falso)
    sync.tick(payload(), SIN_TRABAJO)
    sync.cerrar_sesion()
    resumen = asyncio.run(sync.drenar())
    assert resumen["enviados"] == 1
    assert sync.pendientes() == 0
    assert pedidos and "/sessions/" in pedidos[0]


def test_sin_pendientes_no_se_pide_nada(tmp_path, monkeypatch):
    pedidos = []
    monkeypatch.setattr(win_integration, "load_settings",
                        lambda: {"account_token": "tok"})
    sync = account_sync.Sincronizador(
        ruta=str(tmp_path / "cola.json"),
        pedir=lambda *a, **k: (pedidos.append(a), (200, {}))[1])
    assert asyncio.run(sync.drenar()) == {}
    assert pedidos == []


def test_lo_pendiente_sobrevive_a_cerrar_el_cliente(tmp_path, monkeypatch):
    ruta = str(tmp_path / "cola.json")
    monkeypatch.setattr(win_integration, "load_settings",
                        lambda: {"account_token": "tok"})
    reloj = {"t": 1000.0}
    sync = account_sync.Sincronizador(ruta=ruta, ahora=lambda: reloj["t"])
    conducir(sync, reloj, 10)
    sync.cerrar_sesion()
    # Otro arranque del cliente, con el mismo archivo.
    assert account_sync.Sincronizador(ruta=ruta).pendientes() == 1


def test_apagadas_desde_el_relay_no_se_acumula_ni_se_manda_y_la_cola_queda(tmp_path, monkeypatch):
    """El interruptor remoto: si algo sale mal con las cuentas, se cortan en
    todas las PCs sin release. Lo que ya estaba en la cola no se tira."""
    pedidos = []

    def falso(url, cuerpo=None, token=None, metodo=None):
        pedidos.append(url)
        return 200, {"trip": {"id": "t1"}}

    settings = {"account_token": "tok"}
    monkeypatch.setattr(win_integration, "load_settings", lambda: dict(settings))
    reloj = {"t": 1000.0}
    sync = account_sync.Sincronizador(ruta=str(tmp_path / "cola.json"), pedir=falso,
                                      ahora=lambda: reloj["t"])
    conducir(sync, reloj, 30)
    settings["accounts_remote"] = False
    reloj["t"] += account_sync.INTERVALO_TOKEN_S + 1
    conducir(sync, reloj, 30)
    assert sync._acumulador is None          # cerro lo que llevaba
    quedan = sync.pendientes()
    assert quedan >= 1
    assert asyncio.run(sync.drenar()) == {} and pedidos == []
    conducir(sync, reloj, 30)
    assert sync.pendientes() == quedan       # apagadas no suma nada nuevo
    # Prendidas de nuevo: se manda lo guardado.
    settings["accounts_remote"] = True
    assert asyncio.run(sync.drenar())["enviados"] >= 1


def test_la_sesion_y_el_viaje_llevan_los_mods_de_mapa(tmp_path, monkeypatch):
    """map_variant llegaba siempre vacio: el acumulador se creaba sin nada."""
    sync, reloj = sincronizador(tmp_path, monkeypatch)
    sync.poner_mods({"ets2": {"promods": True, "rusmap": False}, "ats": None})
    trabajo = {"onJob": True, "jobStartingTime": 1000, "time_abs_delivery": 2000,
               "cargoId": "c", "citySrcId": "a", "cityDstId": "b", "citySrc": "A", "cityDst": "B"}
    conducir(sync, reloj, 5, raw=trabajo)
    sync.cerrar_sesion()
    import json
    cola = json.load(open(tmp_path / "cola.json", encoding="utf-8"))
    variantes = {e["tipo"]: e["datos"].get("map_variant") for e in cola}
    assert variantes["session"] == "promods"
    assert any(e["datos"].get("map_variant") == "promods" for e in cola if e["tipo"].startswith("trip"))

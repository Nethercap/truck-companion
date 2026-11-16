"""El bloque de telemetria que se lee, y que hace el cliente cuando el juego se
fue pero el bloque sigue ahi.

Log del 16-11 (cliente 1.5.43, ATS): con The Dispatcher abierto, el bloque
Local\\SCSTelemetry seguia existiendo despues de cerrar el juego. init() andaba,
el estado pasaba a "waiting_truck", a los 5 s sin ventana a "waiting_game", se
cerraba y se volvia a abrir: unas 1.000 vueltas en hora y media, cada una un
client_status al relay y por LAN. Y al volver a abrir el juego se abrio ese
bloque antes de que existiera el nuestro, y se leyo toda la sesion.
"""

import asyncio
import json
import logging
import struct
import types

import pytest

import telemetry_compat

pytest.importorskip("tkinter")
import tray_client  # noqa: E402


def _bloque(activo: bool, render: int) -> bytearray:
    """Un bloque de la revision 12 con sdkActive y renderTime puestos."""
    bloque = bytearray(32 * 1024)
    struct.pack_into("<I", bloque, 40, 12)
    bloque[0] = 1 if activo else 0
    struct.pack_into("<Q", bloque, 24, render)
    return bloque


def _nombres():
    return telemetry_compat.WINDOWS_NAMES if telemetry_compat.IS_WINDOWS else telemetry_compat.LINUX_PATHS


@pytest.fixture
def bloques(monkeypatch):
    """Los bloques que existen, por nombre. Se leen vivos, como la memoria
    compartida de verdad: cambiar el bytearray cambia lo que lee el cliente."""
    existen = {}

    def abrir(nombre):
        if nombre not in existen:
            raise FileNotFoundError(nombre)
        return existen[nombre]

    monkeypatch.setattr(telemetry_compat, "_open_named", abrir)
    monkeypatch.setattr(telemetry_compat, "_espiar",
                        lambda nombre: nombre in existen and existen[nombre][0] != 0,
                        raising=False)
    yield existen
    telemetry_compat.deinit()


# ------------------------------------------------------- que bloque se abre

def test_se_abre_el_que_tiene_el_plugin_andando(bloques):
    """En Linux el plugin no borra su archivo de /dev/shm: el nuestro queda con
    sdkActive en false al cerrar el juego. Si el otro anda, se lee el otro."""
    nuestro, otro = _nombres()
    bloques[nuestro] = _bloque(False, 0)
    bloques[otro] = _bloque(True, 500)
    telemetry_compat.init()
    assert telemetry_compat.opened_block() == otro

    # Los dos andando: el nuestro.
    telemetry_compat.deinit()
    bloques[nuestro][0] = 1
    telemetry_compat.init()
    assert telemetry_compat.opened_block() == nuestro


def test_sin_ninguno_andando_se_abre_el_primero_que_existe(bloques):
    """El que llama ve sdkActive en false y lo trata como juego cerrado."""
    nuestro, otro = _nombres()
    bloques[otro] = _bloque(False, 0)
    telemetry_compat.init()
    assert telemetry_compat.opened_block() == otro
    telemetry_compat.deinit()
    bloques[nuestro] = _bloque(False, 0)
    telemetry_compat.init()
    assert telemetry_compat.opened_block() == nuestro


def test_mejor_bloque_activo(bloques):
    nuestro, otro = _nombres()
    bloques[otro] = _bloque(True, 500)
    telemetry_compat.init()
    assert telemetry_compat.mejor_bloque_activo() is None
    bloques[nuestro] = _bloque(False, 0)
    assert telemetry_compat.mejor_bloque_activo() is None, "el nuestro todavia no anda"
    bloques[nuestro][0] = 1
    assert telemetry_compat.mejor_bloque_activo() == nuestro
    telemetry_compat.deinit()
    telemetry_compat.init()
    assert telemetry_compat.opened_block() == nuestro
    assert telemetry_compat.mejor_bloque_activo() is None, "del nuestro no se cambia"


# ---------------------------------------------------------- bloque sin juego

def test_bloque_sin_juego(monkeypatch):
    ventana = [None]
    monkeypatch.setattr(tray_client.client_lib, "find_game_window", lambda: ventana[0])
    sin_juego = tray_client.bloque_sin_juego

    assert sin_juego({"sdkActive": False, "renderTime": 0}, None) == tray_client.SIN_JUEGO_APAGADO
    assert sin_juego({"sdkActive": True, "renderTime": 900}, None) is None
    assert sin_juego({"sdkActive": True, "renderTime": 900}, 900) == tray_client.SIN_JUEGO_CONGELADO
    assert sin_juego({"sdkActive": True, "renderTime": 901}, 900) is None, "el juego volvio"
    # Con la ventana del juego es una carga (o un cuelgue que se ve): se lee
    # como siempre.
    ventana[0] = 1234
    assert sin_juego({"sdkActive": True, "renderTime": 900}, 900) is None
    # Sin renderTime (otra version del plugin) no se compara nada.
    assert sin_juego({"sdkActive": True}, None) is None


# --------------------------------------------------- el bucle de telemetria

class _Parar(Exception):
    pass


class _Juego:
    """El juego de mentira: un reloj, la ventana, y lo que hace en cada paso."""

    def __init__(self):
        self.reloj = 1_000_000.0
        self.ventana = None
        self.en_cada_paso = []

    def time(self):
        return self.reloj


def _correr_bucle(monkeypatch, juego: _Juego, segundos: float):
    """Corre telemetry_loop con el reloj de mentira hasta `segundos` y
    devuelve los estados que se publicaron (relay y LAN mandan lo mismo)."""
    publicados = []

    class Nube:
        async def send(self, msg):
            if '"client_status"' in msg:
                publicados.append(json.loads(msg)["status"])

    class Lan:
        async def broadcast(self, msg, is_status=False):
            pass

    fin = juego.reloj + segundos

    async def dormir(s):
        juego.reloj += s
        for paso in juego.en_cada_paso:
            paso()
        if juego.reloj >= fin:
            raise _Parar

    monkeypatch.setattr(tray_client, "asyncio", types.SimpleNamespace(sleep=dormir))
    monkeypatch.setattr(tray_client, "time", types.SimpleNamespace(time=juego.time, monotonic=juego.time))
    monkeypatch.setattr(tray_client.client_lib, "find_game_window", lambda: juego.ventana)
    monkeypatch.setattr(tray_client, "diagnose_running_game", lambda hwnd: None)
    monkeypatch.setattr(tray_client, "actualizar_plugins_viejos", lambda *a, **k: None)
    monkeypatch.setattr(tray_client, "refresh_map_mods", lambda *a, **k: False)
    monkeypatch.setattr(tray_client, "local_maps_summary", lambda: {})
    monkeypatch.setattr(tray_client, "status_message",
                        lambda: json.dumps({"type": "client_status", "status": tray_client.state.status}))
    monkeypatch.setattr(tray_client, "open_web_ui", lambda: None)
    monkeypatch.setattr(tray_client.win_integration, "quit_on_game_close_enabled", lambda: False)
    nada = types.SimpleNamespace(update=lambda *a: None, tick=lambda *a: None,
                                 cerrar_sesion=lambda *a: None, telemetria=lambda *a: None)
    for nombre in ("discord", "cuenta", "overlay_data"):
        monkeypatch.setattr(tray_client.state, nombre, nada)
    monkeypatch.setattr(tray_client.state, "installs", [])
    monkeypatch.setattr(tray_client.state, "status", "starting")
    monkeypatch.setattr(tray_client.state, "refresh_title", lambda: None)
    monkeypatch.setattr(tray_client, "_juego_visto_desde", None)

    with pytest.raises(_Parar):
        asyncio.run(tray_client.telemetry_loop(Nube(), Lan()))
    return publicados


def _aperturas(caplog):
    return [r.getMessage() for r in caplog.records if r.getMessage().startswith("Telemetry opened")]


def test_con_el_bloque_de_un_juego_cerrado_no_se_cambia_de_estado(monkeypatch, bloques, caplog):
    """El caso del log: el juego se cerro bien (el plugin dejo sdkActive en
    false) y otra app tiene el bloque abierto. Antes: "waiting_truck" y
    "waiting_game" cada 5 s, para siempre."""
    caplog.set_level(logging.INFO)
    bloques[_nombres()[1]] = _bloque(False, 0)
    juego = _Juego()
    publicados = _correr_bucle(monkeypatch, juego, 600)
    assert publicados == ["waiting_game"]
    assert _aperturas(caplog) == []


def test_con_el_bloque_de_un_juego_colgado_no_se_cambia_de_estado(monkeypatch, bloques, caplog):
    """El juego se colgo o se cayo sin apagar el plugin: el ultimo cuadro
    queda con sdkActive en true. Se ve congelado, se va la ventana, y desde ahi
    se espera el juego sin volver a "waiting_truck"."""
    caplog.set_level(logging.INFO)
    bloques[_nombres()[1]] = _bloque(True, 777)
    juego = _Juego()
    juego.ventana = 1234
    def se_va_la_ventana():
        if juego.reloj > 1_000_030:
            juego.ventana = None
    juego.en_cada_paso.append(se_va_la_ventana)
    publicados = _correr_bucle(monkeypatch, juego, 600)
    # Al abrir no se sabe que esta congelado (hace falta ver que no cambia).
    assert publicados == ["live", "waiting_truck", "waiting_game"]
    assert len(_aperturas(caplog)) == 1


def test_el_juego_vuelve_despues_del_bloque_viejo(monkeypatch, bloques, caplog):
    """Con el bloque viejo esperando, el juego arranca otra vez: el plugin
    escribe en el mismo bloque (otra app lo tiene abierto) y se lee."""
    caplog.set_level(logging.INFO)
    otro = _nombres()[1]
    bloques[otro] = _bloque(False, 0)
    juego = _Juego()
    inicio = juego.reloj

    def arranca():
        if juego.reloj > inicio + 100:
            b = bloques[otro]
            b[0] = 1
            struct.pack_into("<Q", b, 24, int(juego.reloj * 1000))
    juego.en_cada_paso.append(arranca)
    publicados = _correr_bucle(monkeypatch, juego, 200)
    assert publicados == ["waiting_game", "live"]
    assert _aperturas(caplog) == [f"Telemetry opened: {otro}"]


def test_se_pasa_al_bloque_de_truck_dash_cuando_aparece(monkeypatch, bloques, caplog):
    """Al arrancar el juego el plugin de RenCloud creo su bloque antes que el
    nuestro y el cliente se quedo con ese toda la sesion (log del 16-11, 14:47)."""
    caplog.set_level(logging.INFO)
    nuestro, otro = _nombres()
    juego = _Juego()
    inicio = juego.reloj

    def cuadro():
        for nombre, b in bloques.items():
            struct.pack_into("<Q", b, 24, int(juego.reloj * 1000))
        if juego.reloj > inicio + 5 and nuestro not in bloques:
            bloques[nuestro] = _bloque(True, int(juego.reloj * 1000))
    bloques[otro] = _bloque(True, int(juego.reloj * 1000))
    juego.ventana = 1234
    juego.en_cada_paso.append(cuadro)
    publicados = _correr_bucle(monkeypatch, juego, 30)
    assert publicados == ["live"]
    assert _aperturas(caplog) == [f"Telemetry opened: {otro}", f"Telemetry opened: {nuestro}"]
    assert telemetry_compat.opened_block() == nuestro

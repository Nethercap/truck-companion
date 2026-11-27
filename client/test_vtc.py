"""La empresa virtual (VTC) de la cuenta: lo que se lee de la API (vtc.py), el
menu de la bandeja, Setup, lo que va al tablero y lo que el tablero pide."""

import asyncio
import json
import threading
import time
import types

import pytest

import account
import client
import i18n
import telemetry_compat
import tray_client
import vtc

KL = {"enabled": True, "signed_in": True, "vtc": {"tag": "KL", "name": "Kappa  Logistics", "color": "#3B9eff", "logo_url": None},
      "member": {"mode": "vtc", "permissions": []}}
EMPRESA = {"tag": "KL", "name": "Kappa Logistics", "color": "#3B9eff", "mode": "vtc"}


def con(**cambios):
    d = json.loads(json.dumps(KL))
    for k, v in cambios.items():
        (d["member"] if k == "mode" else d["vtc"] if k in ("tag", "name", "color") else d)[k] = v
    return d


# ------------------------------------------------------ lo que dice la API

def test_de_la_api():
    assert vtc.de_la_api(KL) == EMPRESA
    assert vtc.de_la_api(con(mode="personal"))["mode"] == "personal"
    assert vtc.de_la_api(con(color="red"))["color"] is None
    assert vtc.de_la_api(con(color=None))["color"] is None
    assert vtc.de_la_api(con(name=None))["name"] == ""
    assert len(vtc.de_la_api(con(name="x" * 200))["name"]) == vtc.NOMBRE_MAX


@pytest.mark.parametrize("datos", [
    None, [], "x", {}, {"enabled": False, "vtc": None}, {"enabled": True, "signed_in": True, "vtc": None},
    con(enabled=False), con(enabled=1), con(tag=""), con(tag="KL\n"), con(tag="[KL]"), con(tag="123456789"),
    con(tag=7), con(mode="otro"), con(mode=None), {**KL, "member": None}, {**KL, "member": "vtc"}, {**KL, "vtc": "KL"},
])
def test_sin_empresa_o_con_algo_que_no_se_entiende_no_hay_nada(datos):
    assert vtc.de_la_api(datos) is None


class Api:
    """La API de cuentas, de mentira: lo que contesta y lo que le pidieron."""

    def __init__(self, monkeypatch, modo="vtc"):
        self.modo, self.pedidos = modo, []
        self.get = lambda: (200, con(mode=self.modo))
        self.patch = self.cambiar
        self.settings = {"account_token": "tok", "accounts_url": "https://api.prueba"}
        monkeypatch.setattr(account, "_pedir", self.pedir)

    def cambiar(self, cuerpo):
        self.modo = cuerpo["mode"]
        return 200, {"ok": True, "mode": self.modo, "hide_name": False}

    def pedir(self, url, cuerpo=None, token=None, metodo=None):
        self.pedidos.append((metodo or "GET", url, cuerpo, token))
        return self.patch(cuerpo) if metodo == "PATCH" else self.get()

    def vtc(self, **kw):
        return vtc.Vtc(lambda: dict(self.settings), **kw)


@pytest.fixture
def api(monkeypatch):
    return Api(monkeypatch)


def test_refrescar_lee_y_avisa_una_vez_por_cambio(api):
    avisos = []
    v = api.vtc(al_cambiar=lambda: avisos.append(v.actual and v.actual["mode"]))
    v.refrescar()
    v.refrescar()
    assert v.actual == EMPRESA and avisos == ["vtc"]
    assert api.pedidos[0] == ("GET", "https://api.prueba/vtc/me", None, "tok")
    api.modo = "personal"
    v.refrescar()
    assert avisos == ["vtc", "personal"]
    api.get = lambda: (200, {"enabled": True, "signed_in": True, "vtc": None})  # se fue de la empresa
    v.refrescar()
    assert v.actual is None and avisos == ["vtc", "personal", None]


def test_que_la_api_no_conteste_no_es_dejar_la_empresa(api):
    v = api.vtc()
    v.refrescar()
    for codigo in (0, 429, 500, 502, 503):
        api.get = lambda c=codigo: (c, {})
        v.refrescar()
        assert v.actual == EMPRESA, codigo
    for codigo in (401, 403, 404):
        api.get = lambda: (200, KL)
        v.refrescar()
        api.get = lambda c=codigo: (c, {})
        v.refrescar()
        assert v.actual is None, codigo


def test_sin_cuenta_o_con_las_cuentas_apagadas_no_se_pide_nada(api):
    prendida = [True]
    v = api.vtc(prendida=lambda: prendida[0])
    v.refrescar()
    assert v.actual == EMPRESA
    prendida[0] = False
    assert v.poner_modo("personal") is False  # apagadas desde el relay, todavia sin releer
    assert len(api.pedidos) == 1
    v.refrescar()
    assert v.actual is None and len(api.pedidos) == 1
    prendida[0] = True
    api.settings.pop("account_token")  # desvinculada
    v.refrescar()
    assert v.actual is None and len(api.pedidos) == 1


def test_poner_el_modo_lo_cambia_en_la_api_y_avisa(api):
    avisos = []
    v = api.vtc(al_cambiar=lambda: avisos.append(v.actual["mode"]))
    v.refrescar()
    assert v.poner_modo("personal") is True
    assert api.pedidos[-1] == ("PATCH", "https://api.prueba/vtc/me", {"mode": "personal"}, "tok")
    assert v.actual == {**EMPRESA, "mode": "personal"} and avisos == ["vtc", "personal"]
    # Un modo que no existe, o sin empresa, no llega a la API.
    cuantos = len(api.pedidos)
    for malo in ("otro", "", None, 1):
        assert v.poner_modo(malo) is False
    assert api.vtc().poner_modo("vtc") is False
    assert len(api.pedidos) == cuantos


def test_si_la_api_no_lo_cambia_queda_como_estaba_y_se_vuelve_a_mirar(api):
    v = api.vtc()
    v.refrescar()
    for respuesta in ((0, {}), (500, {}), (403, {"detail": {"error": "vtc_not_member"}}), (200, {}),
                      (200, {"ok": True, "mode": "vtc"})):
        v._ya.clear()
        api.patch = lambda cuerpo, r=respuesta: r
        assert v.poner_modo("personal") is False, respuesta
        assert v.actual == EMPRESA
        assert v._ya.is_set(), respuesta


def test_una_lectura_vieja_no_pisa_el_modo_recien_cambiado(api):
    """El GET salio antes del cambio y su respuesta llega despues."""
    v = api.vtc()
    v.refrescar()

    def lento():
        assert v.poner_modo("personal") is True
        return 200, con(mode="vtc")
    api.get = lento
    v.refrescar()
    assert v.actual["mode"] == "personal"


def test_despertar_no_repite_un_pedido_recien_hecho(api):
    reloj = [100.0]
    v = api.vtc(ahora=lambda: reloj[0])
    v.despertar()
    assert v._ya.is_set()  # todavia no se pidio nunca
    v._ya.clear()
    v.refrescar()
    v.despertar()
    assert not v._ya.is_set()
    v.despertar(forzar=True)
    assert v._ya.is_set()
    v._ya.clear()
    reloj[0] += vtc.MINIMO_S
    v.despertar()
    assert v._ya.is_set()


def test_vigilar_sigue_aunque_algo_falle(api, monkeypatch):
    """Es un hilo: una excepcion lo mataba y la empresa quedaba la de antes."""
    vueltas = []
    api.get = lambda: vueltas.append(1) or (_ for _ in ()).throw(RuntimeError("x")) if len(vueltas) < 2 else (200, KL)
    v = api.vtc()
    hilo = threading.Thread(target=v.vigilar, daemon=True)
    hilo.start()
    limite = time.time() + 5
    while v.actual is None and time.time() < limite:
        v.despertar(forzar=True)
        time.sleep(0.02)
    assert v.actual == EMPRESA and hilo.is_alive()


# ------------------------------------------------------ lo que pide el tablero

def mandar(mensaje):
    """El mensaje por el socket, esperando a lo que quede corriendo aparte."""
    enviados = []

    async def correr():
        async def send(texto):
            enviados.append(json.loads(texto))
        await client.handle_control_message(json.dumps(mensaje), {}, send)
        await asyncio.gather(*list(client._tareas_sueltas))
    asyncio.run(correr())
    return enviados


def test_el_tablero_cambia_el_modo(monkeypatch, caplog):
    modos = []
    monkeypatch.setattr(client, "on_vtc_mode", lambda m: modos.append(m) or True)
    assert mandar({"type": "set_vtc_mode", "mode": "personal"}) == []
    assert mandar({"type": "set_vtc_mode", "mode": "vtc"}) == []
    for malo in ("otro", None, 1, ["vtc"], ""):
        assert mandar({"type": "set_vtc_mode", "mode": malo}) == []
    assert modos == ["personal", "vtc"]
    monkeypatch.setattr(client, "on_vtc_mode", lambda m: False)
    assert mandar({"type": "set_vtc_mode", "mode": "vtc"}) == [
        {"type": "command_result", "action": "vtc_mode", "ok": False, "reason": "vtc_mode"}]
    monkeypatch.setattr(client, "on_vtc_mode", None)  # client.py solo, sin la bandeja
    with caplog.at_level("INFO"):
        assert mandar({"type": "set_vtc_mode", "mode": "vtc"}) == []
    assert not caplog.records


def test_los_botones_no_esperan_a_la_api(monkeypatch):
    """Por el mismo socket llegan los botones del camion."""
    soltar = threading.Event()
    monkeypatch.setattr(client, "on_vtc_mode", lambda m: soltar.wait(5))

    async def correr():
        async def send(texto):
            pass
        t0 = time.monotonic()
        await client.handle_control_message('{"type": "set_vtc_mode", "mode": "vtc"}', {}, send)
        tardo = time.monotonic() - t0
        soltar.set()
        await asyncio.gather(*list(client._tareas_sueltas))
        return tardo
    assert asyncio.run(correr()) < 1
    assert not client._tareas_sueltas


def test_si_el_tablero_se_fue_el_aviso_no_rompe_nada(monkeypatch):
    monkeypatch.setattr(client, "on_vtc_mode", lambda m: False)

    async def correr():
        async def send(texto):
            raise ConnectionError("cerrado")
        await client.handle_control_message('{"type": "set_vtc_mode", "mode": "vtc"}', {}, send)
        await asyncio.gather(*list(client._tareas_sueltas))
    asyncio.run(correr())


def test_el_estado_lleva_la_empresa(monkeypatch):
    monkeypatch.setattr(tray_client.state.vtc, "actual", None)
    assert json.loads(tray_client.status_message())["vtc"] is None
    monkeypatch.setattr(tray_client.state.vtc, "actual", EMPRESA)
    assert json.loads(tray_client.status_message())["vtc"] == EMPRESA


class Destino:
    """El relay o el servidor LAN, de mentira: lo que les llega."""

    def __init__(self):
        self.llego = []

    async def send(self, texto):
        self.llego.append(json.loads(texto))

    async def broadcast(self, texto, is_status=False):
        self.llego.append(json.loads(texto))

    def estados(self):
        return [m for m in self.llego if m.get("type") == "client_status"]


def bucle_de_telemetria(monkeypatch, mientras, raw=None):
    """telemetry_loop un rato, sin juego (raw None) o con esos datos."""
    nube, lan = Destino(), Destino()
    monkeypatch.setattr(client, "RECONNECT_DELAY_SECONDS", 0.01)
    monkeypatch.setattr(client, "SEND_INTERVAL_SECONDS", 0.01)
    monkeypatch.setattr(tray_client, "refresh_map_mods", lambda force=False: False)
    monkeypatch.setattr(tray_client, "actualizar_plugins_viejos", lambda ahora=None: None)
    monkeypatch.setattr(tray_client, "telemetry_status_when_unavailable", lambda: "waiting_game")
    monkeypatch.setattr(tray_client, "debe_cerrarse", lambda *a: False)
    monkeypatch.setattr(tray_client, "open_web_ui", lambda: None)
    monkeypatch.setattr(tray_client.state, "cuenta", types.SimpleNamespace(tick=lambda p, r: None))
    monkeypatch.setattr(tray_client.state, "status", "starting")
    cuadro = [0]

    def datos():
        cuadro[0] += 1
        return {"sdkActive": True, "renderTime": cuadro[0], "game": 1, **raw()}

    def abrir():
        if raw is None:
            raise FileNotFoundError("sin juego")
    monkeypatch.setattr(telemetry_compat, "init", abrir)
    monkeypatch.setattr(telemetry_compat, "get_data", datos)
    monkeypatch.setattr(telemetry_compat, "opened_block", lambda: "prueba")

    async def correr():
        tarea = asyncio.create_task(tray_client.telemetry_loop(nube, lan))
        try:
            await mientras()
        finally:
            tarea.cancel()
            await asyncio.gather(tarea, return_exceptions=True)
    asyncio.run(correr())
    return nube, lan


async def hasta(condicion, segundos=5):
    limite = time.monotonic() + segundos
    while not condicion() and time.monotonic() < limite:
        await asyncio.sleep(0.01)
    assert condicion()


def test_cambiar_el_modo_sale_para_los_tableros(monkeypatch):
    """El estado se manda solo cuando algo cambia: el modo es una de esas cosas."""
    monkeypatch.setattr(tray_client.state.vtc, "actual", EMPRESA)
    vistos = []

    async def mientras():
        await asyncio.sleep(0.1)
        tray_client.state.vtc.actual = {**EMPRESA, "mode": "personal"}
        await asyncio.sleep(0.1)
        tray_client.state.vtc.actual = None
        await asyncio.sleep(0.1)
    nube, lan = bucle_de_telemetria(monkeypatch, mientras)
    for destino in (nube, lan):
        vistos = [m["vtc"] and m["vtc"]["mode"] for m in destino.estados()]
        assert vistos == ["vtc", "personal", None]


def test_al_tomar_un_trabajo_se_vuelve_a_mirar_la_empresa(monkeypatch):
    veces, trabajo = [], [False]
    monkeypatch.setattr(tray_client.state.vtc, "actual", EMPRESA)
    monkeypatch.setattr(tray_client.state.vtc, "despertar", lambda forzar=False: veces.append(forzar))

    async def mientras():
        await asyncio.sleep(0.1)
        assert veces == []
        trabajo[0] = True
        await hasta(lambda: veces)
        await asyncio.sleep(0.1)
        assert veces == [False]  # una vez, no en cada dato
        trabajo[0] = False
        await asyncio.sleep(0.1)
        assert veces == [False]  # al terminarlo no
        trabajo[0] = True
        await hasta(lambda: len(veces) == 2)
    bucle_de_telemetria(monkeypatch, mientras, lambda: {"onJob": trabajo[0], "cityDst": "Lyon"})


# ------------------------------------------------------------- la bandeja

@pytest.mark.skipif(tray_client.pystray is None, reason="sin bandeja")
def test_el_menu_de_la_bandeja(monkeypatch):
    i18n.set_language("en")
    item = tray_client.menu_vtc()
    monkeypatch.setattr(tray_client.state.vtc, "actual", None)
    assert not item.visible and item.text  # sin empresa no se ve, y armarlo no falla
    list(item.submenu.items)
    monkeypatch.setattr(tray_client.state.vtc, "actual", EMPRESA)
    assert item.visible and item.text == "Jobs for: [KL]"
    de_la_vtc, personal = item.submenu.items
    assert (de_la_vtc.text, de_la_vtc.checked, de_la_vtc.radio) == ("[KL] Kappa Logistics", True, True)
    assert (personal.text, personal.checked, personal.radio) == ("Personal", False, True)
    monkeypatch.setattr(tray_client.state.vtc, "actual", {**EMPRESA, "mode": "personal"})
    assert item.text == "Jobs for: Personal" and personal.checked and not de_la_vtc.checked
    modos = []
    monkeypatch.setattr(tray_client, "poner_modo_vtc_desde_el_menu", modos.append)
    de_la_vtc(None)
    personal(None)
    assert modos == ["vtc", "personal"]


def test_desde_la_bandeja_no_se_espera_a_la_api_y_si_falla_se_dice(monkeypatch):
    i18n.set_language("en")
    avisos, soltar, hecho = [], threading.Event(), threading.Event()
    monkeypatch.setattr(tray_client.state, "icon", types.SimpleNamespace(
        notify=lambda texto, titulo: (avisos.append(texto), hecho.set()), update_menu=lambda: None))
    monkeypatch.setattr(tray_client.state.vtc, "poner_modo", lambda m: soltar.wait(5) and False)
    tray_client.poner_modo_vtc_desde_el_menu("personal")
    assert avisos == []  # volvio enseguida
    soltar.set()
    assert hecho.wait(5) and avisos == [i18n.T("vtc_failed")]


def test_un_cambio_rehace_el_menu_y_sin_bandeja_no_pasa_nada(monkeypatch):
    veces = []
    monkeypatch.setattr(tray_client.state, "icon", types.SimpleNamespace(update_menu=lambda: veces.append(1)))
    tray_client.state.refresh_menu()
    assert veces == [1]
    monkeypatch.setattr(tray_client.state, "icon", types.SimpleNamespace(update_menu=lambda: 1 / 0))
    tray_client.state.refresh_menu()
    monkeypatch.setattr(tray_client.state, "icon", None)
    tray_client.state.refresh_menu()


def test_los_textos_estan_en_los_ocho_idiomas():
    claves = ("menu_vtc", "vtc_label", "vtc_personal", "vtc_hint", "vtc_failed")
    assert len(i18n._STRINGS) == 8
    for lang, textos in i18n._STRINGS.items():
        for clave in claves:
            assert textos.get(clave), (lang, clave)
        assert "{who}" in textos["menu_vtc"], lang
        if lang != "en":
            assert textos["vtc_hint"] != i18n._STRINGS["en"]["vtc_hint"], lang

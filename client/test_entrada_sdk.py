"""Los botones por el SDK de entrada del juego (entrada_sdk.py), contra un plugin
de mentira. Con el plugin de verdad los prueba tools/probar_entrada.py, desde
probar_plugin.py (la DLL) y probar_plugin_linux.py (el .so)."""

import mmap
import os
import re
import sys
import threading
import time

import pytest

import client
import entrada_sdk

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGIN = os.path.join(RAIZ, "plugin", "scs-telemetry")


def _leer(*partes):
    with open(os.path.join(PLUGIN, *partes), encoding="utf-8") as f:
        return f.read()


# ------------------------------------------------------ contra el plugin

def test_el_bloque_es_el_del_plugin():
    """Los campos de tdInputMap_t, uno detras de otro, en las posiciones de
    CAMPOS, y las mismas constantes."""
    hpp = _leer("inc", "truckdash_input.hpp")
    cuerpo = re.search(r"struct tdInputMap_t \{(.*?)\n\};", hpp, re.S).group(1)
    donde, campos = 0, {}
    for tipo, nombre in re.findall(r"^\s*(?:std::atomic<)?(uint32_t|uint64_t)>?\s+(\w+);", cuerpo, re.M):
        tamano = 8 if tipo == "uint64_t" else 4
        assert donde % tamano == 0, nombre
        campos[nombre] = (donde, tamano)
        donde += tamano
    assert campos.pop("padding")
    assert campos == {n: (d, f.size) for n, (d, f) in entrada_sdk.CAMPOS.items()}
    assert donde == entrada_sdk.TAMANO == 64

    def constante(nombre):
        return int(re.search(rf"#define {nombre} (\d+)", hpp).group(1))

    assert constante("TD_INPUT_REVISION") == entrada_sdk.REVISION
    assert constante("TD_INPUT_PRESSED") == entrada_sdk.APRETADO
    assert constante("TD_INPUT_ACCEPT_MS") == entrada_sdk.ACEPTA_MS
    nombres = re.findall(r'#define TD_INPUT_MMF_NAME L?"([^"]+)"', hpp)
    assert nombres[0].replace("\\\\", "\\") == entrada_sdk.NOMBRE
    assert nombres[2 if sys.platform != "darwin" else 1] == entrada_sdk.RUTA


def test_los_botones_son_los_que_declara_el_plugin():
    """Los mismos, en el mismo orden (se piden por indice), y son los mixes de
    la botonera. Ninguno mas: lo que se declara el juego lo toma por asignado,
    y con wipersback declarado el limpiaparabrisas no se apaga mas con su tecla
    (foro de SCS, t=328756). Y nada que guarde la partida."""
    cpp = _leer("src", "truckdash_input.cpp")
    tabla = re.search(r"kInputs\[\] = \{(.*?)\n\};", cpp, re.S).group(1)
    entradas = re.findall(r'\{"(\w+)", "([^"]+)", (\w+)\}', tabla)
    assert tuple(mix for mix, _, _ in entradas) == entrada_sdk.BOTONES
    assert set(entrada_sdk.BOTONES) == set(client.ACTION_TO_SCS_ACTION.values())
    assert {tipo for _, _, tipo in entradas} == {"SCS_VALUE_TYPE_bool"}
    # Lo que el SDK acepta en los nombres (scssdk_input_device.h): con otro
    # caracter el juego rechaza el dispositivo entero.
    for mix, titulo, _ in entradas:
        assert re.fullmatch(r"[a-z0-9_]+", mix)
        assert re.fullmatch(r"[A-Za-z0-9_ .]+", titulo)


def test_el_plugin_exporta_la_entrada():
    exportados = _leer("vs2012", "scs-telemetry.def")
    assert "scs_input_init=scs_input_init" in exportados
    assert "scs_input_shutdown=scs_input_shutdown" in exportados
    assert "truckdash_input.cpp" in _leer("vs2012", "scs-telemetry.vcxproj")


def test_la_tecla_no_puede_caer_junto_con_el_toque():
    """El cliente espera mas de lo que el plugin acepta un pedido, con margen
    para el paso del reloj de Windows (16 ms): al usar la tecla, el pedido ya
    esta vencido."""
    assert entrada_sdk.ESPERA_S * 1000 >= entrada_sdk.ACEPTA_MS + 100


# ------------------------------------------------------ contra uno de mentira

class PluginFalso:
    """El bloque, y un "juego" que cada vez que el cliente espera corre un
    cuadro. Nada de threads: el reloj tambien es de mentira."""

    def __init__(self, monkeypatch, **campos):
        self.buf = bytearray(entrada_sdk.TAMANO)
        self.bloque = entrada_sdk.Bloque(self.buf, lambda: None)
        self.ahora = 5_000_000.0  # ms
        self.abiertos = 0
        self.apretados = []
        self.toma = True            # el juego atiende los pedidos
        self.resultado = entrada_sdk.APRETADO
        self.pide_entrada = True    # el juego pide entrada en cada cuadro
        self.al_frente_activa = False
        self.llamados_al_frente = 0
        self.raw = None
        self.al_apretar = lambda mix: None
        self._visto = 0
        for campo, valor in {"revision": 1, "buttons": len(entrada_sdk.BOTONES), "active": 1,
                             "session": 77, **campos}.items():
            self.poner(campo, valor)
        monkeypatch.setattr(entrada_sdk, "ahora_ms", lambda: int(self.ahora))
        monkeypatch.setattr(entrada_sdk.time, "monotonic", lambda: self.ahora / 1000)
        monkeypatch.setattr(entrada_sdk.time, "sleep", self.dormir)
        self.cuadro()
        self.botones = entrada_sdk.Botones()
        self.botones.abrir = self.abrir
        self.botones.leer_raw = lambda: self.raw

    def poner(self, campo, valor):
        donde, formato = entrada_sdk.CAMPOS[campo]
        formato.pack_into(self.buf, donde, valor)

    def ver(self, campo):
        donde, formato = entrada_sdk.CAMPOS[campo]
        return formato.unpack_from(self.buf, donde)[0]

    def abrir(self):
        self.abiertos += 1
        return entrada_sdk.Bloque(self.buf, self.cerrado)

    def cerrado(self):
        self.abiertos -= 1

    def dormir(self, segundos):
        self.ahora += segundos * 1000
        self.cuadro()

    def cuadro(self):
        if not self.pide_entrada:
            return
        self.poner("active", 1)
        self.poner("tick", int(self.ahora))
        ident = self.ver("requestEnd")
        if not self.toma or ident == 0 or ident == self._visto or self.ver("request") != ident:
            return
        self._visto = ident
        if self.resultado == entrada_sdk.APRETADO:
            mix = entrada_sdk.BOTONES[self.ver("button")]
            self.apretados.append(mix)
            self.al_apretar(mix)
        self.poner("result", self.resultado)
        self.poner("done", ident)

    def al_frente(self):
        self.llamados_al_frente += 1
        if self.al_frente_activa:
            self.pide_entrada = True
        return True

    def apretar(self, mix):
        return self.botones.apretar(mix, self.al_frente)


@pytest.fixture
def plugin(monkeypatch):
    p = PluginFalso(monkeypatch)
    yield p
    assert p.abiertos == 0  # cada toque cierra el bloque que abrio


def sin_foco(plugin):
    plugin.pide_entrada = False
    plugin.poner("active", 0)


def test_con_el_juego_al_frente_lo_aprieta_sin_tocar_el_foco(plugin):
    assert plugin.apretar("beacon")
    assert plugin.apretar("wipers")
    assert plugin.apretar("wipers")
    assert plugin.apretados == ["beacon", "wipers", "wipers"]
    assert plugin.llamados_al_frente == 0


def test_sin_bloque_o_de_otra_revision_van_las_teclas(plugin):
    plugin.botones.abrir = lambda: None  # el juego cerrado, o un plugin de antes
    assert not plugin.apretar("light")
    plugin.botones.abrir = plugin.abrir
    for revision in (0, 2):  # apagado (o el juego cerrado bien), o de un plugin mas nuevo
        plugin.poner("revision", revision)
        assert not plugin.apretar("light")
    assert plugin.apretados == [] and plugin.llamados_al_frente == 0


def test_un_plugin_con_menos_botones(plugin):
    plugin.poner("buttons", 12)  # el ultimo de la lista todavia no lo tenia
    assert not plugin.apretar("wipers")
    assert plugin.apretar("liftaxle")
    assert plugin.apretados == ["liftaxle"]


def test_lo_que_no_es_un_boton_ni_abre_el_bloque(plugin):
    plugin.botones.abrir = lambda: pytest.fail("abrio el bloque")
    for mix in (None, "quicksave", "wipersback"):
        assert not plugin.apretar(mix)


def test_con_el_juego_atras_lo_trae_al_frente_y_lo_aprieta(plugin):
    """Sin foco el juego no pide entrada (issue 642 de ETS2LA)."""
    sin_foco(plugin)
    plugin.al_frente_activa = True
    assert plugin.apretar("infotainment")
    assert plugin.apretados == ["infotainment"] and plugin.llamados_al_frente == 1


def test_sin_ventana_del_juego_van_las_teclas(plugin):
    sin_foco(plugin)
    antes = plugin.ahora
    for _ in range(3):
        assert not plugin.botones.apretar("light", lambda: False)
    assert plugin.apretados == [] and plugin.ahora == antes


def test_si_no_vuelve_a_pedir_entrada_van_las_teclas_y_no_se_insiste(plugin):
    """Al segundo que no, derecho a la tecla: si no, cada toque tardaba lo que
    se espera. Si el juego vuelve a pedirla, se usa otra vez."""
    sin_foco(plugin)
    antes = plugin.ahora
    assert not plugin.apretar("light")
    assert plugin.ahora - antes <= entrada_sdk.ACTIVAR_S * 1000 + 50
    assert not plugin.apretar("light")
    assert plugin.llamados_al_frente == 2
    antes = plugin.ahora
    assert not plugin.apretar("light")
    assert plugin.llamados_al_frente == 2 and plugin.ahora == antes
    assert plugin.apretados == []
    plugin.pide_entrada = True
    plugin.cuadro()
    assert plugin.apretar("light")
    sin_foco(plugin)
    plugin.al_frente_activa = True
    assert plugin.apretar("light")
    assert plugin.apretados == ["light", "light"]


def test_si_dice_activo_pero_hace_rato_que_no_pide_nada(plugin):
    """El juego cargando o colgado no avisa que el dispositivo se apago."""
    plugin.pide_entrada = False
    plugin.ahora += entrada_sdk.QUIETO_MS + 50
    assert entrada_sdk.estado(plugin.bloque) == entrada_sdk.QUIETO
    assert not plugin.apretar("light")


def test_un_pedido_que_no_se_toma_se_retira(plugin):
    assert plugin.apretar("engine")  # en el bloque queda que ese si se apreto
    plugin.apretados.clear()
    plugin.toma = False
    antes = plugin.ahora
    assert not plugin.apretar("light")
    assert plugin.ver("requestEnd") == 0
    # Ya vencido para el plugin: la tecla no cae junto con el toque.
    assert plugin.ahora - antes >= entrada_sdk.ACEPTA_MS + 100
    plugin.toma = True
    plugin.dormir(0.05)
    assert plugin.apretados == []
    assert plugin.apretar("light")  # el siguiente anda
    assert plugin.apretados == ["light"]


def test_un_pedido_vencido_no_cuenta_como_apretado(plugin):
    plugin.resultado = 2  # TD_INPUT_EXPIRED
    assert not plugin.apretar("light")


def test_el_pedido_se_escribe_con_el_final_al_final(plugin, monkeypatch):
    """Hasta que requestEnd no dice lo mismo que request, el plugin no lo mira:
    si fuera primero, podia apretar el boton del pedido anterior."""
    escritos = []
    original = entrada_sdk.Bloque.escribir
    monkeypatch.setattr(entrada_sdk.Bloque, "escribir",
                        lambda self, campo, valor: (escritos.append(campo), original(self, campo, valor))[1])
    assert plugin.apretar("light")
    assert escritos == ["button", "requestTick", "request", "requestEnd"]
    assert plugin.ver("requestTick") <= plugin.ahora


def test_el_numero_de_pedido_cambia_siempre_y_nunca_es_cero(plugin):
    plugin.poner("request", 0xFFFFFFFE)
    assert plugin.apretar("light") and plugin.ver("request") == 0xFFFFFFFF
    assert plugin.apretar("light") and plugin.ver("request") == 1


# ------------------------------------------------------ que el juego haga caso

def con_telemetria(plugin, **mas):
    plugin.raw = {"sdkActive": True, "paused": False, "electricEnabled": True, "lightsHazards": False,
                  "lightsParking": False, "lightsBeamLow": False, "parkBrake": True, **mas}


def test_dos_toques_que_no_hacen_nada_y_sigue_con_las_teclas(plugin):
    """El juego toma la entrada y no la usa (TruckersMP la puede bloquear): sin
    esto los botones quedaban muertos."""
    con_telemetria(plugin)
    assert not plugin.apretar("flasher4way")
    assert not plugin.apretar("light")
    assert plugin.apretados == ["flasher4way", "light"]
    for mix in entrada_sdk.BOTONES:
        assert not plugin.apretar(mix)
    assert len(plugin.apretados) == 2
    plugin.poner("session", 78)  # el juego se abrio otra vez
    plugin.al_apretar = lambda mix: plugin.raw.update(lightsHazards=not plugin.raw["lightsHazards"])
    assert plugin.apretar("flasher4way")


def test_cuando_uno_hizo_efecto_no_se_mira_mas(plugin):
    con_telemetria(plugin)
    plugin.al_apretar = lambda mix: plugin.raw.update(lightsHazards=True)
    antes = plugin.ahora
    assert plugin.apretar("flasher4way")
    assert plugin.ahora - antes < 300  # no espera de mas si ya se nota
    plugin.al_apretar = lambda mix: None
    plugin.botones.leer_raw = lambda: pytest.fail("volvio a mirar la telemetria")
    for _ in range(3):
        assert plugin.apretar("flasher4way")


def test_las_luces_se_notan_en_cualquier_paso_del_ciclo(plugin):
    """Apagadas, de posicion, bajas, apagadas: cada paso cambia uno de los dos."""
    con_telemetria(plugin, lightsParking=True, lightsBeamLow=True)
    plugin.al_apretar = lambda mix: plugin.raw.update(lightsParking=False, lightsBeamLow=False)
    assert plugin.apretar("light")
    otra = dict(plugin.raw, lightsParking=True)
    plugin.poner("session", 78)
    plugin.al_apretar = lambda mix: plugin.raw.update(otra)
    assert plugin.apretar("light")


@pytest.mark.parametrize("raw", [
    None, {"sdkActive": False}, {"paused": True}, {"electricEnabled": False},
    {"airPressureWarning": True}, {"airPressureEmergency": True},
])
def test_si_no_se_puede_saber_vale(plugin, raw):
    """Sin telemetria, en pausa, sin contacto o sin aire no se puede decir que
    el juego no hizo caso: no se manda tambien la tecla."""
    con_telemetria(plugin, **(raw or {}))
    if raw is None:
        plugin.raw = None
    for _ in range(4):
        assert plugin.apretar("parkingbrake")
    assert len(plugin.apretados) == 4


def test_si_se_pausa_justo_despues_vale(plugin):
    con_telemetria(plugin)
    plugin.al_apretar = lambda mix: plugin.raw.update(paused=True)
    for _ in range(3):
        assert plugin.apretar("flasher4way")
        plugin.raw["paused"] = False
    # Y no es que haya hecho caso: sin pausa se sigue mirando.
    plugin.al_apretar = lambda mix: None
    assert not plugin.apretar("flasher4way")


def test_los_demas_botones_no_dicen_nada_del_juego(plugin):
    """El motor tarda, la baliza puede no estar, el crucero pide velocidad: que
    no cambie nada no es que el juego no haga caso, y la tecla de respaldo lo
    apretaria dos veces."""
    con_telemetria(plugin)
    for mix in set(entrada_sdk.BOTONES) - {"flasher4way", "light", "parkingbrake"}:
        for _ in range(3):
            assert plugin.apretar(mix)
    assert len(plugin.apretados) == 30


# ------------------------------------------------------ varios a la vez, errores

def test_si_algo_se_rompe_van_las_teclas(plugin, monkeypatch):
    monkeypatch.setattr(entrada_sdk, "pedir", lambda *a: 1 / 0)
    assert not plugin.apretar("light")


def test_de_a_uno_por_vez(monkeypatch):
    """Un toque del relay y uno de la red local llegan en dos threads: si los
    dos escribieran su pedido a la vez, uno pisaba al otro."""
    adentro, maximo = [0], [0]

    def pedir(bloque, boton):
        adentro[0] += 1
        maximo[0] = max(maximo[0], adentro[0])
        time.sleep(0.02)
        adentro[0] -= 1
        return True

    buf = bytearray(entrada_sdk.TAMANO)
    bloque = entrada_sdk.Bloque(buf, lambda: None)
    for campo, valor in (("revision", 1), ("buttons", 13), ("active", 1), ("tick", entrada_sdk.ahora_ms())):
        bloque.escribir(campo, valor)
    monkeypatch.setattr(entrada_sdk, "pedir", pedir)
    botones = entrada_sdk.Botones()
    botones.abrir = lambda: entrada_sdk.Bloque(buf, lambda: None)
    hilos = [threading.Thread(target=botones.apretar, args=("engine", lambda: True)) for _ in range(5)]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join()
    assert maximo[0] == 1


def test_abre_el_bloque_de_verdad(monkeypatch, tmp_path):
    """El que crea el plugin: con nombre en Windows, un archivo en Linux. Y lo
    que se escribe le llega."""
    if sys.platform == "win32":
        nombre = f"Local\\TruckDashInputPrueba{os.getpid()}"
        monkeypatch.setattr(entrada_sdk, "NOMBRE", nombre)
        assert entrada_sdk.abrir() is None
        del_plugin = mmap.mmap(-1, entrada_sdk.TAMANO, tagname=nombre)
    else:
        ruta = str(tmp_path / "TruckDashInput")
        monkeypatch.setattr(entrada_sdk, "RUTA", ruta)
        assert entrada_sdk.abrir() is None
        with open(ruta, "w+b") as f:
            f.truncate(entrada_sdk.TAMANO)
            del_plugin = mmap.mmap(f.fileno(), entrada_sdk.TAMANO)
    bloque = entrada_sdk.abrir()
    assert entrada_sdk.estado(bloque) == entrada_sdk.SIN_PLUGIN  # todavia en cero
    bloque.escribir("requestTick", 0x1122334455667788)
    bloque.escribir("button", 12)
    bloque.cerrar()
    assert del_plugin[48:56] == (0x1122334455667788).to_bytes(8, sys.byteorder)
    assert del_plugin[40:44] == (12).to_bytes(4, sys.byteorder)
    del_plugin.close()


# ------------------------------------------------------ send_game_command

@pytest.fixture
def teclas(monkeypatch):
    apretadas = []
    monkeypatch.setattr(client, "find_game_window", lambda: 12345)
    monkeypatch.setattr(client, "bring_window_to_foreground", lambda hwnd: apretadas.append("frente"))
    monkeypatch.setattr(client.keys_compat, "press", apretadas.append)
    return apretadas


def test_send_game_command_va_por_el_sdk_aunque_no_haya_tecla(monkeypatch, teclas):
    pedidos = []
    monkeypatch.setattr(client.botones_sdk, "apretar", lambda mix, al_frente: pedidos.append(mix) or True)
    for accion in client.DEFAULT_KEYBINDS:
        assert client.send_game_command(accion, {}) == "ok"
    assert pedidos == list(client.ACTION_TO_SCS_ACTION.values())
    assert teclas == []


def test_send_game_command_sin_el_sdk_manda_la_tecla(monkeypatch, teclas):
    monkeypatch.setattr(client.botones_sdk, "apretar", lambda mix, al_frente: False)
    assert client.send_game_command("toggle_hazards", {"toggle_hazards": "f"}) == "ok"
    assert teclas == ["frente", "f"]
    assert client.send_game_command("toggle_hazards", {}) == "no_key"


def test_los_botones_custom_siguen_siendo_teclas(monkeypatch, teclas):
    monkeypatch.setattr(client.botones_sdk, "apretar", lambda *a: pytest.fail("paso por el SDK"))
    monkeypatch.setattr(client.keys_compat, "key_down", teclas.append)
    monkeypatch.setattr(client.keys_compat, "key_up", lambda tecla: None)
    assert client.send_custom_key("ctrl+e") == "ok"
    assert teclas == ["frente", "ctrl", "e"]


def test_traer_el_juego_al_frente(monkeypatch, teclas):
    assert client.traer_juego_al_frente() is True
    assert teclas == ["frente"]
    monkeypatch.setattr(client, "find_game_window", lambda: None)
    assert client.traer_juego_al_frente() is False
    assert teclas == ["frente"]

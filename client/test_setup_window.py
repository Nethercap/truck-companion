"""Tests de la ventana de Setup.

Existen por un bug concreto: `add_game_folder` usaba `self.installs`, que no
existe en SetupWindow, asi que agregar una carpeta tiraba AttributeError. En
un build empaquetado no hay consola, Tk se come la excepcion del callback y el
boton simplemente no hacia nada, sin ningun sintoma. Un test que aprieta los
botones es lo unico que lo agarra.

Necesitan una pantalla: se saltean solos donde no la hay (CI en Linux).
"""

import os

import pytest

import plugin_installer
import tray_client

tk = pytest.importorskip("tkinter")


@pytest.fixture(scope="module")
def raiz():
    """Un unico root de Tk para todo el modulo.

    Crear y destruir un Tk por test termina rompiendo Tcl a la septima
    ventana ("Tcl wasn't installed properly"), y el fallo se disfraza de
    skip. Con un root compartido, cada test usa un Toplevel.
    """
    try:
        r = tk.Tk()
    except tk.TclError:
        pytest.skip("sin pantalla")
    r.withdraw()
    yield r
    r.destroy()


@pytest.fixture
def ventana(monkeypatch, tmp_path, raiz):
    monkeypatch.setattr(tk, "Tk", lambda: tk.Toplevel(raiz))
    # Sin esto cada consulta de vinculacion tarda tres segundos de verdad.
    monkeypatch.setattr(tray_client, "PAUSA_APROBACION", 0.05)

    # Los settings van a un archivo temporal, no a los del usuario.
    guardados = {}
    monkeypatch.setattr(tray_client.win_integration, "load_settings",
                        lambda: dict(guardados))
    monkeypatch.setattr(tray_client.win_integration, "save_settings",
                        lambda s: guardados.update(s) or guardados.clear() or guardados.update(s))

    def _save(s):
        guardados.clear()
        guardados.update(s)
    monkeypatch.setattr(tray_client.win_integration, "save_settings", _save)

    monkeypatch.setattr(plugin_installer, "find_game_installs", lambda: [])
    v = tray_client.SetupWindow()
    # La seccion de cuenta esta apagada hasta que el cliente mande viajes,
    # asi que las pruebas la construyen a mano: lo que se prueba es que
    # funcione cuando se encienda, no que este visible hoy.
    v.build_account_section()
    # Cada test arranca con la lista compartida vacia.
    tray_client.state.installs = []
    yield v, guardados
    try:
        v.root.destroy()
    except Exception:
        pass


def _install(tmp_path, nombre, carpeta, exe="amtrucks.exe"):
    bin_dir = tmp_path / carpeta / "bin" / "win_x64"
    bin_dir.mkdir(parents=True)
    (bin_dir / exe).write_bytes(b"MZ")
    return str(bin_dir)


def test_agregar_una_carpeta_la_guarda(ventana, monkeypatch, tmp_path):
    """El bug original: esto tiraba AttributeError y el boton no hacia nada."""
    v, guardados = ventana
    carpeta = _install(tmp_path, "ATS", "American Truck Simulator")
    monkeypatch.setattr(tray_client.filedialog, "askdirectory", lambda **kw: carpeta)

    v.add_game_folder()

    assert guardados.get("extra_game_dirs") == [os.path.normpath(carpeta)]
    assert any(i["bin_dir"] == os.path.normpath(carpeta) for i in tray_client.state.installs)


def test_agregar_la_misma_carpeta_dos_veces_no_la_duplica(ventana, monkeypatch, tmp_path):
    v, guardados = ventana
    carpeta = _install(tmp_path, "ATS", "American Truck Simulator")
    monkeypatch.setattr(tray_client.filedialog, "askdirectory", lambda **kw: carpeta)
    v.add_game_folder()
    # La segunda vez, elegida desde la carpeta del juego en vez de bin/win_x64.
    padre = os.path.dirname(os.path.dirname(carpeta))
    monkeypatch.setattr(tray_client.filedialog, "askdirectory", lambda **kw: padre)
    v.add_game_folder()
    assert len(guardados.get("extra_game_dirs", [])) == 1
    assert len(tray_client.state.installs) == 1


def test_no_se_agrega_una_que_steam_ya_encuentra(ventana, monkeypatch, tmp_path):
    v, guardados = ventana
    carpeta = _install(tmp_path, "ATS", "American Truck Simulator")
    monkeypatch.setattr(plugin_installer, "find_game_installs",
                        lambda: [plugin_installer.describe_install("ats", carpeta)])
    v.render_installs()
    monkeypatch.setattr(tray_client.filedialog, "askdirectory", lambda **kw: carpeta)
    v.add_game_folder()
    assert guardados.get("extra_game_dirs", []) == []
    assert len(tray_client.state.installs) == 1


def test_quitar_una_carpeta_agregada_a_mano(ventana, monkeypatch, tmp_path):
    """La salida para una entrada que sobra: sin esto no habia forma de
    sacarla desde la aplicacion."""
    v, guardados = ventana
    carpeta = _install(tmp_path, "ATS", "American Truck Simulator")
    monkeypatch.setattr(tray_client.filedialog, "askdirectory", lambda **kw: carpeta)
    v.add_game_folder()
    assert len(tray_client.state.installs) == 1

    entrada = [i for i in tray_client.state.installs if i["origen"] == "manual"][0]
    v.remove_game_folder(entrada)
    assert guardados.get("extra_game_dirs") == []
    assert tray_client.state.installs == []


def test_una_de_steam_no_ofrece_quitarla(ventana, monkeypatch, tmp_path):
    """Quitarla no serviria de nada: el proximo re-scan la vuelve a traer."""
    v, guardados = ventana
    carpeta = _install(tmp_path, "ATS", "American Truck Simulator")
    monkeypatch.setattr(plugin_installer, "find_game_installs",
                        lambda: [plugin_installer.describe_install("ats", carpeta)])
    v.render_installs()
    assert tray_client.state.installs[0]["origen"] == "steam"
    textos = _textos(v.games_body)
    assert tray_client.T("remove_folder") not in textos


def test_con_dos_copias_del_mismo_juego_se_muestra_la_carpeta(ventana, monkeypatch, tmp_path):
    """Es el reporte: varias filas identicas que no se pueden distinguir."""
    v, _ = ventana
    a = _install(tmp_path, "ATS", "A/American Truck Simulator")
    b = _install(tmp_path, "ATS", "B/American Truck Simulator")
    monkeypatch.setattr(plugin_installer, "find_game_installs",
                        lambda: [plugin_installer.describe_install("ats", a),
                                 plugin_installer.describe_install("ats", b)])
    v.render_installs()
    textos = _textos(v.games_body)
    assert a in textos and b in textos


def test_con_el_plugin_de_otra_app_no_dice_sin_plugin(ventana, monkeypatch, tmp_path):
    """Solo el scs-telemetry.dll (de Trucky, de un cliente viejo): hay
    telemetria, asi que ni "sin plugin" ni el aviso de la bandeja. Se ofrece
    sumar el nuestro al lado."""
    v, _ = ventana
    a = _install(tmp_path, "ATS", "American Truck Simulator")
    os.makedirs(os.path.join(a, "plugins"))
    with open(os.path.join(a, "plugins", "scs-telemetry.dll"), "wb") as f:
        f.write(b"MZ de otra app")
    monkeypatch.setattr(plugin_installer, "find_game_installs",
                        lambda: [plugin_installer.describe_install("ats", a)])
    v.render_installs()
    textos = _textos(v.games_body)
    assert tray_client.T("plugin_not_installed") not in textos
    assert tray_client.T("plugin_other_version") in textos
    assert tray_client.T("install_plugin") in textos
    assert tray_client.state.any_plugin_installed()


def test_con_un_solo_juego_no_se_ensucia_con_la_ruta(ventana, monkeypatch, tmp_path):
    """La carpeta solo aporta cuando hay ambiguedad; si no, es ruido."""
    v, _ = ventana
    a = _install(tmp_path, "ATS", "American Truck Simulator")
    monkeypatch.setattr(plugin_installer, "find_game_installs",
                        lambda: [plugin_installer.describe_install("ats", a)])
    v.render_installs()
    textos = _textos(v.games_body)
    assert a not in textos


def _todos_los_hijos(widget):
    for hijo in widget.winfo_children():
        yield hijo
        yield from _todos_los_hijos(hijo)


def _textos(widget):
    """El texto de cada widget que tenga. Los Frame no tienen -text."""
    salida = []
    for w in _todos_los_hijos(widget):
        try:
            salida.append(w.cget("text"))
        except tk.TclError:
            pass
    return salida


def test_la_opcion_de_cerrar_con_el_juego_se_guarda(ventana, monkeypatch):
    """El default depende de si corre bajo Proton, pero destildarla tiene que
    quedar guardado igual."""
    v, guardados = ventana
    v.quit_var.set(False)
    v.toggle_quit_on_game_close()
    assert guardados.get("quit_on_game_close") is False
    v.quit_var.set(True)
    v.toggle_quit_on_game_close()
    assert guardados.get("quit_on_game_close") is True


def test_apagar_cierra_discord_y_el_icono(monkeypatch):
    """Se llama desde el hilo de asyncio cuando se cierra el juego, y tiene
    que funcionar igual sin bandeja (Linux sin GTK)."""
    llamadas = []
    monkeypatch.setattr(tray_client.state.discord, "close",
                        lambda: llamadas.append("discord"))
    monkeypatch.setattr(tray_client.win_integration, "stop_and_exit",
                        lambda cb=None: llamadas.append(("salir", cb is not None)))

    class Icono:
        def stop(self):
            llamadas.append("icono")

    monkeypatch.setattr(tray_client.state, "icon", Icono())
    tray_client.apagar()
    assert llamadas == ["discord", ("salir", True)]

    # Sin bandeja tambien tiene que salir.
    llamadas.clear()
    monkeypatch.setattr(tray_client.state, "icon", None)
    tray_client.apagar()
    assert llamadas == ["discord", ("salir", False)]


# ------------------------------------------------------------------ cuenta
# La API no se toca nunca en las pruebas: se reemplaza account entero. Lo que
# se prueba es la ventana, no que urllib sepa hablar.

def test_sin_cuenta_la_ventana_invita_a_vincular(ventana, monkeypatch):
    v, _ = ventana
    v.refresh_account()
    assert v.account_label.cget("text") == tray_client.T("account_none")
    assert v.account_button.cget("text") == tray_client.T("account_link")


def test_vincular_muestra_el_codigo_y_lo_guarda_cuando_lo_aprueban(ventana, monkeypatch):
    """El codigo tiene que verse: es lo unico que la persona tiene que
    copiar a la web."""
    v, guardados = ventana
    monkeypatch.setattr(tray_client.account, "pedir_codigo",
                        lambda nombre, s=None: {"code": "ACDE-3456", "secret": "s3cr3t",
                                                "expires_in": 600,
                                                "url": "https://trucksim-dash.com/account/"})
    # Que no abra el navegador de verdad en medio de la prueba.
    monkeypatch.setattr(tray_client.win_integration, "open_in_browser", lambda *a, **k: True)
    monkeypatch.setattr(tray_client.account, "consultar_codigo",
                        lambda secret, s=None: ("listo", "token-de-prueba"))

    v.link_account()
    _esperar(v, lambda: guardados.get("account_token"))
    assert guardados["account_token"] == "token-de-prueba"
    assert v.account_code.cget("text") == ""  # se limpia al terminar


def test_un_corte_de_internet_no_cancela_la_espera(ventana, monkeypatch):
    """Sin esto, un parpadeo del wifi haria abandonar la vinculacion justo
    cuando la persona esta yendo al navegador."""
    v, guardados = ventana
    monkeypatch.setattr(tray_client.account, "pedir_codigo",
                        lambda nombre, s=None: {"code": "ACDE-3456", "secret": "s",
                                                "expires_in": 600, "url": "http://x/"})
    monkeypatch.setattr(tray_client.win_integration, "open_in_browser", lambda *a, **k: True)

    respuestas = [("sin_red", None), ("pendiente", None), ("listo", "tok")]
    monkeypatch.setattr(tray_client.account, "consultar_codigo",
                        lambda secret, s=None: respuestas.pop(0) if respuestas else ("vencido", None))
    v.link_account()
    _esperar(v, lambda: guardados.get("account_token"), segundos=20)
    assert guardados["account_token"] == "tok"


def test_con_cuenta_muestra_el_nombre_y_ofrece_desvincular(ventana, monkeypatch):
    v, guardados = ventana
    guardados["account_token"] = "tok"
    monkeypatch.setattr(tray_client.account, "quien_soy",
                        lambda token, s=None: {"username": "Netherman"})
    v.refresh_account()
    _esperar(v, lambda: "Netherman" in v.account_label.cget("text"))
    assert v.account_button.cget("text") == tray_client.T("account_unlink")


def test_si_la_api_no_responde_no_se_borra_el_token(ventana, monkeypatch):
    """Un corte de internet no es una sesion cerrada. Borrarlo obligaria a
    vincular de nuevo cada vez que se cae el wifi."""
    v, guardados = ventana
    guardados["account_token"] = "tok"
    monkeypatch.setattr(tray_client.account, "quien_soy", lambda token, s=None: None)
    v.refresh_account()
    _esperar(v, lambda: v.account_label.cget("text") == tray_client.T("account_unreachable"))
    assert guardados["account_token"] == "tok"


def test_desvincular_saca_el_token_de_esta_pc(ventana, monkeypatch):
    v, guardados = ventana
    guardados["account_token"] = "tok"
    monkeypatch.setattr(tray_client.account, "quien_soy",
                        lambda token, s=None: {"username": "Netherman"})
    v.link_account()  # con token guardado, el boton desvincula
    assert "account_token" not in guardados


def _esperar(v, condicion, segundos=10):
    """Deja correr el loop de Tk hasta que se cumpla algo. Los callbacks de
    los hilos entran por root.after, asi que sin esto no llegan nunca."""
    import time
    limite = time.time() + segundos
    while time.time() < limite:
        v.root.update()
        if condicion():
            return
        time.sleep(0.05)
    raise AssertionError("no se cumplio a tiempo")


# --------------------------------------------- cierre automatico (Proton)
# Regresion de 1.5.15: el cliente se cerraba con el juego abierto. Reportado
# en Linux, donde pegaba siempre bajo gamescope.

def test_no_se_cierra_si_el_juego_nunca_estuvo_abierto():
    """Quien lo deja en el inicio de Windows lo tiene corriendo antes que el
    juego. Cerrarse al minuto seria apagarse antes de que nadie juegue."""
    assert tray_client.debe_cerrarse(False, True, 0, 10_000) is False


def test_no_se_cierra_si_la_opcion_esta_apagada():
    assert tray_client.debe_cerrarse(True, False, 0, 10_000) is False


def test_no_se_cierra_mientras_la_memoria_compartida_esta():
    """Es el bug reportado. Mientras el plugin siga publicando, el juego
    esta abierto, aunque sdkActive este en falso por estar en un menu o en
    una estacion de servicio, y aunque no se encuentre la ventana."""
    assert tray_client.debe_cerrarse(True, True, None, 10_000) is False


def test_no_se_cierra_por_una_ausencia_corta():
    """La memoria aparece y desaparece entre cargas de partida."""
    ahora = 10_000
    assert tray_client.debe_cerrarse(True, True, ahora - 5, ahora) is False
    assert tray_client.debe_cerrarse(True, True, ahora - tray_client.GRACIA_CIERRE + 1,
                                     ahora) is False


def test_se_cierra_cuando_la_memoria_falta_hace_rato():
    ahora = 10_000
    assert tray_client.debe_cerrarse(True, True, ahora - tray_client.GRACIA_CIERRE - 1,
                                     ahora) is True


def test_el_cierre_se_decide_donde_la_evidencia_es_buena():
    """La regresion no fue la regla sino DONDE estaba: colgada de sdkActive y
    de encontrar la ventana, que solo dicen "no hay frame ahora mismo". Esta
    prueba fija que la decision viva en la rama donde init() fallo, o sea
    donde la memoria compartida no esta."""
    import inspect
    fuente = inspect.getsource(tray_client.telemetry_loop)
    antes_de_sdkactive = fuente.split('if raw.get("sdkActive")')[0]
    despues = fuente.split('if raw.get("sdkActive")')[1]
    assert "apagar()" in antes_de_sdkactive, "el cierre salio de la rama de init()"
    assert "apagar()" not in despues, "el cierre volvio a la rama de sdkActive"


def test_el_tablero_no_se_abre_solo_si_la_opcion_esta_apagada(monkeypatch):
    """Quien abre el tablero en el celular no quiere una ventana abriendose
    en la maquina donde juega. En Linux con gamescope ademas le roba el foco
    al juego, que deja de recibir teclas hasta que hace clic de vuelta
    (issue #6)."""
    abiertos = []
    monkeypatch.setattr(tray_client.win_integration, "open_in_browser", lambda url: abiertos.append(url) or True)
    monkeypatch.setattr(tray_client.state, "code", "ABCD-1234")
    monkeypatch.setattr(tray_client.state, "backend_url", "https://ejemplo")
    monkeypatch.setattr(tray_client, "_browser_opened", False)

    ajustes = {"open_dashboard": False}
    monkeypatch.setattr(tray_client.win_integration, "load_settings", lambda: dict(ajustes))
    tray_client.open_web_ui()
    assert abiertos == []

    # Sin la clave, el default sigue siendo abrirlo: la opcion es para
    # apagarlo, no para que haya que prenderlo.
    ajustes.clear()
    tray_client.open_web_ui()
    assert len(abiertos) == 1


# ------------------------------------------------------ instalado con winget

def test_con_winget_el_aviso_da_el_comando_en_vez_de_actualizar(monkeypatch, tmp_path, raiz):
    """El boton de siempre pisaria el .exe y winget despues no deja ni
    actualizar ni desinstalar. Con winget, el boton copia el comando."""
    monkeypatch.setattr(tk, "Tk", lambda: tk.Toplevel(raiz))
    monkeypatch.setattr(tray_client.win_integration, "installed_by_winget", lambda path=None: True)
    monkeypatch.setattr(tray_client.win_integration, "load_settings", lambda: {})
    monkeypatch.setattr(plugin_installer, "find_game_installs", lambda: [])
    monkeypatch.setattr(tray_client.state, "update_available", ("9.9.9", "https://x/y.zip", None))
    v = tray_client.SetupWindow()
    try:
        v.root.update()
        assert "winget upgrade Nethercap.TruckDash" in v.update_label.cget("text")
        assert v.update_button.cget("text") == tray_client.T("copy")
        monkeypatch.setattr(v, "do_update", lambda: pytest.fail("no deberia actualizar"))
        v.update_button.invoke()
        assert v.root.clipboard_get() == "winget upgrade Nethercap.TruckDash"
    finally:
        v.root.destroy()


# ------------------------------------------------------- estado en el log
# Un log de usuario no decia si el tablero llego a estar en vivo ni con que
# vehiculo, justo cuando ATS 1.61 agrego autos manejables.

def test_el_log_anota_cada_cambio_de_estado_y_de_vehiculo(caplog):
    import logging
    s = tray_client.AppState()
    with caplog.at_level(logging.INFO):
        s.set_status("live", "ats", "Peterbilt 389")
        s.set_status("live", "ats", "Peterbilt 389")  # mismo frame: nada
        s.set_status("live", "ats", "Ford Bronco")    # cambio de vehiculo
        s.set_status("waiting_truck")
    lineas = [r.getMessage() for r in caplog.records if r.getMessage().startswith("Status:")]
    assert lineas == [
        "Status: live (ats, Peterbilt 389)",
        "Status: live (ats, Ford Bronco)",
        "Status: waiting_truck",
    ]


def test_cambiar_de_vehiculo_no_cuenta_como_cambio_de_estado():
    """El valor que devuelve decide abrir el navegador al entrar en vivo:
    pasar del camion al auto no lo tiene que abrir otra vez."""
    s = tray_client.AppState()
    assert s.set_status("live", "ats", "Peterbilt 389") is True
    assert s.set_status("live", "ats", "Ford Bronco") is False


# ------------------------------------------- texto del icono de la bandeja
# Regresion de 1.5.20: en castellano "plugin_missing" + "Conectado" medía 129
# caracteres, pystray tiraba ValueError y el bucle de telemetria moria sin
# dejar rastro. El cliente abierto antes que el juego no lo leia nunca.

class _IconoDeWindows:
    """Hace lo mismo que pystray en Windows: el titulo va a un WCHAR[128]."""
    def __init__(self):
        self._title = ""

    @property
    def title(self):
        return self._title

    @title.setter
    def title(self, valor):
        try:
            from pystray._util import win32
        except Exception:
            win32 = None
        if win32 is not None:
            win32.NOTIFYICONDATAW(szTip=valor)  # ValueError si no entra
        elif len(valor) > 128:
            raise ValueError(f"string too long ({len(valor)}, maximum length 128)")
        self._title = valor


def test_el_texto_del_icono_entra_en_todos_los_idiomas_y_estados(monkeypatch):
    import i18n
    s = tray_client.AppState()
    s.icon = _IconoDeWindows()
    s.code = "FIBR765O"
    for lang in i18n._STRINGS:
        monkeypatch.setattr(i18n, "LANG", lang)
        for cloud in tray_client.CLOUD_KEYS:
            s.set_cloud(cloud)
            for status in tray_client.STATUS_KEYS:
                s.set_status(status, "ets2")
                assert len(s.icon.title) <= tray_client.TITULO_MAX


def test_el_texto_recortado_lo_dice():
    largo = "x" * 200
    recortado = tray_client.recortar_titulo(largo)
    assert len(recortado) == tray_client.TITULO_MAX and recortado.endswith("...")
    assert tray_client.recortar_titulo("corto") == "corto"


def test_una_tarea_de_fondo_que_muere_queda_en_el_log(caplog):
    import asyncio
    import logging

    async def revienta():
        raise ValueError("string too long")

    async def principal():
        t = tray_client.vigilar(asyncio.create_task(revienta()), "telemetria")
        await asyncio.sleep(0)
        await asyncio.sleep(0)
        return t

    with caplog.at_level(logging.ERROR):
        asyncio.run(principal())
    errores = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert errores and "telemetria" in errores[0].getMessage()
    assert "string too long" in str(errores[0].exc_info[1])


def test_una_tarea_cancelada_no_es_un_error(caplog):
    """Al cerrar el cliente las tareas se cancelan: eso no es morir."""
    import asyncio
    import logging

    async def principal():
        t = tray_client.vigilar(asyncio.create_task(asyncio.sleep(10)), "cuenta")
        await asyncio.sleep(0)
        t.cancel()
        await asyncio.sleep(0)

    with caplog.at_level(logging.ERROR):
        asyncio.run(principal())
    assert not [r for r in caplog.records if r.levelno == logging.ERROR]


# ------------------------------------------- plugin de una version anterior

def test_el_plugin_viejo_se_revisa_como_mucho_una_vez_por_minuto(monkeypatch):
    """Se llama en cada vuelta del bucle mientras se espera el juego: sin
    tope, hasheria las DLLs cada pocos segundos."""
    llamadas = []
    monkeypatch.setattr(tray_client.plugin_installer, "update_own_plugin",
                        lambda installs: llamadas.append(1) or [])
    monkeypatch.setattr(tray_client.state, "plugins_revisados_at", 0.0)
    tray_client.actualizar_plugins_viejos(ahora=1000.0)
    tray_client.actualizar_plugins_viejos(ahora=1030.0)
    tray_client.actualizar_plugins_viejos(ahora=1061.0)
    assert len(llamadas) == 2


def test_si_no_se_abre_el_navegador_la_direccion_queda_a_mano(monkeypatch):
    """Sin navegador (winebrowser que no arranca) el boton no puede quedar
    mudo: la direccion se muestra y se copia."""
    dialogos = []
    monkeypatch.setattr(tray_client.win_integration, "open_in_browser", lambda url: False)
    monkeypatch.setattr(tray_client, "show_text_dialog",
                        lambda titulo, mensaje, copy_value=None: dialogos.append(copy_value))
    tray_client.abrir_navegador("https://trucksim-dash.com/app/?code=X")
    assert dialogos == ["https://trucksim-dash.com/app/?code=X"]

    dialogos.clear()
    monkeypatch.setattr(tray_client.win_integration, "open_in_browser", lambda url: True)
    tray_client.abrir_navegador("https://trucksim-dash.com/app/?code=X")
    assert dialogos == []

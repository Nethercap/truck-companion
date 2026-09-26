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
    monkeypatch.setattr(tray_client.webbrowser, "open", lambda *a, **k: None)
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
    monkeypatch.setattr(tray_client.webbrowser, "open", lambda *a, **k: None)

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

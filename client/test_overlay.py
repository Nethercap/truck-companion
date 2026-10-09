"""Overlay en el juego: que se dibuja y donde. La ventana en si (Win32) no se
prueba aca; esto es lo que decide su contenido."""

import overlay


def tele(**kw):
    base = {"game": "ets2", "speedKmh": 87.6, "speedLimitKmh": 80.0, "paused": False,
            "routeDistanceKm": 0}
    base.update(kw)
    return base


def nav(**kw):
    base = {"turn": "↱ Turn right in 400 m", "next": "Next city: Calais", "remaining": "123 km",
            "arrival": "14:32", "remainingLabel": "Remaining", "arrivalLabel": "Arrival", "imperial": False}
    base.update(kw)
    return overlay.limpiar_nav(base)


def test_sin_telemetria_o_en_pausa_no_se_ve():
    assert overlay.contenido(None, 0, None, 0, 100) is None
    assert overlay.contenido(tele(), 90, None, 0, 100) is None  # vieja
    assert overlay.contenido(tele(paused=True), 100, None, 0, 100) is None


def test_velocidad_limite_y_exceso():
    d = overlay.contenido(tele(), 100, None, 0, 100)
    assert (d["speed"], d["unit"], d["limit"]) == ("88", "km/h", "80")
    assert d["over"] is True  # 88 > 80 + 2
    d = overlay.contenido(tele(speedKmh=81.9), 100, None, 0, 100)
    assert d["over"] is False
    d = overlay.contenido(tele(speedLimitKmh=0), 100, None, 0, 100)
    assert d["limit"] == "" and d["over"] is False


def test_marcha_atras_no_da_negativo():
    assert overlay.contenido(tele(speedKmh=-12.0), 100, None, 0, 100)["speed"] == "12"


def test_ats_va_en_millas_salvo_que_la_web_diga_otra_cosa():
    d = overlay.contenido(tele(game="ats", speedKmh=104.6, speedLimitKmh=104.6), 100, None, 0, 100)
    assert (d["speed"], d["unit"], d["limit"]) == ("65", "mph", "65")
    d = overlay.contenido(tele(game="ats"), 100, nav(imperial=False), 99, 100)
    assert d["unit"] == "km/h"
    # La eleccion de la web vale aunque el giro ya este viejo.
    d = overlay.contenido(tele(game="ets2"), 100, nav(imperial=True), 0, 100)
    assert d["unit"] == "mph" and d["turn"] == ""


def test_giro_de_la_web_mientras_esta_fresco():
    d = overlay.contenido(tele(), 100, nav(), 97, 100)
    assert d["turn"].startswith("↱") and d["next"] == "Next city: Calais"
    assert (d["remaining"], d["arrival"]) == ("123 km", "14:32")
    viejo = overlay.contenido(tele(), 100, nav(), 100 - overlay.NAV_FRESH_SECONDS - 1, 100)
    assert viejo["turn"] == "" and viejo["arrival"] == ""


def test_sin_web_lo_que_falta_sale_del_gps_del_juego():
    d = overlay.contenido(tele(routeDistanceKm=152.4), 100, None, 0, 100, etiqueta_falta="Falta")
    assert (d["remaining"], d["arrival"], d["remainingLabel"]) == ("152 km", "", "Falta")
    d = overlay.contenido(tele(routeDistanceKm=8.04, game="ats"), 100, None, 0, 100)
    assert d["remaining"] == "5.0 mi"


def test_solo_se_muestra_lo_elegido():
    d = overlay.contenido(tele(), 100, nav(), 99, 100, items=("speed",))
    assert d["speed"] == "88" and d["limit"] == "80"
    assert d["turn"] == d["next"] == d["remaining"] == d["arrival"] == d["game_arrival"] == ""
    d = overlay.contenido(tele(), 100, nav(), 99, 100, items=("turn", "arrival"))
    assert d["speed"] == d["limit"] == "" and d["over"] is False and d["turn"] and d["arrival"] == "14:32"
    # Solo el giro y la web no manda: no queda un recuadro vacio.
    assert overlay.contenido(tele(), 100, None, 0, 100, items=("turn",)) is None
    assert overlay.contenido(tele(), 100, nav(), 99, 100, items=()) is None


def test_llegada_en_el_reloj_del_juego():
    # Miercoles 21:30 de juego y faltan 2 h 15 de juego por el GPS del juego.
    ahora = 2 * 1440 + 21 * 60 + 30
    d = overlay.contenido(tele(gameTimeMinutes=ahora, routeTimeSeconds=135 * 60), 100, None, 0, 100,
                          etiqueta_juego="Llegada (juego)")
    assert (d["game_arrival"], d["gameArrivalLabel"]) == ("23:45", "Llegada (juego)")
    d = overlay.contenido(tele(gameTimeMinutes=ahora, routeTimeSeconds=4 * 3600), 100, None, 0, 100)
    assert d["game_arrival"] == "01:30 +1d"
    assert overlay.contenido(tele(gameTimeMinutes=ahora, routeTimeSeconds=0), 100, None, 0, 100)["game_arrival"] == ""
    # La llegada real lleva siempre la etiqueta del cliente, no la de la web.
    d = overlay.contenido(tele(), 100, nav(arrivalLabel="Arrival"), 99, 100, etiqueta_llega="Llegada (real)")
    assert d["arrivalLabel"] == "Llegada (real)"


def test_lo_que_llega_de_la_web_se_limpia():
    n = overlay.limpiar_nav({"turn": 5, "next": "x" * 500, "imperial": "si", "remaining": None})
    assert n["turn"] == "" and len(n["next"]) == 160 and n["imperial"] is None and n["remaining"] == ""


def test_posicion_en_cada_esquina():
    rect = (0, 0, 1920, 1080)
    assert overlay.posicion(rect, 400, 100, "top_left", 24) == (24, 24)
    assert overlay.posicion(rect, 400, 100, "top_center", 24) == (760, 24)
    assert overlay.posicion(rect, 400, 100, "top_right", 24) == (1496, 24)
    assert overlay.posicion(rect, 400, 100, "bottom_left", 24) == (24, 956)
    assert overlay.posicion(rect, 400, 100, "bottom_right", 24) == (1496, 956)
    # Juego en ventana en un segundo monitor.
    assert overlay.posicion((1920, 100, 3200, 820), 400, 100, "top_right", 24) == (2776, 124)


def test_ajustes_por_defecto_y_validados(monkeypatch):
    import win_integration
    monkeypatch.setattr(win_integration, "overlay_supported", lambda: True)
    monkeypatch.setattr(win_integration, "load_settings", lambda: {})
    assert win_integration.overlay_settings() == {"enabled": False, "corner": "top_center", "size": "m",
                                                  "items": overlay.ITEMS, "hotkey": "ctrl+shift+o"}
    monkeypatch.setattr(win_integration, "load_settings",
                        lambda: {"overlay": True, "overlay_corner": "middle", "overlay_size": "l",
                                 "overlay_items": ["arrival", "inventado", "speed"], "overlay_hotkey": ""})
    assert win_integration.overlay_settings() == {"enabled": True, "corner": "top_center", "size": "l",
                                                  "items": ("speed", "arrival"), "hotkey": ""}
    monkeypatch.setattr(win_integration, "load_settings", lambda: {"overlay_hotkey": "ctrl+del"})
    assert win_integration.overlay_settings()["hotkey"] == "ctrl+shift+o"
    monkeypatch.setattr(win_integration, "overlay_supported", lambda: False)
    assert win_integration.overlay_settings()["enabled"] is False


def test_textos_en_los_ocho_idiomas():
    import i18n
    claves = ["overlay_option", "overlay_position", "overlay_size", "menu_overlay",
              "overlay_remaining", "overlay_arrival", "overlay_arrival_game", "overlay_show",
              "overlay_hotkey", "hotkey_none"]
    claves += [f"pos_{c}" for c in overlay.CORNERS] + [f"size_{k}" for k in overlay.SIZES]
    claves += [f"item_{k}" for k in overlay.ITEMS]
    for lang, textos in i18n._STRINGS.items():
        faltan = [k for k in claves if not textos.get(k)]
        assert not faltan, (lang, faltan)


def test_nav_hud_llega_al_overlay():
    import asyncio
    import client
    recibido = []
    client.on_nav_hud = recibido.append
    try:
        asyncio.run(client.handle_control_message('{"type": "nav_hud", "turn": "x"}', {}, None))
    finally:
        client.on_nav_hud = None
    assert recibido == [{"type": "nav_hud", "turn": "x"}]


def test_las_teclas_rapidas():
    assert overlay.tecla("ctrl+shift+o") == (overlay.MOD_CONTROL | overlay.MOD_SHIFT, ord("O"))
    assert overlay.tecla("alt+shift+o") == (overlay.MOD_ALT | overlay.MOD_SHIFT, ord("O"))
    assert overlay.tecla("") is None and overlay.tecla("ctrl+") is None
    assert overlay.tecla("win+o") is None and overlay.tecla("ctrl+f10") is None
    # Todas las que se ofrecen se pueden registrar (salvo "ninguna").
    assert all(overlay.tecla(k) for k in overlay.HOTKEYS if k)
    assert overlay.DEFAULT_HOTKEY in overlay.HOTKEYS
    assert overlay.nombre_tecla("ctrl+shift+o") == "Ctrl+Shift+O"


def test_apagar_no_destruye_la_ventana():
    """Prender de nuevo (con la tecla, con el juego al frente) no puede crear
    otra ventana: crearla le saca el foco al juego."""
    ov = overlay.Overlay(overlay.OverlayData(), lambda: None, lambda: None)
    arrancados = []
    ov._correr = lambda: arrancados.append(1)
    ov.set_enabled(True)
    ov._hilo.join(1)
    ov._hilo = type("Vivo", (), {"is_alive": lambda self: True})()
    ov.set_enabled(False)
    assert ov.enabled is False
    ov.set_enabled(True)
    assert ov.enabled is True and arrancados == [1]


def test_la_combinacion_tiene_que_ser_exacta():
    mods, vk = overlay.tecla("ctrl+shift+o")
    CTRL, ALT, SHIFT = 0x11, 0x12, 0x10
    def con(*teclas):
        return lambda v: v in teclas
    assert overlay.combinacion_apretada(mods, vk, con(CTRL, SHIFT, vk))
    assert not overlay.combinacion_apretada(mods, vk, con(CTRL, vk))            # falta Shift
    assert not overlay.combinacion_apretada(mods, vk, con(CTRL, SHIFT, ALT, vk))  # Alt de mas
    assert not overlay.combinacion_apretada(mods, vk, con(CTRL, SHIFT))         # falta la O

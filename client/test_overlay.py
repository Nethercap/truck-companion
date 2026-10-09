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
    assert win_integration.overlay_settings() == {"enabled": False, "corner": "top_center", "size": "m"}
    monkeypatch.setattr(win_integration, "load_settings",
                        lambda: {"overlay": True, "overlay_corner": "middle", "overlay_size": "l"})
    assert win_integration.overlay_settings() == {"enabled": True, "corner": "top_center", "size": "l"}
    monkeypatch.setattr(win_integration, "overlay_supported", lambda: False)
    assert win_integration.overlay_settings()["enabled"] is False


def test_textos_en_los_ocho_idiomas():
    import i18n
    claves = ["overlay_option", "overlay_position", "overlay_size", "menu_overlay",
              "overlay_remaining", "overlay_arrival"]
    claves += [f"pos_{c}" for c in overlay.CORNERS] + [f"size_{k}" for k in overlay.SIZES]
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

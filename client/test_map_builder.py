"""Tests de "Build my map": que mods se arman, la huella, y como sirve el
servidor local el mapa armado."""
import http.client
import http.server
import json
import os
import threading

import local_server
import map_builder

LOG = """00:00:02.700 : [mod_package_manager] Requesting Steam Workshop content..
00:00:04.900 : [fs] device D:/Steam/steamapps/common/American Truck Simulator/dlc_wa.scs mounted to base pool.
00:00:11.039 : [mods] Active 2 mods (local: 1, workshop: 1)
00:00:11.039 : [mods] Active workshop mod ID 123 (name: Western Canada Expansion v1.7.3, version: 1.7.3, author: JacobKazias)
00:00:11.039 : [mods] Active local mod Eastern_Canada (name: Eastern Canada Expansion v1.2.1, version: 1.2.1, author: JacobKazias)
00:00:11.040 : [fs] device D:/Steam/steamapps/workshop/content/270880/123/latest mounted to mod pool.
00:00:11.041 : [fs] device C:/Users/x/Documents/American Truck Simulator/mod/Eastern_Canada.scs mounted to mod pool.
"""


def test_rutas_de_los_mods_en_el_orden_en_que_el_juego_los_monta():
    rutas = map_builder.mounted_mod_paths(LOG)
    assert rutas == [os.path.normpath("D:/Steam/steamapps/workshop/content/270880/123/latest"),
                     os.path.normpath("C:/Users/x/Documents/American Truck Simulator/mod/Eastern_Canada.scs")]


def test_los_dlc_montados_antes_de_la_lista_de_mods_no_cuentan():
    assert not any("dlc_wa" in r for r in map_builder.mounted_mod_paths(LOG))


def test_sin_lista_de_mods_no_hay_datos():
    assert map_builder.mounted_mod_paths("00:00:01 : [sys] arranque\n") is None


def test_solo_cuenta_el_ultimo_perfil_cargado():
    otro = LOG + "00:05:00.000 : [mods] Active 0 mods (local: 0, workshop: 0)\n"
    assert map_builder.mounted_mod_paths(otro) == []


def test_la_huella_cambia_con_los_mods_y_con_su_orden(tmp_path):
    juego = tmp_path / "juego"
    juego.mkdir()
    (juego / "version.scs").write_bytes(b"1.61")
    a = tmp_path / "a.scs"
    b = tmp_path / "b.scs"
    a.write_bytes(b"aaa")
    b.write_bytes(b"bbbb")
    h1 = map_builder.fingerprint("ats", str(juego), [str(a), str(b)])
    assert h1 == map_builder.fingerprint("ats", str(juego), [str(a), str(b)])
    assert h1 != map_builder.fingerprint("ats", str(juego), [str(b), str(a)])
    assert h1 != map_builder.fingerprint("ets2", str(juego), [str(a), str(b)])
    b.write_bytes(b"bbbbb")  # el mod se actualizo
    assert h1 != map_builder.fingerprint("ats", str(juego), [str(a), str(b)])


def test_un_mapa_a_medias_no_cuenta(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    carpeta = tmp_path / "TruckDash" / "maps" / "ats-abc"
    carpeta.mkdir(parents=True)
    assert map_builder.built_map("ats", "abc") is None
    (carpeta / "manifest.json").write_text(json.dumps({"format": map_builder.MAP_FORMAT, "fingerprint": "abc"}))
    assert map_builder.built_map("ats", "abc")["dir"] == str(carpeta)
    (carpeta / "manifest.json").write_text(json.dumps({"format": map_builder.MAP_FORMAT - 1, "fingerprint": "abc"}))
    assert map_builder.built_map("ats", "abc") is None


def _servidor(tmp_path):
    carpeta = tmp_path / "mapa"
    (carpeta / "vector").mkdir(parents=True)
    (carpeta / "vector" / "local_ats.pmtiles").write_bytes(bytes(range(256)) * 4)
    (carpeta / "local_ats").mkdir()
    (carpeta / "local_ats" / "Cities.json").write_text("[]")
    local_server.local_map_dirs["ats"] = str(carpeta)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), local_server._StaticHandler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def _pedir(srv, path, headers=None, metodo="GET"):
    c = http.client.HTTPConnection("127.0.0.1", srv.server_address[1], timeout=5)
    c.request(metodo, path, headers=headers or {})
    r = c.getresponse()
    return r, r.read()


def test_el_mapa_local_se_sirve_por_rangos(tmp_path):
    srv = _servidor(tmp_path)
    try:
        r, cuerpo = _pedir(srv, "/localmap/ats/vector/local_ats.pmtiles", {"Range": "bytes=10-19"})
        assert r.status == 206
        assert r.getheader("Content-Range") == "bytes 10-19/1024"
        assert cuerpo == bytes(range(10, 20))
        r, cuerpo = _pedir(srv, "/localmap/ats/vector/local_ats.pmtiles", {"Range": "bytes=-4"})
        assert r.status == 206 and cuerpo == bytes(range(252, 256))
        r, cuerpo = _pedir(srv, "/localmap/ats/local_ats/Cities.json?v=abc")
        assert r.status == 200 and cuerpo == b"[]"
        assert r.getheader("Access-Control-Allow-Origin") == "*"
    finally:
        srv.shutdown()


def test_el_mapa_local_no_sale_de_su_carpeta(tmp_path):
    (tmp_path / "secreto.txt").write_text("no")
    srv = _servidor(tmp_path)
    try:
        assert _pedir(srv, "/localmap/ats/../secreto.txt")[0].status == 404
        assert _pedir(srv, "/localmap/ets2/vector/local_ets2.pmtiles")[0].status == 404
        assert _pedir(srv, "/localmap/ats/")[0].status == 404
    finally:
        srv.shutdown()


def test_preflight_de_red_privada(tmp_path):
    srv = _servidor(tmp_path)
    try:
        r, _ = _pedir(srv, "/localmap/ats/vector/local_ats.pmtiles", {"Access-Control-Request-Private-Network": "true"}, "OPTIONS")
        assert r.status == 204
        assert r.getheader("Access-Control-Allow-Private-Network") == "true"
    finally:
        srv.shutdown()


def test_el_mapa_local_sirve_los_logos_como_png(tmp_path):
    """El buscador los usa en un <img>: con octet-stream no es seguro que el
    navegador los muestre."""
    srv = _servidor(tmp_path)
    (tmp_path / "mapa" / "company-icons").mkdir()
    (tmp_path / "mapa" / "company-icons" / "mod_co.png").write_bytes(b"\x89PNG")
    try:
        r, cuerpo = _pedir(srv, "/localmap/ats/company-icons/mod_co.png")
        assert r.status == 200 and cuerpo == b"\x89PNG"
        assert r.getheader("Content-Type") == "image/png"
        assert r.getheader("Access-Control-Allow-Origin") == "*"
    finally:
        srv.shutdown()


def test_copia_los_logos_de_las_empresas(tmp_path):
    """Los de las empresas del mapa, mods incluidos (en R2 solo estan los de
    las variantes publicadas); no los cientos de iconos que no son empresas."""
    parser = tmp_path / "parser"
    (parser / "icons").mkdir(parents=True)
    for nombre in ("wal_mkt", "mod_co", "gas_ico", "sin_uso"):
        (parser / "icons" / f"{nombre}.png").write_bytes(nombre.encode())
    (parser / "usa-pois.json").write_text(json.dumps([
        {"x": 1, "y": 2, "type": "company", "icon": "wal_mkt", "cityToken": "a"},
        {"x": 3, "y": 4, "type": "company", "icon": "wal_mkt", "cityToken": "b"},
        {"x": 5, "y": 6, "type": "company", "icon": "mod_co", "cityToken": "c"},
        {"x": 7, "y": 8, "type": "company", "icon": "sin_png", "cityToken": "c"},
        {"x": 9, "y": 9, "type": "company", "icon": "../fuera", "cityToken": "c"},
        {"x": 9, "y": 9, "type": "facility", "icon": "gas_ico"},
    ]))
    destino = tmp_path / "mapa" / "company-icons"
    assert map_builder.copy_company_icons(str(parser), "usa", str(destino)) == 2
    assert sorted(os.listdir(destino)) == ["mod_co.png", "wal_mkt.png"]
    assert (destino / "mod_co.png").read_bytes() == b"mod_co"
    # Sin datos del parser no se rompe el armado: el mapa sale sin logos.
    assert map_builder.copy_company_icons(str(tmp_path / "nada"), "usa", str(tmp_path / "otro")) == 0


def test_pois_completa_ciudades_sin_nombre():
    """Empresas en ciudades que el parser no lista (Gulfport de C2C, Rusia
    de ETS2): sin nombre, buscar la ciudad no daba nada (Discord 10-10)."""
    from mapbuild import pois
    datos = {"companies": [[0, 0, "a", "A", "gulfport"], [0, 0, "b", "B", "v_novgorod"],
                           [0, 0, "c", "C", "nueva_ciudad"], [0, 0, "d", "D", "austin"]],
             "cities": {"austin": "Austin"}}
    assert pois.fill_missing_cities(datos) == ["gulfport", "nueva_ciudad", "v_novgorod"]
    assert datos["cities"] == {"austin": "Austin", "gulfport": "Gulfport",
                               "v_novgorod": "Veliky Novgorod", "nueva_ciudad": "Nueva Ciudad"}


def test_pois_surtidores_solo_para_auto(tmp_path):
    """Los techos de surtidores para auto (ATS 1.61) van con su propio codigo:
    en camion no se entra, y la web mandaba a un camion a la de Spearfish
    (Discord 12-10). Una parada de camiones tiene los dos techos; el de
    camion sigue siendo "g". En ETS2 no se maneja auto: todo es "g"."""
    import json
    from mapbuild import pois
    surtidores = [
        {"x": -31035, "y": -34508, "type": "facility", "icon": "gas_ico", "prefabPath": "prefab/gas/us_gas_gp_car_2rows_roof.ppd"},
        {"x": -28960, "y": -30470, "type": "facility", "icon": "gas_ico", "prefabPath": "prefab/gas/us_gas_driver_car_4rows_roof_rt.ppd"},
        {"x": -28990, "y": -30490, "type": "facility", "icon": "gas_ico", "prefabPath": "prefab/gas/us_gas_driver_truck_5rows_roof.ppd"},
        {"x": 5000, "y": 5000, "type": "facility", "icon": "gas_ico", "prefabPath": "prefab/gas/us_gas_station_trigger_only_rt.ppd"},
        {"x": 9000, "y": 9000, "type": "facility", "icon": "gas_ico"},
    ]
    (tmp_path / "usa-pois.json").write_text(json.dumps(surtidores))
    datos = pois.build(str(tmp_path), "usa")
    assert sorted(datos["facilities"]) == sorted([
        [-31035, -34508, "f"], [-28960, -30470, "f"], [-28990, -30490, "g"], [5000, 5000, "g"], [9000, 9000, "g"],
    ])
    (tmp_path / "europe-pois.json").write_text(json.dumps(surtidores))
    assert {f[2] for f in pois.build(str(tmp_path), "europe")["facilities"]} == {"g"}


def test_pois_guarda_el_estado_de_cada_ciudad(tmp_path):
    """Tres Jackson en ATS + C2C: sin el estado, en el buscador de la web no
    se sabia cual era cual (Discord 11-10)."""
    import json
    from mapbuild import pois
    (tmp_path / "usa-pois.json").write_text(json.dumps([
        {"x": 10, "y": 20, "type": "company", "icon": "wal_mkt", "label": "Wallbert", "cityToken": "jackson_ms"},
    ]))
    (tmp_path / "usa-cities.json").write_text(json.dumps([
        {"token": "jackson", "name": "Jackson", "countryToken": "wyoming", "x": 0, "y": 0},
        {"token": "jackson_ms", "name": "Jackson", "countryToken": "mississippi", "x": 9, "y": 9},
        {"token": "sin_estado", "name": "Sin Estado", "x": 5, "y": 5},
    ]))
    datos = pois.build(str(tmp_path), "usa")
    assert datos["countries"] == {"jackson": "wyoming", "jackson_ms": "mississippi"}
    assert datos["cities"]["jackson_ms"] == "Jackson"


def test_pois_guarda_las_areas_de_ciudad(tmp_path):
    """Adentro de las cajas de ciudad el juego va a 1:3: sin ellas la web
    media Rockford a 1:20 y daba 25,5 mi con el GPS del juego en 4,0
    (Discord 14-10). Van las ocultas tambien, y una caja angosta no queda
    en 0 de ancho al redondear."""
    import json
    from mapbuild import pois
    (tmp_path / "usa-pois.json").write_text(json.dumps([
        {"x": 10, "y": 20, "type": "company", "icon": "wal_mkt", "label": "Wallbert", "cityToken": "rockford"},
    ]))
    (tmp_path / "usa-cities.json").write_text(json.dumps([
        {"token": "rockford", "name": "Rockford", "x": 0, "y": 0, "areas": [
            {"x": 26158.07, "y": -17487.24, "width": 337.18, "height": 329.42, "hidden": True},
            {"x": 100.6, "y": 200.2, "width": 0.4, "height": 50, "hidden": False},
            {"x": 5, "y": 5, "width": 0, "height": 10},
            {"x": 5, "y": 5},
        ]},
        {"token": "sin_areas", "name": "Sin Areas", "x": 5, "y": 5},
    ]))
    datos = pois.build(str(tmp_path), "usa")
    assert datos["areas"] == [[26158, -17488, 338, 331], [100, 200, 1, 51]]
    (tmp_path / "usa-cities.json").write_text(json.dumps([{"token": "a", "name": "A", "x": 0, "y": 0}]))
    assert "areas" not in pois.build(str(tmp_path), "usa")


def test_nombres_de_ruta_con_el_cartelito():
    """Rockford es la Business US-20 (West State St) y el tablero decia
    "Keep right onto US-20" (Discord 14-10): el cartelito BUSINESS de abajo
    del escudo se perdia."""
    from mapbuild.extract_road_names import sign_labels
    a = "/def/sign/atlas/"
    # Los carteles de Rockford, tal cual vienen del parser
    assert sign_labels([a + "us_20.sii", "<sub scale=1.16>E</sub>AST", "BUSINESS", "/font/sign/us_sign_b.font"]) == ["US-20 Bus"]
    assert sign_labels([a + "us_20.sii", "BUSINESS", "/font/sign/us_sign_b.font", "WEST"]) == ["US-20 Bus"]
    assert sign_labels([a + "us_20.sii", "EAST", a + "small_arrow_10.sii"]) == ["US-20"]
    # Las dos manos en un cartel: los dos cartelitos, uno por escudo
    assert sign_labels([a + "us_20.sii", a + "us_20.sii", "BUSINESS", "BUSINESS", "EAST", "WEST"]) == ["US-20 Bus"]
    # Varias rutas: el cartelito es del escudo de antes, si no hay otro texto en el medio
    assert sign_labels([a + "us_61.sii", "BUSINESS", a + "us_67.sii"]) == ["US-61 Bus", "US-67"]
    assert sign_labels([a + "us_60.sii", "BUSINESS", a + "us_67.sii", "BUSINESS"]) == ["US-60 Bus", "US-67 Bus"]
    assert sign_labels([a + "us_75.sii", "BUSINESS", "Council Bluffs", a + "is_29.sii", "SOUTH"]) == ["US-75 Bus", "I-29"]
    assert sign_labels([a + "us_75.sii", "Council Bluffs", "BUSINESS", a + "is_29.sii"]) == ["US-75", "I-29"]
    # Una sola ruta: el cartelito es de ella aunque este arriba del escudo
    assert sign_labels(["TRUCK", a + "us_277.sii", "SOUTH"]) == ["US-277 Truck"]
    assert sign_labels(["ALTERNATE", "TO", a + "us_16.sii"]) == ["US-16 Alt"]
    # El cartelito en el nombre del sprite, y las variantes de dibujo que antes no se leian
    assert sign_labels([a + "us_71b.sii"]) == ["US-71 Bus"]
    assert sign_labels([a + "us_65b_2.sii"]) == ["US-65 Bus"]
    assert sign_labels([a + "us_16a.sii"]) == ["US-16 Alt"]
    assert sign_labels([a + "us_14_alt.sii"]) == ["US-14 Alt"]
    assert sign_labels([a + "us_54_bus_nm_2.sii"]) == ["US-54 Bus"]
    assert sign_labels([a + "us_66_h_nm.sii"]) == ["US-66 Hist"]
    assert sign_labels([a + "us_30_historic_or.sii"]) == ["US-30 Hist"]
    assert sign_labels([a + "bu_80.sii"]) == ["I-80 Bus"]
    assert sign_labels([a + "bu_10_white.sii"]) == ["I-10 Bus"]
    assert sign_labels([a + "is_35e_w.sii"]) == ["I-35E"]
    assert sign_labels([a + "is_69w.sii"]) == ["I-69W"]
    for variante in ("us_385_2", "us_50_guide", "us_101_ca_guide_2", "us_54_black", "us_97_ca"):
        assert sign_labels([a + variante + ".sii"]) == ["US-" + variante.split("_")[1]]
    assert sign_labels([a + "is_40_2.sii", a + "is_580_ca.sii"]) == ["I-40", "I-580"]
    # Lo que no es escudo de ruta no da nombre
    assert sign_labels([a + "ca_shields.sii", "US  Bus  20", "West  State  St"]) == []
    assert sign_labels(None) == []


def test_nombres_de_ruta_extract_deduplica_por_cartel(tmp_path):
    import json
    from mapbuild import extract_road_names
    carteles = [
        {"x": 26862.4, "y": -20129.6, "textItems": ["/def/sign/atlas/us_20.sii", "WEST", "BUSINESS"]},
        {"x": 26862.4, "y": -20129.6, "textItems": ["/def/sign/atlas/us_20.sii", "WEST", "BUSINESS"]},
        {"x": 27279, "y": -19323, "textItems": ["EAST", "/def/sign/atlas/us_20.sii"]},
        {"textItems": ["/def/sign/atlas/us_20.sii"]},
    ]
    entrada, salida = tmp_path / "usa-signs.json", tmp_path / "road-names.json"
    entrada.write_text(json.dumps(carteles))
    extract_road_names.main(["", str(entrada), str(salida)])
    assert json.loads(salida.read_text()) == [
        {"x": 26862.4, "y": -20129.6, "label": "US-20 Bus", "kind": "road"},
        {"x": 27279, "y": -19323, "label": "US-20", "kind": "road"},
    ]

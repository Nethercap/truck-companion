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

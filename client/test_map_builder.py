"""Tests de "Build my map": que mods se arman, la huella, y como sirve el
servidor local el mapa armado."""
import http.client
import http.server
import json
import os
import sys
import threading
import time

import pytest

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


def _dlcs(carpeta, *ids):
    """Los .scs de esos DLC en la carpeta del juego, como installed_map_dlc_files."""
    carpeta.mkdir(parents=True, exist_ok=True)
    rutas = {}
    for i in ids:
        ruta = carpeta / f"dlc_{i}.scs"
        ruta.write_bytes(b"")
        rutas[i] = str(ruta)
    return rutas


def test_un_dlc_de_mapa_comprado_despues_deja_de_lado_el_mapa_armado(tmp_path):
    """Discord, 31-10: Colorado comprado esa manana, el mapa armado antes. El
    parser lee los DLC de la carpeta del juego pero la huella no los mira, y
    la web decia "Grand Junction is not on our map" con el mapa vacio."""
    man = {"format": map_builder.MAP_FORMAT, "fingerprint": "abc", "mapDlcs": ["ut", "wa"]}
    assert map_builder.dlc_changes(man, _dlcs(tmp_path / "a", "ut", "wa")) == []
    assert map_builder.dlc_changes(man, _dlcs(tmp_path / "b", "co", "ut", "wa")) == ["+co"]
    # Uno sacado (desactivado en Steam): el mapa tiene rutas que el juego no
    assert map_builder.dlc_changes(man, _dlcs(tmp_path / "c", "ut")) == ["-wa"]
    # Carpeta ilegible: no se sabe, se sigue usando
    assert map_builder.dlc_changes(man, None) == []
    assert map_builder.dlc_changes(None, _dlcs(tmp_path / "d", "co")) == []


def test_un_mapa_armado_sin_la_lista_de_dlc_se_compara_por_fecha(tmp_path):
    """Los armados con la 1.5.35 o antes no guardan los DLC: cuenta como
    cambio un DLC cuyo archivo aparecio despues de empezar el armado."""
    dlcs = _dlcs(tmp_path / "juego", "co", "ut")
    hora = lambda t: time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(t))
    antes = {"format": map_builder.MAP_FORMAT, "built": hora(time.time() - 3600), "seconds": 900}
    assert map_builder.dlc_changes(antes, dlcs) == ["+co", "+ut"]
    # Armado despues de que aparecieran los dos archivos: sirve
    despues = {"format": map_builder.MAP_FORMAT, "built": hora(time.time() + 3600), "seconds": 900}
    assert map_builder.dlc_changes(despues, dlcs) == []
    # Termino despues de que aparecieran, pero el parser ya habia leido la
    # carpeta: cuenta desde que empezo ("built" es el final)
    largo = {"format": map_builder.MAP_FORMAT, "built": hora(time.time() + 600), "seconds": 3600}
    assert map_builder.dlc_changes(largo, dlcs) == ["+co", "+ut"]
    # Sin fecha legible no se descarta (como antes)
    assert map_builder.dlc_changes({"built": "ayer"}, dlcs) == []
    assert map_builder.dlc_changes({"format": map_builder.MAP_FORMAT}, dlcs) == []


def test_el_manifest_guarda_los_dlc_de_mapa_del_armado(tmp_path, monkeypatch):
    from mapbuild import build_cities_json, build_route_graph, extract_road_names
    from mapbuild import pois as mapbuild_pois

    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    monkeypatch.setattr(map_builder, "ensure_builder", lambda version, progress: str(tmp_path / "armador"))

    def correr(cmd, log_path, cancel, env):
        if cmd[1].endswith("parser.mjs"):
            with open(os.path.join(cmd[4], "usa-cities.json"), "w", encoding="utf-8") as f:
                f.write("[]")

    def grafo(args):
        for sufijo in (".bin", "-v3.bin", "-lanes.bin", "-times.bin", "-prefabs.bin"):
            with open(args[3][:-5] + sufijo, "wb") as f:
                f.write(b"")

    monkeypatch.setattr(map_builder, "_correr", correr)
    monkeypatch.setattr(build_route_graph, "main", grafo)
    monkeypatch.setattr(build_cities_json, "main", lambda args: None)
    monkeypatch.setattr(extract_road_names, "main", lambda args: None)
    monkeypatch.setattr(mapbuild_pois, "build", lambda carpeta, prefijo: None)
    juego = tmp_path / "juego"
    juego.mkdir()
    mods = [str(tmp_path / "mod.scs")]
    man = map_builder.build_map("ats", str(juego), mods, "1.5.36", map_dlcs=["ut", "co"])
    assert man["mapDlcs"] == ["co", "ut"]
    guardado = map_builder.built_map("ats", map_builder.fingerprint("ats", str(juego), mods))
    assert guardado["mapDlcs"] == ["co", "ut"]
    assert map_builder.dlc_changes(guardado, _dlcs(juego, "co", "ut")) == []
    assert map_builder.dlc_changes(guardado, _dlcs(juego, "co", "ut", "wy")) == ["+wy"]
    # Sin poder leer la carpeta del juego al empezar, sin el campo (va por fecha)
    sin = map_builder.build_map("ats", str(juego), mods, "1.5.36")
    assert "mapDlcs" not in sin


def test_los_mods_van_al_parser_en_una_lista_y_no_separados_por_coma(tmp_path, monkeypatch):
    """Un mod con coma en el nombre se partia en dos y el parser no
    encontraba el primer pedazo (#142)."""
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    monkeypatch.setattr(map_builder, "ensure_builder", lambda version, progress: str(tmp_path / "armador"))
    comandos = []

    def correr(cmd, log_path, cancel, env):
        comandos.append(cmd)
        raise map_builder.BuildCancelled()

    monkeypatch.setattr(map_builder, "_correr", correr)
    mods = [os.path.normpath("C:/x/mod/FREE-TM DAF 2021 XF, XG & XG+ Multicolor Skin_locked.scs"),
            os.path.normpath("D:/Steam/steamapps/workshop/content/227300/123/universal")]
    with pytest.raises(map_builder.BuildCancelled):
        map_builder.build_map("ets2", str(tmp_path / "juego"), mods, "1.5.36")
    lista = comandos[0][3]
    assert lista.startswith("@")
    with open(lista[1:], encoding="utf-8") as f:
        assert f.read().splitlines() == mods
    # Lo que la persona adjunta cuando falla tiene que decir con que mods
    log = os.path.join(os.path.dirname(lista[1:]), "build.log")
    with open(log, encoding="utf-8") as f:
        assert f"  {mods[0]}\n" in f.read()


# Un .sii salteado como lo escribe el parser de la 1.5.35, con sus colores
# (build.log de #135, 28-10: 922 de estos en un perfil de 292 mods)
SALTEADO = """\x1b[31m✖\x1b[39m error validating def/company/acc/out/ARCHIVO.sii
{
  "cargoDef": {
    ".ARCHIVO": {
      "cargo": ""
    }
  }
}
\x1b[31m✖\x1b[39m data/cargoDef/.ARCHIVO/cargo must match pattern "^cargo\\.[0-9a-zA-Z_.]{1,40}$"
\x1b[31m✖\x1b[39m [ { instancePath: \x1b[32m'/cargoDef/.ARCHIVO/cargo'\x1b[39m,
    schemaPath:
     \x1b[32m'#/properties/cargoDef/patternProperties/%5E%5C.%3F%5B0-9a-zA-Z_.%5D%7B1%2C40%7D%24/properties/cargo/pattern'\x1b[39m,
    keyword: \x1b[32m'pattern'\x1b[39m,
    params: { pattern: \x1b[32m'^cargo\\\\.[0-9a-zA-Z_.]{1,40}$'\x1b[39m },
    message: \x1b[32m'must match pattern "^cargo\\\\.[0-9a-zA-Z_.]{1,40}$"'\x1b[39m } ]
\x1b[33m⚠\x1b[39m skipping def/company/acc/out/ARCHIVO.sii - failed to parse/validate: \n\

    \x1b[90mat \x1b[39mconvertSiiToJson (\x1b[36m/C:/x/bin/parser.mjs:26788:9\x1b[39m)
    \x1b[90mat \x1b[39mprocessCompanyJson (\x1b[36m/C:/x/bin/parser.mjs:30072:19\x1b[39m)
    \x1b[90mat \x1b[39masync asyncRunEntryPointWithESMLoader (\x1b[36mnode:internal/modules/run_main:101:5\x1b[39m)
"""


def _salteado(archivo):
    return SALTEADO.replace("ARCHIVO", archivo)


def _compactar(texto):
    lineas = []
    filtro = map_builder.LogCompacto(lineas.append)
    for linea in texto.splitlines(keepends=True):
        filtro.linea(linea)
    filtro.cerrar()
    return lineas


def test_el_build_log_deja_cada_archivo_salteado_en_una_linea():
    """Con 27 lineas por archivo el log pasaba las 25.000 de mclo.gs y el
    error que corto el armado quedaba afuera (#135)."""
    texto = "adding base.scs\n" + _salteado("exhausts_c") + _salteado("seal_bearing") + "parsing map files...\n"
    assert _compactar(texto) == [
        "adding base.scs",
        "⚠ skipping def/company/acc/out/exhausts_c.sii - failed to parse/validate: "
        'data/cargoDef/.exhausts_c/cargo must match pattern "^cargo\\.[0-9a-zA-Z_.]{1,40}$"',
        "⚠ skipping def/company/acc/out/seal_bearing.sii - failed to parse/validate: "
        'data/cargoDef/.seal_bearing/cargo must match pattern "^cargo\\.[0-9a-zA-Z_.]{1,40}$"',
        "parsing map files...",
    ]


def test_un_archivo_que_corta_el_armado_queda_con_el_json_recortado():
    """Sin el aviso de que se saltea, el error de despues es el que importa:
    queda entero, con su pila."""
    adentro = [f'  "k{i}": {i},' for i in range(49)]
    fatal = ["file:///C:/x/bin/parser.mjs:26791", "  throw new Error();", "  ^", "", "Error",
             "    at convertSiiToJson (file:///C:/x/bin/parser.mjs:26791:9)", "", "Node.js v22.12.0"]
    texto = "\n".join(["\x1b[31m✖\x1b[39m error validating def/city/x.sii", "{", *adentro, "}",
                       "\x1b[31m✖\x1b[39m data must have required property 'name'",
                       "\x1b[31m✖\x1b[39m [ { instancePath: '',", "    keyword: 'required' } ]", *fatal]) + "\n"
    assert _compactar(texto) == [
        "✖ error validating def/city/x.sii", "{", *adentro[:19], "  ... (30 more lines)", "}",
        "✖ data must have required property 'name'", "✖ [ { instancePath: '',", "    keyword: 'required' } ]",
        *fatal]


def test_un_archivo_que_no_valida_y_no_se_saltea_no_se_junta_con_el_siguiente():
    texto = "\x1b[31m✖\x1b[39m error validating def/a.sii\n{\n}\n\x1b[31m✖\x1b[39m data must be object\n" + _salteado("b")
    lineas = _compactar(texto)
    assert lineas[:4] == ["✖ error validating def/a.sii", "{", "}", "✖ data must be object"]
    assert lineas[4:] == ["⚠ skipping def/company/acc/out/b.sii - failed to parse/validate: "
                          'data/cargoDef/.b/cargo must match pattern "^cargo\\.[0-9a-zA-Z_.]{1,40}$"']


def test_los_avisos_van_sin_su_pila():
    texto = ("\x1b[33m⚠\x1b[39m skipping def/city.mod.sii - could not read its @include list: Error: zlib\n"
             "\n    at leer (/C:/x/bin/parser.mjs:1:1)\n    at main (/C:/x/bin/parser.mjs:2:2)\n"
             "parsing map files...\n    at no es una pila de un aviso\n")
    assert _compactar(texto) == [
        "⚠ skipping def/city.mod.sii - could not read its @include list: Error: zlib",
        "parsing map files...",
        "    at no es una pila de un aviso",
    ]


# Un .sii que no se puede parsear, como lo escribe el parser de la 1.5.35
# (build.log de #135, 29-10: 6.072 de estos, archivos de ferry vacios con una
# llave de mas, SiiNunit { } } con CRLF)
NO_PARSEA = """\x1b[31m✖\x1b[39m error parsing def/ferry/connection/ARCHIVO.sii
\x1b[31m✖\x1b[39m }
\x1b[31m✖\x1b[39m [ { NotAllInputParsedException: Redundant input, expecting EOF but found: }
      at RecognizerEngine2.ruleFinallyStateUpdate (file:///C:/x/bin/parser.mjs:15062:29)
      at parseSii (file:///C:/x/bin/parser.mjs:26088:22)
    token:
     { image: \x1b[32m'}'\x1b[39m,
       startOffset: \x1b[33m18\x1b[39m,
       startLine: \x1b[33m5\x1b[39m,
       tokenType: \x1b[36m[Object]\x1b[39m },
    resyncedTokens: [],
    context: { ruleStack: [], ruleOccurrenceStack: [] } } ]
\x1b[33m⚠\x1b[39m skipping ferry connection ARCHIVO.sii - failed to parse/validate: \n\
\n\
    \x1b[90mat \x1b[39mconvertSiiToJson (\x1b[36m/C:/x/bin/parser.mjs:26768:11\x1b[39m)
    \x1b[90mat \x1b[39mprocessFerryJson (\x1b[36m/C:/x/bin/parser.mjs:30128:14\x1b[39m)
"""

# El que cortaba el armado de #135 el 29-10: comillas alemanas en un
# local_module de un mod. El parser muestra la linea y la que sigue (vacia por
# el CRLF); el aviso de que se saltea es del armador nuevo.
NO_PARSEA_LOCALE = """\x1b[31m✖\x1b[39m error parsing locale/de_de/local_module.trigger_actions.sii
\x1b[31m✖\x1b[39m \tval[]: „Zur Erinnerung: Unterstützt keine kostenpflichtigen Mods. Dies verstößt gegen die Endbenutzer-Lizenzvereinbarung von SCS Software.“\r
\r
\x1b[31m✖\x1b[39m [ { NoViableAltException: Expecting: one of these possible Token sequences:
    1. [AtInclude]
    2. [Property, Colon, Property, LCurly]
  but found: 'tzt'
      at ErrorHandler2.raiseNoAltException (file:///C:/x/bin/parser.mjs:15260:33)
    token:
     { image: \x1b[32m'tzt'\x1b[39m,
       startLine: \x1b[33m927\x1b[39m,
       tokenType: \x1b[36m[Object]\x1b[39m },
    resyncedTokens: [],
    context: { ruleStack: \x1b[36m[Array]\x1b[39m, ruleOccurrenceStack: \x1b[36m[Array]\x1b[39m } } ]
"""

FATAL = ["file:///C:/x/bin/parser.mjs:26768", "    throw new Error();", "          ^", "", "Error",
         "    at convertSiiToJson (file:///C:/x/bin/parser.mjs:26768:11)",
         "    at parseLocaleFiles (file:///C:/x/bin/parser.mjs:32368:20)", "", "Node.js v24.19.0"]


def test_un_archivo_que_no_se_puede_parsear_queda_en_una_linea():
    """Con 37 lineas por archivo, el build.log de #135 del 29-10 tenia 383 mil
    lineas: 205 mil aun compactando los que no validan."""
    texto = "adding base.scs\n" + NO_PARSEA.replace("ARCHIVO", "aomori_hakodate") \
        + NO_PARSEA.replace("ARCHIVO", "calais_kobe") + "parsing map files...\n"
    assert _compactar(texto) == [
        "adding base.scs",
        "⚠ skipping ferry connection aomori_hakodate.sii - failed to parse/validate: "
        "NotAllInputParsedException: Redundant input, expecting EOF but found: } (line 5: })",
        "⚠ skipping ferry connection calais_kobe.sii - failed to parse/validate: "
        "NotAllInputParsedException: Redundant input, expecting EOF but found: } (line 5: })",
        "parsing map files...",
    ]


def test_el_aviso_de_un_archivo_que_no_parsea_trae_lo_que_encontro_y_la_linea():
    aviso = ("\x1b[33m⚠\x1b[39m skipping locale/de_de/local_module.trigger_actions.sii"
             " - failed to parse/validate (trigger_actions.scs): \n\n    at convertSiiToJson (/C:/x:1:1)\n")
    assert _compactar("parsing locale files...\n" + NO_PARSEA_LOCALE + aviso) == [
        "parsing locale files...",
        "⚠ skipping locale/de_de/local_module.trigger_actions.sii - failed to parse/validate"
        " (trigger_actions.scs): NoViableAltException: Expecting: one of these possible Token sequences:"
        " ... but found: 'tzt' (line 927: val[]: „Zur Erinnerung: Unterstützt keine kostenpflichtigen Mods."
        " Dies verstößt gegen die Endbenutze...)",
    ]


def test_un_error_del_lexer_se_resume_con_su_mensaje():
    texto = ("\x1b[31m✖\x1b[39m error parsing def/city/x.sii\n"
             "\x1b[31m✖\x1b[39m [ { offset: 40,\n    line: 3,\n    column: 9,\n    length: 1,\n"
             "    message: 'unexpected character: ->„<- at offset: 40, skipped 1 characters.' } ]\n"
             "\x1b[33m⚠\x1b[39m skipping def/city/x.sii - failed to parse/validate: \n")
    assert _compactar(texto) == [
        "⚠ skipping def/city/x.sii - failed to parse/validate: "
        "unexpected character: ->„<- at offset: 40, skipped 1 characters.",
    ]


def test_un_archivo_que_no_parsea_y_corta_el_armado_queda_entero():
    """Es el error que hay que ver: sin el aviso de que se saltea, el bloque
    sale como vino, con el throw y su pila."""
    lineas = _compactar(NO_PARSEA_LOCALE + "\n".join(FATAL) + "\n")
    assert lineas[0] == "✖ error parsing locale/de_de/local_module.trigger_actions.sii"
    assert lineas[1].startswith("✖ \tval[]: „Zur Erinnerung")
    assert lineas[3] == "✖ [ { NoViableAltException: Expecting: one of these possible Token sequences:"
    assert "  but found: 'tzt'" in lineas
    assert lineas[-len(FATAL):] == FATAL
    assert len(lineas) == NO_PARSEA_LOCALE.count("\n") + len(FATAL)


def test_un_ferry_vacio_que_no_valida_queda_en_una_linea():
    """El JSON de un archivo sin nada es "{}" en una linea, y el aviso de los
    ferry nombra el archivo sin la carpeta (4.969 asi en #135)."""
    texto = ("\x1b[31m✖\x1b[39m error validating def/ferry/connection/calais_merak.sii\n{}\n"
             "\x1b[31m✖\x1b[39m data must have required property 'ferryConnection'\n"
             "\x1b[31m✖\x1b[39m [ { instancePath: '',\n    schemaPath: '#/required',\n    keyword: 'required',\n"
             "    params: { missingProperty: 'ferryConnection' },\n"
             "    message: \"must have required property 'ferryConnection'\" } ]\n"
             "\x1b[33m⚠\x1b[39m skipping ferry connection calais_merak.sii - failed to parse/validate: \n\n"
             "    at convertSiiToJson (/C:/x:1:1)\n")
    assert _compactar(texto) == [
        "⚠ skipping ferry connection calais_merak.sii - failed to parse/validate: "
        "data must have required property 'ferryConnection'",
    ]


def test_el_aviso_de_otro_archivo_no_cierra_el_bloque():
    otro = NO_PARSEA.replace("ARCHIVO", "aomori_hakodate").replace(
        "skipping ferry connection aomori_hakodate.sii", "skipping ferry connection hakodate_aomori.sii")
    lineas = _compactar(otro)
    assert lineas[0] == "✖ error parsing def/ferry/connection/aomori_hakodate.sii"
    assert lineas[-1] == "⚠ skipping ferry connection hakodate_aomori.sii - failed to parse/validate: "


def _programa(tmp_path, cuerpo):
    script = tmp_path / "parser.py"
    script.write_text(cuerpo, encoding="utf-8")
    return [sys.executable, str(script)]


def test_correr_pasa_la_salida_del_armador_por_el_filtro(tmp_path):
    salida = _salteado("tyres") + "\x1b[31m✖\x1b[39m Error: se corto\n"
    cmd = _programa(tmp_path, f"import sys\nsys.stdout.buffer.write({salida.encode('utf-8')!r})\nsys.exit(3)\n")
    log = tmp_path / "build.log"
    with pytest.raises(RuntimeError, match=r"parser\.py failed \(exit 3\)"):
        map_builder._correr(cmd, str(log), threading.Event(), dict(os.environ))
    assert log.read_text(encoding="utf-8").splitlines()[2:] == [
        "⚠ skipping def/company/acc/out/tyres.sii - failed to parse/validate: "
        'data/cargoDef/.tyres/cargo must match pattern "^cargo\\.[0-9a-zA-Z_.]{1,40}$"',
        "✖ Error: se corto",
    ]


def test_cancelar_corta_el_paso_aunque_no_escriba_nada(tmp_path):
    cmd = _programa(tmp_path, "import sys, time\nprint('arranco', flush=True)\ntime.sleep(60)\n")
    log = tmp_path / "build.log"
    cancel = threading.Event()
    threading.Timer(1.0, cancel.set).start()
    with pytest.raises(map_builder.BuildCancelled):
        map_builder._correr(cmd, str(log), cancel, dict(os.environ))
    assert "arranco" in log.read_text(encoding="utf-8")


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
        r, cuerpo = _pedir(srv, "/localmap/ats/local_ats/Cities.json?v=abc", {"Origin": "https://trucksim-dash.com"})
        assert r.status == 200 and cuerpo == b"[]"
        # trucksim-dash.com en la misma PC lee el mapa armado; otra web no (19-10)
        assert r.getheader("Access-Control-Allow-Origin") == "https://trucksim-dash.com"
        r, _ = _pedir(srv, "/localmap/ats/local_ats/Cities.json", {"Origin": "https://evil.example"})
        assert r.status == 200 and r.getheader("Access-Control-Allow-Origin") is None
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
        r, _ = _pedir(srv, "/localmap/ats/vector/local_ats.pmtiles", {"Origin": "https://trucksim-dash.com",
                      "Access-Control-Request-Private-Network": "true"}, "OPTIONS")
        assert r.status == 204
        assert r.getheader("Access-Control-Allow-Private-Network") == "true"
        assert r.getheader("Access-Control-Allow-Origin") == "https://trucksim-dash.com"
    finally:
        srv.shutdown()


def test_el_mapa_local_sirve_los_logos_como_png(tmp_path):
    """El buscador los usa en un <img>: con octet-stream no es seguro que el
    navegador los muestre."""
    srv = _servidor(tmp_path)
    (tmp_path / "mapa" / "company-icons").mkdir()
    (tmp_path / "mapa" / "company-icons" / "mod_co.png").write_bytes(b"\x89PNG")
    try:
        r, cuerpo = _pedir(srv, "/localmap/ats/company-icons/mod_co.png", {"Origin": "https://trucksim-dash.com"})
        assert r.status == 200 and cuerpo == b"\x89PNG"
        assert r.getheader("Content-Type") == "image/png"
        assert r.getheader("Access-Control-Allow-Origin") == "https://trucksim-dash.com"
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


def test_pois_sin_el_surtidor_de_los_garajes(tmp_path):
    """Cada garaje trae un surtidor en el prefab y salia como estacion de
    servicio, comprado o no; en el juego solo anda en los garajes propios
    agrandados, y la web no sabe cuales son (Discord 23-10). Se saca el del
    mismo prefab que el garaje, con la carpeta que sea (mods); el de una
    estacion de al lado queda."""
    import json
    from mapbuild import pois
    (tmp_path / "usa-pois.json").write_text(json.dumps([
        {"x": 100, "y": 100, "type": "facility", "icon": "garage_large_ico", "prefabUid": "g1", "prefabPath": "prefab/garage_player/garage_medium_01.ppd"},
        {"x": 120, "y": 130, "type": "facility", "icon": "gas_ico", "prefabUid": "g1", "prefabPath": "prefab/garage_player/garage_medium_01.ppd"},
        {"x": 5000, "y": 100, "type": "facility", "icon": "garage_large_ico", "prefabUid": "g2", "prefabPath": "prefab/garage/c2c_garage.ppd"},
        {"x": 5020, "y": 110, "type": "facility", "icon": "gas_ico", "prefabUid": "g2", "prefabPath": "prefab/garage/c2c_garage.ppd"},
        {"x": 250, "y": 100, "type": "facility", "icon": "gas_ico", "prefabUid": "e1", "prefabPath": "prefab/gas/us_gas_driver_truck_5rows_roof.ppd"},
    ]))
    datos = pois.build(str(tmp_path), "usa")
    assert sorted(datos["facilities"]) == sorted([[100, 100, "r"], [5000, 100, "r"], [250, 100, "g"]])


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

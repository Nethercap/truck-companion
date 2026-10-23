"""Tests de tmp_players.py: el bloque de los jugadores de TruckersMP que
publica el plugin (truckersmp_players.hpp). Con la DLL de verdad lo prueba
tools/probar_plugin.py, con un TMP de mentira."""

import os
import re

import tmp_players

AHORA = 1_000_000


def bloque(jugadores=(), revision=tmp_players.REVISION, sequence=4, tick=AHORA - 100, conectado=True, cuantos=None):
    datos = bytearray(tmp_players.TAMANO)
    tmp_players.CABECERA.pack_into(datos, 0, revision, sequence, tick, 2, 1, 1 if conectado else 0,
                                   len(jugadores) if cuantos is None else cuantos, 0)
    for i, (x, z, ident, rumbo, velocidad, nombre) in enumerate(jugadores):
        tmp_players.JUGADOR.pack_into(datos, tmp_players.CABECERA.size + i * tmp_players.JUGADOR.size,
                                      x, 1.5, z, 5000 + ident, ident, rumbo, velocidad, 10.0 * i,
                                      nombre.encode("utf-8"))
    return bytes(datos)


def test_lee_los_jugadores_como_los_espera_la_web():
    """El rumbo del SDK (<0,1) antihorario desde el norte) pasa a grados de
    brujula, la velocidad a km/h y el nombre UTF-8 hasta el primer NUL."""
    datos = bloque([(100.04, -50.06, 7, 0.25, 10.0, "Ana"), (-20.0, 30.0, 9, 0.0, 5.0, "Łukasz")])
    assert tmp_players.parsear(datos, AHORA) == [
        {"id": 7, "name": "Ana", "x": 100.0, "z": -50.1, "heading": 270, "speedKmh": 36},
        {"id": 9, "name": "Łukasz", "x": -20.0, "z": 30.0, "heading": 0, "speedKmh": 18},
    ]


def test_rumbos_de_brujula():
    rumbos = [tmp_players.parsear(bloque([(0, 0, 1, r, 0, "a")]), AHORA)[0]["heading"]
              for r in (0.0, 0.25, 0.5, 0.75, 0.999)]
    assert rumbos == [0, 270, 180, 90, 0]


def test_sin_servidor_es_una_lista_vacia():
    """TMP esta abierto pero no conectado: nadie cerca, y la web borra los
    que tenia."""
    assert tmp_players.parsear(bloque([(0, 0, 1, 0, 0, "a")], conectado=False), AHORA) == []


def test_no_sirve_un_bloque_a_medias_viejo_o_de_otra_revision():
    jugadores = [(0, 0, 1, 0, 0, "a")]
    assert tmp_players.parsear(bloque(jugadores, sequence=5), AHORA) is None  # escribiendo
    assert tmp_players.parsear(bloque(jugadores, revision=2), AHORA) is None
    assert tmp_players.parsear(bloque(jugadores, tick=0), AHORA) is None  # nunca escrito
    # TMP se cerro: el bloque sigue con lo ultimo mientras lo tengamos abierto.
    assert tmp_players.parsear(bloque(jugadores, tick=AHORA - tmp_players.VIEJO_MS - 1), AHORA) is None
    assert tmp_players.parsear(bloque(jugadores)[:-1], AHORA) is None


def test_manda_solo_los_mas_cercanos():
    """El plugin los deja del mas cercano al mas lejano: a la web van los
    primeros A_LA_WEB, y un count de mas no lee afuera del bloque."""
    muchos = [(i, i, i, 0, 0, f"j{i}") for i in range(tmp_players.MAXIMO)]
    lista = tmp_players.parsear(bloque(muchos), AHORA)
    assert [j["id"] for j in lista] == list(range(tmp_players.A_LA_WEB))
    assert len(tmp_players.parsear(bloque(muchos, cuantos=1000), AHORA)) == tmp_players.A_LA_WEB


def test_un_nombre_largo_cortado_en_medio_de_una_letra_no_rompe():
    datos = bytearray(bloque([(0, 0, 1, 0, 0, "x")]))
    inicio = tmp_players.CABECERA.size + tmp_players.JUGADOR.size - 64
    datos[inicio:inicio + 64] = ("a" * 62).encode() + "ł".encode()[:1] + b"\0"
    assert tmp_players.parsear(bytes(datos), AHORA)[0]["name"].startswith("a" * 62)


def test_fuera_de_windows_no_hay_truckersmp(monkeypatch):
    monkeypatch.setattr(tmp_players, "IS_WINDOWS", False)
    assert tmp_players.Lector().leer() is None


def test_sin_truckersmp_el_lector_no_encuentra_el_bloque():
    """Sin TMP nadie crea "Local\\TruckDashTMP": el lector no lo crea (seria
    un bloque vacio) y dice que no hay."""
    lector = tmp_players.Lector()
    assert lector.leer() is None
    lector.cerrar()


def test_la_disposicion_es_la_del_plugin():
    """tmp_players.py y truckersmp_players.hpp tienen que coincidir: el
    nombre del bloque, la revision, el maximo y los tamanos."""
    ruta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "plugin", "scs-telemetry", "inc", "truckersmp_players.hpp")
    with open(ruta, encoding="utf-8") as f:
        hpp = f.read()

    def define(nombre):
        return re.search(rf"#define {nombre} (.+)", hpp).group(1).strip()

    assert define("TMP_PLAYERS_MMF_NAME") == 'L"' + tmp_players.NOMBRE.replace("\\", "\\\\") + '"'
    assert int(define("TMP_PLAYERS_REVISION")) == tmp_players.REVISION
    assert int(define("TMP_PLAYERS_MAX")) == tmp_players.MAXIMO
    assert int(define("TMP_PLAYERS_NAME_SIZE")) == 64
    assert "sizeof(tmpPlayer_t) == %d" % tmp_players.JUGADOR.size in hpp
    assert "40 + 112 * TMP_PLAYERS_MAX" in hpp and tmp_players.CABECERA.size == 40

"""Flechas de carril del constructor del grafo (prefab_lane_table y
write_lanes en mapbuild): que carril lleva a cada salida de un cruce."""
import math
import struct

from mapbuild.build_route_graph import FLECHAS, prefab_lane_table
from mapbuild.route_graph_bin import write_lanes

L, LS, S, RS, R = (FLECHAS[k] for k in ("left", "slight_left", "straight", "slight_right", "right"))
NORTE, OESTE, ESTE = -math.pi / 2, math.pi, 0.0  # x este, y sur


def curva(x0, y0, rot0, x1, y1, rot1, siguientes=()):
    return {"start": {"x": x0, "y": y0, "rotation": rot0}, "end": {"x": x1, "y": y1, "rotation": rot1},
            "nextLines": list(siguientes)}


def cruce():
    """Se entra por el sur (nodo 0) yendo al norte, con tres carriles: el
    de la izquierda dobla a la izquierda (nodo 1), el del medio sigue (nodo
    2) y el de la derecha sigue o dobla a la derecha (nodo 3). inputLanes
    viene desordenado a proposito: el orden sale de la posicion."""
    curvas = [
        curva(-4.5, 0, NORTE, -20, -15, OESTE),           # 0: izquierda -> oeste
        curva(0, 0, NORTE, 0, -30, NORTE),                # 1: medio -> norte
        curva(4.5, 0, NORTE, 4.5, -5, NORTE, (3, 4)),     # 2: derecha, se abre
        curva(4.5, -5, NORTE, 4.5, -30, NORTE),           # 3: ... sigue al norte
        curva(4.5, -5, NORTE, 20, -10, ESTE),             # 4: ... o dobla al este
    ]
    nodos = [
        {"inputLanes": [2, 0, 1], "outputLanes": []},
        {"inputLanes": [], "outputLanes": [0]},
        {"inputLanes": [], "outputLanes": [1, 3]},
        {"inputLanes": [], "outputLanes": [4]},
    ]
    return {"nodes": nodos, "navCurves": curvas}


def test_que_carril_lleva_a_cada_salida():
    t = prefab_lane_table(cruce())
    flechas = (L, S, S | R)
    assert t[(0, 1)] == (3, 0b001, flechas, L)
    assert t[(0, 2)] == (3, 0b110, flechas, S)
    assert t[(0, 3)] == (3, 0b100, flechas, R)


def test_si_todos_los_carriles_sirven_no_hay_nada_que_avisar():
    d = cruce()
    # Los tres carriles siguen derecho: ninguna salida restringe
    d["navCurves"][0] = curva(-4.5, 0, NORTE, -4.5, -30, NORTE)
    d["nodes"][2]["outputLanes"] = [0, 1, 3]
    d["nodes"][1]["outputLanes"] = []
    t = prefab_lane_table(d)
    assert (0, 2) not in t
    assert t[(0, 3)][1] == 0b100  # doblar a la derecha si: solo el de la derecha


def test_un_carril_que_se_abre_en_dos_es_un_solo_carril():
    d = cruce()
    # Otra curva que arranca en el mismo lugar que la del medio
    d["navCurves"].append(curva(0.3, 0, NORTE, 20, -10, ESTE))
    d["nodes"][0]["inputLanes"].append(5)
    d["nodes"][3]["outputLanes"].append(5)
    t = prefab_lane_table(d)
    assert t[(0, 3)][0] == 3 and t[(0, 3)][1] == 0b110


def test_una_salida_de_autopista_es_suave_y_no_derecho():
    """Dos salidas casi derechas: la que se abre va como suave a la derecha."""
    rampa = math.radians(-90 + 15)
    d = {"navCurves": [curva(0, 0, NORTE, 0, -100, NORTE), curva(4.5, 0, NORTE, 15, -100, rampa)],
         "nodes": [{"inputLanes": [0, 1], "outputLanes": []},
                   {"inputLanes": [], "outputLanes": [0]},
                   {"inputLanes": [], "outputLanes": [1]}]}
    t = prefab_lane_table(d)
    assert t[(0, 2)] == (2, 0b10, (S, RS), RS)
    assert t[(0, 1)] == (2, 0b01, (S, RS), S)


def test_el_archivo_va_por_arista_y_sentido(tmp_path):
    nodos = [[0, 0], [10, 0], [20, 0]]
    # arista 0: doble mano; arista 1: solo de 1 a 2; arista 2: ferry
    aristas = [[0, 1, 10, 0, 1], [1, 2, 10, 2, 1], [0, 2, 20, 1, 1]]
    registros = {(1, 0): (2, 0b01, (L, S), L), (1, 2): (3, 0b100, (L, S, R), R),
                 (2, 1): (2, 0b10, (S, R), R), (0, 2): (2, 0b01, (S, R), S)}
    ruta = tmp_path / "x-lanes.bin"
    assert write_lanes(nodos, aristas, registros, str(ruta)) == {"entradas": 2}
    buf = ruta.read_bytes()
    assert buf[:4] == b"TDLN"
    ver, nn, ne, n = struct.unpack_from("<IIII", buf, 4)
    assert (ver, nn, ne, n) == (1, 3, 3, 2)
    claves = struct.unpack_from("<2I", buf, 20)
    # (1, 0) es la arista 0 al reves; (1, 2) la 1 de ida. (2, 1) no: es de
    # un solo sentido. El ferry tampoco.
    assert claves == (0 * 2 + 1, 1 * 2)
    off = 28
    assert buf[off:off + 2] == bytes([2, 3])            # carriles
    assert buf[off + 4:off + 6] == bytes([0b01, 0b100])  # mascara
    assert buf[off + 8:off + 10] == bytes([L, R])        # giro
    flechas = buf[off + 12:off + 28]
    assert flechas[:8] == bytes([L, S, 0, 0, 0, 0, 0, 0])
    assert flechas[8:] == bytes([L, S, R, 0, 0, 0, 0, 0])

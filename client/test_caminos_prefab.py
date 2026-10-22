"""Caminos entre los nodos de un prefab (prefab_nav_paths en mapbuild) y de
que prefab es cada arista (write_prefabs): por el grafo de navNodes del
juego, sin pasar por un tercer nodo del prefab."""
import struct

from mapbuild.build_route_graph import prefab_nav_paths
from mapbuild.route_graph_bin import write_prefabs


def curva(x0, y0, x1, y1):
    return {"start": {"x": x0, "y": y0, "rotation": 0}, "end": {"x": x1, "y": y1, "rotation": 0}, "nextLines": []}


def fisico(nodo, *conexiones):
    return {"type": "physical", "endIndex": nodo,
            "connections": [{"targetNavNodeIndex": t, "curveIndices": c} for t, c in conexiones]}


def test_no_se_pasa_por_otro_nodo_del_prefab():
    # Donde una autovia pasa a ser de doble mano (Kiel, ProMods, 22-10): la
    # calzada que llega (nodo 0) va a la calle de doble mano (nodo 1), y de
    # ahi sale la calzada que vuelve (nodo 2). De 0 a 2 seria entrar a la
    # calle del nodo 1 y darse vuelta.
    desc = {
        "navCurves": [curva(-2, 0, 0, 20), curva(0, 20, 2, 0)],
        "navNodes": [fisico(0, (1, [0])), fisico(1, (2, [1])), fisico(2)],
    }
    caminos = prefab_nav_paths(desc)
    assert set(caminos) == {(0, 1), (1, 2)}
    assert caminos[(0, 1)][0] == [0]


def test_los_nodos_de_adentro_si():
    # Un nodo "ai" (adentro del prefab) es parte del camino
    desc = {
        "navCurves": [curva(0, 0, 0, 10), curva(0, 10, 10, 10)],
        "navNodes": [fisico(0, (2, [0])), fisico(1),
                     {"type": "ai", "connections": [{"targetNavNodeIndex": 1, "curveIndices": [1]}]}],
    }
    caminos = prefab_nav_paths(desc)
    assert caminos[(0, 1)] == ([0, 1], 20.0)


def test_prefabs_un_color_por_prefab_distinto_de_los_vecinos(tmp_path):
    # Prefab 7 con los nodos 0, 1, 2; prefab 9 con 2 y 3 (comparte el 2);
    # prefab 4 con 5 y 6 (suelto); una calle 3 - 5 y un ferry 6 - 0.
    nodos = [[0, 0]] * 7
    aristas = [[0, 1, 10, 2, 1], [1, 2, 10, 2, 1], [2, 0, 10, 0, 1], [2, 3, 10, 0, 1],
               [3, 5, 100, 0, 6], [5, 6, 10, 0, 1], [6, 0, 900, 1, 80]]
    prefab = [7, 7, 7, 9, 0, 4, 0]
    ruta = tmp_path / "g-prefabs.bin"
    stats = write_prefabs(nodos, aristas, prefab, str(ruta))
    assert stats == {"aristas": 7, "de_prefab": 5, "prefabs": 3, "colores": 2}
    buf = ruta.read_bytes()
    assert buf[:4] == b"TDPF"
    assert struct.unpack_from("<III", buf, 4) == (1, 7, 7)
    color = struct.unpack_from("<7B", buf, 16)
    assert color[0] == color[1] == color[2] != 0
    assert color[3] not in (0, color[0])  # comparte el nodo 2
    assert color[4] == color[6] == 0
    assert color[5] != 0
    assert len(buf) % 4 == 0

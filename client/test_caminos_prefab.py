"""Caminos entre los nodos de un prefab (prefab_nav_paths en mapbuild) y de
que prefab es cada arista (write_prefabs): por el grafo de navNodes del
juego, sin pasar por un tercer nodo del prefab."""
import json
import math
import struct

from mapbuild import build_route_graph
from mapbuild.build_route_graph import prefab_nav_paths
from mapbuild.route_graph_bin import write_prefabs


def curva(x0, y0, x1, y1, rot=0):
    return {"start": {"x": x0, "y": y0, "rotation": rot}, "end": {"x": x1, "y": y1, "rotation": rot}, "nextLines": []}


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


def armar(tmp_path, nodos, calles, prefabs, descripciones=()):
    """Corre el constructor con un mapa chico. nodos: {uid: (x, y)}; calles:
    (desde, hasta, doble) con doble=False de un solo sentido de desde a hasta.
    Devuelve las aristas por coordenadas: {((xa, ya), (xb, yb)): (metros,
    flags, segundos)}."""
    looks = [{"token": "doble", "lanesLeft": ["traffic_lane.road.local"],
              "lanesRight": ["traffic_lane.road.local"], "offset": 0},
             {"token": "una", "lanesLeft": [], "lanesRight": ["traffic_lane.road.local"], "offset": 0}]
    roads = []
    for i, (a, b, doble) in enumerate(calles):
        (xa, ya), (xb, yb) = nodos[a], nodos[b]
        roads.append({"uid": f"r{i}", "startNodeUid": a, "endNodeUid": b, "length": math.dist((xa, ya), (xb, yb)),
                      "roadLookToken": "doble" if doble else "una", "x": (xa + xb) / 2, "y": (ya + yb) / 2})
    archivos = {
        "nodes": [{"uid": u, "x": x, "y": y, "z": 0, "rotation": 0} for u, (x, y) in nodos.items()],
        "roads": roads, "prefabs": prefabs, "prefabDescriptions": list(descripciones),
        "roadLooks": looks, "cities": [], "companies": [], "ferries": [],
    }
    for nombre, datos in archivos.items():
        (tmp_path / f"usa-{nombre}.json").write_text(json.dumps(datos), encoding="utf-8")
    salida = tmp_path / "g.json"
    build_route_graph.main(["", str(tmp_path), "usa", str(salida)])
    g = json.loads(salida.read_text(encoding="utf-8"))
    xy = [tuple(n) for n in g["nodes"]]
    return {(xy[e[0]], xy[e[1]]): (e[2], e[3], e[4]) for e in g["edges"]}


def test_sin_navcurves_no_se_va_de_contramano(tmp_path):
    # Un prefab sin descripcion con tres nodos: A con una calle de doble mano,
    # B con una de un solo sentido que sale del prefab y C con una que llega.
    # Antes eran todos contra todos de doble sentido: se podia entrar por B o
    # salir por C, de contramano. Las calles cierran la vuelta B -> C.
    nodos = {"n1": (0, 0), "A": (100, 0), "B": (200, 0), "C": (150, 80), "n5": (300, 0), "n6": (150, 200)}
    calles = [("n1", "A", True), ("B", "n5", False), ("n6", "C", False), ("n5", "n6", True)]
    prefab = {"uid": "p1", "token": "sin_desc", "nodeUids": ["A", "B", "C"], "originNodeIndex": 0, "x": 150, "y": 30}
    aristas = armar(tmp_path, nodos, calles, [prefab])
    A, B, C = (100, 0), (200, 0), (150, 80)
    de_prefab = {k: v for k, v in aristas.items() if set(k) <= {A, B, C}}
    assert set(de_prefab) == {(A, B), (C, A), (C, B)}
    assert all(flags & 2 for _m, flags, _s in de_prefab.values())


def test_sin_navcurves_con_calles_de_doble_mano_sigue_igual(tmp_path):
    nodos = {"n1": (0, 0), "A": (100, 0), "B": (200, 0), "C": (150, 80), "n5": (300, 0), "n6": (150, 200)}
    calles = [("n1", "A", True), ("B", "n5", True), ("n6", "C", True)]
    prefab = {"uid": "p1", "token": "sin_desc", "nodeUids": ["A", "B", "C"], "originNodeIndex": 0, "x": 150, "y": 30}
    aristas = armar(tmp_path, nodos, calles, [prefab])
    A, B, C = (100, 0), (200, 0), (150, 80)
    de_prefab = {k: v for k, v in aristas.items() if set(k) <= {A, B, C}}
    assert len(de_prefab) == 3
    assert not any(flags & 2 for _m, flags, _s in de_prefab.values())


def test_el_largo_es_el_de_nodo_a_nodo(tmp_path):
    # Los carriles (navCurves) van de x=102 a x=138, al costado del eje, y
    # los nodos estan en x=100 y x=140: el paso mide 40 m, no los 36 de la
    # curva.
    nodos = {"n1": (0, 0), "A": (100, 0), "B": (140, 0), "n4": (240, 0)}
    calles = [("n1", "A", True), ("B", "n4", True)]
    desc = {
        "token": "recto",
        "nodes": [{"x": 100, "y": 0, "rotation": 0}, {"x": 140, "y": 0, "rotation": math.pi}],
        "navCurves": [curva(102, 2, 138, 2), curva(138, -2, 102, -2, math.pi)],
        "navNodes": [fisico(0, (1, [0])), fisico(1, (0, [1]))],
    }
    prefab = {"uid": "p1", "token": "recto", "nodeUids": ["A", "B"], "originNodeIndex": 0, "x": 120, "y": 0}
    aristas = armar(tmp_path, nodos, calles, [prefab], [desc])
    largo, flags, segundos = aristas.get(((100, 0), (140, 0))) or aristas[((140, 0), (100, 0))]
    assert flags & 2 == 0
    assert largo == 40.0
    assert segundos == 3.6

"""Muestreo de las curvas de prefab al armar el grafo (curve_pasos y
curve_chain_points en mapbuild): una esquina sigue como antes y un lazo de
trebol lleva puntos suficientes para que no se dibuje como una punta."""
import math

from mapbuild.build_route_graph import CURVA_PASOS_MAX, curve_chain_points, curve_pasos


def test_pasos_segun_lo_que_gira():
    # Recta o esquina chica: los 3 de siempre (los grafos no cambian)
    assert curve_pasos(0.0) == 3 and curve_pasos(math.radians(20)) == 3
    # Una esquina de 90: uno cada 10 grados
    assert curve_pasos(math.radians(90)) == 10
    # Un lazo: con tope
    assert curve_pasos(math.radians(179)) == CURVA_PASOS_MAX


def test_un_giro_cerrado_queda_con_puntos_de_sobra():
    # Media vuelta de radio 30 en una sola navCurve (como la punta de un lazo)
    curva = {"start": {"x": 0.0, "y": 0.0, "rotation": 0.0},
             "end": {"x": 0.0, "y": 60.0, "rotation": math.pi}}
    pts = curve_chain_points({"navCurves": [curva]}, [0])
    # Sin tramos mas largos que un cuarto del recorrido: antes eran 3
    largos = [math.dist(a, b) for a, b in zip(pts, pts[1:])]
    assert len(pts) >= 15 and max(largos) < sum(largos) / 4
    # Una esquina comun sigue con los mismos puntos que antes
    esquina = {"start": {"x": 0.0, "y": 0.0, "rotation": 0.0},
               "end": {"x": 20.0, "y": 5.0, "rotation": math.radians(15)}}
    assert len(curve_chain_points({"navCurves": [esquina]}, [0])) == 4

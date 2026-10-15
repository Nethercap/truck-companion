"""Decimas de segundo de cada arista (write_times en mapbuild): el .bin
guarda los segundos enteros y la web suma estas decimas para desempatar."""
import struct

from mapbuild.route_graph_bin import write_times


def test_las_decimas_que_el_entero_tira(tmp_path):
    nodos = [[0, 0], [63, 0], [31.5, 20]]
    # [a, b, metros, flags, segundos]: la recta del cruce y las dos curvas del brazo
    aristas = [[0, 1, 63.0, 0, 5.7], [0, 2, 34.0, 2, 3.1], [2, 1, 34.0, 2, 3.1], [1, 2, 10.0, 0, 2.5], [0, 2, 9e4, 1, 70000.0]]
    ruta = tmp_path / "g-times.bin"
    assert write_times(nodos, aristas, str(ruta)) == {"aristas": 5, "con_decimas": 4}
    buf = ruta.read_bytes()
    assert buf[:4] == b"TDTS"
    assert struct.unpack_from("<III", buf, 4) == (1, 3, 5)
    decimas = struct.unpack_from("<5b", buf, 16)
    # 5.7 -> 6 - 0.3; 3.1 -> 3 + 0.1; 2.5 -> 2 (redondeo de Python) + 0.5; el tope de 65535 s, sin decimas
    assert decimas == (-3, 1, 1, 5, 0)
    assert len(buf) % 4 == 0

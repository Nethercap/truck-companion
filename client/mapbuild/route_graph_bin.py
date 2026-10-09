"""Formato binario del grafo de rutas ("TDRG" v2) para que la web lo use como
typed arrays sin parsear JSON: el JSON de 27 MB se volvia ~150 MB de objetos
de JS y tumbaba la pestana en tablets con poca RAM. Mismo contenido que el
JSON (aristas no dirigidas + flags), la web arma la adyacencia (CSR) sola.

Layout (little-endian, cada seccion alineada a 4 bytes):
  header   'TDRG', u32 version=2, u32 nNodes, u32 nEdges, u32 nMidPts, u32 nComp
  nodesXY  i32[nNodes*2]      x, y en decimetros (coords crudas del juego * 10)
  edgeA    u32[nEdges]        nodo a
  edgeB    u32[nEdges]        nodo b
  edgeM    u32[nEdges]        metros * 10
  edgeS    u16[nEdges] (+pad) segundos (tiempo tipico de camion, tope 65535)
  edgeF    u8[nEdges] (+pad)  flags: bit 0 = ferry/tren, bit 1 = un solo sentido (solo a -> b)
  midOff   u32[nEdges+1]      puntos intermedios de la arista e: [midOff[e], midOff[e+1]) en midXY
  midXY    i32[nMidPts*2]     decimetros, codificados como delta respecto del punto anterior (global)
  degree   u8[nNodes] (+pad)  vecinos distintos (sin sentido), tope 255
  compId   i32[nNodes]        componente conexa (0..nComp-1)
  compSize u32[nComp]         nodos por componente

v3 agrega al final shiftA, shiftB (i8[nEdges] cada uno, +pad) y, desde el
07-10-2026, edgeG u8[nEdges] (+pad): el dlcGuard de cada arista (bits 2 a 7
de flags en las aristas del constructor). Un lector viejo de v3 corta en las
corridas y no se entera; uno nuevo sabe que esta por el largo del archivo.

Uso como libreria: write_bin(node_list, edges, path). Suelto:
  python route_graph_bin.py <grafo.json> <salida.bin>   (convierte un JSON existente)
  python route_graph_bin.py --info <archivo.bin>
"""
import json
import struct
import sys
from array import array


def _pad4(b: bytes) -> bytes:
    return b + b"\0" * ((4 - len(b) % 4) % 4)


def _le(arr):
    if sys.byteorder != "little":
        arr.byteswap()
    return arr


def _i8(values):
    """Metros con signo -> medios metros en un byte (tope +-63,5 m)."""
    return bytes((max(-127, min(127, int(round(v * 2)))) & 0xFF) for v in values)


def write_bin(node_list, edges, path, shifts=None):
    """shifts: [(corrida en a, corrida en b)] por arista, en metros, o None.
    Con shifts sale la version 3: la misma de siempre mas dos secciones al
    final (shiftA, shiftB: i8 en medios metros), que dicen cuanto hay que
    correr la ruta dibujada hacia la mano por la que se va en cada punta de
    la arista (+ derecha / - izquierda del sentido de marcha). Un lector de
    la version 2 no las lee y no se entera."""
    n = len(node_list)
    nodes_xy = array("i")
    for x, y in node_list:
        nodes_xy.append(int(round(x * 10))); nodes_xy.append(int(round(y * 10)))
    ea, eb, em, es = array("I"), array("I"), array("I"), array("H")
    ef = bytearray()
    mid_off = array("I", [0])
    mid_xy = array("i")
    px = py = 0
    neigh = [set() for _ in range(n)]
    for e in edges:
        a, b, m, flags, s = int(e[0]), int(e[1]), float(e[2]), int(e[3] or 0), float(e[4])
        ea.append(a); eb.append(b); em.append(int(round(m * 10))); es.append(min(65535, int(round(s))))
        ef.append(flags & 3)
        mid = e[5] if len(e) > 5 and e[5] else None
        if mid:
            for mx, my in mid:
                ix, iy = int(round(mx * 10)), int(round(my * 10))
                mid_xy.append(ix - px); mid_xy.append(iy - py)
                px, py = ix, iy
        mid_off.append(len(mid_xy) // 2)
        neigh[a].add(b); neigh[b].add(a)
    degree = bytes(min(255, len(s)) for s in neigh)
    comp = array("i", [-1] * n)
    sizes = []
    for start in range(n):
        if comp[start] != -1:
            continue
        cid = len(sizes); size = 0
        stack = [start]; comp[start] = cid
        while stack:
            cur = stack.pop(); size += 1
            for nb in neigh[cur]:
                if comp[nb] == -1:
                    comp[nb] = cid; stack.append(nb)
        sizes.append(size)
    comp_size = array("I", sizes)
    with open(path, "wb") as f:
        version = 3 if shifts is not None else 2
        f.write(b"TDRG" + struct.pack("<IIIII", version, n, len(ea), len(mid_xy) // 2, len(sizes)))
        f.write(_le(nodes_xy).tobytes())
        f.write(_le(ea).tobytes()); f.write(_le(eb).tobytes()); f.write(_le(em).tobytes())
        f.write(_pad4(_le(es).tobytes())); f.write(_pad4(bytes(ef)))
        f.write(_le(mid_off).tobytes()); f.write(_le(mid_xy).tobytes())
        f.write(_pad4(degree)); f.write(_le(comp).tobytes()); f.write(_le(comp_size).tobytes())
        if shifts is not None:
            assert len(shifts) == len(ea), "una corrida por arista"
            f.write(_pad4(_i8(s[0] for s in shifts)))
            f.write(_pad4(_i8(s[1] for s in shifts)))
            f.write(_pad4(bytes((int(e[3] or 0) >> 2) & 63 for e in edges)))
    out = {"nodes": n, "edges": len(ea), "mid_points": len(mid_xy) // 2, "components": len(sizes), "giant": max(sizes) if sizes else 0}
    if shifts is not None:
        out["con_corrida"] = sum(1 for sa, sb in shifts if sa or sb)
        out["con_dlc"] = sum(1 for e in edges if int(e[3] or 0) >> 2)
    return out


def info(path):
    with open(path, "rb") as f:
        head = f.read(24)
    magic, ver, n, ne, nmid, ncomp = struct.unpack("<4sIIIII", head)
    print(f"{path}: magic={magic} v{ver} nodes={n} edges={ne} midPts={nmid} comps={ncomp}")


if __name__ == "__main__":
    if sys.argv[1] == "--info":
        info(sys.argv[2])
    else:
        g = json.load(open(sys.argv[1], encoding="utf-8"))
        print(write_bin(g["nodes"], g["edges"], sys.argv[2]))

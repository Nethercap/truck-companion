"""
Preprocesa el output del parser de truckermudgeon/maps (usa-roads.json,
usa-prefabs.json, usa-nodes.json) para armar un grafo de rutas compacto,
navegable con A*/Dijkstra en el navegador.

- Las rutas simples (roads) conectan dos nodos con un peso = longitud real.
- Los prefabs (intersecciones complejas: rotondas, cruces de autopista, etc.)
  no traen la geometria interna exacta de conexion entre sus carriles, asi
  que se aproximan conectando cada par de sus nodos con una arista de peso =
  distancia en linea recta entre ellos. Es una simplificacion (la official
  truckermudgeon/maps tambien lo advierte: "muchas intersecciones salen mal"),
  pero alcanza para que el pathfinding elija la carretera correcta y cruce
  la intersección, aunque el trazo exacto dentro de la rotonda no sea 100% fiel.

Uso:
  python build_route_graph.py <carpeta_parser_output> <prefijo, ej. usa> <archivo_salida.json>
"""

import heapq
import json
import os
import math
import sys


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# Tolerancia entre el extremo de la cadena de curvas y el nodo del mapa. Las
# navCurves son el eje de un carril: en una calle de 3 carriles por mano el
# de paso arranca a 13,5 m del nodo, y con 12 m el derecho de esos cruces se
# perdia (Bakersfield, Gargamosch 10-10). 20 m cubre 4 carriles de 4,5 m.
PREFAB_END_TOLERANCE_M = 20.0
# Respetar que giros permite cada cruce: los de un solo sentido se marcan y
# los que no existen se borran, con la red de seguridad de relax_turns para
# no dejar a nadie sin llegada. Con TRUCKDASH_ENFORCE_TURNS=flags se vuelve
# al modo conservador, que marca sentidos pero no borra nada.
ENFORCE_MODE = os.environ.get("TRUCKDASH_ENFORCE_TURNS", "full")
ENFORCE_TURNS = ENFORCE_MODE in ("full", "flags")


def rotate_right(items, count):
    """El indice de nodo de la descripcion del prefab no es el mismo que el de
    la instancia: hay que rotar la lista por originNodeIndex (igual que
    rotateRight en truckermudgeon/maps)."""
    items = list(items)
    count = count % len(items) if items else 0
    return items[-count:] + items[:-count] if count else items


def prefab_transform(prefab, desc, node_coords, node_rot):
    """Pasa un punto del espacio del prefab al del mapa. Portado de
    toMapPosition (packages/libs/map/prefabs.ts): el ancla es SIEMPRE
    nodeUids[0], y el angulo es la diferencia entre la rotacion de ese nodo en
    el mapa y la del nodo origen en la descripcion."""
    uids = prefab.get("nodeUids") or []
    origin_index = prefab.get("originNodeIndex", 0)
    nodes = desc.get("nodes") or []
    if not uids or origin_index >= len(nodes):
        return None
    anchor = uids[0]
    if anchor not in node_coords or node_rot.get(anchor) is None:
        return None
    origin_local = nodes[origin_index]
    ox, oy = node_coords[anchor]
    dx = ox - origin_local["x"]
    dy = oy - origin_local["y"]
    theta = node_rot[anchor] - origin_local.get("rotation", 0.0)
    sin_t, cos_t = math.sin(theta), math.cos(theta)

    def tx(px, py):
        x, y = px + dx, py + dy
        return (cos_t * (x - ox) - sin_t * (y - oy) + ox,
                sin_t * (x - ox) + cos_t * (y - oy) + oy)

    return tx


def _hermite(p0, d0, p1, d1, steps):
    """La curva entre dos puntos con sus tangentes. Con solo los extremos, un
    anillo de rotonda queda hecho de cuerdas; con esto sale redondo."""
    length = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
    m0 = (d0[0] * length, d0[1] * length)
    m1 = (d1[0] * length, d1[1] * length)
    out = []
    for i in range(1, steps):
        t = i / steps
        t2, t3 = t * t, t * t * t
        h00 = 2 * t3 - 3 * t2 + 1
        h10 = t3 - 2 * t2 + t
        h01 = -2 * t3 + 3 * t2
        h11 = t3 - t2
        out.append((h00 * p0[0] + h10 * m0[0] + h01 * p1[0] + h11 * m1[0],
                    h00 * p0[1] + h10 * m0[1] + h01 * p1[1] + h11 * m1[1]))
    return out


def curve_chain_points(desc, chain, steps=3):
    curves = desc.get("navCurves") or []
    pts = []
    for ci in chain:
        if ci >= len(curves):
            continue
        c = curves[ci]
        a, b = c["start"], c["end"]
        p0, p1 = (a["x"], a["y"]), (b["x"], b["y"])
        d0 = (math.cos(a.get("rotation", 0.0)), math.sin(a.get("rotation", 0.0)))
        d1 = (math.cos(b.get("rotation", 0.0)), math.sin(b.get("rotation", 0.0)))
        if not pts:
            pts.append(p0)
        pts.extend(_hermite(p0, d0, p1, d1, steps))
        pts.append(p1)
    return pts


def prefab_nav_paths(desc):
    """Camino mas corto entre cada par de nodos del prefab, sobre el grafo de
    navNodes. Devuelve {(nodoA, nodoB): (cadena de curvas, largo)}."""
    nav_nodes = desc.get("navNodes") or []
    curves = desc.get("navCurves") or []
    if not nav_nodes or not curves:
        return {}
    curve_len = [math.hypot(c["end"]["x"] - c["start"]["x"], c["end"]["y"] - c["start"]["y"])
                 for c in curves]
    physical = {i: n.get("endIndex") for i, n in enumerate(nav_nodes) if n.get("type") == "physical"}
    out = {}
    for src, src_node in physical.items():
        dist = {src: 0.0}
        prev = {}
        queue = [(0.0, src)]
        while queue:
            d, u = heapq.heappop(queue)
            if d > dist.get(u, float("inf")):
                continue
            for conn in nav_nodes[u].get("connections") or []:
                v = conn.get("targetNavNodeIndex")
                if v is None or v >= len(nav_nodes):
                    continue
                chain = conn.get("curveIndices") or []
                w = sum(curve_len[ci] for ci in chain if ci < len(curve_len)) or 0.1
                if d + w < dist.get(v, float("inf")):
                    dist[v] = d + w
                    prev[v] = (u, chain)
                    heapq.heappush(queue, (d + w, v))
        for dst, dst_node in physical.items():
            if dst == src or dst not in dist or src_node is None or dst_node is None:
                continue
            chain, cur = [], dst
            while cur != src:
                u, part = prev[cur]
                chain = list(part) + chain
                cur = u
            out[(src_node, dst_node)] = (chain, dist[dst])
    return out


def _simplify(points, tol):
    """Douglas-Peucker: la cadena de curvas trae mas puntos de los que hacen
    falta para dibujarla."""
    if len(points) < 3:
        return list(points)
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    tol2 = tol * tol
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        ax, ay = points[i]
        bx, by = points[j]
        ddx, ddy = bx - ax, by - ay
        den = ddx * ddx + ddy * ddy
        worst, wi = -1.0, -1
        for k in range(i + 1, j):
            px, py = points[k]
            if den == 0:
                d2 = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = ((px - ax) * ddx + (py - ay) * ddy) / den
                t = 0.0 if t < 0 else (1.0 if t > 1 else t)
                d2 = (px - ax - t * ddx) ** 2 + (py - ay - t * ddy) ** 2
            if d2 > worst:
                worst, wi = d2, k
        if worst > tol2:
            keep[wi] = True
            stack.append((i, wi))
            stack.append((wi, j))
    return [points[k] for k in range(len(points)) if keep[k]]


def align_to_nodes(points, start, end):
    """Corre la curva del carril para que empiece en `start` y termine en
    `end`, repartiendo la correccion a lo largo del recorrido.

    Las navCurves son el eje del CARRIL: arrancan unos metros al costado del
    nodo, que esta en el eje de la calle. Guardadas asi, un tramo recto quedaba
    como una "curva" corrida 4,5 m (mas que min_bulge) y la ruta dibujada iba
    del nodo al carril y del carril al nodo siguiente; recorrida al reves,
    encima, del lado del carril contrario. Con varios prefabs seguidos (una
    calle con entradas a empresas) eso era un serrucho de 4,5 y 9 m (ATS,
    Bozeman, 29-09-2026). Asi un tramo recto queda recto y una curva conserva
    su forma pero pasa por los nodos, como los tramos de ruta comun."""
    if len(points) < 2:
        return list(points)
    acum = [0.0]
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        acum.append(acum[-1] + math.hypot(x1 - x0, y1 - y0))
    total = acum[-1] or 1.0
    d0 = (start[0] - points[0][0], start[1] - points[0][1])
    d1 = (end[0] - points[-1][0], end[1] - points[-1][1])
    out = []
    for (x, y), s in zip(points, acum):
        t = s / total
        out.append((x + (1 - t) * d0[0] + t * d1[0], y + (1 - t) * d0[1] + t * d1[1]))
    return out


def prefab_mid_points(points, start, end, tol=2.5, min_bulge=4.0):
    """Saca los extremos (ya son los nodos), simplifica, y descarta la
    geometria si la curva no se aparta de la recta: un cruce comun no necesita
    puntos intermedios y son bytes en el grafo de todos."""
    if len(points) < 3:
        return None
    pts = _simplify(points, tol)
    ax, ay = start
    bx, by = end
    inner = [(x, y) for (x, y) in pts
             if math.hypot(x - ax, y - ay) > 1.5 and math.hypot(x - bx, y - by) > 1.5]
    if not inner:
        return None
    ddx, ddy = bx - ax, by - ay
    den = ddx * ddx + ddy * ddy
    bulge = 0.0
    for px, py in inner:
        if den == 0:
            d = math.hypot(px - ax, py - ay)
        else:
            t = ((px - ax) * ddx + (py - ay) * ddy) / den
            t = 0.0 if t < 0 else (1.0 if t > 1 else t)
            d = math.hypot(px - ax - t * ddx, py - ay - t * ddy)
        bulge = max(bulge, d)
    if bulge < min_bulge:
        return None
    return [(round(x, 1), round(y, 1)) for x, y in inner]



def _largest_scc(n, edges):
    """Nodos que estan en la componente fuertemente conexa mas grande, o sea
    la parte del mapa que se puede recorrer de ida y de vuelta. Las
    componentes "sin sentido" que se reportan al final no sirven para esto:
    dos nodos pueden estar unidos y no haber forma de ir de uno al otro."""
    from array import array

    def csr(reverse):
        cnt = array("i", bytes(4 * (n + 1)))
        for a, b, _m, flags, *_rest in edges:
            u, v = (b, a) if reverse else (a, b)
            cnt[u + 1] += 1
            if not (flags & 2):
                cnt[v + 1] += 1
        for i in range(n):
            cnt[i + 1] += cnt[i]
        adj = array("i", bytes(4 * cnt[n]))
        fill = array("i", cnt[:n])
        for a, b, _m, flags, *_rest in edges:
            u, v = (b, a) if reverse else (a, b)
            adj[fill[u]] = v
            fill[u] += 1
            if not (flags & 2):
                adj[fill[v]] = u
                fill[v] += 1
        return cnt, adj

    start, adj = csr(False)
    rstart, radj = csr(True)
    visited = bytearray(n)
    order = []
    for s0 in range(n):
        if visited[s0]:
            continue
        visited[s0] = 1
        stack = [(s0, start[s0])]
        while stack:
            u, i = stack[-1]
            if i < start[u + 1]:
                stack[-1] = (u, i + 1)
                v = adj[i]
                if not visited[v]:
                    visited[v] = 1
                    stack.append((v, start[v]))
            else:
                order.append(u)
                stack.pop()
    seen = bytearray(n)
    best_members, best_size = None, 0
    for s0 in reversed(order):
        if seen[s0]:
            continue
        members = []
        stack = [s0]
        seen[s0] = 1
        while stack:
            u = stack.pop()
            members.append(u)
            for i in range(rstart[u], rstart[u + 1]):
                v = radj[i]
                if not seen[v]:
                    seen[v] = 1
                    stack.append(v)
        if len(members) > best_size:
            best_members, best_size = members, len(members)
    core = bytearray(n)
    for u in best_members or ():
        core[u] = 1
    return core


def relax_turns(n, edges, marked, dropped, make_edge, max_passes=6):
    """Red de seguridad. Compara contra como era el grafo antes de respetar
    nada (todo doble sentido y todos los giros presentes) y, para cada nodo
    que se haya quedado sin forma de llegar, afloja lo justo: le devuelve el
    doble sentido a los giros marcados que lo tocan y le restaura los giros
    que se habian borrado. Mejor permitir un giro de mas que dejar un destino
    inalcanzable."""
    if not marked and not dropped:
        return
    # Base permisiva: como era el grafo antes de respetar los giros. Se
    # limpian SOLO los sentidos que pusimos nosotros; los de las calles de un
    # solo sentido son del juego y siempre estuvieron, asi que si un nodo ya
    # era inalcanzable por eso, no es algo que tengamos que arreglar (y
    # tratarlos como doble sentido inflaba la base con nodos imposibles y
    # dejaba a la red persiguiendo fantasmas).
    marcadas = {id(e) for e in marked}
    base_edges = [(e[0], e[1], e[2], 0 if id(e) in marcadas else e[3]) for e in edges]
    base_edges += [(a, b, d, 0) for (a, b, d) in dropped]
    base = _largest_scc(n, base_edges)
    del base_edges
    devueltas = restauradas = 0
    for p in range(max_passes):
        core = _largest_scc(n, edges)
        perdidos = {i for i in range(n) if base[i] and not core[i]}
        if not perdidos:
            print(f"  giros respetados sin dejar ningun nodo afuera (pasada {p + 1}); "
                  f"se aflojaron {devueltas} sentidos y se restauraron {restauradas} giros")
            return
        antes = devueltas + restauradas
        # A veces al nodo no lo aisla una arista que lo toca sino una un poco
        # mas alla (el sentido unico esta en el unico acceso, a dos cuadras).
        # Por eso la zona a aflojar se agranda un salto por pasada.
        zona = set(perdidos)
        if p:
            vecinos = {}
            for e in edges:
                vecinos.setdefault(e[0], []).append(e[1])
                vecinos.setdefault(e[1], []).append(e[0])
            for _ in range(p):
                zona |= {v for u in list(zona) for v in vecinos.get(u, ())}
        for e in marked:
            if (e[3] & 2) and (e[0] in zona or e[1] in zona):
                e[3] &= ~2
                devueltas += 1
        quedan = []
        for (a, b, d) in dropped:
            if a in zona or b in zona:
                edges.append(make_edge(a, b, d))
                restauradas += 1
            else:
                quedan.append((a, b, d))
        dropped[:] = quedan
        print(f"  pasada {p + 1}: {len(perdidos)} nodos sin llegada, se afloja a {p + 1} salto(s)")
        if devueltas + restauradas == antes:
            print("  !! no se pudo aflojar nada mas, quedan nodos sin llegada")
            return


def main(argv=None):
    argv = sys.argv if argv is None else argv
    if len(argv) != 4:
        print("Uso: python build_route_graph.py <parser_output_dir> <prefijo> <salida.json>")
        sys.exit(1)

    input_dir, prefix, output_path = argv[1], argv[2], argv[3]

    print("Cargando roads...")
    roads = load_json(f"{input_dir}/{prefix}-roads.json")
    print(f"  {len(roads)} roads")

    print("Cargando prefabs...")
    prefabs = load_json(f"{input_dir}/{prefix}-prefabs.json")
    print(f"  {len(prefabs)} prefabs")
    try:
        prefab_descs = {d["token"]: d for d in load_json(f"{input_dir}/{prefix}-prefabDescriptions.json")}
        print(f"  {len(prefab_descs)} descripciones de prefab (navCurves)")
    except OSError:
        prefab_descs = {}
        print("  sin prefabDescriptions: los prefabs se aproximan con rectas, como antes")

    # Roads/prefabs "hidden" = ocultos en el mapa del juego = NO transitables
    # (decorado de fondo, caminos de escenario, internos de prefabs: la mitad
    # de los tramos de ATS). El GPS del juego no los usa; nosotros los
    # ruteabamos igual y mandabamos por "caminos" que no se ven en ningun
    # mapa (reporte de un usuario en Laurel, MT: ruta paralela a la I-90 por
    # un camino oculto en vez del enlace). Misma regla que el loader de
    # truckermudgeon/maps: se descartan, salvo los prefabs de empresa, que
    # pueden estar ocultos y aun asi ser el destino (Rock Port, St. Louis).
    try:
        company_prefab_uids = {c.get("prefabUid") for c in load_json(f"{input_dir}/{prefix}-companies.json")}
    except FileNotFoundError:
        company_prefab_uids = set()
    n_roads, n_prefabs = len(roads), len(prefabs)
    # Lo oculto no se rutea, pero se guarda: el acceso a varios puertos son
    # calles ocultas y sin ellas el muelle queda aislado (ver "muelles sueltos").
    hidden_roads = [r for r in roads if r.get("hidden")]
    hidden_prefabs = [p for p in prefabs if p.get("hidden") and p["uid"] not in company_prefab_uids]
    roads = [r for r in roads if not r.get("hidden")]
    prefabs = [p for p in prefabs if not p.get("hidden") or p["uid"] in company_prefab_uids]
    print(f"  descartados por hidden: {n_roads - len(roads)} roads, {n_prefabs - len(prefabs)} prefabs (empresas ocultas conservadas: {sum(1 for p in prefabs if p.get('hidden'))})")

    # Carriles por sentido de cada "road look": con esto las calzadas de un
    # solo sentido (autopistas divididas, rampas) quedan como aristas
    # dirigidas y los tramos sin carriles (vias, caminos cerrados, decorado)
    # se descartan. Antes todo era doble mano y el A* mandaba por la calzada
    # contraria o por caminos no transitables.
    # Velocidad tipica de camion por tipo de carril (km/h). El GPS del juego
    # rutea por TIEMPO (prefiere autopista); con esto el nuestro tambien, y
    # deja de mandar por la ruta local mas corta que nadie tomaria. Los
    # carriles de tren/tranvia no son transitables.
    LANE_SPEEDS = (
        ("rail.", None),
        ("road.motorway", 90.0), ("road.freeway", 90.0),
        ("road.expressway", 80.0), ("road.divided", 80.0),
        ("road.local.narrow", 40.0), ("road.local.dust", 35.0),
        ("road.local", 60.0),
        ("slow_road", 35.0), ("side_road", 35.0), ("no_vehicles", 30.0),
    )

    def lane_speed(lane_type):
        t = lane_type.replace("traffic_lane.", "")
        for prefix_, speed in LANE_SPEEDS:
            if t.startswith(prefix_):
                return speed
        return 50.0

    road_looks = {}
    try:
        for lk in load_json(f"{input_dir}/{prefix}-roadLooks.json"):
            left = [lane_speed(t) for t in (lk.get("lanesLeft") or [])]
            right = [lane_speed(t) for t in (lk.get("lanesRight") or [])]
            left = [v for v in left if v]   # sin los carriles de tren
            right = [v for v in right if v]
            speed = max(left + right) if (left or right) else None
            road_looks[lk["token"]] = (len(left), len(right), speed)
    except FileNotFoundError:
        pass
    print(f"  {len(road_looks)} road looks")

    # Cuanto dibuja el mapa cada calzada corrida del eje, con el mismo calculo
    # que el generator de truckermudgeon (geo-json/map.ts): con cantero
    # (offset > 0), dos lineas a offset/2 + (carrilesIzq + carrilesDer)/4 *
    # 4,5 m; sin cantero, una sola por el eje. La ruta dibujada se corre eso
    # hacia la mano por la que se va (grafo v3), asi va sobre la calzada y no
    # por el cantero.
    def lane_side_shift(offset, lanes_total):
        offset = offset or 0
        return offset / 2 + max(0, lanes_total) / 4 * 4.5 if offset > 0 else 0.0

    look_shift = {}
    try:
        for lk in load_json(f"{input_dir}/{prefix}-roadLooks.json"):
            look_shift[lk["token"]] = lane_side_shift(
                lk.get("offset"), len(lk.get("lanesLeft") or []) + len(lk.get("lanesRight") or []))
    except FileNotFoundError:
        pass

    # En paises de mano izquierda el sentido "hacia adelante" (start -> end)
    # usa los carriles de la IZQUIERDA (verificado contra ProMods: 3711 de
    # 3711 calzadas de un sentido en UK vienen con lanesLeft solamente). Se
    # decide por la ciudad mas cercana a cada road.
    LEFT_HAND = {"uk", "nireland", "ireland", "iom", "cyprus", "malta", "jersey", "guernsey"}
    city_grid = {}
    city_cell = 20000.0
    try:
        for c in load_json(f"{input_dir}/{prefix}-cities.json"):
            city_grid.setdefault((int(c["x"] // city_cell), int(c["y"] // city_cell)), []).append((c["x"], c["y"], c.get("countryToken")))
    except FileNotFoundError:
        pass

    def drives_on_left(x, y):
        if not city_grid:
            return False
        cx, cy = int(x // city_cell), int(y // city_cell)
        best, best_d = None, float("inf")
        for gx in range(cx - 2, cx + 3):
            for gy in range(cy - 2, cy + 3):
                for (px, py, token) in city_grid.get((gx, gy), ()):
                    d = (px - x) ** 2 + (py - y) ** 2
                    if d < best_d:
                        best, best_d = token, d
        return best in LEFT_HAND

    used_node_uids = set()
    for r in roads:
        used_node_uids.add(r["startNodeUid"])
        used_node_uids.add(r["endNodeUid"])
    for p in prefabs:
        for uid in p.get("nodeUids", []):
            used_node_uids.add(uid)

    hidden_node_uids = set()
    for r in hidden_roads:
        hidden_node_uids.add(r["startNodeUid"])
        hidden_node_uids.add(r["endNodeUid"])
    for p in hidden_prefabs:
        hidden_node_uids.update(p.get("nodeUids", []))
    hidden_node_uids -= used_node_uids

    print(f"Nodos referenciados por roads/prefabs: {len(used_node_uids)}")

    print("Cargando nodes (puede tardar, es el archivo mas pesado)...")
    node_coords = {}
    with open(f"{input_dir}/{prefix}-nodes.json", encoding="utf-8") as f:
        nodes = json.load(f)
    print(f"  {len(nodes)} nodes totales en el archivo")
    node_rot = {}
    hidden_coords = {}
    for n in nodes:
        uid = n["uid"]
        if uid in used_node_uids:
            node_coords[uid] = (n["x"], n["y"])
            node_rot[uid] = n.get("rotation")
        elif uid in hidden_node_uids:
            hidden_coords[uid] = (n["x"], n["y"])
            node_rot[uid] = n.get("rotation")
    del nodes

    def coord_of(uid):
        return node_coords.get(uid) or hidden_coords.get(uid)
    print(f"  {len(node_coords)} nodos con coordenadas resueltas")

    # Asigna indices numericos compactos.
    uid_to_index = {}
    node_list = []
    for uid, (x, y) in node_coords.items():
        uid_to_index[uid] = len(node_list)
        node_list.append([round(x, 1), round(y, 1)])

    # Aristas [a, b, metros, flags, segundos]; flags: bit 1 = ferry/tren, bit 2
    # = un solo sentido (solo a -> b). Sin flags = doble mano. "segundos" es el
    # tiempo tipico de camion (metros / velocidad del tipo de via): la web
    # rutea por tiempo ("como el GPS del juego") o por metros ("mas corta").
    edges = []
    skipped = 0
    one_way = 0
    no_lanes = 0
    DEFAULT_SPEED = 50.0

    def seconds(meters, kmh):
        return round(meters / (kmh / 3.6), 1)

    # DLC de cada tramo: el dlcGuard del road o del prefab (el numero con el
    # que el juego esconde lo de un DLC que no tenes; la tabla numero -> DLC
    # esta en la web, pure.js). Viaja en los bits 2 a 7 de flags, que
    # write_bin saca a una seccion propia del v3 (edgeG); el v2 y los bits 0
    # y 1 no cambian. Un numero que no entra en 6 bits va como 63, que la web
    # no conoce y por eso no usa.
    def guard_bits(item):
        g = item.get("dlcGuard") or 0
        return (g if 0 <= g <= 63 else 63) << 2

    # Geometria real del tramo: el juego (y los tiles del mapa, via el
    # generator de truckermudgeon/maps) dibuja cada road como una curva
    # Hermite cubica entre los dos nodos, con la rotacion de cada nodo como
    # tangente. Con solo la cuerda recta, la ruta dibujada se separaba de la
    # calzada en las curvas ("leve desvio" reportado). Se guardan los puntos
    # intermedios (sin los extremos) como 6to elemento de la arista, solo si
    # el tramo curva; el largo `w` ya es el real (viene del parser).
    def hermite_mid_points(uid_a, uid_b):
        ra, rb = node_rot.get(uid_a), node_rot.get(uid_b)
        if ra is None or rb is None:
            return None
        (x0, y0), (x1, y1) = coord_of(uid_a), coord_of(uid_b)
        steps = min(8, int(abs(math.tan(ra - rb)) * 20) + 1)
        if steps <= 1:
            return None
        dist = math.hypot(x1 - x0, y1 - y0)
        m0 = (math.cos(ra) * dist, math.sin(ra) * dist)
        m1 = (math.cos(rb) * dist, math.sin(rb) * dist)
        pts = []
        for i in range(1, steps):
            t = i / steps
            t2, t3 = t * t, t * t * t
            h00, h10, h01, h11 = 2 * t3 - 3 * t2 + 1, t3 - 2 * t2 + t, -2 * t3 + 3 * t2, t3 - t2
            pts.append([round(x0 * h00 + m0[0] * h10 + x1 * h01 + m1[0] * h11, 1),
                        round(y0 * h00 + m0[1] * h10 + y1 * h01 + m1[1] * h11, 1)])
        return pts

    def road_edge(a, b, w, flags, wt, uid_a, uid_b):
        mid = hermite_mid_points(uid_a, uid_b)
        return [a, b, w, flags, wt] + ([mid] if mid else [])

    # Corrida de la ruta dibujada en cada punta de cada arista (a, b) -> (en
    # a, en b), en metros: + a la derecha del sentido de marcha, - a la
    # izquierda (paises de mano izquierda). Y la de las calles que llegan a
    # cada nodo, para los prefabs.
    shift_ends = {}
    node_road_shift = {}

    def note_road_shift(r, a, b, ua, ub):
        s = look_shift.get(r.get("roadLookToken"), 0.0)
        if s and drives_on_left(r["x"], r["y"]):
            s = -s
        shift_ends.setdefault((a, b), (s, s))
        shift_ends.setdefault((b, a), (s, s))
        for u in (ua, ub):
            if abs(s) > abs(node_road_shift.get(u, 0.0)):
                node_road_shift[u] = s

    for r in roads:
        a = uid_to_index.get(r["startNodeUid"])
        b = uid_to_index.get(r["endNodeUid"])
        if a is None or b is None:
            skipped += 1
            continue
        lanes = road_looks.get(r.get("roadLookToken"))
        w = round(r["length"], 1)
        ua, ub = r["startNodeUid"], r["endNodeUid"]
        note_road_shift(r, a, b, ua, ub)
        g = guard_bits(r)
        if lanes is None:
            edges.append(road_edge(a, b, w, g, seconds(w, DEFAULT_SPEED), ua, ub))
            continue
        left, right, speed = lanes
        if not left and not right:
            no_lanes += 1
            continue
        wt = seconds(w, speed or DEFAULT_SPEED)
        if left and right:
            edges.append(road_edge(a, b, w, g, wt, ua, ub))
            continue
        forward_is_right = not drives_on_left(r["x"], r["y"])
        forward = (right > 0) if forward_is_right else (left > 0)
        edges.append(road_edge(a, b, w, 2 | g, wt, ua, ub) if forward else road_edge(b, a, w, 2 | g, wt, ub, ua))
        one_way += 1
    print(f"Roads de un solo sentido: {one_way}; sin carriles transitables (descartados): {no_lanes}")

    # Corrida en los nodos de un prefab. Un nodo de doble mano (le entran y le
    # salen carriles) esta en el eje de su calle: se corre como la calle que
    # llega, o si no llega ninguna (prefab pegado a otro prefab), como el
    # tramo de calle del prefab mas cercano a ese nodo (mapPoints). Un nodo
    # de una sola mano (un tablero de puente, una rampa) ya esta sobre su
    # calzada: corrida 0. Entre las dos puntas de una arista la web reparte
    # la corrida, asi el eje de una autopista (9,5 m) pasa suave a un tablero
    # separado (0) sin gancho. Sin descripcion, como la calle que llega.
    def mappoint_shift(desc, dn):
        mejor, dmin = None, float("inf")
        for mp in desc.get("mapPoints") or []:
            if mp.get("type") != "road":
                continue
            d = math.hypot(mp.get("x", 0) - dn.get("x", 0), mp.get("y", 0) - dn.get("y", 0))
            if d < dmin:
                mejor, dmin = mp, d
        if mejor is None:
            return 0.0

        # "auto": el juego los toma de la calle que se engancha; aca no hay
        # ninguna (ese caso ya salio de node_road_shift), asi que no suman.
        def carriles(v):
            return v if isinstance(v, int) and v > 0 else 0
        return lane_side_shift(mejor.get("offset"), carriles(mejor.get("lanesLeft")) + carriles(mejor.get("lanesRight")))

    # Una sola corrida por nodo de prefab. Un nodo lo pueden compartir dos
    # prefabs que lo describen distinto: uno que junta las dos calzadas de una
    # autovia (3+3 carriles, offset 10: corrida 12 m) y el tramo de doble
    # mano sin cantero que sigue (corrida 0). Cada uno con la suya, la ruta
    # iba 12 m corrida, pasaba a 0 y volvia, y se salia de la calle en
    # diagonal. Se usa la menor: sin cantero no se puede ir corrido, y el
    # lado con cantero hace la transicion. Si algun prefab ve el nodo como de
    # una sola mano, 0: ese nodo ya esta sobre su calzada.
    prefab_node_shift = {}

    def collect_prefab_node_shifts():
        for p in prefabs:
            desc = prefab_descs.get(p.get("token"))
            if not desc:
                continue
            rotated = rotate_right(p.get("nodeUids", []), p.get("originNodeIndex", 0))
            for ia, dn in enumerate(desc.get("nodes") or []):
                if ia >= len(rotated) or rotated[ia] not in uid_to_index:
                    continue
                u = rotated[ia]
                if not (dn.get("inputLanes") and dn.get("outputLanes")):
                    s = 0.0
                elif u in node_road_shift:
                    continue
                else:
                    s = mappoint_shift(desc, dn)
                    if s and drives_on_left(*coord_of(u)):
                        s = -s
                if u not in prefab_node_shift or abs(s) < abs(prefab_node_shift[u]):
                    prefab_node_shift[u] = s

    def note_prefab_shifts(p, uids, desc):
        nodo_shift = {u: prefab_node_shift.get(u, node_road_shift.get(u, 0.0)) for u in uids}
        for ua in uids:
            for ub in uids:
                if ua != ub:
                    shift_ends.setdefault((uid_to_index[ua], uid_to_index[ub]), (nodo_shift[ua], nodo_shift[ub]))

    # Prefabs (rotondas, distribuidores, cruces). Con las navCurves de la
    # descripcion se sigue el camino de verdad entre nodo y nodo; sin ellas se
    # cae a la recta de siempre, que es lo que hacia que la ruta cruzara por
    # arriba de las rotondas.
    nav_cache = {}
    n_prefab_geom = 0
    n_one_way = 0
    one_way_edges = []
    dropped_turns = []
    n_dropped = 0
    collect_prefab_node_shifts()
    for p in prefabs:
        uids = [u for u in p.get("nodeUids", []) if u in uid_to_index]
        desc = prefab_descs.get(p.get("token"))
        note_prefab_shifts(p, uids, desc)
        # Cada SENTIDO por separado: (a, b) dirigido -> (largo, puntos).
        # Antes se guardaba uno solo por par, el mas corto, y la arista quedaba
        # de doble sentido con esa geometria y ese largo. En un trebol, doblar
        # a la izquierda (el lazo, 700-900 m) salia como recorrer al reves la
        # rampa de la derecha (450 m): la ruta "cruzaba la autopista" (reporte
        # de Kesh en Discord, M0/M5 cerca de Budapest, 06-10). En una rotonda,
        # dar casi toda la vuelta costaba lo mismo que la salida corta.
        directed = {}
        # (a, b) de los pares que solo se pueden recorrer en ese sentido.
        # None mientras no se sepa (prefab sin navCurves utiles).
        one_way = None
        seen_dir = set()
        if desc:
            token = p["token"]
            if token not in nav_cache:
                try:
                    nav_cache[token] = prefab_nav_paths(desc)
                except Exception:
                    nav_cache[token] = {}
            paths = nav_cache[token]
            tx = prefab_transform(p, desc, node_coords, node_rot) if paths else None
            if tx:
                rotated = rotate_right(p.get("nodeUids", []), p.get("originNodeIndex", 0))
                one_way = set()
                for (ia, ib), (chain, length) in paths.items():
                    if ia >= len(rotated) or ib >= len(rotated):
                        continue
                    ua, ub = rotated[ia], rotated[ib]
                    if ua not in uid_to_index or ub not in uid_to_index:
                        continue
                    a, b = uid_to_index[ua], uid_to_index[ub]
                    if a == b:
                        continue
                    seen_dir.add((a, b))
                    if (a, b) in directed and directed[(a, b)][0] <= length:
                        continue
                    world = [tx(x, y) for x, y in curve_chain_points(desc, chain)]
                    # Las navCurves son el eje del CARRIL, asi que arrancan un
                    # par de metros al costado del nodo: eso esta bien. Lo que
                    # no puede pasar es que el extremo caiga lejos, que es
                    # sintoma de una descripcion rara; ahi se usa la recta.
                    if (math.dist(world[0], node_list[a]) > PREFAB_END_TOLERANCE_M
                            or math.dist(world[-1], node_list[b]) > PREFAB_END_TOLERANCE_M):
                        # El paso existe en el juego (esta en las navCurves):
                        # se conserva con la recta. Antes se salteaba y, como
                        # no quedaba en directed, el modo full lo borraba como
                        # "giro inexistente": sin el derecho, la ruta entraba a
                        # un brazo, daba la vuelta en U en su nodo y seguia (el
                        # lazo de Bakersfield).
                        directed[(a, b)] = (length, None)
                        continue
                    world = align_to_nodes(world, node_list[a], node_list[b])
                    directed[(a, b)] = (length, prefab_mid_points(world, node_list[a], node_list[b]))
                one_way = {(a, b) for (a, b) in seen_dir if (b, a) not in seen_dir}

        # Lo que se emite: (a, b, largo, puntos, solo_de_a_hacia_b).
        emit = []
        cubiertos = set()
        for (a, b), (la, ma) in directed.items():
            key = (a, b) if a < b else (b, a)
            if key in cubiertos:
                continue
            cubiertos.add(key)
            ida = directed.get(key)
            vuelta = directed.get((key[1], key[0]))
            if ida and vuelta:
                (l1, m1), (l2, m2) = ida, vuelta
                if not ENFORCE_TURNS or abs(l1 - l2) <= max(5.0, 0.1 * min(l1, l2)):
                    # Una calle que atraviesa el prefab: los dos sentidos son
                    # el mismo camino. Una sola arista de doble sentido.
                    if l1 <= l2:
                        emit.append((key[0], key[1], l1, m1, False))
                    else:
                        emit.append((key[0], key[1], l2, list(reversed(m2)) if m2 else m2, False))
                else:
                    emit.append((key[0], key[1], l1, m1, True))
                    emit.append((key[1], key[0], l2, m2, True))
            else:
                (x, y), (l, m) = ((key[0], key[1]), ida) if ida else ((key[1], key[0]), vuelta)
                emit.append((x, y, l, m, bool(ENFORCE_TURNS)))
        # Sin navCurves utiles no hay de donde sacar que giros existen, asi
        # que ese prefab sigue como siempre: todos contra todos, doble
        # sentido. Con navCurves, en cambio, los pares que no aparecen es
        # porque el giro no existe.
        # Modo 2 (TRUCKDASH_ENFORCE_TURNS=flags): no se borra ningun par, solo
        # se marcan los de un solo sentido. Mas conservador: no puede dejar un
        # destino sin camino de entrada.
        borrar = ENFORCE_TURNS and ENFORCE_MODE == "full" and one_way is not None
        for i in range(len(uids)):
            for j in range(i + 1, len(uids)):
                a, b = uid_to_index[uids[i]], uid_to_index[uids[j]]
                key = (a, b) if a < b else (b, a)
                if key in cubiertos:
                    continue
                cubiertos.add(key)
                ax, ay = node_list[a]
                bx, by = node_list[b]
                dist = math.hypot(ax - bx, ay - by)
                if borrar:
                    # Ese giro no existe en el juego. Se anota por si hay que
                    # devolverlo para no dejar a alguien sin llegada.
                    dropped_turns.append((key[0], key[1], dist))
                    n_dropped += 1
                else:
                    emit.append((key[0], key[1], dist, None, False))
        for a, b, length, mids, solo_ida in emit:
            if mids:
                n_prefab_geom += 1
            # bit 1 del formato: solo se puede ir de a hacia b.
            flags = 2 if solo_ida else 0
            if flags:
                n_one_way += 1
            flags |= guard_bits(p)
            # Intersecciones a 40 km/h: penaliza un poco las rutas con
            # muchos cruces, como hace el GPS del juego.
            edge = [a, b, round(length, 1), flags, seconds(length, 40.0), mids]
            edges.append(edge)
            if flags & 2:
                one_way_edges.append(edge)
    print(f"Aristas de prefab con geometria real (navCurves): {n_prefab_geom}"
          + (f", de un solo sentido: {n_one_way}" if ENFORCE_TURNS else "")
          + (f", giros inexistentes borrados: {n_dropped}" if n_dropped else ""))

    print(f"Edges de roads+prefabs: {len(edges)} (roads sin resolver: {skipped})")

    # Ferries y trenes (Eurotunel): sin estas aristas, Gran Bretana, Islandia,
    # Sicilia, etc. quedan como componentes aisladas del grafo y el A* de la
    # web (que busca dentro de la componente mas grande) no puede rutear ni
    # siquiera DENTRO de la isla. Cada conexion une el nodo de carretera mas
    # cercano a cada terminal, con peso = distancia en linea recta (x1.2 de
    # penalizacion leve para preferir la ruta terrestre si la hay). Se marcan
    # con un 4to elemento = 1 para que la web pueda dibujarlas distinto.
    ferry_edges = 0
    try:
        ferries = load_json(f"{input_dir}/{prefix}-ferries.json")
    except FileNotFoundError:
        ferries = []
    if ferries:
        # Indice por celdas de 2 km para no hacer fuerza bruta contra 500k nodos.
        cell = 2000.0
        grid = {}
        for idx, (x, y) in enumerate(node_list):
            grid.setdefault((int(x // cell), int(y // cell)), []).append(idx)

        def nearest_node(x, y, accept=None):
            best, best_d = None, float("inf")
            cx, cy = int(x // cell), int(y // cell)
            for radius in range(0, 6):
                for gx in range(cx - radius, cx + radius + 1):
                    for gy in range(cy - radius, cy + radius + 1):
                        if max(abs(gx - cx), abs(gy - cy)) != radius:
                            continue
                        for idx in grid.get((gx, gy), ()):
                            if accept is not None and not accept(idx):
                                continue
                            nx, ny = node_list[idx]
                            d = math.hypot(nx - x, ny - y)
                            if d < best_d:
                                best, best_d = idx, d
                if best is not None and best_d < radius * cell:
                    break
            return best, best_d

        terminal_node = {}
        for t in ferries:
            terminal_node[t["token"]] = nearest_node(t["x"], t["y"])

        # --- Muelles sueltos ---
        # El acceso a muchos puertos (Tallinn, Villa San Giovanni, Valletta,
        # Haifa, Torshavn...) son calles marcadas "hidden": el juego las
        # esconde del mapa pero el camion las maneja igual. Como descartamos
        # todo lo hidden, el muelle quedaba como un islote de 2 nodos: la
        # arista de ferry existia pero no habia forma de llegar a ella, asi
        # que el A* rodeaba por tierra (Tallinn -> Helsinki se iba por San
        # Petersburgo en vez de tomar el ferry de 2 h). Para cada terminal
        # aislado se busca el camino mas corto POR TRAMOS OCULTOS hasta la red
        # de verdad y se agrega SOLO ese camino; el resto de lo oculto sigue
        # afuera (que es lo que arreglo el ruteo por caminos inexistentes).
        RESCUE_MAX_M = 4000.0
        RESCUE_STUB = 10      # componente de hasta N nodos = muelle suelto
        RESCUE_TARGET = 30    # componente destino: red de verdad

        parent = list(range(len(node_list)))

        def find(a):
            while parent[a] != a:
                parent[a] = parent[parent[a]]
                a = parent[a]
            return a

        def union(a, b):
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[ra] = rb

        for e in edges:
            union(e[0], e[1])
        comp_size = {}
        for i in range(len(node_list)):
            r = find(i)
            comp_size[r] = comp_size.get(r, 0) + 1

        def comp_of(idx):
            return comp_size.get(find(idx), 1)

        stubs = [(tok, n) for tok, (n, _d) in terminal_node.items()
                 if n is not None and comp_of(n) <= RESCUE_STUB]
        if stubs:
            hidden_adj = {}

            def add_hidden(ua, ub, meters, kmh, is_road):
                if ua == ub:
                    return
                hidden_adj.setdefault(ua, []).append((ub, meters, kmh, is_road))
                hidden_adj.setdefault(ub, []).append((ua, meters, kmh, is_road))

            for r in hidden_roads:
                ua, ub = r["startNodeUid"], r["endNodeUid"]
                if coord_of(ua) is None or coord_of(ub) is None:
                    continue
                lanes = road_looks.get(r.get("roadLookToken"))
                add_hidden(ua, ub, round(r["length"], 1), (lanes[2] if lanes else None) or DEFAULT_SPEED, True)
            for p in hidden_prefabs:
                uids = [u for u in p.get("nodeUids", []) if coord_of(u) is not None]
                for i in range(len(uids)):
                    for j in range(i + 1, len(uids)):
                        (ax, ay), (bx, by) = coord_of(uids[i]), coord_of(uids[j])
                        add_hidden(uids[i], uids[j], round(math.hypot(ax - bx, ay - by), 1), 40.0, False)

            index_to_uid = {i: u for u, i in uid_to_index.items()}

            def index_for(uid):
                i = uid_to_index.get(uid)
                if i is None:
                    x, y = coord_of(uid)
                    i = len(node_list)
                    uid_to_index[uid] = i
                    index_to_uid[i] = uid
                    node_list.append([round(x, 1), round(y, 1)])
                    parent.append(i)
                return i

            rescued, failed, linked = 0, [], []
            for token, start_idx in stubs:
                start_uid = index_to_uid.get(start_idx)
                if start_uid is None:
                    continue
                start_comp = find(start_idx)
                best = None
                dist = {start_uid: 0.0}
                prev = {}
                pq = [(0.0, start_uid)]
                while pq:
                    d, u = heapq.heappop(pq)
                    if d > dist.get(u, float("inf")) + 1e-6 or d > RESCUE_MAX_M:
                        continue
                    ui = uid_to_index.get(u)
                    if ui is not None and find(ui) != start_comp and comp_of(ui) >= RESCUE_TARGET:
                        best = u
                        break
                    for v, m, kmh, is_road in hidden_adj.get(u, ()):
                        nd = d + m
                        if nd < dist.get(v, float("inf")) and nd <= RESCUE_MAX_M:
                            dist[v] = nd
                            prev[v] = (u, m, kmh, is_road)
                            heapq.heappush(pq, (nd, v))
                if best is None:
                    # Sin acceso oculto tampoco: en varios puertos (sobre todo
                    # de ProMods) el muelle es un prefab suelto, a veces con su
                    # nodo pegado a la calle pero con otro uid, asi que nada lo
                    # une. Se agrega un enlace corto muelle -> carretera de
                    # verdad: el ferry sigue saliendo del muelle (que es lo que
                    # se dibuja) y ahora se puede llegar y salir de el.
                    alt, alt_d = nearest_node(*node_list[start_idx], accept=lambda i: comp_of(i) >= RESCUE_TARGET)
                    if alt is not None and alt_d <= RESCUE_MAX_M:
                        m = round(alt_d, 1)
                        edges.append([start_idx, alt, m, 0, max(seconds(m, 40.0), 0.1)])
                        union(start_idx, alt)
                        linked.append(f"{token} (+{round(alt_d)} m)")
                    else:
                        failed.append(token)
                    continue
                cur, added_m = best, 0.0
                while cur in prev:
                    pu, m, kmh, is_road = prev[cur]
                    a, b = index_for(pu), index_for(cur)
                    wt = seconds(m, kmh)
                    edges.append(road_edge(a, b, m, 0, wt, pu, cur) if is_road else [a, b, m, 0, wt])
                    union(a, b)
                    added_m += m
                    cur = pu
                rescued += 1
                print(f"  muelle reconectado: {token} (+{round(added_m)} m de acceso oculto)")
            msg = f"Muelles sueltos: {len(stubs)}, reconectados por calle oculta {rescued}"
            if linked:
                msg += f"; unidos a la carretera mas cercana {len(linked)}: {', '.join(linked)}"
            if failed:
                msg += f"; sin nada a menos de {int(RESCUE_MAX_M)} m: {', '.join(failed)}"
            print(msg)

        seen = set()
        for t in ferries:
            a, da = terminal_node[t["token"]]
            for c in t.get("connections", []):
                target = c.get("token")
                if target not in terminal_node:
                    b, db = nearest_node(c["x"], c["y"])
                else:
                    b, db = terminal_node[target]
                if a is None or b is None or a == b:
                    continue
                key = (min(a, b), max(a, b))
                if key in seen:
                    continue
                seen.add(key)
                ax, ay = node_list[a]
                bx, by = node_list[b]
                ferry_m = math.hypot(ax - bx, ay - by) * 1.2
                edges.append([a, b, round(ferry_m, 1), 1, seconds(ferry_m, 40.0)])
                ferry_edges += 1
    print(f"Edges de ferries/trenes: {ferry_edges} ({len(ferries)} terminales)")

    # Recien aca, con los ferries y trenes ya adentro: hay lugares a los que
    # solo se llega cruzando, y midiendo antes de sumarlos la red de
    # seguridad los daba por perdidos de entrada y no los protegia.
    if ENFORCE_TURNS and (one_way_edges or dropped_turns):
        print(f"Giros respetados: {len(one_way_edges)} de un solo sentido, {len(dropped_turns)} borrados; "
              "revisando que no dejen nodos sin llegada...")
        relax_turns(len(node_list), edges, one_way_edges, dropped_turns,
                    lambda a, b, d: [a, b, round(d, 1), 0, seconds(d, 40.0), None])

    graph = {"nodes": node_list, "edges": [[e[0], e[1], e[2], int(e[3] or 0) & 3] + list(e[4:]) for e in edges]}

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(graph, f, separators=(",", ":"))

    import os
    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"Grafo guardado en {output_path} ({size_mb:.1f} MB)")

    # Mismo grafo en binario (typed arrays para la web, ver route_graph_bin.py);
    # el JSON queda para clientes viejos / inspeccion.
    # Como paquete (cliente) o suelto (envoltorios del taller)
    try:
        from .route_graph_bin import write_bin
    except ImportError:
        from route_graph_bin import write_bin
    bin_path = output_path[:-5] + ".bin" if output_path.endswith(".json") else output_path + ".bin"
    stats = write_bin(node_list, edges, bin_path)
    print(f"Grafo binario en {bin_path} ({os.path.getsize(bin_path) / (1024 * 1024):.1f} MB): {stats}")

    # v3: lo mismo mas la corrida de cada punta, en un archivo aparte: la web
    # vieja sigue pidiendo el de siempre. Ferries y trenes, sin corrida.
    shifts = [(0.0, 0.0) if (int(e[3] or 0) & 1) else shift_ends.get((e[0], e[1]), (0.0, 0.0)) for e in edges]
    bin3_path = bin_path[:-4] + "-v3.bin"
    stats3 = write_bin(node_list, edges, bin3_path, shifts=shifts)
    print(f"Grafo v3 en {bin3_path} ({os.path.getsize(bin3_path) / (1024 * 1024):.1f} MB): {stats3}")


if __name__ == "__main__":
    main()

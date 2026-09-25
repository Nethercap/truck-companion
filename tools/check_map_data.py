# -*- coding: utf-8 -*-
"""Valida lo que publicamos contra lo que dice el parser.

Lo que nos viene mordiendo no son errores de logica sino SUPOSICIONES SOBRE
LOS DATOS: listas blancas que no coinciden con lo que el juego trae,
posiciones que no significan lo que creiamos, claves que se repiten. Ninguna
de esas la atrapa un test unitario, porque el codigo esta bien; lo que esta
mal es lo que creemos del dato.

Cada chequeo de aca nacio de un bug real:

  sprites      los puertos de ferry eran invisibles porque 'port_overlay' no
               estaba en la lista blanca, y dos tercios de las basculas de
               ETS2 tampoco porque el juego usa DOS tokens para lo mismo
  iconos       la lista blanca puede nombrar un PNG que no esta en R2
  empresas     una empresa repetida en la misma ciudad haria que el GPS
               eligiera la sucursal equivocada
  ciudades     ATS tiene 8 nombres repetidos (Aberdeen SD contra Aberdeen WA,
               a 99 km) y el indice por nombre se pisaba
  puntos       el punto de trabajo de una empresa tiene que caer cerca de su
               prefab; si esta lejos, el calculo se equivoco

Uso:
  py tools/check_map_data.py              # todas las variantes publicadas
  py tools/check_map_data.py ets2 ats     # solo algunas
"""

import collections
import json
import math
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARSER_ROOT = os.path.dirname(ROOT)
DATA_DIR = os.path.join(ROOT, "docs", "data")
ICON_BASE = "https://maps.trucksim-dash.com/vector/icons"

sys.path.insert(0, os.path.join(ROOT, "tools"))
from build_pois import VARIANTS, FACILITY_CODES  # noqa: E402

# Distancia maxima razonable entre el punto de trabajo de una empresa y el
# prefab al que pertenece. Un predio grande mide unos cientos de metros; si da
# mas, el calculo agarro el prefab equivocado o la transformacion fallo.
MAX_DIST_PREFAB_M = 600


def cargar(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def sprites_de_la_web():
    """Los sprites que app.js dibuja, leidos del propio archivo para que esto
    no quede desincronizado de lo que realmente se publica."""
    with open(os.path.join(ROOT, "docs", "app", "app.js"), encoding="utf-8") as f:
        src = f.read()
    import re
    sprites = set()
    for nombre in ("POI_ICONS", "FERRY_ICONS"):
        m = re.search(rf"const {nombre} = \[(.*?)\];", src, re.S)
        if m:
            sprites |= set(re.findall(r"'([^']+)'", m.group(1)))
    return sprites


def revisar(variante, carpeta, prefijo, sprites_web, iconos_remotos, problemas, notas):
    carpeta = os.path.join(PARSER_ROOT, carpeta)
    pois_path = os.path.join(carpeta, f"{prefijo}-pois.json")
    publicado = os.path.join(DATA_DIR, f"pois-{variante}.json")
    if not os.path.exists(pois_path) or not os.path.exists(publicado):
        notas.append(f"{variante}: sin datos locales, se saltea")
        return

    pois = cargar(pois_path)
    pub = cargar(publicado)

    # 1) Sprites que el juego trae y nosotros descartamos, cuando son del
    #    mismo tipo que otros que si dibujamos. Asi se detecta el caso de dos
    #    tokens para la misma cosa.
    por_tipo = collections.defaultdict(collections.Counter)
    for p in pois:
        if p.get("icon"):
            por_tipo[p.get("type")][p["icon"]] += 1
    for tipo, iconos in por_tipo.items():
        dibujados = {i for i in iconos if i in sprites_web}
        if not dibujados:
            continue
        for icono, n in iconos.items():
            if icono in sprites_web or n < 10:
                continue
            # Los escudos de ruta (us20, is80, at_a12) son numeros de ruta, no
            # lugares: se dibujan aparte como nombres de camino.
            if tipo == "road" and any(c.isdigit() for c in icono):
                continue
            notas.append(f"{variante}: {n} POIs de tipo '{tipo}' con sprite "
                         f"'{icono}' no se dibujan (si se dibujan {sorted(dibujados)})")

    # 2) Sprites de la lista blanca que no tienen PNG publicado.
    for s in sorted(sprites_web):
        if s in iconos_remotos:
            continue
        problemas.append(f"el sprite '{s}' esta en la lista blanca pero no hay "
                         f"{ICON_BASE}/{s}.png")
        iconos_remotos.add(s)  # no repetir por cada variante

    # 3) Empresas repetidas en la misma ciudad: el GPS elegiria una al azar.
    vistas = collections.Counter((c[2], c[4]) for c in pub["companies"])
    for (tok, city), n in vistas.items():
        if n > 1:
            problemas.append(f"{variante}: {n} empresas '{tok}' en '{city}'; "
                             f"findCompanyPoi elegiria la primera")

    # 4) Ciudades con el mismo nombre: el indice por nombre se pisa.
    cities_path = os.path.join(carpeta, f"{prefijo}-cities.json")
    if os.path.exists(cities_path):
        por_nombre = collections.defaultdict(list)
        for c in cargar(cities_path):
            por_nombre[c.get("name")].append(c)
        for nombre, lista in por_nombre.items():
            if len(lista) < 2:
                continue
            d = max(math.hypot(a["x"] - b["x"], a["y"] - b["y"])
                    for a in lista for b in lista)
            notas.append(f"{variante}: '{nombre}' es el nombre de {len(lista)} "
                         f"ciudades, separadas hasta {d / 1000:.0f} km "
                         f"(findCity desambigua por cercania)")

    # 5) El punto de trabajo de cada empresa tiene que caer cerca de su
    #    prefab. Si esta lejos, el calculo agarro otro prefab.
    wp_path = os.path.join(PARSER_ROOT, f"company-points-{variante}.json")
    comp_path = os.path.join(carpeta, f"{prefijo}-companies.json")
    if os.path.exists(wp_path) and os.path.exists(comp_path):
        puntos = cargar(wp_path)
        lejos = 0
        peor = 0.0
        for c in cargar(comp_path):
            p = puntos.get(f"{c['token']}|{c.get('cityToken') or ''}")
            if not p:
                continue
            d = math.hypot(p[0] - c["x"], p[1] - c["y"])
            peor = max(peor, d)
            if d > MAX_DIST_PREFAB_M:
                lejos += 1
        if lejos:
            problemas.append(f"{variante}: {lejos} empresas con su punto de "
                             f"trabajo a mas de {MAX_DIST_PREFAB_M} m del icono "
                             f"(peor: {peor:.0f} m)")

    # 6) Las categorias de la busqueda tienen que existir en los datos.
    codigos = collections.Counter(f[2] for f in pub["facilities"])
    for icono, codigo in FACILITY_CODES.items():
        if codigo not in codigos and any(p.get("icon") == icono for p in pois):
            problemas.append(f"{variante}: hay POIs '{icono}' pero ninguno "
                             f"quedo con el codigo '{codigo}' en el publicado")


def main():
    pedidas = sys.argv[1:] or list(VARIANTS)
    sprites_web = sprites_de_la_web()
    print(f"sprites que la web dibuja: {len(sprites_web)}")

    # Que PNG existen en R2. Se consulta una sola vez, no por variante.
    iconos_remotos = set()
    for s in sorted(sprites_web):
        try:
            # Con el User-Agent de Python, Cloudflare devuelve 403 y todos
            # los iconos parecen faltantes. Hay que pedirlo como un navegador.
            req = urllib.request.Request(
                f"{ICON_BASE}/{s}.png", method="HEAD",
                headers={"User-Agent": "Mozilla/5.0 (compatible; TruckDash-check)"})
            with urllib.request.urlopen(req, timeout=10) as r:
                if r.status == 200:
                    iconos_remotos.add(s)
        except Exception:
            pass

    problemas, notas = [], []
    for v in pedidas:
        if v not in VARIANTS:
            print(f"  {v}: variante desconocida")
            continue
        carpeta, prefijo = VARIANTS[v]
        revisar(v, carpeta, prefijo, sprites_web, iconos_remotos, problemas, notas)

    if notas:
        print("\nPara mirar:")
        for n in notas:
            print(f"  {n}")
    if problemas:
        print("\nPROBLEMAS:")
        for p in problemas:
            print(f"  {p}")
        return 1
    print("\nsin problemas")
    return 0


if __name__ == "__main__":
    sys.exit(main())

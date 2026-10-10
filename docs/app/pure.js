// Funciones puras (sin dependencias del DOM/mapa) compartidas por index.html
// y por los tests automatizados (test_pure.js, corridos con `node --test`).
// UMD minimo: en el navegador quedan como globals; en Node se exportan via
// module.exports para poder importarlas desde el test.

// Bearing geografico real (formula de azimut) entre dos puntos lng/lat -
// estable sin importar hacia donde este rotado el mapa actualmente (a
// diferencia del viejo truco en pixeles de pantalla que hacia falta con
// Leaflet CRS.Simple, donde los ejes x/z del juego no se correspondian con
// ninguna orientacion real).
function geoBearingDeg(lng1, lat1, lng2, lat2) {
  const toRad = d => d * Math.PI / 180;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// Rumbo del juego (brujula sobre la GRILLA del mapa: 0 = -z, 90 = +x) a
// rumbo geografico real. No son lo mismo: los mapas del juego son una
// proyeccion conica (Lambert) y ahi los meridianos convergen, asi que el
// "norte" de la grilla solo coincide con el norte verdadero sobre el meridiano
// central. En ATS la diferencia es 14 grados en Los Angeles y 17 en Seattle;
// en ETS2 pasa lo mismo en Portugal o Escocia. Usar el rumbo del juego tal
// cual dejaba la flecha torcida contra la calle, siempre para el mismo lado.
// Se resuelve sin formulas de la proyeccion: se proyectan la posicion y un
// punto unos metros adelante y se mide el bearing entre los dos. Si ese
// punto cae del otro lado de un corte de la proyeccion (el borde del hack de
// UK en ETS2) la distancia no cierra, y se mide con un punto hacia atras.
function gridHeadingToGeo(headingDeg, x, z, toLngLat, stepM = 10) {
  if (!Number.isFinite(headingDeg) || !toLngLat || x == null || z == null) return headingDeg;
  const rad = headingDeg * Math.PI / 180;
  const dx = Math.sin(rad) * stepM, dz = -Math.cos(rad) * stepM;
  const here = toLngLat(x, z);
  const metersBetween = (a, b) => {
    const kx = 111320 * Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180);
    return Math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * 110540);
  };
  const ahead = toLngLat(x + dx, z + dz);
  if (metersBetween(here, ahead) < stepM * 3) return geoBearingDeg(here[0], here[1], ahead[0], ahead[1]);
  const behind = toLngLat(x - dx, z - dz);
  return geoBearingDeg(behind[0], behind[1], here[0], here[1]);
}

// Suaviza visualmente la ruta calculada: redondea cada esquina con una curva
// (Bezier cuadratica) entre un punto antes y uno despues del vertice, a lo
// sumo a la mitad del tramo mas corto. Los tramos rectos quedan rectos, como
// las lineas del mapa, y como la curva queda adentro del triangulo de la
// esquina no puede hacer rizos, volver para atras ni pasarse. Antes era una
// spline Catmull-Rom uniforme, que con tramos de largo muy desparejo (59 m,
// 11 m, 60 m a la salida de un puente) se pasaba de largo y dibujaba un rizo;
// la centripeta no hace rizos pero comba los tramos rectos largos. Solo es
// cosmetico: no cambia currentRouteWorldPoints, que se sigue usando tal cual
// para A*, desvios y el proximo giro.
function smoothLineCoords(points, segmentsPerPoint = 6) {
  if (points.length < 3) return points;
  const n = points.length;
  const result = [points[0]];
  for (let i = 1; i < n - 1; i++) {
    const a = points[i - 1], b = points[i], c = points[i + 1];
    const la = Math.hypot(b[0] - a[0], b[1] - a[1]), lc = Math.hypot(c[0] - b[0], c[1] - b[1]);
    if (la < 1e-12 || lc < 1e-12) { result.push(b); continue; }
    const r = Math.min(la, lc) / 2;
    const p = [b[0] + (a[0] - b[0]) * (r / la), b[1] + (a[1] - b[1]) * (r / la)];
    const q = [b[0] + (c[0] - b[0]) * (r / lc), b[1] + (c[1] - b[1]) * (r / lc)];
    result.push(p);
    for (let k = 1; k <= segmentsPerPoint; k++) {
      const t = k / segmentsPerPoint, u = 1 - t;
      result.push([u * u * p[0] + 2 * u * t * b[0] + t * t * q[0], u * u * p[1] + 2 * u * t * b[1] + t * t * q[1]]);
    }
  }
  result.push(points[n - 1]);
  return result;
}

// Saca del DIBUJO de la ruta los desvios cortos que salen de la linea y
// vuelven a ella. El grafo lleva los tramos de doble mano por el eje de la
// calle, pero donde las dos manos se separan un rato (un puente con un
// tablero por mano, como la I-15 sobre la US-6 en Spanish Fork, ATS) cada
// una es un tramo propio, dibujado donde esta: la ruta salia del eje, iba
// 10-14 m al costado y volvia, y el suavizado lo convertia en un rulito.
// Se reconoce por cuatro cosas, para no tocar nada mas: vuelve a la MISMA
// linea y sigue en la misma direccion (no es un giro ni un cambio de
// calle), es corto (maxAlong, maxLateral), la mayor parte corre paralela a
// la linea (no es una rotonda, que es toda curva) y no es mucho mas largo
// que la recta. Puntos en metros (x, y del juego). Solo es dibujo: el
// ruteo, las indicaciones y las distancias usan los puntos de verdad.
// Un desvio de estos es ABRUPTO: se corre de 0 a varios metros en pocos
// metros y vuelve igual (maxRamp). Y esta hecho de POCOS tramos rectos
// (entrada, tablero, salida: maxInterior puntos adentro), mientras que una
// curva son muchos puntos juntos. Sin esas dos condiciones recortaba
// curvas, sobre todo las cerradas de las rutas de ETS2.
function dropShortExcursions(points, { maxAlong = 150, maxLateral = 20, minLateral = 4,
  backLen = 40, returnTol = 3, minParallel = 0.55, maxDetour = 1.4, maxRamp = 25, maxInterior = 4 } = {}) {
  const n = points.length;
  if (n < 4) return points;
  const d = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const out = [points[0]];
  let i = 1;
  while (i < n) {
    out.push(points[i]);
    if (i >= n - 2) { i++; continue; }
    // Direccion de llegada, medida unos metros hacia atras: un tramo solo
    // puede ser muy corto y apuntar a cualquier lado.
    let k0 = i - 1, back = 0;
    while (k0 > 0 && back < backLen) { back += d(points[k0], points[k0 + 1]); k0--; }
    const ux0 = points[i][0] - points[k0][0], uy0 = points[i][1] - points[k0][1];
    const ul = Math.hypot(ux0, uy0);
    if (ul < 1) { i++; continue; }
    const ux = ux0 / ul, uy = uy0 / ul;
    const lateral = (p) => ux * (p[1] - points[i][1]) - uy * (p[0] - points[i][0]);
    const adelante = (p) => ux * (p[0] - points[i][0]) + uy * (p[1] - points[i][1]);
    let along = 0, paralelo = 0, maxLat = 0, fin = -1;
    let subida = -1, ultimoAlto = 0; // metros hasta pasar minLateral / ultimo punto por encima
    for (let k = i + 1; k < n - 1; k++) {
      const seg = d(points[k - 1], points[k]);
      along += seg;
      if (along > maxAlong) break;
      const lat = Math.abs(lateral(points[k]));
      if (lat > maxLateral || adelante(points[k]) <= 0) break;
      if (seg > 0) {
        const c = Math.abs(ux * (points[k][0] - points[k - 1][0]) + uy * (points[k][1] - points[k - 1][1])) / seg;
        if (c > 0.95) paralelo += seg;
      }
      if (k >= i + 2 && lat <= returnTol && maxLat >= minLateral) {
        const sig = points[k + 1];
        const s = d(points[k], sig);
        const cosSale = s > 0 ? (ux * (sig[0] - points[k][0]) + uy * (sig[1] - points[k][1])) / s : 0;
        const abrupto = subida <= maxRamp && along - ultimoAlto <= maxRamp && k - i - 1 <= maxInterior;
        if (abrupto && cosSale > 0.97 && paralelo / along >= minParallel && along / d(points[i], points[k]) <= maxDetour) fin = k;
        break;
      }
      if (lat >= minLateral) {
        if (subida < 0) subida = along;
        ultimoAlto = along;
      }
      maxLat = Math.max(maxLat, lat);
    }
    i = fin > 0 ? fin : i + 1;
  }
  return out;
}

// Grafo v3: cada punto de la ruta lleva en p[6] cuanto correrlo al dibujarlo
// (metros; + a la derecha del sentido de marcha, - a la izquierda en paises
// de mano izquierda). Sale de la corrida con que el mapa dibuja cada calzada:
// asi la ruta va sobre la calzada de la mano por la que se va y no por el
// cantero. spreadEdgeShift la reparte a lo largo de una arista, entre la
// corrida de sus dos puntas, segun la distancia (points[desde] es el nodo de
// salida). Si el nodo ya trae una corrida, la de la arista anterior, se
// arranca desde esa y no desde la propia: donde se juntan dos calles con
// distinto cantero la ruta pasaba de una a otra con un escalon en el nodo;
// asi se va corriendo a lo largo de la arista nueva.
function spreadEdgeShift(points, desde, sIni, sFin) {
  let total = 0;
  for (let j = desde + 1; j < points.length; j++) {
    total += Math.hypot(points[j][0] - points[j - 1][0], points[j][1] - points[j - 1][1]);
  }
  if (points[desde][6] == null) points[desde][6] = sIni;
  else sIni = points[desde][6];
  let acum = 0;
  for (let j = desde + 1; j < points.length; j++) {
    acum += Math.hypot(points[j][0] - points[j - 1][0], points[j][1] - points[j - 1][1]);
    points[j][6] = total > 0 ? sIni + (sFin - sIni) * (acum / total) : sFin;
  }
}

// Corre cada punto p[6] metros a la derecha de la direccion de marcha en ese
// punto. Coordenadas del juego: x al este, y al SUR, asi que la derecha de
// (dx, dy) es (-dy, dx). Devuelve copias; sin corrida (grafo v2), el punto
// queda igual. La direccion se mide sobre ventana metros hacia atras y
// hacia adelante, no con los vecinos pegados: con un tramo de un par de
// metros en diagonal (un empalme, la punta de la ruta) salia cualquier
// direccion y el punto se corria para el lado equivocado, con picos y
// zigzags.
function routeDrawShift(points, ventana = 15) {
  const n = points.length;
  const d = (i, j) => Math.hypot(points[j][0] - points[i][0], points[j][1] - points[i][1]);
  return points.map((p, i) => {
    const s = p[6];
    if (!s) return p;
    let ia = i, atras = 0;
    while (ia > 0 && atras < ventana) { atras += d(ia - 1, ia); ia--; }
    let ib = i, adelante = 0;
    while (ib < n - 1 && adelante < ventana) { adelante += d(ib, ib + 1); ib++; }
    const a = points[ia], b = points[ib];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (L < 1e-6) return p;
    const q = p.slice();
    q[0] = p[0] + (-dy / L) * s;
    q[1] = p[1] + (dx / L) * s;
    return q;
  });
}

// La otra punta del mismo problema: donde las dos manos pasan de tramos
// separados (cada uno donde esta) a un tramo de doble mano (por el eje), o
// al reves, la ruta cambia de linea con un escalon corto y cruzado, y no
// vuelve. Se reparte a lo largo del tramo vecino mas largo sacando el punto
// del escalon de ese lado: el cambio de linea queda como una transicion
// suave en vez de un salto. Solo entre dos tramos largos y paralelos, para
// no tocar giros de verdad.
// El reparto se limita a maxTaper metros: el punto del escalon se corre
// hacia atras sobre su misma linea, no se saca, porque sacarlo lo repartia
// sobre el tramo vecino entero y con un tramo de 300 m la ruta quedaba un
// buen trecho fuera de la calle.
function taperShortSteps(points, { maxStep = 25, minNeighbor = 20, minShift = 3, maxShift = 20, maxTaper = 60 } = {}) {
  if (points.length < 4) return points;
  const pts = points.slice();
  const d = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (let k = 1; k + 2 < pts.length; k++) {
    const a = pts[k - 1], b = pts[k], c = pts[k + 1], e = pts[k + 2];
    const antes = d(a, b), paso = d(b, c), despues = d(c, e);
    if (paso > maxStep || paso < 0.5 || antes < minNeighbor || despues < minNeighbor) continue;
    const u = [(b[0] - a[0]) / antes, (b[1] - a[1]) / antes];
    const w = [(e[0] - c[0]) / despues, (e[1] - c[1]) / despues];
    if (u[0] * w[0] + u[1] * w[1] < 0.97) continue;          // las dos lineas, paralelas
    const cosPaso = (u[0] * (c[0] - b[0]) + u[1] * (c[1] - b[1])) / paso;
    if (cosPaso > 0.8) continue;                              // el paso va cruzado
    const corrimiento = Math.abs(u[0] * (c[1] - b[1]) - u[1] * (c[0] - b[0]));
    if (corrimiento < minShift || corrimiento > maxShift) continue;
    if (antes >= despues) {
      const t = Math.min(maxTaper, antes / 2);
      pts[k] = [b[0] - u[0] * t, b[1] - u[1] * t];
    } else {
      const t = Math.min(maxTaper, despues / 2);
      pts[k + 1] = [c[0] + w[0] * t, c[1] + w[1] * t];
    }
  }
  return pts;
}

// Todo lo que se le saca al dibujo de la ruta antes de suavizarlo.
function cleanRouteForDrawing(points) {
  return taperShortSteps(dropShortExcursions(points));
}

// Redondea la distancia al proximo giro en escalones cada vez mas finos a
// medida que te acercas (como un GPS real): >10km redondea a 1km, entre
// 1-10km a 500m, entre 100m-1km a 100m, y por debajo de 100m a 10m.
// Ej: 11km, 9.5km, 800m, 80m.
function roundTurnDistanceMeters(m) {
  if (m > 10000) return Math.round(m / 1000) * 1000;
  if (m > 1000) return Math.round(m / 500) * 500;
  if (m > 100) return Math.round(m / 100) * 100;
  return Math.round(m / 10) * 10;
}

function formatTurnDistance(m, imperial) {
  if (imperial) return formatTurnDistanceImperial(m);
  const rounded = roundTurnDistanceMeters(m);
  if (rounded >= 1000) {
    const km = rounded / 1000;
    return `${Number.isInteger(km) ? km : km.toFixed(1)} km`;
  }
  return `${rounded} m`;
}

// Mismo criterio en millas/pies: >10 mi de a 1 mi, >1 mi de a 0.5, entre
// 0.2 y 1 mi de a 0.1, y por debajo en pies de a 50. Ej: 9 mi, 2.5 mi,
// 0.4 mi, 800 ft.
function formatTurnDistanceImperial(m) {
  const mi = m / 1609.344;
  if (mi >= 10) return `${Math.round(mi)} mi`;
  if (mi >= 1) { const r = Math.round(mi * 2) / 2; return `${Number.isInteger(r) ? r : r.toFixed(1)} mi`; }
  if (mi >= 0.2) { const r = Math.round(mi * 10) / 10; return `${r >= 1 ? '1' : r.toFixed(1)} mi`; }
  const ft = Math.round(m * 3.28084 / 50) * 50;
  return `${ft} ft`;
}

// Diagnostico de la conexion que muestra la app (chip de la barra, linea de
// detalle y tarjeta vacia sobre el mapa) a partir del estado combinado de:
// el socket del viewer, lo que dijo el backend (hay cliente local?), el
// diagnostico que manda el cliente (client_status) y si llego telemetria.
// Devuelve claves de i18n, no texto - app.js las traduce. Puro para poder
// testearlo (test_pure.js) - es la parte con mas combinaciones de la app.
//   conn = { socket: 'idle'|'connecting'|'open'|'closed', demo, invalidCode,
//            waitingClient (link guardado, cliente de la PC apagado),
//            clientConnected: null|bool, clientStatus: {status}|null,
//            hasTelemetry, paused }
function connectionViewFor(conn) {
  if (conn.socket === 'idle') return null;
  if (conn.demo) return { chip: 'chipDemo', cls: 'info', detail: 'detailDemo', empty: null, live: true };
  if (conn.spectator) return { chip: 'chipSpectator', cls: 'info', detail: 'detailSpectator', empty: null, live: true };
  if (conn.invalidCode) return { chip: 'chipInvalidCode', cls: 'err', detail: 'detailInvalidCode', empty: null };
  // Link guardado (?code=...) con el cliente de la PC apagado: el backend no
  // conoce la sesion todavia y se reintenta cada pocos segundos. Sin esto la
  // tablet parpadeaba entre "Conectando" y "Se perdio la conexion".
  if (conn.waitingClient) return { chip: 'chipNoClient', cls: 'err', detail: 'detailNoClient', empty: ['emptyNoClientTitle', 'emptyNoClientBody', '💻', true] };
  if (conn.socket === 'connecting') return { chip: 'chipConnecting', cls: '', detail: null, empty: null };
  if (conn.socket === 'closed') return { chip: 'chipReconnecting', cls: 'err', detail: null, empty: ['emptyReconnectTitle', 'emptyReconnectBody', '📡'] };
  if (conn.clientConnected === false) return { chip: 'chipNoClient', cls: 'err', detail: 'detailNoClient', empty: ['emptyNoClientTitle', 'emptyNoClientBody', '💻', true] };
  const st = conn.clientStatus ? conn.clientStatus.status : undefined;
  if (st === 'plugin_missing' || st === 'plugin_not_installed') return { chip: 'chipPluginMissing', cls: 'warn', detail: 'detailPluginMissing', empty: ['emptyPluginTitle', 'emptyPluginBody', '🧩'] };
  if (st === 'waiting_game' || (!conn.hasTelemetry && st !== 'waiting_truck' && st !== 'live')) return { chip: 'chipWaitingGame', cls: 'warn', detail: 'detailWaitingGame', empty: ['emptyWaitingGameTitle', 'emptyWaitingGameBody', '🎮'] };
  if (st === 'waiting_truck' || !conn.hasTelemetry) return { chip: 'chipWaitingTruck', cls: 'info', detail: 'detailWaitingTruck', empty: ['emptyWaitingTruckTitle', 'emptyWaitingTruckBody', '🚚'] };
  return { chip: conn.paused ? 'chipPaused' : 'chipLive', cls: 'live', detail: null, empty: null, live: true };
}

// Distancia acumulada a lo largo de la ruta y punto interpolado a `dist`
// metros del inicio - base para medir rumbos de entrada/salida en un nodo.
function routeMetrics(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const pointAt = (dist) => {
    if (dist <= 0) return pts[0];
    for (let i = 1; i < pts.length; i++) {
      if (cum[i] >= dist) {
        const seg = cum[i] - cum[i - 1];
        const f = seg ? (dist - cum[i - 1]) / seg : 0;
        return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f];
      }
    }
    return pts[pts.length - 1];
  };
  return { cum, pointAt };
}

function normDeg(d) { return ((d + 540) % 360) - 180; }

// Un prefab (interseccion, enlace de autopista) aporta varios nodos de
// cruce a pocos metros uno de otro, y la ruta los une con cuerdas rectas
// que zigzaguean (11 m a 60 grados y vuelta) aunque la calzada siga
// derecha. Se agrupan como UN cruce: nodos de cruce consecutivos unidos
// por tramos cortos. Devuelve el indice del ultimo nodo del grupo.
// maxSpanM acota el largo total: una avenida con nodos de cruce cada 20 m
// no es un solo prefab, y sin tope el giro del final se atribuia al inicio.
function junctionClusterEnd(pts, cum, i, maxGapM, maxSpanM) {
  const span = maxSpanM != null ? maxSpanM : 100;
  let j = i;
  while (j + 1 < pts.length - 1 && pts[j + 1][3] === 1 && cum[j + 1] - cum[j] < maxGapM && cum[j + 1] - cum[i] <= span) j++;
  return j;
}

// Si desde el vecino n del nodo `from` se llega a escapeM de `from` sin
// pisar los nodos de `blocked`: una salida de verdad, y no un brazo muerto de
// un prefab o un tramo que vuelve enseguida a la ruta.
function leadsAway(adjacency, nodeAt, from, n, blocked, escapeM = 120) {
  const o = nodeAt(from);
  const seen = new Set([from, n]);
  const queue = [n];
  for (let q = 0; q < queue.length && q < 80; q++) {
    const cur = queue[q];
    const p = nodeAt(cur);
    if (Math.hypot(p[0] - o[0], p[1] - o[1]) >= escapeM) return true;
    for (const [m] of (adjacency.get(cur) || [])) {
      if (seen.has(m) || blocked.has(m)) continue;
      seen.add(m); queue.push(m);
    }
  }
  return false;
}

// El anillo de una rotonda armada con tramos de un solo sentido: un ciclo
// dirigido de menos de maxLenM que pasa por `start`, sin pasar por `from`
// (la calle por la que se llega), hecho solo de tramos de un sentido (asi
// un triangulo de calles de doble mano no cuenta). Devuelve la lista de sus
// nodos, en orden, o null.
function oneWayRing(adjacency, nodeAt, start, from, maxLenM = 700, maxDepth = 40) {
  const oneWay = (a, b) => !(adjacency.get(b) || []).some(([m]) => m === a);
  let budget = 300;
  const path = [start];
  const dfs = (cur, lenM) => {
    if (--budget < 0 || path.length > maxDepth) return false;
    const p = nodeAt(cur);
    for (const [m] of (adjacency.get(cur) || [])) {
      if (m === from || !oneWay(cur, m)) continue;
      const q = nodeAt(m);
      const len = lenM + Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (len > maxLenM) continue;
      if (m === start) return path.length >= 3;
      if (path.includes(m)) continue;
      path.push(m);
      if (dfs(m, len)) return true;
      path.pop();
    }
    return false;
  };
  return dfs(start, 0) ? path : null;
}

// Puntos cada stepM a lo largo de un anillo (nodos en orden), siguiendo la
// curva de cada tramo si edgeLine la da: la forma real, no solo sus nodos.
function ringOutline(ringPath, nodeAt, edgeLine, stepM = 5) {
  const out = [];
  for (let k = 0; k < ringPath.length; k++) {
    const a = ringPath[k], b = ringPath[(k + 1) % ringPath.length];
    const line = (edgeLine && edgeLine(a, b)) || [nodeAt(a), nodeAt(b)];
    for (let j = 1; j < line.length; j++) {
      const [x0, z0] = line[j - 1], [x1, z1] = line[j];
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / stepM));
      for (let t = 0; t < n; t++) out.push([x0 + (x1 - x0) * t / n, z0 + (z1 - z0) * t / n]);
    }
  }
  return out;
}

// Cuanto se dobla de mas en una polilinea: la suma de los cambios de rumbo
// menos el cambio neto. Una salida de rotonda se abre para un lado y rodea
// la isla para el otro; una esquina comun dobla una sola vez.
function extraTurningDeg(line, bearingBetween) {
  let total = 0, prev = null, first = null, last = null;
  for (let k = 1; k < line.length; k++) {
    if (Math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]) < 0.5) continue;
    const b = bearingBetween(line[k - 1], line[k]);
    if (prev != null) total += Math.abs(normDeg(b - prev));
    if (first == null) first = b;
    prev = b; last = b;
  }
  return first == null ? 0 : total - Math.abs(normDeg(last - first));
}

// Puntos repartidos alrededor de un centro: ninguno mas de maxRatio veces
// mas lejos del centro que el mas cercano (y nada pegado al centro).
function roundish(points, maxRatio) {
  const cx = points.reduce((s2, p) => s2 + p[0], 0) / points.length;
  const cz = points.reduce((s2, p) => s2 + p[1], 0) / points.length;
  const radios = points.map(p => Math.hypot(p[0] - cx, p[1] - cz));
  const min = Math.min(...radios);
  return min >= 8 && Math.max(...radios) <= maxRatio * min;
}

// La rotonda en la que entra la ruta en el cruce i..iEnd, y por que salida
// sale (pedido de Discord, 09-10: "en la rotonda, tomar la segunda salida").
// El grafo no marca las rotondas; se las reconoce de dos formas:
//  - anillo redondo de tramos de un solo sentido (oneWayRing): la ruta entra en un
//    nodo del anillo y lo sigue; se cuentan los nodos del anillo con una
//    salida de verdad (leadsAway) hasta el que la ruta deja.
//  - rotonda compacta de un solo prefab: el brazo de entrada se une directo
//    con cada brazo de salida, con curvas que rodean la isla (al menos dos
//    doblan 90 grados de mas), cortas y con los brazos repartidos alrededor
//    de un centro. Las salidas se ordenan por el largo de su curva: la primera es
//    la mas corta.
// ctx: { pts, cum, i, iEnd, adjacency, nodeAt, edgeLine(a, b), bearingBetween }.
// Devuelve { exit, enter, leave } (indices de pts) o null.
function detectRoundabout(ctx) {
  const { pts, i, iEnd, adjacency, nodeAt, edgeLine, bearingBetween } = ctx;
  if (!adjacency || !nodeAt) return null;
  const escapeM = ctx.escapeM != null ? ctx.escapeM : 120;
  // Nodos de la ruta (indice en pts) desde el anterior al cruce hasta el
  // siguiente.
  const idxs = [];
  for (let k = i - 1; k >= 0; k--) if (pts[k][4] != null) { idxs.push(k); break; }
  for (let k = i; k <= iEnd; k++) if (pts[k][4] != null) idxs.push(k);
  for (let k = iEnd + 1; k < pts.length; k++) if (pts[k][4] != null) { idxs.push(k); break; }
  for (let a = 1; a < idxs.length; a++) {
    const kPrev = idxs[a - 1], kEnter = idxs[a];
    const u = pts[kPrev][4], v = pts[kEnter][4];
    // Anillo
    // Redondo: un tramo corto de calle dividida (las dos manos y los nodos
    // donde se separan y se juntan) tambien es un ciclo de un sentido, pero
    // alargado; una manzana de calles de una mano es cuadrada (1,41).
    const ringPath = oneWayRing(adjacency, nodeAt, v, u);
    const ring = ringPath && ringPath.length >= 4 && roundish(ringOutline(ringPath, nodeAt, edgeLine), 1.3)
      ? new Set(ringPath) : null;
    if (ring && !ring.has(u)) {
      let exit = 0, leave = kEnter, k = kEnter;
      for (;;) {
        let next = null;
        for (let j = k + 1; j < pts.length; j++) if (pts[j][4] != null) { next = j; break; }
        const w = pts[k][4];
        if (k !== kEnter) {
          const sale = next != null && !ring.has(pts[next][4]);
          const otra = (adjacency.get(w) || []).some(([n]) => !ring.has(n) && leadsAway(adjacency, nodeAt, w, n, ring, escapeM));
          if (sale || otra) exit++;
          if (sale) { leave = k; break; }
        }
        if (next == null || !ring.has(pts[next][4])) { leave = k; break; }
        k = next;
      }
      if (exit >= 1 && leave !== kEnter) return { exit, enter: kEnter, leave };
      continue;
    }
    // Prefab compacto: de v (brazo de entrada) al siguiente nodo de la ruta
    if (a + 1 >= idxs.length || !edgeLine) continue;
    const kLeave = idxs[a + 1], b = pts[kLeave][4];
    const outs = (adjacency.get(v) || []).filter(([n]) => n !== u);
    if (outs.length < 2 || !outs.some(([n]) => n === b)) continue;
    if (outs.some(([, m]) => !(m <= 150))) continue;
    if (!roundish([v, ...outs.map(([n]) => n)].map(nodeAt), 1.7)) continue;
    const rodean = outs.filter(([n]) => { const line = edgeLine(v, n); return line && extraTurningDeg(line, bearingBetween) >= 90; });
    if (rodean.length < 2) continue;
    // Y la ruta la usa: rodea la isla o dobla (la primera salida). Pasar
    // derecho por un prefab chico con curvas raras no es una rotonda.
    const propia = edgeLine(v, b);
    if (!propia || (extraTurningDeg(propia, bearingBetween) < 90
      && Math.abs(normDeg(bearingBetween(propia[propia.length - 2], propia[propia.length - 1]) - bearingBetween(propia[0], propia[1]))) < 45)) continue;
    const prefab = new Set([v, ...outs.map(([n]) => n)]);
    const salidas = outs.filter(([n]) => n === b || leadsAway(adjacency, nodeAt, n, n, prefab, escapeM))
      .sort((x, y) => x[1] - y[1]);
    const exit = salidas.findIndex(([n]) => n === b) + 1;
    if (exit >= 1) return { exit, enter: kEnter, leave: kLeave };
  }
  return null;
}

// Si el nodo `start` es parte de un anillo corto (una rotonda): un camino
// dirigido que vuelve a el en menos de maxLenM sin pasar por `from` (el
// nodo de la calle por la que se llega) ni volver por la misma arista. Las
// manzanas de una ciudad son mas grandes; una rotonda del juego mide
// 100-250 m de vuelta.
function ringThrough(adjacency, nodeAt, start, from, maxLenM = 350, maxDepth = 24) {
  let budget = 400; // nodos a visitar como mucho
  const dfs = (cur, parent, lenM, depth) => {
    if (--budget < 0 || depth > maxDepth) return false;
    const p = nodeAt(cur);
    for (const [m] of (adjacency.get(cur) || [])) {
      if (m === parent || m === from) continue;
      const q = nodeAt(m);
      const len = lenM + Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (len > maxLenM) continue;
      if (m === start) return depth >= 2;
      if (dfs(m, cur, len, depth + 1)) return true;
    }
    return false;
  };
  return dfs(start, from, 0, 0);
}

// Maniobra a anunciar en el cruce que empieza en el nodo i de la ruta (y
// termina en iEnd, ver junctionClusterEnd). Dos casos:
//  - 'turn': el rumbo cambia mas de turnThreshold grados, medido legM metros
//    antes del cruce contra legM metros despues (una curva larga no cuenta).
//  - 'fork': el cambio es chico pero en ese cruce hay OTRA salida mas recta
//    que la nuestra - salida de autopista, bifurcacion en Y, rampa. Se mide
//    a forkLegM (mas lejos: una rampa se separa de la autopista de a poco) y
//    se compara contra la salida alternativa mas recta del grafo (vecinos
//    de los nodos del cruce, extendidos un salto mas si el primero es corto).
//    Solo cuenta si nosotros nos desviamos al menos forkMinDev y la
//    diferencia con la alternativa es al menos forkMinSep; si la alternativa
//    dobla mas que nosotros (una calle lateral) no es bifurcacion.
//  - null: derecho.
// pts[k] = [x, z, ferry, junction, nodeIdx]; adjacency: Map nodeIdx -> [[to, ...]]
// (dirigida: en una via de un solo sentido solo aparecen las salidas
// reales, asi que una rampa de INGRESO que se une por atras no es candidata).
function detectManeuver(ctx) {
  const { pts, i, cum, pointAt, bearingBetween, nodes, adjacency } = ctx;
  // nodes puede ser un array de [x,y] (tests) o un Float32Array plano del
  // grafo binario, en cuyo caso ctx.nodeXY(i) devuelve el par.
  const nodeAt = ctx.nodeXY || ((k) => nodes[k]);
  const iEnd = ctx.iEnd != null ? ctx.iEnd : i;
  const turnThreshold = ctx.turnThreshold != null ? ctx.turnThreshold : 35;
  const legM = ctx.legM != null ? ctx.legM : 60;
  const forkLegM = ctx.forkLegM != null ? ctx.forkLegM : 250;
  const forkMinDev = ctx.forkMinDev != null ? ctx.forkMinDev : 6;
  const forkMinSep = ctx.forkMinSep != null ? ctx.forkMinSep : 8;
  const forkAltSlack = ctx.forkAltSlack != null ? ctx.forkAltSlack : 10;
  const forkTurnMinDeg = ctx.forkTurnMinDeg != null ? ctx.forkTurnMinDeg : 15;
  const forkTurnDeg = ctx.forkTurnDeg != null ? ctx.forkTurnDeg : 55;
  const forkTurnAltMaxDeg = ctx.forkTurnAltMaxDeg != null ? ctx.forkTurnAltMaxDeg : 20;
  const turnAltMaxDeg = ctx.turnAltMaxDeg != null ? ctx.turnAltMaxDeg : 150;
  const turnNaturalMargin = ctx.turnNaturalMargin != null ? ctx.turnNaturalMargin : 45;
  const rejoinM = ctx.rejoinM != null ? ctx.rejoinM : 100;
  const escapeM = ctx.escapeM != null ? ctx.escapeM : 120;
  const inBearing = bearingBetween(pointAt(cum[i] - legM), pts[i]);
  const outBearing = bearingBetween(pts[iEnd], pointAt(cum[iEnd] + legM));
  const delta = normDeg(outBearing - inBearing);

  // Las otras salidas del cruce, como cambio de rumbo contra el de entrada.
  // Nodos propios de la ruta (no cuentan como "otra salida"): los del cruce
  // y el nodo real anterior/siguiente - saltando puntos intermedios de la
  // geometria de la curva, que no tienen indice de nodo. Cada salida se
  // mide lejos (un salto mas por la mas recta si el primer vecino esta a
  // menos de forkLegM): una rampa se separa de a poco.
  let alts = null;
  const altDeltas = () => {
    if (alts) return alts;
    alts = [];
    const onRoute = new Set();
    for (let k = i; k <= iEnd; k++) if (pts[k][4] != null) onRoute.add(pts[k][4]);
    for (let k = i - 1; k >= 0; k--) if (pts[k][4] != null) { onRoute.add(pts[k][4]); break; }
    for (let k = iEnd + 1; k < pts.length; k++) if (pts[k][4] != null) { onRoute.add(pts[k][4]); break; }
    // Una salida que vuelve a la ruta enseguida, o que no lleva a ningun
    // lado, no es otro camino: los dos lados de un rombo de la calzada (un
    // ensanche con isleta) daban "keep left" yendo derecho por una calle de
    // un carril (reporte de Discord, 09-10). Cuenta solo si desde ella se
    // llega a escapeM del cruce sin pisar la ruta. No alcanza con mirar un
    // salto: en un prefab cada brazo se une con todos los demas.
    const ahead = new Set(onRoute);
    for (let k = iEnd + 1; k < pts.length && cum[k] - cum[iEnd] <= rejoinM; k++) if (pts[k][4] != null) ahead.add(pts[k][4]);
    const escapes = (from, n) => leadsAway(adjacency, nodeAt, from, n, ahead, escapeM);
    for (let k = i; k <= iEnd; k++) {
      const idx = pts[k][4];
      if (idx == null) continue;
      for (const [n] of (adjacency.get(idx) || [])) {
        if (ahead.has(n) || !escapes(idx, n)) continue;
        let far = nodeAt(n);
        if (Math.hypot(far[0] - pts[k][0], far[1] - pts[k][1]) < forkLegM) {
          const b1 = bearingBetween(pts[k], far);
          let bestM = null, bestDiff = Infinity;
          for (const [m] of (adjacency.get(n) || [])) {
            if (m === idx || onRoute.has(m)) continue;
            const diff = Math.abs(normDeg(bearingBetween(far, nodeAt(m)) - b1));
            if (diff < bestDiff) { bestDiff = diff; bestM = m; }
          }
          if (bestM != null) far = nodeAt(bestM);
        }
        alts.push(normDeg(bearingBetween(pts[i], far) - inBearing));
      }
    }
    return alts;
  };
  // La salida mas recta de las que no vuelven para atras (|delta| <= maxAbs).
  const straightestAlt = (maxAbs) => {
    let best = null;
    for (const a of altDeltas()) if (Math.abs(a) <= maxAbs && (best == null || Math.abs(a) < Math.abs(best))) best = a;
    return best;
  };

  if (Math.abs(delta) > turnThreshold) {
    // Con el grafo a mano, un giro se anuncia solo si habia por donde
    // equivocarse: la calle que dobla 40 grados con un camino lateral del
    // otro lado no es un giro, es la calle (reporte de Discord, 09-10: "me
    // dice que me prepare para doblar aunque no hay otro camino"). Sin otra
    // salida, o si la mas recta se desvia turnNaturalMargin mas que la
    // nuestra, se sigue de largo sin aviso. Se devuelve igual, con quiet,
    // para que el cruce siguiente no tome esta curva como un giro suyo (ver
    // continuesTurn). La entrada a una rotonda tampoco tiene otra salida (el
    // anillo es de un solo sentido), pero se anuncia: lo que viene es elegir
    // la salida.
    let quiet = false;
    if (adjacency && nodes) {
      const alt = straightestAlt(turnAltMaxDeg);
      quiet = alt == null || Math.abs(alt) >= Math.abs(delta) + turnNaturalMargin;
      if (quiet) {
        // El nodo de entrada ya es parte del anillo; se busca desde el y desde
        // el siguiente, sin volver por la calle por la que se llega.
        let before = null, next = null;
        for (let k = i - 1; k >= 0; k--) if (pts[k][4] != null) { before = pts[k][4]; break; }
        for (let k = iEnd + 1; k < pts.length; k++) if (pts[k][4] != null) { next = pts[k][4]; break; }
        for (const start of [pts[iEnd][4], next]) {
          if (start != null && ringThrough(adjacency, nodeAt, start, before)) { quiet = false; break; }
        }
      }
    }
    // Dentro del grupo, el giro se atribuye al nodo donde mas cambia el
    // rumbo entre cuerdas consecutivas - no al primero del grupo, que en una
    // avenida con nodos cada 20 m puede quedar 80 m antes de la esquina.
    let at = i, bestLocal = -1;
    for (let k = i; k <= iEnd; k++) {
      if (k < 1 || k + 1 >= pts.length) continue;
      const local = Math.abs(normDeg(bearingBetween(pts[k], pts[k + 1]) - bearingBetween(pts[k - 1], pts[k])));
      if (local > bestLocal) { bestLocal = local; at = k; }
    }
    return { kind: 'turn', direction: delta > 0 ? 'right' : 'left', delta, at, inBearing, outBearing, quiet };
  }

  if (!adjacency || !nodes) return null;
  const routeDelta = normDeg(bearingBetween(pts[i], pointAt(cum[iEnd] + forkLegM)) - inBearing);
  if (Math.abs(routeDelta) < forkMinDev) return null;
  const bestAlt = straightestAlt(100); // mas de 100: vuelve para atras, no es una continuacion
  if (bestAlt == null) return null;
  if (Math.abs(normDeg(routeDelta - bestAlt)) < forkMinSep) return null;
  if (Math.abs(bestAlt) > Math.abs(routeDelta) + forkAltSlack) return null;
  const direction = routeDelta > bestAlt ? 'right' : 'left';
  // Carril de giro con isleta (la esquina de una ciudad de EE.UU.): se separa
  // poco en los primeros legM metros, pero a forkLegM ya dobla de verdad y la
  // otra salida sigue derecho. El GPS del juego dice "turn right" y nosotros
  // "keep right" (resena de Roane Gaming en YouTube, 10-10). Una salida de
  // autopista se separa de a poco (pocos grados a legM) y sigue siendo keep.
  if (Math.abs(delta) >= forkTurnMinDeg && Math.abs(routeDelta) >= forkTurnDeg && Math.abs(bestAlt) <= forkTurnAltMaxDeg) {
    return { kind: 'turn', direction, delta: routeDelta, at: i, inBearing, outBearing: (inBearing + routeDelta + 360) % 360, quiet: false };
  }
  return { kind: 'fork', direction, delta: routeDelta, at: i };
}

// Una esquina grande (un cruce en T de un prefab ancho, con mas de 50 m
// entre el nodo por el que se entra y el que se sale) no se agrupa como un
// solo cruce, y cada mitad de los 90 grados pasaba el umbral: se anunciaba
// "dobla a la izquierda" y, ya doblando, otra vez (reporte de Discord,
// 09-10). El giro `m` que viene a menos de gapMaxM del anterior `prev`, en
// el mismo sentido, es la misma esquina si de la entrada del primero a la
// salida del segundo se dobla menos de maxDeg. Dos giros de verdad seguidos
// (derecha y derecha: la vuelta a la manzana, el retorno) suman ~180.
// Lo mismo despues de una curva callada (quiet), que el tramo de entrada
// del cruce siguiente alcanza; pero ahi el segundo tiene que doblar menos
// de quietAddDeg mas que la salida de la curva: una curva de 40 grados y a
// 70 m una esquina de verdad hacia el mismo lado no suman 135, y la esquina
// se perdia.
// prev: { direction, inBearing, outBearing, quiet, end } con end en metros
// sobre la ruta.
function continuesTurn(prev, m, startM, gapMaxM = 80, maxDeg = 135, quietAddDeg = 35) {
  if (!prev || !m || m.kind !== 'turn' || m.direction !== prev.direction) return false;
  if (startM - prev.end > gapMaxM) return false;
  if (prev.quiet) return Math.abs(normDeg(m.outBearing - prev.outBearing)) < quietAddDeg;
  return Math.abs(normDeg(m.outBearing - prev.inBearing)) < maxDeg;
}

// Anti-parpadeo de la indicacion de giro: una maniobra nueva tiene que
// detectarse `ticks` ticks seguidos para mostrarse, y desaparecer otros
// tantos para borrarse. Con la misma maniobra ya mostrada se devuelve la
// deteccion fresca (distancia actualizada). state: objeto mutable propio.
function stabilizeManeuver(state, turn, ticks) {
  // Mismo cruce (nodos a menos de 40 m: un prefab suele tener varios) =
  // misma maniobra: se actualiza la distancia pero se conserva el tipo y el
  // sentido ya mostrados, para que "keep left" no cambie a "turn left" al
  // acercarse (la rampa curva cada vez mas dentro de los 60 m de medicion).
  if (turn && state.shown && Math.hypot(turn.node[0] - state.shown.node[0], turn.node[1] - state.shown.node[1]) < 40) {
    state.shown = { ...state.shown, distanceMeters: turn.distanceMeters, nearSign: turn.nearSign || state.shown.nearSign };
    state.candidate = undefined; state.candidateTicks = 0;
    return state.shown;
  }
  const key = turn ? `${turn.kind}|${turn.direction}|${Math.round(turn.node[0])},${Math.round(turn.node[1])}` : null;
  const shownKey = state.shown ? state.shownKey : null;
  if (key === shownKey) {
    if (turn) state.shown = turn;
    state.candidate = undefined; state.candidateTicks = 0;
    return state.shown || null;
  }
  if (state.candidate === key) state.candidateTicks++;
  else { state.candidate = key; state.candidateTicks = 1; }
  if (state.candidateTicks >= ticks) {
    state.shown = turn; state.shownKey = key;
    state.candidate = undefined; state.candidateTicks = 0;
    return turn;
  }
  return state.shown || null;
}

// Consumo medido de verdad: litros gastados / km recorridos segun el odometro
// y el nivel del tanque, sobre una ventana movil de windowKm. El SDK trae un
// "consumo promedio" y una "autonomia" que el juego calcula con un valor
// nominal del camion (un usuario midio 32 L/100km fijos contra 23.9 reales),
// asi que la autonomia salia 25% corta. La serie se reinicia al cargar
// combustible (el tanque sube), al cambiar de camion/juego o si el odometro
// retrocede; hasta juntar minKm no hay dato (se cae al del SDK).
function createFuelTracker({ windowKm = 150, minKm = 15, refuelL = 2 } = {}) {
  let samples = []; // [{odo, fuel}] ordenados por odometro
  let key = null;
  let last = null;
  return {
    push(odoKm, fuelL, truckKey) {
      if (odoKm == null || fuelL == null || !isFinite(odoKm) || !isFinite(fuelL)) return;
      if (truckKey !== key || (last && (fuelL > last.fuel + refuelL || odoKm < last.odo - 0.01))) {
        samples = []; key = truckKey;
      }
      last = { odo: odoKm, fuel: fuelL };
      if (!samples.length || odoKm - samples[samples.length - 1].odo >= 0.2) samples.push(last);
      else samples[samples.length - 1] = last; // mismo tramo: quedarse con el ultimo valor
      // recortar por delante dejando siempre un punto de arranque dentro de la ventana
      while (samples.length > 2 && odoKm - samples[1].odo >= windowKm) samples.shift();
    },
    // L/100km medido, o null si todavia no hay minKm de datos
    avgLPer100() {
      if (samples.length < 2) return null;
      const first = samples[0], now = samples[samples.length - 1];
      const km = now.odo - first.odo, used = first.fuel - now.fuel;
      if (km < minKm || used <= 0) return null;
      return used / km * 100;
    },
    // km de datos que respaldan la medicion (para mostrarlo)
    spanKm() { return samples.length < 2 ? 0 : samples[samples.length - 1].odo - samples[0].odo; },
    state() { return { key, samples }; },
    restore(saved) { if (saved && Array.isArray(saved.samples)) { samples = saved.samples.slice(-1000); key = saved.key; last = samples[samples.length - 1] || null; } },
  };
}

// Reloj del juego a partir de time_abs del SDK (minutos absolutos desde el
// inicio del mundo, que arranca un lunes 00:00 - misma convencion que usan
// las herramientas de la comunidad). Devuelve el dia de la semana (0 = lunes)
// y la hora, para que la web lo formatee en el idioma del usuario.
function gameClockFromMinutes(totalMinutes) {
  if (totalMinutes == null || !Number.isFinite(totalMinutes) || totalMinutes < 0) return null;
  const minutes = Math.floor(totalMinutes);
  const minuteOfDay = minutes % 1440;
  return { dayIndex: Math.floor(minutes / 1440) % 7, hours: Math.floor(minuteOfDay / 60), minutes: minuteOfDay % 60 };
}

// Escala de tiempo del juego: minutos de juego por minuto real. Se mide en
// vivo comparando time_abs contra el reloj real, porque no es constante (el
// juego la baja cuando el camion esta detenido) ni igual en los dos mapas.
// La usan el ETA real de la app y las conversiones del panel (docs/dash/):
// el SDK da el descanso y el vencimiento del trabajo en tiempo de juego, y
// lo unico que le sirve a quien mira la pantalla es cuanto es eso en su
// reloj. Mediana y no promedio: una pausa mete una muestra absurda y la
// mediana la ignora sola.
function createTimeScale({ minSampleSeconds = 30, maxSamples = 10, minScale = 1, maxScale = 60 } = {}) {
  let samples = [];
  let last = null;
  return {
    push(gameTimeMinutes, ts) {
      if (gameTimeMinutes == null || ts == null) return;
      if (!last) { last = { ts, gameMin: gameTimeMinutes }; return; }
      if (ts - last.ts < minSampleSeconds) return;
      const scale = (gameTimeMinutes - last.gameMin) / ((ts - last.ts) / 60);
      if (scale > minScale && scale < maxScale) samples.push(scale);
      if (samples.length > maxSamples) samples.shift();
      last = { ts, gameMin: gameTimeMinutes };
    },
    // null mientras no haya dos muestras: quien llama decide con que caer
    // (la app usa la escala nominal del mapa).
    value() {
      if (samples.length < 2) return null;
      const sorted = [...samples].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    },
    reset() { samples = []; last = null; },
  };
}

// Tiempo que falta al ritmo que se viene manejando, mezclado con el estimado
// del juego. El del juego (navigation.time) supone que se va al limite todo
// el camino: en ciudad, con transito o con un camion que no llega al limite,
// la llegada se corre de a poco y nadie lo nota (reporte de Reddit: decia
// 7:30, llego a las 9 o 10). Lo medido solo, en cambio, en ciudad a 20 km/h
// extrapola "5 h" para un viaje de 50 min. Por eso se mezclan: el peso de lo
// medido arranca a los blendStart segundos de viaje y llega a blendMax a los
// blendFull.
//
// El peso se cuenta desde el PRIMER dato de este destino, no desde la
// muestra mas vieja de la ventana: la ventana es de 5 min, y contado desde
// ahi el peso nunca pasaba de 0,26 aunque la cuenta prometia 0,7 a los 10.
//
// La usan la app (resumen de ruta, ETA real) y el panel (docs/dash/), en
// segundos REALES; quien quiera la hora del juego multiplica por la escala.
function createPaceEta({
  windowSeconds = 300, minSpanSeconds = 30, recalcSeconds = 5, minSpeedKmh = 5,
  blendStart = 120, blendFull = 600, blendMax = 0.7,
} = {}) {
  let destino;
  let desde = null;
  let samples = [];   // { m: segundos en movimiento acumulados, km: lo que falta }
  let enMovimiento = 0;
  let previo = null;
  let valor = null;
  let ultimoCalculo = null;
  let velocidad = null;
  const pace = {
    // destino: cualquier cosa que cambie cuando cambia el viaje (la ciudad
    // de destino). ts en segundos.
    //
    // El ritmo se mide solo con el tiempo en que la distancia baja. Con el
    // reloj de pared, diez minutos en un peaje o cargando nafta hacian
    // bajar el promedio de a poco y el ETA crecia a decenas de horas antes
    // de que el camion "contara" como parado. El transito lento si cuenta:
    // ahi la distancia baja, despacio.
    push(target, ts, remainingKm) {
      if (ts == null || remainingKm == null || !Number.isFinite(remainingKm)) return;
      if (target !== destino) { pace.reset(); destino = target; }
      if (desde == null) desde = ts;
      let movio = !previo;
      if (previo) {
        const dt = ts - previo.ts;
        const bajo = previo.km - remainingKm;
        // Si la distancia sube, el juego recalculo la ruta: lo medido hasta
        // aca era sobre otro camino.
        if (bajo < -0.5) { samples = []; movio = true; }
        // Un hueco largo (juego en pausa, conexion caida) no es manejo.
        else if (bajo > 0 && dt > 0 && dt < 30) { enMovimiento += dt; movio = true; }
      }
      previo = { ts, km: remainingKm };
      // Parado no se guarda nada: si no, una hora estacionado a 10 datos por
      // segundo juntaba 36.000 muestras que nunca salen de la ventana.
      if (!movio) return;
      samples.push({ m: enMovimiento, km: remainingKm });
      samples = samples.filter(s => enMovimiento - s.m <= windowSeconds);
      // Un numero que salta en cada dato es mas ruido que informacion.
      if (ultimoCalculo != null && ts - ultimoCalculo < recalcSeconds) return;
      if (samples.length < 2) return;
      const viejo = samples[0];
      const andando = enMovimiento - viejo.m;
      if (andando < minSpanSeconds) return;
      const kmh = (viejo.km - remainingKm) / andando * 3600;
      if (kmh < minSpeedKmh) return;
      ultimoCalculo = ts;
      velocidad = kmh;
      valor = remainingKm / kmh * 3600;
    },
    measuredSeconds() { return valor; },
    avgSpeedKmh() { return velocidad; },
    weight(ts) {
      if (desde == null || ts == null) return 0;
      return Math.max(0, Math.min(blendMax, (ts - desde - blendStart) / (blendFull - blendStart) * blendMax));
    },
    // priorSeconds: el estimado del juego ya pasado a segundos reales.
    estimate(priorSeconds, ts) {
      if (valor == null) return priorSeconds;
      if (priorSeconds == null) return valor;
      const w = pace.weight(ts);
      return priorSeconds * (1 - w) + valor * w;
    },
    reset() {
      destino = undefined; desde = null; samples = []; enMovimiento = 0; previo = null;
      valor = null; ultimoCalculo = null; velocidad = null;
    },
  };
  return pace;
}

// Estadisticas de la sesion del panel (docs/dash/): kilometros, tiempo al
// volante, ganancia neta, combustible y un registro de lo que fue pasando.
// Todo se calcula aca a partir de los ticks - el SDK no lleva ninguna de
// estas cuentas.
//
// Cuatro decisiones que cambian lo que se lee en pantalla:
//
// - **La velocidad promedio se divide por horas de JUEGO, no reales.** 88 km
//   a 48 km/h son 1,8 horas de juego y unos seis minutos tuyos; dividirlos
//   por los reales daria 750 km/h. El tiempo al volante, en cambio, si es
//   real: es cuanto rato estuviste ahi sentado.
// - **Los kilometros salen del odometro por diferencias**, no de restar el
//   final menos el inicial: cambiar de camion reinicia el odometro y la
//   resta simple daba un total negativo.
// - **El combustible gastado suma solo las bajas del tanque.** Una subida es
//   haber cargado, no consumo negativo.
// - **Un salto grande entre dos ticks no se cuenta.** Un ferry, un viaje
//   rapido o una reconexion mueven el odometro decenas de kilometros sin
//   que nadie haya manejado. Se prefiere quedarse corto: un numero de menos
//   se nota menos que un numero inventado.
function createSessionStats({ maxGapSeconds = 10, overLimitToleranceKmh = 2,
                              maxSpeedKmh = 200, maxGameScale = 25 } = {}) {
  let s;

  function fresh(game, startedAt) {
    return {
      game: game || null, startedAt: startedAt != null ? startedAt : null, lastTs: null,
      kmDriven: 0, wheelSeconds: 0, gameDrivingMinutes: 0, overLimitSeconds: 0, topSpeedKmh: 0,
      fuelUsedL: 0, odoLast: null, fuelLast: null, truckKey: null, gameTimeLast: null,
      jobs: { count: 0, amount: 0 }, cancelled: { count: 0, amount: 0 },
      fines: { count: 0, amount: 0 }, tolls: { count: 0, amount: 0 }, ferries: { count: 0, amount: 0 },
      prev: { tollgate: false, fined: false, ferry: false, train: false, jobDelivered: false, jobCancelled: false },
    };
  }
  s = fresh();

  function trackEvents(data, ts) {
    const e = data.event || {};
    const money = (v) => v || 0;
    if (e.tollgate && !s.prev.tollgate) {
      s.tolls.count++; s.tolls.amount += money(e.tollgatePayAmount);
    }
    if (e.fined && !s.prev.fined) {
      s.fines.count++; s.fines.amount += money(e.fineAmount);
    }
    if (e.ferry && !s.prev.ferry) {
      s.ferries.count++; s.ferries.amount += money(e.ferryPayAmount);
    }
    if (e.train && !s.prev.train) {
      s.ferries.count++; s.ferries.amount += money(e.trainPayAmount);
    }
    if (e.jobDelivered && !s.prev.jobDelivered) {
      s.jobs.count++; s.jobs.amount += money(e.jobDeliveredRevenue);
    }
    if (e.jobCancelled && !s.prev.jobCancelled) {
      s.cancelled.count++; s.cancelled.amount += money(e.jobCancelledPenalty);
    }
    s.prev = {
      tollgate: !!e.tollgate, fined: !!e.fined, ferry: !!e.ferry, train: !!e.train,
      jobDelivered: !!e.jobDelivered, jobCancelled: !!e.jobCancelled,
    };
  }

  return {
    reset(game, ts) {
      s = fresh(game, ts);
    },
    push(data) {
      const ts = data && data.ts;
      if (ts == null) return;
      // Cambiar de juego es empezar de cero: las multas de ETS2 no son parte
      // de una sesion de ATS (ver el mismo criterio en app.js).
      if (data.game && s.game && data.game !== s.game) this.reset(data.game, ts);
      if (s.startedAt == null) s.startedAt = ts;
      if (data.game && !s.game) s.game = data.game;

      const dt = s.lastTs == null ? 0 : Math.min(Math.max(ts - s.lastTs, 0), maxGapSeconds);
      s.lastTs = ts;

      const truckKey = [data.game, data.truckBrand, data.truckName].join('|');
      const otroCamion = s.truckKey != null && truckKey !== s.truckKey;
      s.truckKey = truckKey;

      // Cuanto tiempo DE JUEGO paso en este tick. Es lo que acota cuanto
      // pudo avanzar el odometro, y no los segundos reales: el reloj del
      // juego corre unas 19 veces mas rapido, asi que a 80 km/h el odometro
      // sube 0,42 km por segundo tuyo. Un tope calculado con tiempo real
      // rechazaria como teletransporte un avance perfectamente normal.
      // Un salto de mas de una hora de juego no es manejar: es dormir,
      // tomarse un ferry o viajar rapido.
      let avanceJuegoMin = null;
      if (data.gameTimeMinutes != null) {
        if (s.gameTimeLast != null) {
          const salto = data.gameTimeMinutes - s.gameTimeLast;
          if (salto > 0 && salto < 60) avanceJuegoMin = salto;
        }
        s.gameTimeLast = data.gameTimeMinutes;
      }
      // Sin reloj del juego (cliente viejo) se asume la escala mas rapida.
      const horasDeJuego = avanceJuegoMin != null ? avanceJuegoMin / 60 : (dt / 3600) * maxGameScale;

      if (data.odometerKm != null) {
        if (s.odoLast != null && !otroCamion) {
          const avance = data.odometerKm - s.odoLast;
          // Lo maximo que se pudo haber manejado en ese hueco, con margen.
          if (avance > 0 && avance <= horasDeJuego * maxSpeedKmh + 0.05) s.kmDriven += avance;
        }
        s.odoLast = data.odometerKm;
      }

      const speed = data.speedKmh || 0;
      const moving = !data.paused && speed > 1;
      if (moving) {
        s.wheelSeconds += dt;
        if (avanceJuegoMin != null) s.gameDrivingMinutes += avanceJuegoMin;
        if (data.speedLimitKmh > 0 && speed > data.speedLimitKmh + overLimitToleranceKmh) s.overLimitSeconds += dt;
      }
      if (!data.paused && speed > s.topSpeedKmh && speed < maxSpeedKmh) s.topSpeedKmh = speed;

      if (data.fuel != null) {
        if (s.fuelLast != null && !otroCamion) {
          const bajo = s.fuelLast - data.fuel;
          if (bajo > 0 && bajo < 20) s.fuelUsedL += bajo;
        }
        s.fuelLast = data.fuel;
      }

      trackEvents(data, ts);
    },
    state() {
      const horasJuego = s.gameDrivingMinutes / 60;
      const horasReales = s.startedAt != null && s.lastTs != null ? (s.lastTs - s.startedAt) / 3600 : 0;
      const neto = s.jobs.amount - s.fines.amount - s.tolls.amount - s.ferries.amount - s.cancelled.amount;
      return {
        game: s.game, startedAt: s.startedAt, lastTs: s.lastTs,
        kmDriven: s.kmDriven, wheelSeconds: s.wheelSeconds, elapsedSeconds: horasReales * 3600,
        overLimitSeconds: s.overLimitSeconds,
        overLimitRatio: s.wheelSeconds > 0 ? s.overLimitSeconds / s.wheelSeconds : 0,
        topSpeedKmh: s.topSpeedKmh,
        // Con menos de un kilometro el promedio es ruido, no una medicion.
        avgSpeedKmh: horasJuego > 0 && s.kmDriven >= 1 ? s.kmDriven / horasJuego : null,
        fuelUsedL: s.fuelUsedL,
        fuelPer100Km: s.kmDriven >= 1 && s.fuelUsedL > 0 ? s.fuelUsedL / s.kmDriven * 100 : null,
        netProfit: neto,
        // Antes de cinco minutos la extrapolacion dice cualquier cosa.
        profitPerHour: horasReales >= 5 / 60 ? neto / horasReales : null,
        jobs: { ...s.jobs }, cancelled: { ...s.cancelled }, fines: { ...s.fines },
        tolls: { ...s.tolls }, ferries: { ...s.ferries },
      };
    },
  };
}

// Viaje de la demo. Vive aca y no en app.js porque lo usan las dos vistas:
// el mapa (que le agrega la posicion sobre la ruta) y el panel de
// docs/dash/. Cuando estaban separados mostraban viajes distintos, y
// alternar de una a otra parecia otro juego.
// Con ids, como los manda el juego: sin cityDstId la app no puede buscar la
// empresa y la demo mostraba "Approximate: the game did not say which
// company". Las dos empresas estan en pois-ats.json (si no, la ruta cae al
// centro de la ciudad y vuelve ese aviso).
const DEMO_ROUTE = {
  game: 'ats', from: 'Salt Lake City', to: 'Las Vegas',
  fromId: 'salt_lake', toId: 'las_vegas',
  companyFrom: 'Coastline Mining', companyTo: 'Bitumen',
  companyFromId: 'cm_min_svc', companyToId: 'bit_rd_svc',
  cargo: 'Bulldozer', cargoMassKg: 18189,
  truckBrand: 'Volvo', truckName: 'VNL', jobIncome: 61158,
};

// Telemetria sintetica, un tick por llamada a next(). Es un adelanto
// rapido (timeScale), pero COHERENTE consigo mismo: los kilometros que
// suma el odometro son los que se recorren a la velocidad que muestra el
// velocimetro en el tiempo de juego que avanza el reloj, y el combustible
// baja segun esos kilometros. Antes cada uno iba a su ritmo; nada los
// cruzaba hasta que el panel empezo a calcular consumo y promedio, y le
// salian 166 l/100km y 29 km/h.
//
// El mapa del juego esta a escala ~1:20 y la telemetria real ya viene
// multiplicada, asi que la demo hace lo mismo (distanceScale) para que los
// numeros se vean normales.
function createDemoTelemetry(opts) {
  const o = Object.assign({
    tickMs: 250,          // misma tasa que el cliente por el relay (4 Hz)
    // Al ritmo del juego. Estaba en 6x "para que pasen cosas", pero en modo
    // navegacion, que esta acercado, el camion volaba (se noto en el video
    // de YouTube del 09-10): a 1x se ve como manejando de verdad.
    timeScale: 1,
    distanceScale: 20,
    speedMs: 26,          // ~94 km/h
    tankL: 600,
    lPer100: 32,
    totalKm: 680,         // largo del viaje; la app pasa el de su ruta real
    startKm: 0,           // desde donde arranca (?demoKm= en la app, para grabar videos)
  }, opts || {});
  let tick = 0, travelledKm = Math.max(0, o.startKm % o.totalKm || 0);
  let odometer = 184220 + travelledKm;
  let fuelL = 0.82 * o.tankL;
  let gameMinutes = 2 * 1440 + 21 * 60;  // miercoles 21:00 en el juego
  return {
    // Cuanto del viaje va hecho, 0..1: la app lo usa para ubicar el camion
    // sobre su ruta.
    progress() { return o.totalKm ? travelledKm / o.totalKm : 0; },
    next() {
      tick++;
      const dtSec = o.tickMs / 1000;
      const speedKmh = o.speedMs * 3.6 + Math.sin(tick / 28) * 4;
      const kmTick = o.speedMs * o.timeScale * o.distanceScale * dtSec / 1000;
      travelledKm += kmTick;
      if (travelledKm >= o.totalKm) travelledKm = 0;  // vuelve a empezar
      odometer += kmTick;
      gameMinutes += kmTick / speedKmh * 60;
      fuelL -= kmTick * o.lPer100 / 100;
      // Con el tanque vacio la demo dejaria de gastar y el consumo medido
      // se iria cayendo solo. Carga sola, como haria cualquiera.
      if (fuelL < o.tankL * 0.08) fuelL = o.tankL;
      const remainingKm = Math.max(0, o.totalKm - travelledKm);
      // Un tablero con una sola luz prendida no muestra nada: los guinos,
      // el limpiaparabrisas y el retarder van y vienen.
      const ciclo = tick % 240;
      return {
        ts: Date.now() / 1000,
        clientVersion: '9.9.9',
        paused: false,
        game: DEMO_ROUTE.game,
        speedKmh,
        speedLimitKmh: Math.floor(tick / 160) % 3 === 0 ? 88.5 : 104.6,
        cargo: DEMO_ROUTE.cargo,
        cargoMassKg: DEMO_ROUTE.cargoMassKg,
        citySrc: DEMO_ROUTE.from,
        cityDst: DEMO_ROUTE.to,
        citySrcId: DEMO_ROUTE.fromId,
        cityDstId: DEMO_ROUTE.toId,
        companySrc: DEMO_ROUTE.companyFrom,
        companyDst: DEMO_ROUTE.companyTo,
        companySrcId: DEMO_ROUTE.companyFromId,
        companyDstId: DEMO_ROUTE.companyToId,
        onJob: true,
        isCargoLoaded: true,
        plannedDistanceKm: o.totalKm,
        routeDistanceKm: remainingKm,
        routeTimeSeconds: remainingKm / speedKmh * 3600,
        gameTimeMinutes: gameMinutes,
        restStopMinutes: 6 * 60 + 40,
        jobDeadlineSeconds: 3600 * 9,
        truckBrand: DEMO_ROUTE.truckBrand,
        truckName: DEMO_ROUTE.truckName,
        odometerKm: odometer,
        fuel: fuelL,
        fuelCapacity: o.tankL,
        fuelRangeKm: fuelL / o.lPer100 * 100,
        fuelAvgConsumption: o.lPer100,
        adblue: 46, adblueCapacity: 80,
        wear: { engine: 0.03, transmission: 0.02, cabin: 0.06, chassis: 0.04, wheels: 0.11 },
        trailerWear: { chassis: 0.08, wheels: 0.14, body: 0.01 },
        cargoDamage: 0.004,
        jobIncome: DEMO_ROUTE.jobIncome,
        cruiseControl: true,
        cruiseControlSpeedKmh: 94,
        lights: {
          beamLow: true, beamHigh: false, parking: true, beacon: false, hazards: false,
          blinkerLeft: ciclo < 40, blinkerRight: ciclo >= 120 && ciclo < 160,
        },
        wipers: ciclo >= 60 && ciclo < 180,
        motorBrake: ciclo >= 200,
        retarder: ciclo >= 200 ? 2 : 0, retarderSteps: 3,
        differentialLock: false,
        liftAxle: false,
        engineRpm: 1250 + Math.sin(tick / 20) * 120,
        engineRpmMax: 2500,
        gear: 12,
        engineEnabled: true,
        parkingBrake: false,
        trailerAttached: true,
        airPressure: 132, oilPressure: 51, batteryVoltage: 27.4,
        waterTemperature: 81, oilTemperature: 94, brakeTemperature: 38,
        mechanicalWarnings: {},
        event: {},
      };
    },
  };
}

// Zoom del modo navegacion elegido en Ajustes. 10 es el de siempre (el que
// estaba fijo); se puede ir de 8 (mas lejos) a 13 (mas cerca), de a 0,5. Lo
// guardado se valida: un valor roto o de otra version cae al de siempre y no
// a un mapa ilegible.
const NAV_ZOOM_DEFAULT = 10;
const NAV_ZOOM_MIN = 8;
const NAV_ZOOM_MAX = 13;
function navZoomSetting(raw) {
  const z = typeof raw === 'string' ? parseFloat(raw) : raw;
  if (typeof z !== 'number' || !isFinite(z)) return NAV_ZOOM_DEFAULT;
  return Math.round(Math.min(NAV_ZOOM_MAX, Math.max(NAV_ZOOM_MIN, z)) * 2) / 2;
}

// Si "lo que falta" sale de nuestra ruta y no del GPS del juego. El juego en 0
// con una ruta nuestra larga: todavia no tiene ruta (partida recien cargada).
// El juego muy por debajo de la nuestra: apunta a otra cosa, como el remolque
// en el deposito de origen del freight market hasta engancharlo (Discord
// 10-10: "says I'm at the location when clearly I'm not"). Cerca del destino
// las dos dan casi 0, por eso el kilometro de margen.
function useOwnRemaining(gameKm, ownKm) {
  if (ownKm == null || !(ownKm > 1)) return false;
  return !gameKm || gameKm < ownKm * 0.25;
}

// Tamano de la flecha del camion elegido en Ajustes (multiplicador): de 1 a 3
// en pasos de 0.25. Un usuario con poca vista no la encontraba en la tablet
// ("I'm blind and can barely see it", Discord 10-10).
const TRUCK_SIZE_DEFAULT = 1;
const TRUCK_SIZE_MIN = 1;
const TRUCK_SIZE_MAX = 3;
function truckSizeSetting(raw) {
  const v = typeof raw === 'string' ? parseFloat(raw) : raw;
  if (typeof v !== 'number' || !isFinite(v)) return TRUCK_SIZE_DEFAULT;
  return Math.round(Math.min(TRUCK_SIZE_MAX, Math.max(TRUCK_SIZE_MIN, v)) * 4) / 4;
}

// Si el GeoJSON de la ruta tiene algo que dibujar (una LineString o una
// MultiLineString con al menos un tramo de dos puntos). Con ruta, las
// autopistas pierden el naranja para que la ruta sea lo unico con color,
// como en el GPS del juego.
function routeHasLine(feature) {
  const g = feature && feature.geometry;
  if (!g || !Array.isArray(g.coordinates)) return false;
  if (g.type === 'LineString') return g.coordinates.length >= 2;
  if (g.type === 'MultiLineString') return g.coordinates.some(part => Array.isArray(part) && part.length >= 2);
  return false;
}

// Tamano de un elemento acomodado a mano (modo acomodar): la escala nueva
// sale de cuanto se arrastro la manija de la esquina respecto del ancho con
// que se empezo. Nunca mas grande de lo que entra entre donde esta y el borde
// del mapa (maxWidth, maxHeight en px desde su esquina de arriba a la
// izquierda): si se pasara, quedaria cortado y la manija, afuera. Con grilla,
// en pasos de 5 %.
const LAYOUT_SCALE_MIN = 0.6;
const LAYOUT_SCALE_MAX = 2.5;
function layoutScaleFor({ startScale, startWidth, startHeight, dx, dy, maxWidth, maxHeight, snap }) {
  if (!(startScale > 0) || !(startWidth > 0) || !(startHeight > 0)) return startScale || 1;
  // Se sigue al dedo en la direccion que mas se movio: arrastrar en diagonal,
  // para abajo o para el costado agranda igual.
  const factor = Math.max((startWidth + dx) / startWidth, (startHeight + dy) / startHeight);
  let s = startScale * factor;
  const fits = startScale * Math.min(maxWidth / startWidth, maxHeight / startHeight);
  s = Math.min(s, LAYOUT_SCALE_MAX, fits);
  s = Math.max(s, LAYOUT_SCALE_MIN);
  if (snap) s = Math.round(s * 20) / 20;
  return Math.round(s * 1000) / 1000;
}

// Fatiga en %. El SDK no la manda: solo los minutos de juego que faltan para
// el proximo descanso. El intervalo entero es maximum_driving_time de
// def/economy_data.sii, 660 minutos (11 h) en los dos juegos. Si un mod lo
// alarga, el juego manda mas que eso recien dormido, y el mayor valor visto
// pasa a ser el tope: asi nunca da negativo.
const REST_INTERVAL_MINUTES = 660;
function createFatigue(intervalMinutes = REST_INTERVAL_MINUTES) {
  let max = intervalMinutes;
  return {
    // Devuelve 0..100 entero, o null si no hay descanso util (fatiga
    // apagada: el juego manda 0 o un valor sin sentido).
    push(restMinutes) {
      if (restMinutes == null || !(restMinutes > 0) || restMinutes >= 24 * 60) return null;
      if (restMinutes > max) max = restMinutes;
      return Math.round(Math.max(0, Math.min(100, (1 - restMinutes / max) * 100)));
    },
  };
}

// Guia por voz: que frase decir y cuando. La voz anterior (17-09, sacada al
// dia siguiente) leia nombres de rutas y los pronunciaba mal; esta no dice
// nombres ni numeros: un aviso anticipado ("Prepare to turn right") y otro en
// el punto ("Turn right"), elegidos por TIEMPO hasta la maniobra y no por
// distancia, asi no hay que decir km ni millas ni pensar en la escala del
// mapa. Las frases son claves de docs/app/voice/voices.json.
//
// maneuver(turn, speedKmh): turn es lo que devuelve stabilizeManeuver (el
// mismo cruce conserva su nodo, asi que el id no cambia al acercarse);
// distanceMeters va en metros del mundo, que el camion recorre a su
// velocidad real. Parado o casi (un semaforo antes de doblar) se toma una
// velocidad minima: si no, el aviso no llegaria nunca.
// arrival(key, kind, remainingKm, totalKm): una vez por destino; solo si la
// ruta era de mas de minTripKm, para no decir "llegaste" al tomar un trabajo
// estando ya en la empresa de carga.
// Caja de un mapa a partir de sus ciudades, con margen (las rutas y los
// puertos llegan mas alla de la ultima ciudad). Sirve para darse cuenta de
// que un camion esta en un mapa que no conocemos: los mods de Sudamerica
// para ETS2, por ejemplo, se arman en el mismo mundo, cientos de km al oeste
// de Europa, y la flecha quedaba en el medio del Atlantico.
function mapBoundsFromCities(cities, margin = 0.15) {
  if (!Array.isArray(cities) || cities.length < 2) return null;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const c of cities) {
    if (!Number.isFinite(c.X) || !Number.isFinite(c.Y)) continue;
    minX = Math.min(minX, c.X); maxX = Math.max(maxX, c.X);
    minZ = Math.min(minZ, c.Y); maxZ = Math.max(maxZ, c.Y);
  }
  if (!Number.isFinite(minX) || maxX <= minX || maxZ <= minZ) return null;
  const mx = (maxX - minX) * margin, mz = (maxZ - minZ) * margin;
  return { minX: minX - mx, maxX: maxX + mx, minZ: minZ - mz, maxZ: maxZ + mz };
}
// Sin caja (ciudades sin cargar) se da por adentro: mejor una flecha de mas
// que esconder a todos mientras carga el mapa.
function insideMapBounds(bounds, x, z) {
  if (!bounds || !Number.isFinite(x) || !Number.isFinite(z)) return true;
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

// Rotonda: "tomar la segunda salida", con frase grabada hasta la quinta; mas
// alla se dice hacia que lado sale.
const VOICE_ROUNDABOUT_MAX_EXIT = 5;
function voiceManeuverKey(turn) {
  if (turn.kind === 'roundabout' && turn.exit >= 1 && turn.exit <= VOICE_ROUNDABOUT_MAX_EXIT) return `roundabout_${turn.exit}`;
  return `${turn.kind === 'fork' ? 'keep' : 'turn'}_${turn.direction === 'left' ? 'left' : 'right'}`;
}
function createVoiceGuide(opts = {}) {
  const soonSec = opts.soonSec != null ? opts.soonSec : 20;
  const nowSec = opts.nowSec != null ? opts.nowSec : 6;
  // Un aviso anticipado pegado al del punto no sirve: se dice solo el segundo.
  const minLeadSec = opts.minLeadSec != null ? opts.minLeadSec : 4;
  const minSpeedMs = opts.minSpeedMs != null ? opts.minSpeedMs : 5;
  const arriveKm = opts.arriveKm != null ? opts.arriveKm : 0.3;
  const minTripKm = opts.minTripKm != null ? opts.minTripKm : 1;
  let current = null; // { id, soon, now }
  let arrivedKey = null;
  return {
    maneuver(turn, speedKmh) {
      if (!turn || !turn.node || !Number.isFinite(turn.distanceMeters)) return null;
      const id = `${turn.kind}|${turn.direction}|${Math.round(turn.node[0])},${Math.round(turn.node[1])}`;
      if (!current || current.id !== id) current = { id, soon: false, now: false };
      const speedMs = Math.max(minSpeedMs, (Number(speedKmh) || 0) / 3.6);
      const seconds = turn.distanceMeters / speedMs;
      const action = voiceManeuverKey(turn);
      if (!current.now && seconds <= nowSec) {
        current.now = current.soon = true;
        return action;
      }
      if (!current.soon && seconds <= soonSec && seconds > nowSec + minLeadSec) {
        current.soon = true;
        return `soon_${action}`;
      }
      return null;
    },
    arrival(key, kind, remainingKm, totalKm) {
      if (key == null || !Number.isFinite(remainingKm) || key === arrivedKey) return null;
      if (kind !== 'dest' && kind !== 'pickup') return null;
      if (remainingKm > arriveKm || !(totalKm >= minTripKm)) return null;
      arrivedKey = key;
      return kind === 'pickup' ? 'arrive_pickup' : 'arrive_dest';
    },
  };
}

// La voz a usar segun el idioma de la app y la eleccion guardada (una por
// idioma). Sin voz para ese idioma, null; con la guardada que ya no existe,
// la primera del idioma.
function pickVoice(voices, lang, savedId) {
  const own = (voices || []).filter(v => v.lang === lang);
  if (!own.length) return null;
  return own.find(v => v.id === savedId) || own[0];
}

// ------------------------------------------------------------ DLC del mapa
// Cada tramo del grafo de rutas trae el dlcGuard de su road o prefab: el
// numero con el que el juego esconde lo de un DLC que no tenes. La tabla
// numero -> DLC es la del editor de mapas, tomada de truckermudgeon/maps
// (libs/map/constants.ts). Un numero pide TODOS sus DLC (los de dos son
// tramos de frontera). Un numero que no esta en la tabla, o que pide un DLC
// no publicado (Heart of Russia, o fronteras con estados que todavia no
// salieron: Illinois y Montana tienen), no se usa nunca: el juego tampoco
// los muestra.
const DLC_GUARDS = {
  ats: {
    0: [], 1: ['nv'], 2: ['az'], 3: ['nm'], 4: ['or'], 5: ['wa'], 6: ['wa', 'or'], 7: ['ut'],
    8: ['ut', 'nm'], 9: ['id'], 10: ['id', 'or'], 11: ['id', 'ut'], 12: ['id', 'wa'], 13: ['co'],
    14: ['co', 'nm'], 15: ['co', 'ut'], 16: ['wy'], 17: ['wy', 'co'], 18: ['wy', 'id'], 19: ['wy', 'ut'],
    20: ['tx'], 21: ['tx', 'nm'], 22: ['mt'], 23: ['mt', 'id'], 24: ['mt', 'wy'], 25: ['ok'],
    26: ['ok', 'co'], 27: ['ok', 'nm'], 28: ['ok', 'tx'], 29: ['ks'], 30: ['ks', 'co'], 31: ['ks', 'ok'],
    32: ['ne'], 33: ['ne', 'co'], 34: ['ne', 'ks'], 35: ['ne', 'wy'], 36: ['ar'], 37: ['ar', 'ok'],
    38: ['ar', 'tx'], 39: ['mo'], 40: ['mo', 'ar'], 41: ['mo', 'ks'], 42: ['mo', 'ne'], 43: ['mo', 'ok'],
    44: ['ia'], 45: ['ia', 'mo'], 46: ['ia', 'ne'], 47: ['la'], 48: ['la', 'ar'], 49: ['la', 'tx'],
    50: ['il'], 51: ['il', 'ia'], 52: ['il', 'mo'], 53: ['sd'], 54: ['sd', 'ia'], 55: ['sd', 'mt'],
    56: ['sd', 'ne'], 57: ['sd', 'wy'],
  },
  ets2: {
    0: [], 1: ['east'], 2: ['north'], 3: ['fr'], 4: ['it'], 5: ['it', 'fr'], 6: ['balt'],
    7: ['balt', 'east'], 8: ['balt', 'north'], 9: ['blacksea'], 10: ['blacksea', 'east'],
    11: ['iberia'], 12: ['iberia', 'fr'], 13: ['hor'], 14: ['hor', 'balt'], 15: ['krone'],
    16: ['wbalkans'], 17: ['wbalkans', 'east'], 18: ['wbalkans', 'balt'], 19: ['feldbinder'],
    20: ['greece'], 21: ['greece', 'east'], 22: ['greece', 'wbalkans'], 23: ['nordic'],
    24: ['nordic', 'balt'], 25: ['nordic', 'north'],
  },
};
// Los que se pueden destildar, en orden de salida. Nevada y Arizona vienen
// con el juego base de ATS: siempre prendidos, no se listan.
const DLC_LIST = {
  ats: [['nm', 'New Mexico'], ['or', 'Oregon'], ['wa', 'Washington'], ['ut', 'Utah'], ['id', 'Idaho'],
    ['co', 'Colorado'], ['wy', 'Wyoming'], ['mt', 'Montana'], ['tx', 'Texas'], ['ok', 'Oklahoma'],
    ['ks', 'Kansas'], ['ne', 'Nebraska'], ['ar', 'Arkansas'], ['mo', 'Missouri'], ['ia', 'Iowa'],
    ['la', 'Louisiana'], ['il', 'Illinois'], ['sd', 'South Dakota']],
  ets2: [['east', 'Going East!'], ['north', 'Scandinavia'], ['fr', 'Vive la France!'], ['it', 'Italia'],
    ['balt', 'Beyond the Baltic Sea'], ['blacksea', 'Road to the Black Sea'], ['iberia', 'Iberia'],
    ['wbalkans', 'West Balkans'], ['greece', 'Greece'], ['nordic', 'Nordic Horizons'],
    ['krone', 'Krone Trailer Pack'], ['feldbinder', 'Feldbinder Trailer Pack']],
};
const DLC_ALWAYS = { ats: ['nv', 'az'], ets2: [] };

// 'ats' o 'ets2' a partir de la variante del mapa ('ets2_promods', 'ats_c2c').
function dlcGameOf(variant) {
  return String(variant || '').startsWith('ats') ? 'ats' : 'ets2';
}

// Lo destildado de ese juego, limpio: solo ids que existen, sin repetir.
function normalizeDlcOff(raw) {
  const out = { ats: [], ets2: [] };
  for (const game of ['ats', 'ets2']) {
    const validos = new Set(DLC_LIST[game].map(d => d[0]));
    const lista = raw && Array.isArray(raw[game]) ? raw[game] : [];
    out[game] = [...new Set(lista.filter(id => validos.has(id)))];
  }
  return out;
}

// Los DLC que no se usan en ese juego. En automatico, los que el cliente
// NO encontro en la carpeta del juego (detected: {ats: [ids], ets2: [ids]},
// del client_status); sin datos del cliente (cliente viejo o desconectado),
// ninguno: mejor una ruta por un DLC que no tenes, avisada por el juego,
// que ninguna ruta. En manual, lo que destildo la persona.
function effectiveDlcOff(game, auto, detected, manualOff) {
  if (!auto) return manualOff || [];
  const tiene = detected && Array.isArray(detected[game]) ? detected[game] : null;
  if (!tiene) return [];
  return (DLC_LIST[game] || []).map(d => d[0]).filter(id => !tiene.includes(id));
}

// Uint8Array(64): 1 = ese dlcGuard no se usa. off: los ids destildados.
function dlcBlockedGuards(game, off) {
  const tabla = DLC_GUARDS[game] || {};
  const publicados = new Set(DLC_ALWAYS[game].concat(DLC_LIST[game].map(d => d[0])));
  const apagados = new Set(off || []);
  const mask = new Uint8Array(64);
  for (let g = 0; g < 64; g++) {
    const dlcs = tabla[g];
    mask[g] = !dlcs || dlcs.some(id => !publicados.has(id) || apagados.has(id)) ? 1 : 0;
  }
  return mask;
}

// Vas en auto (ATS 1.61, Road Trip)? Los autos usan otros lugares para
// descansar: en un area de descanso de camiones no se puede estacionar el
// auto (reporte de Discord, 08-10-2026). La marca la manda el cliente desde
// la 1.5.28 (truckBrandId); en ATS no hay camiones de estas marcas. Con un
// cliente viejo queda el trabajo con auto: carga con nombre y sin peso, como
// lo cuenta la API de cuentas.
const CAR_BRANDS = ['ford', 'ram', 'dodge', 'chevrolet'];
function isDrivingCar(data) {
  if (!data || data.game !== 'ats') return false;
  if (data.truckBrandId) return CAR_BRANDS.includes(String(data.truckBrandId).toLowerCase());
  return !!(data.onJob && data.cargo && !data.cargoMassKg);
}

// Donde cae el camion sobre la ruta, buscando solo hacia adelante y cerca:
// en un enlace con puente la calle transversal (que la ruta recorre 800 m
// mas adelante, despues del lazo) pasa a 10 m del camion y no puede ganar.
// points[0] es donde se lo ubico la ultima vez; la ventana crece con lo que
// avanzo desde ahi. Con una ventana fija de 400 m, un hueco entre lecturas
// (la pestana en segundo plano detras del juego: Chrome la frena a una
// lectura por minuto) dejaba al camion mas adelante que la ventana, la ruta
// no se recortaba nunca mas y las indicaciones pedian dar la vuelta (reporte
// de Discord, 09-10, Rolla -> Okatie). Devuelve { idx, point, dist } con el
// tramo [idx, idx + 1] mas cercano, o null si la ruta no tiene tramos.
function projectAheadOnRoute(points, x, z, baseWindowM = 400) {
  if (!points || points.length < 2) return null;
  const moved = Math.hypot(x - points[0][0], z - points[0][1]);
  const windowM = baseWindowM + 2 * moved;
  let best = null;
  let along = 0;
  for (let i = 0; i < points.length - 1; i++) {
    if (along > windowM) break;
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    const dx = bx - ax, dz = bz - az;
    const lenSq = dx * dx + dz * dz;
    along += Math.sqrt(lenSq);
    let t = lenSq > 0 ? ((x - ax) * dx + (z - az) * dz) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx, pz = az + t * dz;
    const dist = Math.hypot(x - px, z - pz);
    if (!best || dist < best.dist) best = { idx: i, point: [px, pz], dist };
  }
  return best;
}

// Waypoints guardados en el navegador para que sobrevivan a recargar la
// pagina (pedido de Discord, 09-10). stored: { [variante]: { at, list:
// [{ pos: [x, z], inGame, label }] } }. Devuelve la lista de la variante si
// no vencio (maxAgeMs desde el ultimo cambio; un waypoint de otro dia no
// tiene que adueñarse de la ruta), descartando lo que no tenga forma de
// waypoint, y como mucho max.
function storedWaypoints(stored, variant, now, maxAgeMs = 12 * 3600 * 1000, max = 9) {
  const entry = stored && typeof stored === 'object' ? stored[variant] : null;
  if (!entry || !Array.isArray(entry.list) || !Number.isFinite(entry.at)) return [];
  if (now - entry.at > maxAgeMs || entry.at > now + 60000) return [];
  const out = [];
  for (const w of entry.list) {
    if (!w || !Array.isArray(w.pos) || w.pos.length !== 2 || !w.pos.every(Number.isFinite)) continue;
    out.push({ pos: [w.pos[0], w.pos[1]], inGame: !!w.inGame, label: typeof w.label === 'string' ? w.label.slice(0, 80) : null });
    if (out.length >= max) break;
  }
  return out;
}

// Mods de mapa detectados por el cliente ({ets2: {...}|null, ats: {...}|null}).
// null quiere decir que game.log.txt todavia no lista los mods: el juego lo
// reescribe al arrancar y la lista aparece recien al cargar el perfil, unos
// 20-40 s despues. En ese hueco la web caia al mapa del juego base: con el
// camion en una ciudad de un mod (Okatie con Coast to Coast, log del 10-10)
// saltaba el aviso de "fuera del mapa" y la ruta se calculaba en el grafo
// equivocado. Un perfil sin mods trae su lista vacia (flags en false, no
// null), asi que mantener la ultima deteccion de ese juego no tapa nada.
function holdDetectedMods(prev, incoming) {
  if (!incoming || typeof incoming !== 'object') return incoming;
  const out = { ...incoming };
  for (const g of Object.keys(out)) {
    if (out[g] === null && prev && prev[g]) out[g] = prev[g];
  }
  return out;
}

// Resumen al entregar un trabajo: lo que paso en el viaje, en filas
// [clave i18n, tipo, valor]. Antes era un toast de 5 s con el pago, y quien
// estaba estacionando no lo veia ("the only thing it doesn't show you is what
// I made out of the job", resena de Roane Gaming, 10-10). Los campos que el
// cliente no manda (versiones viejas) o que vienen en cero no aparecen; el
// pago siempre, aunque sea 0. costs: multas y peajes pagados durante el
// trabajo (los suma la web, el SDK no los trae en la entrega).
function deliverySummary(event, costs = {}) {
  if (!event) return null;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const rows = [['deliveredPay', 'money', num(event.jobDeliveredRevenue) || 0]];
  const xp = num(event.jobEarnedXp);
  if (xp) rows.push(['deliveredXp', 'xp', xp]);
  const km = num(event.jobDeliveredDistanceKm);
  if (km) rows.push(['deliveredDistance', 'km', km]);
  const mins = num(event.jobDeliveryTime);
  if (mins) rows.push(['deliveredTime', 'minutes', mins]);
  const dmg = num(event.jobCargoDamage);
  if (dmg != null) rows.push(['cargoDamage', 'percent', Math.max(0, Math.min(1, dmg)) * 100]);
  if (num(costs.fines)) rows.push(['fines', 'money', costs.fines]);
  if (num(costs.tolls)) rows.push(['tolls', 'money', costs.tolls]);
  const route = [event.jobSrc, event.jobDst].every(Boolean) ? `${event.jobSrc} → ${event.jobDst}` : (event.jobDst || null);
  return { route, cargo: event.jobCargo || null, rows };
}

// Minutos del juego como "3 h 25 min" / "45 min".
function formatGameMinutes(mins, h = 'h', m = 'min') {
  const total = Math.max(0, Math.round(mins || 0));
  const hh = Math.floor(total / 60), mm = total % 60;
  return hh ? `${hh} ${h} ${mm} ${m}` : `${mm} ${m}`;
}

// Empresas que faltan en nuestros POIs. Si la empresa del trabajo no esta,
// la ruta cae al centro de la ciudad y la busqueda no la encuentra (Homburg
// Freight de Coast to Coast, Discord 10-10). El momento en que el juego da la
// carga por enganchada o el trabajo por entregado, el camion esta en la
// empresa: esa posicion es su lugar real, y sirve para completar los datos.
// tick() devuelve los reportes nuevos (uno por empresa y ciudad).
// known(token, nombre, ciudad): true/false si esta en los POIs.
function createMissingCompanyWatch() {
  let prev = null;
  const enviados = new Set();
  return {
    tick(data, pos, known) {
      const out = [];
      const ev = data.event || {};
      const reportar = (kind, token, name, city, cityName) => {
        if (!token || !city || !pos) return;
        const clave = `${token}|${city}`;
        if (enviados.has(clave) || known(token, name, city)) return;
        enviados.add(clave);
        out.push({ kind, company: token, companyName: name || null, city, cityName: cityName || null,
                   x: Math.round(pos.x), z: Math.round(pos.z) });
      };
      if (prev && prev.onJob && data.onJob) {
        // Carga propia: el SDK pasa a cargada en la empresa de origen. Freight
        // market y externos: la carga figura cargada desde el principio, y el
        // remolque se engancha en la empresa de origen.
        const cargo = prev.isCargoLoaded === false && data.isCargoLoaded === true;
        const remolque = /^(freight_market|external_)/.test(data.jobMarket || '')
          && prev.trailerAttached === false && data.trailerAttached === true;
        if (cargo || remolque) reportar('pickup', data.companySrcId, data.companySrc, data.citySrcId, data.citySrc);
      }
      // Entregado: el pulso puede llegar con los datos del trabajo ya
      // borrados, por eso se usa el destino del tick anterior.
      if (ev.jobDelivered && !(prev && prev.delivered) && prev && prev.companyDstId) {
        reportar('dest', prev.companyDstId, prev.companyDst, prev.cityDstId, prev.cityDst);
      }
      prev = {
        onJob: !!data.onJob, isCargoLoaded: data.isCargoLoaded, trailerAttached: data.trailerAttached,
        delivered: !!ev.jobDelivered,
        companyDstId: data.onJob ? data.companyDstId : (ev.jobDelivered && prev ? prev.companyDstId : null),
        companyDst: data.onJob ? data.companyDst : (ev.jobDelivered && prev ? prev.companyDst : null),
        cityDstId: data.onJob ? data.cityDstId : (ev.jobDelivered && prev ? prev.cityDstId : null),
        cityDst: data.onJob ? data.cityDst : (ev.jobDelivered && prev ? prev.cityDst : null),
      };
      return out;
    },
  };
}

// Texto para comparar en las busquedas: sin mayusculas ni tildes. Nadie
// escribe "Kraków" o "Zürich" en el celular, y la busqueda de empresas y
// ciudades no las encontraba. NFD separa las tildes; las letras que no se
// descomponen (ł, ø, ß, đ...) van a mano.
const FOLD_EXTRA = { 'ł': 'l', 'ø': 'o', 'ß': 'ss', 'đ': 'd', 'ð': 'd', 'þ': 'th', 'æ': 'ae', 'œ': 'oe', 'ı': 'i' };
function foldText(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[łøßđðþæœı]/g, ch => FOLD_EXTRA[ch]);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createMissingCompanyWatch, foldText, useOwnRemaining, truckSizeSetting, TRUCK_SIZE_DEFAULT, deliverySummary, formatGameMinutes, holdDetectedMods, CAR_BRANDS, isDrivingCar, projectAheadOnRoute, storedWaypoints, DLC_GUARDS, DLC_LIST, dlcGameOf, normalizeDlcOff, dlcBlockedGuards, effectiveDlcOff, mapBoundsFromCities, insideMapBounds, createVoiceGuide, voiceManeuverKey, pickVoice, createFatigue, REST_INTERVAL_MINUTES, spreadEdgeShift, routeDrawShift, dropShortExcursions, taperShortSteps, cleanRouteForDrawing,navZoomSetting, NAV_ZOOM_DEFAULT, NAV_ZOOM_MIN, NAV_ZOOM_MAX, routeHasLine, layoutScaleFor, LAYOUT_SCALE_MIN, LAYOUT_SCALE_MAX, geoBearingDeg, gridHeadingToGeo, smoothLineCoords, roundTurnDistanceMeters, formatTurnDistance, formatTurnDistanceImperial, connectionViewFor, routeMetrics, junctionClusterEnd, ringThrough, leadsAway, oneWayRing, extraTurningDeg, ringOutline, roundish, detectRoundabout, detectManeuver, continuesTurn, stabilizeManeuver, createFuelTracker, gameClockFromMinutes, createTimeScale, createPaceEta, createSessionStats,
    createDemoTelemetry, DEMO_ROUTE };
}

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

// Suaviza visualmente la ruta calculada (spline Catmull-Rom) - el grafo de
// rutas tiene los nodos bastante espaciados, asi que entre uno y otro es una
// linea recta, lo que se nota como "quiebres" en las curvas comparado con la
// geometria real de la calle (que sale de los tiles vectoriales, mucho mas
// densa). Esto es solo cosmetico: no cambia currentRouteWorldPoints, que se
// sigue usando tal cual para A*/deteccion de desvio/proximo giro.
function smoothLineCoords(points, segmentsPerPoint = 6) {
  if (points.length < 3) return points;
  const n = points.length;
  const result = [points[0]];
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < n ? i + 2 : n - 1];
    for (let t = 1; t <= segmentsPerPoint; t++) {
      const s = t / segmentsPerPoint;
      const s2 = s * s, s3 = s2 * s;
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * s + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * s2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * s3);
      const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * s + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * s2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * s3);
      result.push([x, y]);
    }
  }
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
  const inBearing = bearingBetween(pointAt(cum[i] - legM), pts[i]);
  const outBearing = bearingBetween(pts[iEnd], pointAt(cum[iEnd] + legM));
  const delta = normDeg(outBearing - inBearing);
  if (Math.abs(delta) > turnThreshold) {
    // Dentro del grupo, el giro se atribuye al nodo donde mas cambia el
    // rumbo entre cuerdas consecutivas - no al primero del grupo, que en una
    // avenida con nodos cada 20 m puede quedar 80 m antes de la esquina.
    let at = i, bestLocal = -1;
    for (let k = i; k <= iEnd; k++) {
      if (k < 1 || k + 1 >= pts.length) continue;
      const local = Math.abs(normDeg(bearingBetween(pts[k], pts[k + 1]) - bearingBetween(pts[k - 1], pts[k])));
      if (local > bestLocal) { bestLocal = local; at = k; }
    }
    return { kind: 'turn', direction: delta > 0 ? 'right' : 'left', delta, at };
  }

  if (!adjacency || !nodes) return null;
  const routeDelta = normDeg(bearingBetween(pts[i], pointAt(cum[iEnd] + forkLegM)) - inBearing);
  if (Math.abs(routeDelta) < forkMinDev) return null;
  // Nodos propios de la ruta (no cuentan como "otra salida"): los del cruce
  // y el nodo real anterior/siguiente - saltando puntos intermedios de la
  // geometria de la curva, que no tienen indice de nodo.
  const onRoute = new Set();
  for (let k = i; k <= iEnd; k++) if (pts[k][4] != null) onRoute.add(pts[k][4]);
  for (let k = i - 1; k >= 0; k--) if (pts[k][4] != null) { onRoute.add(pts[k][4]); break; }
  for (let k = iEnd + 1; k < pts.length; k++) if (pts[k][4] != null) { onRoute.add(pts[k][4]); break; }
  let bestAlt = null;
  for (let k = i; k <= iEnd; k++) {
    const idx = pts[k][4];
    if (idx == null) continue;
    for (const [n] of (adjacency.get(idx) || [])) {
      if (onRoute.has(n)) continue;
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
      const altDelta = normDeg(bearingBetween(pts[i], far) - inBearing);
      if (Math.abs(altDelta) > 100) continue; // vuelve para atras, no es una continuacion
      if (bestAlt == null || Math.abs(altDelta) < Math.abs(bestAlt)) bestAlt = altDelta;
    }
  }
  if (bestAlt == null) return null;
  if (Math.abs(normDeg(routeDelta - bestAlt)) < forkMinSep) return null;
  if (Math.abs(bestAlt) > Math.abs(routeDelta) + forkAltSlack) return null;
  return { kind: 'fork', direction: routeDelta > bestAlt ? 'right' : 'left', delta: routeDelta, at: i };
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
const DEMO_ROUTE = {
  game: 'ats', from: 'Salt Lake City', to: 'Las Vegas',
  companyFrom: 'Charged Industries', companyTo: 'Sierra Nevada',
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
    timeScale: 6,         // 6x mas rapido que el tiempo real, para que pasen cosas
    distanceScale: 20,
    speedMs: 26,          // ~94 km/h
    tankL: 600,
    lPer100: 32,
    totalKm: 680,         // largo del viaje; la app pasa el de su ruta real
  }, opts || {});
  let tick = 0, travelledKm = 0;
  let odometer = 184220;
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
        companySrc: DEMO_ROUTE.companyFrom,
        companyDst: DEMO_ROUTE.companyTo,
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { dropShortExcursions, taperShortSteps, cleanRouteForDrawing, navZoomSetting, NAV_ZOOM_DEFAULT, NAV_ZOOM_MIN, NAV_ZOOM_MAX, routeHasLine, layoutScaleFor, LAYOUT_SCALE_MIN, LAYOUT_SCALE_MAX, geoBearingDeg, smoothLineCoords, roundTurnDistanceMeters, formatTurnDistance, formatTurnDistanceImperial, connectionViewFor, routeMetrics, junctionClusterEnd, detectManeuver, stabilizeManeuver, createFuelTracker, gameClockFromMinutes, createTimeScale, createSessionStats,
    createDemoTelemetry, DEMO_ROUTE };
}

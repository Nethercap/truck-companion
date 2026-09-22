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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { geoBearingDeg, smoothLineCoords, roundTurnDistanceMeters, formatTurnDistance, formatTurnDistanceImperial, connectionViewFor, routeMetrics, junctionClusterEnd, detectManeuver, stabilizeManeuver, createFuelTracker };
}

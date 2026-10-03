// Corre con: node --test docs/app/test_pure.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { spreadEdgeShift, routeDrawShift, dropShortExcursions, taperShortSteps, cleanRouteForDrawing, navZoomSetting, NAV_ZOOM_DEFAULT, NAV_ZOOM_MIN, NAV_ZOOM_MAX, routeHasLine,layoutScaleFor, LAYOUT_SCALE_MIN, LAYOUT_SCALE_MAX, geoBearingDeg, gridHeadingToGeo, smoothLineCoords, roundTurnDistanceMeters, formatTurnDistance, formatTurnDistanceImperial, connectionViewFor, routeMetrics, junctionClusterEnd, detectManeuver, stabilizeManeuver, createFuelTracker , gameClockFromMinutes, createTimeScale,
  createPaceEta, createSessionStats, createDemoTelemetry } = require("./pure.js");

test('fuel tracker: consumo medido sobre la ventana, reinicio al cargar y al cambiar de camion', () => {
  const f = createFuelTracker({ windowKm: 100, minKm: 10 });
  assert.equal(f.avgLPer100(), null);
  // 25 L/100km constantes: cada km gasta 0.25 L
  for (let km = 0; km <= 20; km++) f.push(1000 + km, 500 - km * 0.25, 'ets2|Scania S');
  assert.ok(Math.abs(f.avgLPer100() - 25) < 1e-6);
  assert.ok(Math.abs(f.spanKm() - 20) < 1e-6);
  // ventana movil: despues de 150 km a 40 L/100km la media refleja solo los ultimos ~100 km
  for (let km = 21; km <= 170; km++) f.push(1000 + km, 500 - 20 * 0.25 - (km - 20) * 0.4, 'ets2|Scania S');
  assert.ok(Math.abs(f.avgLPer100() - 40) < 0.5, String(f.avgLPer100()));
  assert.ok(f.spanKm() <= 101);
  // cargar combustible reinicia la serie
  f.push(1171, 900, 'ets2|Scania S');
  assert.equal(f.avgLPer100(), null);
  for (let km = 1; km <= 12; km++) f.push(1171 + km, 900 - km * 0.3, 'ets2|Scania S');
  assert.ok(Math.abs(f.avgLPer100() - 30) < 1e-6);
  // otro camion: desde cero
  f.push(50, 300, 'ets2|Volvo FH');
  assert.equal(f.avgLPer100(), null);
  // datos invalidos se ignoran, el odometro quieto no rompe nada
  f.push(null, 300, 'ets2|Volvo FH'); f.push(50, 299, 'ets2|Volvo FH');
  assert.equal(f.avgLPer100(), null);
  // restaurar estado guardado
  const g = createFuelTracker({ windowKm: 100, minKm: 10 });
  g.restore(f.state());
  assert.equal(g.spanKm(), f.spanKm());
});

test('geoBearingDeg: norte puro es 0deg', () => {
  const bearing = geoBearingDeg(0, 0, 0, 1);
  assert.ok(Math.abs(bearing - 0) < 0.01);
});

test('geoBearingDeg: este puro es ~90deg', () => {
  const bearing = geoBearingDeg(0, 0, 1, 0);
  assert.ok(Math.abs(bearing - 90) < 0.5);
});

test('geoBearingDeg: sur puro es 180deg', () => {
  const bearing = geoBearingDeg(0, 1, 0, 0);
  assert.ok(Math.abs(bearing - 180) < 0.01);
});

test('geoBearingDeg: oeste puro es ~270deg', () => {
  const bearing = geoBearingDeg(1, 0, 0, 0);
  assert.ok(Math.abs(bearing - 270) < 0.5);
});

// Proyeccion de juguete: la grilla del juego girada `rotDeg` respecto del
// norte verdadero, cerca del ecuador (1 grado ~ 111 km, igual en los dos
// ejes para que sea conforme como la esfera de geoBearingDeg).
const rotatedGrid = (rotDeg) => (x, z) => {
  const r = rotDeg * Math.PI / 180;
  const e = x * Math.cos(r) - z * Math.sin(r); // este, en metros
  const n = -x * Math.sin(r) - z * Math.cos(r); // norte, en metros
  return [e / 111195, n / 111195];
};

test('gridHeadingToGeo: sin convergencia es la identidad', () => {
  for (const h of [0, 45, 90, 180, 270, 359]) {
    const g = gridHeadingToGeo(h, 1000, -2000, rotatedGrid(0));
    assert.ok(Math.abs(((g - h + 540) % 360) - 180) < 0.1, `${h} -> ${g}`);
  }
});

test('gridHeadingToGeo: suma la rotacion de la grilla respecto del norte', () => {
  // Grilla girada 15 grados antihorario: el "norte" del juego apunta a 345.
  const g = gridHeadingToGeo(0, 0, 0, rotatedGrid(-15));
  assert.ok(Math.abs(g - 345) < 0.1, String(g));
  const e = gridHeadingToGeo(90, 0, 0, rotatedGrid(-15));
  assert.ok(Math.abs(e - 75) < 0.1, String(e));
});

test('gridHeadingToGeo: ATS en la costa oeste, el norte del juego no es el norte', () => {
  // Misma proyeccion que usa app.js para ATS. Sobre el meridiano central
  // (-96) coinciden; en Los Angeles la grilla esta girada ~14 grados.
  const proj4 = require('./vendor/proj4-2.15.0.js');
  const R = 6370997, LOD = R * Math.PI / 180, f = [-0.00017706234, 0.000176689948];
  const p = proj4(`+proj=lcc +R=${R} +lat_1=33 +lat_2=45 +lat_0=39 +lon_0=-96`);
  const toLngLat = (x, z) => p.inverse([x * f[1] * LOD, z * f[0] * LOD]);
  const at = (lng, lat) => { const [a, b] = p.forward([lng, lat]); return [a / (f[1] * LOD), b / (f[0] * LOD)]; };
  const [lax, laz] = at(-118.2, 34);
  const la = gridHeadingToGeo(0, lax, laz, toLngLat);
  assert.ok(la > 344 && la < 348, String(la));
  const [dx, dz] = at(-96, 33);
  const dallas = gridHeadingToGeo(0, dx, dz, toLngLat);
  assert.ok(Math.abs(((dallas + 180) % 360) - 180) < 0.5, String(dallas));
});

test('gridHeadingToGeo: si el punto de adelante cruza un corte, mide hacia atras', () => {
  const base = rotatedGrid(0);
  // Todo lo que tiene z < -5 salta 50 km (como el borde del hack de UK).
  const cut = (x, z) => { const ll = base(x, z); return z < -5 ? [ll[0] + 0.5, ll[1]] : ll; };
  const g = gridHeadingToGeo(0, 0, 0, cut);
  assert.ok(Math.abs(((g + 180) % 360) - 180) < 0.1, String(g));
});

test('gridHeadingToGeo: sin rumbo o sin proyeccion lo devuelve tal cual', () => {
  assert.equal(gridHeadingToGeo(undefined, 0, 0, rotatedGrid(10)), undefined);
  assert.equal(gridHeadingToGeo(30, 0, 0, null), 30);
});

test('smoothLineCoords: devuelve el input sin cambios con menos de 3 puntos', () => {
  const points = [[0, 0], [1, 1]];
  assert.deepEqual(smoothLineCoords(points), points);
});

test('smoothLineCoords: empieza en el primer punto y termina en el ultimo', () => {
  const points = [[0, 0], [1, 1], [2, 0], [3, 1]];
  const result = smoothLineCoords(points, 4);
  assert.deepEqual(result[0], points[0]);
  const last = result[result.length - 1];
  assert.ok(Math.abs(last[0] - points[points.length - 1][0]) < 1e-9);
  assert.ok(Math.abs(last[1] - points[points.length - 1][1]) < 1e-9);
});

test('smoothLineCoords: con tramos desparejos no hace rizos (salida de un puente)', () => {
  // Tablero de 59 m, empalme de 11 m que se corre 3 m, autopista de 60 m: la
  // uniforme volvia para atras y se pasaba de los 3 m, y se veia una muesca
  const points = [[0, 0], [59, 0], [69.8, 3], [129.5, 3]];
  const result = smoothLineCoords(points, 8);
  for (let i = 1; i < result.length; i++) {
    assert.ok(result[i][0] >= result[i - 1][0] - 1e-9, `vuelve para atras en ${i}`);
  }
  // y no se pasa: la uniforme se iba 0,22 m afuera, la centripeta 0,7 m
  for (const [, y] of result) assert.ok(y >= -1e-9 && y <= 3 + 1e-9, `se pasa: ${y}`);
  // los tramos rectos quedan rectos (el tablero, en y = 0, hasta la esquina)
  assert.ok(result.filter(([x]) => x <= 50).every(([, y]) => Math.abs(y) < 1e-9));
});

test('smoothLineCoords: genera mas puntos que el original (interpolacion)', () => {
  const points = [[0, 0], [1, 1], [2, 0]];
  const result = smoothLineCoords(points, 6);
  assert.ok(result.length > points.length);
});

test('roundTurnDistanceMeters: escalones segun rango (ejemplo del usuario)', () => {
  assert.equal(roundTurnDistanceMeters(11000), 11000);
  assert.equal(roundTurnDistanceMeters(9500), 9500);
  assert.equal(roundTurnDistanceMeters(800), 800);
  assert.equal(roundTurnDistanceMeters(80), 80);
});

test('roundTurnDistanceMeters: redondea a la resolucion correcta por rango', () => {
  assert.equal(roundTurnDistanceMeters(15400), 15000); // >10km -> step 1000
  assert.equal(roundTurnDistanceMeters(4750), 5000);   // 1-10km -> step 500
  assert.equal(roundTurnDistanceMeters(340), 300);     // 100m-1km -> step 100
  assert.equal(roundTurnDistanceMeters(47), 50);       // <100m -> step 10
});

test('formatTurnDistance: usa km con un decimal cuando no es entero', () => {
  assert.equal(formatTurnDistance(9500), '9.5 km');
});

test('formatTurnDistance: usa km sin decimales cuando es entero', () => {
  assert.equal(formatTurnDistance(11000), '11 km');
});

test('formatTurnDistance: usa metros por debajo de 1km', () => {
  assert.equal(formatTurnDistance(800), '800 m');
  assert.equal(formatTurnDistance(80), '80 m');
});

// ---------------------------------------------------------------------------
// connectionViewFor: el diagnostico que ve el usuario segun el estado
// ---------------------------------------------------------------------------
const base = { socket: 'open', demo: false, invalidCode: false, clientConnected: null, clientStatus: null, hasTelemetry: false, paused: false };
const view = (over) => connectionViewFor({ ...base, ...over });

test('conn: sin sesion no hay nada que mostrar', () => {
  assert.equal(view({ socket: 'idle' }), null);
});

test('conn: conectando muestra el chip neutro sin tarjeta', () => {
  const v = view({ socket: 'connecting' });
  assert.equal(v.chip, 'chipConnecting');
  assert.equal(v.empty, null);
});

test('conn: socket caido -> reconectando con tarjeta, aunque antes estuviera live', () => {
  const v = view({ socket: 'closed', hasTelemetry: true, clientStatus: { status: 'live' } });
  assert.equal(v.chip, 'chipReconnecting');
  assert.equal(v.empty[0], 'emptyReconnectTitle');
});

test('conn: codigo invalido gana sobre todo lo demas (menos demo)', () => {
  const v = view({ invalidCode: true, clientConnected: true, hasTelemetry: true });
  assert.equal(v.chip, 'chipInvalidCode');
  assert.equal(view({ invalidCode: true, demo: true }).chip, 'chipDemo');
});

test('conn: backend dice que no hay cliente -> "cliente no corriendo" con link de descarga', () => {
  const v = view({ clientConnected: false });
  assert.equal(v.chip, 'chipNoClient');
  assert.equal(v.empty[3], true); // showDownload
});

test('conn: cliente conectado sin diagnostico ni telemetria -> esperando el juego', () => {
  const v = view({ clientConnected: true });
  assert.equal(v.chip, 'chipWaitingGame');
});

test('conn: plugin no instalado / faltante -> tarjeta del plugin', () => {
  for (const status of ['plugin_missing', 'plugin_not_installed']) {
    const v = view({ clientConnected: true, clientStatus: { status } });
    assert.equal(v.chip, 'chipPluginMissing');
    assert.equal(v.empty[0], 'emptyPluginTitle');
  }
});

test('conn: en el menu (waiting_truck) -> "ya casi", sin telemetria todavia', () => {
  const v = view({ clientConnected: true, clientStatus: { status: 'waiting_truck' } });
  assert.equal(v.chip, 'chipWaitingTruck');
  assert.equal(v.cls, 'info');
});

test('conn: live con telemetria -> chip verde sin tarjeta; pausado cambia el chip', () => {
  const live = view({ clientConnected: true, clientStatus: { status: 'live' }, hasTelemetry: true });
  assert.equal(live.chip, 'chipLive');
  assert.equal(live.live, true);
  assert.equal(live.empty, null);
  const paused = view({ clientConnected: true, clientStatus: { status: 'live' }, hasTelemetry: true, paused: true });
  assert.equal(paused.chip, 'chipPaused');
});

test('conn: el cliente dijo live pero todavia no llego un frame -> esperando camion, no live', () => {
  const v = view({ clientConnected: true, clientStatus: { status: 'live' }, hasTelemetry: false });
  assert.equal(v.chip, 'chipWaitingTruck');
});

test('conn: demo siempre es live, sin importar lo demas', () => {
  const v = view({ demo: true, clientConnected: false });
  assert.equal(v.chip, 'chipDemo');
  assert.equal(v.live, true);
});


// ---- detectManeuver: geometria plana (x = este, y = norte; rumbo horario, derecha = +)
const planarBearing = (p, q) => (Math.atan2(q[0] - p[0], q[1] - p[1]) * 180 / Math.PI + 360) % 360;
// Arma pts con indice de nodo (5to elemento) y un grafo dirigido: nodes[] +
// adjacency Map idx -> [[to]]. La ruta entra por el sur (0,-300) al nodo 1.
function scenario({ route, extraNodes, edges }) {
  const nodes = [[0, -300], [0, 0], ...route.slice(2).map(p => [p[0], p[1]]), ...(extraNodes || [])];
  // route: [[0,-300],[0,0], ...] -> indices 0,1,2..; extraNodes siguen despues
  const pts = route.map((p, k) => [p[0], p[1], 0, k === 1 ? 1 : 0, k]);
  const adjacency = new Map();
  const add = (a, b) => { if (!adjacency.has(a)) adjacency.set(a, []); adjacency.get(a).push([b]); };
  for (let k = 0; k < route.length - 1; k++) add(k, k + 1);
  for (const [a, b] of (edges || [])) add(a, b);
  const { cum, pointAt } = routeMetrics(pts);
  return { pts, i: 1, cum, pointAt, bearingBetween: planarBearing, nodes, adjacency };
}

test('maneuver: salida de autopista a la derecha (rampa a 10 grados) -> keep right', () => {
  // ruta: nodo 1 -> rampa (40,250) -> (120,500); alternativa recta: nodo 4 (0,100) -> nodo 5 (0,700)
  const ctx = scenario({ route: [[0, -300], [0, 0], [40, 250], [120, 500]], extraNodes: [[0, 100], [0, 700]], edges: [[1, 4], [4, 5]] });
  const m = detectManeuver(ctx);
  assert.deepEqual([m.kind, m.direction], ['fork', 'right']);
});

test('maneuver: pasar de largo una salida (nosotros seguimos derecho) -> nada', () => {
  const ctx = scenario({ route: [[0, -300], [0, 0], [0, 100], [0, 700]], extraNodes: [[40, 250], [120, 500]], edges: [[1, 4], [4, 5]] });
  assert.equal(detectManeuver(ctx), null);
});

test('maneuver: bifurcacion en Y simetrica -> keep left', () => {
  const ctx = scenario({ route: [[0, -300], [0, 0], [-60, 250], [-150, 500]], extraNodes: [[60, 250], [150, 500]], edges: [[1, 4], [4, 5]] });
  const m = detectManeuver(ctx);
  assert.deepEqual([m.kind, m.direction], ['fork', 'left']);
});

test('maneuver: giro de 90 grados sigue siendo turn', () => {
  const ctx = scenario({ route: [[0, -300], [0, 0], [300, 0], [600, 0]] });
  const m = detectManeuver(ctx);
  assert.deepEqual([m.kind, m.direction], ['turn', 'right']);
});

test('maneuver: calle lateral mientras la ruta curva un poco -> nada (la lateral dobla mas que nosotros)', () => {
  const ctx = scenario({ route: [[0, -300], [0, 0], [-40, 250], [-100, 500]], extraNodes: [[200, 100]], edges: [[1, 4]] });
  assert.equal(detectManeuver(ctx), null);
});

test('maneuver: nodo de la otra calzada (prefab) no cuenta: su continuacion va para atras', () => {
  // ruta curva 9 grados; el "vecino" interno del prefab esta 15 m al costado y
  // su unica salida (grafo dirigido) es la calzada opuesta, que vuelve al sur
  const ctx = scenario({ route: [[0, -300], [0, 0], [-40, 250], [-100, 500]], extraNodes: [[15, 100], [15, -500]], edges: [[1, 4], [4, 5]] });
  assert.equal(detectManeuver(ctx), null);
});

test('maneuver: rampa de ingreso que se une por atras no es alternativa (grafo dirigido: no es salida del nodo)', () => {
  const ctx = scenario({ route: [[0, -300], [0, 0], [-30, 250], [-60, 500]], extraNodes: [[60, -200]], edges: [[4, 1]] });
  assert.equal(detectManeuver(ctx), null);
});

test('maneuver: sin grafo solo detecta giros', () => {
  const ctx = scenario({ route: [[0, -300], [0, 0], [40, 250], [120, 500]] });
  ctx.adjacency = null;
  assert.equal(detectManeuver(ctx), null);
});

test('stabilizeManeuver: una indicacion nueva necesita 2 ticks; un parpadeo de 1 tick se ignora', () => {
  const st = {};
  const turn = { kind: 'turn', direction: 'right', distanceMeters: 400, node: [10, 20] };
  assert.equal(stabilizeManeuver(st, turn, 2), null);        // 1er tick: todavia no
  assert.equal(stabilizeManeuver(st, { ...turn, distanceMeters: 390 }, 2).distanceMeters, 390); // 2do: se muestra, fresca
  assert.equal(stabilizeManeuver(st, { ...turn, distanceMeters: 380 }, 2).distanceMeters, 380); // misma: distancia al dia
  assert.equal(stabilizeManeuver(st, null, 2).distanceMeters, 380); // parpadeo: 1 tick sin giro, se mantiene
  assert.equal(stabilizeManeuver(st, { ...turn, distanceMeters: 370 }, 2).distanceMeters, 370);
  assert.equal(stabilizeManeuver(st, null, 2).distanceMeters, 370);
  assert.equal(stabilizeManeuver(st, null, 2), null);        // 2 ticks sin giro: se borra
});


test('maneuver: zigzag de 70 grados dentro de un prefab (cuerdas de 45 m) no es giro si la calzada sigue derecha', () => {
  // nodos 1,2,3 son de cruce y estan a 12 m: el grupo entra a 0 grados y sale a 0 grados
  const route = [[0, -300], [0, 0], [42.3, 15.4], [0, 30.8], [0, 400]]; // cuerdas de 45 m a +70 / -70 grados
  const pts = route.map((p, k) => [p[0], p[1], 0, (k >= 1 && k <= 3) ? 1 : 0, k]);
  const { cum, pointAt } = routeMetrics(pts);
  const iEnd = junctionClusterEnd(pts, cum, 1, 50);
  assert.equal(iEnd, 3);
  const m = detectManeuver({ pts, i: 1, iEnd, cum, pointAt, bearingBetween: planarBearing, nodes: null, adjacency: null });
  assert.equal(m, null);
  // sin agrupar, el mismo nodo daba un giro falso
  const bad = detectManeuver({ pts, i: 1, cum, pointAt, bearingBetween: planarBearing, nodes: null, adjacency: null });
  assert.equal(bad && bad.kind, 'turn');
});

test('junctionClusterEnd: nodos de cruce separados por tramos largos no se agrupan', () => {
  const route = [[0, -300], [0, 0], [0, 200], [0, 400]];
  const pts = route.map((p, k) => [p[0], p[1], 0, 1, k]);
  const { cum } = routeMetrics(pts);
  assert.equal(junctionClusterEnd(pts, cum, 1, 50), 1);
});

test('stabilizeManeuver: el mismo cruce conserva tipo y sentido aunque la deteccion cambie a giro', () => {
  const st = {};
  const fork = { kind: 'fork', direction: 'left', distanceMeters: 500, node: [100, 100], nearSign: { label: 'I-70' } };
  stabilizeManeuver(st, fork, 2); const shown = stabilizeManeuver(st, fork, 2);
  assert.equal(shown.kind, 'fork');
  const asTurn = { kind: 'turn', direction: 'left', distanceMeters: 80, node: [110, 95], nearSign: null };
  const kept = stabilizeManeuver(st, asTurn, 2);
  assert.deepEqual([kept.kind, kept.direction, kept.distanceMeters, kept.nearSign.label], ['fork', 'left', 80, 'I-70']);
});

test('junctionClusterEnd: una cadena larga de nodos de cruce se corta a maxSpanM', () => {
  const route = []; for (let k = 0; k < 12; k++) route.push([0, k * 30]);
  const pts = route.map((p, k) => [p[0], p[1], 0, 1, k]);
  const { cum } = routeMetrics(pts);
  assert.equal(junctionClusterEnd(pts, cum, 1, 50, 100), 4); // 30+30+30 = 90 <= 100, el siguiente pasaria a 120
  assert.equal(junctionClusterEnd(pts, cum, 1, 50), 4);      // default 100
});

test('maneuver: en una cadena de nodos, el giro se atribuye al nodo de la esquina', () => {
  // nodos de cruce cada 25 m por x=0 hacia el norte; esquina de 90 grados en el nodo 4 (0,100) -> este
  const route = [[0, -300], [0, 0], [0, 25], [0, 50], [0, 75], [0, 100], [100, 100], [400, 100]];
  const pts = route.map((p, k) => [p[0], p[1], 0, (k >= 1 && k <= 6) ? 1 : 0, k]);
  const { cum, pointAt } = routeMetrics(pts);
  const iEnd = junctionClusterEnd(pts, cum, 1, 50, 100); // 1..5 (100 m)
  assert.equal(iEnd, 5);
  const m = detectManeuver({ pts, i: 1, iEnd, cum, pointAt, bearingBetween: planarBearing, nodes: null, adjacency: null });
  assert.deepEqual([m.kind, m.direction, m.at], ['turn', 'right', 5]);
});

test('formatTurnDistance imperial: millas y pies con escalones tipo GPS', () => {
  assert.equal(formatTurnDistance(16093, true), '10 mi');
  assert.equal(formatTurnDistance(4000, true), '2.5 mi');
  assert.equal(formatTurnDistance(1609, true), '1 mi');
  assert.equal(formatTurnDistance(650, true), '0.4 mi');
  assert.equal(formatTurnDistance(240, true), '800 ft');
  assert.equal(formatTurnDistance(30, true), '100 ft');
  assert.equal(formatTurnDistance(650, false), '700 m'); // metrico intacto
  assert.equal(formatTurnDistanceImperial(4000), '2.5 mi');
});

test('connectionView: link guardado esperando al cliente de la PC', () => {
  // El backend no conoce el codigo porque el cliente no arranco todavia: se
  // muestra "no hay cliente" (y se sigue reintentando), no "codigo invalido".
  const view = connectionViewFor({ socket: 'connecting', waitingClient: true });
  assert.equal(view.chip, 'chipNoClient');
  assert.equal(view.empty[0], 'emptyNoClientTitle');
  const typed = connectionViewFor({ socket: 'open', invalidCode: true });
  assert.equal(typed.chip, 'chipInvalidCode');
});

test('gameClockFromMinutes: time_abs del SDK a dia de la semana y hora', () => {
  assert.deepEqual(gameClockFromMinutes(0), { dayIndex: 0, hours: 0, minutes: 0 });        // lunes 00:00
  assert.deepEqual(gameClockFromMinutes(1440 + 917), { dayIndex: 1, hours: 15, minutes: 17 }); // martes 15:17
  assert.deepEqual(gameClockFromMinutes(1440 * 9 + 60), { dayIndex: 2, hours: 1, minutes: 0 }); // da la vuelta la semana
  assert.equal(gameClockFromMinutes(null), null);
  assert.equal(gameClockFromMinutes(-5), null);
});

test('timeScale: mediana de lo medido, y null hasta tener dos muestras', () => {
  const ts = createTimeScale({ minSampleSeconds: 30 });
  ts.push(1000, 0);
  assert.equal(ts.value(), null);
  // 19 minutos de juego por minuto real (la escala de ETS2 manejando).
  for (let i = 1; i <= 4; i++) ts.push(1000 + i * 19, i * 60);
  assert.ok(Math.abs(ts.value() - 19) < 1e-6, String(ts.value()));
  // Una pausa larga mete una muestra absurda: la mediana no se mueve.
  ts.push(1000 + 4 * 19, 60 * 60);
  assert.ok(Math.abs(ts.value() - 19) < 1e-6, String(ts.value()));
});

// Maneja a ritmo parejo: un dato por segundo, kmh de juego, desde t0.
function andar(pace, { destino = 'Albuquerque', t0 = 0, segundos, kmh, km0 }) {
  let km = km0;
  for (let i = 0; i <= segundos; i++) {
    pace.push(destino, t0 + i, km);
    km -= kmh / 3600;
  }
  return km;
}

test('paceEta: lo medido sale de la distancia que baja, en segundos reales', () => {
  const p = createPaceEta();
  assert.equal(p.measuredSeconds(), null);
  andar(p, { segundos: 60, kmh: 60, km0: 100 });
  // A 60 km/h quedan 99 km: 99 minutos.
  assert.ok(Math.abs(p.measuredSeconds() - 99 * 60) < 10, String(p.measuredSeconds()));
  assert.ok(Math.abs(p.avgSpeedKmh() - 60) < 0.5);
});

test('paceEta: el peso de lo medido llega a 0,7 a los 10 min aunque la ventana sea de 5', () => {
  // El bug: el peso se contaba desde la muestra mas vieja de la ventana y
  // nunca pasaba de 0,26.
  const p = createPaceEta();
  andar(p, { segundos: 15 * 60, kmh: 50, km0: 300 });
  assert.equal(p.weight(15 * 60), 0.7);
  assert.equal(p.weight(60), 0);
  assert.ok(Math.abs(p.weight(360) - 0.35) < 1e-9);
});

test('paceEta: mas lento que el juego, la llegada se corre (el reporte del 7:30)', () => {
  const p = createPaceEta();
  const km = andar(p, { segundos: 20 * 60, kmh: 45, km0: 200 });
  // El juego supone el limite (90 km/h): la mitad de lo que se tarda de verdad.
  const juego = km / 90 * 3600;
  const real = km / 45 * 3600;
  const est = p.estimate(juego, 20 * 60);
  assert.ok(est > juego * 1.6 && est < real, `${juego} ${est} ${real}`);
  // Sin medicion todavia, el del juego; sin el del juego, lo medido.
  assert.equal(createPaceEta().estimate(juego, 0), juego);
  assert.equal(p.estimate(null, 20 * 60), p.measuredSeconds());
});

test('paceEta: parado no inventa horas, y otro destino arranca de cero', () => {
  const p = createPaceEta();
  andar(p, { segundos: 120, kmh: 60, km0: 100 });
  const antes = p.measuredSeconds();
  // Diez minutos en un peaje: la distancia no baja.
  for (let i = 1; i <= 600; i++) p.push('Albuquerque', 120 + i, 98);
  assert.equal(p.measuredSeconds(), antes);
  p.push('Santa Fe', 800, 50);
  assert.equal(p.measuredSeconds(), null);
  assert.equal(p.weight(800), 0);
});

test('timeScale: no muestrea mas seguido que minSampleSeconds', () => {
  const ts = createTimeScale({ minSampleSeconds: 30 });
  for (let i = 0; i < 20; i++) ts.push(1000 + i, i);  // un tick por segundo
  assert.equal(ts.value(), null);
});

// Un viaje sintetico: 10 minutos reales a 80 km/h de velocidad de juego, con
// escala 19x. Sirve para las dos cuentas que se confunden facil.
function conducir(stats, { minutosReales = 10, kmh = 80, escala = 19, limite = 90, t0 = 1000, odo = 500000, fuel = 400 } = {}) {
  const pasos = minutosReales * 60;  // un tick por segundo
  let km = odo, litros = fuel;
  for (let i = 0; i <= pasos; i++) {
    km += kmh * (escala / 3600);   // el odometro corre en tiempo de juego
    litros -= 0.139;               // unos 33 L/100km
    stats.push({
      ts: t0 + i, game: 'ets2', speedKmh: kmh, speedLimitKmh: limite,
      odometerKm: km, fuel: litros, gameTimeMinutes: 600 + i * (escala / 60),
      truckBrand: 'Scania', truckName: 'S',
    });
  }
}

test('sessionStats: la velocidad promedio se mide en horas de juego, no reales', () => {
  const s = createSessionStats();
  conducir(s, { minutosReales: 10, kmh: 80, escala: 19 });
  const st = s.state();
  // 10 min reales x 19 = 190 min de juego = 3.17 h de juego a 80 km/h.
  assert.ok(Math.abs(st.kmDriven - 253.3) < 1, String(st.kmDriven));
  assert.ok(Math.abs(st.avgSpeedKmh - 80) < 1, String(st.avgSpeedKmh));
  // El tiempo al volante si es real: 10 minutos.
  assert.ok(Math.abs(st.wheelSeconds - 600) < 2, String(st.wheelSeconds));
});

test('sessionStats: cambiar de camion no resta kilometros ni inventa consumo', () => {
  const s = createSessionStats();
  conducir(s, { minutosReales: 2, odo: 500000, fuel: 400 });
  const antes = s.state().kmDriven;
  const litrosAntes = s.state().fuelUsedL;
  // Otro camion, odometro en 12 y el tanque lleno: ni km negativos ni
  // litros de golpe.
  s.push({ ts: 5000, game: 'ets2', truckBrand: 'Volvo', truckName: 'FH',
           odometerKm: 12, fuel: 900, speedKmh: 0 });
  s.push({ ts: 5001, game: 'ets2', truckBrand: 'Volvo', truckName: 'FH',
           odometerKm: 12.01, fuel: 899.99, speedKmh: 50, speedLimitKmh: 90,
           gameTimeMinutes: 700 });
  const st = s.state();
  assert.ok(st.kmDriven >= antes, String(st.kmDriven) + ' < ' + String(antes));
  assert.ok(st.kmDriven < antes + 1, String(st.kmDriven));
  assert.ok(st.fuelUsedL - litrosAntes < 0.1, String(st.fuelUsedL - litrosAntes));
});

test('sessionStats: cargar combustible no cuenta como consumo negativo', () => {
  const s = createSessionStats();
  s.push({ ts: 1, game: 'ets2', fuel: 100, odometerKm: 10, speedKmh: 0 });
  s.push({ ts: 2, game: 'ets2', fuel: 95, odometerKm: 10, speedKmh: 0 });
  s.push({ ts: 3, game: 'ets2', fuel: 600, odometerKm: 10, speedKmh: 0 });  // cargo
  s.push({ ts: 4, game: 'ets2', fuel: 597, odometerKm: 10, speedKmh: 0 });
  assert.ok(Math.abs(s.state().fuelUsedL - 8) < 1e-6, String(s.state().fuelUsedL));
  // Y una carga CHICA tambien es carga. Sin este caso, un tope por valor
  // absoluto ("cualquier cambio menor a 20 l es consumo") pasaba los tests
  // contando diez litros cargados como diez gastados. Lo encontro la
  // version de Python del mismo acumulador (client/test_accumulator.py).
  const otro = createSessionStats();
  [100, 95, 105, 103].forEach((litros, i) => {
    otro.push({ ts: i + 1, game: 'ets2', fuel: litros, odometerKm: 10, speedKmh: 0 });
  });
  assert.ok(Math.abs(otro.state().fuelUsedL - 7) < 1e-6, String(otro.state().fuelUsedL));
});

test('sessionStats: un ferry no suma kilometros manejados', () => {
  const s = createSessionStats();
  s.push({ ts: 1, game: 'ets2', odometerKm: 1000, speedKmh: 0 });
  s.push({ ts: 2, game: 'ets2', odometerKm: 1000.02, speedKmh: 60, speedLimitKmh: 90, gameTimeMinutes: 100 });
  // El ferry deja el camion 140 km mas alla sin que nadie haya manejado.
  s.push({ ts: 3, game: 'ets2', odometerKm: 1140, speedKmh: 0 });
  assert.ok(s.state().kmDriven < 1, String(s.state().kmDriven));
});

test('sessionStats: tiempo por encima del limite, con tolerancia', () => {
  const s = createSessionStats({ overLimitToleranceKmh: 2 });
  for (let i = 0; i < 10; i++) s.push({ ts: 100 + i, game: 'ets2', speedKmh: 91, speedLimitKmh: 90, odometerKm: 1 });
  assert.equal(s.state().overLimitSeconds, 0);  // 1 km/h de mas no es exceso
  for (let i = 10; i < 20; i++) s.push({ ts: 100 + i, game: 'ets2', speedKmh: 110, speedLimitKmh: 90, odometerKm: 1 });
  assert.ok(Math.abs(s.state().overLimitSeconds - 10) < 1.5, String(s.state().overLimitSeconds));
  assert.ok(s.state().topSpeedKmh === 110);
});

test('sessionStats: peajes, multas y entregas se cuentan una vez por evento', () => {
  const s = createSessionStats();
  const base = { ts: 0, game: 'ets2', speedKmh: 0, odometerKm: 1 };
  // El flag del SDK queda en true varios ticks: no son tres peajes.
  for (let i = 1; i <= 3; i++) s.push({ ...base, ts: i, event: { tollgate: true, tollgatePayAmount: 12 } });
  s.push({ ...base, ts: 4, event: {} });
  s.push({ ...base, ts: 5, event: { tollgate: true, tollgatePayAmount: 12 } });
  s.push({ ...base, ts: 6, event: { fined: true, fineAmount: 300 } });
  s.push({ ...base, ts: 7, event: { jobDelivered: true, jobDeliveredRevenue: 5000, jobSrc: 'Berlin', jobDst: 'Praga' } });
  const st = s.state();
  assert.equal(st.tolls.count, 2);
  assert.equal(st.tolls.amount, 24);
  assert.equal(st.fines.count, 1);
  assert.equal(st.jobs.amount, 5000);
  assert.equal(st.netProfit, 5000 - 300 - 24);
});

test('sessionStats: cambiar de juego empieza una sesion nueva', () => {
  const s = createSessionStats();
  s.push({ ts: 1, game: 'ets2', speedKmh: 0, odometerKm: 1, event: { fined: true, fineAmount: 500 } });
  assert.equal(s.state().fines.amount, 500);
  s.push({ ts: 2, game: 'ats', speedKmh: 0, odometerKm: 1 });
  assert.equal(s.state().fines.amount, 0);
  assert.equal(s.state().game, 'ats');
});

test('sessionStats: una reconexion larga no regala kilometros', () => {
  const s = createSessionStats({ maxGapSeconds: 10 });
  s.push({ ts: 1, game: 'ets2', odometerKm: 1000, speedKmh: 80, speedLimitKmh: 90 });
  // Media hora sin datos y 40 km mas en el odometro: no se vieron manejar.
  s.push({ ts: 1800, game: 'ets2', odometerKm: 1040, speedKmh: 80, speedLimitKmh: 90 });
  assert.ok(s.state().kmDriven < 1, String(s.state().kmDriven));
  // Y el tiempo al volante suma como mucho el hueco maximo, no media hora.
  assert.ok(s.state().wheelSeconds <= 10, String(s.state().wheelSeconds));
});

test('demo: los kilometros, el reloj del juego y el consumo cierran entre si', () => {
  // El bug que encontro el panel: el odometro avanzaba a un ritmo, el
  // reloj del juego a otro y el combustible a un tercero. Nada los cruzaba,
  // asi que la demo mostraba 166 l/100km y 29 km/h de promedio.
  const demo = createDemoTelemetry({ totalKm: 5000 });
  const stats = createSessionStats();
  let t = 1000;
  for (let i = 0; i < 2000; i++) {
    const data = demo.next();
    data.ts = t; t += 0.25;
    stats.push(data);
  }
  const st = stats.state();
  // La velocidad promedio tiene que dar la del velocimetro (~94 km/h)...
  assert.ok(Math.abs(st.avgSpeedKmh - 94) < 3, 'promedio: ' + st.avgSpeedKmh);
  // ...y el consumo, el configurado.
  assert.ok(Math.abs(st.fuelPer100Km - 32) < 1, 'consumo: ' + st.fuelPer100Km);
});

// Tamano de los elementos acomodados a mano (pedido de usuarios: poder
// agrandar la velocidad y las indicaciones, no solo moverlas).
test('tamano acomodado: sigue a la manija, con topes y sin salirse del mapa', () => {
  const base = { startScale: 1, startWidth: 100, startHeight: 50, maxWidth: 1000, maxHeight: 1000, snap: false };
  // arrastrar 50 px a la derecha en un panel de 100 px lo agranda a 1,5
  assert.equal(layoutScaleFor({ ...base, dx: 50, dy: 0 }), 1.5);
  // para abajo tambien agranda: 25 px en un alto de 50 es la misma proporcion
  assert.equal(layoutScaleFor({ ...base, dx: 0, dy: 25 }), 1.5);
  // parte de la escala que ya tenia: 2 x (80/100) = 1,6
  assert.equal(layoutScaleFor({ ...base, startScale: 2, startWidth: 100, dx: -20, dy: -10 }), 1.6);
  // topes
  assert.equal(layoutScaleFor({ ...base, dx: -95, dy: -45 }), LAYOUT_SCALE_MIN);
  assert.equal(layoutScaleFor({ ...base, dx: 900, dy: 0 }), LAYOUT_SCALE_MAX);
  // no mas grande de lo que entra hasta el borde: 130 px de lugar para 100
  assert.equal(layoutScaleFor({ ...base, dx: 500, dy: 0, maxWidth: 130 }), 1.3);
  assert.equal(layoutScaleFor({ ...base, dx: 500, dy: 0, maxHeight: 60 }), 1.2);
  // con grilla, de a 5 %
  assert.equal(layoutScaleFor({ ...base, dx: 33, dy: 0, snap: true }), 1.35);
  // medidas rotas no rompen nada: se queda como estaba
  assert.equal(layoutScaleFor({ ...base, startWidth: 0, dx: 50, dy: 0 }), 1);
  assert.equal(layoutScaleFor({ ...base, startScale: 1.4, startHeight: NaN, dx: 50, dy: 0 }), 1.4);
});

// Con ruta, las autopistas pierden el naranja (setRouteData en app.js).
test('routeHasLine: solo cuenta una linea que se puede dibujar', () => {
  const linea = (coords) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } });
  const multi = (parts) => ({ type: 'Feature', geometry: { type: 'MultiLineString', coordinates: parts } });
  assert.equal(routeHasLine(linea([])), false);            // emptyLineString()
  assert.equal(routeHasLine(linea([[1, 2]])), false);      // un punto no es una ruta
  assert.equal(routeHasLine(linea([[1, 2], [3, 4]])), true);
  assert.equal(routeHasLine(multi([])), false);
  assert.equal(routeHasLine(multi([[[1, 2]], []])), false);
  assert.equal(routeHasLine(multi([[[1, 2]], [[3, 4], [5, 6]]])), true); // tramo por tierra despues de un ferry
  assert.equal(routeHasLine(null), false);
  assert.equal(routeHasLine({ type: 'Feature', geometry: null }), false);
});

// Dibujo de la ruta: ganchos y escalones donde las dos manos de una
// autopista se separan (I-15, salida 257 a Spanish Fork, ATS, 29-09-2026).
// Puntos reales del grafo de ATS (metros del juego).
const I15_SPANISH_FORK = [[-67297.1, -11792.7], [-67338.2, -11750.3], [-67330.5, -11737.4], [-67357.8, -11705.5], [-67381.9, -11671.1], [-67403.9, -11635.0], [-67424.7, -11598.2], [-67445.6, -11561.5], [-67460.1, -11565.3], [-67486.0, -11512.1], [-67479.4, -11503.6], [-67509.6, -11452.1], [-67598.4, -11300.1], [-67610.9, -11275.3], [-67620.5, -11249.3], [-67627.7, -11222.3], [-67632.9, -11194.5]];

function giroMaximo(pts) {
  let peor = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]];
    const b = [pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]];
    const c = (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b));
    peor = Math.max(peor, Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI);
  }
  return peor;
}

test('ruta dibujada: el gancho del puente de la salida 257 se dibuja derecho', () => {
  const limpia = cleanRouteForDrawing(I15_SPANISH_FORK);
  // El tablero del puente (14 y 10 m al costado) no se dibuja; el nodo de
  // antes, sobre el eje, se queda
  for (const p of [[-67460.1, -11565.3], [-67486.0, -11512.1]]) {
    assert.ok(!limpia.some(q => q[0] === p[0] && q[1] === p[1]), `sigue ${p}`);
  }
  // Las puntas de la ruta no se tocan nunca
  assert.deepEqual(limpia[0], I15_SPANISH_FORK[0]);
  assert.deepEqual(limpia.at(-1), I15_SPANISH_FORK.at(-1));
  // Antes habia quiebres de casi 80 grados; limpia, ninguno pasa de 30
  assert.ok(giroMaximo(I15_SPANISH_FORK) > 75);
  assert.ok(giroMaximo(limpia) < 30, String(giroMaximo(limpia)));
});

test('ruta dibujada: un escalon se reparte en 60 m como maximo', () => {
  // Recta, escalon de 12 m al costado en 10 m, y otra recta paralela
  const pts = [[0, 0], [300, 0], [305, 12], [605, 12]];
  const limpia = taperShortSteps(pts);
  assert.equal(limpia.length, 4);
  assert.deepEqual(limpia[1], [240, 0]);          // 60 m antes, sobre su misma linea
  assert.deepEqual(limpia[2], [305, 12]);
  assert.ok(giroMaximo(limpia) < 15);
});

test('ruta dibujada: la limpieza no toca curvas, rotondas, giros ni rectas', () => {
  const arco = (cx, cy, r, a0, a1, pasos) => Array.from({ length: pasos + 1 }, (_, k) => {
    const a = a0 + (a1 - a0) * k / pasos;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
  const recta = [[0, 0], [50, 0], [100, 0], [150, 0], [200, 0]];
  // Curva en S cerrada, como las de las rutas de ETS2: muchos puntos juntos
  const s = [[-60, 0], [0, 0], ...arco(0, 40, 40, -Math.PI / 2, 0, 8), ...arco(80, 40, 40, Math.PI, Math.PI / 2, 8), [140, 80]];
  // Pasar derecho por una rotonda de 20 m de radio
  const rotonda = [[-80, 0], [-20, 0], ...arco(0, 0, 20, Math.PI, 0, 12).map(([x, y]) => [x, -y]), [20, 0], [80, 0]];
  // Giro de 90 grados en un cruce
  const giro = [[0, 0], [100, 0], [110, 5], [115, 15], [115, 100]];
  for (const [nombre, pts] of [['recta', recta], ['S', s], ['rotonda', rotonda], ['giro', giro]]) {
    assert.deepEqual(cleanRouteForDrawing(pts), pts, nombre);
  }
});

test('ruta dibujada: solo se saca un desvio abrupto, de pocos tramos y que sigue derecho', () => {
  // Abrupto (en 12 m), de pocos tramos y vuelve a la misma linea: se saca
  const brusco = [[0, 0], [100, 0], [104, 11], [164, 11], [168, 0], [268, 0]];
  assert.deepEqual(dropShortExcursions(brusco), [[0, 0], [100, 0], [168, 0], [268, 0]]);
  // El mismo corrimiento pero en 40 m de subida es una curva: se queda
  const suave = [[0, 0], [100, 0], [140, 8], [180, 8], [220, 0], [320, 0]];
  assert.deepEqual(dropShortExcursions(suave), suave);
  // Abrupto pero hecho de muchos puntos (una curva con geometria): se queda
  const denso = [[0, 0], [100, 0], [104, 11], ...Array.from({ length: 12 }, (_, k) => [109 + 5 * k, 11]), [168, 0], [268, 0]];
  assert.deepEqual(dropShortExcursions(denso), denso);
  // Vuelve a la linea pero dobla: es un giro, no un desvio
  const dobla = [[0, 0], [100, 0], [104, 11], [164, 11], [168, 0], [168, -100]];
  assert.deepEqual(dropShortExcursions(dobla), dobla);
});

test('ruta dibujada: un escalon solo se reparte entre dos lineas paralelas y si es cruzado', () => {
  // Esquina de 90 grados con un chanfle corto: no es un escalon
  const esquina = [[0, 0], [100, 0], [108, 8], [108, 100]];
  assert.deepEqual(taperShortSteps(esquina), esquina);
  // Cambio de linea que ya es suave (4 m en 20 m): no hay nada que repartir
  const suave = [[0, 0], [100, 0], [120, 4], [220, 4]];
  assert.deepEqual(taperShortSteps(suave), suave);
});

// Grafo v3: la ruta se dibuja sobre la calzada de la mano por la que se va.
test('corrida de la ruta: hacia la derecha del sentido de marcha', () => {
  // Coordenadas del juego: x al este, y al sur
  const este = routeDrawShift([[0, 0, 0, 0, null, 0, 5], [100, 0, 0, 0, null, 0, 5]]);
  assert.deepEqual(este.map(p => [p[0], p[1]]), [[0, 5], [100, 5]]);          // yendo al este, la derecha es el sur
  const norte = routeDrawShift([[0, 0, 0, 0, null, 0, 5], [0, -100, 0, 0, null, 0, 5]]);
  assert.deepEqual(norte.map(p => [p[0], p[1]]), [[5, 0], [5, -100]]);        // yendo al norte, la derecha es el este
  const izquierda = routeDrawShift([[0, 0, 0, 0, null, 0, -5], [100, 0, 0, 0, null, 0, -5]]);
  assert.deepEqual(izquierda.map(p => [p[0], p[1]]), [[0, -5], [100, -5]]);   // mano izquierda (Reino Unido)
  // Sin corrida (grafo v2) no se toca nada, y lo demas del punto viaja igual
  const v2 = [[0, 0, 1, 0, 7, 2], [100, 0, 0, 1, 8, 2]];
  assert.deepEqual(routeDrawShift(v2), v2);
  assert.equal(este[0][5], 0);
});

test('corrida de la ruta: un tramo cortito en diagonal no da vuelta el lado', () => {
  // Hacia el este con un quiebre de 2 m en diagonal (un empalme): todos los
  // puntos tienen que quedar corridos hacia el sur, ninguno para otro lado
  // (dos tramos de 1,4 m seguidos: con solo los vecinos pegados, el punto
  // del medio creeria que se va en diagonal)
  const pts = [[0, 0], [50, 0], [51, 1], [52, 2], [100, 2], [150, 2]].map(([x, y]) => [x, y, 0, 0, null, 0, 5]);
  const dibujo = routeDrawShift(pts);
  dibujo.forEach((q, i) => {
    assert.ok(q[1] - pts[i][1] > 4.9, `punto ${i} corrido ${q[1] - pts[i][1]}`);
    assert.ok(Math.abs(q[0] - pts[i][0]) < 0.5, `punto ${i} se fue de costado`);
  });
});

test('corrida de la ruta: se reparte a lo largo de la arista', () => {
  const pts = [[0, 0], [25, 0], [100, 0]];
  spreadEdgeShift(pts, 0, 9.5, 0);
  assert.deepEqual(pts.map(p => p[6]), [9.5, 9.5 * 0.75, 0]);
  // El nodo de salida ya traia la corrida de la arista anterior: se respeta
  const siguiente = [[0, 0, 0, 0, null, 0, 7], [50, 0]];
  spreadEdgeShift(siguiente, 0, 9.5, 9.5);
  assert.deepEqual(siguiente.map(p => p[6]), [7, 9.5]);
  // y se pasa de a poco a la propia, sin escalon en el nodo
  const tres = [[0, 0, 0, 0, null, 0, 7], [25, 0], [100, 0]];
  spreadEdgeShift(tres, 0, 9.5, 9.5);
  assert.deepEqual(tres.map(p => p[6]), [7, 7.625, 9.5]);
});

test('corrida de la ruta: el puente de la salida 257 queda sobre la calzada y sin gancho', () => {
  // Nodos reales del grafo de ATS y corridas del v3 (diag_corrida.py):
  // autopista de 6 carriles +9,5; us_20 del eje al tablero +9,5 -> 0;
  // tablero 0; us_18 del tablero al eje 0 -> +7; autopista de 4 carriles +7.
  const nodos = [[-67330.5, -11737.4], [-67445.6, -11561.5], [-67460.1, -11565.3], [-67486.0, -11512.1], [-67479.4, -11503.6], [-67509.6, -11452.1]];
  const corridas = [[9.5, 9.5], [9.5, 0], [0, 0], [0, 7], [7, 7]];
  const pts = [[...nodos[0], 0, 0, 0]];
  corridas.forEach(([a, b], k) => { pts.push([...nodos[k + 1], 0, 0, k + 1]); spreadEdgeShift(pts, pts.length - 2, a, b); });
  const dibujo = routeDrawShift(pts);
  const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  // La autopista va 9,5 m corrida, sobre su calzada, no por el eje
  assert.ok(Math.abs(d(dibujo[0], nodos[0]) - 9.5) < 0.5);
  // Llegando al puente, el punto corrido ya esta a pocos metros del tablero:
  // antes, del eje al tablero habia 14 m de golpe
  assert.ok(d(nodos[1], nodos[2]) > 14);
  assert.ok(d(dibujo[1], dibujo[2]) < 16 && d(dibujo[1], nodos[2]) < 10, String(d(dibujo[1], nodos[2])));
  // El tablero se dibuja donde esta
  assert.deepEqual([dibujo[2][0], dibujo[2][1]], nodos[2]);
  assert.deepEqual([dibujo[3][0], dibujo[3][1]], nodos[3]);
});

// Zoom del modo navegacion elegido en Ajustes (pedido de usuarios).
test('zoom de navegacion: valida lo guardado y respeta el rango', () => {
  assert.equal(navZoomSetting(undefined), NAV_ZOOM_DEFAULT); // nunca se toco
  assert.equal(NAV_ZOOM_DEFAULT, 10);                        // el que estaba fijo
  assert.equal(navZoomSetting(11.5), 11.5);
  assert.equal(navZoomSetting('12'), 12);                    // viene del <input type=range>
  assert.equal(navZoomSetting(11.3), 11.5);                  // de a 0,5
  assert.equal(navZoomSetting(3), NAV_ZOOM_MIN);
  assert.equal(navZoomSetting(40), NAV_ZOOM_MAX);
  assert.equal(navZoomSetting(NaN), NAV_ZOOM_DEFAULT);
  assert.equal(navZoomSetting('lejos'), NAV_ZOOM_DEFAULT);
  assert.equal(navZoomSetting(null), NAV_ZOOM_DEFAULT);
});

test('fatiga: lo manejado sobre el intervalo de 11 h, con tope que crece si un mod lo alarga', () => {
  const { createFatigue, REST_INTERVAL_MINUTES } = require('./pure.js');
  assert.equal(REST_INTERVAL_MINUTES, 660);
  const f = createFatigue();
  assert.equal(f.push(660), 0);          // recien dormido
  assert.equal(f.push(330), 50);
  assert.equal(f.push(6 * 60 + 40), 39); // el de la demo: 6 h 40 por delante
  assert.equal(f.push(1), 100);
  // Fatiga apagada o sin dato: no hay porcentaje.
  assert.equal(f.push(0), null);
  assert.equal(f.push(null), null);
  assert.equal(f.push(24 * 60), null);
  // Un mod con 14 h: el tope pasa a ser lo visto, nunca da negativo.
  const m = createFatigue();
  assert.equal(m.push(840), 0);
  assert.equal(m.push(420), 50);
});

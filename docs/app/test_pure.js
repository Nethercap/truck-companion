// Corre con: node --test docs/app/test_pure.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { geoBearingDeg, smoothLineCoords, roundTurnDistanceMeters, formatTurnDistance, formatTurnDistanceImperial, connectionViewFor, routeMetrics, junctionClusterEnd, detectManeuver, stabilizeManeuver } = require('./pure.js');

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

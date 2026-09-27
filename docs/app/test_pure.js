// Corre con: node --test docs/app/test_pure.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { geoBearingDeg, smoothLineCoords, roundTurnDistanceMeters, formatTurnDistance, formatTurnDistanceImperial, connectionViewFor, routeMetrics, junctionClusterEnd, detectManeuver, stabilizeManeuver, createFuelTracker , gameClockFromMinutes, createTimeScale,
  createSessionStats, createDemoTelemetry } = require('./pure.js');

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

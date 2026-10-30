// Corre con: node --test docs/app/test_pure.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { poiRelative, stopsAlongRoute, pickFuelStop, createRefuelWatch, settingsChangedKeys, spreadEdgeShift, routeDrawShift, dropShortExcursions, taperShortSteps, cleanRouteForDrawing, navZoomSetting, NAV_ZOOM_DEFAULT, NAV_ZOOM_MIN, NAV_ZOOM_MAX, routeHasLine,layoutScaleFor, LAYOUT_SCALE_MIN, LAYOUT_SCALE_MAX, geoBearingDeg, gridHeadingToGeo, smoothLineCoords, roundTurnDistanceMeters, formatTurnDistance, formatTurnDistanceImperial, connectionViewFor, routeMetrics, junctionClusterEnd, junctionManeuver, ringThrough, detectManeuver, continuesTurn, stabilizeManeuver, createFuelTracker , gameClockFromMinutes, createTimeScale,
  createPaceEta, createSessionStats, createDemoTelemetry, createVoiceGuide, voiceTimingSetting, VOICE_TIMING_DEFAULT, sideExitToward, pickVoice, mapBoundsFromCities, insideMapBounds } = require("./pure.js");

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

test('compartir posicion: en LAN se puede apagar si el cliente lo reenvia al relay (Discord, 20-10)', () => {
  const { liveShareControls } = require('./pure.js');
  // Con el codigo, como siempre: la ruta depende de compartir
  assert.deepEqual(liveShareControls({ lan: false, lanRelay: false, enabled: true }), { shareDisabled: false, routeDisabled: false, hint: null });
  assert.deepEqual(liveShareControls({ lan: false, lanRelay: false, enabled: false }), { shareDisabled: false, routeDisabled: true, hint: null });
  // LAN con un cliente viejo: gris, y se dice donde se cambia
  assert.deepEqual(liveShareControls({ lan: true, lanRelay: false, enabled: true }), { shareDisabled: true, routeDisabled: true, hint: 'liveShareLanHint' });
  // LAN con un cliente que lo reenvia: compartir se toca, la ruta no (la manda la pestana con el codigo)
  for (const enabled of [true, false]) {
    assert.deepEqual(liveShareControls({ lan: true, lanRelay: true, enabled }), { shareDisabled: false, routeDisabled: true, hint: 'liveShareLanRouteHint' });
  }
});

test('compartir posicion: viene apagado y sin tocarlo no se le dice nada al relay (20-10)', () => {
  const { liveShareChoice } = require('./pure.js');
  // Nunca lo cambio en este navegador (saveSettings guarda solo lo que cambia)
  assert.equal(liveShareChoice({}), null);
  assert.equal(liveShareChoice(null), null);
  assert.equal(liveShareChoice({ navEveryExit: true }), null);
  // De cuando venia prendido: liveShareV2 solo no lo prende
  assert.equal(liveShareChoice({ liveShareV2: true }), null);
  // Lo tildo o lo destildo (o se lo dijo el relay): eso manda
  assert.equal(liveShareChoice({ liveShareEnabled: true }), true);
  assert.equal(liveShareChoice({ liveShareEnabled: false, liveShareV2: true }), false);
  assert.equal(liveShareChoice({ liveShareEnabled: 'si' }), null);
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

test('conn: plugin no instalado (juego cerrado) -> tarjeta del plugin', () => {
  const v = view({ clientConnected: true, clientStatus: { status: 'plugin_not_installed' } });
  assert.equal(v.chip, 'chipPluginMissing');
  assert.equal(v.empty[0], 'emptyPluginTitle');
});

test('conn: juego abierto sin telemetria (plugin_missing) -> no dice "no instalado"', () => {
  // Con el plugin en su lugar y sin cargar, la tablet decia "Plugin not
  // installed" y Setup en la PC "instalado" (Discord 30-10).
  const v = view({ clientConnected: true, clientStatus: { status: 'plugin_missing', detail: 'The plugin file is in place but the game hasn\'t loaded it' } });
  assert.equal(v.chip, 'chipNoTelemetry');
  assert.equal(v.cls, 'warn');
  assert.equal(v.detail, 'detailNoTelemetry');
  assert.equal(v.empty[0], 'emptyNoTelemetryTitle');
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

test('maneuver: carril de giro con isleta que termina doblando 90 grados -> turn, no keep (resena de Roane Gaming)', () => {
  // la ruta se separa 24 grados en los primeros 60 m y a 250 m ya va casi al este;
  // la otra salida sigue derecho al norte
  const ctx = scenario({ route: [[0, -300], [0, 0], [25, 55], [60, 80], [400, 80]], extraNodes: [[0, 100], [0, 400]], edges: [[1, 5], [5, 6]] });
  const m = detectManeuver(ctx);
  assert.deepEqual([m.kind, m.direction, m.quiet, m.at], ['turn', 'right', false, 1]);
  assert.ok(m.outBearing > 55 && m.outBearing < 90);
  // espejado a la izquierda
  const izq = scenario({ route: [[0, -300], [0, 0], [-25, 55], [-60, 80], [-400, 80]], extraNodes: [[0, 100], [0, 400]], edges: [[1, 5], [5, 6]] });
  assert.deepEqual([detectManeuver(izq).kind, detectManeuver(izq).direction], ['turn', 'left']);
});

test('maneuver: una salida de autopista que despues dobla mucho sigue siendo keep (se separa de a poco)', () => {
  // rampa a 5 grados los primeros 60 m, despues se abre hacia el este: a 250 m va 60 grados
  const ctx = scenario({ route: [[0, -300], [0, 0], [5, 60], [30, 100], [300, 100]], extraNodes: [[0, 150], [0, 700]], edges: [[1, 5], [5, 6]] });
  const m = detectManeuver(ctx);
  assert.deepEqual([m.kind, m.direction], ['fork', 'right']);
});

test('maneuver: salida corta a la derecha que enseguida dobla a la izquierda -> keep right, no turn left (Gargamosch, 10-10)', () => {
  // rampa a 17 grados hasta (25,80) y ahi dobla al oeste, cruzando la
  // autopista hacia el area de descanso: a 250 m el punto de la ruta queda
  // a la izquierda, pero en el cruce la salida es a la derecha
  const ctx = scenario({ route: [[0, -300], [0, 0], [25, 80], [-400, 85]], extraNodes: [[0, 150], [0, 700]], edges: [[1, 4], [4, 5]] });
  const m = detectManeuver(ctx);
  assert.deepEqual([m.kind, m.direction], ['fork', 'right']);
  // espejado (se maneja por la izquierda)
  const izq = scenario({ route: [[0, -300], [0, 0], [-25, 80], [400, 85]], extraNodes: [[0, 150], [0, 700]], edges: [[1, 4], [4, 5]] });
  assert.deepEqual([detectManeuver(izq).kind, detectManeuver(izq).direction], ['fork', 'left']);
});

test('maneuver: giro de 90 grados sigue siendo turn', () => {
  // con la calle que sigue derecho como otra opcion
  const ctx = scenario({ route: [[0, -300], [0, 0], [300, 0], [600, 0]], extraNodes: [[0, 300]], edges: [[1, 4]] });
  const m = detectManeuver(ctx);
  assert.deepEqual([m.kind, m.direction, m.quiet], ['turn', 'right', false]);
});

test('maneuver: la calle dobla y no hay otro camino -> giro callado (reporte de Discord)', () => {
  // sin ninguna otra salida
  let m = detectManeuver(scenario({ route: [[0, -300], [0, 0], [300, 0], [600, 0]] }));
  assert.deepEqual([m.kind, m.direction, m.quiet], ['turn', 'right', true]);
  // la calle dobla 40 grados a la izquierda y sale un camino a la derecha: seguimos la calle
  m = detectManeuver(scenario({ route: [[0, -300], [0, 0], [-257, 306], [-514, 612]], extraNodes: [[300, 0]], edges: [[1, 4]] }));
  assert.deepEqual([m.kind, m.direction, m.quiet], ['turn', 'left', true]);
  // misma curva, pero la otra salida sigue derecho: ahi si hay que avisar
  m = detectManeuver(scenario({ route: [[0, -300], [0, 0], [-257, 306], [-514, 612]], extraNodes: [[0, 300]], edges: [[1, 4]] }));
  assert.equal(m.quiet, false);
});

test('maneuver: una salida que vuelve enseguida a la ruta o que no lleva a ningun lado no es otro camino', () => {
  // rombo de la calzada: la ruta sigue por el medio y dobla 40 grados a la derecha 60 m
  // despues; los dos lados del rombo (nodos 5 y 6) vuelven a la ruta en el nodo 2. Sin
  // ellos tampoco hay otra salida: nada que anunciar.
  const route = [[0, -300], [0, 0], [0, 60], [190, 220], [380, 380]];
  const ctx = scenario({ route, extraNodes: [[-15, 30], [15, 30]], edges: [[1, 5], [5, 2], [1, 6], [6, 2]] });
  assert.equal(detectManeuver(ctx), null);
  // brazo muerto de un prefab (nodo 4, sin calle) que sigue derecho en una curva de 40 grados
  const curva = scenario({ route: [[0, -300], [0, 0], [-257, 306], [-514, 612]], extraNodes: [[0, 25]], edges: [[1, 4], [4, 1]] });
  assert.equal(detectManeuver(curva).quiet, true);
  // el mismo brazo con una calle de verdad detras si cuenta
  const calle = scenario({ route: [[0, -300], [0, 0], [-257, 306], [-514, 612]], extraNodes: [[0, 25], [0, 400]], edges: [[1, 4], [4, 5]] });
  assert.equal(detectManeuver(calle).quiet, false);
});

test('maneuver: una calzada que se abre en dos y se junta entre los 100 y los 120 m no es otro camino (Tonopah, 25-10)', () => {
  // La US-6 al oeste de Tonopah (ATS, -98772,-5680): la calzada se abre en dos
  // en el nodo 1, la ruta sigue por la izquierda (2, 3) y la rama de la
  // derecha (6, 7, de un solo sentido) vuelve a la ruta en el 3, a 112 m.
  // Pasados los 100 m de rejoinM y antes de los 120 de escapeM, salia del
  // cruce por la ruta misma y se decia "keep left".
  const { otherBranchesAt } = require('./pure.js');
  const route = [[0, -300], [0, 0], [-10, 60], [-20, 110], [-60, 400], [-100, 700]];
  const ctx = scenario({ route, extraNodes: [[20, 40], [15, 90]], edges: [[1, 6], [6, 7], [7, 3]] });
  assert.equal(detectManeuver(ctx), null);
  assert.equal(otherBranchesAt(ctx).length, 0);
  // si la rama sigue a otra calle antes de juntarse, si es otro camino
  const calle = scenario({ route, extraNodes: [[20, 40], [15, 90], [300, 90]], edges: [[1, 6], [6, 7], [7, 3], [7, 8]] });
  assert.deepEqual([detectManeuver(calle).kind, detectManeuver(calle).direction], ['fork', 'left']);
  // y una calle de doble mano que vuelve igual (un triangulo de calles, Cody
  // y El Centro) se sigue avisando como antes
  const triangulo = scenario({ route, extraNodes: [[20, 40], [15, 90]], edges: [[1, 6], [6, 1], [6, 7], [7, 6], [7, 3], [3, 7]] });
  assert.deepEqual([detectManeuver(triangulo).kind, detectManeuver(triangulo).direction], ['fork', 'left']);
});

test('maneuver: la entrada a una rotonda se anuncia aunque no tenga otra salida', () => {
  // la ruta entra al anillo de un solo sentido (nodos 1 -> 2 -> 4 -> 5 -> 1) y lo deja por el 3
  const route = [[0, -300], [0, 0], [30, 30], [300, 30]];
  const ctx = scenario({ route, extraNodes: [[0, 60], [-30, 30]], edges: [[2, 4], [4, 5], [5, 1]] });
  // solo el anillo y la salida de la ruta: el 1 no tiene otra salida que el 2
  ctx.adjacency.set(1, [[2]]);
  const m = detectManeuver(ctx);
  assert.deepEqual([m.kind, m.quiet], ['turn', false]);
  assert.equal(ringThrough(ctx.adjacency, (k) => ctx.nodes[k], 1, 0), true);
  // una calle comun de doble mano no es un anillo
  const recta = new Map([[0, [[1]]], [1, [[0], [2]]], [2, [[1], [3]]], [3, [[2]]]]);
  const nodos = [[0, 0], [0, 50], [0, 100], [0, 150]];
  assert.equal(ringThrough(recta, (k) => nodos[k], 1, 0), false);
});

test('maneuver: esquina con un brazo muerto del prefab no es la entrada a una rotonda (Discord, 17-10)', () => {
  // la calle dobla 90 grados a la derecha en el nodo 1; el prefab tiene un
  // brazo (nodo 4) que sigue derecho 30 m y no lleva a ninguna calle
  const route = [[0, -300], [0, 0], [300, 0], [600, 0]];
  // brazo de doble mano con su tapa: un triangulo de un sentido (5 -> 6 -> 7
  // -> 5) para dar la vuelta. Se podia ir y volver por los mismos nodos.
  let ctx = scenario({ route, extraNodes: [[0, 30], [0, 45], [8, 55], [-8, 55]],
    edges: [[1, 4], [4, 1], [4, 5], [5, 4], [5, 6], [6, 7], [7, 5]] });
  assert.equal(ringThrough(ctx.adjacency, (k) => ctx.nodes[k], 1, 0), false);
  assert.deepEqual([detectManeuver(ctx).kind, detectManeuver(ctx).quiet], ['turn', true]);
  // curvas de doble mano del prefab en T: 1 -> 2 -> 4 -> 1 es un triangulo
  ctx = scenario({ route, extraNodes: [[0, 30]], edges: [[2, 1], [1, 4], [4, 1], [2, 4], [4, 2]] });
  assert.equal(ringThrough(ctx.adjacency, (k) => ctx.nodes[k], 1, 0), false);
  assert.deepEqual([detectManeuver(ctx).kind, detectManeuver(ctx).quiet], ['turn', true]);
  // con una calle de verdad detras del brazo, si: hay por donde equivocarse
  ctx = scenario({ route, extraNodes: [[0, 30], [0, 400]], edges: [[2, 1], [1, 4], [4, 1], [2, 4], [4, 2], [4, 5]] });
  assert.deepEqual([detectManeuver(ctx).kind, detectManeuver(ctx).quiet], ['turn', false]);
});

test('maneuver: la esquina en escuadra de una cruz con dos brazos muertos se anuncia (salida 115 de Rockford, Discord 18-10)', () => {
  // la calle llega del sur y en la cruz (nodo 1) dobla 90 grados al este; el
  // prefab tiene dos brazos mas, al norte y al oeste, que no llevan a ninguna calle
  const route = [[0, -300], [0, 0], [300, 0], [600, 0]];
  const muertos = [[0, 30], [-30, 0]];
  const cruz = (r, extra = muertos) => scenario({ route: r, extraNodes: extra, edges: extra.flatMap((_, k) => [[1, r.length + k], [r.length + k, 1]]) });
  assert.deepEqual([detectManeuver(cruz(route)).kind, detectManeuver(cruz(route)).quiet], ['turn', false]);
  // con un solo brazo muerto es una esquina con un prefab en T: callada (Oregon, 17-10)
  assert.equal(detectManeuver(cruz(route, [[0, 30]])).quiet, true);
  // con la calle doblando otra vez enseguida (zigzag, sierra): callada
  const zigzag = [[0, -300], [0, 0], [60, 0], [100, -40], [100, -300]];
  assert.equal(detectManeuver(cruz(zigzag)).quiet, true);
});

test('maneuver: la cruz con el brazo de enfrente oculto se anuncia aunque la calle se enderece enseguida (Bakersfield, reporte del 26-10)', () => {
  // La cruz con semaforos de Bakersfield (ATS, -104665,7299): se entra por el
  // brazo sur (1), se sale por el oeste (2) y a los 10 m la calzada vuelve
  // al norte, asi que a 60 m dobla 43 grados. Los brazos norte (5) y este (6)
  // son tocos: su calle es oculta y no esta en el grafo.
  const route = [[0, -300], [0, 0], [-30, 30], [-40, 40], [-40, 340]];
  const brazos = [[1, 5], [1, 6], [5, 6], [6, 5], [5, 2], [6, 2], [2, 5], [2, 6]];
  const cruz = (edges, stubs) => ({ ...scenario({ route, extraNodes: [[0, 60], [30, 30]], edges }), stubs });
  const tocos = [0, 0, 0, 0, 0, 1, 1];
  // sin los tocos (un grafo sin -prefabs.bin), como antes: la curva de la calle
  assert.deepEqual([detectManeuver(cruz(brazos)).kind, detectManeuver(cruz(brazos)).quiet], ['turn', true]);
  const m = detectManeuver(cruz(brazos, tocos));
  assert.deepEqual([m.kind, m.direction, m.quiet], ['turn', 'left', false]);
  // una T (el brazo de enfrente es el unico toco): callada, como en Tulsa
  assert.equal(detectManeuver(cruz([[1, 5], [5, 2], [2, 5]], [0, 0, 0, 0, 0, 1])).quiet, true);
  // dos tocos que no se unen entre si son de dos prefabs pegados (Messina): callada
  assert.equal(detectManeuver(cruz([[1, 5], [1, 6], [5, 2], [6, 2]], tocos)).quiet, true);
  // con los tocos al costado y ninguno enfrente, tambien
  const costado = { ...scenario({ route, extraNodes: [[30, 30], [20, -20]], edges: brazos }), stubs: tocos };
  assert.equal(detectManeuver(costado).quiet, true);
  // y un cruce chico que se pasa derecho en medio de una curva (Moline, Coast
  // to Coast): un brazo del costado queda a 15 grados de como se llega, pero
  // mas cerca que el de enfrente, por donde sale la ruta
  const curva = scenario({ route: [[0, -300], [0, 0], [11, 20], [40, 45], [300, 100]], extraNodes: [[-5, 19], [25, 5]],
    edges: [[1, 5], [1, 6], [5, 6], [6, 5], [5, 2], [6, 2], [2, 5], [2, 6]] });
  assert.deepEqual([detectManeuver({ ...curva, stubs: tocos }).kind, detectManeuver({ ...curva, stubs: tocos }).quiet], ['turn', true]);
  // ni la vuelta en U por ahi (una rotonda con los otros brazos ocultos, Sevilla -> Olhao)
  const vuelta = scenario({ route: [[0, -300], [0, 0], [-10, 20], [-20, 0], [-20, -300]], extraNodes: [[0, 60], [30, 30]], edges: brazos });
  assert.equal(detectManeuver({ ...vuelta, stubs: tocos }).quiet, true);
});

test('continuesTurn: una esquina partida en dos nodos se anuncia una vez; dos giros de verdad, dos', () => {
  const prev = { direction: 'left', inBearing: 0, outBearing: 315, quiet: false, end: 1000 };
  // segunda mitad de la misma esquina: de la entrada (norte) a la salida (oeste) son 90 grados
  assert.equal(continuesTurn(prev, { kind: 'turn', direction: 'left', outBearing: 270 }, 1040), true);
  // vuelta en U (izquierda y otra vez izquierda): 180 grados, son dos giros
  assert.equal(continuesTurn(prev, { kind: 'turn', direction: 'left', outBearing: 180 }, 1040), false);
  // lejos, o hacia el otro lado: otro cruce
  assert.equal(continuesTurn(prev, { kind: 'turn', direction: 'left', outBearing: 270 }, 1200), false);
  assert.equal(continuesTurn(prev, { kind: 'turn', direction: 'right', outBearing: 45 }, 1040), false);
  // despues de una curva callada de 40 grados, una esquina de 90 hacia el mismo lado se anuncia
  const curva = { direction: 'left', inBearing: 0, outBearing: 320, quiet: true, end: 1000 };
  assert.equal(continuesTurn(curva, { kind: 'turn', direction: 'left', outBearing: 230 }, 1060), false);
  // pero el cruce que solo arrastra la misma curva en su tramo de entrada no
  assert.equal(continuesTurn(curva, { kind: 'turn', direction: 'left', outBearing: 310 }, 1060), true);
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

test('sideExitToward: otra calle hacia ese lado en el cruce, que lleve a algun lado', () => {
  const derecho = [[0, -300], [0, 0], [0, 300], [0, 600]];
  // calle al este (derecha) en el nodo 1
  let ctx = scenario({ route: derecho, extraNodes: [[200, 0]], edges: [[1, 4]] });
  assert.equal(sideExitToward(ctx, 'right'), true);
  assert.equal(sideExitToward(ctx, 'left'), false);
  // de contramano (solo se sale de ella hacia la ruta): no se puede doblar
  ctx = scenario({ route: derecho, extraNodes: [[200, 0]], edges: [[4, 1]] });
  assert.equal(sideExitToward(ctx, 'right'), false);
  // ensanche que vuelve enseguida a la ruta
  ctx = scenario({ route: [[0, -300], [0, 0], [0, 60], [0, 600]], extraNodes: [[15, 30]], edges: [[1, 4], [4, 2]] });
  assert.equal(sideExitToward(ctx, 'right'), false);
  // una rampa que casi sigue derecho, o una calle que vuelve para atras, no es "doblar"
  ctx = scenario({ route: derecho, extraNodes: [[35, 200]], edges: [[1, 4]] });
  assert.equal(sideExitToward(ctx, 'right'), false);
  ctx = scenario({ route: derecho, extraNodes: [[30, -200]], edges: [[1, 4]] });
  assert.equal(sideExitToward(ctx, 'right'), false);
  // sin grafo no se sabe: nada que esperar
  assert.equal(sideExitToward({ ...ctx, adjacency: null }, 'right'), false);
});

test('stabilizeManeuver: la misma maniobra trae la calle anterior al dia (y la pierde al pasarla)', () => {
  const st = {};
  const g = (d, decoy) => ({ kind: 'turn', direction: 'right', distanceMeters: d, decoyMeters: decoy, node: [500, 500] });
  stabilizeManeuver(st, g(200, 150), 2);
  assert.equal(stabilizeManeuver(st, g(190, 140), 2).decoyMeters, 140);
  assert.equal(stabilizeManeuver(st, { ...g(40), node: [510, 505] }, 2).decoyMeters, undefined);
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

test('demo: va al ritmo del juego (un tick de 250 ms son 6,5 m de mapa a 94 km/h)', () => {
  // A 6x el camion volaba en modo navegacion. 26 m/s * 0,25 s = 6,5 m del
  // juego = 0,13 km a la escala 1:20.
  const demo = createDemoTelemetry({ totalKm: 1000 });
  for (let i = 0; i < 100; i++) demo.next();
  assert.ok(Math.abs(demo.progress() * 1000 - 13) < 0.5, String(demo.progress() * 1000));
});

test('demo: puede arrancar mas adelante (para grabar videos)', () => {
  const demo = createDemoTelemetry({ totalKm: 1000, startKm: 60 });
  demo.next();
  assert.ok(Math.abs(demo.progress() * 1000 - 60.13) < 0.05, String(demo.progress() * 1000));
  assert.ok(createDemoTelemetry({ totalKm: 100, startKm: 250 }).progress() < 1);
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

// Logos de las empresas: la capa pide "co:<token>" y solo esas se bajan.
test('logos de empresas: solo las imagenes de la capa, con un token limpio', () => {
  const { companyIconToken, COMPANY_ICON_PREFIX } = require('./pure.js');
  assert.equal(companyIconToken(COMPANY_ICON_PREFIX + 'flv_food_str'), 'flv_food_str');
  assert.equal(companyIconToken('co:lintukai_hrv'), 'lintukai_hrv');
  // Otras imagenes que falten (POIs genericos, carteles) no son logos.
  assert.equal(companyIconToken('gas_ico'), null);
  assert.equal(companyIconToken('co:'), null);
  // Un sprite raro no se arma en la URL.
  assert.equal(companyIconToken('co:../icons/gas_ico'), null);
  assert.equal(companyIconToken('co:a?b'), null);
  assert.equal(companyIconToken(undefined), null);
});

test('logos de empresas: primero el mapa armado en la PC, despues R2', () => {
  const { companyIconUrls } = require('./pure.js');
  const r2 = 'https://maps.trucksim-dash.com/vector/company-icons';
  // Mapa de R2 o armado antes de la 1.5.32: solo R2, con su ?v=.
  assert.deepEqual(companyIconUrls('flv_food_str', null, r2, '1'), [`${r2}/flv_food_str.png?v=1`]);
  // Armado con logos: los de sus mods solo estan ahi.
  assert.deepEqual(companyIconUrls('mod_co', 'http://127.0.0.1:27765/localmap/ats/company-icons', r2, '1'),
    ['http://127.0.0.1:27765/localmap/ats/company-icons/mod_co.png', `${r2}/mod_co.png?v=1`]);
  // Modo LAN: mismo origen, ruta relativa.
  assert.equal(companyIconUrls('mod_co', '/localmap/ets2/company-icons', r2, '1')[0], '/localmap/ets2/company-icons/mod_co.png');
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


// ---------------------------------------------------------------- voz
const giro = (dist, extra = {}) => ({ kind: 'turn', direction: 'right', distanceMeters: dist, node: [100, 200], ...extra });

test('voz: aviso anticipado y en el punto, una sola vez cada uno, por tiempo ("con anticipacion", el de antes)', () => {
  const v = createVoiceGuide({ timing: 'early' });
  // 90 km/h = 25 m/s: 800 m son 32 s, todavia nada
  assert.equal(v.maneuver(giro(800), 90), null);
  assert.equal(v.maneuver(giro(480), 90), 'soon_turn_right'); // 19 s
  assert.equal(v.maneuver(giro(400), 90), null);              // ya avisado
  assert.equal(v.maneuver(giro(140), 90), 'turn_right');      // 5,6 s
  assert.equal(v.maneuver(giro(60), 90), null);
});

test('voz: la misma distancia es otro momento a otra velocidad', () => {
  // 300 m a 90 km/h son 12 s (anticipado); a 30 km/h son 36 s (nada todavia)
  assert.equal(createVoiceGuide().maneuver(giro(300), 90), 'soon_turn_right');
  assert.equal(createVoiceGuide().maneuver(giro(300), 30), null);
});

test('voz: parado antes de doblar igual avisa (velocidad minima)', () => {
  const v = createVoiceGuide();
  assert.equal(v.maneuver(giro(25), 0), 'turn_right'); // 25 m / 5 m/s = 5 s
});

test('voz: si la maniobra aparece cerca, no hay aviso anticipado pegado al del punto', () => {
  const v = createVoiceGuide();
  assert.equal(v.maneuver(giro(220), 90), null);            // 8,8 s: entre 5 y 9, se calla
  assert.equal(v.maneuver(giro(60), 90), 'turn_right');
});

test('voz: el giro se dice cerca aunque se venga rapido (Discord, 11-10: "demasiado temprano")', () => {
  // 80 km/h = 22 m/s: antes "turn right" salia a 6 s, 133 m antes, y
  // frenando para doblar se llegaba mucho despues
  const v = createVoiceGuide();
  assert.equal(v.maneuver(giro(400), 80), 'soon_turn_right');
  assert.equal(v.maneuver(giro(130), 80), null);
  assert.equal(v.maneuver(giro(100), 80), null);            // 4,5 s, pero a 100 m
  assert.equal(v.maneuver(giro(65), 80), 'turn_right');
  // la rotonda igual: "primera salida" cerca de la entrada
  const r = createVoiceGuide();
  const rotonda = (d) => giro(d, { kind: 'roundabout', exit: 1 });
  assert.equal(r.maneuver(rotonda(100), 60), null);
  assert.equal(r.maneuver(rotonda(60), 60), 'roundabout_1');
  // una salida de autopista se toma a velocidad: sigue siendo por tiempo
  const k = createVoiceGuide();
  assert.equal(k.maneuver(giro(110, { kind: 'fork' }), 90), 'keep_right'); // 4,4 s
});

test('voz: el momento del aviso del punto se elige en Ajustes', () => {
  assert.equal(voiceTimingSetting('late'), 'late');
  assert.equal(voiceTimingSetting('cualquiera'), VOICE_TIMING_DEFAULT);
  assert.equal(voiceTimingSetting(undefined), 'normal');
  // a 50 km/h (13,9 m/s): con anticipacion a 83 m, normal a 69 m, en el giro a 35 m
  const cuando = (timing) => {
    const v = createVoiceGuide({ timing });
    for (let d = 150; d >= 0; d -= 5) if (v.maneuver(giro(d), 50) === 'turn_right') return d;
    return null;
  };
  assert.deepEqual([cuando('early'), cuando('normal'), cuando('late')], [80, 65, 35]);
  // cambiarlo con la guia andando vale para el proximo aviso
  const v = createVoiceGuide({ timing: 'early' });
  v.setTiming('late');
  assert.equal(v.maneuver(giro(60), 50), null);
  assert.equal(v.maneuver(giro(30), 50), 'turn_right');
});

test('voz: con otra calle a la derecha antes del giro, "turn right" espera a pasarla (Discord, 11-10)', () => {
  const v = createVoiceGuide();
  assert.equal(v.maneuver(giro(250, { decoyMeters: 200 }), 50), 'soon_turn_right'); // el aviso anticipado no espera
  assert.equal(v.maneuver(giro(60, { decoyMeters: 10 }), 50), null);  // la otra calle esta 10 m adelante
  assert.equal(v.maneuver(giro(45), 50), 'turn_right');                // ya pasada
  // sin aviso anticipado tampoco se dice antes de tiempo
  const w = createVoiceGuide();
  assert.equal(w.maneuver(giro(40, { decoyMeters: 15 }), 30), null);
  assert.equal(w.maneuver(giro(20, { decoyMeters: 0 }), 30), 'turn_right');
});

test('voz: bifurcacion dice "keep"; un cruce nuevo vuelve a avisar', () => {
  const v = createVoiceGuide();
  assert.equal(v.maneuver(giro(100, { kind: 'fork', direction: 'left' }), 90), 'keep_left');
  assert.equal(v.maneuver(giro(450, { node: [900, 900] }), 90), 'soon_turn_right');
  assert.equal(v.maneuver(null, 90), null);
});

test('voz: si el aviso va a otra maniobra y vuelve, no la repite (Salem, Cheyenne, 22-10)', () => {
  const v = createVoiceGuide();
  const keep = (d) => giro(d, { kind: 'fork', node: [500, 500] });
  const otro = (d) => giro(d, { node: [900, 900] });
  // Salem: el keep se dice en el punto, al pisar el nodo se ve el giro que
  // sigue y al dato siguiente vuelve el keep: no se repite
  assert.equal(v.maneuver(keep(30), 50), 'keep_right');
  assert.equal(v.maneuver(otro(340), 50), null);
  assert.equal(v.maneuver(keep(0), 50), null);
  // con el anticipado dicho, un ida y vuelta no lo repite y el del punto sale igual
  const w = createVoiceGuide();
  assert.equal(w.maneuver(giro(300, { node: [1, 1] }), 72), 'soon_turn_right'); // 15 s
  assert.equal(w.maneuver(otro(280), 72), 'soon_turn_right');
  assert.equal(w.maneuver(giro(250, { node: [1, 1] }), 72), null);
  assert.equal(w.maneuver(giro(60, { node: [1, 1] }), 72), 'turn_right');
  // pasadas RECENT_MANEUVERS_MAX maniobras se olvida: un cruce que vuelve
  // mucho despues se avisa otra vez
  const { RECENT_MANEUVERS_MAX } = require('./pure.js');
  const x = createVoiceGuide();
  assert.equal(x.maneuver(keep(30), 50), 'keep_right');
  for (let k = 0; k < RECENT_MANEUVERS_MAX; k++) x.maneuver(giro(30, { node: [k * 1000, 0] }), 50);
  assert.equal(x.maneuver(keep(30), 50), 'keep_right');
});

test('voz: llegada una vez por destino, y no al tomar un trabajo ya en la empresa', () => {
  const v = createVoiceGuide();
  assert.equal(v.arrival('job1|dest', 'dest', 5, 120), null);
  assert.equal(v.arrival('job1|dest', 'dest', 0.2, 120), 'arrive_dest');
  assert.equal(v.arrival('job1|dest', 'dest', 0.1, 120), null);
  assert.equal(v.arrival('job2|pickup', 'pickup', 0.1, 0.4), null); // ruta de 400 m: ya estaba ahi
  assert.equal(v.arrival('job3|pickup', 'pickup', 0.2, 30), 'arrive_pickup');
  assert.equal(v.arrival('wp', 'waypoint', 0, 30), null);
});

test('voz: el ultimo waypoint sin trabajo es el destino (Gargamosch, Discord 18-10)', () => {
  const v = createVoiceGuide();
  // quedan otros, o hay trabajo (los waypoints son paradas en el camino): nada
  assert.equal(v.waypointReached('wp|a,b', false, 'waypoint', 30), null);
  assert.equal(v.waypointReached('job|dest', true, 'dest', 30), null);
  assert.equal(v.waypointReached('job|pickup', true, 'pickup', 30), null);
  // un viaje de 400 m: ya estaba ahi
  assert.equal(v.waypointReached('wp|corto', true, 'waypoint', 0.4), null);
  // el ultimo, sin trabajo: "llegaste", una sola vez
  assert.equal(v.waypointReached('wp|b', true, 'waypoint', 30), 'arrive_dest');
  assert.equal(v.waypointReached('wp|b', true, 'waypoint', 30), null);
});

test('voz: la elegida aunque sea de otro idioma; si no, la primera del idioma (Discord 22-10)', () => {
  const voices = [{ id: 'en-a', lang: 'en' }, { id: 'en-b', lang: 'en' }, { id: 'es-a', lang: 'es' }];
  assert.equal(pickVoice(voices, 'en', 'en-b').id, 'en-b');
  // con la app en ingles se puede elegir la voz en castellano
  assert.equal(pickVoice(voices, 'en', 'es-a').id, 'es-a');
  assert.equal(pickVoice(voices, 'en', null).id, 'en-a');
  assert.equal(pickVoice(voices, 'en', 'ya-no-existe').id, 'en-a');
  assert.equal(pickVoice(voices, 'pl', null), null);
  assert.equal(pickVoice(voices, 'pl', 'es-a').id, 'es-a');
  assert.equal(pickVoice(null, 'en', null), null);
});

test('voz: en Ajustes estan todas, primero las del idioma de la app y las otras con su idioma', () => {
  const { voiceChoices } = require('./pure.js');
  const voices = [{ id: 'en-k', lang: 'en', label: 'Kristin' }, { id: 'en-j', lang: 'en', label: 'Joe' },
    { id: 'de-t', lang: 'de', label: 'Thorsten' }, { id: 'tr-s', lang: 'tr', system: true }];
  const nombre = (l) => ({ en: 'English', de: 'Deutsch', tr: 'Türkçe' })[l];
  assert.deepEqual(voiceChoices(voices, 'de', nombre, 'System voice'), [
    { id: 'de-t', label: 'Thorsten' }, { id: 'en-k', label: 'Kristin · English' },
    { id: 'en-j', label: 'Joe · English' }, { id: 'tr-s', label: 'System voice · Türkçe' }]);
  assert.deepEqual(voiceChoices(voices, 'en', nombre, 'System voice').map(o => o.id), ['en-k', 'en-j', 'de-t', 'tr-s']);
  assert.deepEqual(voiceChoices(null, 'en', nombre, 'x'), []);
});


test('fuera del mapa: la caja sale de las ciudades con margen; sin caja, adentro', () => {
  const ciudades = [{ X: -90000, Y: -120000 }, { X: 77000, Y: 85000 }, { X: 0, Y: 0 }];
  const b = mapBoundsFromCities(ciudades);
  assert.ok(insideMapBounds(b, -9800, 47600));            // Pescara
  assert.ok(insideMapBounds(b, -100000, 0));              // pasado la ultima ciudad, dentro del margen
  assert.ok(!insideMapBounds(b, -659907, 131729));        // el mod de Sudamerica, en el Atlantico
  assert.ok(insideMapBounds(null, -659907, 131729));      // sin ciudades cargadas no se esconde a nadie
  assert.equal(mapBoundsFromCities([{ X: 1, Y: 1 }]), null);
  assert.equal(mapBoundsFromCities(null), null);
});

test('DLC: un tramo de un DLC destildado no se usa, el de frontera pide los dos', () => {
  const { dlcBlockedGuards, dlcGameOf, normalizeDlcOff } = require('./pure.js');
  const todo = dlcBlockedGuards('ats', []);
  assert.equal(todo[0], 0);            // base
  assert.equal(todo[1], 0);            // Nevada viene con el juego
  assert.equal(todo[13], 0);           // Colorado
  assert.equal(todo[53], 0);           // South Dakota ya salio
  const sinCo = dlcBlockedGuards('ats', ['co']);
  assert.equal(sinCo[13], 1);          // Colorado
  assert.equal(sinCo[17], 1);          // Wyoming + Colorado: pide los dos
  assert.equal(sinCo[16], 0);          // Wyoming solo
  assert.equal(sinCo[0], 0);
});

test('DLC: lo que no esta en la tabla o no se publico no se usa nunca', () => {
  const { dlcBlockedGuards } = require('./pure.js');
  const ats = dlcBlockedGuards('ats', []);
  assert.equal(ats[58], 1);            // Illinois con un estado que no salio
  assert.equal(ats[59], 1);
  assert.equal(ats[63], 1);            // fuera de rango (65 recortado)
  const ets2 = dlcBlockedGuards('ets2', []);
  assert.equal(ets2[13], 1);           // Heart of Russia
  assert.equal(ets2[14], 1);
  assert.equal(ets2[27], 1);           // Alesund: no esta en la tabla
  assert.equal(ets2[23], 0);           // Nordic Horizons
  assert.equal(dlcBlockedGuards('ets2', ['nordic', 'north'])[25], 1);
});

test('DLC: juego de la variante y ajustes guardados limpios', () => {
  const { dlcGameOf, normalizeDlcOff } = require('./pure.js');
  assert.equal(dlcGameOf('ats_c2c_promods'), 'ats');
  assert.equal(dlcGameOf('ets2_promods_eugu'), 'ets2');
  assert.equal(dlcGameOf(null), 'ets2');
  assert.deepEqual(normalizeDlcOff({ ats: ['co', 'co', 'xx', 'nv'], ets2: 'iberia' }), { ats: ['co'], ets2: [] });
  assert.deepEqual(normalizeDlcOff(undefined), { ats: [], ets2: [] });
});

test('DLC: automatico usa lo que encontro el cliente; sin datos, todos; manual, lo elegido', () => {
  const { effectiveDlcOff, DLC_LIST } = require('./pure.js');
  const todosAts = DLC_LIST.ats.map(d => d[0]);
  const sinCoNiSd = todosAts.filter(id => id !== 'co' && id !== 'sd');
  assert.deepEqual(effectiveDlcOff('ats', true, { ats: sinCoNiSd.concat(['nv', 'az']) }, ['tx']), ['co', 'sd']);
  assert.deepEqual(effectiveDlcOff('ats', true, null, ['tx']), []);              // cliente viejo
  assert.deepEqual(effectiveDlcOff('ets2', true, { ats: todosAts }, ['it']), []); // ETS2 sin datos
  assert.deepEqual(effectiveDlcOff('ats', false, { ats: [] }, ['tx']), ['tx']);   // manual
  assert.equal(effectiveDlcOff('ets2', true, { ets2: [] }).length, DLC_LIST.ets2.length);
});

test('facilityCodesFor: en camion sin los surtidores de auto, en auto sin el descanso de camiones', () => {
  const { facilityCodesFor } = require('./pure.js');
  assert.deepEqual(facilityCodesFor('g', false), ['g']);
  assert.deepEqual(facilityCodesFor('g', true), ['g', 'f']);
  assert.deepEqual(facilityCodesFor('p', false), ['p']);
  assert.deepEqual(facilityCodesFor('p', true), ['c']);
  assert.deepEqual(facilityCodesFor('s', true), ['s']);
  assert.deepEqual(facilityCodesFor('a', false), ['a']);
});

test('isDrivingCar: auto por la marca, y por el trabajo con auto si el cliente es viejo', () => {
  const { isDrivingCar } = require('./pure.js');
  assert.equal(isDrivingCar({ game: 'ats', truckBrandId: 'ford' }), true);
  assert.equal(isDrivingCar({ game: 'ats', truckBrandId: 'kenworth', onJob: true, cargo: 'Ford Bronco', cargoMassKg: 0 }), false);
  assert.equal(isDrivingCar({ game: 'ets2', truckBrandId: 'ford' }), false);
  // Cliente sin truckBrandId: trabajo con auto (carga con nombre, sin peso)
  assert.equal(isDrivingCar({ game: 'ats', onJob: true, cargo: 'Crown Victoria', cargoMassKg: 0 }), true);
  assert.equal(isDrivingCar({ game: 'ats', onJob: true, cargo: 'Gravel', cargoMassKg: 21000 }), false);
  assert.equal(isDrivingCar({ game: 'ats', onJob: false }), false);
  assert.equal(isDrivingCar(null), false);
});

test('projectAheadOnRoute: un hueco entre lecturas no congela la ruta, el puente sigue sin ganar', () => {
  const { projectAheadOnRoute } = require('./pure.js');
  // Ruta recta hacia el este, un punto cada 50 m durante 5 km.
  const recta = [];
  for (let x = 0; x <= 5000; x += 50) recta.push([x, 0]);
  // Tick normal: 30 m mas adelante.
  let r = projectAheadOnRoute(recta, 30, 2, 400);
  assert.equal(r.idx, 0);
  assert.ok(r.dist < 3);
  // Hueco de un minuto (pestana frenada): 1,82 km mas adelante. Con la
  // ventana fija de 400 m el mas cercano quedaba a 1,4 km y no se recortaba.
  r = projectAheadOnRoute(recta, 1820, 3, 400);
  assert.equal(r.idx, 36);
  assert.ok(r.dist < 4, String(r.dist));
  // Puente: la ruta sigue 400 m al este, da la vuelta por un lazo y cruza
  // por debajo del camion 800 m despues. Recien arrancado, tiene que caer
  // al principio de la ruta y no en el cruce.
  const lazo = [[0, 0], [200, 0], [400, 0], [400, 200], [200, 200], [10, 200], [10, 100], [10, 8], [10, -200]];
  r = projectAheadOnRoute(lazo, 12, 6, 400);
  assert.equal(r.idx, 0);
  assert.equal(projectAheadOnRoute([[0, 0]], 0, 0), null);
});

test('projectAheadOnRoute: en una ida y vuelta por el mismo camino no pasa a la vuelta antes de llegar al fondo', () => {
  const { projectAheadOnRoute } = require('./pure.js');
  // Calle sin salida de 600 m al oeste, con curvas y puntos desparejos como
  // los del grafo; la vuelta son los mismos puntos al reves. Hasta el 16-10
  // el empate lo decidia la coma flotante y 1 de cada 50 lecturas caia en la
  // vuelta: la ruta perdia lo de adelante (ATS + C2C).
  const ida = [];
  for (let x = 0; x > -600; x -= 17.3) ida.push([x, Math.sin(x / 90) * 30]);
  ida.push([-600, Math.sin(-600 / 90) * 30]);
  const ruta = [...ida, ...ida.slice(0, -1).reverse(), [300, 0]];
  const finIda = ida.length - 1; // los tramos de la ida son 0 .. finIda - 1
  let lecturas = 0;
  for (let k = 0; k < finIda; k++) {
    const [ax, az] = ida[k], [bx, bz] = ida[k + 1];
    const L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L, nz = (bx - ax) / L;
    for (const f of [0, 0.3, 0.71]) {
      for (const lado of [-4, -2.5, 0, 1.3, 2.5, 4]) {
        // como la app: la ruta ya recortada hasta el tramo del camion
        const r = projectAheadOnRoute(ruta.slice(k), ax + (bx - ax) * f + nx * lado, az + (bz - az) * f + nz * lado, 400);
        assert.ok(r.idx + k < finIda, `tramo ${k} f ${f} lado ${lado}: cayo en el ${r.idx + k} (la vuelta)`);
        lecturas++;
      }
    }
  }
  assert.ok(lecturas > 500);
  // Ya dio la vuelta (antes del fondo, donde pudo): la vuelta gana enseguida.
  const desde = ruta.slice(20); // recortada en la ida, a unos 350 m
  const r = projectAheadOnRoute(desde, ida[12][0], ida[12][1] - 3, 400);
  assert.ok(r.idx + 20 >= finIda, String(r.idx + 20));
  assert.ok(r.dist < 4);
  // Y un tramo de mas adelante que pasa mas cerca por mas de 1 m sigue ganando:
  // el camion a 4 m del primero y encima del que baja por x = 20.
  const cruce = [[0, 0], [100, 0], [100, 50], [20, 50], [20, 1.5], [20, -100]];
  assert.equal(projectAheadOnRoute(cruce, 20, 4, 400).idx, 3);
});

test('waypointReached: por la ruta hasta el icono o el nodo de su tramo, en linea recta solo sin ruta', () => {
  const { waypointReached, WAYPOINT_ROUTE_END_M, WAYPOINT_STOPPED_M, WAYPOINT_SNAP_M } = require('./pure.js');
  const desde = (x, z, leg, resto) => [[x, z, 0, 0, null, leg], ...resto];
  // Tramo 0 por z = 0 hasta el nodo del waypoint en (1000, 0); el 1 sigue derecho.
  const ruta = [[0, 0, 0, 0, null, 0], [500, 0, 0, 0, 1, 0], [1000, 0, 0, 0, 2, 0], [1100, 0, 0, 0, null, 1], [2000, 0, 0, 0, 3, 1]];
  const resto = (x) => ruta.filter(p => p[0] > x);
  const legDe = (x) => (x < 1000 ? 0 : 1);
  const en = (x, wp, o) => waypointReached(x, 0, wp, desde(x, 0, legDe(x), resto(x)), o);
  // Sin ruta: en linea recta, como siempre.
  assert.equal(waypointReached(900, -280, [1000, -300], null), true);
  assert.equal(waypointReached(900, 0, [1000, -300], null), false);
  // Con ruta, la linea recta no: a 150 m del mundo (3 km del juego a 1:20) el
  // waypoint se iba casi 2 millas antes del icono (Discord, Gargamosch, 18-10).
  assert.equal(en(860, [1000, 5]), false);
  assert.equal(en(1000 - WAYPOINT_ROUTE_END_M + 2, [1000, 5]), true);
  assert.equal(en(1050, [1000, 5]), true);
  // El icono despues del nodo (el nodo mas cercano al toque quedo antes):
  // llega al pasar por el icono, no en el nodo.
  assert.equal(en(995, [1060, 5]), false);
  assert.equal(en(1030, [1060, 5]), false);
  assert.equal(en(1055, [1060, 5]), true);
  // ... pero salirse de la ruta pasado el nodo es llegar: la ruta nueva
  // mandaria a volver al nodo.
  assert.equal(waypointReached(1030, 80, [1060, 5], desde(1030, 0, 1, resto(1030))), true);
  // El icono antes del nodo, en una arista larga: llega en el icono.
  assert.equal(en(700, [840, 10]), false);
  assert.equal(en(835, [840, 10]), true);
  // Toque lejos del camino (en el celular, con el mapa alejado): llega en el
  // nodo; antes quedaba puesto y la ruta mandaba a volver (16-10).
  const lejos = [1000, -300];
  assert.ok(300 > WAYPOINT_SNAP_M);
  assert.equal(en(800, lejos), false);
  assert.equal(en(995, lejos), true);
  assert.equal(en(1010, lejos), true);
  // Parado un poco antes del nodo (estacionado) tambien es llegar; andando no.
  assert.equal(en(1000 - WAYPOINT_STOPPED_M + 5, lejos, { speedKmh: 0 }), true);
  assert.equal(en(1000 - WAYPOINT_STOPPED_M + 5, lejos, { speedKmh: 60 }), false);
  // La ruta da la vuelta en el nodo (el destino queda atras) y el camion siguio
  // derecho: el recorte lo deja clavado en el nodo, cuenta como llegado.
  const vuelta = [[1000, 0, 0, 0, 2, 0], [500, 0, 0, 0, 1, 1], [0, 0, 0, 0, 0, 1]];
  assert.equal(waypointReached(1040, 0, lejos, desde(1000, 0, 0, vuelta)), true);
  // Una rampa que corre a 25 m de la autopista, con el icono sobre ella (la
  // salida 115 de Gargamosch): cerca en linea recta, a 325 m por la ruta.
  const rampa = [[1200, 25, 0, 0, 7, 0], [1200, 0, 0, 0, 8, 0], [1000, 0, 0, 0, 9, 0], [1000, -500, 0, 0, 10, 1]];
  assert.equal(waypointReached(1000, 25, [1100, 0], desde(1000, 25, 0, rampa)), false);
  assert.equal(waypointReached(1105, 0, [1100, 0], desde(1105, 0, 0, rampa.slice(2))), true);
  // Sin datos que sirvan
  assert.equal(waypointReached(NaN, 0, lejos, ruta), false);
  assert.equal(waypointReached(0, 0, null, ruta), false);
  assert.equal(waypointReached(0, 0, lejos, [[0, 0, 0, 0, null, 2]]), false);
});

test('storedWaypoints: vuelven los de la variante, vigentes y con forma de waypoint', () => {
  const { storedWaypoints } = require('./pure.js');
  const now = 1_000_000_000_000;
  const stored = {
    ats: { at: now - 3600 * 1000, list: [{ pos: [10, 20], inGame: true, label: 'Fuel' }, { pos: [1, 'x'] }, null, { pos: [30, 40] }] },
    ets2: { at: now - 13 * 3600 * 1000, list: [{ pos: [5, 5] }] },
  };
  assert.deepEqual(storedWaypoints(stored, 'ats', now), [
    { pos: [10, 20], inGame: true, label: 'Fuel' },
    { pos: [30, 40], inGame: false, label: null },
  ]);
  // mas de 12 h sin tocarlos: vencidos
  assert.deepEqual(storedWaypoints(stored, 'ets2', now), []);
  // otra variante, nada guardado o basura
  assert.deepEqual(storedWaypoints(stored, 'ats_c2c', now), []);
  assert.deepEqual(storedWaypoints(null, 'ats', now), []);
  assert.deepEqual(storedWaypoints({ ats: { at: 'ayer', list: [] } }, 'ats', now), []);
  // tope de cantidad
  const muchos = { ats: { at: now, list: Array.from({ length: 20 }, (_, k) => ({ pos: [k, k] })) } };
  assert.equal(storedWaypoints(muchos, 'ats', now, undefined, 9).length, 9);
});

test('routePlanOffers: al conectar se ofrece lo vigente con su rev, no lo que espera mandarse', () => {
  const { routePlanOffers } = require('./pure.js');
  const now = 1_000_000_000_000;
  const stored = {
    ats: { at: now - 1000, rev: 999, list: [{ pos: [10, 20], inGame: true, label: 'Fuel', kind: 'g' }] },
    ets2: { at: now - 13 * 3600 * 1000, rev: 5, list: [{ pos: [5, 5] }] }, // vencido
    ats_c2c: { at: now, list: [{ pos: [1, 2] }], pending: true }, // va como cambio
    ats_promods: { at: now, rev: 7, list: [] }, // los saco todos: tambien cuenta
    ets2_promods: { at: now, list: [] }, // vacio y nunca sincronizado: nada
  };
  assert.deepEqual(routePlanOffers(stored, now), {
    ats: { list: [{ pos: [10, 20], inGame: true, label: 'Fuel', kind: 'g' }], rev: 999 },
    ats_promods: { list: [], rev: 7 },
  });
  assert.deepEqual(routePlanOffers(null, now), {});
});

test('routePlanAction: se aplica lo mas nuevo de otro, y el cambio propio vuelve como respuesta', () => {
  const { routePlanAction, samePlanList } = require('./pure.js');
  const msg = (rev, nonce) => ({ type: 'route_plan', variant: 'ats', list: [], rev, nonce });
  assert.equal(routePlanAction(msg(10), { rev: 5 }, null), 'apply');
  assert.equal(routePlanAction(msg(10), null, null), 'apply');
  assert.equal(routePlanAction(msg(5), { rev: 5 }, null), null); // ya lo teniamos
  assert.equal(routePlanAction(msg(4), { rev: 5 }, null), null);
  // Con un cambio propio en camino: solo cuenta su respuesta
  assert.equal(routePlanAction(msg(11, 'n1'), { rev: 5 }, 'n1'), 'ack');
  assert.equal(routePlanAction(msg(12, 'otro'), { rev: 5 }, 'n1'), null);
  assert.equal(routePlanAction(msg(12), { rev: 5 }, 'n1'), null);
  assert.equal(routePlanAction({ rev: 'x', list: [] }, null, null), null);
  const a = [{ pos: [1, 2], inGame: true, label: 'A', kind: 'g' }];
  assert.equal(samePlanList(a, [{ pos: [1, 2], inGame: true, label: 'A', kind: 'g', marker: {} }]), true);
  assert.equal(samePlanList(a, [{ pos: [1, 2], inGame: true, label: 'B', kind: 'g' }]), false);
  assert.equal(samePlanList([], null), true);
});

test('syncAction y routePrefsOf: los ajustes de ruta de la sesion', () => {
  const { syncAction, routePrefsOf, sameRoutePrefs } = require('./pure.js');
  assert.equal(syncAction(10, undefined, 5, null), 'apply');
  assert.equal(syncAction(5, undefined, 5, null), null);
  assert.equal(syncAction(11, 'n1', 5, 'n1'), 'ack');
  assert.equal(syncAction(12, undefined, 5, 'n1'), null);
  assert.equal(syncAction('x', undefined, 0, null), null);
  // Normalizados: perfil valido, DLC conocidos y en orden
  const a = routePrefsOf('shortest', 0, { ats: ['ut', 'co', 'nada'], ets2: [] });
  assert.deepEqual(a, { profile: 'shortest', dlcAuto: false, dlcOff: { ats: ['co', 'ut'], ets2: [] } });
  assert.equal(routePrefsOf('otra', true, null).profile, 'fastest');
  assert.equal(sameRoutePrefs(a, routePrefsOf('shortest', false, { ats: ['co', 'ut'] })), true);
  assert.equal(sameRoutePrefs(a, routePrefsOf('fastest', false, { ats: ['co', 'ut'] })), false);
});

test('deviceInfo: telefono, tablet o computadora, con el sistema y el navegador', () => {
  const { deviceInfo } = require('./pure.js');
  assert.deepEqual(deviceInfo('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'),
    { kind: 'phone', os: 'Android', browser: 'Chrome' });
  assert.deepEqual(deviceInfo('Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Safari/537.36'),
    { kind: 'tablet', os: 'Android', browser: 'Samsung Internet' });
  assert.deepEqual(deviceInfo('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'),
    { kind: 'phone', os: 'iOS', browser: 'Safari' });
  // El iPad con Safari dice ser una Mac: lo delata la pantalla tactil
  const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  assert.deepEqual(deviceInfo(ipad, 5), { kind: 'tablet', os: 'iPadOS', browser: 'Safari' });
  assert.deepEqual(deviceInfo(ipad, 0), { kind: 'computer', os: 'macOS', browser: 'Safari' });
  assert.deepEqual(deviceInfo('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0'),
    { kind: 'computer', os: 'Windows', browser: 'Edge' });
  assert.deepEqual(deviceInfo('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0'),
    { kind: 'computer', os: 'Linux', browser: 'Firefox' });
  assert.deepEqual(deviceInfo(''), { kind: 'other', os: null, browser: null });
});

test('voiceSpeaksHere: con un dispositivo elegido habla solo ese; sin eleccion o por LAN, como antes', () => {
  const { voiceSpeaksHere } = require('./pure.js');
  const celular = { device: 'celular1', kind: 'phone' };
  assert.equal(voiceSpeaksHere(true, true, true, celular, 'celular1'), true);
  assert.equal(voiceSpeaksHere(true, true, true, celular, 'pcdelcasa'), false);
  assert.equal(voiceSpeaksHere(true, true, true, null, 'pcdelcasa'), true);
  assert.equal(voiceSpeaksHere(true, true, true, { device: null }, 'pcdelcasa'), true);
  // Por LAN (sin el relay) no se sabe quien la tiene: habla
  assert.equal(voiceSpeaksHere(true, true, false, celular, 'pcdelcasa'), true);
  // Apagada, o en una pestana que no es la lider del navegador: nunca
  assert.equal(voiceSpeaksHere(false, true, true, null, 'celular1'), false);
  assert.equal(voiceSpeaksHere(true, false, true, celular, 'celular1'), false);
});

// ---- rotondas
// Grafo dirigido chico: nodos [x, y] (y = norte) y aristas [a, b, dosManos].
function grafoChico(nodos, aristas) {
  const adjacency = new Map();
  const add = (a, b) => {
    if (!adjacency.has(a)) adjacency.set(a, []);
    adjacency.get(a).push([b, Math.hypot(nodos[b][0] - nodos[a][0], nodos[b][1] - nodos[a][1])]);
  };
  for (const [a, b, dos] of aristas) { add(a, b); if (dos) add(b, a); }
  return { adjacency, nodeAt: (k) => nodos[k] };
}
// Calle larga que sale de un nodo hacia (dx, dy), para que la salida sea de verdad.
function conCalle(nodos, aristas, desde, dx, dy) {
  const k = nodos.length;
  nodos.push([nodos[desde][0] + dx, nodos[desde][1] + dy]);
  aristas.push([desde, k, true]);
  return k;
}
function rutaPor(nodos, ids) {
  const pts = ids.map((n, k) => [nodos[n][0], nodos[n][1], 0, 1, n]);
  const { cum, pointAt } = routeMetrics(pts);
  return { pts, cum, pointAt };
}

test('detectRoundabout: anillo de un sentido, cuenta las salidas hasta la de la ruta', () => {
  const { detectRoundabout } = require('./pure.js');
  // anillo de radio 30 en sentido antihorario, 8 nodos (0..7) arrancando al sur
  const nodos = [], aristas = [];
  for (let k = 0; k < 8; k++) { const a = -Math.PI / 2 + k * Math.PI / 4; nodos.push([30 * Math.cos(a), 30 * Math.sin(a)]); }
  for (let k = 0; k < 8; k++) aristas.push([k, (k + 1) % 8, false]);
  const sur = conCalle(nodos, aristas, 0, 0, -300); // entrada (doble mano)
  const este = conCalle(nodos, aristas, 2, 300, 0); // primera salida
  conCalle(nodos, aristas, 4, 0, 300); // segunda: norte
  const oeste = conCalle(nodos, aristas, 6, -300, 0); // tercera
  const g = grafoChico(nodos, aristas);
  const ctx = (ids) => ({ ...rutaPor(nodos, ids), i: 1, iEnd: 1, ...g, bearingBetween: planarBearing });
  // del sur al oeste: sur -> 0 -> 1 .. 6 -> oeste
  let r = detectRoundabout(ctx([sur, 0, 1, 2, 3, 4, 5, 6, oeste]));
  assert.deepEqual([r.exit, r.enter, r.leave], [3, 1, 7]);
  r = detectRoundabout(ctx([sur, 0, 1, 2, este]));
  assert.equal(r.exit, 1);
  // la misma forma con calles de doble mano (una calle que da la vuelta a una plaza): no
  const dobles = aristas.map(([a, b]) => [a, b, true]);
  const g2 = grafoChico(nodos, dobles);
  assert.equal(detectRoundabout({ ...rutaPor(nodos, [sur, 0, 1, 2, este]), i: 1, iEnd: 1, ...g2, bearingBetween: planarBearing }), null);
});

test('detectRoundabout: la salida que se abre en el mismo nodo de la entrada es la primera (Discord, 15-10)', () => {
  const { detectRoundabout } = require('./pure.js');
  // rotonda de 4 brazos como la del nodo 9654 de ATS: anillo antihorario de
  // radio 30 y 8 nodos (0 sur, 1 sureste, ... 7 suroeste). Cada brazo entra
  // al anillo en el nodo diagonal del que sale el brazo siguiente: en 1
  // entra el sur y sale el este, en 3 entra el este y sale el norte, etc.
  const nodos = [], aristas = [];
  for (let k = 0; k < 8; k++) { const a = -Math.PI / 2 + k * Math.PI / 4; nodos.push([30 * Math.cos(a), 30 * Math.sin(a)]); }
  for (let k = 0; k < 8; k++) aristas.push([k, (k + 1) % 8, false]);
  const brazo = (x, y, desde, hasta) => { const k = nodos.length; nodos.push([x, y]); aristas.push(desde == null ? [k, hasta, false] : [desde, k, false]); return k; };
  const surEntra = brazo(15, -300, null, 1), este = brazo(300, -15, 1);
  brazo(300, 15, null, 3); const norte = brazo(15, 300, 3);
  brazo(-15, 300, null, 5); const oeste = brazo(-300, 15, 5);
  brazo(-300, -15, null, 7); const surSale = brazo(-15, -300, 7);
  const ctx = (ids, g) => ({ ...rutaPor(nodos, ids), i: 1, iEnd: 1, ...g, bearingBetween: planarBearing });
  let g = grafoChico(nodos, aristas);
  // derecho: segunda salida (antes decia "primera")
  assert.equal(detectRoundabout(ctx([surEntra, 1, 2, 3, norte], g)).exit, 2);
  assert.equal(detectRoundabout(ctx([surEntra, 1, 2, 3, 4, 5, oeste], g)).exit, 3);
  assert.equal(detectRoundabout(ctx([surEntra, 1, 2, 3, 4, 5, 6, 7, surSale], g)).exit, 4);
  // la primera, que sale del nodo de la entrada sin pisar el anillo: rotonda
  // y no "doblar a la derecha"
  const r = detectRoundabout(ctx([surEntra, 1, este], g));
  assert.deepEqual([r.exit, r.enter, r.leave], [1, 1, 1]);
  // una calle que sale del nodo de la entrada dandose vuelta (para el lado
  // del que se viene) no es otra salida
  brazo(25, -300, 1);
  g = grafoChico(nodos, aristas);
  assert.equal(detectRoundabout(ctx([surEntra, 1, 2, 3, norte], g)).exit, 2);
});

test('detectRoundabout: una rotonda grande, de mas de 700 m de vuelta (Alexandria, 15-10)', () => {
  const { detectRoundabout, oneWayRing } = require('./pure.js');
  // anillo antihorario de radio 200 (1253 m de vuelta) y 24 nodos, brazos
  // de doble mano al sur (0), este (6), norte (12) y oeste (18)
  const nodos = [], aristas = [];
  for (let k = 0; k < 24; k++) { const a = -Math.PI / 2 + k * Math.PI / 12; nodos.push([200 * Math.cos(a), 200 * Math.sin(a)]); }
  for (let k = 0; k < 24; k++) aristas.push([k, (k + 1) % 24, false]);
  const sur = conCalle(nodos, aristas, 0, 0, -300);
  conCalle(nodos, aristas, 6, 300, 0);
  const norte = conCalle(nodos, aristas, 12, 0, 300);
  const oeste = conCalle(nodos, aristas, 18, -300, 0);
  const g = grafoChico(nodos, aristas);
  const ctx = (ids) => ({ ...rutaPor(nodos, ids), i: 1, iEnd: 1, ...g, bearingBetween: planarBearing });
  // la primera busqueda (700 m) no la ve; la segunda si
  assert.equal(oneWayRing(g.adjacency, g.nodeAt, 0, sur), null);
  const ids = (hasta, salida) => [sur, ...Array.from({ length: hasta + 1 }, (_, k) => k), salida];
  assert.equal(detectRoundabout(ctx(ids(12, norte))).exit, 2);
  assert.equal(detectRoundabout(ctx(ids(18, oeste))).exit, 3);
});

test('detectRoundabout: una curva con muchos vertices no corre el centro del anillo (Miles City, salida 139)', () => {
  const { detectRoundabout, ringOutline } = require('./pure.js');
  // anillo redondo de radio 29 y 12 nodos; del lado oeste el grafo trae la
  // curva con un vertice cada ~1 m, del este va recto de nodo a nodo (asi
  // venian las dos rotondas de Miles City, que daban 1,305 y no pasaban)
  const R = 29, N = 12, nodos = [], aristas = [];
  for (let k = 0; k < N; k++) { const a = -Math.PI / 2 + k * 2 * Math.PI / N; nodos.push([R * Math.cos(a), R * Math.sin(a)]); }
  for (let k = 0; k < N; k++) aristas.push([k, (k + 1) % N, false]);
  const edgeLine = (a, b) => {
    const a0 = -Math.PI / 2 + a * 2 * Math.PI / N;
    if (b !== (a + 1) % N || Math.cos(a0 + Math.PI / N) >= 0) return null;
    return Array.from({ length: 16 }, (_, t) => [R * Math.cos(a0 + 2 * Math.PI / N * t / 15), R * Math.sin(a0 + 2 * Math.PI / N * t / 15)]);
  };
  // los puntos del contorno quedan parejos, cada 5 m, tenga la curva los vertices que tenga
  const contorno = ringOutline([...Array(N).keys()], (k) => nodos[k], edgeLine);
  for (let k = 1; k < contorno.length; k++) {
    assert.ok(Math.abs(Math.hypot(contorno[k][0] - contorno[k - 1][0], contorno[k][1] - contorno[k - 1][1]) - 5) < 0.05);
  }
  const sur = conCalle(nodos, aristas, 0, 0, -300);
  conCalle(nodos, aristas, 3, 300, 0);
  const norte = conCalle(nodos, aristas, 6, 0, 300);
  conCalle(nodos, aristas, 9, -300, 0);
  const g = grafoChico(nodos, aristas);
  const r = detectRoundabout({ ...rutaPor(nodos, [sur, 0, 1, 2, 3, 4, 5, 6, norte]), i: 1, iEnd: 1, ...g, edgeLine, bearingBetween: planarBearing });
  assert.ok(r, 'la rotonda no se reconocio');
  assert.equal(r.exit, 2); // derecho: segunda salida
});

test('detectRoundabout: un tramo corto de calle dividida o una manzana de una mano no son rotondas', () => {
  const { detectRoundabout } = require('./pure.js');
  // calle que se divide: 0 -> (1 mano norte, 2 mano sur) -> 3, 120 m de largo y 10 de ancho
  let nodos = [[0, 0], [60, 5], [60, -5], [120, 0]], aristas = [[0, 1, false], [1, 3, false], [3, 2, false], [2, 0, false]];
  const oeste = conCalle(nodos, aristas, 0, -300, 0), este = conCalle(nodos, aristas, 3, 300, 0);
  let g = grafoChico(nodos, aristas);
  let base = { ...rutaPor(nodos, [oeste, 0, 1, 3, este]), i: 1, iEnd: 1, ...g, bearingBetween: planarBearing };
  assert.equal(detectRoundabout(base), null);
  // manzana cuadrada de 100 m con calles de una mano alrededor
  nodos = [[0, 0], [100, 0], [100, 100], [0, 100]]; aristas = [[0, 1, false], [1, 2, false], [2, 3, false], [3, 0, false]];
  const s = conCalle(nodos, aristas, 0, 0, -300); conCalle(nodos, aristas, 1, 300, 0); const n = conCalle(nodos, aristas, 2, 0, 300);
  g = grafoChico(nodos, aristas);
  base = { ...rutaPor(nodos, [s, 0, 1, 2, n]), i: 1, iEnd: 1, ...g, bearingBetween: planarBearing };
  assert.equal(detectRoundabout(base), null);
});

test('detectRoundabout: rotonda ovalada armada con calles, dos lados rectos y las puntas redondas (Colville, 23-10)', () => {
  const { detectRoundabout, ovalRing, ringOutline, roundish, longestStraightFrac, RING_MAX_STRAIGHT } = require('./pure.js');
  // como el ovalo de Colville (ATS, -81881,-63722): puntas de radio 27,5 y
  // lados rectos de 40 m, 253 m de vuelta, antihorario desde el sur. Nodos
  // cada 22,5 grados en las puntas: 0 sur, 4 abajo del lado este, 9 norte,
  // 13 arriba del lado oeste
  const punta = (cy, grados) => [27.5 * Math.cos(grados * Math.PI / 180), cy + 27.5 * Math.sin(grados * Math.PI / 180)];
  const anillo = [];
  for (let a = -90; a <= 0; a += 22.5) anillo.push(punta(-20, a));
  for (let a = 0; a <= 180; a += 22.5) anillo.push(punta(20, a));
  for (let a = 202.5; a < 270; a += 22.5) anillo.push(punta(-20, a));
  const armar = (conBrazos) => {
    const nodos = anillo.map(p => [...p]), aristas = nodos.map((_, k) => [k, (k + 1) % nodos.length, false]);
    const b = conBrazos(nodos, aristas);
    return { nodos, b, g: grafoChico(nodos, aristas) };
  };
  const { nodos, b, g } = armar((n, a) => ({ sur: conCalle(n, a, 0, 0, -300), este: conCalle(n, a, 4, 300, 0), norte: conCalle(n, a, 9, 0, 300), oeste: conCalle(n, a, 13, -300, 0) }));
  // la regla de siempre no la toma: alargada y con lados rectos
  const contorno = ringOutline([...anillo.keys()], g.nodeAt, null);
  assert.equal(roundish(contorno, 1.3) && longestStraightFrac(contorno) < RING_MAX_STRAIGHT, false);
  const ctx = (ids) => ({ ...rutaPor(nodos, ids), i: 1, iEnd: 1, ...g, bearingBetween: planarBearing });
  // del sur al oeste: tercera salida (este, norte, oeste), antihoraria
  const r = detectRoundabout(ctx([b.sur, ...Array.from({ length: 14 }, (_, k) => k), b.oeste]));
  assert.deepEqual([r.exit, r.ccw], [3, true]);
  assert.equal(detectRoundabout(ctx([b.sur, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, b.norte])).exit, 2);
  // con dos brazos (un lazo o la vuelta de una calle) no
  assert.equal(ovalRing(contorno, () => 2), false);
  assert.equal(ovalRing(contorno, () => 3), true);
  const dos = armar((n, a) => ({ sur: conCalle(n, a, 0, 0, -300), norte: conCalle(n, a, 9, 0, 300) }));
  assert.equal(detectRoundabout({ ...rutaPor(dos.nodos, [dos.b.sur, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, dos.b.norte]), i: 1, iEnd: 1, ...dos.g, bearingBetween: planarBearing }), null);
  // una manzana de calles de una mano del mismo tamano, con las esquinas
  // cortadas como en ATS: cuatro lados rectos, no
  const manzana = [[0, -35], [37, -35], [45, -27], [45, 27], [37, 35], [0, 35], [-37, 35], [-45, 27], [-45, -27], [-37, -35]];
  const am = manzana.map((_, k) => [k, (k + 1) % manzana.length, false]);
  const ms = conCalle(manzana, am, 0, 0, -300); conCalle(manzana, am, 2, 300, 0); conCalle(manzana, am, 5, 0, 300); const mo = conCalle(manzana, am, 7, -300, 0);
  const gm = grafoChico(manzana, am);
  assert.equal(ovalRing(ringOutline([...Array(10).keys()], gm.nodeAt, null), () => 4), false);
  assert.equal(detectRoundabout({ ...rutaPor(manzana, [ms, 0, 1, 2, 3, 4, 5, 6, 7, mo]), i: 1, iEnd: 1, ...gm, bearingBetween: planarBearing }), null);
});

test('detectRoundabout: rotonda compacta de un prefab, las salidas por el largo de su curva', () => {
  const { detectRoundabout } = require('./pure.js');
  // brazos a 25 m del centro: 0 sur (entrada), 1 este, 2 norte, 3 oeste; curvas antihorarias
  const nodos = [[0, -25], [25, 0], [0, 25], [-25, 0]];
  const arco = (desde, hasta) => { // de un brazo a otro por el anillo de radio 12, antihorario
    const a0 = Math.atan2(nodos[desde][1], nodos[desde][0]);
    let a1 = Math.atan2(nodos[hasta][1], nodos[hasta][0]);
    while (a1 <= a0) a1 += 2 * Math.PI;
    const line = [nodos[desde]];
    for (let a = a0; a <= a1 + 1e-9; a += Math.PI / 12) line.push([12 * Math.cos(a), 12 * Math.sin(a)]);
    line.push(nodos[hasta]);
    return line;
  };
  const largo = (l) => l.slice(1).reduce((s2, p, k) => s2 + Math.hypot(p[0] - l[k][0], p[1] - l[k][1]), 0);
  const aristas = [];
  const adjacency = new Map(), lineas = new Map();
  // los brazos se cargan en orden inverso: el orden de las salidas sale del largo de la curva
  for (let a = 0; a < 4; a++) for (let b = 3; b >= 0; b--) if (a !== b) {
    const l = arco(a, b);
    lineas.set(`${a},${b}`, l);
    if (!adjacency.has(a)) adjacency.set(a, []);
    adjacency.get(a).push([b, largo(l)]);
  }
  // calles de afuera
  const calle = (desde, dx, dy) => { const k = nodos.length; nodos.push([nodos[desde][0] + dx, nodos[desde][1] + dy]);
    adjacency.get(desde).push([k, 300]); adjacency.set(k, [[desde, 300]]); return k; };
  const sur = calle(0, 0, -300); calle(1, 300, 0); const norte = calle(2, 0, 300); const oeste = calle(3, -300, 0);
  const nodeAt = (k) => nodos[k];
  const edgeLine = (a, b) => lineas.get(`${a},${b}`) || [nodos[a], nodos[b]];
  const ctx = (ids) => ({ ...rutaPor(nodos, ids), i: 1, iEnd: 2, adjacency, nodeAt, edgeLine, bearingBetween: planarBearing });
  assert.equal(detectRoundabout(ctx([sur, 0, 2, norte])).exit, 2);
  assert.equal(detectRoundabout(ctx([sur, 0, 3, oeste])).exit, 3);
  // el mismo cruce con curvas derechas (una esquina comun): no
  const recta = (a, b) => [nodos[a], [0, 0], nodos[b]];
  assert.equal(detectRoundabout({ ...ctx([sur, 0, 2, norte]), edgeLine: recta }), null);
  assert.equal(detectRoundabout({ ...ctx([sur, 0, 3, oeste]), edgeLine: recta }), null);
});

test('voiceManeuverKey: rotonda hasta la octava salida, despues hacia que lado', () => {
  const { voiceManeuverKey } = require('./pure.js');
  assert.equal(voiceManeuverKey({ kind: 'roundabout', exit: 2, direction: 'left' }), 'roundabout_2');
  assert.equal(voiceManeuverKey({ kind: 'roundabout', exit: 7, direction: 'left' }), 'roundabout_7');
  assert.equal(voiceManeuverKey({ kind: 'roundabout', exit: 9, direction: 'left' }), 'turn_left');
  assert.equal(voiceManeuverKey({ kind: 'fork', direction: 'right' }), 'keep_right');
});

test('holdDetectedMods: el hueco sin lista de mods al rearrancar el juego no tira la variante', () => {
  const { holdDetectedMods } = require('./pure.js');
  const c2c = { c2c: true, promods_canada: false, canada_expansion: true };
  const antes = { ets2: null, ats: c2c };
  // Log del 10-10: el juego reescribe game.log.txt y ats vuelve a null 40 s.
  assert.deepEqual(holdDetectedMods(antes, { ets2: null, ats: null }), { ets2: null, ats: c2c });
  // Un perfil sin mods trae flags en false, no null: eso si cambia.
  const sinMods = { c2c: false, promods_canada: false, canada_expansion: false };
  assert.deepEqual(holdDetectedMods(antes, { ets2: null, ats: sinMods }), { ets2: null, ats: sinMods });
  // Sin deteccion previa sigue null (la web usa el selector manual).
  assert.deepEqual(holdDetectedMods(null, { ets2: null, ats: null }), { ets2: null, ats: null });
  assert.equal(holdDetectedMods(antes, null), null);
});

test('deliverySummary: pago, xp, distancia, tiempo, dano y lo pagado en el viaje', () => {
  const { deliverySummary, formatGameMinutes } = require('./pure.js');
  const s = deliverySummary({ jobDeliveredRevenue: 61158, jobEarnedXp: 812, jobDeliveredDistanceKm: 402, jobDeliveryTime: 205,
    jobCargoDamage: 0.034, jobSrc: 'Oxnard', jobDst: 'Los Angeles', jobCargo: 'Lumber' }, { fines: 250, tolls: 0 });
  assert.equal(s.route, 'Oxnard → Los Angeles');
  assert.equal(s.cargo, 'Lumber');
  assert.deepEqual(s.rows.map(r => r[0]), ['deliveredPay', 'deliveredXp', 'deliveredDistance', 'deliveredTime', 'cargoDamage', 'fines']);
  assert.ok(Math.abs(s.rows[4][2] - 3.4) < 1e-9);
  assert.equal(formatGameMinutes(205), '3 h 25 min');
  assert.equal(formatGameMinutes(45, 'Std.', 'Min.'), '45 Min.');
});

test('deliverySummary: un cliente viejo sin xp ni dano muestra igual el pago', () => {
  const { deliverySummary } = require('./pure.js');
  const s = deliverySummary({ jobDelivered: true });
  assert.deepEqual(s.rows, [['deliveredPay', 'money', 0]]);
  assert.equal(s.route, null);
  assert.equal(deliverySummary(null), null);
});

test('truckSizeSetting: de 1 a 3 en pasos de 0.25, lo raro vuelve al tamano normal', () => {
  const { truckSizeSetting } = require('./pure.js');
  assert.equal(truckSizeSetting(undefined), 1);
  assert.equal(truckSizeSetting('2.1'), 2);
  assert.equal(truckSizeSetting(5), 3);
  assert.equal(truckSizeSetting(0.2), 1);
  assert.equal(truckSizeSetting('x'), 1);
  assert.equal(truckSizeSetting(1.4), 1.5);
});

test('waypointEta: abajo del ETA del juego, horas de juego; abajo del real, tiempo real', () => {
  const { waypointEta } = require('./pure.js');
  // el waypoint sobre la ruta del juego: el mismo ETA que el juego, no el
  // tiempo real (antes "1h 30m" abajo de "17h 40m", Discord 13-10)
  let r = waypointEta({ viaKm: 1588.7, gameKm: 1588.7, gameEtaSeconds: 63600, avgSpeedKmh: 1200, timeScale: 20 });
  assert.equal(r.gameSeconds, 63600);
  assert.ok(Math.abs(r.realSeconds - 1588.7 / 1200 * 3600) < 1e-6);
  // un desvio de 100 km: el ETA del juego estirado al mismo ritmo
  r = waypointEta({ viaKm: 1100, gameKm: 1000, gameEtaSeconds: 40000, avgSpeedKmh: 1000, timeScale: 20 });
  assert.ok(Math.abs(r.gameSeconds - 44000) < 1e-6);
  assert.ok(Math.abs(r.realSeconds - 3960) < 1e-6);
  // el GPS del juego en el remolque (2 km contra 300): del ritmo real por la escala
  r = waypointEta({ viaKm: 300, gameKm: 2, gameEtaSeconds: 600, avgSpeedKmh: 1000, timeScale: 20 });
  assert.ok(Math.abs(r.gameSeconds - 300 / 1000 * 3600 * 20) < 1e-6);
  // sin ritmo medido todavia: el del juego sale igual, el real no
  r = waypointEta({ viaKm: 500, gameKm: 400, gameEtaSeconds: 20000, avgSpeedKmh: null, timeScale: 20 });
  assert.equal(r.gameSeconds, 25000);
  assert.equal(r.realSeconds, null);
  // sin GPS del juego ni ritmo, o sin distancia: nada
  assert.deepEqual(waypointEta({ viaKm: 500, gameKm: 0, gameEtaSeconds: 0, avgSpeedKmh: null, timeScale: 20 }), { gameSeconds: null, realSeconds: null });
  assert.deepEqual(waypointEta({ viaKm: null, gameKm: 400, gameEtaSeconds: 20000, avgSpeedKmh: 1000, timeScale: 20 }), { gameSeconds: null, realSeconds: null });
});

test('waypointEta: el real sale del ETA real, no del ritmo medido en la ciudad (16-10)', () => {
  const { waypointEta } = require('./pure.js');
  // Saliendo de Sioux Falls: el juego 224,6 mi y 4h 1m, el ETA real 0h 15m,
  // nuestra ruta por el waypoint 233,9 mi. El ritmo, medido adentro de la
  // ciudad a 1:3, 65,6 km/h: con el daba 5h 44m.
  const MI = 1.609344;
  const r = waypointEta({ viaKm: 233.9 * MI, gameKm: 224.6 * MI, gameEtaSeconds: 14460, realEtaSeconds: 900,
    avgSpeedKmh: 65.6, timeScale: 20 });
  assert.ok(Math.abs(r.realSeconds - 900 * 233.9 / 224.6) < 1e-6);
  assert.ok(r.realSeconds < 1000);
  assert.ok(Math.abs(r.gameSeconds - 14460 * 233.9 / 224.6) < 1e-6);
  // sin ETA real todavia: del ritmo, como antes
  const sinReal = waypointEta({ viaKm: 1100, gameKm: 1000, gameEtaSeconds: 40000, realEtaSeconds: null, avgSpeedKmh: 1000, timeScale: 20 });
  assert.ok(Math.abs(sinReal.realSeconds - 3960) < 1e-6);
  // el GPS del juego en el remolque: su ETA real tampoco sirve, del ritmo
  const remolque = waypointEta({ viaKm: 300, gameKm: 2, gameEtaSeconds: 600, realEtaSeconds: 30, avgSpeedKmh: 1000, timeScale: 20 });
  assert.ok(Math.abs(remolque.realSeconds - 1080) < 1e-6);
  assert.ok(Math.abs(remolque.gameSeconds - 1080 * 20) < 1e-6);
  // sin GPS del juego (ruta solo de waypoints, sin destino en el juego): del ritmo
  const sinJuego = waypointEta({ viaKm: 50, gameKm: 0, gameEtaSeconds: 0, realEtaSeconds: null, avgSpeedKmh: 1000, timeScale: 20 });
  assert.ok(Math.abs(sinJuego.realSeconds - 180) < 1e-6);
});

test('waypointLegMeters: desde el camion hasta el final del tramo de cada waypoint', () => {
  const { waypointLegMeters } = require('./pure.js');
  // El camion en (0, 0); el tramo 0 llega al waypoint 1 en (300, 400), el 1
  // al waypoint 2 en (300, 1400) y el 2 al destino del trabajo en (1300, 1400).
  const ruta = [[0, 0, 0, 0, null, 0], [300, 400, 0, 0, null, 0],
    [300, 900, 0, 0, null, 1], [300, 1400, 0, 0, null, 1], [1300, 1400, 0, 0, null, 2]];
  assert.deepEqual(waypointLegMeters(ruta, 2), { legs: [500, 1500], total: 2500 });
  // sin trabajo el ultimo waypoint es el destino: su tramo es la ruta entera
  assert.deepEqual(waypointLegMeters(ruta.slice(0, 4), 2), { legs: [500, 1500], total: 1500 });
  // el camion ya paso el waypoint 1 y todavia no se saco: 0, no null
  const pasado = [[300, 600, 0, 0, null, 1], [300, 900, 0, 0, null, 1], [300, 1400, 0, 0, null, 1]];
  assert.deepEqual(waypointLegMeters(pasado, 2), { legs: [0, 800], total: 800 });
  // un tramo que no esta en la ruta, o sin ruta: null
  assert.deepEqual(waypointLegMeters(ruta.slice(0, 2), 2), { legs: [500, null], total: 500 });
  assert.deepEqual(waypointLegMeters(null, 2), { legs: [null, null], total: null });
});

test('waypointLegEtas: el juego por los km del juego, el real por los metros manejados (Discord, 17-10)', () => {
  const { waypointLegEtas, waypointEta } = require('./pure.js');
  // Saliendo de la ciudad: hasta el waypoint 1 hay 2 km de mundo, 1 adentro
  // de la ciudad (1:3) y 1 afuera (1:20), 23 km del juego. Despues 48 km de
  // mundo de ruta hasta el destino: 50 km de mundo y 983 km del juego.
  const total = { worldM: 50000, km: 983 };
  const eta = waypointEta({ viaKm: 983, gameKm: 960, gameEtaSeconds: 40000, realEtaSeconds: 2400, avgSpeedKmh: 1000, timeScale: 20 });
  const [uno, dos] = waypointLegEtas([{ worldM: 2000, km: 23 }, { worldM: 50000, km: 983 }], total, eta);
  assert.equal(uno.km, 23);
  assert.ok(Math.abs(uno.gameSeconds - eta.gameSeconds * 23 / 983) < 1e-6);
  // el real por los metros de mundo: por los km del juego daria la mitad
  assert.ok(Math.abs(uno.realSeconds - eta.realSeconds * 2000 / 50000) < 1e-6);
  assert.ok(uno.realSeconds > eta.realSeconds * 23 / 983 * 1.5);
  // el ultimo waypoint (el destino, sin trabajo) da lo mismo que la fila "via waypoint"
  assert.ok(Math.abs(dos.gameSeconds - eta.gameSeconds) < 1e-6);
  assert.ok(Math.abs(dos.realSeconds - eta.realSeconds) < 1e-6);
  // sin ETA real todavia: el del juego sale igual, el real no
  const [sinReal] = waypointLegEtas([{ worldM: 2000, km: 23 }], total, { gameSeconds: 40000, realSeconds: null });
  assert.equal(sinReal.realSeconds, null);
  assert.ok(sinReal.gameSeconds > 0);
  // un tramo que no se sabe, o una ruta de largo 0 (ya en el destino)
  assert.deepEqual(waypointLegEtas([null], total, eta), [null]);
  assert.deepEqual(waypointLegEtas([{ worldM: 0, km: 0 }], { worldM: 0, km: 0 }, { gameSeconds: 0, realSeconds: 0 }),
    [{ km: 0, gameSeconds: 0, realSeconds: 0 }]);
});

test('createCityScale: adentro de las cajas de ciudad el juego va a 1:3', () => {
  const { createCityScale, CITY_SCALE, waypointEta } = require('./pure.js');
  assert.equal(CITY_SCALE, 3);
  // Una ciudad de 2 km x 2 km con la esquina en (0, 0), y otra caja chica
  // que cruza el borde de una celda de la grilla.
  const escala = createCityScale([[0, 0, 2000, 2000], [2950, 950, 100, 100]], { outside: 20, margin: 0 });
  assert.equal(escala.at(1000, 1000), 3);
  assert.equal(escala.at(2000, 2000), 3);   // el borde es ciudad
  assert.equal(escala.at(2001, 1000), 20);
  assert.equal(escala.at(-1, 1000), 20);
  assert.equal(escala.at(3020, 1020), 3);   // la chica, del otro lado de la celda
  // Rockford (Discord, 14-10): 2 km de calles adentro de la ciudad. A 1:20
  // eran 40 km (24,9 mi) contra los 4,0 mi del juego; a 1:3, 6 km.
  const calles = [[100, 1900], [100, 1100], [600, 400], [1300, 300], [1400, 380]];
  const mundo = calles.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - calles[i][0], p[1] - calles[i][1]), 0);
  assert.ok(Math.abs(escala.pathMeters(calles) - mundo * 3) < 1e-6);
  // y con el km corregido, la fila "via waypoint" sigue al ETA del juego
  // (antes caia al ritmo real porque 4 mi < 25 % de 25,5 mi)
  const viaKm = escala.pathMeters(calles) / 1000;
  const eta = waypointEta({ viaKm, gameKm: viaKm * 1.02, gameEtaSeconds: 1200, avgSpeedKmh: 30, timeScale: 3 });
  assert.ok(Math.abs(eta.gameSeconds - 1200 / 1.02) < 1e-6);
  // Una recta de la ruta que entra a la ciudad: cada parte a su escala, no
  // toda del lado de su punto medio. 1000 m afuera y 500 adentro.
  assert.ok(Math.abs(escala.pathMeters([[-1000, 1000], [500, 1000]]) - (1000 * 20 + 500 * 3)) < 1e-6);
  // Hasta un tope de metros de mundo (la distancia al proximo giro): corta
  // el tramo a la mitad si hace falta.
  assert.ok(Math.abs(escala.pathMeters([[100, 100], [100, 600], [100, 1600]], 800) - 800 * 3) < 1e-6);
  assert.ok(Math.abs(escala.pathMeters([[2100, 0], [2100, 300], [2100, 1300]], 800) - 800 * 20) < 1e-6);
  // Sin areas (POIs de antes, o bajando todavia): todo a la escala de la
  // ruta, como antes.
  const sinAreas = createCityScale(null, { outside: 19 });
  assert.equal(sinAreas.at(1000, 1000), 19);
  assert.ok(Math.abs(sinAreas.pathMeters(calles) - mundo * 19) < 1e-6);
  assert.equal(sinAreas.pathMeters(null), 0);
  assert.equal(sinAreas.pathMeters([[0, 0]]), 0);
  // Filas raras (lado en 0, cortas) no rompen nada ni hacen ciudad.
  assert.equal(createCityScale([[0, 0, 0, 100], [5, 5], null], { outside: 20 }).at(0, 50), 20);
});

test('createCityScale: con gapM, un hueco corto entre dos cajas de la misma ciudad es ciudad', () => {
  const { createCityScale, CITY_GAP_M } = require('./pure.js');
  assert.equal(CITY_GAP_M, 0); // apagado desde el 17-10 (Sidney NE): ver el test de las cajas con margen
  // Rockford (Discord, 14-10): de la caja del oeste (hasta x = 27389) a la
  // del este (desde x = 27654) hay 265 m de calle sin caja, y el GPS del
  // juego decia 4,0 mi: todo a 1:3. Con el hueco a 1:20 serian 6,6.
  const escala = createCityScale([[26841, -20470, 548, 1319], [27654, -19953, 578, 855]], { outside: 20, gapM: 500, margin: 0 });
  const cruce = [[27000, -19940], [27389, -19940], [27654, -19940], [28000, -19940]];
  assert.ok(Math.abs(escala.pathMeters(cruce) - 1000 * 3) < 1e-6);
  // Hasta el proximo giro, adentro del hueco: el hueco ya cuenta como ciudad
  // aunque el tope corte antes de la otra caja.
  assert.ok(Math.abs(escala.pathMeters(cruce, 500) - 500 * 3) < 1e-6);
  // Un hueco largo (otra ciudad, o la ruta entre dos barrios lejos) no.
  const lejos = createCityScale([[0, 0, 1000, 1000], [1800, 0, 1000, 1000]], { outside: 20, gapM: 500, margin: 0 });
  assert.ok(Math.abs(lejos.pathMeters([[500, 500], [2300, 500]]) - (500 * 3 + 800 * 20 + 500 * 3)) < 1e-6);
  // Las puntas no se rellenan: salir de la ciudad sigue a 1:20 desde la caja,
  // y arrancar afuera tambien.
  assert.ok(Math.abs(lejos.pathMeters([[500, 500], [1300, 500]]) - (500 * 3 + 300 * 20)) < 1e-6);
  assert.ok(Math.abs(lejos.pathMeters([[-200, 500], [500, 500]]) - (200 * 20 + 500 * 3)) < 1e-6);
});

test('createCityScale: las cajas cuentan 30 m mas de cada lado y los huecos van a 1:20 (Sidney NE, 17-10)', () => {
  const { createCityScale, CITY_MARGIN_M } = require('./pure.js');
  assert.equal(CITY_MARGIN_M, 30);
  // Gargamosch midio el GPS del juego a EliMax en tres puntos de la US-385
  // (7, 5 y 2 mi). Con los huecos de 150, 210 y 200 m entre cajas rellenos
  // a 1:3 la app decia 3,1, 1,9 y 0,8; asi da 7,1, 4,9 y 2,1.
  const escala = createCityScale([[0, 0, 100, 100], [300, 0, 100, 100]], { outside: 20, step: 1 });
  assert.equal(escala.at(129, 50), 3);
  assert.equal(escala.at(131, 50), 20);
  assert.equal(escala.at(-29, 50), 3);
  assert.equal(escala.at(50, 131), 20);
  // de una caja a la otra: 80 m de ciudad, 140 m del hueco a 1:20, 80 de ciudad
  assert.ok(Math.abs(escala.pathMeters([[50, 50], [350, 50]]) - (160 * 3 + 140 * 20)) < 1e-6);
  // dos cajas a menos de 60 m quedan pegadas
  const pegadas = createCityScale([[0, 0, 100, 100], [150, 0, 100, 100]], { outside: 20, step: 1 });
  assert.ok(Math.abs(pegadas.pathMeters([[50, 50], [200, 50]]) - 150 * 3) < 1e-6);
});

test('createCityScale: el primer tramo de la ruta recortada se mide cada vez', () => {
  const { createCityScale } = require('./pure.js');
  const escala = createCityScale([[0, 0, 1000, 1000]], { outside: 20, margin: 0 });
  // Un tramo largo que sale de la ciudad: 500 m adentro, 500 afuera.
  const fin = [1500, 500];
  const ruta = [[0, 500], [500, 500], fin];
  assert.ok(Math.abs(escala.pathMeters(ruta) - (500 * 3 + 500 * 3 + 500 * 20)) < 1e-6);
  // El camion ya salio de la ciudad: la ruta recortada arranca en (1200,
  // 500) y el primer tramo, el mismo punto final, ya es todo de afuera.
  assert.ok(Math.abs(escala.pathMeters([[1200, 500], fin]) - 300 * 20) < 1e-6);
});

test('useOwnRemaining: el GPS del juego apuntando al remolque no cuenta como llegada', () => {
  const { useOwnRemaining } = require('./pure.js');
  assert.equal(useOwnRemaining(0.1, 820), true);   // freight market: el juego va al remolque
  assert.equal(useOwnRemaining(0, 50), true);      // el juego sin ruta todavia
  assert.equal(useOwnRemaining(780, 820), false);  // las dos parecidas: manda el juego
  assert.equal(useOwnRemaining(0.3, 0.5), false);  // cerca del destino
  assert.equal(useOwnRemaining(5, null), false);   // sin ruta nuestra
});

test('foldText: buscar sin tildes encuentra las ciudades con tildes', () => {
  const { foldText } = require('./pure.js');
  assert.equal(foldText('Kraków'), 'krakow');
  assert.equal(foldText('Zürich'), 'zurich');
  assert.equal(foldText('Wrocław'), 'wroclaw');
  assert.equal(foldText('Târgu Mureș'), 'targu mures');
  assert.equal(foldText('Strzelce Krajeńskie'), 'strzelce krajenskie');
  assert.equal(foldText('Tromsø'), 'tromso');
  assert.equal(foldText(null), '');
});

test('createMissingCompanyWatch: reporta la empresa que falta donde se carga y donde se entrega', () => {
  const { createMissingCompanyWatch } = require('./pure.js');
  const conocidas = new Set(['eddys|gulfport']);
  const known = (token, _name, city) => conocidas.has(`${token}|${city}`);
  const w = createMissingCompanyWatch();
  const job = { onJob: true, jobMarket: 'cargo_market', companySrcId: 'homburg', companySrc: 'Homburg Freight', citySrcId: 'gulfport', citySrc: 'Gulfport',
                companyDstId: 'nuevo_dst', companyDst: 'Nueva', cityDstId: 'meridian', cityDst: 'Meridian' };
  assert.deepEqual(w.tick({ ...job, isCargoLoaded: false }, { x: 10, z: 20 }, known), []);
  const carga = w.tick({ ...job, isCargoLoaded: true }, { x: 11.4, z: 20.6 }, known);
  assert.deepEqual(carga, [{ kind: 'pickup', company: 'homburg', companyName: 'Homburg Freight', city: 'gulfport', cityName: 'Gulfport', x: 11, z: 21 }]);
  w.tick({ ...job, isCargoLoaded: true }, { x: 500, z: 600 }, known);
  // el pulso de entrega llega con el trabajo ya borrado
  const entrega = w.tick({ onJob: false, event: { jobDelivered: true } }, { x: 900, z: 950 }, known);
  assert.deepEqual(entrega, [{ kind: 'dest', company: 'nuevo_dst', companyName: 'Nueva', city: 'meridian', cityName: 'Meridian', x: 900, z: 950 }]);
  // el mismo pulso en el tick siguiente no repite
  assert.deepEqual(w.tick({ onJob: false, event: { jobDelivered: true } }, { x: 900, z: 950 }, known), []);
});

test('createMissingCompanyWatch: freight market al enganchar, empresas conocidas y repetidas no', () => {
  const { createMissingCompanyWatch } = require('./pure.js');
  const known = (token) => token === 'eddys';
  const w = createMissingCompanyWatch();
  const job = { onJob: true, jobMarket: 'freight_market', isCargoLoaded: true, companySrcId: 'homburg', citySrcId: 'gulfport', companyDstId: 'eddys', cityDstId: 'gulfport' };
  w.tick({ ...job, trailerAttached: false }, { x: 1, z: 2 }, known);
  assert.equal(w.tick({ ...job, trailerAttached: true }, { x: 3, z: 4 }, known)[0].kind, 'pickup');
  // destino conocido: nada
  assert.deepEqual(w.tick({ onJob: false, event: { jobDelivered: true } }, { x: 5, z: 6 }, known), []);
  // en cargo market enganchar un remolque propio no es cargar
  const w2 = createMissingCompanyWatch();
  const propio = { ...job, jobMarket: 'cargo_market', isCargoLoaded: false };
  w2.tick({ ...propio, trailerAttached: false }, { x: 1, z: 2 }, known);
  assert.deepEqual(w2.tick({ ...propio, trailerAttached: true }, { x: 3, z: 4 }, known), []);
  // otra vez la misma empresa: una sola vez por pagina
  w.tick({ ...job, trailerAttached: false }, { x: 1, z: 2 }, known);
  assert.deepEqual(w.tick({ ...job, trailerAttached: true }, { x: 3, z: 4 }, known), []);
});

test('ajustes: una pestana solo escribe lo que cambio ella (no pisa lo de otra)', () => {
  const base = { truckSize: 1, useImperial: false, btnLayout: { panels: { a: { x: 1 } } } };
  // nada cambio: no escribe nada
  assert.deepEqual(settingsChangedKeys(base, JSON.parse(JSON.stringify(base))), []);
  // cambio las unidades: solo esa clave, aunque otra pestana haya cambiado truckSize en el guardado
  assert.deepEqual(settingsChangedKeys(base, { ...base, useImperial: true }), ['useImperial']);
  // objetos mutados en el lugar se comparan por contenido
  assert.deepEqual(settingsChangedKeys(base, { ...base, btnLayout: { panels: { a: { x: 2 } } } }), ['btnLayout']);
  // sin base (todavia cargando): todo, como antes
  assert.deepEqual(settingsChangedKeys(null, { truckSize: 2, useImperial: true }), ['truckSize', 'useImperial']);
});

test('poiRelative: adelante, atras y al costado segun el rumbo del juego', () => {
  // rumbo 0 = norte = z negativo
  assert.equal(poiRelative(0, 0, 0, 0, -500).side, 'ahead');
  assert.equal(poiRelative(0, 0, 0, 0, 500).side, 'behind');
  assert.equal(poiRelative(0, 0, 0, 500, 0).side, 'side');
  assert.ok(Math.abs(poiRelative(0, 0, 0, 500, 0).rel - 90) < 1e-9); // al este = derecha
  // yendo al este (90), algo al este esta adelante y al oeste atras
  assert.equal(poiRelative(0, 0, 90, 800, 50).side, 'ahead');
  assert.equal(poiRelative(0, 0, 90, -800, 0).side, 'behind');
  assert.equal(poiRelative(0, 0, null, 0, -500), null); // cliente viejo sin rumbo
});

test('pickFuelStop: la de la ruta antes que la mas cercana de atras (Discord, 10-10)', () => {
  // camion en (0,0) yendo al norte; la mas cercana esta 300 m atras
  const stations = [{ x: 0, z: 300, dist: 300 }, { x: 150, z: -2000, dist: 2006 }, { x: 3000, z: -1000, dist: 3162 }];
  const route = [[0, 0], [0, -5000]];
  const conRuta = pickFuelStop(stations, 0, 0, 0, route);
  assert.deepEqual([conRuta.x, conRuta.z, conRuta.why], [150, -2000, 'route']);
  // sin ruta: la mas cercana adelante
  const sinRuta = pickFuelStop(stations, 0, 0, 0, null);
  assert.deepEqual([sinRuta.x, sinRuta.why], [150, 'ahead']);
  // sin rumbo ni ruta: la mas cercana, como antes
  assert.equal(pickFuelStop(stations, 0, 0, null, null).why, 'nearest');
  assert.equal(pickFuelStop([], 0, 0, 0, route), null);
  // una sobre la ruta pero muy lejos no gana a una cercana al costado adelante
  const lejos = [{ x: 600, z: -800, dist: 1000 }, { x: 0, z: -40000, dist: 40000 }];
  const elegida = pickFuelStop(lejos, 0, 0, 0, [[0, 0], [0, -50000]]);
  assert.deepEqual([elegida.x, elegida.why], [600, 'ahead']);
});

test('stopsAlongRoute: ordena por lo que hay que andar, no por la recta', () => {
  // ruta en L: norte 1000 y despues este; una estacion cerca en recta pero al final
  const route = [[0, 0], [0, -1000], [3000, -1000]];
  const st = stopsAlongRoute(route, [{ x: 2900, z: -1100 }, { x: 100, z: -500 }, { x: 5000, z: 5000 }]);
  assert.deepEqual(st.map(s => s.x), [100, 2900]); // la lejana del recorrido queda fuera
});

test('pickFuelStop: el area de descanso de la otra mano o ya pasada no gana a la de adelante (Grand Island, Discord 19-10)', () => {
  // Camion en (0,0) yendo al este; el primer tramo es corto (hasta el
  // proximo punto de la curva). Un area 200 m atras y 100 m al costado: por
  // la linea queda "sobre la ruta" a 30 m, pero el camino da la vuelta.
  const route = [[0, 0], [30, 0], [5000, 0]];
  const atras = { x: -200, z: 100, dist: 224 };
  const salida = { x: 3000, z: 150, dist: 3004 };
  assert.equal(pickFuelStop([atras, salida], 0, 0, 90, route).x, -200); // sin el camino
  const reach = (st) => ({ [-200]: 2800, 600: 3000, 3000: 3200 })[st.x];
  const sinVolver = pickFuelStop([atras, salida], 0, 0, 90, route, 3, 1500, { reach });
  assert.deepEqual([sinVolver.x, sinVolver.why], [3000, 'route']);
  // Una a 600 m adelante pero de la otra mano (el camino da la vuelta en la
  // salida siguiente: 3 km) y otra a 3 km, en la salida
  const otraMano = { x: 600, z: 100, dist: 608 };
  const stations = [atras, otraMano, salida];
  assert.equal(pickFuelStop([otraMano, salida], 0, 0, 90, route).x, 600); // sin el camino, la de la otra mano
  const elegida = pickFuelStop(stations, 0, 0, 90, route, 3, 1500, { reach });
  assert.deepEqual([elegida.x, elegida.why], [3000, 'route']);
  // Sin ruta no hay a donde volver: gana la de menos camino aunque haya que
  // dar la vuelta (3000 m contra 3200)
  const soloAdelante = pickFuelStop([otraMano, salida], 0, 0, 90, null, 3, 1500, { reach });
  assert.deepEqual([soloAdelante.x, soloAdelante.why], [600, 'ahead']);
  // La de la otra mano no da el tope: con ella, la de la salida (a 3500 m,
  // pasado 608 * 3 + 1500) quedaba afuera
  const lejana = { x: 3500, z: 150, dist: 3503 };
  const conTope = pickFuelStop([otraMano, lejana], 0, 0, 90, route, 3, 1500, { reach: (st) => ({ 600: 3000, 3500: 3600 })[st.x] });
  assert.deepEqual([conTope.x, conTope.why], [3500, 'route']);
  // Pero si la otra queda tan lejos que ir y volver por la vuelta sale menos,
  // la de la vuelta (2 * 3000 - 600 contra 2 * 6200 - 6000)
  const muyLejos = { x: 6000, z: 150, dist: 6002 };
  const conVuelta = pickFuelStop([otraMano, muyLejos], 0, 0, 90, [[0, 0], [30, 0], [9000, 0]], 3, 1500, { reach: (st) => ({ 600: 3000, 6000: 6200 })[st.x] });
  assert.equal(conVuelta.x, 600);
  // Sin camino a ninguna, la de siempre
  const sinCamino = pickFuelStop([otraMano, salida], 0, 0, 90, route, 3, 1500, { reach: () => null });
  assert.deepEqual([sinCamino.x, sinCamino.why], [600, 'route']);
});

test('pickFuelStop: con el camino, la de al costado le gana a la de adelante lejos (Austin, ATS)', () => {
  // Camion en (0,0) yendo al este, ruta que dobla al norte enseguida. Una
  // estacion a 550 m al sur (al costado, fuera de la ruta: 750 m por el
  // camino) y otra 3,6 km adelante (5,2 km por el camino). Por el rumbo
  // ganaba la de adelante.
  const route = [[0, 0], [200, 0], [200, -6000]];
  const costado = { x: 100, z: 540, dist: 549 };
  const adelante = { x: 3600, z: -300, dist: 3612 };
  const camino = { 100: 750, 3600: 5200 };
  const reach = (st) => camino[st.x];
  assert.equal(pickFuelStop([costado, adelante], 0, 0, 90, route).x, 3600); // sin el camino
  const elegida = pickFuelStop([costado, adelante], 0, 0, 90, route, 3, 1500, { reach });
  assert.deepEqual([elegida.x, elegida.why], [100, 'near']);
  // Si la de al costado obliga a dar la vuelta (camino de 3 km), queda la de adelante
  camino[100] = 3000;
  assert.equal(pickFuelStop([costado, adelante], 0, 0, 90, route, 3, 1500, { reach }).x, 3600);
  // Y por poco no se cambia (switchM): 3600 contra 4500 de costo
  camino[100] = 1800; camino[3600] = 2250;
  assert.equal(pickFuelStop([costado, adelante], 0, 0, 90, route, 3, 1500, { reach }).x, 3600);
});

test('pickFuelStop: entre dos sobre la ruta, la de la mano propia aunque la otra quede mas cerca de la linea (George West, Discord 25-10)', () => {
  // Camion en (0,0) yendo al este por la autopista. Las dos areas quedan
  // "sobre la ruta": la de la otra mano a 166 m de la linea, la de la derecha
  // a 230. Por el camino, la de la otra mano es salir, cruzar el puente y
  // volver (779 m mas que lo que se avanza) y la de la derecha, 388.
  const route = [[0, 0], [30, 0], [5000, 0]];
  const otraMano = { x: 1769, z: -166, dist: 1777 };
  const derecha = { x: 1909, z: 230, dist: 1923 };
  const reach = (st) => ({ 1769: 2548, 1909: 2297 })[st.x];
  assert.equal(pickFuelStop([otraMano, derecha], 0, 0, 90, route).x, 1769); // sin el camino
  // 2 * 2297 - 1909 = 2685 contra 2 * 2548 - 1769 = 3327: 642 menos
  const elegida = pickFuelStop([otraMano, derecha], 0, 0, 90, route, 3, 1500, { reach });
  assert.deepEqual([elegida.x, elegida.why], [1909, 'route']);
  // Con el margen de siempre (1 km) se quedaba la de la otra mano
  assert.equal(pickFuelStop([otraMano, derecha], 0, 0, 90, route, 3, 1500, { reach, switchRouteM: 1000 }).x, 1769);
  // Por menos de switchRouteM no se cambia
  assert.equal(pickFuelStop([otraMano, derecha], 0, 0, 90, route, 3, 1500, { reach: (st) => ({ 1769: 2548, 1909: 2550 })[st.x] }).x, 1769);
});

test('pickFuelStop: el descanso, una que se alcance antes de que se acabe (Discord 22-10)', () => {
  // Camion en (0,0) yendo al este por la ruta. Un area sobre la ruta a 6 km
  // (6,1 por el camino) y otra al costado a 2,8 km (3,3 por el camino). Sin
  // tope gana la de la ruta: ir al costado y volver cuesta mas.
  const route = [[0, 0], [20000, 0]];
  const sobre = { x: 6000, z: -50, dist: 6000 };
  const costado = { x: 2000, z: 2000, dist: 2828 };
  const camino = { 6000: 6100, 2000: 3300 };
  const reach = (st) => camino[st.x];
  const elegir = (maxReachM) => pickFuelStop([costado, sobre], 0, 0, 90, route, 3, 1500, { reach, maxReachM }).x;
  assert.equal(elegir(Infinity), 6000);
  assert.equal(elegir(7000), 6000);  // se llega a la de la ruta
  assert.equal(elegir(5000), 2000);  // no se llega: la que si
  assert.equal(elegir(2000), 2000);  // ninguna: la mas cercana por el camino
  // Sin el camino no hay tope que mirar
  assert.equal(pickFuelStop([costado, sobre], 0, 0, 90, route, 3, 1500, { maxReachM: 2000 }).x, 6000);
  // Entre las que se alcanzan, primero las que no obligan a volver
  const vuelta = { x: 1000, z: 300, dist: 1044 };
  camino[1000] = 4000; // 4 km por el camino para 1 km de recta: dar la vuelta
  assert.equal(pickFuelStop([vuelta, costado, sobre], 0, 0, 90, route, 3, 1500, { reach, maxReachM: 5000 }).x, 2000);
});

test('restReachMeters: los metros de mundo hasta el descanso a 70 km/h', () => {
  const { restReachMeters, REST_REACH_KMH } = require('./pure.js');
  assert.equal(REST_REACH_KMH, 70);
  assert.equal(Math.round(restReachMeters(150, 20)), 8750); // ATS, en la ruta
  assert.equal(Math.round(restReachMeters(90, 3)), 35000);  // en la ciudad el reloj va mas lento
  assert.equal(restReachMeters(null, 20), Infinity);
  assert.equal(restReachMeters(90, 0), Infinity);
});

test('stopInsertIndex: la parada nueva va primero, no despues del destino (Discord, 13-10)', () => {
  const { stopInsertIndex } = require('./pure.js');
  // Sin trabajo, yendo a un pueblo (waypoint 0) 20 km al norte: un solo tramo
  const alPueblo = [[0, 0, 0, 0, null, 0], [0, -10000, 0, 0, null, 0], [0, -20000, 0, 0, null, 0]];
  // la estacion sobre la ruta, o a un costado: antes del pueblo, no despues
  assert.equal(stopInsertIndex(alPueblo, { x: 150, z: -4000 }, 1), 0);
  assert.equal(stopInsertIndex(alPueblo, { x: 5000, z: -4000 }, 1), 0);
  // la de atras tampoco se manda al final
  assert.equal(stopInsertIndex(alPueblo, { x: 0, z: 300 }, 1), 0);
  // Pueblo A (waypoint 0) a 2 km y despues B (waypoint 1); la estacion queda
  // pasando A: entra entre A y B, sin pasar A de largo e ir a buscarlo despues
  const aYb = [[0, 0, 0, 0, null, 0], [0, -2000, 0, 0, null, 0], [0, -8000, 0, 0, null, 1], [0, -20000, 0, 0, null, 1]];
  assert.equal(stopInsertIndex(aYb, { x: 100, z: -6000 }, 2), 1);
  assert.equal(stopInsertIndex(aYb, { x: 100, z: -1000 }, 2), 0);
  // Con trabajo: un waypoint propio y despues el destino del trabajo (tramo 1).
  // La estacion pasando el waypoint va al final de la lista, antes del destino.
  assert.equal(stopInsertIndex(aYb, { x: 100, z: -15000 }, 1), 1);
  // Sin waypoints, sin ruta o con una parada sin posicion: primero
  assert.equal(stopInsertIndex(aYb, { x: 100, z: -6000 }, 0), 0);
  assert.equal(stopInsertIndex(null, { x: 100, z: -6000 }, 2), 0);
  assert.equal(stopInsertIndex(aYb, { x: NaN, z: 0 }, 2), 0);
  // Ruta sin tramos (vieja) o con mas tramos que waypoints: nunca fuera de la lista
  assert.equal(stopInsertIndex([[0, 0], [0, -20000]], { x: 100, z: -6000 }, 2), 0);
  assert.equal(stopInsertIndex([[0, 0, 0, 0, null, 4], [0, -20000, 0, 0, null, 4]], { x: 100, z: -6000 }, 2), 2);
});

test('createRefuelWatch: una vez por carga, no por el ruido ni por gastar', () => {
  const w = createRefuelWatch();
  assert.equal(w.push(300, 1000), false);
  assert.equal(w.push(250, 1000), false); // gastar
  assert.equal(w.push(260, 1000), false); // 10 l: menos que el 8 % de 1000
  assert.equal(w.push(340, 1000), true);  // cargo 90 l
  assert.equal(w.push(400, 1000), false); // la misma carga sigue: no avisa dos veces
  assert.equal(w.push(Number.NaN, 1000), false);
});

test('ciudades repetidas: el estado si los POIs lo traen, si no la ciudad cercana (Discord, 11-10: tres Jackson)', () => {
  const { regionLabel, cityChoiceLabels, citiesMatchingInput } = require('./pure.js');
  const names = { jackson: 'Jackson', jackson_ms: 'Jackson', jackson_tn: 'Jackson', casper: 'Casper', memphis: 'Memphis', vicksburg: 'Vicksburg' };
  const xy = { jackson: [0, 0], jackson_ms: [1000, 1000], jackson_tn: [2000, 0], casper: [50, 50], memphis: [1900, 50], vicksburg: [950, 950] };
  const conEstado = cityChoiceLabels(names, { countries: { jackson: 'wyoming', jackson_ms: 'mississippi', jackson_tn: 'tennessee' } });
  assert.deepEqual([conEstado.jackson, conEstado.jackson_ms, conEstado.jackson_tn], ['Jackson, WY', 'Jackson, MS', 'Jackson, TN']);
  assert.equal(conEstado.casper, 'Casper'); // las de nombre unico, como siempre
  // POIs publicados antes del cambio: sin estado, la ciudad unica mas cercana
  const sinEstado = cityChoiceLabels(names, { coords: (t) => xy[t], near: (c) => `cerca de ${c}` });
  assert.deepEqual([sinEstado.jackson, sinEstado.jackson_ms, sinEstado.jackson_tn],
    ['Jackson (cerca de Casper)', 'Jackson (cerca de Vicksburg)', 'Jackson (cerca de Memphis)']);
  // en ATS, la sigla del token separa a las mellizas de una frontera
  const kc = { kansas_ci_ks: 'Kansas City', kansas_ci_mo: 'Kansas City', st_joseph: 'St. Joseph' };
  const kcXY = { kansas_ci_ks: [0, 0], kansas_ci_mo: [30, 0], st_joseph: [0, -500] };
  assert.deepEqual(cityChoiceLabels(kc, { coords: (t) => kcXY[t], tokenRegions: true }),
    { kansas_ci_ks: 'Kansas City, KS', kansas_ci_mo: 'Kansas City, MO', st_joseph: 'St. Joseph' });
  const tx = cityChoiceLabels({ texarkana: 'Texarkana', texarkana_ar: 'Texarkana', shreveport: 'Shreveport' },
    { coords: () => [0, 0], tokenRegions: true });
  assert.deepEqual([tx.texarkana, tx.texarkana_ar], ['Texarkana (near Shreveport)', 'Texarkana, AR']);
  // en ETS2 no: "_de" no es Delaware
  assert.equal(cityChoiceLabels({ a_de: 'Tours', b: 'Tours' }, { coords: () => [0, 0] }).a_de.includes(', DE'), false);
  // sin nada con que distinguirlas, el token: feo, pero cada una se puede elegir
  const nada = cityChoiceLabels({ a: 'Brest', b: 'brest' });
  assert.notEqual(nada.a, nada.b);
  // en Europa, el pais entero
  assert.deepEqual(cityChoiceLabels({ brest: 'Brest', brect: 'Brest' }, { countries: { brest: 'france', brect: 'belarus' } }),
    { brest: 'Brest, France', brect: 'Brest, Belarus' });
  assert.equal(regionLabel('british_columbia'), 'BC');
  assert.equal(regionLabel('uk'), 'UK');
  assert.equal(regionLabel(undefined), '');
  // lo elegido de la lista es una sola; "jackson" escrito a mano, las tres
  assert.deepEqual(citiesMatchingInput(names, conEstado, 'Jackson, MS'), ['jackson_ms']);
  assert.deepEqual(citiesMatchingInput(names, conEstado, ' jackson '), ['jackson', 'jackson_ms', 'jackson_tn']);
  assert.deepEqual(citiesMatchingInput(names, conEstado, 'casper'), ['casper']);
  assert.deepEqual(citiesMatchingInput(names, conEstado, 'jack'), []);
  assert.deepEqual(citiesMatchingInput(names, conEstado, ''), []);
});

test('restMinutesOf: con la fatiga apagada no hay descanso (panel de docs/dash/, barrido del 21-10)', () => {
  const { restMinutesOf, createFatigue, REST_MINUTES_MAX } = require('./pure.js');
  assert.equal(restMinutesOf({ restStopMinutes: 400 }), 400);
  // El nombre viejo del cliente (<= 1.4.1), tambien en minutos
  assert.equal(restMinutesOf({ restStopSeconds: 90 }), 90);
  assert.equal(restMinutesOf({ restStopMinutes: 30, restStopSeconds: 999 }), 30);
  // Fatiga apagada: 0, o mas de un dia; y sin dato
  assert.equal(restMinutesOf({ restStopMinutes: 0 }), null);
  assert.equal(restMinutesOf({ restStopMinutes: REST_MINUTES_MAX }), null);
  assert.equal(restMinutesOf({ restStopMinutes: 4294967295 }), null);
  assert.equal(restMinutesOf({ restStopMinutes: -5 }), null);
  assert.equal(restMinutesOf({ restStopMinutes: null }), null);
  assert.equal(restMinutesOf({}), null);
  assert.equal(restMinutesOf(null), null);
  // La misma regla que la fatiga del panel de la app
  for (const m of [0, 1, 400, 1439, 1440, 99999]) {
    assert.equal(restMinutesOf({ restStopMinutes: m }) == null, createFatigue().push(m) == null, `con ${m}`);
  }
});

test('gameRouteSeconds: sin ruta en el GPS del juego no hay ETA del juego, ni "0h 0m"', () => {
  const { gameRouteSeconds } = require('./pure.js');
  assert.equal(gameRouteSeconds({ routeTimeSeconds: 5400 }), 5400);
  assert.equal(gameRouteSeconds({ routeTimeSeconds: 0 }), null);
  assert.equal(gameRouteSeconds({ routeTimeSeconds: null }), null);
  assert.equal(gameRouteSeconds({ routeTimeSeconds: -3 }), null);
  assert.equal(gameRouteSeconds({}), null);
  assert.equal(gameRouteSeconds(null), null);
});

test('createRestWatch: dormir cumple la parada de descanso, manejar no', () => {
  const { createRestWatch } = require('./pure.js');
  const w = createRestWatch();
  assert.equal(w.push(300), false);
  assert.equal(w.push(40), false);   // manejando baja
  assert.equal(w.push(0), false);    // fatiga apagada: se ignora
  assert.equal(w.push(660), true);   // durmio
  assert.equal(w.push(660), false);  // no avisa dos veces
  assert.equal(w.push(Number.NaN), false);
});

test('createStatusAlerts: trabajo nuevo solo si aparece con la pagina abierta y recien tomado', () => {
  const { createStatusAlerts } = require('./pure.js');
  const base = { ts: 1000, citySrc: 'Reno', cityDst: 'Elko', cargo: 'Wood', fuel: 500, fuelCapacity: 600, restStopMinutes: 600, trailerAttached: true, plannedDistanceKm: 400 };
  // El trabajo que ya estaba al abrir la pagina no se anuncia.
  let a = createStatusAlerts();
  assert.equal(a.push({ ...base, onJob: true, routeDistanceKm: 200 }).say, null);
  assert.equal(a.push({ ...base, ts: 1001, onJob: true, routeDistanceKm: 199 }).say, null);
  // Uno tomado despues, con todo el camino por delante, si.
  a = createStatusAlerts();
  a.push({ ...base, onJob: false });
  assert.equal(a.push({ ...base, ts: 1001, onJob: true, routeDistanceKm: 395 }).say, 'job_new');
  // Cerrar y abrir el juego: el mismo trabajo no es nuevo.
  a.push({ ...base, ts: 1002, onJob: false });
  assert.equal(a.push({ ...base, ts: 1003, onJob: true, routeDistanceKm: 390 }).say, null);
  // Partida cargada a mitad de camino con el tablero abierto: se espera al
  // GPS del juego y no se anuncia.
  a = createStatusAlerts();
  a.push({ ...base, onJob: false });
  assert.equal(a.push({ ...base, ts: 1001, onJob: true, cityDst: 'Ely', routeDistanceKm: 0 }).say, null);
  assert.equal(a.push({ ...base, ts: 1002, onJob: true, cityDst: 'Ely', routeDistanceKm: 120 }).say, null);
  // Sin GPS nunca: a los 15 s se da por visto, callado.
  a = createStatusAlerts();
  a.push({ ...base, onJob: false });
  a.push({ ...base, ts: 1001, onJob: true, routeDistanceKm: 0 });
  assert.equal(a.push({ ...base, ts: 1020, onJob: true, routeDistanceKm: 0 }).say, null);
  assert.equal(a.push({ ...base, ts: 1021, onJob: true, routeDistanceKm: 395 }).say, null);
  // Freight market: sin remolque enganchado el GPS va al remolque; es nuevo.
  a = createStatusAlerts();
  a.push({ ...base, onJob: false });
  assert.equal(a.push({ ...base, ts: 1001, onJob: true, trailerAttached: false, routeDistanceKm: 3 }).say, 'job_new');
});

test('createStatusAlerts: el aviso de descanso de Ajustes (REST_WARN_OPTIONS)', () => {
  const { createStatusAlerts, REST_WARN_OPTIONS, REST_WARN_DEFAULT, restWarnSetting, restWarnLabel } = require('./pure.js');
  assert.deepEqual(REST_WARN_OPTIONS, [180, 150, 120, 90, 60]);
  assert.equal(REST_WARN_DEFAULT, 150);
  assert.equal(restWarnSetting(undefined), 150);
  assert.equal(restWarnSetting('90'), 90);  // el <select> da texto
  assert.equal(restWarnSetting(100), 150);
  assert.deepEqual(REST_WARN_OPTIONS.map(restWarnLabel), ['3h', '2h 30m', '2h', '1h 30m', '1h']);
  const base = { ts: 1000, onJob: false, fuelCapacity: 600, fuel: 500 };
  // A 60: nada a los 100 minutos, si a los 55
  const a = createStatusAlerts({ restSoonMin: 60 });
  assert.equal(a.push({ ...base, restStopMinutes: 100 }).restSoon, false);
  assert.equal(a.push({ ...base, restStopMinutes: 55 }).say, 'rest_soon');
  // Ya avisado a 150 con 100 por delante: bajarlo a 90 avisa otra vez a los 90
  const b = createStatusAlerts();
  b.push({ ...base, restStopMinutes: 300 });
  assert.equal(b.push({ ...base, restStopMinutes: 100 }).say, 'rest_soon');
  b.setRestSoonMin(90);
  assert.equal(b.push({ ...base, restStopMinutes: 95 }).say, null);
  assert.equal(b.push({ ...base, restStopMinutes: 88 }).say, 'rest_soon');
  // Subirlo con lo que falta adentro del nuevo avisa enseguida
  const c = createStatusAlerts({ restSoonMin: 60 });
  assert.equal(c.push({ ...base, restStopMinutes: 100 }).say, null);
  c.setRestSoonMin(120);
  assert.equal(c.push({ ...base, restStopMinutes: 99 }).say, 'rest_soon');
  // Bajarlo con lo que falta ya por debajo del nuevo no repite
  const d = createStatusAlerts();
  d.push({ ...base, restStopMinutes: 300 });
  assert.equal(d.push({ ...base, restStopMinutes: 50 }).say, 'rest_soon');
  d.setRestSoonMin(60);
  assert.equal(d.push({ ...base, restStopMinutes: 45 }).say, null);
});

test('createStatusAlerts: poco combustible y descanso, una vez cada uno hasta cargar o dormir', () => {
  const { createStatusAlerts } = require('./pure.js');
  const base = { ts: 1000, onJob: false, fuelCapacity: 600, restStopMinutes: 600 };
  const a = createStatusAlerts();
  assert.equal(a.push({ ...base, fuel: 300 }).fuelLow, false);
  let r = a.push({ ...base, fuel: 80, mechanicalWarnings: { fuel: true } });
  assert.equal(r.say, 'fuel_low');
  assert.equal(r.fuelLow, true);
  assert.equal(a.push({ ...base, fuel: 70, mechanicalWarnings: { fuel: true } }).say, null);
  // Carga un poco: la alerta del juego se apaga pero no se rearma.
  assert.equal(a.push({ ...base, fuel: 110, mechanicalWarnings: { fuel: false } }).fuelLow, false);
  assert.equal(a.push({ ...base, fuel: 85, mechanicalWarnings: { fuel: true } }).say, null);
  // Llena el tanque: la proxima vez avisa de nuevo.
  a.push({ ...base, fuel: 600, mechanicalWarnings: { fuel: false } });
  assert.equal(a.push({ ...base, fuel: 80, mechanicalWarnings: { fuel: true } }).say, 'fuel_low');
  // Cliente viejo sin la alerta del juego: el 15 % del tanque.
  const b = createStatusAlerts();
  assert.equal(b.push({ ...base, fuel: 60 }).say, 'fuel_low');

  // Descanso: aviso al bajar de 150 min de juego (antes que el juego, a las
  // ~2 h: Discord 22-10), de nuevo recien despues de dormir.
  const c = createStatusAlerts();
  c.push({ ...base, fuel: 500 });
  assert.equal(c.push({ ...base, fuel: 500, restStopMinutes: 160 }).restSoon, false);
  r = c.push({ ...base, fuel: 500, restStopMinutes: 145 });
  assert.equal(r.say, 'rest_soon');
  assert.equal(r.restSoon, true);
  assert.equal(c.push({ ...base, fuel: 500, restStopMinutes: 30 }).say, null);
  assert.equal(c.push({ ...base, fuel: 500, restStopMinutes: 0 }).restSoon, false); // fatiga apagada
  c.push({ ...base, fuel: 500, restStopMinutes: 660 });
  assert.equal(c.push({ ...base, fuel: 500, restStopMinutes: 80 }).say, 'rest_soon');

  // Dos a la vez: uno por tick. En pausa se guardan.
  const e = createStatusAlerts();
  e.push({ ...base, fuel: 500 });
  assert.equal(e.push({ ...base, paused: true, fuel: 50, restStopMinutes: 20 }).say, null);
  assert.equal(e.push({ ...base, fuel: 50, restStopMinutes: 20 }).say, 'fuel_low');
  assert.equal(e.push({ ...base, fuel: 50, restStopMinutes: 20 }).say, 'rest_soon');
  assert.equal(e.push({ ...base, fuel: 50, restStopMinutes: 20 }).say, null);
});

test('createStopSuggestion: el atajo aparece con la condicion, no si ya hay parada, y cerrado hasta que vuelva', () => {
  const { createStopSuggestion } = require('./pure.js');
  const s = createStopSuggestion();
  assert.equal(s.update({ fuelLow: false, restSoon: false }, []), null);
  assert.equal(s.update({ fuelLow: true, restSoon: true }, []), 'g');       // el combustible primero
  assert.equal(s.update({ fuelLow: true, restSoon: true }, ['g']), 'p');    // ya va a una estacion
  assert.equal(s.update({ fuelLow: true, restSoon: true }, ['g', 'p']), null);
  s.close('g');
  assert.equal(s.update({ fuelLow: true, restSoon: false }, []), null);     // cerrado
  assert.equal(s.update({ fuelLow: false, restSoon: false }, []), null);    // cargo
  assert.equal(s.update({ fuelLow: true, restSoon: false }, []), 'g');      // vuelve a faltar
});

test('gaugeAngle y gaugeScaleMax: la aguja queda en el rango y la escala no salta', () => {
  const { gaugeAngle, gaugeScaleMax } = require('./pure.js');
  assert.equal(gaugeAngle(0, 0, 100), -135);
  assert.equal(gaugeAngle(50, 0, 100), 0);
  assert.equal(gaugeAngle(100, 0, 100), 135);
  assert.equal(gaugeAngle(130, 0, 100), 135);   // pasado: clavada en la punta
  assert.equal(gaugeAngle(-5, 0, 100), -135);
  assert.equal(gaugeAngle(null, 0, 100), -135);
  assert.equal(gaugeAngle(16, 8, 16), 135);
  assert.equal(gaugeScaleMax(820, [500, 1000, 2000]), 1000);
  assert.equal(gaugeScaleMax(1000, [500, 1000, 2000]), 1000);
  assert.equal(gaugeScaleMax(9000, [500, 1000, 2000]), 2000);
  assert.equal(gaugeScaleMax(undefined, [500, 1000, 2000]), 500);
});

test('miniDialReadings: cuatro relojitos, alerta del juego primero, F en millas', () => {
  const { miniDialReadings } = require('./pure.js');
  const d = { airPressure: 120, brakeTemperature: 320, waterTemperature: 90, oilPressure: 50,
              mechanicalWarnings: { airPressure: false, waterTemperature: false, oilPressure: false } };
  const r = miniDialReadings(d, false);
  assert.deepEqual(r.map(x => x.key), ['air', 'brake', 'water', 'oil']);
  assert.equal(r[0].frac, 0.8);
  assert.equal(r[1].bad, true);            // frenos pasados de 300
  assert.equal(r[2].text, '90 °C');
  assert.equal(miniDialReadings(d, true)[2].text, '194 °F');
  // La alerta del juego manda sobre el umbral; sin ella, el umbral.
  assert.equal(miniDialReadings({ ...d, airPressure: 50 }, false)[0].bad, false);
  assert.equal(miniDialReadings({ airPressure: 50 }, false)[0].bad, true);
  assert.equal(miniDialReadings({ ...d, mechanicalWarnings: { airPressure: true } }, false)[0].bad, true);
  // Lo que el cliente no manda no tiene reloj.
  assert.deepEqual(miniDialReadings({ airPressure: 100 }, false).map(x => x && x.key), ['air', null, null, null]);
  assert.deepEqual(miniDialReadings(null, false), []);
});

test('maneuver: Y abierta (dos calzadas que recien se separan lejos) -> keep, mirando a 500 m (Lightningroc771, 11-10)', () => {
  // a 250 m la ruta y la otra rama van casi juntas (2 grados a cada lado);
  // a 500 m ya se fueron 13 grados para cada lado
  const ctx = scenario({ route: [[0, -300], [0, 0], [-10, 250], [-120, 500], [-300, 650]],
                         extraNodes: [[10, 250], [120, 500], [300, 650]], edges: [[1, 5], [5, 6], [6, 7]] });
  const m = detectManeuver(ctx);
  assert.deepEqual([m.kind, m.direction, m.far], ['fork', 'left', true]);
  // la ruta sigue derecho y la otra se va: pasar de largo una salida, nada
  const recta = scenario({ route: [[0, -300], [0, 0], [0, 250], [0, 500], [0, 700]],
                           extraNodes: [[10, 250], [120, 500], [300, 650]], edges: [[1, 5], [5, 6], [6, 7]] });
  assert.equal(detectManeuver(recta), null);
  // con otro cruce de la ruta antes de los 500 m, el desvio lejano es de ese cruce: nada
  const otro = scenario({ route: [[0, -300], [0, 0], [-10, 250], [-120, 500], [-300, 650]],
                          extraNodes: [[10, 250], [120, 500], [300, 650]], edges: [[1, 5], [5, 6], [6, 7]] });
  otro.pts[2][3] = 1;
  assert.equal(detectManeuver(otro), null);
});

test('junctionClusterEnd: el punto del camion no parte un cruce en dos', () => {
  const { junctionClusterEnd: jce } = require('./pure.js');
  // nodo de cruce, punto del camion (sin nodo), nodo de cruce a 15 m, calle
  const pts = [[0, -100, 0, 0, 0], [0, 0, 0, 1, 1], [0, 8, 0, 0, null], [0, 15, 0, 1, 2], [0, 300, 0, 0, 3]];
  const { cum } = routeMetrics(pts);
  assert.equal(jce(pts, cum, 1, 50, 100), 1);      // sin saber del camion: se corta
  assert.equal(jce(pts, cum, 1, 50, 100, 2), 3);   // con el camion en 2: un solo cruce
  assert.equal(jce(pts, cum, 1, 50, 100, 4), 1);   // el camion en otro lado no cambia nada
  assert.equal(jce(pts, cum, 1, 50, 100, undefined, 60), 3); // de punta a punta del prefab, tampoco
});

test('junctionClusterEnd: de punta a punta de la curva de un prefab (curveSpanM, 17-10)', () => {
  const { junctionClusterEnd: jce } = require('./pure.js');
  // nodo de entrada del prefab, dos puntos de su curva, nodo de salida a 40 m
  const pts = [[0, -100, 0, 0, 0], [0, 0, 0, 1, 1], [5, 15, 0, 0, null], [15, 28, 0, 0, null], [30, 32, 0, 1, 2], [300, 32, 0, 0, 3]];
  const { cum } = routeMetrics(pts);
  assert.equal(jce(pts, cum, 1, 50, 100), 1);          // por defecto la curva corta
  assert.equal(jce(pts, cum, 1, 50, 100, undefined, 60), 4);
  // La curva puede pasar de maxGapM mientras no pase de curveSpanM: la de
  // 55 m de la cruz de Modesto (ATS, -108128,-6338, simulaciones del 21-10)
  // partia la esquina en dos mitades calladas
  const curva55 = [[0, -100, 0, 0, 0], [0, 0, 0, 1, 1], [0, 30, 0, 0, null], [0, 55, 0, 1, 2], [0, 300, 0, 0, 3]];
  assert.equal(jce(curva55, routeMetrics(curva55).cum, 1, 50, 100, undefined, 60), 3);
  assert.equal(jce(curva55, routeMetrics(curva55).cum, 1, 50, 100), 1); // sin curveSpanM, como siempre
  // a mas de 60 m por la curva ya no es el mismo cruce
  const lejos = [[0, -100, 0, 0, 0], [0, 0, 0, 1, 1], [0, 30, 0, 0, null], [0, 65, 0, 1, 2], [0, 300, 0, 0, 3]];
  assert.equal(jce(lejos, routeMetrics(lejos).cum, 1, 50, 100, undefined, 60), 1);
  // ni 55 m de calle sin puntos de curva: son dos prefabs (Tulsa -> Ardmore,
  // la T a 59 m de la esquina tomaba el giro de la esquina)
  const calle = [[0, -100, 0, 0, 0], [0, 0, 0, 1, 1], [0, 55, 0, 1, 2], [0, 300, 0, 0, 3]];
  assert.equal(jce(calle, routeMetrics(calle).cum, 1, 50, 100, undefined, 60), 1);
  // ni un nodo que, por la curva, deja el cruce en mas de 60 m (dos cruces:
  // uno que se pasa derecho y la esquina, con una curva en S entre los dos)
  const dos = [[0, -100, 0, 0, 0], [0, 0, 0, 1, 1], [0, 30, 0, 1, 2], [0, 45, 0, 0, null], [0, 70, 0, 1, 3], [0, 300, 0, 0, 4]];
  assert.equal(jce(dos, routeMetrics(dos).cum, 1, 50, 100, undefined, 60), 2);
});

test('maneuver: T partida por la curva del prefab: el giro y la calle del otro lado son del mismo cruce', () => {
  // La T de la ruta de Aberdeen a Dallas (ATS, -53869,9028): la ruta llega
  // en diagonal al nodo 1, dobla a la izquierda por la curva del prefab
  // hasta el nodo 2 (53 m) y la otra calle sale del nodo 1 al otro lado.
  // Cada mitad medida sola se callaba: el 1 dobla poco y el 2 no tiene otra
  // salida que doble menos que la calle de enfrente.
  const pts = [[-73, 121, 0, 0, 0], [-15, 50, 0, 0, null], [-7, 34, 0, 0, null], [-2, 17, 0, 0, null], [0, 0, 0, 1, 1],
    [2.5, -21.7, 0, 0, null], [9.5, -27, 0, 0, null], [28, -28, 0, 1, 2], [199, -28.5, 0, 0, 3], [400, -28, 0, 0, 4]];
  const nodes = [[-73, 121], [0, 0], [28, -28], [199, -28.5], [400, -28], [-28, -25.6], [-65, -25.6], [-155, -26.6], [-400, -26]];
  const adjacency = new Map();
  const add = (a, b) => { if (!adjacency.has(a)) adjacency.set(a, []); adjacency.get(a).push([b]); };
  for (const [a, b] of [[0, 1], [1, 2], [1, 5], [2, 5], [5, 6], [6, 7], [7, 8], [2, 3], [3, 4]]) { add(a, b); add(b, a); }
  const { cum, pointAt } = routeMetrics(pts);
  const ctx = { pts, cum, pointAt, bearingBetween: planarBearing, nodes, adjacency };
  // partida por la curva, ninguna mitad avisa
  assert.equal(junctionClusterEnd(pts, cum, 4, 50, 100), 4);
  const mitad = (i) => detectManeuver({ ...ctx, i, iEnd: i });
  assert.ok(!mitad(4) || mitad(4).quiet);
  assert.ok(!mitad(7) || mitad(7).quiet);
  // el prefab entero si, en el nodo de la entrada
  const { iEnd, m } = junctionManeuver({ ...ctx, i: 4, iEnd: 4 }, 50, 100);
  assert.equal(iEnd, 7);
  assert.deepEqual([m.kind, m.direction, m.quiet, m.at], ['turn', 'left', false, 4]);
});

test('junctionManeuver: la esquina de una cruz con dos brazos muertos y 55 m de curva se avisa (Modesto, 21-10)', () => {
  // La cruz de Modesto (ATS, -108128,-6338): se entra por el brazo sur (1) y
  // se sale por el este (2) por una curva de 55 m; los brazos norte (3) y
  // oeste (4) no tienen calle. Con el corte de 50 m entre nodos la esquina
  // quedaba en dos mitades calladas y la app decia "Continue straight".
  const pts = [[0, -300, 0, 0, 0], [0, 0, 0, 1, 1], [4, 17, 0, 0, null], [12, 28, 0, 0, null], [24, 34, 0, 0, null], [35, 35, 0, 1, 2],
    [300, 35, 0, 0, 6], [600, 35, 0, 0, 7]];
  const nodes = [[0, -300], [0, 0], [35, 35], [0, 70], [-35, 35], null, [300, 35], [600, 35]];
  const adjacency = new Map();
  const add = (a, b) => { if (!adjacency.has(a)) adjacency.set(a, []); adjacency.get(a).push([b]); };
  for (const [a, b] of [[0, 1], [1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4], [2, 6], [6, 7]]) { add(a, b); add(b, a); }
  const { cum, pointAt } = routeMetrics(pts);
  const ctx = { pts, cum, pointAt, bearingBetween: planarBearing, nodes, adjacency };
  const mitad = (i) => detectManeuver({ ...ctx, i, iEnd: i });
  assert.ok(!mitad(1) || mitad(1).quiet);
  assert.ok(!mitad(5) || mitad(5).quiet);
  const { iEnd, m } = junctionManeuver({ ...ctx, i: 1, iEnd: 1 }, 50, 100);
  assert.equal(iEnd, 5);
  assert.deepEqual([m.kind, m.direction, m.quiet, m.at], ['turn', 'right', false, 1]);
});

test('junctionManeuver: la esquina de una cruz que queda despues de un rombo se avisa (Davenport -> Quincy, 21-10)', () => {
  // Davenport -> Quincy (ATS, 22846,-9173; el norte es +y): la ruta baja al
  // sur por un rombo (nodos 2 y 3, con 10 y 11 a los costados), entra a la
  // cruz por el 4 y sale al este por el 5, por una curva de 51 m. Los brazos
  // oeste (9) y sur (8) no tienen calle y se unen al 4 y al 5. El grupo
  // arranca en el rombo, asi que el prefab entero pasa de 60 m y cada mitad
  // dobla poco y se calla: "Continue straight" donde se termina la calle.
  const pts = [[-2, 232, 0, 0, 0], [-2, 73, 0, 0, 1], [0, 43, 0, 1, 2], [0, 13, 0, 1, 3], [0, 0, 0, 1, 4],
    [2, -24, 0, 0, null], [9, -31, 0, 0, null], [23, -32, 0, 1, 5], [73, -32, 0, 0, 6], [400, -32, 0, 0, 7]];
  const nodes = [[-2, 232], [-2, 73], [0, 43], [0, 13], [0, 0], [23, -32], [73, -32], [400, -32], [-2, -60], [-28, -27], [-25, 15], [22, 36]];
  const cruz = (salidas) => {
    const adjacency = new Map(Object.entries(salidas).map(([n, xs]) => [Number(n), xs.map((x) => [x])]));
    const incoming = (n) => [...adjacency].filter(([, xs]) => xs.some(([x]) => x === n)).map(([k]) => k);
    const { cum, pointAt } = routeMetrics(pts);
    return { pts, cum, pointAt, bearingBetween: planarBearing, nodes, adjacency, incoming };
  };
  const ctx = cruz({ 0: [1], 1: [0, 2], 2: [1, 3, 10, 11], 3: [4, 2, 10, 11], 4: [3, 5, 8, 9], 5: [6, 4, 8, 9], 6: [5, 7], 7: [6],
    8: [4, 5, 9], 9: [4, 5, 8], 10: [11, 2, 3], 11: [10, 2, 3] });
  assert.equal(junctionClusterEnd(ctx.pts, ctx.cum, 2, 50, 100, undefined, 60), 4);
  const mitad = (i, iEnd) => detectManeuver({ ...ctx, i, iEnd });
  assert.ok(!mitad(2, 4) || mitad(2, 4).quiet);
  assert.ok(!mitad(7, 7) || mitad(7, 7).quiet);
  // las dos mitades comparten los brazos muertos: es la misma cruz y se avisa
  // en el 4, donde empieza la esquina
  const { iEnd, m } = junctionManeuver({ ...ctx, i: 2, iEnd: 4 }, 50, 100, undefined, 60);
  assert.equal(iEnd, 7);
  assert.deepEqual([m.kind, m.direction, m.quiet, m.at], ['turn', 'left', false, 4]);
  // Sin un vecino comun son dos prefabs unidos por una calle (la T a 59 m de
  // una esquina en Tulsa -> Ardmore): cada uno con su brazo muerto, callados.
  const dos = cruz({ 0: [1], 1: [0, 2], 2: [1, 3, 10, 11], 3: [4, 2, 10, 11], 4: [3, 5, 9], 5: [6, 4, 8], 6: [5, 7], 7: [6],
    8: [5], 9: [4], 10: [11, 2, 3], 11: [10, 2, 3] });
  const r = junctionManeuver({ ...dos, i: 2, iEnd: 4 }, 50, 100, undefined, 60);
  assert.equal(r.iEnd, 4);
  assert.ok(!r.m || r.m.quiet, JSON.stringify(r.m));
  // Ni si la curva de una mitad a la otra dobla para los dos lados: la de una
  // rotonda chica que rodea la isla (la 2.a salida de Oslo, ETS2, 1888,-53484)
  const ese = [...pts.slice(0, 5), [3, -12, 0, 0, null], [-6, -24, 0, 0, null], [8, -33, 0, 0, null], ...pts.slice(7)];
  const { cum: cumS, pointAt: pointAtS } = routeMetrics(ese);
  const s = junctionManeuver({ ...ctx, pts: ese, cum: cumS, pointAt: pointAtS, i: 2, iEnd: 4 }, 50, 100, undefined, 60);
  assert.equal(s.iEnd, 4);
  assert.ok(!s.m || s.m.quiet, JSON.stringify(s.m));
});

test('junctionManeuver: una cruz ancha que dobla en dos mitades bajo el umbral se avisa (Idaho Falls, 21-10)', () => {
  // La cruz de Idaho Falls (ATS, -63981,-32641; el norte es +y): la ruta
  // llega al oeste-suroeste, entra por el brazo este (3) y sale por el sur
  // (4) por una curva de 71 m. El brazo de enfrente (7) esta cortado con
  // barreras y no tiene calle; el norte (8) sigue (9, 10). Cada mitad dobla
  // menos de 35 grados y la app decia "Continue straight" (Discord, 21-10).
  const pts = [[251, 91, 0, 0, 0], [54, 21, 0, 0, 1], [40, 14, 0, 0, 2], [0, 0, 0, 1, 3], [-21, -8, 0, 0, null], [-36, -19, 0, 0, null],
    [-43, -48, 0, 1, 4], [-83, -264, 0, 0, 5], [-90, -500, 0, 0, 6]];
  const nodes = [[251, 91], [54, 21], [40, 14], [0, 0], [-43, -48], [-83, -264], [-90, -500], [-72, -21], [-29, 26], [-13, 116], [-12, 300]];
  const cruz = (aristas) => {
    const adjacency = new Map();
    const add = (a, b) => { if (!adjacency.has(a)) adjacency.set(a, []); adjacency.get(a).push([b]); };
    for (const [a, b] of aristas) { add(a, b); add(b, a); }
    const { cum, pointAt } = routeMetrics(pts);
    return { pts, cum, pointAt, bearingBetween: planarBearing, nodes, adjacency };
  };
  const calle = [[0, 1], [1, 2], [2, 3], [4, 5], [5, 6], [8, 9], [9, 10]];
  const ctx = cruz([...calle, [3, 4], [3, 7], [3, 8], [4, 7], [4, 8], [7, 8]]);
  assert.equal(junctionClusterEnd(pts, ctx.cum, 3, 50, 100, undefined, 60), 3);
  assert.equal(detectManeuver({ ...ctx, i: 3, iEnd: 3 }), null);
  assert.equal(detectManeuver({ ...ctx, i: 6, iEnd: 6 }), null);
  const { iEnd, m } = junctionManeuver({ ...ctx, i: 3, iEnd: 3 }, 50, 100, undefined, 60);
  assert.equal(iEnd, 6);
  assert.deepEqual([m.kind, m.direction, m.quiet, m.at], ['turn', 'left', false, 3]);
  // Sin un vecino comun son dos prefabs unidos por una calle: nada
  const dos = cruz([...calle, [3, 4], [3, 7], [3, 8], [7, 8]]);
  const r = junctionManeuver({ ...dos, i: 3, iEnd: 3 }, 50, 100, undefined, 60);
  assert.equal(r.iEnd, 3);
  assert.equal(r.m, null);
});

test('junctionManeuver: la segunda vuelta de una S, con la cruz pegada a la T de antes, se avisa (Wenatchee -> Everett, 21-10)', () => {
  // Wenatchee -> Everett (ATS, -98451,-65259; el norte es +y): la ruta dobla a
  // la derecha en una T (1 -> 2) y 38 m despues entra a una cruz por el sur
  // (3), de donde sale al oeste (4) por una curva de 40 m. El brazo este (9)
  // lleva a una calle (10, 11, 12) y el norte (8) no tiene calle. La salida de
  // la T y la entrada a la cruz quedan en un grupo que no dice nada, la salida
  // de la cruz sola dobla callada, y el "turn left" de la cruz no salia.
  const pts = [[79, -96, 0, 0, 0], [-13, -61, 0, 1, 1], [-21, -56, 0, 0, null], [-26, -47, 0, 0, null], [-21, -32, 0, 1, 2], [0, 0, 0, 1, 3],
    [11, 23, 0, 0, null], [8, 30, 0, 0, null], [-4, 38, 0, 1, 4], [-18, 45, 0, 0, 5], [-57, 72, 0, 0, null], [-95, 100, 0, 0, null], [-132, 131, 0, 0, 6], [-300, 270, 0, 0, 7]];
  const nodes = [[79, -96], [-13, -61], [-21, -32], [0, 0], [-4, 38], [-18, 45], [-132, 131], [-300, 270], [30, 47], [33, 9], [60, -5], [98, -30], [300, -150], [-44, -68], [-150, -250]];
  const salidas = { 0: [1], 1: [2, 13], 2: [3, 13], 3: [2, 4, 8, 9], 4: [3, 8, 9, 5], 5: [6, 4], 6: [5, 7], 7: [6],
    8: [3, 4, 9], 9: [10, 3, 4, 8], 10: [11, 9], 11: [10, 12], 12: [11], 13: [2, 14], 14: [13] };
  const adjacency = new Map(Object.entries(salidas).map(([n, xs]) => [Number(n), xs.map((x) => [x])]));
  const incoming = (n) => [...adjacency].filter(([, xs]) => xs.some(([x]) => x === n)).map(([k]) => k);
  const { cum, pointAt } = routeMetrics(pts);
  const ctx = { pts, cum, pointAt, bearingBetween: planarBearing, nodes, adjacency, incoming };
  assert.equal(junctionClusterEnd(pts, cum, 4, 50, 100, undefined, 60), 5);
  assert.equal(detectManeuver({ ...ctx, i: 4, iEnd: 5 }), null);
  assert.equal(detectManeuver({ ...ctx, i: 8, iEnd: 8 }).quiet, true);
  // la cruz se mide desde su entrada (3), sin la curva de la T, y se avisa ahi
  const { iEnd, m } = junctionManeuver({ ...ctx, i: 4, iEnd: 5 }, 50, 100, undefined, 60);
  assert.equal(iEnd, 8);
  assert.deepEqual([m.kind, m.direction, m.quiet, m.at], ['turn', 'left', false, 5]);
});

test('maneuver: al final de una autovia, volver por la calzada contraria no es una bifurcacion (17-10)', () => {
  // La US-12 al este de Aberdeen (ATS, -105601,-61480), corrida al origen: la
  // ruta llega al noreste por su calzada (nodos 3 y 4) y sigue al este; del
  // prefab donde se juntan sale la calzada contraria (9 en adelante), que
  // arranca pareja con la ruta por la curva del prefab y vuelve al oeste.
  const pts = [[-92, -144, 0, 0, 0], [-60, -71, 0, 0, 1], [-52, -53, 0, 0, 2], [-44, -34, 0, 0, 3], [-40, -28, 0, 0, null], [-36, -23, 0, 0, null],
    [-31, -19, 0, 0, null], [-26, -16, 0, 1, 4], [0, 0, 0, 1, 5], [28, 10, 0, 1, 6], [50, 16, 0, 0, null], [61, 19, 0, 0, 7], [300, 30, 0, 0, 8]];
  const nodes = [[-92, -144], [-60, -71], [-52, -53], [-44, -34], [-26, -16], [0, 0], [28, 10], [61, 19], [300, 30],
    [-30, -4], [-42, -7], [-66, -15], [-116, -32], [-182, -55], [-400, -120], [19, -9]];
  const adjacency = new Map();
  const add = (a, b) => { if (!adjacency.has(a)) adjacency.set(a, []); adjacency.get(a).push([b]); };
  for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [4, 9], [5, 9], [5, 15], [5, 6], [6, 7], [6, 15], [6, 5], [15, 5], [15, 6], [7, 8],
    [9, 10], [10, 11], [11, 12], [12, 13], [13, 14]]) add(a, b);
  const curvas = { '4-9': [[-26, -16], [1, -7], [-12, 2], [-30, -4]], '6-15': [[28, 10], [16, 4], [19, -9]] };
  const { cum, pointAt } = routeMetrics(pts);
  const ctx = { pts, cum, pointAt, bearingBetween: planarBearing, nodes, adjacency, edgeLine: (a, b) => curvas[`${a}-${b}`] || null, i: 7, iEnd: 9 };
  const m = detectManeuver(ctx);
  assert.ok(!m || (m.kind === 'turn' && m.quiet), JSON.stringify(m));
  // sin mirar a donde va la otra rama, era "keep right" (forkInCurve)
  const viejo = detectManeuver({ ...ctx, uTurnDeg: 180 });
  assert.deepEqual([viejo.kind, viejo.direction], ['fork', 'right']);
});

test('junctionManeuver: si la otra mitad del prefab avisa sola, no se junta', () => {
  // derecho por el nodo 1 (sin otra salida), curva corta y en el nodo 2 un
  // giro a la derecha con otra calle que sigue derecho: se avisa en el 2
  const pts = [[0, -300, 0, 0, 0], [0, 0, 0, 1, 1], [0, 15, 0, 0, null], [0, 30, 0, 0, null], [0, 40, 0, 1, 2], [300, 40, 0, 0, 3]];
  const nodes = [[0, -300], [0, 0], [0, 40], [300, 40], [0, 400]];
  const adjacency = new Map([[0, [[1]]], [1, [[2]]], [2, [[3], [4]]], [3, []], [4, []]]);
  const { cum, pointAt } = routeMetrics(pts);
  const ctx = { pts, cum, pointAt, bearingBetween: planarBearing, nodes, adjacency };
  const r = junctionManeuver({ ...ctx, i: 1, iEnd: 1 }, 50, 100);
  assert.deepEqual([r.iEnd, r.m], [1, null]);
  const m2 = detectManeuver({ ...ctx, i: 4, iEnd: 4 });
  assert.deepEqual([m2.kind, m2.direction, m2.quiet], ['turn', 'right', false]);
});

test('passedRoutePoints: el primer recorte guarda tambien el comienzo de la ruta (17-10)', () => {
  const { passedRoutePoints } = require('./pure.js');
  const ruta = [[0, 0], [0, 10], [0, 20], [0, 30]];
  // recien calculada: el 0 es el comienzo y va a lo recorrido
  assert.deepEqual(passedRoutePoints([], ruta, 2), [[0, 0], [0, 10], [0, 20]]);
  // despues el 0 es el punto del camion del recorte anterior: no se repite
  const camino = [[0, 25], [0, 30], [0, 40]];
  assert.deepEqual(passedRoutePoints([[0, 0], [0, 20]], camino, 1), [[0, 0], [0, 20], [0, 30]]);
});

test('trimRouteBehind: lo ya recorrido se guarda por metros, con tope de puntos', () => {
  const { trimRouteBehind } = require('./pure.js');
  const denso = Array.from({ length: 300 }, (_, k) => [0, k * 0.5]); // 150 m en 300 puntos
  assert.equal(trimRouteBehind(denso, 200, 400).length, 300);        // todo: no llega a 200 m
  assert.equal(trimRouteBehind(denso, 50, 400).length, 101);         // 50 m = 100 tramos
  assert.equal(trimRouteBehind(denso, 200, 40).length, 40);          // el tope manda
  const ralo = [[0, 0], [0, 100], [0, 200], [0, 300], [0, 400]];
  assert.deepEqual(trimRouteBehind(ralo, 150, 400), [[0, 200], [0, 300], [0, 400]]);
  assert.deepEqual(trimRouteBehind([], 200, 400), []);
});

test('trimRouteBehind: adentro de una rotonda se guarda desde su entrada (rotondas grandes, 15-10)', () => {
  const { trimRouteBehind } = require('./pure.js');
  const ralo = Array.from({ length: 11 }, (_, k) => [0, k * 100]); // 1 km, un punto cada 100 m
  assert.deepEqual(trimRouteBehind(ralo, 150, 400), ralo.slice(8));
  // entrada en (0, 500): los 150 m se cuentan desde ella, no desde el camion
  assert.deepEqual(trimRouteBehind(ralo, 150, 400, [0, 500]), ralo.slice(3));
  // el tope de puntos tambien cuenta desde la entrada
  assert.deepEqual(trimRouteBehind(ralo, 150, 1, [0, 500]), ralo.slice(5));
  // una entrada que no esta (ya recortada, o de otra ruta): como siempre
  assert.deepEqual(trimRouteBehind(ralo, 150, 400, [7, 7]), ralo.slice(8));
  // ni mas de 2 km detras del camion
  const largo = Array.from({ length: 31 }, (_, k) => [0, k * 100]);
  assert.deepEqual(trimRouteBehind(largo, 150, 400, [0, 0]), largo.slice(28));
});

test('maneuver: Y donde la otra rama se abre mas que la ruta, pero la ruta tambien dobla de verdad -> keep (I-25, Denver)', () => {
  // a 500 m la ruta va 33 grados a la izquierda y la otra rama 57 a la derecha
  const ctx = scenario({ route: [[0, -300], [0, 0], [-10, 250], [-400, 450]],
                         extraNodes: [[10, 250], [500, 330]], edges: [[1, 4], [4, 5]] });
  const m = detectManeuver(ctx);
  assert.deepEqual([m.kind, m.direction, m.far], ['fork', 'left', true]);
});

test('maneuver: rampa que sale a la derecha y cruza por arriba de la autopista, que dobla a la derecha -> nada (US-63 al NE de Columbia, 16-10)', () => {
  // la autopista sigue derecho y a 500 m dobla 12 grados a la derecha; la
  // rampa sale 20 grados a la derecha y despues pasa al otro lado sin nodo
  // (puente): a 500 m queda 7 grados a la izquierda
  const ctx = scenario({ route: [[0, -300], [0, 0], [3, 125], [28, 250], [105, 490]],
                         extraNodes: [[14, 44], [60, 120], [60, 200], [0, 330], [-60, 480]],
                         edges: [[1, 5], [5, 6], [6, 7], [7, 8], [8, 9]] });
  assert.equal(detectManeuver(ctx), null);
  // espejado: la rampa sale a la izquierda y cruza a la derecha
  const espejo = (p) => [-p[0], p[1]];
  const izq = scenario({ route: [[0, -300], [0, 0], [3, 125], [28, 250], [105, 490]].map(espejo),
                         extraNodes: [[14, 44], [60, 120], [60, 200], [0, 330], [-60, 480]].map(espejo),
                         edges: [[1, 5], [5, 6], [6, 7], [7, 8], [8, 9]] });
  assert.equal(detectManeuver(izq), null);
  // la misma rampa sin cruzar (se queda a la derecha): pasar de largo una salida, nada
  const sinCruzar = scenario({ route: [[0, -300], [0, 0], [3, 125], [28, 250], [105, 490]],
                               extraNodes: [[14, 44], [60, 120], [110, 200], [200, 330], [300, 480]],
                               edges: [[1, 5], [5, 6], [6, 7], [7, 8], [8, 9]] });
  assert.equal(detectManeuver(sinCruzar), null);
});

test('maneuver: rampa que se abre de a poco a la derecha y cruza por arriba -> nada, no "keep right" (I-70, turn report #5, 26-10)', () => {
  // La I-70 en Colorado (-48320,-6177): la salida va 17 m a la derecha a los
  // 100 m pero a los 250 solo 6 grados (no llega a forkMinSep), pasa por
  // arriba de la autopista y a 500 m queda a la izquierda. Se decia "keep
  // right" y el camion se fue por la salida.
  const ruta = [[0, -300], [0, 0], [0, 100], [10, 250], [60, 400], [200, 450]];
  const rampa = [[17, 98], [35, 250], [45, 400], [40, 560]];
  const ctx = scenario({ route: ruta, extraNodes: rampa, edges: [[1, 6], [6, 7], [7, 8], [8, 9]] });
  assert.equal(detectManeuver(ctx), null);
  const espejo = (p) => [-p[0], p[1]];
  assert.equal(detectManeuver(scenario({ route: ruta.map(espejo), extraNodes: rampa.map(espejo), edges: [[1, 6], [6, 7], [7, 8], [8, 9]] })), null);
});

test('maneuver: el conector se parte en dos calzadas casi paralelas y la ruta toma la que se abre -> keep right (Council Bluffs, 17-10)', () => {
  // del I-29 al I-80: a 120 m la ruta (la colectora) va 5 grados a la
  // derecha y la otra (el I-80) 3 a la izquierda, 16 m entre las dos; por
  // angulo no llegaba a forkMinDev ni a forkMinSep y no se decia nada
  const geo = { route: [[0, -300], [0, 0], [10, 120], [14, 148], [20, 400]],
                extraNodes: [[-6, 120], [-30, 400]], edges: [[1, 5], [5, 6]] };
  const m = detectManeuver(scenario(geo));
  assert.deepEqual([m.kind, m.direction, m.parallel], ['fork', 'right', true]);
  // espejado: la ruta es la de la izquierda
  const espejo = (p) => [-p[0], p[1]];
  const izq = detectManeuver(scenario({ ...geo, route: geo.route.map(espejo), extraNodes: geo.extraNodes.map(espejo) }));
  assert.deepEqual([izq.kind, izq.direction], ['fork', 'left']);
});

test('maneuver: bifurcacion pareja con los carriles del juego: manda la flecha de la rama de la ruta', () => {
  const B = { straight: 4, slightRight: 8 };
  const geo = { route: [[0, -300], [0, 0], [10, 120], [14, 148], [20, 400]],
                extraNodes: [[-6, 120], [-30, 400]], edges: [[1, 5], [5, 6]] };
  const flechas = (ruta, otra) => (a, b) => (a === 1 && b === 2 ? ruta : a === 1 && b === 5 ? otra : null);
  // la rama de la ruta es la "slight right" del juego: keep right
  const m = detectManeuver({ ...scenario(geo), laneTurn: flechas(B.slightRight, B.straight) });
  assert.deepEqual([m.kind, m.direction], ['fork', 'right']);
  // la de la ruta sigue derecho (la autopista dobla al lado de una rampa
  // recta, I-15 en Helena): nada
  assert.equal(detectManeuver({ ...scenario(geo), laneTurn: flechas(B.straight, B.slightRight) }), null);
  // sin flecha en la ruta y con flecha en la otra: la otra es la salida
  assert.equal(detectManeuver({ ...scenario(geo), laneTurn: flechas(null, B.slightRight) }), null);
});

test('maneuver: bifurcacion pareja donde la ruta es la mas recta por angulo pero el juego le pone flecha al costado -> keep (I-35, San Antonio, 25-10)', () => {
  const B = { slightLeft: 2, straight: 4, slightRight: 8 };
  // a 100 m la ruta va 3,3 grados a la derecha y la otra 3,8 a la izquierda,
  // 12 m entre las dos: por angulo la ruta es la autopista y no se decia nada
  const geo = { route: [[0, -300], [0, 0], [7, 120], [12, 250], [20, 520]],
                extraNodes: [[-8, 120], [-30, 400]], edges: [[1, 5], [5, 6]] };
  const flechas = (ruta, otra) => (a, b) => (a === 1 && b === 2 ? ruta : a === 1 && b === 5 ? otra : null);
  assert.equal(detectManeuver(scenario(geo)), null);
  // el juego: la ruta por los carriles de la derecha con flecha a la derecha,
  // la otra derecho
  const m = detectManeuver({ ...scenario(geo), laneTurn: flechas(B.slightRight, B.straight) });
  assert.deepEqual([m.kind, m.direction, m.parallel], ['fork', 'right', true]);
  // la ruta sigue derecho segun el juego: nada, como sin carriles
  assert.equal(detectManeuver({ ...scenario(geo), laneTurn: flechas(B.straight, B.slightLeft) }), null);
  // con los carriles de San Antonio (de 3, la ruta los dos de la derecha y la
  // otra los dos de la izquierda): keep right igual
  const sa = { ...scenario(geo), laneTurn: flechas(B.slightRight, B.straight), laneMask: flechas(6, 3) };
  assert.deepEqual([detectManeuver(sa).kind, detectManeuver(sa).direction], ['fork', 'right']);
  // la ruta se lleva dos carriles y la otra uno: la ruta es la autopista y la
  // otra un carril que sale (ATS, cerca de Lewiston, -79849,-52508): nada
  assert.equal(detectManeuver({ ...scenario(geo), laneTurn: flechas(B.slightRight, B.straight), laneMask: flechas(6, 1) }), null);
  // el lado lo dan los carriles, no la flecha: la ruta por el de la derecha
  // con flecha "slight left" (ETS2, 1785,-21153) es keep right
  const flechaAlReves = detectManeuver({ ...scenario(geo), laneTurn: flechas(B.slightLeft, B.straight), laneMask: flechas(4, 3) });
  assert.deepEqual([flechaAlReves.kind, flechaAlReves.direction], ['fork', 'right']);
  // carriles mezclados (la ruta el 0 y el 2, la otra el 1): no dicen el lado, nada
  assert.equal(detectManeuver({ ...scenario(geo), laneTurn: flechas(B.slightRight, B.straight), laneMask: flechas(5, 2) }), null);
  // la otra sin flechas (sirven todos los carriles): no hay con que comparar, nada
  assert.equal(detectManeuver({ ...scenario(geo), laneTurn: flechas(B.slightRight, null) }), null);
  // espejado: la ruta es la de la izquierda
  const espejo = (p) => [-p[0], p[1]];
  const izq = { ...geo, route: geo.route.map(espejo), extraNodes: geo.extraNodes.map(espejo) };
  const l = detectManeuver({ ...scenario(izq), laneTurn: flechas(B.slightLeft, B.straight) });
  assert.deepEqual([l.kind, l.direction, l.parallel], ['fork', 'left', true]);
});

test('maneuver: la autopista dobla en una salida y los carriles del juego dicen que sigue derecho -> nada, o keep sin nombre (I-90, 23-10)', () => {
  const B = { slightLeft: 2, straight: 4, slightRight: 8 };
  // la ruta (la autopista) dobla 10 grados a la izquierda y la salida se va
  // casi derecho por la derecha: por angulo, "keep left"
  const geo = { route: [[0, -300], [0, 0], [-8, 46], [-45, 250], [-110, 500]],
                extraNodes: [[4, 46], [30, 400]], edges: [[1, 5], [5, 6]] };
  const m = detectManeuver(scenario(geo));
  assert.deepEqual([m.kind, m.direction], ['fork', 'left']);
  const flechas = (ruta, otra) => (a, b) => (a === 1 && b === 2 ? ruta : a === 1 && b === 5 ? otra : null);
  // sin flechas en la ruta (sirven todos los carriles) y la otra "slight
  // right": seguir por la autopista al lado de una salida, nada (I-90 al
  // este de Missoula, -68763,-52020)
  assert.equal(detectManeuver({ ...scenario(geo), laneTurn: flechas(null, B.slightRight) }), null);
  // la ruta es la "straight" del juego pero no la sirven todos los carriles:
  // keep como antes, sin el nombre del cartel ("Keep left onto US-395" 1 km
  // antes de la salida a la US-395, -79816,-58949)
  const derecho = detectManeuver({ ...scenario(geo), laneTurn: flechas(B.straight, B.slightRight) });
  assert.deepEqual([derecho.kind, derecho.direction, derecho.through], ['fork', 'left', true]);
  // la ruta es la "slight left" del juego: una bifurcacion de verdad (la US-93
  // y la I-90 en Missoula, -72993,-55079), con nombre
  const izq = detectManeuver({ ...scenario(geo), laneTurn: flechas(B.slightLeft, B.straight) });
  assert.deepEqual([izq.kind, izq.direction, izq.through], ['fork', 'left', undefined]);
  // las dos derecho: no se sabe, manda el angulo
  const dos = detectManeuver({ ...scenario(geo), laneTurn: flechas(B.straight, B.straight) });
  assert.deepEqual([dos.kind, dos.through], ['fork', undefined]);
});

test('turnAfterFork: la curva callada de la rampa no tapa la salida (I-25 en Walsenburg, Discord 18-10)', () => {
  const { turnAfterFork } = require('./pure.js');
  // la ruta sale a la derecha en el nodo 1 (la autopista sigue derecho por
  // 6-7) y a 180 m la rampa dobla 47 grados a la izquierda en el nodo 3
  const geo = (otra) => {
    const ctx = scenario({ route: [[0, -300], [0, 0], [15, 100], [30, 180], [-60, 300], [-200, 450]],
      extraNodes: [[-5, 150], [-5, 600], ...otra], edges: [[1, 6], [6, 7], [3, 8], [8, 9]] });
    ctx.pts[3][3] = 1;
    return ctx;
  };
  // en el nodo 3 solo sale otra calle que vuelve para atras: el giro se
  // calla, no se anuncia, y la salida tiene que avisarse
  assert.equal(turnAfterFork(geo([[100, 100], [150, 0]]), 1), false);
  // una calle que sigue derecho al norte: el giro de la rampa se anuncia y
  // la salida se deja (como antes)
  assert.equal(turnAfterFork(geo([[35, 400], [40, 700]]), 1), true);
  // sin grafo no se sabe si se calla: cuenta
  assert.equal(turnAfterFork({ ...geo([[100, 100], [150, 0]]), adjacency: null }, 1), true);
  // el giro mas lejos que legM no cuenta
  assert.equal(turnAfterFork(geo([[35, 400], [40, 700]]), 1, 150), false);
  // Salir a la derecha y doblar a la izquierda al final de la rampa: la salida
  // se avisa primero (salida 115 de Rockford, Discord 18-10). Si el giro es
  // para el mismo lado, como antes.
  assert.equal(turnAfterFork(geo([[35, 400], [40, 700]]), 1, 250, 50, 100, undefined, 60, 'right'), false);
  assert.equal(turnAfterFork(geo([[35, 400], [40, 700]]), 1, 250, 50, 100, undefined, 60, 'left'), true);
  // Si el nodo no es una salida de una mano (en el prefab de una rotonda o
  // un cruce, una calle vuelve al nodo), tambien como antes.
  const dobleMano = geo([[35, 400], [40, 700]]);
  dobleMano.adjacency.get(6).push([1]);
  assert.equal(turnAfterFork(dobleMano, 1, 250, 50, 100, undefined, 60, 'right'), true);
});

test('turnAfterFork: la cruz que sigue a la curva callada de la rampa no tapa la salida (US-395 en Spokane, 23-10)', () => {
  const { turnAfterFork, continuesTurn, junctionManeuver } = require('./pure.js');
  // la ruta sale a la derecha de la autopista en el nodo 1, la rampa dobla a
  // la derecha sin otra calle en el nodo 5 (callada) y 20 m despues cruza
  // derecho una cruz (nodo 7). Medido con 60 m de entrada, en la cruz "dobla"
  // 45 grados y hay otras calles: un giro que se anuncia, pero
  // findUpcomingTurn lo junta con la curva callada (continuesTurn) y no dice
  // nada. Contarlo dejaba sin aviso la salida ("Continue straight" en la
  // salida a la US-395 norte, ATS, -80764,-58654)
  const ctx = scenario({ route: [[0, -300], [0, 0], [13, 44], [22, 114], [24, 170], [38, 188], [43, 188], [58, 188], [103, 187], [200, 186]],
    extraNodes: [[-4, 46], [-10, 400], [81, 209], [100, 400], [81, 165], [100, -50]],
    edges: [[1, 10], [10, 11], [7, 12], [12, 13], [7, 14], [14, 15]] });
  ctx.pts[5][3] = 1;
  ctx.pts[7][3] = 1;
  const geoCtx = { ...ctx, legM: 60, turnThreshold: 35 };
  // asi lo ve findUpcomingTurn: la curva callada y la cruz que la sigue
  const curva = junctionManeuver({ ...geoCtx, i: 5, iEnd: 5 }, 50, 100, 0, 60).m;
  const cruz = junctionManeuver({ ...geoCtx, i: 7, iEnd: 7 }, 50, 100, 0, 60).m;
  assert.deepEqual([curva.kind, curva.quiet, cruz.kind, cruz.quiet], ['turn', true, 'turn', false]);
  assert.ok(continuesTurn({ direction: curva.direction, outBearing: curva.outBearing, quiet: true, end: ctx.cum[5] }, cruz, ctx.cum[7], 80, 135, 35));
  assert.equal(turnAfterFork(geoCtx, 1, 250, 50, 100, 0, 60, 'right'), false);
  // sin la curva callada antes, la cruz que dobla de verdad sigue contando
  const sinCurva = scenario({ route: [[0, -300], [0, 0], [13, 44], [22, 114], [24, 170], [70, 220], [120, 230]],
    extraNodes: [[-4, 46], [-10, 400], [24, 300], [24, 500]],
    edges: [[1, 7], [7, 8], [4, 9], [9, 10]] });
  sinCurva.pts[4][3] = 1;
  assert.equal(turnAfterFork({ ...sinCurva, legM: 60, turnThreshold: 35 }, 1, 250, 50, 100, 0, 60, 'right'), true);
});

test('maneuver: seguir por la autopista cuando sale una rampa suave -> nada (la ruta es la mas recta)', () => {
  const ctx = scenario({ route: [[0, -300], [0, 0], [0, 120], [0, 400]],
                         extraNodes: [[14, 120], [40, 400]], edges: [[1, 4], [4, 5]] });
  assert.equal(detectManeuver(ctx), null);
});

test('layoutAnchor y layoutCss: un panel pegado abajo sigue pegado abajo con el mapa mas alto (Gargamosch, 11-10)', () => {
  const { layoutAnchor, layoutCss } = require('./pure.js');
  const area = { left: 0, top: 0, width: 400, height: 600 };
  // abajo a la derecha, pegado al borde: se guarda desde abajo y la derecha
  const abajo = layoutAnchor({ left: 250, top: 480, width: 150, height: 120 }, area);
  assert.deepEqual(abajo, { r: 0, b: 0 });
  assert.deepEqual(layoutCss(abajo), { left: 'auto', right: '0%', top: 'auto', bottom: '0%', transformOrigin: '100% 100%' });
  // arriba a la izquierda: como antes, desde arriba y la izquierda
  const arriba = layoutAnchor({ left: 20, top: 30, width: 100, height: 50 }, { ...area, left: 10, top: 10 });
  assert.deepEqual(arriba, { x: 2.5, y: 3.3 });
  assert.deepEqual(layoutCss(arriba), { left: '2.5%', right: 'auto', top: '3.3%', bottom: 'auto', transformOrigin: '0 0' });
  // lo guardado antes del cambio ({x, y}) se lee igual
  assert.deepEqual(layoutCss({ x: 60, y: 80, s: 1.5 }), { left: '60%', right: 'auto', top: '80%', bottom: 'auto', transformOrigin: '0 0' });
  // un poco afuera del mapa (redondeos) no da negativos
  assert.deepEqual(layoutAnchor({ left: 251, top: 481, width: 150, height: 120 }, area), { r: 0, b: 0 });
});

test('routeProgressTotal: la barra no vuelve a cero al recargar (Gargamosch, 11-10)', () => {
  const { routeProgressTotal } = require('./pure.js');
  const now = 1e12, H = 3600 * 1000;
  // con trabajo, por el GPS del juego: la distancia planeada aunque la pagina sea nueva
  assert.equal(routeProgressTotal({ kind: 'dest', manual: false, plannedKm: 2300, remainingKm: 1140, seenKm: 0, key: 'a', now }), 2300);
  // yendo a buscar la carga, o con ruta propia, la planeada no cuenta
  assert.equal(routeProgressTotal({ kind: 'pickup', manual: false, plannedKm: 2300, remainingKm: 12, seenKm: 15, key: 'a', now }), 15);
  assert.equal(routeProgressTotal({ kind: 'dest', manual: true, plannedKm: 2300, remainingKm: 900, seenKm: 0, key: 'a', now }), 900);
  // sin trabajo: lo guardado para esta ruta, si no vencio y es la misma
  const stored = { key: 'a', total: 640, at: now - H };
  assert.equal(routeProgressTotal({ kind: 'waypoint', manual: true, remainingKm: 300, seenKm: 0, stored, key: 'a', now }), 640);
  assert.equal(routeProgressTotal({ kind: 'waypoint', manual: true, remainingKm: 300, seenKm: 0, stored, key: 'b', now }), 300);
  assert.equal(routeProgressTotal({ kind: 'waypoint', manual: true, remainingKm: 300, seenKm: 0, stored: { ...stored, at: now - 13 * H }, key: 'a', now }), 300);
  // nunca menos de lo que falta ni de lo visto
  assert.equal(routeProgressTotal({ kind: 'dest', manual: false, plannedKm: 500, remainingKm: 520, seenKm: 530, key: 'a', now }), 530);
  assert.equal(routeProgressTotal({ kind: 'dest', manual: false, plannedKm: null, remainingKm: null, seenKm: 0, key: 'a', now }), 0);
});

test('routeDismissed: la ruta borrada a mano se puede volver a mostrar (Discord, 15-10)', () => {
  const { routeIdentity, routeDismissed } = require('./pure.js');
  const viaje = { game: 'ats', citySrc: 'Reno', cityDst: 'Elko', companySrcId: 'wal', companyDstId: 'tree_et',
    onJob: true, isCargoLoaded: true, cargo: 'Lumber' };
  const objetivo = { kind: 'dest', key: 'dest:tree_et@elko' };
  const borrada = routeIdentity(viaje);
  // el mismo viaje: oculta, con el boton para traerla
  assert.equal(routeDismissed(borrada, { ...viaje, position: { x: 1, z: 2 } }, objetivo), true);
  // otro trabajo, o enganchar la carga: la ruta vuelve sola y no hay "oculta"
  assert.equal(routeDismissed(borrada, { ...viaje, cityDst: 'Ely' }, objetivo), false);
  assert.equal(routeDismissed(borrada, { ...viaje, isCargoLoaded: false }, objetivo), false);
  // nada que mostrar (sin trabajo ni waypoints) o nada borrado: no hay boton
  assert.equal(routeDismissed(borrada, viaje, null), false);
  assert.equal(routeDismissed(null, viaje, objetivo), false);
  assert.equal(routeDismissed(borrada, null, objetivo), false);
  // cliente viejo sin los campos del trabajo: igual se reconoce el mismo viaje
  const viejo = { game: 'ets2', cityDst: 'Berlin' };
  assert.equal(routeDismissed(routeIdentity(viejo), { ...viejo }, objetivo), true);
});

test('routeDismissed: una ruta de waypoints borrada tambien se puede traer (Brackenreach, 15-10)', () => {
  const { routeIdentity, routeDismissed, plainWaypoints } = require('./pure.js');
  // destino del evento de Halloween, fuera del mapa: sin objetivo propio, la
  // ruta eran los waypoints, y el borrado se los llevo
  const evento = { game: 'ats', citySrc: 'Dallas', cityDst: 'Brackenreach', companySrcId: 'wal', companyDstId: 'castle',
    onJob: true, isCargoLoaded: true, cargo: 'Halloween Treats' };
  const borrada = routeIdentity(evento);
  assert.equal(routeDismissed(borrada, evento, null, 2), true);
  assert.equal(routeDismissed(borrada, evento, null, 0), false);
  assert.equal(routeDismissed(borrada, evento, null), false);
  // otro viaje: el borrado ya no cuenta, aunque haya waypoints guardados
  assert.equal(routeDismissed(borrada, { ...evento, onJob: false }, null, 2), false);
  // lo que se guarda: sin marcador y sin el de seguir al lider del convoy
  const marcador = { remove() {} };
  assert.deepEqual(plainWaypoints([
    { pos: [1, 2], inGame: true, label: 'A', kind: null, marker: marcador },
    { pos: [3, 4], inGame: false, label: null, kind: 'g', marker: marcador },
    { pos: [5, 6], inGame: false, label: 'Lider', marker: marcador, convoyFollow: true },
  ]), [
    { pos: [1, 2], inGame: true, label: 'A' },
    { pos: [3, 4], inGame: false, label: null, kind: 'g' },
  ]);
});

test('offMapJobPlace: trabajo a un lugar que no esta en el mapa (Brackenreach, 15-10)', () => {
  const { offMapJobPlace } = require('./pure.js');
  const evento = { game: 'ats', citySrc: 'Dallas', cityDst: 'Brackenreach', companyDst: 'Castle Brackenhelm',
    onJob: true, isCargoLoaded: true };
  // sin objetivo con el mapa ya cargado: se dice por que no hay ruta
  assert.equal(offMapJobPlace(evento, null, true), 'Brackenreach');
  assert.equal(offMapJobPlace({ ...evento, cityDst: '' }, null, true), 'Castle Brackenhelm');
  // mientras cargan las ciudades o los POIs tampoco se encuentra: nada
  assert.equal(offMapJobPlace(evento, null, false), null);
  // con un waypoint (o el destino encontrado) ya hay objetivo
  assert.equal(offMapJobPlace(evento, { kind: 'waypoint', key: 'wp:1,2' }, true), null);
  // sin trabajo, o cliente viejo sin onJob: no hay destino que avisar
  assert.equal(offMapJobPlace({ ...evento, onJob: false }, null, true), null);
  assert.equal(offMapJobPlace({ game: 'ats', cityDst: 'Brackenreach' }, null, true), null);
  assert.equal(offMapJobPlace({ game: 'ats', onJob: true }, null, true), null);
  assert.equal(offMapJobPlace(null, null, true), null);
});

test('hasJobDestination: un trabajo terminado sin evento no deja la ruta al destino (16-10)', () => {
  const { hasJobDestination } = require('./pure.js');
  const trabajo = { game: 'ats', citySrc: 'Reno', cityDst: 'Sacramento', companyDstId: 'wal_food',
    cityDstId: 'sacramento', jobMarket: 'external_contracts', onJob: true, isCargoLoaded: true };
  assert.equal(hasJobDestination(trabajo), true);
  // carga externa cancelada al pedir la grua: onJob en false, el destino queda
  assert.equal(hasJobDestination({ ...trabajo, onJob: false }), false);
  // con el evento el plugin borra el destino
  assert.equal(hasJobDestination({ ...trabajo, onJob: false, cityDst: null }), false);
  // cliente < 1.3.1, sin onJob: rutea al destino como antes
  const { onJob, ...viejo } = trabajo;
  assert.equal(hasJobDestination(viejo), true);
  assert.equal(hasJobDestination({ game: 'ats', onJob: true }), false);
  assert.equal(hasJobDestination(null), false);
});

test('noRouteReason: sin trabajo, la ruta del GPS del juego se explica en vez de "No destination set" (#56)', () => {
  const { noRouteReason } = require('./pure.js');
  // ATS sin trabajo con un destino puesto en el GPS del juego: el SDK da los km, no el punto
  assert.equal(noRouteReason({ hasTarget: false, hasRoute: false, gameRouteKm: 312.4 }), 'game_gps');
  // ni trabajo ni GPS del juego
  assert.equal(noRouteReason({ hasTarget: false, hasRoute: false, gameRouteKm: 0 }), 'none');
  // clientes viejos sin el campo
  assert.equal(noRouteReason({ hasTarget: false, hasRoute: false, gameRouteKm: undefined }), 'none');
  assert.equal(noRouteReason({ hasTarget: false, hasRoute: false, gameRouteKm: NaN }), 'none');
  // con trabajo o waypoint la app tiene a donde ir: si no hay indicaciones es por otra cosa
  assert.equal(noRouteReason({ hasTarget: true, hasRoute: false, gameRouteKm: 312.4 }), null);
  assert.equal(noRouteReason({ hasTarget: false, hasRoute: true, gameRouteKm: 312.4 }), null);
});

test('gameRouteDistanceText: entero lejos, un decimal cerca, en millas con imperial', () => {
  const { gameRouteDistanceText } = require('./pure.js');
  assert.equal(gameRouteDistanceText(312.4, false, 'en'), '312 km');
  assert.equal(gameRouteDistanceText(1312.4, false, 'en'), '1,312 km');
  assert.equal(gameRouteDistanceText(4.56, false, 'es'), '4,6 km');
  assert.equal(gameRouteDistanceText(100, true, 'en'), '62 mi');
  assert.equal(gameRouteDistanceText(10, true, 'en'), '6.2 mi');
});

test('jobPanelFields: el panel no sigue con el trabajo cancelado (16-10)', () => {
  const { jobPanelFields } = require('./pure.js');
  const trabajo = { game: 'ats', citySrc: 'Reno', cityDst: 'Sacramento', cargo: 'Bulldozer', cargoMassKg: 16200,
    jobIncome: 61158, jobDeadlineSeconds: 7200, onJob: true };
  const enCurso = { citySrc: 'Reno', cityDst: 'Sacramento', cargo: 'Bulldozer', cargoMassKg: 16200,
    income: 61158, deadlineSeconds: 7200 };
  const nada = { citySrc: null, cityDst: null, cargo: null, cargoMassKg: null, income: null, deadlineSeconds: null };
  assert.deepEqual(jobPanelFields(trabajo), enCurso);
  // terminado sin evento: los campos quedan, el panel no los muestra
  assert.deepEqual(jobPanelFields({ ...trabajo, onJob: false }), nada);
  // vencido sigue siendo un vencimiento (en rojo), no "sin vencimiento"
  assert.equal(jobPanelFields({ ...trabajo, jobDeadlineSeconds: 0 }).deadlineSeconds, 0);
  assert.equal(jobPanelFields({ ...trabajo, jobDeadlineSeconds: -60 }).deadlineSeconds, -60);
  // cliente < 1.3.1, sin onJob: como antes
  const { onJob, ...viejo } = trabajo;
  assert.deepEqual(jobPanelFields(viejo), enCurso);
  assert.deepEqual(jobPanelFields(null), nada);
});

test('jobDeadlineSeconds: el "sin plazo" del SDK no es un plazo (Discord, 17-10)', () => {
  const { jobDeadlineSeconds, jobPanelFields } = require('./pure.js');
  // la entrega en 2^32 - 1 minutos menos la hora del juego: "71567355h 55m"
  const sinPlazo = (4294967295 - 925940) * 60;
  assert.equal(Math.floor(sinPlazo / 3600), 71567355);
  assert.equal(jobDeadlineSeconds({ jobDeadlineSeconds: sinPlazo }), null);
  assert.equal(jobPanelFields({ cityDst: 'Cheyenne', jobDeadlineSeconds: sinPlazo, onJob: true }).deadlineSeconds, null);
  // un plazo de verdad, vencido o no, sigue
  assert.equal(jobDeadlineSeconds({ jobDeadlineSeconds: 9 * 3600 }), 9 * 3600);
  assert.equal(jobDeadlineSeconds({ jobDeadlineSeconds: -60 }), -60);
  assert.equal(jobDeadlineSeconds({ jobDeadlineSeconds: 30 * 24 * 3600 }), 30 * 24 * 3600);
  assert.equal(jobDeadlineSeconds({ jobDeadlineSeconds: null }), null);
  assert.equal(jobDeadlineSeconds(null), null);
});

test('demo: la ruta guardada sirve solo con el mismo grafo y la misma version del mapa', () => {
  const { demoPathUsable } = require('./pure.js');
  const fs = require('node:fs');
  const path = require('node:path');
  const buena = { rev: 5, mapData: '20260929', path: [[0, 0], [10, 5], [20, 9]] };
  assert.deepEqual(demoPathUsable(buena, 5, '20260929'), buena.path);
  // Otro grafo u otros datos: el camion se iria de la ruta que dibuja la app
  assert.equal(demoPathUsable(buena, 6, '20260929'), null);
  assert.equal(demoPathUsable(buena, 5, '20261012'), null);
  assert.equal(demoPathUsable(buena, 5, ''), null);
  // Archivo roto o que no llego
  assert.equal(demoPathUsable(null, 5, '20260929'), null);
  assert.equal(demoPathUsable({ ...buena, path: [[0, 0]] }, 5, '20260929'), null);
  assert.equal(demoPathUsable({ ...buena, path: [[0, 0], [1, null]] }, 5, '20260929'), null);
  assert.equal(demoPathUsable({ ...buena, path: 'x' }, 5, '20260929'), null);
  // El archivo publicado corresponde al grafo y al mapa que pide la app hoy:
  // si se sube ROUTE_GRAPH_V3_REV o la version de ATS, correr
  // python tools/build_demo_route.py
  const guardada = JSON.parse(fs.readFileSync(path.join(__dirname, 'demo-route-ats.json'), 'utf8'));
  const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const variantes = fs.readFileSync(path.join(__dirname, 'variants.js'), 'utf8');
  const rev = Number(app.match(/const ROUTE_GRAPH_V3_REV = (\d+);/)[1]);
  const mapData = variantes.match(/"ats": "(\d+)"/)[1];
  assert.ok(demoPathUsable(guardada, rev, mapData),
    `demo-route-ats.json es del grafo ${guardada.rev}/${guardada.mapData} y la app pide ${rev}/${mapData}: correr python tools/build_demo_route.py`);
});

test('numeros con el idioma de la interfaz y peso de la carga en t o lb', () => {
  const { formatInt, formatCargoMass } = require('./pure.js');
  assert.equal(formatInt(61158, 'en'), '61,158');
  assert.equal(formatInt(61158, 'es'), '61.158');
  assert.equal(formatInt(61158, 'de'), '61.158');
  assert.equal(formatInt(184225.4, 'en'), '184,225');
  assert.equal(formatInt(null, 'en'), '0');
  assert.equal(formatCargoMass(18189, 'en', false), '18.2 t');
  assert.equal(formatCargoMass(18189, 'es', false), '18,2 t');
  assert.equal(formatCargoMass(18189, 'en', true), '40,100 lb');
  assert.equal(formatCargoMass(0, 'en', false), '');
  assert.equal(formatCargoMass(undefined, 'en', true), '');
});

test('decimales con la coma o el punto del idioma de la interfaz', () => {
  const { formatDec, formatTurnDistance } = require('./pure.js');
  assert.equal(formatDec(760.84, 'en'), '760.8');
  assert.equal(formatDec(760.84, 'es'), '760,8');
  assert.equal(formatDec(1532, 'en'), '1,532.0');
  assert.equal(formatTurnDistance(9500, false, 'es'), '9,5 km');
  assert.equal(formatTurnDistance(9500, false), '9.5 km');
  assert.equal(formatTurnDistance(11000, false, 'de'), '11 km');
  assert.equal(formatTurnDistance(2.5 * 1609.344, true, 'pl'), '2,5 mi');
  assert.equal(formatTurnDistance(0.4 * 1609.344, true, 'en'), '0.4 mi');
});

test('proxima ciudad: la de adelante, no la que acaba de quedar atras', () => {
  const { nextCityAlongRoute } = require('./pure.js');
  // Ruta recta hacia el sur desde el camion (0, 0) hasta (0, -20000)
  const ruta = [];
  for (let z = 0; z >= -20000; z -= 100) ruta.push([0, z]);
  const provo = { Name: 'Provo', X: 0, Y: 2200 };          // atras, a 2,2 km del camion
  const salina = { Name: 'Salina', X: 500, Y: -15000 };    // adelante, al costado de la ruta
  const lejos = { Name: 'Salina KS', X: 60000, Y: -15000 }; // mismo nombre, otro estado
  const nephi = { Name: 'Nephi', X: -800, Y: -6000 };      // adelante y antes que Salina
  assert.equal(nextCityAlongRoute(ruta, [provo, salina, lejos], [0, 0]), 'Salina');
  assert.equal(nextCityAlongRoute(ruta, [provo, salina, nephi], [0, 0]), 'Nephi');
  // La que se esta atravesando (centro a menos de 2 km) no cuenta
  assert.equal(nextCityAlongRoute(ruta, [{ Name: 'Aca', X: 0, Y: -1500 }, salina], [0, 0]), 'Salina');
  // Si la lista trae tramo de atras, se mide desde donde esta el camion
  const conAtras = [[0, 5000], [0, 2500], ...ruta];
  assert.equal(nextCityAlongRoute(conAtras, [provo, salina], [0, 0]), 'Salina');
  assert.equal(nextCityAlongRoute(ruta, [lejos], [0, 0]), null);
  assert.equal(nextCityAlongRoute([[0, 0]], [salina], [0, 0]), null);
});

test('proxima ciudad: pasada una ciudad, una vuelta de la ruta que se le arrima unos metros no la vuelve a hacer proxima (Vancouver, ATS)', () => {
  const { nextCityAlongRoute } = require('./pure.js');
  // El camion en (0, 0) se aleja al este de Vancouver (centro a 2,21 km al
  // oeste); 885 m adelante la ruta serpentea y queda a 2,10 km, y sigue
  // al este hasta Yakima.
  const ruta = [[0, 0], [300, 300], [-150, 400], [2000, 600], [5000, 350], [9000, 0]];
  const vancouver = { Name: 'Vancouver', X: -2213, Y: 0 };
  const yakima = { Name: 'Yakima', X: 9000, Y: 300 };
  assert.equal(nextCityAlongRoute(ruta, [vancouver, yakima], [0, 0]), 'Yakima');
  // Sin el margen salia Vancouver
  assert.equal(nextCityAlongRoute(ruta, [vancouver, yakima], [0, 0], { approachM: 0 }), 'Vancouver');
  // Una que la ruta todavia tiene que atravesar sale igual
  const nephi = { Name: 'Nephi', X: 5000, Y: -200 };
  assert.equal(nextCityAlongRoute(ruta, [vancouver, nephi, yakima], [0, 0]), 'Nephi');
});

test('escudos de ruta: uno por ruta y por celda, solo los carteles con numero (Discord, 19-10)', () => {
  const { roadShieldPoints } = require('./pure.js');
  const carteles = [
    // tres de la US-20 en la misma celda: queda el del medio
    { x: 100, y: 100, label: 'US-20', kind: 'road' },
    { x: 1000, y: 1000, label: 'US-20', kind: 'road' },
    { x: 1900, y: 1900, label: 'US-20', kind: 'road' },
    // otra ruta en el mismo cruce: tiene el suyo
    { x: 1000, y: 1000, label: 'I-80', kind: 'road' },
    // la misma ruta en otra celda: otro escudo
    { x: 5000, y: 100, label: 'US-20', kind: 'road' },
    // ETS2: nombres de ciudad, sin numero de ruta
    { x: 300, y: 300, label: 'Berlin', kind: 'city' },
    // datos rotos
    { x: NaN, y: 1, label: 'US-1', kind: 'road' }, null, { x: 1, y: 1, label: '', kind: 'road' },
  ];
  const escudos = roadShieldPoints(carteles, 2000).map(e => `${e.label}@${e.x},${e.y}:${e.k}:${e.n}`).sort();
  assert.deepEqual(escudos, ['I-80@1000,1000:i:80', 'US-20@1000,1000:us:20', 'US-20@5000,100:us:20']);
  assert.deepEqual(roadShieldPoints(null, 2000), []);
  assert.deepEqual(roadShieldPoints(carteles, 0), []);
});

test('carteles: grilla igual a la busqueda lineal', () => {
  const { buildPointGrid, nearestInGrid } = require('./pure.js');
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const signs = [];
  for (let i = 0; i < 3000; i++) signs.push({ x: rnd() * 20000 - 10000, y: rnd() * 20000 - 10000, label: 'S' + i });
  const lineal = (x, z, max) => { let b = null, bd = max; for (const s of signs) { const d = Math.hypot(s.x - x, s.y - z); if (d < bd) { bd = d; b = s; } } return b; };
  const grid = buildPointGrid(signs, 500);
  for (let k = 0; k < 400; k++) {
    const x = rnd() * 22000 - 11000, z = rnd() * 22000 - 11000;
    for (const max of [150, 400, 1200]) assert.equal(nearestInGrid(grid, x, z, max), lineal(x, z, max));
  }
  assert.equal(nearestInGrid(null, 0, 0, 100), null);
});

test('nombre del giro: el de la salida, no un cartel de destino junto al vertice', () => {
  const { roadSignForTurn, buildPointGrid, nearestInGrid } = require('./pure.js');
  // Salida recta hacia el sur desde (0, 0); carteles de la US-189 al costado
  // desde los 700 m, y uno de destino "I-80" a 250 m del vertice.
  const signs = [{ x: 250, y: 0, label: 'I-80', kind: 'road' }];
  for (let z = 700; z <= 1500; z += 200) signs.push({ x: 40, y: z, label: 'US-189', kind: 'road' });
  const grid = buildPointGrid(signs);
  const nearest = (x, z, max) => nearestInGrid(grid, x, z, max);
  const pointAt = (m) => [0, m];
  assert.equal(roadSignForTurn(pointAt, 0, 5000, nearest, [0, 20]).label, 'US-189');
  // Sin carteles al costado de la salida: el criterio de antes (el mas cercano)
  const solo = buildPointGrid([{ x: 250, y: 0, label: 'I-80', kind: 'road' }]);
  assert.equal(roadSignForTurn(pointAt, 0, 5000, (x, z, m) => nearestInGrid(solo, x, z, m), [0, 20]).label, 'I-80');
  // La ruta vuelve a doblar a los 300 m: la calle de este giro junta mas votos
  const dobla = [{ x: 30, y: 60, label: 'A', kind: 'road' }, { x: 30, y: 150, label: 'A', kind: 'road' },
    { x: 30, y: 500, label: 'B', kind: 'road' }, { x: 30, y: 800, label: 'B', kind: 'road' }];
  const g2 = buildPointGrid(dobla);
  assert.equal(roadSignForTurn(pointAt, 0, 5000, (x, z, m) => nearestInGrid(g2, x, z, m), null).label, 'A');
  // Cerca del final de la ruta: solo las muestras que entran
  assert.equal(roadSignForTurn(pointAt, 0, 100, nearest, null), null);
  // Carteles de destino (ETS2) sin onExit (rotondas): no votan, queda el del
  // cruce aunque mas adelante haya uno de la otra mano
  const destinos = buildPointGrid([{ x: 60, y: 20, label: 'Venezia', kind: 'city' },
    { x: 30, y: 600, label: 'Firenze', kind: 'city' }, { x: 30, y: 900, label: 'Firenze', kind: 'city' }]);
  assert.equal(roadSignForTurn(pointAt, 0, 5000, (x, z, m) => nearestInGrid(destinos, x, z, m), [0, 20]).label, 'Venezia');
});

test('nombre del giro: el cartel del cruce o el de la otra rama no nombra la salida (I-80 en Salt Lake City, Discord 19-10)', () => {
  const { roadSignForTurn, exitSignTest, otherBranchesAt, buildPointGrid, nearestInGrid } = require('./pure.js');
  // La autopista llega del sur al nodo 1; la ruta sale a la derecha por la
  // rampa (nodos 2, 3, 4) y la autopista sigue derecho (nodos 5, 6, 7).
  const ctx = scenario({ route: [[0, -300], [0, 0], [40, 250], [120, 500], [200, 1500]],
    extraNodes: [[0, 100], [0, 700], [0, 1500]], edges: [[1, 5], [5, 6], [6, 7]] });
  const others = otherBranchesAt(ctx);
  assert.equal(others.length, 1);
  assert.deepEqual(others[0](700).map(Math.round), [0, 700]);
  assert.equal(others[0](1600), null);
  // El cartel de la autopista en el cruce, 14 m antes del nodo, y los de la
  // rampa mas adelante: a 60 y 150 m el del cruce era el mas cercano, empataba
  // con los dos de la rampa y ganaba por salir primero.
  const signs = [{ x: 5, y: -13, label: 'I-80', kind: 'road' }, { x: -10, y: 700, label: 'I-80', kind: 'road' },
    { x: 130, y: 520, label: 'I-84', kind: 'road' }, { x: 150, y: 800, label: 'I-84', kind: 'road' }];
  const grid = buildPointGrid(signs);
  const nearest = (x, z, m) => nearestInGrid(grid, x, z, m);
  const { pointAt, cum } = ctx;
  // Sin onExit, desde el 21-10 tambien la I-84: el del cruce vota una vez
  // aunque lo encuentren las muestras de 60 y 150 m (antes empataba 2 a 2)
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], nearest, null).label, 'I-84');
  const onExit = exitSignTest({ ...ctx, iEnd: 1, others });
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], nearest, null, { onExit }).label, 'I-84');
  assert.equal(onExit(signs[0]), false);
  assert.equal(onExit(signs[2]), true);
  // El de la autopista que corre al lado de la rampa queda mas cerca de la otra rama
  assert.equal(onExit({ x: 14, y: 200, label: 'I-80', kind: 'road' }), false);
  // Con solo el del cruce, sin nombre: el respaldo seria ese mismo cartel
  const solo = buildPointGrid([signs[0]]);
  const soloNearest = (x, z, m) => nearestInGrid(solo, x, z, m);
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], soloNearest, [10, 60], { onExit }), null);
  // Sin ningun cartel de ruta cerca de la salida queda el respaldo de antes
  const lejos = buildPointGrid([{ x: 380, y: 0, label: 'US-6', kind: 'road' }]);
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], (x, z, m) => nearestInGrid(lejos, x, z, m), [10, 60], { onExit }).label, 'US-6');
});

test('nombre del giro: no vota el cartel de la otra mano ("Turn left onto I-90" al final de la salida, Discord 20-10)', () => {
  const { roadSignForTurn, exitSignTest, buildPointGrid, nearestInGrid } = require('./pure.js');
  // La rampa llega del sur al nodo 1 y la ruta dobla a la izquierda, al
  // oeste, por la calle que cruza la autopista recien dejada. En el puente,
  // del lado sur (a la izquierda yendo al oeste), los carteles de sus rampas
  // para el que viene de enfrente; la calle nueva tiene el suyo a la derecha.
  const ctx = scenario({ route: [[0, -300], [0, 0], [-60, 0], [-400, 0]] });
  const { pointAt, cum } = ctx;
  const signs = [{ x: -150, y: -12, label: 'I-90', kind: 'road' }, { x: -250, y: 10, label: 'US-20', kind: 'road' }];
  const grid = buildPointGrid(signs);
  const nearest = (x, z, m) => nearestInGrid(grid, x, z, m);
  const onExit = exitSignTest({ ...ctx, iEnd: 1 });
  assert.equal(onExit(signs[0]), false);
  assert.equal(onExit(signs[1]), true);
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], nearest, null, { onExit }).label, 'US-20');
  // Sin rumbos (como antes) votaba la de la otra mano, que quedaba mas cerca
  const sinLado = exitSignTest({ ...ctx, bearingBetween: undefined, iEnd: 1 });
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], nearest, null, { onExit: sinLado }).label, 'I-90');
  // Con solo ese cartel, sin nombre (no el respaldo, que lo encontraria igual)
  const gridSolo = buildPointGrid([signs[0]]);
  const solo = (x, z, m) => nearestInGrid(gridSolo, x, z, m);
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], solo, [-70, 0], { onExit }), null);
  // A 4 m a la izquierda todavia vota: un portico sobre la calzada queda
  // casi en la linea de la ruta
  assert.equal(onExit({ x: -150, y: -4, label: 'US-20', kind: 'road' }), true);
});

test('nombre del giro: vota el cartel mas cercano que es de la salida, y una vez (Lafayette -> DeRidder y Sheridan, ATS, 21-10)', () => {
  const { roadSignForTurn, exitSignTest, buildPointGrid, nearestInGrid } = require('./pure.js');
  // Dobla a la izquierda, al oeste, en el nodo 1 (como el de la otra mano).
  const ctx = scenario({ route: [[0, -300], [0, 0], [-60, 0], [-1500, 0]] });
  const { pointAt, cum } = ctx;
  const onExit = exitSignTest({ ...ctx, iEnd: 1 });
  // Uno de la otra mano junto a cada muestra tapaba al de la calle nueva, a 40 m
  const signs = [-60, -150, -300, -500, -800, -1200].map((x) => ({ x, y: -12, label: 'I-10', kind: 'road' }));
  signs.push({ x: -110, y: 12, label: 'US-165', kind: 'road' });
  const grid = buildPointGrid(signs);
  const conFiltro = (x, z, m, ok) => nearestInGrid(grid, x, z, m, ok);
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], conFiltro, null, { onExit }).label, 'US-165');
  // Con un nearest que no filtra, como antes: sin nombre (no vota el rechazado)
  const sinFiltro = (x, z, m) => nearestInGrid(grid, x, z, m);
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], sinFiltro, null, { onExit }), null);
  // nearestInGrid con ok: el mas cercano que cumple
  assert.equal(nearestInGrid(grid, -60, 0, 200, (s) => s.label === 'US-165').label, 'US-165');
  assert.equal(nearestInGrid(grid, -60, 0, 200).label, 'I-10');
  // Un cartel a 45 m de las muestras de 60 y 150 m votaba dos veces y
  // empataba con dos de la calle nueva; ahora vota una
  const dos = buildPointGrid([{ x: -105, y: 10, label: 'I-90 Bus', kind: 'road' },
    { x: -300, y: 10, label: 'I-25', kind: 'road' }, { x: -500, y: 10, label: 'I-25', kind: 'road' }]);
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], (x, z, m, ok) => nearestInGrid(dos, x, z, m, ok), null, { onExit }).label, 'I-25');
});

test('nombre del giro: en una bifurcacion, el cartel pegado al nodo vota solo si no hay otro ("Keep right onto I-20" en Shreveport, ATS, 21-10)', () => {
  const { roadSignForTurn, exitSignTest, otherBranchesAt, buildPointGrid, nearestInGrid, ROAD_SIGN_FORK_NEAR_M } = require('./pure.js');
  // La ruta sale a la derecha por la rampa (nodos 2, 3, 4) y la otra rama
  // sigue derecho (5, 6, 7). A 60 m del nodo, del lado de la rampa, un
  // cartel de la autopista que se deja; a 600 m, el de la ruta nueva.
  const ctx = scenario({ route: [[0, -300], [0, 0], [40, 250], [120, 500], [200, 1500]],
    extraNodes: [[0, 100], [0, 700], [0, 1500]], edges: [[1, 5], [5, 6], [6, 7]] });
  const { pointAt, cum } = ctx;
  const others = otherBranchesAt(ctx);
  const pegado = { x: 19, y: 58, label: 'I-20', kind: 'road' }, lejos = { x: 140, y: 584, label: 'US-59', kind: 'road' };
  const nearestDe = (lista) => { const grid = buildPointGrid(lista); return (x, z, m, ok) => nearestInGrid(grid, x, z, m, ok); };
  const fork = exitSignTest({ ...ctx, iEnd: 1, others }, { cercaM: ROAD_SIGN_FORK_NEAR_M });
  assert.equal(fork(pegado), true);
  assert.equal(fork.desdeGiro(pegado) < ROAD_SIGN_FORK_NEAR_M, true);
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], nearestDe([pegado, lejos]), null, { onExit: fork }).label, 'US-59');
  // Sin cercaM (un giro, no una bifurcacion) empatan y gana el primero
  const giro = exitSignTest({ ...ctx, iEnd: 1, others });
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], nearestDe([pegado, lejos]), null, { onExit: giro }).label, 'I-20');
  // Si es el unico que vota, nombra igual
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], nearestDe([pegado]), null, { onExit: fork }).label, 'I-20');
});

test('nombre del giro: los carteles de destino votan si son de la salida ("toward TALLINN" saliendo de Tallinn, ETS2, 21-10)', () => {
  const { roadSignForTurn, exitSignTest, buildPointGrid, nearestInGrid } = require('./pure.js');
  // Dobla a la izquierda, al oeste. Junto al cruce, de la otra mano, el de lo
  // que queda atras; a 300 m, de esta mano, el de adonde se va.
  const ctx = scenario({ route: [[0, -300], [0, 0], [-60, 0], [-1500, 0]] });
  const { pointAt, cum } = ctx;
  const onExit = exitSignTest({ ...ctx, iEnd: 1 });
  const atras = { x: -100, y: -12, label: 'TALLINN', kind: 'city' }, adelante = { x: -280, y: 12, label: 'KUNDA', kind: 'city' };
  const nearestDe = (lista) => { const grid = buildPointGrid(lista); return (x, z, m, ok) => nearestInGrid(grid, x, z, m, ok); };
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], nearestDe([atras, adelante]), [-70, 0], { onExit }).label, 'KUNDA');
  // Sin onExit (las rotondas) no votan: el respaldo de siempre
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], nearestDe([atras, adelante]), [-70, 0]).label, 'TALLINN');
  // El respaldo de destino no es de la otra mano, pero puede estar antes del
  // cruce: el que lo anuncia, a la derecha de la llegada
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], nearestDe([atras]), [-70, 0], { onExit }), null);
  const anuncia = { x: 10, y: -50, label: 'NARVA', kind: 'city' };
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], nearestDe([atras, anuncia]), [-70, 0], { onExit }).label, 'NARVA');
  // Los de ruta (ATS) sin votos siguen con el respaldo de antes
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], nearestDe([{ ...atras, kind: 'road', x: -100, y: -300 }]), [-70, 0], { onExit }).label, 'TALLINN');
});

test('exitSignTest: donde se maneja por la izquierda, la otra mano es la derecha (ETS2, Reino Unido)', () => {
  const { exitSignTest } = require('./pure.js');
  const ctx = scenario({ route: [[0, -300], [0, 0], [-60, 0], [-1500, 0]] });
  const derecha = { x: -300, y: 12, label: 'A', kind: 'city' }, izquierda = { x: -300, y: -12, label: 'B', kind: 'city' };
  const porDerecha = exitSignTest({ ...ctx, iEnd: 1 });
  assert.deepEqual([porDerecha(derecha), porDerecha(izquierda)], [true, false]);
  // La corrida de la ruta dibujada (p[6]) negativa: mano izquierda
  const pts = ctx.pts.map((p) => { const q = p.slice(); q[6] = -3; return q; });
  const porIzquierda = exitSignTest({ ...ctx, pts, iEnd: 1 });
  assert.deepEqual([porIzquierda(derecha), porIzquierda(izquierda)], [false, true]);
  assert.deepEqual([porIzquierda.lado(derecha), porIzquierda.lado(izquierda)], [false, true]);
});

test('groupSignsByPoint: los escudos de un mismo cartel quedan juntos', () => {
  const { groupSignsByPoint } = require('./pure.js');
  const signs = groupSignsByPoint([{ x: 1, y: 2, label: 'I-94', kind: 'road' }, { x: 1, y: 2, label: 'I-90', kind: 'road' },
    { x: 1, y: 2, label: 'I-90', kind: 'road' }, { x: 5, y: 2, label: 'US-14', kind: 'road' }]);
  assert.deepEqual(signs[0].labels, ['I-94', 'I-90']);
  assert.deepEqual(signs[2].labels, ['I-94', 'I-90']);
  assert.equal(signs[3].labels, undefined);
  assert.doesNotThrow(() => JSON.stringify(signs));
  assert.deepEqual(groupSignsByPoint(null), null);
  // Las claves del juego de ETS2 no son nombres ("toward traffic_rule.limit_80")
  const ets2 = groupSignsByPoint([{ x: 1, y: 2, label: 'traffic_rule.limit_80', kind: 'city' }, { x: 3, y: 2, label: '@@fp_de_diesel@@', kind: 'city' },
    { x: 5, y: 2, label: 'Beograd', kind: 'city' }, { x: 7, y: 2, label: 'c.nuclear', kind: 'city' }]);
  assert.deepEqual(ets2.map((s) => s.label), ['Beograd', 'c.nuclear']);
});

test('nombre del giro: el portico con dos escudos de una bifurcacion ("Keep left onto I-94" por la I-90 en Chicago, Discord 20-10)', () => {
  const { roadSignForTurn, exitSignTest, otherBranchesAt, groupSignsByPoint, buildPointGrid, nearestInGrid } = require('./pure.js');
  // La ruta sale a la derecha por la rampa (nodos 2, 3, 4) y la otra rama
  // sigue derecho (5, 6, 7). Pasado el nodo, el portico "I-94 / I-90" (una
  // entrada por escudo, la I-94 primero); mas adelante, uno de la I-90 junto
  // a la ruta (de la otra mano: no vota) y uno de la I-94 junto a la otra rama.
  const ctx = scenario({ route: [[0, -300], [0, 0], [40, 250], [120, 500], [200, 1500]],
    extraNodes: [[0, 100], [0, 700], [0, 1500]], edges: [[1, 5], [5, 6], [6, 7]] });
  const { pointAt, cum } = ctx;
  const others = otherBranchesAt(ctx);
  const portico = [{ x: 15, y: 60, label: 'I-94', kind: 'road' }, { x: 15, y: 60, label: 'I-90', kind: 'road' }];
  const conRamas = groupSignsByPoint([...portico.map((s) => ({ ...s })), { x: 66, y: 380, label: 'I-90', kind: 'road' }, { x: 8, y: 700, label: 'I-94', kind: 'road' }]);
  const grid = buildPointGrid(conRamas);
  const nearest = (x, z, m) => nearestInGrid(grid, x, z, m);
  const onExit = exitSignTest({ ...ctx, iEnd: 1, others });
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], nearest, null, { onExit }).label, 'I-90');
  // Solo el portico, como en un tramo compartido: los dos empatan en todo y
  // queda el primero, como antes
  const soloGrid = buildPointGrid(groupSignsByPoint(portico.map((s) => ({ ...s }))));
  const soloPortico = (x, z, m) => nearestInGrid(soloGrid, x, z, m);
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], soloPortico, null, { onExit }).label, 'I-94');
  // Sin agrupar (road-names.json tal cual) votaba solo el primer escudo
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], (x, z, m) => nearestInGrid(buildPointGrid(portico), x, z, m), null, { onExit }).label, 'I-94');
});

test('nombre del giro: en un tramo compartido gana la interestatal ("onto US-36" por la I-72 en Jacksonville, Discord 20-10)', () => {
  const { roadSignForTurn, exitSignTest, groupSignsByPoint, buildPointGrid, nearestInGrid } = require('./pure.js');
  // La ruta llega del norte al nodo 1 y sigue al este por la autopista. A la
  // derecha, un escudo de la US-36 y despues uno de la I-72: dos votos cada
  // uno, y la US-36 aparecio primero.
  const ctx = scenario({ route: [[0, -300], [0, 0], [60, 0], [1500, 0]] });
  const { pointAt, cum } = ctx;
  const onExit = exitSignTest({ ...ctx, iEnd: 1 });
  const separados = [{ x: 100, y: -10, label: 'US-36', kind: 'road' }, { x: 400, y: -10, label: 'I-72', kind: 'road' }];
  const grid = buildPointGrid(separados);
  const nearest = (x, z, m) => nearestInGrid(grid, x, z, m);
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], nearest, null, { onExit }).label, 'I-72');
  // Con una I- con letra tambien (I-35E con la US-77 en Dallas)
  const conLetra = buildPointGrid([separados[0], { ...separados[1], label: 'I-35E' }]);
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], (x, z, m) => nearestInGrid(conLetra, x, z, m), null, { onExit }).label, 'I-35E');
  // Una Bus de interestatal es una calle: no le gana a la US (empate, la primera)
  const bus = buildPointGrid([separados[0], { ...separados[1], label: 'I-72 Bus' }]);
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], (x, z, m) => nearestInGrid(bus, x, z, m), null, { onExit }).label, 'US-36');
  // Si la US tiene mas votos, gana igual
  const masUS = buildPointGrid([...separados, { x: 800, y: -10, label: 'US-36', kind: 'road' }]);
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], (x, z, m) => nearestInGrid(masUS, x, z, m), null, { onExit }).label, 'US-36');
  // Un solo cartel con los dos escudos puede ser el portico de una
  // bifurcacion: ahi decide labelEvidence, como antes (aca, la primera)
  const portico = buildPointGrid(groupSignsByPoint([{ x: 100, y: -10, label: 'US-36', kind: 'road' }, { x: 100, y: -10, label: 'I-72', kind: 'road' }]));
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], (x, z, m) => nearestInGrid(portico, x, z, m), null, { onExit }).label, 'US-36');
});

test('nombre del giro: dos carteles o mas con los dos escudos son un tramo compartido (I-435 / US-50 en Kansas City, ATS 21-10)', () => {
  const { roadSignForTurn, exitSignTest, groupSignsByPoint, buildPointGrid, nearestInGrid } = require('./pure.js');
  const ctx = scenario({ route: [[0, -300], [0, 0], [60, 0], [1500, 0]] });
  const { pointAt, cum } = ctx;
  const onExit = exitSignTest({ ...ctx, iEnd: 1 });
  const cartel = (x, labels) => labels.map((label) => ({ x, y: -10, label, kind: 'road' }));
  const de = (lista) => { const g = buildPointGrid(groupSignsByPoint(lista)); return (x, z, m) => nearestInGrid(g, x, z, m); };
  // Dos carteles "US-50 / I-435": empatan en votos y en evidencia, y no es
  // un portico (son dos): la interestatal
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], de([...cartel(100, ['US-50', 'I-435']), ...cartel(400, ['US-50', 'I-435'])]), null, { onExit }).label, 'I-435');
  // Si entre los empatados esta la "Bus" de esa interestatal, es el cartel
  // de un enlace: queda la primera, como antes
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], de([...cartel(100, ['US-50', 'I-435', 'I-435 Bus']), ...cartel(400, ['US-50', 'I-435', 'I-435 Bus'])]), null, { onExit }).label, 'US-50');
  // Si la US tiene mas votos, gana igual
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], de([...cartel(100, ['US-50', 'I-435']), ...cartel(400, ['US-50', 'I-435']), ...cartel(1300, ['US-50'])]), null, { onExit }).label, 'US-50');
});

test('nombre del giro: el escudo pintado de la US-66 historica no le gana a la ruta de hoy (Kingman, ATS 21-10)', () => {
  const { roadSignForTurn, exitSignTest, groupSignsByPoint, buildPointGrid, nearestInGrid } = require('./pure.js');
  const ctx = scenario({ route: [[0, -300], [0, 0], [60, 0], [1500, 0]] });
  const { pointAt, cum } = ctx;
  const onExit = exitSignTest({ ...ctx, iEnd: 1 });
  const de = (lista) => { const g = buildPointGrid(groupSignsByPoint(lista)); return (x, z, m) => nearestInGrid(g, x, z, m); };
  const hist = (x) => ({ x, y: -10, label: 'US-66 Hist', kind: 'road' });
  // Dos escudos historicos y un cartel de la US-93: la US-93
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], de([hist(100), hist(400), { x: 700, y: -10, label: 'US-93', kind: 'road' }]), null, { onExit }).label, 'US-93');
  // En un cartel con los dos, vota por el otro
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], de([hist(100), { x: 100, y: -10, label: 'I-40 Bus', kind: 'road' }]), null, { onExit }).label, 'I-40 Bus');
  // Uno solo no nombra el aviso, ni por el respaldo (seria el mismo)
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], de([hist(100)]), [100, 0], { onExit }), null);
  // Dos, sin otra ruta: la calle es la US-66 historica
  assert.equal(roadSignForTurn(pointAt, cum[1], cum[cum.length - 1], de([hist(100), hist(400)]), null, { onExit }).label, 'US-66 Hist');
});

// Navegador de mentira para createScreenKeeper: pestana, Wake Lock API con
// pedidos que el test resuelve a mano, y videos.
function navegadorFalso({ api = true } = {}) {
  const env = { pedidos: [], videos: [], agregados: 0 };
  env.doc = {
    visibilityState: 'visible',
    body: { appendChild() { env.agregados++; } },
    createElement() {
      const v = {
        paused: true, attrs: {}, style: {}, plays: 0, bloqueado: false,
        setAttribute(k, val) { this.attrs[k] = val; },
        canPlayType: () => '',
        play() {
          this.plays++;
          if (this.bloqueado) return Promise.reject(new Error('NotAllowedError'));
          this.paused = false;
          return Promise.resolve();
        },
        pause() { this.paused = true; },
      };
      env.videos.push(v);
      return v;
    },
  };
  if (api) {
    env.wakeLock = {
      request(tipo) {
        assert.equal(tipo, 'screen');
        return new Promise((resolve, reject) => env.pedidos.push({ resolve, reject }));
      },
    };
  }
  // Lo que da el navegador al conceder: se suelta solo (pestana oculta) o con release().
  env.sentinel = () => {
    const s = { released: false, liberado: 0, oyentes: [],
      addEventListener(ev, fn) { if (ev === 'release') this.oyentes.push(fn); },
      soltar() { this.released = true; this.oyentes.forEach(fn => fn()); },
      release() { this.liberado++; this.soltar(); return Promise.resolve(); } };
    return s;
  };
  env.ocultar = (oculta) => { env.doc.visibilityState = oculta ? 'hidden' : 'visible'; };
  return env;
}
const esperar = () => new Promise(r => setImmediate(r));

test('pantalla encendida: un solo pedido, y se suelta al dejar de hacer falta', async () => {
  const { createScreenKeeper } = require('./pure.js');
  const env = navegadorFalso();
  const k = createScreenKeeper({ wakeLock: env.wakeLock, doc: env.doc });
  k.want(true);
  k.want(true);
  k.sync();
  assert.equal(env.pedidos.length, 1);
  const s = env.sentinel();
  env.pedidos[0].resolve(s);
  await esperar();
  k.sync();
  assert.equal(env.pedidos.length, 1);
  k.want(false);
  assert.equal(s.liberado, 1);
  assert.equal(k.usingVideo(), false);
  assert.equal(env.videos.length, 0);
});

test('pantalla encendida: se vuelve a pedir al volver a la pestana', async () => {
  const { createScreenKeeper } = require('./pure.js');
  const env = navegadorFalso();
  const k = createScreenKeeper({ wakeLock: env.wakeLock, doc: env.doc });
  k.want(true);
  const s = env.sentinel();
  env.pedidos[0].resolve(s);
  await esperar();
  // Al ocultarla el navegador suelta el lock por su cuenta
  env.ocultar(true);
  s.soltar();
  k.sync();
  assert.equal(env.pedidos.length, 1);
  env.ocultar(false);
  k.sync();
  assert.equal(env.pedidos.length, 2);
  // Aunque el aviso de 'release' no haya llegado, un lock ya soltado no cuenta
  const s2 = env.sentinel();
  env.pedidos[1].resolve(s2);
  await esperar();
  s2.released = true;
  k.sync();
  assert.equal(env.pedidos.length, 3);
});

test('pantalla encendida: deja de hacer falta mientras se pide y se suelta al llegar', async () => {
  const { createScreenKeeper } = require('./pure.js');
  const env = navegadorFalso();
  const k = createScreenKeeper({ wakeLock: env.wakeLock, doc: env.doc });
  k.want(true);
  k.want(false);
  const s = env.sentinel();
  env.pedidos[0].resolve(s);
  await esperar();
  assert.equal(s.liberado, 1);
});

test('pantalla encendida: sin la API (modo LAN por http) un video mudo e invisible', () => {
  const { createScreenKeeper } = require('./pure.js');
  const env = navegadorFalso({ api: false });
  const k = createScreenKeeper({ wakeLock: undefined, doc: env.doc });
  assert.equal(env.videos.length, 0); // nada hasta que haga falta
  k.want(true);
  k.sync();
  assert.equal(env.videos.length, 1);
  assert.equal(env.agregados, 1);
  const v = env.videos[0];
  assert.equal(v.muted, true);
  assert.equal(v.loop, true);
  assert.equal(v.attrs.playsinline, '');
  assert.match(v.src, /^data:video\/mp4;base64,/);
  assert.match(v.style.cssText, /opacity:0/);
  assert.match(v.style.cssText, /pointer-events:none/);
  assert.match(v.style.cssText, /width:100%;height:100%/);
  assert.equal(v.paused, false);
  assert.equal(v.plays, 1);
  // Oculta: se pausa; a la vista: sigue
  env.ocultar(true);
  k.sync();
  assert.equal(v.paused, true);
  env.ocultar(false);
  k.sync();
  assert.equal(v.paused, false);
  k.want(false);
  assert.equal(v.paused, true);
  assert.equal(env.videos.length, 1);
});

test('pantalla encendida: video bloqueado sin un toque se reintenta con el proximo', async () => {
  const { createScreenKeeper } = require('./pure.js');
  const env = navegadorFalso({ api: false });
  const k = createScreenKeeper({ wakeLock: null, doc: env.doc });
  k.want(true);
  const v = env.videos[0];
  // Primer intento rechazado (ahorro de bateria): en el falso el primer play ya paso
  v.paused = true;
  v.bloqueado = true;
  k.sync();
  await esperar();
  assert.equal(v.paused, true);
  v.bloqueado = false;
  k.sync(); // el toque
  assert.equal(v.paused, false);
  assert.equal(v.plays, 3);
});

test('pantalla encendida: la API rechaza con la pestana a la vista, va el video', async () => {
  const { createScreenKeeper } = require('./pure.js');
  const env = navegadorFalso();
  const k = createScreenKeeper({ wakeLock: env.wakeLock, doc: env.doc });
  k.want(true);
  env.pedidos[0].reject(new Error('NotAllowedError'));
  await esperar();
  assert.equal(k.usingVideo(), true);
  assert.equal(env.videos.length, 1);
  assert.equal(env.videos[0].paused, false);
  k.sync();
  assert.equal(env.pedidos.length, 1);
});

test('pantalla encendida: rechazo con la pestana oculta no es motivo para el video', async () => {
  const { createScreenKeeper } = require('./pure.js');
  const env = navegadorFalso();
  const k = createScreenKeeper({ wakeLock: env.wakeLock, doc: env.doc });
  k.want(true);
  env.ocultar(true);
  env.pedidos[0].reject(new Error('NotAllowedError'));
  await esperar();
  assert.equal(k.usingVideo(), false);
  env.ocultar(false);
  k.sync();
  assert.equal(env.pedidos.length, 2);
  assert.equal(env.videos.length, 0);
});

test('waypointRouteKey: otro destino es otro viaje, los intermedios no (Gargamosch, 12-10)', () => {
  const { waypointRouteKey, routeProgressTotal } = require('./pure.js');
  const haciaA = waypointRouteKey([{ pos: [100.4, 200.6] }]);
  assert.equal(haciaA, 'wp:100,201');
  // Con una parada antes: al pasarla se saca y la ruta sigue siendo la misma
  assert.equal(waypointRouteKey([{ pos: [5, 5] }, { pos: [100.4, 200.6] }]), haciaA);
  const haciaB = waypointRouteKey([{ pos: [3000, -400] }]);
  assert.notEqual(haciaB, haciaA);
  assert.equal(waypointRouteKey([]), null);
  assert.equal(waypointRouteKey(null), null);
  assert.equal(waypointRouteKey([{ pos: [NaN, 1] }]), null);
  // Viaje rapido, borrar el waypoint y poner otro: la barra arranca de cero
  // (antes todas las rutas de waypoints eran 'wp-only' y heredaban el total).
  const id = '["ats","","",null,null,false,false,""]';
  const now = Date.parse('2026-10-12T18:00:00Z');
  const stored = { key: id + haciaA, total: 640, at: now - 3600 * 1000 };
  assert.equal(routeProgressTotal({ kind: 'waypoint', manual: true, remainingKm: 300, seenKm: 0, stored, key: id + haciaB, now }), 300);
  // La misma ruta despues de recargar sigue midiendo contra lo guardado
  assert.equal(routeProgressTotal({ kind: 'waypoint', manual: true, remainingKm: 300, seenKm: 0, stored, key: id + haciaA, now }), 640);
});

// Un -lanes.bin como lo escribe write_lanes (client/mapbuild/route_graph_bin.py)
function lanesBin(nNodes, nEdges, entradas) {
  const n = entradas.length, pad = (k) => (k + 3) & ~3;
  const buf = new ArrayBuffer(20 + 4 * n + 3 * pad(n) + 8 * n);
  const dv = new DataView(buf);
  dv.setUint32(0, 0x54444c4e, false);
  [1, nNodes, nEdges, n].forEach((v, i) => dv.setUint32(4 + 4 * i, v, true));
  let off = 20;
  entradas.forEach((e, i) => dv.setUint32(off + 4 * i, e.key, true)); off += 4 * n;
  const u8 = new Uint8Array(buf);
  entradas.forEach((e, i) => { u8[off + i] = e.lanes; }); off += pad(n);
  entradas.forEach((e, i) => { u8[off + i] = e.mask; }); off += pad(n);
  entradas.forEach((e, i) => { u8[off + i] = e.turn; }); off += pad(n);
  entradas.forEach((e, i) => e.arrows.forEach((a, c) => { u8[off + 8 * i + c] = a; }));
  return buf;
}

test('carriles: el archivo se lee y se busca por arista y sentido', () => {
  const { decodeLanesBin, lanesForEdge, LANE_ARROW_BITS: B, LANE_DROP_BIT } = require('./pure.js');
  const buf = lanesBin(100, 50, [
    { key: 3 * 2 + 1, lanes: 3, mask: 0b001, turn: B.left, arrows: [B.left, B.straight, B.straight | B.right] },
    { key: 7 * 2, lanes: 2, mask: 0b10, turn: B.slightRight, arrows: [B.straight, B.slightRight] },
    { key: 40 * 2, lanes: 4, mask: 0b0111, turn: B.straight | LANE_DROP_BIT, arrows: [B.straight, B.straight, B.straight, B.slightRight] },
  ]);
  const d = decodeLanesBin(buf, 100, 50);
  assert.equal(d.n, 3);
  assert.deepEqual(lanesForEdge(d, 3, true), { count: 3, mask: 1, turn: B.left, arrows: [B.left, B.straight, B.straight | B.right], drop: false });
  assert.equal(lanesForEdge(d, 3, false), null); // el otro sentido no avisa nada
  assert.deepEqual(lanesForEdge(d, 7, false).arrows, [B.straight, B.slightRight]);
  assert.equal(lanesForEdge(d, 40, false).count, 4);
  // el carril que se pierde viene aparte: el giro queda con las flechas solas
  assert.equal(lanesForEdge(d, 40, false).turn, B.straight);
  assert.equal(lanesForEdge(d, 40, false).drop, true);
  assert.equal(lanesForEdge(d, 41, false), null);
  assert.equal(lanesForEdge(null, 3, true), null);
  // De otra corrida del grafo, roto o de otro formato: no se usa
  assert.equal(decodeLanesBin(buf, 101, 50), null);
  assert.equal(decodeLanesBin(buf, 100, 49), null);
  assert.equal(decodeLanesBin(buf.slice(0, 40), 100, 50), null);
  assert.equal(decodeLanesBin(new ArrayBuffer(10), 100, 50), null);
  const otro = buf.slice(0);
  new DataView(otro).setUint32(0, 0x54445247, false); // 'TDRG'
  assert.equal(decodeLanesBin(otro, 100, 50), null);
});

test('carriles: solo los del giro que se anuncia', () => {
  const { laneTurnMatches, LANE_ARROW_BITS: B } = require('./pure.js');
  assert.ok(laneTurnMatches('turn', 'left', B.left));
  assert.ok(laneTurnMatches('turn', 'left', B.slightLeft));
  assert.ok(laneTurnMatches('turn', 'right', B.right));
  // la salida de la autopista de al lado no es la esquina a la izquierda
  assert.ok(!laneTurnMatches('turn', 'left', B.slightRight));
  assert.ok(!laneTurnMatches('turn', 'right', B.straight));
  // en una bifurcacion la rama que se toma puede seguir derecho
  assert.ok(laneTurnMatches('fork', 'right', B.straight));
  assert.ok(laneTurnMatches('fork', 'right', B.slightRight));
  assert.ok(!laneTurnMatches('fork', 'right', B.slightLeft));
  assert.ok(!laneTurnMatches('roundabout', 'right', B.right));
});

test('carriles: keep left yendo derecho cuando el de la derecha sale (Discord, 17-10)', () => {
  const { laneKeepSide, LANE_ARROW_BITS: B } = require('./pure.js');
  const rec = (mask, arrows, turn = B.straight) => ({ count: arrows.length, mask, turn, arrows, drop: true });
  // tres carriles, el de la derecha solo a la salida: por los dos de la izquierda
  assert.equal(laneKeepSide(rec(0b011, [B.straight, B.straight, B.slightRight])), 'left');
  // dos de la derecha a la salida
  assert.equal(laneKeepSide(rec(0b0011, [B.straight, B.straight, B.slightRight, B.slightRight])), 'left');
  // una salida por la izquierda: keep right
  assert.equal(laneKeepSide(rec(0b110, [B.slightLeft, B.straight, B.straight])), 'right');
  // nuestro lado puede ser "suave" si la salida es mas recta (los dos se abren)
  assert.equal(laneKeepSide(rec(0b01, [B.slightLeft, B.straight], B.slightLeft)), 'left');
  // el de la derecha sirve para las dos (salida comun): todos sirven, nada
  assert.equal(laneKeepSide(rec(0b111, [B.straight, B.straight, B.straight | B.slightRight])), null);
  // el carril de doblar a la derecha de una esquina no es un "keep left"
  assert.equal(laneKeepSide(rec(0b011, [B.straight, B.straight, B.right])), null);
  assert.equal(laneKeepSide(rec(0b011, [B.straight, B.straight, B.slightRight | B.right])), null);
  // los que no sirven a los dos lados, o uno del medio: no hay un lado
  assert.equal(laneKeepSide(rec(0b010, [B.slightLeft, B.straight, B.slightRight])), null);
  assert.equal(laneKeepSide(rec(0b101, [B.straight, B.slightRight, B.straight])), null);
  // lo que se toma dobla de verdad: es un giro, no un keep
  assert.equal(laneKeepSide(rec(0b100, [B.straight, B.straight, B.right], B.right)), null);
  // sin la marca del constructor el carril se agrego para la salida (el de
  // desaceleracion): ahi no se avisa
  assert.equal(laneKeepSide({ ...rec(0b011, [B.straight, B.straight, B.slightRight]), drop: false }), null);
  // sin datos, un carril, o un carril sin flechas
  assert.equal(laneKeepSide(null), null);
  assert.equal(laneKeepSide(rec(0b1, [B.straight])), null);
  assert.equal(laneKeepSide(rec(0b01, [B.straight, 0])), null);
  // sin la marca pero el carril entro por una rampa poco antes (laneFromOnRamp)
  assert.equal(laneKeepSide({ ...rec(0b011, [B.straight, B.straight, B.slightRight]), drop: false }, true), 'left');
  assert.equal(laneKeepSide({ ...rec(0b011, [B.straight, B.straight, B.right]), drop: false }, true), null);
});

test('carriles: keep en cada salida de autopista, con el ajuste (Discord, 19-10)', () => {
  const { everyExitKeepSide, LANE_ARROW_BITS: B } = require('./pure.js');
  const rec = (mask, arrows, turn = B.straight) => ({ count: arrows.length, mask, turn, arrows, drop: false });
  // el carril de desaceleracion de la derecha, sin la marca: keep left
  assert.equal(everyExitKeepSide(rec(0b011, [B.straight, B.straight, B.slightRight])), 'left');
  // una salida por la izquierda: keep right
  assert.equal(everyExitKeepSide(rec(0b110, [B.slightLeft, B.straight, B.straight])), 'right');
  // con la marca tambien (es el keep de siempre)
  assert.equal(everyExitKeepSide({ ...rec(0b011, [B.straight, B.straight, B.slightRight]), drop: true }), 'left');
  // el carril de la ruta va a la salida: eso es la bifurcacion, no un keep
  assert.equal(everyExitKeepSide(rec(0b100, [B.straight, B.straight, B.slightRight], B.slightRight)), null);
  // el carril de doblar de una esquina de ciudad no
  assert.equal(everyExitKeepSide(rec(0b011, [B.straight, B.straight, B.right])), null);
  // todos sirven, o no hay datos
  assert.equal(everyExitKeepSide(rec(0b111, [B.straight, B.straight, B.straight | B.slightRight])), null);
  assert.equal(everyExitKeepSide(null), null);
});

// Una autopista hacia el norte (z baja) por x = 0: nodo 0 en z 400, el cruce
// de antes (1) en z 200, un nodo en z 130 (2, otro cruce con salidaAntes) y
// la salida del aviso (3) en z 70. otros: los nodos ([x, z]) desde el 5;
// tramos: los suyos, dirigidos [a, b]. desde: los puntos de la ruta que ya
// no estan (recortados de lo recorrido).
function rampaAntes({ cruce = 200, otros = [], tramos = [], desde = 0, salidaAntes = false } = {}) {
  const { laneFromOnRamp, routeMetrics } = require('./pure.js');
  const ruta = [[0, 400], [0, cruce], [0, 130], [0, 70], [0, -300]];
  const nodos = [...ruta, ...otros];
  const cruces = new Set([1, 3, ...(salidaAntes ? [2] : [])]);
  const pts = ruta.map((p, k) => [p[0], p[1], 0, cruces.has(k) ? 1 : 0, k]).slice(desde);
  const sale = new Map(), llega = new Map();
  const add = (a, b) => {
    if (!sale.has(a)) sale.set(a, []);
    sale.get(a).push([b]);
    if (!llega.has(b)) llega.set(b, []);
    llega.get(b).push(a);
  };
  for (let k = 0; k < ruta.length - 1; k++) add(k, k + 1);
  for (const [a, b] of tramos) add(a, b);
  if (salidaAntes) { nodos.push([40, 30]); add(2, nodos.length - 1); }
  const { cum, pointAt } = routeMetrics(pts);
  return laneFromOnRamp({ pts, cum, pointAt, i: 3 - desde, nodes: nodos, adjacency: { get: (k) => sale.get(k) || [] }, incoming: (k) => llega.get(k) || [] });
}

test('carriles: el carril de una rampa de entrada que se va por la salida siguiente (I-25 al norte de Raton, Discord 18-10)', () => {
  // la rampa llega desde atras por la derecha y se suma en el cruce de antes
  const rampa = { otros: [[60, 600], [20, 300]], tramos: [[5, 6], [6, 1]] };
  assert.equal(rampaAntes(rampa), true);
  // por la izquierda tambien (dos autopistas que se juntan)
  assert.equal(rampaAntes({ ...rampa, otros: [[-60, 600], [-20, 300]] }), true);
  // la entrada mas lejos que maxM: el carril pudo agregarse despues
  assert.equal(rampaAntes({ ...rampa, cruce: 320, otros: [[60, 700], [20, 400]] }), false);
  // donde empieza una autovia, el retorno del prefab llega pegado y parejo a
  // la ruta, pero desde la calzada contraria, que va para adelante
  assert.equal(rampaAntes({ otros: [[-20, -200], [-20, 180], [-10, 215]], tramos: [[5, 6], [6, 7], [7, 1]] }), false);
  // entre la rampa y el aviso hay otra salida: el carril de la rampa se iba por ella
  assert.equal(rampaAntes({ ...rampa, salidaAntes: true }), false);
  // sin rampa, o sin el nodo de antes del cruce (recortado de lo recorrido):
  // la calle por la que llega la ruta no es otra que se suma
  assert.equal(rampaAntes(), false);
  assert.equal(rampaAntes({ ...rampa, desde: 1 }), false);
});

test('carriles: sin giro, las flechas del proximo cruce donde no sirven todos (Ittikorn, Discord 18-10)', () => {
  const { quietLanesAhead, routeMetrics } = require('./pure.js');
  // hacia el norte por x = 0: el camion (2) entre cruces; cruces en z -100
  // (nodos 3 y 4, un prefab), -400 (5) y -900 (6). [x, z, ferry, cruce, nodo]
  const ruta = (ferry = -1) => [[0, 100, 0, 1, 0], [0, 50, 0, 0, 1], [0, 0, 0, 0, null], [0, -100, 0, 1, 3], [0, -120, 0, 1, 4],
    [0, -400, ferry === 5 ? 1 : 0, 1, 5], [0, -900, 0, 1, 6], [0, -1200, 0, 0, 7]];
  const correr = (pts, conCarriles, maxM = 500) => {
    const { cum } = routeMetrics(pts);
    const pedidos = [];
    const q = quietLanesAhead(pts, cum, 2, maxM, (i, iEnd) => { pedidos.push([i, iEnd]); return conCarriles.includes(pts[i][4]) ? { count: 3 } : null; });
    return { q, pedidos };
  };
  // el prefab de z -100 no tiene nada que mostrar: el de -400, a 400 m
  let { q, pedidos } = correr(ruta(), [5, 6]);
  assert.deepEqual([q.node, q.distanceMeters, q.lanes], [[0, -400], 400, { count: 3 }]);
  // el prefab entero se pide una vez (nodos 3 y 4), y el cruce de atras no
  assert.deepEqual(pedidos, [[3, 4], [5, 5]]);
  // el primero que tiene flechas, aunque haya otro despues
  assert.deepEqual(correr(ruta(), [3, 5]).q.node, [0, -100]);
  // mas lejos que maxM, nada
  assert.equal(correr(ruta(), [6]).q, null);
  assert.equal(correr(ruta(), [5], 300).q, null);
  // del otro lado de un ferry, nada
  assert.equal(correr(ruta(5), [5, 6]).q, null);
});

test('carriles: para dibujar, de izquierda a derecha y cuales sirven', () => {
  const { laneGuidance, LANE_ARROW_BITS: B } = require('./pure.js');
  const g = laneGuidance({ count: 3, mask: 0b110, turn: B.right, arrows: [B.left, B.straight, B.straight | B.right] });
  assert.deepEqual(g, [
    { dirs: ['left'], active: false, turn: 'right' },
    { dirs: ['straight'], active: true, turn: 'right' },
    { dirs: ['straight', 'right'], active: true, turn: 'right' },
  ]);
  assert.equal(laneGuidance(null), null);
  assert.equal(laneGuidance({ count: 1, mask: 1, turn: B.left, arrows: [B.left] }), null);
});

test('overlay: el texto del giro, igual para el tablero y para OBS', () => {
  const { turnInstructionText } = require('./pure.js');
  const dic = {
    navStraight: 'Continue straight', navToward: 'toward', navOnto: 'onto', navIn: 'in',
    navOrdinals: 'first,second,third,fourth', navRoundaboutIn: 'Roundabout in {d}: take the {n} exit',
    navKeepLeft: 'Keep left', navKeepRight: 'Keep right', navTurnLeft: 'Turn left', navTurnRight: 'Turn right',
  };
  const o = { t: (k) => dic[k], imperial: false, lang: 'en' };
  const d = (m, imp = false) => formatTurnDistance(m, imp, 'en');
  assert.equal(turnInstructionText('straight', o), '⬆ Continue straight');
  assert.equal(turnInstructionText(null, o), '');
  assert.equal(turnInstructionText({ kind: 'turn', direction: 'left' }, o), ''); // sin metros
  assert.equal(turnInstructionText({ kind: 'turn', direction: 'right', meters: 1200, sign: { kind: 'road', label: 'I-15' } }, o),
    `↱ Turn right onto I-15 in ${d(1200)}`);
  assert.equal(turnInstructionText({ kind: 'turn', direction: 'left', meters: 300, sign: null }, o), `↰ Turn left in ${d(300)}`);
  assert.equal(turnInstructionText({ kind: 'fork', direction: 'left', meters: 800, sign: { kind: 'city', label: 'Provo' } }, o),
    `↖ Keep left toward Provo in ${d(800)}`);
  assert.equal(turnInstructionText({ kind: 'roundabout', direction: 'right', exit: 2, meters: 300, sign: { kind: 'city', label: 'Reno' } }, o),
    `↻ Roundabout in ${d(300)}: take the second exit toward Reno`);
  // mas alla de los ordinales, el numero
  assert.equal(turnInstructionText({ kind: 'roundabout', direction: 'right', exit: 6, meters: 300 }, o), `↻ Roundabout in ${d(300)}: take the 6 exit`);
  // en millas si el link las pide, aunque el tablero este en km
  assert.equal(turnInstructionText({ kind: 'turn', direction: 'right', meters: 1200 }, { ...o, imperial: true }), `↱ Turn right in ${d(1200, true)}`);
});

test('overlay: llegada en hora del juego, como client/overlay.py', () => {
  const { gameArrivalClock } = require('./pure.js');
  assert.equal(gameArrivalClock(600, 3600), '11:00');
  assert.equal(gameArrivalClock(1430, 1200), '00:10 +1d'); // pasa la medianoche
  assert.equal(gameArrivalClock(100, 2 * 1440 * 60), '01:40 +2d');
  assert.equal(gameArrivalClock(3 * 1440 + 61, 60), '01:02'); // dia 4 del juego, mismo dia
  assert.equal(gameArrivalClock(600, 0), ''); // el GPS del juego sin ruta
  assert.equal(gameArrivalClock(null, 3600), '');
  assert.equal(gameArrivalClock(600, undefined), '');
  // En 12 h, igual que la llegada real
  assert.equal(gameArrivalClock(600, 3600, true), '11:00 AM');
  assert.equal(gameArrivalClock(1430, 1200, true), '12:10 AM +1d');
  assert.equal(gameArrivalClock(700, 3600, true), '12:40 PM');
});

test('formato de hora: el mismo para la llegada real y la del juego', () => {
  const { clockFormatSetting, clockIs12h, formatClockHM } = require('./pure.js');
  assert.equal(clockFormatSetting(undefined), 'auto');
  assert.equal(clockFormatSetting('13'), 'auto');
  assert.equal(clockFormatSetting('12'), '12');
  // auto: 12 h solo en ingles
  assert.equal(clockIs12h('auto', 'en'), true);
  assert.equal(clockIs12h('auto', 'de'), false);
  assert.equal(clockIs12h(undefined, 'en'), true);
  // elegido a mano gana sobre el idioma
  assert.equal(clockIs12h('24', 'en'), false);
  assert.equal(clockIs12h('12', 'es'), true);
  assert.equal(formatClockHM(0, 5, false), '00:05');
  assert.equal(formatClockHM(0, 5, true), '12:05 AM');
  assert.equal(formatClockHM(12, 0, true), '12:00 PM');
  assert.equal(formatClockHM(15, 45, true), '3:45 PM');
  assert.equal(formatClockHM(15, 45, false), '15:45');
});

test('overlay de OBS: que se muestra segun el link', () => {
  const { obsOverlayItems, OBS_ITEMS } = require('./pure.js');
  // en el orden de siempre, sin lo que no existe
  assert.deepEqual(obsOverlayItems('speed,turn,inventado', null, false), ['turn', 'speed']);
  assert.deepEqual(obsOverlayItems('', null, false), []);
  assert.deepEqual(obsOverlayItems(OBS_ITEMS.join(','), null, false), OBS_ITEMS);
  // los links de antes de las casillas se ven igual que antes
  assert.deepEqual(obsOverlayItems(null, null, false), ['speed', 'dest', 'remaining', 'time']);
  assert.deepEqual(obsOverlayItems(null, '0', false), ['speed']);
  assert.deepEqual(obsOverlayItems(null, '0', true), ['speed']);
  // el armador arranca con el giro
  assert.deepEqual(obsOverlayItems(null, null, true), ['turn', 'speed', 'dest', 'remaining', 'time']);
  // las del overlay del juego estan todas (el crucero sale con la velocidad)
  for (const k of ['turn', 'speed', 'gear', 'remaining', 'arrival', 'game_arrival']) assert.ok(OBS_ITEMS.includes(k), k);
  // la marcha es casilla nueva: los links de antes no la muestran sola
  assert.deepEqual(obsOverlayItems('gear,speed', null, false), ['speed', 'gear']);
  assert.ok(!obsOverlayItems(null, null, false).includes('gear'));
});

test('formatGear: la marcha igual que en el overlay del juego', () => {
  const { formatGear } = require('./pure.js');
  // los mismos casos que formato_marcha en client/test_overlay.py
  assert.deepEqual([0, null, 1, 12, -1, -2, 3.0].map(formatGear), ['N', 'N', '1', '12', 'R', 'R2', '3']);
  assert.equal(formatGear(true), 'N');
  assert.equal(formatGear(NaN), 'N');
  assert.equal(formatGear('5'), 'N');
  assert.equal(formatGear(undefined), 'N'); // un cliente que no la manda
  assert.equal(formatGear(3.7), '3'); // como int() de Python
});

test('pipWindowSize: la ventana flotante con mapa es mas alta que la de texto', () => {
  const { pipWindowSize } = require('./pure.js');
  assert.deepEqual(pipWindowSize(false), { width: 400, height: 160 });
  const conMapa = pipWindowSize(true);
  assert.equal(conMapa.width, pipWindowSize(false).width); // al cambiar de modo no cambia el ancho
  assert.ok(conMapa.height >= 400);
  conMapa.height = 1; // es una copia
  assert.ok(pipWindowSize(true).height >= 400);
});

test('pipWindowSize: con el tamano que le dejo el usuario, ese (Discord, 21-10)', () => {
  const { pipWindowSize, pipSavedSize } = require('./pure.js');
  assert.deepEqual(pipWindowSize(true, '{"width":520,"height":610}'), { width: 520, height: 610 });
  assert.deepEqual(pipWindowSize(false, { width: 300.4, height: 120.6 }), { width: 300, height: 121 });
  // lo que no sirve vuelve al de fabrica: sin guardar, roto, chico o enorme
  for (const malo of [null, '', 'x', '{}', '{"width":"a","height":200}', '{"width":20,"height":200}', '{"width":5000,"height":200}', '[1,2]']) {
    assert.deepEqual(pipWindowSize(true, malo), { width: 400, height: 460 }, String(malo));
  }
  assert.equal(pipSavedSize({ width: 0, height: 0 }), null); // ventana minimizada
});

test('pipRequestSize: se pide lo mismo que la ultima vez si se cerro en el mismo modo, asi Chrome la deja donde estaba', () => {
  const { pipRequestSize } = require('./pure.js');
  const guardado = '{"width":520,"height":610}';
  // Primera vez en la pestana: el tamano guardado del modo
  assert.deepEqual(pipRequestSize(true, guardado, null), { width: 520, height: 610 });
  // Se cerro con mapa: lo mismo que se pidio (Chrome recuerda por tamano
  // pedido y devuelve la ventana donde y como la dejo el usuario), aunque se
  // haya abierto sin mapa
  const ultima = JSON.stringify({ width: 400, height: 460, closeMap: true });
  assert.deepEqual(pipRequestSize(true, guardado, ultima), { width: 400, height: 460 });
  assert.deepEqual(pipRequestSize(true, guardado, { width: 400, height: 160, closeMap: true }), { width: 400, height: 160 });
  // Cerrada en el otro modo: el guardado del que se abre
  assert.deepEqual(pipRequestSize(true, guardado, { width: 400, height: 460, closeMap: false }), { width: 520, height: 610 });
  assert.deepEqual(pipRequestSize(false, null, ultima), { width: 400, height: 160 });
  // sessionStorage roto: como la primera vez
  assert.deepEqual(pipRequestSize(true, guardado, '{roto'), { width: 520, height: 610 });
});

test('createFrameRace: el cuadro sale de la primera ventana que lo da y nunca queda colgado', () => {
  const { createFrameRace } = require('./pure.js');
  // Una ventana de mentira: guarda los pedidos y los cumple con fire()
  const ventana = () => {
    let n = 0;
    const q = new Map();
    return {
      raf: (cb) => { q.set(++n, cb); return n; },
      cancel: (id) => { q.delete(id); },
      fire() { const l = [...q.values()]; q.clear(); l.forEach(cb => cb(999999)); },
      get size() { return q.size; },
    };
  };
  const tab = ventana(), pip = ventana();
  let reloj = 10;
  const race = createFrameRace(tab.raf, tab.cancel, () => reloj);
  const vistos = [];
  // Sin ventana flotante: solo la pestana
  race.request((t) => vistos.push(['tab', t]));
  assert.equal(pip.size, 0);
  tab.fire();
  assert.deepEqual(vistos, [['tab', 10]]);
  // Con el mapa en la ventana: se pide en las dos. La pestana tapada por el
  // juego no da cuadros y sale por la ventana, con el reloj de la pestana.
  race.setExtra({ raf: pip.raf, cancel: pip.cancel });
  reloj = 20;
  race.request((t) => vistos.push(['pip', t]));
  assert.equal(tab.size, 1);
  assert.equal(pip.size, 1);
  pip.fire();
  assert.deepEqual(vistos[1], ['pip', 20]);
  assert.equal(tab.size, 0); // el de la pestana se cancelo
  assert.equal(race.pending, 0);
  // Cancelar cancela en las dos
  const id = race.request(() => vistos.push(['nunca']));
  race.cancel(id);
  assert.equal(tab.size + pip.size, 0);
  // La ventana se cierra con un pedido en vuelo: lo cumple la pestana
  race.request((t) => vistos.push(['cerrada', t]));
  race.setExtra(null);
  tab.fire();
  assert.deepEqual(vistos[2], ['cerrada', 20]);
  // Una ventana que ya no da pedidos (tira): sale por la pestana igual
  race.setExtra({ raf: () => { throw new Error('cerrada'); }, cancel: () => {} });
  race.request(() => vistos.push(['rota']));
  tab.fire();
  assert.deepEqual(vistos[3], ['rota']);
  assert.equal(vistos.length, 4);
  // Si las dos dan el cuadro (una cancelacion que no llego), corre una vez
  const t2 = ventana(), p2 = ventana();
  const race2 = createFrameRace(t2.raf, () => {}, () => 0);
  race2.setExtra({ raf: p2.raf, cancel: () => {} });
  let veces = 0;
  race2.request(() => veces++);
  p2.fire();
  t2.fire();
  assert.equal(veces, 1);
  assert.equal(race2.pending, 0);
});

test('modales: Tab da la vuelta adentro y Shift+Tab tambien', () => {
  const { focusTrapTarget } = require('./pure.js');
  // tres controles: del ultimo al primero, del primero al ultimo
  assert.equal(focusTrapTarget(3, 2, false), 0);
  assert.equal(focusTrapTarget(3, 0, true), 2);
  // en el medio decide el navegador
  assert.equal(focusTrapTarget(3, 1, false), null);
  assert.equal(focusTrapTarget(3, 1, true), null);
  assert.equal(focusTrapTarget(3, 0, false), null);
  assert.equal(focusTrapTarget(3, 2, true), null);
  // foco en el panel o afuera: entra por la punta que corresponde
  assert.equal(focusTrapTarget(3, -1, false), 0);
  assert.equal(focusTrapTarget(3, -1, true), 2);
  assert.equal(focusTrapTarget(3, 7, false), 0);
  // uno solo: siempre ese; ninguno: quieto
  assert.equal(focusTrapTarget(1, 0, false), 0);
  assert.equal(focusTrapTarget(1, 0, true), 0);
  assert.equal(focusTrapTarget(0, -1, false), -1);
});

test('giro para lector de pantalla: una vez por maniobra y sin la flecha', () => {
  const { createTurnAnnouncer, turnIdentity, createVoiceGuide } = require('./pure.js');
  const a = createTurnAnnouncer();
  const giro = (d, x = 100) => ({ kind: 'turn', direction: 'left', node: [x, 50.4], distanceMeters: d });
  assert.equal(a.next(giro(900), '↰ Turn left onto I-80 in 900 m'), 'Turn left onto I-80 in 900 m');
  // la misma maniobra mas cerca: nada (si no, se leeria en cada dato)
  assert.equal(a.next(giro(600), '↰ Turn left onto I-80 in 600 m'), null);
  // un dato sin giro (recta) y vuelve la misma: tampoco
  assert.equal(a.next(null, '⬆ Continue straight'), null);
  assert.equal(a.next(giro(400), '↰ Turn left onto I-80 in 400 m'), null);
  // otra maniobra: si
  assert.equal(a.next(giro(2000, 900), '↰ Turn left in 2 km'), 'Turn left in 2 km');
  // y si vuelve a la de antes (A, B, A), no la lee de nuevo
  assert.equal(a.next(giro(300), '↰ Turn left onto I-80 in 300 m'), null);
  const rot = { kind: 'roundabout', direction: 'right', exit: 2, node: [5, 5], distanceMeters: 300 };
  assert.equal(a.next(rot, '↻ Roundabout in 300 m: take the 2nd exit'), 'Roundabout in 300 m: take the 2nd exit');
  // sin texto o sin nodo no hay nada que anunciar
  assert.equal(createTurnAnnouncer().next(giro(100), ''), null);
  assert.equal(createTurnAnnouncer().next({ kind: 'turn', direction: 'left' }, 'x'), null);
  // la identidad es la misma que usa la voz: redondeo del nodo incluido
  assert.equal(turnIdentity(giro(1, 100.2)), turnIdentity(giro(5, 99.8)));
  assert.notEqual(turnIdentity(giro(1, 100)), turnIdentity({ ...giro(1, 100), direction: 'right' }));
  const v = createVoiceGuide({ timing: 'early' });
  assert.equal(v.maneuver(giro(300), 90), 'soon_turn_left');
  assert.equal(v.maneuver(giro(250, 100.3), 90), null); // mismo nodo redondeado: ya avisado
});


// --- Ruteo sin vueltas en U en los nodos (13-10) ---
const { findArcRoute, routeArcDirections, isUTurnArc } = require('./pure.js');

// Un grafo como el de buildRouteGraph, armado a mano: nodos [[x, y]] y
// aristas { a, b, uno (sentido unico a->b), mids [[x, y]], ferry, m }.
function grafoDePrueba(nodos, aristas) {
  const n = nodos.length;
  const nodes = Float64Array.from(nodos.flat());
  const midOff = new Uint32Array(aristas.length + 1);
  const mids = [];
  aristas.forEach((e, i) => { midOff[i] = mids.length / 2; for (const p of e.mids || []) mids.push(p[0], p[1]); });
  midOff[aristas.length] = mids.length / 2;
  const csr = new Uint32Array(n + 1), adjTo = [], adjEdge = [], adjRev = [];
  for (let i = 0; i < n; i++) {
    csr[i] = adjTo.length;
    aristas.forEach((e, k) => {
      if (e.a === i) { adjTo.push(e.b); adjEdge.push(k); adjRev.push(0); }
      if (e.b === i && !e.uno) { adjTo.push(e.a); adjEdge.push(k); adjRev.push(1); }
    });
  }
  csr[n] = adjTo.length;
  const largo = (e) => e.m || Math.hypot(nodos[e.a][0] - nodos[e.b][0], nodos[e.a][1] - nodos[e.b][1]);
  return {
    g: { n, nodes, csr, adjTo: Int32Array.from(adjTo), adjEdge: Int32Array.from(adjEdge), adjRev: Uint8Array.from(adjRev), midOff, midXY: Float64Array.from(mids) },
    opts: (fin) => ({
      cost: (k) => largo(aristas[k]),
      heuristic: (i) => Math.hypot(nodos[i][0] - nodos[fin][0], nodos[i][1] - nodos[fin][1]),
      isFerry: (k) => !!aristas[k].ferry,
    }),
  };
}

test('ruteo: no da la vuelta en el nodo donde una calzada separada pasa a doble mano', () => {
  // a -> s por la calzada que va al este, s -> b por la que vuelve al oeste
  // (10 m al costado). s sigue al este por una calle de doble mano hasta una
  // rotonda (r -> v -> w -> r). Destino: z, del otro lado de b.
  const nodos = [[0, 0], [100, 5], [0, 10], [-100, 10], [200, 5], [300, 5], [350, 40], [350, -30]];
  const [a, s, b, z, t, r, v, w] = nodos.keys();
  const { g, opts } = grafoDePrueba(nodos, [
    { a, b: s, uno: true }, { a: s, b, uno: true }, { a: b, b: z, uno: true },
    { a: s, b: t }, { a: t, b: r }, { a: r, b: v, uno: true }, { a: v, b: w, uno: true }, { a: w, b: r, uno: true },
  ]);
  const camino = findArcRoute(g, a, z, opts(z));
  assert.deepEqual(camino, [a, s, t, r, v, w, r, t, s, b, z]);
  // El A* por nodos hubiera hecho a, s, b, z: la vuelta en U en s
  const dirs = routeArcDirections(g);
  const llegaS = [...g.adjTo.keys()].find(k => dirs.from[k] === a && g.adjTo[k] === s);
  const aB = [...g.adjTo.keys()].find(k => dirs.from[k] === s && g.adjTo[k] === b);
  assert.ok(isUTurnArc(dirs, llegaS, aB));
});

test('uTurnShortcuts: la arista de un prefab que pasa por otro nodo dandose vuelta (Kiel, 22-10)', () => {
  const { uTurnShortcuts } = require('./pure.js');
  // Calzada que baja al sur (e -> a), la que sube (b -> f), y en c la calle
  // de doble mano (c - z), que termina en z. El prefab tiene a -> c, c -> b
  // y tambien a -> b, que es a -> c -> b (sus puntos pasan por c). En c dobla
  // 120 grados: la vuelta se reparte entre a, c y b, como en Kiel (133).
  // Ademas p -> q -> r derecho, con un p -> r del mismo largo: ese no.
  const nodos = [[-2, -200], [-2, 0], [0, 20], [14, 10], [14, -200], [0, 220], [100, 0], [100, 20], [100, 40]];
  const [e, a, c, b, f, z, p, q, r] = nodos.keys();
  const aristas = [
    { a: e, b: a, uno: true, m: 200 }, { a, b: c, uno: true, m: 20 }, { a: c, b, uno: true, m: 17 },
    { a, b, uno: true, m: 37, mids: [[0, 20]] }, { a: b, b: f, uno: true, m: 210 }, { a: c, b: z, m: 200 },
    { a: p, b: q, uno: true, m: 20 }, { a: q, b: r, uno: true, m: 20 }, { a: p, b: r, uno: true, m: 40 },
  ];
  const { g, opts } = grafoDePrueba(nodos, aristas);
  g.edgeM = Float32Array.from(aristas.map(x => x.m));
  const atajos = uTurnShortcuts(g);
  assert.equal(atajos.length, 1);
  const [{ k, k1, k2 }] = atajos;
  assert.deepEqual([g.adjEdge[k], g.adjEdge[k1], g.adjEdge[k2]], [3, 1, 2]);
  assert.ok(!isUTurnArc(routeArcDirections(g), k1, k2)); // en c sola no llega a vuelta en U
  // Con el atajo, de la calzada que baja a la que sube sin pasar por z: la
  // ruta "cruza al otro lado". Sin el atajo, por a -> c -> b igual.
  assert.deepEqual(findArcRoute(g, e, f, opts(f)), [e, a, b, f]);
  const sinAtajo = { ...opts(f), blocked: (x) => x === 3 };
  assert.deepEqual(findArcRoute(g, e, f, sinAtajo), [e, a, c, b, f]);
  // Como lo deja buildRouteGraph (uTurnPairs): a -> c -> b es darse vuelta,
  // y como z no tiene salida, se da la vuelta alla
  g.uTurnPairs = new Map([[k1, new Set([k2])]]);
  assert.deepEqual(findArcRoute(g, e, f, sinAtajo), [e, a, c, z, c, b, f]);
});

test('edgePrefab: llegar a un nodo por un prefab y salir por otra arista del mismo es darse vuelta', () => {
  const { decodePrefabsBin } = require('./pure.js');
  // Kiel como lo deja el constructor nuevo: sin el atajo a -> b. e -> a y
  // b -> f calzadas, a -> c y c -> b del prefab, c - z la doble mano.
  const nodos = [[-2, -200], [-2, 0], [0, 20], [14, 10], [14, -200], [0, 220]];
  const [e, a, c, b, f, z] = nodos.keys();
  const aristas = [
    { a: e, b: a, uno: true, m: 200 }, { a, b: c, uno: true, m: 20 }, { a: c, b, uno: true, m: 17 },
    { a: b, b: f, uno: true, m: 210 }, { a: c, b: z, m: 200 },
  ];
  const { g, opts } = grafoDePrueba(nodos, aristas);
  // Sin el archivo, la vuelta queda (120 grados en c)
  assert.deepEqual(findArcRoute(g, e, f, opts(f)), [e, a, c, b, f]);
  // -prefabs.bin: TDPF v1, nNodes, nEdges, un color por arista
  const buf = new ArrayBuffer(16 + 8);
  const dv = new DataView(buf);
  dv.setUint32(0, 0x54445046, false); dv.setUint32(4, 1, true); dv.setUint32(8, 6, true); dv.setUint32(12, 5, true);
  new Uint8Array(buf, 16, 5).set([0, 1, 1, 0, 0]);
  assert.equal(decodePrefabsBin(buf, 6, 4), null); // de otro grafo
  g.edgePrefab = decodePrefabsBin(buf, 6, 5);
  assert.deepEqual([...g.edgePrefab], [0, 1, 1, 0, 0]);
  // Con el: a -> c -> b es salir del prefab y volver; se da la vuelta en z,
  // que no tiene salida
  assert.deepEqual(findArcRoute(g, e, f, opts(f)), [e, a, c, z, c, b, f]);
  // Dos prefabs distintos pegados en c (colores distintos): se pasa
  g.edgePrefab = Uint8Array.from([0, 1, 2, 0, 0]);
  assert.deepEqual(findArcRoute(g, e, f, opts(f)), [e, a, c, b, f]);
});

test('prefabStubs: en el brazo de un prefab sin calle no se da la vuelta, salvo que sea el destino', () => {
  const { prefabStubs } = require('./pure.js');
  // El de Kiel con un brazo s mas a mano (Iasi, Knoxville, 22-10): su calle
  // es oculta y no esta en el grafo, asi que de s solo se vuelve al prefab
  const nodos = [[-2, -200], [-2, 0], [0, 20], [14, 10], [14, -200], [0, 220], [6, -6]];
  const [e, a, c, b, f, z, s] = nodos.keys();
  const aristas = [
    { a: e, b: a, uno: true, m: 200 }, { a, b: c, uno: true, m: 20 }, { a: c, b, uno: true, m: 17 },
    { a: b, b: f, uno: true, m: 210 }, { a: c, b: z, m: 200 }, { a, b: s, uno: true, m: 9 },
    { a: s, b, uno: true, m: 18 },
  ];
  const { g, opts } = grafoDePrueba(nodos, aristas);
  g.edgePrefab = Uint8Array.from([0, 1, 1, 0, 0, 1, 1]);
  assert.deepEqual([...prefabStubs(g)], [0, 0, 0, 0, 0, 0, 1]);
  // Se da la vuelta en z, la punta de una calle de verdad, no en s
  assert.deepEqual(findArcRoute(g, e, f, opts(f)), [e, a, c, z, c, b, f]);
  // Si s es el destino, se llega
  assert.deepEqual(findArcRoute(g, e, s, opts(s)), [e, a, s]);
  // Sin c ni z, la unica forma de llegar a f es darse vuelta en s: por ahi,
  // no sin camino (Charlotte, una T con el brazo de enfrente oculto)
  const sinC = aristas.filter((x) => x.a !== c && x.b !== c);
  const g3 = grafoDePrueba(nodos, sinC);
  g3.g.edgePrefab = Uint8Array.from([0, 0, 1, 1]);
  assert.deepEqual(findArcRoute(g3.g, e, f, g3.opts(f)), [e, a, s, b, f]);
  // Una calle sin salida que termina en un prefab con el otro brazo oculto:
  // la vuelta es en la punta de la calle (r), y no se queda sin camino
  const g2 = grafoDePrueba([[0, 0], [100, 0], [110, 0]], [{ a: 0, b: 1 }, { a: 1, b: 2 }]);
  g2.g.edgePrefab = Uint8Array.from([0, 1]);
  const llegada = g2.g.csr[0];
  assert.deepEqual(findArcRoute(g2.g, 1, 0, { ...g2.opts(0), startArc: llegada }), [1, 0]);
});

test('uTurnCost: darse vuelta en una calle sin salida cuesta de mas, y la ruta da la vuelta a la manzana', () => {
  const { routeUTurnCost, ROUTE_UTURN_PENALTY_S, ROUTE_UTURN_PENALTY_M } = require('./pure.js');
  assert.equal(routeUTurnCost(true), ROUTE_UTURN_PENALTY_S + ROUTE_UTURN_PENALTY_M * 1e-3);
  assert.equal(routeUTurnCost(false), ROUTE_UTURN_PENALTY_M + ROUTE_UTURN_PENALTY_S * 4);
  // El camion va al este por s y el destino w queda atras. b - d es una
  // calle sin salida (la vuelta ahi: 420 m) y b -> p -> q -> s una manzana de
  // una mano (460 m)
  const nodos = [[-100, 0], [0, 0], [100, 0], [160, 0], [100, 80], [0, 80]];
  const [w, s, b, d, p, q] = nodos.keys();
  const { g, opts } = grafoDePrueba(nodos, [
    { a: w, b: s }, { a: s, b }, { a: b, b: d },
    { a: b, b: p, uno: true }, { a: p, b: q, uno: true }, { a: q, b: s, uno: true },
  ]);
  const llegada = g.csr[w];
  assert.deepEqual(findArcRoute(g, s, w, { ...opts(w), startArc: llegada }), [s, b, d, b, s, w]);
  assert.deepEqual(findArcRoute(g, s, w, { ...opts(w), startArc: llegada, uTurnCost: 100 }), [s, b, p, q, s, w]);
  // Si la manzana es mucho mas larga que el recargo, se da vuelta igual
  assert.deepEqual(findArcRoute(g, s, w, { ...opts(w), startArc: llegada, uTurnCost: 30 }), [s, b, d, b, s, w]);
  // Arrancando hacia el fondo de una calle sin salida no hay otra: se da vuelta
  const g2 = grafoDePrueba([[0, 0], [100, 0]], [{ a: 0, b: 1 }]);
  assert.deepEqual(findArcRoute(g2.g, 1, 0, { ...g2.opts(0), startArc: g2.g.csr[0], uTurnCost: 100 }), [1, 0]);
});

test('ruteo: un giro cerrado que no es vuelta en U se puede, y una calle sin salida tambien', () => {
  // 120 grados en s: se puede
  const nodos = [[0, 0], [100, 0], [50, 87]];
  const g1 = grafoDePrueba(nodos, [{ a: 0, b: 1, uno: true }, { a: 1, b: 2, uno: true }]);
  assert.deepEqual(findArcRoute(g1.g, 0, 2, g1.opts(2)), [0, 1, 2]);
  // Sin otra salida que volver (la entrada de una empresa): se puede
  const g2 = grafoDePrueba([[0, 0], [50, 0], [0, 5]], [{ a: 0, b: 1, uno: true }, { a: 1, b: 2, uno: true }]);
  assert.deepEqual(findArcRoute(g2.g, 0, 2, g2.opts(2)), [0, 1, 2]);
});

test('ruteo: al bajar del ferry el rumbo del barco no cuenta como vuelta en U', () => {
  // A -> F en ferry hacia el este; en F la calle sale para el oeste (a B) o
  // sigue al este (a C, que no lleva a ningun lado).
  const nodos = [[0, 0], [1000, 0], [0, 5], [2000, 0]];
  const { g, opts } = grafoDePrueba(nodos, [
    { a: 0, b: 1, uno: true, ferry: true }, { a: 1, b: 2, uno: true }, { a: 1, b: 3, uno: true },
  ]);
  assert.deepEqual(findArcRoute(g, 0, 2, opts(2)), [0, 1, 2]);
});

test('ruteo: el rumbo en la punta sale de la curva de la arista, no de la recta', () => {
  // De a a s la recta va al este, pero la curva llega a s desde el sur
  // (subiendo): salir de s hacia el norte no es darse vuelta.
  const nodos = [[0, 0], [100, 0], [100, 100]];
  const { g } = grafoDePrueba(nodos, [
    { a: 0, b: 1, uno: true, mids: [[50, -60], [100, -50], [99.6, 0.3]] }, { a: 1, b: 2, uno: true },
  ]);
  const dirs = routeArcDirections(g);
  // la llegada ignora el punto a medio metro (que apunta para otro lado):
  // viene de (100, -50), hacia +y
  assert.ok(Math.abs(dirs.arrX[0]) < 1e-6 && dirs.arrY[0] > 0.99);
  assert.ok(!isUTurnArc(dirs, 0, 1));
  // y recorrida al reves (doble mano), la salida de s va hacia -y
  const g2 = grafoDePrueba(nodos, [{ a: 0, b: 1, mids: [[50, -60], [100, -50], [99.6, 0.3]] }]);
  const d2 = routeArcDirections(g2.g);
  const k = [...g2.g.adjTo.keys()].find(i => d2.from[i] === 1);
  assert.ok(d2.depY[k] < -0.99);
});


test('carriles en nav_hud: solo enteros chicos, y el dibujo sale de ahi', () => {
  const { laneHudRecord, lanesHtml, LANE_ARROW_BITS: B } = require('./pure.js');
  const rec = { count: 3, mask: 0b110, turn: B.right, arrows: [B.straight, B.straight | B.right, B.right, 0, 0, 0, 0, 0] };
  assert.deepEqual(laneHudRecord(rec), { count: 3, mask: 6, turn: B.right, arrows: [B.straight, B.straight | B.right, B.right] });
  // Llega por el relay: cualquier cosa rara es "sin carriles"
  for (const malo of [null, 'x', { ...rec, count: 1 }, { ...rec, count: 9 }, { ...rec, mask: '6' }, { ...rec, turn: -1 },
    { ...rec, arrows: [1, 2] }, { ...rec, arrows: [1, 2, '<b>'] }, { ...rec, arrows: 'abc' }, { ...rec, count: 2.5 }]) {
    assert.equal(laneHudRecord(malo), null, JSON.stringify(malo));
    assert.equal(lanesHtml(malo), '');
  }
  const html = lanesHtml(rec);
  assert.equal((html.match(/class="navLane[ "]/g) || []).length, 3);
  assert.equal((html.match(/navLane on/g) || []).length, 2);
});

test('vista de cabina: se prende solo con cab=1', () => {
  const { cabModeFromSearch } = require('./pure.js');
  assert.equal(cabModeFromSearch('?cab=1'), true);
  assert.equal(cabModeFromSearch('?code=ABCD1234&cab=1'), true);
  for (const s of ['', '?cab=0', '?cab=', '?cabin=1', '?demo=1']) assert.equal(cabModeFromSearch(s), false, s);
});

test('vista de cabina: el mapa se estira con la ventana, como el zoom del navegador', () => {
  const { cabMapScale, CAB_MAP_HEIGHT } = require('./pure.js');
  // A cualquier alto, el mapa ocupa lo mismo de la ventana: a pantalla
  // completa no vuelve a quedar chico
  assert.equal(cabMapScale(CAB_MAP_HEIGHT * 2, 1), 2);
  assert.equal(cabMapScale(1080, 1), 1080 / CAB_MAP_HEIGHT);
  // Mas grande con + (tambien la letra, en el CSS)
  assert.equal(cabMapScale(1080, 1.5), 1080 * 1.5 / CAB_MAP_HEIGHT);
  // Nunca se achica, y sin alto (la ventana todavia sin armar) queda en 1
  assert.equal(cabMapScale(CAB_MAP_HEIGHT / 2, 1), 1);
  for (const h of [0, -5, NaN, undefined, null]) assert.equal(cabMapScale(h, 1), 1, String(h));
  // Un tamano guardado roto no rompe la cuenta
  assert.equal(cabMapScale(600, 'abc'), 600 / CAB_MAP_HEIGHT);
});

test('vista de cabina: el tamano con + y -, entre los topes y de a 10 %', () => {
  const { cabSizeStep, cabSizeSetting, CAB_SIZE_MIN, CAB_SIZE_MAX, CAB_SIZE_DEFAULT } = require('./pure.js');
  assert.equal(cabSizeStep(1, '+'), 1.1);
  assert.equal(cabSizeStep(1, '='), 1.1); // la misma tecla sin Shift
  assert.equal(cabSizeStep(1, '-'), 0.9);
  assert.equal(cabSizeStep(1.7, '0'), CAB_SIZE_DEFAULT);
  assert.equal(cabSizeStep(1, 'a'), null);
  assert.equal(cabSizeStep(1, 'Enter'), null);
  assert.equal(cabSizeStep(CAB_SIZE_MAX, '+'), CAB_SIZE_MAX);
  assert.equal(cabSizeStep(CAB_SIZE_MIN, '-'), CAB_SIZE_MIN);
  // Sin errores de coma flotante que se acumulen
  let s = 1;
  for (let i = 0; i < 7; i++) s = cabSizeStep(s, '+');
  assert.equal(s, 1.7);
  // Lo guardado en localStorage llega como texto, o no llega
  assert.equal(cabSizeSetting('1.3'), 1.3);
  for (const malo of [null, '', 'x', undefined, NaN]) assert.equal(cabSizeSetting(malo), CAB_SIZE_DEFAULT, String(malo));
  assert.equal(cabSizeSetting('9'), CAB_SIZE_MAX);
  assert.equal(cabSizeSetting('0.1'), CAB_SIZE_MIN);
});

test('vista de cabina: el link lleva lo que hace falta para conectarse sola', () => {
  const { cabViewUrl } = require('./pure.js');
  const q = (u) => Object.fromEntries(new URL(u).searchParams);
  // Con codigo (el link que abre el cliente trae backend): el codigo viaja
  assert.deepEqual(q(cabViewUrl('https://trucksim-dash.com/app/?code=OLD&backend=wss%3A%2F%2Fx', 'ABCD1234')),
    { code: 'ABCD1234', backend: 'wss://x', cab: '1' });
  // Codigo tipeado a mano, sin nada en la URL
  assert.equal(cabViewUrl('https://trucksim-dash.com/app/', 'ABCD1234'), 'https://trucksim-dash.com/app/?code=ABCD1234&cab=1');
  // LAN y demo siguen como estan, sin codigo
  assert.deepEqual(q(cabViewUrl('http://192.168.1.5:27765/app/?local=1', 'ABCD1234')), { local: '1', cab: '1' });
  assert.deepEqual(q(cabViewUrl('https://trucksim-dash.com/app/?demo=1', 'DEMO')), { demo: '1', cab: '1' });
  // Convoy y mapa en vivo se quedan en la pestana; el ancla tambien
  assert.deepEqual(q(cabViewUrl('https://trucksim-dash.com/app/?code=ABCD1234&convoy=XY12&live=ats#x', 'ABCD1234')),
    { code: 'ABCD1234', cab: '1' });
  assert.equal(new URL(cabViewUrl('https://trucksim-dash.com/app/#x', '')).hash, '');
});

test('vista de cabina: la flecha grande sale de la maniobra', () => {
  const { turnIconShape, turnIconHtml, LANE_PATHS } = require('./pure.js');
  assert.deepEqual(turnIconShape('straight'), { shape: 'straight' });
  assert.deepEqual(turnIconShape({ kind: 'turn', direction: 'left' }), { shape: 'left' });
  assert.deepEqual(turnIconShape({ kind: 'turn', direction: 'right' }), { shape: 'right' });
  assert.deepEqual(turnIconShape({ kind: 'fork', direction: 'left' }), { shape: 'slightLeft' });
  assert.deepEqual(turnIconShape({ kind: 'fork', direction: 'right' }), { shape: 'slightRight' });
  assert.deepEqual(turnIconShape({ kind: 'roundabout', exit: 3, ccw: true }), { shape: 'roundabout', exit: 3 });
  // Sin maniobra no hay flecha
  for (const nada of [null, undefined, '', 'x', {}, { kind: 'otro' }]) {
    assert.equal(turnIconShape(nada), null, JSON.stringify(nada));
    assert.equal(turnIconHtml(nada), '');
  }
  // La forma es la de la flecha de carril, y la rotonda lleva su salida
  assert.ok(turnIconHtml({ kind: 'turn', direction: 'right' }).includes(LANE_PATHS.right[0]));
  assert.ok(turnIconHtml({ kind: 'roundabout', exit: 2 }).includes('>2</text>'));
  // Una salida rara no se escribe en el SVG
  for (const exit of ['<b>', 2.5, -1, 0, 120]) {
    const html = turnIconHtml({ kind: 'roundabout', exit });
    assert.ok(html.includes('<circle') && !html.includes('<text'), String(exit));
  }
});

test('vista de cabina: el texto del giro sin la flecha del principio', () => {
  const { turnTextWithoutArrow } = require('./pure.js');
  assert.equal(turnTextWithoutArrow('↱ Turn right in 300 m'), 'Turn right in 300 m');
  assert.equal(turnTextWithoutArrow('↻ Roundabout in 1 km: take the 2nd exit'), 'Roundabout in 1 km: take the 2nd exit');
  assert.equal(turnTextWithoutArrow('⬆ Continue straight'), 'Continue straight');
  assert.equal(turnTextWithoutArrow('Sin destino asignado'), 'Sin destino asignado');
  assert.equal(turnTextWithoutArrow(null), '');
});

test('stabilizeManeuver: el giro siguiente hacia el otro lado, a menos de 40 m, no queda tapado por el anterior', () => {
  // Pasado un "turn left", la entrada a la empresa a la derecha 38 m despues
  // (Le Mans -> Bourges, simulaciones del 15-10): antes seguia "turn left".
  const st = {};
  const izq = { kind: 'turn', direction: 'left', distanceMeters: 60, node: [0, 0] };
  stabilizeManeuver(st, izq, 2); stabilizeManeuver(st, izq, 2);
  const der = { kind: 'turn', direction: 'right', distanceMeters: 30, node: [30, 24] };
  assert.equal(stabilizeManeuver(st, der, 2).direction, 'left'); // 1 dato: anti-parpadeo
  const nuevo = stabilizeManeuver(st, { ...der, distanceMeters: 28 }, 2);
  assert.deepEqual([nuevo.direction, nuevo.node], ['right', [30, 24]]);
  // Del mismo lado sigue siendo el mismo cruce (keep -> turn), y en el mismo
  // nodo tambien aunque cambie el sentido (la rotonda, que se mide de nuevo)
  const st2 = {};
  const rb = { kind: 'roundabout', direction: 'left', exit: 2, distanceMeters: 80, node: [5, 5] };
  stabilizeManeuver(st2, rb, 2); stabilizeManeuver(st2, rb, 2);
  const otra = stabilizeManeuver(st2, { kind: 'turn', direction: 'right', distanceMeters: 70, node: [5.2, 5] }, 2);
  assert.deepEqual([otra.kind, otra.direction, otra.distanceMeters], ['roundabout', 'left', 70]);
});

test('ruteo: con los segundos redondeados, la recta del cruce le gana a la V por el brazo', () => {
  // Fort Dodge (ATS): oeste -> este derecho 63 m (5,67 s, guardado 6) contra
  // oeste -> brazo sur -> este, 34 + 34 m (3 + 3 s). Empataban.
  const { routeEdgeCost } = require('./pure.js');
  const nodos = [[0, 0], [63, 0], [31.5, 20]];
  const aristas = [{ a: 0, b: 1, s: 6 }, { a: 0, b: 2, s: 3, m: 34 }, { a: 2, b: 1, s: 3, m: 34 }];
  const { g } = grafoDePrueba(nodos, aristas.map(e => ({ ...e, uno: true })));
  const largo = (e) => e.m || Math.hypot(nodos[e.a][0] - nodos[e.b][0], nodos[e.a][1] - nodos[e.b][1]);
  const base = { heuristic: (i) => Math.hypot(nodos[i][0] - 63, nodos[i][1]) / 25, isFerry: () => false };
  assert.deepEqual(findArcRoute(g, 0, 1, { ...base, cost: (k) => routeEdgeCost(aristas[k].s, largo(aristas[k]), true) }), [0, 1]);
  assert.ok(routeEdgeCost(6, 63, true) < routeEdgeCost(3, 34, true) + routeEdgeCost(3, 34, true));
});

test('ruteo: "mas corta" no sale de la autopista por un area de descanso para ahorrar unos metros', () => {
  const { routeEdgeCost, ROUTE_SHORT_M_PER_S } = require('./pure.js');
  // Por metros, mas unos metros por segundo
  assert.equal(routeEdgeCost(6, 63, false), 63 + 6 * ROUTE_SHORT_M_PER_S);
  const mas = (a, b) => routeEdgeCost(a.s, a.m, false) < routeEdgeCost(b.s, b.m, false);
  // Beaumont -> Lafayette (ATS): por el cruce 748 m y 49 s, por la autopista 764 m y 41 s
  assert.ok(mas({ m: 764, s: 41 }, { m: 748, s: 49 }));
  // La salida y la entrada en Jefferson City: 3 m menos y 10 s mas
  assert.ok(mas({ m: 657, s: 38 }, { m: 654, s: 48 }));
  // Un atajo de verdad sigue ganando: Salem -> Bend, 122 m menos y 2 s mas
  assert.ok(mas({ m: 1394, s: 86 }, { m: 1516, s: 84 }));
});

test('createCityScale: lo que falta medido sobre la ruta entera no salta al entrar al hueco entre cajas', () => {
  // Little Rock -> Tulsa (ATS, simulaciones del 15-10): caja, 300 m de
  // hueco, caja. Medido sobre la ruta recortada, al entrar al hueco el resto
  // pasaba a 1:20 y la distancia al giro subia de 1 km a 6,5.
  const { createCityScale } = require('./pure.js');
  const escala = createCityScale([[0, 0, 1000, 1000], [1300, 0, 1000, 1000]], { outside: 20, gapM: 500, margin: 0 });
  const ruta = [[200, 500], [1000, 500], [1300, 500], [2000, 500], [3000, 500]];
  const total = escala.routeMeters(ruta, ruta);
  assert.ok(Math.abs(total - ((800 + 300 + 1000) * 3 + 700 * 20)) < 1e-6); // el hueco a 1:3
  let antes = Infinity, giroAntes = Infinity;
  for (let x = 200; x < 2950; x += 5) {
    // la ruta recortada como trimRouteBehindTruck: el camion y los puntos de adelante
    const k = ruta.findIndex(p => p[0] > x);
    const recortada = [[x, 500], ...ruta.slice(k)];
    const falta = escala.routeMeters(ruta, recortada);
    assert.ok(falta <= antes + 1e-6, `en x=${x}: ${falta} > ${antes}`);
    antes = falta;
    if (x < 2000) {
      const giro = escala.routeMeters(ruta, recortada, 2000 - x); // el giro esta en x = 2000
      assert.ok(giro <= giroAntes + 1e-6, `giro en x=${x}: ${giro} > ${giroAntes}`);
      giroAntes = giro;
    }
  }
  // Lo de antes, sobre la ruta recortada, si saltaba (entrando al hueco)
  const adentro = escala.pathMeters([[990, 500], [1000, 500], ...ruta.slice(2)], 1010);
  const enElHueco = escala.pathMeters([[1010, 500], ...ruta.slice(2)], 990);
  assert.ok(enElHueco > adentro + 4000);
  // Un camino que no sale de la ruta (la recta a un POI) se mide como siempre
  assert.equal(escala.routeMeters(ruta, [[1100, 500], [1200, 500]]), escala.pathMeters([[1100, 500], [1200, 500]]));
  assert.equal(escala.routeMeters(null, [[1100, 500], [1200, 500]]), 100 * 20);
  assert.equal(escala.routeMeters(ruta, null), 0);
});

test('stoppedRouteLead: parado antes de un cruce, la ruta empieza con la entrada al cruce', () => {
  const { stoppedRouteLead, STOPPED_LEAD_MAX_M, STOPPED_LEAD_BACK_M } = require('./pure.js');
  // Rumbo del juego: 0 = hacia -z, horario. El cruce en (0, 0) y la ruta dobla
  // a la derecha (+x), como la T de Rockford (Discord, Gargamosch, 18-10).
  const ruta = [[0, 0, 0, 1, 7], [50, 0, 0, 0, null], [100, 0, 0, 1, 8]];
  // 5 m antes, mirando al cruce: un punto STOPPED_LEAD_BACK_M detras del camion
  assert.deepEqual(stoppedRouteLead(ruta, 0, 5, 0), [0, 5 + STOPPED_LEAD_BACK_M, 0, 0, null]);
  // En la linea, corrido por el carril: igual (a menos de 5 m no se mira el angulo)
  const enLaLinea = stoppedRouteLead(ruta, 3, 2, 0);
  assert.ok(enLaLinea && enLaLinea[4] === null && enLaLinea[1] > 2);
  // Ya arranca en el tramo del camion (andando): nada
  assert.equal(stoppedRouteLead([[0, 3, 0, 0, null], ...ruta], 0, 5, 0), null);
  // El nodo lejos, atras o al costado: nada
  assert.equal(stoppedRouteLead(ruta, 0, STOPPED_LEAD_MAX_M + 5, 0), null);
  assert.equal(stoppedRouteLead(ruta, 0, -10, 0), null);
  assert.equal(stoppedRouteLead(ruta, -10, 1, 0), null);
  // La ruta sale del nodo para atras (hay que dar la vuelta): nada
  assert.equal(stoppedRouteLead([[0, 0, 0, 1, 7], [0, 50, 0, 0, null]], 0, 5, 0), null);
  // Sin rumbo del juego (cliente viejo): el del camion al nodo, si no esta encima
  assert.deepEqual(stoppedRouteLead(ruta, 0, 10, null), [0, 10 + STOPPED_LEAD_BACK_M, 0, 0, null]);
  assert.equal(stoppedRouteLead(ruta, 0, 3, null), null);
  // Sin datos
  assert.equal(stoppedRouteLead(null, 0, 5, 0), null);
  assert.equal(stoppedRouteLead(ruta, NaN, 5, 0), null);
});

test('snapRouteStartToNode: recalculada andando a 1 m de un nodo, arranca en el nodo con la entrada de parado (US-85, Cheyenne)', () => {
  const { snapRouteStartToNode, stoppedRouteLead, ROUTE_START_SNAP_M } = require('./pure.js');
  // Rumbo del juego: 0 = hacia -z, horario. Una cadena de nodos de cruce
  // hacia el norte (A, B, C y D en 99 m, como la entrada a la US-85) y la
  // calle dobla a la izquierda despues de D. La ruta recalculada arranca en
  // el tramo del camion a 1,4 m de A, con esa cuerda a 37 grados.
  const rumboJuego = (p, q) => (Math.atan2(q[0] - p[0], -(q[1] - p[1])) * 180 / Math.PI + 360) % 360;
  const resto = [[0, 0, 0, 1, 1], [0, -15, 0, 1, 2], [0, -62, 0, 1, 3], [0, -99, 0, 1, 4],
    [-0.2, -113, 0, 0, null], [-4, -121, 0, 0, null], [-12, -126.6, 0, 0, null], [-31, -126.6, 0, 0, 5], [-400, -126.6, 0, 0, 6]];
  const arranque = [-0.84, 1.12, 0, 0, null];
  const recalculada = [arranque, ...resto];
  const giro = (pts) => {
    const { cum, pointAt } = routeMetrics(pts);
    const i = pts.findIndex((p) => p[3] === 1);
    const iEnd = junctionClusterEnd(pts, cum, i, 50, 100);
    const m = detectManeuver({ pts, i, iEnd, cum, pointAt, bearingBetween: rumboJuego, nodes: null, adjacency: null });
    return m && [m.kind, m.direction, pts[m.at][4]];
  };
  // Asi el giro quedaba en A, 99 m antes de la esquina: "in 0 ft"
  assert.deepEqual(giro(recalculada), ['turn', 'left', 1]);
  const pegada = snapRouteStartToNode(recalculada);
  assert.equal(pegada[0], resto[0]);
  const entrada = stoppedRouteLead(pegada, arranque[0], arranque[1], 0);
  assert.ok(entrada && entrada[0] === 0 && entrada[1] > 30); // detras del camion, sobre su rumbo
  assert.deepEqual(giro([entrada, ...pegada]), ['turn', 'left', 4]); // en D, la esquina
  // Lejos del nodo, ya arrancando en un nodo (parado) o antes de un punto de
  // la curva: la misma ruta
  const lejos = [[0, ROUTE_START_SNAP_M + 1, 0, 0, null], ...resto];
  assert.equal(snapRouteStartToNode(lejos), lejos);
  assert.equal(snapRouteStartToNode(resto), resto);
  const curva = [[-0.1, -110, 0, 0, null], ...resto.slice(4)];
  assert.equal(snapRouteStartToNode(curva), curva);
  assert.equal(snapRouteStartToNode(null), null);
});

test('recalcRouteStart: el comienzo de la ruta recalculada, parado y andando', () => {
  const { recalcRouteStart, STOPPED_LEAD_BACK_M } = require('./pure.js');
  // Rumbo del juego 0 = hacia -z. Un cruce en (0, 0) y la ruta sigue al norte.
  const nodos = [[0, 0, 0, 1, 7], [0, -50, 0, 0, null], [0, -100, 0, 1, 8]];
  // Parado (sin rumbo): arranca en el nodo y lleva la entrada
  assert.deepEqual(recalcRouteStart(nodos, 0, 5, 0, null)[0], [0, 5 + STOPPED_LEAD_BACK_M, 0, 0, null]);
  // Andando a 1 m del nodo: sin el punto del tramo, con la entrada
  const pegada = [[0.5, 1, 0, 0, null], ...nodos];
  const r = recalcRouteStart(pegada, 0.5, 1, 0, 0);
  assert.equal(r.length, nodos.length + 1);
  assert.equal(r[1], nodos[0]);
  assert.ok(r[0][4] === null && r[0][1] > 30);
  // Igual, pero siguiendo lo recorrido: sin la entrada (la da lo recorrido)
  assert.deepEqual(recalcRouteStart(pegada, 0.5, 1, 0, 0, true), nodos);
  // Andando lejos del nodo: la misma ruta
  const lejos = [[0, 20, 0, 0, null], ...nodos];
  assert.equal(recalcRouteStart(lejos, 0, 20, 0, 0), lejos);
});

test('positionAtOrigin: el camion en 0,0 exacto es un dato sin posicion (Cheyenne, 22-10)', () => {
  const { positionAtOrigin } = require('./pure.js');
  assert.equal(positionAtOrigin({ x: 0, y: 0, z: 0 }), true);
  assert.equal(positionAtOrigin({ x: 0, z: 0 }), true);
  assert.equal(positionAtOrigin({ x: 0, z: 5 }), false);
  assert.equal(positionAtOrigin({ x: 0.4, z: 0 }), false);
  assert.equal(positionAtOrigin({ x: -35759, y: 10, z: -16539 }), false);
  // sin dato no es 0,0 (Number(null) es 0)
  assert.equal(positionAtOrigin({ x: null, z: null }), false);
  assert.equal(positionAtOrigin(null), false);
  assert.equal(positionAtOrigin(undefined), false);
});

test('recalcOnRoute: sin desviarse, la ruta nueva sigue con lo recorrido y el rumbo (Tyler -> Lufkin, ATS)', () => {
  const { recalcOnRoute } = require('./pure.js');
  // Lo recorrido: 100 m al norte con los nodos de la esquina; la ruta vieja
  // recortada arranca en el camion y sigue 200 m
  const behind = [[0, 100, 0, 0, null], [0, 40, 0, 1, 7], [0, 0, 0, 0, null]];
  const route = [[0, 0, 0, 0, null], [0, -60, 0, 1, 8], [0, -200, 0, 0, 9]];
  assert.equal(recalcOnRoute({ offRoute: false, behind, route, x: 0, z: 0 }), true);
  assert.equal(recalcOnRoute({ offRoute: false, behind, route, x: 20, z: -5 }), true);
  // Desviado, o lejos del comienzo de la ruta vieja: de cero, como siempre
  assert.equal(recalcOnRoute({ offRoute: true, behind, route, x: 0, z: 0 }), false);
  assert.equal(recalcOnRoute({ offRoute: false, behind, route, x: 60, z: 0 }), false);
  // Recien calculada parado en el deposito (no anduvo nada), o al final del
  // viaje (a la ruta vieja no le queda nada): tampoco
  assert.equal(recalcOnRoute({ offRoute: false, behind: [[0, 10, 0, 0, null], [0, 0, 0, 0, null]], route, x: 0, z: 0 }), false);
  assert.equal(recalcOnRoute({ offRoute: false, behind, route: [[0, 0], [0, -20]], x: 0, z: 0 }), false);
  // Sin ruta vieja, sin lo recorrido o sin posicion
  assert.equal(recalcOnRoute({ offRoute: false, behind, route: null, x: 0, z: 0 }), false);
  assert.equal(recalcOnRoute({ offRoute: false, behind: [], route, x: 0, z: 0 }), false);
  assert.equal(recalcOnRoute({ offRoute: false, behind, route, x: NaN, z: 0 }), false);
  assert.equal(recalcOnRoute(), false);
});

test('startArcForHeading: recalcular andando arranca en la calzada y el sentido del camion', () => {
  const { startArcForHeading } = require('./pure.js');
  // Autovia: calzada al este en z = 0 y al oeste en z = -20, de un sentido,
  // con nodos solo en las puntas (1 km); y una calle de doble mano al sur.
  const nodos = [[0, 0], [1000, 0], [1000, -20], [0, -20], [0, 40], [1000, 40]];
  const { g } = grafoDePrueba(nodos, [
    { a: 0, b: 1, uno: true }, { a: 2, b: 3, uno: true }, { a: 4, b: 5, mids: [[500, 45]] },
  ]);
  const llegaA = (r) => r && r.to;
  // Yendo al este a 6 m de la calzada este: su punta, aunque el nodo mas
  // cercano (a 500 m) sea cualquiera
  let r = startArcForHeading(g, 500, -6, 90);
  assert.equal(llegaA(r), 1);
  assert.deepEqual(r.point.map(Math.round), [500, 0]);
  assert.ok(Math.abs(r.f - 0.5) < 1e-6);
  // Mas cerca de la calzada oeste pero yendo al este: igual la este
  r = startArcForHeading(g, 500, -12, 90);
  assert.equal(llegaA(r), 1);
  // Yendo al oeste: la oeste, hacia su punta
  assert.equal(llegaA(startArcForHeading(g, 500, -8, 270)), 3);
  // Doble mano: el sentido lo pone el rumbo, con lo que queda de la curva
  r = startArcForHeading(g, 300, 42, 265);
  assert.deepEqual([r.to, r.rest.length], [4, 0]);
  r = startArcForHeading(g, 300, 42, 85);
  assert.deepEqual([r.to, r.rest.map(p => p.map(Math.round))], [5, [[500, 45]]]);
  // Lejos de todo, o cruzado (rumbo norte sobre la autovia): nada, como antes
  assert.equal(startArcForHeading(g, 500, 200, 90), null);
  assert.equal(startArcForHeading(g, 500, -6, 0), null);
  assert.equal(startArcForHeading(g, 500, -6, NaN), null);
  // edgeOk deja afuera lo que no se puede usar (DLC, islas)
  assert.equal(llegaA(startArcForHeading(g, 500, -6, 90, { edgeOk: (e) => e !== 0 })), null);
});

test('startArcForHeading: en una autovia de una sola arista cuenta la calzada, no el eje (Grimsby -> Sheffield, ETS2)', () => {
  const { startArcForHeading } = require('./pure.js');
  // La autovia es una arista de doble mano (0-1) dibujada 6 m a la derecha de
  // cada sentido; un carril de prefab de un sentido (2-3) pasa a 4 m del eje,
  // del lado de la calzada que va al este. El camion va al este por su
  // calzada, a 6 m del eje y a 2 del carril de prefab.
  const nodos = [[0, 0], [1000, 0], [0, 4], [1000, 4]];
  const { g } = grafoDePrueba(nodos, [{ a: 0, b: 1 }, { a: 2, b: 3, uno: true }]);
  g.shiftA = Int8Array.from([12, 0]); g.shiftB = Int8Array.from([12, 0]); // medios metros
  assert.equal(startArcForHeading(g, 500, 6, 90).to, 1);
  // La otra mano (al oeste) va 6 m del otro lado: a 6 m al norte del eje, su punta es 0
  assert.equal(startArcForHeading(g, 500, -6, 270).to, 0);
  // En Inglaterra la corrida es para la izquierda (negativa): el camion al
  // este va al norte del eje, y el carril de prefab del sur ya no le gana
  g.shiftA = Int8Array.from([-12, 0]); g.shiftB = Int8Array.from([-12, 0]);
  assert.equal(startArcForHeading(g, 500, -6, 90).to, 1);
  // Sin corrida (grafo v2), el eje como antes: el prefab, mas cerca
  delete g.shiftA; delete g.shiftB;
  assert.equal(startArcForHeading(g, 500, 6, 90).to, 3);
});

test('startArcForHeading: los carriles de un prefab que todavia no se separan van como alternativas', () => {
  const { startArcForHeading, START_ARC_TIE_M } = require('./pure.js');
  // Dos carriles que salen juntos y se abren: derecho (0-1) y doblando (0-2,
  // con la curva pegada al derecho al principio); y una calle a 30 m.
  const nodos = [[0, 0], [100, 0], [60, 60], [0, 30], [100, 30]];
  const { g } = grafoDePrueba(nodos, [
    { a: 0, b: 1, uno: true }, { a: 0, b: 2, uno: true, mids: [[20, 0.5], [40, 8]] }, { a: 3, b: 4, uno: true },
  ]);
  const r = startArcForHeading(g, 10, 0.6, 90);
  assert.equal(r.to, 2); // el de la curva queda mas cerca
  assert.deepEqual(r.alts.map(c => c.to), [1]);
  assert.ok(r.alts[0].dist <= r.dist + START_ARC_TIE_M);
  // Ya separados, una sola
  assert.deepEqual(startArcForHeading(g, 50, 0.5, 90).alts, []);
});

test('startArcForHeading: una arista de doble mano sin el arco de ida (un atajo en U sacado) sigue de vuelta', () => {
  const { startArcForHeading } = require('./pure.js');
  const { g } = grafoDePrueba([[0, 0], [100, 0]], [{ a: 0, b: 1 }]);
  // Como buildRouteGraph sin el arco 0 -> 1 (uTurnShortcuts): queda 1 -> 0
  const k = [...g.adjRev.keys()].find(j => g.adjRev[j] === 1);
  g.csr = Uint32Array.from([0, 0, 1]);
  g.adjTo = Int32Array.from([g.adjTo[k]]); g.adjEdge = Int32Array.from([g.adjEdge[k]]); g.adjRev = Uint8Array.from([1]);
  const r = startArcForHeading(g, 50, 0, 270);
  assert.equal(r.to, 0);
  assert.equal(startArcForHeading(g, 50, 0, 90), null);
});

test('routeReachability: una zona sin salida (Volkhov, ETS2) y una sin entrada (Durango, ATS)', () => {
  const { routeReachability } = require('./pure.js');
  // 0, 1 y 2 de doble mano (la componente fuerte mayor); 2 -> 3 de una mano
  // y 3-4 de doble mano: se entra y no se sale. 5 -> 0 de una mano: se sale
  // y no se entra.
  const nodos = [[0, 0], [100, 0], [200, 0], [300, 0], [400, 0], [-100, 0]];
  const { g } = grafoDePrueba(nodos, [
    { a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 3, uno: true }, { a: 3, b: 4 }, { a: 5, b: 0, uno: true },
  ]);
  const r = routeReachability(g);
  assert.deepEqual([...r.inMain], [1, 1, 1, 0, 0, 0]);
  assert.deepEqual([...r.reachFromMain], [1, 1, 1, 1, 1, 0]); // a 5 no se llega
  assert.deepEqual([...r.reachesMain], [1, 1, 1, 0, 0, 1]); // de 3 y 4 no se sale
  assert.equal(routeReachability(g), r); // una vez por grafo
});

test('slowNodes: los nodos de una calle o un prefab, para terminar la ruta en una parada y no en la autopista', () => {
  const { slowNodes, STOP_SLOW_KMH } = require('./pure.js');
  // Autopista 0-1-2 a 90 km/h; del 1 sale la entrada a una estacion (1-3, 40
  // km/h). El 0 y el 2 son solo de autopista; el 1 y el 3, no.
  const nodos = [[0, 0], [500, 0], [1000, 0], [520, 30]];
  const aristas = [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 1, b: 3 }];
  const { g } = grafoDePrueba(nodos, aristas);
  g.edgeM = Float32Array.from([500, 500, 36]);
  g.edgeS = Uint16Array.from([20, 20, 3]); // 90, 90 y ~43 km/h
  assert.deepEqual([...slowNodes(g)], [0, 1, 0, 1]);
  assert.equal(slowNodes(g), slowNodes(g)); // una vez por grafo
  // Con otro tope se arma de nuevo
  assert.deepEqual([...slowNodes(g, 95)], [1, 1, 1, 1]);
  assert.ok(STOP_SLOW_KMH > 60 && STOP_SLOW_KMH < 90);
});

test('stopEndNodes: los nodos lentos casi igual de cerca de una parada, para entrar por la mano que queda a mano (turn report #6, 26-10)', () => {
  const { stopEndNodes, STOP_SLOW_TIE_M } = require('./pure.js');
  // El icono de un area de descanso entre las dos calzadas (en 0,0): el area
  // de la otra mano a 23 m (nodo 0, el elegido), la suya a 48 (1), otra calle
  // a 70 (2, mas de 40 m mas lejos), la autopista a 10 (3, rapido) y un nodo
  // de otra componente a 30 (4)
  const g = { n: 5, nodes: Float32Array.from([0, -23, 0, 48, 70, 0, 0, 10, 30, 0]), componentId: Int32Array.from([0, 0, 0, 0, 1]) };
  const lentos = Uint8Array.from([1, 1, 1, 0, 1]);
  assert.deepEqual(stopEndNodes(g, 0, 0, 0, lentos), [0, 1]);
  assert.deepEqual(stopEndNodes(g, 0, 0, 0, lentos, 50), [0, 1, 2]);
  // los que no pasa nodeOk (DLC apagado) no cuentan
  assert.deepEqual(stopEndNodes(g, 0, 0, 0, lentos, STOP_SLOW_TIE_M, Uint8Array.from([1, 0, 1, 1, 1])), [0]);
});

test('yardNodes: a la empresa del trabajo no se llega por un nodo de la autopista, aunque sus tramos de prefab sean lentos', () => {
  const { slowNodes, yardNodes } = require('./pure.js');
  // Como Rail Export de Casper (22-10): calzada de un sentido 0 -> 1 a 90
  // km/h, un prefab de la autopista 1 -> 2 (8 m, 40 km/h, como todo prefab
  // del grafo) y sigue 2 -> 3 a 90. Del otro lado, una calle 4 - 5 a 60 y
  // el patio 5 - 6 a 40. Para slowNodes el 1 es lento (sale por el prefab);
  // para yardNodes no: le llega la autopista.
  const nodos = [[0, 0], [500, 0], [508, 0], [1000, 0], [300, 200], [500, 200], [550, 120]];
  const aristas = [
    { a: 0, b: 1, uno: true }, { a: 1, b: 2, uno: true }, { a: 2, b: 3, uno: true },
    { a: 4, b: 5 }, { a: 5, b: 6 },
  ];
  const { g } = grafoDePrueba(nodos, aristas);
  g.edgeM = Float32Array.from([500, 8, 492, 200, 94]);
  g.edgeS = Uint16Array.from([20, 1, 20, 12, 8]); // 90, ~29, ~89, 60 y ~42 km/h
  assert.deepEqual([...slowNodes(g)], [0, 1, 0, 0, 1, 1, 1]);
  assert.deepEqual([...yardNodes(g)], [0, 0, 0, 0, 1, 1, 1]);
  assert.equal(yardNodes(g), yardNodes(g)); // una vez por grafo
  assert.deepEqual([...yardNodes(g, 95)], [1, 1, 1, 1, 1, 1, 1]);
});

test('waypointArcs y findArcRoute con endArcs: un waypoint sobre la autovia pasa por su calzada, no por el nodo mas cercano', () => {
  const { waypointArcs, findArcRoute, waypointPassesBy, WAYPOINT_ARC_M } = require('./pure.js');
  // Autovia de dos calzadas de una mano, 20 m entre si: la de ida (0 -> 1 ->
  // 2, al este, z = 0) y la de vuelta (3 -> 4 -> 5, al oeste, z = -20), con
  // un retorno en cada punta (2 -> 3, 5 -> 0). El nodo 4 (vuelta) queda a 10
  // m del waypoint y el 1 (ida) a 60: con el nodo mas cercano, la ruta hasta
  // el waypoint iba hasta la punta, daba la vuelta y volvia por la otra.
  const nodos = [[0, 0], [550, 0], [1000, 0], [1000, -20], [490, -20], [0, -20], [600, 40]];
  const aristas = [
    { a: 0, b: 1, uno: true }, { a: 1, b: 2, uno: true }, { a: 2, b: 3, uno: true },
    { a: 3, b: 4, uno: true }, { a: 4, b: 5, uno: true }, { a: 5, b: 0, uno: true },
  ];
  const { g, opts } = grafoDePrueba(nodos, aristas);
  g.edgeF = Uint8Array.from(aristas.map(() => 2));
  g.edgeM = Float32Array.from(aristas.map(e => Math.hypot(nodos[e.a][0] - nodos[e.b][0], nodos[e.a][1] - nodos[e.b][1])));
  g.edgeS = Uint16Array.from([...g.edgeM].map(m => Math.round(m / 25)));
  const wp = [490, -3]; // sobre la calzada de ida, a 3 m
  const arcos = waypointArcs(g, wp[0], wp[1]);
  // La de ida, y la contraria a los dos lados del nodo 4 (de una mano, para
  // el otro lado y a la misma velocidad)
  assert.deepEqual(arcos.map(c => g.adjEdge[c.arc]).sort(), [0, 3, 4]);
  const ida = arcos.find(c => g.adjEdge[c.arc] === 0);
  assert.ok(Math.abs(ida.f - 490 / 550) < 1e-6 && ida.dist < 3.01);
  // Desde 0 por la de ida: termina en el punto del waypoint sobre ella
  const ruta = findArcRoute(g, 0, -1, { ...opts(1), endArcs: new Map(arcos.map(c => [c.arc, c.f])) });
  assert.deepEqual([...ruta], [0, 1]);
  assert.equal(g.adjEdge[ruta.endArc], 0);
  assert.ok(Math.abs(ruta.cost - 490) < 1e-6);
  // Lejos de toda calle (un estacionamiento), ninguno: va al nodo mas cercano
  assert.deepEqual(waypointArcs(g, 600, 40 + WAYPOINT_ARC_M + 30), []);
  // Sin endArcs, nada cambia: hasta el nodo, y el costo
  const normal = findArcRoute(g, 0, 2, opts(2));
  assert.deepEqual([...normal], [0, 1, 2]);
  assert.equal(normal.endArc, null);
  assert.ok(Math.abs(normal.cost - 1000) < 1e-6);
  // Solo el puesto tocando el mapa pasa por la calle; una parada, una empresa o el lider del convoy, no
  assert.equal(waypointPassesBy({ pos: wp, label: null }), true);
  assert.equal(waypointPassesBy({ pos: wp, label: 'Gas station (I-80)', kind: 'g' }), false);
  assert.equal(waypointPassesBy({ pos: wp, label: 'Coastline Mining (Salt Lake City)' }), false);
  assert.equal(waypointPassesBy(null), false);
});

test('ruteo: arrancando en el tramo del camion no se da la vuelta en el primer nodo', () => {
  // El camion va de a hacia s (al este) y el destino z esta atras, pasando b.
  // Sin el arco de llegada, desde s la ruta volvia derecho a a.
  const nodos = [[0, 0], [100, 0], [-100, 0], [200, 0], [300, 30], [300, -30]];
  const [a, s, z, t, v, w] = nodos.keys();
  const { g, opts } = grafoDePrueba(nodos, [
    { a, b: s }, { a, b: z }, { a: s, b: t }, { a: t, b: v, uno: true }, { a: v, b: w, uno: true }, { a: w, b: t, uno: true },
  ]);
  assert.deepEqual(findArcRoute(g, s, z, opts(z)), [s, a, z]);
  const llegada = [...g.adjTo.keys()].find(k => routeArcDirections(g).from[k] === a && g.adjTo[k] === s);
  assert.deepEqual(findArcRoute(g, s, z, { ...opts(z), startArc: llegada }), [s, t, v, w, t, s, a, z]);
  // Calle sin salida adelante: se puede volver
  const g2 = grafoDePrueba([[0, 0], [100, 0], [-100, 0]], [{ a: 0, b: 1 }, { a: 0, b: 2 }]);
  const k2 = [...g2.g.adjTo.keys()].find(k => routeArcDirections(g2.g).from[k] === 0 && g2.g.adjTo[k] === 1);
  assert.deepEqual(findArcRoute(g2.g, 1, 2, { ...g2.opts(2), startArc: k2 }), [1, 0, 2]);
});

test('detectRoundabout: una manzana de una mano con las esquinas redondeadas no es rotonda (Texas, 15-10)', () => {
  const { detectRoundabout, longestStraightFrac, RING_MAX_STRAIGHT } = require('./pure.js');
  // manzana de 100 m, calles de una mano en sentido antihorario y esquinas
  // con curvas de giro de radio 15: pasa por redonda (1,29) pero tiene lados
  // rectos de 70 m (el 19 % de la vuelta)
  const nodos = [], aristas = [], lineas = new Map();
  const esquinas = [[35, -35, -Math.PI / 2], [35, 35, 0], [-35, 35, Math.PI / 2], [-35, -35, Math.PI]];
  for (const [cx, cy, a0] of esquinas) nodos.push([cx + 15 * Math.cos(a0), cy + 15 * Math.sin(a0)], [cx + 15 * Math.cos(a0 + Math.PI / 2), cy + 15 * Math.sin(a0 + Math.PI / 2)]);
  for (let k = 0; k < 8; k++) aristas.push([k, (k + 1) % 8, false]);
  // la curva de cada esquina (de 2c a 2c+1), con un vertice cada 10 grados
  esquinas.forEach(([cx, cy, a0], c) => lineas.set(`${2 * c},${2 * c + 1}`, Array.from({ length: 10 }, (_, t) => [cx + 15 * Math.cos(a0 + t * Math.PI / 18), cy + 15 * Math.sin(a0 + t * Math.PI / 18)])));
  const sur = conCalle(nodos, aristas, 0, 0, -300); conCalle(nodos, aristas, 2, 300, 0); const norte = conCalle(nodos, aristas, 4, 0, 300);
  const g = grafoChico(nodos, aristas);
  const edgeLine = (a, b) => lineas.get(`${a},${b}`) || null;
  const ctx = { ...rutaPor(nodos, [sur, 0, 1, 2, 3, 4, norte]), i: 1, iEnd: 1, ...g, edgeLine, bearingBetween: planarBearing };
  assert.equal(detectRoundabout(ctx), null);
  // una rotonda de verdad dobla parejo
  const circulo = Array.from({ length: 60 }, (_, k) => [30 * Math.cos(k * Math.PI / 30), 30 * Math.sin(k * Math.PI / 30)]);
  assert.ok(longestStraightFrac(circulo) < RING_MAX_STRAIGHT);
});

test('detectRoundabout: un cruce con curvas que pasan por el medio no es una rotonda compacta', () => {
  const { detectRoundabout, compactIslandM } = require('./pure.js');
  // el mismo armado que la rotonda compacta, con las curvas por un anillo de
  // radio r: con 12 m hay isla, con 1,5 m es un cruce de curvas "cuadradas"
  const armar = (r) => {
    const nodos = [[0, -25], [25, 0], [0, 25], [-25, 0]];
    const arco = (desde, hasta) => {
      const a0 = Math.atan2(nodos[desde][1], nodos[desde][0]);
      let a1 = Math.atan2(nodos[hasta][1], nodos[hasta][0]);
      while (a1 <= a0) a1 += 2 * Math.PI;
      const line = [nodos[desde]];
      for (let a = a0; a <= a1 + 1e-9; a += Math.PI / 12) line.push([r * Math.cos(a), r * Math.sin(a)]);
      line.push(nodos[hasta]);
      return line;
    };
    const largo = (l) => l.slice(1).reduce((s2, p, k) => s2 + Math.hypot(p[0] - l[k][0], p[1] - l[k][1]), 0);
    const adjacency = new Map(), lineas = new Map();
    for (let a = 0; a < 4; a++) for (let b = 3; b >= 0; b--) if (a !== b) {
      const l = arco(a, b); lineas.set(`${a},${b}`, l);
      if (!adjacency.has(a)) adjacency.set(a, []);
      adjacency.get(a).push([b, largo(l)]);
    }
    const calle = (desde, dx, dy) => { const k = nodos.length; nodos.push([nodos[desde][0] + dx, nodos[desde][1] + dy]);
      adjacency.get(desde).push([k, 300]); adjacency.set(k, [[desde, 300]]); return k; };
    const sur = calle(0, 0, -300); calle(1, 300, 0); const norte = calle(2, 0, 300); calle(3, -300, 0);
    const nodeAt = (k) => nodos[k];
    const edgeLine = (a, b) => lineas.get(`${a},${b}`) || [nodos[a], nodos[b]];
    return { ctx: { ...rutaPor(nodos, [sur, 0, 2, norte]), i: 1, iEnd: 2, adjacency, nodeAt, edgeLine, bearingBetween: planarBearing }, nodeAt, edgeLine };
  };
  const conIsla = armar(12), cruce = armar(1.5);
  assert.ok(Math.abs(compactIslandM(0, [1, 2, 3], conIsla.nodeAt, conIsla.edgeLine) - 12) < 0.5);
  assert.equal(detectRoundabout(conIsla.ctx).exit, 2);
  assert.ok(compactIslandM(0, [1, 2, 3], cruce.nodeAt, cruce.edgeLine) < 2);
  assert.equal(detectRoundabout(cruce.ctx), null);
});

test('voz: una frase nueva no corta la que suena, salvo un aviso en el punto a uno anticipado', () => {
  const { voiceQueueAction, voiceQueuePick } = require('./pure.js');
  assert.equal(voiceQueueAction(null, 'soon_turn_right'), 'play');
  // "turn left" y 0,75 s despues "soon turn right" (ProMods, 15-10): espera
  assert.equal(voiceQueueAction('turn_left', 'soon_turn_right'), 'queue');
  assert.equal(voiceQueueAction('turn_left', 'keep_right'), 'queue');
  assert.equal(voiceQueueAction('turn_left', 'arrive_dest'), 'queue');
  // el giro ya esta encima: corta al anticipado o a un aviso del camion
  assert.equal(voiceQueueAction('soon_turn_left', 'roundabout_2'), 'play');
  assert.equal(voiceQueueAction('fuel_low', 'turn_right'), 'play');
  // en espera queda una: la urgente le gana a la anticipada; si no, la ultima
  assert.equal(voiceQueuePick(null, 'soon_keep_left'), 'soon_keep_left');
  assert.equal(voiceQueuePick('turn_left', 'soon_turn_right'), 'turn_left');
  assert.equal(voiceQueuePick('soon_turn_right', 'turn_right'), 'turn_right');
  assert.equal(voiceQueuePick('soon_turn_right', 'soon_keep_left'), 'soon_keep_left');
});

test('decodeTimesBin: las decimas de cada arista, solo si el archivo es de este grafo', () => {
  const { decodeTimesBin } = require('./pure.js');
  const armar = (version, n, ne, decimas) => {
    const buf = new ArrayBuffer(16 + ((decimas.length + 3) & ~3));
    const dv = new DataView(buf);
    dv.setUint32(0, 0x54445453, false); dv.setUint32(4, version, true); dv.setUint32(8, n, true); dv.setUint32(12, ne, true);
    new Int8Array(buf, 16, decimas.length).set(decimas);
    return buf;
  };
  const t = decodeTimesBin(armar(1, 3, 5, [-3, 1, 1, 5, 0]), 3, 5);
  assert.deepEqual([...t], [-3, 1, 1, 5, 0]);
  // segundos exactos: los del grafo mas las decimas (6 - 0.3 = 5.7)
  assert.ok(Math.abs(6 + t[0] / 10 - 5.7) < 1e-9);
  assert.equal(decodeTimesBin(armar(1, 3, 4, [0, 0, 0, 0]), 3, 5), null); // otro grafo
  assert.equal(decodeTimesBin(armar(2, 3, 5, [0, 0, 0, 0, 0]), 3, 5), null); // otra version
  assert.equal(decodeTimesBin(null, 3, 5), null);
});

test('rotondas: el sentido de giro, para que la flecha del aviso gire para el mismo lado', () => {
  const { detectRoundabout, ringCcw, sweepCcw, turnInstructionText } = require('./pure.js');
  // anillo de radio 30 y 8 nodos, como el primer test de rotondas; en un
  // sentido (antihorario, mano derecha) y en el otro (mano izquierda)
  const armar = (antihorario) => {
    const nodos = [], aristas = [];
    for (let k = 0; k < 8; k++) { const a = -Math.PI / 2 + (antihorario ? 1 : -1) * k * Math.PI / 4; nodos.push([30 * Math.cos(a), 30 * Math.sin(a)]); }
    for (let k = 0; k < 8; k++) aristas.push([k, (k + 1) % 8, false]);
    const sur = conCalle(nodos, aristas, 0, 0, -300);
    const sale = conCalle(nodos, aristas, 4, 0, 300);
    const g = grafoChico(nodos, aristas);
    return detectRoundabout({ ...rutaPor(nodos, [sur, 0, 1, 2, 3, 4, sale]), i: 1, iEnd: 1, ...g, bearingBetween: planarBearing });
  };
  assert.equal(armar(true).ccw, true);
  assert.equal(armar(false).ccw, false);
  // una curva que da la vuelta alrededor de un centro, para cada lado
  const arco = (sentido) => Array.from({ length: 10 }, (_, k) => [12 * Math.cos(sentido * k * Math.PI / 12), 12 * Math.sin(sentido * k * Math.PI / 12)]);
  assert.equal(sweepCcw(arco(1), [0, 0], planarBearing), true);
  assert.equal(sweepCcw(arco(-1), [0, 0], planarBearing), false);
  assert.equal(ringCcw(null, planarBearing), null);
  // la flecha: antihoraria si se sabe que lo es; si no, la de antes
  const o = { t: (k) => ({ navOrdinals: 'first,second', navRoundaboutIn: 'Roundabout in {d}: take the {n} exit' }[k]), imperial: false, lang: 'en' };
  const texto = (ccw) => turnInstructionText({ kind: 'roundabout', direction: 'left', exit: 2, meters: 300, sign: null, ccw }, o);
  assert.ok(texto(true).startsWith('↺ '));
  assert.ok(texto(false).startsWith('↻ '));
  assert.ok(texto(undefined).startsWith('↻ '));
});

test('createTurnLog: los ultimos avisos, cada uno una vez, el mas nuevo primero (Discord, 17-10)', () => {
  const { createTurnLog, TURN_LOG_MAX } = require('./pure.js');
  const log = createTurnLog();
  const giro = (x, dir = 'right', kind = 'turn') => ({ kind, direction: dir, node: [x + 0.4, -45600.6], distanceMeters: 300 });
  let llamadas = 0;
  const datos = (x) => () => { llamadas++; return { t: 1000 + x, truck: [x - 50.2, -45700.7], text: `Turn right in ${x} ft` }; };
  assert.equal(log.push(giro(1), datos(1)), true);
  // el mismo aviso en el dato siguiente (con otra distancia): no se repite
  // ni se arma el texto de nuevo
  assert.equal(log.push({ ...giro(1), distanceMeters: 120 }, datos(1)), false);
  assert.equal(llamadas, 1);
  // sin aviso (derecho): nada
  assert.equal(log.push(null, datos(2)), false);
  log.push(giro(2, 'left', 'fork'), datos(2));
  const l = log.list();
  assert.equal(l.length, 2);
  assert.deepEqual(l[0], { id: 'fork|left|2,-45601', t: 1002, kind: 'fork', direction: 'left', exit: null,
    node: [2, -45601], truck: [-48, -45701], text: 'Turn right in 2 ft' });
  assert.equal(l[1].kind, 'turn');
  // el mismo cruce despues de un "derecho" en el medio tampoco se repite
  assert.equal(log.push(giro(1), datos(1)), false);
  // no crece mas que el tope
  for (let k = 10; k < 40; k++) log.push(giro(k * 100), datos(k));
  assert.equal(log.list().length, TURN_LOG_MAX);
  assert.equal(log.list()[0].node[0], 3900);
  // list devuelve una copia
  log.list().length = 0;
  assert.equal(log.list().length, TURN_LOG_MAX);
});

test('turnReportText: mapa, versiones, el camion y los avisos, para pegar en Discord', () => {
  const { turnReportText, createTurnLog, TURN_LOG_MAX } = require('./pure.js');
  const hora = (ms) => `h${ms}`;
  const items = [
    { t: 20, kind: 'roundabout', direction: 'right', exit: 2, node: [10, 20], truck: [5, 6], text: '' },
    { t: 10, kind: 'turn', direction: 'right', exit: null, node: [-63500, -45600], truck: [-63800, -45900], text: 'Turn right in 0.2 mi onto OR-22' },
  ];
  const txt = turnReportText({ game: 'ats', map: 'ats_c2c', web: '20261017f', client: '1.5.32', truck: [-63577.4, -45687.6],
    heading: 311.6, now: 30, items, formatTime: hora });
  const lineas = txt.split('\n');
  assert.equal(lineas[0], '```');
  assert.equal(lineas[lineas.length - 1], '```');
  assert.equal(lineas[2], 'Map: ats_c2c (game ats), web 20261017f, client 1.5.32');
  assert.equal(lineas[3], 'Truck now: x -63577, z -45688, heading 312 (h30)');
  assert.equal(lineas[5], '1. h20 roundabout exit 2 at 10, 20, truck at 5, 6');
  assert.equal(lineas[6], '2. h10 turn right at -63500, -45600, truck at -63800, -45900 "Turn right in 0.2 mi onto OR-22"');
  // sin posicion ni avisos todavia
  const vacio = turnReportText({ game: null, map: 'ats', web: 'x', client: null, truck: null, now: 1, items: [], formatTime: hora });
  assert.ok(vacio.includes('Truck now: no position (h1)'));
  assert.ok(vacio.includes('No turn warnings shown yet'));
  assert.ok(vacio.includes('client ?'));
  // diez avisos largos entran en un mensaje de Discord (2000 caracteres)
  const log = createTurnLog();
  for (let k = 0; k < TURN_LOG_MAX + 5; k++) {
    log.push({ kind: 'fork', direction: 'left', node: [-123456 - k, -98765] },
      () => ({ t: 1792000000000, truck: [-123456, -98765], text: 'Keep left in 1.5 mi onto I-5 N toward Portland' }));
  }
  const largo = turnReportText({ game: 'ats', map: 'ats_c2c_promods', web: '20261017f', client: '1.5.32', truck: [-123456, -98765],
    heading: 359, now: 1792000000000, items: log.list(), formatTime: () => '23:59' });
  assert.ok(largo.length < 2000, `${largo.length} caracteres`);
  // con lo que falta por la app y por el GPS del juego
  const conKm = turnReportText({ game: 'ats', map: 'ats', web: 'x', client: '1.5.32', truck: [1, 2], now: 1, items: [],
    formatTime: hora, routeKm: { app: 178.94, game: 164.2 } });
  assert.equal(conKm.split('\n')[4], 'Route left: app 178.9 km, game GPS 164.2 km');
  assert.ok(turnReportText({ game: 'ats', map: 'ats', web: 'x', client: null, truck: null, now: 1, items: [], formatTime: hora,
    routeKm: { app: 12, game: null } }).includes('Route left: app 12.0 km, game GPS ?'));
  assert.ok(!vacio.includes('Route left'));
});

test('pickRouteLikeGame: casi empatadas, la que coincide con el GPS del juego (I-80 en Salt Lake City, Discord 19-10)', () => {
  const { pickRouteLikeGame, routeGameAgreement, routeAlternatives } = require('./pure.js');
  // La mas rapida por la I-84 (179 km del juego), la I-80 3 s mas lenta (164 km)
  const rutas = [{ km: 179, seconds: 428.4 }, { km: 164, seconds: 431.4 }];
  assert.equal(routeGameAgreement(179, 164), 'differ');
  assert.equal(pickRouteLikeGame(rutas, 164), 1);
  // Si el juego coincide con la nuestra, o no hay dato, la nuestra
  assert.equal(routeGameAgreement(179, 177), 'agree');
  assert.equal(pickRouteLikeGame(rutas, 177), 0);
  assert.equal(pickRouteLikeGame(rutas, null), 0);
  assert.equal(pickRouteLikeGame(rutas, 0), 0);
  // El juego muy lejos de todas: apunta a otra cosa (el remolque, otro destino)
  assert.equal(routeGameAgreement(179, 120), 'unknown');
  assert.equal(pickRouteLikeGame([{ km: 179, seconds: 400 }, { km: 120, seconds: 410 }], 120), 0);
  // Cerca del final no se compara (la escala de ciudad pesa mucho), ni por
  // menos de 5 km: el error de la escala es mas de km que de porcentaje
  assert.equal(pickRouteLikeGame([{ km: 30, seconds: 60 }, { km: 26, seconds: 61 }], 26), 0);
  assert.equal(routeGameAgreement(60, 56), 'agree');
  assert.equal(pickRouteLikeGame([{ km: 60, seconds: 100 }, { km: 56, seconds: 101 }], 56), 0);
  // Una que coincide pero es mucho mas lenta, o que no coincide del todo: no
  assert.equal(pickRouteLikeGame([{ km: 179, seconds: 400 }, { km: 164, seconds: 430 }], 164), 0);
  assert.equal(pickRouteLikeGame([{ km: 179, seconds: 400 }, { km: 170, seconds: 405 }], 164), 0);
  // Entre varias que sirven, la que mas coincide
  assert.equal(pickRouteLikeGame([{ km: 179, seconds: 400 }, { km: 166, seconds: 405 }, { km: 164.5, seconds: 410 }], 164), 2);
  // Alternativas: cada una con las aristas de la anterior encarecidas, acumulado
  const pedidos = [];
  const route = (penal) => { pedidos.push(new Map(penal)); return { edges: [pedidos.length + 10] }; };
  const alts = routeAlternatives({ edges: [1, 2] }, route, (r) => r.edges, { tries: 2, factor: 2 });
  assert.equal(alts.length, 3);
  assert.deepEqual([...pedidos[0]], [[1, 2], [2, 2]]);
  assert.deepEqual([...pedidos[1]], [[1, 2], [2, 2], [11, 2]]);
  assert.equal(routeAlternatives({ edges: [1] }, () => null, (r) => r.edges).length, 1);
  // Cada una recibe las rutas ya encontradas (para dropRouteDetours)
  const previas = [];
  routeAlternatives({ edges: [1] }, (penal, prev) => { previas.push(prev.map(r => r.edges[0])); return { edges: [previas.length + 1] }; }, (r) => r.edges, { tries: 2 });
  assert.deepEqual(previas, [[1], [1, 2]]);
});

test('followGameRoute: la ruta como la del juego solo con la empresa del trabajo, sin waypoints y con la mas rapida', () => {
  const { followGameRoute } = require('./pure.js');
  assert.equal(followGameRoute({ kind: 'dest' }, 0, 'fastest'), true);
  assert.equal(followGameRoute({ kind: 'pickup' }, 0, 'fastest'), true);
  // Con "shortest" no: el juego sigue en la rapida y se cambiaba la mas corta
  // por una mas larga
  assert.equal(followGameRoute({ kind: 'dest' }, 0, 'shortest'), false);
  // El centro de la ciudad (destino aproximado), con waypoints o sin destino
  assert.equal(followGameRoute({ kind: 'dest', approx: true }, 0, 'fastest'), false);
  assert.equal(followGameRoute({ kind: 'dest' }, 1, 'fastest'), false);
  assert.equal(followGameRoute({ kind: 'waypoint' }, 0, 'fastest'), false);
  assert.equal(followGameRoute(null, 0, 'fastest'), false);
});

test('dropRouteDetours: la alternativa no se baja de la autopista para volver a subir (I-15, salida 385, Discord 20-10)', () => {
  const { dropRouteDetours, ROUTE_DETOUR_MAX_M } = require('./pure.js');
  // Autopista 0-1-2-3-4 (100 m y 4 s cada tramo). Salida en 1, la calle del
  // cruce 5-6 y la entrada en 3; un area de descanso 7 entre 3 y 4.
  const aristas = {
    '0-1': [100, 4], '1-2': [100, 4], '2-3': [100, 4], '3-4': [100, 4],
    '1-5': [80, 7], '5-6': [60, 5], '6-3': [80, 7], '3-7': [55, 6], '7-4': [55, 6],
    '8-1': [100, 4], '2-9': [40, 3], '9-3': [40, 3],
  };
  const edge = (a, b) => { const x = aristas[`${a}-${b}`]; return x ? { m: x[0], cost: x[1] } : null; };
  const ruta = [0, 1, 2, 3, 4];
  assert.deepEqual(dropRouteDetours([0, 1, 5, 6, 3, 4], ruta, edge), ruta);
  // Por el area de descanso, mas corta pero mas lenta: tambien
  assert.deepEqual(dropRouteDetours([0, 1, 2, 3, 7, 4], ruta, edge), ruta);
  // Dos seguidas: la salida y enseguida el area de descanso
  assert.deepEqual(dropRouteDetours([0, 1, 5, 6, 3, 7, 4], ruta, edge), ruta);
  // Lejos de la ruta anterior (mas de ROUTE_DETOUR_MAX_M) es otro camino: queda
  const largas = (a, b) => { const x = edge(a, b); return x && { m: x.m * ROUTE_DETOUR_MAX_M / 150, cost: x.cost }; };
  const otra = [0, 1, 5, 6, 3, 4];
  assert.equal(dropRouteDetours(otra, ruta, largas), otra);
  // Si el desvio cuesta menos que la anterior (que no era la mas rapida), queda
  const atajo = [0, 1, 2, 9, 3, 4];
  assert.equal(dropRouteDetours(atajo, [0, 1, 2, 3, 4], (a, b) => (a === 2 && b === 3 ? { m: 100, cost: 40 } : edge(a, b))), atajo);
  // Llegando a la salida por otro lado, volviendo para atras o sin seguir
  // por la anterior despues de volver: no se toca
  const deOtroLado = [8, 1, 5, 6, 3, 4];
  assert.equal(dropRouteDetours(deOtroLado, ruta, edge), deOtroLado);
  assert.equal(dropRouteDetours([0, 1, 2, 3, 6, 5, 1], ruta, edge).join(), '0,1,2,3,6,5,1');
  assert.equal(dropRouteDetours([0, 1, 5, 6, 3, 2], ruta, edge).join(), '0,1,5,6,3,2');
  // Sin camino que vuelva, o sin datos de una arista: igual
  assert.deepEqual(dropRouteDetours([0, 1, 5, 6], ruta, edge), [0, 1, 5, 6]);
  assert.deepEqual(dropRouteDetours([0, 1, 5, 6, 3, 4], ruta, () => null), [0, 1, 5, 6, 3, 4]);
  // Termina en el mismo nodo que la anterior: vale como volver
  assert.deepEqual(dropRouteDetours([0, 1, 5, 6, 3], [0, 1, 2, 3], edge), [0, 1, 2, 3]);
  assert.equal(dropRouteDetours(null, ruta, edge), null);
});

test('offRouteBranch: el camion siguio por la colectora en vez de subir a la rampa (reporte #7, Amarillo, 27-10)', () => {
  const { offRouteBranch } = require('./pure.js');
  // La colectora al este, de un sentido: w -> a -> c1 -> c2. En a la ruta
  // sube a la rampa, que se abre al norte (-z): a -> r1 -> r2 -> r3.
  const nodos = [[-200, 0], [0, 0], [60, -6], [200, -40], [400, -40], [60, 0], [300, 0]];
  const [w, a, r1, r2, r3, c1, c2] = nodos.keys();
  const armar = (otra) => grafoDePrueba(nodos, [
    { a: w, b: a, uno: true }, { a, b: r1, uno: true }, { a: r1, b: r2, uno: true }, { a: r2, b: r3, uno: true },
    { a, b: c1, uno: true }, otra,
  ]).g;
  const g = armar({ a: c1, b: c2, uno: true });
  const P = (i, nodo = true) => [nodos[i][0], nodos[i][1], 0, 0, nodo ? i : null];
  // El camion a 100 m de a por la colectora: la app lo proyecta sobre la
  // rampa (95, -14.5), a 15 m, y lo recorrido llega hasta r1
  const behind = [P(w), P(a), P(r1)];
  const ahead = [[95, -14.5, 0, 0, null], P(r2), P(r3)];
  const r = offRouteBranch(g, behind, ahead, 100, 0, 90);
  assert.ok(r);
  assert.equal(r.node, a);
  assert.equal(r.branch, c1);
  assert.ok(r.dRoute > 15 && r.dRoute < 16 && r.dBranch < 1e-9);
  // Sobre la rampa, o todavia pegado a la bifurcacion (a 4 m de la ruta): no
  assert.equal(offRouteBranch(g, behind, ahead, 100, -15.7, 76), null);
  assert.equal(offRouteBranch(g, [P(w), P(a)], [[39.6, -4, 0, 0, null], P(r1), P(r2), P(r3)], 40, 0, 90), null);
  // Parado (sin rumbo), o mirando para el otro lado: no
  assert.equal(offRouteBranch(g, behind, ahead, 100, 0, null), null);
  assert.equal(offRouteBranch(g, behind, ahead, 100, 0, 270), null);
  // Una rama que vuelve a la ruta (la calzada que se abre alrededor de una
  // isleta) no es otro camino
  assert.equal(offRouteBranch(armar({ a: c1, b: r2, uno: true }), behind, ahead, 100, 0, 90), null);
  // La bifurcacion quedo mas atras que backM
  assert.equal(offRouteBranch(g, behind, ahead, 100, 0, 90, { backM: 50 }), null);
  // Lo recorrido sin el nodo de antes de la bifurcacion (una arista larga):
  // como se llega sale del ultimo tramo
  const sinW = offRouteBranch(g, [[-150, 0, 0, 0, null], P(a), P(r1)], ahead, 100, 0, 90);
  assert.ok(sinW && sinW.branch === c1);
});

test('dropRampDetours: la ruta no se baja por la salida para volver a subir a la misma calle (US-6 en Price, 24-10)', () => {
  const { dropRampDetours, ROUTE_RAMP_DETOUR_MAX_S } = require('./pure.js');
  // La US-6 al este, de doble mano y a 60 km/h: w - a - m1 - m2 - b - e
  // (100 m y 6 s cada tramo de a a b). La salida a -> r1 -> j -> r2 -> b va
  // por rampas de un sentido a 90 km/h y cruza derecho la calle de abajo
  // (j, con x1 y x2): 306 m en 17,2 s contra 300 m en 18 s por la calle.
  const armar = (nodos, aristas) => {
    const { g, opts } = grafoDePrueba(nodos, aristas);
    g.edgeM = Float64Array.from(aristas.map(e => e.m || Math.hypot(nodos[e.a][0] - nodos[e.b][0], nodos[e.a][1] - nodos[e.b][1])));
    const vecinos = nodos.map(() => new Set());
    aristas.forEach(e => { vecinos[e.a].add(e.b); vecinos[e.b].add(e.a); });
    g.degree = Uint8Array.from(vecinos.map(v => v.size));
    return { g, opts: (fin) => ({ ...opts(fin), cost: (k) => aristas[k].s }) };
  };
  const nodos = [[-200, 0], [0, 0], [100, 0], [200, 0], [300, 0], [500, 0], [100, 20], [150, 30], [200, 20], [150, 200], [150, -150]];
  const [w, a, m1, m2, b, e, r1, j, r2, x1, x2] = nodos.keys();
  const calle = [{ a: w, b: a, s: 12 }, { a, b: m1, s: 6 }, { a: m1, b: m2, s: 6 }, { a: m2, b, s: 6 }, { a: b, b: e, s: 12 }];
  const rampas = [{ a, b: r1, uno: true, s: 4 }, { a: r1, b: j, uno: true, s: 4.6 }, { a: j, b: r2, uno: true, s: 4.6 }, { a: r2, b, uno: true, s: 4 },
    { a: j, b: x1, s: 10 }, { a: j, b: x2, s: 10 }];
  const { g, opts } = armar(nodos, [...calle, ...rampas]);
  const ruta = findArcRoute(g, w, e, opts(e));
  assert.deepEqual(ruta, [w, a, r1, j, r2, b, e]); // por la salida: 0,8 s menos
  const sinDesvio = dropRampDetours(ruta, g, { cost: opts(e).cost });
  assert.deepEqual(sinDesvio, [w, a, m1, m2, b, e]);
  assert.ok(Math.abs(sinDesvio.cost - ruta.cost - 0.8) < 1e-9);
  assert.equal(sinDesvio.endArc, null);
  assert.ok(ROUTE_RAMP_DETOUR_MAX_S >= 5);
  // Si bajarse ahorra mas que maxExtra, o la ruta termina abajo (una
  // estacion en el cruce), o se sigue de largo por el cruce: queda
  assert.equal(dropRampDetours(ruta, g, { cost: opts(e).cost, maxExtra: 0.5 }), ruta);
  const alCruce = findArcRoute(g, w, j, opts(j));
  assert.equal(dropRampDetours(alCruce, g, { cost: opts(j).cost }), alCruce);
  const porElCruce = findArcRoute(g, w, x1, opts(x1));
  assert.equal(dropRampDetours(porElCruce, g, { cost: opts(x1).cost }), porElCruce);
  // Arrancando en a sin saber por donde se llega: no se sabe cual es la calle
  const desdeA = findArcRoute(g, a, e, opts(e));
  assert.equal(dropRampDetours(desdeA, g, { cost: opts(e).cost }), desdeA);
  const arcoDe = (gg, p, q) => [...gg.adjTo.keys()].find(k => routeArcDirections(gg).from[k] === p && gg.adjTo[k] === q);
  assert.deepEqual(dropRampDetours(desdeA, g, { cost: opts(e).cost, startArc: arcoDe(g, w, a) }), [a, m1, m2, b, e]);
  // Termina en b: por la calle, salvo que pase por un waypoint al llegar
  // (endArc, el de la rampa)
  const hastaB = findArcRoute(g, w, b, opts(b));
  assert.deepEqual(dropRampDetours(hastaB, g, { cost: opts(b).cost }), [w, a, m1, m2, b]);
  const alWaypoint = [...hastaB];
  Object.defineProperty(alWaypoint, 'endArc', { value: arcoDe(g, r2, b) });
  assert.equal(dropRampDetours(alWaypoint, g, { cost: opts(b).cost }), alWaypoint);
  // Si la calle es mas larga que el desvio, o si de la calle en b lo que
  // sigue es darse vuelta (b -> f, solo por la rampa): queda
  const larga = armar(nodos, [...calle.map(x => (x.s === 6 ? { ...x, m: 110 } : x)), ...rampas]);
  const rl = findArcRoute(larga.g, w, e, larga.opts(e));
  assert.equal(dropRampDetours(rl, larga.g, { cost: larga.opts(e).cost }), rl);
  const vuelve = armar([...nodos, [209.4, -42.3]], [...calle, ...rampas, { a: b, b: 11, uno: true, s: 6 }]);
  const rv = findArcRoute(vuelve.g, w, 11, vuelve.opts(11));
  assert.deepEqual(rv, [w, a, r1, j, r2, b, 11]);
  assert.equal(dropRampDetours(rv, vuelve.g, { cost: vuelve.opts(11).cost }), rv);
  // Un desvio sin cruce (otro carril de un sentido al lado de la calle) no es
  // bajarse: queda
  const sinCruce = armar(nodos, [...calle, ...rampas.slice(0, 4)]);
  const r1c = findArcRoute(sinCruce.g, w, e, sinCruce.opts(e));
  assert.deepEqual(r1c, [w, a, r1, j, r2, b, e]);
  assert.equal(dropRampDetours(r1c, sinCruce.g, { cost: sinCruce.opts(e).cost }), r1c);
  // Con un cruce en la calle entre a y b ya no es la misma calle sin salidas
  const conCalle = armar([...nodos, [100, -100]], [...calle, ...rampas, { a: m1, b: 11, s: 10 }]);
  const r2c = findArcRoute(conCalle.g, w, e, conCalle.opts(e));
  assert.equal(dropRampDetours(r2c, conCalle.g, { cost: conCalle.opts(e).cost }), r2c);
  // La "calle" dobla y el desvio sigue derecho (un carril de un prefab que se
  // aparta, el giro libre de una rotonda): no es la calle por la que se venia
  const nodos2 = [[-200, 0], [0, 0], [86.6, -50], [300, 0], [500, 0], [100, 0], [150, 0], [250, 0], [150, 200]];
  const [, , c1, b2, e2, s1, j2, s2, y1] = nodos2.keys();
  const dobla = armar(nodos2, [{ a: w, b: a, s: 12 }, { a, b: c1, m: 140, s: 12 }, { a: c1, b: b2, m: 140, s: 12 }, { a: b2, b: e2, s: 12 },
    { a, b: s1, uno: true, s: 4 }, { a: s1, b: j2, uno: true, s: 4.6 }, { a: j2, b: s2, uno: true, s: 4.6 }, { a: s2, b: b2, uno: true, s: 4 }, { a: j2, b: y1, s: 10 }]);
  const r3 = findArcRoute(dobla.g, w, e2, dobla.opts(e2));
  assert.deepEqual(r3, [w, a, s1, j2, s2, b2, e2]);
  assert.equal(dropRampDetours(r3, dobla.g, { cost: dobla.opts(e2).cost }), r3);
  assert.equal(dropRampDetours(null, g, { cost: opts(e).cost }), null);
});

test('dropSideStreetShortcuts: la ruta no deja la avenida por una calle de empresas que sale un poco mas adelante (reporte #7, Amarillo, 27-10)', () => {
  const { dropSideStreetShortcuts, ROUTE_SIDE_STREET_MAX_S } = require('./pure.js');
  // La avenida al norte (s0 -> a -> p1 -> j -> n, a 80 km/h salvo los
  // prefabs) y en j el enlace a la colectora (j -> f1, de un sentido, al
  // este). En la cruz de a sale al este una calle de empresas a 60 km/h
  // (a -> q -> q2 -> q3) que llega a la colectora en f1: 25,2 s contra 26,1
  // por la avenida. La colectora sigue al este (f1 -> r -> e).
  const nodos = [[0, 400], [0, 300], [40, 300], [100, 300], [100, 50], [100, 0], [200, 0], [400, 0], [0, 260], [0, 0], [0, -100]];
  const [s0, a, q, q2, q3, f1, r, e, p1, j, n] = nodos.keys();
  const armar = (cambios = {}) => {
    const aristas = [
      { a: s0, b: a, s: 4.5 }, { a, b: q, pf: 1, s: 3.6 }, { a: q, b: q2, s: 3.6 }, { a: q2, b: q3, s: 15 },
      { a: q3, b: f1, uno: true, pf: 2, s: 3 }, { a: f1, b: r, uno: true, s: 4.5 }, { a: r, b: e, uno: true, s: 9 },
      { a, b: p1, pf: 1, s: 3.6 }, { a: p1, b: j, s: 11.7 }, { a: j, b: f1, uno: true, pf: 3, m: 120, s: 10.8 }, { a: j, b: n, s: 4.5 },
    ].map((x, k) => ({ ...x, ...(cambios[k] || {}) }));
    const { g, opts } = grafoDePrueba(nodos, aristas);
    g.edgeM = Float64Array.from(aristas.map(x => x.m || Math.hypot(nodos[x.a][0] - nodos[x.b][0], nodos[x.a][1] - nodos[x.b][1])));
    g.edgeS = Uint16Array.from(aristas.map(x => Math.floor(x.s)));
    g.edgeT = Int8Array.from(aristas.map(x => Math.round((x.s - Math.floor(x.s)) * 10)));
    g.edgePrefab = Uint32Array.from(aristas.map(x => x.pf || 0));
    const vecinos = nodos.map(() => new Set());
    aristas.forEach(x => { vecinos[x.a].add(x.b); vecinos[x.b].add(x.a); });
    g.degree = Uint8Array.from(vecinos.map(v => v.size));
    // Costo en segundos: la heuristica en metros de grafoDePrueba no sirve
    return { g, opts: (fin) => ({ ...opts(fin), cost: (k) => aristas[k].s, heuristic: () => 0 }) };
  };
  const { g, opts } = armar();
  const ruta = findArcRoute(g, s0, e, opts(e));
  assert.deepEqual(ruta, [s0, a, q, q2, q3, f1, r, e]); // por la calle: 0,9 s menos
  const porLaAvenida = dropSideStreetShortcuts(ruta, g, { cost: opts(e).cost });
  assert.deepEqual(porLaAvenida, [s0, a, p1, j, f1, r, e]);
  assert.ok(Math.abs(porLaAvenida.cost - ruta.cost - 0.9) < 1e-9);
  assert.equal(porLaAvenida.endArc, null);
  assert.ok(ROUTE_SIDE_STREET_MAX_S >= 1 && ROUTE_SIDE_STREET_MAX_S <= 10);
  // Si la calle ahorra mas que maxExtra: queda
  assert.equal(dropSideStreetShortcuts(ruta, g, { cost: opts(e).cost, maxExtra: 0.5 }), ruta);
  // Si la empresa esta en la calle, la avenida no vuelve a la ruta: queda
  const alPatio = findArcRoute(g, s0, q3, opts(q3));
  assert.equal(dropSideStreetShortcuts(alPatio, g, { cost: opts(q3).cost }), alPatio);
  // Llegando por una calle lenta (s0 -> a a 60 km/h), o si la calle es otra
  // avenida (a 80 km/h): no es dejar la avenida por una calle de empresas
  const lenta = armar({ 0: { s: 6 } });
  const rl = findArcRoute(lenta.g, s0, e, lenta.opts(e));
  assert.deepEqual(rl, ruta);
  assert.equal(dropSideStreetShortcuts(rl, lenta.g, { cost: lenta.opts(e).cost }), rl);
  const otra = armar({ 2: { s: 2.7 }, 3: { s: 11.3 } });
  const ro = findArcRoute(otra.g, s0, e, otra.opts(e));
  assert.deepEqual(ro, ruta);
  assert.equal(dropSideStreetShortcuts(ro, otra.g, { cost: otra.opts(e).cost }), ro);
  // Un carril de un sentido que corta la esquina antes del cruce (el giro a
  // la derecha de Kalispell y Cheyenne) no es una calle de empresas: queda
  const carril = armar({ 2: { uno: true }, 3: { uno: true } });
  const rc = findArcRoute(carril.g, s0, e, carril.opts(e));
  assert.deepEqual(rc, ruta);
  assert.equal(dropSideStreetShortcuts(rc, carril.g, { cost: carril.opts(e).cost }), rc);
  // Arrancando en a sin saber por donde se llega: no se sabe cual es la avenida
  const desdeA = findArcRoute(g, a, e, opts(e));
  assert.equal(dropSideStreetShortcuts(desdeA, g, { cost: opts(e).cost }), desdeA);
  const arcoDe = (gg, x, y) => [...gg.adjTo.keys()].find(k => routeArcDirections(gg).from[k] === x && gg.adjTo[k] === y);
  assert.deepEqual(dropSideStreetShortcuts(desdeA, g, { cost: opts(e).cost, startArc: arcoDe(g, s0, a) }), [a, p1, j, f1, r, e]);
  // Sin el -prefabs.bin no se distingue una calle de un prefab: queda
  const sinPrefabs = armar();
  delete sinPrefabs.g.edgePrefab;
  assert.equal(dropSideStreetShortcuts(ruta, sinPrefabs.g, { cost: opts(e).cost }), ruta);
  assert.equal(dropSideStreetShortcuts(null, g, { cost: opts(e).cost }), null);
});

test('turnPassed: parado en la linea de una T el giro sigue adelante; ya doblando, no (Discord 18-10)', () => {
  const { turnPassed } = require('./pure.js');
  // T a la derecha: se entra mirando al norte (0) y se sale al este (90); el cruce va de 100 a 160 m
  const t = { atM: 100, endM: 160, entryBearing: 0, outBearing: 90 };
  assert.equal(turnPassed({ ...t, hereM: 80, heading: 0 }), false);  // todavia no llega
  assert.equal(turnPassed({ ...t, hereM: 100, heading: 0 }), false); // parado en el nodo
  assert.equal(turnPassed({ ...t, hereM: 104, heading: 3 }), false); // en la linea, sin doblar
  assert.equal(turnPassed({ ...t, hereM: 108, heading: 70 }), true);  // ya dobla: el giro siguiente puede aparecer
  assert.equal(turnPassed({ ...t, hereM: 105, heading: 30 }), true);  // empezo a doblar (25 grados alcanzan)
  assert.equal(turnPassed({ ...t, hereM: 105, heading: 330 }), false); // se desvio, pero para el otro lado
  assert.equal(turnPassed({ ...t, hereM: 180, heading: 0 }), true);   // paso el cruce entero
  // una calle que llega curvandose: al llegar ya mira casi a la salida (296 contra 280)
  const c = { atM: 100, endM: 100, entryBearing: 296, outBearing: 280 };
  assert.equal(turnPassed({ ...c, hereM: 103, heading: 296 }), false);
  assert.equal(turnPassed({ ...c, hereM: 110, heading: 282 }), true);
  // sin rumbos (bifurcacion, o sin el del camion): solo la posicion
  assert.equal(turnPassed({ atM: 100, endM: 100, hereM: 104 }), false);
  assert.equal(turnPassed({ atM: 100, endM: 160, hereM: 121 }), true);
  assert.equal(turnPassed({ atM: 100, endM: 100, hereM: 116 }), true);
});

test('layoutResizeCornerPx: en algo chico la esquina de agrandar no tapa el centro', () => {
  const { layoutResizeCornerPx } = require('./pure.js');
  // un boton de 44 y un panel grande: la esquina de siempre
  assert.equal(layoutResizeCornerPx(44, 44), 22);
  assert.equal(layoutResizeCornerPx(200, 60), 22);
  // la brujula de 36 o un boton achicado: un tercio, el centro queda para mover
  assert.equal(layoutResizeCornerPx(36, 36), 12);
  assert.ok(layoutResizeCornerPx(26, 26) < 13);
  // sin medidas: la de siempre
  assert.equal(layoutResizeCornerPx(0, 0), 22);
});

test('compassView: la brujula aparece con el norte torcido o en navegacion, y la aguja apunta al norte', () => {
  const { compassView } = require('./pure.js');
  // norte arriba fuera de navegacion: no hace falta
  assert.deepEqual(compassView(0), { show: false, angle: 0 });
  assert.equal(compassView(0.4).show, false);
  assert.equal(compassView(359.6).show, false);
  // girado a mano: aparece, y la aguja gira al reves que el mapa
  assert.deepEqual(compassView(90), { show: true, angle: -90 });
  assert.deepEqual(compassView(-90), { show: true, angle: -270 });
  assert.equal(compassView(450).angle, -90);
  // en navegacion siempre
  assert.deepEqual(compassView(37, { navMode: true }), { show: true, angle: -37 });
  // datos raros: como norte arriba
  assert.deepEqual(compassView(NaN), { show: false, angle: 0 });
  assert.deepEqual(compassView(undefined, {}), { show: false, angle: 0 });
});

test('citiesOnLand y basemapFitsCities: un mapa armado en el mar no pinta el mar (Explorando a America, Discord 18-10)', () => {
  const { citiesOnLand, basemapFitsCities } = require('./pure.js');
  // tierra: un cuadrado de 10 grados con un lago (hueco) de 2 grados en el medio
  const tierra = [{ properties: { k: 'land' }, geometry: { type: 'Polygon', coordinates: [
    [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
    [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
  ] } }, { properties: { k: 'lake' }, geometry: { type: 'Polygon', coordinates: [[[20, 20], [30, 20], [30, 30], [20, 20]]] } }];
  const r = citiesOnLand([[2, 2], [8, 9], [10.3, 5], [4.3, 5], [5, 5], [15, 5], [25, 25]], tierra);
  // adentro, a 0,3 grados de la costa del mar o del lago: en tierra (el mapa
  // del juego no coincide con la costa real); en el medio del lago (a 1
  // grado), a 5 grados y adentro de un lago que no es tierra: afuera
  assert.deepEqual([r.total, r.off], [7, 3]);
  assert.equal(citiesOnLand([[10.3, 5]], tierra, { nearDeg: 0 }).off, 1); // sin margen, a 0,3 grados es agua
  // un mapa del juego casi todo en tierra sirve; uno con la mitad en el mar, no
  assert.equal(basemapFitsCities({ share: 0.95, off: 5, total: 100 }), true);
  assert.equal(basemapFitsCities({ share: 0.5, off: 300, total: 600 }), false);
  // con muy pocas ciudades no se decide
  assert.equal(basemapFitsCities({ share: 0, off: 5, total: 5 }), true);
  assert.equal(basemapFitsCities(null), true);
  // sin datos que sirvan
  assert.deepEqual(citiesOnLand([[NaN, 1], null], tierra), { share: 1, off: 0, total: 0 });
});

test('roadLineWidth: el ancho de siempre de lejos y el de la calle del juego de cerca', () => {
  const { roadLineWidth, ROAD_WIDTH_GAME_M, ROAD_WIDTH_SHARE } = require('./pure.js');
  const base = [5, 0.5, 12, 1.5, 17, 5]; // road-local
  const m = 19.23; // metros del mapa por metro del juego en ETS2
  const e = roadLineWidth(base, m, 50);
  assert.deepEqual(e.slice(0, 3), ['interpolate', ['exponential', 2], ['zoom']]);
  const at = (expr, z) => { const i = expr.indexOf(z, 3); assert.ok(i > 2 && (i - 3) % 2 === 0, `sin parada en ${z}`); return expr[i + 1]; };
  const real = (z, lat) => ROAD_WIDTH_SHARE * ROAD_WIDTH_GAME_M * m * 512 * 2 ** z / (40075016.686 * Math.cos(lat * Math.PI / 180));
  // de lejos manda el de siempre (a zoom 8 la calle real mide menos de 1 px)
  assert.equal(at(e, 5), 0.5);
  assert.ok(Math.abs(at(e, 8) - (0.5 + 3 / 7)) < 0.01);
  // de cerca, la calle del juego: a zoom 12 en la latitud 50 son unos 11 px
  // (la linea fina de siempre tenia 1,5) y se duplica con cada zoom
  assert.ok(Math.abs(at(e, 12) - real(12, 50)) < 0.01);
  assert.ok(at(e, 12) > 10 && at(e, 12) < 12, String(at(e, 12)));
  assert.ok(Math.abs(at(e, 16) / at(e, 15) - 2) < 0.01);
  // nunca mas fina que antes, y crece con el zoom
  for (let z = 5; z <= 17; z++) assert.ok(at(e, z) >= 0.5 + (Math.min(z, 12) - 5) / 7 - 0.01, `zoom ${z}`);
  for (let z = 6; z <= 22; z++) assert.ok(at(e, z) >= at(e, z - 1), `zoom ${z}`);
  // mas al norte un metro ocupa mas pixeles (Mercator): Suecia contra Espana
  assert.ok(at(roadLineWidth(base, m, 60), 13) > at(roadLineWidth(base, m, 40), 13) * 1.5);
  // sin escala o sin latitud, la linea de siempre
  const lineal = ['interpolate', ['linear'], ['zoom'], ...base];
  assert.deepEqual(roadLineWidth(base, NaN, 50), lineal);
  assert.deepEqual(roadLineWidth(base, m, undefined), lineal);
});

test('tmpPlayersUpdate: la lista de TruckersMP dura hasta la siguiente y vence sin otra', () => {
  const { tmpPlayersUpdate, TMP_PLAYERS_STALE_MS, TMP_PLAYERS_MAX } = require('./pure.js');
  const ana = { id: 7, name: 'Ana', x: 100, z: -50.1, heading: 270, speedKmh: 36 };
  // El payload que los trae (uno por segundo).
  const a = tmpPlayersUpdate(null, { tmpPlayers: [ana] }, 1000);
  assert.deepEqual(a, { list: [ana], at: 1000 });
  // Los payloads del medio no los traen: la misma lista, el mismo objeto.
  assert.equal(tmpPlayersUpdate(a, { speed: 20 }, 1500), a);
  assert.equal(tmpPlayersUpdate(a, null, 1000 + TMP_PLAYERS_STALE_MS), a);
  // Sin otra a tiempo (TMP o el juego se cerraron, o un cliente viejo).
  assert.equal(tmpPlayersUpdate(a, null, 1001 + TMP_PLAYERS_STALE_MS), null);
  assert.equal(tmpPlayersUpdate(null, { speed: 20 }, 9e9), null);
  // Sin servidor llega vacia: se borran.
  assert.deepEqual(tmpPlayersUpdate(a, { tmpPlayers: [] }, 2000), { list: [], at: 2000 });
});

test('tmpPlayersUpdate: descarta lo que no se puede dibujar', () => {
  const { tmpPlayersUpdate, TMP_PLAYERS_MAX } = require('./pure.js');
  const r = tmpPlayersUpdate(null, { tmpPlayers: [
    null,
    { id: 1, name: 'sin posicion', x: null, z: 3 },
    { id: 2, name: 'x'.repeat(200), x: 1, z: 2 },
    { id: 2, name: 'repetido', x: 5, z: 5 },
    { id: 3, name: 7, x: 1, z: 2, heading: 'norte', speedKmh: NaN },
  ] }, 0);
  assert.deepEqual(r.list.map(p => [p.id, p.name.length, p.heading, p.speedKmh]), [[2, 64, 0, null], [3, 0, 0, null]]);
  const muchos = Array.from({ length: 50 }, (_, i) => ({ id: i, name: '', x: i, z: i }));
  assert.equal(tmpPlayersUpdate(null, { tmpPlayers: muchos }, 0).list.length, TMP_PLAYERS_MAX);
});

test('turnReportText: a donde va la ruta, para reproducirla (Tonopah, 25-10)', () => {
  const { turnReportText, TURN_REPORT_VIA_MAX } = require('./pure.js');
  const base = { game: 'ats', map: 'ats', web: 'x', client: '1.5.35', truck: [-100462, -6374], now: 1, items: [], formatTime: () => 'h' };
  const linea = (route) => turnReportText({ ...base, route }).split('\n').find(l => l.startsWith('Route: ')) || null;
  assert.equal(linea({ profile: 'fastest', to: { kind: 'dest', x: -106153.4, z: 326.2 }, via: [] }), 'Route: fastest, to dest at -106153, 326');
  assert.equal(linea({ profile: 'shortest', to: { kind: 'pickup', x: 10, z: 20, approx: true }, via: [[1.4, 2.6], [3, 4]] }),
    'Route: shortest, to pickup (approx) at 10, 20, via 1, 3 / 3, 4');
  // solo waypoints (sin trabajo)
  assert.equal(linea({ profile: 'fastest', to: null, via: [[5, 6]] }), 'Route: fastest, via 5, 6');
  // sin destino ni waypoints, o sin route: no va la linea
  assert.equal(linea({ profile: 'fastest', to: null, via: [] }), null);
  assert.equal(linea(null), null);
  // muchos waypoints: los primeros y cuantos faltan
  const muchos = Array.from({ length: TURN_REPORT_VIA_MAX + 3 }, (_, k) => [k, k]);
  assert.ok(linea({ profile: 'fastest', to: null, via: muchos }).endsWith(' (+3 more)'));
});

test('reporte de navegacion: el pedido, la cookie y que decir despues', () => {
  const { navReportBody, navReportCredentials, navReportOutcome, NAV_REPORT_KINDS, NAV_REPORT_DESC_MAX } = require('./pure.js');
  const datos = { kind: 'wrong_warning', description: '  dos avisos pegados  ', report: 'Truck Dash turn report', game: 'ats', map: 'ats', web: 'w', client: null };
  assert.deepEqual(navReportBody(datos).body,
    { kind: 'wrong_warning', description: 'dos avisos pegados', report: 'Truck Dash turn report', game: 'ats', map: 'ats', web: 'w', client: null });
  // sin tipo elegido, o uno que la API no conoce
  assert.equal(navReportBody({ ...datos, kind: null }).error, 'kind');
  assert.equal(navReportBody({ ...datos, kind: 'otra' }).error, 'kind');
  assert.equal(navReportBody({ ...datos, report: '' }).error, 'report');
  // la descripcion es opcional y se recorta al tope de la API
  assert.equal(navReportBody({ ...datos, description: '   ' }).body.description, null);
  assert.equal(navReportBody({ ...datos, description: 'x'.repeat(NAV_REPORT_DESC_MAX + 50) }).body.description.length, NAV_REPORT_DESC_MAX);
  assert.ok(NAV_REPORT_KINDS.includes('missing_warning') && NAV_REPORT_KINDS.includes('other'));
  // la cookie de la cuenta solo desde nuestro dominio
  assert.equal(navReportCredentials('trucksim-dash.com'), 'include');
  assert.equal(navReportCredentials('www.trucksim-dash.com'), 'include');
  assert.equal(navReportCredentials('192.168.1.20'), 'omit');
  assert.equal(navReportCredentials('localhost'), 'omit');
  assert.equal(navReportCredentials('eviltrucksim-dash.com'), 'omit');
  // lo que vuelve
  assert.deepEqual(navReportOutcome(200, { ok: true, id: 12, token: 'k' }), { state: 'sent', id: 12, token: 'k' });
  assert.deepEqual(navReportOutcome(200, { ok: true, id: 12 }), { state: 'sent', id: 12, token: null });
  assert.deepEqual(navReportOutcome(429, { error: 'demasiados_reportes' }), { state: 'tooMany' });
  for (const [st, body] of [[0, null], [404, null], [400, { error: 'tipo_invalido' }], [500, null], [200, { ok: true }]]) {
    assert.deepEqual(navReportOutcome(st, body), { state: 'failed' }, String(st));
  }
});

test('reportes mandados: se guardan, se pregunta por ellos y se avisa una vez al arreglarse (26-10)', () => {
  const { navReportsParse, navReportsAdd, navReportsAfterStatus, NAV_REPORTS_MAX, NAV_REPORTS_DAYS } = require('./pure.js');
  const dia = 86400000, ahora = 1792000000000;
  // lo guardado: sin lo roto ni lo vencido
  const guardado = JSON.stringify([{ id: 3, token: 'c', sent: ahora - dia }, { id: 'x', token: 'a', sent: ahora },
    { id: 2, token: '', sent: ahora }, { id: 1, token: 'a', sent: ahora - (NAV_REPORTS_DAYS + 1) * dia }]);
  assert.deepEqual(navReportsParse(guardado, ahora), [{ id: 3, token: 'c', sent: ahora - dia }]);
  assert.deepEqual(navReportsParse('no es json', ahora), []);
  assert.deepEqual(navReportsParse('{"id":1}', ahora), []);
  assert.deepEqual(navReportsParse(null, ahora), []);
  // uno nuevo adelante, sin repetir, con tope
  let lista = navReportsAdd([{ id: 3, token: 'c', sent: 1 }], { id: 4, token: 'd' }, ahora);
  assert.deepEqual(lista.map(r => r.id), [4, 3]);
  assert.deepEqual(navReportsAdd(lista, { id: 3, token: 'c2' }, ahora).map(r => [r.id, r.token]), [[3, 'c2'], [4, 'd']]);
  assert.equal(navReportsAdd(lista, { id: 5, token: null }, ahora), lista); // la API vieja no da clave
  let muchos = [];
  for (let k = 0; k < NAV_REPORTS_MAX + 5; k++) muchos = navReportsAdd(muchos, { id: k, token: 't' }, ahora);
  assert.equal(muchos.length, NAV_REPORTS_MAX);
  assert.equal(muchos[0].id, NAV_REPORTS_MAX + 4);
  // la respuesta: arreglado avisa y sale; duplicado y no se arregla salen callados; abierto o sin respuesta quedan
  lista = [5, 6, 7, 8, 9].map(id => ({ id, token: 't', sent: ahora }));
  const { list, fixed } = navReportsAfterStatus(lista,
    [{ id: 5, status: 'fixed' }, { id: 6, status: 'duplicate' }, { id: 7, status: 'wontfix' }, { id: 8, status: 'open' }]);
  assert.deepEqual(fixed, [5]);
  assert.deepEqual(list.map(r => r.id), [8, 9]);
  // otra pestana ya aviso (ya no esta en lo guardado): no se avisa dos veces
  assert.deepEqual(navReportsAfterStatus(list, [{ id: 5, status: 'fixed' }]).fixed, []);
});

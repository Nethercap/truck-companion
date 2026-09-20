const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
  const source = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
  let now = 0, nextId = 0, moving = false, zoom = 5;
  const timers = new Map(), cameras = [];
  const context = vm.createContext({
    setTimeout(fn, delay) { const id = ++nextId; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    navMode: true, lastHeadingDeg: 90, navAutoZoomPaused: false,
    truckMarker: { getLngLat: () => [20, 30] },
    map: {
      isMoving: () => moving, isZooming: () => false, isRotating: () => false,
      getMinZoom: () => 1, getMaxZoom: () => 8, getZoom: () => zoom,
      jumpTo(options) { cameras.push(options); if (options.zoom !== undefined) zoom = options.zoom; },
    },
  });
  vm.runInContext(source.slice(source.indexOf('let autoFollow = true;'), source.indexOf('const TRAIL_JUMP_THRESHOLD_M')), context);
  return {
    run: code => vm.runInContext(code, context), cameras,
    move: value => { moving = value; },
    advance(ms) {
      now += ms;
      for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.fn(); }
    },
  };
}

test('follow resumes ten seconds after gesture ends, using the latest truck position', () => {
  const s = setup();
  s.run('pauseMapFollow()');
  s.advance(20000);
  assert.equal(s.run('autoFollow'), false);
  s.run('scheduleMapFollow()');
  s.advance(9999);
  assert.equal(s.run('autoFollow'), false);
  s.run('truckMarker.getLngLat = () => [40, 50]');
  s.advance(1);
  assert.equal(s.run('autoFollow'), true);
  assert.equal(JSON.stringify(s.cameras.at(-1)), '{"center":[40,50],"bearing":90}');
});

test('another drag resets the delay; a combined gesture must finish first', () => {
  const s = setup();
  s.run('pauseMapFollow(); scheduleMapFollow()');
  s.advance(9000);
  s.run('pauseMapFollow()');
  s.move(true);
  s.run('scheduleMapFollow()');
  s.advance(20000);
  assert.equal(s.run('autoFollow'), false);
  s.move(false);
  s.run('scheduleMapFollow()');
  s.advance(10000);
  assert.equal(s.run('autoFollow'), true);
});

test('manual recenter cancels delayed recenter', () => {
  const s = setup();
  s.run('pauseMapFollow(); scheduleMapFollow(); resumeMapFollow()');
  s.advance(10000);
  assert.equal(s.cameras.length, 1);
});

test('zoom buttons keep following, pause dynamic zoom and respect map limits', () => {
  const s = setup();
  s.run('changeMapZoom(1)');
  assert.equal(s.cameras.at(-1).zoom, 6);
  assert.equal(s.run('autoFollow'), true);
  assert.equal(s.run('navAutoZoomPaused'), true);
  s.run('changeMapZoom(10)');
  assert.equal(s.cameras.at(-1).zoom, 8);
  s.run('changeMapZoom(-20)');
  assert.equal(s.cameras.at(-1).zoom, 1);
});

function summarySetup() {
  const source = fs.readFileSync(`${__dirname}/app.js`, 'utf8');
  const elements = new Map();
  const cleared = [];
  const data = { game: 'ets2', cityDst: 'Paris', routeDistanceKm: 100 };
  const context = vm.createContext({
    document: { getElementById(id) {
      if (!elements.has(id)) elements.set(id, { style: {}, classList: { toggle() {}, remove() {} } });
      return elements.get(id);
    } },
    lastData: data, waypoints: [], citiesByName: { Paris: { X: 1, Y: 2 }, Berlin: { X: 3, Y: 4 } },
    currentRouteWorldPoints: null, routeBehind: [], destMarker: { remove() { cleared.push('marker'); } },
    map: { getSource(id) { return { setData() { cleared.push(id); } }; } },
    clearWaypoint() { context.waypoints = []; }, setWaypointMode() {}, emptyLineString() { return {}; },
    useImperial: false, KM_TO_MI: 0.621371, lastKnownAvgSpeedKmh: null,
    computeRealEtaSeconds: () => 600, formatSeconds: () => '10 min',
  });
  vm.runInContext(source.slice(source.indexOf('let dismissedRouteIdentity'), source.indexOf('function splitRouteForDrawing')), context);
  vm.runInContext(source.slice(source.indexOf('function resetDisplayedRoute'), source.indexOf("document.getElementById('resetRouteBtn')")), context);
  return { context, elements, cleared, run: code => vm.runInContext(code, context) };
}

test('route progress reflects remaining distance and stays within bounds on rerouting', () => {
  const s = summarySetup();
  s.run('updateRouteSummary(lastData)');
  assert.equal(s.elements.get('routeProgress').value, 0);
  s.run('lastData.routeDistanceKm = 25; updateRouteSummary(lastData)');
  assert.equal(s.elements.get('routeProgress').value, 75);
  s.run('lastData.routeDistanceKm = 120; updateRouteSummary(lastData)');
  assert.equal(s.elements.get('routeProgress').value, 0);
  s.run('lastData.routeDistanceKm = 0; updateRouteSummary(lastData)');
  assert.equal(s.elements.get('routeProgress').value, 100);
});

test('reset clears all route layers and suppresses the same telemetry destination', () => {
  const s = summarySetup();
  s.run('resetDisplayedRoute(); updateRouteSummary(lastData)');
  assert.deepEqual(s.cleared, ['route', 'route-next', 'route-ferry', 'marker']);
  assert.equal(s.run('resolveRouteTarget(lastData)'), null);
  assert.equal(s.elements.get('routeSummary').hidden, true);
  assert.equal(s.context.lastData.cityDst, 'Paris');
  s.run("lastData.cityDst = 'Berlin'; updateRouteSummary(lastData)");
  assert.equal(s.elements.get('routeSummary').hidden, false);
  assert.equal(s.elements.get('routeProgress').value, 0);
});

test('unknown remaining distance is displayed as unknown, never as completed', () => {
  const s = summarySetup();
  s.run('lastData.routeDistanceKm = null; updateRouteSummary(lastData)');
  assert.equal(s.elements.get('routeRemaining').textContent, '--');
  assert.equal(s.elements.get('routeProgress').value, 0);
});

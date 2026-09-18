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

function formatTurnDistance(m) {
  const rounded = roundTurnDistanceMeters(m);
  if (rounded >= 1000) {
    const km = rounded / 1000;
    return `${Number.isInteger(km) ? km : km.toFixed(1)} km`;
  }
  return `${rounded} m`;
}

// Diagnostico de la conexion que muestra la app (chip de la barra, linea de
// detalle y tarjeta vacia sobre el mapa) a partir del estado combinado de:
// el socket del viewer, lo que dijo el backend (hay cliente local?), el
// diagnostico que manda el cliente (client_status) y si llego telemetria.
// Devuelve claves de i18n, no texto - app.js las traduce. Puro para poder
// testearlo (test_pure.js) - es la parte con mas combinaciones de la app.
//   conn = { socket: 'idle'|'connecting'|'open'|'closed', demo, invalidCode,
//            clientConnected: null|bool, clientStatus: {status}|null,
//            hasTelemetry, paused }
function connectionViewFor(conn) {
  if (conn.socket === 'idle') return null;
  if (conn.demo) return { chip: 'chipDemo', cls: 'info', detail: 'detailDemo', empty: null, live: true };
  if (conn.invalidCode) return { chip: 'chipInvalidCode', cls: 'err', detail: 'detailInvalidCode', empty: null };
  if (conn.socket === 'connecting') return { chip: 'chipConnecting', cls: '', detail: null, empty: null };
  if (conn.socket === 'closed') return { chip: 'chipReconnecting', cls: 'err', detail: null, empty: ['emptyReconnectTitle', 'emptyReconnectBody', '📡'] };
  if (conn.clientConnected === false) return { chip: 'chipNoClient', cls: 'err', detail: 'detailNoClient', empty: ['emptyNoClientTitle', 'emptyNoClientBody', '💻', true] };
  const st = conn.clientStatus ? conn.clientStatus.status : undefined;
  if (st === 'plugin_missing' || st === 'plugin_not_installed') return { chip: 'chipPluginMissing', cls: 'warn', detail: 'detailPluginMissing', empty: ['emptyPluginTitle', 'emptyPluginBody', '🧩'] };
  if (st === 'waiting_game' || (!conn.hasTelemetry && st !== 'waiting_truck' && st !== 'live')) return { chip: 'chipWaitingGame', cls: 'warn', detail: 'detailWaitingGame', empty: ['emptyWaitingGameTitle', 'emptyWaitingGameBody', '🎮'] };
  if (st === 'waiting_truck' || !conn.hasTelemetry) return { chip: 'chipWaitingTruck', cls: 'info', detail: 'detailWaitingTruck', empty: ['emptyWaitingTruckTitle', 'emptyWaitingTruckBody', '🚚'] };
  return { chip: conn.paused ? 'chipPaused' : 'chipLive', cls: 'live', detail: null, empty: null, live: true };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { geoBearingDeg, smoothLineCoords, roundTurnDistanceMeters, formatTurnDistance, connectionViewFor };
}

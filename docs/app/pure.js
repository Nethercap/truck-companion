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

// lang: el idioma de la interfaz, para la coma decimal ("9,5 km" en
// castellano). Sin el, ingles.
function formatTurnDistance(m, imperial, lang) {
  if (imperial) return formatTurnDistanceImperial(m, lang);
  const rounded = roundTurnDistanceMeters(m);
  if (rounded >= 1000) {
    const km = rounded / 1000;
    return `${km.toLocaleString(lang || 'en', { maximumFractionDigits: 1 })} km`;
  }
  return `${rounded} m`;
}

// Mismo criterio en millas/pies: >10 mi de a 1 mi, >1 mi de a 0.5, entre
// 0.2 y 1 mi de a 0.1, y por debajo en pies de a 50. Ej: 9 mi, 2.5 mi,
// 0.4 mi, 800 ft.
function formatTurnDistanceImperial(m, lang) {
  const mi = m / 1609.344;
  const dec = (v) => v.toLocaleString(lang || 'en', { maximumFractionDigits: 1 });
  if (mi >= 10) return `${Math.round(mi)} mi`;
  if (mi >= 1) { const r = Math.round(mi * 2) / 2; return `${dec(r)} mi`; }
  if (mi >= 0.2) { const r = Math.round(mi * 10) / 10; return `${r >= 1 ? '1' : dec(r)} mi`; }
  const ft = Math.round(m * 3.28084 / 50) * 50;
  return `${ft} ft`;
}

// Casillas de "compartir mi posicion" en Ajustes: cuales se pueden tocar y
// que aclaracion va abajo (clave de i18n, que es tambien el id del <p>).
// Compartir es de la sesion del relay: por LAN se cambia a traves del
// cliente si este lo reenvia (lanRelay: la clave liveShare en su
// session_state); con un cliente viejo queda gris y se dice donde se cambia.
// La ruta en el mapa en vivo la manda una pestana con el codigo, no la de
// LAN. Antes en LAN no habia como apagarlo (Discord, 20-10).
function liveShareControls({ lan, lanRelay, enabled }) {
  if (!lan) return { shareDisabled: false, routeDisabled: !enabled, hint: null };
  if (!lanRelay) return { shareDisabled: true, routeDisabled: true, hint: 'liveShareLanHint' };
  return { shareDisabled: false, routeDisabled: true, hint: 'liveShareLanRouteHint' };
}

// "Compartir mi posicion" guardado en este navegador: true o false si alguna
// vez cambio aca (el tilde, o lo que dijo el relay de la sesion), null si
// nunca. Viene apagado (20-10): con null la pestana arranca sin compartir y
// al conectar no le manda nada al relay, asi no lo prende ni apaga lo que
// eligio otro dispositivo. Hasta el 20-10 venia prendido y lo prendia la
// pestana que abre el cliente en la PC, aunque se usara solo el modo LAN.
// saveSettings guarda solo lo que cambia: quien nunca lo toco no tiene la
// clave, y liveShareV2 (de cuando vino prendido) no se mira mas.
function liveShareChoice(saved) {
  return saved && typeof saved.liveShareEnabled === 'boolean' ? saved.liveShareEnabled : null;
}

// Jugadores de TruckersMP cerca: los manda el cliente de la PC en tmpPlayers
// (tmp_players.py, con el Client SDK de TMP) una vez por segundo, en un solo
// payload de los que llegan. La lista dura hasta la siguiente y vence a los
// TMP_PLAYERS_STALE_MS sin otra: TMP se cerro, el juego tambien, o el
// cliente es viejo y no los manda. Sin conexion a un servidor llega vacia.
// Devuelve el mismo objeto si no cambio nada, asi app.js redibuja solo
// cuando hace falta.
const TMP_PLAYERS_STALE_MS = 5000;
const TMP_PLAYERS_MAX = 32;
function tmpPlayersUpdate(prev, payload, now) {
  if (payload && Array.isArray(payload.tmpPlayers)) {
    const list = [];
    const ids = new Set();
    for (const p of payload.tmpPlayers) {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z) || ids.has(p.id)) continue;
      ids.add(p.id);
      list.push({
        id: p.id,
        name: typeof p.name === 'string' ? p.name.slice(0, 64) : '',
        x: p.x,
        z: p.z,
        heading: Number.isFinite(p.heading) ? p.heading : 0,
        speedKmh: Number.isFinite(p.speedKmh) ? p.speedKmh : null,
      });
      if (list.length >= TMP_PLAYERS_MAX) break;
    }
    return { list, at: now };
  }
  if (prev && now - prev.at > TMP_PLAYERS_STALE_MS) return null;
  return prev;
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
// skip: el indice del punto del camion (interpolado, sin nodo). Con el camion
// entre dos nodos del mismo cruce partia el grupo, y la segunda mitad se
// media sola con el salto lateral como tramo de entrada: un "keep left"
// falso a 5 m (Discord, 11-10, Lightningroc771).
// curveSpanM: los puntos de la curva de un prefab (sin nodo) tampoco cortan
// el grupo, mientras el cruce entero no pase de curveSpanM (el prefab de
// punta a punta, ver junctionManeuver). Por defecto 0: cortan. Esa curva
// puede medir mas que maxGapM: con el corte de 50 m, la de 55 m de una cruz
// con dos brazos muertos partia la esquina en dos mitades calladas y decia
// "Continue straight" (Modesto, ATS, -108128,-6338; simulaciones del
// 21-10). Un tramo sin puntos de curva sigue cortando a maxGapM: es la calle
// entre dos prefabs, y juntarlos ponia el giro del segundo en el primero
// (una T a 59 m de la esquina en Tulsa -> Ardmore). En unas 1.100 rutas de
// ATS y ETS2 (tres semillas) suma 5 avisos y no saca ninguno: esa cruz, una
// T de San Francisco que se callaba, una Y de Modesto y la primera salida de
// dos rotondas chicas de ETS2 ("turn right" donde no se decia nada).
function junctionClusterEnd(pts, cum, i, maxGapM, maxSpanM, skip, curveSpanM = 0) {
  const span = maxSpanM != null ? maxSpanM : 100;
  const gapCurva = Math.max(maxGapM, curveSpanM);
  let j = i;
  for (;;) {
    let n = j + 1;
    if (n === skip && n + 1 < pts.length - 1) n++;
    let curva = false;
    while (curveSpanM > 0 && n < pts.length - 1 && pts[n][4] == null && cum[n] - cum[j] < gapCurva) { n++; curva = true; }
    if (curva && cum[n] - cum[i] > curveSpanM) return j;
    if (n >= pts.length - 1 || pts[n][3] !== 1 || cum[n] - cum[j] >= (curva ? gapCurva : maxGapM) || cum[n] - cum[i] > span) return j;
    j = n;
  }
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
// nodos, en orden, o null. budget: nodos a visitar como mucho.
function oneWayRing(adjacency, nodeAt, start, from, maxLenM = 700, maxDepth = 40, budget = 300) {
  const oneWay = (a, b) => !(adjacency.get(b) || []).some(([m]) => m === a);
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
// Parejos por metro de recorrido: antes salia cada vertice de la curva, y
// los arcos dibujados con muchos vertices corrian el centro (roundish) unos
// 3 m; las dos rotondas de la salida 139 de Miles City daban 1,305 y no
// pasaban (Discord, 12-10).
function ringOutline(ringPath, nodeAt, edgeLine, stepM = 5) {
  const out = [];
  let next = 0; // metros, sobre el tramo actual, hasta el proximo punto
  for (let k = 0; k < ringPath.length; k++) {
    const a = ringPath[k], b = ringPath[(k + 1) % ringPath.length];
    const line = (edgeLine && edgeLine(a, b)) || [nodeAt(a), nodeAt(b)];
    for (let j = 1; j < line.length; j++) {
      const [x0, z0] = line[j - 1], [x1, z1] = line[j];
      const len = Math.hypot(x1 - x0, z1 - z0);
      for (; next < len; next += stepM) out.push([x0 + (x1 - x0) * next / len, z0 + (z1 - z0) * next / len]);
      next -= len;
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

// Direccion (vector unitario en la grilla) con la que sale de su primer punto
// una polilinea, o con la que llega al ultimo (alFinal), salteando los
// tramitos de menos de ARC_DIR_MIN_M como routeArcDirections.
function lineDir(line, alFinal) {
  const a = alFinal ? line.length - 1 : 0, lejos = alFinal ? 0 : line.length - 1, paso = alFinal ? -1 : 1;
  let t = a + paso;
  while (t !== lejos && Math.hypot(line[t][0] - line[a][0], line[t][1] - line[a][1]) < ARC_DIR_MIN_M) t += paso;
  const s = alFinal ? 1 : -1, dx = s * (line[a][0] - line[t][0]), dy = s * (line[a][1] - line[t][1]);
  const d = Math.hypot(dx, dy) || 1;
  return [dx / d, dy / d];
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
//    salida de verdad (leadsAway) hasta el que la ruta deja. El nodo de
//    entrada tambien: en muchas rotondas del grafo el brazo entra al anillo
//    en el mismo nodo del que se abre la salida siguiente, y sin contarla
//    "derecho" salia "primera salida" (Discord, 15-10: "the immediate exit
//    isn't counted"; 1 de cada 3 nodos de anillo de ATS es asi). Ahi no
//    cuenta la calle por la que se llega ni lo que se sale dandose vuelta
//    (mas de UTURN_MIN_DEG, como el ruteo), que es el mismo brazo.
//  - rotonda compacta de un solo prefab: el brazo de entrada se une directo
//    con cada brazo de salida, con curvas que rodean la isla (al menos dos
//    doblan 90 grados de mas), cortas y con los brazos repartidos alrededor
//    de un centro. Las salidas se ordenan por el largo de su curva: la primera es
//    la mas corta.
// ctx: { pts, cum, i, iEnd, adjacency, nodeAt, edgeLine(a, b), bearingBetween }.
// Devuelve { exit, enter, leave } (indices de pts) o null.
//
// Las rotondas grandes (15-10): casi todas miden menos de 700 m de vuelta,
// pero el circulo de Alexandria (ATS) mide 1138 m y 10 brazos y salia como
// "keep left". Si hasta 700 m no hay un anillo redondo, se busca otra vez
// hasta RING_BIG_M (ninguna otra de ATS, ETS2 ni ProMods pasa de 700 m).
// Una segunda busqueda y no un limite mas alto: con mas largo, la busqueda
// puede volver al nodo por otro camino antes que por el anillo, y las
// chicas quedan como estaban. Cuesta menos de 0,5 ms por cruce.
const RING_BIG_M = 1500;
const RING_SEARCHES = [[700, 40, 300], [RING_BIG_M, 80, 600]]; // [metros, nodos, presupuesto]

// Un anillo de verdad dobla parejo. Una manzana de calles de una mano, las
// colectoras de un enlace de Texas o el lazo de un area de descanso, con las
// esquinas recortadas por las curvas de giro, pasan por redondas pero tienen
// lados rectos largos: salian como "roundabout, 2nd exit" (10 de las 45
// rotondas anunciadas en las rutas de ATS simuladas el 15-10). El tramo mas
// largo que dobla menos de maxTurnDeg, como fraccion de la vuelta: en las
// rotondas de ETS2, ProMods y ATS hasta 0,146; en las manzanas y colectoras
// de ATS, 0,162 a 0,198 (contra el nombre del prefab del parser).
const RING_MAX_STRAIGHT = 0.155;
function longestStraightFrac(outline, maxTurnDeg = 15) {
  const n = outline.length;
  if (n < 3) return 1;
  const giro = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const a = outline[(k + n - 1) % n], b = outline[k], c = outline[(k + 1) % n];
    const r1 = Math.atan2(b[1] - a[1], b[0] - a[0]), r2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
    giro[k] = Math.abs(normDeg((r2 - r1) * 180 / Math.PI));
  }
  // la ventana circular mas larga que suma menos de maxTurnDeg
  let mejor = 0, suma = 0, j = 0;
  for (let i = 0; i < n; i++) {
    if (j < i) { j = i; suma = 0; }
    while (j - i < n && suma + giro[j % n] <= maxTurnDeg) { suma += giro[j % n]; j++; }
    mejor = Math.max(mejor, j - i);
    if (j > i) suma -= giro[i];
  }
  return mejor / n;
}

// Rotondas ovaladas armadas con calles (no con un prefab de rotonda): dos
// lados rectos y las puntas redondas. Llegando a Colville (ATS, -81881,-63722,
// turn report del 23-10) el ovalo de 55 x 95 m daba x1,81 y lado recto de
// 0,212, y salia como "turn left" dos veces. Afuera de roundish y de
// RING_MAX_STRAIGHT, igual que las manzanas de calles de una mano (en ATS
// tienen las esquinas cortadas y doblan parejo, y la regla de siempre no las
// separa de un ovalo), pero una manzana tiene cuatro lados rectos y un ovalo
// dos. Se pide ademas que doble siempre para el mismo lado (los cruces en
// estrella de un prefab no), 150 a 450 m de vuelta (los rombos donde una
// autovia se angosta miden 100) y 3 salidas (los lazos de las areas de
// descanso y las rampas tienen 1 o 2). En ATS, ETS2, Coast to Coast y
// ProMods entran 21 anillos, todos ovalos (dibujados uno por uno), y ninguna
// manzana, rombo ni estrella; quedan afuera el octogono de (9787,50535) y
// algunas rotondas de enlace con lados rectos (ATS 153 y 157 del relevamiento).
const OVAL_RING = { maxRatio: 2, maxStraight: 0.25, thirdStraight: 0.06, maxConcaveDeg: 30, minM: 150, maxM: 450, minExits: 3 };
// Los tramos rectos (que doblan menos de maxTurnDeg) mas largos de un anillo,
// sin pisarse, de mayor a menor, como fraccion de la vuelta (count, con 0 si
// no hay mas).
function straightRuns(outline, count = 3, maxTurnDeg = 15) {
  const n = outline.length;
  const out = [];
  if (n < 3) return [1, ...new Array(count - 1).fill(0)];
  const giro = ringTurns(outline).map(Math.abs);
  const libre = new Uint8Array(n).fill(1);
  for (let t = 0; t < count; t++) {
    let mejor = 0, desde = -1;
    for (let i = 0; i < n; i++) {
      if (!libre[i]) continue;
      let suma = 0, j = i;
      while (j - i < n && libre[j % n] && suma + giro[j % n] <= maxTurnDeg) { suma += giro[j % n]; j++; }
      if (j - i > mejor) { mejor = j - i; desde = i; }
    }
    out.push(desde < 0 ? 0 : mejor / n);
    for (let j = desde; desde >= 0 && j < desde + mejor; j++) libre[j % n] = 0;
  }
  return out;
}
// Cuanto dobla en cada punto de un contorno cerrado (grados, con signo).
function ringTurns(outline) {
  const n = outline.length;
  const giro = new Array(n);
  for (let k = 0; k < n; k++) {
    const a = outline[(k + n - 1) % n], b = outline[k], c = outline[(k + 1) % n];
    const r1 = Math.atan2(b[1] - a[1], b[0] - a[0]), r2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
    giro[k] = normDeg((r2 - r1) * 180 / Math.PI);
  }
  return giro;
}
// outline: ringOutline (puntos cada stepM metros). countExits(): cuantas
// salidas de verdad tiene el anillo (se cuentan al final, si la forma pasa).
function ovalRing(outline, countExits, stepM = 5, o = OVAL_RING) {
  const largo = outline.length * stepM;
  if (largo < o.minM || largo > o.maxM || !roundish(outline, o.maxRatio)) return false;
  const giro = ringTurns(outline);
  const signo = Math.sign(giro.reduce((s, g) => s + g, 0)) || 1;
  const contra = giro.reduce((s, g) => s + (Math.sign(g) === -signo ? Math.abs(g) : 0), 0);
  if (contra > o.maxConcaveDeg) return false;
  const [primero, , tercero] = straightRuns(outline, 3);
  return primero <= o.maxStraight && tercero < o.thirdStraight && countExits() >= o.minExits;
}

// Una rotonda compacta tiene isla: ninguna de sus curvas pasa cerca del
// centro. En los cruces comunes de ATS las curvas de navegacion son
// "cuadradas", doblan 90 grados de mas igual que alrededor de una isla, y la
// regla del prefab compacto los tomaba por rotondas: de los 187 nodos de ATS
// que la cumplian, 185 estan en prefabs que no son rotondas, y un cruce en X
// decia "roundabout, 2nd exit" (15-10). Cuanto se acercan las curvas que
// salen de v (sin la calle por la que se llega) al centro de las puntas de
// los brazos: en un cruce es el medio, por donde pasa la que sigue derecho;
// en una rotonda, la isla. En los cruces de ATS, 1,3 m de mediana (175 de
// 176 por debajo de 3 m); en las rotondas compactas de ETS2 y ProMods, 7,4
// m (84 % pasan los 3 m: las otras vuelven a anunciarse como giro).
const COMPACT_MIN_ISLAND_M = 3;
function compactIslandM(v, outs, nodeAt, edgeLine) {
  const puntas = [v, ...outs].map(nodeAt);
  const cx = puntas.reduce((s2, p) => s2 + p[0], 0) / puntas.length, cz = puntas.reduce((s2, p) => s2 + p[1], 0) / puntas.length;
  let min = Infinity;
  for (const n of outs) {
    const l = (edgeLine && edgeLine(v, n)) || [nodeAt(v), nodeAt(n)];
    for (let k = 1; k < l.length; k++) {
      const [x0, z0] = l[k - 1], dx = l[k][0] - x0, dz = l[k][1] - z0, L2 = dx * dx + dz * dz;
      const t = L2 ? Math.max(0, Math.min(1, ((cx - x0) * dx + (cz - z0) * dz) / L2)) : 0;
      min = Math.min(min, Math.hypot(cx - x0 - dx * t, cz - z0 - dz * t));
    }
  }
  return min;
}

// Para que lado se da la vuelta (el icono del aviso): true antihorario (mano
// derecha), false horario (mano izquierda), null si no se sabe. ringCcw: el
// contorno de un anillo, en el sentido de sus aristas, dobla en total -360
// grados si es antihorario (rumbos horarios). sweepCcw: como gira, visto
// desde el centro, una curva que rodea la isla.
function ringCcw(contorno, bearingBetween) {
  if (!contorno || contorno.length < 3) return null;
  let total = 0;
  for (let k = 0; k < contorno.length; k++) {
    const a = contorno[k], b = contorno[(k + 1) % contorno.length], c = contorno[(k + 2) % contorno.length];
    total += normDeg(bearingBetween(b, c) - bearingBetween(a, b));
  }
  return Math.abs(total) > 180 ? total < 0 : null;
}
function sweepCcw(line, centro, bearingBetween) {
  if (!line || line.length < 2) return null;
  let total = 0;
  for (let k = 1; k < line.length; k++) total += normDeg(bearingBetween(centro, line[k]) - bearingBetween(centro, line[k - 1]));
  return Math.abs(total) > 45 ? total < 0 : null;
}

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
    let ring = null, contornoRing = null;
    for (const [maxM, maxDepth, budget] of RING_SEARCHES) {
      const ringPath = oneWayRing(adjacency, nodeAt, v, u, maxM, maxDepth, budget);
      if (!ringPath || ringPath.length < 4) continue;
      const contorno = ringOutline(ringPath, nodeAt, edgeLine);
      const enAnillo = new Set(ringPath);
      const salidas = () => {
        let s = 0;
        for (const w of ringPath) for (const [n] of (adjacency.get(w) || [])) if (!enAnillo.has(n) && leadsAway(adjacency, nodeAt, w, n, enAnillo, escapeM)) s++;
        return s;
      };
      if ((roundish(contorno, 1.3) && longestStraightFrac(contorno) < RING_MAX_STRAIGHT) || ovalRing(contorno, salidas)) { ring = enAnillo; contornoRing = contorno; break; }
    }
    if (ring && !ring.has(u)) {
      const lineOf = (a, b) => (edgeLine && edgeLine(a, b)) || [nodeAt(a), nodeAt(b)];
      const llegada = lineDir(lineOf(u, v), true);
      const vuelve = (n) => { const d = lineDir(lineOf(v, n), false); return llegada[0] * d[0] + llegada[1] * d[1] < UTURN_COS; };
      // u: el brazo por el que se llega, que en el anillo es la ultima salida
      const esSalida = (w, n) => n !== u && !ring.has(n) && (w !== v || !vuelve(n));
      let exit = 0, leave = kEnter, k = kEnter, saleEnLaEntrada = false;
      for (;;) {
        let next = null;
        for (let j = k + 1; j < pts.length; j++) if (pts[j][4] != null) { next = j; break; }
        const w = pts[k][4];
        const sale = next != null && !ring.has(pts[next][4]) && (k !== kEnter || esSalida(w, pts[next][4]));
        const otra = (adjacency.get(w) || []).some(([n]) => esSalida(w, n) && leadsAway(adjacency, nodeAt, w, n, ring, escapeM));
        if (sale || otra) exit++;
        if (sale) { leave = k; saleEnLaEntrada = k === kEnter; break; }
        if (next == null || !ring.has(pts[next][4])) { leave = k; break; }
        k = next;
      }
      if (exit >= 1 && (leave !== kEnter || saleEnLaEntrada)) return { exit, enter: kEnter, leave, ccw: ringCcw(contornoRing, bearingBetween) };
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
    if (compactIslandM(v, outs.map(([n]) => n), nodeAt, edgeLine) < COMPACT_MIN_ISLAND_M) continue;
    // Y la ruta la usa: rodea la isla o dobla (la primera salida). Pasar
    // derecho por un prefab chico con curvas raras no es una rotonda.
    const propia = edgeLine(v, b);
    if (!propia || (extraTurningDeg(propia, bearingBetween) < 90
      && Math.abs(normDeg(bearingBetween(propia[propia.length - 2], propia[propia.length - 1]) - bearingBetween(propia[0], propia[1]))) < 45)) continue;
    const prefab = new Set([v, ...outs.map(([n]) => n)]);
    const salidas = outs.filter(([n]) => n === b || leadsAway(adjacency, nodeAt, n, n, prefab, escapeM))
      .sort((x, y) => x[1] - y[1]);
    const exit = salidas.findIndex(([n]) => n === b) + 1;
    if (exit >= 1) {
      // el sentido: como rodea el centro la curva que mas da la vuelta
      const masVuelta = rodean.map(([n]) => edgeLine(v, n)).sort((x, y) => extraTurningDeg(y, bearingBetween) - extraTurningDeg(x, bearingBetween))[0];
      const puntas = [v, ...outs.map(([n]) => n)].map(nodeAt);
      const c = [puntas.reduce((s2, p) => s2 + p[0], 0) / puntas.length, puntas.reduce((s2, p) => s2 + p[1], 0) / puntas.length];
      return { exit, enter: kEnter, leave: kLeave, ccw: sweepCcw(masVuelta, c, bearingBetween) };
    }
  }
  return null;
}

// Donde queda un lugar visto desde el camion, en la grilla del juego (x al
// este, z al sur) y con el rumbo del SDK (0 norte, horario; ver
// gridHeadingToGeo). rel: grados, + a la derecha. side: 'ahead' hasta 60
// grados, 'behind' desde 120, 'side' en el medio. null sin rumbo.
function poiRelative(x, z, headingDeg, px, pz) {
  if (!Number.isFinite(headingDeg) || x == null || z == null) return null;
  const dx = px - x, dz = pz - z;
  if (Math.hypot(dx, dz) < 1) return null;
  const rel = normDeg(Math.atan2(dx, -dz) * 180 / Math.PI - headingDeg);
  return { rel, side: Math.abs(rel) <= 60 ? 'ahead' : Math.abs(rel) >= 120 ? 'behind' : 'side' };
}

// Paradas (estaciones) a lo largo de la ruta que falta, que empieza en el
// camion: las que quedan a menos de maxOffM del recorrido, ordenadas por lo
// que hay que andar hasta ellas (sobre la ruta, mas el desvio).
function stopsAlongRoute(route, stops, maxOffM = 400, maxAlongM = 80000) {
  if (!route || route.length < 2) return [];
  const cum = [0];
  for (let k = 1; k < route.length; k++) cum.push(cum[k - 1] + Math.hypot(route[k][0] - route[k - 1][0], route[k][1] - route[k - 1][1]));
  const out = [];
  for (const st of stops) {
    let best = null;
    for (let k = 1; k < route.length && cum[k - 1] <= maxAlongM; k++) {
      const ax = route[k - 1][0], az = route[k - 1][1], bx = route[k][0], bz = route[k][1];
      const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
      const raw = L2 ? ((st.x - ax) * vx + (st.z - az) * vz) / L2 : 0;
      if (k === 1 && raw < 0) continue; // antes del camion: queda atras, no en la ruta
      const t = Math.max(0, Math.min(1, raw));
      const off = Math.hypot(st.x - ax - t * vx, st.z - az - t * vz);
      if (off <= maxOffM && (!best || off < best.off)) best = { off, along: cum[k - 1] + t * Math.sqrt(L2) };
    }
    if (best) out.push({ ...st, along: best.along, off: best.off });
  }
  return out.sort((a, b) => (a.along + 2 * a.off) - (b.along + 2 * b.off));
}

// La estacion "mas cercana" que conviene: la primera sobre la ruta que falta;
// sin ruta (o sin ninguna cerca de ella), la mas cercana que quede adelante;
// si no hay ninguna adelante, la mas cercana. Antes era la mas cercana en
// linea recta, que podia quedar atras: la ruta daba la vuelta para ir a
// buscarla ("it was a line going behind me", Discord 10-10).
// stations: [{x, z, dist}] ordenadas por dist.
// La de la ruta no puede quedar mucho mas lejos que la mas cercana que no
// esta atras: en la demo elegia una a 244 km sobre la ruta habiendo otras a
// pocos km a un costado (maxDetourFactor veces su distancia, mas un margen).
// Con reach(st) (metros por el camino desde el camion, o null) se mira si la
// elegida obliga a dar la vuelta: estar cerca de la linea de la ruta no dice
// de que mano queda. En la I-80 este de Grand Island (ATS, Discord 19-10) el
// area de descanso a 99 m de la autopista era de la mano oeste: 1 km antes,
// el camino hasta ella daba 3 km (salir, dar la vuelta y volver), y el boton
// de descanso mandaba a darla con otras a la salida siguiente. Si el camino
// mide mas de uTurnM sobre lo que se avanza hasta ella (along + off sobre la
// ruta, 1,5 veces la recta fuera de ella), se elige otra vez sin ella (asi
// tampoco da el tope) y queda la de menor 2 * camino - along: ir y volver del
// desvio, menos lo que se avanza por la ruta. En 816 pedidos de ATS cambian
// 83, 69 con menos camino. Ordenar todo por el camino cambiaba 30 % y en 91
// el camino era mas largo (ganaban paradas mas lejos sobre la ruta); sacar
// las que caen atras por la linea perdia algunas que se alcanzan en 2 km.
// Hasta `tries` vueltas.
// Con el camino a mano tambien se miran las `near` mas cercanas y las
// primeras sobre la ruta: la de adelante por el rumbo no ve las de al
// costado. Saliendo de Austin al este (ATS) elegia una a 3,6 km, 5,2 por el
// camino, con otra a 546 m y 744 por el camino; en una curva o una rampa el
// rumbo dejaba "atras" un area de descanso a 515 m (977 por el camino) y
// elegia otra a 6 km que obligaba a volver. Gana una que no obliga a dar la
// vuelta si cuesta (2 * camino - along) switchM menos. En 1.238 pedidos de
// ATS y 1.508 de ETS2 (rutas reales, cada 1,5 km) cambian 175 (162 con menos
// camino) y 247 (239); las elegidas mucho peores que otra (3 km y 1,5 veces
// el costo) pasan de 123 a 24 y de 145 a 9, y las que obligan a volver de
// 89 a 58 y de 117 a 42. Dejando ganar tambien a las que obligan a volver
// no quedaba ninguna mala, pero en ATS subian las de la vuelta (89 -> 103).
// El descanso tiene plazo (maxReachM: los metros de mundo que se andan antes
// de que se acabe, restReachMeters): si la elegida queda mas lejos por el
// camino, gana la de menor costo entre las que se alcanzan (primero las que
// no obligan a volver) y, si no se alcanza ninguna, la mas cercana por el
// camino. Una sobre la ruta pero mas lejos le ganaba a una al costado que se
// alcanzaba ("won't take you off your route for a rest stop even though
// another stop may be closer", Discord 22-10, Chillaxingone).
function pickFuelStop(stations, x, z, headingDeg, route, maxDetourFactor = 3, slackM = 1500, { reach = null, uTurnM = 1000, tries = 4, near = 8, switchM = 1000, maxReachM = Infinity } = {}) {
  if (!stations || !stations.length) return null;
  const elegir = (pool) => {
    const notBehind = pool.filter(st => { const r = poiRelative(x, z, headingDeg, st.x, st.z); return !r || r.side !== 'behind'; });
    const ref = notBehind.length ? notBehind[0].dist : pool[0].dist;
    const onRoute = stopsAlongRoute(route, pool).filter(st => st.along + st.off <= ref * maxDetourFactor + slackM);
    if (onRoute.length) return { ...onRoute[0], why: 'route' };
    const ahead = pool.find(st => { const r = poiRelative(x, z, headingDeg, st.x, st.z); return r && r.side === 'ahead'; });
    if (ahead) return { ...ahead, why: 'ahead' };
    return { ...pool[0], why: 'nearest' };
  };
  let pick = elegir(stations);
  if (!reach) return pick;
  const caminos = new Map();
  const camino = (st) => {
    const key = `${st.x},${st.z}`;
    if (!caminos.has(key)) { const m = reach(st); caminos.set(key, Number.isFinite(m) ? m : null); }
    return caminos.get(key);
  };
  const costo = (st) => { const m = camino(st); return m == null ? Infinity : 2 * m - (st.why === 'route' ? st.along : 0); };
  const vuelta = (st) => {
    const m = camino(st);
    return m == null || m > (st.why === 'route' ? st.along + st.off : 1.5 * st.dist) + uTurnM;
  };
  let pool = stations, mejor = pick;
  for (let k = 0; k < tries && pick && vuelta(pick); k++) {
    const sacada = pick;
    pool = pool.filter(st => st.x !== sacada.x || st.z !== sacada.z);
    if (!pool.length) break;
    pick = elegir(pool);
    if (costo(pick) < costo(mejor)) mejor = pick;
  }
  const sobre = new Map(stopsAlongRoute(route, stations).map(st => [`${st.x},${st.z}`, st]));
  const vistas = [...stations.slice(0, near), ...[...sobre.values()].slice(0, 3)].map(st0 => {
    const r = sobre.get(`${st0.x},${st0.z}`);
    return r ? { ...r, why: 'route' } : { ...st0, why: 'near' };
  });
  for (const st of vistas) {
    if (!vuelta(st) && costo(st) < costo(mejor) - switchM) mejor = st;
  }
  if (Number.isFinite(maxReachM) && !(camino(mejor) <= maxReachM)) {
    const llegan = vistas.filter(st => camino(st) != null && camino(st) <= maxReachM);
    if (llegan.length) {
      return llegan.reduce((a, b) => (vuelta(a) !== vuelta(b) ? (vuelta(a) ? b : a) : costo(b) < costo(a) ? b : a));
    }
    for (const st of vistas) if (camino(st) != null && !(camino(mejor) <= camino(st))) mejor = st;
  }
  return mejor;
}

// Donde entra una parada nueva (estacion, area de descanso, taller...) en la
// lista de waypoints: antes iba siempre al final, y en una ruta solo de
// waypoints el ultimo es el destino. Yendo a un pueblo (waypoint 1), la
// estacion quedaba como parada 2 y habia que llegar al pueblo antes de ir a
// cargar ("can that be fixed that when you add something it goes to the
// position one", Discord 13-10). Ahora va primero, salvo que quede sobre la
// ruta que falta despues de otro waypoint: ahi entra en ese tramo, para no
// pasar de largo el waypoint e ir a buscarlo despues.
// route: la ruta que falta, desde el camion, con el tramo en p[5] (el tramo
// i lleva al waypoint i; con trabajo, el ultimo lleva a su destino). count:
// cuantos waypoints hay. "Sobre la ruta" es lo mismo que para pickFuelStop
// (stopsAlongRoute). Devuelve un indice entre 0 y count.
function stopInsertIndex(route, stop, count, maxOffM = 400) {
  if (!(count > 0) || !stop || !Number.isFinite(stop.x) || !Number.isFinite(stop.z)) return 0;
  if (!route || route.length < 2) return 0;
  for (let k = 1; k < route.length; k++) {
    const ax = route[k - 1][0], az = route[k - 1][1], bx = route[k][0], bz = route[k][1];
    const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
    const raw = L2 ? ((stop.x - ax) * vx + (stop.z - az) * vz) / L2 : 0;
    if (k === 1 && raw < 0) continue; // antes del camion: queda atras, no en la ruta
    const t = Math.max(0, Math.min(1, raw));
    if (Math.hypot(stop.x - ax - t * vx, stop.z - az - t * vz) > maxOffM) continue;
    const leg = Number(route[k][5]);
    return Number.isInteger(leg) && leg > 0 ? Math.min(leg, count) : 0;
  }
  return 0;
}

// Si el camion ya llego al primer waypoint (y se saca, como un GPS). Con la
// ruta de los waypoints de ahora se mide por la ruta: llega al pasar a menos
// de routeM del punto de la ruta mas cerca del icono, buscado a
// WAYPOINT_NODE_WINDOW_M de cada lado del nodo donde termina su tramo (o a
// 1,5 veces lo que hay del nodo al icono, si es mas: una arista larga sin
// nodos). La ruta va al nodo del grafo mas cercano al toque, que puede caer
// antes o despues del icono. Un toque a mas de WAYPOINT_SNAP_M del camino (en el
// celular, con el mapa alejado) llega en el nodo: antes quedaba puesto y
// cada recalculo, al salirse de la ruta, mandaba a volver a el (reporte del
// 16-10, ATS + C2C). Pasado el nodo, salirse de la ruta tambien es llegar,
// por lo mismo. Una rampa o una colectora corren a 30 m de la autopista y no
// cuentan hasta que el camion va por ellas.
// En linea recta (tapM) solo sin ruta: 150 m del mundo son 3 km del juego a
// 1:20 y el waypoint se iba casi 2 millas antes del icono (Discord,
// Gargamosch, 18-10). Parado (speedKmh < 5) alcanza con stoppedM por la
// ruta: estacionar un poco antes del nodo tambien es llegar.
// route: la ruta recortada al camion con el tramo en p[5] (como
// stopInsertIndex), o null si no es la de los waypoints de ahora.
const WAYPOINT_ROUTE_END_M = 10;
const WAYPOINT_STOPPED_M = 50;
const WAYPOINT_NODE_WINDOW_M = 100;
const WAYPOINT_SNAP_M = 30;
const WAYPOINT_OFF_ROUTE_M = 50;
function waypointReached(x, z, wpPos, route, { tapM = 150, routeM = WAYPOINT_ROUTE_END_M, stoppedM = WAYPOINT_STOPPED_M, speedKmh = null } = {}) {
  if (!Array.isArray(wpPos) || !Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (!route || route.length < 2 || !Number.isFinite(Number(route[0][5]))) return Math.hypot(wpPos[0] - x, wpPos[1] - z) < tapM;
  const parado = Number.isFinite(speedKmh) && speedKmh < 5;
  const llega = (faltaM) => faltaM <= routeM || (parado && faltaM <= stoppedM);
  // Lo que falta por la ruta hasta el punto mas cerca del icono entre loM y
  // hiM de lo que falta (null si el icono esta a mas de WAYPOINT_SNAP_M)
  const alIcono = (loM, hiM) => {
    let best = null;
    for (let k = 1, m = 0; k < route.length && m <= hiM; k++) {
      const ax = route[k - 1][0], az = route[k - 1][1], vx = route[k][0] - ax, vz = route[k][1] - az;
      const L = Math.hypot(vx, vz);
      if (L > 0 && m + L >= loM) {
        const t = Math.max(Math.max(0, (loM - m) / L), Math.min(Math.min(1, (hiM - m) / L), ((wpPos[0] - ax) * vx + (wpPos[1] - az) * vz) / (L * L)));
        const d = Math.hypot(wpPos[0] - ax - t * vx, wpPos[1] - az - t * vz);
        // A la par, el primero: una ruta que vuelve por el mismo camino pasa dos veces
        if (!best || d < best.d - 1) best = { m: m + t * L, d };
      }
      m += L;
    }
    return best && best.d <= WAYPOINT_SNAP_M ? best.m : null;
  };
  const ventana = (p) => Math.max(WAYPOINT_NODE_WINDOW_M, 1.5 * Math.hypot(wpPos[0] - p[0], wpPos[1] - p[1]));
  if (Number(route[0][5]) > 0) {
    // Ya paso el nodo: llega, salvo que el icono este un poco mas adelante
    if (Math.hypot(x - route[0][0], z - route[0][1]) > WAYPOINT_OFF_ROUTE_M) return true;
    const icono = alIcono(0, ventana(route[0]));
    return icono == null || llega(icono);
  }
  let nodoM = 0, k = 1;
  for (; k < route.length && Number(route[k][5]) === 0; k++) nodoM += Math.hypot(route[k][0] - route[k - 1][0], route[k][1] - route[k - 1][1]);
  const w = ventana(route[k - 1]);
  const icono = alIcono(Math.max(0, nodoM - w), nodoM + w);
  return llega(icono == null ? nodoM : icono);
}

// Avisa una vez por carga de combustible: el tanque subio al menos minL
// litros (o minFrac del tanque) desde el nivel mas bajo visto. Con eso un
// waypoint de estacion se da por cumplido aunque se haya cargado en otra, o
// a mas de WAYPOINT_REACHED_M de su icono: antes quedaba puesto y la ruta
// volvia a buscarlo (Discord, 10-10).
function createRefuelWatch({ minL = 20, minFrac = 0.08 } = {}) {
  let low = null;
  return {
    push(fuelL, capacityL) {
      if (!Number.isFinite(fuelL)) return false;
      if (low == null || fuelL < low) { low = fuelL; return false; }
      if (fuelL - low >= Math.max(minL, (Number(capacityL) || 0) * minFrac)) { low = fuelL; return true; }
      return false;
    },
  };
}

// Los minutos de juego hasta el proximo descanso, o null si no dicen nada:
// con la fatiga apagada el juego manda 0 o un valor de mas de un dia, como
// el plazo de un trabajo sin plazo (jobDeadlineSeconds). createFatigue,
// createRestWatch y createStatusAlerts ya lo filtraban; el panel de
// docs/dash/ usaba el valor crudo y con la fatiga apagada decia que habia
// que dormir antes de llegar y marcaba el descanso al principio de la barra
// (barrido del 21-10). restStopSeconds: el nombre viejo, tambien en minutos.
const REST_MINUTES_MAX = 24 * 60;
function restMinutesOf(data) {
  if (!data) return null;
  const crudo = data.restStopMinutes != null ? data.restStopMinutes : data.restStopSeconds;
  if (crudo == null) return null;
  const m = Number(crudo);
  return Number.isFinite(m) && m > 0 && m < REST_MINUTES_MAX ? m : null;
}

// Los metros de mundo que se andan en los minutos de juego que faltan para el
// descanso, a REST_REACH_KMH de velocimetro: el tope del boton de descanso
// (maxReachM de pickFuelStop). timeScale: minutos de juego por minuto real
// (20 en la ruta de ATS, 19 en ETS2, 3 en la ciudad). A 150 minutos son
// 8,75 km de ATS, unas 109 millas en el GPS del juego. Infinity sin dato.
const REST_REACH_KMH = 70;
function restReachMeters(restMinutes, timeScale) {
  if (!(restMinutes > 0) || !(timeScale > 0)) return Infinity;
  return restMinutes * 60 / timeScale * REST_REACH_KMH / 3.6;
}

// Lo que el GPS del juego dice que falta, en segundos de juego, o null sin
// ruta: sin ruta el SDK manda 0 y el mini-HUD y el panel decian "ETA (game):
// 0h 0m" (la distancia, que tambien viene en 0, ya no se mostraba).
function gameRouteSeconds(data) {
  const s = data ? Number(data.routeTimeSeconds) : NaN;
  return Number.isFinite(s) && s > 0 ? s : null;
}

// Lo mismo para el descanso: una parada en un area de descanso queda
// cumplida al dormir, aunque haya sido en otra. Dormir sube los minutos que
// faltan para el proximo descanso de golpe (de ~30 a ~11 h); manejar solo
// los baja. 0 o mas de un dia es la fatiga apagada (ver createFatigue).
function createRestWatch({ minUpMin = 120 } = {}) {
  let low = null;
  return {
    push(restMinutes) {
      if (!Number.isFinite(restMinutes) || restMinutes === 0 || restMinutes >= 24 * 60) return false;
      if (low == null || restMinutes < low) { low = restMinutes; return false; }
      if (restMinutes - low >= minUpMin) { low = restMinutes; return true; }
      return false;
    },
  };
}

// Si el trabajo que aparece es uno recien tomado o uno a mitad de camino (una
// partida cargada con el tablero ya abierto, que es lo de todos los dias: el
// cliente abre la pagina antes que el juego). true, false, o null si todavia
// no se puede saber: el GPS del juego tarda unos ticks en calcular la ruta.
//  - Sin remolque enganchado (freight market, autos del Road Trip) se toma
//    como nuevo: el GPS apunta al remolque y su distancia no dice nada.
//  - Con remolque, nuevo si lo que falta es casi todo el trabajo.
function jobLooksFresh(d, freshFrac = 0.85) {
  const planned = Number(d.plannedDistanceKm);
  if (!(planned > 0) || !d.trailerAttached) return true;
  const route = Number(d.routeDistanceKm);
  if (!(route > 0)) return null;
  return route >= planned * freshFrac;
}

// Avisos de estado para la voz y para el atajo del mapa (11-10, tomado de
// The Dispatcher): trabajo nuevo, poco combustible y descanso cerca.
// push(d) con cada tick devuelve { say, fuelLow, restSoon }:
//  - say: la frase a decir (clave de voices.json) o null, una por tick; si
//    coinciden dos, la otra sale en el tick siguiente. En pausa se guardan.
//  - job_new: un trabajo que esta pagina no vio antes y que parece recien
//    tomado (jobLooksFresh). El que ya estaba al abrir la pagina no, ni el
//    mismo trabajo que vuelve al cerrar y abrir el juego.
//  - fuel_low: la alerta del propio juego (mechanicalWarnings.fuel) o, con
//    un cliente que no la manda, menos de lowFrac del tanque. Una vez por
//    vez: se rearma al cargar por encima de rearmFrac.
//  - rest_soon: faltan restSoonMin minutos de JUEGO o menos para el
//    descanso (150 son ~7,5 min reales). Se rearma al dormir. Hasta el
//    22-10 eran 90, despues del aviso del juego (~2 h): "let the driver know
//    earlier about an upcoming rest ... Maybe 2 1/2 hours?" (Discord,
//    Chillaxingone). Con 90, en 40 rutas largas de ATS el area que elegia
//    el boton quedaba fuera de alcance en 68 de 370 lugares y en 40 no habia
//    ninguna a mano; con 150, 17 y 5 (5 y 5 con maxReachM). En ETS2, 26 y 3.
//    Se elige en Ajustes (REST_WARN_OPTIONS, setRestSoonMin): "So everyone
//    can choose their time" (el maintainer, 22-10).
function createStatusAlerts({ lowFrac = 0.15, rearmFrac = 0.25, restSoonMin = REST_WARN_DEFAULT, restRearmMin = 240, decideMs = 15000 } = {}) {
  const seenJobs = new Set();
  let primero = true;
  let candidato = null; // { job, since }
  let fuelLow = false, fuelArmed = true;
  let restSoon = false, restArmed = true, lastRest = null;
  const cola = [];
  const encolar = (k) => { if (!cola.includes(k)) cola.push(k); };
  return {
    push(d) {
      if (!d) return { say: null, fuelLow, restSoon };
      const ts = Number(d.ts) * 1000 || Date.now();
      const job = d.onJob && d.cityDst ? [d.citySrc, d.cityDst, d.companyDst, d.cargo].join('|') : null;
      if (job && !seenJobs.has(job)) {
        if (primero) seenJobs.add(job);
        else {
          if (!candidato || candidato.job !== job) candidato = { job, since: ts };
          const fresco = jobLooksFresh(d);
          if (fresco != null || ts - candidato.since >= decideMs) {
            seenJobs.add(job);
            candidato = null;
            if (fresco) encolar('job_new');
          }
        }
      }
      if (!job) candidato = null;
      primero = false;

      const cap = Number(d.fuelCapacity);
      const frac = cap > 0 && Number.isFinite(d.fuel) ? d.fuel / cap : null;
      const alerta = (d.mechanicalWarnings || {}).fuel;
      fuelLow = alerta != null ? !!alerta : (frac != null && frac < lowFrac);
      if (fuelLow && fuelArmed) { fuelArmed = false; encolar('fuel_low'); }
      if (!fuelLow && (frac == null || frac > rearmFrac)) fuelArmed = true;

      const r = Number(d.restStopMinutes);
      const valido = Number.isFinite(r) && r !== 0 && r < 24 * 60;
      if (valido) lastRest = r;
      restSoon = valido && r <= restSoonMin;
      if (restSoon && restArmed) { restArmed = false; encolar('rest_soon'); }
      if (valido && r > restRearmMin) restArmed = true;

      const say = d.paused || !cola.length ? null : cola.shift();
      return { say, fuelLow, restSoon };
    },
    // Otro aviso de descanso en Ajustes. Si lo que falta queda por encima
    // del nuevo, se rearma: bajarlo de 150 a 90 con 100 minutos por delante
    // avisa otra vez a los 90. Subirlo con el aviso pendiente avisa enseguida.
    setRestSoonMin(min) {
      restSoonMin = min;
      if (lastRest != null && lastRest > min) restArmed = true;
    },
  };
}

// Cuanto antes del descanso se avisa (Ajustes > Aviso de descanso), en
// minutos de juego. 150 por defecto (ver createStatusAlerts); el juego avisa
// a las ~2 h.
const REST_WARN_OPTIONS = [180, 150, 120, 90, 60];
const REST_WARN_DEFAULT = 150;
function restWarnSetting(value) {
  const n = Number(value);
  return REST_WARN_OPTIONS.includes(n) ? n : REST_WARN_DEFAULT;
}
// "2h 30m", "3h": como el proximo descanso del panel (formatSeconds de app.js).
function restWarnLabel(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Angulo de la aguja de un reloj del tablero clasico, en grados desde las
// 12, con el recorrido repartido a los dos lados (270: de -135 a 135). Lo que
// se pasa del rango queda clavado en la punta, como una aguja de verdad.
function gaugeAngle(value, min, max, sweepDeg = 270) {
  const v = Number(value);
  if (!Number.isFinite(v) || !(max > min)) return -sweepDeg / 2;
  const frac = Math.max(0, Math.min(1, (v - min) / (max - min)));
  return -sweepDeg / 2 + frac * sweepDeg;
}

// Lo ya recorrido que se guarda para medir el rumbo de entrada a un cruce
// cercano: los ultimos puntos que suman al menos minM, con un tope de maxPts.
// Hasta el 11-10 eran los ultimos 32 puntos, y en la curva de un prefab 32
// puntos pueden ser 15 m: el rumbo se media sobre el salto lateral entre dos
// carriles paralelos y salia un "keep left" falso encima del punto (Discord,
// Lightningroc771).
// Adentro de una rotonda (keepFrom: [x, z] de su entrada, el node del aviso)
// se cuenta desde la entrada y no desde el camion: en una rotonda grande,
// a los 200 m de entrar la entrada se perdia, detectRoundabout ya no la
// encontraba y el aviso de la salida se apagaba, o pasaba a "turn left",
// antes de llegar (1 de cada 4 pasadas en las de mas de 250 m de ETS2).
// Hasta ROUTE_KEEP_MAX_M detras del camion: mas que la rotonda mas grande
// que se reconoce (RING_BIG_M).
const ROUTE_KEEP_MAX_M = 2000;
function trimRouteBehind(behind, minM, maxPts, keepFrom = null) {
  let end = behind.length - 1;
  if (keepFrom) {
    for (let j = end, lenM = 0; j >= 0 && lenM <= ROUTE_KEEP_MAX_M; j--) {
      if (Math.hypot(behind[j][0] - keepFrom[0], behind[j][1] - keepFrom[1]) < 0.5) { end = j; break; }
      if (j > 0) lenM += Math.hypot(behind[j][0] - behind[j - 1][0], behind[j][1] - behind[j - 1][1]);
    }
  }
  let len = 0, k = end;
  while (k > 0 && len < minM) {
    len += Math.hypot(behind[k][0] - behind[k - 1][0], behind[k][1] - behind[k - 1][1]);
    k--;
  }
  const start = Math.max(k, end + 1 - maxPts, 0);
  return start > 0 ? behind.slice(start) : behind;
}

// Agrega a lo recorrido (behind, se modifica) los puntos de la ruta que el
// camion ya paso, hasta bestIdx. El 0 de la ruta es el punto del camion del
// recorte anterior, salvo en el primero: ahi es el comienzo de la ruta y
// tambien va. Sin el, una esquina a menos de 60 m del arranque media la
// entrada sobre un tramo cortado y continuesTurn la juntaba con la T de
// despues, que no se anunciaba (Santa Cruz, ATS, -115226,-4055, 17-10).
function passedRoutePoints(behind, route, bestIdx) {
  for (let k = behind.length ? 1 : 0; k <= bestIdx; k++) behind.push(route[k]);
  return behind;
}

// Los cuatro relojitos de la pestana Gauges del panel (11-10): los que
// importan manejando. Aire (los frenos), frenos (bajando una sierra), agua y
// presion de aceite. AdBlue, bateria y temperatura de aceite quedan para el
// tablero clasico: casi nunca cambian. Cada uno: { key, labelKey, frac (0..1
// del arco), text, bad }, o null si el cliente no lo manda. bad es la alerta
// del juego si la hay, si no el umbral de la zona roja.
function miniDialReadings(d, imperial) {
  const w = (d && d.mechanicalWarnings) || {};
  const frac = (v, min, max) => Math.max(0, Math.min(1, (v - min) / (max - min)));
  const temp = (c) => Math.round(imperial ? c * 9 / 5 + 32 : c) + (imperial ? ' °F' : ' °C');
  const ok = (v) => v != null && Number.isFinite(Number(v));
  const alerta = (flag, umbral) => (flag != null ? !!flag : umbral);
  if (!d) return [];
  return [
    ok(d.airPressure) ? { key: 'air', labelKey: 'airPressureLabel', frac: frac(d.airPressure, 0, 150),
      text: Math.round(d.airPressure) + ' psi', bad: alerta(w.airPressure, d.airPressure < 60) } : null,
    ok(d.brakeTemperature) ? { key: 'brake', labelKey: 'brakeTempLabel', frac: frac(d.brakeTemperature, 0, 400),
      text: temp(d.brakeTemperature), bad: d.brakeTemperature > 300 } : null,
    ok(d.waterTemperature) ? { key: 'water', labelKey: 'waterTempLabel', frac: frac(d.waterTemperature, 40, 120),
      text: temp(d.waterTemperature), bad: alerta(w.waterTemperature, d.waterTemperature > 105) } : null,
    ok(d.oilPressure) ? { key: 'oil', labelKey: 'oilPressureLabel', frac: frac(d.oilPressure, 0, 100),
      text: Math.round(d.oilPressure) + ' psi', bad: alerta(w.oilPressure, d.oilPressure < 15) } : null,
  ];
}

// El tope de un reloj que depende del camion (autonomia, rpm): la primera
// opcion que alcanza, o la ultima. Asi la escala no cambia a cada tick.
function gaugeScaleMax(value, options) {
  const v = Number(value);
  if (!Number.isFinite(v)) return options[0];
  return options.find(o => o >= v) || options[options.length - 1];
}

// Que atajo ofrecer arriba del mapa: 'g' (estacion mas cercana) con poco
// combustible, 'p' (area de descanso) con el descanso cerca, o null. Nada si
// ya hay una parada de ese tipo en la ruta o si la persona lo cerro; cerrado
// queda hasta que la condicion se va (cargo, durmio) y vuelve.
function createStopSuggestion() {
  const cerrado = { g: false, p: false };
  return {
    update({ fuelLow, restSoon }, kinds) {
      if (!fuelLow) cerrado.g = false;
      if (!restSoon) cerrado.p = false;
      const hay = (k) => (kinds || []).includes(k);
      if (fuelLow && !cerrado.g && !hay('g')) return 'g';
      if (restSoon && !cerrado.p && !hay('p')) return 'p';
      return null;
    },
    close(kind) { if (kind in cerrado) cerrado[kind] = true; },
  };
}

// Claves de los ajustes que cambiaron entre lo que la pestana tenia al cargar
// (o al guardar la ultima vez) y lo que tiene ahora. Sin base (todavia no
// termino de cargar), todas: como antes.
function settingsChangedKeys(base, cur) {
  if (!base) return Object.keys(cur);
  return Object.keys(cur).filter(k => JSON.stringify(cur[k]) !== JSON.stringify(base[k]));
}

// Si el nodo `start` es parte de un anillo corto (una rotonda): un ciclo de
// tramos de un solo sentido, sin repetir nodos, que vuelve a el en menos de
// maxLenM sin pasar por `from` (el nodo de la calle por la que se llega).
// Las manzanas de una ciudad son mas grandes; una rotonda del juego mide
// 100-250 m de vuelta.
// Hasta el 17-10 valia cualquier camino dirigido, y en una esquina cuyo
// otro brazo del prefab no tiene calle habia uno: el brazo muerto da la
// vuelta por su tapa y vuelve por los mismos nodos, o las curvas de doble
// mano del prefab hacen un triangulo. La esquina sin otro camino pasaba por
// la entrada a una rotonda y se anunciaba "turn right" en cada curva de la
// sierra (Discord, 17-10, de Oregon a Louisiana): 100 de los 433 "turn" de
// 80 rutas de Oregon y Washington en el simulador.
function ringThrough(adjacency, nodeAt, start, from, maxLenM = 350, maxDepth = 24) {
  return oneWayRing(adjacency, nodeAt, start, from, maxLenM, maxDepth, 400) != null;
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
  // Una esquina de 60 a 120 grados entre dos tramos rectos: lo que hay de 0
  // a legM del cruce va para el mismo lado (a menos de straightLegDeg) que lo
  // que hay de legM a 2 legM, antes y despues.
  const straightLegDeg = ctx.straightLegDeg != null ? ctx.straightLegDeg : 20;
  const esquinaEnEscuadra = () => {
    if (Math.abs(delta) < 60 || Math.abs(delta) > 120 || cum[i] < 2 * legM || cum[iEnd] + 2 * legM > cum[cum.length - 1]) return false;
    const antes = bearingBetween(pointAt(cum[i] - 2 * legM), pointAt(cum[i] - legM));
    const despues = bearingBetween(pointAt(cum[iEnd] + legM), pointAt(cum[iEnd] + 2 * legM));
    return Math.abs(normDeg(antes - inBearing)) < straightLegDeg && Math.abs(normDeg(despues - outBearing)) < straightLegDeg;
  };
  const rejoinM = ctx.rejoinM != null ? ctx.rejoinM : 100;
  const escapeM = ctx.escapeM != null ? ctx.escapeM : 120;
  const forkFarLegM = ctx.forkFarLegM != null ? ctx.forkFarLegM : forkLegM * 2;
  const forkFarMinSep = ctx.forkFarMinSep != null ? ctx.forkFarMinSep : 12;
  const forkFarMinRoute = ctx.forkFarMinRoute != null ? ctx.forkFarMinRoute : 25;
  const inBearing = bearingBetween(pointAt(cum[i] - legM), pts[i]);
  const outBearing = bearingBetween(pts[iEnd], pointAt(cum[iEnd] + legM));
  const delta = normDeg(outBearing - inBearing);

  // Las otras salidas del cruce, como cambio de rumbo contra el de entrada.
  // Nodos propios de la ruta (no cuentan como "otra salida"): los del cruce
  // y el nodo real anterior/siguiente - saltando puntos intermedios de la
  // geometria de la curva, que no tienen indice de nodo. Cada salida se
  // mide lejos (un salto mas por la mas recta si el primer vecino esta a
  // menos de forkLegM): una rampa se separa de a poco.
  let alts = null, exits = null, deads = null;
  const onRoute = new Set();
  // [k, nodo del cruce, primer nodo de la salida] de cada otra salida.
  const altExits = () => {
    if (exits) return exits;
    exits = [];
    deads = [];
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
        if (ahead.has(n)) continue;
        if (escapes(idx, n)) exits.push([k, idx, n]); else deads.push([k, idx, n]);
      }
    }
    return exits;
  };
  const altDeltas = () => {
    if (alts) return alts;
    alts = [];
    for (const [k, idx, n] of altExits()) {
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
    return alts;
  };
  // La salida mas recta de las que no vuelven para atras (|delta| <= maxAbs).
  const straightestAlt = (maxAbs) => {
    let best = null;
    for (const a of altDeltas()) if (Math.abs(a) <= maxAbs && (best == null || Math.abs(a) < Math.abs(best))) best = a;
    return best;
  };

  // Si la ruta entra a un anillo corto (una rotonda). El nodo de entrada ya
  // es parte del anillo; se busca desde el y desde el siguiente, sin volver
  // por la calle por la que se llega.
  const entersRing = () => {
    let before = null, next = null;
    for (let k = i - 1; k >= 0; k--) if (pts[k][4] != null) { before = pts[k][4]; break; }
    for (let k = iEnd + 1; k < pts.length; k++) if (pts[k][4] != null) { next = pts[k][4]; break; }
    return [pts[iEnd][4], next].some(start => start != null && ringThrough(adjacency, nodeAt, start, before));
  };

  // A donde llega una salida de (from -> n) siguiendo su continuacion mas
  // recta lenM metros, sin pisar la ruta (onRoute: llamar despues de altExits).
  const walkStraight = (from, n, lenM) => {
    let prev = from, cur = n, len = 0, steps = 0;
    const seen = new Set([from, n]);
    for (;;) {
      const a = nodeAt(prev), b = nodeAt(cur);
      len += Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len >= lenM || ++steps > 200) return b;
      const dir = bearingBetween(a, b);
      let best = null, bestDiff = Infinity;
      for (const [m] of (adjacency.get(cur) || [])) {
        if (seen.has(m) || onRoute.has(m)) continue;
        const diff = Math.abs(normDeg(bearingBetween(b, nodeAt(m)) - dir));
        if (diff < bestDiff) { bestDiff = diff; best = m; }
      }
      if (best == null) return b;
      seen.add(best); prev = cur; cur = best;
    }
  };
  // Lo mismo, pero el punto justo a lenM metros (null si la salida se termina
  // antes): para comparar con la ruta a la misma distancia.
  const walkPointAt = (from, n, lenM) => {
    let prev = from, cur = n, len = 0, steps = 0;
    const seen = new Set([from, n]);
    for (;;) {
      const a = nodeAt(prev), b = nodeAt(cur);
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len + L >= lenM) {
        const t = L > 0 ? (lenM - len) / L : 0;
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      }
      len += L;
      if (++steps > 200) return null;
      const dir = bearingBetween(a, b);
      let best = null, bestDiff = Infinity;
      for (const [m] of (adjacency.get(cur) || [])) {
        if (seen.has(m) || onRoute.has(m)) continue;
        const diff = Math.abs(normDeg(bearingBetween(b, nodeAt(m)) - dir));
        if (diff < bestDiff) { bestDiff = diff; best = m; }
      }
      if (best == null) return null;
      seen.add(best); prev = cur; cur = best;
    }
  };

  // Una salida que arranca a menos de forkStartMaxDeg de la ruta (medido a
  // forkStartM del nodo, por su curva si ctx.edgeLine la da): la ruta y esa
  // rama se separan de a poco. Devuelve la bifurcacion ("keep" hacia el lado
  // de la ruta, mirando lejos) o null.
  const forkStartM = ctx.forkStartM != null ? ctx.forkStartM : 20;
  const uTurnWalkM = ctx.uTurnWalkM != null ? ctx.uTurnWalkM : 150;
  const uTurnDeg = ctx.uTurnDeg != null ? ctx.uTurnDeg : 135;
  const forkStartMaxDeg = ctx.forkStartMaxDeg != null ? ctx.forkStartMaxDeg : 30;
  const forkInCurve = () => {
    for (const [k, idx, n] of altExits()) {
      const line = (ctx.edgeLine && ctx.edgeLine(idx, n)) || [nodeAt(idx), nodeAt(n)];
      let acum = 0, inicio = line[line.length - 1];
      for (let j = 1; j < line.length; j++) {
        const L = Math.hypot(line[j][0] - line[j - 1][0], line[j][1] - line[j - 1][1]);
        if (acum + L >= forkStartM) { const t = (forkStartM - acum) / L; inicio = [line[j - 1][0] + (line[j][0] - line[j - 1][0]) * t, line[j - 1][1] + (line[j][1] - line[j - 1][1]) * t]; break; }
        acum += L;
      }
      if (Math.hypot(inicio[0] - pts[k][0], inicio[1] - pts[k][1]) < 5) continue;
      const rutaIni = bearingBetween(pts[k], pointAt(cum[k] + forkStartM));
      if (Math.abs(normDeg(bearingBetween(pts[k], inicio) - rutaIni)) >= forkStartMaxDeg) continue;
      // Ni una que vuelve para atras: donde termina una autovia, la calzada
      // contraria sale pareja con la ruta del prefab donde se juntan y a los
      // 150 m ya va por donde se vino. Se anunciaba "keep right" donde la
      // calle solo sigue (US-12 al este de Aberdeen, ATS, -105601,-61480).
      if (Math.abs(normDeg(bearingBetween(pts[k], walkStraight(idx, n, uTurnWalkM)) - inBearing)) > uTurnDeg) continue;
      const lejos = altDeltas()[altExits().indexOf(altExits().find(e => e[0] === k && e[1] === idx && e[2] === n))];
      const rutaLejos = normDeg(bearingBetween(pts[k], pointAt(cum[k] + legM)) - inBearing);
      return { kind: 'fork', direction: rutaLejos > lejos ? 'right' : 'left', delta, at: k, inBearing, outBearing, inCurve: true };
    }
    return null;
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
      if (quiet && entersRing()) quiet = false;
      // Tampoco la esquina en escuadra de una cruz con dos brazos muertos (el
      // prefab tiene cuatro brazos y dos sin calle): la calle se termina ahi y
      // hay que doblar. Decia "Continue straight" donde termina la calle del
      // puente de la salida 115 de Rockford (ATS, 28824,-18008, Discord 18-10,
      // Gargamosch). Con un brazo muerto, o con la calle curvandose antes o
      // despues (sierras, horquillas, zigzags), sigue callado: asi decia "turn"
      // en curvas sin otro camino (Discord 17-10, Oregon; check_avisos).
      if (quiet && alt == null && esquinaEnEscuadra()) {
        altExits();
        if (new Set(deads.map(([, , n]) => n)).size >= 2) quiet = false;
      }
      // Salvo que la otra salida arranque pareja con la ruta: es una
      // bifurcacion en una curva (el rulo de un trebol que se abre en dos
      // rampas, Burgos y Kotka en las simulaciones del 15-10), no una calle
      // lateral. Lejos se va para el otro lado, pero hay que elegir rama.
      if (quiet && alt != null) {
        const f = forkInCurve();
        if (f) return f;
      }
    }
    // Dentro del grupo, el giro se atribuye al nodo donde mas cambia el
    // rumbo entre cuerdas consecutivas - no al primero del grupo, que en una
    // avenida con nodos cada 20 m puede quedar 80 m antes de la esquina.
    // Con el prefab entero (ctx.firstRunAt, ver junctionManeuver), en el
    // primer tramo de nodos de cruce seguidos: la entrada al prefab, de donde
    // sale la otra calle. Entre todos ganaba la salida y el aviso llegaba de
    // 20 a 50 m tarde (check_avisos, 17-10).
    let r1 = iEnd;
    if (ctx.firstRunAt) for (r1 = i; r1 < iEnd && pts[r1 + 1][3] === 1; r1++);
    let at = i, bestLocal = -1;
    for (let k = i; k <= r1; k++) {
      if (k < 1 || k + 1 >= pts.length) continue;
      const local = Math.abs(normDeg(bearingBetween(pts[k], pts[k + 1]) - bearingBetween(pts[k - 1], pts[k])));
      if (local > bestLocal) { bestLocal = local; at = k; }
    }
    return { kind: 'turn', direction: delta > 0 ? 'right' : 'left', delta, at, inBearing, outBearing, quiet };
  }

  if (!adjacency || !nodes) return null;
  // Bifurcacion abierta: la autopista se parte en dos calzadas paralelas que
  // recien se separan de verdad cientos de metros despues. A forkLegM la
  // ruta y la otra salida todavia van casi juntas y no se anunciaba nada; al
  // pasar el salto entre calzadas, encima del punto, salia un "keep left"
  // tarde (Discord, 11-10, Lightningroc771: "didn't call out ... stay
  // whichever direction"; I-25 al sur de Denver). Se mira a forkFarLegM,
  // siguiendo la otra salida por su continuacion mas recta, y solo si la ruta
  // no pasa por otro cruce en ese tramo: si no, el desvio lejano es de un
  // giro que viene despues.
  const farFork = () => {
    if (cum[cum.length - 1] - cum[iEnd] < forkFarLegM) return null;
    for (let k = iEnd + 1; k < pts.length && cum[k] - cum[iEnd] <= forkFarLegM; k++) if (pts[k][3] === 1) return null;
    const rd = normDeg(bearingBetween(pts[i], pointAt(cum[iEnd] + forkFarLegM)) - inBearing);
    const lenM = forkFarLegM + cum[iEnd] - cum[i];
    // Una rama que a forkLegM ya se separo forkMinSep hacia un lado y lejos
    // queda del otro cruzo la ruta por un puente: la rampa a la I-70 sale a
    // la derecha de la US-63 y pasa al este, y como la autopista dobla a la
    // derecha, a 500 m se anunciaba "keep right" yendo derecho (Discord,
    // 16-10, al NE de Columbia). El lado de una bifurcacion es donde las
    // ramas se separan; esa rama no cuenta.
    const near = sampleAt(forkLegM);
    let alt = null;
    altExits().forEach(([k, idx, n], e) => {
      const a = normDeg(bearingBetween(pts[i], walkStraight(idx, n, lenM - (cum[k] - cum[i]))) - inBearing);
      const nearSep = normDeg(near - altDeltas()[e]);
      if (Math.abs(nearSep) >= forkMinSep && Math.sign(nearSep) !== Math.sign(normDeg(rd - a))) return;
      if (Math.abs(a) <= 100 && (alt == null || Math.abs(a) < Math.abs(alt))) alt = a;
    });
    if (alt == null || Math.abs(normDeg(rd - alt)) < forkFarMinSep) return null;
    // Que la otra salida se abra mas que la ruta quiere decir, como a
    // forkLegM, que pasamos de largo una salida; salvo que la ruta tambien
    // doble de verdad hacia el otro lado: una Y donde las dos se van.
    if (Math.abs(alt) > Math.abs(rd) + forkAltSlack
      && (Math.sign(alt) === Math.sign(rd) || Math.abs(rd) < forkFarMinRoute)) return null;
    return { kind: 'fork', direction: rd > alt ? 'right' : 'left', delta: rd, at: i, far: true };
  };
  // Bifurcacion pareja: el conector se parte en dos calzadas de un sentido
  // casi paralelas (la colectora al lado de la autopista) y la ruta toma la
  // que se abre. Por angulo no llega a forkMinDev ni a forkMinSep, y farFork
  // no mira si la ruta tiene otro cruce enseguida (la colectora se vuelve a
  // partir). No se decia nada, el aviso siguiente era "keep left" y el camion
  // seguia por la autopista (Discord, 17-10, Gargamosch: del I-29 al I-80
  // en Council Bluffs, 2775,-12693). Se mide a parallelForkM por la ruta y
  // por la otra salida: si ya van a parallelForkSepM y la otra es la mas
  // recta, se avisa hacia el lado de la ruta. Si la ruta es la mas recta
  // (seguir por la autopista cuando sale una rampa), nada. Con los carriles
  // del juego (ctx.laneTurn), manda la flecha de la rama de la ruta: solo si
  // va a un costado y no derecho. Sin flecha en la ruta y con flecha en la
  // otra, la otra es una salida y la ruta sigue: nada (una autopista que
  // dobla al lado de una rampa recta daba "keep left" en el I-15 de Helena).
  // Si las flechas dicen que la otra sigue derecho y la ruta se abre a un
  // costado, mandan aunque por angulo la ruta sea la mas recta: viniendo en
  // curva, las dos calzadas del I-35 norte en San Antonio salen a +3,5 y
  // -3,9 grados, la ruta por los dos carriles de la derecha y con flecha a la
  // derecha, y a los 400 m se cruzan por un puente. No se decia nada y el
  // camion siguio por la otra (turn report del 25-10, -13248,54085). Salvo
  // que la ruta se lleve mas carriles que la otra (ctx.laneMask): ahi la
  // ruta es la autopista y la otra un carril que sale, como antes.
  const parallelForkM = ctx.parallelForkM != null ? ctx.parallelForkM : 100;
  const parallelForkSepM = ctx.parallelForkSepM != null ? ctx.parallelForkSepM : 10;
  const parallelFork = () => {
    const B = LANE_ARROW_BITS;
    const carriles = (mask) => { let c = 0; for (let x = mask; x; x >>= 1) c += x & 1; return c; };
    // De que lado quedan los carriles que van solo por la ruta contra los que
    // van solo por la otra (bit 0, el de la izquierda), o null si se mezclan.
    // Es el lado de verdad: la flecha sale del rumbo en las puntas del prefab
    // y en una salida a la derecha puede ser "slight left" (ETS2, 1785,-21153).
    const ladoDeCarriles = (mr, ma) => {
      const r = mr & ~ma, a = ma & ~mr;
      if (!r || !a) return null;
      const bajo = (m) => 31 - Math.clz32(m & -m), alto = (m) => 31 - Math.clz32(m);
      return bajo(r) > alto(a) ? 'right' : alto(r) < bajo(a) ? 'left' : null;
    };
    const ruta = pointAt(cum[i] + parallelForkM);
    const rutaDelta = normDeg(bearingBetween(pts[i], ruta) - inBearing);
    for (const [k, idx, n] of altExits()) {
      const otra = walkPointAt(idx, n, parallelForkM - (cum[k] - cum[i]));
      if (!otra) continue;
      const otraDelta = normDeg(bearingBetween(pts[i], otra) - inBearing);
      if (Math.hypot(otra[0] - ruta[0], otra[1] - ruta[1]) < parallelForkSepM) continue;
      let direction = rutaDelta > otraDelta ? 'right' : 'left';
      let sig = null;
      for (let j = k + 1; j < pts.length && sig == null; j++) sig = pts[j][4];
      const tr = ctx.laneTurn && sig != null ? ctx.laneTurn(idx, sig) : null;
      const ta = ctx.laneTurn ? ctx.laneTurn(idx, n) : null;
      const mr = ctx.laneMask && sig != null ? ctx.laneMask(idx, sig) : null;
      const ma = ctx.laneMask ? ctx.laneMask(idx, n) : null;
      const mascaras = mr != null && ma != null;
      const lado = mascaras ? ladoDeCarriles(mr, ma) : null;
      const porCarriles = tr != null && ta != null && (ta & B.straight) && !(tr & B.straight)
        && !(mascaras && (!lado || carriles(mr) > carriles(ma)));
      if (!porCarriles && Math.abs(otraDelta) >= Math.abs(rutaDelta)) continue;
      if (tr != null || ta != null) {
        if (tr == null || (tr & B.straight) || !(tr & (B.left | B.slightLeft | B.right | B.slightRight))) continue;
        direction = porCarriles && lado ? lado : tr & (B.right | B.slightRight) ? 'right' : 'left';
      }
      return { kind: 'fork', direction, delta: rutaDelta, at: i, parallel: true };
    }
    return null;
  };
  const sampleAt = (d) => normDeg(bearingBetween(pts[i], pointAt(cum[iEnd] + d)) - inBearing);
  let routeDelta = normDeg(bearingBetween(pts[i], pointAt(cum[iEnd] + forkLegM)) - inBearing);
  if (Math.abs(routeDelta) < forkMinDev) return parallelFork() || farFork();
  const bestAlt = straightestAlt(100); // mas de 100: vuelve para atras, no es una continuacion
  if (bestAlt == null) return null;
  // El lado lo da donde la ruta se separa de la otra salida, no solo el punto
  // de forkLegM: una salida corta a la derecha que enseguida dobla a la
  // izquierda (un trebol, o cruzar la autopista hacia un area de descanso)
  // deja ese punto a la izquierda de la autopista, y se anunciaba "turn
  // left" antes de la salida (Discord, Gargamosch, 10-10). Si a legM la ruta
  // ya se separo forkMinSep de la otra salida hacia un lado y a forkLegM
  // queda del otro, vale el lado de legM con su mayor separacion, y ya no es
  // el carril de giro con isleta: el giro lo anuncia el cruce siguiente. Se
  // mide contra la otra salida y no contra el rumbo propio: si las dos se
  // abren a la derecha, la menos abierta es la de la izquierda. La entrada a
  // una rotonda queda como estaba (se entra a la derecha para doblar a la
  // izquierda, y lo que sirve es hacia donde se sale).
  let laterTurn = false;
  const nearSep = normDeg(sampleAt(legM) - bestAlt);
  if (Math.abs(nearSep) >= forkMinSep && Math.sign(nearSep) !== Math.sign(normDeg(routeDelta - bestAlt)) && !entersRing()) {
    laterTurn = true;
    routeDelta = [legM, (legM + forkLegM) / 2].map(sampleAt)
      .filter(s => Math.sign(normDeg(s - bestAlt)) === Math.sign(nearSep))
      .reduce((a, s) => (Math.abs(normDeg(s - bestAlt)) > Math.abs(normDeg(a - bestAlt)) ? s : a));
  }
  if (Math.abs(normDeg(routeDelta - bestAlt)) < forkMinSep) return laterTurn ? null : (parallelFork() || farFork());
  if (Math.abs(bestAlt) > Math.abs(routeDelta) + forkAltSlack) return laterTurn ? null : farFork();
  const direction = routeDelta > bestAlt ? 'right' : 'left';
  // Carril de giro con isleta (la esquina de una ciudad de EE.UU.): se separa
  // poco en los primeros legM metros, pero a forkLegM ya dobla de verdad y la
  // otra salida sigue derecho. El GPS del juego dice "turn right" y nosotros
  // "keep right" (resena de Roane Gaming en YouTube, 10-10). Una salida de
  // autopista se separa de a poco (pocos grados a legM) y sigue siendo keep.
  if (!laterTurn && Math.abs(delta) >= forkTurnMinDeg && Math.abs(routeDelta) >= forkTurnDeg && Math.abs(bestAlt) <= forkTurnAltMaxDeg) {
    return { kind: 'turn', direction, delta: routeDelta, at: i, inBearing, outBearing: (inBearing + routeDelta + 360) % 360, quiet: false };
  }
  // Con los carriles del juego (ctx.laneTurn), contra la otra salida que sale
  // a un costado (sin flecha derecho). Si la rama de la ruta no tiene flechas
  // (sirven todos los carriles), es seguir por la calle al lado de una salida
  // y no se avisa, como en parallelFork: la autopista que dobla 8 a 10 grados
  // en una salida comun daba "keep left" (I-90 al este de Missoula y de
  // Spokane, ATS, -68763,-52020 y -74949,-56623, turn report del 23-10), y en
  // check_avisos 7 mas en salidas y en cruces que la ruta pasa derecho (en
  // 400 rutas del simulador, 28 avisos menos en ATS y 7 en ETS2).
  // Si la rama de la ruta sigue derecho pero no todos los carriles la sirven,
  // se avisa como antes (la rampa de New Orleans que se parte con el carril
  // de la izquierda a otro lado), pero sin nombre (through, como el "keep"
  // por carriles): los carteles de la ruta anuncian las salidas que vienen, y
  // en la I-90 decia "Keep left onto US-395" 1 km antes de la salida a la
  // US-395, que es a la derecha (-79816,-58949).
  let through = false;
  if (ctx.laneTurn && !laterTurn) {
    const e = altDeltas().indexOf(bestAlt);
    const [k, idx, n] = altExits()[e];
    let sig = null;
    for (let j = k + 1; j < pts.length && sig == null; j++) sig = pts[j][4];
    const tr = sig != null ? ctx.laneTurn(idx, sig) : null;
    const ta = ctx.laneTurn(idx, n);
    if (ta != null && !(ta & LANE_ARROW_BITS.straight)) {
      if (tr == null) return null;
      through = !!(tr & LANE_ARROW_BITS.straight);
    }
  }
  const fork = { kind: 'fork', direction, delta: routeDelta, at: i };
  if (through) fork.through = true;
  return fork;
}

// La maniobra del cruce que empieza en el nodo ctx.i, con ctx.iEnd el grupo
// de nodos de cruce seguidos (junctionClusterEnd). Si ahi y en los grupos
// que siguen dentro del mismo prefab no hay nada que avisar, o todo se calla,
// se mira el prefab entero, de punta a punta de su curva (curveSpanM): partida
// en dos por los puntos de la curva, una T se callaba entera. La entrada
// doblaba poco y la salida no tenia otra calle, que salia de la entrada
// (Discord, 17-10: de Oregon a Louisiana; la T de (-53869,9028) en ATS).
// Solo cambia algo si asi sale un giro que no se calla: juntar siempre
// mezclaba el giro de un cruce con la curva de la calle de despues. Un
// grupo de adentro que avisa solo queda como estaba, salvo que se lo trague
// la curva callada de antes (continuesTurn, como en findUpcomingTurn): el
// ovalo alrededor de una autovia de Estocolmo (ETS2, 24238,-47524).
// gapM, spanM y skip: los de junctionClusterEnd. Devuelve { iEnd, m }.
function junctionManeuver(ctx, gapM, spanM, skip, curveSpanM = 60) {
  const { pts, cum, i } = ctx;
  const legM = ctx.legM != null ? ctx.legM : 60;
  const turnThreshold = ctx.turnThreshold != null ? ctx.turnThreshold : 35;
  const m = detectManeuver(ctx);
  if (m && !m.quiet) return { iEnd: ctx.iEnd, m };
  const iEnd = junctionClusterEnd(pts, cum, i, gapM, spanM, skip, curveSpanM);
  if (iEnd <= ctx.iEnd) return mismaCruz(ctx, { iEnd: ctx.iEnd, m }, gapM, spanM, skip);
  const comoPrev = (x, end) => (x && x.kind === 'turn' ? { direction: x.direction, inBearing: x.inBearing, outBearing: x.outBearing, quiet: x.quiet, end } : null);
  let prev = comoPrev(m, cum[ctx.iEnd]);
  for (let j = ctx.iEnd + 1; j <= iEnd; j++) {
    if (pts[j][3] !== 1) continue;
    const jEnd = junctionClusterEnd(pts, cum, j, gapM, spanM, skip);
    const mj = detectManeuver({ ...ctx, i: j, iEnd: jEnd });
    if (continuesTurn(prev, mj, cum[j], legM + 20, 135, turnThreshold)) {
      prev.end = cum[jEnd];
      prev.outBearing = mj.outBearing;
    } else {
      if (mj && !mj.quiet) return { iEnd: ctx.iEnd, m };
      prev = comoPrev(mj, cum[jEnd]);
    }
    j = jEnd;
  }
  const todo = detectManeuver({ ...ctx, iEnd, firstRunAt: true });
  const r = todo && todo.kind === 'turn' && !todo.quiet ? { iEnd, m: todo } : { iEnd: ctx.iEnd, m };
  return mismaCruz(ctx, r, gapM, spanM, skip);
}

// Un cruce cuyo grupo de nodos arranca en otro prefab pegado: de punta a
// punta pasa de curveSpanM, junctionClusterEnd corta entre el nodo por el que
// se entra y el que se sale, y cada mitad dobla poco y se calla. La esquina
// de una cruz con dos brazos muertos despues de un rombo decia "Continue
// straight" donde termina la calle (Davenport -> Quincy, ATS, 22846,-9173: el
// rombo, 43 m, la cruz y 51 m de curva hasta la salida), y la segunda vuelta
// de una S, una cruz a 38 m de la T de antes, no se decia (Wenatchee ->
// Everett, -98451,-65259; asi tambien Yakima -> Portland, una T a 30 m de una
// cruz). Si la mitad que sigue, a menos de mismaCruzM, se calla (y dobla para
// el mismo lado que la primera, si esta dobla) y los dos nodos comparten un
// vecino (los otros brazos se unen a los dos: es el mismo prefab), se mide
// junto, con el aviso en el nodo de entrada. Si la primera mitad no dobla, el
// giro se mide desde ese nodo: con la curva de la T de antes en los legM de
// entrada, la cruz doblaba poco. Sin el vecino comun no: dos prefabs unidos
// por una calle (la T a 59 m de una esquina en Tulsa -> Ardmore, el cruce
// chico a 64 m de la esquina en Topeka) ponian el giro en el cruce
// equivocado. En 900 rutas por juego: ATS +55 avisos en 12 lugares (esquinas
// de cruz y de T, la segunda vuelta de una S; un "keep left" a una rampa pasa
// a "turn left"), ETS2 +50 en 14 (3 son rotondas compactas que salen como
// giro); ninguno de antes se pierde ni se mueve.
// Tambien si ninguna mitad dobla (cada una menos que el umbral) y juntas si:
// la cruz de Idaho Falls (ATS, -63981,-32641, Discord 21-10) mide 73 m en
// diagonal de la entrada a la salida, dobla 61 grados a la izquierda en dos
// mitades de 21 y 26, y el brazo de enfrente, cortado con barreras, se media
// por adentro del prefab hacia el brazo norte: "Continue straight". En 900
// rutas de ATS y de ETS2 y 600 de Coast to Coast y de ProMods, 11 lugares
// mas (T e Y anchas donde hay que elegir, otra cruz con el brazo de enfrente
// muerto en Sandpoint, la esquina de una con dos en Missoula); ninguno de
// antes se pierde ni se mueve.
// r: { iEnd, m } de junctionManeuver.
function mismaCruz(ctx, r, gapM, spanM, skip, mismaCruzM = 80, contraMaxDeg = 20) {
  const { pts, cum, adjacency } = ctx;
  if (!adjacency || (r.m && (r.m.kind !== 'turn' || !r.m.quiet))) return r;
  let j = r.iEnd + 1;
  for (; j < pts.length - 1 && pts[j][3] !== 1; j++) if (pts[j][4] != null) return r; // un nodo de calle en el medio
  if (j >= pts.length - 1 || cum[j] - cum[r.iEnd] > mismaCruzM) return r;
  const a = pts[r.iEnd][4], b = pts[j][4];
  if (a == null || b == null) return r;
  const vecinos = (n) => {
    const s = new Set((adjacency.get(n) || []).map(([x]) => x));
    if (ctx.incoming) for (const x of (ctx.incoming(n) || [])) s.add(x); // los que llegan (incoming del grafo)
    return s;
  };
  const va = vecinos(a), vb = vecinos(b);
  if (![...va].some(x => x !== b && vb.has(x))) return r;
  const jEnd = junctionClusterEnd(pts, cum, j, gapM, spanM, skip);
  const mj = detectManeuver({ ...ctx, i: j, iEnd: jEnd });
  if (mj ? mj.kind !== 'turn' || !mj.quiet || (r.m && mj.direction !== r.m.direction) : r.m) return r;
  // El giro, en el ultimo nodo de la primera mitad (donde empieza la esquina).
  // Por el nodo de mas giro, con el camion adentro del cruce (o encima de un
  // nodo) el aviso saltaba de un nodo a otro y volvia.
  const juntos = detectManeuver({ ...ctx, i: r.m ? ctx.i : r.iEnd, iEnd: jEnd });
  if (!juntos || juntos.kind !== 'turn' || juntos.quiet || (mj && juntos.direction !== mj.direction)) return r;
  // Y la curva de una mitad a la otra dobla para un solo lado: en una rotonda
  // chica que el grafo no reconoce se entra a la derecha, se rodea la isla a
  // la izquierda y se sale, y a la 2.a salida decia "turn right" (Oslo, ETS2,
  // 1888,-53484: 54 grados para el otro lado).
  const { bearingBetween } = ctx;
  let contra = 0;
  for (let k = r.iEnd + 1; k <= j; k++) {
    const t = normDeg(bearingBetween(pts[k], pts[k + 1]) - bearingBetween(pts[k - 1], pts[k]));
    if ((juntos.direction === 'right') !== (t > 0)) contra += Math.abs(t);
  }
  return contra > contraMaxDeg ? r : { iEnd: jEnd, m: { ...juntos, at: r.iEnd } };
}

// Si a menos de legM despues de una bifurcacion (el cruce que termina en
// iEnd) hay un cruce con un giro que se anuncia: lo que la bifurcacion midio
// a 250 m es ese giro y no una rampa, y se deja que el giro se anuncie solo
// (findUpcomingTurn; una esquina de 90 grados avisada como "keep left" 200 m
// antes confundia). Un giro callado no cuenta (junctionManeuver con quiet:
// la curva de la rampa sin otra calle), porque no se anuncia: la salida 50
// de la I-25 en Walsenburg (ATS, -38973,6043, Discord 18-10) se quedaba sin
// aviso, con la rampa doblando 37 grados a 170 m y terminando en una T sin
// otra salida. Sin grafo (ctx.adjacency) no se sabe y cuenta, como antes.
// Un giro para el otro lado que forkDirection, despues de una salida de una
// mano (el nodo se parte en dos tramos que no vuelven: autopista y rampa),
// tampoco: salir a la derecha y al final de la rampa doblar a la izquierda
// por el puente es la salida primero, y "turn left" desde la autopista no
// dice que hay que salir (salida 115 de Rockford, ATS, 28193,-17814, Discord
// 18-10: 196 m de rampa). La esquina que la bifurcacion confundia dobla para
// el mismo lado; en el prefab de una rotonda o de un cruce grande la
// bifurcacion es parte del giro (Gothenburg, ETS2: keep left y a 136 m turn right).
// Tampoco el giro que sigue a una curva callada y findUpcomingTurn junta con
// ella (continuesTurn, con ctx.legM y ctx.turnThreshold): la rampa a la US-395
// norte en Spokane (ATS, -80764,-58654, 23-10) dobla a la derecha sin otra
// calle y 20 m despues cruza derecho una cruz que, con la curva en los 60 m de
// entrada, "dobla" 43 grados. Esa cruz contaba, findUpcomingTurn no la decia
// por ser la misma curva, y la salida quedaba con "Continue straight".
// gapM, spanM, skip y curveSpanM: los de junctionManeuver.
function salidaDeUnaMano({ adjacency }, n) {
  const outs = adjacency && n != null ? (adjacency.get(n) || []) : [];
  return outs.length === 2 && outs.every(([m]) => !(adjacency.get(m) || []).some(([b]) => b === n));
}
function turnAfterFork(ctx, iEnd, legM = 250, gapM = 50, spanM = 100, skip, curveSpanM = 60, forkDirection = null) {
  const { pts, cum } = ctx;
  const turnLegM = ctx.legM != null ? ctx.legM : 60;
  const turnThreshold = ctx.turnThreshold != null ? ctx.turnThreshold : 35;
  let callada = null; // la ultima curva callada, como prevTurn en findUpcomingTurn
  for (let j = iEnd + 1; j < pts.length - 1 && cum[j] - cum[iEnd] <= legM; j++) {
    if (pts[j][3] !== 1) continue;
    const jEnd = junctionClusterEnd(pts, cum, j, gapM, spanM);
    const mj = detectManeuver({ ...ctx, i: j, iEnd: jEnd, adjacency: null });
    if (mj && mj.kind === 'turn') {
      const conCalles = ctx.adjacency ? junctionManeuver({ ...ctx, i: j, iEnd: jEnd }, gapM, spanM, skip, curveSpanM).m : null;
      if (continuesTurn(callada, conCalles, cum[j], turnLegM + 20, 135, turnThreshold)) {
        callada.end = cum[jEnd];
        callada.outBearing = conCalles.outBearing;
        j = jEnd;
        continue;
      }
      if (!conCalles || conCalles.kind !== 'turn' || !conCalles.quiet) {
        const giro = conCalles && conCalles.kind === 'turn' ? conCalles : mj;
        return !forkDirection || giro.direction === forkDirection || !salidaDeUnaMano(ctx, pts[iEnd][4]);
      }
      callada = { direction: conCalles.direction, inBearing: conCalles.inBearing, outBearing: conCalles.outBearing, quiet: true, end: cum[jEnd] };
    } else {
      callada = null;
    }
    j = jEnd;
  }
  return false;
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
// Si un giro ya quedo atras (findUpcomingTurn). La posicion sola no alcanza:
// parado en la linea de una T, el camion queda sobre el primer nodo del cruce
// (o apenas pasado) y el giro se daba por hecho, con "Continue straight" y la
// esquina adelante (Discord, Gargamosch, 18-10). En 105 giros de ATS, parado
// 3 m pasado el nodo: 0 bien antes. Hasta pasar marginM del ultimo nodo
// decide el rumbo: ya dobla si se desvio de como se entra al cruce
// (entryBearing, los ultimos metros antes del nodo: el de 60 m atras, en una
// calle que llega curvandose, ya parecia la salida) al menos turnedDeg, o la
// mitad del giro si es mas chico, y hacia la salida. Con la mitad entera,
// en dos esquinas a 60 m la segunda aparecia recien a 20 m. Sin rumbos (una
// bifurcacion), solo la posicion: insideM pasado el nodo.
// atM, endM, hereM: metros sobre la ruta del primer nodo del cruce, del
// ultimo y del camion. heading, entryBearing, outBearing: rumbos geograficos.
function turnPassed({ atM, endM, hereM, heading, entryBearing, outBearing, marginM = 15, insideM = 20, turnedDeg = 25 }) {
  if (!(hereM > atM)) return false;
  if (hereM > Math.max(endM, atM) + marginM) return true;
  if (![heading, entryBearing, outBearing].every(Number.isFinite)) return hereM - atM >= insideM;
  const total = Math.abs(normDeg(outBearing - entryBearing));
  const haciaLaSalida = Math.abs(normDeg(heading - outBearing)) < total;
  return haciaLaSalida && Math.abs(normDeg(heading - entryBearing)) >= Math.min(turnedDeg, total / 2);
}

function continuesTurn(prev, m, startM, gapMaxM = 80, maxDeg = 135, quietAddDeg = 35) {
  if (!prev || !m || m.kind !== 'turn' || m.direction !== prev.direction) return false;
  if (startM - prev.end > gapMaxM) return false;
  if (prev.quiet) return Math.abs(normDeg(m.outBearing - prev.outBearing)) < quietAddDeg;
  return Math.abs(normDeg(m.outBearing - prev.inBearing)) < maxDeg;
}

// Si el cruce de nodos i..iEnd tiene otra calle hacia `direction` (una
// salida que no es la ruta, lleva a algun lado y dobla entre minDeg y maxDeg
// contra el rumbo de llegada). Es la calle anterior al giro anunciado: con
// dos a la derecha seguidas, "turn right" dicho antes de la primera hacia
// doblar en la equivocada (Discord, 11-10). La voz espera a pasarla.
// ctx: lo de detectManeuver (pts, cum, pointAt, bearingBetween, adjacency y
// nodes o nodeXY).
function sideExitToward(ctx, direction, minDeg = 25, maxDeg = 155) {
  const { pts, i, cum, pointAt, bearingBetween, nodes, adjacency } = ctx;
  if (!adjacency || (!nodes && !ctx.nodeXY) || (direction !== 'left' && direction !== 'right')) return false;
  const nodeAt = ctx.nodeXY || ((k) => nodes[k]);
  const iEnd = ctx.iEnd != null ? ctx.iEnd : i;
  const legM = ctx.legM != null ? ctx.legM : 60;
  const rejoinM = ctx.rejoinM != null ? ctx.rejoinM : 100;
  const escapeM = ctx.escapeM != null ? ctx.escapeM : 120;
  const inBearing = bearingBetween(pointAt(cum[i] - legM), pts[i]);
  // Como en detectManeuver: lo que vuelve enseguida a la ruta no es otra calle.
  const ahead = new Set();
  for (let k = i - 1; k >= 0; k--) if (pts[k][4] != null) { ahead.add(pts[k][4]); break; }
  for (let k = i; k < pts.length && cum[k] - cum[iEnd] <= rejoinM; k++) if (pts[k][4] != null) ahead.add(pts[k][4]);
  const sign = direction === 'right' ? 1 : -1;
  for (let k = i; k <= iEnd; k++) {
    const idx = pts[k][4];
    if (idx == null) continue;
    for (const [n] of (adjacency.get(idx) || [])) {
      if (ahead.has(n) || !leadsAway(adjacency, nodeAt, idx, n, ahead, escapeM)) continue;
      // Un vecino pegado (dentro del prefab) no da el rumbo: un salto mas.
      let far = nodeAt(n);
      if (Math.hypot(far[0] - pts[k][0], far[1] - pts[k][1]) < legM / 2) {
        for (const [m] of (adjacency.get(n) || [])) {
          if (m === idx || ahead.has(m)) continue;
          far = nodeAt(m);
          break;
        }
      }
      const d = normDeg(bearingBetween(pts[k], far) - inBearing) * sign;
      if (d >= minDeg && d <= maxDeg) return true;
    }
  }
  return false;
}

// Las otras salidas del cruce de nodos i..iEnd (las que llevan a algun
// lado, como en sideExitToward), para roadSignForTurn: cada una seguida por
// su continuacion mas recta, por la curva de cada tramo si ctx.edgeLine la
// da, hasta maxM o hasta tocar un nodo de la ruta. Devuelve una funcion por
// salida, d -> [x, z]: su punto a d metros pasado el ultimo nodo del cruce,
// contados como en la ruta (lo que la ruta hace de su nodo hasta iEnd mas
// d), o null si la salida no llega. ctx: lo de detectManeuver.
function otherBranchesAt(ctx, maxM = 1300) {
  const { pts, i, cum, bearingBetween, nodes, adjacency } = ctx;
  if (!adjacency || (!nodes && !ctx.nodeXY)) return [];
  const nodeAt = ctx.nodeXY || ((k) => nodes[k]);
  const iEnd = ctx.iEnd != null ? ctx.iEnd : i;
  const rejoinM = ctx.rejoinM != null ? ctx.rejoinM : 100;
  const escapeM = ctx.escapeM != null ? ctx.escapeM : 120;
  const ahead = new Set();
  for (let k = i - 1; k >= 0; k--) if (pts[k][4] != null) { ahead.add(pts[k][4]); break; }
  for (let k = iEnd + 1; k < pts.length; k++) if (pts[k][4] != null) { ahead.add(pts[k][4]); break; }
  for (let k = i; k < pts.length && cum[k] - cum[iEnd] <= rejoinM; k++) if (pts[k][4] != null) ahead.add(pts[k][4]);
  // Los nodos de la ruta que una salida puede alcanzar en maxM: cada llamada
  // arma esto y la ruta entera tiene miles de puntos.
  const ruta = new Set();
  for (let k = 0; k < pts.length && cum[k] - cum[iEnd] <= 2 * maxM; k++) if (pts[k][4] != null) ruta.add(pts[k][4]);
  const tramo = (a, b) => (ctx.edgeLine && ctx.edgeLine(a, b)) || [nodeAt(a), nodeAt(b)];
  const out = [];
  for (let k = i; k <= iEnd; k++) {
    const idx = pts[k][4];
    if (idx == null) continue;
    const offset = cum[iEnd] - cum[k];
    for (const [n] of (adjacency.get(idx) || [])) {
      if (ahead.has(n) || !leadsAway(adjacency, nodeAt, idx, n, ahead, escapeM)) continue;
      const line = tramo(idx, n).slice();
      const seen = new Set([idx, n]);
      let prev = idx, cur = n, len = 0;
      for (let j = 1; j < line.length; j++) len += Math.hypot(line[j][0] - line[j - 1][0], line[j][1] - line[j - 1][1]);
      for (let pasos = 0; len < offset + maxM && pasos < 200 && !ruta.has(cur); pasos++) {
        const a = nodeAt(prev), b = nodeAt(cur), dir = bearingBetween(a, b);
        let best = null, bestDiff = Infinity;
        for (const [m] of (adjacency.get(cur) || [])) {
          if (seen.has(m)) continue;
          const diff = Math.abs(normDeg(bearingBetween(b, nodeAt(m)) - dir));
          if (diff < bestDiff) { bestDiff = diff; best = m; }
        }
        if (best == null) break;
        const t = tramo(cur, best);
        for (let j = 1; j < t.length; j++) { len += Math.hypot(t[j][0] - t[j - 1][0], t[j][1] - t[j - 1][1]); line.push(t[j]); }
        seen.add(best); prev = cur; cur = best;
      }
      // Hasta tocar la ruta: de ahi en mas los dos caminos son el mismo.
      out.push((d) => {
        let falta = offset + d;
        if (falta < 0) return null;
        for (let j = 1; j < line.length; j++) {
          const L = Math.hypot(line[j][0] - line[j - 1][0], line[j][1] - line[j - 1][1]);
          if (falta <= L) {
            const f = L > 0 ? falta / L : 0;
            return [line[j - 1][0] + (line[j][0] - line[j - 1][0]) * f, line[j - 1][1] + (line[j][1] - line[j - 1][1]) * f];
          }
          falta -= L;
        }
        return null;
      });
    }
  }
  return out;
}

// Si el carril que se va por la salida del cruce ctx.i entro poco antes por
// una rampa de entrada: el que la autopista suma en una entrada y suelta en
// la salida siguiente. El constructor no lo marca (LANE_DROP_BIT: no venia
// de antes del cruce anterior) y sin aviso de giro la web seguia derecho sin
// flechas, aunque 700 m antes la salida de al lado, igual pero con la
// autopista doblando 8 grados, daba "keep left" con las flechas (I-25 al
// norte de Raton, ATS, -38130,7643, Discord 18-10). El de desaceleracion, que se
// agrega en la calle antes de la salida, sigue sin aviso.
// Mira los nodos de cruce de la ruta hasta maxM antes de ctx.i: alguno donde
// llega otra calle (ctx.incoming: los nodos con un tramo hacia el) que viene
// de atras. Seguida para atras walkM metros por su continuacion mas recta,
// tiene que quedar detras del nodo en el sentido de la ruta: el retorno de
// un prefab donde empieza una autovia llega pegado y parejo a la ruta, pero
// desde la calzada contraria, que va para adelante. Un cruce de antes con
// otra salida corta la busqueda: el carril de la rampa se iba por ella.
// Sin ctx.incoming, false.
function laneFromOnRamp(ctx, maxM = 200, walkM = 100) {
  const { pts, cum, i, pointAt, adjacency, incoming } = ctx;
  if (!incoming || !adjacency) return false;
  const nodeAt = ctx.nodeXY || ((k) => ctx.nodes[k]);
  const nodoDe = (k, paso) => { for (let j = k + paso; j >= 0 && j < pts.length; j += paso) if (pts[j][4] != null) return pts[j][4]; return null; };
  for (let k = i - 1; k >= 0 && cum[i] - cum[k] <= maxM; k--) {
    const p = pts[k][4];
    if (pts[k][3] !== 1 || p == null) continue;
    // Sin el nodo de antes (recortado de lo recorrido) la calle por la que
    // llega la ruta parecia otra que se suma (Amsterdam -> Werlte, ETS2,
    // donde una calle de doble mano se abre en autovia).
    const antes = nodoDe(k, -1), despues = nodoDe(k, 1);
    if (antes == null) continue;
    // el sentido de la ruta en el nodo
    const a = pointAt(cum[k] - 30), b = pointAt(cum[k] + 30);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!L) continue;
    const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
    for (const x of incoming(p)) {
      if (x === antes || x === despues) continue;
      let prev = p, cur = x, largo = 0;
      const vistos = new Set([p, x]);
      for (let pasos = 0; pasos < 50; pasos++) {
        const q = nodeAt(prev), c = nodeAt(cur);
        largo += Math.hypot(c[0] - q[0], c[1] - q[1]);
        if (largo >= walkM) break;
        const dx = q[0] - c[0], dz = q[1] - c[1];
        let mejor = null, mejorCos = -Infinity;
        for (const y of incoming(cur)) {
          if (vistos.has(y)) continue;
          const r = nodeAt(y), ry = Math.hypot(c[0] - r[0], c[1] - r[1]);
          const cos = ry ? ((c[0] - r[0]) * dx + (c[1] - r[1]) * dz) / (ry * Math.hypot(dx, dz) || 1) : -1;
          if (cos > mejorCos) { mejorCos = cos; mejor = y; }
        }
        if (mejor == null) break;
        vistos.add(mejor); prev = cur; cur = mejor;
      }
      const o = nodeAt(p), f = nodeAt(cur);
      if ((f[0] - o[0]) * ux + (f[1] - o[1]) * uz <= -Math.min(largo, walkM) / 2) return true;
    }
    for (const [n] of (adjacency.get(p) || [])) if (n !== antes && n !== despues) return false;
  }
  return false;
}

// Las flechas de carril sin aviso: con "Continue straight" en el panel, las
// del proximo cruce donde no sirven todos los carriles ("always show the
// lane guidance when the gps detect that there is a fork/junction", Discord,
// 18-10, Ittikorn). Sin voz ni texto: el giro sigue siendo seguir derecho.
// Recorre los cruces de la ruta (grupos de junctionClusterEnd) que empiezan
// despues del camion (here) y a menos de maxM; recordAt(i, iEnd) da los
// carriles a mostrar o null (app.js: los de una salida de autopista, ver
// laneKeepSide). Del otro lado de un ferry/tren, nada. Devuelve
// { lanes, node, distanceMeters } del primero, o null.
function quietLanesAhead(pts, cum, here, maxM, recordAt, gapM = 50, spanM = 100) {
  for (let i = 1; i < pts.length - 1; i++) {
    if (cum[i] - cum[here] > maxM) break;
    if (i > here && pts[i][2] === 1) break;
    if (pts[i][3] !== 1) continue;
    const iEnd = junctionClusterEnd(pts, cum, i, gapM, spanM, here);
    if (cum[i] > cum[here]) {
      const lanes = recordAt(i, iEnd);
      if (lanes) return { lanes, node: [pts[i][0], pts[i][1]], distanceMeters: cum[i] - cum[here] };
    }
    i = iEnd;
  }
  return null;
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
  // Hacia el otro lado y en otro nodo es el giro siguiente, no el mismo
  // visto de otra forma: pasado un "turn left", la entrada a la empresa a la
  // derecha 38 m despues seguia diciendo "turn left" 5 a 7 s y la voz no la
  // anunciaba (22 lugares en 943 rutas simuladas, 15-10).
  const cerca = turn && state.shown ? Math.hypot(turn.node[0] - state.shown.node[0], turn.node[1] - state.shown.node[1]) : Infinity;
  if (cerca < 40 && (cerca < 1 || turn.direction === state.shown.direction)) {
    // Las flechas de carril tambien: pueden llegar despues (el archivo baja
    // detras del grafo) y no dependen de donde este el camion.
    state.shown = { ...state.shown, distanceMeters: turn.distanceMeters, decoyMeters: turn.decoyMeters,
      nearSign: turn.nearSign || state.shown.nearSign, lanes: turn.lanes || state.shown.lanes };
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

// Escudos de ruta en el mapa (I-80, US-63; Discord, 19-10): salen de los
// carteles del juego (road-names.json, kind 'road': en ATS, 16.807 en 160
// rutas). Uno por ruta y por celda de cellM x cellM, el cartel mas cerca del
// centro de los de esa ruta en la celda: se repiten en cada cruce y salida,
// y todos juntos tapaban el mapa. En ETS2 los carteles no traen el numero
// (kind 'city'): no sale ninguno. k: 'i' interestatal, 'us' las demas; n:
// el numero, que es lo que va adentro del escudo.
function roadShieldPoints(names, cellM) {
  if (!Array.isArray(names) || !(cellM > 0)) return [];
  const grupos = new Map();
  for (const n of names) {
    if (!n || n.kind !== 'road' || typeof n.label !== 'string' || !n.label || !Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
    const clave = `${n.label}|${Math.floor(n.x / cellM)}|${Math.floor(n.y / cellM)}`;
    let g = grupos.get(clave);
    if (!g) grupos.set(clave, (g = { label: n.label, pts: [] }));
    g.pts.push(n);
  }
  const out = [];
  for (const g of grupos.values()) {
    let sx = 0, sy = 0;
    for (const p of g.pts) { sx += p.x; sy += p.y; }
    const cx = sx / g.pts.length, cy = sy / g.pts.length;
    let mejor = g.pts[0], dMejor = Infinity;
    for (const p of g.pts) {
      const d = (p.x - cx) ** 2 + (p.y - cy) ** 2;
      if (d < dMejor) { dMejor = d; mejor = p; }
    }
    out.push({ x: mejor.x, y: mejor.y, label: g.label, k: /^I-/.test(g.label) ? 'i' : 'us', n: g.label.replace(/^(I|US)-/, '') });
  }
  return out;
}

// Un cartel con varios escudos (el portico "I-94 / I-90" de una bifurcacion,
// "US-89 / US-12" en un tramo compartido) viene en road-names.json como una
// entrada por escudo en el mismo punto, y nearestInGrid devolvia siempre la
// primera del archivo. Cada una lleva en `labels` los numeros de su punto,
// para que en roadSignForTurn voten todos. Modifica las entradas y devuelve
// la lista, sin las que no son un nombre: en el road-names.json de ETS2 hay
// 399 carteles de velocidad con la clave del juego ("traffic_rule.limit_40")
// y 4 con un texto sin traducir ("@@fp_de_diesel@@"), y en 300 rutas 18
// avisos decian "toward traffic_rule.limit_80" (Balcanes, Grecia).
const signLabelOk = (label) => typeof label === 'string' && !/^traffic_rule\.|^@@.*@@$/.test(label.trim());
function groupSignsByPoint(signs) {
  if (Array.isArray(signs) && !signs.every((s) => signLabelOk(s.label))) signs = signs.filter((s) => signLabelOk(s.label));
  const porPunto = new Map();
  for (const s of signs || []) {
    const k = `${s.x},${s.y}`;
    if (!porPunto.has(k)) porPunto.set(k, []);
    porPunto.get(k).push(s);
  }
  for (const todas of porPunto.values()) {
    const labels = [...new Set(todas.map((s) => s.label))];
    if (labels.length > 1) for (const s of todas) s.labels = labels;
  }
  return signs;
}

// Indice por grilla para "el punto mas cercano a menos de maxDist" ({x, y}).
// Los carteles de ruta son 17 mil en ATS y 54 mil en ETS2, y nearestRoadName
// los recorria todos en cada busqueda.
function buildPointGrid(points, cell = 500) {
  const cells = new Map();
  for (const p of points || []) {
    const k = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`;
    let a = cells.get(k);
    if (!a) cells.set(k, a = []);
    a.push(p);
  }
  return { cell, cells };
}
// ok(p), si viene: solo los puntos que cumplen (roadSignForTurn).
function nearestInGrid(grid, x, z, maxDist, ok = null) {
  if (!grid) return null;
  const { cell, cells } = grid;
  const r = Math.ceil(maxDist / cell), cx = Math.floor(x / cell), cz = Math.floor(z / cell);
  let best = null, bestD = maxDist;
  for (let i = cx - r; i <= cx + r; i++) {
    for (let j = cz - r; j <= cz + r; j++) {
      const a = cells.get(`${i},${j}`);
      if (!a) continue;
      for (const p of a) {
        const d = Math.hypot(p.x - x, p.y - z);
        if (d < bestD && (!ok || ok(p))) { bestD = d; best = p; }
      }
    }
  }
  return best;
}

// Nombre de la ruta a la que se gira ("onto US-189"). Antes era el cartel mas
// cercano (hasta 400 m) a un punto apenas pasado el giro, y en los enlaces
// ganaba un cartel de destino de otra ruta: la demo decia "Turn right onto
// I-80" al tomar la US-189 (auditoria del 12-10). Ahora votan varios puntos
// de la salida, cada uno con el cartel que tenga a menos de `radius` (los de
// la ruta estan al costado del camino); un voto por punto y, si empatan, gana
// la que aparecio primero. Con mas peso en los primeros puntos, un cartel
// de otra ruta en el cruce le ganaba a la ruta que se sigue 3 km (New
// Orleans -> Houma: US-51 por la US-61). Votaban solo los
// numeros de ruta (kind 'road', los de ATS): los de destino (kind 'city',
// todos los de ETS2) no dicen hacia donde miran, y a lo largo de la salida
// aparecen los de la otra mano, que nombran lo que queda atras ("toward
// FIRENZE" yendo a Venecia). Para esos, y sin ningun voto, el criterio de
// antes: el del cruce mismo (hasta el 21-10, abajo). pointAt(m): punto de
// la ruta a m metros del inicio.
// Con opts.onExit (exitSignTest), un cartel vota solo si es de la salida:
// el del cruce, o el que queda mas cerca de otra rama, nombra lo que sigue
// por alla. En la I-80 este de Salt Lake City (ATS, -67313,-16853) el cartel
// "I-80" del cruce, a 14 m del nodo, era el mas cercano a las muestras de 60
// y 150 m de la rampa a la I-84, empataba con los dos de la I-84 y por salir
// primero ganaba: "Keep right onto I-80" por la salida a la I-15 (Discord,
// 19-10). Si hubo carteles de ruta y ninguno voto, nada: el respaldo seria
// ese mismo cartel del cruce.
// Un cartel con varios escudos (groupSignsByPoint) vota por cada uno, y un
// empate lo gana el numero con mas carteles junto a la ruta que junto a las
// otras ramas del cruce (onExit.labelEvidence); si siguen iguales (un tramo
// compartido, US-89 / US-12), el que aparecio primero. El portico "I-94 /
// I-90" de la bifurcacion de la Kennedy en Chicago es de las dos ramas, y
// por ser el primero del archivo la I-94 nombraba la que sigue por la I-90
// (Discord, 20-10). Antes que eso, un empate entre carteles distintos lo
// gana la interestatal: en un tramo compartido cada escudo va en su cartel y
// en la I-72 al este de Jacksonville (I-72 / US-36 / US-67) empataban los
// tres y la evidencia daba "onto US-36" (Discord, 20-10). En 450 rutas de
// ATS cambian 8 nombres, todos de una US a la interestatal del mismo tramo.
// Cada muestra vota con el cartel mas cercano que es de la salida, no con el
// mas cercano a secas: si ese era del cruce, de la otra mano o de otra rama,
// la muestra no votaba aunque a 50 m hubiera uno bueno, y el aviso salia
// sin nombre (Lafayette -> DeRidder, ATS: el I-10 del puente tapaba los de
// la US-165). Un cartel vota una vez aunque lo encuentren dos muestras: el
// del cruce, a 100 m de las de 60 y 150 m, pesaba doble ("Turn right onto
// I-90 Bus" por la I-25 en Sheridan). En una bifurcacion, los de los
// primeros ROAD_SIGN_FORK_NEAR_M (onExit.cercaM) votan solo si no voto
// ninguno de mas adelante: ahi las dos ramas van pegadas y el cartel puede
// ser de la otra ("Keep right onto I-20" saliendo de la I-20 a la US-59 en
// Shreveport, como el "I-80" de Salt Lake City). Los de destino (kind
// 'city', ETS2) ahora votan igual, por cada ciudad del cartel: desde que no
// votan los de la otra mano, el "toward FIRENZE" de lo que queda atras ya no
// pasa; el respaldo seguia siendo el mas cercano a cualquier lado y en 300
// rutas de ETS2 una de cada cuatro ciudades nombradas quedaba atras
// ("toward TALLINN" saliendo de Tallinn a Kunda). El respaldo de destino
// tampoco es de la otra mano ni de otra rama (onExit.lado), pero puede
// estar antes del cruce: el cartel que lo anuncia. Medido en 450 rutas de
// ATS contra los escudos a la derecha de 0,2 a 3 km despues (sin los keep
// por carriles), de 448 avisos 266 -> 307 bien, 76 -> 66 mal y 100 -> 69
// sin nombre (44 mejores, 6 peores: anunciadores de la salida siguiente);
// en 300 de ETS2, de las ciudades nombradas que se ubican a mas de 1,5 km,
// 246 -> 306 adelante del rumbo de la ruta y 125 -> 53 atras, con 50
// avisos mas sin nombre. Con 150 m en vez de 200, 9 peores (los US-20 a
// 160-190 m de la bifurcacion de la I-35 en Fort Dodge).
const ROAD_SIGN_SAMPLES_M = [60, 150, 300, 500, 800, 1200];
const ROAD_SIGN_FORK_NEAR_M = 200;
// Un cartel por cada escudo de s, con su numero
const roadSignShields = (s) => (s.labels || [s.label]).map((label) => (label === s.label ? s : { ...s, label }));
const esInterestatal = (label) => /^I-\d+[A-Z]?$/.test(label);
// Los escudos de las rutas historicas ("US-66 Hist", tambien pintados en el
// asfalto) estan en las calles por donde pasaban, junto a los carteles de la
// ruta de hoy. Votan solo si no voto ninguna otra ruta, y uno solo no
// alcanza: en 450 rutas de ATS "Turn left onto US-66 Hist" en Kingman (la
// ruta sigue por la US-93), en Joplin (la US-400) y saliendo de Springfield
// a Peoria (la I-74). En Portland, de la I-205 a la I-84, "US-30 Hist" pasa
// a "I-84".
const esHistorica = (label) => / Hist$/.test(label);
const ROAD_SIGN_HIST_MIN = 2;
function sinHistoricas(votantes) {
  const otros = votantes.filter((s) => (s.labels || [s.label]).some((l) => !esHistorica(l)));
  if (!otros.length) return votantes.length >= ROAD_SIGN_HIST_MIN ? votantes : [];
  return otros.map((s) => {
    const labels = (s.labels || [s.label]).filter((l) => !esHistorica(l));
    return labels.length === (s.labels || [s.label]).length ? s : { ...s, label: labels[0], labels };
  });
}
function roadSignForTurn(pointAt, fromM, totalM, nearest, fallbackXY, opts = {}) {
  const radius = opts.radius ?? 200, fallbackRadius = opts.fallbackRadius ?? 400;
  const salida = opts.onExit || null;
  const votes = new Map(); // en orden de aparicion: un empate lo gana la primera
  let votantes = [];
  let ajenos = 0;
  ROAD_SIGN_SAMPLES_M.forEach((d) => {
    if (fromM + d > totalM) return;
    const p = pointAt(fromM + d);
    let s = p && nearest(p[0], p[1], radius);
    if (!s || (s.kind !== 'road' && !(s.kind === 'city' && salida))) return;
    if (salida && !salida(s)) {
      const tipo = s.kind, deLaSalida = (c) => c.kind === tipo && salida(c);
      s = nearest(p[0], p[1], radius, deLaSalida);
      if (!s || !deLaSalida(s)) { if (tipo === 'road') ajenos++; return; }
    }
    if (!votantes.some((o) => o.x === s.x && o.y === s.y)) votantes.push(s);
  });
  // Un escudo historico solo, descartado: sin respaldo (seria el mismo)
  const conHistoricas = votantes.length;
  votantes = sinHistoricas(votantes);
  if (conHistoricas && !votantes.length) ajenos++;
  const cercaM = salida && salida.cercaM;
  const lejanos = cercaM ? votantes.filter((s) => salida.desdeGiro(s) >= cercaM) : votantes;
  const usados = lejanos.length ? lejanos : votantes;
  for (const s of usados) {
    for (const c of roadSignShields(s)) {
      const v = votes.get(c.label);
      if (v) v.score++; else votes.set(c.label, { score: 1, sign: c });
    }
  }
  let best = null;
  for (const v of votes.values()) if (!best || v.score > best.score) best = v;
  let empate = best ? [...votes.values()].filter((v) => v.score === best.score) : [];
  // Empate de carteles distintos, cada uno de la salida: la ruta lleva todos
  // esos numeros (un tramo compartido) y gana la interestatal, como en el
  // cartel grande del juego. Si un mismo cartel trae dos de los empatados
  // (el portico de una bifurcacion), decide labelEvidence.
  const empatados = new Set(empate.map((v) => v.sign.label));
  const deUnCartel = usados.some((s) => (s.labels || [s.label]).filter((l) => empatados.has(l)).length > 1);
  if (!deUnCartel && empate.some((v) => esInterestatal(v.sign.label))) {
    empate = empate.filter((v) => esInterestatal(v.sign.label));
    best = empate[0];
  }
  if (empate.length > 1 && opts.onExit && opts.onExit.labelEvidence) {
    const puntaje = opts.onExit.labelEvidence(nearest);
    for (const v of empate) if ((puntaje.get(v.sign.label) || 0) > (puntaje.get(best.sign.label) || 0)) best = v;
    // Si la evidencia tambien empata y dos carteles o mas traen los dos
    // escudos, es el tramo compartido y no un portico: gana la interestatal
    // (I-435 / US-50 en Kansas City, I-82 / US-97 en Yakima, I-69 / US-59 en
    // Houston). No si entre los empatados esta su "Bus" (el cartel de un
    // enlace). En 450 rutas de ATS, 7 nombres de una US a la interestatal,
    // ninguno peor contra los escudos de despues. Con un cartel solo, no: era
    // el portico de la bifurcacion (Truckee, Cheyenne) o el de la US que se
    // toma (Fort Smith, Columbia).
    if (!esInterestatal(best.sign.label)) {
      const tope = puntaje.get(best.sign.label) || 0;
      const juntos = (l) => usados.filter((s) => { const ls = s.labels || [s.label]; return ls.includes(l) && ls.includes(best.sign.label); }).length;
      const tramo = empate.find((v) => esInterestatal(v.sign.label) && (puntaje.get(v.sign.label) || 0) === tope
        && juntos(v.sign.label) >= 2 && !empate.some((o) => o.sign.label.startsWith(v.sign.label + ' ')));
      if (tramo) best = tramo;
    }
  }
  if (best) return best.sign;
  if (ajenos || !fallbackXY) return null;
  const respaldoOk = salida && salida.lado ? (c) => c.kind !== 'city' || salida.lado(c) : null;
  const respaldo = nearest(fallbackXY[0], fallbackXY[1], fallbackRadius, respaldoOk);
  return respaldo && respaldoOk && !respaldoOk(respaldo) ? null : respaldo;
}

// Si un cartel es de la salida del cruce de nodos i..iEnd de la ruta: el
// punto de la ruta mas cerca de el (de backM antes del cruce a spanM
// despues, cada stepM) queda mas de pastM pasado el nodo del giro (at), y
// ninguna otra salida (others, de otherBranchesAt) le queda mas cerca que
// la ruta. Asi no cuentan los del cruce ni los de antes (el "I-80" a 14 m
// del nodo en Salt Lake City), ni el de la autopista que corre al lado de
// la rampa. Desde el giro y no desde iEnd: el grupo de un prefab mide hasta
// 60 m y el cartel de la calle nueva queda adentro (McCook -> Colby, ATS).
// Mirar solo la muestra que lo encontro tampoco: a 150 m, el cartel de la
// US-63 a 70 m de la salida ya quedaba mas cerca del cruce (Ottumwa ->
// Waterloo, ATS). Y a menos de maxDistM de la ruta: los carteles estan al
// costado del camino, y uno de la I-290 a 126 m, junto a la autopista de al
// lado, nombraba la rampa a la I-90 en Chicago. Devuelve sign -> boolean.
// Con bearingBetween, tampoco los de la otra mano: a mas de leftM a la
// izquierda de la ruta (ATS se maneja por la derecha; la mano izquierda de
// ETS2, abajo). En 100 rutas de ATS, los carteles que votaban quedaban a
// 6-18 m de un lado o del otro, casi ninguno entre -5 y 5, y mas de la mitad
// a la izquierda. Los de la autopista de enfrente anuncian sus salidas, que
// son la ruta que se cruza (I-49 y US-71 pasando el trebol de la I-44 en
// Joplin), y en el puente sobre la autopista recien dejada estan los de sus
// rampas para el otro lado: "Turn left onto I-90" al final de la salida
// (Discord, 20-10). En un tramo de un sentido la banquina izquierda tambien
// es de esta mano (hasta -15 m), pero en el cruce de la rampa con la calle
// los nodos del prefab son de un sentido aunque la calle sea de doble mano,
// y con -15 ahi volvia la autopista recien dejada.
// Desde que votan los de destino de ETS2, donde se maneja por la izquierda
// (el Reino Unido) la otra mano es la derecha: se ve en la corrida de la
// ruta dibujada (p[6], + a la derecha), negativa ahi y positiva en el
// continente y en ATS.
// cercaM: lo usa roadSignForTurn en las bifurcaciones (test.cercaM y
// test.desdeGiro, los metros pasado el giro de un cartel). test.lado: si un
// cartel no es de la otra mano ni de otra rama, este donde este (el respaldo
// de un cartel de destino puede ser el que anuncia el cruce, antes).
function exitSignTest({ pts, cum, pointAt, bearingBetween, i, at = i, iEnd = i, others = [] }, { pastM = 10, maxDistM = 80, spanM = 1400, stepM = 10, backM = 100, leftM = 5, cercaM = 0 } = {}) {
  const fin = Math.min(cum[cum.length - 1], cum[iEnd] + spanM);
  let der = 0, izq = 0;
  for (let k = i; k < pts.length && cum[k] <= fin; k++) {
    if (pts[k][6] > 0) der++; else if (pts[k][6] < 0) izq++;
  }
  const manoIzquierda = izq > der;
  const ruta = [];
  for (let m = Math.max(0, cum[i] - backM); m <= fin; m += stepM) ruta.push([m, pointAt(m)]);
  const ramas = others.map((rama) => {
    const out = [];
    for (let d = cum[i] - cum[iEnd]; d <= spanM; d += stepM) {
      const q = rama(d);
      if (!q) break;
      out.push(q);
    }
    return out;
  });
  // El punto de la linea mas cerca del cartel, y si el cartel queda a mas de
  // leftM del lado de la otra mano (el rumbo hacia el cartel contra el de la
  // linea ahi)
  const cercano = (linea, s) => {
    let mejor = Infinity, j = -1;
    for (let n = 0; n < linea.length; n++) {
      const d = Math.hypot(s.x - linea[n][0], s.y - linea[n][1]);
      if (d < mejor) { mejor = d; j = n; }
    }
    let otraMano = false;
    if (bearingBetween && j >= 0 && linea.length > 1) {
      const a = linea[Math.max(0, j - 1)], b = linea[Math.min(linea.length - 1, j + 1)];
      const lado = normDeg(bearingBetween(linea[j], [s.x, s.y]) - bearingBetween(a, b));
      const derecha = mejor * Math.sin(lado * Math.PI / 180);
      otraMano = manoIzquierda ? derecha > leftM : derecha < -leftM;
    }
    return { mejor, j, otraMano };
  };
  const lineaRuta = ruta.map((r) => r[1]);
  const deOtraRama = (s, mejor) => ramas.some((r) => r.some((q) => Math.hypot(s.x - q[0], s.y - q[1]) < mejor));
  const cache = new Map();
  const test = (s) => {
    const key = `${s.x},${s.y},${s.label}`;
    if (cache.has(key)) return cache.get(key);
    const { mejor, j, otraMano } = cercano(lineaRuta, s);
    const enM = j >= 0 ? ruta[j][0] : -Infinity;
    const ok = !otraMano && enM > cum[at] + pastM && mejor <= maxDistM && !deOtraRama(s, mejor);
    cache.set(key, ok);
    return ok;
  };
  test.cercaM = cercaM;
  test.desdeGiro = (s) => {
    const { j } = cercano(lineaRuta, s);
    return j >= 0 ? ruta[j][0] - cum[at] : -Infinity;
  };
  test.lado = (s) => {
    const { mejor, otraMano } = cercano(lineaRuta, s);
    return !otraMano && !deOtraRama(s, mejor);
  };
  // Para el desempate de roadSignForTurn: por cada numero, cuantos carteles
  // (de las dos manos) hay a menos de maxDistM de la ruta pasado el cruce
  // menos los que quedan mas cerca de otra rama. Se buscan con nearest cada
  // 5 * stepM sobre las dos lineas. Devuelve Map label -> puntaje.
  test.labelEvidence = (nearest) => {
    const vistos = new Map();
    const mirar = (q) => {
      const c = nearest(q[0], q[1], maxDistM);
      if (c && c.kind === 'road') vistos.set(`${c.x},${c.y}`, c);
    };
    for (let n = 0; n < ruta.length; n += 5) if (ruta[n][0] > cum[at]) mirar(lineaRuta[n]);
    for (const r of ramas) for (let n = 0; n < r.length; n += 5) mirar(r[n]);
    const puntaje = new Map();
    for (const c of vistos.values()) {
      const enRuta = cercano(lineaRuta, c);
      if (ruta[enRuta.j][0] <= cum[at]) continue; // de antes del cruce: de las dos
      const signo = ramas.some((r) => cercano(r, c).mejor < enRuta.mejor) ? -1 : 1;
      for (const e of roadSignShields(c)) puntaje.set(e.label, (puntaje.get(e.label) || 0) + signo);
    }
    return puntaje;
  };
  return test;
}

// Proxima ciudad sobre la ruta: la que la ruta pasa a menos de `radius` y
// cuyo punto mas cercano de la ruta esta adelante del camion (al menos
// `minAhead` metros); entre esas, la primera. Antes era "la primera ciudad a
// menos de radius de algun punto": la ruta empieza en el camion, asi que una
// ciudad que acababa de quedar atras (entre los 2 km, donde se la descartaba
// como la actual, y los 2,5) ganaba, y en la demo la proxima ciudad saltaba
// Salina -> Provo -> Salina (auditoria del 12-10). Coordenadas del juego.
// Y la ruta tiene que acercarse a ella approachM mas de lo que esta el
// camion: pasada Vancouver (WA) la ruta a Yakima se aleja serpenteando y
// cada vuelta que quedaba unos metros mas cerca, a 2,1 km del centro, la
// volvia a hacer proxima: Yakima > Vancouver > Yakima > Vancouver (ATS). Lo
// mismo saliendo de una ciudad por la circunvalacion (Sevilla, Burdeos en
// ETS2). En 150 rutas por juego, manejando de a 200 m, las idas y vueltas
// A > B > A pasan de 52 a 15 en ATS y de 136 a 67 en ETS2, y la ciudad
// recien dejada como proxima, de 168 a 46 y de 426 a 101; ninguna ciudad
// por la que la ruta pasa a menos de 1 km deja de salir antes (con 300 m,
// 24 y 95 idas y vueltas).
function nextCityAlongRoute(points, cities, truck, opts = {}) {
  const radius = opts.radius ?? 2500, minAhead = opts.minAhead ?? 300, approachM = opts.approachM ?? 1000;
  const currentCity = opts.currentCityRadius ?? 2000, maxSamples = opts.maxSamples ?? 400;
  if (!points || points.length < 2 || !cities || !cities.length) return null;
  const step = Math.max(1, Math.floor(points.length / maxSamples));
  const sx = [], sy = [], along = [];
  let acc = 0;
  for (let i = 0; i < points.length; i++) {
    if (i) acc += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    if (i % step === 0 || i === points.length - 1) { sx.push(points[i][0]); sy.push(points[i][1]); along.push(acc); }
  }
  // Donde esta el camion sobre la ruta (por si la lista trae algo de atras)
  let truckAlong = 0;
  if (truck) {
    let d = Infinity;
    for (let k = 0; k < sx.length; k++) {
      const e = Math.hypot(sx[k] - truck[0], sy[k] - truck[1]);
      if (e < d) { d = e; truckAlong = along[k]; }
    }
  }
  let best = null, bestAlong = Infinity;
  for (const c of cities) {
    if (truck && Math.hypot(c.X - truck[0], c.Y - truck[1]) < currentCity) continue; // la que se atraviesa
    let dMin = Infinity, aMin = 0;
    for (let k = 0; k < sx.length; k++) {
      const e = Math.hypot(sx[k] - c.X, sy[k] - c.Y);
      if (e < dMin) { dMin = e; aMin = along[k]; }
    }
    const ahead = aMin - truckAlong;
    if (truck && Math.hypot(c.X - truck[0], c.Y - truck[1]) - dMin < approachM) continue; // ya se paso (o se pasa al costado)
    if (dMin < radius && ahead >= minAhead && ahead < bestAlong) { bestAlong = ahead; best = c.Name; }
  }
  return best;
}

// Numeros con el idioma de la interfaz y no el del sistema: con la app en
// ingles y Windows en castellano salia "$61.158" al lado de "184,225 km"
// (auditoria del 12-10). Ingles es el idioma por defecto, asi que le pasaba a
// casi todo el que no es angloparlante.
function formatInt(n, lang) {
  return Math.round(Number(n) || 0).toLocaleString(lang || 'en');
}
// Peso de la carga: toneladas, o libras con millas (como lo muestra ATS).
// Antes era "18.2 TN" fijo: TN no es el simbolo de tonelada y no cambiaba
// ni con el idioma ni con las unidades; el panel decia "18.2 t".
// Con decimales fijos ("760,8 km"): para lo que antes era toFixed.
function formatDec(n, lang, dec = 1) {
  return (Number(n) || 0).toLocaleString(lang || 'en', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function formatCargoMass(kg, lang, imperial) {
  if (!kg || !Number.isFinite(Number(kg))) return '';
  if (imperial) return `${formatInt(kg * 2.20462, lang)} lb`;
  const t = (kg / 1000).toLocaleString(lang || 'en', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${t} t`;
}

// La ruta de la demo guardada en docs/app/demo-route-<juego>.json (la arma
// tools/build_demo_route.py con el findRoute de la app). Con ella la demo
// arranca sin esperar el grafo de ruteo, que pesa 4,5 MB: en 4G lento
// llegaba a los 30 s y la demo se rendia (auditoria del 12-10). Sirve solo
// si se calculo con el mismo grafo que baja la app (revision y version de
// los datos): con otro, el camion se iria de la ruta que dibuja la app.
function demoPathUsable(data, graphRev, mapDataVersion) {
  if (!data || data.rev !== graphRev || !mapDataVersion || data.mapData !== mapDataVersion) return null;
  const path = data.path;
  if (!Array.isArray(path) || path.length < 2) return null;
  for (const p of path) {
    if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
  }
  return path;
}

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

// Logos de las empresas en el mapa: la capa 'company' pide la imagen
// "co:<token>" (el sprite del tile es el token de la empresa) y la app la
// baja de R2 cuando MapLibre avisa que falta. Solo para las suyas: otra
// imagen que falte no es un logo, y un token raro no se arma en una URL.
const COMPANY_ICON_PREFIX = 'co:';
function companyIconToken(imageId) {
  if (typeof imageId !== 'string' || !imageId.startsWith(COMPANY_ICON_PREFIX)) return null;
  const token = imageId.slice(COMPANY_ICON_PREFIX.length);
  return /^[a-z0-9_]{1,64}$/.test(token) ? token : null;
}
// De donde bajar un logo, en orden. Un mapa armado en la PC (1.5.32+) trae
// los de sus mods, que en R2 no estan: primero ese, y R2 si ahi falta.
function companyIconUrls(token, localBase, remoteBase, rev) {
  const urls = localBase ? [`${localBase}/${token}.png`] : [];
  urls.push(`${remoteBase}/${token}.png?v=${rev}`);
  return urls;
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

// Las filas "via waypoint" (waypoints que el juego no conoce): cuanto se
// tarda hasta el destino pasando por ellos. La de abajo del ETA del juego va
// en horas de juego, como esa fila: el ETA del juego estirado por el desvio
// (mismo ritmo, mas km). La del ETA real, con el ritmo medido. Antes las dos
// mostraban el tiempo real: "1h 30m (1,104.8 mi)" abajo de "17h 40m
// (987.2 mi)" (Discord, 13-10).
// viaKm: lo que falta por nuestra ruta. gameKm, gameEtaSeconds: el GPS del
// juego (segundos de juego). realEtaSeconds: el ETA real de la fila de
// arriba (computeRealEtaSeconds). avgSpeedKmh: km del juego por hora real.
// timeScale: minutos de juego por minuto real. Devuelve { gameSeconds,
// realSeconds }, cada uno null si no se puede estimar.
// El real tambien es el ETA real estirado por el desvio. El ritmo solo
// cuenta los metros como el GPS del juego, a 1:3 en la ciudad y a 1:20 en la
// ruta: saliendo de Sioux Falls daba 65 km/h y la fila decia 5h 44m abajo de
// un ETA real de 0h 15m (16-10). El ETA real ya lo mezcla de a poco con el
// del juego; el ritmo solo queda para cuando el GPS del juego no sirve.
function waypointEta({ viaKm, gameKm, gameEtaSeconds, realEtaSeconds, avgSpeedKmh, timeScale }) {
  if (!Number.isFinite(viaKm) || viaKm < 0) return { gameSeconds: null, realSeconds: null };
  // Con el GPS del juego apuntando a otra cosa (el remolque del freight
  // market, ver useOwnRemaining) sus tiempos no sirven: del ritmo real.
  const juegoSirve = gameKm > 1 && !useOwnRemaining(gameKm, viaKm);
  let realSeconds = null;
  if (juegoSirve && realEtaSeconds > 0) realSeconds = realEtaSeconds * viaKm / gameKm;
  else if (avgSpeedKmh > 0) realSeconds = viaKm / avgSpeedKmh * 3600;
  let gameSeconds = null;
  if (juegoSirve && gameEtaSeconds > 0) gameSeconds = gameEtaSeconds * viaKm / gameKm;
  else if (realSeconds != null && timeScale > 0) gameSeconds = realSeconds * timeScale;
  return { gameSeconds, realSeconds };
}

// Lo que falta hasta cada waypoint, para la lista del panel: "so I know if
// my fuel or bedtime are high enough to reach the waypoint" (Discord, 17-10).
// points: la ruta recortada al camion, con el tramo en p[5] (el tramo i
// termina en el waypoint i). Devuelve los metros de mundo desde el camion
// hasta el final de cada uno de los `count` primeros tramos (legs) y los de
// la ruta entera (total). Un tramo que ya quedo atras (el camion paso por
// el waypoint y todavia no se saco de la lista) da 0; uno que no esta, null.
function waypointLegMeters(points, count) {
  const legs = new Array(count).fill(null);
  if (!points || points.length < 2) return { legs, total: null };
  const primero = points[0][5] != null ? points[0][5] : 0;
  for (let i = 0; i < Math.min(primero, count); i++) legs[i] = 0;
  let s = 0;
  for (let k = 0; k < points.length; k++) {
    if (k > 0) s += Math.hypot(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]);
    const leg = points[k][5];
    if (leg != null && leg < count) legs[leg] = s;
  }
  return { legs, total: s };
}

// Los ETA hasta cada waypoint, como parte del de la ruta entera por ellos
// (eta: waypointEta de toda la ruta, asi el ultimo da lo mismo que la fila
// "via waypoint"). El tiempo de juego va por los km del juego, que crecen
// con la escala de cada zona igual que el reloj; el real, por los metros de
// mundo, que son los que se manejan: en la ciudad (1:3) un km del juego
// lleva siete veces mas tiempo real que en la ruta (1:20).
// legs: [{ worldM, km }] hasta cada waypoint (null si no se sabe); total:
// { worldM, km } de la ruta entera. Devuelve [{ km, gameSeconds,
// realSeconds }] (null donde no hay tramo).
function waypointLegEtas(legs, total, eta) {
  return legs.map((leg) => {
    if (!leg || !Number.isFinite(leg.km)) return null;
    const parte = (m, de) => (de > 0 ? Math.min(1, Math.max(0, m / de)) : 0);
    return {
      km: leg.km,
      gameSeconds: eta && eta.gameSeconds != null ? eta.gameSeconds * parte(leg.km, total.km) : null,
      realSeconds: eta && eta.realSeconds != null ? eta.realSeconds * parte(leg.worldM, total.worldM) : null,
    };
  });
}

// Escala del juego segun la zona. La ruta va a 1:19 (ETS2) o 1:20 (ATS),
// pero adentro de las cajas de ciudad a 1:3: ahi el reloj corre mas lento y
// el GPS del juego cuenta los metros a esa escala. Medido todo a 1:20, en
// Rockford el tablero decia 25,5 mi y "2h 21m" hasta un waypoint con el
// juego en 4,0 mi y 20 min, y "Keep right in 5 mi" a una bifurcacion a
// menos de un kilometro (Discord, 14-10).
// areas: [[x, z, ancho, alto], ...] con x, z la esquina de arriba a la
// izquierda ("areas" de los POIs, client/mapbuild/pois.py). Sin areas (POIs
// de antes, o todavia bajando) todo va a `outside`, como antes.
// pathMeters(points, maxWorldM): metros del juego de los primeros maxWorldM
// metros de mundo del camino (sin tope, el camino entero). El camino se
// muestrea cada `step` metros (una recta larga que entra a la ciudad no
// queda entera de un lado) y se arma en corridas de ciudad y de afuera.
// Cada caja cuenta margin metros mas de cada lado, y lo de afuera va a
// 1:20 aunque quede entre dos cajas. Medido en Sidney NE (Discord, 17-10,
// Gargamosch, con el GPS del juego y la posicion del "turn report" en tres
// puntos de la US-385): 7, 5 y 2 mi hasta EliMax. Rellenando los huecos de
// hasta 500 m entre cajas (lo de antes) daban 3,1, 1,9 y 0,8; con los
// huecos a 1:20, 9,1, 6,2 y 2,7; con las cajas 24 a 34 m mas grandes, los
// tres redondean igual que el juego. Rockford (14-10, 4,0 mi en el juego)
// no lo contradice: las calles que cruzan su hueco de 266 m cerca de la
// otra caja quedan con 12 m afuera. gapM (un hueco de hasta gapM metros
// entre dos partes de ciudad cuenta como ciudad) queda en 0; las puntas
// nunca se rellenan: salir de la ciudad sigue a 1:20 desde la caja.
// Lo muestreado de cada tramo se guarda por su punto final, salvo el del
// primero: la ruta recortada al camion estrena primer punto en cada dato.
const CITY_SCALE = 3;
const CITY_GAP_M = 0;
const CITY_MARGIN_M = 30;
function createCityScale(areas, { outside, city = CITY_SCALE, cell = 1000, step = 50, gapM = CITY_GAP_M, margin = CITY_MARGIN_M } = {}) {
  const cells = new Map();
  for (const a of areas || []) {
    if (!Array.isArray(a) || a.length < 4) continue;
    const [x0, z0, w0, h0] = a;
    if (!(w0 > 0 && h0 > 0)) continue;
    const x = x0 - margin, z = z0 - margin, w = w0 + 2 * margin, h = h0 + 2 * margin;
    const caja = [x, z, w, h];
    for (let i = Math.floor(x / cell); i <= Math.floor((x + w) / cell); i++) {
      for (let j = Math.floor(z / cell); j <= Math.floor((z + h) / cell); j++) {
        const k = `${i},${j}`;
        let lista = cells.get(k);
        if (!lista) cells.set(k, lista = []);
        lista.push(caja);
      }
    }
  }
  const inside = (x, z) => {
    const lista = cells.get(`${Math.floor(x / cell)},${Math.floor(z / cell)}`);
    if (lista) {
      for (const [ax, az, w, h] of lista) if (x >= ax && x <= ax + w && z >= az && z <= az + h) return true;
    }
    return false;
  };
  const at = (x, z) => (inside(x, z) ? city : outside);
  // Que muestras del tramo p -> q caen en ciudad, en orden (1 si, 0 no).
  const muestras = (p, q, len) => {
    const n = Math.max(1, Math.ceil(len / step));
    const flags = new Uint8Array(n);
    for (let k = 0; k < n; k++) {
      const f = (k + 0.5) / n;
      flags[k] = inside(p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f) ? 1 : 0;
    }
    return flags;
  };
  const guardadas = new WeakMap(); // punto final de un tramo -> sus muestras
  // El camino en corridas alternadas: largos[k] metros de mundo, ciudad[k].
  const corridas = (points) => {
    const largos = [], ciudad = [];
    for (let i = 1; i < points.length; i++) {
      const p = points[i - 1], q = points[i];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (!(len > 0)) continue;
      const guardable = i > 1 && typeof q === 'object' && q !== null;
      let flags = guardable ? guardadas.get(q) : undefined;
      if (!flags) {
        flags = muestras(p, q, len);
        if (guardable) guardadas.set(q, flags);
      }
      const parte = len / flags.length;
      for (const c of flags) {
        const ultima = ciudad.length - 1;
        if (ultima >= 0 && ciudad[ultima] === c) largos[ultima] += parte;
        else { largos.push(parte); ciudad.push(c); }
      }
    }
    return { largos, ciudad };
  };
  const pathMeters = (points, maxWorldM = Infinity) => {
    if (!points || points.length < 2) return 0;
    const { largos, ciudad } = corridas(points);
    let mundo = 0, juego = 0;
    for (let k = 0; k < largos.length && mundo < maxWorldM; k++) {
      // Alternan: una de afuera que no es punta tiene ciudad a los dos lados.
      const enCiudad = ciudad[k] === 1 || (k > 0 && k < largos.length - 1 && largos[k] <= gapM);
      const usado = Math.min(largos[k], maxWorldM - mundo);
      mundo += usado;
      juego += usado * (enCiudad ? city : outside);
    }
    return juego;
  };
  // Lo que falta de una ruta, medido desde el camion, sale de un perfil de
  // la ruta ENTERA: metros del juego acumulados, con cada hueco decidido una
  // sola vez con las dos cajas a la vista. Medido sobre la ruta recortada,
  // al entrar el camion al hueco la caja de atras quedaba afuera, el resto
  // del hueco pasaba a ser punta (1:20) y "Keep right in 1 km" saltaba a
  // "in 6.5 km" a 5 m de distancia (577 saltos de mas de 1,5 km en 943
  // rutas simuladas, 15-10). El perfil se arma la primera vez y queda
  // guardado por el array de la ruta.
  const perfiles = new WeakMap();
  const perfil = (full) => {
    let p = perfiles.get(full);
    if (p) return p;
    const { largos, ciudad } = corridas(full);
    const desde = [0], juego = [0], escala = [];
    for (let k = 0; k < largos.length; k++) {
      const enCiudad = ciudad[k] === 1 || (k > 0 && k < largos.length - 1 && largos[k] <= gapM);
      escala.push(enCiudad ? city : outside);
      desde.push(desde[k] + largos[k]);
      juego.push(juego[k] + largos[k] * escala[k]);
    }
    // metros de mundo de cada punto desde el principio de la ruta
    const mundoDe = new Map();
    for (let i = 0, s = 0; i < full.length; i++) {
      if (i > 0) s += Math.hypot(full[i][0] - full[i - 1][0], full[i][1] - full[i - 1][1]);
      if (!mundoDe.has(full[i])) mundoDe.set(full[i], s);
    }
    const total = desde[desde.length - 1];
    const juegoEn = (s) => {
      if (!(s > 0)) return 0;
      if (s >= total) return juego[juego.length - 1];
      let lo = 0, hi = escala.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (desde[mid] <= s) lo = mid; else hi = mid - 1; }
      return juego[lo] + (s - desde[lo]) * escala[lo];
    };
    p = { mundoDe, total, juegoEn };
    perfiles.set(full, p);
    return p;
  };
  // routeMeters(full, points, maxWorldM): como pathMeters(points, maxWorldM)
  // para la ruta recortada al camion (points: el camion y despues los
  // puntos de `full` desde el siguiente), sobre el perfil de `full`. Si
  // points no sale de full (otra ruta, o sin ruta entera), pathMeters.
  const routeMeters = (full, points, maxWorldM = Infinity) => {
    if (!points || points.length < 2) return 0;
    const p = full && full.length >= 2 ? perfil(full) : null;
    const s1 = p ? p.mundoDe.get(points[1]) : undefined;
    if (s1 === undefined) return pathMeters(points, maxWorldM);
    const s0 = Math.max(0, s1 - Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]));
    return p.juegoEn(Math.min(p.total, s0 + maxWorldM)) - p.juegoEn(s0);
  };
  return { at, pathMeters, routeMeters, outside };
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

// Ancho de las calles del mapa en pixeles, como 'line-width' de MapLibre. Se
// queda el de siempre (baseStops: [zoom, px, ...], lineal) mientras sea mas
// grueso que la calle de verdad; de ahi (zoom 10 a 11) va el ancho del juego:
// ROAD_WIDTH_GAME_M (dos carriles de 4,5 m) por ROAD_WIDTH_SHARE, pasado a
// metros del mapa (metersPerGameM: el juego esta comprimido unas 19 veces) y
// a pixeles de ese zoom en esa latitud (Web Mercator, teselas de 512 px). Las
// piezas de los cruces que arma truckermudgeon estan pensadas para dibujarse
// con ancho, como en el mapa del juego: con la linea fina se veian sueltas y
// cruzadas (rotonda de Uppsala, Discord 22-10). 0,8 y no 1: los ramales de un
// carril de las rotondas se empastaban en una mancha.
const ROAD_WIDTH_GAME_M = 9;
const ROAD_WIDTH_SHARE = 0.8;
const ROAD_WIDTH_MIN_ZOOM = 5;
const ROAD_WIDTH_MAX_ZOOM = 22;
const WEB_MERCATOR_CIRCUMFERENCE_M = 40075016.686;
function roadLineWidth(baseStops, metersPerGameM, lat) {
  const linear = ['interpolate', ['linear'], ['zoom'], ...baseStops];
  if (!(metersPerGameM > 0) || !isFinite(lat)) return linear;
  const base = z => {
    if (z <= baseStops[0]) return baseStops[1];
    for (let i = 2; i < baseStops.length; i += 2) {
      if (z <= baseStops[i]) {
        const z0 = baseStops[i - 2], w0 = baseStops[i - 1];
        return w0 + (baseStops[i + 1] - w0) * (z - z0) / (baseStops[i] - z0);
      }
    }
    return baseStops[baseStops.length - 1];
  };
  // Mas alla de los 78 grados (ninguna variante llega) no crece sin limite.
  const cos = Math.max(0.2, Math.cos(lat * Math.PI / 180));
  const stops = [];
  for (let z = ROAD_WIDTH_MIN_ZOOM; z <= ROAD_WIDTH_MAX_ZOOM; z++) {
    const real = ROAD_WIDTH_SHARE * ROAD_WIDTH_GAME_M * metersPerGameM * 512 * 2 ** z / (WEB_MERCATOR_CIRCUMFERENCE_M * cos);
    stops.push(z, Math.round(Math.max(base(z), real) * 100) / 100);
  }
  // Base 2: entre dos zooms enteros el ancho real se duplica, como el mapa.
  return ['interpolate', ['exponential', 2], ['zoom'], ...stops];
}

// Tamano de un elemento acomodado a mano (modo acomodar): la escala nueva
// sale de cuanto se arrastro la manija de la esquina respecto del ancho con
// que se empezo. Nunca mas grande de lo que entra entre donde esta y el borde
// del mapa (maxWidth, maxHeight en px desde su esquina de arriba a la
// izquierda): si se pasara, quedaria cortado y la manija, afuera. Con grilla,
// en pasos de 5 %.
const LAYOUT_SCALE_MIN = 0.6;
const LAYOUT_SCALE_MAX = 2.5;
// Donde queda un panel o boton movido a mano: en cada eje, contra el borde
// mas cercano, en porcentaje del mapa ({x|r, y|b}). Hasta el 11-10 siempre
// desde arriba a la izquierda: pegado abajo en la vista normal, en pantalla
// completa (mapa mas alto) quedaba en el medio y no habia forma de bajarlo
// para las dos vistas (Discord, Gargamosch). rect y area: la caja que se ve
// (con la escala) y la del mapa, {left, top, width, height}.
function layoutAnchor(rect, area) {
  const pct = (v, total) => Math.round(Math.max(0, v) / total * 1000) / 10;
  const out = {};
  if (rect.left + rect.width / 2 - area.left > area.width / 2) out.r = pct(area.left + area.width - rect.left - rect.width, area.width);
  else out.x = pct(rect.left - area.left, area.width);
  if (rect.top + rect.height / 2 - area.top > area.height / 2) out.b = pct(area.top + area.height - rect.top - rect.height, area.height);
  else out.y = pct(rect.top - area.top, area.height);
  return out;
}
// Lo guardado (layoutAnchor, o el {x, y} de antes) como estilos. El origen de
// la escala va en la esquina anclada: agrandado crece hacia adentro del mapa.
function layoutCss(pos) {
  const right = pos.r != null && pos.x == null, bottom = pos.b != null && pos.y == null;
  return {
    left: right ? 'auto' : `${pos.x || 0}%`, right: right ? `${pos.r}%` : 'auto',
    top: bottom ? 'auto' : `${pos.y || 0}%`, bottom: bottom ? `${pos.b}%` : 'auto',
    transformOrigin: `${right ? '100%' : '0'} ${bottom ? '100%' : '0'}`,
  };
}

// La esquina de abajo a la derecha que agarra el cambio de tamano en
// "Mover objetos" (cornerPx de lado). En algo chico (la brujula de 36 px, un
// boton achicado) esa esquina tapaba el centro y arrastrarlo lo achicaba en
// vez de moverlo: ahi es un tercio de su lado.
function layoutResizeCornerPx(width, height, cornerPx = 22) {
  const lado = Math.min(width, height);
  if (!(lado > 0)) return cornerPx;
  return lado >= 2 * cornerPx ? cornerPx : lado / 3;
}

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

// Que parte de las ciudades de un mapa cae sobre la tierra del mapa base
// real (las features 'land' del geojson de Natural Earth), o a menos de
// nearDeg de ella: el mapa del juego no coincide con la costa real y en ETS2
// una de cada cinco ciudades de la costa (Calais, Liverpool, Riga) caia en el
// agua. Un mapa armado en la PC con un mod que pone sus ciudades donde la
// proyeccion no tiene tierra (Explorando a America en ATS, Discord 18-10,
// Paulo) se veia en el medio del mar al alejar el mapa.
// points: [[lng, lat]]. Devuelve { share, off, total }.
// Los bordes van por franjas de bandDeg de latitud: la costa de Natural Earth
// tiene decenas de miles de puntos y probar cada ciudad contra todos tardaba
// casi un segundo.
function citiesOnLand(points, features, { nearDeg = 0.5, bandDeg = 0.25 } = {}) {
  const franjas = new Map(); // franja -> [[xa, ya, xb, yb, anillo de un hueco]]
  for (const f of features || []) {
    if (!f || !f.properties || f.properties.k !== 'land' || !f.geometry) continue;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
    for (const rings of polys) {
      for (const ring of rings || []) {
        for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
          const [xa, ya] = ring[a], [xb, yb] = ring[b];
          if (ya === yb) continue;
          for (let k = Math.floor(Math.min(ya, yb) / bandDeg); k <= Math.floor(Math.max(ya, yb) / bandDeg); k++) {
            let lista = franjas.get(k);
            if (!lista) franjas.set(k, lista = []);
            lista.push([xa, ya, xb, yb]);
          }
        }
      }
    }
  }
  // Par-impar contra todos los bordes (afuera y huecos): adentro de la tierra
  const dentro = (x, y) => {
    let en = false;
    for (const [xa, ya, xb, yb] of franjas.get(Math.floor(y / bandDeg)) || []) {
      if ((ya > y) !== (yb > y) && x < (xb - xa) * (y - ya) / (yb - ya) + xa) en = !en;
    }
    return en;
  };
  const cerca = [[0, 0], [nearDeg, 0], [-nearDeg, 0], [0, nearDeg], [0, -nearDeg], [nearDeg, nearDeg], [-nearDeg, nearDeg], [nearDeg, -nearDeg], [-nearDeg, -nearDeg]];
  let total = 0, off = 0;
  for (const p of points || []) {
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    total++;
    if (!cerca.some(([dx, dy]) => dentro(p[0] + dx, p[1] + dy))) off++;
  }
  return { share: total ? (total - off) / total : 1, off, total };
}

// Si el mapa base real sirve para un mapa: la mayoria de sus ciudades en la
// tierra (citiesOnLand). Con muy pocas ciudades no se decide (sirve).
const BASEMAP_MIN_LAND_SHARE = 0.8;
function basemapFitsCities(r, { minShare = BASEMAP_MIN_LAND_SHARE, minCities = 20 } = {}) {
  if (!r || !(r.total >= minCities)) return true;
  return r.share >= minShare;
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
// El aviso del punto sale con el primero de dos limites: segundos a la
// velocidad actual o, en giros y rotondas, metros (ver VOICE_TIMINGS). Si
// antes del giro queda otra calle hacia el mismo lado (turn.decoyMeters, ver
// sideExitToward), se espera a pasarla.
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

// La telemetria con el camion en 0,0 exacto no es un lugar: es un dato del
// plugin sin el camion (Discord 22-10, Cheyenne: un aviso con el camion en
// 0,0 a mitad de un viaje). La app lo tomaba como un salto
// (TRAIL_JUMP_THRESHOLD_M), recalculaba desde ahi ("Keep right onto US-75 in
// 3 mi") y otra vez al volver, sin lo recorrido: cerca de un cruce, el giro
// salia repetido. handleTelemetry lo trata como un dato sin posicion.
function positionAtOrigin(p) {
  return !!p && p.x === 0 && p.z === 0;
}

// Rotonda: "tomar la segunda salida", con frase grabada hasta la octava
// (como los ordinales de la pantalla; las de sexta a octava, desde los
// paquetes v4 del 15-10); mas alla se dice hacia que lado sale.
const VOICE_ROUNDABOUT_MAX_EXIT = 8;
function voiceManeuverKey(turn) {
  if (turn.kind === 'roundabout' && turn.exit >= 1 && turn.exit <= VOICE_ROUNDABOUT_MAX_EXIT) return `roundabout_${turn.exit}`;
  return `${turn.kind === 'fork' ? 'keep' : 'turn'}_${turn.direction === 'left' ? 'left' : 'right'}`;
}
// Que maniobra es, para no avisarla dos veces: tipo, lado y el nodo donde se
// hace. La distancia no entra, que cambia en cada dato. La usan la voz y el
// aviso para lectores de pantalla (createTurnAnnouncer).
function turnIdentity(turn) {
  if (!turn || !turn.node) return null;
  return `${turn.kind}|${turn.direction}|${Math.round(turn.node[0])},${Math.round(turn.node[1])}`;
}
// Los ultimos avisos de giro que se mostraron, para reportar uno equivocado
// ("Turn right where there is no right turn ... what information would you
// need in locating where any of the errors occur?", Discord 17-10). Quien lo
// nota ya paso el cruce: se guardan los ultimos, cada uno una vez (por
// turnIdentity), el mas nuevo primero. Diez entran en un mensaje de Discord
// (2000 caracteres). Solo en memoria: recargar los borra.
// push(turn, datos): datos() se llama solo si el aviso es nuevo y devuelve
// { t, truck: [x, z], text }.
const TURN_LOG_MAX = 10;
function createTurnLog(max = TURN_LOG_MAX) {
  const items = [];
  return {
    push(turn, datos) {
      const id = turnIdentity(turn);
      if (!id || items.some((it) => it.id === id)) return false;
      const d = (datos && datos()) || {};
      items.unshift({
        id, t: d.t, kind: turn.kind, direction: turn.direction, exit: turn.exit != null ? turn.exit : null,
        node: [Math.round(turn.node[0]), Math.round(turn.node[1])],
        truck: d.truck ? [Math.round(d.truck[0]), Math.round(d.truck[1])] : null,
        text: d.text || '',
      });
      if (items.length > max) items.length = max;
      return true;
    },
    list() { return items.slice(); },
  };
}

// El texto para pegar en Discord (en ingles, lo lee quien arregla): mapa,
// versiones, donde esta el camion y los ultimos avisos con el nodo del giro
// y donde estaba el camion cuando aparecio. Con las coordenadas y la
// variante, tools/check_avisos.js y el simulador reproducen el cruce.
// formatTime(ms): la hora para mostrar. Va entre ``` para que Discord no
// lo reformatee.
// routeKm: { app, game }, lo que falta por nuestra ruta y por el GPS del
// juego (km del juego): si no coinciden, van por caminos distintos.
function turnReportText({ game, map, web, client, truck, heading, now, items, formatTime, routeKm = null }) {
  const r = (v) => Math.round(v);
  const que = (it) => (it.kind === 'roundabout'
    ? `roundabout exit ${it.exit != null ? it.exit : '?'}`
    : `${it.kind === 'fork' ? 'keep' : 'turn'} ${it.direction || '?'}`);
  const lineas = ['```', 'Truck Dash turn report',
    `Map: ${map || '?'} (game ${game || '?'}), web ${web || '?'}, client ${client || '?'}`,
    truck
      ? `Truck now: x ${r(truck[0])}, z ${r(truck[1])}${Number.isFinite(heading) ? `, heading ${r(heading)}` : ''} (${formatTime(now)})`
      : `Truck now: no position (${formatTime(now)})`];
  if (routeKm && (Number.isFinite(routeKm.app) || Number.isFinite(routeKm.game))) {
    const km = (v) => (Number.isFinite(v) ? `${v.toFixed(1)} km` : '?');
    lineas.push(`Route left: app ${km(routeKm.app)}, game GPS ${km(routeKm.game)}`);
  }
  if (!items || !items.length) {
    lineas.push('No turn warnings shown yet (navigation mode or the floating window has to be on).');
  } else {
    lineas.push('Last turn warnings, newest first:');
    items.forEach((it, k) => {
      const donde = it.truck ? `, truck at ${it.truck[0]}, ${it.truck[1]}` : '';
      lineas.push(`${k + 1}. ${it.t != null ? formatTime(it.t) : '?'} ${que(it)} at ${it.node[0]}, ${it.node[1]}${donde}${it.text ? ` "${it.text}"` : ''}`);
    });
  }
  lineas.push('```');
  return lineas.join('\n');
}

// Cuando se dice el aviso del punto (Ajustes > Guia por voz). Hasta el 11-10
// era siempre a 6 s: a 80 km/h, 130 m antes, y frenando para doblar se
// llegaba 10 s despues; en una rotonda se decia "primera salida" lejos de
// la entrada (Discord, 11-10). Los metros (del mundo, los que recorre el
// camion) son solo para giros y rotondas, donde se frena; una salida de
// autopista se toma a velocidad y necesita los segundos.
const VOICE_TIMINGS = {
  early: { nowSec: 6, nowMaxM: Infinity }, // el de antes
  normal: { nowSec: 5, nowMaxM: 70 },
  late: { nowSec: 4, nowMaxM: 35 },        // en el giro
};
const VOICE_TIMING_DEFAULT = 'normal';
function voiceTimingSetting(value) {
  return Object.prototype.hasOwnProperty.call(VOICE_TIMINGS, value) ? value : VOICE_TIMING_DEFAULT;
}

// Lo ya avisado de las ultimas maniobras (por turnIdentity), no solo de la
// ultima. Llegando a un giro el aviso puede ir a otro y volver (A, B, A): al
// pisar el nodo de un keep se da por pasado, al dato siguiente no, y despues
// si ("keep right" dos veces en la salida del trebol de Salem, en el
// simulador), o un recalculo corre el giro a otro nodo y despues vuelve
// ("turn left" 3 o 4 veces en Cheyenne, Discord 22-10). Con la ultima sola,
// la vuelta a A se decia de nuevo. get la pone como la mas reciente; pasadas
// max, se olvida la mas vieja.
const RECENT_MANEUVERS_MAX = 8;
function createRecentManeuvers(max = RECENT_MANEUVERS_MAX) {
  const m = new Map();
  return {
    get(id) {
      if (!m.has(id)) return undefined;
      const v = m.get(id);
      m.delete(id); m.set(id, v);
      return v;
    },
    set(id, v) {
      m.delete(id); m.set(id, v);
      if (m.size > max) m.delete(m.keys().next().value);
      return v;
    },
  };
}
function createVoiceGuide(opts = {}) {
  const soonSec = opts.soonSec != null ? opts.soonSec : 20;
  let timing = VOICE_TIMINGS[voiceTimingSetting(opts.timing)];
  // Un aviso anticipado pegado al del punto no sirve: se dice solo el segundo.
  const minLeadSec = opts.minLeadSec != null ? opts.minLeadSec : 4;
  const minSpeedMs = opts.minSpeedMs != null ? opts.minSpeedMs : 5;
  const arriveKm = opts.arriveKm != null ? opts.arriveKm : 0.3;
  const minTripKm = opts.minTripKm != null ? opts.minTripKm : 1;
  const dichos = createRecentManeuvers(); // id -> { soon, now }
  let arrivedKey = null;
  return {
    maneuver(turn, speedKmh) {
      if (!turn || !turn.node || !Number.isFinite(turn.distanceMeters)) return null;
      const id = turnIdentity(turn);
      const current = dichos.get(id) || dichos.set(id, { soon: false, now: false });
      const speedMs = Math.max(minSpeedMs, (Number(speedKmh) || 0) / 3.6);
      const seconds = turn.distanceMeters / speedMs;
      const action = voiceManeuverKey(turn);
      const nowSec = timing.nowSec;
      const capped = turn.kind === 'turn' || turn.kind === 'roundabout';
      const due = seconds <= nowSec && (!capped || turn.distanceMeters <= timing.nowMaxM);
      if (!current.now && due && !(turn.decoyMeters > 0)) {
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
    // Se llego a un waypoint (checkWaypointReached). Sin trabajo, el ultimo
    // es el destino y se dice como la llegada de un trabajo ("You could also
    // have the voice say: You have reached your destination", Discord, 18-10,
    // Gargamosch). arrival no llegaba a decirlo: el waypoint se saca a 150 m,
    // con mas de arriveKm por delante. Con trabajo (targetKind dest o pickup)
    // los waypoints son paradas en el camino y la llegada es la del trabajo.
    // key y totalKm: los de la ruta a los waypoints (routeProgressState).
    waypointReached(key, wasLast, targetKind, totalKm) {
      if (!wasLast || targetKind !== 'waypoint') return null;
      return this.arrival(key, 'dest', 0, totalKm);
    },
    setTiming(value) { timing = VOICE_TIMINGS[voiceTimingSetting(value)]; },
  };
}

// La guia habla de a una frase. Poner otra en el audio cortaba la que
// sonaba: "turn left" y 0,75 s despues "soon turn right" se comia la
// indicacion del giro (simulaciones del 15-10). Que hacer con una frase
// nueva mientras suena otra: 'play' (cortarla) o 'queue' (decirla al
// terminar). Solo un aviso en el punto corta a uno que no lo es (anticipado,
// llegada, avisos del camion). En espera queda una sola: la mas urgente, o
// si empatan, la ultima.
function voiceIsUrgent(key) {
  return /^(turn|keep|roundabout)_/.test(String(key));
}
function voiceQueueAction(playingKey, newKey) {
  if (!playingKey) return 'play';
  return voiceIsUrgent(newKey) && !voiceIsUrgent(playingKey) ? 'play' : 'queue';
}
function voiceQueuePick(pendingKey, newKey) {
  if (!pendingKey) return newKey;
  return voiceIsUrgent(pendingKey) && !voiceIsUrgent(newKey) ? pendingKey : newKey;
}

// La voz a usar: la elegida (una por idioma de la app), de cualquier idioma;
// cada voz dice las frases en el suyo. Hasta el 22-10 solo se podian elegir
// las del idioma de la app: en ingles se veian dos y en aleman una (Discord).
// Sin eleccion, o con una que ya no existe, la primera del idioma de la app;
// sin ninguna, null.
function pickVoice(voices, lang, savedId) {
  const lista = voices || [];
  return (savedId && lista.find(v => v.id === savedId)) || lista.find(v => v.lang === lang) || null;
}

// Las voces para elegir en Ajustes, todas: primero las del idioma de la app,
// despues las demas en el orden del catalogo, con su idioma al lado
// ("Thorsten · Deutsch"; con parentesis quedaba "Daniela (AR) (Español)").
// langName(lang): el nombre del idioma; systemLabel: el de la voz del
// sistema. Devuelve [{ id, label }].
function voiceChoices(voices, lang, langName, systemLabel) {
  const lista = voices || [];
  const nombre = (v) => (v.system ? systemLabel : v.label);
  return lista.filter(v => v.lang === lang).map(v => ({ id: v.id, label: nombre(v) }))
    .concat(lista.filter(v => v.lang !== lang).map(v => ({ id: v.id, label: `${nombre(v)} · ${langName(v.lang)}` })));
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

// Que codigos de pois-<variante>.json sirven para una categoria del buscador
// ('g' combustible, 'p' descanso...) segun en que se va. En camion, sin los
// surtidores solo para auto ('f', ver client/mapbuild/pois.py): la web
// mandaba a un camion a uno en Spearfish donde no podia cargar (Discord
// 12-10). En auto, los dos; y para descansar, solo los lugares para auto
// ('c'): en el area de camiones no se puede estacionar el auto.
function facilityCodesFor(category, drivingCar) {
  if (category === 'g') return drivingCar ? ['g', 'f'] : ['g'];
  if (category === 'p') return drivingCar ? ['c'] : ['p'];
  return [category];
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
// Una ida y vuelta por el mismo camino (una calle sin salida, un waypoint en
// una colectora, seguir hasta donde se pueda dar la vuelta) son los mismos
// puntos en los dos sentidos: quedan a la misma distancia del camion y
// ganaba cualquiera por el ruido de la coma flotante. Antes de llegar al
// fondo la ruta pasaba a la vuelta, lo de adelante desaparecia y las
// indicaciones eran las del regreso (reporte del 16-10, ATS + C2C). Gana el
// tramo mas temprano de los que estan a menos de ROUTE_PROJECT_TIE_M del mas
// cercano: la vuelta recien cuando el camion de verdad esta en ella.
const ROUTE_PROJECT_TIE_M = 1;
function projectAheadOnRoute(points, x, z, baseWindowM = 400) {
  if (!points || points.length < 2) return null;
  const moved = Math.hypot(x - points[0][0], z - points[0][1]);
  const windowM = baseWindowM + 2 * moved;
  const seen = [];
  let minDist = Infinity;
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
    seen.push({ idx: i, point: [px, pz], dist });
    if (dist < minDist) minDist = dist;
  }
  return seen.find(s => s.dist <= minDist + ROUTE_PROJECT_TIE_M);
}

// El total contra el que se mide la barra de progreso del resumen de ruta.
// Hasta el 11-10 era lo maximo que faltaba visto en esta pagina, y al
// recargar la barra volvia a cero desde donde estaba el camion (Discord,
// Gargamosch). Ahora:
//  - yendo a la entrega por el GPS del juego, la distancia planeada del
//    trabajo (la manda el juego siempre: sobrevive a recargar, a otro
//    dispositivo y a reabrir el juego, sin cuenta);
//  - si no, lo guardado en el navegador para esta misma ruta (stored, ver
//    app.js), si no vencio;
//  - y siempre al menos lo que falta y lo maximo visto.
// La planeada no vale yendo a buscar la carga (es la del trabajo, no la de
// ese tramo) ni con ruta propia (waypoints: la distancia es otra).
function routeProgressTotal({ kind, manual, plannedKm, remainingKm, seenKm, stored, key, now, maxAgeMs = 12 * 3600 * 1000 }) {
  let total = Math.max(0, Number(seenKm) || 0, Number(remainingKm) || 0);
  if (kind === 'dest' && !manual && Number(plannedKm) > 0) total = Math.max(total, Number(plannedKm));
  if (stored && stored.key === key && Number(stored.total) > 0 && now - Number(stored.at) <= maxAgeMs) {
    total = Math.max(total, Number(stored.total));
  }
  return total;
}

// La clave de una ruta solo con waypoints (sin trabajo) para la barra de
// progreso. Era 'wp-only' para todas: viajar rapido, borrar el waypoint y
// poner otro seguia midiendo contra el total guardado del anterior, y la
// barra no volvia a cero (Discord, Gargamosch, 12-10). Ahora es el ultimo
// waypoint, el destino de esa ruta: los intermedios se sacan al pasar y la
// barra sigue; otro destino es otro viaje.
function waypointRouteKey(list) {
  const last = Array.isArray(list) && list.length ? list[list.length - 1] : null;
  if (!last || !Array.isArray(last.pos) || !last.pos.every(Number.isFinite)) return null;
  return `wp:${Math.round(last.pos[0])},${Math.round(last.pos[1])}`;
}

// El viaje de la ruta borrada a mano (boton "borrar la ruta del mapa"): no
// se vuelve a dibujar hasta que esto cambie (PR #1 de Vladimir Kutkovoy).
// Enganchar la carga cambia el viaje: la ruta vuelve, ya a la entrega.
function routeIdentity(data) {
  return JSON.stringify([data.game, data.citySrc, data.cityDst, data.companySrcId,
    data.companyDstId, data.onJob, data.isCargoLoaded, data.cargo]);
}

// Ruta borrada a mano que se podria volver a mostrar: el resumen queda como
// "Ruta oculta" con un boton para traerla. Antes el resumen desaparecia con
// el boton adentro y, hasta el proximo trabajo, la unica salida era recargar
// la pagina, que nadie adivina ("it never shows a set route anymore",
// Discord 15-10). rawTarget: el objetivo sin contar el borrado. savedStops:
// cuantos waypoints se llevo el borrado (vuelven con el boton). Sin trabajo,
// o con un destino que no esta en el mapa (Brackenreach, el evento de
// Halloween), la ruta era solo de waypoints: sin contarlos no quedaba nada
// que mostrar y tampoco el boton (Discord, 15-10).
function routeDismissed(dismissedIdentity, data, rawTarget, savedStops = 0) {
  return dismissedIdentity != null && !!data && (!!rawTarget || savedStops > 0)
    && dismissedIdentity === routeIdentity(data);
}

// Trabajo a un lugar que no esta en el mapa: sin objetivo no habia ruta ni
// resumen, y nada decia por que. Pasa con Brackenreach (el evento de
// Halloween, una zona aparte a la que se entra por un portal) y con ciudades
// de mods que el parser no lista. Devuelve el nombre para el aviso, o null.
// rawTarget: el objetivo sin contar el borrado; con waypoints ya hay uno.
// placesReady: ciudades y POIs de la variante cargados, porque mientras
// cargan tampoco se encuentra el destino y el aviso mentiria.
function offMapJobPlace(data, rawTarget, placesReady) {
  if (!placesReady || !data || !data.onJob || rawTarget) return null;
  return data.cityDst || data.companyDst || null;
}

// Hay un destino de trabajo al que rutear. El plugin borra cityDst y la
// empresa solo con el evento de cancelado o de entregado; un trabajo que se
// termina sin el evento (solo vacia la configuracion del trabajo) deja onJob
// en false con el destino de antes. Pasa con una carga externa cancelada al
// pedir la grua (reporte del 16-10): la ruta seguia yendo a un destino que
// ya no existia. El overlay y el tablero ya pedian onJob. Los clientes
// < 1.3.1 no mandan onJob y siguen con cityDst, como antes.
// La brujula del mapa (pedido de Discord, 18-10): un indicador que apunta al
// norte. Se ve cuando el norte no esta arriba: en navegacion el mapa gira con
// el camion, y fuera de ella el usuario lo puede girar a mano.
// angle: cuanto girar la aguja (lo contrario del bearing del mapa).
function compassView(bearing, { navMode = false } = {}) {
  const b = (((Number(bearing) || 0) % 360) + 360) % 360;
  const torcido = Math.min(b, 360 - b) >= 1;
  return { show: !!navMode || torcido, angle: b ? -b : 0 };
}

function hasJobDestination(data) {
  return !!data && !!data.cityDst && data.onJob !== false;
}

// Por que no hay indicaciones. Sin trabajo ni waypoints la app no tiene a
// donde rutear aunque el GPS del juego tenga una ruta puesta: el SDK da lo
// que falta (routeDistanceKm) pero no donde termina. Solo decia "No
// destination set" y parecia que no se sincronizaba (#56, 17-10, ATS sin
// trabajo). 'game_gps': hay ruta en el juego que la app no puede seguir;
// 'none': no hay destino en ningun lado; null: hay destino o ruta (si aun
// asi no hay indicaciones, es por otra cosa: borrada, fuera del mapa).
function noRouteReason({ hasTarget, hasRoute, gameRouteKm }) {
  if (hasTarget || hasRoute) return null;
  return Number.isFinite(gameRouteKm) && gameRouteKm > 0 ? 'game_gps' : 'none';
}

// "123 km" / "4.6 mi": con decimal solo cerca, asi el texto no cambia en
// cada dato (el panel con boton se redibuja solo cuando cambia).
function gameRouteDistanceText(km, imperial, lang) {
  const n = imperial ? km * 0.621371 : km;
  return `${n < 10 ? formatDec(n, lang) : formatInt(n, lang)} ${imperial ? 'mi' : 'km'}`;
}

// El plazo del trabajo en segundos de juego, o null si no hay. Sin plazo el
// SDK manda la entrega en 4294967295 minutos (2^32 - 1) y el cliente le
// resta la hora del juego: el panel decia "Job deadline 71567355h 55m"
// (Discord, 17-10, Sidney). Mas de un año de juego no es un plazo, y los
// clientes de antes lo siguen mandando asi.
const JOB_DEADLINE_MAX_SECONDS = 365 * 24 * 3600;
function jobDeadlineSeconds(data) {
  const s = data && data.jobDeadlineSeconds;
  return Number.isFinite(s) && s < JOB_DEADLINE_MAX_SECONDS ? s : null;
}

// Lo que la seccion Viaje del panel muestra del trabajo, o null en cada
// campo sin trabajo. Por lo mismo que hasJobDestination, despues de la carga
// externa cancelada el panel seguia con origen, destino, carga, paga y un
// vencimiento que corria hasta quedar en rojo. Los clientes < 1.3.1 no
// mandan onJob y se muestran como antes.
function jobPanelFields(data) {
  const job = !!data && data.onJob !== false;
  return {
    citySrc: (job && data.citySrc) || null,
    cityDst: (job && data.cityDst) || null,
    cargo: (job && data.cargo) || null,
    cargoMassKg: (job && data.cargoMassKg) || null,
    income: (job && data.jobIncome) || null,
    deadlineSeconds: job ? jobDeadlineSeconds(data) : null,
  };
}

// Los waypoints sin el marcador ni nada de la pantalla: para guardarlos en el
// navegador y para devolverlos con "Mostrar ruta". El de seguir al lider del
// convoy no va: es del convoy en curso (ver saveWaypoints en app.js).
function plainWaypoints(list) {
  return list.filter(w => !w.convoyFollow)
    .map(w => ({ pos: w.pos, inGame: w.inGame, label: w.label, ...(w.kind ? { kind: w.kind } : {}) }));
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
    out.push({ pos: [w.pos[0], w.pos[1]], inGame: !!w.inGame, label: typeof w.label === 'string' ? w.label.slice(0, 80) : null, ...(typeof w.kind === 'string' ? { kind: w.kind.slice(0, 2) } : {}) });
    if (out.length >= max) break;
  }
  return out;
}

// Plan de ruta compartido entre los dispositivos de una sesion (relay:
// route_plan_hello, set_route_plan, route_plan; Discord 22-10: armar los
// waypoints en la tablet y navegar con el celular). Lo guardado en el
// navegador de cada variante lleva el rev del relay (su hora al aceptar el
// cambio) y pending mientras un cambio de esta pestana no se mando.

// Lo que se ofrece al conectar: los planes de este navegador que no
// vencieron, con su rev (0 si nunca se sincronizaron). El relay los toma solo
// si no tiene uno mas nuevo (se reinicio y perdio las sesiones). Los que
// esperan mandarse van aparte, como un cambio (set_route_plan).
function routePlanOffers(stored, now, maxAgeMs = 12 * 3600 * 1000, max = 9) {
  const out = {};
  if (!stored || typeof stored !== 'object') return out;
  for (const [variant, entry] of Object.entries(stored)) {
    if (!entry || !Number.isFinite(entry.at) || now - entry.at > maxAgeMs || entry.pending) continue;
    const rev = Number.isInteger(entry.rev) && entry.rev > 0 ? entry.rev : 0;
    const list = storedWaypoints(stored, variant, now, maxAgeMs, max);
    if (!list.length && !rev) continue;
    out[variant] = { list, rev };
  }
  return out;
}

// Que hacer con un route_plan del relay. entry: lo guardado de esa variante;
// pendingNonce: el del cambio de esta pestana que todavia no volvio. 'ack':
// es ese cambio (se guarda su rev, la lista ya esta). 'apply': otro
// dispositivo cambio el plan. null: nada (uno que ya teniamos, o uno de otro
// mientras el de esta pestana va en camino: el relay acepto antes el otro y
// el de esta, que llega despues, es el que queda).
function routePlanAction(msg, entry, pendingNonce) {
  if (!msg || !Array.isArray(msg.list)) return null;
  return syncAction(msg.rev, msg.nonce, entry && Number.isInteger(entry.rev) ? entry.rev : 0, pendingNonce);
}

// Lo mismo para cualquier estado de la sesion con rev del relay (el plan de
// una variante, los ajustes de ruta): 'ack', 'apply' o null.
function syncAction(rev, nonce, localRev, pendingNonce) {
  if (!Number.isInteger(rev)) return null;
  if (pendingNonce) return nonce === pendingNonce ? 'ack' : null;
  return rev > (Number.isInteger(localRev) ? localRev : 0) ? 'apply' : null;
}

// Los ajustes que cambian la ruta, iguales en todos los dispositivos de la
// sesion (route_prefs del relay): con otro perfil o con otros DLC apagados,
// los mismos waypoints daban otro camino en cada uno. Normalizados para
// compararlos (sameRoutePrefs) y mandarlos.
function routePrefsOf(profile, dlcAuto, dlcOff) {
  const off = normalizeDlcOff(dlcOff);
  return { profile: profile === 'shortest' ? 'shortest' : 'fastest', dlcAuto: !!dlcAuto,
    dlcOff: { ats: [...off.ats].sort(), ets2: [...off.ets2].sort() } };
}
function sameRoutePrefs(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Si dos listas de waypoints son el mismo plan (posicion, nombre y tipo).
function samePlanList(a, b) {
  const clave = (l) => JSON.stringify((l || []).map(w => [w.pos[0], w.pos[1], !!w.inGame, w.label || null, w.kind || null]));
  return clave(a) === clave(b);
}

// De que dispositivo es esta pestana, para decir donde suena la voz:
// kind (phone, tablet, computer u other) se traduce; os y browser son
// nombres propios. El iPad con Safari se presenta como una Mac: se lo
// distingue por la pantalla tactil.
function deviceInfo(ua, maxTouchPoints = 0) {
  const s = String(ua || '');
  let os = null, kind = 'other';
  if (/iPhone|iPod/.test(s)) { os = 'iOS'; kind = 'phone'; }
  else if (/iPad/.test(s) || (/Macintosh/.test(s) && maxTouchPoints > 1)) { os = 'iPadOS'; kind = 'tablet'; }
  else if (/Android/.test(s)) { os = 'Android'; kind = /Mobile/.test(s) ? 'phone' : 'tablet'; }
  else if (/CrOS/.test(s)) { os = 'ChromeOS'; kind = 'computer'; }
  else if (/Windows/.test(s)) { os = 'Windows'; kind = 'computer'; }
  else if (/Macintosh|Mac OS X/.test(s)) { os = 'macOS'; kind = 'computer'; }
  else if (/Linux/.test(s)) { os = 'Linux'; kind = 'computer'; }
  let browser = null;
  if (/Edg\//.test(s)) browser = 'Edge';
  else if (/OPR\//.test(s)) browser = 'Opera';
  else if (/SamsungBrowser\//.test(s)) browser = 'Samsung Internet';
  else if (/Firefox\/|FxiOS\//.test(s)) browser = 'Firefox';
  else if (/Chrome\/|CriOS\//.test(s)) browser = 'Chrome';
  else if (/Safari\//.test(s)) browser = 'Safari';
  return { kind, os, browser };
}

// Si esta pestana dice la guia por voz. Con el relay que reparte la eleccion
// (shared: la pestana saludo con route_plan_hello) habla solo el dispositivo
// elegido (voiceDevice, set_voice_device); sin eleccion, o por LAN, como
// antes: cada navegador con la voz prendida, en su pestana lider.
function voiceSpeaksHere(voiceOn, isLeader, shared, voiceDevice, deviceId) {
  if (!voiceOn || !isLeader) return false;
  if (!shared || !voiceDevice || !voiceDevice.device) return true;
  return voiceDevice.device === deviceId;
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

// ------------------------------------------------- ciudades con el mismo nombre
// En ATS con Coast to Coast hay tres Jackson (Wyoming, Mississippi y
// Tennessee), dos Kansas City, dos Springfield...: la lista de ciudades del
// buscador mostraba "Jackson" tres veces, y elegir cualquiera llevaba siempre
// a la primera (Discord, 11-10). Las repetidas llevan el estado ("Jackson,
// WY") si el pois-<variante>.json trae "countries" (el countryToken del
// juego, ver client/mapbuild/pois.py); los publicados antes no lo traen, y
// ahi va la ciudad de nombre unico mas cercana ("Jackson (near Casper)").
const REGION_ABBR = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO',
  connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID',
  illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  new_hampshire: 'NH', new_jersey: 'NJ', new_mexico: 'NM', new_york: 'NY', north_carolina: 'NC',
  north_dakota: 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA',
  rhode_island: 'RI', south_carolina: 'SC', south_dakota: 'SD', tennessee: 'TN', texas: 'TX',
  utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', west_virginia: 'WV',
  wisconsin: 'WI', wyoming: 'WY', district_of_columbia: 'DC',
  alberta: 'AB', british_columbia: 'BC', manitoba: 'MB', new_brunswick: 'NB',
  newfoundland: 'NL', newfoundland_and_labrador: 'NL', nova_scotia: 'NS', ontario: 'ON',
  prince_edward_island: 'PE', quebec: 'QC', saskatchewan: 'SK', yukon: 'YT',
  northwest_territories: 'NT', nunavut: 'NU',
};
const COUNTRY_NAMES = { uk: 'UK', czech: 'Czechia', nireland: 'Northern Ireland', iom: 'Isle of Man', usa: 'USA' };
// Lo que se muestra del countryToken: la sigla de un estado o provincia, o
// el token con mayusculas ("france" -> "France").
function regionLabel(countryToken) {
  const tok = String(countryToken || '').toLowerCase();
  if (!tok) return '';
  return REGION_ABBR[tok] || COUNTRY_NAMES[tok] || tok.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
// Sin "countries", en ATS el token suele terminar en la sigla del estado
// (kansas_ci_ks / kansas_ci_mo, jackson_ms): las mellizas de una frontera
// estatal tienen la misma ciudad cercana, y es lo unico que las separa.
const REGION_CODES = new Set(Object.values(REGION_ABBR).map(c => c.toLowerCase()));
function regionFromToken(token) {
  const m = /_([a-z]{2})$/.exec(String(token || ''));
  return m && REGION_CODES.has(m[1]) ? m[1].toUpperCase() : '';
}
// names: { token: nombre }. opts.countries: { token: countryToken };
// opts.coords(token) -> [x, z] o null; opts.near(nombre) -> "near X" en el
// idioma de la app; opts.tokenRegions: leer la sigla del token (solo ATS:
// en ETS2 un "_de" no es Delaware). Devuelve { token: etiqueta }, distintas
// entre si.
function cityChoiceLabels(names, opts = {}) {
  const countries = opts.countries || {};
  const coords = opts.coords || (() => null);
  const near = opts.near || (c => `near ${c}`);
  const groups = new Map();
  for (const [tok, name] of Object.entries(names || {})) {
    const k = foldText(name);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(tok);
  }
  const out = {};
  // Las de nombre unico, para "cerca de": se conocen y no confunden.
  const anchors = [];
  for (const toks of groups.values()) {
    if (toks.length !== 1) continue;
    out[toks[0]] = names[toks[0]];
    const p = coords(toks[0]);
    if (p) anchors.push([p[0], p[1], names[toks[0]]]);
  }
  const nearest = (p) => {
    let best = null, bestD = Infinity;
    for (const a of anchors) {
      const d = Math.hypot(a[0] - p[0], a[1] - p[1]);
      if (d < bestD) { bestD = d; best = a[2]; }
    }
    return best;
  };
  for (const toks of groups.values()) {
    if (toks.length === 1) continue;
    const regions = toks.map(tok => regionLabel(countries[tok]) || (opts.tokenRegions ? regionFromToken(tok) : ''));
    for (let k = 0; k < toks.length; k++) {
      const tok = toks[k], name = names[tok], region = regions[k];
      if (region && regions.indexOf(region) === regions.lastIndexOf(region)) { out[tok] = `${name}, ${region}`; continue; }
      const p = coords(tok);
      const ref = p && nearest(p);
      out[tok] = ref ? `${name}${region ? `, ${region}` : ''} (${near(ref)})` : name;
    }
  }
  // Si aun asi quedan dos iguales (sin coordenadas, o la misma referencia),
  // el token del juego: feo, pero se puede elegir cada una.
  const seen = new Map();
  for (const [tok, label] of Object.entries(out)) {
    const k = foldText(label);
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  for (const [tok, label] of Object.entries(out)) if (seen.get(foldText(label)) > 1) out[tok] = `${label} [${tok}]`;
  return out;
}
// Las ciudades que corresponden a lo escrito en el buscador: la etiqueta
// exacta, o el nombre a secas (escribir "jackson" sin elegir de la lista
// muestra las empresas de las tres).
function citiesMatchingInput(names, labels, input) {
  const q = foldText(String(input || '').trim());
  if (!q) return [];
  const toks = Object.keys(names || {});
  const exact = toks.filter(tok => foldText(labels[tok] || names[tok]) === q);
  return exact.length ? exact : toks.filter(tok => foldText(names[tok]) === q);
}

// Pantalla encendida mientras se mira el tablero o el GPS: sin esto la
// tablet o el celular se apagan solos al rato y hay que estar tocandolos
// (Discord, 12-10). Primero la Wake Lock API. Donde no esta o la rechaza
// (modo LAN: http://192.168.x.x:27765 no es un contexto seguro y el
// navegador no la ofrece; Safari antes de 16.4) va un video negro, mudo y
// en loop, invisible y tapando toda la pantalla: Chrome no la deja apagar
// mientras se reproduce un video que ocupa buena parte de la vista, aunque
// no se vea ni suene (VideoWakeLock de Blink mide la interseccion con la
// pantalla, no la opacidad). En iOS un video mudo no alcanza: ahi solo la
// API (https) o el bloqueo automatico en Nunca.
// El navegador suelta el lock al ocultar la pestana y no lo devuelve: el
// tablero guardaba el lock ya soltado y no lo volvia a pedir nunca. sync()
// lo pide de nuevo al volver a la pestana, y reintenta con un toque un
// video que no arranco solo (ahorro de bateria).
// wakeLock: navigator.wakeLock (o nada); doc: document.
const SCREEN_KEEPER_WEBM = 'data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAHJEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHGTbuMU6uEElTDZ1OsggEMTbuMU6uEHFO7a1OsggGz7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmoCrXsYMPQkBNgIRMYXZmV0GETGF2ZkSJiECfQAAAAAAAFlSua8GuAQAAAAAAADjXgQFzxYgAAAAAAAAAAZyBACK1nIN1bmSIgQCGhVZfVlA4g4EBI+ODhDuaygDgibCBQLqBQJqBAhJUw2fQc3PNY8CLY8WIAAAAAAAAAAFnyJhFo4dFTkNPREVSRIeLTGF2YyBsaWJ2cHhnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAyLjAwMDAwMDAwMAAfQ7Z1zeeBAKOqgQAAgPACAJ0BKkAAQAAJBwiFhYiZhIgwggAHMKU8hOWlotvsQP7tS2cAo5yBA+gAMQIAJBDcABgAGdf0DAABLAYApgD+8qEAHFO7a5G7j7OBALeK94EB8YIBYfCBAw==';
const SCREEN_KEEPER_MP4 = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMIbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAld0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAB9AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAEAAAABAAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAfQAAAAAAABAAAAAAHPbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAgABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABem1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAATpzdGJsAAAAunN0c2QAAAAAAAAAAQAAAKphdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAEAAQABIAAAASAAAAAAAAAABDExhdmMgbGlieDI2NAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAAMGF2Y0MBQsAe/+EAF2dCwB7ZBCbARAAAAwAEAAADAAg8WLkgAQAGaMuAZSyAAAAAEHBhc3AAAAABAAAAAQAAABRidHJ0AAAAAAAAAJQAAACUAAAAGHN0dHMAAAAAAAAAAQAAAAIAAEAAAAAAFHN0c3MAAAAAAAAAAQAAAAEAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAIAAAABAAAAHHN0c3oAAAAAAAAAAAAAAAIAAAAbAAAACgAAABRzdGNvAAAAAAAAAAEAAAM4AAAAPXVkdGEAAAA1bWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAIaWxzdAAAAAhmcmVlAAAALW1kYXQAAAAXZYiEBbyYoAAhTycnJ1111111111114AAAAAGQZo4CvhG';
function createScreenKeeper({ wakeLock, doc }) {
  let wanted = false;
  let sentinel = null;
  let pending = false; // un solo pedido en vuelo: dos dejaban un lock sin soltar
  let useVideo = !wakeLock || typeof wakeLock.request !== 'function';
  let video = null;
  const visible = () => doc.visibilityState === 'visible';

  function videoEl() {
    if (video) return video;
    video = doc.createElement('video');
    video.muted = true;
    video.loop = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    video.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;opacity:0;pointer-events:none;z-index:-1';
    video.src = video.canPlayType && video.canPlayType('video/webm; codecs="vp8"') ? SCREEN_KEEPER_WEBM : SCREEN_KEEPER_MP4;
    doc.body.appendChild(video);
    return video;
  }

  function sync() {
    const on = wanted && visible();
    if (useVideo) {
      if (on) {
        const v = videoEl();
        if (v.paused) {
          const p = v.play();
          if (p && p.catch) p.catch(() => {});
        }
      } else if (video && !video.paused) {
        video.pause();
      }
      return;
    }
    if (sentinel && sentinel.released) sentinel = null;
    if (on && !sentinel && !pending) {
      pending = true;
      let pedido;
      try { pedido = Promise.resolve(wakeLock.request('screen')); } catch (e) { pedido = Promise.reject(e); }
      pedido.then((s) => {
        pending = false;
        sentinel = s;
        s.addEventListener('release', () => { if (sentinel === s) sentinel = null; });
        sync(); // si dejo de hacer falta mientras se pedia, se suelta ya
      }, () => {
        pending = false;
        // Rechazado con la pestana a la vista: este navegador no lo da
        // (politica, app de inicio en iOS viejo). Oculta es lo normal: se
        // vuelve a pedir al volver.
        if (visible()) useVideo = true;
        sync();
      });
    } else if (!on && sentinel) {
      const s = sentinel;
      sentinel = null;
      try {
        const p = s.release();
        if (p && p.catch) p.catch(() => {});
      } catch (e) {}
    }
  }

  return {
    want(on) { wanted = !!on; sync(); },
    sync,
    usingVideo: () => useVideo,
  };
}

// -------------------------------------------------- overlay (tablero y OBS)
// El texto del proximo giro. info es la maniobra ya lista para mostrar
// ({ kind, direction, exit, meters, sign: { kind, label } }, con los metros
// en la escala del juego) o 'straight' si hay ruta y no hay giro cerca. Lo
// arman el panel de navegacion del tablero (navTurnParts) y el overlay de
// OBS, que recibe info en nav_hud y lo escribe en su propio idioma y
// unidades: el streamer puede tener el tablero en castellano y el stream en
// ingles. t es la funcion de traducciones de quien lo llama.
function turnInstructionText(info, { t, imperial, lang }) {
  if (info === 'straight') return `⬆ ${t('navStraight')}`;
  if (!info || typeof info !== 'object' || !Number.isFinite(info.meters)) return '';
  const dist = formatTurnDistance(info.meters, imperial, lang);
  const sign = info.sign && info.sign.label ? info.sign : null;
  const onto = sign ? ` ${sign.kind === 'city' ? t('navToward') : t('navOnto')} ${sign.label}` : '';
  if (info.kind === 'roundabout') {
    // "Rotonda en 300 m: tomar la segunda salida". Mas alla de la octava, el numero.
    const ords = t('navOrdinals').split(',');
    const n = ords[info.exit - 1] || String(info.exit);
    // La flecha gira para el lado de la rotonda: antihoraria con mano
    // derecha (ccw), horaria con mano izquierda o si no se sabe.
    return `${info.ccw === true ? '↺' : '↻'} ${t('navRoundaboutIn').replace('{d}', dist).replace('{n}', n)}${onto}`;
  }
  const left = info.direction === 'left';
  if (info.kind === 'fork') return `${left ? '↖' : '↗'} ${left ? t('navKeepLeft') : t('navKeepRight')}${onto} ${t('navIn')} ${dist}`;
  return `${left ? '↰' : '↱'} ${left ? t('navTurnLeft') : t('navTurnRight')}${onto} ${t('navIn')} ${dist}`;
}

// La hora del reloj del juego a la que se llega por la ruta del GPS del
// juego ("21:59", con "+1d" si cae otro dia), o '' si el juego no tiene
// ruta. routeTimeSeconds es tiempo de juego, igual que gameTimeMinutes. Es
// llegada_en_juego de client/overlay.py: el overlay del juego y el de OBS
// tienen que decir lo mismo.
function gameArrivalClock(gameTimeMinutes, routeTimeSeconds, hour12 = false) {
  if (!Number.isFinite(gameTimeMinutes) || !Number.isFinite(routeTimeSeconds) || routeTimeSeconds <= 0) return '';
  const llega = gameTimeMinutes + routeTimeSeconds / 60;
  const hora = Math.floor(llega) % 1440;
  const dias = Math.floor(llega / 1440) - Math.floor(gameTimeMinutes / 1440);
  return formatClockHM(Math.floor(hora / 60), hora % 60, hour12) + (dias > 0 ? ` +${dias}d` : '');
}

// Formato de todos los relojes (llegada real, reloj y llegada del juego) en
// Ajustes: 'auto' sigue al idioma (12 h en ingles, 24 h en los demas), o
// '24' / '12' fijo. Antes la llegada real salia en el formato del idioma y
// la del juego siempre en 24 h, y en ingles quedaban distintas (Discord, 13-10).
const CLOCK_FORMATS = ['auto', '24', '12'];
function clockFormatSetting(raw) {
  return CLOCK_FORMATS.includes(raw) ? raw : 'auto';
}
function clockIs12h(raw, lang) {
  const f = clockFormatSetting(raw);
  return f === 'auto' ? lang === 'en' : f === '12';
}
function formatClockHM(hours, minutes, hour12) {
  const mm = String(minutes).padStart(2, '0');
  if (!hour12) return `${String(hours).padStart(2, '0')}:${mm}`;
  return `${hours % 12 || 12}:${mm} ${hours < 12 ? 'AM' : 'PM'}`;
}

// Lo que muestra el overlay de OBS (?items=), en este orden. Los del overlay
// del juego (client/overlay.py ITEMS) mas el destino y el tiempo que falta,
// que ya tenia; la marcha desde el 16-10 (Discord: "the only thing missing
// from the overlay is the gear"). El crucero no es casilla: sale con la
// velocidad cuando esta puesto. Sin items: los links de antes de las
// casillas siguen viendose igual (velocidad y el viaje, o solo velocidad con
// trip=0); el armador arranca con el giro tambien.
const OBS_ITEMS = ['turn', 'speed', 'gear', 'dest', 'remaining', 'time', 'arrival', 'game_arrival'];
function obsOverlayItems(itemsParam, tripParam, setup) {
  if (typeof itemsParam === 'string') {
    const pedidos = itemsParam.split(',').map(s => s.trim());
    return OBS_ITEMS.filter(i => pedidos.includes(i));
  }
  if (tripParam === '0') return ['speed'];
  return setup ? ['turn', 'speed', 'dest', 'remaining', 'time'] : ['speed', 'dest', 'remaining', 'time'];
}

// La marcha como la muestra el overlay del juego (formato_marcha en
// client/overlay.py), para que los dos digan lo mismo: "N" en punto muerto
// (o si no llega), "R" o "R2" atras, el numero adelante. Es la del tablero
// del camion (gearDashboard), no la de la caja.
function formatGear(gear) {
  if (typeof gear !== 'number' || !Number.isFinite(gear) || Math.trunc(gear) === 0) return 'N';
  const g = Math.trunc(gear);
  if (g < 0) return g === -1 ? 'R' : `R${-g}`;
  return String(g);
}

// Tamano de la ventana flotante (Document Picture-in-Picture) al abrirla o al
// cambiar de modo. El texto entra en una tira de 400 x 160 (380 hasta que
// se sumo el descanso a la fila de abajo, 17-10); con el mapa (prototipo
// del 16-10, Discord: "a mini map inside the small pop out window that
// stays on top of the game") hace falta alto para ver camino adelante.
// Chrome la achica si no entra en la pantalla.
// saved: el tamano que el usuario le dejo a ese modo la ultima vez (Discord,
// 21-10: "remember last size and last position"), crudo de localStorage.
const PIP_SIZES = { text: { width: 400, height: 160 }, map: { width: 400, height: 460 } };
function pipWindowSize(withMap, saved = null) {
  return pipSavedSize(saved) || { ...PIP_SIZES[withMap ? 'map' : 'text'] };
}

// Un tamano guardado de la ventana flotante ({ width, height } del contenido,
// o su JSON) si sirve para abrirla, o null. Lo que no es un numero, o es mas
// chico que lo que deja Chrome o mas grande que una pantalla, no sirve.
const PIP_SIZE_MIN = { width: 160, height: 60 };
const PIP_SIZE_MAX = 4000;
function pipSavedSize(raw) {
  let s = raw;
  if (typeof raw === 'string') {
    try { s = JSON.parse(raw); } catch (e) { return null; }
  }
  if (!s || typeof s !== 'object') return null;
  const width = Math.round(Number(s.width)), height = Math.round(Number(s.height));
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width < PIP_SIZE_MIN.width || height < PIP_SIZE_MIN.height || width > PIP_SIZE_MAX || height > PIP_SIZE_MAX) return null;
  return { width, height };
}

// El tamano a pedir al abrir la ventana flotante. Donde se abre lo elige
// Chrome, no la pagina: recuerda donde y como quedo la ultima, pero solo en
// la misma pestana, con el mismo origen y si se pide el mismo tamano que esa
// vez. lastOpen ({ width, height, closeMap }: lo pedido al abrir la ultima y
// si se cerro con el mapa, de sessionStorage, que tambien es de la pestana):
// si la ultima se cerro en el modo que se abre ahora, se pide lo mismo y
// Chrome la devuelve a su lugar con el tamano que tenia al cerrarse, aunque
// se haya abierto en el otro modo (medido en Chrome, 21-10). Si no, el
// guardado de ese modo (saved): la posicion es la de Chrome por defecto,
// pero el tamano es el de la ultima vez.
function pipRequestSize(withMap, saved = null, lastOpen = null) {
  let l = lastOpen;
  if (typeof l === 'string') {
    try { l = JSON.parse(l); } catch (e) { l = null; }
  }
  if (!l || typeof l !== 'object') l = null;
  const pedido = l && l.closeMap === !!withMap ? pipSavedSize(l) : null;
  return pedido || pipWindowSize(withMap, saved);
}

// Cuadros pedidos a dos ventanas a la vez: la pestana y la ventana flotante
// con el mapa adentro. Gana la primera que da el cuadro y el pedido de la
// otra se cancela. Tapada por el juego, la pestana no da cuadros y el mapa
// se congelaba; la ventana flotante si los da (esta siempre arriba). Si esa
// ventana se cierra con un pedido en vuelo, la pestana lo cumple igual: un
// pedido perdido dejaba a MapLibre esperando un cuadro que nunca llegaba.
// raf/cancel: los de la pestana; now: su reloj, que es lo que recibe cada
// callback (el de otra ventana cuenta desde otro origen y descuadraba las
// animaciones). setExtra({ raf, cancel }) o setExtra(null) para la otra.
function createFrameRace(raf, cancel, now) {
  let extra = null;
  let seq = 0;
  const pend = new Map();
  const quitar = (id) => {
    const p = pend.get(id);
    if (!p) return false;
    pend.delete(id);
    if (p.a != null) cancel(p.a);
    if (p.x && p.b != null) {
      try { p.x.cancel(p.b); } catch (e) { /* la ventana ya se cerro */ }
    }
    return true;
  };
  return {
    setExtra(fuente) { extra = fuente || null; },
    request(cb) {
      const id = ++seq;
      const p = { a: null, b: null, x: extra };
      pend.set(id, p);
      const run = () => { if (quitar(id)) cb(now()); };
      if (p.x) {
        try { p.b = p.x.raf(run); } catch (e) { p.x = null; }
      }
      if (pend.has(id)) p.a = raf(run);
      return id;
    },
    cancel(id) { quitar(id); },
    get pending() { return pend.size; },
  };
}

// ------------------------------------------------------ flechas de carril
// Que carril lleva a cada salida de un cruce, sacado de las navCurves de los
// prefabs por el constructor del grafo (prefab_lane_table en
// client/mapbuild/build_route_graph.py). Archivo aparte del grafo ("TDLN" v1,
// write_lanes en route_graph_bin.py), por indice de arista del v3: con nodos
// o aristas distintos es de otra corrida y no se usa.
const LANE_ARROW_BITS = { left: 1, slightLeft: 2, straight: 4, slightRight: 8, right: 16, uturn: 32 };
function decodeLanesBin(buf, nNodes, nEdges) {
  if (!buf || buf.byteLength < 20) return null;
  const dv = new DataView(buf);
  if (dv.getUint32(0, false) !== 0x54444c4e || dv.getUint32(4, true) !== 1) return null;
  if (dv.getUint32(8, true) !== nNodes || dv.getUint32(12, true) !== nEdges) return null;
  const n = dv.getUint32(16, true);
  const pad = (k) => (k + 3) & ~3;
  let off = 20;
  if (buf.byteLength < off + 4 * n + 3 * pad(n) + 8 * n) return null;
  const keys = new Uint32Array(buf, off, n); off += 4 * n;
  const lanes = new Uint8Array(buf, off, n); off += pad(n);
  const mask = new Uint8Array(buf, off, n); off += pad(n);
  const turn = new Uint8Array(buf, off, n); off += pad(n);
  const arrows = new Uint8Array(buf, off, 8 * n);
  return { n, keys, lanes, mask, turn, arrows };
}

// Las decimas de segundo de cada arista (route_graph_bin.py, write_times):
// Int8Array de nEdges, o null si el archivo no es de este grafo.
function decodeTimesBin(buf, nNodes, nEdges) {
  if (!buf || buf.byteLength < 16 + nEdges) return null;
  const dv = new DataView(buf);
  if (dv.getUint32(0, false) !== 0x54445453 || dv.getUint32(4, true) !== 1) return null;
  if (dv.getUint32(8, true) !== nNodes || dv.getUint32(12, true) !== nEdges) return null;
  return new Int8Array(buf, 16, nEdges);
}

// De que prefab es cada arista (route_graph_bin.py, write_prefabs): un color
// por arista (0 = una calle, un ferry), distinto en dos prefabs que
// comparten un nodo. Uint8Array de nEdges, o null si no es de este grafo.
function decodePrefabsBin(buf, nNodes, nEdges) {
  if (!buf || buf.byteLength < 16 + nEdges) return null;
  const dv = new DataView(buf);
  if (dv.getUint32(0, false) !== 0x54445046 || dv.getUint32(4, true) !== 1) return null;
  if (dv.getUint32(8, true) !== nNodes || dv.getUint32(12, true) !== nEdges) return null;
  return new Uint8Array(buf, 16, nEdges);
}

// Los nodos de prefab sin calle (todas sus aristas, de llegada y de salida,
// del mismo color de edgePrefab): lo que sigue es oculto y no se rutea, como
// en el GPS del juego. Salir de ahi es volver a entrar al mismo prefab, asi
// que no es una calle sin salida donde darse vuelta sino un brazo al que no
// se va (Iasi, Knoxville, 22-10: la ruta se daba vuelta en el brazo de un
// cruce). Uint8Array de n (1 = toco), o null sin edgePrefab.
function prefabStubs(g) {
  const pf = g.edgePrefab;
  if (!pf) return null;
  if (g._stubs && g._stubsOf === pf) return g._stubs;
  const { n, csr, adjTo, adjEdge } = g;
  // El csr tiene solo los arcos que salen: la calzada de una mano que llega
  // se ve desde el nodo de donde sale
  const color = new Int16Array(n).fill(-1);
  const mezcla = new Uint8Array(n);
  const marcar = (i, c) => {
    if (color[i] === -1) color[i] = c;
    else if (color[i] !== c) mezcla[i] = 1;
  };
  for (let i = 0; i < n; i++) {
    for (let k = csr[i]; k < csr[i + 1]; k++) {
      const c = pf[adjEdge[k]];
      marcar(i, c);
      marcar(adjTo[k], c);
    }
  }
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = color[i] > 0 && !mezcla[i] ? 1 : 0;
  g._stubs = out;
  g._stubsOf = pf;
  return out;
}

// Los carriles de pasar por la arista `edge` (rev: al reves, de b hacia a),
// o null si ahi no hay nada que avisar. Las claves estan ordenadas.
// drop: el constructor marco el paso con LANE_DROP_BIT en el giro (seguir
// derecho donde un carril que venia de antes se va por una salida, ver
// laneKeepSide); turn queda con las flechas solas, como en nav_hud.
const LANE_DROP_BIT = 64;
function lanesForEdge(data, edge, rev) {
  if (!data) return null;
  const key = edge * 2 + (rev ? 1 : 0);
  let lo = 0, hi = data.n - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const k = data.keys[mid];
    if (k === key) {
      const count = data.lanes[mid];
      const arrows = [];
      for (let c = 0; c < count; c++) arrows.push(data.arrows[8 * mid + c]);
      const turn = data.turn[mid];
      return { count, mask: data.mask[mid], turn: turn & 63, arrows, drop: !!(turn & LANE_DROP_BIT) };
    }
    if (k < key) lo = mid + 1; else hi = mid - 1;
  }
  return null;
}

// Si los carriles de un paso son los del giro que se anuncia: la direccion
// de la salida tiene que ir para el mismo lado. Un grupo de nodos de un
// cruce puede tener dos prefabs (la salida de la autopista y la esquina
// del final de la rampa), y sin esto un "doble a la izquierda" mostraba las
// flechas de la salida, que van a la derecha. En una bifurcacion la rama
// que se toma puede ser "derecho" (la otra se abre hacia el otro lado).
function laneTurnMatches(kind, direction, turnBits) {
  const B = LANE_ARROW_BITS;
  const izquierda = B.left | B.slightLeft | B.uturn, derecha = B.right | B.slightRight;
  if (kind === 'fork') return !!(turnBits & (direction === 'left' ? izquierda | B.straight : derecha | B.straight));
  if (kind === 'turn') return !!(turnBits & (direction === 'left' ? izquierda : derecha));
  return false;
}

// Para dibujar: un carril por elemento, de izquierda a derecha, con sus
// direcciones (nombres de LANE_ARROW_BITS), si sirve y cual de ellas es la
// del giro que se toma.
function laneGuidance(rec) {
  if (!rec || !(rec.count >= 2)) return null;
  const orden = ['uturn', 'left', 'slightLeft', 'straight', 'slightRight', 'right'];
  const turnName = orden.find((d) => rec.turn & LANE_ARROW_BITS[d]) || null;
  return rec.arrows.slice(0, rec.count).map((bits, k) => ({
    dirs: orden.filter((d) => bits & LANE_ARROW_BITS[d]),
    active: !!(rec.mask >> k & 1),
    turn: turnName,
  }));
}

// Seguir derecho donde los carriles de un costado se van por una salida
// (exit only): el juego dice "keep left" y nosotros, sin giro, nada ("the
// rightmost lane must exit ... the GPS only show continue straight without
// lane guidance and voice navigation", Discord 17-10).
// rec: los carriles de pasar derecho por el cruce (lanesForEdge; la tabla
// solo los guarda si alguno no sirve). Devuelve el lado al que hay que ir
// ('left' si los que no sirven son los de la derecha) o null: si todos
// sirven, si los que no sirven estan en el medio o a los dos lados, o si se
// van doblando. Solo salidas que se abren de a poco (flechas suaves o
// derecho), como las de autopista: el carril de doblar a la derecha de una
// esquina no se avisa con un "keep left" en cada cuadra.
// Y solo con rec.drop: el carril venia de antes del cruce anterior
// (carril_que_se_pierde en client/mapbuild/build_route_graph.py). Sin eso
// es uno que se agrego para la salida (el de desaceleracion, la salida
// comun de ETS2) y el juego no dice nada: sin la marca, 71 "keep left" de
// mas en 25 rutas de ETS2 de check_avisos. fromRamp: el carril entro por
// una rampa poco antes (laneFromOnRamp) y vale sin la marca.
function laneKeepSide(rec, fromRamp = false) {
  if (!rec || !(rec.drop || fromRamp) || !(rec.count >= 2) || !Array.isArray(rec.arrows)) return null;
  const B = LANE_ARROW_BITS;
  const deAPoco = B.straight | B.slightLeft | B.slightRight;
  if (!(rec.turn & deAPoco)) return null;
  const todos = (1 << rec.count) - 1;
  const mask = rec.mask & todos;
  if (!mask || mask === todos) return null;
  let primero = 0, ultimo = rec.count - 1;
  while (!(mask >> primero & 1)) primero++;
  while (!(mask >> ultimo & 1)) ultimo--;
  if (primero > 0 && ultimo < rec.count - 1) return null; // no sirven los de los dos lados
  for (let k = primero; k <= ultimo; k++) if (!(mask >> k & 1)) return null; // uno del medio
  for (let k = 0; k < rec.count; k++) {
    if (mask >> k & 1) continue;
    const bits = rec.arrows[k];
    if (!bits || (bits & ~deAPoco)) return null;
  }
  return primero === 0 ? 'left' : 'right';
}

// "Keep" en cada salida de autopista (el ajuste navEveryExit, apagado por
// defecto; Discord, 19-10): como laneKeepSide, tambien con el carril que se
// agrego para la salida (el de desaceleracion, sin la marca del
// constructor), donde el juego no dice nada. Solo si el carril de la ruta
// sigue derecho: si va a la salida, lo que se avisa es la bifurcacion. Son
// las mismas salidas que findQuietLanes muestra sin aviso.
function everyExitKeepSide(rec) {
  if (!rec || !(rec.turn & LANE_ARROW_BITS.straight)) return null;
  return laneKeepSide(rec, true);
}

// El dibujo de cada direccion en un carril de 24 x 30: el trazo desde la
// punta del tronco (12, 17) y la cabeza de la flecha. client/overlay.py
// dibuja las mismas formas con Tk (CARRIL_FORMAS).
const LANE_PATHS = {
  straight: ['M12 17V6', '8,9 12,3.5 16,9'],
  right: ['M12 17Q12 11 18 11', '16,7 21.5,11 16,15'],
  left: ['M12 17Q12 11 6 11', '8,7 2.5,11 8,15'],
  slightRight: ['M12 17L17.5 8.5', '14,6.5 19.8,5 19,10.8'],
  slightLeft: ['M12 17L6.5 8.5', '10,6.5 4.2,5 5,10.8'],
  uturn: ['M12 17V9.5A3.5 3.5 0 0 0 5 9.5V17', '1.5,14.5 5,20 8.5,14.5'],
};

// Los carriles de un giro como viajan en nav_hud (overlay del juego y de
// OBS): los numeros de lanesForEdge, validados, o null. Llega de otra
// pestana por el relay: nada que no sea un entero chico.
function laneHudRecord(rec) {
  if (!rec || typeof rec !== 'object') return null;
  const ent = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;
  const { count, mask, turn, arrows } = rec;
  if (!ent(count, 8) || count < 2 || !ent(mask, 255) || !ent(turn, 63) || !Array.isArray(arrows) || arrows.length < count) return null;
  const a = arrows.slice(0, count);
  if (!a.every((v) => ent(v, 63))) return null;
  return { count, mask, turn, arrows: a };
}

// Los carriles como fila de flechas (laneGuidance): los que sirven, con
// fondo; adentro de esos, la direccion del giro en blanco y las demas
// apagadas. Es un apoyo al texto del giro, que ya lo dice: el lector de
// pantalla no lo lee. Solo arma texto fijo con numeros validados.
function lanesHtml(rec) {
  const lanes = laneGuidance(laneHudRecord(rec));
  if (!lanes) return '';
  const apagado = '#4d545e';
  return `<span class="navLanes" aria-hidden="true">${lanes.map((l) => {
    const color = (d) => (l.active ? (d === l.turn ? '#ffffff' : '#8a93a0') : apagado);
    // La del giro al final, para que quede arriba de las otras
    const dirs = l.dirs.slice().sort((a, b) => (a === l.turn) - (b === l.turn));
    const trazos = dirs.map((d) => `<path d="${LANE_PATHS[d][0]}" stroke="${color(d)}"/><polygon points="${LANE_PATHS[d][1]}" fill="${color(d)}" stroke="none"/>`).join('');
    return `<span class="navLane${l.active ? ' on' : ''}"><svg viewBox="0 0 24 30" width="20" height="25" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 28V17" stroke="${l.active ? '#ffffff' : apagado}"/>${trazos}</svg></span>`;
  }).join('')}</span>`;
}

// ------------------------------------------------------- vista de cabina
// La vista de cabina (?cab=1, 17-10): el tablero en una ventana aparte, con
// el mapa, el giro y la llegada en grande, para un mod que copia una ventana
// a la pantalla del GPS del camion (Discord: un usuario lo armo con
// PrismTextureStreamer sobre el tablero entero). La ventana arranca chica,
// que es menos para dibujar: todo crece con ella (cabMapScale y el CSS), asi
// que a pantalla completa se ve igual, solo mas nitido.
const CAB_WINDOW_SIZE = { width: 854, height: 480 };

function cabModeFromSearch(search) {
  try { return new URLSearchParams(search).get('cab') === '1'; } catch (e) { return false; }
}

// El mapa de la vista de cabina se dibuja como si la ventana midiera
// CAB_MAP_HEIGHT px de alto y se estira hasta llenarla: es lo que hace el
// zoom del navegador, que el primer usuario tuvo que subir a 250 % para
// leer algo en la pantalla del juego (17-10; con una ventana de 1080 p eso
// son unos 380 px). Sin esto la letra crecia con la ventana pero las
// calles, los nombres y el camion no, y a pantalla completa volvian a ser
// hilos. size: el tamano elegido con + y - (cabSizeStep), que tambien
// agranda la letra; las pantallas de los camiones no miden todas lo mismo.
const CAB_MAP_HEIGHT = 300;
const CAB_SIZE_MIN = 0.6;
const CAB_SIZE_MAX = 2;
const CAB_SIZE_STEP = 0.1;
const CAB_SIZE_DEFAULT = 1;

function cabSizeSetting(raw) {
  const n = Number(raw);
  if (raw === null || raw === '' || !Number.isFinite(n)) return CAB_SIZE_DEFAULT;
  return Math.round(Math.min(CAB_SIZE_MAX, Math.max(CAB_SIZE_MIN, n)) * 10) / 10;
}

// Cuanto se estira el mapa (nunca se achica: en una ventana mas baja que
// la referencia queda como esta).
function cabMapScale(heightPx, size) {
  if (!(heightPx > 0)) return 1;
  return Math.max(1, heightPx * cabSizeSetting(size) / CAB_MAP_HEIGHT);
}

// + (o =, la misma tecla sin Shift) agranda, - achica, 0 vuelve al de
// fabrica; cualquier otra tecla, null.
function cabSizeStep(size, key) {
  if (key === '0') return CAB_SIZE_DEFAULT;
  const paso = key === '+' || key === '=' ? 1 : key === '-' ? -1 : 0;
  if (!paso) return null;
  return cabSizeSetting(cabSizeSetting(size) + paso * CAB_SIZE_STEP);
}

// El link de la ventana de cabina: la misma pagina con cab=1 y lo que hace
// falta para conectarse sola. El codigo no se guarda en ningun lado: viaja
// en la URL, como en el link que abre el cliente. En LAN (local=1) y en la
// demo no hay codigo que poner; live y convoy sin codigo son de espectador,
// sin camion propio que mostrar.
function cabViewUrl(href, code) {
  const url = new URL(href);
  url.hash = '';
  for (const p of ['live', 'convoy']) url.searchParams.delete(p);
  if (code && code !== 'DEMO' && !url.searchParams.get('local') && !url.searchParams.get('demo')) url.searchParams.set('code', code);
  url.searchParams.set('cab', '1');
  return url.toString();
}

// La flecha grande del giro: las mismas formas que las de carril
// (LANE_PATHS); la rotonda es un anillo con el numero de la salida adentro.
// info: la maniobra de navTurnParts, o 'straight' si sigue derecho.
function turnIconShape(info) {
  if (info === 'straight') return { shape: 'straight' };
  if (!info || typeof info !== 'object') return null;
  if (info.kind === 'roundabout') {
    return { shape: 'roundabout', exit: Number.isInteger(info.exit) && info.exit > 0 && info.exit < 100 ? info.exit : null };
  }
  const left = info.direction === 'left';
  if (info.kind === 'fork') return { shape: left ? 'slightLeft' : 'slightRight' };
  if (info.kind === 'turn') return { shape: left ? 'left' : 'right' };
  return null;
}

// Solo arma texto fijo y un numero validado (turnIconShape).
function turnIconHtml(info) {
  const s = turnIconShape(info);
  if (!s) return '';
  const svg = (adentro) => `<svg viewBox="0 0 24 30" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${adentro}</svg>`;
  if (s.shape === 'roundabout') {
    const num = s.exit ? `<text x="12" y="13.9" text-anchor="middle" font-size="8" font-weight="800" font-family="system-ui, sans-serif" fill="#ffffff" stroke="none">${s.exit}</text>` : '';
    return svg(`<path d="M12 28V17.5"/><circle cx="12" cy="11" r="6.5"/>${num}`);
  }
  const [trazo, punta] = LANE_PATHS[s.shape];
  return svg(`<path d="M12 28V17"/><path d="${trazo}"/><polygon points="${punta}" fill="#ffffff" stroke="none"/>`);
}

// El texto del giro sin la flecha del principio (↰, ↻, ⬆): la vista de
// cabina la dibuja aparte en grande, y un lector de pantalla la leeria por
// su nombre.
function turnTextWithoutArrow(text) {
  return String(text == null ? '' : text).replace(/^[^\p{L}\p{N}]+/u, '');
}

// ------------------------------------------------------- accesibilidad
// Tab con un modal abierto (app.js, modales accesibles): el foco da la vuelta
// adentro en vez de irse al mapa de atras. count = controles que se pueden
// enfocar, index = el que tiene el foco (-1: ninguno, porque esta en el
// panel o se escapo), back = Shift+Tab. Devuelve a cual mandarlo, -1 para
// quedarse quieto (no hay ninguno) o null para dejar al navegador.
function focusTrapTarget(count, index, back) {
  if (!(count > 0)) return -1;
  if (!(index >= 0 && index < count)) return back ? count - 1 : 0;
  if (back && index === 0) return count - 1;
  if (!back && index === count - 1) return 0;
  return null;
}

// El proximo giro para un lector de pantalla (region aria-live del panel de
// navegacion): una vez por maniobra, con la distancia de ese momento. Poner
// aria-live en el panel lo haria leer en cada dato, porque la distancia
// cambia todo el tiempo. Si la ruta vuelve a una maniobra ya leida (despues
// de un dato sin giro o de otra, createRecentManeuvers), no la repite.
function createTurnAnnouncer() {
  const leidos = createRecentManeuvers();
  return {
    next(turn, text) {
      const id = turnIdentity(turn);
      if (!id || !text || leidos.get(id)) return null;
      leidos.set(id, true);
      return turnTextWithoutArrow(text);
    },
  };
}

// --- Ruteo sin vueltas en U en los nodos (13-10) ---------------------------
// El grafo junta en un solo nodo las dos manos de una calle de doble mano.
// Donde una autopista o una calle con cantero pasa a ser de doble mano (los
// prefabs fork_temp de ETS2: balt_r1_r2_plus_2, it_hw2-hw1_joint...), el A*
// por nodos llegaba por una calzada, tocaba ese nodo y volvia por la otra:
// una vuelta en U en medio de la ruta que el GPS del juego no hace nunca (11
// de 60 rutas al azar en ETS2, auditar_mapas.py del taller). Aca el estado es
// la arista por la que se llega a cada nodo, y no se sale a mas de
// UTURN_MIN_DEG de la llegada. Salvo en ferry o tren (el rumbo del barco no
// tiene que ver con la calle) y si no queda otra salida (calle sin salida,
// playa de una empresa).
const UTURN_MIN_DEG = 150;
const UTURN_COS = Math.cos(UTURN_MIN_DEG * Math.PI / 180);
// El rumbo en la punta de una arista saltea los puntos a menos de esto: los
// prefabs tienen tramitos de centimetros que darian cualquier rumbo.
const ARC_DIR_MIN_M = 2;

// Rumbo de salida y de llegada (vector unitario) del arco k (de i a adjTo[k],
// con la curva de la arista), en out.depX[j]... out.arrY[j].
function arcEndDirs(g, i, k, out, j) {
  const { nodes, adjTo, adjEdge, adjRev, midOff, midXY } = g;
  const b = adjTo[k], e = adjEdge[k], rev = adjRev[k];
  const m0 = midOff ? midOff[e] : 0, cnt = midOff ? midOff[e + 1] - m0 : 0;
  // Punto t de la arista en el sentido del arco: 0 = i, cnt + 1 = b.
  const px = (t) => (t === 0 ? nodes[2 * i] : t === cnt + 1 ? nodes[2 * b] : midXY[2 * (rev ? m0 + cnt - t : m0 + t - 1)]);
  const py = (t) => (t === 0 ? nodes[2 * i + 1] : t === cnt + 1 ? nodes[2 * b + 1] : midXY[2 * (rev ? m0 + cnt - t : m0 + t - 1) + 1]);
  let t = 1;
  while (t < cnt + 1 && Math.hypot(px(t) - px(0), py(t) - py(0)) < ARC_DIR_MIN_M) t++;
  let dx = px(t) - px(0), dy = py(t) - py(0), d = Math.hypot(dx, dy) || 1;
  out.depX[j] = dx / d; out.depY[j] = dy / d;
  t = cnt;
  while (t > 0 && Math.hypot(px(cnt + 1) - px(t), py(cnt + 1) - py(t)) < ARC_DIR_MIN_M) t--;
  dx = px(cnt + 1) - px(t); dy = py(cnt + 1) - py(t); d = Math.hypot(dx, dy) || 1;
  out.arrX[j] = dx / d; out.arrY[j] = dy / d;
}

// Rumbo de salida y de llegada (vector unitario) de cada arista dirigida del
// grafo (indice k del CSR: de from[k] a adjTo[k]), con la curva de la arista.
// Se calcula una vez por grafo y queda guardado en el.
function routeArcDirections(g) {
  if (g._arcDirs) return g._arcDirs;
  const { n, csr } = g;
  const total = csr[n];
  const from = new Int32Array(total);
  const out = { from, depX: new Float32Array(total), depY: new Float32Array(total), arrX: new Float32Array(total), arrY: new Float32Array(total) };
  for (let i = 0; i < n; i++) {
    for (let k = csr[i]; k < csr[i + 1]; k++) {
      from[k] = i;
      arcEndDirs(g, i, k, out, k);
    }
  }
  g._arcDirs = out;
  return g._arcDirs;
}

// Si salir por el arco kOut despues de llegar por kIn es darse vuelta.
function isUTurnArc(dirs, kIn, kOut) {
  return dirs.arrX[kIn] * dirs.depX[kOut] + dirs.arrY[kIn] * dirs.depY[kOut] < UTURN_COS;
}

// Si salir por kOut despues de llegar por kIn es darse vuelta, para el ruteo
// (findArcRoute, dropRampDetours): en el nodo (isUTurnArc), por un nodo de
// prefab (uTurnPairs de buildRouteGraph, uTurnShortcuts) o llegando a un nodo
// por una arista de un prefab y saliendo por otra del mismo, que es salir del
// prefab y volver a entrar (g.edgePrefab, -prefabs.bin del constructor que ya
// no saca los caminos por un tercer nodo).
function routeUTurnTest(g) {
  const dirs = routeArcDirections(g);
  const { adjEdge } = g;
  const pares = g.uTurnPairs && g.uTurnPairs.size ? g.uTurnPairs : null;
  const pf = g.edgePrefab || null;
  return (kIn, kOut) => isUTurnArc(dirs, kIn, kOut)
    || (pares !== null && pares.has(kIn) && pares.get(kIn).has(kOut))
    || (pf !== null && kIn >= 0 && pf[adjEdge[kIn]] !== 0 && pf[adjEdge[kIn]] === pf[adjEdge[kOut]]);
}

// Vueltas en U por un nodo de prefab (22-10). El constructor saca el camino
// entre dos nodos de un prefab con el grafo de navNodes del juego, y ese
// camino podia pasar por un TERCER nodo del prefab, donde se sale a la
// calle: queda una arista a -> b del largo de a -> c -> b. Donde una autovia
// pasa a ser de doble mano es de la calzada que llega al nodo de la doble
// mano (c) y de ahi a la calzada que sale: pasada una salida, la ruta
// mandaba a cruzar al otro lado y volver (Kiel, ProMods, Discord 22-10). La
// regla de arriba no lo ve: en la arista a -> b, c queda adentro, y por
// a -> c -> b la vuelta se reparte en tres nodos (en Kiel, unos 30 grados en
// a, 133 en c y 15 en b). Devuelve { k, k1, k2 }: el arco a -> b (k) con un
// a -> c (k1) y un c -> b (k2) que suman su largo (a UTURN_SHORTCUT_TOL_M),
// si en c se da vuelta (UTURN_MIN_DEG) o dobla UTURN_SHORTCUT_MIN_DEG y la
// maniobra entera es darse vuelta: toda llegada a a contra toda salida de b
// (sin contar c ni a ni b), a mas de UTURN_MIN_DEG. Asi no cuenta la esquina
// de una T por la que la calle sigue derecho de a a b y la arista que se
// mete en el brazo de c y sale suma lo mismo por casualidad: con solo los 90
// grados en c cambiaban 45 de 300 rutas de ciudad a ciudad de ATS (asi, 17)
// y 68 de ETS2 (asi, 52). buildRouteGraph saca k y findArcRoute toma
// k1 -> k2 como vuelta en U (uTurnPairs).
const UTURN_SHORTCUT_TOL_M = 1.5;
const UTURN_SHORTCUT_MIN_DEG = 90;
function uTurnShortcuts(g, tolM = UTURN_SHORTCUT_TOL_M, minDeg = UTURN_SHORTCUT_MIN_DEG) {
  const { n, csr, adjTo, adjEdge, edgeM } = g;
  const cosMax = Math.cos(minDeg * Math.PI / 180);
  const tmp = { depX: new Float32Array(2), depY: new Float32Array(2), arrX: new Float32Array(2), arrY: new Float32Array(2) };
  // Los arcos que llegan a cada nodo (y de que nodo), para la maniobra
  // entera; se arman la primera vez que hacen falta
  let inCsr = null, inArc = null, inFrom = null;
  const seDaVuelta = (a, b, c) => {
    if (!inCsr) {
      const total = csr[n];
      inCsr = new Uint32Array(n + 1); inArc = new Uint32Array(total); inFrom = new Uint32Array(total);
      for (let k = 0; k < total; k++) inCsr[adjTo[k] + 1]++;
      for (let i = 0; i < n; i++) inCsr[i + 1] += inCsr[i];
      const pos = inCsr.slice(0, n);
      for (let i = 0; i < n; i++) for (let k = csr[i]; k < csr[i + 1]; k++) { const j = pos[adjTo[k]]++; inArc[j] = k; inFrom[j] = i; }
    }
    let hay = false;
    for (let j = inCsr[a]; j < inCsr[a + 1]; j++) {
      if (inFrom[j] === b || inFrom[j] === c) continue;
      arcEndDirs(g, inFrom[j], inArc[j], tmp, 0);
      for (let k = csr[b]; k < csr[b + 1]; k++) {
        if (adjTo[k] === a || adjTo[k] === c) continue;
        arcEndDirs(g, b, k, tmp, 1);
        if (tmp.arrX[0] * tmp.depX[1] + tmp.arrY[0] * tmp.depY[1] >= UTURN_COS) return false;
        hay = true;
      }
    }
    return hay;
  };
  const out = [];
  for (let a = 0; a < n; a++) {
    for (let k = csr[a]; k < csr[a + 1]; k++) {
      const b = adjTo[k], m = edgeM[adjEdge[k]];
      let hallado = null;
      for (let k1 = csr[a]; !hallado && k1 < csr[a + 1]; k1++) {
        const c = adjTo[k1], m1 = edgeM[adjEdge[k1]];
        if (c === a || c === b || m1 >= m) continue;
        for (let k2 = csr[c]; k2 < csr[c + 1]; k2++) {
          if (adjTo[k2] !== b || Math.abs(m1 + edgeM[adjEdge[k2]] - m) > tolM) continue;
          arcEndDirs(g, a, k1, tmp, 0);
          arcEndDirs(g, c, k2, tmp, 1);
          const dot = tmp.arrX[0] * tmp.depX[1] + tmp.arrY[0] * tmp.depY[1];
          if (dot < UTURN_COS || (dot <= cosMax && seDaVuelta(a, b, c))) { hallado = { k, k1, k2 }; break; }
        }
      }
      if (hallado) out.push(hallado);
    }
  }
  return out;
}

// Min-heap de numeros (prioridad, valor) en dos arrays: el A* por aristas
// mete cientos de miles y un par [p, v] por entrada es basura para el GC.
function createNumberHeap() {
  const pri = [], val = [];
  return {
    get size() { return val.length; },
    push(p, v) {
      let i = val.length;
      pri.push(p); val.push(v);
      while (i > 0) {
        const up = (i - 1) >> 1;
        if (pri[up] <= p) break;
        pri[i] = pri[up]; val[i] = val[up]; i = up;
      }
      pri[i] = p; val[i] = v;
    },
    pop() {
      const top = val[0];
      const lp = pri.pop(), lv = val.pop();
      const n = val.length;
      if (n > 0) {
        let i = 0;
        for (;;) {
          let c = 2 * i + 1;
          if (c >= n) break;
          if (c + 1 < n && pri[c + 1] < pri[c]) c++;
          if (pri[c] >= lp) break;
          pri[i] = pri[c]; val[i] = val[c]; i = c;
        }
        pri[i] = lp; val[i] = lv;
      }
      return top;
    },
  };
}

// Costo de una arista para el A*. Los segundos del grafo vienen redondeados
// a entero (client/mapbuild/route_graph_bin.py): en un cruce, la recta de
// 63 m (5,67 s -> 6) empataba con pasar por el nodo de un brazo, 34 + 34 m
// (3 + 3 s), y la ruta hacia una V con un "turn left" donde se sigue
// derecho (Fort Dodge, ATS; 589 V en 943 rutas simuladas, 15-10). Un
// milisegundo por metro desempata por la mas corta sin cambiar el tiempo, y
// la heuristica por tiempo sigue admisible: el costo solo sube.
// "Mas corta" con los metros solos salia de la autopista por un area de
// descanso o por la salida y la entrada de un cruce si cortaban la curva
// por adentro: 7 m menos y 2 s mas de Stockton a Reno, 3 m y 10 s de
// Jefferson City a East St. Louis (ATS; Discord 20-10). Cada segundo
// cuenta como ROUTE_SHORT_M_PER_S metros: un tramo a 40 km/h (un prefab,
// una rampa) tiene que ser 15 % mas corto que la autopista, y uno a
// 60 km/h, 7 %. En 150 rutas de ATS, los desvios de la mas rapida de menos
// de 1,5 km que ahorran menos de 5 % pasan de 37 a 10 (quedan otro carril
// del mismo cruce o atajos de 15 a 40 m) y ninguna ruta se alarga 0,5 %;
// en ETS2, de 32 a 17 (calles a 60 km/h) y 2 de 150 se alargan, la que
// mas 1,2 %. Con 5 m por segundo ya se alargan rutas de ATS (2 de 150,
// hasta 2,4 %). La heuristica (la recta, a 90 km/h) sigue admisible.
const ROUTE_TIE_S_PER_M = 1e-3;
const ROUTE_SHORT_M_PER_S = 4;
function routeEdgeCost(seconds, meters, byTime) {
  return byTime ? seconds + meters * ROUTE_TIE_S_PER_M : meters + seconds * ROUTE_SHORT_M_PER_S;
}

// Darse vuelta donde no queda otra salida (una calle sin salida, en
// findArcRoute) cuesta como ROUTE_UTURN_PENALTY_S segundos y
// ROUTE_UTURN_PENALTY_M metros de mas (opts.uTurnCost, en las unidades de
// routeEdgeCost). El GPS del juego no se da vuelta, y muchas de esas puntas
// son calles cortadas por lo oculto, que no estan en el grafo: la ruta iba
// 300 m al sur de una T de Knoxville para darse vuelta y volver, o se metia
// en la calle de una chacra en Iasi (22-10). Con el recargo da la vuelta a
// la manzana o por un trebol si no cuesta mucho mas. Donde darse vuelta es
// la unica forma (arrancar mirando hacia el fondo de una calle sin salida),
// todos los caminos lo pagan igual y no cambia nada.
const ROUTE_UTURN_PENALTY_S = 120;
const ROUTE_UTURN_PENALTY_M = 2000;
function routeUTurnCost(byTime) {
  return routeEdgeCost(ROUTE_UTURN_PENALTY_S, ROUTE_UTURN_PENALTY_M, byTime);
}

// Si nuestra ruta y la del GPS del juego son la misma, por lo que falta en
// km del juego: 'agree' a menos de agreeFrac o de agreeKm, 'differ' hasta
// maxFrac, 'unknown' sin dato o fuera de eso (el juego en 0, apuntando a
// otra cosa, o a menos de minKm del final). Los margenes salen de 250 rutas
// de ATS (mediana 536 km): con nuestra escala errada hasta 4 % u 8 km
// (cajas de ciudad, la playa de la empresa) no se cambia ninguna, y con el
// juego por otra casi igual de rapida se la encuentra en 22 de 34. Con 3 %
// de margen, un error de 3,5 % cambiaba una de cada tres: hay muchas
// alternativas a 2-4 % de largo (una vuelta distinta por un pueblo).
const ROUTE_GAME_MATCH = { minKm: 40, agreeFrac: 0.05, agreeKm: 5, maxFrac: 0.15, slowerFrac: 0.05, matchFrac: 0.015 };
function routeGameAgreement(ownKm, gameKm, o = ROUTE_GAME_MATCH) {
  if (!(gameKm >= o.minKm) || !(ownKm > 0)) return 'unknown';
  const err = Math.abs(ownKm / gameKm - 1);
  if (err <= o.agreeFrac || Math.abs(ownKm - gameKm) <= o.agreeKm) return 'agree';
  return err < o.maxFrac ? 'differ' : 'unknown';
}

// Entre la ruta mas rapida (candidates[0]) y otras casi iguales, la que va
// por donde va el GPS del juego. La app rutea por su cuenta y el juego no
// dice por donde: en la I-80 este de Salt Lake City (ATS, Discord 19-10) la
// app mando por la I-84 (7,14 min, ~179 km del juego) y el GPS del juego por
// la I-80 (7,19 min, ~164 km): 3 s de diferencia y la voz contra el GPS. Del
// juego solo se sabe cuanto falta (routeDistanceKm). Si la mas rapida no
// coincide con eso (routeGameAgreement 'differ'), gana la que coincide a
// menos de matchFrac sin ser mas de slowerFrac mas lenta. candidates:
// [{ km, seconds }]. Devuelve el indice (0 si nada cambia).
function pickRouteLikeGame(candidates, gameKm, o = ROUTE_GAME_MATCH) {
  if (!candidates || candidates.length < 2 || !candidates[0]) return 0;
  const best = candidates[0];
  if (routeGameAgreement(best.km, gameKm, o) !== 'differ') return 0;
  const err = (c) => Math.abs(c.km / gameKm - 1);
  let pick = 0;
  candidates.forEach((c, k) => {
    if (!k || !c || !(c.km > 0) || !(c.seconds <= best.seconds * (1 + o.slowerFrac))) return;
    if (err(c) <= o.matchFrac && err(c) < err(candidates[pick])) pick = k;
  });
  return pick;
}

// Si se busca la ruta como la del GPS del juego (routeLikeGame): un trabajo
// con la empresa conocida y sin waypoints (el juego no sabe de los nuestros,
// y con el centro de la ciudad el largo no se puede comparar), y con la ruta
// mas rapida. Con "shortest" en la app el juego seguia en su ruta (casi
// siempre la rapida) y la alternativa que coincidia con el cambiaba la mas
// corta por una mas larga (21-10). target: { kind, approx }.
function followGameRoute(target, waypointCount, profile) {
  return !!target && (target.kind === 'dest' || target.kind === 'pickup') && !target.approx
    && !waypointCount && profile !== 'shortest';
}

// Rutas alternativas para pickRouteLikeGame: cada una con las aristas de la
// anterior encarecidas (factor, acumulado). first: la ruta ya calculada.
// route(penal, previas): la ruta con penal (Map arista -> multiplicador del
// costo); previas son las rutas ya encontradas, para dropRouteDetours.
// edgesOf(ruta): sus aristas. Puede repetir rutas.
function routeAlternatives(first, route, edgesOf, { tries = 3, factor = 1.25 } = {}) {
  const out = [first];
  const penal = new Map();
  let prev = first;
  for (let k = 0; k < tries && prev; k++) {
    for (const e of edgesOf(prev)) penal.set(e, (penal.get(e) || 1) * factor);
    prev = route(penal, out.slice());
    if (prev) out.push(prev);
  }
  return out;
}

// Con la autopista de la ruta anterior encarecida, a una alternativa le
// salia mas barato bajarse por la salida y volver a subir por la entrada, o
// pasar por un area de descanso, que seguir derecho: la I-15 en la salida
// 385, camino a Ogden (Discord, 20-10). Y esos desvios le suman largo: por
// ellos la alternativa podia coincidir con el GPS del juego y ganar
// (pickRouteLikeGame). En 60 rutas de ATS, 3 alternativas cada una: unos
// 1.000 desvios de menos de 100 m (otro carril del mismo cruce) y 500 de
// 100 m a 1 km (salidas, areas de descanso); de 1 a 1,5 km, 28, y de ahi en
// mas otro camino de verdad. ETS2 igual.
// path y ref: indices de nodo de la alternativa y de una ruta anterior.
// Donde path deja a ref (llegando por la misma arista) y vuelve a ella mas
// adelante (siguiendo por la misma arista, o en el final), sin que ref
// mida mas de maxM entre esos nodos ni el desvio cueste menos: el tramo de
// ref. Si sale y vuelve varias veces seguidas, hasta la vuelta en que sigue
// por ref. edge(a, b): { m, cost } de la arista de a a b (costo sin
// encarecer), o null. Devuelve los nodos (path si no cambia nada).
const ROUTE_DETOUR_MAX_M = 1500;
function dropRouteDetours(path, ref, edge, maxM = ROUTE_DETOUR_MAX_M) {
  if (!path || !ref || path.length < 3 || ref.length < 2) return path;
  const pos = new Map();
  ref.forEach((n, i) => pos.set(n, pos.has(n) ? -1 : i)); // -1: pasa dos veces
  const tramo = (ns, a, b) => {
    let m = 0, cost = 0;
    for (let k = a + 1; k <= b; k++) {
      const x = edge(ns[k - 1], ns[k]);
      if (!x) return null;
      m += x.m; cost += x.cost;
    }
    return { m, cost };
  };
  const out = [path[0]];
  let cambio = false;
  for (let s = 0; s < path.length - 1;) {
    const ps = pos.get(path[s]);
    const antes = out.length > 1 ? out[out.length - 2] : null;
    let fin = -1;
    if (ps >= 0 && ref[ps + 1] !== path[s + 1] && (antes === null ? ps === 0 : ref[ps - 1] === antes)) {
      for (let t = s + 1; t < path.length; t++) {
        const pt = pos.get(path[t]);
        if (pt === undefined) continue;
        if (pt <= ps) break;
        if (t === path.length - 1 ? pt === ref.length - 1 : ref[pt + 1] === path[t + 1]) { fin = t; break; }
      }
    }
    if (fin !== -1) {
      const pt = pos.get(path[fin]);
      const desvio = tramo(path, s, fin), recto = tramo(ref, ps, pt);
      if (desvio && recto && recto.m <= maxM && desvio.cost >= recto.cost) {
        for (let k = ps + 1; k <= pt; k++) out.push(ref[k]);
        s = fin;
        cambio = true;
        continue;
      }
    }
    out.push(path[s + 1]);
    s++;
  }
  return cambio ? out : path;
}

// Bajarse por la salida y volver a subir por la entrada (turn report del
// 24-10, US-6 en Price, Utah: "Keep right onto US-191" en la salida 240 y
// "Keep right onto US-6" en la 241). La US-6 ahi es una calle de doble mano
// a 60 km/h en el grafo (carriles "road.local" del constructor) y las rampas
// del cruce van a 90 ("motorway"): bajar, cruzar derecho la calle de abajo y
// subir salia 2 s mas rapido que seguir por el puente, y la app mandaba a
// salir en cada cruce.
// Donde la ruta deja en a la calle por la que venia (la que sigue mas
// derecho, a ROUTE_RAMP_STRAIGHT_TOL_DEG, medido al primer nodo a
// ROUTE_RAMP_STRAIGHT_M o mas) y vuelve a ella en b: si la calle de a a b no
// tiene cruces (es la misma calle: sus nodos tienen 2 vecinos) y el desvio
// pasa por uno, no mide menos que la calle ni ahorra mas de maxExtra (en
// unidades de cost; ROUTE_RAMP_DETOUR_MAX_S en la app), la ruta va por la
// calle. Sin la calle derecha, en ETS2 cambiaba de carril dentro de un
// prefab (20 lugares de 171 m) y tomaba el carril de giro libre de una
// rotonda. En todo el grafo, 20 lugares en ATS (Price, Wenatchee, Odessa,
// St. Joseph, Victoria...) y 9 en ETS2 (Pamplona, Granada, Patras,
// Tirana...), que ahorraban de 0,1 a 8,6 s; el de Primm, con el desvio
// derecho y 22 s menos, queda.
// path: nodos de findArcRoute (con endArc y cost). opts: cost(e), startArc
// (por donde se llega a path[0]), blocked(e), isFerry(e), maxM, maxExtra.
// Devuelve los nodos (path si no cambia nada), con endArc y cost.
const ROUTE_RAMP_DETOUR_MAX_S = 10;
const ROUTE_RAMP_STRAIGHT_M = 15;
const ROUTE_RAMP_STRAIGHT_TOL_DEG = 2;
function dropRampDetours(path, g, opts) {
  if (!path || path.length < 3) return path;
  const { csr, adjTo, adjEdge, edgeM, degree, nodes } = g;
  const cost = opts.cost, blocked = opts.blocked || null, isFerry = opts.isFerry || (() => false);
  const maxM = opts.maxM != null ? opts.maxM : ROUTE_DETOUR_MAX_M;
  const maxExtra = opts.maxExtra != null ? opts.maxExtra : ROUTE_RAMP_DETOUR_MAX_S;
  const vuelta = routeUTurnTest(g);
  const dirs = routeArcDirections(g);
  const arco = (a, b) => {
    for (let k = csr[a]; k < csr[a + 1]; k++) if (adjTo[k] === b) return k;
    return -1;
  };
  const L = path.length, arcs = [], cm = [0], cc = [0];
  for (let i = 0; i + 1 < L; i++) {
    const k = arco(path[i], path[i + 1]);
    if (k === -1) return path;
    arcs.push(k);
    cm.push(cm[i] + edgeM[adjEdge[k]]);
    cc.push(cc[i] + cost(adjEdge[k]));
  }
  const pos = new Map();
  path.forEach((n, i) => pos.set(n, pos.has(n) ? -1 : i)); // -1: pasa dos veces
  // Cuanto se aparta del rumbo con que se llega a a (arco kIn) el camino por
  // esos nodos, hasta el primero a ROUTE_RAMP_STRAIGHT_M de a, en grados
  const aparta = (kIn, a, lista) => {
    let x = 0, y = 0;
    for (const n of lista) {
      x = nodes[2 * n] - nodes[2 * a]; y = nodes[2 * n + 1] - nodes[2 * a + 1];
      if (Math.hypot(x, y) >= ROUTE_RAMP_STRAIGHT_M) break;
    }
    const d = Math.hypot(x, y) || 1;
    return Math.acos(Math.max(-1, Math.min(1, (dirs.arrX[kIn] * x + dirs.arrY[kIn] * y) / d))) * 180 / Math.PI;
  };
  // La calle que sale de path[s] por el arco k0 hasta el primer cruce, si
  // vuelve a la ruta y conviene seguir por ella: { nodos, t, extra, ultimo }
  const porLaCalle = (s, kIn, k0) => {
    let k = k0, m = edgeM[adjEdge[k0]], c = cost(adjEdge[k0]), prev = path[s];
    const nodos = [];
    while (m <= maxM) {
      const u = adjTo[k], t = pos.get(u);
      if (t !== undefined) {
        if (t <= s + 1) return null;
        const sigue = t === L - 1 ? path.endArc == null : !vuelta(k, arcs[t]);
        let cruce = false;
        for (let j = s + 1; j < t && !cruce; j++) cruce = degree[path[j]] >= 3;
        const extra = c - (cc[t] - cc[s]);
        if (!sigue || !cruce || m > cm[t] - cm[s] || cm[t] - cm[s] > maxM || extra > maxExtra) return null;
        nodos.push(u);
        if (aparta(kIn, path[s], nodos) > aparta(kIn, path[s], path.slice(s + 1, t + 1)) + ROUTE_RAMP_STRAIGHT_TOL_DEG) return null;
        return { nodos, t, extra, ultimo: k };
      }
      if (degree[u] >= 3) return null;
      nodos.push(u);
      let sig = -1;
      for (let k2 = csr[u]; k2 < csr[u + 1] && sig === -1; k2++) {
        const e2 = adjEdge[k2];
        if (adjTo[k2] !== prev && !vuelta(k, k2) && !(blocked && blocked(e2)) && !isFerry(e2)) sig = k2;
      }
      if (sig === -1) return null;
      prev = u; k = sig;
      m += edgeM[adjEdge[k]]; c += cost(adjEdge[k]);
    }
    return null;
  };
  const out = [path[0]];
  let llegada = opts.startArc != null && opts.startArc >= 0 ? opts.startArc : -1;
  let extra = 0, cambio = false;
  for (let s = 0; s < L - 1;) {
    let d = null;
    if (llegada !== -1 && degree[path[s]] >= 3) {
      for (let k0 = csr[path[s]]; k0 < csr[path[s] + 1] && !d; k0++) {
        const e0 = adjEdge[k0];
        if (k0 === arcs[s] || vuelta(llegada, k0) || (blocked && blocked(e0)) || isFerry(e0)) continue;
        d = porLaCalle(s, llegada, k0);
      }
    }
    if (d) {
      for (const n of d.nodos) out.push(n);
      extra += d.extra; llegada = d.ultimo; s = d.t; cambio = true;
      continue;
    }
    out.push(path[s + 1]);
    llegada = arcs[s];
    s++;
  }
  if (!cambio) return path;
  Object.defineProperty(out, 'endArc', { value: path.endArc != null ? path.endArc : null });
  if (path.cost != null) Object.defineProperty(out, 'cost', { value: path.cost + extra });
  return out;
}

// El tramo por el que va el camion, para arrancar ahi la ruta al recalcular
// andando (desvio, waypoint alcanzado, trabajo nuevo). Con el nodo mas
// cercano, sin mirar el rumbo, 160 de 3.044 recalculos simulados (15-10)
// salian mal: el nodo era de la calzada contraria (la ruta arrancaba para
// atras), de una rampa vecina, o estaba a mas de 200 m en un tramo largo y
// la app recalculaba en cada dato.
// headingDeg: rumbo del juego sobre su grilla (0 = -z, horario, como manda
// el cliente). Busca el arco dirigido mas cercano a menos de maxDistM, con
// su curva, cuyo sentido difiere del rumbo menos de maxDeg. edgeOk(e, a):
// si la arista e (que sale del nodo a) se puede usar. Devuelve { arc, to,
// point, rest, f, dist, alts }: el arco (indice del CSR), su nodo de
// llegada, el punto proyectado, los puntos de la curva que quedan hasta el
// nodo y que fraccion del arco ya se hizo; o null.
// La distancia es a la calzada por la que va el camion (la corrida con que
// se dibuja la ruta, grafo v3), no al eje: una autovia de una sola arista de
// doble mano tiene el eje entre las dos calzadas, y una arista de prefab a
// 4 m del camion le ganaba a la suya, a 5,5 m del eje (Grimsby -> Sheffield,
// ETS2: recalculaba por 10,7 km en vez de 6,9). alts: los otros arcos a
// menos de START_ARC_TIE_M mas (carriles de un prefab que todavia no se
// separan), para que findRouteWith siga por el que da la ruta mas barata.
// Recalculando andando desde 1.600 puntos de 200 rutas por juego (en su
// calzada, +-2 m), salian mas largas o para atras 10 a 12; con la calzada,
// 2 a 8; con las alternativas, 0 o 1.
function startArcForHeading(g, x, z, headingDeg, { maxDistM = 30, maxDeg = 60, edgeOk = null } = {}) {
  if (!Number.isFinite(headingDeg)) return null;
  const lista = arcsNearPoint(g, x, z, headingDeg, { maxDistM, maxDeg, edgeOk });
  if (!lista.length) return null;
  const best = lista[0];
  // Casi a la misma distancia (carriles de un prefab que todavia no se
  // separan): alternativas, para que la ruta elija por cual seguir.
  best.alts = lista.slice(1).filter(c => c.dist <= best.dist + START_ARC_TIE_M).slice(0, START_ARC_MAX_ALTS);
  return best;
}
const START_ARC_TIE_M = 1.5;
const START_ARC_MAX_ALTS = 2;

// Un waypoint puesto sobre una calle: los arcos por los que la ruta pasa
// por el (findArcRoute con endArcs), en vez de ir al nodo mas cercano. En
// una autovia de dos calzadas ese nodo podia ser de la contraria o de una
// rampa: con el waypoint justo sobre la ruta, 44 de 600 en ATS y 26 de 589
// en ETS2 la alargaban, a veces al doble (salir, dar la vuelta y volver);
// asi, 0 y 1. Tocando a 0-20 m del carril, de 94 a 8 y de 49 a 6 (las que
// quedan, sobre otra calle).
// Los que quedan a menos de WAYPOINT_ARC_TIE_M mas que el de la calzada mas
// cercana, la otra mano de esas mismas calles aunque quede mas lejos, y la
// otra calzada de una autovia (de una mano, para el otro lado y a velocidad
// parecida): un waypoint puesto en la calzada contraria hacia ir hasta la
// salida siguiente, dar la vuelta y volver. Mas alla de WAYPOINT_ARC_M (un
// waypoint en un estacionamiento), ninguno: la ruta va al nodo mas cercano,
// como antes. La ruta pasa por el que le queda mas a mano (findRouteWith).
const WAYPOINT_ARC_M = 40;
const WAYPOINT_ARC_TIE_M = 10;
// Los nodos con alguna arista de menos de maxKmh (una calle, el prefab de
// una estacion o de una empresa), una vez por grafo. Para terminar la ruta
// en una parada: el nodo mas cercano a una estacion o un area de descanso
// pegada a la autopista podia ser de la autopista, y la ruta pasaba de
// largo y daba la parada por alcanzada (36 de 325 paradas del boton en ATS,
// 31 de 438 en ETS2; asi, 1 y 1; de todos los POI de estacion y descanso,
// 310 de 3.146 y 355 de 6.167). El lento mas cercano queda en general 20 a
// 30 m mas lejos (90 a 120 m en el 10 % peor): se usa si no pasa de
// STOP_SLOW_NODE_M mas (findRouteWith, con tramo.entrar).
const STOP_SLOW_KMH = 75;
const STOP_SLOW_NODE_M = 150;
const edgeKmh = (g, e) => g.edgeM[e] / Math.max(0.1, g.edgeS[e] + (g.edgeT ? g.edgeT[e] / 10 : 0)) * 3.6;
function slowNodes(g, maxKmh = STOP_SLOW_KMH) {
  if (g._slowNodes && g._slowNodes.kmh === maxKmh) return g._slowNodes.nodos;
  const nodos = new Uint8Array(g.n);
  for (let i = 0; i < g.n; i++) {
    for (let k = g.csr[i]; k < g.csr[i + 1]; k++) {
      if (edgeKmh(g, g.adjEdge[k]) < maxKmh) { nodos[i] = 1; break; }
    }
  }
  g._slowNodes = { kmh: maxKmh, nodos };
  return nodos;
}
// Para la empresa del trabajo, mas estricto: los nodos sin ninguna arista
// de maxKmh o mas, ni de salida ni de llegada. Todo tramo de prefab del
// grafo va a 40 km/h, tambien los de la autopista (un cambio de carriles,
// una incorporacion), y el nodo de la I-25 a 93 m de Rail Export de Casper
// salia lento por sus tramos de prefab: la ruta terminaba en la autopista,
// seguia de largo y volvia por la otra mano, 2,5 km en vez de 1,2 (22-10).
// Un patio nunca toca una via rapida: de las empresas de ATS cambian 33 (9
// en ETS2), las que terminaban en un nodo de una via rapida, y ninguna
// queda en una. Las paradas siguen con slowNodes: en ETS2 las calles de
// servicio de las estaciones van a 90 km/h, y con esta regla cambiaban 196
// de 2.074 estaciones, algunas a la de la otra mano (1,4 km mas de ruta).
function yardNodes(g, maxKmh = STOP_SLOW_KMH) {
  if (g._yardNodes && g._yardNodes.kmh === maxKmh) return g._yardNodes.nodos;
  const nodos = new Uint8Array(g.n).fill(1);
  for (let i = 0; i < g.n; i++) {
    for (let k = g.csr[i]; k < g.csr[i + 1]; k++) {
      if (edgeKmh(g, g.adjEdge[k]) >= maxKmh) { nodos[i] = 0; nodos[g.adjTo[k]] = 0; }
    }
  }
  g._yardNodes = { kmh: maxKmh, nodos };
  return nodos;
}

// Zonas del grafo de las que no se sale o a las que no se entra por el
// sentido de sus aristas: carriles de prefab que quedaron solo de entrada o
// solo de salida al armar el grafo. Desde Volkhov y Kirishi (ETS2, 11
// empresas) no habia ruta a ningun lado, ni hacia hs_mkt de Durango (ATS),
// chm_che_plnt de Chattanooga (Coast to Coast) y empresas de Reforma; la
// app dibujaba una recta (barrido del 21-10, las 17 variantes). Se arregla
// regenerando el grafo; mientras, findRouteWith arranca en el nodo mas
// cercano desde el que se llega a la componente fuerte mayor (reachesMain)
// y termina en el mas cercano al que se llega desde ella (reachFromMain),
// solo si sin eso no hay camino. Una vez por grafo: { reachesMain,
// reachFromMain, inMain } (Uint8Array por nodo).
function routeReachability(g) {
  if (g._alcance) return g._alcance;
  const n = g.n, { csr, adjTo } = g;
  // Componentes fuertes (Tarjan sin recursion)
  const idx = new Int32Array(n).fill(-1), low = new Int32Array(n), enPila = new Uint8Array(n), comp = new Int32Array(n).fill(-1);
  const pila = [], llamadas = [];
  let sig = 0, nc = 0;
  const tam = [];
  for (let s = 0; s < n; s++) {
    if (idx[s] !== -1) continue;
    llamadas.push(s, csr[s]); idx[s] = low[s] = sig++; pila.push(s); enPila[s] = 1;
    while (llamadas.length) {
      const u = llamadas[llamadas.length - 2], k = llamadas[llamadas.length - 1];
      if (k < csr[u + 1]) {
        llamadas[llamadas.length - 1] = k + 1;
        const w = adjTo[k];
        if (idx[w] === -1) { idx[w] = low[w] = sig++; pila.push(w); enPila[w] = 1; llamadas.push(w, csr[w]); }
        else if (enPila[w] && idx[w] < low[u]) low[u] = idx[w];
      } else {
        llamadas.length -= 2;
        if (llamadas.length) { const p = llamadas[llamadas.length - 2]; if (low[u] < low[p]) low[p] = low[u]; }
        if (low[u] === idx[u]) {
          let w, t = 0;
          do { w = pila.pop(); enPila[w] = 0; comp[w] = nc; t++; } while (w !== u);
          tam.push(t); nc++;
        }
      }
    }
  }
  let mayor = 0;
  for (let c = 1; c < nc; c++) if (tam[c] > tam[mayor]) mayor = c;
  const inMain = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (comp[i] === mayor) inMain[i] = 1;
  // Desde la mayor hacia adelante, y hacia ella por las aristas al reves
  const reachFromMain = inMain.slice(), reachesMain = inMain.slice();
  const cola = [];
  for (let i = 0; i < n; i++) if (inMain[i]) cola.push(i);
  for (let q = cola.slice(); q.length;) {
    const u = q.pop();
    for (let k = csr[u]; k < csr[u + 1]; k++) { const w = adjTo[k]; if (!reachFromMain[w]) { reachFromMain[w] = 1; q.push(w); } }
  }
  const entra = new Uint32Array(n + 1);
  for (let k = 0; k < csr[n]; k++) entra[adjTo[k] + 1]++;
  for (let i = 0; i < n; i++) entra[i + 1] += entra[i];
  const de = new Uint32Array(csr[n]), lleno = entra.slice(0, n);
  for (let u = 0; u < n; u++) for (let k = csr[u]; k < csr[u + 1]; k++) de[lleno[adjTo[k]]++] = u;
  for (let q = cola; q.length;) {
    const u = q.pop();
    for (let k = entra[u]; k < entra[u + 1]; k++) { const w = de[k]; if (!reachesMain[w]) { reachesMain[w] = 1; q.push(w); } }
  }
  g._alcance = { reachesMain, reachFromMain, inMain };
  return g._alcance;
}

// Solo el waypoint puesto tocando el mapa (sin nombre ni tipo) es un punto
// por donde pasar. El de un POI (estacion, descanso, empresa) o el del lider
// del convoy es un lugar al que entrar: si la autopista pasa a menos de 40 m
// seguiria de largo, asi que va al nodo mas cercano, como siempre.
function waypointPassesBy(wp) {
  return !!wp && !wp.kind && !wp.label;
}
function waypointArcs(g, x, z, { edgeOk = null } = {}) {
  const lista = arcsNearPoint(g, x, z, null, { maxDistM: WAYPOINT_ARC_M, edgeOk });
  if (!lista.length) return [];
  const tope = lista[0].dist + WAYPOINT_ARC_TIE_M;
  const cerca = lista.filter(c => c.dist <= tope);
  const aristas = new Set(cerca.map(c => g.adjEdge[c.arc]));
  const unaMano = (c) => !!(g.edgeF && (g.edgeF[g.adjEdge[c.arc]] & 2));
  const kmh = (c) => { const e = g.adjEdge[c.arc]; return g.edgeM[e] / Math.max(0.1, g.edgeS[e] + (g.edgeT ? g.edgeT[e] / 10 : 0)) * 3.6; };
  const contraria = (o) => unaMano(o) && cerca.some(c => unaMano(c) && c.dir[0] * o.dir[0] + c.dir[1] * o.dir[1] < -Math.cos(Math.PI / 6) && Math.abs(kmh(c) - kmh(o)) <= 15);
  return lista.filter(c => aristas.has(g.adjEdge[c.arc]) || contraria(c));
}

// Los arcos que pasan a menos de maxDistM de (x, z), del mas cercano al mas
// lejano, uno por arista y sentido: { arc, to, point, before, rest, f, dist }
// (before: los puntos de la curva desde la cola del arco hasta el punto
// proyectado; rest, desde ahi hasta su punta; dir, el sentido de marcha en
// ese punto, [x, z] de largo 1). Con headingDeg, solo los que
// van como el rumbo (menos de maxDeg); con null, los dos sentidos de una
// calle de doble mano. dist es a la calzada (la corrida de la ruta
// dibujada, grafo v3), no al eje.
function arcsNearPoint(g, x, z, headingDeg, { maxDistM = 30, maxDeg = 60, edgeOk = null } = {}) {
  if (!g || !g.csr || !Number.isFinite(x) || !Number.isFinite(z)) return [];
  if (!g._edgeBoxes) {
    // puntas y caja de cada arista, una vez por grafo
    const ne = g.midOff.length - 1, dirs = routeArcDirections(g);
    const a = new Int32Array(ne).fill(-1), b = new Int32Array(ne), doble = new Uint8Array(ne), box = new Float32Array(4 * ne);
    for (let k = 0; k < g.csr[g.n]; k++) {
      // Por el arco al reves tambien: si el de ida era un atajo en U
      // (uTurnShortcuts) quedo solo la vuelta.
      if (g.adjRev[k]) { doble[g.adjEdge[k]] = 1; if (a[g.adjEdge[k]] < 0) { a[g.adjEdge[k]] = g.adjTo[k]; b[g.adjEdge[k]] = dirs.from[k]; } }
      else { a[g.adjEdge[k]] = dirs.from[k]; b[g.adjEdge[k]] = g.adjTo[k]; }
    }
    for (let e = 0; e < ne; e++) {
      if (a[e] < 0) continue;
      let x0 = Math.min(g.nodes[2 * a[e]], g.nodes[2 * b[e]]), x1 = Math.max(g.nodes[2 * a[e]], g.nodes[2 * b[e]]);
      let z0 = Math.min(g.nodes[2 * a[e] + 1], g.nodes[2 * b[e] + 1]), z1 = Math.max(g.nodes[2 * a[e] + 1], g.nodes[2 * b[e] + 1]);
      for (let m = g.midOff[e]; m < g.midOff[e + 1]; m++) {
        x0 = Math.min(x0, g.midXY[2 * m]); x1 = Math.max(x1, g.midXY[2 * m]);
        z0 = Math.min(z0, g.midXY[2 * m + 1]); z1 = Math.max(z1, g.midXY[2 * m + 1]);
      }
      box[4 * e] = x0; box[4 * e + 1] = z0; box[4 * e + 2] = x1; box[4 * e + 3] = z1;
    }
    g._edgeBoxes = { a, b, doble, box, ne };
  }
  const { a, b, doble, box, ne } = g._edgeBoxes;
  const conRumbo = Number.isFinite(headingDeg);
  const hx = conRumbo ? Math.sin(headingDeg * Math.PI / 180) : 0, hz = conRumbo ? -Math.cos(headingDeg * Math.PI / 180) : 0;
  const cosMax = Math.cos(maxDeg * Math.PI / 180);
  // El mejor tramo de cada arista y sentido
  const porArco = new Map();
  const guardar = (clave, c) => {
    if (c.dist > maxDistM) return;
    const antes = porArco.get(clave);
    if (!antes || c.dist < antes.dist) porArco.set(clave, c);
  };
  for (let e = 0; e < ne; e++) {
    if (a[e] < 0 || x < box[4 * e] - maxDistM || x > box[4 * e + 2] + maxDistM || z < box[4 * e + 1] - maxDistM || z > box[4 * e + 3] + maxDistM) continue;
    if ((g.edgeF && (g.edgeF[e] & 1)) || (edgeOk && !edgeOk(e, a[e]))) continue;
    const line = [[g.nodes[2 * a[e]], g.nodes[2 * a[e] + 1]]];
    for (let m = g.midOff[e]; m < g.midOff[e + 1]; m++) line.push([g.midXY[2 * m], g.midXY[2 * m + 1]]);
    line.push([g.nodes[2 * b[e]], g.nodes[2 * b[e] + 1]]);
    let largo = 0;
    const acum = [0];
    for (let j = 1; j < line.length; j++) acum.push(largo += Math.hypot(line[j][0] - line[j - 1][0], line[j][1] - line[j - 1][1]));
    // La corrida de la ruta dibujada (grafo v3, + a la derecha del sentido de
    // marcha, en las dos manos): el camion va por su calzada, no por el eje.
    const sA = g.shiftA ? g.shiftA[e] / 2 : 0, sB = g.shiftB ? g.shiftB[e] / 2 : 0;
    for (let j = 1; j < line.length; j++) {
      const [x0, z0] = line[j - 1], [x1, z1] = line[j];
      const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
      if (L < 0.5) continue;
      const u = ((x - x0) * dx + (z - z0) * dz) / L;
      const t = Math.max(0, Math.min(1, u / L));
      const px = x0 + dx * t, pz = z0 + dz * t;
      const fuera = u < 0 ? -u : u > L ? u - L : 0; // pasado la punta del tramo
      const lado = ((x - x0) * -dz + (z - z0) * dx) / L; // + a la derecha de a -> b
      const hecho = largo > 0 ? (acum[j - 1] + L * t) / largo : 0;
      const corrida = sA + (sB - sA) * hecho;
      const dot = (dx * hx + dz * hz) / L;
      if (conRumbo ? dot >= cosMax : true) {
        guardar(e, { e, from: a[e], to: b[e], point: [px, pz], before: line.slice(1, j), rest: line.slice(j, -1), f: hecho, dist: Math.hypot(fuera, lado - corrida), dir: [dx / L, dz / L] });
      }
      if (doble[e] && (conRumbo ? dot <= -cosMax : true)) {
        guardar(-1 - e, { e, from: b[e], to: a[e], point: [px, pz], before: line.slice(j, -1).reverse(), rest: line.slice(1, j).reverse(), f: 1 - hecho, dist: Math.hypot(fuera, lado + corrida), dir: [-dx / L, -dz / L] });
      }
    }
  }
  const out = [];
  for (const c of [...porArco.values()].sort((p, q) => p.dist - q.dist)) {
    for (let k = g.csr[c.from]; k < g.csr[c.from + 1]; k++) {
      if (g.adjEdge[k] === c.e && g.adjTo[k] === c.to) { out.push({ arc: k, to: c.to, point: c.point, before: c.before, rest: c.rest, f: c.f, dist: c.dist, dir: c.dir }); break; }
    }
  }
  return out;
}

// Recalculando sin haberse desviado (cambio el destino, se puso o se
// alcanzo un waypoint, routeGameRecheck) el camion sigue sobre la ruta de
// antes: lo recorrido (routeBehind) sigue valiendo, y su rumbo tambien
// aunque este parado. Con routeBehind en cero la ruta nueva arrancaba a
// mitad de un cruce, sin sus primeros nodos, y el giro de ahi se perdia o
// salia otro (Tyler -> Lufkin, ATS: el camion 15 m antes del segundo nodo de
// la esquina). Recalculando a 3-35 m de un cruce con aviso, el aviso no era
// el de andando por la ruta en 295 de 1.521 casos de ATS y 284 de 1.599 de
// ETS2 parado (288 y 279 andando); con lo recorrido y el rumbo, 42 de 1.535
// y 48 de 1.623. No en el deposito: el camion tiene que haber andado
// minBehindM por la ruta vieja (recien calculada parado no) y a esa ruta le
// tienen que quedar minAheadM (al final del viaje queda en la playa de la
// empresa). behind: routeBehind; route: la ruta vieja recortada al camion
// (currentRouteWorldPoints). true si se conservan lo recorrido y el rumbo.
function recalcOnRoute({ offRoute, behind, route, x, z, nearM = 30, minBehindM = 30, minAheadM = 50 } = {}) {
  if (offRoute || !Array.isArray(behind) || behind.length < 2 || !Array.isArray(route) || route.length < 2) return false;
  if (!Number.isFinite(x) || !Number.isFinite(z) || !(Math.hypot(route[0][0] - x, route[0][1] - z) <= nearM)) return false;
  const largo = (pts, tope) => {
    let m = 0;
    for (let k = 1; k < pts.length && m < tope; k++) m += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    return m;
  };
  return largo(behind, minBehindM) >= minBehindM && largo(route, minAheadM) >= minAheadM;
}

// Parado (bajo ROUTE_HEADING_MIN_KMH) la ruta arranca en el nodo mas cercano,
// sin nada antes. Parado en la linea de una T, ese nodo es el del cruce y el
// recorte al camion lo cambiaba por un punto sin nodo: el giro de ese cruce
// no se avisaba y salia el siguiente (Discord, Gargamosch, 18-10, Rockford:
// recalculando parado a 5 m del cruce, 4 de 80 giros simulados se avisaban;
// andando, 77). Si el nodo esta adelante del camion (a menos de maxM y de
// maxDeg de su rumbo) y la ruta no sale de ahi para atras, se le antepone un
// punto backM detras del camion sobre su rumbo: el cruce queda con su
// entrada, como cuando la ruta arranca andando. Sin rumbo del juego (cliente
// viejo), el del camion al nodo. route: la de findRouteWith; headingDeg: el
// del juego sobre su grilla, como startArcForHeading. Devuelve el punto a
// anteponer ([x, z, 0, 0, null]) o null.
const STOPPED_LEAD_MAX_M = 40;
const STOPPED_LEAD_BACK_M = 30;
function stoppedRouteLead(route, x, z, headingDeg, { maxM = STOPPED_LEAD_MAX_M, maxDeg = 60, backM = STOPPED_LEAD_BACK_M } = {}) {
  if (!Array.isArray(route) || route.length < 2 || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  const nodo = route[0];
  if (nodo[4] == null) return null; // ya arranca en el tramo del camion
  const dx = nodo[0] - x, dz = nodo[1] - z, d = Math.hypot(dx, dz);
  if (d > maxM) return null;
  let ux, uz;
  if (Number.isFinite(headingDeg)) { ux = Math.sin(headingDeg * Math.PI / 180); uz = -Math.cos(headingDeg * Math.PI / 180); }
  else if (d >= 5) { ux = dx / d; uz = dz / d; }
  else return null;
  const adelante = dx * ux + dz * uz;
  // A menos de 5 m el carril lo corre a un costado del nodo: no se mira el angulo
  if (d >= 5 && adelante / d < Math.cos(maxDeg * Math.PI / 180)) return null;
  let k = 1;
  while (k < route.length - 1 && Math.hypot(route[k][0] - nodo[0], route[k][1] - nodo[1]) < ARC_DIR_MIN_M) k++;
  const ox = route[k][0] - nodo[0], oz = route[k][1] - nodo[1], L = Math.hypot(ox, oz);
  if (L > 0 && (ox * ux + oz * uz) / L <= UTURN_COS) return null; // sale para atras: que no parezca una vuelta en U
  const atras = Math.max(0, adelante) + backM;
  return [nodo[0] - ux * atras, nodo[1] - uz * atras, 0, 0, null];
}

// Andando, la ruta arranca en la proyeccion del camion sobre su tramo
// (startArcForHeading), que puede ser otro carril del prefab. A 1 o 2 m del
// nodo, esa cuerda iba para cualquier lado: era la entrada al cruce y la
// cuerda de llegada al nodo, el giro de la US-85 se ponia en el primer nodo
// del cruce (99 m antes de la esquina) y cada recalculo lo corria al nodo
// siguiente, "Turn left onto US-85 in 0 ft" dos veces y la voz repitiendo
// "turn left" (Discord 22-10, Cheyenne). A menos de minM del primer nodo la
// ruta arranca en el nodo, y con la entrada de parado (stoppedRouteLead) si
// no se conserva lo recorrido. Devuelve la ruta (la misma si no cambia).
const ROUTE_START_SNAP_M = 5;
function snapRouteStartToNode(route, minM = ROUTE_START_SNAP_M) {
  if (!Array.isArray(route) || route.length < 3 || route[0][4] != null || route[1][4] == null) return route;
  return Math.hypot(route[1][0] - route[0][0], route[1][1] - route[0][1]) < minM ? route.slice(1) : route;
}

// El comienzo del primer tramo de una ruta recalculada, como lo arma la app
// (y simular_navegacion, para revisar los avisos despues de recalcular).
// Parado (rumbo null, routeStartHeading) arranca en el nodo mas cercano, con
// su entrada si es un cruce adelante (stoppedRouteLead). Andando, a metros
// del primer nodo arranca en el nodo con esa entrada (snapRouteStartToNode),
// salvo que siga lo recorrido (sobreLaRuta, recalcOnRoute). x, z: el camion;
// headingDeg: el rumbo del juego sobre su grilla. Devuelve la ruta.
function recalcRouteStart(route, x, z, headingDeg, rumbo, sobreLaRuta = false) {
  const pegada = rumbo != null ? snapRouteStartToNode(route) : route;
  const conEntrada = rumbo == null || (pegada !== route && !sobreLaRuta);
  const entrada = conEntrada ? stoppedRouteLead(pegada, x, z, headingDeg) : null;
  return entrada ? [entrada, ...pegada] : pegada;
}

// A* por aristas de startIdx a endIdx sin vueltas en U en los nodos. Devuelve
// los indices de nodo del camino, o null si asi no hay camino (la app cae
// entonces al A* por nodos de siempre). opts: cost(e) en la misma unidad que
// heuristic(i) (que tiene que ser admisible), blocked(e) opcional (DLC) e
// isFerry(e). startArc opcional: el arco por el que el camion llega a
// startIdx (startArcForHeading); tampoco se sale de el dandose vuelta.
// endArcs opcional (Map arco -> fraccion): la ruta no termina en endIdx sino
// al pasar por uno de esos arcos, en esa fraccion de su costo (un waypoint
// sobre una calle, arcsNearPoint). Los nodos llegan hasta la punta del arco,
// y path.endArc dice cual fue. path.cost: el costo del camino (hasta el
// punto del arco, con endArcs). Sin camino sin pasar por un toco
// (prefabStubs), se busca otra vez pasando (opts.stubs false). uTurnCost
// opcional: lo que se suma al darse vuelta donde no queda otra salida
// (routeUTurnCost).
function findArcRoute(g, startIdx, endIdx, opts) {
  const metas = opts.endArcs && opts.endArcs.size ? opts.endArcs : null;
  if (!metas && startIdx === endIdx) return [startIdx];
  const { csr, adjTo, adjEdge } = g;
  const dirs = routeArcDirections(g);
  const vuelta = routeUTurnTest(g);
  // A un toco (prefabStubs) no se va salvo que sea el destino; tampoco cuenta
  // como salida para decidir si un nodo es una calle sin salida
  const stubs = opts.stubs === false ? null : prefabStubs(g);
  const aToco = (k2) => stubs !== null && stubs[adjTo[k2]] === 1 && adjTo[k2] !== endIdx;
  const recargo = opts.uTurnCost || 0;
  const total = csr[g.n];
  const gScore = new Float64Array(total).fill(Infinity);
  const cameFrom = new Int32Array(total).fill(-1);
  const done = new Uint8Array(total);
  // Pasar por un arco de endArcs: en el heap como total + arco, con su costo
  // hasta el punto (gMeta) y el arco de antes (-1 si sale de startIdx)
  const gMeta = metas ? new Map() : null, antesMeta = metas ? new Map() : null;
  const meta = (k2, g0, antes) => {
    const f = metas.get(k2);
    if (f == null) return;
    const t = g0 + f * opts.cost(adjEdge[k2]);
    if (!(t < (gMeta.has(k2) ? gMeta.get(k2) : Infinity))) return;
    gMeta.set(k2, t); antesMeta.set(k2, antes);
    heap.push(t, total + k2);
  };
  const blocked = opts.blocked || null;
  const heap = createNumberHeap();
  const llegada = opts.startArc != null && opts.startArc >= 0 ? opts.startArc : -1;
  let libre0 = llegada === -1;
  for (let k = csr[startIdx]; !libre0 && k < csr[startIdx + 1]; k++) {
    if (blocked && blocked(adjEdge[k])) continue;
    if (aToco(k)) continue;
    if (opts.isFerry(adjEdge[k]) || !vuelta(llegada, k)) libre0 = true;
  }
  for (let k = csr[startIdx]; k < csr[startIdx + 1]; k++) {
    const e = adjEdge[k];
    if (blocked && blocked(e)) continue;
    if (llegada !== -1 && libre0 && !opts.isFerry(e) && vuelta(llegada, k)) continue;
    // Sin otra salida que darse vuelta, todas lo son (y ninguna es un ferry)
    const extra = llegada !== -1 && !libre0 ? recargo : 0;
    const c = extra + opts.cost(e);
    if (metas) meta(k, extra, -1);
    if (aToco(k)) continue;
    if (c < gScore[k]) { gScore[k] = c; heap.push(c + opts.heuristic(adjTo[k]), k); }
  }
  let fin = -1, finMeta = -1;
  while (heap.size > 0) {
    const k = heap.pop();
    if (k >= total) { finMeta = k - total; break; }
    if (done[k]) continue;
    done[k] = 1;
    const u = adjTo[k];
    if (!metas && u === endIdx) { fin = k; break; }
    const ferryIn = opts.isFerry(adjEdge[k]);
    // Si todas las salidas son darse vuelta (calle sin salida), se puede.
    let libre = ferryIn;
    for (let k2 = csr[u]; !libre && k2 < csr[u + 1]; k2++) {
      const e2 = adjEdge[k2];
      if (blocked && blocked(e2)) continue;
      if (aToco(k2)) continue;
      if (opts.isFerry(e2) || !vuelta(k, k2)) libre = true;
    }
    const g0 = gScore[k] + (libre ? 0 : recargo);
    for (let k2 = csr[u]; k2 < csr[u + 1]; k2++) {
      const e2 = adjEdge[k2];
      if (blocked && blocked(e2)) continue;
      if (libre && !ferryIn && !opts.isFerry(e2) && vuelta(k, k2)) continue;
      if (metas) meta(k2, g0, k);
      if (aToco(k2)) continue;
      if (done[k2]) continue;
      const t = g0 + opts.cost(e2);
      if (t < gScore[k2]) { gScore[k2] = t; cameFrom[k2] = k; heap.push(t + opts.heuristic(adjTo[k2]), k2); }
    }
  }
  const arcs = [];
  if (finMeta !== -1) {
    arcs.push(finMeta);
    for (let k = antesMeta.get(finMeta); k !== -1; k = cameFrom[k]) arcs.push(k);
  } else if (fin !== -1) {
    for (let k = fin; k !== -1; k = cameFrom[k]) arcs.push(k);
  } else if (stubs !== null) {
    // La unica entrada era darse vuelta en un toco (la T de una empresa
    // con el brazo de enfrente oculto, Charlotte): mejor eso que el A* por nodos
    return findArcRoute(g, startIdx, endIdx, { ...opts, stubs: false });
  } else return null;
  arcs.reverse();
  const path = [dirs.from[arcs[0]]];
  for (const k of arcs) path.push(adjTo[k]);
  // Sin enumerar: el camino sigue siendo una lista de nodos
  Object.defineProperty(path, 'endArc', { value: finMeta !== -1 ? finMeta : null });
  Object.defineProperty(path, 'cost', { value: finMeta !== -1 ? gMeta.get(finMeta) : gScore[fin] });
  return path;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { roadShieldPoints, citiesOnLand, basemapFitsCities, BASEMAP_MIN_LAND_SHARE, compassView, layoutResizeCornerPx, turnPassed, stoppedRouteLead, snapRouteStartToNode, ROUTE_START_SNAP_M, recalcRouteStart, recalcOnRoute, STOPPED_LEAD_MAX_M, STOPPED_LEAD_BACK_M, CAB_WINDOW_SIZE, cabModeFromSearch, CAB_MAP_HEIGHT, CAB_SIZE_MIN, CAB_SIZE_MAX, CAB_SIZE_DEFAULT, cabSizeSetting, cabMapScale, cabSizeStep, cabViewUrl, turnIconShape, turnIconHtml, turnTextWithoutArrow, routeIdentity, routeDismissed, plainWaypoints, offMapJobPlace, hasJobDestination, jobPanelFields, ringCcw, sweepCcw, decodeTimesBin, voiceIsUrgent, voiceQueueAction, voiceQueuePick, longestStraightFrac, RING_MAX_STRAIGHT, ovalRing, straightRuns, OVAL_RING, compactIslandM, COMPACT_MIN_ISLAND_M, startArcForHeading, START_ARC_TIE_M, START_ARC_MAX_ALTS, arcsNearPoint, waypointArcs, waypointPassesBy, routeReachability, slowNodes, yardNodes, STOP_SLOW_KMH, STOP_SLOW_NODE_M, WAYPOINT_ARC_M, WAYPOINT_ARC_TIE_M, routeEdgeCost, ROUTE_TIE_S_PER_M, ROUTE_SHORT_M_PER_S, routeUTurnCost, ROUTE_UTURN_PENALTY_S, ROUTE_UTURN_PENALTY_M, ROUTE_GAME_MATCH, routeGameAgreement, pickRouteLikeGame, followGameRoute, routeAlternatives, dropRouteDetours, ROUTE_DETOUR_MAX_M, dropRampDetours, ROUTE_RAMP_DETOUR_MAX_S, ROUTE_RAMP_STRAIGHT_M, ROUTE_RAMP_STRAIGHT_TOL_DEG, LANE_PATHS, laneHudRecord, lanesHtml, laneKeepSide, everyExitKeepSide, LANE_DROP_BIT, routeArcDirections, isUTurnArc, routeUTurnTest, prefabStubs, uTurnShortcuts, UTURN_SHORTCUT_TOL_M, UTURN_SHORTCUT_MIN_DEG, findArcRoute, UTURN_MIN_DEG, LANE_ARROW_BITS, decodeLanesBin, lanesForEdge, laneGuidance, laneTurnMatches, turnInstructionText, gameArrivalClock, CLOCK_FORMATS, clockFormatSetting, clockIs12h, formatClockHM, OBS_ITEMS, obsOverlayItems, formatGear, pipWindowSize, pipSavedSize, pipRequestSize, PIP_SIZE_MIN, PIP_SIZE_MAX, createFrameRace, turnIdentity, createTurnLog, TURN_LOG_MAX, turnReportText, focusTrapTarget, createTurnAnnouncer, routeProgressTotal, waypointRouteKey, stopInsertIndex, waypointReached, WAYPOINT_ROUTE_END_M, WAYPOINT_STOPPED_M, WAYPOINT_NODE_WINDOW_M, WAYPOINT_SNAP_M, waypointEta, waypointLegMeters, waypointLegEtas, CITY_SCALE, CITY_GAP_M, CITY_MARGIN_M, createCityScale, layoutAnchor, layoutCss, trimRouteBehind, passedRoutePoints, miniDialReadings, gaugeAngle, gaugeScaleMax, createRestWatch, jobLooksFresh, jobDeadlineSeconds, JOB_DEADLINE_MAX_SECONDS, createStatusAlerts, REST_WARN_OPTIONS, REST_WARN_DEFAULT, restWarnSetting, restWarnLabel, createStopSuggestion, regionLabel, cityChoiceLabels, citiesMatchingInput, poiRelative, stopsAlongRoute, pickFuelStop, createRefuelWatch, restMinutesOf, REST_MINUTES_MAX, restReachMeters, REST_REACH_KMH, gameRouteSeconds, settingsChangedKeys, createMissingCompanyWatch, foldText, useOwnRemaining, truckSizeSetting, TRUCK_SIZE_DEFAULT, deliverySummary, formatGameMinutes, holdDetectedMods, CAR_BRANDS, isDrivingCar, facilityCodesFor, projectAheadOnRoute, storedWaypoints, routePlanOffers, routePlanAction, syncAction, routePrefsOf, sameRoutePrefs, samePlanList, deviceInfo, voiceSpeaksHere, DLC_GUARDS, DLC_LIST, dlcGameOf, normalizeDlcOff, dlcBlockedGuards, effectiveDlcOff, mapBoundsFromCities, insideMapBounds, positionAtOrigin, createRecentManeuvers, RECENT_MANEUVERS_MAX, createVoiceGuide, voiceManeuverKey, VOICE_TIMINGS, VOICE_TIMING_DEFAULT, voiceTimingSetting, sideExitToward, otherBranchesAt, laneFromOnRamp, quietLanesAhead, pickVoice, voiceChoices, createFatigue, REST_INTERVAL_MINUTES, spreadEdgeShift, routeDrawShift, dropShortExcursions, taperShortSteps, cleanRouteForDrawing, COMPANY_ICON_PREFIX, companyIconToken, companyIconUrls, navZoomSetting, NAV_ZOOM_DEFAULT, NAV_ZOOM_MIN, NAV_ZOOM_MAX, routeHasLine, roadLineWidth, ROAD_WIDTH_GAME_M, ROAD_WIDTH_SHARE, layoutScaleFor, LAYOUT_SCALE_MIN, LAYOUT_SCALE_MAX, geoBearingDeg, gridHeadingToGeo, smoothLineCoords, roundTurnDistanceMeters, formatTurnDistance, formatTurnDistanceImperial, liveShareControls, liveShareChoice, tmpPlayersUpdate, TMP_PLAYERS_STALE_MS, TMP_PLAYERS_MAX, connectionViewFor, routeMetrics, junctionClusterEnd, junctionManeuver, turnAfterFork, ringThrough, leadsAway, oneWayRing, extraTurningDeg, ringOutline, roundish, detectRoundabout, detectManeuver, continuesTurn, stabilizeManeuver, createFuelTracker, gameClockFromMinutes, createTimeScale, createPaceEta, createSessionStats, decodePrefabsBin,
    createDemoTelemetry, DEMO_ROUTE, demoPathUsable, formatInt, formatDec, formatCargoMass, nextCityAlongRoute, groupSignsByPoint, buildPointGrid, nearestInGrid, roadSignForTurn, ROAD_SIGN_FORK_NEAR_M, exitSignTest, createScreenKeeper, noRouteReason, gameRouteDistanceText };
}

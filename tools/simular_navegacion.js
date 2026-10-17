// Simulaciones de manejo para buscar errores de ruteo, escala, avisos de giro,
// voz y rotondas (15-10).
//
// Un camion virtual recorre rutas reales (empresa a empresa) de cada variante
// con el codigo real de la app: findRouteWith y findUpcomingTurn salen de
// app.js (el mismo arnes que check_avisos.js), stabilizeManeuver,
// createVoiceGuide y createCityScale de pure.js. Acelera y frena segun las
// curvas y manda un dato cada 250 ms, como la telemetria. Lo que la app
// anuncia se compara contra una "verdad" armada aparte con la geometria del
// grafo (cuanto dobla la ruta en cada cruce y si habia otra salida).
//
// No es un test: lista sospechosos para mirar uno por uno. Los grafos se
// bajan de R2 (con el ?g= de la app) y quedan en --cache.
//
// Uso: node tools/simular_navegacion.js [--variantes ats,ets2] [--rutas 30]
//        [--semilla 1] [--salida carpeta] [--cache carpeta] [--carriles carpeta]
//        [--estados or,wa] [--destinos la,tx]
//
// --estados: solo empresas de esos estados (o paises en ETS2), por la
// sigla de EE.UU. o por el nombre de pois-<v>.json (countries). Con
// --destinos, la llegada es en esos otros y las rutas son todas largas
// (sin tope de distancia): un viaje de Oregon a Louisiana (Discord, 17-10).
// Cada "turn" anunciado queda en giros.json con su cruce (cuanto dobla,
// las otras salidas y su velocidad) para filtrarlos despues.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { harness, bajar, graphRev, timesRev, lanesRev, BASE } = require('./check_avisos');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'docs', 'data');
const PARSER_ROOT = process.env.PARSER_ROOT || 'D:\\ets2-companion';

function argumentos(argv) {
  const out = { variantes: 'ats,ets2', rutas: 30, semilla: 1, rotondas: 0, salida: null, cache: path.join(os.tmpdir(), 'truckdash-sim') };
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--(\w+)$/);
    if (m) out[m[1]] = argv[++i];
  }
  out.rutas = Number(out.rutas); out.semilla = Number(out.semilla);
  return out;
}

// --- geometria -------------------------------------------------------------
// Rumbo como la app: 0 al norte (-z), horario, + = a la derecha.
const rumbo = (p, q) => (Math.atan2(q[0] - p[0], -(q[1] - p[1])) * 180 / Math.PI + 360) % 360;
const normDeg = (d) => ((d + 540) % 360) - 180;
function metrica(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const pointAt = (d) => {
    if (d <= 0) return pts[0];
    let lo = 1, hi = pts.length - 1;
    if (d >= cum[hi]) return pts[hi];
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] >= d) hi = mid; else lo = mid + 1; }
    const seg = cum[lo] - cum[lo - 1], f = seg ? (d - cum[lo - 1]) / seg : 0;
    return [pts[lo - 1][0] + (pts[lo][0] - pts[lo - 1][0]) * f, pts[lo - 1][1] + (pts[lo][1] - pts[lo - 1][1]) * f];
  };
  // ultimo indice con cum <= d
  const indiceEn = (d) => {
    let lo = 0, hi = pts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cum[mid] <= d) lo = mid; else hi = mid - 1; }
    return lo;
  };
  return { cum, pointAt, indiceEn };
}

// Velocidad del camion a lo largo de la ruta (m/s cada 10 m): tope en recta,
// lo que permite la curva (aceleracion lateral 1,5 m/s2) y frenando/acelerando
// de a poco. Arranca y llega casi parado.
function perfilVelocidad(pts, cum, pointAt, vmax) {
  const L = cum[cum.length - 1], paso = 10, n = Math.max(2, Math.ceil(L / paso) + 1);
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const s = i * paso;
    const a = pointAt(s - 15), b = pointAt(s), c = pointAt(s + 15);
    const giro = Math.abs(normDeg(rumbo(b, c) - rumbo(a, b))) * Math.PI / 180;
    const k = giro / 15;
    v[i] = Math.max(3, Math.min(vmax, k > 1e-6 ? Math.sqrt(1.5 / k) : vmax));
  }
  v[0] = 3; v[n - 1] = 3;
  for (let i = n - 2; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * 1.2 * paso));
  for (let i = 1; i < n; i++) v[i] = Math.min(v[i], Math.sqrt(v[i - 1] ** 2 + 2 * 0.6 * paso));
  return (s) => v[Math.max(0, Math.min(n - 1, Math.round(s / paso)))];
}

// mulberry32. El LCG de check_avisos.js multiplica enteros de 31 bits en
// coma flotante (pasa 2^53), pierde precision y cae en ciclos cortos: las
// rutas se repetian y algunas variantes no llegaban a 10 distintas.
function lcg(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Duracion de un MP3 (las frases de la voz), sumando cuadros.
function mp3Segundos(buf) {
  let i = 0, seg = 0;
  if (buf.slice(0, 3).toString() === 'ID3') i = 10 + ((buf[6] & 0x7f) << 21 | (buf[7] & 0x7f) << 14 | (buf[8] & 0x7f) << 7 | (buf[9] & 0x7f));
  const BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) { i++; continue; }
    const ver = (buf[i + 1] >> 3) & 3, br = (buf[i + 2] >> 4) & 15, sr = (buf[i + 2] >> 2) & 3, pad = (buf[i + 2] >> 1) & 1;
    if (ver === 1 || br === 0 || br === 15 || sr === 3) { i++; continue; }
    const rate = SR[ver][sr], kbps = (ver === 3 ? BR1 : BR2)[br];
    const muestras = ver === 3 ? 1152 : 576;
    const largo = Math.floor((ver === 3 ? 144 : 72) * kbps * 1000 / rate) + pad;
    seg += muestras / rate;
    i += Math.max(1, largo);
  }
  return seg;
}

// --- datos -----------------------------------------------------------------
async function cargarVariante(v, cache, H) {
  fs.mkdirSync(cache, { recursive: true });
  const rev = graphRev();
  const archivo = async (nombre, url) => {
    const f = path.join(cache, nombre);
    if (!fs.existsSync(f)) fs.writeFileSync(f, await bajar(url));
    return fs.readFileSync(f);
  };
  const bin = await archivo(`${v}-v3-g${rev}.bin`, `${BASE}/${v}/route-graph-${v}-v3.bin?g=${rev}`);
  let cities = JSON.parse(await archivo(`${v}-Cities.json`, `${BASE}/${v}/Cities.json`));
  cities = Array.isArray(cities) ? cities : Object.values(cities);
  const decoded = H.mod.decodeRouteGraphBin(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
  const g = H.mod.buildRouteGraph(decoded);
  // Las decimas de cada arista, como loadRouteTimes: de R2 si la app las
  // pide (ROUTE_TIMES_REV), o de --tiempos <carpeta>/<v>/route-graph-<v>-times.bin
  // para probar unas que todavia no se subieron.
  const tiempos = argumentos(process.argv.slice(2)).tiempos;
  const ft = tiempos && path.join(tiempos, v, `route-graph-${v}-times.bin`);
  const tb = ft && fs.existsSync(ft) ? fs.readFileSync(ft)
    : timesRev() ? await archivo(`${v}-times-g${rev}-t${timesRev()}.bin`, `${BASE}/${v}/route-graph-${v}-times.bin?g=${rev}&t=${timesRev()}`) : null;
  if (tb) {
    g.edgeT = H.pure.decodeTimesBin(tb.buffer.slice(tb.byteOffset, tb.byteOffset + tb.byteLength), decoded.n, decoded.ne);
    if (!g.edgeT) throw new Error(`las decimas de ${v} no son de este grafo`);
  }
  // Los carriles, como loadRouteLanes: con ellos salen los "keep" de seguir
  // derecho donde un carril se pierde (laneKeepAt). De R2, o de --carriles
  // <carpeta>/<v>/route-graph-<v>-lanes.bin para probar unos sin subir.
  const carriles = argumentos(process.argv.slice(2)).carriles;
  const fl = carriles && path.join(carriles, v, `route-graph-${v}-lanes.bin`);
  const lb = fl && fs.existsSync(fl) ? fs.readFileSync(fl)
    : lanesRev() ? await archivo(`${v}-lanes-g${rev}-l${lanesRev()}.bin`, `${BASE}/${v}/route-graph-${v}-lanes.bin?g=${rev}&l=${lanesRev()}`) : null;
  const lanes = lb ? H.pure.decodeLanesBin(lb.buffer.slice(lb.byteOffset, lb.byteOffset + lb.byteLength), decoded.n, decoded.ne) : null;
  if (lb && !lanes) throw new Error(`los carriles de ${v} no son de este grafo`);
  const pois = JSON.parse(fs.readFileSync(path.join(DATA, `pois-${v}.json`), 'utf8'));
  // Pais de cada ciudad (mano izquierda en las islas) y a que ciudad es cada
  // caja de ciudad, del parser si esta a mano.
  let parserCities = [];
  const pdir = path.join(PARSER_ROOT, `parser-output-${v}`);
  for (const pre of ['usa', 'europe']) {
    const f = path.join(pdir, `${pre}-cities.json`);
    if (fs.existsSync(f)) parserCities = JSON.parse(fs.readFileSync(f, 'utf8'));
  }
  return { v, g, cities, pois, parserCities, lanes };
}

// Sigla de EE.UU. -> estado como lo nombra pois-<v>.json (countries).
const SIGLAS = { al: 'alabama', az: 'arizona', ar: 'arkansas', ca: 'california', co: 'colorado', ct: 'connecticut', dc: 'dc',
  fl: 'florida', ga: 'georgia', id: 'idaho', il: 'illinois', in: 'indiana', ia: 'iowa', ks: 'kansas', ky: 'kentucky',
  la: 'louisiana', me: 'maine', md: 'maryland', ma: 'massachusets', mi: 'michigan', mn: 'minnesota', ms: 'mississippi',
  mo: 'missouri', mt: 'montana', ne: 'nebraska', nv: 'nevada', nh: 'nhampshire', nj: 'njersey', nm: 'new_mexico',
  ny: 'newyork', nc: 'ncarolina', nd: 'ndakota', oh: 'ohio', ok: 'oklahoma', or: 'oregon', pa: 'pennsylvania',
  ri: 'rhodei', sc: 'scarolina', sd: 'south_dakota', tn: 'tennessee', tx: 'texas', ut: 'utah', vt: 'vermont',
  va: 'virginia', wa: 'washington', wv: 'wvirginia', wi: 'wisconsin', wy: 'wyoming' };
function listaEstados(txt) {
  if (!txt) return null;
  return new Set(String(txt).toLowerCase().split(',').map(x => x.trim()).filter(Boolean).map(x => SIGLAS[x] || x));
}

const MANO_IZQUIERDA = new Set(['uk', 'ireland', 'malta', 'cyprus', 'isle_of_man', 'jersey', 'guernsey', 'faroe']);

// Grilla de nodos para buscar el mas cercano rapido (la app recorre todos).
function grillaNodos(g, celda = 500) {
  const m = new Map();
  for (let i = 0; i < g.n; i++) {
    const k = `${Math.floor(g.nodes[2 * i] / celda)},${Math.floor(g.nodes[2 * i + 1] / celda)}`;
    let l = m.get(k); if (!l) m.set(k, l = []); l.push(i);
  }
  return (x, z, filtro) => {
    const cx = Math.floor(x / celda), cz = Math.floor(z / celda);
    let best = -1, bd = Infinity;
    for (let r = 0; r < 40; r++) {
      for (let i = cx - r; i <= cx + r; i++) for (let j = cz - r; j <= cz + r; j++) {
        if (Math.max(Math.abs(i - cx), Math.abs(j - cz)) !== r) continue;
        for (const n of m.get(`${i},${j}`) || []) {
          if (filtro && !filtro(n)) continue;
          const d = Math.hypot(g.nodes[2 * n] - x, g.nodes[2 * n + 1] - z);
          if (d < bd) { bd = d; best = n; }
        }
      }
      if (best !== -1 && bd < r * celda) break;
    }
    return { idx: best, dist: bd };
  };
}

function lineaArista(g, a, b) {
  const k = g.dirEdge(a, b);
  if (k === -1) return null;
  const e = g.adjEdge[k], line = [g.nodeXY(a)], mids = [];
  for (let m = g.midOff[e]; m < g.midOff[e + 1]; m++) mids.push([g.midXY[2 * m], g.midXY[2 * m + 1]]);
  if (g.adjRev[k]) mids.reverse();
  return line.concat(mids, [g.nodeXY(b)]);
}

// km/h de la arista a -> b (los segundos del grafo salen de la velocidad
// de la calle), o null
function velArista(g, a, b) {
  const k = g.dirEdge(a, b);
  if (k === -1) return null;
  const e = g.adjEdge[k], seg = g.edgeT ? g.edgeS[e] + g.edgeT[e] / 10 : g.edgeS[e];
  return seg > 0 ? Math.round(g.edgeM[e] / seg * 3.6) : null;
}

// --- la verdad de cada cruce ------------------------------------------------
// Grupos de nodos de cruce de la ruta (como la app: a menos de 50 m y hasta
// 100 m de largo), y si en el grupo habia otra salida de verdad (no darse
// vuelta, y que se aleje 80 m sin volver al cruce). Los grupos a menos de
// 60 m uno de otro forman una zona (hasta 250 m): en el centro de una ciudad
// el rumbo de entrada de un cruce cae adentro del anterior. Cuanto dobla la
// zona se mide de 60 a 20 m antes y de 20 a 60 m despues de ella.
// La app pide 120 m sin pisar la ruta (detectManeuver): un callejon sin
// salida de 80 a 120 m sale aca como otra salida, y la esquina, callada en la
// app, como giro_sin_aviso.
function verdadDeCruces(ctx, pts, met) {
  const { g, pure } = ctx;
  const { cum, pointAt } = met;
  const dirs = pure.routeArcDirections(g);
  const grupos = [];
  for (let i = 1; i < pts.length - 1; i++) {
    if (pts[i][3] !== 1) continue;
    const iEnd = pure.junctionClusterEnd(pts, cum, i, 50, 100);
    // nodos de la ruta del grupo, con el anterior y el siguiente
    const nodos = [];
    let kPrev = -1, kNext = -1;
    for (let k = i - 1; k >= 0; k--) if (pts[k][4] != null) { kPrev = k; break; }
    for (let k = i; k <= iEnd; k++) if (pts[k][4] != null) nodos.push(k);
    for (let k = iEnd + 1; k < pts.length; k++) if (pts[k][4] != null) { kNext = k; break; }
    const enGrupo = new Set(nodos.map(k => pts[k][4]));
    const cadena = [kPrev, ...nodos, kNext].filter(k => k >= 0);
    // todas las otras salidas (otra: la primera), con la velocidad de su
    // primer tramo
    const otras = [];
    const enIn = rumbo(pointAt(cum[i] - 40), pointAt(cum[i] - 5));
    for (let c = 1; c < cadena.length - 1; c++) {
      const u = pts[cadena[c - 1]][4], w = pts[cadena[c]][4], sig = pts[cadena[c + 1]][4];
      const kIn = g.dirEdge(u, w);
      for (let k2 = g.csr[w]; k2 < g.csr[w + 1]; k2++) {
        const n = g.adjTo[k2];
        if (n === sig || n === u || enGrupo.has(n)) continue;
        if (kIn !== -1 && pure.isUTurnArc(dirs, kIn, k2)) continue;
        const bloq = new Set([...enGrupo, u, sig]);
        if (!pure.leadsAway(g.adjacency, g.nodeXY, w, n, bloq, 80)) continue;
        // el rumbo a unos 40 m por la salida (el primer nodo de un prefab
        // puede estar pegado)
        const linea = lineaArista(g, w, n) || [g.nodeXY(w), g.nodeXY(n)];
        const ml = metrica(linea), lejos = ml.pointAt(Math.min(40, ml.cum[ml.cum.length - 1]));
        otras.push({ node: n, rumbo: normDeg(rumbo(g.nodeXY(w), lejos) - enIn), kmh: velArista(g, w, n), m: Math.round(ml.cum[ml.cum.length - 1]) });
      }
    }
    grupos.push({ i, iEnd, otra: otras[0] || null, otras });
    i = iEnd;
  }
  // cuanto dobla cada grupo, con ventanas que no se meten en los vecinos (o
  // null si no hay 10 m libres de cada lado)
  for (let q = 0; q < grupos.length; q++) {
    const gr = grupos[q];
    const a0 = Math.max(cum[gr.i] - 40, q > 0 ? cum[grupos[q - 1].iEnd] + 3 : -Infinity), a1 = cum[gr.i] - 3;
    const b0 = cum[gr.iEnd] + 3, b1 = Math.min(cum[gr.iEnd] + 40, q + 1 < grupos.length ? cum[grupos[q + 1].i] - 3 : Infinity);
    gr.delta = a1 - a0 >= 10 && b1 - b0 >= 10 ? normDeg(rumbo(pointAt(b0), pointAt(b1)) - rumbo(pointAt(a0), pointAt(a1))) : null;
  }
  const zonas = [];
  for (const gr of grupos) {
    const z = zonas[zonas.length - 1];
    if (z && cum[gr.i] - cum[z.iEnd] < 60 && cum[gr.iEnd] - cum[z.i] < 250) { z.iEnd = gr.iEnd; z.grupos.push(gr); }
    else zonas.push({ i: gr.i, iEnd: gr.iEnd, grupos: [gr] });
  }
  for (const z of zonas) {
    const enIn = rumbo(pointAt(cum[z.i] - 60), pointAt(cum[z.i] - 20));
    const enOut = rumbo(pointAt(cum[z.iEnd] + 20), pointAt(cum[z.iEnd] + 60));
    z.delta = normDeg(enOut - enIn);
    z.otra = (z.grupos.find(gr => gr.otra) || {}).otra || null;
    z.otras = z.grupos.flatMap(gr => gr.otras);
  }
  return zonas;
}

// La rotonda que empieza en el nodo de entrada (indice kEnter en la ruta):
// el anillo (de un sentido) o el prefab compacto, y la salida contada por
// angulo alrededor del centro, en el sentido en que se circula. Es otra
// cuenta que la de detectRoundabout (que camina el anillo nodo por nodo o
// ordena las salidas del prefab por el largo de su curva).
function salidaPorAngulo(ctx, pts, kEnter, manoIzq) {
  const { g, pure } = ctx;
  let kPrev = -1;
  for (let k = kEnter - 1; k >= 0; k--) if (pts[k][4] != null) { kPrev = k; break; }
  if (kPrev < 0) return null;
  const u = pts[kPrev][4], v = pts[kEnter][4];
  let ring = null;
  for (const [maxM, depth, budget] of [[700, 40, 300], [1500, 80, 600]]) {
    const r = pure.oneWayRing(g.adjacency, g.nodeXY, v, u, maxM, depth, budget);
    if (r && r.length >= 4 && pure.roundish(pure.ringOutline(r, g.nodeXY, (a, b) => lineaArista(g, a, b)), 1.3)) { ring = r; break; }
  }
  const ang = (p, c) => Math.atan2(-(p[1] - c[1]), p[0] - c[0]) * 180 / Math.PI;
  const dirs = pure.routeArcDirections(g);
  const kIn = g.dirEdge(u, v);
  if (ring) {
    const set = new Set(ring);
    const contorno = pure.ringOutline(ring, g.nodeXY, (a, b) => lineaArista(g, a, b));
    const c = [contorno.reduce((s, p) => s + p[0], 0) / contorno.length, contorno.reduce((s, p) => s + p[1], 0) / contorno.length];
    // sentido de giro del anillo (orden de oneWayRing = sentido de las aristas)
    let area = 0;
    for (let k = 0; k < ring.length; k++) {
      const p = g.nodeXY(ring[k]), q = g.nodeXY(ring[(k + 1) % ring.length]);
      area += p[0] * (-q[1]) - q[0] * (-p[1]);
    }
    const antihorario = area > 0;
    const barrido = (w) => { const d = antihorario ? ang(g.nodeXY(w), c) - ang(g.nodeXY(v), c) : ang(g.nodeXY(v), c) - ang(g.nodeXY(w), c); return ((d % 360) + 360) % 360; };
    // salidas de cada nodo del anillo
    const brazos = [];
    for (const w of ring) {
      for (let k2 = g.csr[w]; k2 < g.csr[w + 1]; k2++) {
        const n = g.adjTo[k2];
        if (set.has(n) || n === u) continue;
        if (w === v && kIn !== -1 && pure.isUTurnArc(dirs, kIn, k2)) continue;
        if (!pure.leadsAway(g.adjacency, g.nodeXY, w, n, set, 120)) continue;
        brazos.push({ w, n, barrido: barrido(w) });
      }
    }
    // por donde sale la ruta
    let sale = null;
    for (let k = kEnter; k < pts.length; k++) {
      if (pts[k][4] == null) continue;
      if (!set.has(pts[k][4])) { sale = pts[k][4]; break; }
    }
    let wSale = null;
    for (let k = kEnter, prev = null; k < pts.length; k++) {
      if (pts[k][4] == null) continue;
      if (!set.has(pts[k][4])) { wSale = prev; break; }
      prev = pts[k][4];
    }
    if (sale == null || wSale == null) return { tipo: 'anillo', exit: null, brazos: brazos.length, motivo: 'no sale' };
    const bSale = barrido(wSale);
    // una por nodo, como se ven en la calle (dos brazos del mismo nodo: 2)
    const antes = new Set();
    for (const b of brazos) if (b.barrido < bSale - 0.5 && !(b.w === wSale)) antes.add(`${b.w}>${b.n}`);
    const mismoNodo = brazos.filter(b => b.w === wSale && b.n !== sale).length;
    return { tipo: 'anillo', exit: antes.size + 1, mismoNodo, brazos: brazos.length, radio: Math.hypot(g.nodeXY(v)[0] - c[0], g.nodeXY(v)[1] - c[1]), antihorario };
  }
  // prefab compacto
  let kNext = -1;
  for (let k = kEnter + 1; k < pts.length; k++) if (pts[k][4] != null) { kNext = k; break; }
  if (kNext < 0) return null;
  const b = pts[kNext][4];
  const outs = (g.adjacency.get(v) || []).filter(([n]) => n !== u);
  if (outs.length < 2) return null;
  const prefab = new Set([v, ...outs.map(([n]) => n)]);
  const salidas = outs.filter(([n]) => n === b || pure.leadsAway(g.adjacency, g.nodeXY, n, n, prefab, 120));
  const todos = [v, ...outs.map(([n]) => n)].map(n => g.nodeXY(n));
  const c = [todos.reduce((s, p) => s + p[0], 0) / todos.length, todos.reduce((s, p) => s + p[1], 0) / todos.length];
  const antihorario = !manoIzq;
  const barrido = (n) => { const d = antihorario ? ang(g.nodeXY(n), c) - ang(g.nodeXY(v), c) : ang(g.nodeXY(v), c) - ang(g.nodeXY(n), c); return ((d % 360) + 360) % 360; };
  const orden = salidas.map(([n, m]) => ({ n, m, barrido: barrido(n) })).sort((x, y) => x.barrido - y.barrido);
  return { tipo: 'prefab', exit: orden.findIndex(o => o.n === b) + 1, brazos: salidas.length, porLargo: salidas.slice().sort((x, y) => x[1] - y[1]).findIndex(([n]) => n === b) + 1, antihorario };
}

// --- manejar una ruta --------------------------------------------------------
function manejar(ctx, pts, opciones) {
  const { H, g, pure, escala, duraciones } = ctx;
  const met = metrica(pts);
  const { cum, pointAt, indiceEn } = met;
  const L = cum[cum.length - 1];
  const vel = perfilVelocidad(pts, cum, pointAt, opciones.vmax);
  const dt = 0.25;
  const voz = pure.createVoiceGuide({ timing: 'normal' });
  const state = {};
  let s = 0, h = 0, t = 0;
  let behind = [];
  let cur = pts;
  const ticks = [];
  const maniobras = new Map(); // identidad -> registro
  const vozEventos = [];
  while (s < L - 1 && t < 4 * 3600) {
    const sNuevo = Math.min(L, s + Math.max(vel(s), 0.5) * dt);
    const v = vel(sNuevo);
    H.mod.set(g, cur, behind);
    const crudo = H.mod.findUpcomingTurn();
    const turn = pure.stabilizeManeuver(state, crudo, 2);
    const clave = turn ? voz.maneuver(turn, v * 3.6) : null;
    // como la app: lo que falta y la distancia al giro sobre la ruta entera
    const medir = escala.routeMeters ? (max) => escala.routeMeters(pts, cur, max) : (max) => escala.pathMeters(cur, max);
    const tick = { t, s, v, rem: medir() };
    if (turn) {
      const id = pure.turnIdentity(turn);
      const metros = medir(turn.distanceMeters);
      tick.id = id; tick.d = turn.distanceMeters; tick.m = metros;
      tick.txt = pure.formatTurnDistance(metros, false, 'en');
      let r = maniobras.get(id);
      if (!r) {
        maniobras.set(id, r = { id, kind: turn.kind, direction: turn.direction, exit: turn.exit, node: turn.node,
          primero: { t, s, d: turn.distanceMeters, v, m: metros }, distancias: [], voces: [], decoy: false });
      }
      r.ultimo = { t, s, d: turn.distanceMeters, m: metros };
      r.distancias.push([s, turn.distanceMeters, metros]);
      if (turn.decoyMeters > 0) r.decoy = true;
      if (r.kind !== turn.kind || r.direction !== turn.direction || r.exit !== turn.exit) r.cambio = `${r.kind}/${r.direction}/${r.exit} -> ${turn.kind}/${turn.direction}/${turn.exit}`;
      if (clave) r.voces.push({ clave, t, d: turn.distanceMeters, v });
    }
    if (crudo) tick.crudo = { id: pure.turnIdentity(crudo), kind: crudo.kind, direction: crudo.direction, exit: crudo.exit, node: crudo.node, d: crudo.distanceMeters };
    if (clave) vozEventos.push({ clave, t, dur: duraciones[clave] || 1.5, id: tick.id });
    ticks.push(tick);
    // recortar lo recorrido (trimRouteBehindTruck)
    const hn = indiceEn(sNuevo);
    // como trimRouteBehindTruck: en el primer recorte, tambien el comienzo de la ruta
    for (let k = behind.length ? h + 1 : h; k <= hn; k++) behind.push(pts[k]);
    const shown = state.shown;
    behind = pure.trimRouteBehind(behind, 200, 400, shown && shown.kind === 'roundabout' ? shown.node : null);
    const aca = pointAt(sNuevo), sig = pts[Math.min(hn + 1, pts.length - 1)];
    cur = [[aca[0], aca[1], 0, 0, null, sig[5] != null ? sig[5] : 0, sig[6]], ...pts.slice(hn + 1)];
    h = hn; s = sNuevo; t += dt;
    if (cur.length < 2) break;
  }
  return { met, ticks, maniobras, vozEventos, L };
}

// --- analisis ---------------------------------------------------------------
function analizarRuta(ctx, ruta, hallazgos) {
  const { pure, g } = ctx;
  const { pts, nombre } = ruta;
  const sim = manejar(ctx, pts, { vmax: ctx.vmax });
  const { met, ticks, maniobras, vozEventos } = sim;
  const { cum } = met;
  const add = (tipo, datos) => hallazgos.push({ tipo, variante: ctx.v, ruta: nombre, ...datos });
  const xy = (p) => `(${Math.round(p[0])},${Math.round(p[1])})`;

  // indice en la ruta de cada nodo (por coordenada redondeada)
  const porXY = new Map();
  pts.forEach((p, k) => { if (p[4] != null) { const key = `${Math.round(p[0])},${Math.round(p[1])}`; if (!porXY.has(key)) porXY.set(key, []); porXY.get(key).push(k); } });
  const indiceDe = (node, desdeS) => {
    const l = porXY.get(`${Math.round(node[0])},${Math.round(node[1])}`) || [];
    return l.find(k => cum[k] >= desdeS - 1) ?? l[l.length - 1] ?? -1;
  };

  // 1. maniobras mostradas: donde, cuando aparecieron, voz
  const lista = [];
  for (const r of maniobras.values()) {
    r.k = indiceDe(r.node, r.primero.s);
    if (r.k < 0) continue;
    r.sNodo = cum[r.k];
    r.pasada = r.ultimo.s >= r.sNodo - 30 || r.ultimo.d < 30;
    lista.push(r);
  }

  // 2. la verdad de los cruces y si se anunciaron
  const cruces = verdadDeCruces(ctx, pts, met);
  // rotondas mostradas: la entrada y la salida (detectRoundabout sobre la ruta entera)
  const tramosRotonda = [];
  const edgeLine = (a, b) => lineaArista(g, a, b);
  const bearingBetween = (p, q) => rumbo(p, q);
  for (const r of lista) {
    if (r.kind !== 'roundabout') continue;
    const iEnd = pure.junctionClusterEnd(pts, cum, r.k, 50, 100);
    const rb = pure.detectRoundabout({ pts, cum, i: r.k, iEnd, adjacency: g.adjacency, nodeAt: g.nodeXY, edgeLine, bearingBetween });
    if (rb) { tramosRotonda.push([cum[rb.enter] - 60, cum[rb.leave] + 60]); r.leave = rb.leave; }
    else tramosRotonda.push([r.sNodo - 60, r.sNodo + 120]);
  }
  for (const c of cruces) {
    const s0 = cum[c.i] - 45, s1 = cum[c.iEnd] + 45;
    c.avisos = lista.filter(r => r.sNodo >= s0 && r.sNodo <= s1);
    c.rotonda = tramosRotonda.some(([a, b]) => cum[c.i] <= b && cum[c.iEnd] >= a);
    const ultimoTick = ticks[ticks.length - 1];
    if (cum[c.iEnd] + 60 > ultimoTick.s) continue; // la ruta termina antes
    if (cum[c.i] < 100) { c.arranque = true; continue; } // la ventana de entrada cae antes de la ruta
    if (!c.avisos.length && !c.rotonda && c.otra && Math.abs(c.delta) >= 60) {
      add('giro_sin_aviso', { donde: xy(pts[c.i]), dobla: Math.round(c.delta), otraSalida: Math.round(c.otra.rumbo), km: (cum[c.i] / 1000).toFixed(2), cruces: c.grupos.length });
    } else if (c.avisos.length && !c.rotonda) {
      // zona con avisos: un cruce de la zona que dobla fuerte, con otra
      // salida, lejos de todo aviso (dos giros seguidos avisados como uno)
      for (const gr of c.grupos) {
        if (!gr.otra || gr.delta == null) continue;
        // una decision: dobla y la otra salida va para el otro lado
        const decision = Math.abs(gr.delta) >= 35 && Math.sign(gr.otra.rumbo) !== Math.sign(gr.delta);
        if (Math.abs(gr.delta) < 60 && !decision) continue;
        if (c.avisos.some(r => r.sNodo >= cum[gr.i] - 60 && r.sNodo <= cum[gr.iEnd] + 60)) continue;
        add(Math.abs(gr.delta) >= 60 ? 'giro_sin_aviso_en_zona' : 'decision_sin_aviso_en_zona', { donde: xy(pts[gr.i]), dobla: Math.round(gr.delta), otraSalida: Math.round(gr.otra.rumbo), avisosDeLaZona: c.avisos.map(r => `${r.kind} ${r.direction} a ${Math.round(Math.abs(r.sNodo - cum[gr.i]))} m`).join('; ') });
      }
    }
  }
  // 3. maniobras mostradas contra la verdad
  for (const r of lista) {
    const c = cruces.find(c => r.sNodo >= cum[c.i] - 45 && r.sNodo <= cum[c.iEnd] + 45);
    if (!c) continue;
    r.verdad = c;
    if (r.kind === 'roundabout' || c.rotonda || c.arranque) continue;
    const solo = c.avisos.length === 1;
    const signo = r.direction === 'left' ? -1 : 1;
    // corta: de 15 a 3 m antes y de 3 a 15 m despues (una horquilla antes del
    // cruce engana a la larga)
    const dCorta = normDeg(rumbo(met.pointAt(cum[c.iEnd] + 3), met.pointAt(cum[c.iEnd] + 15)) - rumbo(met.pointAt(cum[c.i] - 15), met.pointAt(cum[c.i] - 3)));
    if (solo && Math.abs(c.delta) >= 45 && Math.sign(c.delta) !== signo && Math.abs(dCorta) >= 30 && Math.sign(dCorta) !== signo) {
      add('sentido_al_reves', { donde: xy(r.node), dice: `${r.kind} ${r.direction}`, dobla: Math.round(c.delta), doblaCerca: Math.round(dCorta) });
    }
    if (solo && r.kind === 'turn' && Math.abs(c.delta) < 15) {
      add('giro_en_recta', { donde: xy(r.node), dice: `turn ${r.direction}`, dobla: Math.round(c.delta), otraSalida: c.otra ? Math.round(c.otra.rumbo) : null });
    }
    if (solo && !c.otra && Math.abs(c.delta) < 30) {
      add('aviso_sin_opcion', { donde: xy(r.node), dice: `${r.kind} ${r.direction}`, dobla: Math.round(c.delta) });
    }
    // "turn" en una esquina o curva sin otro camino: la calle dobla sola
    // (Discord, 17-10: "turn right" donde no hay a donde doblar, en Oregon)
    if (solo && r.kind === 'turn' && !c.otra && Math.abs(c.delta) >= 30) {
      add('giro_sin_otra_salida', { donde: xy(r.node), dice: `turn ${r.direction}`, dobla: Math.round(c.delta), doblaCerca: Math.round(dCorta) });
    }
    if (r.kind === 'turn' && ctx.giros) {
      // el rumbo de la ruta de 150 a 60 m antes y de 60 a 150 m despues: si
      // la calle ya venia doblando o sigue doblando, es una curva larga
      const R = (a, b) => rumbo(met.pointAt(a), met.pointAt(b));
      const antes = normDeg(R(cum[c.i] - 60, cum[c.i] - 20) - R(cum[c.i] - 150, cum[c.i] - 60));
      const despues = normDeg(R(cum[c.iEnd] + 60, cum[c.iEnd] + 150) - R(cum[c.iEnd] + 20, cum[c.iEnd] + 60));
      const nodo = (desde, hasta, paso) => { for (let k = desde; paso > 0 ? k <= hasta : k >= hasta; k += paso) if (pts[k][4] != null) return pts[k][4]; return null; };
      const nAntes = nodo(c.i - 1, 0, -1), nI = nodo(c.i, c.iEnd, 1), nF = nodo(c.iEnd, c.i, -1), nDespues = nodo(c.iEnd + 1, pts.length - 1, 1);
      ctx.giros.push({ variante: ctx.v, ruta: nombre, donde: xy(r.node), dice: r.direction, solo, km: +(r.sNodo / 1000).toFixed(2),
        dobla: Math.round(c.delta), doblaCerca: Math.round(dCorta), antes: Math.round(antes), despues: Math.round(despues),
        largoZona: Math.round(cum[c.iEnd] - cum[c.i]), cruces: c.grupos.length,
        kmhEntra: nAntes != null && nI != null ? velArista(g, nAntes, nI) : null,
        kmhSale: nF != null && nDespues != null ? velArista(g, nF, nDespues) : null,
        otras: c.otras.map(o => ({ rumbo: Math.round(o.rumbo), kmh: o.kmh, m: o.m })), decoy: r.decoy });
    }
  }
  // 4. avisos tarde, que cambian o que desaparecen, y voz
  for (const r of lista) {
    if (!r.pasada) {
      // se dejo de mostrar sin llegar: lo reemplazo otra cosa antes del nodo
      const sigueRuta = ticks[ticks.length - 1].s > r.sNodo;
      if (sigueRuta && r.verdad && r.verdad.otra && Math.abs(r.verdad.delta) >= 45) {
        add('aviso_desaparece', { donde: xy(r.node), dice: `${r.kind} ${r.direction}${r.exit ? ' ' + r.exit : ''}`, ultimaDist: Math.round(r.ultimo.d), dobla: Math.round(r.verdad.delta) });
      }
      continue;
    }
    const seg = r.primero.d / Math.max(r.primero.v, 1);
    if (r.verdad && !r.verdad.arranque && r.primero.s > 150 && r.verdad.otra && Math.abs(r.verdad.delta) >= 45 && seg < 5) {
      add('aviso_tarde', { donde: xy(r.node), dice: `${r.kind} ${r.direction}`, aparecioA: Math.round(r.primero.d), segundos: +seg.toFixed(1), kmh: Math.round(r.primero.v * 3.6) });
    }
    if (r.cambio) add('aviso_cambia', { donde: xy(r.node), cambio: r.cambio });
    const ahora = r.voces.find(x => !x.clave.startsWith('soon_'));
    if (!ahora && !r.decoy) add('voz_sin_aviso_en_el_punto', { donde: xy(r.node), dice: `${r.kind} ${r.direction}${r.exit ? ' ' + r.exit : ''}`, primero: Math.round(r.primero.d), ultimo: Math.round(r.ultimo.d), voces: r.voces.map(x => x.clave).join(',') });
    if (!ahora && r.decoy) add('voz_callada_por_otra_calle', { donde: xy(r.node), dice: `${r.kind} ${r.direction}`, ultimo: Math.round(r.ultimo.d) });
    if (ahora && ahora.d > 160) add('voz_temprano', { donde: xy(r.node), clave: ahora.clave, metros: Math.round(ahora.d), kmh: Math.round(ahora.v * 3.6) });
    if (r.kind === 'roundabout' && r.exit > 5) add('rotonda_mas_de_5_salidas', { donde: xy(r.node), exit: r.exit, voz: r.voces.map(x => x.clave).join(',') });
  }
  // aviso que sigue en pantalla despues de pasar su nodo (3 datos seguidos o
  // mas: uno es el anti-parpadeo), casi siempre con la distancia de otro
  // cruce a menos de 40 m (stabilizeManeuver los toma como el mismo)
  const porId = new Map(lista.map(r => [r.id, r]));
  const rachas = new Map();
  for (let k = 0; k < ticks.length; k++) {
    const tk = ticks[k];
    const r = tk.id ? porId.get(tk.id) : null;
    const viejo = r && tk.crudo && tk.crudo.id !== tk.id && tk.s >= r.sNodo + 3;
    if (!viejo) continue;
    const clave = tk.id + '>' + tk.crudo.id;
    const ra = rachas.get(clave) || { n: 0, r, crudo: tk.crudo, ultimo: -2 };
    ra.n = ra.ultimo === k - 1 ? ra.n + 1 : 1;
    ra.max = Math.max(ra.max || 0, ra.n);
    ra.ultimo = k;
    rachas.set(clave, ra);
  }
  for (const ra of rachas.values()) {
    if (ra.max < 3) continue;
    const r = ra.r, c = ra.crudo;
    // del mismo lado se fusiona a proposito (keep -> turn en un mismo cruce)
    const igual = r.direction === c.direction;
    add(igual ? 'aviso_pegado_mismo' : 'aviso_pegado_distinto', { donde: xy(r.node), muestra: `${r.kind} ${r.direction}${r.exit ? ' ' + r.exit : ''}`, deVerdad: `${c.kind} ${c.direction}${c.exit ? ' ' + c.exit : ''}`, a: Math.round(c.d), separacion: Math.round(Math.hypot(r.node[0] - c.node[0], r.node[1] - c.node[1])), datos: ra.max });
  }
  // De a una frase, como speakVoice (voiceQueueAction): la que llega
  // mientras suena otra espera, salvo un aviso en el punto contra uno
  // anticipado. Un aviso en el punto que espera mas de 1,5 s llega tarde.
  let suenaHasta = -1, suena = null;
  for (const e of vozEventos) {
    if (suena && e.t < suenaHasta && pure.voiceQueueAction(suena, e.clave) === 'queue') {
      const espera = suenaHasta - e.t;
      if (pure.voiceIsUrgent(e.clave) && espera > 1.5) add('voz_demorada', { clave: e.clave, detrasDe: suena, espera: +espera.toFixed(2) });
      suenaHasta += e.dur;
    } else {
      suenaHasta = e.t + e.dur;
    }
    suena = e.clave;
  }
  // 5. escala: lo que falta y la distancia al giro no tienen que subir
  const enFerry = (d) => { const k = met.indiceEn(d); return pts[Math.min(k + 1, pts.length - 1)][2] === 1; };
  for (let k = 1; k < ticks.length; k++) {
    const a = ticks[k - 1], b = ticks[k];
    if (enFerry(a.s) || enFerry(b.s)) continue;
    if (b.rem > a.rem + 300) {
      const p = met.pointAt(b.s);
      add(b.rem > a.rem + 1500 ? 'falta_sube_mas_de_1500m' : 'falta_sube', { donde: xy(p), antes: +(a.rem / 1000).toFixed(2), despues: +(b.rem / 1000).toFixed(2), km: (b.s / 1000).toFixed(2), enCaja: ctx.escala.at(p[0], p[1]) !== ctx.escala.outside });
    }
    // (la distancia de mundo tambien sube adentro de una rotonda, que pasa a
    // medirse hasta la salida, o con el segundo giro de un mismo cruce: no
    // es la escala)
    if (a.id && a.id === b.id && b.m > a.m * 1.15 + 50 && b.d <= a.d + 1) {
      add('distancia_al_giro_sube', { donde: xy(met.pointAt(b.s)), id: a.id, antes: a.txt, despues: b.txt, mundoAntes: Math.round(a.d), mundoDespues: Math.round(b.d) });
    }
  }
  // 6. rotondas: salida contada de otra forma
  for (const r of lista) {
    if (r.kind !== 'roundabout' || !r.pasada) continue;
    const verdad = salidaPorAngulo(ctx, pts, r.k, ctx.manoIzq(r.node));
    if (!verdad || verdad.exit == null) { add('rotonda_sin_verificar', { donde: xy(r.node), exit: r.exit, motivo: verdad ? verdad.motivo : 'sin anillo ni prefab' }); continue; }
    ctx.rotondas.push({ v: ctx.v, donde: xy(r.node), app: r.exit, angulo: verdad.exit, tipo: verdad.tipo, brazos: verdad.brazos, dobla: r.verdad ? Math.round(r.verdad.delta) : null });
    if (verdad.exit !== r.exit) add('rotonda_salida_distinta', { donde: xy(r.node), app: r.exit, porAngulo: verdad.exit, tipo: verdad.tipo, brazos: verdad.brazos, mismoNodo: verdad.mismoNodo, porLargo: verdad.porLargo });
  }
  return { sim, lista, cruces };
}

// --- ruteo ------------------------------------------------------------------
function costoRuta(g, path, byTime = true) {
  let c = 0;
  for (let k = 1; k < path.length; k++) {
    const d = g.dirEdge(path[k - 1], path[k]);
    if (d === -1) return NaN;
    c += byTime ? g.edgeS[g.adjEdge[d]] : g.edgeM[g.adjEdge[d]];
  }
  return c;
}
function nodosDeRuta(pts) { return pts.filter(p => p[4] != null).map(p => p[4]); }

function revisarRuteo(ctx, ruta, hallazgos) {
  const { g, pure, H, escala, rnd } = ctx;
  const { pts, nombre, desde, hasta } = ruta;
  const add = (tipo, datos) => hallazgos.push({ tipo, variante: ctx.v, ruta: nombre, ...datos });
  const xy = (p) => `(${Math.round(p[0])},${Math.round(p[1])})`;
  const camino = nodosDeRuta(pts);
  const dirs = pure.routeArcDirections(g);
  // vueltas en U que quedaron
  let us = 0;
  for (let k = 2; k < camino.length; k++) {
    const a = g.dirEdge(camino[k - 2], camino[k - 1]), b = g.dirEdge(camino[k - 1], camino[k]);
    if (a !== -1 && b !== -1 && !(g.edgeF[g.adjEdge[a]] & 1) && !(g.edgeF[g.adjEdge[b]] & 1) && pure.isUTurnArc(dirs, a, b)) {
      us++;
      add('vuelta_en_u', { donde: xy(g.nodeXY(camino[k - 1])) });
    }
  }
  // Atajo salteado: la ruta va de a a b pasando por n teniendo la arista
  // a -> b directa. Con los segundos del grafo redondeados a entero, dos
  // curvas de prefab de 34 m (3 s + 3 s) empatan con la recta de 63 m (6 s)
  // y la ruta hace una V por el nodo de un brazo del cruce, con un "turn
  // left" donde se sigue derecho (Fort Dodge, ATS).
  for (let k = 2; k < camino.length; k++) {
    const a = camino[k - 2], n = camino[k - 1], b = camino[k];
    const d = g.dirEdge(a, b);
    if (d === -1 || a === b) continue;
    const ea = g.adjEdge[g.dirEdge(a, n)], eb = g.adjEdge[g.dirEdge(n, b)], ed = g.adjEdge[d];
    const seg = (e) => (g.edgeT ? g.edgeS[e] + g.edgeT[e] / 10 : g.edgeS[e]);
    const via = seg(ea) + seg(eb), directa = seg(ed);
    if (via > directa) continue;
    ctx.stats.atajos = (ctx.stats.atajos || 0) + 1;
    add('atajo_salteado', { donde: xy(g.nodeXY(n)), via: `${g.edgeM[ea].toFixed(0)}+${g.edgeM[eb].toFixed(0)} m = ${via.toFixed(1)} s`, directa: `${g.edgeM[ed].toFixed(0)} m = ${directa.toFixed(1)} s` });
  }
  // el A* de la app contra Dijkstra (heuristica 0): si da mas caro, la
  // heuristica no es admisible con los segundos redondeados del grafo
  const real = (i) => g.componentSize[g.componentId[i]] >= 300;
  const ini = ctx.cercano(desde[0], desde[1], real).idx, fin = ctx.cercano(hasta[0], hasta[1], real).idx;
  const ex = g.nodes[2 * fin], ey = g.nodes[2 * fin + 1];
  const opts = (h) => ({ cost: (e) => g.edgeS[e], heuristic: h, blocked: null, isFerry: (e) => (g.edgeF[e] & 1) === 1 });
  const aEstrella = pure.findArcRoute(g, ini, fin, opts((i) => Math.hypot(g.nodes[2 * i] - ex, g.nodes[2 * i + 1] - ey) / 25));
  if (!aEstrella) add('sin_ruta_por_aristas', { desde: xy(desde), hasta: xy(hasta) });
  if (ctx.dijkstra && aEstrella) {
    const dj = pure.findArcRoute(g, ini, fin, opts(() => 0));
    const ca = costoRuta(g, aEstrella), cd = costoRuta(g, dj);
    ctx.optimo.push(ca / cd);
    if (ca > cd * 1.01 + 5) add('astar_no_optimo', { desde: xy(desde), hasta: xy(hasta), astar: ca, dijkstra: cd, extra: `${((ca / cd - 1) * 100).toFixed(1)} %` });
  }
  // rodeo: largo de la ruta contra la recta
  const met = metrica(pts);
  const largo = met.cum[met.cum.length - 1], recta = Math.hypot(desde[0] - hasta[0], desde[1] - hasta[1]);
  if (recta > 1000 && largo / recta > 2.5) add('rodeo_grande', { desde: xy(desde), hasta: xy(hasta), largo: Math.round(largo), recta: Math.round(recta), factor: +(largo / recta).toFixed(2) });
  // Recalcular en mitad de la ruta (desvio, destino nuevo): el camion va por
  // la ruta, corrido 2,5 m a su carril, y se pide la ruta otra vez desde ahi.
  const L = met.cum[met.cum.length - 1];
  for (let j = 0; j < ctx.recalculos && L > 3000; j++) {
    const s = 1000 + rnd() * (L - 2000);
    const enFerry = (d) => { const k = met.indiceEn(d); return pts[Math.min(k + 1, pts.length - 1)][2] === 1; };
    if (enFerry(s) || enFerry(s - 300) || enFerry(s + 300)) continue;
    const p = met.pointAt(s), q = met.pointAt(s + 5);
    const rb = rumbo(p, q) * Math.PI / 180;
    // sobre su carril: el corrimiento con que la app dibuja la ruta (p[6],
    // + a la derecha); en las curvas de prefab, que ya son carriles, 0
    const sig = pts[Math.min(met.indiceEn(s) + 1, pts.length - 1)];
    const lado = Number.isFinite(sig[6]) ? sig[6] : 0;
    // a la derecha del rumbo: (cos, -sin) en x,z con el norte en -z
    const x = p[0] + Math.cos(rb) * lado, z = p[1] + Math.sin(rb) * lado;
    H.mod.set(g, null, []);
    // como la app andando: con el rumbo (findRouteWith lo ignora si es vieja)
    const nueva = H.mod.findRouteWith([x, z], hasta, null, rumbo(p, q));
    ctx.stats.recalculos++;
    if (!nueva) { add('recalculo_sin_ruta', { donde: xy([x, z]) }); continue; }
    const cerca = pure.projectAheadOnRoute(nueva, x, z, 400);
    const mn = metrica(nueva);
    let peor = null;
    if (cerca) {
      const a = nueva[cerca.idx], b = nueva[Math.min(cerca.idx + 1, nueva.length - 1)];
      const dif = Math.abs(normDeg(rumbo(a, b) - rumbo(p, q)));
      if (cerca.dist > 200) peor = { motivo: 'fuera_de_la_ruta_nueva', dist: Math.round(cerca.dist) };
      else if (dif > 100 && Math.hypot(b[0] - a[0], b[1] - a[1]) > 1) peor = { motivo: 'ruta_nueva_para_atras', dif: Math.round(dif), dist: Math.round(cerca.dist) };
    }
    const resto = pts.slice(met.indiceEn(s) + 1);
    const restoJuego = escala.pathMeters([[p[0], p[1]], ...resto]);
    const nuevaJuego = escala.pathMeters([[x, z], ...nueva]);
    const nodo0 = nueva[0];
    const info = { donde: xy([x, z]), nodoInicial: xy(nodo0), aNodo: Math.round(Math.hypot(nodo0[0] - x, nodo0[1] - z)),
      restoKm: +(restoJuego / 1000).toFixed(1), nuevaKm: +(nuevaJuego / 1000).toFixed(1) };
    if (peor) { ctx.stats.recalculoMal++; add(`recalculo_${peor.motivo}`, { ...info, ...peor }); }
    else if (nuevaJuego > restoJuego * 1.15 + 2000) { ctx.stats.recalculoMal++; add('recalculo_mas_largo', info); }
  }
  return { us };
}

// --- escala (resumen por ruta) ----------------------------------------------
function escalaDeRuta(ctx, pts) {
  const { g, escala } = ctx;
  const fuera = escala.outside;
  let mundo = 0, conCaja = 0, sinHueco = 0, autopistaEnCiudad = 0;
  const camino = pts;
  for (let k = 1; k < camino.length; k++) {
    const p = camino[k - 1], q = camino[k];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (!(len > 0)) continue;
    mundo += len;
    const n = Math.max(1, Math.ceil(len / 50));
    // velocidad de la arista (90 km/h = autopista)
    let rapida = false;
    if (q[4] != null) {
      let kp = k - 1; while (kp > 0 && camino[kp][4] == null) kp--;
      if (camino[kp][4] != null) {
        const d = g.dirEdge(camino[kp][4], q[4]);
        if (d !== -1) { const e = g.adjEdge[d]; rapida = g.edgeS[e] > 0 && g.edgeM[e] / g.edgeS[e] > 22; }
      }
    }
    for (let j = 0; j < n; j++) {
      const f = (j + 0.5) / n, x = p[0] + (q[0] - p[0]) * f, z = p[1] + (q[1] - p[1]) * f;
      const e = escala.at(x, z);
      sinHueco += len / n * e;
      if (e !== fuera && rapida) autopistaEnCiudad += len / n * (fuera - e);
    }
  }
  const total = escala.pathMeters(pts);
  return { mundo, juego: total, juegoPlano: mundo * fuera, hueco: total - sinHueco, autopistaEnCiudad };
}

// --- rotondas ----------------------------------------------------------------
// Busca rotondas en el grafo (anillos redondos de un sentido y prefabs
// compactos, con los mismos criterios que detectRoundabout) y maneja de cada
// brazo de entrada a cada brazo de salida: la app tiene que anunciar
// "roundabout" en la entrada y la salida tiene que ser la contada por angulo.
function buscarRotondas(ctx, max) {
  const { g, pure, rnd } = ctx;
  const edgeLine = (a, b) => lineaArista(g, a, b);
  const enAnillo = new Uint8Array(g.n);
  const anillos = [];
  // entradas de cada nodo (CSR al reves)
  const entra = Array.from({ length: g.n }, () => null);
  for (let i = 0; i < g.n; i++) for (let k = g.csr[i]; k < g.csr[i + 1]; k++) { const j = g.adjTo[k]; (entra[j] || (entra[j] = [])).push(i); }
  ctx.entra = entra;
  const orden = Array.from({ length: g.n }, (_, i) => i);
  for (let i = orden.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [orden[i], orden[j]] = [orden[j], orden[i]]; }
  const prefabs = [];
  for (const v of orden) {
    if (anillos.length >= max && prefabs.length >= max) break;
    if (enAnillo[v] || g.degree[v] < 3) continue;
    const outs = g.adjacency.get(v);
    if (anillos.length < max) {
      const r = pure.oneWayRing(g.adjacency, g.nodeXY, v, -1, 700, 40, 300);
      if (r && r.length >= 4 && pure.roundish(pure.ringOutline(r, g.nodeXY, edgeLine), 1.3)) {
        for (const n of r) enAnillo[n] = 1;
        anillos.push(r);
        continue;
      }
    }
    if (prefabs.length < max && outs.length >= 3 && outs.every(([, m]) => m <= 150)) {
      const rodean = outs.filter(([n]) => { const l = edgeLine(v, n); return l && pure.extraTurningDeg(l, rumbo) >= 90; });
      if (rodean.length >= 2 && pure.roundish([v, ...outs.map(([n]) => n)].map(g.nodeXY), 1.7)) prefabs.push(v);
    }
  }
  return { anillos, prefabs };
}

// Un punto a ~metros por la calle desde n, alejandose de `evitar` (hacia
// adelante por las salidas, o hacia atras por las entradas).
function caminar(ctx, n, evitar, metros, atras) {
  const { g } = ctx;
  // centro de lo que se evita (la rotonda): se elige siempre el vecino que
  // mas se aleja de el, para no meterse en el otro carril del mismo brazo
  const ps = [...evitar].map(g.nodeXY);
  const c = [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length];
  const lejos = (m) => { const p = g.nodeXY(m); return Math.hypot(p[0] - c[0], p[1] - c[1]); };
  let cur = n, prev = -1, hecho = 0;
  const vistos = new Set([n]);
  for (let paso = 0; paso < 40 && hecho < metros; paso++) {
    const vec = (atras ? (ctx.entra[cur] || []) : g.adjacency.get(cur).map(([m]) => m)).filter(m => m !== prev && !evitar.has(m) && !vistos.has(m));
    if (!vec.length) break;
    const sig = vec.reduce((a, b) => (lejos(b) > lejos(a) ? b : a));
    if (lejos(sig) < lejos(cur) - 5) break;
    const a = g.nodeXY(cur), b = g.nodeXY(sig);
    hecho += Math.hypot(b[0] - a[0], b[1] - a[1]);
    vistos.add(sig);
    prev = cur; cur = sig;
  }
  return hecho >= 40 ? g.nodeXY(cur) : null;
}

function revisarRotondas(ctx, hallazgos, max, porRotonda) {
  const { g, H, pure } = ctx;
  const { anillos, prefabs } = buscarRotondas(ctx, max);
  const add = (tipo, datos) => hallazgos.push({ tipo, variante: ctx.v, ...datos });
  const xy = (p) => `(${Math.round(p[0])},${Math.round(p[1])})`;
  const casos = [];
  for (const r of anillos) {
    const set = new Set(r);
    const entradas = [], salidas = [];
    for (const w of r) {
      for (const u of ctx.entra[w] || []) if (!set.has(u)) entradas.push([u, w]);
      for (const [n] of g.adjacency.get(w)) if (!set.has(n) && pure.leadsAway(g.adjacency, g.nodeXY, w, n, set, 120)) salidas.push([w, n]);
    }
    for (const [u, v] of entradas) for (const [w, n] of salidas) if (n !== u) casos.push({ tipo: 'anillo', set, u, v, w, n });
  }
  for (const v of prefabs) {
    const outs = g.adjacency.get(v).map(([n]) => n);
    const set = new Set([v, ...outs]);
    for (const u of ctx.entra[v] || []) {
      if (outs.includes(u) && !(ctx.entra[u] || []).some(x => !set.has(x))) continue;
      for (const n of outs) if (n !== u) casos.push({ tipo: 'prefab', set, u, v, w: v, n });
    }
  }
  // hasta porRotonda casos por rotonda
  const cuenta = new Map();
  let probados = 0, anunciadas = 0, iguales = 0;
  const resumen = { anillos: anillos.length, prefabs: prefabs.length, casos: 0, rutaPorOtroLado: 0, sinAviso: 0, salidaDistinta: 0, bien: 0, porTipo: {} };
  for (const c of casos) {
    const k = c.tipo === 'anillo' ? [...c.set][0] : c.v;
    if ((cuenta.get(k) || 0) >= porRotonda) continue;
    const ini = caminar(ctx, c.u, c.set, 150, true), fin = caminar(ctx, c.n, c.set, 150, false);
    if (!ini || !fin) continue;
    H.mod.set(g, null, []);
    const pts = H.mod.findRouteWith(ini, fin, null);
    if (!pts) continue;
    const nodos = pts.map(p => p[4]);
    const iu = nodos.indexOf(c.u), iv = nodos.indexOf(c.v), iw = nodos.lastIndexOf(c.w), inn = nodos.lastIndexOf(c.n);
    if (iu < 0 || iv !== iu + 1 && !(iv > iu && pts.slice(iu + 1, iv).every(p => p[4] == null)) || iw < iv || inn < iw) { resumen.rutaPorOtroLado++; continue; }
    cuenta.set(k, (cuenta.get(k) || 0) + 1);
    resumen.casos++;
    probados++;
    const sim = manejar(ctx, pts, { vmax: ctx.vmax });
    const vxy = g.nodeXY(c.v);
    const avisos = [...sim.maniobras.values()].filter(r => Math.hypot(r.node[0] - vxy[0], r.node[1] - vxy[1]) < 60);
    const rot = avisos.find(r => r.kind === 'roundabout');
    const verdad = salidaPorAngulo(ctx, pts, iv, ctx.manoIzq(vxy));
    const tipoV = verdad ? verdad.tipo : c.tipo;
    const t = resumen.porTipo[tipoV] || (resumen.porTipo[tipoV] = { casos: 0, sinAviso: 0, distinta: 0 });
    t.casos++;
    const base = { donde: xy(vxy), tipoRotonda: c.tipo, entra: xy(g.nodeXY(c.u)), sale: xy(g.nodeXY(c.n)) };
    if (!rot) {
      resumen.sinAviso++; t.sinAviso++;
      add('rotonda_sin_aviso', { ...base, dijo: avisos.map(r => `${r.kind} ${r.direction}`).join(', ') || 'nada', porAngulo: verdad && verdad.exit });
      volcarEntorno(ctx, { ...base, tipo: 'rotonda_sin_aviso', variante: ctx.v }, pts, [...sim.maniobras.values()], ctx.dirDibujos, 8);
      continue;
    }
    anunciadas++;
    // la voz dijo la salida que se mostro
    const vozSalida = rot.voces.find(x => /^roundabout_/.test(x.clave));
    if (rot.exit <= 5 && (!vozSalida || vozSalida.clave !== `roundabout_${rot.exit}`)) add('rotonda_voz', { ...base, exit: rot.exit, voces: rot.voces.map(x => x.clave).join(',') });
    if (!verdad || verdad.exit == null) continue;
    if (verdad.exit === rot.exit) { iguales++; resumen.bien++; continue; }
    resumen.salidaDistinta++; t.distinta++;
    add('rotonda_salida_distinta', { ...base, app: rot.exit, porAngulo: verdad.exit, brazos: verdad.brazos, mismoNodo: verdad.mismoNodo, porLargo: verdad.porLargo });
    volcarEntorno(ctx, { ...base, tipo: 'rotonda_salida_distinta', variante: ctx.v, app: rot.exit, porAngulo: verdad.exit }, pts, [...sim.maniobras.values()], ctx.dirDibujos, 10);
  }
  void probados; void anunciadas; void iguales;
  return resumen;
}

// --- dibujos -----------------------------------------------------------------
// El entorno de un hallazgo (calles, ruta, cajas de ciudad y avisos) en un
// JSON para tools/dibujar_simulacion.py. Hasta `limite` por tipo y variante.
function volcarEntorno(ctx, h, pts, lista, dir, limite) {
  const m = String(h.donde || '').match(/\((-?\d+),(-?\d+)\)/);
  if (!m) return;
  const clave = `${h.variante}-${h.tipo}`;
  ctx.dibujados[clave] = (ctx.dibujados[clave] || 0) + 1;
  if (ctx.dibujados[clave] > limite) return;
  const { g } = ctx;
  const cx = Number(m[1]), cz = Number(m[2]), r = h.tipo.startsWith('falta') || h.tipo.startsWith('distancia') ? 700 : 220;
  const edges = [];
  const vistos = new Set();
  for (let i = 0; i < g.n; i++) {
    const x = g.nodes[2 * i], z = g.nodes[2 * i + 1];
    if (Math.abs(x - cx) > r * 1.5 || Math.abs(z - cz) > r * 1.5) continue;
    for (let k = g.csr[i]; k < g.csr[i + 1]; k++) {
      const e = g.adjEdge[k];
      if (vistos.has(e)) continue;
      vistos.add(e);
      const a = g.adjRev[k] ? g.adjTo[k] : i, b = g.adjRev[k] ? i : g.adjTo[k];
      edges.push({ line: lineaArista(g, a, b), oneway: (g.edgeF[e] & 2) ? 1 : 0, deg: [g.degree[a], g.degree[b]] });
    }
  }
  const route = pts.filter(p => Math.abs(p[0] - cx) < r * 1.5 && Math.abs(p[1] - cz) < r * 1.5).map(p => [p[0], p[1], p[3]]);
  const man = (lista || []).filter(x => Math.abs(x.node[0] - cx) < r * 1.5 && Math.abs(x.node[1] - cz) < r * 1.5)
    .map(x => [x.node[0], x.node[1], x.kind, x.direction, x.exit || null]);
  const cajas = (ctx.pois.areas || []).filter(a => a[0] < cx + r * 1.5 && a[0] + a[2] > cx - r * 1.5 && a[1] < cz + r * 1.5 && a[1] + a[3] > cz - r * 1.5);
  const titulo = `${h.variante} ${h.tipo} ${h.ruta || ''} ${JSON.stringify(Object.fromEntries(Object.entries(h).filter(([k]) => !['tipo', 'variante', 'ruta'].includes(k))))}`;
  const nombre = `${clave}-${ctx.dibujados[clave]}.json`;
  fs.writeFileSync(path.join(dir, nombre), JSON.stringify({ titulo, center: [cx, cz, r], edges, route, man, cajas }));
}

// --- mapeo (sin manejar) ----------------------------------------------------
function revisarMapa(ctx, hallazgos) {
  const { g, pois, escala } = ctx;
  const add = (tipo, datos) => hallazgos.push({ tipo, variante: ctx.v, ...datos });
  const real = (i) => g.componentSize[g.componentId[i]] >= 300;
  let lejos = 0, enCaja = 0;
  const distancias = [];
  for (const c of pois.companies) {
    const { idx, dist } = ctx.cercano(c[0], c[1], real);
    distancias.push(dist);
    if (escala.at(c[0], c[1]) !== escala.outside) enCaja++;
    if (dist > 250) { lejos++; if (lejos <= 15) add('empresa_lejos_del_grafo', { empresa: `${c[2]}@${c[4]}`, donde: `(${Math.round(c[0])},${Math.round(c[1])})`, metros: Math.round(dist), nodo: idx }); }
  }
  distancias.sort((a, b) => a - b);
  const grandes = (pois.areas || []).filter(a => a[2] > 4000 || a[3] > 4000);
  for (const a of grandes.slice(0, 10)) add('caja_de_ciudad_enorme', { caja: a.map(Math.round).join(',') });
  return {
    empresas: pois.companies.length, empresasLejos: lejos, empresasEnCaja: enCaja,
    medianaAlGrafo: Math.round(distancias[Math.floor(distancias.length / 2)] || 0),
    p95AlGrafo: Math.round(distancias[Math.floor(distancias.length * 0.95)] || 0),
    cajas: (pois.areas || []).length, cajasEnormes: grandes.length,
  };
}

// --- main -------------------------------------------------------------------
async function main() {
  const args = argumentos(process.argv.slice(2));
  const H = harness();
  const pure = H.pure;
  const salida = args.salida || path.join(os.tmpdir(), 'truckdash-sim-salida');
  fs.mkdirSync(salida, { recursive: true });
  const dibujos = path.join(salida, 'entornos');
  fs.rmSync(dibujos, { recursive: true, force: true });
  fs.mkdirSync(dibujos, { recursive: true });
  // duracion de cada frase (voz en ingles, Kristin)
  const catalogo = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'app', 'voice', 'voices.json'), 'utf8'));
  const voz = catalogo.voices.find(x => x.id === 'en-kristin');
  const paquete = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'app', 'voice', voz.file), 'utf8'));
  const duraciones = {};
  for (const [k, src] of Object.entries(paquete.clips)) duraciones[k] = mp3Segundos(Buffer.from(src.split(',')[1], 'base64'));
  const hallazgos = [];
  const giros = [];
  const resumen = {};
  const rotondas = [];
  for (const v of args.variantes.split(',')) {
    const t0 = Date.now();
    const datos = await cargarVariante(v, args.cache, H);
    const { g, pois, cities, parserCities } = datos;
    H.mod.setLanes(datos.lanes);
    const escala = pure.createCityScale(pois.areas, { outside: v.startsWith('ets2') ? 19 : 20 });
    const cercano = grillaNodos(g);
    // mano izquierda: el pais de la ciudad mas cercana (parser)
    const ciudadesPais = parserCities.filter(c => c.countryToken).map(c => [c.x, c.y, c.countryToken]);
    const manoIzq = (p) => {
      let best = null, bd = Infinity;
      for (const c of ciudadesPais) { const d = Math.hypot(c[0] - p[0], c[1] - p[1]); if (d < bd) { bd = d; best = c[2]; } }
      return best != null && MANO_IZQUIERDA.has(best);
    };
    const ctx = { v, H, g, pure, pois, escala, cercano, manoIzq, duraciones, rotondas, dibujados: {},
      vmax: v.startsWith('ets2') ? 24 : 27, rnd: lcg(args.semilla * 7919 + v.length), dijkstra: true, recalculos: 4,
      optimo: [], stats: { rutas: 0, sinRuta: 0, recalculos: 0, recalculoMal: 0, ticks: 0, maniobras: 0, voces: 0 } };
    const mapa = revisarMapa(ctx, hallazgos);
    // rutas: empresa a empresa, 1 de cada 3 corta (adentro o cerca de una
    // ciudad); con --estados, de esos estados, y con --destinos, todas
    // largas hacia esos otros
    const rnd = lcg(args.semilla + v.length * 131);
    const estados = listaEstados(args.estados), destinos = listaEstados(args.destinos) || estados;
    const deEstados = (set) => (set ? pois.companies.filter(e => set.has((pois.countries || {})[e[4]])) : pois.companies);
    const emp = deEstados(estados), llegadas = deEstados(destinos);
    if (!emp.length || !llegadas.length) throw new Error(`${v}: no hay empresas en ${args.estados}${args.destinos ? ' / ' + args.destinos : ''}`);
    const lejos = !!args.destinos;
    ctx.giros = [];
    const escalas = [];
    const pares = new Set();
    for (let r = 0, intentos = 0; r < args.rutas && intentos < args.rutas * 200; intentos++) {
      const a = emp[Math.floor(rnd() * emp.length)], b = llegadas[Math.floor(rnd() * llegadas.length)];
      const par = `${a[2]}@${a[4]}>${b[2]}@${b[4]}`;
      if (pares.has(par)) continue;
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const corta = !lejos && r % 3 === 2;
      if (lejos ? d < 2500 : corta ? (d < 300 || d > 2500) : (d < 2500 || d > 14000)) continue;
      r++;
      pares.add(par);
      const nombre = `${a[2]}@${a[4]} -> ${b[2]}@${b[4]}`;
      H.mod.set(g, null, []);
      const pts = H.mod.findRouteWith([a[0], a[1]], [b[0], b[1]], null);
      ctx.stats.rutas++;
      if (!pts || pts.length < 3) { ctx.stats.sinRuta++; hallazgos.push({ tipo: 'sin_ruta', variante: v, ruta: nombre }); continue; }
      const ruta = { pts, nombre, desde: [a[0], a[1]], hasta: [b[0], b[1]] };
      const antes = hallazgos.length;
      revisarRuteo(ctx, ruta, hallazgos);
      const res = analizarRuta(ctx, ruta, hallazgos);
      for (let k = antes; k < hallazgos.length; k++) volcarEntorno(ctx, hallazgos[k], pts, res.lista, dibujos, Number(args.dibujos || 6));
      ctx.stats.ticks += res.sim.ticks.length;
      ctx.stats.maniobras += res.lista.length;
      ctx.stats.voces += res.sim.vozEventos.length;
      ctx.stats.kmMundo = +((ctx.stats.kmMundo || 0) + res.sim.L / 1000).toFixed(1);
      escalas.push({ ruta: nombre, ...escalaDeRuta(ctx, pts) });
      process.stdout.write('.');
    }
    ctx.dirDibujos = dibujos;
    const rotondasRes = Number(args.rotondas) > 0 ? revisarRotondas(ctx, hallazgos, Number(args.rotondas), Number(args.porRotonda || 6)) : null;
    const sum = (f) => escalas.reduce((s, e) => s + f(e), 0);
    const opt = ctx.optimo.slice().sort((a, b) => a - b);
    resumen[v] = {
      ...ctx.stats, mapa,
      astarPeorQueDijkstra: opt.filter(x => x > 1.0001).length, astarPeorFactor: opt.length ? +opt[opt.length - 1].toFixed(4) : null,
      escala: {
        kmMundo: +(sum(e => e.mundo) / 1000).toFixed(1), kmJuego: +(sum(e => e.juego) / 1000).toFixed(1),
        kmJuegoTodoAfuera: +(sum(e => e.juegoPlano) / 1000).toFixed(1), kmPorHuecos: +(sum(e => e.hueco) / 1000).toFixed(1),
        kmMenosPorAutopistaEnCiudad: +(sum(e => e.autopistaEnCiudad) / 1000).toFixed(1),
        peoresAutopistaEnCiudad: escalas.slice().sort((a, b) => b.autopistaEnCiudad - a.autopistaEnCiudad).slice(0, 3)
          .map(e => ({ ruta: e.ruta, km: +(e.juego / 1000).toFixed(1), menosKm: +(e.autopistaEnCiudad / 1000).toFixed(1) })),
      },
      rotondas: rotondasRes,
      segundos: Math.round((Date.now() - t0) / 1000),
    };
    console.log(`\n${v}: ${JSON.stringify(resumen[v])}`);
    giros.push(...ctx.giros);
  }
  const porTipo = {};
  for (const h of hallazgos) porTipo[`${h.variante}:${h.tipo}`] = (porTipo[`${h.variante}:${h.tipo}`] || 0) + 1;
  fs.writeFileSync(path.join(salida, 'hallazgos.json'), JSON.stringify(hallazgos, null, 1));
  fs.writeFileSync(path.join(salida, 'giros.json'), JSON.stringify(giros, null, 1));
  fs.writeFileSync(path.join(salida, 'resumen.json'), JSON.stringify({ args, resumen, porTipo, rotondas, duraciones }, null, 1));
  console.log('\nPor tipo:');
  for (const [k, n] of Object.entries(porTipo).sort()) console.log(`  ${k}: ${n}`);
  console.log(`\nSalida: ${salida}`);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(2); });
module.exports = { lcg, listaEstados, buscarRotondas, argumentos, cargarVariante, metrica, rumbo, normDeg, perfilVelocidad, manejar, verdadDeCruces, salidaPorAngulo, lineaArista, grillaNodos, escalaDeRuta, mp3Segundos };

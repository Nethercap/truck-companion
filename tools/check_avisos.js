// Avisos de giro de rutas fijas contra una lista guardada (tools/avisos-golden.json).
//
// Por que: un cambio en detectManeuver/findUpcomingTurn cambia lo que el
// tablero anuncia en miles de cruces y los tests de pure.js solo miran casos
// armados a mano. El 10-10 la regla del carril con isleta convirtio en
// "turn left" la salida a la derecha de los treboles y nadie lo vio hasta
// que un usuario lo reporto. Esto recorre rutas reales de ATS y ETS2 con el
// codigo real de app.js y muestra cada aviso que cambia.
//
// El grafo se baja de R2. Si cambio (otro hash), no falla: avisa que hay que
// regenerar la lista, porque un grafo nuevo cambia avisos a proposito. Si el
// grafo es el mismo y los avisos cambian, es el codigo: falla y los lista.
//
// Uso: node tools/check_avisos.js            compara
//      node tools/check_avisos.js --update   reescribe la lista (revisar el diff)
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'docs', 'app');
const GOLDEN = path.join(__dirname, 'avisos-golden.json');
const BASE = 'https://maps.trucksim-dash.com';
const VARIANTS = { ats: 25, ets2: 25 };
const SEED = 20261010;

function harness() {
  const src = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
  const pure = require(path.join(APP, 'pure.js'));
  const extract = (name, kw = 'function') => {
    const start = src.indexOf(`\n${kw} ${name}`);
    if (start < 0) throw new Error(`check_avisos: no encuentro ${kw} ${name} en app.js (se renombro? actualizar este script)`);
    let i = src.indexOf('{', start), depth = 0;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) break;
    }
    return src.slice(start, i + 1);
  };
  const consts = src.split('\n').filter(l => /^const (NAV_[A-Z_]+|ROUTE_BEHIND_[A-Z_]+|MIN_REAL_COMPONENT_NODES) = [-0-9]/.test(l)).join('\n');
  const propias = new Set(['geoBearingDeg']);
  const code = [
    consts,
    /const MIN_REAL_COMPONENT_NODES/.test(consts) ? '' : 'const MIN_REAL_COMPONENT_NODES = 300;',
    extract('decodeRouteGraphBin'), extract('buildRouteGraph'), extract('nearestNodeIndex'),
    extract('MinHeap', 'class'), extract('findRouteWith'), extract('findUpcomingTurn'),
    `const { ${Object.keys(pure).filter(k => !propias.has(k)).join(', ')} } = pure;`,
    'const nearestRoadName = () => null;',
    'const normDeg = (d) => ((d + 540) % 360) - 180;',
    'const toLngLat = (x, z) => [x, -z];',
    'const geoBearingDeg = (a, b, c, d) => (Math.atan2(c - a, d - b) * 180 / Math.PI + 360) % 360;',
    `return { decodeRouteGraphBin, buildRouteGraph, findRouteWith, findUpcomingTurn,
      set: (g, cur, behind) => { routeGraph = g; currentRouteWorldPoints = cur; routeBehind = behind; } };`,
  ].join('\n');
  const mod = new Function('pure', 'let routeGraph = null, currentRouteWorldPoints = null, routeBehind = []; const routeProfile = "fastest";\n' + code)(pure);
  const behindMax = Number((src.match(/const ROUTE_BEHIND_MAX = (\d+)/) || [])[1]) || 32;
  return { mod, pure, behindMax };
}

async function bajar(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function simular({ mod, pure, behindMax }, g, cities, n) {
  let seed = SEED;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const out = [];
  for (let r = 0, intentos = 0; r < n && intentos < n * 50; intentos++) {
    const a = cities[Math.floor(rnd() * cities.length)], b = cities[Math.floor(rnd() * cities.length)];
    const d = Math.hypot(a.X - b.X, a.Y - b.Y);
    if (d < 1500 || d > 12000) continue;
    r++;
    mod.set(g, null, []);
    const pts = mod.findRouteWith([a.X, a.Y], [b.X, b.Y], null);
    const ruta = { from: a.Name, to: b.Name, man: [] };
    out.push(ruta);
    if (!pts) continue;
    const state = {}, vistos = new Set();
    for (let h = 0; h < pts.length - 2; h++) {
      const [ax, az] = pts[h], [bx, bz] = pts[h + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 25));
      for (let s = 0; s < steps; s++) {
        const f = s / steps;
        const here = [ax + (bx - ax) * f, az + (bz - az) * f, 0, 0, null, pts[h + 1][5], pts[h + 1][6]];
        mod.set(g, [here, ...pts.slice(h + 1)], pts.slice(Math.max(0, h + 1 - behindMax), h + 1));
        const turn = pure.stabilizeManeuver(state, mod.findUpcomingTurn(), 2);
        if (!turn) continue;
        const item = [turn.kind, turn.direction || null, Math.round(turn.node[0]), Math.round(turn.node[1])];
        if (turn.exit != null) item.push(turn.exit);
        const key = item.join('|');
        if (!vistos.has(key)) { vistos.add(key); ruta.man.push(item); }
      }
    }
  }
  return out;
}

function diferencias(viejo, nuevo) {
  const out = [];
  for (let r = 0; r < Math.max(viejo.length, nuevo.length); r++) {
    const A = (viejo[r] || {}).man || [], B = (nuevo[r] || {}).man || [];
    const nombre = `${(nuevo[r] || viejo[r]).from} -> ${(nuevo[r] || viejo[r]).to}`;
    const k = (m) => m.join('|');
    const sa = new Set(A.map(k)), sb = new Set(B.map(k));
    for (const m of A) if (!sb.has(k(m))) out.push(`  - ${nombre}: ${m[0]} ${m[1] || ''} en (${m[2]},${m[3]})${m[4] != null ? ' salida ' + m[4] : ''}`);
    for (const m of B) if (!sa.has(k(m))) out.push(`  + ${nombre}: ${m[0]} ${m[1] || ''} en (${m[2]},${m[3]})${m[4] != null ? ' salida ' + m[4] : ''}`);
  }
  return out;
}

async function main() {
  const update = process.argv.includes('--update');
  const golden = fs.existsSync(GOLDEN) ? JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) : { variants: {} };
  const h = harness();
  const nuevo = { variants: {} };
  let falla = false;
  for (const [v, n] of Object.entries(VARIANTS)) {
    const bin = await bajar(`${BASE}/${v}/route-graph-${v}-v3.bin`);
    const cities = JSON.parse(await bajar(`${BASE}/${v}/Cities.json`));
    const sha = crypto.createHash('sha256').update(bin).digest('hex').slice(0, 16);
    const g = h.mod.buildRouteGraph(h.mod.decodeRouteGraphBin(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)));
    const rutas = simular(h, g, Array.isArray(cities) ? cities : Object.values(cities), n);
    const total = rutas.reduce((s, r) => s + r.man.length, 0);
    nuevo.variants[v] = { graph: sha, routes: rutas };
    const g0 = golden.variants[v];
    if (!g0) { console.log(`${v}: sin lista guardada (${total} avisos en ${rutas.length} rutas)`); continue; }
    const diff = diferencias(g0.routes, rutas);
    if (g0.graph !== sha) {
      console.log(`${v}: el grafo de R2 cambio (${g0.graph} -> ${sha}); ${diff.length} avisos distintos. Regenerar con --update y revisar el diff.`);
      continue;
    }
    if (diff.length) {
      falla = true;
      console.log(`${v}: ${diff.length} avisos cambiaron con el mismo grafo (es el codigo):`);
      for (const linea of diff.slice(0, 80)) console.log(linea);
      if (diff.length > 80) console.log(`  ... y ${diff.length - 80} mas`);
    } else {
      console.log(`${v}: ${total} avisos en ${rutas.length} rutas, iguales a la lista`);
    }
  }
  if (update) {
    fs.writeFileSync(GOLDEN, JSON.stringify(nuevo, null, 0).replace(/\{"from"/g, '\n{"from"') + '\n');
    console.log(`lista reescrita: ${path.relative(ROOT, GOLDEN)}`);
    return;
  }
  if (falla) {
    console.log('\nSi el cambio es a proposito: node tools/check_avisos.js --update y commitear la lista con el cambio.');
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(2); });

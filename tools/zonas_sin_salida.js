// Zonas del grafo de ruteo de las que no se sale o a las que no se entra por
// el sentido de sus aristas (carriles de prefab que quedaron de un solo
// sentido al armar el grafo), y las empresas que caen adentro: desde o
// hacia ellas no hay ruta por el grafo (la web arranca o termina en el nodo
// mas cercano que sirve, routeReachability en pure.js). El simulador no las
// ve: las rutas al azar casi nunca pasan por ahi.
//
// Uso: node tools/zonas_sin_salida.js [variante ...] [--min 5] [--grafos carpeta]
// Por defecto ats y ets2. Los grafos se bajan de R2 con el ?g= de la app
// (bajar de check_avisos: con TRUCKDASH_MAPS_KEY fuera del navegador).
// --grafos <carpeta>: el de <carpeta>/<v>/route-graph-<v>-v3.bin y su
// Cities.json (como el simulador: la carpeta r2-upload-<v> del taller),
// para medir uno regenerado antes de subirlo.
// Correrlo despues de regenerar un grafo: lo ideal es 0 zonas con empresas.
'use strict';
const fs = require('fs');
const path = require('path');
const { harness, bajar, graphRev, BASE } = require('./check_avisos');

const DATA = path.join(__dirname, '..', 'docs', 'data');

async function revisar(h, v, minNodos, grafos) {
  const bin = grafos ? fs.readFileSync(path.join(grafos, v, `route-graph-${v}-v3.bin`))
    : await bajar(`${BASE}/${v}/route-graph-${v}-v3.bin?g=${graphRev()}`);
  let cities = JSON.parse(grafos ? fs.readFileSync(path.join(grafos, v, 'Cities.json'), 'utf8')
    : await bajar(`${BASE}/${v}/Cities.json`));
  cities = Array.isArray(cities) ? cities : Object.values(cities);
  const g = h.mod.buildRouteGraph(h.mod.decodeRouteGraphBin(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)));
  const { inMain, reachesMain, reachFromMain } = h.pure.routeReachability(g);
  const n = g.n;
  // nodos de la componente gigante (sin sentido) que no estan en la fuerte mayor
  const malo = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (!inMain[i] && g.componentId[i] === g.giantComponent) malo[i] = 1;
  // zonas: nodos malos vecinos entre si
  const vecinos = Array.from({ length: n }, () => []);
  for (let u = 0; u < n; u++) {
    for (let k = g.csr[u]; k < g.csr[u + 1]; k++) { vecinos[u].push(g.adjTo[k]); vecinos[g.adjTo[k]].push(u); }
  }
  const zona = new Int32Array(n).fill(-1);
  const zonas = [];
  for (let s = 0; s < n; s++) {
    if (!malo[s] || zona[s] !== -1) continue;
    const z = { nodos: 0, sinSalida: 0, sinEntrada: 0, x: 0, y: 0, empresas: [] };
    const cola = [s];
    zona[s] = zonas.length;
    while (cola.length) {
      const u = cola.pop();
      z.nodos++; z.x += g.nodes[2 * u]; z.y += g.nodes[2 * u + 1];
      if (reachFromMain[u] && !reachesMain[u]) z.sinSalida++;
      if (reachesMain[u] && !reachFromMain[u]) z.sinEntrada++;
      for (const w of vecinos[u]) if (malo[w] && zona[w] === -1) { zona[w] = zonas.length; cola.push(w); }
    }
    z.x /= z.nodos; z.y /= z.nodos;
    zonas.push(z);
  }
  // empresas cuyo nodo mas cercano (como la app) cae en una zona
  const pois = JSON.parse(fs.readFileSync(path.join(DATA, `pois-${v}.json`), 'utf8'));
  for (const c of pois.companies) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < n; i++) {
      if (g.componentSize[g.componentId[i]] < 300) continue;
      const d = (g.nodes[2 * i] - c[0]) ** 2 + (g.nodes[2 * i + 1] - c[1]) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0 && malo[best]) zonas[zona[best]].empresas.push(`${c[2]}@${c[4]}`);
  }
  const ciudad = (x, y) => {
    let best = null, bd = Infinity;
    for (const c of cities) { const d = Math.hypot(c.X - x, c.Y - y); if (d < bd) { bd = d; best = c.Name; } }
    return `${best} (${(bd / 1000).toFixed(1)} km)`;
  };
  const lista = zonas.filter(z => z.nodos >= minNodos || z.empresas.length)
    .sort((a, b) => b.empresas.length - a.empresas.length || b.nodos - a.nodos);
  const conEmpresas = lista.reduce((t, z) => t + z.empresas.length, 0);
  console.log(`${v}: ${lista.length} zonas (${minNodos}+ nodos o con empresas), ${conEmpresas} empresas adentro`);
  for (const z of lista) {
    const tipo = z.sinSalida >= z.sinEntrada ? (z.sinSalida ? 'sin salida' : 'aislada') : 'sin entrada';
    console.log(`  ${tipo}, ${z.nodos} nodos, cerca de ${ciudad(z.x, z.y)} (${Math.round(z.x)},${Math.round(z.y)})`
      + (z.empresas.length ? `: ${z.empresas.join(' ')}` : ''));
  }
  return conEmpresas;
}

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--min');
  const minNodos = i >= 0 ? Number(args.splice(i, 2)[1]) : 5;
  const j = args.indexOf('--grafos');
  const grafos = j >= 0 ? args.splice(j, 2)[1] : null;
  const variantes = args.length ? args : ['ats', 'ets2'];
  const h = harness();
  for (const v of variantes) await revisar(h, v, minNodos, grafos);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(2); });

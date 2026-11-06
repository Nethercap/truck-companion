// Arma el motor de navegacion de la app nativa con el codigo de la web, sin copiarlo:
// pure.js entero, variants.js y proj4, y de app.js las declaraciones de nivel superior
// que hacen falta (se siguen solas: cada una arrastra las que nombra). Lo que dibuja o
// toca el navegador queda afuera (ver QUEDA_AFUERA en motor/puente.js) y motor/puente.js
// le da un DOM de mentira, fetch y timers. Sale un solo archivo para QuickJS.
//
// La web no cambia: una regla nueva de ruteo o de avisos entra sola al compilar la app.
// Si una funcion raiz se renombra, esto falla y avisa (lo corre el build y CI).
//
//   node android-native/tools/armar_motor.js <salida.js> [--informe]
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const APP = path.join(RAIZ, 'docs', 'app');
const MOTOR = path.join(__dirname, '..', 'motor');

// Parte el codigo en declaraciones de nivel superior. Entiende comentarios, cadenas,
// templates anidados y regex: contar llaves a secas se rompe con `}` adentro de un texto.
function declaraciones(src) {
  const salida = [];
  let i = 0;
  const n = src.length;
  let ultimo = ''; // el ultimo token que no es espacio: decide si un / es regex o division

  function saltarCadena(q) {
    i++;
    while (i < n && src[i] !== q) {
      if (src[i] === '\\') i++;
      i++;
    }
    i++;
  }
  function saltarTemplate() {
    i++;
    while (i < n && src[i] !== '`') {
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') {
        i += 2;
        saltarCodigo('}');
        i++;
        continue;
      }
      i++;
    }
    i++;
  }
  function saltarRegex() {
    i++;
    let enClase = false;
    while (i < n) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '[') enClase = true;
      else if (c === ']') enClase = false;
      else if (c === '/' && !enClase) break;
      i++;
    }
    i++;
    while (i < n && /[a-z]/.test(src[i])) i++;
  }
  // Avanza por el codigo hasta el cierre pedido, respetando lo anidado.
  function saltarCodigo(cierre) {
    let hondura = 0;
    while (i < n) {
      const c = src[i];
      const d = src[i + 1];
      if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && d === '*') { i = src.indexOf('*/', i) + 2; continue; }
      if (c === "'" || c === '"') { saltarCadena(c); ultimo = 'cadena'; continue; }
      if (c === '`') { saltarTemplate(); ultimo = 'cadena'; continue; }
      if (c === '/') {
        const esRegex = !/^(cadena|\)|\]|\}|[A-Za-z0-9_$]+)$/.test(ultimo)
          || /^(return|typeof|case|of|in|delete|void|throw|new|else|do|yield|await)$/.test(ultimo);
        if (esRegex) { saltarRegex(); ultimo = 'cadena'; continue; }
      }
      if (/\s/.test(c)) { i++; continue; }
      if (/[A-Za-z0-9_$]/.test(c)) {
        const ini = i;
        while (i < n && /[A-Za-z0-9_$]/.test(src[i])) i++;
        ultimo = src.slice(ini, i);
        continue;
      }
      if (c === '(' || c === '[' || c === '{') hondura++;
      if (c === ')' || c === ']' || c === '}') {
        if (hondura === 0 && c === cierre) return;
        hondura--;
      }
      ultimo = c;
      i++;
    }
  }
  // Una sentencia de nivel superior: hasta el ; a hondura 0, o hasta cerrar el bloque
  // si es una function o una class.
  function saltarSentencia(esBloque) {
    let hondura = 0;
    const inicio = i;
    while (i < n) {
      const c = src[i];
      const d = src[i + 1];
      if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && d === '*') { i = src.indexOf('*/', i) + 2; continue; }
      if (c === "'" || c === '"') { saltarCadena(c); ultimo = 'cadena'; continue; }
      if (c === '`') { saltarTemplate(); ultimo = 'cadena'; continue; }
      if (c === '/') {
        const esRegex = !/^(cadena|\)|\]|\}|[A-Za-z0-9_$]+)$/.test(ultimo)
          || /^(return|typeof|case|of|in|delete|void|throw|new|else|do|yield|await)$/.test(ultimo);
        if (esRegex) { saltarRegex(); ultimo = 'cadena'; continue; }
      }
      if (/\s/.test(c)) { i++; continue; }
      if (/[A-Za-z0-9_$]/.test(c)) {
        const ini = i;
        while (i < n && /[A-Za-z0-9_$]/.test(src[i])) i++;
        // Sin punto y coma (la web a veces no lo pone): la declaracion que sigue, al
        // principio de una linea, termina esta.
        if (!esBloque && hondura === 0 && ini > inicio && src[ini - 1] === '\n'
            && /^(const|let|var|function|class|async)$/.test(src.slice(ini, i))) {
          i = ini;
          return;
        }
        ultimo = src.slice(ini, i);
        continue;
      }
      if (c === '(' || c === '[' || c === '{') hondura++;
      if (c === ')' || c === ']' || c === '}') {
        hondura--;
        if (esBloque && c === '}' && hondura === 0) { i++; ultimo = '}'; return; }
      }
      ultimo = c;
      i++;
      if (!esBloque && c === ';' && hondura === 0) return;
    }
  }

  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i = src.indexOf('*/', i) + 2; continue; }
    const ini = i;
    const resto = src.slice(i, i + 200);
    const m = /^(async\s+function\*?\s+|function\*?\s+|class\s+)([A-Za-z0-9_$]+)/.exec(resto);
    if (m) {
      ultimo = '';
      saltarSentencia(true);
      salida.push({ nombres: [m[2]], tipo: 'bloque', texto: src.slice(ini, i) });
      continue;
    }
    const v = /^(const|let|var)\s+/.exec(resto);
    ultimo = '';
    saltarSentencia(false);
    const texto = src.slice(ini, i);
    if (v) {
      salida.push({ nombres: nombresDeclarados(texto.slice(v[0].length)), tipo: 'variable', texto });
    } else {
      // if (...), addEventListener, setInterval: efectos de arriba del todo. Afuera.
      salida.push({ nombres: [], tipo: 'efecto', texto });
    }
  }
  return salida;
}

// Los nombres de `let a = 1, b, { c, d: e } = f;`, mirando solo la hondura 0.
function nombresDeclarados(cuerpo) {
  const nombres = [];
  let hondura = 0;
  let enValor = false;
  let j = 0;
  const m = /^\s*[{[]/.exec(cuerpo);
  if (m) {
    // Desestructurar: lo de adentro de la primera llave, tomando el alias si hay.
    const cierre = cuerpo.indexOf(cuerpo.trimStart()[0] === '{' ? '}' : ']');
    for (const parte of cuerpo.slice(m[0].length, cierre).split(',')) {
      const t = parte.split('=')[0].trim();
      const alias = t.includes(':') ? t.split(':')[1].trim() : t;
      if (alias) nombres.push(alias);
    }
    return nombres;
  }
  let token = '';
  for (; j < cuerpo.length; j++) {
    const c = cuerpo[j];
    if ('([{'.includes(c)) hondura++;
    else if (')]}'.includes(c)) hondura--;
    if (hondura === 0 && c === '=' && !enValor) { if (token) nombres.push(token); token = ''; enValor = true; continue; }
    if (hondura === 0 && (c === ',' || c === ';')) {
      if (!enValor && token) nombres.push(token);
      token = '';
      enValor = false;
      continue;
    }
    if (hondura === 0 && !enValor && /[A-Za-z0-9_$]/.test(c)) token += c;
  }
  return nombres;
}

// Los nombres que usa un pedazo de codigo. Lo que viene despues de un punto es una
// propiedad y no cuenta. Una `clave:` de objeto si: no se distingue de un ternario sin
// parsear, y de mas solo suma una declaracion, en cambio de menos revienta manejando.
// Los comentarios y las cadenas se sacan antes.
function nombresUsados(texto) {
  const limpio = texto
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
  const usados = new Set();
  const re = /(\.\s*)?([A-Za-z_$][A-Za-z0-9_$]*)/g;
  let m;
  while ((m = re.exec(limpio))) {
    if (!m[1]) usados.add(m[2]);
  }
  return usados;
}

function armar() {
  const puente = fs.readFileSync(path.join(MOTOR, 'puente.js'), 'utf8');
  const conduccion = fs.readFileSync(path.join(MOTOR, 'conduccion.js'), 'utf8');
  const app = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
  const pure = fs.readFileSync(path.join(APP, 'pure.js'), 'utf8');
  const convoy = fs.readFileSync(path.join(APP, 'convoy.js'), 'utf8');

  // Lo que puente.js y conduccion.js declaran o dejan afuera a proposito.
  const afuera = new Set(JSON.parse(/\/\/ QUEDA_AFUERA: (\[[\s\S]*?\])\n/.exec(puente)[1].replace(/\n\/\/ ?/g, ' ')));
  const raices = JSON.parse(/\/\/ RAICES: (\[[\s\S]*?\])\n/.exec(conduccion)[1].replace(/\n\/\/ ?/g, ' '));

  const decl = declaraciones(app);
  const porNombre = new Map();
  for (const d of decl) for (const nombre of d.nombres) porNombre.set(nombre, d);

  // Si el parser se comio una declaracion, que falle aca y no manejando: toda declaracion
  // al principio de una linea tiene que haber salido con su nombre.
  for (const m of app.matchAll(/^(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm)) {
    if (!porNombre.has(m[1])) throw new Error(`armar_motor: se perdio la declaracion de ${m[1]} en app.js`);
  }

  for (const r of raices) {
    if (!porNombre.has(r)) throw new Error(`armar_motor: no encuentro ${r} en app.js (se renombro? actualizar conduccion.js)`);
  }

  const incluidas = new Set();
  // Lo que nombra conduccion.js tambien hace falta, sin tener que listarlo.
  // Y lo que nombra convoy.js, que entra entero: vive aparte de app.js y usa sus globales.
  const pendientes = [...raices, ...[...nombresUsados(conduccion), ...nombresUsados(convoy)].filter((u) => porNombre.has(u) && !afuera.has(u))];
  const porQue = new Map();
  while (pendientes.length) {
    const nombre = pendientes.pop();
    const d = porNombre.get(nombre);
    if (!d || incluidas.has(d)) continue;
    incluidas.add(d);
    for (const usado of nombresUsados(d.texto)) {
      if (afuera.has(usado) || !porNombre.has(usado)) continue;
      if (!porQue.has(usado)) porQue.set(usado, nombre);
      pendientes.push(usado);
    }
  }
  // Una declaracion con varios nombres entra entera; si uno de ellos esta afuera, conduccion lo pisa.
  const elegidas = decl.filter((d) => incluidas.has(d));

  const leer = (rel) => fs.readFileSync(path.join(APP, rel), 'utf8');
  const texto = [
    '// GENERADO por android-native/tools/armar_motor.js. No editar: sale de docs/app/ y android-native/motor/.',
    puente,
    '// ---- vendor/proj4',
    leer('vendor/proj4-2.15.0.js'),
    '// ---- variants.js',
    leer('variants.js'),
    '// ---- pure.js',
    pure,
    '// ---- i18n',
    leer('i18n.js'),
    leer('i18n_en_es.js'),
    '// ---- app.js: lo necesario, en el orden de la web',
    ...elegidas.map((d) => d.texto),
    '// ---- convoy.js',
    convoy,
    '// ---- android-native/motor/conduccion.js',
    conduccion,
  ].join('\n');

  return { texto, decl, elegidas, porQue, afuera };
}

if (require.main === module) {
  const salida = process.argv[2];
  if (!salida || salida.startsWith('--')) {
    console.error('Uso: node armar_motor.js <salida.js> [--informe]');
    process.exit(2);
  }
  const { texto, decl, elegidas, porQue } = armar();
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  fs.writeFileSync(salida, texto);
  if (process.argv.includes('--informe')) {
    const lineas = (t) => t.split('\n').length;
    const total = decl.reduce((a, d) => a + lineas(d.texto), 0);
    const usadas = elegidas.reduce((a, d) => a + lineas(d.texto), 0);
    console.log(`${elegidas.length} de ${decl.length} declaraciones de app.js, ${usadas} de ${total} lineas; ${Math.round(texto.length / 1024)} KB en total`);
    for (const d of [...elegidas].sort((a, b) => lineas(b.texto) - lineas(a.texto)).slice(0, 25)) {
      const nombre = d.nombres[0] || '?';
      console.log(`  ${String(lineas(d.texto)).padStart(5)} ${nombre}  <- ${porQue.get(nombre) || 'raiz'}`);
    }
  }
}

module.exports = { armar, declaraciones, nombresUsados, nombresDeclarados };

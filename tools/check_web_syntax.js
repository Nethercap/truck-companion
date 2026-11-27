// Lo que tiene que poder leer Safari 12.1, el tope de iOS 12 (iPad Mini 2 y 3,
// iPad Air 1, iPhone 5s y 6): los .js que carga /dash/ y los scripts
// incrustados de /dash/ y /app/ (el de /app/ avisa del navegador viejo).
//
// Existe por un reporte del 27-11-2026: en un iPad Mini 2 el boton Connect no
// hacia nada, ni en LAN ni en el sitio. Nueve `??` en pure.js hacian que
// Safari 12 no leyera el archivo entero, y con el todo el panel; ningun error
// a la vista. Safari 12.1 lee ES2019 salvo una cosa: los lookbehind de las
// expresiones regulares ((?<= y (?<!), que llegaron recien en Safari 16.4.
// Nada de `??`, `?.`, campos de clase ni `??=` en estos archivos.
//
// El mapa (/app/) no entra: MapLibre 5 pide Safari 15.4 de todos modos.
//
// Uso: node tools/check_web_syntax.js
// Usa el acorn que trae Node adentro (sin npm install): se relanza solo con
// --expose-internals si hace falta.

'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

let acorn;
try {
  acorn = require('internal/deps/acorn/acorn/dist/acorn');
} catch (e) {
  if (process.execArgv.includes('--expose-internals')) {
    console.error('No se encontro el acorn de Node (internal/deps/acorn): ' + e.message);
    process.exit(2);
  }
  const r = spawnSync(process.execPath, ['--expose-internals', __filename, ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exit(r.status === null ? 2 : r.status);
}

const ROOT = path.join(__dirname, '..');
const ECMA = 2019;
const PAGES_SRC = ['docs/dash/index.html'];          // sus <script src> y los incrustados
const PAGES_INLINE = ['docs/app/index.html'];         // solo los incrustados

const SRC_RE = /<script\b[^>]*\bsrc="([^"]+)"[^>]*>\s*<\/script>/gi;
const INLINE_RE = /<script(?![^>]*\bsrc=)(?![^>]*\btype=)[^>]*>([\s\S]*?)<\/script>/gi;

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

// Lookbehind en literales /.../ y en new RegExp('...') / RegExp('...').
function lookbehinds(ast) {
  const found = [];
  const stack = [ast];
  while (stack.length) {
    const n = stack.pop();
    if (!n || typeof n.type !== 'string') continue;
    if (n.type === 'Literal' && n.regex && /\(\?<[=!]/.test(n.regex.pattern)) found.push(n);
    if ((n.type === 'NewExpression' || n.type === 'CallExpression') && n.callee && n.callee.name === 'RegExp'
        && n.arguments[0] && typeof n.arguments[0].value === 'string' && /\(\?<[=!]/.test(n.arguments[0].value)) {
      found.push(n);
    }
    for (const key of Object.keys(n)) {
      const v = n[key];
      if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') stack.push(x); }
      else if (v && typeof v.type === 'string') stack.push(v);
    }
  }
  return found;
}

const errors = [];
function check(label, code, lineOffset) {
  let ast;
  try {
    ast = acorn.parse(code, { ecmaVersion: ECMA, sourceType: 'script', locations: true });
  } catch (e) {
    const line = e.loc ? e.loc.line + lineOffset : '?';
    errors.push(`${label}:${line}: Safari 12 no lo lee (${e.message.replace(/ \(\d+:\d+\)$/, '')}): `
      + 'reescribirlo sin la sintaxis nueva (`??`, `?.`, campos de clase...)');
    return;
  }
  for (const n of lookbehinds(ast)) {
    errors.push(`${label}:${n.loc.start.line + lineOffset}: lookbehind en una expresion regular, Safari 12 no lo lee`);
  }
}

let files = 0;
let inline = 0;
for (const page of PAGES_SRC.concat(PAGES_INLINE)) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  if (PAGES_SRC.includes(page)) {
    for (const m of html.matchAll(SRC_RE)) {
      const rel = m[1].split('?')[0];
      const file = path.normalize(path.join(path.dirname(page), rel));
      check(file.replace(/\\/g, '/'), fs.readFileSync(path.join(ROOT, file), 'utf8'), 0);
      files++;
    }
  }
  for (const m of html.matchAll(INLINE_RE)) {
    if (!m[1].trim()) continue;
    const start = m.index + m[0].indexOf('>') + 1;
    check(`${page} (script incrustado)`, m[1], lineOf(html, start) - 1);
    inline++;
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\n${errors.length} problema(s). /dash/ tiene que andar en iOS 12 (ver el encabezado de tools/check_web_syntax.js).`);
  process.exit(1);
}
console.log(`${files} archivos de /dash/ y ${inline} scripts incrustados: Safari 12 los lee`);

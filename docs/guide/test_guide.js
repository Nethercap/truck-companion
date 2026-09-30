// node --test docs/guide/test_guide.js
// La guia cae al ingles clave por clave, asi que una clave que falta o con
// un typo no rompe nada: esa parte queda en ingles y nadie se entera. Esto
// lo hace ruidoso.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const dir = __dirname;
const ctx = {};
vm.createContext(ctx);
for (const f of ['text.js', 'text_extra.js']) {
  vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8') + '\n;this.GUIDE_TEXT = GUIDE_TEXT;', ctx);
}
const G = ctx.GUIDE_TEXT;
const LANGS = ['en', 'es', 'de', 'fr', 'pt', 'pl', 'tr', 'ru'];

// Todas las claves hoja, con su camino (h.gps, ic.poiBtn...).
function leaves(obj, pre = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v) ? leaves(v, pre + k + '.') : [pre + k]);
}

test('estan los ocho idiomas', () => {
  assert.deepStrictEqual(Object.keys(G).sort(), [...LANGS].sort());
});

for (const lang of LANGS.slice(1)) {
  test(`${lang} tiene las mismas claves que en`, () => {
    const en = new Set(leaves(G.en));
    const own = new Set(leaves(G[lang]));
    assert.deepStrictEqual([...en].filter((k) => !own.has(k)), [], 'faltan');
    assert.deepStrictEqual([...own].filter((k) => !en.has(k)), [], 'sobran (typo?)');
  });
}

test('cada icono tiene nombre y descripcion', () => {
  for (const lang of LANGS) {
    for (const [id, v] of Object.entries(G[lang].ic)) {
      assert.ok(Array.isArray(v) && v.length === 2 && v[0] && v[1], `${lang}.ic.${id}`);
    }
  }
});

test('los iconos de la guia existen en la app', () => {
  // guide.js los saca de /app/index.html por id: si un boton cambia de id,
  // la guia queda sin dibujo.
  const app = fs.readFileSync(path.join(dir, '..', 'app', 'index.html'), 'utf8');
  const guide = fs.readFileSync(path.join(dir, 'guide.js'), 'utf8');
  const ids = [...guide.matchAll(/const (?:MAP_BTNS|TOP_BTNS|CMDS) = \[([^\]]+)\]/g)]
    .flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
  assert.ok(ids.length >= 25, 'no encontre los ids en guide.js');
  for (const id of ids) assert.ok(app.includes(`id="${id}"`), `falta #${id} en app/index.html`);
});

test('el HTML de los textos esta balanceado', () => {
  for (const lang of LANGS) {
    for (const k of leaves(G[lang]).filter((k) => k.startsWith('b'))) {
      const html = k.split('.').reduce((o, p) => o[p], G[lang]);
      for (const tag of ['p', 'ul', 'ol', 'li', 'b', 'i', 'div', 'h3', 'a', 'code', 'span']) {
        const open = (html.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length;
        const close = (html.match(new RegExp(`</${tag}>`, 'g')) || []).length;
        assert.strictEqual(open, close, `${lang}.${k}: <${tag}> ${open} abiertos, ${close} cerrados`);
      }
    }
  }
});

test('las capturas de cada idioma estan', () => {
  for (const lang of LANGS) {
    for (const img of ['map', 'phone', 'dash']) {
      assert.ok(fs.existsSync(path.join(dir, 'img', lang, img + '.webp')), `img/${lang}/${img}.webp`);
    }
  }
});

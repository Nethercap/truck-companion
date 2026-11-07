// Numeros de referencia para los tests de la app nativa, sacados corriendo el
// codigo de la web (proj4 de vendor/, pure.js, y funciones de app.js por nombre,
// como tools/check_avisos.js). Si cambia la web, cambia el golden y el test de
// Kotlin avisa que hay que portar lo mismo. CI corre esto con --check.
//
//   node android-native/tools/generar_golden.js          reescribe el golden
//   node android-native/tools/generar_golden.js --check  falla si no coincide
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.resolve(__dirname, '..', '..');
const SALIDA = path.join(__dirname, '..', 'app', 'src', 'test', 'resources', 'golden.json');
const appJs = fs.readFileSync(path.join(RAIZ, 'docs/app/app.js'), 'utf8');
const pure = require(path.join(RAIZ, 'docs/app/pure.js'));
const proj4 = require(path.join(RAIZ, 'docs/app/vendor/proj4-2.15.0.js'));

// Saca de app.js un bloque que empieza exactamente asi, contando llaves.
function bloque(inicio) {
  const desde = appJs.indexOf(inicio);
  if (desde < 0) throw new Error('No esta en app.js: ' + inicio);
  let i = appJs.indexOf('{', desde);
  let hondura = 0;
  for (; i < appJs.length; i++) {
    if (appJs[i] === '{') hondura++;
    else if (appJs[i] === '}' && --hondura === 0) break;
  }
  return appJs.slice(desde, i + 1);
}

function lineaConst(nombre) {
  const m = new RegExp(`^const ${nombre} = .*;$`, 'm').exec(appJs);
  if (!m) throw new Error('No esta en app.js: const ' + nombre);
  return m[0];
}

// Las proyecciones, en un contexto con el proj4 de la web.
const contexto = vm.createContext({ proj4, Math });
vm.runInContext([
  lineaConst('EARTH_RADIUS_M'),
  lineaConst('LENGTH_OF_DEGREE'),
  lineaConst('ATS_DEF'),
  lineaConst('atsProj4'),
  bloque('function atsToLngLat('),
  bloque('function atsFromLngLat('),
  lineaConst('ETS2_DEF'),
  lineaConst('ets2Proj4'),
  bloque('function ets2ToLngLatImpl('),
  bloque('function ets2FromLngLatImpl('),
  'function ets2ToLngLat(x, z) { return ets2ToLngLatImpl(x, z, true); }',
  'function ets2FromLngLat(lng, lat) { return ets2FromLngLatImpl(lng, lat, true); }',
  'function guToLngLat(x, z) { return ets2ToLngLatImpl(x, z, false); }',
  'function guFromLngLat(lng, lat) { return ets2FromLngLatImpl(lng, lat, false); }',
].join('\n'), contexto);

const redondo = (v) => Math.round(v * 1e8) / 1e8;
const proyecciones = {
  ats: ['atsToLngLat', 'atsFromLngLat'],
  ets2: ['ets2ToLngLat', 'ets2FromLngLat'],
  gu: ['guToLngLat', 'guFromLngLat'],
};
// Lugares repartidos, con los dos lados de la frontera del truco de UK en ETS2.
const puntos = {
  ats: [[0, 0], [-48320, -6177], [-104665, 7299], [7245, -14697], [-13248, 54085], [-98772, -5680], [-81881, -63722]],
  ets2: [[0, 0], [24060, -51876], [-31999, -8001], [-32001, -7999], [-32001, -8001], [-40000, -20000], [-31000, -5000], [64750, -59810], [51356, -58843]],
  gu: [[-40000, -20000], [-31000, -5000], [10000, 10000]],
};
const proyeccion = {};
for (const [nombre, [ida, vuelta]] of Object.entries(proyecciones)) {
  const aLngLat = (x, z) => vm.runInContext(`${ida}(${x}, ${z})`, contexto);
  proyeccion[nombre] = puntos[nombre].map(([x, z]) => {
    const [lng, lat] = aLngLat(x, z);
    const [vx, vz] = vm.runInContext(`${vuelta}(${lng}, ${lat})`, contexto);
    const rumbos = [0, 45, 90, 200, 359].map((h) => [h, redondo(pure.gridHeadingToGeo(h, x, z, aLngLat))]);
    return { x, z, lng: redondo(lng), lat: redondo(lat), vueltaX: redondo(vx), vueltaZ: redondo(vz), rumbos };
  });
}

// resolveModVariant, con el modo automatico y una tabla de publicadas fija: el
// golden no tiene que cambiar cada vez que se publica un mapa.
const TODAS = ['ats', 'ats_161', 'ats_c2c', 'ats_promods', 'ats_c2c_promods', 'ats_canada', 'ats_c2c_canada',
  'ats_expansion', 'ats_c2c_expansion', 'ats_reforma', 'ats_reforma_c2c_promods', 'ets2', 'ets2_161', 'ets2_promods',
  'ets2_promods_rusmap', 'ets2_promods_roex', 'ets2_promods_rusmap_roex', 'ets2_gu', 'ets2_eugu', 'ets2_promods_eugu', 'ets2_tmp'];
const SIN_OPCIONALES = TODAS.filter((v) => !/canada$|expansion$|roex$|eugu$|tmp$/.test(v));
const fuenteResolver = bloque('function resolveModVariant(');
function resolverCon(publicadas) {
  const ctx = vm.createContext({
    modsAuto: true, localMaps: {}, detectedMods: null, atsMod: 'none', ets2Mod: 'none',
    publishedVariant: (v, respaldo) => (publicadas.includes(v) ? v : respaldo),
  });
  vm.runInContext(fuenteResolver, ctx);
  return (juego, mods) => {
    ctx.detectedMods = mods === null ? null : { [juego]: mods };
    return vm.runInContext(`resolveModVariant(${JSON.stringify(juego)})`, ctx);
  };
}
function combinaciones(banderas) {
  const salida = [];
  for (let m = 0; m < 1 << banderas.length; m++) salida.push(banderas.filter((_, i) => m & (1 << i)));
  return salida;
}
const BANDERAS = {
  ats: ['reforma', 'c2c', 'promods_canada', 'canada_expansion', 'ats_expansion'],
  ets2: ['eu_grand_utopia', 'grand_utopia', 'promods', 'rusmap', 'roextended', 'truckersmp'],
};
const variantes = [];
for (const [nombrePub, publicadas] of [['todas', TODAS], ['sinOpcionales', SIN_OPCIONALES]]) {
  const resolver = resolverCon(publicadas);
  for (const [juego, banderas] of Object.entries(BANDERAS)) {
    for (const activos of combinaciones(banderas)) {
      const mods = Object.fromEntries(activos.map((b) => [b, true]));
      variantes.push({ publicadas: nombrePub, juego, activos, esperado: resolver(juego, mods) });
    }
    variantes.push({ publicadas: nombrePub, juego, activos: null, esperado: resolver(juego, null) });
  }
}

const anchos = [];
for (const base of [[5, 0.5, 12, 1.5, 17, 5], [5, 0.8, 12, 2.5, 17, 8], [5, 1, 12, 3.5, 17, 10]]) {
  for (const lat of [39, 45, 60]) {
    for (const [nombre, m] of [['ats', Math.abs(0.000176689948) * (6370997 * Math.PI) / 180], ['ets2', Math.abs(0.0001729241463) * (6370997 * Math.PI) / 180]]) {
      anchos.push({ base, lat, juego: nombre, paradas: pure.roadLineWidth(base, m, lat).slice(3) });
    }
  }
}

// liveMapColor de livemap.js: el mismo conductor, el mismo color que en la web.
const livemapJs = fs.readFileSync(path.join(RAIZ, 'docs/app/livemap.js'), 'utf8');
const ctxColor = vm.createContext({});
const tonos = /const LIVE_MAP_HUES = .*;/.exec(livemapJs)[0];
const fnColor = /function liveMapColor\(id\) \{[\s\S]*?\n\}/.exec(livemapJs)[0];
vm.runInContext(tonos + '\n' + fnColor, ctxColor);
const colores = ['a', 'abc123', 'Zz9', 'x7Kp2mQ', '0', 'sesion-larga-de-prueba'].map((id) => (
  { id, color: vm.runInContext(`liveMapColor(${JSON.stringify(id)})`, ctxColor) }));

// Constantes copiadas en Kotlin: subirlas en la web sin subirlas aca dejaria a la app
// pidiendo el archivo viejo.
const constante = (nombre) => {
  const m = new RegExp(`^const ${nombre} = '([^']*)';`, 'm').exec(appJs);
  if (!m) throw new Error('No esta en app.js: const ' + nombre);
  return m[1];
};
const constantes = { BASEMAP_VERSION: constante('BASEMAP_VERSION'), COMPANY_ICONS_REV: constante('COMPANY_ICONS_REV') };

const golden = { proyeccion, variantes, sinOpcionales: SIN_OPCIONALES, todas: TODAS, anchos, colores, constantes };
const texto = JSON.stringify(golden, null, 0).replace(/\},\{/g, '},\n{') + '\n';

if (process.argv.includes('--check')) {
  const actual = fs.existsSync(SALIDA) ? fs.readFileSync(SALIDA, 'utf8') : '';
  if (actual !== texto) {
    console.error('El golden de la app nativa no coincide con el codigo de la web.');
    console.error('Correr node android-native/tools/generar_golden.js y portar el cambio a Kotlin.');
    process.exit(1);
  }
  console.log('Golden de la app nativa al dia.');
} else {
  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(SALIDA, texto);
  console.log(`${SALIDA}: ${variantes.length} combinaciones de mods, ${Object.values(proyeccion).flat().length} puntos`);
}

// Prueba el motor de navegacion de la app nativa sin el telefono: un contexto de JS pelado
// (sin DOM ni nada de Node), los datos de mapa de verdad y un camion por la ruta demo de ATS.
// Cada escenario es algo que la app necesita del codigo de la web sin que este se entere de
// que no hay pagina. Falla si algo tira una excepcion o no hace lo que tiene que hacer.
//
//   node android-native/tools/probar_motor.js [--cache carpeta] [--solo nombre]
//
// Con --guion carpeta, ademas escribe un guion por juego: la misma corrida, dato por dato, con
// un reloj de mentira y lo que tiene que dar. MotorGuionTest (androidTest) lo repite en QuickJS
// adentro de Android y compara: lo que aca corre V8 alla corre otro motor, con otra libm y sin
// Intl. Los datos bajan de R2 y quedan en --cache: con TRUCKDASH_MAPS_KEY como las otras
// herramientas (CI), si no con el Referer de la app.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { armar } = require('./armar_motor.js');

const RAIZ = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const opcion = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const CACHE = opcion('cache', path.join(require('os').tmpdir(), 'truckdash-motor'));
const SOLO = opcion('solo', null);
const GUION = opcion('guion', null);

const MANIFEST = JSON.parse(fs.readFileSync(path.join(RAIZ, 'docs', 'data', 'map-manifest.json'), 'utf8'));
const DEMO = JSON.parse(fs.readFileSync(path.join(RAIZ, 'docs', 'app', 'demo-route-ats.json'), 'utf8'));
const TEXTO = armar().texto;

// Lo mismo en V8 y en QuickJS: la hora la pone el guion, y el resultado de cada paso se
// resume sin lo que depende de la ultima cifra de un seno (el rumbo suavizado, los decimales
// de un porcentaje): eso no se le muestra a nadie y distinta libm lo cambia.
const PRELUDIO = `
var relojFalso = 1790000000000;
Date.now = function () { return relojFalso; };
`;
const DIGESTO = `
var audiosVistos = 0;
function digesto() {
  var n = JSON.parse(motor.navegacion());
  var g = n.giro;
  var d = n.destino;
  var linea = fuentesRuta.route && fuentesRuta.route.geometry ? fuentesRuta.route.geometry.coordinates : [];
  var vertices = 0;
  for (var i = 0; i < linea.length; i++) vertices += linea[i].length;
  return JSON.stringify([
    g ? g.text : null, g ? g.next : null,
    (n.carriles || []).map(function (c) { return c.dirs.join('+') + (c.active ? '!' : ''); }).join(' '),
    n.resumen ? n.resumen.remaining : null, n.resumen ? n.resumen.duration : null,
    n.hayRuta, n.proximaCiudad, n.sinRuta, n.avisoRuta, n.rutaOculta,
    n.waypoints.map(function (w) { return w.etiqueta; }),
    n.sugerencia ? n.sugerencia.tipo : null,
    d ? [d.kind, Math.round(d.lng * 1e4), Math.round(d.lat * 1e4)] : null,
    currentRouteFull ? currentRouteFull.length : 0,
    vertices, audiosVistos,
  ]);
}
`;

let fallos = 0;
function chequear(cond, mensaje) {
  if (cond) return true;
  fallos += 1;
  console.error(`  FALLA: ${mensaje}`);
  return false;
}

const nombreEnCache = (url) => url.replace(/^https?:\/\//, '').replace(/[^A-Za-z0-9._-]+/g, '_');
const archivosPedidos = new Map();

async function bajar(url) {
  fs.mkdirSync(CACHE, { recursive: true });
  const ruta = path.join(CACHE, nombreEnCache(url));
  // Lo que esta en el repo manda: un archivo nuevo de docs/ todavia no esta publicado.
  const local = /^https:\/\/trucksim-dash\.com\/(app|data)\/(.*)$/.exec(url.split('?')[0]);
  if (local) {
    const enRepo = path.join(RAIZ, 'docs', local[1], local[2]);
    if (fs.existsSync(enRepo)) {
      const bytes = fs.readFileSync(enRepo);
      fs.writeFileSync(ruta, bytes);
      archivosPedidos.set(url, { status: 200, archivo: nombreEnCache(url) });
      return { status: 200, bytes };
    }
  }
  if (fs.existsSync(ruta)) {
    archivosPedidos.set(url, { status: 200, archivo: nombreEnCache(url) });
    return { status: 200, bytes: fs.readFileSync(ruta) };
  }
  const clave = process.env.TRUCKDASH_MAPS_KEY;
  const headers = clave && url.startsWith('https://maps.trucksim-dash.com/')
    ? { 'x-truckdash-tools': clave }
    : { Referer: 'https://trucksim-dash.com/app/' };
  const r = await fetch(url, { headers });
  if (!r.ok) {
    archivosPedidos.set(url, { status: r.status, archivo: null });
    return { status: r.status, bytes: null };
  }
  const bytes = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(ruta, bytes);
  archivosPedidos.set(url, { status: 200, archivo: nombreEnCache(url) });
  return { status: 200, bytes };
}

// Un motor recien armado y lo que hace MotorNav.kt alrededor. Con grabar, cada llamada queda
// en pasos con lo que dio despues: eso es el guion.
function abrir({ variante = 'ats', lang = 'en', imperial = true, voz = false, grabar = false, almacen = null, zona = null, tasas = null } = {}) {
  const contexto = vm.createContext({});
  vm.runInContext(PRELUDIO, contexto);
  if (zona) vm.runInContext(`var zonaTelefono = ${JSON.stringify(zona)};`, contexto);
  if (almacen) vm.runInContext(`var almacenInicial = ${JSON.stringify(almacen)};`, contexto);
  vm.runInContext(TEXTO, contexto, { filename: 'motor.js' });
  vm.runInContext(DIGESTO, contexto);
  const motor = vm.runInContext('motor', contexto);
  const m = {
    motor,
    j: (codigo) => vm.runInContext(codigo, contexto),
    mensajes: [],
    audios: [],
    errores: [],
    avisos: [],
    rutaNueva: null,
    pasos: [],
    esperado: [],
    variante,
    guardado: {},
    sockets: [],
    demo: [],
    reporte: null,
    alPost: () => ({ status: 500, cuerpo: '' }),
    reloj: 0,
  };
  m.tragar = async () => {
    await new Promise(setImmediate);
    for (let vueltas = 0; ; vueltas++) {
      motor.pulso();
      await new Promise(setImmediate);
      const s = JSON.parse(motor.volcar());
      for (const [tipo, t] of s.log) {
        if (tipo === 'e') m.errores.push(t);
        else if (process.env.MOTOR_LOG) console.log(`  [motor ${tipo}] ${t}`.slice(0, 300));
      }
      m.mensajes.push(...s.mensajes.map((t) => JSON.parse(t)));
      m.avisos.push(...s.avisos);
      for (const [k, v] of s.guardar) m.guardado[k] = v;
      m.sockets.push(...s.sockets);
      m.demo.push(...s.demo);
      if (s.reporte) m.reporte = s.reporte;
      if (s.entrega) m.entrega = s.entrega;
      if (s.ruta) m.rutaNueva = s.ruta;
      for (const a of s.audio) {
        m.audios.push(a);
        m.j('audiosVistos += 1');
        motor.audioTermino(a.id);
      }
      for (const p of s.fetch) {
        if (p.method) {
          const r = m.alPost(p);
          motor.respuesta(p.id, r.status, r.cuerpo);
          continue;
        }
        // Las tasas cambian todos los dias: en una prueba, las que pide la prueba.
        if (p.url.endsWith('/rates')) {
          if (tasas) motor.respuesta(p.id, 200, JSON.stringify({ base: 'USD', rates: tasas }));
          else motor.respuesta(p.id, 500, '');
          continue;
        }
        const r = await bajar(p.url);
        const binario = /\.bin(\?|$)/.test(p.url);
        const cuerpo = !r.bytes ? ''
          : binario ? r.bytes.buffer.slice(r.bytes.byteOffset, r.bytes.byteOffset + r.bytes.length)
            : r.bytes.toString('utf8');
        motor.respuesta(p.id, r.status, cuerpo);
      }
      await new Promise(setImmediate);
      if (!s.fetch.length && !s.audio.length) return;
      if (vueltas > 500) throw new Error('el motor no termina de pedir cosas');
    }
  };
  // Un paso: avanza el reloj, llama, atiende lo que pidio y anota como quedo.
  m.paso = async (nombre, argumentos = [], ms = 0, compararDevuelto = false) => {
    if (ms) {
      m.reloj += ms;
      m.j(`relojFalso += ${ms}`);
    }
    const devuelto = motor[nombre](...argumentos);
    await m.tragar();
    if (grabar) {
      m.pasos.push({ f: nombre, a: argumentos, ms, ...(compararDevuelto ? { devuelto } : {}) });
      m.esperado.push(m.j('digesto()'));
    }
    return devuelto;
  };
  m.nav = () => JSON.parse(motor.navegacion());
  m.tipos = () => m.mensajes.map((t) => t.type);
  m.iniciar = async () => {
    await m.paso('iniciar', [JSON.stringify({ lang, imperial, voz, version: 'android-test' })]);
    const v = MANIFEST.variants[variante];
    await m.paso('ponerVariante', [variante, v.mapDataVersion, v.game, variante === 'ets2_gu' ? 'gu' : v.game, v.appLabel || v.label, v.origin[0], v.origin[1]]);
    return m;
  };
  return m;
}

// El trabajo de la ruta demo, y un dato de telemetria como lo manda el cliente.
const TRABAJO_DEMO = {
  game: 'ats', cargo: 'Bulldozer', cargoMassKg: 18189, citySrc: 'Salt Lake City', cityDst: 'Las Vegas', citySrcId: 'salt_lake', cityDstId: 'las_vegas',
  companySrc: 'Coastline Mining', companyDst: 'Bitumen', companySrcId: 'cm_min_svc', companyDstId: 'bit_rd_svc', jobMarket: 'cargo_market',
  onJob: true, isCargoLoaded: true, truckBrand: 'Volvo', truckName: 'VNL', fuelCapacity: 600,
};
const dato = (m, trabajo, x, z, rumbo, kmh = 85, extra = {}) => JSON.stringify({
  ...trabajo, paused: false, position: { x, y: 0, z }, heading: rumbo, speedKmh: kmh, speedLimitKmh: 105,
  routeDistanceKm: 700, routeTimeSeconds: 28000, gameTimeMinutes: 4000 + Math.floor(m.reloj / 3000), ts: (1790000000000 + m.reloj) / 1000,
  fuel: 400, restStopMinutes: 700, odometerKm: 180000 + m.reloj / 100000, ...extra,
});
const rumboEntre = (a, b) => (Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180 / Math.PI + 360) % 360;

// Hasta que llega el grafo no hay ruta: la web vuelve a probar en cada dato.
async function esperarRuta(m, trabajo, x, z, rumbo, extra) {
  await m.paso('telemetria', [dato(m, trabajo, x, z, rumbo, 0, extra)], 250);
  for (let i = 0; i < 60 && !m.nav().hayRuta; i++) await m.paso('telemetria', [dato(m, trabajo, x, z, rumbo, 0, extra)], 250);
  return m.nav().hayRuta;
}

// Maneja por la ruta calculada, de a 25 m de mundo y con un dato cada 250 ms.
async function manejar(m, trabajo, puntos, { desde = 0, hasta = puntos.length - 1, kmh = 85, extra = {}, alPaso = null, tope = Infinity } = {}) {
  let n = 0;
  for (let i = desde; i < hasta && n < tope; i++) {
    const a = puntos[i];
    const b = puntos[i + 1];
    const largo = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (largo > 2000) {
      // Un ferry o el tunel: el juego teletransporta el camion al otro lado.
      await m.paso('telemetria', [dato(m, trabajo, b[0], b[1], rumboEntre(a, b), 0, extra)], 250);
      n += 1;
      continue;
    }
    const pasos = Math.max(1, Math.ceil(largo / 25));
    const rumbo = rumboEntre(a, b);
    for (let p = 0; p < pasos && n < tope; p++, n++) {
      const f = p / pasos;
      await m.paso('telemetria', [dato(m, trabajo, a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, rumbo, kmh, extra)], 250);
      if (alPaso) await alPaso(n);
    }
  }
  return n;
}

const puntosDeRuta = (m) => m.j('currentRouteFull.map(function (p) { return [p[0], p[1]]; })');
const INICIO = DEMO.path[0];
const RUMBO_INICIO = rumboEntre(DEMO.path[0], DEMO.path[1]);

async function conRuta(opciones) {
  const m = await abrir(opciones).iniciar();
  chequear(await esperarRuta(m, TRABAJO_DEMO, INICIO[0], INICIO[1], RUMBO_INICIO), 'sin ruta despues de cargar el grafo');
  return m;
}

const ESCENARIOS = {
  // Lo que la web muestra al entregar: pago, multas y peajes del viaje, y una sola vez.
  async tarjetaDeEntrega() {
    const m = await conRuta();
    const puntos = puntosDeRuta(m);
    const con = (event) => {
      const d = JSON.parse(dato(m, TRABAJO_DEMO, puntos[5][0], puntos[5][1], 90));
      d.onJob = true;
      d.event = event;
      return JSON.stringify(d);
    };
    await m.paso('telemetria', [con({})]);
    await m.paso('telemetria', [con({ tollgate: true, tollgatePayAmount: 120 })]);
    await m.paso('telemetria', [con({})]);
    await m.paso('telemetria', [con({ fined: true, fineAmount: 300 })]);
    await m.paso('telemetria', [con({})]);
    chequear(!m.entrega, 'tarjeta antes de entregar');
    const sesion = m.nav().sesion;
    chequear(sesion.hayAlgo && /120/.test(sesion.filas[0][1]) && /300/.test(sesion.filas[1][1]), `totales: ${JSON.stringify(sesion)}`);
    const entrega = { jobDelivered: true, jobSrc: 'Reno', jobDst: 'Elko', jobCargo: 'Madera', jobDeliveredRevenue: 5000, jobEarnedXp: 250, jobDeliveredDistanceKm: 400, jobDeliveryTime: 205, jobCargoDamage: 0.02 };
    await m.paso('telemetria', [con(entrega)]);
    const t = m.entrega;
    chequear(t && t.ruta === 'Reno → Elko' && t.carga === 'Madera', `tarjeta: ${JSON.stringify(t)}`);
    const filas = Object.fromEntries((t ? t.filas : []));
    const texto = JSON.stringify(filas);
    chequear(/5,000/.test(texto) && /\+250 XP/.test(texto) && /249 mi|400 km/.test(texto) && /3 h 25/.test(texto), `filas: ${texto}`);
    chequear(/120/.test(texto) && /300/.test(texto), `sin peajes o multas: ${texto}`);
    m.entrega = null;
    await m.paso('telemetria', [con(entrega)]);
    chequear(!m.entrega, 'la misma entrega dos veces');
    chequear(JSON.parse(m.motor.viajes()).lista.length === 1, 'la entrega no quedo en el historial');
    // El trabajo que sigue arranca sin los costos de este.
    await m.paso('telemetria', [con({})]);
    await m.paso('telemetria', [con({ ...entrega, jobDst: 'Ely' })]);
    chequear(m.entrega && !/120/.test(JSON.stringify(m.entrega.filas)), `costos del viaje anterior: ${JSON.stringify(m.entrega)}`);
    await m.paso('reiniciarSesion');
    chequear(!m.nav().sesion.hayAlgo, 'no reinicia la sesion');
    chequear(!m.errores.length, m.errores.join('; '));
  },

  // Los ajustes del mapa y del tablero se guardan como en la web y sobreviven a reabrir.
  async ajustesDeApariencia() {
    const m = await conRuta();
    await m.paso('apariencia', ['color', '#4caf50']);
    await m.paso('apariencia', ['zoom', 11.3]);
    await m.paso('apariencia', ['camion', 2]);
    await m.paso('apariencia', ['base', false]);
    await m.paso('apariencia', ['desvanecer', false]);
    await m.paso('miniHud', ['fuelPct', true]);
    await m.paso('miniHud', ['cruise', false]);
    await m.paso('reloj', ['12']);
    await m.paso('moneda', ['off']);
    await m.paso('rutaEnVivo', [false]);
    await m.paso('liviano', [true, true]);
    const a = JSON.parse(m.motor.ajustesNav());
    chequear(a.colorRuta === '#4caf50' && a.zoomNav === 11.5 && a.tamanoCamion === 2, `apariencia: ${a.colorRuta} ${a.zoomNav} ${a.tamanoCamion}`);
    chequear(a.baseReal === false && a.desvanecerBotones === false && a.liviano === true && a.livianoSinRuteo === true, 'base o liviano');
    chequear(a.reloj === '12' && a.moneda === 'off' && a.rutaEnVivo === false, 'reloj, moneda o ruta en vivo');
    chequear(a.miniHud.find((x) => x.id === 'fuelPct').activo && !a.miniHud.find((x) => x.id === 'cruise').activo, 'mini-HUD');
    chequear(m.nav().hora12 === true && m.nav().zoomNav === 11.5, 'la navegacion no se entero');
    const guardado = m.guardado.truckdash_settings;
    chequear(guardado && /"liteMode":true/.test(guardado) && /"routeColor":"#4caf50"/.test(guardado), `guardado: ${guardado}`);
    const otra = abrir({ almacen: { truckdash_settings: guardado } });
    await otra.iniciar();
    const b = JSON.parse(otra.motor.ajustesNav());
    chequear(b.colorRuta === '#4caf50' && b.zoomNav === 11.5 && b.reloj === '12' && b.liviano, 'no sobrevivio a reabrir');
    // Liviano sin ruteo no baja el grafo.
    const puntos = puntosDeRuta(m);
    await otra.paso('telemetria', [dato(otra, TRABAJO_DEMO, puntos[5][0], puntos[5][1], 90)]);
    await otra.tragar();
    chequear(otra.j('routeGraphState') === 'off' && !otra.nav().hayRuta, `liviano sin ruteo: ${otra.j('routeGraphState')}`);
  },

  // La moneda local sale de la zona del telefono, y el pago la muestra al lado.
  async pagoEnMoneda() {
    const m = abrir({ zona: 'America/Argentina/Buenos_Aires', tasas: { USD: 1, EUR: 0.9, ARS: 1000 } });
    await m.iniciar();
    await m.tragar();
    const a = JSON.parse(m.motor.ajustesNav());
    chequear(a.moneda === 'auto' && /ARS/.test(a.monedas[0].label), `la zona no dio la moneda: ${a.monedas[0].label}`);
    chequear(a.monedas.some((x) => x.id === 'ARS' && x.codigo), 'ARS no esta en la lista');
    const d = JSON.parse(dato(m, TRABAJO_DEMO, -100000, 10000, 90));
    d.jobIncome = 5000;
    d.game = 'ats';
    await m.paso('telemetria', [JSON.stringify(d)]);
    chequear(/\$5,000 · ≈ AR\$5,000,000/.test(m.nav().pagoTrabajo), `pago: ${m.nav().pagoTrabajo}`);
    await m.paso('moneda', ['off']);
    chequear(m.nav().pagoTrabajo === '$5,000', `apagado: ${m.nav().pagoTrabajo}`);
    await m.paso('conexion', [true, false]);
    await m.paso('moneda', ['EUR']);
    chequear(m.mensajes.some((x) => x.type === 'set_currency' && x.currency === 'EUR'), 'no le avisa al relay');
  },

  // Un mapa armado en la PC: todo se pide al cliente, por la red de la casa.
  async mapaLocal() {
    const m = abrir({});
    await m.paso('iniciar', [JSON.stringify({ lang: 'en', imperial: true, voz: false, version: 'android-test' })]);
    const raiz = 'http://192.168.1.10:27765/localmap/ats';
    await m.paso('ponerVariante', ['local_ats', 'huella1', 'ats', 'ats', 'ATS (local)', -96, 39, raiz, true]);
    chequear(m.j("resolveEffectiveGame('ats')") === 'local_ats', 'no eligio el mapa local');
    chequear(m.j('GAME_MAPS.local_ats.assetsDir') === `${raiz}/local_ats`, 'assetsDir');
    chequear(m.j('GAME_MAPS.local_ats.poisUrl') === `${raiz}/pois-local_ats.json`, 'poisUrl');
    chequear(m.j('GAME_MAPS.local_ats.companyIconsBase') === `${raiz}/company-icons`, 'logos');
    chequear(typeof m.j('GAME_MAPS.local_ats.toLngLat') === 'function', 'sin proyeccion');
    chequear(m.j('MAP_DATA_VERSION.local_ats') === 'huella1', 'version');
    // Otro host: no queda el de antes.
    await m.paso('ponerVariante', ['local_ats', 'huella2', 'ats', 'ats', 'ATS (local)', -96, 39, 'http://192.168.1.11:27765/localmap/ats', false]);
    chequear(/192\.168\.1\.11/.test(m.j('GAME_MAPS.local_ats.assetsDir')) && m.j('GAME_MAPS.local_ats.companyIconsBase') === null, 'quedo el host de antes');
    // Sin raiz sigue siendo el de R2.
    const v = MANIFEST.variants.ats;
    await m.paso('ponerVariante', ['ats', v.mapDataVersion, 'ats', 'ats', v.label, v.origin ? v.origin[0] : -96, v.origin ? v.origin[1] : 39, '', false]);
    chequear(/maps\.trucksim-dash\.com/.test(m.j('GAME_MAPS.ats.assetsDir')), 'el de R2 cambio');
  },

  // Mirar un convoy con su link: sin juego, sin grafo y con una salida.
  async mirarConvoy() {
    const m = abrir({});
    await m.iniciar();
    await m.paso('convoyMirar', ['abc']);
    chequear(m.avisos.length && !m.sockets.length, 'un codigo corto no se intenta');
    m.j("relayApp = 'wss://relay.test'");
    await m.paso('convoyMirar', ['abc123']);
    const abierto = m.sockets.find((s) => s[0] === 'abrir');
    chequear(abierto && abierto[2] === 'wss://relay.test/ws/convoy/ABC123', `socket: ${JSON.stringify(abierto)}`);
    const id = abierto[1];
    await m.paso('socket', [id, 'open', '', 0]);
    const estado = {
      type: 'convoy_state', code: 'ABC123', creatorId: 'a', spectators: 2,
      members: [
        { id: 'a', nickname: 'Lider', creator: true, online: true, game: 'ats', variant: 'ats', x: -100000, z: 10000, heading: 0, speedKmh: 80 },
        { id: 'b', nickname: 'Otro', online: true, game: 'ats', variant: 'ats', x: -90000, z: 12000, heading: 0 },
      ],
    };
    await m.paso('socket', [id, 'message', JSON.stringify(estado), 0]);
    await m.tragar();
    let c = JSON.parse(m.motor.convoyEstado());
    chequear(c.mirando && c.enSala && c.varianteMirada === 'ats' && c.marcas.length === 2, `estado: ${JSON.stringify({ m: c.mirando, s: c.enSala, v: c.varianteMirada, n: c.marcas.length })}`);
    chequear(c.marcas.every((x) => x.distancia === null) && c.tarjetas.every((x) => !x.puedeSeguir), 'mirando no hay distancia ni seguir');
    chequear(m.j('routeGraphState') === 'off', `bajo el grafo mirando: ${m.j('routeGraphState')}`);
    await m.paso('convoyDejarDeMirar');
    c = JSON.parse(m.motor.convoyEstado());
    chequear(!c.mirando && !c.enSala && !c.marcas.length, 'no salio');
    chequear(m.sockets.some((s) => s[0] === 'cerrar' && s[1] === id), 'no cerro el socket');
    chequear(m.j('conn.spectator') === false, 'sigue de espectador');
    chequear(!m.errores.length, m.errores.join('; '));
  },

  async manejo() {
    const t0 = Date.now();
    const m = await conRuta({ voz: true });
    const nav = m.nav();
    const puntos = m.j('currentRouteFull.length');
    console.log(`  ruta de ${puntos} puntos en ${Date.now() - t0} ms; la demo de la web tiene ${DEMO.path.length}`);
    chequear(Math.abs(puntos - DEMO.path.length) < DEMO.path.length * 0.1, `la ruta (${puntos}) no se parece a la de la web (${DEMO.path.length})`);
    chequear(nav.destino && nav.destino.kind === 'dest' && !nav.destino.approx, 'el destino no es la empresa del trabajo');
    chequear(m.rutaNueva && m.rutaNueva.conLinea, 'la ruta no avisa que hay linea (la autopista no cambiaria de color)');
    const linea = JSON.parse(m.motor.rutaGeo('route') || 'null');
    chequear(linea && linea.geometry.coordinates.every((l) => l.length >= 2), 'la linea no sirve para MapLibre Native');
    chequear(m.motor.rutaGeo('route-next') === '' && m.motor.rutaGeo('route-ferry') === '', 'una linea vacia llega al mapa: MapLibre Native la rechaza');

    const textos = new Set();
    let carriles = 0;
    const t1 = Date.now();
    const pasos = await manejar(m, TRABAJO_DEMO, puntosDeRuta(m), {
      alPaso: async () => {
        const n = m.nav();
        if (n.giro && n.giro.info !== 'straight') textos.add(n.giro.text.replace(/\d[\d.,\s]*\s*(ft|mi|m|km)/, '#'));
        if (n.carriles && n.carriles.length) carriles += 1;
      },
      tope: 1200,
    });
    console.log(`  ${pasos} datos en ${Date.now() - t1} ms; ${textos.size} avisos, con carriles en ${carriles} datos, voz ${m.audios.length}`);
    console.log(`  ejemplos: ${JSON.stringify([...textos].slice(0, 5))}`);
    chequear(textos.size >= 3, 'casi no hubo avisos de giro');
    chequear(carriles > 0, 'nunca hubo flechas de carril: no llego el -lanes.bin');
    chequear(m.audios.length > 0, 'la voz no dijo nada');
    chequear(m.audios.every((a) => String(a.src || a.text).length > 10), 'un audio sin clip ni texto');
    chequear(!m.errores.length, `errores: ${m.errores.slice(0, 3).join(' | ')}`);
  },

  async buscarLaCarga() {
    const sinCargar = { ...TRABAJO_DEMO, isCargoLoaded: false };
    const m = await abrir().iniciar();
    chequear(await esperarRuta(m, sinCargar, INICIO[0] + 500, INICIO[1] + 500, 90), 'sin ruta a la carga');
    const nav = m.nav();
    chequear(nav.destino && nav.destino.kind === 'pickup', `el destino deberia ser la carga: ${JSON.stringify(nav.destino)}`);
    chequear(nav.avisoRuta && /Coastline|Salt Lake/.test(nav.avisoRuta), `no dice que primero va a buscar la carga: ${nav.avisoRuta}`);
  },

  async desvio() {
    const m = await conRuta();
    const antes = m.j('currentRouteFull');
    const puntos = puntosDeRuta(m);
    await manejar(m, TRABAJO_DEMO, puntos, { tope: 40 });
    const p = puntos[30];
    // 400 m al costado: bastante mas que OFF_ROUTE_THRESHOLD_M, y sin ser un salto de mapa.
    await m.paso('telemetria', [dato(m, TRABAJO_DEMO, p[0] + 400, p[1] + 400, 90)], 250);
    await m.paso('telemetria', [dato(m, TRABAJO_DEMO, p[0] + 405, p[1] + 400, 90)], 250);
    chequear(m.j('currentRouteFull') !== antes, 'salido de la ruta no recalculo');
    const inicio = m.j('currentRouteFull[0]');
    chequear(Math.hypot(inicio[0] - p[0] - 405, inicio[1] - p[1] - 400) < 400, 'la ruta nueva no arranca cerca del camion');
    chequear(m.nav().hayRuta, 'despues de recalcular no hay ruta');
  },

  async paradasQueSeCumplenSolas() {
    const m = await conRuta();
    const puntos = puntosDeRuta(m);
    await manejar(m, TRABAJO_DEMO, puntos, { tope: 8 });
    const aca = puntos[6];
    chequear(await m.paso('parada', ['g']), 'el boton de combustible no encontro nada');
    let nav = m.nav();
    chequear(nav.waypoints.length === 1 && nav.waypoints[0].tipo === 'g', `no quedo la parada: ${JSON.stringify(nav.waypoints)}`);
    await m.paso('telemetria', [dato(m, TRABAJO_DEMO, aca[0], aca[1], 90)], 250);
    chequear(m.motor.rutaGeo('route') !== '', 'con la parada no hay linea hasta ella');
    // Cargo combustible: 400 -> 550 litros. Sin esto la parada quedaba para siempre.
    await m.paso('telemetria', [dato(m, TRABAJO_DEMO, aca[0], aca[1], 90, 0, { fuel: 550 })], 250);
    nav = m.nav();
    chequear(nav.waypoints.length === 0, 'cargar combustible no dio por cumplida la parada');
    chequear(m.avisos.some((a) => /fuel|refuel/i.test(a)), `no avisa que la dio por cumplida: ${JSON.stringify(m.avisos)}`);

    chequear(await m.paso('parada', ['p']), 'el boton de descanso no encontro nada');
    chequear(m.nav().waypoints[0] && m.nav().waypoints[0].tipo === 'p', 'no quedo la parada de descanso');
    await m.paso('telemetria', [dato(m, TRABAJO_DEMO, aca[0], aca[1], 90, 0, { restStopMinutes: 300 })], 250);
    await m.paso('telemetria', [dato(m, TRABAJO_DEMO, aca[0], aca[1], 90, 0, { restStopMinutes: 660 })], 250);
    chequear(m.nav().waypoints.length === 0, 'dormir no dio por cumplida la parada de descanso');
  },

  async sugerenciaDeParada() {
    const m = await conRuta();
    const puntos = puntosDeRuta(m);
    const aca = puntos[6];
    // Poco combustible: la web lo decide despues de unos datos (decideMs).
    for (let i = 0; i < 80 && !m.nav().sugerencia; i++) {
      await m.paso('telemetria', [dato(m, TRABAJO_DEMO, aca[0], aca[1], 90, 60, { fuel: 30 })], 1000);
    }
    let s = m.nav().sugerencia;
    chequear(s && s.tipo === 'g' && s.texto && s.boton, `no sugiere cargar: ${JSON.stringify(s)}`);
    await m.paso('cerrarSugerencia');
    await m.paso('telemetria', [dato(m, TRABAJO_DEMO, aca[0], aca[1], 90, 60, { fuel: 29 })], 1000);
    chequear(!m.nav().sugerencia, 'la sugerencia cerrada vuelve sola');
    // Y un viaje nuevo con otro tanque bajo la vuelve a ofrecer, ahora para aceptar.
    await m.paso('telemetria', [dato(m, TRABAJO_DEMO, aca[0], aca[1], 90, 60, { fuel: 300 })], 1000);
    for (let i = 0; i < 80 && !m.nav().sugerencia; i++) {
      await m.paso('telemetria', [dato(m, TRABAJO_DEMO, aca[0], aca[1], 90, 60, { fuel: 30 })], 1000);
    }
    s = m.nav().sugerencia;
    if (chequear(s, 'no vuelve a sugerir despues de cargar')) {
      await m.paso('aceptarSugerencia');
      const nav = m.nav();
      chequear(nav.waypoints.length === 1 && nav.waypoints[0].tipo === 'g', 'aceptar no agrega la estacion');
      chequear(!nav.sugerencia, 'la sugerencia sigue despues de aceptarla');
    }
  },

  async buscarYWaypoints() {
    const m = await conRuta();
    const puntos = puntosDeRuta(m);
    await manejar(m, TRABAJO_DEMO, puntos, { tope: 8 });
    const categoria = JSON.parse(await m.paso('buscar', ['', 'g']));
    chequear(categoria.lista.length > 0, 'la categoria combustible vino vacia');
    chequear(categoria.lista[0].distancia, 'un resultado sin distancia');
    const texto = JSON.parse(await m.paso('buscar', ['coastline', 'g']));
    chequear(texto.lista.some((r) => /coastline/i.test(r.nombre)), `no encuentra por nombre: ${JSON.stringify(texto.lista.slice(0, 2))}`);
    const tildes = JSON.parse(await m.paso('buscar', ['COASTLÍNE', 'g']));
    chequear(tildes.lista.length === texto.lista.length, 'la busqueda depende de mayusculas o tildes');
    const nada_ = JSON.parse(await m.paso('buscar', ['zzzzzz', 'g']));
    chequear(nada_.aviso && !nada_.lista.length, 'sin resultados no lo dice');

    await m.paso('buscar', ['coastline', 'g']);
    await m.paso('elegir', [0]);
    let nav = m.nav();
    chequear(nav.waypoints.length === 1 && /coastline/i.test(nav.waypoints[0].etiqueta), `elegir no agrega: ${JSON.stringify(nav.waypoints)}`);
    await m.paso('limpiarWaypoints');
    // Dos puntos lejos, tocando el mapa: uno cerca del camion se daria por alcanzado solo.
    const lejos = m.j(`toLngLat(${puntos[900][0]}, ${puntos[900][1]})`);
    const masLejos = m.j(`toLngLat(${puntos[1000][0]}, ${puntos[1000][1]})`);
    await m.paso('waypointEnMapa', [lejos[0], lejos[1]]);
    await m.paso('waypointEnMapa', [masLejos[0], masLejos[1]]);
    nav = m.nav();
    chequear(nav.waypoints.length === 2 && nav.waypoints[1].etiqueta === null, `tocar el mapa no agrega un punto sin nombre: ${JSON.stringify(nav.waypoints)}`);
    await m.paso('telemetria', [dato(m, TRABAJO_DEMO, puntos[6][0], puntos[6][1], 90)], 250);
    chequear(m.motor.rutaGeo('route-next') !== '', 'con dos paradas no hay tramo siguiente para dibujar');
    await m.paso('sacarWaypoint', [0]);
    chequear(m.nav().waypoints.length === 1, 'sacar no saca');
    await m.paso('limpiarWaypoints');
    chequear(m.nav().waypoints.length === 0, 'limpiar no limpia');
  },

  async ocultarYMostrar() {
    const m = await conRuta();
    const p = puntosDeRuta(m)[3];
    await m.paso('ocultarRuta');
    await m.paso('telemetria', [dato(m, TRABAJO_DEMO, p[0], p[1], 90)], 250);
    let nav = m.nav();
    chequear(!nav.hayRuta && nav.rutaOculta, `no se oculto: ${JSON.stringify({ h: nav.hayRuta, o: nav.rutaOculta })}`);
    chequear(m.motor.rutaGeo('route') === '', 'oculta, la linea sigue');
    await m.paso('mostrarRuta');
    await m.paso('telemetria', [dato(m, TRABAJO_DEMO, p[0], p[1], 90)], 250);
    nav = m.nav();
    chequear(nav.hayRuta && !nav.rutaOculta, 'no volvio la ruta');
  },

  // Regla 1 de CLAUDE.md: mas de un dispositivo por sesion.
  async otrosDispositivos() {
    const m = await conRuta();
    await m.paso('conexion', [true, false]);
    chequear(m.tipos().includes('route_plan_hello'), `no saluda al relay: ${m.tipos()}`);
    const hola = m.mensajes.find((t) => t.type === 'route_plan_hello');
    chequear(typeof hola.device === 'string' && hola.device.length > 3, 'saluda sin id de dispositivo');
    chequear(!m.tipos().includes('live_route'), 'sin compartir manda live_route: borraria la de otra pestana');

    // Un plan de otro dispositivo: los waypoints en la tablet y la navegacion aca.
    const p = puntosDeRuta(m)[20];
    await m.paso('mensaje', [JSON.stringify({ type: 'route_plan', variant: 'ats', rev: 5, list: [{ pos: [p[0] + 200, p[1] + 200], inGame: false, label: 'De la tablet' }] })]);
    chequear(m.nav().waypoints[0] && m.nav().waypoints[0].etiqueta === 'De la tablet', `no toma el plan: ${JSON.stringify(m.nav().waypoints)}`);

    // Y al reves: uno de aca sale al relay.
    m.mensajes.length = 0;
    await m.paso('waypointEnMapa', [-110, 39]);
    chequear(m.tipos().includes('set_route_plan'), `no le avisa a los demas: ${m.tipos()}`);
    const plan = m.mensajes.find((t) => t.type === 'set_route_plan');
    chequear(plan && plan.variant === 'ats' && plan.list.length === 2 && plan.nonce, `plan mal armado: ${JSON.stringify(plan)}`);

    m.mensajes.length = 0;
    await m.paso('perfilRuta', ['shortest']);
    chequear(m.tipos().includes('set_route_prefs'), `el perfil no llega a los demas: ${m.tipos()}`);
    chequear(m.nav().perfil === 'shortest', 'no cambio el perfil');

    // La voz: prender la trae aca; si despues la tiene otro, aca no suena.
    m.mensajes.length = 0;
    await m.paso('voz', [true]);
    const pedidoVoz = m.mensajes.find((t) => t.type === 'set_voice_device');
    chequear(pedidoVoz, `prender la voz no la reclama: ${m.tipos()}`);
    // Un telefono se presenta como telefono: es lo que leen los demas dispositivos.
    chequear(pedidoVoz && pedidoVoz.kind === 'phone' && pedidoVoz.os === 'Android', `se presenta como ${JSON.stringify(pedidoVoz)}`);
    chequear(m.nav().vozEnOtro === null, `la voz esta aca y dice que esta en otro: ${m.nav().vozEnOtro}`);
    chequear(m.audios.length > 0, 'prender la voz no dice la frase de prueba');
    await m.paso('mensaje', [JSON.stringify({ type: 'voice_device', device: hola.device, kind: 'phone', os: 'Android', browser: null })]);
    await m.paso('mensaje', [JSON.stringify({ type: 'voice_device', device: 'otro-dispositivo', kind: 'computer', os: 'Windows', browser: 'Chrome' })]);
    chequear(m.j('voiceHere()') === false, 'con la voz en otro dispositivo sigue hablando aca');
    // Que no parezca que se rompio: dice donde esta y se puede traer.
    chequear(/Windows/.test(m.nav().vozEnOtro || ''), `no dice donde esta la voz: ${m.nav().vozEnOtro}`);
    chequear(m.avisos.some((a) => /Windows/.test(a)), `no avisa que se la llevaron: ${JSON.stringify(m.avisos)}`);
    m.mensajes.length = 0;
    await m.paso('traerVoz');
    const traida = m.mensajes.find((t) => t.type === 'set_voice_device');
    chequear(traida && traida.device === hola.device, `el boton no la trae: ${JSON.stringify(traida)}`);
    await m.paso('mensaje', [JSON.stringify({ type: 'voice_device', device: hola.device, kind: 'phone', os: 'Android', browser: null })]);
    chequear(m.j('voiceHere()') === true && m.nav().vozEnOtro === null, 'vuelta aca, sigue callada o diciendo que esta en otro');
  },

  // Lo de Ajustes: se muestra con los textos de la web, se guarda y vuelve al abrir.
  async ajustesDeNavegacion() {
    const m = await conRuta();
    await m.paso('conexion', [true, false]);
    JSON.parse(m.motor.ajustesNav()); // la primera vez baja la lista de voces
    await m.tragar();
    let a = JSON.parse(m.motor.ajustesNav());
    chequear(a.voces.length >= 2 && a.voz && a.voces.some((v) => v.id === a.voz), `sin voces: ${JSON.stringify(a.voces).slice(0, 200)}`);
    chequear(a.voces.some((v) => / · Español$/.test(v.label)), `las voces de otro idioma no dicen cual: ${a.voces.map((v) => v.label)}`);
    chequear(a.momentos.length === 3 && a.descansos.length >= 3, 'faltan opciones');
    chequear(a.descansos.some((d) => d.id === a.descanso), `el descanso elegido no esta en la lista: ${a.descanso}`);
    for (const [k, v] of Object.entries(a.textos)) chequear(v && v !== k, `sin texto para ${k}`);
    chequear(a.dlc[0].juego === 'ats' && a.dlc[0].lista.length > 5, 'primero van los DLC del juego que se juega');

    await m.paso('elegirVoz', [a.voces[1].id]);
    chequear(JSON.parse(m.motor.ajustesNav()).voz === a.voces[1].id, 'no cambio la voz');
    await m.paso('momentoVoz', ['early']);
    await m.paso('avisoDescanso', ['60']);
    await m.paso('cadaSalida', [true]);
    m.mensajes.length = 0;
    await m.paso('dlcAutomatico', [false]);
    chequear(m.tipos().includes('set_route_prefs'), `pasar a manual no llega a los demas: ${m.tipos()}`);
    m.mensajes.length = 0;
    const unDlc = a.dlc[0].lista[0].id;
    await m.paso('dlcActivo', ['ats', unDlc, false]);
    const prefs = m.mensajes.find((t) => t.type === 'set_route_prefs');
    chequear(prefs && prefs.dlcOff.ats.includes(unDlc), `el DLC apagado no llega: ${JSON.stringify(prefs)}`);
    a = JSON.parse(m.motor.ajustesNav());
    chequear(a.dlc[0].lista.find((d) => d.id === unDlc).activo === false, 'sigue prendido');
    m.mensajes.length = 0;
    await m.paso('perfilRuta', ['shortest']);
    const propio = m.mensajes.find((t) => t.type === 'set_route_prefs');

    // Hasta que el relay contesta el cambio propio no se toma otro: el ultimo que acepta es el que queda.
    await m.paso('mensaje', [JSON.stringify({ type: 'route_prefs', rev: 1000, nonce: propio.nonce, profile: 'shortest', dlcAuto: false, dlcOff: { ats: [unDlc], ets2: [] } })]);
    // Los ajustes de otro dispositivo se ven aca y se avisa que cambiaron.
    chequear(JSON.parse(m.motor.volcar()).ajustes === undefined, 'avisa dos veces');
    m.motor.mensaje(JSON.stringify({ type: 'route_prefs', rev: 2000, profile: 'fastest', dlcAuto: false, dlcOff: { ats: [], ets2: [] } }));
    chequear(JSON.parse(m.motor.volcar()).ajustes === true, 'no avisa que cambiaron los ajustes: Ajustes queda mostrando lo de antes');
    a = JSON.parse(m.motor.ajustesNav());
    chequear(a.perfil === 'fastest' && a.dlc[0].lista.find((d) => d.id === unDlc).activo, `no toma lo del otro: ${a.perfil}`);

    // Y al volver a abrir la app estan.
    await m.paso('perfilRuta', ['shortest']);
    const n = abrir({ almacen: Object.fromEntries(Object.entries(m.guardado).filter(([, v]) => v !== null)) });
    await n.iniciar();
    await n.tragar();
    const b = JSON.parse(n.motor.ajustesNav());
    chequear(b.perfil === 'shortest', `no guardo el perfil: ${b.perfil}`);
    chequear(b.momento === 'early' && b.descanso === '60' && b.cadaSalida === true, `no guardo: ${b.momento} ${b.descanso} ${b.cadaSalida}`);
    chequear(b.dlcAuto === false, 'no guardo los DLC a mano');
    n.errores.forEach((e) => chequear(false, `error al volver a abrir: ${e}`));
  },

  // La demo de la web: maneja sola, y sus datos dan una ruta como los del cliente.
  async demo() {
    const m = abrir();
    await m.iniciar();
    await m.tragar();
    await m.paso('demo');
    for (let i = 0; i < 400 && !m.demo.length; i++) await m.paso('pulso', [], 250);
    chequear(m.demo.length > 0, 'la demo no arranca');
    let hayRuta = false;
    for (let i = 0; i < 60 && !hayRuta; i++) {
      const datos = m.demo.splice(0);
      for (const d of datos) await m.paso('telemetria', [d]);
      await m.paso('pulso', [], 250);
      hayRuta = m.nav().hayRuta;
    }
    chequear(hayRuta, 'con los datos de la demo no sale ruta');
    const d = JSON.parse(m.demo[0] || '{}');
    chequear(d.position && Number.isFinite(d.speedKmh), `dato raro: ${JSON.stringify(d).slice(0, 160)}`);
    chequear(!JSON.parse(m.motor.convoyEstado()).disponible, 'en la demo no hay convoy');
    JSON.parse(m.motor.abrirReporte());
    await m.paso('mandarReporte', ['route', 'algo']);
    chequear(m.reporte && m.reporte.estado === 'falta', `en la demo no se manda el reporte: ${JSON.stringify(m.reporte)}`);
    // Salir la frena: una demo andando sin pantalla gasta bateria.
    await m.paso('olvidar');
    m.demo.length = 0;
    for (let i = 0; i < 8; i++) await m.paso('pulso', [], 250);
    chequear(m.demo.length === 0, `sigue andando despues de salir: ${m.demo.length}`);
    m.errores.forEach((e) => chequear(false, `error: ${e}`));
  },

  // Lo que se baja para tener un mapa sin internet es lo que el mapa pide de verdad.
  async mapasSinInternet() {
    const m = await conRuta();
    await m.motor.buscar('', 'g');
    await m.tragar();
    const v = MANIFEST.variants.ats.mapDataVersion;
    const urls = JSON.parse(m.motor.urlsDeMapa('ats', v));
    const pedidas = [...archivosPedidos.keys()];
    for (const u of urls) chequear(pedidas.includes(u), `no es lo que pide el mapa: ${u}`);
    const delMapa = pedidas.filter((u) => /maps\.trucksim-dash\.com\/ats\/|pois-ats/.test(u));
    for (const u of delMapa) chequear(urls.includes(u), `el mapa pide esto y no se baja: ${u}`);
  },

  // Un cliente viejo: se avisa, con el link que da el relay.
  async clienteViejo() {
    const m = await conRuta();
    chequear(m.nav().actualizarCliente === null, 'avisa sin saber la version');
    m.j("latestClientVersion = '9.9.9'; latestDownloadUrl = 'https://trucksim-dash.com/descarga'");
    m.motor.mensaje(JSON.stringify({ type: 'client_status', status: 'live', clientVersion: '1.0.0' }));
    const a = m.nav().actualizarCliente;
    chequear(a && a.texto.includes('9.9.9') && a.url.includes('descarga') && a.boton, `aviso: ${JSON.stringify(a)}`);
    m.motor.mensaje(JSON.stringify({ type: 'client_status', status: 'live', clientVersion: '9.9.9' }));
    chequear(m.nav().actualizarCliente === null, 'avisa con la version al dia');
  },

  // convoy.js corre entero: aca, que llegue lo que hay que mostrar y lo que hay que mandar.
  async convoy() {
    const m = await conRuta();
    await m.paso('conexion', [true, false]);
    let c = JSON.parse(m.motor.convoyEstado());
    chequear(c.disponible && c.conectado && !c.enSala, `sin entrar: ${JSON.stringify({ d: c.disponible, c: c.conectado, s: c.enSala })}`);
    for (const [k, v] of Object.entries(c.textos)) chequear(v && v !== k, `sin texto para ${k}`);
    chequear(c.mensajes.length === 6 && c.mensajes.every((x) => !x.label.includes('convoyMsg_')), `mensajes: ${JSON.stringify(c.mensajes)}`);

    m.mensajes.length = 0;
    m.avisos.length = 0;
    await m.paso('convoyEntrar', ['create', '', 'x', false]);
    chequear(!m.tipos().includes('convoy_create') && m.avisos.length === 1, 'con un apodo de una letra no tiene que crear');
    await m.paso('convoyEntrar', ['join', 'ABC', 'Tomas', false]);
    chequear(!m.tipos().includes('convoy_join'), 'con un codigo corto no tiene que entrar');
    await m.paso('convoyEntrar', ['create', '', 'Tomas', true]);
    const pedido = m.mensajes.find((t) => t.type === 'convoy_create');
    chequear(pedido && pedido.nickname === 'Tomas' && pedido.postSummary === true && pedido.mapVariant === 'ats', `crear: ${JSON.stringify(pedido)}`);

    const puntos = puntosDeRuta(m);
    const yo = 'yo000001';
    const otro = { id: 'otro0001', nickname: 'Ana', color: 2, creator: false, online: true, variant: 'ats', game: 'ats', x: puntos[40][0], z: puntos[40][1], heading: 0.25, speedKmh: 80, cargo: 'Madera', citySrc: 'Reno', cityDst: 'Elko', etaSeconds: 3600, distanceKm: 100, fuelPct: 55, restMin: 200, jobIncome: 5000, truck: 'Volvo VNL' };
    const estado = (extra = {}) => JSON.stringify({ type: 'convoy_state', code: 'ABCDEF', you: yo, creatorId: yo, driver: true, spectators: 1, members: [{ id: yo, nickname: 'Tomas', color: 0, creator: true, online: true, game: 'ats', variant: 'ats' }, otro], ...extra });
    m.mensajes.length = 0;
    await m.paso('mensaje', [estado()]);
    c = JSON.parse(m.motor.convoyEstado());
    chequear(c.enSala && c.codigo === 'ABCDEF' && c.soyLider, `adentro: ${JSON.stringify({ s: c.enSala, c: c.codigo, l: c.soyLider })}`);
    chequear(c.enlace.includes('?convoy=ABCDEF'), `enlace: ${c.enlace}`);
    chequear(/1/.test(c.espectadores), `espectadores: ${c.espectadores}`);
    chequear(c.miembros.length === 2 && c.miembros[0].yo && c.miembros[1].nombre === 'Ana', `miembros: ${JSON.stringify(c.miembros)}`);
    const tarjeta = c.tarjetas[0];
    chequear(c.tarjetas.length === 1 && tarjeta.nombre === 'Ana' && tarjeta.color === '#4caf50', `tarjeta: ${JSON.stringify(tarjeta)}`);
    chequear(tarjeta.filas.some(([, v]) => /Reno → Elko/.test(v)), `sin la ruta: ${JSON.stringify(tarjeta.filas)}`);
    chequear(tarjeta.filas.some(([, v]) => /Volvo/.test(v)), `sin el camion: ${JSON.stringify(tarjeta.filas)}`);
    chequear(c.marcas.length === 1 && Number.isFinite(c.marcas[0].lng) && Number.isFinite(c.marcas[0].rumbo), `marcas: ${JSON.stringify(c.marcas)}`);
    chequear(m.tipos().includes('convoy_route'), `entrar no manda la ruta: ${m.tipos()}`);

    // Una linea de un solo punto no llega al mapa: MapLibre Native rechaza todo el GeoJSON.
    await m.paso('mensaje', [JSON.stringify({ type: 'convoy_route', id: otro.id, rev: 1, points: [[1, 2]] })]);
    chequear(JSON.parse(m.motor.rutaConvoyGeo()).geo === '', 'no es el lider: no se dibuja su ruta');

    // Mensajes y sonidos.
    m.avisos.length = 0;
    await m.paso('mensaje', [JSON.stringify({ type: 'convoy_msg', id: otro.id, nickname: 'Ana', key: 'fuel' })]);
    chequear(m.avisos.some((a) => a.includes('Ana')), `no avisa el mensaje: ${JSON.stringify(m.avisos)}`);
    chequear(JSON.parse(m.motor.convoyEstado()).tarjetas[0].nota, 'la nota no queda en la tarjeta');
    m.mensajes.length = 0;
    await m.paso('convoyMandar', ['ok']);
    chequear(m.mensajes.some((t) => t.type === 'convoy_msg' && t.key === 'ok'), 'no manda el mensaje rapido');
    await m.paso('convoyEchar', [otro.id]);
    chequear(m.mensajes.some((t) => t.type === 'convoy_kick' && t.id === otro.id), 'no echa');

    // Seguir al lider: un waypoint que sale solo con el convoy.
    const lider = { ...otro, creator: true };
    await m.paso('mensaje', [estado({ creatorId: otro.id, members: [{ id: yo, nickname: 'Tomas', color: 0, creator: false, online: true, game: 'ats', variant: 'ats' }, lider] })]);
    const fin = puntos[60];
    await m.paso('mensaje', [JSON.stringify({ type: 'convoy_route', id: otro.id, rev: 2, points: [puntos[50], fin] })]);
    const ruta = JSON.parse(m.motor.rutaConvoyGeo());
    chequear(ruta.geo !== '' && ruta.color === '#4caf50', `la ruta del lider: ${JSON.stringify(ruta).slice(0, 200)}`);
    chequear(JSON.parse(m.motor.convoyEstado()).tarjetas[0].puedeSeguir, 'no se puede seguir al lider');
    const antes = m.nav().waypoints.length;
    await m.paso('convoySeguir', [true]);
    chequear(m.nav().waypoints.length === antes + 1, `seguir no agrega el punto: ${JSON.stringify(m.nav().waypoints)}`);
    await m.paso('convoySeguir', [false]);
    chequear(m.nav().waypoints.length === antes, 'dejar de seguir no lo saca');

    // Reconectar: se vuelve a entrar solo.
    m.mensajes.length = 0;
    await m.paso('conexion', [false, false]);
    await m.paso('conexion', [true, false]);
    chequear(m.mensajes.some((t) => t.type === 'convoy_join' && t.code === 'ABCDEF'), `no vuelve a entrar: ${m.tipos()}`);

    // Por LAN no hay convoy, y lo dice.
    const l = await conRuta();
    await l.paso('conexion', [true, true]);
    c = JSON.parse(l.motor.convoyEstado());
    chequear(!c.disponible && c.aviso, `por LAN: ${JSON.stringify({ d: c.disponible, a: c.aviso })}`);

    // La sesion se olvido: no queda el convoy en pantalla.
    await m.paso('olvidar');
    chequear(!JSON.parse(m.motor.convoyEstado()).enSala, 'queda adentro de un convoy sin sesion');
    m.errores.forEach((e) => chequear(false, `error: ${e}`));
  },

  // Las entregas de este telefono: una por entrega, y se pueden borrar.
  async historialDeViajes() {
    const m = await conRuta();
    const puntos = puntosDeRuta(m);
    const entrega = (activo) => {
      const d = JSON.parse(dato(m, TRABAJO_DEMO, puntos[5][0], puntos[5][1], 90));
      d.event = activo ? { jobDelivered: true, jobSrc: 'Reno', jobDst: 'Elko', jobCargo: 'Madera', jobTruckBrand: 'Volvo', jobTruckName: 'VNL', jobDeliveredRevenue: 5000, jobDeliveredDistanceKm: 100 } : {};
      return JSON.stringify(d);
    };
    await m.paso('telemetria', [entrega(false)]);
    chequear(JSON.parse(m.motor.viajes()).lista.length === 0, 'arranca con viajes');
    await m.paso('telemetria', [entrega(true)]);
    await m.paso('telemetria', [entrega(true)]);
    await m.paso('telemetria', [entrega(false)]);
    const v = JSON.parse(m.motor.viajes());
    chequear(v.lista.length === 1, `una entrega son ${v.lista.length} viajes`);
    chequear(v.lista[0].ruta === 'Reno → Elko' && /Volvo VNL/.test(v.lista[0].detalle) && /5,000|5000/.test(v.lista[0].pago), `viaje: ${JSON.stringify(v.lista[0])}`);
    chequear(v.titulo && v.vacio && v.borrar, 'sin textos');
    await m.paso('borrarViajes');
    chequear(JSON.parse(m.motor.viajes()).lista.length === 0, 'no borra');
  },

  // Lo que la web le pone al mapa ademas de la ruta: los datos salen de ella.
  async capasDelMapa() {
    const m = await conRuta();
    await m.motor.buscar('', 'g'); // por si los POIs todavia no bajaron
    await m.tragar();
    const capa = (c) => { const t = m.motor.capaGeo(c); return t ? JSON.parse(t).features : []; };
    const info = () => JSON.parse(m.motor.capasInfo());
    const escudos = capa('road-shields');
    chequear(escudos.length > 500, `pocos escudos en ATS: ${escudos.length}`);
    chequear(escudos.every((f) => f.properties.label && Math.abs(f.geometry.coordinates[0]) <= 180), 'un escudo sin nombre o fuera del mundo');
    const i = info();
    const dibujos = new Map(i.escudos.map((e) => [e.label, e]));
    chequear(escudos.every((f) => dibujos.has(f.properties.label)), 'un escudo sin su dibujo');
    chequear(dibujos.get('I-80') && dibujos.get('I-80').k === 'i' && dibujos.get('I-80').n === '80', `I-80: ${JSON.stringify(dibujos.get('I-80'))}`);
    chequear(capa('atlas').length > 10, `sin Atlas: ${capa('atlas').length}`);
    chequear(capa('car-parking').every((f) => Number.isFinite(f.geometry.coordinates[0])), 'estacionamiento sin lugar');
    chequear(Array.isArray(i.filtroPoi), `sin filtro de POIs: ${JSON.stringify(i.filtroPoi)}`);
    const conGas = JSON.stringify(i.filtroPoi).includes('gas_ico');
    chequear(conGas === (capa('fuel').length === 0), `el combustible sale de los dos lados o de ninguno (filtro ${conGas}, ${capa('fuel').length} surtidores)`);
    chequear(i.estacionamiento === false, 'en camion no se ven los estacionamientos de auto');

    // En auto: sin los estacionamientos de camion, y los de auto a la vista.
    const puntos = puntosDeRuta(m);
    const enAuto = JSON.parse(dato(m, TRABAJO_DEMO, puntos[5][0], puntos[5][1], 90));
    Object.assign(enAuto, m.j('({})'));
    m.j('drivingCar = false');
    m.j('isDrivingCar = function () { return true; }');
    m.motor.telemetria(JSON.stringify(enAuto));
    await m.tragar();
    chequear(info().estacionamiento === true, 'en auto no se ven los estacionamientos');
    chequear(!JSON.stringify(info().filtroPoi).includes('parking_ico'), 'en auto siguen los estacionamientos de camion');

    // En ETS2 los carteles no traen el numero: sin escudos y sin errores.
    const e = abrir({ variante: 'ets2' });
    await e.iniciar();
    await e.tragar();
    const fe = e.motor.capaGeo('road-shields');
    chequear(!fe || JSON.parse(fe).features.length === 0, `ETS2 con escudos: ${fe.length}`);
    e.errores.forEach((x) => chequear(false, `error en ETS2: ${x}`));
  },

  // Por LAN el plan va por una conexion aparte al relay, con el codigo que pasa el cliente.
  async planPorLan() {
    const m = await conRuta();
    await m.paso('conexion', [true, true]);
    chequear(!m.tipos().includes('route_plan_hello'), 'por LAN saluda por el socket del cliente');
    chequear(m.j('planCapable()') === false, 'sin relay no deberia esperar a otro dispositivo para hablar');
    await m.paso('mensaje', [JSON.stringify({ type: 'session_state', client_connected: true, client_status: { status: 'live' }, liveShare: false, planRelay: { backend: 'wss://relay.example', code: 'ABCD2345' } })]);
    const abre = m.sockets.find((o) => o[0] === 'abrir');
    if (!chequear(abre && abre[2] === 'wss://relay.example/ws/live/ABCD2345?role=plan', `no abre el plan: ${JSON.stringify(m.sockets)}`)) return;
    const id = abre[1];
    const enviado = () => m.sockets.filter((o) => o[0] === 'enviar' && o[1] === id).map((o) => JSON.parse(o[2]));

    m.sockets.length = 0;
    await m.paso('socket', [id, 'open', '', 0]);
    chequear(enviado().some((t) => t.type === 'route_plan_hello'), `no saluda por el plan: ${JSON.stringify(m.sockets)}`);

    const p = puntosDeRuta(m)[20];
    await m.paso('socket', [id, 'message', JSON.stringify({ type: 'route_plan', variant: 'ats', rev: 5, list: [{ pos: [p[0] + 200, p[1] + 200], inGame: false, label: 'De la tablet' }] }), 0]);
    chequear(m.nav().waypoints[0] && m.nav().waypoints[0].etiqueta === 'De la tablet', `no toma el plan: ${JSON.stringify(m.nav().waypoints)}`);

    m.sockets.length = 0;
    m.mensajes.length = 0;
    await m.paso('waypointEnMapa', [-110, 39]);
    chequear(enviado().some((t) => t.type === 'set_route_plan'), 'un cambio de aca no sale por el plan');
    chequear(!m.tipos().includes('set_route_plan'), 'y no tiene que ir por el socket del cliente, que no lo entiende');

    // Sin internet la LAN anda igual, y el plan reintenta solo.
    m.sockets.length = 0;
    await m.paso('socket', [id, 'close', '', 1006]);
    await m.paso('pulso', [], 6000);
    const otra = m.sockets.find((o) => o[0] === 'abrir');
    chequear(otra && otra[1] !== id, `no reintenta: ${JSON.stringify(m.sockets)}`);

    // Conectada por codigo, ya no hace falta.
    m.sockets.length = 0;
    m.mensajes.length = 0;
    await m.paso('conexion', [false, true]);
    await m.paso('conexion', [true, false]);
    chequear(m.sockets.some((o) => o[0] === 'cerrar'), 'queda abierta la conexion del plan');
    chequear(m.tipos().includes('route_plan_hello'), 'por codigo saluda por el socket de siempre');
  },

  // Lo mismo que la ventana de la web: lo que se ve es lo que se manda.
  async reporteDeNavegacion() {
    const m = await conRuta();
    const puntos = puntosDeRuta(m);
    await manejar(m, TRABAJO_DEMO, puntos, { tope: 300 });
    const f = JSON.parse(m.motor.abrirReporte());
    chequear(f.hayAvisos && /Route:/.test(f.reporte), `reporte vacio: ${f.reporte.slice(0, 200)}`);
    chequear(f.reporte.includes('android-test'), `no dice que app lo manda: ${f.reporte.slice(0, 200)}`);
    // Los km de cada aviso y los recalculos, como en la web (reporte #39, 11-11).
    chequear(/ \(left: app [\d.]+ km, game [\d.?]+/.test(f.reporte), `avisos sin km: ${f.reporte.slice(0, 600)}`);
    chequear(/Route changes, newest first:\n1\. .*, truck at -?\d+, -?\d+: app /.test(f.reporte), `sin cambios de ruta: ${f.reporte.slice(-400)}`);
    chequear(f.tipos.length === 6 && f.tipos.every((x) => x.label && !x.label.startsWith('navReport')), `tipos: ${JSON.stringify(f.tipos)}`);
    for (const [k, v] of Object.entries(f.textos)) chequear(v && v !== k, `sin texto para ${k}`);

    await m.paso('mandarReporte', [null, 'algo']);
    chequear(m.reporte && m.reporte.estado === 'falta', `sin tipo no tiene que salir: ${JSON.stringify(m.reporte)}`);

    let pedido = null;
    m.alPost = (p) => { pedido = p; return { status: 0, cuerpo: '' }; };
    await m.paso('mandarReporte', ['route', 'se fue por otro lado']);
    chequear(m.reporte.estado === 'fallo', `sin red no ofrece copiarlo: ${JSON.stringify(m.reporte)}`);
    chequear(pedido && /\/nav-reports$/.test(pedido.url) && pedido.method === 'POST', `pedido: ${JSON.stringify(pedido)}`);
    const cuerpo = JSON.parse(pedido.body);
    chequear(cuerpo.kind === 'route' && cuerpo.description === 'se fue por otro lado' && cuerpo.report === f.reporte, 'lo que sale no es lo que se vio');

    m.alPost = () => ({ status: 429, cuerpo: '' });
    await m.paso('mandarReporte', ['route', 'otra vez']);
    chequear(m.reporte.estado === 'muchos', `429: ${JSON.stringify(m.reporte)}`);

    m.alPost = () => ({ status: 200, cuerpo: JSON.stringify({ id: 42, token: 'clave12345678901234567890' }) });
    await m.paso('mandarReporte', ['route', 'otra vez']);
    chequear(m.reporte.estado === 'mandado' && /42/.test(m.reporte.texto), `mandado: ${JSON.stringify(m.reporte)}`);

    // Cuando se arregla, avisa una vez.
    m.avisos.length = 0;
    let preguntaron = null;
    m.alPost = (p) => { preguntaron = p; return { status: 200, cuerpo: JSON.stringify({ reports: [{ id: 42, status: 'fixed' }] }) }; };
    m.j('checkNavReports()');
    await m.tragar();
    chequear(preguntaron && /\/nav-reports\/status$/.test(preguntaron.url), `no pregunta: ${JSON.stringify(preguntaron)}`);
    chequear(m.avisos.some((a) => /42/.test(a)), `no avisa que se arreglo: ${JSON.stringify(m.avisos)}`);
    m.avisos.length = 0;
    preguntaron = null;
    m.j('checkNavReports()');
    await m.tragar();
    chequear(!preguntaron && !m.avisos.length, 'pregunta o avisa de nuevo');

    // Sin avisos de giro y sin escribir nada: el primero pide confirmar.
    const v = await conRuta();
    JSON.parse(v.motor.abrirReporte());
    v.alPost = () => ({ status: 200, cuerpo: JSON.stringify({ id: 7, token: 'clave12345678901234567890' }) });
    await v.paso('mandarReporte', ['other', '']);
    chequear(v.reporte.estado === 'confirmar' && v.reporte.boton, `no pide confirmar: ${JSON.stringify(v.reporte)}`);
    await v.paso('mandarReporte', ['other', '']);
    chequear(v.reporte.estado === 'mandado', `el segundo lo manda igual: ${JSON.stringify(v.reporte)}`);
  },

  // Sin overlay no se manda nada; con el, los giros llegan al juego aunque no haya pestana.
  async overlayDelJuego() {
    const m = await conRuta();
    await m.paso('conexion', [true, false]);
    const puntos = puntosDeRuta(m);
    await manejar(m, TRABAJO_DEMO, puntos, { tope: 4 });
    chequear(!m.tipos().includes('nav_hud'), 'manda nav_hud sin overlay prendido');
    await m.paso('mensaje', [JSON.stringify({ type: 'client_status', status: 'live', overlay: true })]);
    m.mensajes.length = 0;
    // Las paradas cercanas se buscan de a una por dato: tardan unos cuantos en aparecer.
    await manejar(m, TRABAJO_DEMO, puntos, { desde: 4, tope: 200 });
    const huds = m.mensajes.filter((t) => t.type === 'nav_hud');
    const hud = huds.find((t) => t.near) || huds[huds.length - 1];
    if (chequear(hud, `con overlay no manda nav_hud: ${m.tipos()}`)) {
      chequear(hud.turn && hud.src, `nav_hud sin giro: ${JSON.stringify(hud).slice(0, 200)}`);
      chequear(hud.remainingKm > 0, `nav_hud sin lo que falta: ${hud.remainingKm}`);
      chequear(hud.remainingLabel && hud.remainingLabel !== 'routeRemainingLabel', 'nav_hud sin sus textos traducidos');
      chequear(typeof hud.remaining === 'string' && /\d/.test(hud.remaining), `nav_hud sin el texto de lo que falta: ${JSON.stringify(hud.remaining)}`);
      console.log(`  nav_hud: ${JSON.stringify({ turn: hud.turn, remaining: hud.remaining, arrival: hud.arrival, near: hud.near })}`);
      chequear(Array.isArray(hud.near) && hud.near[0].dist, `nav_hud sin las paradas cercanas: ${JSON.stringify(hud.near)}`);
    }
  },

  // Lejos de toda calle (un camino de un mod de mapa, un deposito enorme) ninguna ruta pasa cerca
  // del camion. No se calcula otra igual en cada dato: sin JIT eran segundos por dato, sin parar,
  // y la app no hacia ni giros ni busqueda (primer tester de la beta, 06-11).
  async fueraDelGrafo() {
    const m = await conRuta();
    m.j(`var rutasCalculadas = 0; var recalcOnRouteWeb = recalcOnRoute;
      recalcOnRoute = function (o) { rutasCalculadas++; return recalcOnRouteWeb(o); };`);
    const lejos = m.j(`(function () {
      var n = routeGraph.nodes;
      for (var d = 500; d <= 30000; d += 250) {
        var x = ${INICIO[0]} + d, z = ${INICIO[1]} - d;
        var i = nearestNodeIndex(x, z, 'real');
        if (Math.hypot(n[2 * i] - x, n[2 * i + 1] - z) > 450) return [x, z];
      }
      return null;
    })()`);
    if (!chequear(lejos, 'no hay ningun lugar lejos de las calles')) return;
    const [x, z] = lejos;
    const paso = (dx, kmh = 30) => m.paso('telemetria', [dato(m, TRABAJO_DEMO, x + dx, z, 90, kmh)], 250);
    for (let i = 0; i < 20; i++) await paso(i);
    chequear(m.j('rutasCalculadas') === 1, `calcula en cada dato estando lejos: ${m.j('rutasCalculadas')} rutas en 20 datos`);
    chequear(m.nav().hayRuta, 'lejos de las calles se queda sin ruta');
    // Andando un buen trecho, si: puede haber llegado a otra calle.
    await paso(400);
    chequear(m.j('rutasCalculadas') === 2, `no recalcula al moverse: ${m.j('rutasCalculadas')} rutas`);
    // Y un desvio comun sigue siendo en el momento, cada vez.
    await m.paso('telemetria', [dato(m, TRABAJO_DEMO, INICIO[0], INICIO[1], RUMBO_INICIO, 0)], 250);
    const antes = m.j('rutasCalculadas');
    chequear(antes === 3, `volviendo a una calle no recalcula: ${antes} rutas`);
    await m.paso('telemetria', [dato(m, TRABAJO_DEMO, INICIO[0], INICIO[1], RUMBO_INICIO, 0)], 250);
    chequear(m.j('rutasCalculadas') === antes, 'sobre la ruta sigue recalculando');
  },

  async compartirLaRuta() {
    const m = await conRuta();
    await m.paso('conexion', [true, false]);
    m.mensajes.length = 0;
    await m.paso('compartir', [true, 'ats']);
    const ida = m.mensajes.find((t) => t.type === 'live_route');
    chequear(ida && ida.points.length > 1, 'compartiendo no manda la ruta al mapa en vivo');
    m.mensajes.length = 0;
    await m.paso('compartir', [false, null]);
    const vuelta = m.mensajes.find((t) => t.type === 'live_route');
    chequear(vuelta && vuelta.points.length === 0, 'al dejar de compartir la ruta sigue en el mapa en vivo');
  },

  async idiomas() {
    const vistos = new Set();
    for (const lang of ['en', 'es', 'de', 'fr', 'pt', 'pl', 'tr', 'ru']) {
      const m = await abrir({ lang, imperial: false }).iniciar();
      const textos = JSON.parse(m.motor.textos(JSON.stringify(['navStraight', 'poiCatFuel'])));
      chequear(textos.navStraight && textos.navStraight !== 'navStraight', `${lang}: sin traduccion`);
      vistos.add(textos.navStraight);
      if (lang === 'es') chequear(m.j('(1234.5).toLocaleString("es", { minimumFractionDigits: 1, maximumFractionDigits: 1 })') === '1.234,5', 'los numeros no van con el formato del idioma');
    }
    chequear(vistos.size >= 7, `los idiomas dan casi lo mismo: ${[...vistos]}`);
  },
};

// ------------------------------------------------------------------- el guion
// Calais a Londres en ETS2 prueba lo que ATS no tiene: el truco de UK, mano izquierda, el
// cruce del canal y las rotondas, y en otro idioma con otros separadores.
function trabajoEntre(variante, ciudadA, ciudadB) {
  const pois = JSON.parse(fs.readFileSync(path.join(RAIZ, 'docs', 'data', `pois-${variante}.json`), 'utf8'));
  const a = pois.companies.find((c) => c[4] === ciudadA);
  const b = pois.companies.find((c) => c[4] === ciudadB);
  if (!a || !b) throw new Error(`no hay empresas en ${ciudadA} o ${ciudadB}`);
  return {
    trabajo: {
      game: MANIFEST.variants[variante].game, cargo: 'Prueba', cargoMassKg: 18000, citySrc: ciudadA, cityDst: ciudadB, citySrcId: ciudadA, cityDstId: ciudadB,
      companySrc: a[3], companyDst: b[3], companySrcId: a[2], companyDstId: b[2], jobMarket: 'cargo_market', onJob: true, isCargoLoaded: true,
      truckBrand: 'Volvo', truckName: 'FH', fuelCapacity: 600,
    },
    origen: [a[0], a[1]],
  };
}

async function grabarGuion(nombre, opciones, trabajo, origen) {
  const m = await abrir({ ...opciones, grabar: true }).iniciar();
  if (!chequear(await esperarRuta(m, trabajo, origen[0], origen[1], 90), `${nombre}: sin ruta`)) return;
  await m.paso('conexion', [true, false]);
  const puntos = puntosDeRuta(m);
  let hechas = 0;
  const manejados = await manejar(m, trabajo, puntos, {
    tope: 1400,
    alPaso: async (n) => {
      // Lo que se pide manejando, en el medio de la ruta: el resultado tambien tiene que dar igual.
      if (n === 200) await m.paso('parada', ['g'], 0, true);
      if (n === 400) await m.paso('buscar', ['', 'g'], 0, true);
      if (n === 401) await m.paso('buscar', ['a', 'g'], 0, true);
      if (n === 402) await m.paso('elegir', [0]);
      if (n === 600) await m.paso('limpiarWaypoints');
      if (n === 700) await m.paso('perfilRuta', ['shortest']);
      if (n === 800) await m.paso('perfilRuta', ['fastest']);
      hechas += 1;
    },
  });
  console.log(`  ${nombre}: ${m.pasos.length} pasos, ${manejados} datos; ${archivosPedidos.size} archivos`);
  chequear(!m.errores.length, `${nombre}: errores ${m.errores.slice(0, 3).join(' | ')}`);
  const unicos = new Set(m.esperado.map((d) => JSON.parse(d)[0])).size;
  console.log(`  ${unicos} textos de giro distintos; ultimo ${m.esperado[m.esperado.length - 1].slice(0, 150)}`);
  chequear(unicos > 20, `${nombre}: casi no cambian los avisos`);
  fs.mkdirSync(GUION, { recursive: true });
  fs.writeFileSync(path.join(GUION, `guion-${nombre}.json`), JSON.stringify({
    preludio: PRELUDIO, digesto: DIGESTO, pasos: m.pasos, esperado: m.esperado,
    archivos: Object.fromEntries(archivosPedidos),
  }));
  return hechas;
}

async function main() {
  const t0 = Date.now();
  for (const [nombre, fn] of Object.entries(ESCENARIOS)) {
    if (SOLO && SOLO !== nombre) continue;
    console.log(nombre);
    try {
      await fn();
    } catch (e) {
      chequear(false, `excepcion: ${e && e.stack || e}`);
    }
  }
  if (GUION) {
    console.log('guiones');
    const demo = (await grabarGuion('ats-en', { variante: 'ats', lang: 'en', imperial: true, voz: true }, TRABAJO_DEMO, INICIO));
    const { trabajo, origen } = trabajoEntre('ets2', 'calais', 'london');
    await grabarGuion('ets2-es', { variante: 'ets2', lang: 'es', imperial: false, voz: true }, trabajo, origen);
    for (const { archivo } of archivosPedidos.values()) {
      if (archivo) fs.copyFileSync(path.join(CACHE, archivo), path.join(GUION, archivo));
    }
    console.log(`  guiones en ${GUION}${demo ? '' : ' (sin pasos)'}`);
  }
  console.log(`${fallos ? `${fallos} FALLOS` : 'Motor OK'} en ${Math.round((Date.now() - t0) / 1000)} s`);
  process.exit(fallos ? 1 : 0);
}

main().catch((e) => { console.error(e && e.stack || e); process.exit(1); });

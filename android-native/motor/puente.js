// El navegador de mentira donde corre el codigo de la web dentro de la app nativa. QuickJS
// trae el lenguaje y nada mas: ni document, ni fetch, ni timers. Lo que dibuja o toca la
// pagina no hace nada (nada); lo que sale afuera (fetch, Audio, voz, el socket) pasa por
// `salida`, y Kotlin lo levanta despues de cada llamada (ver MotorNav.kt).
//
// Lo que armar_motor.js no saca de app.js, porque lo declara conduccion.js o no hace falta:
// QUEDA_AFUERA: ["map", "ws", "ensureMapInitialized", "loadGameMap", "setMapLoading", "showMapHint", "showToast", "renderConnectionUi", "renderLiveShareControls", "updateHud", "animateTruckTo", "followCameraTo", "navCameraOn", "updateNavPanel", "voiceManeuverTick", "addRoadShieldImage", "applyBaseMap", "buildVecLayers", "updateTruckArrowSize", "unlockVoiceOnGesture", "resolveEffectiveGame", "updateLivePlayers", "webVersion", "handleTelemetry"]
var salida = { fetch: [], audio: [], mensajes: [], guardar: [], log: [], sockets: [], sonidos: [], demo: [] };

// Todo lo que la pagina le pide a un elemento que no existe: se puede leer, llamar y
// recorrer, y siempre da lo mismo. Con esto un cambio de la web que toca un id nuevo no
// rompe el motor. Valido como booleano a proposito: `if (el)` es lo que hace la web antes
// de escribirle algo.
var nada = new Proxy(function () {}, {
  get(_, clave) {
    if (clave === Symbol.toPrimitive) return () => '';
    if (clave === Symbol.iterator) return function* () {};
    if (clave === 'then') return undefined; // que no parezca una promesa
    if (clave === 'length') return 0;
    if (clave === 'toString' || clave === 'valueOf') return () => '';
    return nada;
  },
  set() { return true; },
  has() { return true; },
  apply() { return nada; },
  construct() { return nada; },
});

// Un elemento recuerda lo que se le escribe: la web lee del DOM lo que ya calculo. El overlay
// del juego (sendNavHud) saca de routeRemaining y routeArrival lo que muestra.
var elementos = new Map();
function clasesFalsas() {
  const hay = new Set();
  return {
    add(...c) { c.forEach((x) => hay.add(x)); },
    remove(...c) { c.forEach((x) => hay.delete(x)); },
    contains: (c) => hay.has(c),
    toggle(c, forzar) {
      const queda = forzar === undefined ? !hay.has(c) : !!forzar;
      if (queda) hay.add(c);
      else hay.delete(c);
      return queda;
    },
  };
}
function elementoFalso() {
  return new Proxy({ classList: clasesFalsas() }, {
    get(o, k) {
      if (k === 'then') return undefined;
      return k in o ? o[k] : nada;
    },
    set(o, k, v) { o[k] = v; return true; },
  });
}
var document = new Proxy({
  getElementById(id) {
    if (!elementos.has(id)) elementos.set(id, elementoFalso());
    return elementos.get(id);
  },
}, { get: (o, k) => (k in o ? o[k] : nada) });
var window = globalThis;
var self = globalThis;
window.addEventListener = function () {};
window.removeEventListener = function () {};
var history = nada;
var screen = nada;
var matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
var getComputedStyle = () => nada;
var maplibregl = {
  // Solo se le pregunta donde quedo: lo dibuja MapaNativo. El destino sale de ahi.
  Marker: class {
    constructor() { this.lngLat = null; }
    setLngLat(p) { this.lngLat = p; return this; }
    getLngLat() { return this.lngLat; }
    setRotation() { return this; }
    addTo() { return this; }
    remove() { this.lngLat = null; return this; }
    getElement() { return nada; }
  },
  LngLatBounds: nada,
  Popup: nada,
};
var pmtiles = nada;
var BroadcastChannel = class { postMessage() {} close() {} addEventListener() {} };
var Blob = nada;
var FileReader = nada;
var Image = nada;
var AudioContext = undefined;
var Notification = undefined;
var MutationObserver = class { observe() {} disconnect() {} };
var ResizeObserver = class { observe() {} disconnect() {} };
var IntersectionObserver = class { observe() {} disconnect() {} };
var AbortController = class { constructor() { this.signal = {}; } abort() {} };
var navigator = {
  // deviceInfo de la web: Android sin "Mobile" es una tablet. Es lo que los demas dispositivos
  // de la sesion leen cuando la voz esta aca.
  // El idioma del telefono solo sirve para adivinar la moneda (countryFromLanguages): la web
  // usa el suyo, que le dice Kotlin.
  language: typeof idiomaTelefono !== 'undefined' ? idiomaTelefono : 'en',
  languages: [typeof idiomaTelefono !== 'undefined' ? idiomaTelefono : 'en'],
  platform: 'Android', maxTouchPoints: 5,
  userAgent: typeof esTablet !== 'undefined' && esTablet ? 'TruckDash-Android' : 'TruckDash-Android Mobile',
  clipboard: nada, onLine: true, standalone: false,
};
var location = {
  href: 'https://trucksim-dash.com/app/', origin: 'https://trucksim-dash.com', protocol: 'https:',
  hostname: 'trucksim-dash.com', host: 'trucksim-dash.com', pathname: '/app/', search: '', hash: '',
  reload() {}, replace() {},
};

var console = {
  log(...a) { salida.log.push(['i', a.map(String).join(' ')]); },
  info(...a) { salida.log.push(['i', a.map(String).join(' ')]); },
  warn(...a) { salida.log.push(['w', a.map(String).join(' ')]); },
  error(...a) { salida.log.push(['e', a.map(String).join(' ')]); },
  debug() {},
};
var performance = { now: () => Date.now(), mark() {}, measure() {} };

// ---------------------------------------------------------------- timers
// Sin bucle de eventos: Kotlin llama a motor.pulso() cuando vence el proximo.
var temporizadores = new Map();
var proximoTimer = 1;
function setTimeout(fn, ms, ...args) {
  const id = proximoTimer++;
  temporizadores.set(id, { fn, args, cuando: Date.now() + (Number(ms) || 0) });
  return id;
}
function setInterval(fn, ms, ...args) {
  const id = proximoTimer++;
  const cada = Math.max(1, Number(ms) || 0);
  temporizadores.set(id, { fn, args, cuando: Date.now() + cada, cada });
  return id;
}
function clearTimeout(id) { temporizadores.delete(id); }
var clearInterval = clearTimeout;
function requestAnimationFrame() { return 0; } // no hay cuadros: la camara la mueve Kotlin
function cancelAnimationFrame() {}
function queueMicrotask(fn) { Promise.resolve().then(fn); }
function correrTimers() {
  const ahora = Date.now();
  for (const [id, t] of [...temporizadores]) {
    if (t.cuando > ahora) continue;
    if (t.cada) t.cuando = ahora + t.cada;
    else temporizadores.delete(id);
    try { t.fn(...t.args); } catch (e) { console.error('timer', e, e && e.stack); }
  }
}
function msAlProximoTimer() {
  let menor = null;
  for (const t of temporizadores.values()) if (menor === null || t.cuando < menor) menor = t.cuando;
  return menor === null ? -1 : Math.max(0, menor - Date.now());
}

// ---------------------------------------------------------------- guardado
// Lo guarda SharedPreferences. La web lo lee sincrono y al cargar (el id del dispositivo,
// los ajustes): Kotlin define almacenInicial antes de este archivo.
var almacenLocal = typeof almacenInicial !== 'undefined' ? almacenInicial : {};
function crearAlmacen(datos, persistente) {
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(datos, k) ? datos[k] : null; },
    setItem(k, v) {
      datos[k] = String(v);
      if (persistente) salida.guardar.push([String(k), String(v)]);
    },
    removeItem(k) {
      delete datos[k];
      if (persistente) salida.guardar.push([String(k), null]);
    },
    key(i) { return Object.keys(datos)[i] || null; },
    get length() { return Object.keys(datos).length; },
    clear() { for (const k of Object.keys(datos)) this.removeItem(k); },
  };
}
var localStorage = crearAlmacen(almacenLocal, true);
var sessionStorage = crearAlmacen({}, false);

// ---------------------------------------------------------------- fetch
// Kotlin baja (con su cache en disco) y contesta con motor.respuesta. Una URL relativa es
// relativa a /app/, donde vive la pagina.
var pedidos = new Map();
var proximoPedido = 1;
function urlAbsoluta(url) {
  const u = String(url);
  if (/^[a-z]+:/i.test(u)) return u;
  if (u.startsWith('/')) return location.origin + u;
  const partes = (location.pathname + u).split('/');
  const fuera = [];
  for (const p of partes) {
    if (p === '..') fuera.pop();
    else if (p !== '.') fuera.push(p);
  }
  return location.origin + fuera.join('/');
}
function fetch(url, opciones) {
  const id = proximoPedido++;
  const pedido = { id, url: urlAbsoluta(url) };
  // Un POST nunca va al cache (el reporte de navegacion y su estado).
  if (opciones && opciones.method && opciones.method !== 'GET') {
    pedido.method = opciones.method;
    pedido.body = String(opciones.body || '');
  }
  salida.fetch.push(pedido);
  return new Promise((resolver, rechazar) => { pedidos.set(id, { resolver, rechazar }); });
}
function respuestaDe(status, cuerpo) {
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: () => Promise.resolve(cuerpo),
    text: () => Promise.resolve(cuerpo),
    json: () => {
      try { return Promise.resolve(JSON.parse(cuerpo)); } catch (e) { return Promise.reject(e); }
    },
  };
}

// ---------------------------------------------------------------- el socket
// El mismo de SesionRepo: lo que la web le manda sale por aca. Sin conexion, readyState
// lo dice, y la web no manda (sendCommand, sendLiveShareState y compania lo miran).
var WebSocket = class { static get OPEN() { return 1; } static get CLOSED() { return 3; } };

// Los que abre la web por su cuenta: por LAN, la conexion solo de plan al relay
// (connectLanPlan). Kotlin los abre y avisa con motor.socket.
var sockets = new Map();
var proximoSocket = 1;
WebSocket = class {
  static get OPEN() { return 1; }
  static get CLOSED() { return 3; }
  constructor(url) {
    this.id = proximoSocket++;
    this.readyState = 0;
    this.onopen = this.onmessage = this.onclose = null;
    sockets.set(this.id, this);
    salida.sockets.push(['abrir', this.id, String(url)]);
  }
  send(texto) { salida.sockets.push(['enviar', this.id, String(texto)]); }
  close() {
    this.readyState = 3;
    if (sockets.delete(this.id)) salida.sockets.push(['cerrar', this.id]);
  }
};
var ws = {
  readyState: 3,
  send(texto) { salida.mensajes.push(String(texto)); },
  close() {},
};

// ---------------------------------------------------------------- voz
// speakVoice corre como esta en la web y le habla a estas dos: el sonido lo hace Kotlin,
// que avisa cuando termino (motor.audioTermino), como el onended de la pagina.
var audios = new Map();
var proximoAudio = 1;
var Audio = class {
  constructor() { this.src = ''; this.onended = null; this.onerror = null; }
  play() {
    if (String(this.src).startsWith('data:audio/wav')) return Promise.resolve(); // el silencio de desbloqueo
    const id = proximoAudio++;
    audios.set(id, this);
    salida.audio.push({ id, src: this.src });
    return Promise.resolve();
  }
  pause() {}
};
var SpeechSynthesisUtterance = class {
  constructor(text) { this.text = text; this.lang = ''; this.onend = null; this.onerror = null; }
};
var speechSynthesis = {
  speak(u) {
    if (!u.text) return;
    const id = proximoAudio++;
    audios.set(id, u);
    salida.audio.push({ id, text: u.text, lang: u.lang });
  },
  cancel() {},
  getVoices: () => [],
};
window.speechSynthesis = speechSynthesis;

// ---------------------------------------------------------------- lo que QuickJS no trae
// Sin Intl, toLocaleString no separa ni redondea. Los separadores de cada idioma de la app.
var SEPARADORES = {
  en: [',', '.'], es: ['.', ','], de: ['.', ','], fr: [' ', ','], pt: ['.', ','], pl: [' ', ','], tr: ['.', ','], ru: [' ', ','],
};
Number.prototype.toLocaleString = function (lang, op) {
  const o = op || {};
  const min = o.minimumFractionDigits || 0;
  const max = o.maximumFractionDigits !== undefined ? o.maximumFractionDigits : Math.max(min, 3);
  const [mil, dec] = SEPARADORES[String(lang || 'en').slice(0, 2).toLowerCase()] || SEPARADORES.en;
  const fijo = Math.abs(this).toFixed(max);
  let [entero, resto = ''] = fijo.split('.');
  while (resto.length > min && resto.endsWith('0')) resto = resto.slice(0, -1);
  entero = entero.replace(/\B(?=(\d{3})+(?!\d))/g, mil);
  return (this < 0 && Number(fijo) !== 0 ? '-' : '') + entero + (resto ? dec + resto : '');
};
var Intl = {
  DateTimeFormat: function () {
    // La zona del telefono: de ahi sale la moneda local (browserCurrency).
    const timeZone = typeof zonaTelefono !== 'undefined' ? zonaTelefono : 'UTC';
    return { resolvedOptions: () => ({ hour12: false, timeZone, locale: 'en' }), format: (d) => String(d), formatToParts: () => [] };
  },
  NumberFormat: function (lang, op) { return { format: (n) => Number(n).toLocaleString(lang, op) }; },
  Collator: function () { return { compare: (a, b) => (a < b ? -1 : a > b ? 1 : 0) }; },
  // El nombre de cada idioma en ese idioma: es lo unico que pide la web (voiceLangName).
  DisplayNames: function () {
    const nombres = { en: 'English', es: 'Español', de: 'Deutsch', fr: 'Français', pt: 'Português', pl: 'Polski', tr: 'Türkçe', ru: 'Русский' };
    return { of: (l) => nombres[l] || l };
  },
  PluralRules: function () { return { select: (n) => (n === 1 ? 'one' : 'other') }; },
};
var URLSearchParams = class {
  constructor(s) {
    this.m = new Map();
    for (const par of String(s || '').replace(/^\?/, '').split('&')) {
      if (!par) continue;
      const [k, v = ''] = par.split('=');
      this.m.set(decodeURIComponent(k), decodeURIComponent(v));
    }
  }
  get(k) { return this.m.has(k) ? this.m.get(k) : null; }
  has(k) { return this.m.has(k); }
  set(k, v) { this.m.set(k, String(v)); }
  delete(k) { this.m.delete(k); }
  toString() { return [...this.m].map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&'); }
};
var URL = class {
  constructor(u, base) {
    const texto = base && !/^[a-z]+:/i.test(String(u)) ? String(base).replace(/[^/]*$/, '') + u : String(u);
    this.href = texto;
    const [sinHash] = texto.split('#');
    const [camino, query = ''] = sinHash.split('?');
    this.search = query ? `?${query}` : '';
    this.searchParams = new URLSearchParams(query);
    this.pathname = camino.replace(/^[a-z]+:\/\/[^/]*/i, '') || '/';
    this.hostname = (/^[a-z]+:\/\/([^/:]*)/i.exec(camino) || [])[1] || '';
  }
  toString() { return this.href; }
};

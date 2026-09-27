// Cascara de la pagina del panel: conexion, barra de arriba y pantalla de
// codigo. El tablero en si lo dibuja createDashPanel (dash.js), que la app
// tambien usa a pantalla completa.

const BACKEND = 'wss://truck-companion-production.up.railway.app';
const RECONNECT_MS = 3000;
const LAN_WS_PORT = 27766;
const SETTINGS_KEY = 'truckdash_settings';  // compartida con la app: las unidades son una sola eleccion
const SCALE_KEY = 'truckdash_dash_scale';

const params = new URLSearchParams(location.search);
const gate = document.getElementById('gate');
const waiting = document.getElementById('waiting');
const panelRoot = document.getElementById('panel');
const chip = document.getElementById('statusChip');

let ws = null;
let reconnectTimer = null;
let demoTimer = null;
const conn = { socket: 'idle', clientConnected: null, clientStatus: null, hasTelemetry: false, paused: false };

// --- preferencias ---
function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch (e) { return {}; }
}
let useImperial = !!loadSettings().useImperial;
function saveImperial() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(Object.assign(loadSettings(), { useImperial })));
  } catch (e) {}
}

// Plata en la moneda del juego. La conversion a la moneda local del usuario
// necesita las tasas y la preferencia de Ajustes, que viven en la app: con
// el panel adentro de la app (pantalla completa) se usa el formateador de
// ella y la conversion aparece sola.
const GAME_SYMBOL = { ets2: '€', ats: '$' };
function money(amount, game) {
  const simbolo = GAME_SYMBOL[game] || '$';
  return simbolo + Math.round(amount || 0).toLocaleString(currentLang);
}

const panel = createDashPanel({
  root: panelRoot,
  money,
  imperial: () => useImperial,
  lang: () => currentLang,
});

// --- estado de la conexion ---
function renderStatus() {
  const view = connectionViewFor(conn);
  chip.className = 'statusChip' + (view && view.cls ? ' ' + view.cls : '');
  document.getElementById('statusText').textContent = view ? t(view.chip) : t('notConnected');
  const listo = !!(view && view.live && panel.hasData());
  panelRoot.hidden = !listo;
  waiting.hidden = listo || !view;
  if (!waiting.hidden) {
    // El detalle explica QUE falta (el cliente, el juego, el camion); sin
    // detalle alcanza con el texto del chip.
    document.getElementById('waitingText').textContent = view.detail ? t(view.detail) : t(view.chip);
  }
}

function connect(code) {
  clearTimeout(reconnectTimer);
  if (ws) { ws.onclose = null; ws.close(); }
  // Modo LAN: el cliente sirve esta pagina en el 27765 y el WebSocket vive
  // en el 27766 del mismo host (ver client/local_server.py). Son dos
  // puertos, no uno.
  const url = params.get('local')
    ? (params.get('backend') || `ws://${location.hostname}:${LAN_WS_PORT}`)
    : `${params.get('backend') || BACKEND}/ws/live/${code}`;
  const socket = new WebSocket(url);
  ws = socket;
  conn.socket = 'connecting';
  renderStatus();

  socket.onopen = () => { conn.socket = 'open'; renderStatus(); };
  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'session_state') {
      conn.clientConnected = !!data.client_connected;
      if (data.client_status) conn.clientStatus = data.client_status;
      if (!conn.clientConnected) conn.hasTelemetry = false;
      renderStatus();
      return;
    }
    if (data.type === 'client_status') {
      conn.clientConnected = true;
      conn.clientStatus = data;
      if (data.status !== 'live') conn.hasTelemetry = false;
      renderStatus();
      return;
    }
    // El resto de los tipos (keybinds, convoy, jugadores cerca) son de la
    // app; aca solo interesa la telemetria.
    if (data.type) return;
    conn.clientConnected = true;
    conn.hasTelemetry = true;
    conn.paused = !!data.paused;
    conn.clientStatus = { status: 'live', game: data.game };
    panel.update(data);
    renderStatus();
  };
  socket.onclose = (ev) => {
    if (ws !== socket) return;
    // 4404 = el backend no conoce el codigo. Puede ser que este mal, o que
    // el cliente de la PC todavia no arranco: se reintenta igual, porque
    // este link suele quedar guardado en el segundo dispositivo.
    conn.socket = 'closed';
    conn.hasTelemetry = false;
    renderStatus();
    reconnectTimer = setTimeout(() => connect(code), RECONNECT_MS);
  };
}

// --- demo: la misma telemetria sintetica que usa el mapa (pure.js) ---
function startDemo() {
  conn.socket = 'open';
  conn.demo = true;
  gate.hidden = true;
  const demo = createDemoTelemetry();
  demoTimer = setInterval(() => {
    panel.update(demo.next());
    conn.hasTelemetry = true;
    renderStatus();
  }, 1000);
}

// --- barra de arriba ---
function renderUnits() {
  document.getElementById('unitBtn').textContent = useImperial ? 'mi' : 'km';
}
document.getElementById('unitBtn').addEventListener('click', () => {
  useImperial = !useImperial;
  saveImperial();
  renderUnits();
  panel.refresh();
});

function applyPageTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(n => { n.textContent = t(n.dataset.i18n); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(n => { n.placeholder = t(n.dataset.i18nPlaceholder); });
  document.querySelectorAll('[data-i18n-title]').forEach(n => { n.title = t(n.dataset.i18nTitle); });
  panel.applyTranslations();
  renderStatus();
}
const langSelect = document.getElementById('langSelect');
langSelect.value = currentLang;
langSelect.addEventListener('change', (e) => {
  currentLang = e.target.value;
  try { localStorage.setItem(LANG_KEY, currentLang); } catch (e2) {}
  document.documentElement.lang = currentLang;
  applyPageTranslations();
});

function setScale(valor) {
  panelRoot.style.setProperty('--d-scale', valor);
  try { localStorage.setItem(SCALE_KEY, valor); } catch (e) {}
  document.querySelectorAll('[data-scale]').forEach(b => b.classList.toggle('active', b.dataset.scale === String(valor)));
}
document.querySelectorAll('[data-scale]').forEach(b => b.addEventListener('click', () => setScale(b.dataset.scale)));

document.getElementById('fullscreenBtn').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
});

// Que la tablet no se apague sola mirando el tablero. Se vuelve a pedir al
// volver a la pestana: el navegador lo suelta al ocultarla.
let wakeLock = null;
async function keepAwake() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { wakeLock = null; }
}
document.addEventListener('visibilitychange', () => { if (!wakeLock) keepAwake(); });

// --- arranque ---
document.documentElement.lang = currentLang;
renderUnits();
setScale(localStorage.getItem(SCALE_KEY) || '1');
applyPageTranslations();
keepAwake();

function empezar(code) {
  gate.hidden = true;
  // El link al GPS lleva el codigo puesto: cambiar de vista en el mismo
  // dispositivo no tiene que ser tipear el codigo de nuevo.
  document.getElementById('gpsLink').href = '../app/?code=' + encodeURIComponent(code);
  try { localStorage.setItem('truckdash_code', code); } catch (e) {}
  connect(code);
}

document.getElementById('connectBtn').addEventListener('click', () => {
  const code = document.getElementById('codeInput').value.trim().toUpperCase();
  if (!code) { document.getElementById('gateNote').textContent = t('enterCode'); return; }
  empezar(code);
});
document.getElementById('codeInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('connectBtn').click();
});

if (params.get('demo')) {
  startDemo();
} else if (params.get('local')) {
  gate.hidden = true;
  connect('');
} else {
  let guardado = null;
  try { guardado = localStorage.getItem('truckdash_code'); } catch (e) {}
  const code = (params.get('code') || '').toUpperCase();
  if (code) empezar(code);
  else if (guardado) document.getElementById('codeInput').value = guardado;
}

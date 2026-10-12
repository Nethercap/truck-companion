// Overlay para OBS (browser source), pedido del plan de marketing: cada stream
// con el overlay muestra trucksim-dash.com (auditoria del 12-10, P2).
//
// Con ?code= es solo el HUD sobre fondo transparente: velocidad y limite,
// crucero y el viaje (destino, lo que falta, tiempo real). Lee la misma
// telemetria que el panel (/ws/live/<codigo>) y no manda nada: ni voz, ni
// nav_hud, ni compartir posicion. Sin datos por unos segundos (pausa, juego
// cerrado, sin conexion) se esconde, para que no quede un cartel muerto en
// el stream. Opciones: units=mi, lang=xx, size=0.7..1.8, trip=0.
//
// Sin codigo (o con ?setup=1) es el armador: el streamer elige, ve la vista
// previa con la demo y copia el link.

const BACKEND = 'wss://truck-companion-production.up.railway.app';
const RECONNECT_MS = 3000;
const STALE_MS = 6000;
const KM_TO_MI = 0.621371;
// Minutos de juego por minuto real, hasta medir la propia (createTimeScale)
const NOMINAL_SCALE = { ets2: 19, ats: 20 };

const params = new URLSearchParams(location.search);
const clampSize = (v) => (Number.isFinite(v) ? Math.min(1.8, Math.max(0.7, v)) : 1);
const opts = {
  code: (params.get('code') || '').trim().toUpperCase(),
  imperial: params.get('units') === 'mi',
  size: clampSize(parseFloat(params.get('size'))),
  trip: params.get('trip') !== '0',
};
if (params.get('lang') && TRANSLATIONS[params.get('lang')]) currentLang = params.get('lang');
const setupMode = !opts.code || params.has('setup');

const $ = (id) => document.getElementById(id);
const hud = $('hud');
const escala = createTimeScale();
const ritmo = createPaceEta();
let ultimo = null;
let ultimoEn = 0;

function velocidad(kmh) {
  return formatInt(opts.imperial ? kmh * KM_TO_MI : kmh, currentLang);
}
function distancia(km) {
  return `${formatInt(opts.imperial ? km * KM_TO_MI : km, currentLang)} ${opts.imperial ? 'mi' : 'km'}`;
}
function hm(seg) {
  const total = Math.round(seg / 60);
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
}

function render() {
  const d = ultimo;
  const vivo = setupMode || (d && !d.paused && Date.now() - ultimoEn < STALE_MS);
  hud.classList.toggle('off', !vivo);
  if (!d) return;
  $('hudSpeed').textContent = d.speedKmh != null ? velocidad(d.speedKmh) : '--';
  $('hudUnit').textContent = opts.imperial ? 'mph' : 'km/h';
  const limite = d.speedLimitKmh > 0;
  $('hudLimit').hidden = !limite;
  if (limite) $('hudLimit').textContent = velocidad(d.speedLimitKmh);
  hud.classList.toggle('over', limite && d.speedKmh > d.speedLimitKmh + 2);
  const crucero = d.cruiseControl && d.cruiseControlSpeedKmh > 0;
  $('hudCruise').hidden = !crucero;
  if (crucero) $('hudCruiseVal').textContent = velocidad(d.cruiseControlSpeedKmh);
  const viaje = opts.trip && d.onJob && d.cityDst;
  $('hudTrip').hidden = !viaje;
  if (viaje) {
    $('hudDest').textContent = d.cityDst;
    const partes = [];
    if (d.routeDistanceKm > 0) partes.push(distancia(d.routeDistanceKm));
    // El estimado del juego supone ir al limite todo el camino: se corrige
    // con el ritmo real, igual que el panel (createPaceEta).
    const s = escala.value() || NOMINAL_SCALE[d.game] || 19;
    const realSeg = d.routeTimeSeconds > 0 ? ritmo.estimate(d.routeTimeSeconds / s, d.ts) : null;
    if (realSeg != null) partes.push(`${hm(realSeg)} ${t('realShort')}`);
    $('hudLine').textContent = partes.join(' · ');
  }
}

function update(data) {
  ultimo = data;
  ultimoEn = Date.now();
  escala.push(data.gameTimeMinutes, data.ts);
  if (data.onJob && data.cityDst) ritmo.push(data.cityDst, data.ts, data.routeDistanceKm);
  render();
}

// --- HUD en OBS: la misma conexion que el panel (docs/dash/page.js) ---
function connect(code) {
  const url = `${params.get('backend') || BACKEND}/ws/live/${encodeURIComponent(code)}`;
  const socket = new WebSocket(url);
  socket.onmessage = (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch (e) { return; }
    if (data.type) return; // session_state, client_status, convoy...: aca solo la telemetria
    update(data);
  };
  // 4404 (codigo que el relay no conoce) tambien se reintenta: OBS deja la
  // fuente abierta y el cliente de la PC puede arrancar despues.
  socket.onclose = () => setTimeout(() => connect(code), RECONNECT_MS);
}

// --- Armador ---
function setupUrl() {
  const code = $('fCode').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const u = new URL('https://trucksim-dash.com/overlay/');
  if (code) u.searchParams.set('code', code);
  if (opts.imperial) u.searchParams.set('units', 'mi');
  if (currentLang !== 'en') u.searchParams.set('lang', currentLang);
  if (opts.size !== 1) u.searchParams.set('size', String(opts.size));
  if (!opts.trip) u.searchParams.set('trip', '0');
  return { code, url: u.toString() };
}
function refreshSetup() {
  const { code, url } = setupUrl();
  const listo = code.length === 8;
  $('fUrl').value = listo ? url : '';
  $('copyBtn').disabled = !listo;
  $('codeHint').hidden = listo;
  document.documentElement.style.setProperty('--s', String(opts.size));
  render();
}
function applyTexts() {
  document.documentElement.lang = currentLang;
  document.querySelectorAll('[data-i18n]').forEach(n => { n.textContent = t(n.dataset.i18n); });
}
function startSetup() {
  document.body.classList.add('setupMode');
  $('setup').hidden = false;
  $('preview').appendChild(hud);
  $('fCode').value = opts.code;
  $('fUnits').value = opts.imperial ? 'mi' : 'km';
  $('fLang').value = currentLang;
  $('fSize').value = String(opts.size);
  $('fTrip').checked = opts.trip;
  $('fCode').addEventListener('input', refreshSetup);
  $('fUnits').addEventListener('change', (e) => { opts.imperial = e.target.value === 'mi'; refreshSetup(); });
  $('fLang').addEventListener('change', (e) => { currentLang = e.target.value; applyTexts(); refreshSetup(); });
  $('fSize').addEventListener('input', (e) => { opts.size = clampSize(parseFloat(e.target.value)); refreshSetup(); });
  $('fTrip').addEventListener('change', (e) => { opts.trip = e.target.checked; refreshSetup(); });
  $('copyBtn').addEventListener('click', async () => {
    const { url } = setupUrl();
    try {
      await navigator.clipboard.writeText(url);
      $('copyBtn').textContent = t('obsCopied');
      setTimeout(() => { $('copyBtn').textContent = t('obsCopy'); }, 2000);
    } catch (e) {
      window.prompt(t('obsCopy'), url);
    }
  });
  applyTexts();
  // Vista previa con la demo de siempre (la misma del mapa y del panel)
  const demo = createDemoTelemetry();
  update(demo.next());
  setInterval(() => update(demo.next()), 1000);
  refreshSetup();
}

hud.hidden = false;
document.documentElement.style.setProperty('--s', String(opts.size));
if (setupMode) {
  startSetup();
} else {
  document.title = 'Truck Dash overlay';
  connect(opts.code);
  setInterval(render, 1000); // para esconderse cuando dejan de llegar datos
}

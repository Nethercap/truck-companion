// Overlay para OBS (browser source), pedido del plan de marketing: cada stream
// con el overlay muestra trucksim-dash.com (auditoria del 12-10, P2).
//
// Con ?code= es solo el HUD sobre fondo transparente. Lee la misma telemetria
// que el panel (/ws/live/<codigo>?role=obs) y no manda nada: ni voz, ni
// nav_hud, ni compartir posicion. Sin datos por unos segundos (pausa, juego
// cerrado, sin conexion) se esconde, para que no quede un cartel muerto en
// el stream. Opciones: units=mi, lang=xx, size=0.7..1.8 e items= (lo mismo
// que el overlay del juego, ver obsOverlayItems en pure.js).
//
// El giro y la proxima ciudad los calcula el tablero (celular, tablet o la
// pestana de la PC), igual que para el overlay del juego: el relay le reenvia
// el nav_hud a este overlay y el tablero lo manda mientras haya uno mirando
// (obs_overlay en session_state). Llega sin traducir (turnInfo, nextCity,
// remainingKm, seconds) y aca se escribe en el idioma y las unidades del
// link. Sin tablero no hay giro, y lo que falta y las llegadas salen del GPS
// del juego, como en el overlay del juego.
//
// Sin codigo (o con ?setup=1) es el armador: el streamer elige, ve la vista
// previa con la demo y copia el link.

const BACKEND = 'wss://truck-companion-production.up.railway.app';
const RECONNECT_MS = 3000;
const STALE_MS = 6000;
// Lo mismo que el overlay del juego (NAV_FRESH_SECONDS en client/overlay.py)
const NAV_FRESH_MS = 6000;
const KM_TO_MI = 0.621371;
// Minutos de juego por minuto real, hasta medir la propia (createTimeScale)
const NOMINAL_SCALE = { ets2: 19, ats: 20 };
// Vista previa del armador: un giro de ejemplo, como si el tablero estuviera abierto
// (con sus carriles: los dos de la derecha sirven para doblar)
const SAMPLE_NAV = {
  turnInfo: { kind: 'turn', direction: 'right', meters: 1200, sign: { kind: 'road', label: 'I-15' } }, nextCity: 'Nephi',
  lanes: { count: 3, mask: 0b110, turn: LANE_ARROW_BITS.right,
    arrows: [LANE_ARROW_BITS.straight, LANE_ARROW_BITS.straight | LANE_ARROW_BITS.right, LANE_ARROW_BITS.right] },
};

const params = new URLSearchParams(location.search);
const clampSize = (v) => (Number.isFinite(v) ? Math.min(1.8, Math.max(0.7, v)) : 1);
const opts = {
  code: (params.get('code') || '').trim().toUpperCase(),
  imperial: params.get('units') === 'mi',
  size: clampSize(parseFloat(params.get('size'))),
};
if (params.get('lang') && TRANSLATIONS[params.get('lang')]) currentLang = params.get('lang');
const setupMode = !opts.code || params.has('setup');
opts.items = obsOverlayItems(params.get('items'), params.get('trip'), setupMode);

const $ = (id) => document.getElementById(id);
const hud = $('hud');
const escala = createTimeScale();
const ritmo = createPaceEta();
let ultimo = null;
let ultimoEn = 0;
let nav = null;
let navEn = 0;

const ver = (item) => opts.items.includes(item);
function velocidad(kmh) {
  return formatInt(opts.imperial ? kmh * KM_TO_MI : kmh, currentLang);
}
// Como el overlay del juego: un decimal por debajo de 10
function distancia(km) {
  const v = opts.imperial ? km * KM_TO_MI : km;
  return `${v < 10 ? formatDec(v, currentLang) : formatInt(v, currentLang)} ${opts.imperial ? 'mi' : 'km'}`;
}
function hm(seg) {
  const total = Math.round(seg / 60);
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
}

function columna(valor, etiqueta) {
  const col = document.createElement('div');
  col.className = 'hudCol';
  const b = document.createElement('b');
  b.textContent = valor;
  const small = document.createElement('small');
  small.textContent = etiqueta;
  col.append(b, small);
  return col;
}

function render() {
  const d = ultimo;
  const vivo = setupMode || (d && !d.paused && Date.now() - ultimoEn < STALE_MS);
  if (!d) { hud.classList.add('off'); return; }
  const n = setupMode ? SAMPLE_NAV : (nav && Date.now() - navEn <= NAV_FRESH_MS ? nav : null);

  // Giro (solo con el tablero abierto)
  const giro = ver('turn') && n ? turnInstructionText(n.turnInfo, { t, imperial: opts.imperial, lang: currentLang }) : '';
  $('hudTurn').hidden = !giro;
  if (giro) {
    $('hudTurnText').textContent = giro;
    $('hudTurnNext').textContent = n.nextCity ? `${t('navNextCity')}: ${n.nextCity}` : '';
  }
  // lanesHtml valida el registro (llega por el relay) y solo arma texto fijo
  $('hudTurnLanes').innerHTML = giro && n.lanes ? lanesHtml(n.lanes) : '';

  // Velocidad, limite y crucero
  $('hudSpeedBox').hidden = !ver('speed');
  $('hudSpeed').textContent = d.speedKmh != null ? velocidad(d.speedKmh) : '--';
  $('hudUnit').textContent = opts.imperial ? 'mph' : 'km/h';
  const limite = d.speedLimitKmh > 0;
  $('hudLimit').hidden = !limite;
  if (limite) $('hudLimit').textContent = velocidad(d.speedLimitKmh);
  hud.classList.toggle('over', ver('speed') && limite && d.speedKmh > d.speedLimitKmh + 2);
  const crucero = d.cruiseControl && d.cruiseControlSpeedKmh > 0;
  $('hudCruise').hidden = !crucero;
  if (crucero) $('hudCruiseVal').textContent = velocidad(d.cruiseControlSpeedKmh);

  // El viaje: con el tablero, sus numeros (cuentan los waypoints propios);
  // sin el, el GPS del juego y el ritmo medido aca.
  const destino = ver('dest') && d.onJob && d.cityDst ? d.cityDst : '';
  const km = n && Number.isFinite(n.remainingKm) ? n.remainingKm : (d.routeDistanceKm > 0 ? d.routeDistanceKm : null);
  let seg = n && Number.isFinite(n.seconds) ? n.seconds : null;
  if (seg == null && d.routeTimeSeconds > 0) {
    // El estimado del juego supone ir al limite todo el camino: se corrige
    // con el ritmo real, igual que el panel (createPaceEta).
    const s = escala.value() || NOMINAL_SCALE[d.game] || 19;
    seg = ritmo.estimate(d.routeTimeSeconds / s, d.ts);
  }
  const cols = [];
  if (ver('remaining') && km != null) cols.push(columna(distancia(km), t('routeRemainingLabel')));
  if (ver('time') && seg != null) cols.push(columna(hm(seg), t('routeDurationLabel')));
  if (ver('arrival') && seg != null) {
    const hora = new Date(Date.now() + seg * 1000).toLocaleTimeString(currentLang, { hour: '2-digit', minute: '2-digit' });
    cols.push(columna(hora, t('overlayArrivalReal')));
  }
  const enJuego = ver('game_arrival') ? gameArrivalClock(d.gameTimeMinutes, d.routeTimeSeconds) : '';
  if (enJuego) cols.push(columna(enJuego, t('overlayArrivalGame')));
  $('hudDest').hidden = !destino;
  $('hudDest').textContent = destino;
  $('hudCols').replaceChildren(...cols);
  $('hudTrip').hidden = !destino && !cols.length;
  $('hudBody').hidden = $('hudSpeedBox').hidden && $('hudTrip').hidden;
  $('hudTurn').classList.toggle('sep', !$('hudBody').hidden);

  // Nada para mostrar: no queda un recuadro vacio en el stream
  const algo = !!giro || !$('hudBody').hidden;
  hud.classList.toggle('off', !vivo || !algo);
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
  // role=obs: el relay le avisa al tablero que hay un overlay mirando y le
  // reenvia el nav_hud (giro, proxima ciudad, lo que falta)
  const url = `${params.get('backend') || BACKEND}/ws/live/${encodeURIComponent(code)}?role=obs`;
  const socket = new WebSocket(url);
  socket.onmessage = (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch (e) { return; }
    if (data.type === 'nav_hud') { nav = data; navEn = Date.now(); render(); return; }
    if (data.type) return; // session_state, client_status, convoy...: aca solo la telemetria y el giro
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
  u.searchParams.set('items', opts.items.join(','));
  // Las comas sin escapar: el link se lee y se pega a mano en OBS
  return { code, url: u.toString().replace(/%2C/g, ',') };
}
// El tamano de la fuente en OBS: lo que mide la vista previa con margen,
// porque un giro o un destino de verdad pueden ser mas largos que los de la
// demo. Nunca menos que los 720 x 200 de antes.
function obsSourceSize() {
  const r = hud.getBoundingClientRect();
  const margen = 16 * opts.size;
  const w = Math.max(720, Math.ceil((r.width * 1.3 + margen) / 10) * 10);
  const h = Math.max(200, Math.ceil((r.height + margen + 24) / 10) * 10);
  return { w, h };
}
function refreshSetup() {
  const { code, url } = setupUrl();
  const listo = code.length === 8;
  $('fUrl').value = listo ? url : '';
  $('copyBtn').disabled = !listo;
  $('codeHint').hidden = listo;
  document.documentElement.style.setProperty('--s', String(opts.size));
  render();
  const { w, h } = obsSourceSize();
  $('step2').textContent = t('obsStep2').replace('{w}', w).replace('{h}', h);
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
  const casillas = [...document.querySelectorAll('#fItems input[data-item]')];
  casillas.forEach(c => { c.checked = ver(c.dataset.item); });
  $('fCode').addEventListener('input', refreshSetup);
  $('fUnits').addEventListener('change', (e) => { opts.imperial = e.target.value === 'mi'; refreshSetup(); });
  $('fLang').addEventListener('change', (e) => { currentLang = e.target.value; applyTexts(); refreshSetup(); });
  $('fSize').addEventListener('input', (e) => { opts.size = clampSize(parseFloat(e.target.value)); refreshSetup(); });
  casillas.forEach(c => c.addEventListener('change', () => {
    const elegidos = casillas.filter(x => x.checked).map(x => x.dataset.item);
    // Al menos una: sin nada, el overlay no mostraria nada nunca
    if (!elegidos.length) { c.checked = true; return; }
    opts.items = OBS_ITEMS.filter(i => elegidos.includes(i));
    refreshSetup();
  }));
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

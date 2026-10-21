// Logica de la app (extraida de index.html). Las funciones puras testeables viven en pure.js.
const statusEl = document.getElementById('status');
let ws = null;
// Vista de cabina (?cab=1): ver initCab. El tamano (+ y -) es de la
// ventana de cabina y va en su propia clave, fuera de los ajustes.
const cabMode = cabModeFromSearch(location.search);
const CAB_SIZE_KEY = 'truckdash_cab_size';
let cabSize = cabMode ? cabSizeSetting(lsGet(CAB_SIZE_KEY)) : CAB_SIZE_DEFAULT;

// Las traducciones (EN/ES aca, el resto en i18n.js) viven en
// i18n_en_es.js, que se carga antes que este archivo.

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.getAttribute('data-i18n-title'));
  });
  if (!ws) statusEl.textContent = t('notConnected');
  markLongCmdLabels();
  // La landing tiene una pagina por idioma (/es/, /de/...); la inglesa es la raiz.
  const roadmapLink = document.getElementById('roadmapLink');
  if (roadmapLink) roadmapLink.href = `https://trucksim-dash.com/${currentLang === 'en' ? '' : currentLang + '/'}#roadmap`;
  // En la app de Android la cuenta se abre en la misma ventana: una pestana
  // nueva sale de la app y muestra la barra de Chrome.
  const accountLink = document.getElementById('accountLink');
  if (accountLink && document.documentElement.classList.contains('twa')) accountLink.removeAttribute('target');
}

// Etiquetas de la botonera que no entran en el ancho del boton ("Infotainment",
// "Limpiaparabrisas"): media letra menos antes que dejar que se partan al medio.
function markLongCmdLabels() {
  document.querySelectorAll('.cmdBtn span:not(.keyCap):not(.cmdEditBadge):not(.plus)').forEach(el => {
    el.classList.toggle('long', el.textContent.trim().length > 10);
  });
}

function setLanguage(lang) {
  if (!TRANSLATIONS[lang]) return;
  currentLang = lang;
  try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
  document.documentElement.lang = lang;
  for (const id of ['langSelect', 'setLangSelect']) document.getElementById(id).value = lang;
  applyTranslations();
  if (dashPanel) dashPanel.applyTranslations();
  renderConnectionUi();
  renderTripHistory();
  renderWaypointList();
  fillVoiceSelect();
  if (lastData) updateHud(lastData);
}
for (const id of ['langSelect', 'setLangSelect']) {
  document.getElementById(id).addEventListener('change', (e) => setLanguage(e.target.value));
  document.getElementById(id).value = currentLang;
}
document.documentElement.lang = currentLang;
applyTranslations();

let useImperial = false;
const KM_TO_MI = 0.621371;
const KM_TO_FT = 3280.84;
function renderUnitButtons() {
  document.getElementById('unitToggle').textContent = useImperial ? 'mi' : 'km';
  document.getElementById('setUnitToggle').textContent = useImperial ? 'mi · mph' : 'km · km/h';
  document.getElementById('speedUnitLabel').textContent = useImperial ? 'mph' : 'km/h';
  document.getElementById('miniSpeedUnitLabel').textContent = useImperial ? 'mph' : 'km/h';
  document.getElementById('gaugeSpeedUnit').textContent = useImperial ? 'mph' : 'km/h';
}
function toggleUnits() {
  useImperial = !useImperial;
  renderUnitButtons();
  saveSettings();
  if (lastData) updateHud(lastData);
  if (dashPanel) dashPanel.refresh();
}
document.getElementById('unitToggle').addEventListener('click', toggleUnits);
document.getElementById('setUnitToggle').addEventListener('click', toggleUnits);
document.getElementById('setClockSelect').addEventListener('change', (e) => {
  clockFormat = clockFormatSetting(e.target.value);
  saveSettings();
  if (lastData) updateHud(lastData);
  if (dashPanel) dashPanel.refresh();
});
let lastData = null;

// Preferencias de usuario (que se muestra en el mini-HUD + color de la ruta),
// persistidas en localStorage para que sobrevivan a un reload.
const SETTINGS_KEY = 'truckdash_settings';
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {};
}
function currentSettings() {
  return { miniHud: miniHudSettings, routeColor, atsMod, ets2Mod, liveShareEnabled, hideOtherPlayers, useImperial, routeProfile, modsAuto, nav3d, currency: currencyPref, customButtons, liteMode, liteNoRouting, realBase, darkButtons, fadeButtons, btnLayout, layoutGrid, navZoom, truckSize, clockFormat, routeSummaryMin, voiceOn, voiceByLang, voiceTiming, liveShareRoute, dlcOff, dlcAuto, navEveryExit };
}
// Solo se escribe lo que cambio ESTA pestana desde que cargo (o desde que
// guardo por ultima vez): escribir todo lo que tiene en memoria hacia que una
// pestana vieja, al guardar cualquier cosa, pisara lo que se cambio en otra
// (el tamano de la flecha, las unidades...). Ver settingsChangedKeys en pure.js.
let settingsBaseline = null; // se toma al terminar de cargar app.js
function saveSettings() {
  try {
    const cur = JSON.parse(JSON.stringify(currentSettings()));
    const stored = loadSettings();
    for (const k of settingsChangedKeys(settingsBaseline, cur)) stored[k] = cur[k];
    settingsBaseline = cur;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(stored));
  } catch (e) {}
}
const _savedSettings = loadSettings();
// Con los datos del sitio bloqueados (modo privado estricto, cookies
// bloqueadas) leer localStorage tira SecurityError: uno suelto a nivel de
// script cortaba el resto y la pagina cargaba sin conectarse nunca
// (auditoria del 10-10). Lo que no es critico pasa por aca.
function lsGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
function lsSet(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
// El resumen de ruta minimizado a una barrita de progreso. Antes la X de
// ese panel borraba la ruta, y quien solo queria sacarlo de encima se
// quedaba sin ruta hasta el proximo trabajo (reporte del 30-09-2026).
let routeSummaryMin = !!_savedSettings.routeSummaryMin;
// Modo liviano para dispositivos viejos (opt-in en Ajustes, se aplica al
// recargar): render a 1x, sin animacion del camion, sin casing/punteado de
// ruta, sin 3D, POIs desde z9 y sin nombres de ruta. liteNoRouting ademas no
// carga el grafo (10-27 MB de JSON = ~150 MB de objetos), que es lo que
// tumba la pestana en tablets con poca RAM: queda posicion + HUD + botonera.
// Mapa base real: prendido salvo en modo liviano (son ~1 MB mas de descarga
// la primera vez y unas capas mas que dibujar).
let realBase = _savedSettings.realBase === undefined ? !_savedSettings.liteMode : !!_savedSettings.realBase;
// Los dos vienen prendidos: los botones blancos sobre el mapa oscuro le
// resultaban fuertes a varios, y en el telefono son muchos a la vez.
let darkButtons = _savedSettings.darkButtons === undefined ? true : !!_savedSettings.darkButtons;
let fadeButtons = _savedSettings.fadeButtons === undefined ? true : !!_savedSettings.fadeButtons;
// { groups: { mapLeftControls: {x, y} }, buttons: { poiBtn: {x, y} } }, en %
// del mapa. La primera version guardaba solo los grupos, en el primer nivel:
// si aparece asi, se migra en vez de tirarlo.
let btnLayout = normalizeBtnLayout(_savedSettings.btnLayout);
let layoutGrid = _savedSettings.layoutGrid !== false;
function normalizeBtnLayout(raw) {
  const empty = { groups: {}, buttons: {}, panels: {} };
  if (!raw || typeof raw !== 'object') return empty;
  if (raw.groups || raw.buttons || raw.panels) {
    return { groups: raw.groups || {}, buttons: raw.buttons || {}, panels: raw.panels || {} };
  }
  return { ...empty, groups: raw };
}
const liteMode = !!_savedSettings.liteMode;
const liteNoRouting = liteMode && !!_savedSettings.liteNoRouting;
if (liteMode) document.documentElement.classList.add('lite');
// Botones custom de la botonera: [{title, key}], hasta CUSTOM_BUTTONS_MAX.
// Viven en este dispositivo (como el resto de los ajustes); la tecla viaja
// con el comando y el cliente la valida contra su lista blanca.
const CUSTOM_BUTTONS_MAX = 3;
let customButtons = (Array.isArray(_savedSettings.customButtons) ? _savedSettings.customButtons : [])
  .filter(b => b && typeof b.title === 'string' && typeof b.key === 'string' && b.key)
  .slice(0, CUSTOM_BUTTONS_MAX)
  .map(b => ({ title: b.title.slice(0, 14), key: b.key.slice(0, 24) }));
const miniHudSettings = Object.assign(
  { fuelPct: false, fuelRange: false, eta: false, distance: false, cruise: true, gps: false, rest: false },
  _savedSettings.miniHud
);
let routeColor = _savedSettings.routeColor || '#a30000';
// Zoom del modo navegacion (Ajustes). Aca arriba con los demas ajustes y no
// junto a navTargetZoom: saveSettings lo lee, y usar un let antes de su
// declaracion tumba app.js entero.
let navZoom = navZoomSetting(_savedSettings.navZoom);
let truckSize = truckSizeSetting(_savedSettings.truckSize);
// 'auto' | '24' | '12' (clockIs12h en pure.js): vale para todos los relojes.
let clockFormat = clockFormatSetting(_savedSettings.clockFormat);
function hour12() { return clockIs12h(clockFormat, currentLang); }
let routeProfile = _savedSettings.routeProfile || 'fastest'; // 'fastest' (como el GPS del juego) | 'shortest'
// "Keep left/right" tambien en las salidas donde el juego no dice nada (el
// carril de desaceleracion, everyExitKeepSide en pure.js). Apagado por
// defecto: el juego no los dice y suman 13 a 18 % de avisos (Discord, 19-10).
let navEveryExit = !!_savedSettings.navEveryExit;
// DLC de mapa destildados por juego ({ ats: ['co'], ets2: [] }): las rutas
// evitan sus caminos (ver dlcBlockedGuards en pure.js). Se guarda lo
// destildado y no lo tildado, asi un DLC nuevo arranca prendido.
let dlcOff = normalizeDlcOff(_savedSettings.dlcOff);
// Automatico (cliente 1.5.28+): los DLC salen de la carpeta del juego. Por
// defecto prendido, salvo para quien ya habia destildado algo a mano antes
// de que existiera (no se le pisa la eleccion).
let dlcAuto = _savedSettings.dlcAuto !== undefined ? !!_savedSettings.dlcAuto
  : !(dlcOff.ats.length || dlcOff.ets2.length);
let detectedDlcs = null; // { ats: [ids], ets2: [ids] } del client_status
function dlcOffFor(game) {
  return effectiveDlcOff(game, dlcAuto, detectedDlcs, dlcOff[game]);
}
function applyDetectedDlcs(valor) {
  if (valor === undefined || JSON.stringify(valor) === JSON.stringify(detectedDlcs)) return;
  detectedDlcs = valor;
  if (dlcAuto) invalidateRoute();
  if (document.getElementById('dlcModal').style.display === 'flex') renderDlcLists();
}
// Guia por voz (Ajustes): apagada por defecto, y una voz elegida por idioma
// ({ en: 'en-joe' }). Aca arriba por lo mismo que navZoom: saveSettings lee.
let voiceOn = !!_savedSettings.voiceOn;
// Con "compartir mi posicion" prendido, la ruta tambien se ve en el mapa en
// vivo publico. Viene prendida (quien comparte ya muestra de donde a donde
// va); se apaga aparte.
let liveShareRoute = _savedSettings.liveShareRoute !== false;
let voiceByLang = (_savedSettings.voiceByLang && typeof _savedSettings.voiceByLang === 'object') ? _savedSettings.voiceByLang : {};
// Cuando se dice "turn right" en el punto: 'early' | 'normal' | 'late' (ver
// VOICE_TIMINGS en pure.js).
let voiceTiming = voiceTimingSetting(_savedSettings.voiceTiming);

// ---------------------------------------------------------------------------
// Pago en la moneda "real" del usuario. El SDK paga en la moneda interna del
// juego (EUR en ETS2, USD en ATS, sin importar la que el usuario eligio ver
// en las opciones del juego). La moneda local se deduce de la zona horaria
// del navegador (Europe/London -> GBP) o, si no, de su idioma (es-AR -> ARS)
// - sin geolocalizacion ni nada que identifique - o se elige a mano en
// Ajustes. Las tasas las da el
// backend (/rates, base EUR, se refrescan una vez por dia) y se cachean en
// localStorage para que sirvan tambien en LAN / sin red. La moneda elegida
// se manda al backend (set_currency) para que el post de entrega en Discord
// tambien la muestre - pedido de la comunidad.
const GAME_CURRENCY = { ats: 'USD', ets2: 'EUR' };
const REGION_CURRENCY = {
  US: 'USD', PR: 'USD', EC: 'USD', SV: 'USD', PA: 'USD', GB: 'GBP', IM: 'GBP', JE: 'GBP', GG: 'GBP',
  DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', PT: 'EUR', IE: 'EUR', FI: 'EUR',
  GR: 'EUR', SK: 'EUR', SI: 'EUR', LT: 'EUR', LV: 'EUR', EE: 'EUR', LU: 'EUR', MT: 'EUR', CY: 'EUR', HR: 'EUR',
  BG: 'EUR', AD: 'EUR', MC: 'EUR', SM: 'EUR', VA: 'EUR', ME: 'EUR', XK: 'EUR',
  PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', SE: 'SEK', NO: 'NOK', DK: 'DKK', IS: 'ISK', CH: 'CHF', LI: 'CHF',
  TR: 'TRY', RU: 'RUB', UA: 'UAH', BY: 'BYN', RS: 'RSD', BA: 'BAM', MK: 'MKD', AL: 'ALL', MD: 'MDL', GE: 'GEL',
  AM: 'AMD', AZ: 'AZN', KZ: 'KZT', UZ: 'UZS', IL: 'ILS', SA: 'SAR', AE: 'AED', QA: 'QAR', KW: 'KWD', EG: 'EGP',
  MA: 'MAD', DZ: 'DZD', TN: 'TND', ZA: 'ZAR', NG: 'NGN', KE: 'KES',
  CA: 'CAD', MX: 'MXN', BR: 'BRL', AR: 'ARS', CL: 'CLP', CO: 'COP', PE: 'PEN', UY: 'UYU', PY: 'PYG', BO: 'BOB',
  VE: 'VES', CR: 'CRC', GT: 'GTQ', DO: 'DOP', HN: 'HNL', NI: 'NIO', CU: 'CUP',
  JP: 'JPY', CN: 'CNY', KR: 'KRW', TW: 'TWD', HK: 'HKD', SG: 'SGD', MY: 'MYR', TH: 'THB', ID: 'IDR', PH: 'PHP',
  VN: 'VND', IN: 'INR', PK: 'PKR', BD: 'BDT', LK: 'LKR', AU: 'AUD', NZ: 'NZD',
};
let currencyPref = _savedSettings.currency || 'auto'; // 'auto' | 'off' | codigo ISO
const refuelWatch = createRefuelWatch();
const RATES_KEY = 'truckdash_rates';
const RATES_MAX_AGE_MS = 24 * 60 * 60 * 1000;
let exchangeRates = null; // {base:'EUR', rates:{...}, fetched_at}
try {
  const cached = JSON.parse(localStorage.getItem(RATES_KEY) || 'null');
  if (cached && cached.rates && Date.now() - (cached.savedAt || 0) < RATES_MAX_AGE_MS) exchangeRates = cached;
} catch (e) {}

// Pais "real" del usuario. Primero la zona horaria del navegador
// (Europe/London, America/Argentina/Buenos_Aires): refleja donde ESTA la
// maquina, no en que idioma la usa - un aleman viviendo en Reino Unido
// tiene que ver libras, no euros. Si la zona no esta en la tabla, se cae
// al idioma; y ahi se recorren TODOS los idiomas del navegador, no solo el
// primero: un telefono en espanol de Latinoamerica reporta ['es-419',
// 'es-AR'] y el primero no tiene pais (419 = "Latinoamerica").
const TZ_COUNTRY = {
  'Europe/London': 'GB', 'Europe/Belfast': 'GB', 'Europe/Dublin': 'IE', 'Europe/Lisbon': 'PT', 'Atlantic/Madeira': 'PT', 'Atlantic/Azores': 'PT',
  'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES', 'Africa/Ceuta': 'ES', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Busingen': 'DE',
  'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE', 'Europe/Luxembourg': 'LU', 'Europe/Zurich': 'CH', 'Europe/Vienna': 'AT', 'Europe/Rome': 'IT',
  'Europe/Malta': 'MT', 'Europe/Copenhagen': 'DK', 'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Helsinki': 'FI', 'Atlantic/Reykjavik': 'IS',
  'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ', 'Europe/Bratislava': 'SK', 'Europe/Budapest': 'HU', 'Europe/Ljubljana': 'SI', 'Europe/Zagreb': 'HR',
  'Europe/Sarajevo': 'BA', 'Europe/Belgrade': 'RS', 'Europe/Podgorica': 'ME', 'Europe/Skopje': 'MK', 'Europe/Tirane': 'AL', 'Europe/Athens': 'GR',
  'Europe/Sofia': 'BG', 'Europe/Bucharest': 'RO', 'Europe/Chisinau': 'MD', 'Europe/Kyiv': 'UA', 'Europe/Kiev': 'UA', 'Europe/Zaporozhye': 'UA',
  'Europe/Uzhgorod': 'UA', 'Europe/Simferopol': 'UA', 'Europe/Minsk': 'BY', 'Europe/Vilnius': 'LT', 'Europe/Riga': 'LV', 'Europe/Tallinn': 'EE',
  'Europe/Moscow': 'RU', 'Europe/Kaliningrad': 'RU', 'Europe/Samara': 'RU', 'Europe/Volgograd': 'RU', 'Europe/Saratov': 'RU', 'Europe/Ulyanovsk': 'RU',
  'Europe/Astrakhan': 'RU', 'Europe/Kirov': 'RU', 'Asia/Yekaterinburg': 'RU', 'Asia/Omsk': 'RU', 'Asia/Novosibirsk': 'RU', 'Asia/Krasnoyarsk': 'RU',
  'Asia/Irkutsk': 'RU', 'Asia/Yakutsk': 'RU', 'Asia/Vladivostok': 'RU', 'Asia/Magadan': 'RU', 'Asia/Kamchatka': 'RU', 'Asia/Sakhalin': 'RU',
  'Asia/Chita': 'RU', 'Asia/Barnaul': 'RU', 'Asia/Tomsk': 'RU', 'Asia/Novokuznetsk': 'RU', 'Asia/Anadyr': 'RU',
  'Europe/Istanbul': 'TR', 'Asia/Istanbul': 'TR', 'Asia/Tbilisi': 'GE', 'Asia/Yerevan': 'AM', 'Asia/Baku': 'AZ', 'Asia/Almaty': 'KZ', 'Asia/Qyzylorda': 'KZ',
  'Asia/Aqtobe': 'KZ', 'Asia/Aqtau': 'KZ', 'Asia/Oral': 'KZ', 'Asia/Atyrau': 'KZ', 'Asia/Qostanay': 'KZ', 'Asia/Tashkent': 'UZ', 'Asia/Samarkand': 'UZ',
  'Asia/Jerusalem': 'IL', 'Asia/Tel_Aviv': 'IL', 'Asia/Riyadh': 'SA', 'Asia/Dubai': 'AE', 'Asia/Qatar': 'QA', 'Asia/Kuwait': 'KW',
  'Africa/Cairo': 'EG', 'Africa/Casablanca': 'MA', 'Africa/Algiers': 'DZ', 'Africa/Tunis': 'TN', 'Africa/Johannesburg': 'ZA', 'Africa/Lagos': 'NG', 'Africa/Nairobi': 'KE',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Phoenix': 'US', 'America/Los_Angeles': 'US', 'America/Anchorage': 'US',
  'Pacific/Honolulu': 'US', 'America/Detroit': 'US', 'America/Boise': 'US', 'America/Juneau': 'US', 'America/Adak': 'US', 'America/Nome': 'US',
  'America/Sitka': 'US', 'America/Yakutat': 'US', 'America/Menominee': 'US', 'America/Metlakatla': 'US',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA', 'America/Winnipeg': 'CA', 'America/Halifax': 'CA', 'America/St_Johns': 'CA',
  'America/Regina': 'CA', 'America/Montreal': 'CA', 'America/Moncton': 'CA', 'America/Whitehorse': 'CA', 'America/Yellowknife': 'CA', 'America/Iqaluit': 'CA',
  'America/Dawson': 'CA', 'America/Glace_Bay': 'CA', 'America/Goose_Bay': 'CA', 'America/Swift_Current': 'CA', 'America/Cambridge_Bay': 'CA',
  'America/Mexico_City': 'MX', 'America/Cancun': 'MX', 'America/Merida': 'MX', 'America/Monterrey': 'MX', 'America/Chihuahua': 'MX', 'America/Mazatlan': 'MX',
  'America/Tijuana': 'MX', 'America/Hermosillo': 'MX', 'America/Matamoros': 'MX', 'America/Ojinaga': 'MX', 'America/Bahia_Banderas': 'MX', 'America/Ciudad_Juarez': 'MX',
  'America/Sao_Paulo': 'BR', 'America/Fortaleza': 'BR', 'America/Recife': 'BR', 'America/Bahia': 'BR', 'America/Belem': 'BR', 'America/Manaus': 'BR',
  'America/Cuiaba': 'BR', 'America/Campo_Grande': 'BR', 'America/Porto_Velho': 'BR', 'America/Boa_Vista': 'BR', 'America/Rio_Branco': 'BR', 'America/Maceio': 'BR',
  'America/Araguaina': 'BR', 'America/Santarem': 'BR', 'America/Noronha': 'BR', 'America/Eirunepe': 'BR',
  'America/Buenos_Aires': 'AR', 'America/Cordoba': 'AR', 'America/Mendoza': 'AR', 'America/Catamarca': 'AR', 'America/Jujuy': 'AR',
  'America/Santiago': 'CL', 'America/Punta_Arenas': 'CL', 'Pacific/Easter': 'CL', 'America/Bogota': 'CO', 'America/Lima': 'PE', 'America/Montevideo': 'UY',
  'America/Asuncion': 'PY', 'America/La_Paz': 'BO', 'America/Caracas': 'VE', 'America/Guayaquil': 'EC', 'America/Costa_Rica': 'CR', 'America/Guatemala': 'GT',
  'America/Santo_Domingo': 'DO', 'America/Tegucigalpa': 'HN', 'America/Managua': 'NI', 'America/Panama': 'PA', 'America/El_Salvador': 'SV', 'America/Havana': 'CU',
  'America/Puerto_Rico': 'PR',
  'Asia/Tokyo': 'JP', 'Asia/Shanghai': 'CN', 'Asia/Chongqing': 'CN', 'Asia/Urumqi': 'CN', 'Asia/Harbin': 'CN', 'Asia/Seoul': 'KR', 'Asia/Taipei': 'TW',
  'Asia/Hong_Kong': 'HK', 'Asia/Singapore': 'SG', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Kuching': 'MY', 'Asia/Bangkok': 'TH', 'Asia/Jakarta': 'ID', 'Asia/Makassar': 'ID',
  'Asia/Jayapura': 'ID', 'Asia/Pontianak': 'ID', 'Asia/Manila': 'PH', 'Asia/Ho_Chi_Minh': 'VN', 'Asia/Saigon': 'VN', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN',
  'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Asia/Colombo': 'LK', 'Pacific/Auckland': 'NZ',
};
// Familias enteras de zonas -> pais (America/Argentina/Salta, Australia/Perth...)
const TZ_PREFIX_COUNTRY = [['America/Argentina/', 'AR'], ['America/Indiana/', 'US'], ['America/Kentucky/', 'US'], ['America/North_Dakota/', 'US'], ['Australia/', 'AU']];
function countryFromTimeZone(tz) {
  if (!tz) return null;
  if (TZ_COUNTRY[tz]) return TZ_COUNTRY[tz];
  const hit = TZ_PREFIX_COUNTRY.find(([prefix]) => tz.startsWith(prefix));
  return hit ? hit[1] : null;
}
function countryFromLanguages() {
  const tags = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ''];
  for (const tag of tags) {
    let region = null;
    try { region = new Intl.Locale(tag).maximize().region; } catch (e) {}
    if (!region || !/^[A-Z]{2}$/.test(region)) { const m = /[-_]([A-Za-z]{2})\b/.exec(tag); region = m ? m[1].toUpperCase() : null; }
    if (region && REGION_CURRENCY[region]) return region;
  }
  return null;
}
function browserCurrency() {
  try {
    let tz = null;
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {}
    const country = countryFromTimeZone(tz) || countryFromLanguages();
    return country ? REGION_CURRENCY[country] || null : null;
  } catch (e) { return null; }
}
function localCurrency() {
  if (currencyPref === 'off') return null;
  if (currencyPref === 'auto') return browserCurrency();
  return currencyPref;
}
function gameCurrency(game) { return GAME_CURRENCY[game] || 'USD'; }
function convertMoney(amount, from, to) {
  if (!exchangeRates || !exchangeRates.rates) return null;
  const a = exchangeRates.rates[from], b = exchangeRates.rates[to];
  return a && b ? amount / a * b : null;
}
// Simbolo propio en vez de Intl: en un navegador es-AR, Intl escribe ARS
// como "$" a secas y USD como "US$" - al lado del otro se confunden. Misma
// tabla que usa el backend para el post de Discord, asi se ven iguales.
const CURRENCY_SYMBOLS = {
  USD: '$', EUR: '€', GBP: '£', PLN: 'zł', BRL: 'R$', TRY: '₺', JPY: '¥', CNY: '¥', INR: '₹', RUB: '₽', UAH: '₴',
  KRW: '₩', CZK: 'Kč', HUF: 'Ft', SEK: 'kr', NOK: 'kr', DKK: 'kr', ISK: 'kr', CHF: 'CHF', CAD: 'CA$', AUD: 'A$',
  NZD: 'NZ$', MXN: 'MX$', ARS: 'AR$', CLP: 'CLP$', COP: 'COL$', PEN: 'S/', UYU: '$U', ZAR: 'R', ILS: '₪', RON: 'lei',
  BGN: 'лв', PHP: '₱', THB: '฿', IDR: 'Rp', MYR: 'RM', SGD: 'S$', HKD: 'HK$', TWD: 'NT$', VND: '₫', EGP: 'E£',
  SAR: 'SAR', AED: 'AED', KZT: '₸', GEL: '₾', RSD: 'din', BAM: 'KM', MKD: 'den', ALL: 'L', MDL: 'lei', BYN: 'Br',
};
const CURRENCY_SUFFIX = new Set(['PLN', 'CZK', 'HUF', 'SEK', 'NOK', 'DKK', 'ISK', 'CHF', 'RON', 'BGN', 'RSD', 'BAM', 'MKD', 'ALL', 'MDL', 'BYN', 'SAR', 'AED', 'KZT', 'GEL']);
function formatMoney(amount, currency) {
  const n = formatInt(amount, currentLang);
  const symbol = CURRENCY_SYMBOLS[currency];
  if (!symbol) return `${n} ${currency}`;
  return CURRENCY_SUFFIX.has(currency) ? `${n} ${symbol}` : `${symbol}${n}`;
}
// "$61,158" o "€12,345 · ≈ £10,604" si la moneda local es otra y hay tasas.
// Igual que moneyLine pero con la conversion en un segundo renglon chico:
// "$61.158" + "~ AR$92.480.506" debajo, en vez de todo junto partiendo la fila.
function moneyHtml(amount, game) {
  const gc = gameCurrency(game);
  const main = escapeHtml(formatMoney(amount, gc));
  const lc = localCurrency();
  if (lc && lc !== gc && amount) {
    const conv = convertMoney(amount, gc, lc);
    if (conv != null) return `${main}<span class="subValue">≈ ${escapeHtml(formatMoney(conv, lc))}</span>`;
  }
  return main;
}

function moneyLine(amount, game) {
  const gc = gameCurrency(game);
  let text = formatMoney(amount, gc);
  const lc = localCurrency();
  if (lc && lc !== gc && amount) {
    const conv = convertMoney(amount, gc, lc);
    if (conv != null) text += ` · ≈ ${formatMoney(conv, lc)}`;
  }
  return text;
}
function fetchExchangeRates() {
  if (localCurrency() == null) return;
  if (exchangeRates && Date.now() - (exchangeRates.savedAt || 0) < RATES_MAX_AGE_MS) return;
  fetch('https://truck-companion-production.up.railway.app/rates').then(r => r.ok ? r.json() : null).then(data => {
    if (!data || !data.rates) return;
    exchangeRates = { ...data, savedAt: Date.now() };
    try { localStorage.setItem(RATES_KEY, JSON.stringify(exchangeRates)); } catch (e) {}
    fillCurrencySelect();
    if (lastData) updateHud(lastData);
    renderTripHistory();
  }).catch(() => {}); // no critico: sin tasas se muestra solo la moneda del juego
}
function sendCurrencyPref() {
  if (!ws || ws.readyState !== WebSocket.OPEN || conn.local) return;
  ws.send(JSON.stringify({ type: 'set_currency', currency: localCurrency() }));
}
function currencyLabel(code) {
  try {
    const name = new Intl.DisplayNames([currentLang || 'en'], { type: 'currency' }).of(code);
    return name && name !== code ? `${code} — ${name}` : code;
  } catch (e) { return code; }
}
function fillCurrencySelect() {
  const sel = document.getElementById('setCurrency');
  if (!sel) return;
  const auto = browserCurrency();
  const codes = new Set(Object.values(REGION_CURRENCY));
  if (exchangeRates && exchangeRates.rates) Object.keys(exchangeRates.rates).forEach(c => codes.add(c));
  if (currencyPref !== 'auto' && currencyPref !== 'off') codes.add(currencyPref);
  const opts = [
    `<option value="auto">${auto ? t('currencyAuto').replace('{cur}', auto) : t('currencyAutoUnknown')}</option>`,
    `<option value="off">${t('currencyOff')}</option>`,
    ...[...codes].sort().map(c => `<option value="${c}">${escapeHtml(currencyLabel(c))}</option>`),
  ];
  sel.innerHTML = opts.join('');
  sel.value = currencyPref;
}
// Opt-in: el SDK de telemetria no informa que mods de mapa tiene instalados
// el usuario, asi que no se puede auto-detectar - el usuario lo activa a
// mano si lo tiene instalado (ver GAME_MAPS.ats_c2c/ats_promods/ets2_promods).
// Coast to Coast y ProMods Canada son ambos mapas de ATS, mutuamente
// excluyentes (no se pueden combinar), por eso es un selector unico
// ('none'|'c2c'|'promods_canada') en vez de dos checkboxes independientes.
let atsMod = _savedSettings.atsMod || 'none';
// Selector manual de ETS2: 'none' | 'promods' | 'promods_rusmap'. Antes era un
// booleano hasProMods; lo guardado viejo se migra.
let ets2Mod = _savedSettings.ets2Mod || (_savedSettings.hasProMods ? 'promods' : 'none');
// Deteccion automatica de mods de mapa: el cliente (>= 1.5.1) lee
// game.log.txt y manda {ets2: {promods,..}|null, ats: {c2c, promods_canada}|null}
// en client_status. Con modsAuto (default) la variante del mapa sale de ahi;
// las opciones manuales quedan como override o para clientes viejos.
let modsAuto = _savedSettings.modsAuto !== false;
let detectedMods = null;
// Nombres de los mods activos por juego ({ets2: [...], ats: [...]}), del
// client_status. Solo salen de aca si el camion queda fuera del mapa: van en
// el reporte de "mapa que no conocemos" (sin nada que identifique a nadie).
let detectedModNames = null;
// Opt-in de "jugadores en vivo": reciprocidad simple (no compartis -> no ves
// a nadie), decidido asi porque no hay cuentas ni consentimiento granular.
// hideOtherPlayers es aparte y solo local (no le dice nada al backend) -
// podes seguir compartiendo tu posicion pero no dibujar la de los demas.
// Lo que se comparte es anonimo (posicion, camion, carga, ciudad
// origen/destino y el apodo de convoy solo si lo puso) y tambien alimenta el
// mapa en vivo publico (/live/). Viene APAGADO (20-10, ver liveShareChoice):
// del 21-09 al 20-10 venia prendido, y la pestana que abre el cliente en la
// PC publicaba la posicion de quien usaba solo el modo LAN.
let liveShareEnabled = liveShareChoice(_savedSettings) === true;
// Se cambio en esta pestana (el tilde, o lo que dijo el relay): desde ahi
// se reenvia al reconectar aunque localStorage no ande.
let liveShareChosen = false;
let hideOtherPlayers = _savedSettings.hideOtherPlayers || false;
useImperial = !!_savedSettings.useImperial;
renderUnitButtons();
const livePlayerMarkers = new Map(); // id de sesion -> maplibregl.Marker
let lastSentMapVariant = null;

function initSettingsUi() {
  document.getElementById('setMiniFuelPct').checked = miniHudSettings.fuelPct;
  document.getElementById('setMiniFuelRange').checked = miniHudSettings.fuelRange;
  document.getElementById('setMiniEta').checked = miniHudSettings.eta;
  document.getElementById('setMiniDistance').checked = miniHudSettings.distance;
  document.getElementById('setMiniCruise').checked = miniHudSettings.cruise;
  document.getElementById('setMiniGps').checked = miniHudSettings.gps;
  document.getElementById('setMiniRest').checked = miniHudSettings.rest;
  document.getElementById('setRouteFastest').checked = routeProfile !== 'shortest';
  document.getElementById('setRouteShortest').checked = routeProfile === 'shortest';
  document.getElementById('setEveryExit').checked = navEveryExit;
  document.getElementById('setLiveShare').checked = liveShareEnabled;
  document.getElementById('setLiveShareRoute').checked = liveShareRoute;
  renderLiveShareControls();
  document.getElementById('setNavZoom').value = navZoom;
  document.getElementById('setTruckSize').value = truckSize;
  document.getElementById('setClockSelect').value = clockFormat;
  document.getElementById('setVoice').checked = voiceOn;
  document.getElementById('setVoiceTiming').value = voiceTiming;
  loadVoiceCatalog().then(fillVoiceSelect);
  document.getElementById('setDarkButtons').checked = darkButtons;
  document.getElementById('setFadeButtons').checked = fadeButtons;
  document.getElementById('setRealBase').checked = realBase;
  document.getElementById('setLiteMode').checked = liteMode;
  document.getElementById('setLiteNoRouting').checked = liteNoRouting;
  document.getElementById('setLiteNoRouting').disabled = !liteMode;
  document.getElementById('setLiveHideOthers').checked = hideOtherPlayers;
  fillCurrencySelect();
  renderTripHistory();
  document.querySelectorAll('input[name="routeProfile"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    routeProfile = e.target.value;
    saveSettings();
    invalidateRoute(); // recalcula con el perfil nuevo en el proximo tick
  });
});
document.querySelectorAll('.colorSwatch').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.color === routeColor);
  });
}

function initModsUi() {
  renderModsCredits();
  document.getElementById('setModsAuto').checked = modsAuto;
  document.getElementById('setModsManual').checked = !modsAuto;
  document.getElementById('modsAutoStatus').textContent = `ATS: ${describeDetectedMods('ats')} · ETS2: ${describeDetectedMods('ets2')}`;
  document.getElementById('modsManualBlock').style.opacity = modsAuto ? '0.5' : '1';
  document.getElementById('setAtsModNone').checked = atsMod === 'none';
  document.getElementById('setCoastToCoast').checked = atsMod === 'c2c';
  document.getElementById('setProModsCanada').checked = atsMod === 'promods_canada';
  document.getElementById('setC2CProModsCanada').checked = atsMod === 'c2c_promods_canada';
  document.getElementById('setReforma').checked = atsMod === 'reforma';
  document.getElementById('setReformaAll').checked = atsMod === 'reforma_c2c_promods_canada';
  document.getElementById('setCanada').checked = atsMod === 'canada';
  document.getElementById('setC2CCanada').checked = atsMod === 'c2c_canada';
  document.getElementById('setCanada').closest('label').hidden = !MAP_DATA_VERSION.ats_canada;
  document.getElementById('setC2CCanada').closest('label').hidden = !MAP_DATA_VERSION.ats_c2c_canada;
  document.getElementById('setEts2ModNone').checked = ets2Mod === 'none';
  document.getElementById('setProMods').checked = ets2Mod === 'promods';
  document.getElementById('setProModsRusMap').checked = ets2Mod === 'promods_rusmap';
  document.getElementById('setProModsRoex').checked = ets2Mod === 'promods_roex';
  document.getElementById('setProModsRusMapRoex').checked = ets2Mod === 'promods_rusmap_roex';
  document.getElementById('setProModsRoex').closest('label').hidden = !MAP_DATA_VERSION.ets2_promods_roex;
  document.getElementById('setProModsRusMapRoex').closest('label').hidden = !MAP_DATA_VERSION.ets2_promods_rusmap_roex;
  document.getElementById('setGrandUtopia').checked = ets2Mod === 'gu';
  document.getElementById('setEuGrandUtopia').checked = ets2Mod === 'eugu';
  document.getElementById('setProModsEuGrandUtopia').checked = ets2Mod === 'promods_eugu';
  document.getElementById('setEuGrandUtopia').closest('label').hidden = !MAP_DATA_VERSION.ets2_eugu;
  document.getElementById('setProModsEuGrandUtopia').closest('label').hidden = !MAP_DATA_VERSION.ets2_promods_eugu;
  document.getElementById('setTruckersMP').checked = ets2Mod === 'tmp';
  document.getElementById('setTruckersMP').closest('label').hidden = !MAP_DATA_VERSION.ets2_tmp;
}

document.querySelectorAll('input[name="modsAuto"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    modsAuto = e.target.value === 'auto';
    saveSettings();
    initModsUi();
    currentGame = null;
  });
});
document.querySelectorAll('input[name="atsMod"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    if (!e.target.checked) return;
    atsMod = e.target.value;
    saveSettings();
    // Fuerza un reload del mapa actual con la variante correcta la proxima
    // vez que llegue un tick de telemetria (updateMap ya resuelve la variante).
    currentGame = null;
  });
});
document.getElementById('setCurrency').addEventListener('change', (e) => {
  currencyPref = e.target.value;
  saveSettings();
  fetchExchangeRates();
  sendCurrencyPref();
  if (lastData) updateHud(lastData);
  renderTripHistory();
});

document.querySelectorAll('input[name="ets2Mod"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    ets2Mod = e.target.value;
    saveSettings();
    currentGame = null;
  });
});

// Le manda al backend si esta sesion comparte su posicion, y con que
// variante de mapa (ats, ats_promods, etc.) - el backend usa esto para
// agrupar "jugadores del mismo juego/mod" y para la reciprocidad (si
// enabled=false, esta sesion tampoco va a recibir la posicion de nadie).
// explicit: el usuario toco la casilla en esta pestana. El reenvio al
// conectar va sin explicit: con el valor por defecto (prendido) de un
// celular nuevo, o el de una pestana vieja, volvia a compartir la posicion
// de toda la sesion aunque el usuario la hubiera apagado en otro lado
// (auditoria del 10-10). El relay solo deja prender con explicit, y avisa el
// estado real con live_share_state.
function sendLiveShareState(explicit = false) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  // Sin tocar el tilde, solo si este navegador ya tenia un valor: una
  // pestana que nunca lo cambio no lo prende ni apaga lo que eligio otro
  // dispositivo (liveShareChoice).
  if (!explicit && !liveShareChosen && liveShareChoice(loadSettings()) === null) return;
  // Sin telemetria todavia no se sabe el juego: resolveEffectiveGame() cae
  // en 'ats' por defecto y el conductor aparecia en el mapa de ATS aunque
  // estuviera en ETS2. Se manda null (no comparte) y updateMap re-manda el
  // estado apenas llega el primer tick con el juego real.
  const mapVariant = liveShareEnabled && lastData?.game ? resolveEffectiveGame(lastData.game) : null;
  lastSentMapVariant = mapVariant;
  // El apodo de convoy (si lo puso) es lo unico con nombre que se muestra en el mapa en vivo.
  const nick = liveShareEnabled ? (loadSettings().convoyNick || null) : null;
  ws.send(JSON.stringify({ type: 'set_live_share', enabled: liveShareEnabled, mapVariant, nick, explicit: !!explicit }));
}

// Mapa que no conocemos: una vez por mapa y sesion (el relay tambien lo
// limita), la variante, la posicion redondeada y los nombres de los mods
// activos de ese juego. El panel de admin los cuenta: el mod de mapa sale
// arriba porque esta en todos los reportes de esa zona.
function sendOffMapReport(x, z) {
  if (!ws || ws.readyState !== WebSocket.OPEN || conn.demo || conn.spectator || conn.local) return;
  const game = lastData && lastData.game;
  const mods = detectedModNames && game && Array.isArray(detectedModNames[game]) ? detectedModNames[game] : null;
  ws.send(JSON.stringify({ type: 'offmap_report', variant: currentGame, x: Math.round(x), z: Math.round(z), mods }));
}

// Empresa del trabajo que no esta en nuestros POIs (ver
// createMissingCompanyWatch): al relay, con la posicion donde se cargo o se
// entrego, para el panel de admin. Corre en todas las pestanas para seguir el
// trabajo, pero manda solo la lider; el relay ademas repite una vez por sesion.
// Los mapas armados en la PC (local_*) no: sus datos no son los nuestros.
const missingCompanyWatch = createMissingCompanyWatch();
function checkMissingCompanies(data) {
  if (conn.demo || conn.spectator || conn.local) return;
  // Sin los POIs de esta variante no se sabe: se da por conocida (sin
  // reporte), pero el tick corre igual para no comparar contra un estado viejo.
  const usable = pois && currentGame && poisVariant === currentGame && !currentGame.startsWith('local');
  const known = (token, name, city) => !usable || !!(findCompanyPoi(token, city) || findCompanyPoiByName(name, city));
  const reportes = missingCompanyWatch.tick(data, lastWorldPos, known);
  if (!reportes.length || !isLeaderTab || !ws || ws.readyState !== WebSocket.OPEN) return;
  for (const r of reportes) ws.send(JSON.stringify({ type: 'missing_company', variant: currentGame, ...r }));
}

// Ruta propia al mapa en vivo publico (/live/): la misma que se dibuja aca,
// simplificada, cuando cambia y como mucho cada LIVE_ROUTE_RESEND_MS. Solo
// con la posicion compartida y la casilla de la ruta prendida; si no, se
// manda vacia una vez para que desaparezca.
const LIVE_ROUTE_MAX_POINTS = 400;
const LIVE_ROUTE_RESEND_MS = 15000;
let liveRouteSig = null;
let liveRouteSentAt = 0;
function sendLiveRoute(force) {
  if (!isLeaderTab) return; // ver requestLeadership
  if (!ws || ws.readyState !== WebSocket.OPEN || conn.demo || conn.spectator) return;
  const pts = currentRouteWorldPoints;
  if (!liveShareEnabled || !liveShareRoute || !lastSentMapVariant || !pts || pts.length < 2) {
    if (liveRouteSig !== 'none') { liveRouteSig = 'none'; ws.send(JSON.stringify({ type: 'live_route', points: [] })); }
    return;
  }
  const now = Date.now();
  if (!force && now - liveRouteSentAt < LIVE_ROUTE_RESEND_MS) return;
  const step = Math.max(1, Math.ceil(pts.length / LIVE_ROUTE_MAX_POINTS));
  const out = [];
  for (let i = 0; i < pts.length; i += step) out.push([Math.round(pts[i][0]), Math.round(pts[i][1])]);
  const last = pts[pts.length - 1];
  const tail = [Math.round(last[0]), Math.round(last[1])];
  if (out[out.length - 1][0] !== tail[0] || out[out.length - 1][1] !== tail[1]) {
    if (out.length >= LIVE_ROUTE_MAX_POINTS) out[out.length - 1] = tail; else out.push(tail);
  }
  const sig = `${out.length}|${out[0]}|${out[out.length - 1]}`;
  liveRouteSentAt = now;
  if (sig === liveRouteSig) return;
  liveRouteSig = sig;
  ws.send(JSON.stringify({ type: 'live_route', points: out }));
}

// pixelRatio se fija al crear el mapa y el grafo ya esta en memoria: el
// cambio se aplica recargando la pagina (se guarda antes).
function saveLiteAndReload(mode, noRouting) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(Object.assign(loadSettings(), { liteMode: mode, liteNoRouting: noRouting })));
  } catch (e) {}
  showToast(t('settingsLiteReload'), 'info', 1500);
  setTimeout(() => location.reload(), 600);
}
document.getElementById('setMoveButtonsBtn').addEventListener('click', () => {
  document.getElementById('settingsModal').style.display = 'none';
  setLayoutEdit(true);
});
document.getElementById('layoutDoneBtn').addEventListener('click', () => setLayoutEdit(false));
document.getElementById('layoutGridChk').addEventListener('change', (e) => {
  layoutGrid = e.target.checked;
  saveSettings();
  applyLayoutGrid();
});
document.getElementById('layoutResetBtn').addEventListener('click', resetBtnLayout);
// Mientras se arrastra, el mapa ya muestra el zoom nuevo si se esta en modo
// navegacion: elegir a ciegas y cerrar Ajustes para ver como quedo era
// probar y errar.
function applyNavZoom(value) {
  navZoom = navZoomSetting(value);
  document.getElementById('setNavZoom').value = navZoom;
  saveSettings();
  if (navMode && map) {
    navAutoZoomPaused = false;
    map.easeTo({ zoom: navTargetZoom(), duration: 200 });
  }
}
document.getElementById('setNavZoom').addEventListener('input', (e) => applyNavZoom(e.target.value));
document.getElementById('setNavZoomDefault').addEventListener('click', () => applyNavZoom(NAV_ZOOM_DEFAULT));
// Igual que el zoom: la flecha cambia en el mapa mientras se arrastra.
function applyTruckSize(value) {
  truckSize = truckSizeSetting(value);
  document.getElementById('setTruckSize').value = truckSize;
  saveSettings();
  updateTruckArrowSize();
}
document.getElementById('setTruckSize').addEventListener('input', (e) => applyTruckSize(e.target.value));
document.getElementById('setTruckSizeDefault').addEventListener('click', () => applyTruckSize(TRUCK_SIZE_DEFAULT));
document.getElementById('setVoice').addEventListener('change', (e) => {
  voiceOn = e.target.checked;
  saveSettings();
  if (voiceOn) { unlockVoice().catch(() => {}); speakVoice('soon_turn_right'); }
});
document.getElementById('setVoiceName').addEventListener('change', (e) => {
  voiceByLang[currentLang] = e.target.value;
  saveSettings();
  unlockVoice().catch(() => {});
  speakVoice('soon_turn_right');
});
document.getElementById('setVoiceTiming').addEventListener('change', (e) => {
  voiceTiming = voiceTimingSetting(e.target.value);
  voiceGuide.setTiming(voiceTiming);
  saveSettings();
});
document.getElementById('setVoiceTest').addEventListener('click', () => {
  unlockVoice().catch(() => {});
  speakVoice('soon_turn_right');
});
document.getElementById('setEveryExit').addEventListener('change', (e) => {
  navEveryExit = e.target.checked;
  saveSettings();
});
document.getElementById('setDarkButtons').addEventListener('change', (e) => {
  darkButtons = e.target.checked;
  saveSettings();
  applyButtonPrefs();
});
document.getElementById('setFadeButtons').addEventListener('change', (e) => {
  fadeButtons = e.target.checked;
  saveSettings();
  applyButtonPrefs();
});
document.getElementById('setRealBase').addEventListener('change', (e) => {
  realBase = e.target.checked;
  saveSettings();
  applyBaseMap();
});
document.getElementById('setLiteMode').addEventListener('change', (e) => {
  saveLiteAndReload(e.target.checked, e.target.checked && document.getElementById('setLiteNoRouting').checked);
});
document.getElementById('setLiteNoRouting').addEventListener('change', (e) => {
  saveLiteAndReload(true, e.target.checked);
});
document.getElementById('setLiveShare').addEventListener('change', (e) => {
  liveShareEnabled = e.target.checked;
  liveShareChosen = true;
  saveSettings();
  if (!liveShareEnabled) updateLivePlayers([]); // saca los marcadores ajenos ya dibujados
  renderLiveShareControls();
  sendLiveShareState(true);
  sendLiveRoute(true);
});

// Lo que dice el relay que comparte la sesion (live_share_state): manda sobre
// lo guardado en este dispositivo, asi la casilla dice la verdad aunque se
// haya cambiado en otro.
function applyLiveShareState(enabled) {
  enabled = !!enabled;
  if (enabled === liveShareEnabled) return;
  liveShareEnabled = enabled;
  liveShareChosen = true;
  saveSettings();
  document.getElementById('setLiveShare').checked = enabled;
  renderLiveShareControls();
  if (!enabled) updateLivePlayers([]);
}

// Modo LAN: un cliente viejo no le pasa este ajuste al relay y la casilla no
// hacia nada; ahi queda gris y se dice donde se cambia. Uno nuevo si (con
// liveShare en su session_state, conn.lanRelay). Ver liveShareControls.
function renderLiveShareControls() {
  const c = liveShareControls({ lan: !!conn.local, lanRelay: !!conn.lanRelay, enabled: liveShareEnabled });
  document.getElementById('setLiveShare').disabled = c.shareDisabled;
  document.getElementById('setLiveShareRoute').disabled = c.routeDisabled;
  for (const id of ['liveShareLanHint', 'liveShareLanRouteHint']) {
    const hint = document.getElementById(id);
    if (hint) hint.hidden = c.hint !== id;
  }
}
document.getElementById('setLiveShareRoute').addEventListener('change', (e) => {
  liveShareRoute = e.target.checked;
  saveSettings();
  sendLiveRoute(true);
});
document.getElementById('setLiveHideOthers').addEventListener('change', (e) => {
  hideOtherPlayers = e.target.checked;
  saveSettings();
  if (hideOtherPlayers) updateLivePlayers([]);
});

// Dibuja los marcadores de "otros jugadores" recibidos del backend - id de
// sesion (efimero, cambia si se reconecta) en vez de nada personal. Reusa
// el patron de Marker ya establecido para waypoint/destino.
function updateLivePlayers(players) {
  const seen = new Set();
  if (map && toLngLat && !hideOtherPlayers) {
    for (const p of players) {
      seen.add(p.id);
      const lngLat = toLngLat(p.x, p.z);
      let marker = livePlayerMarkers.get(p.id);
      if (!marker) {
        const el = document.createElement('div');
        el.className = 'otherPlayerMarker';
        el.innerHTML = MARKER_SVG.otherPlayer;
        marker = new maplibregl.Marker({ element: el }).setLngLat(lngLat).addTo(map);
        livePlayerMarkers.set(p.id, marker);
      } else {
        marker.setLngLat(lngLat);
      }
    }
  }
  for (const [id, marker] of livePlayerMarkers) {
    if (!seen.has(id)) { marker.remove(); livePlayerMarkers.delete(id); }
  }
}

const MINI_HUD_CHECKBOXES = {
  setMiniFuelPct: 'fuelPct',
  setMiniFuelRange: 'fuelRange',
  setMiniEta: 'eta',
  setMiniDistance: 'distance',
  setMiniCruise: 'cruise',
  setMiniGps: 'gps',
  setMiniRest: 'rest',
};
for (const [id, key] of Object.entries(MINI_HUD_CHECKBOXES)) {
  document.getElementById(id).addEventListener('change', (e) => {
    miniHudSettings[key] = e.target.checked;
    saveSettings();
    if (lastData) updateHud(lastData);
  });
}

document.querySelectorAll('.colorSwatch').forEach(btn => {
  btn.addEventListener('click', () => {
    routeColor = btn.dataset.color;
    document.querySelectorAll('.colorSwatch').forEach(b => b.classList.toggle('selected', b === btn));
    if (map && map.getLayer('route-line')) map.setPaintProperty('route-line', 'line-color', routeColor);
  if (map && map.getLayer('route-next-line')) map.setPaintProperty('route-next-line', 'line-color', routeColor);
    saveSettings();
  });
});

document.getElementById('settingsBtn').addEventListener('click', () => {
  initSettingsUi();
  document.getElementById('settingsModal').style.display = 'flex';
});
document.getElementById('settingsCloseBtn').addEventListener('click', () => {
  document.getElementById('settingsModal').style.display = 'none';
});
document.getElementById('settingsModal').addEventListener('click', (e) => {
  if (e.target.id === 'settingsModal') document.getElementById('settingsModal').style.display = 'none';
});

function openModsModal() {
  initModsUi();
  document.getElementById('settingsModal').style.display = 'none';
  document.getElementById('modsModal').style.display = 'flex';
}
document.getElementById('modsBtn').addEventListener('click', openModsModal);
document.getElementById('setModsBtn').addEventListener('click', openModsModal);
document.getElementById('modsCloseBtn').addEventListener('click', () => {
  document.getElementById('modsModal').style.display = 'none';
});
document.getElementById('modsModal').addEventListener('click', (e) => {
  if (e.target.id === 'modsModal') document.getElementById('modsModal').style.display = 'none';
});

// DLC de mapa: una casilla por DLC, primero los del juego que se esta
// jugando. Cada cambio se guarda y la ruta se recalcula en el proximo tick.
function renderDlcLists() {
  const caja = document.getElementById('dlcLists');
  caja.innerHTML = '';
  document.getElementById('setDlcAuto').checked = dlcAuto;
  document.getElementById('setDlcManual').checked = !dlcAuto;
  const partes = ['ats', 'ets2'].filter(g => detectedDlcs && Array.isArray(detectedDlcs[g])).map(g => {
    const total = DLC_LIST[g].length;
    const tiene = DLC_LIST[g].filter(d => detectedDlcs[g].includes(d[0])).length;
    return `${g === 'ats' ? 'ATS' : 'ETS2'} ${tiene} / ${total}`;
  });
  document.getElementById('dlcAutoStatus').textContent = partes.length ? `${t('dlcDetected')} ${partes.join(' · ')}` : t('dlcAutoWaiting');
  caja.style.opacity = dlcAuto ? '0.6' : '1';
  const juegos = currentGame && dlcGameOf(currentGame) === 'ats' ? ['ats', 'ets2'] : ['ets2', 'ats'];
  for (const game of juegos) {
    const titulo = document.createElement('p');
    titulo.className = 'settingsSectionTitle';
    titulo.textContent = game === 'ats' ? 'American Truck Simulator' : 'Euro Truck Simulator 2';
    caja.appendChild(titulo);
    const grilla = document.createElement('div');
    grilla.className = 'dlcGrid';
    for (const [id, nombre] of DLC_LIST[game]) {
      const label = document.createElement('label');
      label.className = 'settingsRow';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !dlcOffFor(game).includes(id);
      input.disabled = dlcAuto;
      input.addEventListener('change', () => {
        const off = new Set(dlcOff[game]);
        if (input.checked) off.delete(id); else off.add(id);
        dlcOff = normalizeDlcOff({ ...dlcOff, [game]: [...off] });
        saveSettings();
        invalidateRoute();
      });
      label.appendChild(input);
      label.appendChild(document.createTextNode(' ' + nombre));
      grilla.appendChild(label);
    }
    caja.appendChild(grilla);
  }
}
function openDlcModal() {
  renderDlcLists();
  document.getElementById('settingsModal').style.display = 'none';
  document.getElementById('dlcModal').style.display = 'flex';
}
document.getElementById('setDlcBtn').addEventListener('click', openDlcModal);
document.querySelectorAll('input[name="dlcAuto"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    const auto = e.target.value === 'auto';
    // Pasar a manual arranca de lo detectado: la persona corrige uno, no
    // vuelve a destildar todos.
    if (!auto && dlcAuto) dlcOff = normalizeDlcOff({ ats: dlcOffFor('ats'), ets2: dlcOffFor('ets2') });
    dlcAuto = auto;
    saveSettings();
    invalidateRoute();
    renderDlcLists();
  });
});
document.getElementById('dlcCloseBtn').addEventListener('click', () => {
  document.getElementById('dlcModal').style.display = 'none';
});
document.getElementById('dlcModal').addEventListener('click', (e) => {
  if (e.target.id === 'dlcModal') document.getElementById('dlcModal').style.display = 'none';
});

// ---------------------------------------------------------------------------
// Modales accesibles (auditoria del 12-10, P3). Cada .settingsOverlay es un
// dialogo con nombre (su h3); al abrirse el foco entra al panel, Tab da la
// vuelta adentro (focusTrapTarget), Escape aprieta su boton de cerrar
// (data-modal-close, asi corre la misma logica que con el clic) y al cerrarse
// el foco vuelve a quien lo abrio. Se abren y cierran tocando style.display
// desde muchos lugares, y a veces uno abre otro (Ajustes -> Mods, DLC,
// teclas): por eso se mira el estilo con un MutationObserver en vez de
// cambiar cada apertura. El de las preguntas (waypoint) no tiene cerrar:
// Escape no lo saca.
// ---------------------------------------------------------------------------
const MODALS = [...document.querySelectorAll('.settingsOverlay')];
const modalStack = []; // { el, opener }; el ultimo es el de arriba
let focusOutsideModals = null; // lo ultimo enfocado fuera de los modales

// Todos arrancan con display:none en el HTML y se abren con 'flex'
function modalIsOpen(el) { return el.style.display !== 'none'; }
function shownElement(el) { return !!(el && el.isConnected && el !== document.body && el.getClientRects().length); }
function modalFocusables(el) {
  return [...el.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')]
    .filter(x => x.tabIndex >= 0 && !x.disabled && shownElement(x));
}
function focusIntoModal(el) {
  if (el.contains(document.activeElement)) return; // la apertura ya enfoco algo suyo
  const panel = el.querySelector('.settingsPanel');
  (panel || el).focus({ preventScroll: true });
}
function topModal() { return modalStack.length ? modalStack[modalStack.length - 1].el : null; }

MODALS.forEach(el => {
  const panel = el.querySelector('.settingsPanel');
  if (!panel) return;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.tabIndex = -1;
  const title = panel.querySelector('h3');
  if (title) {
    if (!title.id) title.id = `${el.id}Title`;
    panel.setAttribute('aria-labelledby', title.id);
  }
});

const modalObserver = new MutationObserver(() => {
  const closed = MODALS.filter(el => modalStack.some(m => m.el === el) && !modalIsOpen(el));
  const opened = MODALS.filter(el => !modalStack.some(m => m.el === el) && modalIsOpen(el));
  // De un modal a otro: el nuevo hereda a quien abrio el anterior (el boton
  // que se toco quedo adentro del que se cerro).
  let inherited = null;
  for (const el of closed) {
    const i = modalStack.findIndex(m => m.el === el);
    const { opener } = modalStack.splice(i, 1)[0];
    inherited = inherited || opener;
    if (opened.length) continue;
    const act = document.activeElement;
    if (act && act !== document.body && !el.contains(act) && shownElement(act)) continue; // el foco ya esta en otro lado
    if (topModal()) focusIntoModal(topModal());
    else if (shownElement(opener)) opener.focus({ preventScroll: true });
  }
  for (const el of opened) {
    const act = document.activeElement;
    let opener = act && !el.contains(act) && shownElement(act) ? act : null;
    if (!opener) opener = shownElement(inherited) ? inherited : focusOutsideModals;
    modalStack.push({ el, opener });
    focusIntoModal(el);
  }
});
// Solo los modales: con todo el body corria en cada dato (el HUD toca estilos)
MODALS.forEach(el => modalObserver.observe(el, { attributes: true, attributeFilter: ['style'] }));

document.addEventListener('focusin', (e) => {
  const top = topModal();
  if (!top) {
    if (!MODALS.some(m => m.contains(e.target))) focusOutsideModals = e.target;
    return;
  }
  // Algo de afuera tomo el foco con un modal abierto: vuelve adentro
  if (!top.contains(e.target)) focusIntoModal(top);
});

document.addEventListener('keydown', (e) => {
  const top = topModal();
  if (!top || e.defaultPrevented) return;
  if (e.key === 'Escape') {
    const close = top.querySelector('[data-modal-close]');
    if (!close) return;
    e.preventDefault();
    e.stopImmediatePropagation(); // que no cierre tambien el panel o la tarjeta de entrega
    close.click();
  } else if (e.key === 'Tab') {
    const list = modalFocusables(top);
    const to = focusTrapTarget(list.length, list.indexOf(document.activeElement), e.shiftKey);
    if (to == null) return;
    e.preventDefault();
    if (to >= 0) list[to].focus();
  }
});

// Mapa vectorial (roads/prefabs/pois/labels) generado con truckermudgeon/maps
// + tippecanoe, servido como un unico archivo .pmtiles por juego (soporta
// range-requests HTTP, el navegador solo baja lo que necesita segun zoom/
// posicion). assetsDir sigue apuntando a los mismos Cities.json y
// route-graph-*.json de siempre (esos no cambiaron, solo el renderizado del
// mapa en si). Todo se sirve desde R2 (maps.trucksim-dash.com), igual que
// los tiles PNG que reemplaza.
const REMOTE_MAP_BASE = 'https://maps.trucksim-dash.com';
// Version de los datos de cada mapa (fecha de la ultima regeneracion). Se
// agrega como ?v= a Cities/route-graph/road-names/pmtiles: R2 no manda
// Cache-Control y los navegadores cachean por heuristica sobre
// Last-Modified (dias), asi que sin esto un mapa regenerado (ej. ProMods
// nuevo) podia tardar en verse aunque ya estuviera subido. Subir el
// numero de la variante que se regenero.
// Una variante sin entrada en MAP_DATA_VERSION esta cableada pero todavia no
// publicada en R2 (ej. Roextended a la espera de sus paquetes Def/Models):
// no se ofrece en Ajustes y la auto-deteccion cae a la mas parecida.
function publishedVariant(v, fallback) { return MAP_DATA_VERSION[v] ? v : fallback; }
// Proyecciones: el unico dato de una variante que es codigo y no tabla. Las
// de ATS y ETS2 son las del juego; Grand Utopia es un mapa standalone que cae
// en la zona del hack de UK, por eso tiene la suya (ver ets2ToLngLatImpl).
const PROJECTIONS = {
  ats: { toLngLat: atsToLngLat, fromLngLat: atsFromLngLat },
  ets2: { toLngLat: ets2ToLngLat, fromLngLat: ets2FromLngLat },
  gu: { toLngLat: guToLngLat, fromLngLat: guFromLngLat },
};

// Mapa base real: costa, lagos, rios y zonas urbanas debajo de las rutas.
// El juego no trae nada de eso - sus mapArea son motas pegadas a las rutas,
// no hay costa ni agua -, pero la proyeccion de arriba manda las coordenadas
// del juego a lng/lat de verdad, asi que la geografia real cae justo donde
// van las rutas. Los datos son de Natural Earth (dominio publico) y hay un
// archivo por juego, compartido por las 13 variantes: agregar un mod de mapa
// no obliga a regenerarlo (ver build_basemap.py). Grand Utopia queda afuera:
// su proyeccion lo deja en medio del Atlantico, donde no hay tierra real.
const BASEMAP_BY_PROJECTION = { ats: 'usa', ets2: 'europe', gu: null };
const BASEMAP_VERSION = '20260923';
const BASE_LAYER_IDS = ['base-land', 'base-urban', 'base-lake', 'base-river'];
// Con el mapa base apagado el fondo es el gris de siempre; con el prendido el
// fondo pasa a ser el mar y la tierra se pinta con ese mismo gris, asi lo
// unico que cambia es que aparece el agua.
const MAP_BG_FLAT = '#2b2f36';
const MAP_BG_WATER = '#16283f';

// El resto de cada variante (etiqueta, juego, centro del mapa, que mods trae)
// sale de VARIANT_META, que genera tools/build_variants_js.py desde
// docs/data/map-manifest.json: publicar una variante es tocar el manifest y
// regenerar, no editar cinco lugares. Ojo: las variantes con mods son opt-in
// (el SDK no informa que mods hay instalados, lo detecta el cliente leyendo
// game.log); usar el mapa equivocado muestra rutas que en esa copia del juego
// no existen.
const GAME_MAPS = Object.fromEntries(Object.entries(VARIANT_META).map(([name, meta]) => [name, {
  assetsDir: `${REMOTE_MAP_BASE}/${name}`,
  pmtilesUrl: `${REMOTE_MAP_BASE}/vector/${name}.pmtiles`,
  sourceLayer: meta.game,
  label: meta.label,
  toLngLat: PROJECTIONS[meta.projection].toLngLat,
  fromLngLat: PROJECTIONS[meta.projection].fromLngLat,
  origin: meta.origin,
  basemap: BASEMAP_BY_PROJECTION[meta.projection],
}]));

// Mapas armados en la PC del cliente ("Build my map", client/map_builder.py).
// El cliente dice en client_status cuales hay ({ats: {variant: 'local_ats',
// fingerprint, ...}}) y los sirve en /localmap/<juego>/ con los mismos nombres
// de archivo que una variante de R2. En modo LAN se leen del mismo origen; con
// el codigo, de 127.0.0.1 (solo en la misma PC: en el celular no llega, se
// prueba antes y se sigue con el de R2).
let localMaps = {};          // juego -> datos del cliente, solo los que se pudieron leer
let localMapsSig = null;
function localMapRoot(game, port) {
  const base = conn.local ? '' : (port ? `http://127.0.0.1:${port}` : null);
  return base === null ? null : `${base}/localmap/${game}`;
}
async function applyLocalMaps(maps, port) {
  const sig = JSON.stringify([maps || null, port || null, conn.local]);
  if (sig === localMapsSig) return;
  localMapsSig = sig;
  const usables = {};
  for (const game of ['ats', 'ets2']) {
    const m = maps && maps[game];
    const root = m && localMapRoot(game, port);
    if (!m || !root || m.variant !== `local_${game}` || !GAME_MAPS[game]) continue;
    try {
      const res = await fetch(`${root}/${m.variant}/Cities.json?v=${m.fingerprint}`, { method: 'HEAD' });
      if (!res.ok) continue;
    } catch (err) {
      continue; // otro dispositivo, o el servidor local apagado
    }
    if (sig !== localMapsSig) return; // llego otro estado mientras se probaba
    const vainilla = GAME_MAPS[game];
    GAME_MAPS[m.variant] = Object.assign({}, vainilla, {
      assetsDir: `${root}/${m.variant}`,
      pmtilesUrl: `${root}/vector/${m.variant}.pmtiles`,
      label: `${vainilla.label} (${t('localMapLabel')})`,
      poisUrl: `${root}/pois-${m.variant}.json`,
      // Los logos de sus empresas, mods incluidos (armado con la 1.5.32+).
      companyIconsBase: m.companyIcons > 0 ? `${root}/company-icons` : null,
    });
    MAP_DATA_VERSION[m.variant] = m.fingerprint;
    usables[game] = m;
  }
  const antes = JSON.stringify(localMaps);
  localMaps = usables;
  // Si cambio el mapa que corresponde, se recarga (como al detectar mods).
  if (antes !== JSON.stringify(usables) && modsAuto && lastData && currentGame
      && resolveEffectiveGame(lastData.game) !== currentGame) currentGame = null;
}

// Conversion de coordenadas de juego (x,z) a lng/lat WGS84 real, con el mismo
// algoritmo (proyeccion Lambert Conformal Conic) que usa truckermudgeon/maps
// para generar los tiles vectoriales - asi el camion cae en el lugar correcto
// sobre el mapa. Formulas portadas de su packages/libs/map/projections.ts.
const EARTH_RADIUS_M = 6370997;
const LENGTH_OF_DEGREE = (EARTH_RADIUS_M * Math.PI) / 180;

const ATS_DEF = { lat1: 33, lat2: 45, origin: [39, -96], factor: [-0.00017706234, 0.000176689948] };
const atsProj4 = proj4(`+proj=lcc +R=${EARTH_RADIUS_M} +lat_1=${ATS_DEF.lat1} +lat_2=${ATS_DEF.lat2} +lat_0=${ATS_DEF.origin[0]} +lon_0=${ATS_DEF.origin[1]}`);
function atsToLngLat(x, z) {
  const lcc = [x * ATS_DEF.factor[1] * LENGTH_OF_DEGREE, z * ATS_DEF.factor[0] * LENGTH_OF_DEGREE];
  return atsProj4.inverse(lcc);
}
// Inversa de atsToLngLat - para convertir un click del mapa (lng/lat) de
// vuelta a coordenadas de juego, necesario para ubicar un waypoint puesto a
// mano en el grafo de rutas (que trabaja en coordenadas de juego, no lng/lat).
function atsFromLngLat(lng, lat) {
  const [lccX, lccY] = atsProj4.forward([lng, lat]);
  return [lccX / (ATS_DEF.factor[1] * LENGTH_OF_DEGREE), lccY / (ATS_DEF.factor[0] * LENGTH_OF_DEGREE)];
}

const ETS2_DEF = { lat1: 37, lat2: 65, origin: [50, 15], offset: [16660, 4150], factor: [-0.000171570875, 0.0001729241463] };
const ets2Proj4 = proj4(`+proj=lcc +R=${EARTH_RADIUS_M} +lat_1=${ETS2_DEF.lat1} +lat_2=${ETS2_DEF.lat2} +lat_0=${ETS2_DEF.origin[0]} +lon_0=${ETS2_DEF.origin[1]}`);
function ets2ToLngLat(x, z) { return ets2ToLngLatImpl(x, z, true); }
function ets2FromLngLat(lng, lat) { return ets2FromLngLatImpl(lng, lat, true); }
// Grand Utopia (mapa standalone): sus sectores caen en la zona que el hack de
// UK escala distinto y cruzan su borde - sin el hack (los tiles se generan
// con TM_NO_UK_HACK=1, misma proyeccion).
function guToLngLat(x, z) { return ets2ToLngLatImpl(x, z, false); }
function guFromLngLat(lng, lat) { return ets2FromLngLatImpl(lng, lat, false); }
function ets2ToLngLatImpl(x, z, ukHack) {
  const sx = Math.floor(x / 4000);
  const sz = Math.floor(z / 4000);
  x -= ETS2_DEF.offset[0];
  z -= ETS2_DEF.offset[1];
  // El contenido de UK esta autorado a una escala un poco mas grande, y todo
  // lo que cae arriba-a-la-izquierda del sector de Calais se trata como UK -
  // mismo hack que usa truckermudgeon/maps, no hay otra forma de detectarlo
  // desde los archivos del juego.
  const ukScale = 0.75;
  const calaisX = -31100, calaisZ = -5500;
  const isUk = ukHack && sx <= -8 && sz <= -2 && !(sx === -8 && sz === -2);
  if (isUk) {
    x = (x + calaisX / 2) * ukScale;
    z = (z + calaisZ / 2) * ukScale;
  }
  const lcc = [x * ETS2_DEF.factor[1] * LENGTH_OF_DEGREE, z * ETS2_DEF.factor[0] * LENGTH_OF_DEGREE];
  return ets2Proj4.inverse(lcc);
}
// Inversa de ets2ToLngLat. El hack de UK hace esto no trivial de invertir en
// un solo paso (si el punto es UK depende del sector x,z ANTES de aplicarle
// la escala de UK, que es justo lo que estamos por calcular) - se resuelve
// en dos pasadas: primero se asume que no es UK, se ve a que sector cae, y
// si ese sector resulta ser UK se rehace la cuenta aplicando la escala.
function ets2FromLngLatImpl(lng, lat, ukHack) {
  const [lccX, lccY] = ets2Proj4.forward([lng, lat]);
  const ukScale = 0.75;
  const calaisX = -31100, calaisZ = -5500;

  const tryConvert = (assumeUk) => {
    let x = lccX / (ETS2_DEF.factor[1] * LENGTH_OF_DEGREE);
    let z = lccY / (ETS2_DEF.factor[0] * LENGTH_OF_DEGREE);
    if (assumeUk) {
      x = x / ukScale - calaisX / 2;
      z = z / ukScale - calaisZ / 2;
    }
    x += ETS2_DEF.offset[0];
    z += ETS2_DEF.offset[1];
    return [x, z];
  };

  const [x0, z0] = tryConvert(false);
  const sx = Math.floor(x0 / 4000);
  const sz = Math.floor(z0 / 4000);
  const isUk = ukHack && sx <= -8 && sz <= -2 && !(sx === -8 && sz === -2);
  return isUk ? tryConvert(true) : [x0, z0];
}

let map = null; // instancia de MapLibre
let mapReady = false; // true despues del evento 'load' inicial (recien ahi se pueden agregar sources/layers)
let pendingGame = null; // juego que se quiso cargar antes de que el mapa terminara de inicializar
let truckMarker = null;
let mapLoadToken = 0; // sube en cada loadGameMap: lo que termina tarde no toca la barra de la nueva carga
let truckArrowEl = null; // referencia al div interno de la flecha, para rotarlo
let destMarker = null;
let toLngLat = null; // funcion (x,z) => [lng,lat] del juego actual
let fromLngLat = null; // funcion (lng,lat) => [x,z] del juego actual - inversa, para ubicar un waypoint
let currentGame = null;
let citiesByName = {}; // Name (localizado o nativo) -> {Name, X, Y, Token, Native?}
// La lista completa, sin colapsar. citiesByName se arma pisando, asi que con
// dos ciudades del mismo nombre solo sobrevive una: en ATS pasa 8 veces, y el
// DLC de South Dakota sumo Aberdeen SD a 99 km de Aberdeen WA. Quien recorra
// ciudades (la de al lado, la proxima de la ruta) tiene que usar esta.
let citiesAll = [];
// Caja del mapa cargado (de sus ciudades) y para que variante ya se aviso
// que el camion esta afuera: una vez por mapa y por sesion.
let mapBounds = null;
let offMapWarnedFor = null;
let citiesByToken = {}; // token del juego -> misma entrada
// De que mapa (GAME_MAPS) son las ciudades cargadas; null mientras cargan o
// si fallaron (ver jobPlacesReady).
let citiesMap = null;
const trailWorld = []; // [[lng,lat], ...]
const MAX_TRAIL_POINTS = 1000;
let trailWorldRaw = null; // coords de juego del ultimo punto agregado al trail

function emptyLineString() {
  return { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } };
}

// Con una ruta dibujada las autopistas dejan el naranja: la ruta roja sobre
// una autopista naranja casi no se distinguia (reportado en Discord y en
// Reddit, 29-09-2026). Gris claro, un poco mas que las divididas, para que
// se sigan leyendo como las rutas grandes. Sin ruta, el mapa queda como era.
const FREEWAY_COLOR = '#ff8a3d';
const FREEWAY_COLOR_WITH_ROUTE = '#e3e6ea';
let routeShown = false;

function setRouteData(data) {
  if (!map || !map.getSource('route')) return;
  map.getSource('route').setData(data);
  const hay = routeHasLine(data);
  if (hay === routeShown) return;
  routeShown = hay;
  if (map.getLayer('road-freeway')) {
    map.setPaintProperty('road-freeway', 'line-color', hay ? FREEWAY_COLOR_WITH_ROUTE : FREEWAY_COLOR);
  }
}

// Capas del estilo que dependen del juego actual (fuente vectorial 'vec') -
// se remueven y se vuelven a crear al cambiar de juego, ya que MapLibre no
// permite cambiarle la url a un source ya existente.
const VEC_LAYER_IDS = ['mapArea', 'prefab', 'ferry-line', 'road-local', 'road-divided', 'road-freeway', 'company', 'poi','car-parking', 'fuel', 'atlas', 'ferry-poi', 'road-shield', 'exit-label', 'country-label', 'city-label'];

// Colores segun el enum MapAreaColor de truckermudgeon/maps (Road/Light/Dark/
// Green + 5 colores "Nav*" que casi no aparecen en la practica).
function buildVecLayers(sourceLayer) {
  const L = sourceLayer;
  return [
    { id: 'mapArea', type: 'fill', source: 'vec', 'source-layer': L, filter: ['==', ['get', 'type'], 'mapArea'],
      paint: { 'fill-color': ['match', ['get', 'color'], 0, '#454b54', 1, '#575e68', 2, '#1c1f24', 3, '#3d5238', '#454b54'], 'fill-opacity': 0.95 } },
    { id: 'prefab', type: 'fill', source: 'vec', 'source-layer': L, filter: ['==', ['get', 'type'], 'prefab'],
      paint: { 'fill-color': '#4a5058', 'fill-opacity': 0.95 } },
    // Cruces de ferry y de tren (el Eurotunel): el juego los dibuja en su
    // mapa y son la unica forma de llegar a varios destinos, asi que sirve
    // verlos aunque no haya ruta activa. Punteado y apagado para que no se
    // confundan con la ruta, que usa el mismo azul pero opaco.
    { id: 'ferry-line', type: 'line', source: 'vec', 'source-layer': L,
      filter: ['in', ['get', 'type'], ['literal', ['ferry', 'train']]],
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': '#5a9ec4', 'line-opacity': 0.55, 'line-dasharray': [2, 2],
               'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1, 12, 2.5] } },
    { id: 'road-local', type: 'line', source: 'vec', 'source-layer': L,
      filter: ['all', ['==', ['get', 'type'], 'road'], ['==', ['get', 'roadType'], 'local']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#7d838c', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 12, 1.5, 17, 5] } },
    { id: 'road-divided', type: 'line', source: 'vec', 'source-layer': L,
      filter: ['all', ['==', ['get', 'type'], 'road'], ['==', ['get', 'roadType'], 'divided']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#cbd0d6', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.8, 12, 2.5, 17, 8] } },
    { id: 'road-freeway', type: 'line', source: 'vec', 'source-layer': L,
      filter: ['all', ['==', ['get', 'type'], 'road'], ['==', ['get', 'roadType'], 'freeway']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': routeShown ? FREEWAY_COLOR_WITH_ROUTE : FREEWAY_COLOR, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1, 12, 3.5, 17, 10] } },
    // Logos de las empresas, los del mapa del juego: el sprite del tile es el
    // token y la imagen baja de R2 cuando hace falta (loadMissingCompanyIcon).
    // Sin superponerse entre ellos: en una ciudad hay varias pegadas y se
    // van mostrando al acercarse. Debajo de los POIs, que los tapan.
    { id: 'company', type: 'symbol', source: 'vec', 'source-layer': L, minzoom: 9,
      filter: ['all', ['==', ['get', 'type'], 'poi'], ['==', ['get', 'poiType'], 'company']],
      layout: { 'icon-image': ['concat', COMPANY_ICON_PREFIX, ['get', 'sprite']],
                'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.55, 12, 0.8, 15, 1],
                'icon-padding': 1 } },
    { id: 'poi',type: 'symbol', source: 'vec', 'source-layer': L, minzoom: liteMode ? 9 : 7,
      filter: poiLayerFilter(),
      layout: { 'icon-image': ['get', 'sprite'], 'icon-size': 0.8, 'icon-allow-overlap': true, 'icon-ignore-placement': true } },
    // En auto (ATS) los lugares de descanso son otros: los de camion se
    // ocultan del 'poi' y van estos, que salen de pois-<variante>.json.
    { id: 'car-parking', type: 'symbol', source: 'car-parking', minzoom: liteMode ? 9 : 7,
      layout: { 'icon-image': 'car_parking', 'icon-size': 0.8, 'icon-allow-overlap': true, 'icon-ignore-placement': true,
                visibility: drivingCar ? 'visible' : 'none' } },
    // Con datos que separan los surtidores solo para auto ('f'), el
    // combustible sale de pois-<variante>.json y no de los tiles, que no
    // distinguen: ver applyFuelSource.
    { id: 'fuel', type: 'symbol', source: 'fuel', minzoom: liteMode ? 9 : 7,
      layout: { 'icon-image': 'gas_ico', 'icon-size': 0.8, 'icon-allow-overlap': true, 'icon-ignore-placement': true } },
    // Atlas del Road Trip de ATS (Tourist Boards y Points of Interest). No
    // estan en los tiles: salen de pois-<variante>.json a la fuente 'atlas'
    // (ver setAtlasData). Los tourist boards desde mas lejos, como en el
    // mapa del juego, que son los destinos del Atlas.
    { id: 'atlas', type: 'symbol', source: 'atlas', minzoom: 6,
      filter: ['any', ['==', ['get', 'k'], 't'], ['>=', ['zoom'], 8]],
      layout: { 'icon-image': ['match', ['get', 'k'], 't', 'atlas_tourist_board', 'atlas_poi'],
                'icon-size': ['interpolate', ['linear'], ['zoom'], 6, 0.6, 10, 0.85],
                'icon-allow-overlap': true, 'icon-ignore-placement': true,
                'text-field': ['step', ['zoom'], '', 9, ['match', ['get', 'k'], 't', ['get', 'name'], ''], 11, ['get', 'name']],
                'text-size': 11, 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-optional': true },
      paint: { 'text-color': '#ffd166', 'text-halo-color': '#000', 'text-halo-width': 1 } },
    // minzoom 7 y no menos: el filtro de tippecanoe (tiles_light_filter.json)
    // solo guarda ciudades, paises, carreteras y las LINEAS de ferry por
    // debajo de z7; los puertos son type=poi y ahi se podan. Si algun dia se
    // regeneran los tiles con los puertos incluidos, bajar este numero.
    { id: 'ferry-poi', type: 'symbol', source: 'vec', 'source-layer': L, minzoom: 7,
      filter: ['in', ['get', 'poiType'], ['literal', ['ferry', 'train']]],
      layout: { 'icon-image': ['get', 'sprite'],
                'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 9, 0.8],
                'icon-allow-overlap': true, 'icon-ignore-placement': true } },
    // Escudos de ruta (roadShieldPoints en pure.js; solo ATS: los carteles de
    // ETS2 no traen el numero). Debajo de las salidas y las ciudades: con
    // poco lugar, MapLibre deja los de las capas de arriba. Las
    // interestatales antes que las US (symbol-sort-key).
    { id: 'road-shield', type: 'symbol', source: 'road-shields', minzoom: ROAD_SHIELD_MIN_ZOOM,
      layout: { 'icon-image': ['concat', 'road-shield:', ['get', 'label']], 'icon-padding': 6,
                'symbol-sort-key': ['match', ['get', 'k'], 'i', 0, 1] } },
    { id: 'exit-label', type: 'symbol', source: 'vec', 'source-layer': L, filter: ['==', ['get', 'type'], 'exit'], minzoom: 10,
      layout: { 'text-field': ['concat', 'Exit ', ['get', 'name']], 'text-size': 11 },
      paint: { 'text-color': '#ffd166', 'text-halo-color': '#000', 'text-halo-width': 1 } },
    { id: 'country-label', type: 'symbol', source: 'vec', 'source-layer': L, filter: ['==', ['get', 'type'], 'country'], maxzoom: 8,
      layout: { 'text-field': ['get', 'name'], 'text-size': 13 },
      paint: { 'text-color': '#9aa4b2', 'text-halo-color': '#000', 'text-halo-width': 1 } },
    { id: 'city-label', type: 'symbol', source: 'vec', 'source-layer': L, filter: ['==', ['get', 'type'], 'city'],
      layout: { 'text-field': ['get', 'name'], 'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 12, 15] },
      paint: { 'text-color': '#ffffff', 'text-halo-color': '#000', 'text-halo-width': 1.4 } },
  ];
}

// Se dibujan en este orden y todas van debajo de las capas del juego.
function buildBaseLayers() {
  return [
    { id: 'base-land', type: 'fill', source: 'base', filter: ['==', ['get', 'k'], 'land'],
      paint: { 'fill-color': MAP_BG_FLAT } },
    { id: 'base-urban', type: 'fill', source: 'base', filter: ['==', ['get', 'k'], 'urban'],
      paint: { 'fill-color': '#343a44' } },
    { id: 'base-lake', type: 'fill', source: 'base', filter: ['==', ['get', 'k'], 'lake'],
      paint: { 'fill-color': MAP_BG_WATER } },
    { id: 'base-river', type: 'line', source: 'base', filter: ['==', ['get', 'k'], 'river'],
      paint: { 'line-color': '#1e3350', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.4, 10, 2] } },
  ];
}

// Un mapa armado en la PC con un mod que cae donde la proyeccion no tiene
// tierra (Explorando a America en ATS, Discord 18-10, Paulo) se veia en el
// medio del mar al alejar. Se mide una vez por mapa armado (citiesOnLand,
// basemapFitsCities): si la mayoria de sus ciudades no esta en la tierra
// real, el fondo va liso como sin mapa base y quedan los lagos y los rios.
// Los mapas de R2 no se miden: sus ciudades estan en tierra (99 % en ATS,
// 95 a 98 % en ETS2).
const basemapFlatFor = {}; // variante|version del mapa -> true si el fondo va liso
async function measureLocalBasemap(game, name) {
  const key = `${game}|${MAP_DATA_VERSION[game] || ''}`;
  try {
    const res = await fetch(`${REMOTE_MAP_BASE}/basemap/${name}.geojson?v=${BASEMAP_VERSION}`);
    if (!res.ok) return;
    const geo = await res.json();
    if (game !== currentGame || !toLngLat || citiesMap !== GAME_MAPS[game]) return;
    const r = citiesOnLand(citiesAll.map(c => toLngLat(c.X, c.Y)), geo.features);
    basemapFlatFor[key] = !basemapFitsCities(r);
    if (basemapFlatFor[key]) applyBaseMap();
  } catch (err) {
    // sin medir: el fondo de siempre
  }
}

// Prende o apaga el mapa base sin recargar. Se llama al cargar un juego y
// cada vez que se toca el interruptor de Ajustes.
function applyBaseMap() {
  // mapReady y no isStyleLoaded(): al cargar un juego el estilo todavia
  // tiene tiles y sprites en vuelo, isStyleLoaded() da false y el mapa base
  // no se agregaba nunca.
  if (!map || !mapReady) return;
  for (const id of BASE_LAYER_IDS) { if (map.getLayer(id)) map.removeLayer(id); }
  if (map.getSource('base')) map.removeSource('base');
  const name = realBase && currentGame ? GAME_MAPS[currentGame]?.basemap : null;
  const key = `${currentGame}|${MAP_DATA_VERSION[currentGame] || ''}`;
  if (name && String(currentGame).startsWith('local_') && !(key in basemapFlatFor) && citiesMap === GAME_MAPS[currentGame]) {
    basemapFlatFor[key] = false;
    measureLocalBasemap(currentGame, name);
  }
  map.setPaintProperty('bg', 'background-color', name && !basemapFlatFor[key] ? MAP_BG_WATER : MAP_BG_FLAT);
  if (!name) return;
  map.addSource('base', { type: 'geojson', data: `${REMOTE_MAP_BASE}/basemap/${name}.geojson?v=${BASEMAP_VERSION}` });
  // Antes de 'mapArea' (la capa mas baja del juego) para que el mapa base
  // quede debajo de todo; si las capas del juego todavia no estan, antes del
  // trail, que es el ancla que usa el resto.
  const before = map.getLayer('mapArea') ? 'mapArea' : 'trail-line';
  for (const layer of buildBaseLayers()) {
    try { map.addLayer(layer, before); } catch (err) { console.error('No se pudo agregar la capa', layer.id, err); }
  }
}

// El cartel con el mapa/mods cargados aparece al cambiar de mapa y se apaga
// solo: sirve para confirmar que agarro la variante correcta, no para tenerlo
// encima del mini-HUD todo el viaje.
const MAP_HINT_VISIBLE_MS = 12000;
let mapHintTimer = null;
// Credito de los mods de mapa de una variante, como HTML con links a sus
// paginas oficiales ("Coast to Coast (Homburg)"). Los mapas con mods se usan
// con permiso o mientras se pide: el credito va siempre.
function modCreditHtml(modId) {
  const c = typeof MAP_MOD_CREDITS !== 'undefined' && MAP_MOD_CREDITS[modId];
  if (!c) return '';
  const nombre = escapeHtml(c.name) + (c.author ? ` (${escapeHtml(c.author)})` : '');
  return c.homepage ? `<a href="${escapeHtml(c.homepage)}" target="_blank" rel="noopener">${nombre}</a>` : nombre;
}

function variantCreditHtml(variant) {
  const meta = typeof VARIANT_META !== 'undefined' && VARIANT_META[variant];
  const mods = meta ? meta.mods.map(modCreditHtml).filter(Boolean) : [];
  return mods.length ? t('mapModsCredit').replace('{list}', mods.join(', ')) : '';
}

function renderModsCredits() {
  const el = document.getElementById('modsCredits');
  if (!el || typeof MAP_MOD_CREDITS === 'undefined') return;
  const todos = Object.keys(MAP_MOD_CREDITS).map(modCreditHtml).filter(Boolean);
  el.innerHTML = `${escapeHtml(t('modsCreditsTitle'))} ${todos.join(', ')}.`;
}

function showMapHint(label, variant) {
  const el = document.getElementById('mapHint');
  if (!el) return;
  if (label) {
    const credito = variant ? variantCreditHtml(variant) : '';
    el.innerHTML = escapeHtml(label) + (credito ? `<span class="mapHintCredit">${credito}</span>` : '');
  }
  el.classList.remove('faded');
  clearTimeout(mapHintTimer);
  mapHintTimer = setTimeout(() => el.classList.add('faded'), MAP_HINT_VISIBLE_MS);
}

// Botones del mapa: oscuros y/o desvanecidos mientras no se los toca. Las dos
// cosas son opt-in (Ajustes) y no cambian nada de la logica del mapa.
const BTN_IDLE_MS = 6000;
let btnIdleTimer = null;
function wakeButtons() {
  if (!fadeButtons) return;
  document.body.classList.remove('btnsIdle');
  clearTimeout(btnIdleTimer);
  btnIdleTimer = setTimeout(() => document.body.classList.add('btnsIdle'), BTN_IDLE_MS);
}
function applyButtonPrefs() {
  document.body.classList.toggle('darkBtns', darkButtons);
  document.body.classList.toggle('fadeBtns', fadeButtons);
  clearTimeout(btnIdleTimer);
  document.body.classList.remove('btnsIdle');
  if (fadeButtons) wakeButtons();
}
for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown']) {
  window.addEventListener(ev, wakeButtons, { passive: true });
}
applyButtonPrefs();

// --- Botones movibles -------------------------------------------------------
// Se puede mover cada boton por separado, o el grupo entero (la columna de la
// izquierda, o el par de la derecha) agarrandolo del asa que aparece mientras
// se acomodan. Lo que se mueve sale de su lugar en el flujo y pasa a colgar
// del mapa como absoluto; la posicion se guarda en % para que aguante rotar
// la pantalla o cambiar de tamano la ventana.
const BTN_GROUP_IDS = ['mapLeftControls', 'topRightBtns'];
// Cuanto hay que mover el dedo para que cuente como arrastre y no como toque.
const LAYOUT_DRAG_SLOP_PX = 5;
// Grilla de alineacion: pega las posiciones a multiplos de esto, asi dos
// botones puestos a ojo quedan en linea y con la misma separacion. Con 12 el
// margen para acertar la misma fila era de 6 px y dos botones dejados casi
// igual caian en celdas distintas; 16 da 8 px de margen y va mejor con
// botones de 44. Tiene que coincidir con el paso del degradado de app.css.
const LAYOUT_GRID_PX = 16;
// Los paneles del mapa se mueven igual que los botones. Se los agarra
// directamente (no tienen asa): son uno solo cada uno. La brujula tambien:
// va sola abajo a la derecha, fuera de la columna de botones.
const MOVABLE_PANEL_IDS = ['miniHud', 'miniHudExtra', 'navPanel', 'compassBtn'];
// Fuera de modo acomodar estos paneles aparecen y desaparecen segun lo que
// pase en el viaje; mientras se acomodan se muestran siempre, y los que se
// llenan en vivo llevan un texto de muestra para que se vea el tamano.
const PANEL_PLACEHOLDER = { navPanel: 'settingsGpsDirections', miniHudExtra: 'layoutExtras' };
const btnHome = new Map(); // id -> donde estaba, para el boton de restablecer

function movableButtonIds() {
  return BTN_GROUP_IDS.flatMap(id => {
    const g = document.getElementById(id);
    return g ? [...g.querySelectorAll('.mapBtn')].map(b => b.id).filter(Boolean) : [];
  });
}

// Los ids se juntan una sola vez, al arrancar: despues algunos botones ya no
// estan adentro del grupo (los que se movieron) y la lista quedaria coja.
let movableIds = null;
function allMovableIds() {
  if (!movableIds) movableIds = [...new Set([...movableButtonIds(), ...Object.keys(btnLayout.buttons)])];
  return movableIds;
}

function rememberHome(el) {
  if (!el || btnHome.has(el.id)) return;
  btnHome.set(el.id, { parent: el.parentNode, next: el.nextSibling });
}

function placeMoved(el, pos) {
  const panel = document.getElementById('mapPanel');
  if (!panel || !el) return;
  if (el.parentNode !== panel) panel.appendChild(el);
  el.classList.add('moved');
  Object.assign(el.style, layoutCss(pos));
  el.style.scale = pos.s && pos.s !== 1 ? String(pos.s) : '';
}

// Para acomodarlo se vuelve a medir desde arriba a la izquierda (lo que usan
// el arrastre y el cambio de tamano); al soltarlo, saveLayoutOf lo ancla de
// nuevo al borde mas cercano.
function layoutFromTopLeft(el, panel) {
  if (!el.classList.contains('moved')) return;
  const box = el.getBoundingClientRect();
  const area = panel.getBoundingClientRect();
  el.style.left = `${((box.left - area.left) / area.width) * 100}%`;
  el.style.top = `${((box.top - area.top) / area.height) * 100}%`;
  el.style.right = el.style.bottom = 'auto';
  el.style.transformOrigin = '';
}

function layoutBucket(id) {
  if (BTN_GROUP_IDS.includes(id)) return btnLayout.groups;
  if (MOVABLE_PANEL_IDS.includes(id)) return btnLayout.panels;
  return btnLayout.buttons;
}

function applyBtnLayout() {
  if (!document.getElementById('mapPanel')) return;
  for (const id of [...BTN_GROUP_IDS, ...MOVABLE_PANEL_IDS, ...allMovableIds()]) {
    rememberHome(document.getElementById(id));
  }
  for (const part of [btnLayout.groups, btnLayout.buttons, btnLayout.panels]) {
    for (const [id, pos] of Object.entries(part)) placeMoved(document.getElementById(id), pos);
  }
  placeMiniHudExtra();
}

// Los datos extra (combustible, autonomia, ETA) van debajo de la velocidad.
// Si la velocidad tiene lugar propio y los extras no, se van con ella: si se
// quedaban en la pila de abajo a la derecha, caian justo debajo del mini-HUD
// que alguien habia llevado a ese rincon y se leian los dos encimados.
function placeMiniHudExtra() {
  const hud = document.getElementById('miniHud');
  const extra = document.getElementById('miniHudExtra');
  if (!hud || !extra || extra.classList.contains('moved')) return;
  const target = hud.classList.contains('moved') ? hud : document.getElementById('bottomRightHud');
  if (target && extra.parentElement !== target) target.appendChild(extra);
}

function resetBtnLayout() {
  btnLayout = { groups: {}, buttons: {}, panels: {} };
  saveSettings();
  // De adentro hacia afuera: si se devolviera primero el grupo, los botones
  // que volvieran despues entrarian en un padre que ya se movio.
  for (const id of [...allMovableIds(), ...MOVABLE_PANEL_IDS, ...BTN_GROUP_IDS]) {
    const el = document.getElementById(id);
    const home = btnHome.get(id);
    if (!el || !home) continue;
    el.classList.remove('moved');
    el.style.left = el.style.top = el.style.right = el.style.bottom = el.style.scale = el.style.transformOrigin = '';
    home.parent.insertBefore(el, home.next);
  }
  placeMiniHud();
}

// Los paneles y los botones sueltos cambian de tamano agarrados de la
// esquina de abajo a la derecha (marcada con un triangulo): no pueden llevar
// una manija propia porque el tick de telemetria les reescribe el contenido.
// Los grupos tienen la suya al lado de la de mover.
const LAYOUT_RESIZE_CORNER_PX = 22;

function resizableByCorner(el) {
  return MOVABLE_PANEL_IDS.includes(el.id) || (el.classList.contains('mapBtn') && el.classList.contains('moved'));
}

function inResizeCorner(el, ev) {
  const r = el.getBoundingClientRect();
  const c = layoutResizeCornerPx(r.width, r.height, LAYOUT_RESIZE_CORNER_PX);
  return ev.clientX > r.right - c && ev.clientY > r.bottom - c;
}

// Mientras se acomoda, un elemento se saca de su lugar la primera vez que se
// lo arrastra o se le cambia el tamano: queda suelto sobre el mapa, en el
// mismo lugar donde estaba. Agrandado adentro de su pila se encimaria con
// los vecinos; suelto crece desde su esquina de arriba a la izquierda.
function detachForLayout(el, panel) {
  if (el.classList.contains('moved')) return;
  const box = el.getBoundingClientRect();
  const area = panel.getBoundingClientRect();
  if (el.parentNode !== panel) panel.appendChild(el);
  el.classList.add('moved');
  el.style.left = `${((box.left - area.left) / area.width) * 100}%`;
  el.style.top = `${((box.top - area.top) / area.height) * 100}%`;
  el.style.right = 'auto';
  el.style.bottom = 'auto';
  placeMiniHudExtra();
}

function saveLayoutOf(el) {
  const panel = document.getElementById('mapPanel');
  if (!panel || !isFinite(parseFloat(el.style.left)) || !isFinite(parseFloat(el.style.top))) return;
  const box = el.getBoundingClientRect(), area = panel.getBoundingClientRect();
  if (!(area.width > 0) || !(area.height > 0)) return;
  const s = parseFloat(el.style.scale);
  const pos = layoutAnchor(box, area);
  if (isFinite(s) && s !== 1) pos.s = s;
  layoutBucket(el.id)[el.id] = pos;
  placeMoved(el, pos);
  saveSettings();
}

function startLayoutResize(el, ev) {
  const panel = document.getElementById('mapPanel');
  if (!panel) return;
  ev.preventDefault();
  ev.stopPropagation();
  const target = ev.currentTarget;
  // Primero sacarlo de su lugar y despues capturar: mover el nodo suelta la
  // captura (ver startLayoutDrag).
  layoutFromTopLeft(el, panel);
  detachForLayout(el, panel);
  target.setPointerCapture(ev.pointerId);
  const box = el.getBoundingClientRect();
  const area = panel.getBoundingClientRect();
  const startScale = parseFloat(el.style.scale) || 1;
  const from = { x: ev.clientX, y: ev.clientY };
  const move = (e) => {
    const s = layoutScaleFor({
      startScale, startWidth: box.width, startHeight: box.height,
      dx: e.clientX - from.x, dy: e.clientY - from.y,
      maxWidth: area.right - box.left, maxHeight: area.bottom - box.top, snap: layoutGrid,
    });
    el.style.scale = s === 1 ? '' : String(s);
  };
  const up = () => {
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', up);
    target.removeEventListener('pointercancel', up);
    saveLayoutOf(el);
  };
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', up);
}

function startGroupResize(ev) {
  startLayoutResize(ev.currentTarget.parentNode, ev);
}

function startLayoutDrag(ev) {
  const el = ev.currentTarget.classList.contains('layoutGrip')
    ? ev.currentTarget.parentNode
    : ev.currentTarget;
  const panel = document.getElementById('mapPanel');
  if (!panel) return;
  if (resizableByCorner(el) && inResizeCorner(el, ev)) {
    startLayoutResize(el, ev);
    return;
  }
  ev.preventDefault();
  ev.stopPropagation();
  layoutFromTopLeft(el, panel);
  const box = el.getBoundingClientRect();
  const area = panel.getBoundingClientRect();
  const grabX = ev.clientX - box.left;
  const grabY = ev.clientY - box.top;
  const target = ev.currentTarget;
  const from = { x: ev.clientX, y: ev.clientY };
  // Nada se saca de su lugar hasta que el dedo se mueve de verdad: al
  // hacerlo en el pointerdown, un simple toque dejaba al boton absoluto sin
  // left/top, que es la esquina de abajo a la izquierda del mapa, y encima
  // guardaba NaN.
  let dragging = false;
  target.setPointerCapture(ev.pointerId);

  const place = (e) => {
    const maxX = Math.max(0, area.width - box.width);
    const maxY = Math.max(0, area.height - box.height);
    let x = e.clientX - area.left - grabX;
    let y = e.clientY - area.top - grabY;
    if (layoutGrid) {
      x = Math.round(x / LAYOUT_GRID_PX) * LAYOUT_GRID_PX;
      y = Math.round(y / LAYOUT_GRID_PX) * LAYOUT_GRID_PX;
    }
    // Clavado adentro del mapa: si se pudiera soltar afuera, quedaria
    // inalcanzable y solo se recuperaria con Restablecer.
    x = Math.min(Math.max(x, 0), maxX);
    y = Math.min(Math.max(y, 0), maxY);
    el.style.left = `${(x / area.width) * 100}%`;
    el.style.top = `${(y / area.height) * 100}%`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  };

  const move = (e) => {
    if (!dragging) {
      if (Math.hypot(e.clientX - from.x, e.clientY - from.y) < LAYOUT_DRAG_SLOP_PX) return;
      dragging = true;
      if (el.parentNode !== panel) {
        panel.appendChild(el);
        // Mover el nodo le saca la captura del puntero: al soltar con el
        // dedo fuera del panel (llevado contra el borde, donde se frena) el
        // pointerup no llegaba y la posicion no se guardaba.
        try { target.setPointerCapture(e.pointerId); } catch (err) { /* ya no esta apretado */ }
      }
      el.classList.add('moved');
      placeMiniHudExtra();
    }
    place(e);
  };
  const up = () => {
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', up);
    target.removeEventListener('pointercancel', up);
    if (!dragging) return; // fue un toque, no se movio nada
    saveLayoutOf(el); // con el tamano que ya tenia
  };
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', up);
}

// Mientras se acomodan, tocar un boton no tiene que disparar su accion.
function swallowClick(e) {
  if (e.target.closest('#layoutBar')) return;
  if (e.target.closest('.mapBtn') || e.target.closest('.layoutGrip') || e.target.closest('.movable')) {
    e.preventDefault();
    e.stopPropagation();
  }
}

function applyLayoutGrid() {
  document.body.classList.toggle('layoutGridOn', layoutGrid);
  const chk = document.getElementById('layoutGridChk');
  if (chk) chk.checked = layoutGrid;
}

function setLayoutEdit(on) {
  document.body.classList.toggle('editLayout', on);
  // En el telefono el mapa cambia de tamano al entrar y salir (app.css).
  setTimeout(() => { if (map) map.resize(); }, 50);
  if (on) applyLayoutGrid();
  document.getElementById('layoutBar').style.display = on ? 'flex' : 'none';
  document.removeEventListener('click', swallowClick, true);
  if (on) document.addEventListener('click', swallowClick, true);

  for (const id of BTN_GROUP_IDS) {
    const group = document.getElementById(id);
    if (!group) continue;
    rememberHome(group);
    let grip = group.querySelector(':scope > .layoutGrip');
    let resize = group.querySelector(':scope > .layoutResize');
    if (on && !grip) {
      grip = document.createElement('div');
      grip.className = 'layoutGrip';
      grip.textContent = '⠿';
      group.insertBefore(grip, group.firstChild);
      grip.addEventListener('pointerdown', startLayoutDrag);
      resize = document.createElement('div');
      resize.className = 'layoutGrip layoutResize';
      resize.textContent = '⤡';
      resize.title = t('layoutResize');
      grip.after(resize);
      resize.addEventListener('pointerdown', startGroupResize);
    } else if (!on && grip) {
      grip.remove();
      if (resize) resize.remove();
    }
  }
  for (const id of [...allMovableIds(), ...MOVABLE_PANEL_IDS]) {
    const el = document.getElementById(id);
    if (!el) continue;
    rememberHome(el);
    el.classList.toggle('movable', on);
    if (on) el.addEventListener('pointerdown', startLayoutDrag);
    else el.removeEventListener('pointerdown', startLayoutDrag);
  }
  for (const [id, key] of Object.entries(PANEL_PLACEHOLDER)) {
    const el = document.getElementById(id);
    if (!el) continue;
    // Por atributo y no como texto: el tick de telemetria reescribe el
    // contenido de estos paneles y se comia el texto de muestra.
    if (on) el.dataset.placeholder = t(key);
    else delete el.dataset.placeholder;
  }
  if (on) wakeButtons();
}
applyBtnLayout();

// En pantalla tactil, mantener apretado cualquiera de estas cosas abre el modo
// acomodar: en el telefono no hay forma de adivinar que se pueden mover, y
// Ajustes queda lejos. Con mouse no: ahi el menu ya esta a mano y un click
// largo sin querer seria una sorpresa.
const LONG_PRESS_MS = 600;
const LONG_PRESS_SLOP_PX = 10;
const LONG_PRESS_SELECTOR = '#mapPanel .mapBtn, #miniHud, #miniHudExtra, #navPanel';
let longPressTimer = null;
let longPressFrom = null;

function cancelLongPress() {
  clearTimeout(longPressTimer);
  longPressTimer = null;
  longPressFrom = null;
}

document.addEventListener('pointerdown', (ev) => {
  if (ev.pointerType === 'mouse' || document.body.classList.contains('editLayout')) return;
  if (!ev.target.closest || !ev.target.closest(LONG_PRESS_SELECTOR)) return;
  longPressFrom = { x: ev.clientX, y: ev.clientY };
  clearTimeout(longPressTimer);
  longPressTimer = setTimeout(() => {
    cancelLongPress();
    setLayoutEdit(true);
    // El click que viene al soltar lo come swallowClick, asi que abrir el
    // modo no dispara ademas la accion del boton.
    navigator.vibrate?.(30);
  }, LONG_PRESS_MS);
}, true);

document.addEventListener('pointermove', (ev) => {
  if (!longPressFrom) return;
  if (Math.hypot(ev.clientX - longPressFrom.x, ev.clientY - longPressFrom.y) > LONG_PRESS_SLOP_PX) cancelLongPress();
}, true);
for (const ev of ['pointerup', 'pointercancel']) document.addEventListener(ev, cancelLongPress, true);

// Sin WebGL MapLibre no puede crear el mapa (LibreWolf lo trae apagado, y
// algunas configuraciones de privacidad tambien). La telemetria igual llega
// y el resto del tablero funciona: se avisa una vez, en el lugar del mapa, y
// no se reintenta en cada dato.
let mapUnavailable = false;
function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch (err) {
    return false;
  }
}
function showNoWebgl(err) {
  mapUnavailable = true;
  if (err) console.error('No se pudo crear el mapa', err);
  document.getElementById('mapNoWebgl').hidden = false;
  document.getElementById('mapHint').hidden = true;
  setMapLoading(null);
}

// Los glifos (las letras de los nombres del mapa) de los rangos que usan las
// ciudades y paises de todas las variantes salen del propio sitio
// (vendor/glyphs-open-sans-omt2: Open Sans de OpenMapTiles, los mismos bytes
// que demotiles da para esos rangos). Asi no dependen de un servidor de
// demostracion y el modo LAN sin internet tiene nombres (auditoria del
// 12-10). Un rango que no esta (georgiano: Open Sans no lo trae) sigue
// saliendo de demotiles, que lo completa con Arial Unicode.
const LOCAL_GLYPH_RANGES = new Set(['0-255', '256-511', '512-767', '768-1023', '1024-1279', '7680-7935', '8192-8447']);
function localGlyphs(url, resourceType) {
  if (resourceType !== 'Glyphs') return undefined;
  const m = /\/font\/([^/]+)\/(\d+-\d+)\.pbf/.exec(url);
  // Solo la tipografia por defecto de MapLibre, que es la que usan las capas
  if (!m || !decodeURIComponent(m[1]).startsWith('Open Sans Regular') || !LOCAL_GLYPH_RANGES.has(m[2])) return undefined;
  return { url: new URL(`vendor/glyphs-open-sans-omt2/${m[2]}.pbf`, location.href).href };
}

function ensureMapInitialized() {
  if (map || mapUnavailable) return;
  if (!webglAvailable()) { showNoWebgl(); return; }
  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);
  try {
    map = new maplibregl.Map({
    container: 'mapCanvas',
    style: {
      version: 8,
      // Sin esto, MapLibre no puede resolver los glifos de texto y CUALQUIER
      // capa 'symbol' (poi/exit/city/country) tira error al agregarse - eso
      // ademas cortaba en seco el loop de addLayer y se perdian todas las
      // capas de texto de una. Host publico oficial de MapLibre para fuentes basicas;
      // los rangos que usan los nombres salen de vendor/ (ver localGlyphs).
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      sources: {},
      layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#2b2f36' } }],
    },
    center: [0, 20],
    zoom: 1,
    attributionControl: false,
    transformRequest: localGlyphs,
    // Sin fundido de etiquetas: con la camara siguiendo al camion todo el
    // tiempo, cada movimiento reubica los carteles y el fundido de 300 ms no
    // terminaba nunca, asi que MapLibre se seguia pidiendo cuadros a 60 por
    // segundo aunque la camara ya fuera a 30 (ver FRAME_MIN_MS).
    fadeDuration: 0,
    // Lite: pintar a 1x en pantallas de alta densidad (hasta 4x menos pixeles).
    pixelRatio: liteMode ? 1 : undefined,
    maxZoom: liteMode ? 15 : undefined,
    });
  } catch (err) {
    map = null;
    showNoWebgl(err);
    return;
  }
  if (cabMode) applyCabScale(); // la densidad del mapa estirado
  // Mientras haya un dedo o el mouse apretado sobre el mapa, la camara que
  // sigue al camion no se mueve (ver mapGestureActive).
  const mapCanvas = map.getCanvasContainer();
  mapCanvas.addEventListener('pointerdown', (e) => mapPointersDown.add(e.pointerId), true);
  mapCanvas.addEventListener('wheel', () => { mapWheelUntil = performance.now() + 300; }, { capture: true, passive: true });
  for (const type of ['pointerup', 'pointercancel']) {
    window.addEventListener(type, (e) => mapPointersDown.delete(e.pointerId), true);
  }
  window.addEventListener('blur', () => mapPointersDown.clear());
  map.on('dragstart', pauseMapFollow);
  map.on('dragend', scheduleMapFollow);
  map.on('moveend', scheduleMapFollow);
  map.on('rotatestart', (e) => { if (e.originalEvent) pauseMapFollow(); });
  map.on('rotateend', (e) => { if (e.originalEvent) scheduleMapFollow(); });
  map.on('zoom', updateTruckArrowSize);
  map.on('rotate', updateCompass);
  map.on('styleimagemissing', loadMissingCompanyIcon);
  // Si el usuario zoomea a mano en modo navegacion, dejamos de forzar el
  // zoom dinamico (si no, el proximo tick lo pisa y parece que "no se puede
  // tocar") - se reactiva con el boton de recentrar. originalEvent solo esta
  // presente cuando el zoom lo dispara una interaccion real (rueda/pellizco/
  // doble click), no nuestros propios easeTo/jumpTo programaticos.
  map.on('zoomstart', (e) => { if (e.originalEvent) { navAutoZoomPaused = true; pauseMapFollow(); } });
  map.on('zoomend', (e) => { if (e.originalEvent) scheduleMapFollow(); });
  map.on('click', (e) => {
    if (!waypointMode || !fromLngLat) return;
    pendingWaypoint = { lngLat: [e.lngLat.lng, e.lngLat.lat], pos: fromLngLat(e.lngLat.lng, e.lngLat.lat), label: null };
    setWaypointMode(false);
    document.getElementById('waypointModal').style.display = 'flex';
  });
  map.once('load', async () => {
    await loadPoiIcons();
    mapReady = true;
    map.addSource('trail', { type: 'geojson', data: emptyLineString() });
    map.addSource('atlas', { type: 'geojson', data: atlasGeoJson(null) });
    map.addSource('car-parking', { type: 'geojson', data: atlasGeoJson(null) });
    map.addSource('fuel', { type: 'geojson', data: atlasGeoJson(null) });
    map.addSource('road-shields', { type: 'geojson', data: atlasGeoJson(null) });
    map.addLayer({ id: 'trail-line', type: 'line', source: 'trail', paint: { 'line-color': '#3b9eff', 'line-width': 3, 'line-opacity': 0.7 } });
    // La ruta crece con el zoom como las calles, pero siempre un poco mas
    // ancha que la autopista mas ancha (road-freeway: 1 / 3,5 / 10 px a zoom
    // 5 / 12 / 17), asi la tapa en vez de ir como una raya por el medio:
    // "no sigue la calle tan claro como el GPS del juego" (Reddit, 29-09-2026).
    // Antes era un ancho fijo de 3,5 px. El borde es oscuro para que se
    // recorte sobre cualquier color de calle; el claro se perdia sobre las
    // grises.
    map.addSource('route', { type: 'geojson', data: emptyLineString() });
    if (!liteMode) map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0d0f12', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 5.5, 12, 9, 17, 18], 'line-opacity': 0.8 } });
    map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': routeColor, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 3, 12, 5.5, 17, 13], 'line-opacity': 0.95 } });
    // Tramos DESPUES del primer waypoint (waypoint -> destino del trabajo):
    // punteados y mas tenues, para que se distingan de "como llego al
    // waypoint" - si no, la vuelta que hay que dar despues de un area de
    // descanso parecia una ruta absurda hacia el waypoint.
    map.addSource('route-next', { type: 'geojson', data: emptyLineString() });
    if (!liteMode) map.addLayer({ id: 'route-next-casing', type: 'line', source: 'route-next', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0d0f12', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 4.5, 12, 7.5, 17, 15], 'line-opacity': 0.5 } });
    map.addLayer({ id: 'route-next-line', type: 'line', source: 'route-next', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': routeColor, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 2.5, 12, 4.5, 17, 11], 'line-opacity': 0.6, 'line-dasharray': [2, 1.5] } });
    map.addSource('route-ferry', { type: 'geojson', data: emptyLineString() });
    map.addLayer({ id: 'route-ferry-line', type: 'line', source: 'route-ferry', paint: { 'line-color': '#3b9eff', 'line-width': 3, 'line-opacity': 0.9, 'line-dasharray': [1.5, 2] } });
    if (pendingGame) { const g = pendingGame; pendingGame = null; loadGameMap(g); }
  });
}

// Iconos reales del juego (extraidos por el parser, mismos que usaba el mapa
// raster viejo) para los POIs - emoji como texto no funciona porque la fuente
// de glifos que usamos (demotiles.maplibre.org) no tiene emoji, solo texto
// normal (por eso los labels de ciudad si andaban pero los POIs no).
// El campo "sprite" del dato trae cientos de tokens distintos (carteles de
// ruta, iconos de empresas individuales, etc.) - solo cargamos los que nos
// interesan mostrar como POI generico.
// Ojo con los tokens duplicados: el juego usa dos nombres para la bascula
// (weigh_station_ico y weigh_ico) y les dibuja el mismo icono. Con uno solo
// aca, dos tercios de las basculas de ETS2 no se veian. Mismo patron que
// tenian los puertos de ferry.
const POI_ICONS = ['gas_ico', 'service_ico', 'weigh_station_ico', 'weigh_ico', 'parking_ico', 'toll_ico', 'garage_large_ico', 'dealer_ico', 'recruitment_ico', 'viewpoint',
  // Fronteras (159 en ETS2, donde importan bastante) y miradores con foto,
  // que son lugares DISTINTOS de los 'viewpoint': de 186, solo 2 coinciden.
  'border_ico', 'photo_sight_captured'];
// Puertos de ferry y terminales de tren. Van en su propia capa (ferry-poi),
// pero la imagen se carga por el mismo camino que las demas.
const FERRY_ICONS = ['port_overlay', 'train_ico'];
// En auto, sin los estacionamientos de camion (parking_ico): no se pueden usar.
let drivingCar = false;
// Los POIs de la variante separan los surtidores solo para auto ('f'): el
// combustible del mapa sale de ahi (capa 'fuel') y no de los gas_ico de los
// tiles. Con datos viejos o de un mod sin esa separacion, como antes.
let fuelFromPois = false;
function poiLayerFilter() {
  const sprites = POI_ICONS.filter(n => !(drivingCar && n === 'parking_ico') && !(fuelFromPois && n === 'gas_ico'));
  return ['all', ['==', ['get', 'type'], 'poi'], ['in', ['get', 'sprite'], ['literal', sprites]], ['!', ['in', ['get', 'poiType'], ['literal', ['ferry', 'train']]]]];
}
// En camion, sin los surtidores de auto (facilityCodesFor en pure.js).
function applyFuelSource() {
  if (!map) return;
  const src = map.getSource('fuel');
  if (src) {
    const codes = facilityCodesFor('g', drivingCar);
    src.setData(atlasGeoJson(fuelFromPois && pois ? pois.facilities.filter(f => codes.includes(f[2])) : null));
  }
  if (map.getLayer('poi')) map.setFilter('poi', poiLayerFilter());
}
function applyVehicleMode() {
  if (!map) return;
  applyFuelSource();
  if (map.getLayer('car-parking')) map.setLayoutProperty('car-parking', 'visibility', drivingCar ? 'visible' : 'none');
  if (document.getElementById('poiModal').style.display === 'flex') renderPoiResults();
}
// Iconos del Atlas: los SDF del juego (material/ui/map/tourist_board_completed
// y point_of_interest_discovered) pasados a PNG con los colores de su .mat.
const ATLAS_ICONS = ['atlas_tourist_board', 'atlas_poi', 'car_parking'];
const POI_ICON_BASE = `${REMOTE_MAP_BASE}/vector/icons`;

async function loadPoiIcons() {
  for (const name of POI_ICONS.concat(FERRY_ICONS, ATLAS_ICONS)) {
    if (map.hasImage(name)) continue;
    try {
      const res = await map.loadImage(`${POI_ICON_BASE}/${name}.png`);
      map.addImage(name, res.data);
    } catch (err) {
      console.error('No se pudo cargar el icono de POI', name, err);
    }
  }
}

// Logos de las empresas (128x32, con el borde blanco que les pone el juego),
// en R2 desde build_company_icons.py del taller. Son unos 500 entre los dos
// juegos y en una ciudad se ven diez: se piden de a uno cuando MapLibre avisa
// que la capa 'company' necesita uno. Un mapa armado en la PC (1.5.32+) trae
// los suyos, con los de sus mods (companyIconsBase, ver applyLocalMaps). Si
// no esta en ningun lado queda sin dibujar, nunca con un icono generico.
// Subir COMPANY_ICONS_REV si se agregan o cambian: Cloudflare guarda los 404.
const COMPANY_ICONS_REV = '1';
// Los que ya se pidieron en este mapa: uno que no se encontro se vuelve a
// buscar al cambiar de mapa (puede ser uno armado que si lo trae).
const companyIconsAsked = new Set();
function companyIconSources(token) {
  const local = (GAME_MAPS[currentGame] || {}).companyIconsBase;
  return companyIconUrls(token, local, `${REMOTE_MAP_BASE}/vector/company-icons`, COMPANY_ICONS_REV);
}
// En la lista del buscador, el mismo logo en vez del 🏭 de antes. Las otras
// fuentes van en data-fallback (ver renderPoiResults); si ninguna carga,
// queda el hueco y no un icono generico.
function companyLogoHtml(token) {
  const ok = token && companyIconToken(COMPANY_ICON_PREFIX + token);
  const urls = ok ? companyIconSources(ok) : [];
  return `<span class="poiIcon poiLogo">${urls.length ? `<img src="${urls[0]}" data-fallback="${urls.slice(1).join(' ')}" alt="" loading="lazy">` : ''}</span>`;
}
async function loadMissingCompanyIcon(e) {
  const token = companyIconToken(e.id);
  if (!token || companyIconsAsked.has(e.id)) return;
  companyIconsAsked.add(e.id);
  for (const url of companyIconSources(token)) {
    try {
      const res = await map.loadImage(url);
      if (!map.hasImage(e.id)) map.addImage(e.id, res.data);
      return;
    } catch (err) {
      // la siguiente fuente
    }
  }
}

async function loadCities(mapInfo) {
  citiesMap = null;
  try {
    const res = await fetch(`${mapInfo.assetsDir}/Cities.json?v=${MAP_DATA_VERSION[currentGame] || ''}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = await res.json();
    citiesByName = {};
    citiesByToken = {};
    citiesAll = list;
    citiesMap = mapInfo;
    mapBounds = mapBoundsFromCities(list);
    for (const c of list) {
      if (!citiesByName[c.Name]) citiesByName[c.Name] = c;
      // Nombre nativo (ej. "Москва" ademas de "Moscow"): la telemetria manda
      // el nombre en el idioma del juego del jugador, asi que se acepta
      // cualquiera de los dos; el mapa muestra siempre c.Name.
      if (c.Native && !citiesByName[c.Native]) citiesByName[c.Native] = c;
      if (c.Token) citiesByToken[c.Token] = c;
    }
  } catch (err) {
    citiesByName = {};
    citiesByToken = {};
    citiesAll = [];
    mapBounds = null;
  }
}
// Ciudad por id del juego (cityDstId/citySrcId de la telemetria) y si no por
// nombre: el id no depende del idioma, el nombre si.
function findCity(id, name) {
  const porToken = id && citiesByToken[id];
  if (porToken) return porToken;
  if (!name) return null;
  // Buscar por nombre es el camino degradado (el id no matcheo), y ademas
  // puede ser ambiguo: en ATS hay 8 nombres repetidos. Entre varias con el
  // mismo nombre se elige la mas cercana al camion, que es lo mejor que se
  // puede hacer sin el id. OJO: para un destino lejano puede errarle; por
  // eso el id siempre manda.
  const candidatas = citiesAll.filter(c => c.Name === name || c.Native === name);
  if (candidatas.length <= 1) return candidatas[0] || citiesByName[name] || null;
  const ref = lastWorldPos;
  if (!ref) return candidatas[0];
  let mejor = candidatas[0];
  let mejorDist = Infinity;
  for (const c of candidatas) {
    const d = Math.hypot(c.X - ref.x, c.Y - ref.z);
    if (d < mejorDist) { mejorDist = d; mejor = c; }
  }
  return mejor;
}

// Nombres reales extraidos de los carteles del juego (ver extract_road_names.py
// para ATS - escudos de ruta US-75/I-70 - y extract_road_names_ets2.py para
// ETS2 - nombres de ciudad/cruce, ya que ahi el numero de ruta no tiene un
// patron de sprite reutilizable como en ATS). Opcional: si el archivo no
// existe para el mapa actual, roadNames queda vacio y las indicaciones GPS
// vuelven al texto generico de siempre.
let roadNames = []; // [{x, y, label, kind: 'road'|'city'}, ...] en coordenadas de juego

async function loadRoadNames(mapInfo) {
  roadNames = [];
  const game = currentGame; // como el grafo: el que llega tarde no pisa otra variante
  try {
    const res = await fetch(`${mapInfo.assetsDir}/road-names.json?v=${MAP_DATA_VERSION[currentGame] || ''}`, { priority: 'low' });
    if (!res.ok) return;
    const nombres = groupSignsByPoint(await res.json());
    if (currentGame === game) roadNames = nombres;
  } catch (err) {
    if (currentGame === game) roadNames = [];
  } finally {
    if (currentGame === game) setRoadShieldData();
  }
}

// Escudos de ruta en el mapa (capa 'road-shield'): uno por ruta cada
// ROAD_SHIELD_CELL_M, desde ROAD_SHIELD_MIN_ZOOM (Discord, 19-10: "todas las
// rutas parecen lineas"). Con roadNames vacio (lite, ETS2, mapa armado en la
// PC sin road-names.json) no queda ninguno.
const ROAD_SHIELD_CELL_M = 4000;
const ROAD_SHIELD_MIN_ZOOM = 8;
function setRoadShieldData() {
  const src = map && map.getSource('road-shields');
  if (!src || !toLngLat) return;
  const escudos = roadShieldPoints(roadNames, ROAD_SHIELD_CELL_M);
  for (const e of escudos) addRoadShieldImage(e.label, e.k, e.n);
  src.setData({ type: 'FeatureCollection', features: escudos.map(e => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: toLngLat(e.x, e.y) }, properties: { label: e.label, k: e.k } })) });
}

// Un escudo como los de la ruta, con el numero adentro (dibujado aca, una
// imagen por ruta: no depende de las fuentes del mapa ni de otro archivo).
// Interestatal: franja roja arriba, azul abajo, borde y numero blancos. US:
// blanco con borde y numero negros. Con tres cifras, mas ancho.
function addRoadShieldImage(label, k, n) {
  const nombre = `road-shield:${label}`;
  if (!map || map.hasImage(nombre)) return;
  try {
    const W = n.length >= 3 ? 52 : 44, H = 46, m = 2, b = 3; // pixeles de la imagen (pixelRatio 2)
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    // Arriba una curva hacia adentro, los costados que se abren un poco y la
    // punta redondeada abajo.
    const escudo = (x, y, w, h) => {
      g.beginPath();
      g.moveTo(x, y + h * 0.1);
      g.quadraticCurveTo(x + w * 0.5, y + h * 0.22, x + w, y + h * 0.1);
      g.bezierCurveTo(x + w * 1.03, y + h * 0.5, x + w * 0.9, y + h * 0.8, x + w * 0.5, y + h);
      g.bezierCurveTo(x + w * 0.1, y + h * 0.8, x - w * 0.03, y + h * 0.5, x, y + h * 0.1);
      g.closePath();
    };
    const iw = W - 2 * (m + b), ih = H - 2 * (m + b);
    const inter = k === 'i';
    g.fillStyle = inter ? '#ffffff' : '#111111';
    escudo(m, m, W - 2 * m, H - 2 * m);
    g.fill();
    g.save();
    escudo(m + b, m + b, iw, ih);
    g.clip();
    g.fillStyle = inter ? '#1f4fb4' : '#ffffff';
    g.fillRect(0, 0, W, H);
    if (inter) {
      g.fillStyle = '#c8202f';
      g.fillRect(0, 0, W, m + b + ih * 0.32);
    }
    g.restore();
    g.fillStyle = inter ? '#ffffff' : '#111111';
    g.font = `bold ${n.length >= 3 ? 17 : 20}px Arial, Helvetica, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(n, W / 2, m + b + ih * (inter ? 0.64 : 0.55));
    map.addImage(nombre, g.getImageData(0, 0, W, H), { pixelRatio: 2 });
  } catch (err) {
    console.error('No se pudo dibujar el escudo de ruta', label, err);
  }
}

// Busca el cartel de ruta mas cercano a (x,z) dentro de maxDist metros -
// se usa para etiquetar el tramo al que se esta por girar. Es un scan lineal
// (varios miles de carteles) pero solo se llama una vez por tick de nav, asi
// que el costo es despreciable.
// Ruta actual: el nombre de ruta (I-80, A9, E45...) de los carteles cercanos
// que mas se repite en los ultimos segundos - un solo cartel puede ser de
// otra ruta (salida, cruce), la moda sobre una ventana es estable.
const ROAD_BADGE_RADIUS_M = 250;
const roadBadgeSamples = [];
let currentRoadLabel = null;
function updateCurrentRoad(x, z) {
  const sign = nearestRoadName(x, z, ROAD_BADGE_RADIUS_M);
  roadBadgeSamples.push(sign && sign.kind === 'road' ? sign.label : null);
  if (roadBadgeSamples.length > 12) roadBadgeSamples.shift();
  const counts = new Map();
  for (const l of roadBadgeSamples) if (l) counts.set(l, (counts.get(l) || 0) + 1);
  let best = null, bestN = 0;
  for (const [l, n] of counts) if (n > bestN) { best = l; bestN = n; }
  const label = bestN >= 3 ? best : null;
  if (label !== currentRoadLabel) {
    currentRoadLabel = label;
    for (const id of ['roadBadge', 'miniRoadBadge']) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.textContent = label || '';
      el.style.display = label ? '' : 'none';
    }
  }
}

// Con grilla (buildPointGrid en pure.js), que se rearma al cambiar de mapa:
// la busqueda lineal recorria los 17-54 mil carteles en cada llamada.
// ok(cartel): solo los que cumplen (roadSignForTurn).
let roadNameGrid = null, roadNameGridOf = null;
function nearestRoadName(x, z, maxDist, ok = null) {
  if (roadNameGridOf !== roadNames) { roadNameGrid = buildPointGrid(roadNames, 500); roadNameGridOf = roadNames; }
  return nearestInGrid(roadNameGrid, x, z, maxDist, ok); // { x, y, label, kind: 'road'|'city' } o null
}

// Grafo de rutas (roads + prefabs) preprocesado con build_route_graph.py a partir
// del output de truckermudgeon/maps. nodes: [[x,y], ...], edges: [[fromIdx, toIdx, weight], ...]
let routeGraph = null; // typed arrays + CSR, ver buildRouteGraph()
// La ruta actual pasa por un DLC destildado porque no hay otro camino.
let routeUsesUncheckedDlc = false;
let currentRouteTarget = null; // cityDst actual, para saber cuando recalcular
// Sin destino en la app: por que (noRouteReason) y los km de la ruta del GPS
// del juego, para decirlo en vez de "No destination set". Los pone
// updateDestinationMarker en cada dato.
let noRouteNow = null;
let gameRouteKmNow = 0;
let currentRouteWorldPoints = null; // puntos de la ruta actual en coordenadas de juego, para detectar desvios
// La ruta como se calculo, sin recortar: lo que falta y la distancia al giro
// se miden sobre ella (gameKmOf, routeMeters en pure.js). Si ya no es la de
// currentRouteWorldPoints, routeMeters mide como antes.
let currentRouteFull = null;
const OFF_ROUTE_THRESHOLD_M = 200; // si te alejas mas que esto de la ruta calculada, se recalcula (como un GPS) - en interconexiones con rampas paralelas cercanas, 400 tardaba en detectar que se tomo una rampa distinta

// Waypoints intermedios puestos a mano desde la app (posicion -> wp1 -> wp2
// ... -> destino), en orden. El SDK del juego no sabe nada de esto - si el
// usuario tambien los marco en el GPS del juego (inGame=true), el "In-game
// ETA"/distancia que manda el juego ya reflejan el desvio y no tocamos esos
// numeros. Si alguno es solo de la app (inGame=false), calculamos nosotros
// la distancia total sumando los tramos del grafo y se muestra aparte en las
// filas "(with waypoints)". Un waypoint se da por alcanzado (y se saca solo,
// como un GPS) cuando el camion llega por la ruta al icono o al nodo de su
// tramo, o sin ruta a menos de WAYPOINT_REACHED_M (ver checkWaypointReached).
const WAYPOINT_REACHED_M = 150;
const MAX_WAYPOINTS = 9;
let waypoints = []; // [{ pos: [x,z], lngLat: [lng,lat], inGame: bool, label: string|null, marker }]
let waypointMode = false; // true mientras se espera el proximo click en el mapa para ubicar un waypoint
let pendingWaypoint = null; // { pos, lngLat, label } mientras se muestra el modal de confirmacion
let lastKnownAvgSpeedKmh = null; // ultimo promedio de velocidad real calculado por computeRealEtaSeconds, reusado para el ETA con waypoint

function sumPathDistanceMeters(points) {
  if (!points || points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return total;
}

function setWaypointMode(on) {
  waypointMode = on;
  document.getElementById('waypointBtn').classList.toggle('active', on);
}

// Marcadores en SVG (antes emoji: se veian distintos en cada sistema y la
// fuente de glifos del mapa no los renderiza igual en todos lados).
const MARKER_SVG = {
  dest: '<svg class="svgMarker dest" viewBox="0 0 24 24"><path d="M5 22V3" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><path d="M6 4h12l-2.5 4L18 12H6z" fill="#ff4d4d" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  pickup: '<svg class="svgMarker dest" viewBox="0 0 24 24"><path d="M5 22V3" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><path d="M6 4h12l-2.5 4L18 12H6z" fill="#3b9eff" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  waypoint: '<svg class="svgMarker waypoint" viewBox="0 0 24 24"><path d="M12 22s7-7.2 7-12.5A7 7 0 0 0 5 9.5C5 14.8 12 22 12 22z" fill="#ffb020" stroke="#fff" stroke-width="1.4"/><circle cx="12" cy="9.5" r="2.6" fill="#1a1002"/></svg>',
  otherPlayer: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M2 7h11v9H2z" fill="#9aa4b2" stroke="#fff" stroke-width="1.2"/><path d="M13 10h4l3 3v3h-7z" fill="#cbd0d6" stroke="#fff" stroke-width="1.2"/><circle cx="6" cy="17.5" r="2" fill="#111" stroke="#fff" stroke-width="1"/><circle cx="17" cy="17.5" r="2" fill="#111" stroke="#fff" stroke-width="1"/></svg>',
};

function makeWaypointMarker(lngLat, index) {
  const el = document.createElement('div');
  el.innerHTML = MARKER_SVG.waypoint + `<span class="waypointBadge">${index + 1}</span>`;
  el.className = 'waypointMarkerWrap';
  el.title = t('waypointTapToRemove');
  // Tocarlo lo quita, como en el mapa del juego. El indice se busca al
  // momento del click: si se borro otro antes, el que tenia al crearse ya no
  // sirve.
  el.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const i = waypoints.findIndex(w => w.marker && w.marker.getElement() === el);
    if (i >= 0) removeWaypoint(i);
  });
  return new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(lngLat).addTo(map);
}

function renumberWaypointMarkers() {
  waypoints.forEach((wp, i) => {
    const badge = wp.marker && wp.marker.getElement().querySelector('.waypointBadge');
    if (badge) badge.textContent = String(i + 1);
  });
}

function invalidateRoute() {
  currentRouteTarget = null; // fuerza recalculo de la ruta en el proximo tick
  paceEta.reset();
}

// Los waypoints se guardan por variante de mapa en cada cambio, y vuelven al
// cargar ese mapa (recargar la pagina no los pierde; ver storedWaypoints).
// Cambiar de mapa no borra lo guardado del otro.
const WAYPOINTS_KEY = 'truckdash_waypoints';
function readStoredWaypoints() {
  try { return JSON.parse(localStorage.getItem(WAYPOINTS_KEY) || '{}') || {}; } catch (e) { return {}; }
}
// La demo no guarda ni recupera: sus waypoints (variante ats) aparecian en la
// partida real de ATS si se jugaba dentro de las 12 h. El de "seguir al
// lider" del convoy tampoco se guarda: es del convoy en curso y despues de
// recargar quedaba como un waypoint comun al destino viejo del lider
// (auditoria del 10-10).
function saveWaypoints() {
  if (!currentGame || conn.demo) return;
  const stored = readStoredWaypoints();
  const keep = plainWaypoints(waypoints);
  if (keep.length) {
    stored[currentGame] = { at: Date.now(), list: keep };
  } else {
    delete stored[currentGame];
  }
  try { localStorage.setItem(WAYPOINTS_KEY, JSON.stringify(stored)); } catch (e) {}
}
function restoreWaypoints() {
  if (!currentGame || !toLngLat || waypoints.length || conn.demo) return;
  for (const w of storedWaypoints(readStoredWaypoints(), currentGame, Date.now(), 12 * 3600 * 1000, MAX_WAYPOINTS)) {
    const lngLat = toLngLat(w.pos[0], w.pos[1]);
    waypoints.push({ pos: w.pos, lngLat, inGame: w.inGame, label: w.label, kind: w.kind || null, marker: makeWaypointMarker(lngLat, waypoints.length) });
  }
  if (waypoints.length) { renderWaypointList(); invalidateRoute(); }
}

// kind: codigo del POI ('g' estacion de servicio...) si salio del buscador.
// at: donde entra en la lista (al final si no se dice; ver addPoiWaypoint).
function addWaypoint(pos, lngLat, inGame, label, kind = null, at = waypoints.length) {
  if (waypoints.length >= MAX_WAYPOINTS) { showToast(t('waypointLimitToast').replace('{n}', MAX_WAYPOINTS), 'danger'); return; }
  const i = Math.max(0, Math.min(at, waypoints.length));
  const wp = { pos, lngLat, inGame, label: label || null, kind, marker: makeWaypointMarker(lngLat, i) };
  waypoints.splice(i, 0, wp);
  renumberWaypointMarkers();
  renderWaypointList();
  invalidateRoute();
  saveWaypoints();
}

function removeWaypoint(index) {
  const [wp] = waypoints.splice(index, 1);
  if (wp && wp.marker) wp.marker.remove();
  renumberWaypointMarkers();
  if (!waypoints.length) forgetWaypointTrip();
  renderWaypointList();
  invalidateRoute();
  saveWaypoints();
}

// keepStored: al cambiar de mapa se sacan de la pantalla pero quedan
// guardados para cuando se vuelva a esa variante.
function clearWaypoint(keepStored = false) {
  for (const wp of waypoints) if (wp.marker) wp.marker.remove();
  waypoints = [];
  renderWaypointList();
  invalidateRoute();
  if (!keepStored) { saveWaypoints(); forgetWaypointTrip(); }
}

function renderWaypointList() {
  const btn = document.getElementById('waypointBtn');
  btn.classList.toggle('set', waypoints.length > 0);
  const badge = document.getElementById('waypointCount');
  if (badge) { badge.textContent = String(waypoints.length); badge.style.display = waypoints.length ? '' : 'none'; }
  const row = document.getElementById('waypointRow');
  const list = document.getElementById('waypointList');
  if (!row || !list) return;
  row.hidden = waypoints.length === 0;
  list.innerHTML = waypoints.map((wp, i) => {
    const { label, kind } = waypointNameParts(wp, i);
    return `<div class="waypointItem" title="${escapeHtml(`${label} ${kind}`)}"><span class="waypointNum">${i + 1}</span><span class="waypointName" data-wp="${i}">${waypointRowHtml(wp, i, null)}</span><button class="waypointClearBtn" data-index="${i}" data-i18n-title="clear" title="${t('clear')}">✕</button></div>`;
  }).join('');
  list.querySelectorAll('button[data-index]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); removeWaypoint(Number(b.dataset.index)); }));
}

function waypointNameParts(wp, i) {
  return {
    label: wp.label ? wp.label : `${t('waypoint')} ${i + 1}`,
    kind: wp.inGame ? t('waypointInGameShort') : t('waypointAppOnlyShort'),
  };
}

// La fila de cada waypoint: el numero y, hasta el, el ETA real, el del juego
// y la distancia (waypointLegEtas), para saber si alcanza el combustible o
// el sueno (Discord, 17-10). El nombre no entraba al lado y paso al title.
// Sin ruta para los waypoints de ahora (recien cambiados, sin grafo, sin
// telemetria), el nombre como antes.
function waypointRowHtml(wp, i, leg) {
  if (!leg) {
    const { label, kind } = waypointNameParts(wp, i);
    return `${escapeHtml(label)} <span class="waypointKind">${escapeHtml(kind)}</span>`;
  }
  // Cada separador va pegado a su pieza: en un celular la fila se parte
  // y quedaba el "-" colgando al final y la distancia sola abajo.
  const parte = (texto) => `<span class="waypointEtaPart">${escapeHtml(texto)}</span>`;
  const dist = useImperial ? leg.km * KM_TO_MI : leg.km;
  const distText = dist < 10 ? formatDec(dist, currentLang) : formatInt(dist, currentLang);
  return `${parte(`${t('waypointEtaReal')}: ${formatSeconds(leg.realSeconds)} /`)} `
    + `${parte(`${t('waypointEtaGame')}: ${formatSeconds(leg.gameSeconds)}`)} `
    + parte(`- ${distText} ${useImperial ? 'mi' : 'km'}`);
}

// En cada dato, sin rearmar la lista (los botones tienen sus listeners).
function updateWaypointListEta(legs) {
  const list = document.getElementById('waypointList');
  if (!list) return;
  for (const el of list.querySelectorAll('.waypointName[data-wp]')) {
    const i = Number(el.dataset.wp);
    const wp = waypoints[i];
    if (!wp) continue;
    const leg = legs ? legs[i] : null;
    const html = waypointRowHtml(wp, i, leg);
    if (el._html === html) continue;
    el._html = html;
    el.innerHTML = html;
    el.classList.toggle('eta', !!leg);
  }
}

function finalizeWaypoint(inGame) {
  if (!pendingWaypoint) return;
  endRouteDismissal();
  addWaypoint(pendingWaypoint.pos, pendingWaypoint.lngLat, inGame, pendingWaypoint.label);
  pendingWaypoint = null;
}

// Un waypoint agregado desde la busqueda de POIs (estacion, taller, empresa)
// no pasa por el modal: el juego no lo conoce (inGame=false) y ya tiene nombre.
// Una parada (con kind: estacion, descanso, taller...) va como la proxima, o
// en el tramo de la ruta por el que se pasa por ella (stopInsertIndex); una
// empresa sigue yendo al final, que sin trabajo es el destino. La ruta solo
// sirve si es la de los waypoints de ahora: con currentRouteTarget en null
// (recien invalidada) sus tramos pueden ser los de antes.
function addPoiWaypoint(pos, label, kind = null) {
  if (!toLngLat) return;
  const at = kind
    ? stopInsertIndex(currentRouteTarget ? currentRouteWorldPoints : null, { x: pos[0], z: pos[1] }, waypoints.length)
    : waypoints.length;
  endRouteDismissal();
  addWaypoint(pos, toLngLat(pos[0], pos[1]), false, label, kind, at);
  showToast(t('poiAddedToast').replace('{name}', label), 'success', 3000);
}

// Saca el primer waypoint cuando el camion llega (la ruta ya lo llevo al
// icono o al final de su tramo, o sin ruta paso cerca: waypointReached en
// pure.js) - asi una ruta con varias paradas avanza sola, como un GPS de
// verdad. La ruta solo cuenta si es la de los waypoints de ahora: con
// currentRouteTarget en null (recien invalidada) sus tramos pueden ser los de antes.
function checkWaypointReached(x, z) {
  if (!waypoints.length) return;
  const wp = waypoints[0];
  const route = currentRouteTarget ? currentRouteWorldPoints : null;
  const speedKmh = lastData && Number.isFinite(lastData.speedKmh) ? Math.abs(lastData.speedKmh) : null;
  if (waypointReached(x, z, wp.pos, route, { tapM: WAYPOINT_REACHED_M, speedKmh })) {
    showToast(t('waypointReachedToast').replace('{name}', wp.label || `${t('waypoint')} 1`), 'success', 3000);
    // Sin trabajo, el ultimo es el destino: la voz dice "llegaste"
    // (voiceGuide.waypointReached), con la ruta de antes de sacarlo.
    if (voiceOn) {
      const llegada = voiceGuide.waypointReached(routeProgressState.key, waypoints.length === 1, routeProgressState.kind, routeProgressState.total);
      if (llegada && isLeaderTab) speakVoice(llegada);
    }
    removeWaypoint(0);
  }
}

// Actualiza las filas "(with waypoints)" bajo In-game ETA y Real ETA - solo
// tienen sentido si hay algun waypoint que el juego NO conoce (si estan
// todos marcados tambien en el juego, el numero del juego ya es correcto).
// Lo que falta se mide sobre la ruta recortada al camion, como el resumen de
// ruta: antes era el total de cuando se armo la ruta y no bajaba al andar.
// Y a la escala del juego en cada parte (gameKmOf): en la ciudad, a 1:20,
// decia 25,5 mi con el juego en 4,0 y bajaba mucho mas rapido (14-10).
// Los tiempos salen de waypointEta (pure.js): el de abajo del ETA del juego
// en horas de juego, el de abajo del ETA real en tiempo real. Los de cada
// waypoint de la lista son una parte de esos (waypointLegEtas), con o sin
// waypoints que el juego no conoce.
function updateWaypointRoute(data) {
  const gameRow = document.getElementById('etaGameWaypointRow');
  const realRow = document.getElementById('etaRealWaypointRow');
  const viaKm = waypoints.length ? gameKmOf(currentRouteWorldPoints) : null;
  const eta = viaKm == null ? null : waypointEta({
    viaKm,
    gameKm: Number.isFinite(data.routeDistanceKm) ? data.routeDistanceKm : null,
    gameEtaSeconds: data.routeTimeSeconds,
    realEtaSeconds: routeSummaryEtaSeconds,
    avgSpeedKmh: lastKnownAvgSpeedKmh,
    // Sin push: measuredTimeScale ya lo alimenta una vez por tick.
    timeScale: gameTimeScale.value() ?? distanceScale(),
  });
  // Los tramos solo si la ruta es la de los waypoints de ahora: recien
  // cambiados (currentRouteTarget en null) son los de antes, corridos.
  let legs = null;
  if (eta && currentRouteTarget) {
    const medida = waypointLegMeters(currentRouteWorldPoints, waypoints.length);
    const scale = gameScale();
    legs = waypointLegEtas(
      medida.legs.map(m => (m == null ? null : { worldM: m, km: scale.routeMeters(currentRouteFull, currentRouteWorldPoints, m) / 1000 })),
      { worldM: medida.total, km: viaKm }, eta);
  }
  updateWaypointListEta(legs);
  if (!eta || !waypoints.some(wp => !wp.inGame)) {
    gameRow.hidden = true;
    realRow.hidden = true;
    return;
  }
  const distDisplay = useImperial ? viaKm * KM_TO_MI : viaKm;
  const distText = `${formatDec(distDisplay, currentLang)} ${useImperial ? 'mi' : 'km'}`;
  const timeOf = (sec) => sec != null ? formatSeconds(sec) : t('calculating');
  gameRow.hidden = false;
  realRow.hidden = false;
  document.getElementById('etaGameWaypoint').textContent = `${timeOf(eta.gameSeconds)} (${distText})`;
  document.getElementById('etaRealWaypoint').textContent = timeOf(eta.realSeconds);
}

// ---------------------------------------------------------------------------
// POIs: estaciones de servicio, areas de descanso, talleres, garages,
// concesionarias, basculas y empresas, por variante de mapa (generados con
// tools/build_pois.py a partir del parser de truckermudgeon/maps). Se usan
// para la busqueda "cerca mio", el boton de combustible mas cercano, y para
// ubicar el punto exacto de carga/descarga de un trabajo (empresa + ciudad).
// ---------------------------------------------------------------------------
// Servido desde trucksim-dash.com (o un http.server local de desarrollo) los
// datos estan al lado; en modo LAN (?local=1) la app la sirve el cliente
// desde el PC y los POIs se piden al sitio (GitHub Pages manda CORS abierto).
// Se decide por el parametro y no por el hostname: en LAN la pagina puede
// ser 127.0.0.1 ("Open here") igual que un servidor de desarrollo.
const POI_BASE = new URLSearchParams(location.search).get('local') ? 'https://trucksim-dash.com/data' : '../data';
// El mundo del juego esta comprimido (ATS 1:20, ETS2 1:19) y el juego muestra
// TODAS las distancias multiplicadas por esa escala (el routeDistance de la
// telemetria ya viene asi). Todo lo que calculamos nosotros sobre
// coordenadas crudas (POIs, tramos con waypoints, distancia al proximo giro)
// se muestra con la misma escala para que sea coherente con el juego. Los
// umbrales de logica (giro cerca, waypoint alcanzado) siguen en metros crudos.
function distanceScale() {
  return (currentGame || '').startsWith('ets2') ? 19 : 20;
}

// La escala de la ruta no vale en las ciudades: ahi el juego va a 1:3
// (createCityScale en pure.js, con las areas de ciudad de los POIs). Hasta
// que bajan los POIs, o con unos de antes sin areas, todo a distanceScale.
let cityScale = null, cityScaleGame = null, cityScaleOf = null;
function gameScale() {
  const datos = pois && poisVariant === currentGame ? pois : null;
  if (!cityScale || cityScaleGame !== currentGame || cityScaleOf !== datos) {
    cityScale = createCityScale(datos && datos.areas, { outside: distanceScale() });
    cityScaleGame = currentGame;
    cityScaleOf = datos;
  }
  return cityScale;
}

// Km del juego de un camino en coordenadas de mundo (null sin camino). La
// ruta recortada al camion se mide sobre el perfil de la ruta entera (full,
// ver routeMeters): medida desde el camion, al pasar de una caja de ciudad
// al hueco hasta la siguiente lo que falta subia 5 km (15-10).
function gameKmOf(points, full = currentRouteFull) {
  return points ? gameScale().routeMeters(full, points) / 1000 : null;
}

const POI_CODES = { g: 'poiCatFuel', p: 'poiCatRest', c: 'poiCatRest', s: 'poiCatService', r: 'poiCatGarage', d: 'poiCatDealer', w: 'poiCatWeigh', a: 'poiCatAtlas' };
const POI_ICONS_TEXT = { g: '⛽', p: '🅿️', c: '🅿️', s: '🔧', r: '🏠', d: '🚛', w: '⚖️', a: '🧭' };
let pois = null; // { facilities: [[x,z,code]], companies: [[x,z,token,label,city]], cities: {token: name} }
let poisVariant = null;
let poisLoading = null; // promesa en curso, para no disparar dos fetch del mismo archivo
let poisError = null;
let poiCategory = 'g';

async function loadPois(variant) {
  if (poisVariant === variant && pois) return pois;
  if (poisVariant === variant && poisLoading) return poisLoading;
  poisVariant = variant;
  pois = null;
  poisError = null;
  poisLoading = (async () => {
    try {
      const propio = GAME_MAPS[variant] && GAME_MAPS[variant].poisUrl;
      const res = await fetch(propio ? `${propio}?v=${MAP_DATA_VERSION[variant] || ''}` : `${POI_BASE}/pois-${variant}.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      pois = await res.json();
      setAtlasData();
    } catch (err) {
      pois = null;
      poisError = String(err);
      console.error('No se pudieron cargar los POIs', variant, err);
    } finally {
      poisLoading = null;
    }
    // Si el modal esta abierto esperando, refrescarlo sin importar quien
    // disparo la carga (el mapa al iniciar o el propio modal).
    if (document.getElementById('poiModal').style.display === 'flex') { fillPoiCityList(); renderPoiResults(); }
    return pois;
  })();
  return poisLoading;
}

// Atlas en el mapa: solo con los POIs de la variante que se esta mostrando
// (loadPois corre en paralelo al cambio de juego y puede llegar antes o
// despues de que toLngLat apunte al juego nuevo).
function atlasGeoJson(list) {
  return { type: 'FeatureCollection', features: (list || []).map(([x, z, k, name]) => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: toLngLat(x, z) }, properties: { k, name } })) };
}
function setAtlasData() {
  const vale = pois && poisVariant === currentGame && toLngLat;
  fuelFromPois = !!(vale && pois.facilities.some(f => f[2] === 'f'));
  const src = map && map.getSource('atlas');
  if (!src) return;
  src.setData(atlasGeoJson(vale ? pois.atlas : null));
  const autos = map.getSource('car-parking');
  if (autos) autos.setData(atlasGeoJson(vale ? pois.facilities.filter(f => f[2] === 'c') : null));
  applyFuelSource();
}

function poiVariantNow() {
  return currentGame || (lastData ? resolveEffectiveGame(lastData.game) : null);
}

// Distancia maxima entre una empresa y el centro de la ciudad a la que
// pertenece. Medido sobre los datos del parser: en ETS2 vainilla la mas
// alejada esta a 8,6 km y el percentil 99 es 5 km, asi que 15 km ya es
// seguro otra ciudad.
const COMPANY_CITY_MAX_M = 15000;

function companyPoiAt(hit) {
  return hit ? { x: hit[0], z: hit[1], token: hit[2], label: hit[3], city: hit[4] } : null;
}

// El SDK no siempre manda el ID de la empresa de destino: en los contratos
// externos (Cargo Market) y en el transporte especial suele venir vacio
// aunque el NOMBRE visible si llegue. Antes ese nombre se descartaba y la
// bandera se iba al centro de la ciudad, a casi un kilometro del muelle
// (reportado con un viaje a Longyearbyen: 908 m). Se busca dentro de la
// ciudad de destino nada mas: si el juego esta en un idioma que traduce los
// nombres de empresa y no hay match, el peor caso sigue siendo el centro de
// la ciudad y nunca una empresa de otro lado.
function findCompanyPoiByName(name, cityToken) {
  if (!pois || !name || !cityToken) return null;
  const buscado = String(name).trim().toLowerCase();
  if (!buscado) return null;
  return companyPoiAt(pois.companies.find(
    c => c[4] === cityToken && (c[3] || '').trim().toLowerCase() === buscado));
}

function findCompanyPoi(token, cityToken) {
  if (!pois || !token) return null;
  const exacta = pois.companies.find(c => c[2] === token && c[4] === cityToken);
  if (exacta) return companyPoiAt(exacta);
  // Sin ciudad no hay con que desempatar: se toma la primera y listo.
  if (!cityToken) return companyPoiAt(pois.companies.find(c => c[2] === token));
  // Con ciudad, "la primera con ese token" es una trampa: el 97% de las
  // empresas de ETS2 tienen su marca en varias ciudades, asi que esa linea
  // podia mandar la bandera a la sucursal de otra ciudad, hasta 200 km lejos,
  // sin decir nada. Se busca la mas cercana al destino y, si no hay ninguna
  // plausible, se devuelve null para que el llamador caiga al centro de la
  // ciudad correcta, que es un error mucho mas chico y mucho menos confuso.
  const city = findCity(cityToken, null);
  if (!city) return null;
  let mejor = null;
  let mejorDist = Infinity;
  for (const c of pois.companies) {
    if (c[2] !== token) continue;
    const d = Math.hypot(c[0] - city.X, c[1] - city.Y);
    if (d < mejorDist) { mejorDist = d; mejor = c; }
  }
  return mejorDist <= COMPANY_CITY_MAX_M ? companyPoiAt(mejor) : null;
}

function nearestFacilities(code, x, z, limit) {
  if (!pois) return [];
  const out = [];
  if (code === 'a') {
    // Atlas (ATS): lugares con nombre propio, los tourist boards y los
    // points of interest juntos, del mas cercano al mas lejano.
    for (const [ax, az, kind, name] of pois.atlas || []) {
      out.push({ x: ax, z: az, code, kind, name, dist: Math.hypot(ax - x, az - z) });
    }
    out.sort((a, b) => a.dist - b.dist);
    return out.slice(0, limit);
  }
  // En auto o en camion la categoria junta otros codigos (facilityCodesFor);
  // el resultado lleva la categoria, que es lo que guarda el waypoint.
  const codes = facilityCodesFor(code, drivingCar);
  for (const f of pois.facilities) {
    if (!codes.includes(f[2])) continue;
    out.push({ x: f[0], z: f[1], code, dist: Math.hypot(f[0] - x, f[1] - z) });
  }
  out.sort((a, b) => a.dist - b.dist);
  if (codes.length === 1) return out.slice(0, limit);
  // Una parada de camiones tiene surtidores de auto y de camion a pocos
  // metros: una sola fila por lugar.
  const lugares = [];
  for (const r of out) {
    if (lugares.length >= limit) break;
    if (!lugares.some(l => Math.hypot(l.x - r.x, l.z - r.z) < 150)) lugares.push(r);
  }
  return lugares;
}

function searchCompanies(query, x, z, limit) {
  if (!pois) return [];
  const q = foldText(query.trim());
  if (!q) return [];
  const out = [];
  for (const c of pois.companies) {
    const label = foldText(c[3]);
    const city = foldText(c[4]).replace(/_/g, ' ');
    if (label.includes(q) || city.includes(q) || foldText(cityLabel(c[4])).includes(q)) out.push({ x: c[0], z: c[1], token: c[2], label: c[3], city: c[4], dist: x != null ? Math.hypot(c[0] - x, c[1] - z) : 0 });
  }
  out.sort((a, b) => a.dist - b.dist);
  return out.slice(0, limit);
}

// path: el camino de esos metros de mundo (la recta del camion al lugar, o
// la ruta hasta el), para medir cada parte a su escala: una estacion a 250 m
// en el centro decia 3 mi a 1:20 (ver createCityScale).
function formatPoiDistance(rawMeters, path) {
  const meters = path ? gameScale().routeMeters(currentRouteFull, path, rawMeters) : rawMeters * distanceScale();
  if (useImperial) { const mi = meters / 1609.34; return mi < 10 ? `${formatDec(mi, currentLang)} mi` : `${Math.round(mi)} mi`; }
  const km = meters / 1000;
  return km < 10 ? `${formatDec(km, currentLang)} km` : `${Math.round(km)} km`;
}

// Ciudad mas cercana a un punto (para ubicar "Estacion de servicio" en la
// lista): centro de ciudad a menos de NEAR_CITY_M crudos, o nada.
const NEAR_CITY_M = 4000;
function nearestCityName(x, z) {
  let best = null, bestDist = NEAR_CITY_M;
  for (const c of citiesAll) {
    const d = Math.hypot(c.X - x, c.Y - z);
    if (d < bestDist) { bestDist = d; best = c.Name; }
  }
  return best;
}

// Ciudades de la busqueda: las del archivo mas las que solo aparecen en sus
// empresas. En los datos de Coast to Coast faltan Gulfport y Meridian (y unas
// pocas de ETS2 y ProMods): sus empresas estaban, pero buscar la ciudad no
// daba nada ("can't find the city I'm going to", Discord 10-10).
let poiCityNamesCache = null, poiCityNamesFor = null;
function poiCityNames() {
  if (!pois) return {};
  if (poiCityNamesFor === pois) return poiCityNamesCache;
  const names = { ...(pois.cities || {}) };
  for (const c of pois.companies || []) {
    const tok = c[4];
    if (tok && !names[tok]) names[tok] = tok.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  poiCityNamesFor = pois;
  poiCityNamesCache = names;
  return names;
}

// Las etiquetas del buscador: las ciudades repetidas llevan el estado o la
// ciudad cercana (cityChoiceLabels en pure.js). Se rehacen al cambiar los
// POIs, el Cities.json o el idioma.
let poiCityLabelsCache = null, poiCityLabelsKey = null;
function poiCityLabels() {
  if (!pois) return {};
  const key = [pois, citiesAll, currentLang, poiVariantNow()];
  if (poiCityLabelsKey && key.every((v, i) => v === poiCityLabelsKey[i])) return poiCityLabelsCache;
  // Donde queda cada ciudad: Cities.json, o el centro de sus empresas para
  // las que el archivo no trae (Gulfport en C2C).
  const centro = {};
  for (const c of pois.companies || []) {
    if (!c[4]) continue;
    const a = centro[c[4]] || (centro[c[4]] = [0, 0, 0]);
    a[0] += c[0]; a[1] += c[1]; a[2]++;
  }
  const coords = (tok) => {
    const c = citiesByToken[tok];
    if (c && Number.isFinite(c.X) && Number.isFinite(c.Y)) return [c.X, c.Y];
    const a = centro[tok];
    return a ? [a[0] / a[2], a[1] / a[2]] : null;
  };
  const tokenRegions = String(poiVariantNow() || '').startsWith('ats');
  poiCityLabelsCache = cityChoiceLabels(poiCityNames(), { countries: pois.countries, coords, tokenRegions, near: (c) => t('poiCityNear', c) });
  poiCityLabelsKey = key;
  return poiCityLabelsCache;
}

function cityLabel(token) {
  if (!token) return '';
  return poiCityLabels()[token] || poiCityNames()[token] || token.replace(/_/g, ' ');
}

function renderPoiResults() {
  const list = document.getElementById('poiResults');
  const pos = lastWorldPos;
  updateAtlasChip();
  if (!pois) {
    if (poisError || (!poisLoading && !poiVariantNow())) {
      list.innerHTML = `<div class="poiEmpty">${t('poiLoadFailed')}</div><button class="poiItem" id="poiRetryBtn">${t('poiRetry')}</button>`;
      document.getElementById('poiRetryBtn').addEventListener('click', () => {
        poisVariant = null; poisError = null;
        list.innerHTML = `<div class="poiEmpty">${t('poiLoading')}</div>`;
        const v = poiVariantNow();
        if (v) loadPois(v); else renderPoiResults();
      });
      return;
    }
    list.innerHTML = `<div class="poiEmpty">${t('poiLoading')}</div>`;
    return;
  }
  if (!pos) { list.innerHTML = `<div class="poiEmpty">${t('poiNoPosition')}</div>`; return; }
  const query = document.getElementById('poiSearchInput').value;
  // La ciudad elegida de la lista ("Jackson, WY"), o el nombre a secas: con
  // "Jackson" escrito a mano salen las empresas de las tres, cada una con su
  // estado abajo.
  const cityTokens = new Set(citiesMatchingInput(poiCityNames(), poiCityLabels(), document.getElementById('poiCityInput').value));
  let results;
  if (cityTokens.size) {
    // Ciudad elegida: todas sus empresas (filtradas por el texto si hay), a
    // distancia del camion - dos pasos, como en un GPS de verdad.
    const q = foldText(query.trim());
    results = pois.companies
      .filter(c => cityTokens.has(c[4]) && (!q || foldText(c[3]).includes(q)))
      .map(c => ({ x: c[0], z: c[1], token: c[2], label: c[3], city: c[4], dist: Math.hypot(c[0] - pos.x, c[1] - pos.z), name: c[3], sub: cityLabel(c[4]) }))
      .sort((a, b) => a.sub.localeCompare(b.sub) || a.label.localeCompare(b.label))
      .slice(0, 40 * Math.min(cityTokens.size, 3));
  } else if (query.trim()) {
    results = searchCompanies(query, pos.x, pos.z, 20).map(r => ({ ...r, name: r.label, sub: cityLabel(r.city) }));
  } else {
    // En auto, "Area de descanso" son los estacionamientos para auto, y en
    // camion el combustible es sin los surtidores de auto (nearestFacilities).
    results = nearestFacilities(poiCategory, pos.x, pos.z, 15).map(r => r.code === 'a'
      ? { ...r, sub: [t(r.kind === 't' ? 'atlasTouristBoard' : 'atlasPoi'), nearestCityName(r.x, r.z)].filter(Boolean).join(' · ') }
      : { ...r, name: t(POI_CODES[r.code]), sub: nearestCityName(r.x, r.z) || '' });
  }
  if (!results.length) { list.innerHTML = `<div class="poiEmpty">${t('poiNoResults')}</div>`; return; }
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Hacia donde queda cada uno respecto del camion (pedido de Gargamosch,
  // 10-10): con solo la distancia, "la mas cercana" podia estar atras.
  const heading = lastData && Number.isFinite(lastData.heading) ? lastData.heading : null;
  list.innerHTML = results.map((r, i) => {
    const rel = poiRelative(pos.x, pos.z, heading, r.x, r.z);
    const dirTitle = rel ? (rel.side === 'behind' ? t('poiBehind') : rel.side === 'ahead' ? t('poiAhead') : '') : '';
    const dir = rel ? `<span class="poiDir ${rel.side}" title="${esc(dirTitle)}"><svg viewBox="0 0 24 24" width="16" height="16" style="transform:rotate(${Math.round(rel.rel)}deg)"><path d="M12 3l6 9h-4v9h-4v-9H6z" fill="currentColor"/></svg></span>` : '';
    return `
    <button class="poiItem${rel && rel.side === 'behind' ? ' behind' : ''}" data-index="${i}">
      ${r.code ? `<span class="poiIcon">${POI_ICONS_TEXT[r.code]}</span>` : companyLogoHtml(r.token)}
      <span class="poiText"><span class="poiName">${esc(r.name)}</span>${r.sub ? `<span class="poiSub">${esc(r.sub)}</span>` : ''}</span>
      ${dir}<span class="poiDist">${formatPoiDistance(r.dist, [[pos.x, pos.z], [r.x, r.z]])}</span>
    </button>`;
  }).join('');
  list.querySelectorAll('.poiLogo img').forEach(img => img.addEventListener('error', () => {
    const [sig, ...resto] = img.dataset.fallback.split(' ').filter(Boolean);
    if (!sig) { img.remove(); return; }
    img.dataset.fallback = resto.join(' ');
    img.src = sig;
  }));
  list.querySelectorAll('.poiItem').forEach(btn => btn.addEventListener('click', () => {
    const r = results[Number(btn.dataset.index)];
    addPoiWaypoint([r.x, r.z], r.sub ? `${r.name} (${r.sub})` : r.name, r.code || null);
    closePoiModal();
  }));
}

// El chip del Atlas solo existe en ATS (y en las variantes cuyo mapa lo trae).
function updateAtlasChip() {
  const chip = document.querySelector('.poiChip[data-code="a"]');
  if (!chip) return;
  const hay = !!(pois && pois.atlas && pois.atlas.length);
  chip.hidden = !hay;
  if (!hay && poiCategory === 'a') {
    poiCategory = 'g';
    document.querySelectorAll('.poiChip').forEach(c => c.classList.toggle('active', c.dataset.code === 'g'));
  }
}

function fillPoiCityList() {
  const list = document.getElementById('poiCityList');
  if (!list || !pois) return;
  list.innerHTML = Object.values(poiCityLabels()).sort().map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
}
function openPoiModal() {
  document.getElementById('poiModal').style.display = 'flex';
  document.getElementById('poiSearchInput').value = '';
  document.getElementById('poiCityInput').value = '';
  fillPoiCityList();
  const variant = poiVariantNow();
  if (!pois && variant && !poisLoading) loadPois(variant);
  renderPoiResults();
}
function closePoiModal() { document.getElementById('poiModal').style.display = 'none'; }

document.getElementById('poiBtn').addEventListener('click', openPoiModal);
initPip();
document.getElementById('poiCloseBtn').addEventListener('click', closePoiModal);
document.getElementById('poiCloseX').addEventListener('click', closePoiModal);
document.getElementById('poiModal').addEventListener('click', (e) => { if (e.target.id === 'poiModal') closePoiModal(); });
document.getElementById('poiSearchInput').addEventListener('input', renderPoiResults);
document.getElementById('poiCityInput').addEventListener('input', () => { renderPoiResults(); });
document.querySelectorAll('.poiChip').forEach(chip => chip.addEventListener('click', () => {
  poiCategory = chip.dataset.code;
  document.querySelectorAll('.poiChip').forEach(c => c.classList.toggle('active', c === chip));
  document.getElementById('poiSearchInput').value = '';
  renderPoiResults();
}));
// Atajo: la estacion de servicio ('g') o el area de descanso ('p') mas
// cercana como waypoint, en un toque. Lo usan el buscador y el aviso de
// arriba del mapa (renderStopSuggest). false si todavia no se puede.
function addNearestStop(code) {
  const pos = lastWorldPos;
  if (!pos) return false;
  if (!pois) {
    const variant = poiVariantNow();
    if (variant && !poisLoading) loadPois(variant);
    showToast(t('poiLoading'), 'success', 2500);
    return false;
  }
  // La primera sobre la ruta que falta, o la mas cercana adelante: la mas
  // cercana en linea recta podia quedar atras y la ruta volvia a buscarla
  // ("it was a line going behind me", Discord 10-10). Y medida por el
  // camino (reach): un area de descanso de la otra mano esta pegada a la
  // ruta pero hay que dar la vuelta para entrar (Grand Island, Discord 19-10).
  const heading = lastData && Number.isFinite(lastData.heading) ? lastData.heading : null;
  const rumbo = routeStartHeading(lastData);
  const reach = routeGraph ? (st) => {
    const r = findRoute([pos.x, pos.z], [st.x, st.z], rumbo, null, null, { entrar: true });
    if (!r || !r.length) return null;
    let m = 0;
    for (let k = 1; k < r.length; k++) m += Math.hypot(r[k][0] - r[k - 1][0], r[k][1] - r[k - 1][1]);
    const fin = r[r.length - 1];
    return m + Math.hypot(st.x - fin[0], st.z - fin[1]);
  } : null;
  const best = pickFuelStop(nearestFacilities(code, pos.x, pos.z, 60), pos.x, pos.z, heading, currentRouteWorldPoints, undefined, undefined, { reach });
  if (!best) { showToast(t('poiNoResults'), 'danger'); return false; }
  const name = t(code === 'g' ? 'poiCatFuel' : 'poiCatRest');
  const lejos = best.why === 'route'
    ? formatPoiDistance(best.along, currentRouteWorldPoints)
    : formatPoiDistance(best.dist, [[pos.x, pos.z], [best.x, best.z]]);
  addPoiWaypoint([best.x, best.z], `${name} (${lejos})`, code);
  return true;
}
for (const [id, code] of [['poiNearestFuelBtn', 'g'], ['poiNearestRestBtn', 'p']]) {
  document.getElementById(id).addEventListener('click', () => {
    if (!lastWorldPos || !pois) { renderPoiResults(); return; }
    if (addNearestStop(code)) closePoiModal();
  });
}

// Distancia minima (aprox) del punto (x,z) a la polilinea de la ruta actual,
// en unidades del juego. Alcanza con chequear contra cada segmento entre
// vertices consecutivos (la ruta ya viene con buena densidad de puntos).
function distanceToRouteMeters(x, z) {
  if (!currentRouteWorldPoints || currentRouteWorldPoints.length < 2) return Infinity;
  let best = Infinity;
  for (let i = 0; i < currentRouteWorldPoints.length - 1; i++) {
    const [ax, az] = currentRouteWorldPoints[i];
    const [bx, bz] = currentRouteWorldPoints[i + 1];
    const dx = bx - ax, dz = bz - az;
    const lenSq = dx * dx + dz * dz;
    let t = lenSq > 0 ? ((x - ax) * dx + (z - az) * dz) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx, pz = az + t * dz;
    const dist = Math.hypot(x - px, z - pz);
    if (dist < best) best = dist;
  }
  return best;
}

// Se sube al resubir solo los grafos v3 (no mapDataVersion, que haria bajar
// de nuevo los tiles). 3 = 06-10: cada sentido de un prefab por separado
// (los giros a la izquierda en un trebol iban por la rampa al reves).
// 4 = 07-10: el DLC de cada tramo, para evitar los DLC que no tenes.
// 5 = 10-10: el derecho de los cruces de calles anchas (el lazo de Bakersfield).
const ROUTE_GRAPH_V3_REV = 5;

// Flechas de carril (decodeLanesBin en pure.js): archivo aparte y chico
// (~90 KB en ATS), que se baja despues del grafo y solo sirve con ESE grafo
// (mismos nodos y aristas). Sin el, o en una variante que todavia no lo
// tiene, no hay flechas y nada mas. 0 = no se pide. 2 = 13-10, los de las
// 17 variantes (r2-upload-lanes del taller); el 1 quedo con un 404 guardado
// en el cache de Cloudflare (se pidio antes de subirlo y la regla "Mapas
// R2" guarda tambien los 404). 3 = 17-10, los mismos con la marca del
// carril que se pierde (+64 en el giro, LANE_DROP_BIT). Al regenerar
// grafos, regenerar tambien estos y subir el numero.
const ROUTE_LANES_REV = 3;
let routeLanes = null;
async function loadRouteLanes(base, v, game, decoded, graph) {
  routeLanes = null;
  if (!ROUTE_LANES_REV) return;
  try {
    const res = await fetch(`${base}-lanes.bin${v}&g=${ROUTE_GRAPH_V3_REV}&l=${ROUTE_LANES_REV}`, { priority: 'low' });
    if (!res.ok) return;
    const data = decodeLanesBin(await res.arrayBuffer(), decoded.n, decoded.ne);
    if (currentGame === game && routeGraph === graph) routeLanes = data;
  } catch (e) { /* sin flechas: la guia sigue igual */ }
}

// Las decimas de segundo de cada arista (decodeTimesBin en pure.js):
// archivo aparte y chico. El grafo guarda segundos enteros y con eso la
// recta de un cruce podia perder contra pasar por un brazo (rutas en V con
// un "turn left" falso). Se cuelgan del grafo (edgeT) y las usa el costo del
// A*; sin el archivo, segundos enteros como antes. 0 = no se pide: la regla
// de cache "Mapas R2" guarda los 404, nunca pedirlo antes de subirlo. 1 =
// 15-10, los de las 17 variantes (r2-upload-times del taller, generados por
// generar_tiempos.py contra los v3 publicados). Al regenerar grafos,
// regenerar tambien estos y subir el numero.
const ROUTE_TIMES_REV = 1;
async function loadRouteTimes(base, v, game, decoded, graph) {
  if (!ROUTE_TIMES_REV) return;
  try {
    const res = await fetch(`${base}-times.bin${v}&g=${ROUTE_GRAPH_V3_REV}&t=${ROUTE_TIMES_REV}`, { priority: 'low' });
    if (!res.ok) return;
    const data = decodeTimesBin(await res.arrayBuffer(), decoded.n, decoded.ne);
    if (data && currentGame === game && routeGraph === graph) graph.edgeT = data;
  } catch (e) { /* sin decimas: los segundos enteros */ }
}

async function loadRouteGraph(mapInfo) {
  routeGraph = null;
  routeLanes = null;
  // Baja por detras del mapa (ver loadGameMap): si mientras tanto se cambio
  // de variante, el grafo que llega tarde no pisa el de la nueva.
  const game = currentGame;
  const base = `${mapInfo.assetsDir}/route-graph-${currentGame}`;
  const v = `?v=${MAP_DATA_VERSION[currentGame] || ''}`;
  // Formato binario (TDRG v2, ver route_graph_bin.py): typed arrays, sin
  // parsear JSON. El JSON de 27 MB se volvia ~150 MB de objetos y tumbaba la
  // pestana en tablets con poca RAM; el .bin queda en ~25 MB en memoria y
  // carga en menos de un segundo. Desde el 22/9 en R2 solo esta el .bin (el
  // JSON era el respaldo de la transicion y se retiro, 254 MB); routeGraphFromJson
  // queda para cargar a mano un grafo local con ?jsongraph=<url> al depurar.
  const jsonUrl = new URLSearchParams(location.search).get('jsongraph');
  try {
    if (jsonUrl) {
      const res = await fetch(jsonUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const g = buildRouteGraph(routeGraphFromJson(await res.json()));
      if (currentGame === game) routeGraph = g;
      return;
    }
    // Primero el v3 (con la corrida para dibujar la ruta sobre la calzada de
    // la mano por la que se va); si esa variante todavia no lo tiene, el de
    // siempre, y la ruta se dibuja por el eje como antes. `g` cambia cuando
    // se resube solo el v3 (corridas corregidas, ruteo igual), para no tener
    // que subir MAP_DATA_VERSION y hacer bajar de nuevo los tiles.
    // Prioridad baja: con poca senal, primero los tiles que se ven.
    let res = await fetch(`${base}-v3.bin${v}&g=${ROUTE_GRAPH_V3_REV}`, { priority: 'low' }).catch(() => null);
    if (!res || !res.ok) res = await fetch(`${base}.bin${v}`, { priority: 'low' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const decoded = decodeRouteGraphBin(await res.arrayBuffer());
    const g = buildRouteGraph(decoded);
    if (currentGame === game) {
      routeGraph = g;
      // Solo con el v3: el archivo de carriles va por sus aristas
      if (decoded.shiftA) {
        loadRouteLanes(base, v, game, decoded, g);
        loadRouteTimes(base, v, game, decoded, g);
      }
    }
  } catch (err) {
    // Sin grafo el mapa y el tablero siguen andando; lo que no hay es ruteo.
    console.warn('no se pudo cargar el grafo de rutas', err);
    if (currentGame === game) routeGraph = null;
  }
}

// TDRG v2: header 'TDRG', u32 version, nNodes, nEdges, nMidPts, nComp; luego
// secciones alineadas a 4 bytes (ver route_graph_bin.py).
function decodeRouteGraphBin(buf) {
  const dv = new DataView(buf);
  const version = dv.getUint32(4, true);
  if (dv.getUint32(0, false) !== 0x54445247 || (version !== 2 && version !== 3)) throw new Error('formato de grafo desconocido');
  const n = dv.getUint32(8, true), ne = dv.getUint32(12, true), nMid = dv.getUint32(16, true), nComp = dv.getUint32(20, true);
  let off = 24;
  const take = (Ctor, count) => {
    const a = new Ctor(buf, off, count);
    off = (off + count * Ctor.BYTES_PER_ELEMENT + 3) & ~3;
    return a;
  };
  const nodesDm = take(Int32Array, n * 2);
  const edgeA = take(Uint32Array, ne), edgeB = take(Uint32Array, ne), edgeDm = take(Uint32Array, ne);
  const edgeS = take(Uint16Array, ne), edgeF = take(Uint8Array, ne);
  const midOff = take(Uint32Array, ne + 1), midDelta = take(Int32Array, nMid * 2);
  const nodes = new Float32Array(n * 2);
  for (let i = 0; i < n * 2; i++) nodes[i] = nodesDm[i] / 10;
  const edgeM = new Float32Array(ne);
  for (let e = 0; e < ne; e++) edgeM[e] = edgeDm[e] / 10;
  // puntos intermedios: delta acumulado en decimetros -> metros absolutos
  const midXY = new Float32Array(nMid * 2);
  let px = 0, py = 0;
  for (let i = 0; i < nMid; i++) {
    px += midDelta[2 * i]; py += midDelta[2 * i + 1];
    midXY[2 * i] = px / 10; midXY[2 * i + 1] = py / 10;
  }
  // v3: corrida de la ruta dibujada en cada punta de cada arista, en medios
  // metros con signo (+ a la derecha del sentido de marcha). Va despues de
  // grado, componente y tamanos de componente, que la web no lee (los arma
  // buildRouteGraph).
  let shiftA = null, shiftB = null, edgeG = null;
  if (version === 3) {
    take(Uint8Array, n); take(Int32Array, n); take(Uint32Array, nComp);
    shiftA = take(Int8Array, ne); shiftB = take(Int8Array, ne);
    // Desde el 07-10: el dlcGuard de cada arista, al final. Un grafo de antes
    // no lo trae y se rutea como siempre, sin filtro de DLC.
    if (buf.byteLength - off >= ne) edgeG = take(Uint8Array, ne);
  }
  return { n, ne, nodes, edgeA, edgeB, edgeM, edgeS, edgeF, midOff, midXY, shiftA, shiftB, edgeG };
}

// Mismo resultado a partir del JSON viejo {nodes: [[x,y]], edges: [[a,b,m,flags,seg,mid?]]}.
function routeGraphFromJson(data) {
  const n = data.nodes.length, ne = data.edges.length;
  const nodes = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { nodes[2 * i] = data.nodes[i][0]; nodes[2 * i + 1] = data.nodes[i][1]; }
  const edgeA = new Uint32Array(ne), edgeB = new Uint32Array(ne), edgeM = new Float32Array(ne), edgeS = new Uint16Array(ne), edgeF = new Uint8Array(ne);
  const midOff = new Uint32Array(ne + 1);
  let nMid = 0;
  for (let e = 0; e < ne; e++) { const mid = data.edges[e][5]; if (mid) nMid += mid.length; midOff[e + 1] = nMid; }
  const midXY = new Float32Array(nMid * 2);
  for (let e = 0; e < ne; e++) {
    const [a, b, w, flags, wt, mid] = data.edges[e];
    edgeA[e] = a; edgeB[e] = b; edgeM[e] = w; edgeS[e] = Math.min(65535, Math.round(wt != null ? wt : w / (60 / 3.6))); edgeF[e] = flags || 0;
    if (mid) for (let k = 0; k < mid.length; k++) { midXY[2 * (midOff[e] + k)] = mid[k][0]; midXY[2 * (midOff[e] + k) + 1] = mid[k][1]; }
  }
  return { n, ne, nodes, edgeA, edgeB, edgeM, edgeS, edgeF, midOff, midXY };
}

// Arma la adyacencia dirigida (CSR) y lo derivado: grado topologico (vecinos
// distintos, sin sentido: >= 3 es una interseccion real) y componentes
// conexas (el grafo del juego no queda 100% conectado; se prefiere siempre
// la componente gigante o una "real" de cientos de nodos, ver nearestNodeIndex).
// flags de arista: bit 1 = ferry/tren, bit 2 = un solo sentido (solo a -> b);
// sin flags = doble mano.
function buildRouteGraph(g) {
  const { n, ne, nodes, edgeA, edgeB, edgeM, edgeS, edgeF, midOff, midXY, shiftA = null, shiftB = null, edgeG = null } = g;
  const csr = new Uint32Array(n + 1);
  for (let e = 0; e < ne; e++) { csr[edgeA[e] + 1]++; if (!(edgeF[e] & 2)) csr[edgeB[e] + 1]++; }
  for (let i = 0; i < n; i++) csr[i + 1] += csr[i];
  const nDir = csr[n];
  const adjTo = new Uint32Array(nDir), adjEdge = new Uint32Array(nDir), adjRev = new Uint8Array(nDir);
  const fill = csr.slice(0, n);
  for (let e = 0; e < ne; e++) {
    const a = edgeA[e], b = edgeB[e];
    let k = fill[a]++; adjTo[k] = b; adjEdge[k] = e; adjRev[k] = 0;
    if (!(edgeF[e] & 2)) { k = fill[b]++; adjTo[k] = a; adjEdge[k] = e; adjRev[k] = 1; }
  }
  // grado y componentes sobre la version no dirigida (una arista de un
  // sentido tambien conecta topologicamente a sus dos nodos)
  const ucsr = new Uint32Array(n + 1);
  for (let e = 0; e < ne; e++) { ucsr[edgeA[e] + 1]++; ucsr[edgeB[e] + 1]++; }
  for (let i = 0; i < n; i++) ucsr[i + 1] += ucsr[i];
  const uto = new Uint32Array(ucsr[n]);
  const ufill = ucsr.slice(0, n);
  for (let e = 0; e < ne; e++) { uto[ufill[edgeA[e]]++] = edgeB[e]; uto[ufill[edgeB[e]]++] = edgeA[e]; }
  const degree = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let d = 0;
    for (let k = ucsr[i]; k < ucsr[i + 1]; k++) {
      const t = uto[k]; let seen = false;
      for (let j = ucsr[i]; j < k; j++) if (uto[j] === t) { seen = true; break; }
      if (!seen) d++;
    }
    degree[i] = Math.min(255, d);
  }
  const componentId = new Int32Array(n).fill(-1);
  const sizes = [];
  const stack = new Uint32Array(n);
  for (let start = 0; start < n; start++) {
    if (componentId[start] !== -1) continue;
    const id = sizes.length; let size = 0, top = 0;
    stack[top++] = start; componentId[start] = id;
    while (top) {
      const cur = stack[--top]; size++;
      for (let k = ucsr[cur]; k < ucsr[cur + 1]; k++) { const nb = uto[k]; if (componentId[nb] === -1) { componentId[nb] = id; stack[top++] = nb; } }
    }
    sizes.push(size);
  }
  const componentSize = Uint32Array.from(sizes);
  let giantComponent = 0;
  for (let c = 1; c < componentSize.length; c++) if (componentSize[c] > componentSize[giantComponent]) giantComponent = c;
  const graph = {
    n, nodes, csr, adjTo, adjEdge, adjRev, edgeM, edgeS, edgeF, midOff, midXY, shiftA, shiftB, edgeG, degree, componentId, componentSize, giantComponent,
    nodeXY: (i) => [nodes[2 * i], nodes[2 * i + 1]],
    // vista "de antes" para detectManeuver y cualquier otro consumidor:
    // adjacency.get(i) -> [[vecino, metros, segundos], ...]
    adjacency: {
      get(i) {
        const out = [];
        for (let k = csr[i]; k < csr[i + 1]; k++) { const e = adjEdge[k]; out.push([adjTo[k], edgeM[e], edgeS[e]]); }
        return out;
      },
    },
  };
  // indice de arista dirigida entre dos nodos (-1 si no existe)
  graph.dirEdge = (from, to) => { for (let k = csr[from]; k < csr[from + 1]; k++) if (adjTo[k] === to) return k; return -1; };
  // Los nodos con un tramo hacia i (laneFromOnRamp: si en un cruce se suma
  // una calle). La adyacencia al reves se arma la primera vez que se pide.
  let inCsr = null, inFrom = null;
  graph.incoming = (i) => {
    if (!inCsr) {
      inCsr = new Uint32Array(n + 1);
      for (let k = 0; k < nDir; k++) inCsr[adjTo[k] + 1]++;
      for (let j = 0; j < n; j++) inCsr[j + 1] += inCsr[j];
      inFrom = new Uint32Array(nDir);
      const pos = inCsr.slice(0, n);
      for (let a = 0; a < n; a++) for (let k = csr[a]; k < csr[a + 1]; k++) inFrom[pos[adjTo[k]]++] = a;
    }
    return inFrom.subarray(inCsr[i], inCsr[i + 1]);
  };
  return graph;
}

// Bolsones de pocos nodos = intersecciones mal resueltas por el parser; una
// componente de cientos de nodos es una isla real (Gran Bretana, Islandia,
// Sicilia...) y hay que poder rutear dentro de ella aunque no este unida al
// continente. Con las aristas de ferry en el grafo casi todo termina en una
// sola componente, pero por las dudas se admite cualquiera de este tamano.
const MIN_REAL_COMPONENT_NODES = 300;

// nodeOk: si viene, solo nodos con algun tramo que se pueda usar (DLC); y
// tambien alsoOk (slowNodes, para terminar en una parada).
function nearestNodeIndex(x, y, requireGiantComponent, onlyComponent = -1, nodeOk = null, alsoOk = null) {
  let best = -1;
  let bestDist = Infinity;
  const nodes = routeGraph.nodes;
  const n = routeGraph.n;
  const compId = routeGraph.componentId, compSize = routeGraph.componentSize, giant = routeGraph.giantComponent;
  for (let i = 0; i < n; i++) {
    if (nodeOk && !nodeOk[i]) continue;
    if (alsoOk && !alsoOk[i]) continue;
    const comp = compId[i];
    if (onlyComponent !== -1) {
      if (comp !== onlyComponent) continue;
    } else if (requireGiantComponent === true) {
      if (comp !== giant) continue;
    } else if (requireGiantComponent === 'real') {
      if (compSize[comp] < MIN_REAL_COMPONENT_NODES) continue;
    }
    const dx = nodes[2 * i] - x;
    const dy = nodes[2 * i + 1] - y;
    const d = dx * dx + dy * dy;
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

// Min-heap simple para A*.
class MinHeap {
  constructor() { this.items = []; }
  push(priority, value) {
    this.items.push([priority, value]);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent][0] <= this.items[i][0]) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }
  pop() {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      while (true) {
        const l = 2 * i + 1, r = 2 * i + 2;
        let smallest = i;
        if (l < this.items.length && this.items[l][0] < this.items[smallest][0]) smallest = l;
        if (r < this.items.length && this.items[r][0] < this.items[smallest][0]) smallest = r;
        if (smallest === i) break;
        [this.items[i], this.items[smallest]] = [this.items[smallest], this.items[i]];
        i = smallest;
      }
    }
    return top ? top[1] : undefined;
  }
  get size() { return this.items.length; }
}

// Que tramos se pueden usar segun los DLC: { blocked: Uint8Array(64) por
// dlcGuard, nodeOk: Uint8Array(n) } para el grafo cargado. conElecciones =
// false: solo lo no publicado afuera, sin lo que destildo la persona.
let dlcFilterCache = { graph: null, byKey: new Map() };
function dlcFilter(conElecciones) {
  if (!routeGraph || !routeGraph.edgeG) return null;
  const game = dlcGameOf(currentGame);
  const off = conElecciones ? dlcOffFor(game) : [];
  const key = `${game}|${off.join(',')}`;
  if (dlcFilterCache.graph !== routeGraph) dlcFilterCache = { graph: routeGraph, byKey: new Map() };
  if (dlcFilterCache.byKey.has(key)) return dlcFilterCache.byKey.get(key);
  const blocked = dlcBlockedGuards(game, off);
  const { n, csr, adjTo, adjEdge, edgeG } = routeGraph;
  const nodeOk = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    for (let k = csr[i]; k < csr[i + 1]; k++) {
      if (!blocked[edgeG[adjEdge[k]]]) { nodeOk[i] = 1; nodeOk[adjTo[k]] = 1; }
    }
  }
  const value = { blocked, nodeOk };
  dlcFilterCache.byKey.set(key, value);
  return value;
}

// La ruta con los DLC de la persona. Si no hay camino sin un DLC que
// destildo (el destino esta adentro, o no hay forma de rodearlo), la de
// todos los publicados, marcada para avisar. Y si ni asi, como antes del
// filtro: nunca peor que sin el.
// startHeading: el rumbo del juego si el camion viene andando (ver
// routeStartHeading); la ruta arranca en su tramo y no da la vuelta.
// penal: Map arista -> multiplicador del costo, para buscar alternativas
// (routeLikeGame), y previas, las ya encontradas; tramo, para pasar por un
// waypoint (ver findRouteWith).
function findRoute(startXY, endXY, startHeading = null, penal = null, previas = null, tramo = null) {
  if (!routeGraph) return null;
  const propio = dlcFilter(true);
  let ruta = findRouteWith(startXY, endXY, propio, startHeading, penal, previas, tramo);
  if (ruta || !propio) return ruta;
  if (dlcOffFor(dlcGameOf(currentGame)).length) {
    ruta = findRouteWith(startXY, endXY, dlcFilter(false), startHeading, penal, previas, tramo);
    if (ruta) { ruta.usesUncheckedDlc = true; return ruta; }
  }
  return findRouteWith(startXY, endXY, null, startHeading, penal, previas, tramo);
}

// Las aristas del grafo de una ruta (sus puntos con indice de nodo) y lo que
// tarda por ellas, en segundos del grafo.
function routeEdgesOf(points) {
  const out = [];
  let prev = null;
  for (const p of points || []) {
    if (p[4] == null) continue;
    if (prev != null) {
      const d = routeGraph.dirEdge(prev, p[4]);
      if (d !== -1) out.push(routeGraph.adjEdge[d]);
    }
    prev = p[4];
  }
  return out;
}
function routeSecondsOf(points) {
  const { edgeS, edgeT } = routeGraph;
  return routeEdgesOf(points).reduce((s, e) => s + edgeS[e] + (edgeT ? edgeT[e] / 10 : 0), 0);
}

// La ruta mas rapida, o una casi igual que va por donde el GPS del juego
// (pickRouteLikeGame, pure.js). La app rutea sola y el juego solo dice
// cuanto falta: con 3 s de diferencia, la app mandaba por la I-84 y el GPS
// del juego por la I-80 (Salt Lake City, Discord 19-10). Las alternativas
// (routeAlternatives) se buscan solo si el largo no coincide con el juego.
// Devuelve { leg, switched }.
function routeLikeGame(leg, from, to, rumbo, gameKm, tramo = null) {
  if (!leg || routeGameAgreement(gameKmOf(leg, leg), gameKm) !== 'differ') return { leg, switched: false };
  const rutas = routeAlternatives(leg, (penal, previas) => findRoute(from, to, rumbo, penal, previas, tramo), routeEdgesOf);
  const k = pickRouteLikeGame(rutas.map(r => ({ km: gameKmOf(r, r), seconds: routeSecondsOf(r) })), gameKm);
  return { leg: rutas[k], switched: k > 0 };
}

// Si el GPS del juego va al mismo lugar que nuestra ruta: un trabajo con la
// empresa conocida y sin waypoints (el juego no sabe de los nuestros, y con
// el centro de la ciudad el largo no se puede comparar).
function gameRouteComparable(target) {
  return !!target && (target.kind === 'dest' || target.kind === 'pickup') && !target.approx && !waypoints.length;
}

// Recien tomado el trabajo el GPS del juego puede no tener todavia la ruta
// nueva, y la comparacion de routeLikeGame se hizo con el dato viejo. Si
// unos datos despues todavia no coincide y una alternativa si, se recalcula
// una vez. Despues de elegir una alternativa no: volveria a la mas rapida.
const ROUTE_GAME_RECHECK_TICKS = 3;
let routeGameCheck = { key: null, left: 0, ticks: 0 };
function routeGameRecheck(routeKey, target, data) {
  const c = routeGameCheck;
  if (c.key !== routeKey || c.left <= 0 || !currentRouteWorldPoints || !gameRouteComparable(target)) return false;
  const acuerdo = routeGameAgreement(gameKmOf(currentRouteWorldPoints), data.routeDistanceKm);
  if (acuerdo === 'agree') { c.left = 0; return false; }
  c.ticks = acuerdo === 'differ' ? c.ticks + 1 : 0;
  if (c.ticks < ROUTE_GAME_RECHECK_TICKS) return false;
  c.left = 0;
  const from = [data.position.x, data.position.z], rumbo = routeStartHeading(data);
  const tramo = { entrar: true }; // gameRouteComparable: una empresa
  return routeLikeGame(findRoute(from, [target.x, target.z], rumbo, null, null, tramo), from, [target.x, target.z], rumbo, data.routeDistanceKm, tramo).switched;
}

// El rumbo con que arranca la ruta al recalcular: el del juego, solo si el
// camion viene andando para adelante. Parado en el deposito el rumbo no dice
// por donde va a salir: ahi, el nodo mas cercano como siempre. Parado sobre
// la ruta de antes (sobreLaRuta, recalcOnRoute en pure.js) si lo dice.
const ROUTE_HEADING_MIN_KMH = 15;
function routeStartHeading(data, sobreLaRuta = false) {
  return data && Number.isFinite(data.heading) && (sobreLaRuta || Number(data.speedKmh) >= ROUTE_HEADING_MIN_KMH) ? data.heading : null;
}

// penal y previas: para una alternativa (routeAlternatives), las aristas
// encarecidas y las rutas ya encontradas, de las que no se desvia por una
// salida o un area de descanso para volver a entrar (dropRouteDetours).
// tramo: { entrar } para un lugar al que se entra (una parada, una empresa:
// el nodo de una calle o un prefab antes que el de la autopista), y en una
// ruta con waypoints { desde, pasar, siguiente }. pasar: el
// tramo llega a un waypoint y pasa por el sobre su calle (waypointArcs,
// pure.js), no por el nodo mas cercano; la ruta devuelta trae en .llegada
// por donde paso, y el tramo siguiente arranca ahi (desde), en el mismo
// sentido. siguiente: { xy, pasar } del tramo que sigue, para elegir entre
// los carriles de un cruce por el que pasa el waypoint. La ruta devuelta
// trae en .cost lo que cuesta (sin el A* por nodos).
function findRouteWith(startXY, endXY, filtro, startHeading = null, penal = null, previas = null, tramo = null) {
  const { nodes, csr, adjTo, adjEdge, adjRev, edgeM, edgeS, edgeT, edgeF, midOff, midXY, degree, componentId, edgeG } = routeGraph;
  const blocked = filtro ? filtro.blocked : null;
  const nodeOk = filtro ? filtro.nodeOk : null;
  // Origen y destino tienen que caer en la misma componente para que A*
  // encuentre camino: primero el nodo mas cercano en cualquier componente
  // real; si no coinciden (ej. destino en una isla sin ferry en el grafo),
  // se re-snapea el destino dentro de la componente del origen (ruta hasta
  // el punto mas cercano alcanzable, mejor que nada).
  // Andando, el origen es el tramo por el que va el camion, en su sentido
  // (startArcForHeading, pure.js): el nodo mas cercano podia ser de la
  // calzada contraria, de otra rampa o estar a cientos de metros.
  const { componentSize } = routeGraph;
  const arcoOk = (e, a) => (!blocked || !blocked[edgeG[e]]) && componentSize[componentId[a]] >= MIN_REAL_COMPONENT_NODES;
  let arranque = tramo && tramo.desde ? tramo.desde
    : startHeading != null ? startArcForHeading(routeGraph, startXY[0], startXY[1], startHeading, { edgeOk: arcoOk }) : null;
  let startIdx = arranque ? arranque.to : nearestNodeIndex(startXY[0], startXY[1], 'real', -1, nodeOk);
  let endIdx = nearestNodeIndex(endXY[0], endXY[1], 'real', -1, nodeOk);
  if (startIdx === -1 || endIdx === -1) return null;
  if (componentId[startIdx] !== componentId[endIdx]) {
    endIdx = nearestNodeIndex(endXY[0], endXY[1], false, componentId[startIdx], nodeOk);
    if (endIdx === -1) return null;
  }
  const metas = tramo && tramo.pasar
    ? waypointArcs(routeGraph, endXY[0], endXY[1], { edgeOk: arcoOk }).filter(c => componentId[c.to] === componentId[startIdx]) : [];
  // Un lugar al que se entra (estacion, area de descanso, empresa) pegado a
  // una via rapida: el nodo de la autopista dejaba la ruta pasando de largo.
  // El de una calle o un prefab mas cercano, si no queda mucho mas lejos
  // (slowNodes, pure.js).
  if (tramo && tramo.entrar) {
    const lentos = slowNodes(routeGraph);
    if (!lentos[endIdx]) {
      const j = nearestNodeIndex(endXY[0], endXY[1], false, componentId[endIdx], nodeOk, lentos);
      const dist = (i) => Math.hypot(nodes[2 * i] - endXY[0], nodes[2 * i + 1] - endXY[1]);
      if (j !== -1 && dist(j) <= dist(endIdx) + STOP_SLOW_NODE_M) endIdx = j;
    }
  }

  // Perfil de ruteo: "fastest" pesa por tiempo (prefiere autopista, como el
  // GPS del juego), "shortest" por metros (mas unos metros por segundo:
  // routeEdgeCost). La heuristica de A* tiene que ser admisible: distancia
  // recta, a la velocidad maxima posible (90 km/h).
  const byTime = routeProfile !== 'shortest';
  const MAX_SPEED_MS = 90 / 3.6;
  // Pasando por un waypoint, la recta hasta el, menos lo que puede quedar
  // corrido el punto de su calle por donde se pasa
  let ex = nodes[2 * endIdx], ey = nodes[2 * endIdx + 1], holgura = 0;
  if (metas.length) {
    ex = endXY[0]; ey = endXY[1];
    holgura = Math.max(...metas.map(c => Math.hypot(c.point[0] - ex, c.point[1] - ey)));
  }
  const heuristic = (i) => {
    const d = Math.max(0, Math.hypot(nodes[2 * i] - ex, nodes[2 * i + 1] - ey) - holgura);
    return byTime ? d / MAX_SPEED_MS : d * (1 + ROUTE_SHORT_M_PER_S / MAX_SPEED_MS);
  };

  // Primero sin vueltas en U en los nodos (findArcRoute, pure.js): A* por
  // aristas. Si asi no hay camino (algun rincon raro del grafo), el A* por
  // nodos de siempre: nunca peor que antes.
  const costo = (e) => routeEdgeCost(edgeT ? edgeS[e] + edgeT[e] / 10 : edgeS[e], edgeM[e], byTime) * (penal ? (penal.get(e) || 1) : 1);
  const finales = metas.length ? new Map(metas.map(c => [c.arc, c.f])) : null;
  const porAristas = (desde, arco, hasta = finales) => findArcRoute(routeGraph, desde, endIdx, {
    cost: costo,
    heuristic,
    blocked: blocked ? (e) => !!blocked[edgeG[e]] : null,
    isFerry: (e) => (edgeF[e] & 1) === 1,
    startArc: arco,
    endArcs: hasta,
  });
  // El waypoint mas adelante en el mismo tramo por el que se arranca (dos
  // waypoints en la misma arista larga): se llega derecho, sin dar la vuelta
  const enElTramo = arranque ? metas.find(c => c.arc === arranque.arc && c.f >= arranque.f) : null;
  if (enElTramo) {
    const entre = arranque.rest.slice(0, Math.max(0, arranque.rest.length - enElTramo.rest.length));
    const out = [arranque.point, ...entre, enElTramo.point].map(p => [p[0], p[1], 0, 0, null]);
    out.llegada = enElTramo;
    out.cost = (enElTramo.f - arranque.f) * costo(adjEdge[arranque.arc]);
    return out;
  }
  let path = porAristas(startIdx, arranque ? arranque.arc : null);
  // Andando por carriles de un prefab que todavia no se separan, el camion
  // esta casi igual de cerca de varios (arranque.alts, startArcForHeading):
  // sigue por el que da la ruta mas barata, contando lo que falta del tramo.
  // Con el mas cercano solo, el camion que seguia derecho a veces doblaba
  // por el otro carril y la ruta daba una vuelta de 1 a 10 km.
  if (arranque && arranque.alts && arranque.alts.length) {
    const total = (c, p) => {
      let t = (1 - c.f) * costo(adjEdge[c.arc]);
      for (let k = 1; k < p.length; k++) {
        const ultimo = k === p.length - 1 && p.endArc != null;
        const d = ultimo ? p.endArc : routeGraph.dirEdge(p[k - 1], p[k]);
        t += d === -1 ? Infinity : costo(adjEdge[d]) * (ultimo ? finales.get(p.endArc) : 1);
      }
      return t;
    };
    let mejor = path ? total(arranque, path) : Infinity;
    for (const c of arranque.alts) {
      if (componentId[c.to] !== componentId[endIdx]) continue;
      const p = porAristas(c.to, c.arc);
      const t = p ? total(c, p) : Infinity;
      if (t < mejor) { mejor = t; path = p; arranque = c; startIdx = c.to; }
    }
  }
  if (!path && finales) {
    // Sin camino que pase por la calle del waypoint: al nodo mas cercano, como antes
    finales.clear();
    ex = nodes[2 * endIdx]; ey = nodes[2 * endIdx + 1]; holgura = 0;
    path = porAristas(startIdx, arranque ? arranque.arc : null);
  }
  path = path || nodeRoutePath(startIdx, endIdx, byTime, heuristic, blocked);
  if (!path) return null;
  let llegada = path.endArc != null ? metas.find(c => c.arc === path.endArc) || null : null;
  // Un waypoint en medio de un cruce queda cerca de varios carriles, y el que
  // se alcanza mas barato puede ser el de otra salida: el tramo siguiente
  // daba la vuelta (9 de 1.189 waypoints simulados sobre la ruta). Entre ese
  // y los dos mas cercanos, el que da menos sumando el tramo que sigue.
  if (llegada && tramo.siguiente) {
    const probar = [llegada, ...metas.slice(0, 2).filter(c => c !== llegada)];
    let mejor = null;
    for (const c of probar) {
      const p1 = c === llegada ? path : porAristas(startIdx, arranque ? arranque.arc : null, new Map([[c.arc, c.f]]));
      if (!p1 || p1.endArc == null) continue;
      const r2 = probar.length > 1
        ? findRouteWith(endXY, tramo.siguiente.xy, filtro, null, null, null, { desde: c, pasar: tramo.siguiente.pasar }) : null;
      const t = p1.cost + (r2 && r2.cost != null ? r2.cost : 0);
      if (probar.length > 1 && !(r2 && r2.cost != null)) continue;
      if (!mejor || t < mejor.t) mejor = { t, p1, c };
    }
    if (mejor) { path = mejor.p1; llegada = mejor.c; }
  }
  if (previas) {
    const arista = (a, b) => {
      const d = routeGraph.dirEdge(a, b);
      if (d === -1) return null;
      const e = adjEdge[d];
      return { m: edgeM[e], cost: routeEdgeCost(edgeT ? edgeS[e] + edgeT[e] / 10 : edgeS[e], edgeM[e], byTime) };
    };
    for (const r of previas) path = dropRouteDetours(path, r.filter(p => p[4] != null).map(p => p[4]), arista);
  }
  // Cada punto: [x, y, ferry, junction]. ferry = 1 si el tramo que LLEGA a
  // el es un ferry/tren (dibujado punteado, sin anunciar giros en el mar);
  // junction = 1 si el nodo es una interseccion real (3+ vecinos), que es
  // el unico lugar donde se anuncia un giro.
  // El 5to elemento es el indice del nodo en el grafo: lo usa la deteccion
  // de bifurcaciones (detectManeuver) para mirar que otras salidas hay.
  // Entre nodo y nodo se intercalan los puntos de la curva real del tramo
  // (si la arista los trae): no son cruces (junction 0) ni nodos (indice
  // null), solo geometria para dibujar/proyectar/medir rumbos. Para el
  // sentido inverso de la arista se recorren al reves.
  // 7mo elemento (grafo v3): cuanto correr ese punto al dibujarlo, en metros,
  // + a la derecha del sentido de marcha (ver routeDrawShift en pure.js). Se
  // reparte a lo largo de la arista entre la corrida de sus dos puntas.
  const { shiftA, shiftB } = routeGraph;
  // Arrancando en el tramo del camion: el punto del camion sobre el y lo que
  // queda de su curva, antes del primer nodo.
  const out = arranque ? [arranque.point, ...arranque.rest].map(p => [p[0], p[1], 0, 0, null]) : [];
  for (let k = 0; k < path.length; k++) {
    const i = path[k];
    // Pasando por un waypoint, el ultimo arco llega hasta su punto, no al nodo
    const hastaWaypoint = llegada && k === path.length - 1;
    let ferry = 0;
    let desde = -1, sIni = 0, sFin = 0;
    if (k > 0) {
      const prev = path[k - 1];
      const d = hastaWaypoint ? llegada.arc : routeGraph.dirEdge(prev, i);
      if (d !== -1) {
        const e = adjEdge[d];
        ferry = edgeF[e] & 1 ? 1 : 0;
        if (shiftA) {
          desde = out.length - 1;
          sIni = (adjRev[d] ? shiftB[e] : shiftA[e]) / 2;
          sFin = (adjRev[d] ? shiftA[e] : shiftB[e]) / 2;
          if (hastaWaypoint) sFin = sIni + (sFin - sIni) * llegada.f;
        }
        const m0 = midOff[e], m1 = midOff[e + 1];
        if (hastaWaypoint) { for (const q of llegada.before) out.push([q[0], q[1], 0, 0, null]); }
        else if (adjRev[d]) { for (let m = m1 - 1; m >= m0; m--) out.push([midXY[2 * m], midXY[2 * m + 1], 0, 0, null]); }
        else { for (let m = m0; m < m1; m++) out.push([midXY[2 * m], midXY[2 * m + 1], 0, 0, null]); }
      }
    }
    out.push(hastaWaypoint ? [llegada.point[0], llegada.point[1], ferry, 0, null] : [nodes[2 * i], nodes[2 * i + 1], ferry, degree[i] >= 3 ? 1 : 0, i]);
    if (desde >= 0) spreadEdgeShift(out, desde, sIni, sFin);
    else if (k === 0 && arranque && shiftA) {
      const e = adjEdge[arranque.arc], r = adjRev[arranque.arc];
      const sCola = (r ? shiftB[e] : shiftA[e]) / 2, sPunta = (r ? shiftA[e] : shiftB[e]) / 2;
      spreadEdgeShift(out, 0, sCola + (sPunta - sCola) * arranque.f, sPunta);
    }
  }
  if (llegada) out.llegada = llegada;
  if (path.cost != null) out.cost = (arranque ? (1 - arranque.f) * costo(adjEdge[arranque.arc]) : 0) + path.cost;
  return out;
}

// El A* por nodos de antes (puede dar la vuelta en un nodo): solo si el de
// aristas no encuentra camino. Devuelve los indices de nodo o null.
function nodeRoutePath(startIdx, endIdx, byTime, heuristic, blocked) {
  const { csr, adjTo, adjEdge, edgeM, edgeS, edgeT, edgeG } = routeGraph;
  // Estado de A* en typed arrays (sin Maps/Sets: 300k nodos entran en unos MB
  // y no generan basura para el GC).
  const n = routeGraph.n;
  const gScore = new Float64Array(n).fill(Infinity);
  const cameFrom = new Int32Array(n).fill(-1);
  const visited = new Uint8Array(n);
  gScore[startIdx] = 0;
  const open = new MinHeap();
  open.push(heuristic(startIdx), startIdx);

  while (open.size > 0) {
    const current = open.pop();
    if (current === endIdx) break;
    if (visited[current]) continue;
    visited[current] = 1;
    const g = gScore[current];
    for (let k = csr[current]; k < csr[current + 1]; k++) {
      const neighbor = adjTo[k];
      if (visited[neighbor]) continue;
      const e = adjEdge[k];
      if (blocked && blocked[edgeG[e]]) continue;
      const tentativeG = g + routeEdgeCost(edgeT ? edgeS[e] + edgeT[e] / 10 : edgeS[e], edgeM[e], byTime);
      if (tentativeG < gScore[neighbor]) {
        gScore[neighbor] = tentativeG;
        cameFrom[neighbor] = current;
        open.push(tentativeG + heuristic(neighbor), neighbor);
      }
    }
  }

  if (gScore[endIdx] === Infinity) return null;
  const path = [endIdx];
  let node = endIdx;
  while (cameFrom[node] !== -1) {
    node = cameFrom[node];
    path.push(node);
  }
  return path.reverse();
}

// Objetivo de la ruta, en orden de preferencia: la empresa de carga (si hay
// trabajo tomado pero la carga todavia no se subio - ahi es adonde te manda
// el GPS del juego), la empresa de destino exacta (token empresa + ciudad
// via POIs), el centro de la ciudad de destino (Cities.json), o - sin
// trabajo - el ultimo waypoint puesto a mano (ej. "combustible mas cercano").
// Ruta borrada a mano: se recuerda de que viaje era para no volver a
// dibujarla hasta que cambie el trabajo (PR #1 de Vladimir Kutkovoy).
let dismissedRouteIdentity = null;
// Los waypoints que se llevo el borrado, para devolverlos con "Mostrar ruta":
// { game: variante, list } (plainWaypoints). Sin trabajo, o con un destino
// que no esta en el mapa, la ruta era solo eso (Discord, 15-10).
let dismissedStops = null;
function dismissedStopList() {
  return dismissedStops && dismissedStops.game === currentGame ? dismissedStops.list : [];
}
// Un waypoint puesto a mano es pedir una ruta: despues de borrarla quedaba
// escondido hasta que cambiara el trabajo. El de seguir al lider del convoy
// no pasa por aca: se vuelve a poner solo y deshacia el borrado.
function endRouteDismissal() {
  dismissedRouteIdentity = null;
  dismissedStops = null;
}
let routeProgressState = { key: null, total: 0 };
let routeSummaryEtaSeconds = null;
// El total de la barra de progreso por ruta, para que recargar no la vuelva a
// cero (ver routeProgressTotal en pure.js). { key, total, at }.
const ROUTE_PROGRESS_KEY = 'truckdash_route_progress';
function readRouteProgress() {
  try { return JSON.parse(lsGet(ROUTE_PROGRESS_KEY) || 'null'); } catch (e) { return null; }
}
// Borrar los waypoints, o llegar al ultimo, termina ese viaje: una ruta nueva
// al mismo lugar mide desde donde este el camion y no contra el total
// guardado (Gargamosch, 12-10). Solo rutas de waypoints: con un trabajo la
// barra es la del trabajo, y se reinicia sola al terminarlo o cancelarlo.
function forgetWaypointTrip() {
  if (routeProgressState.kind !== 'waypoint') return;
  const stored = readRouteProgress();
  if (stored && stored.key === routeProgressState.key) lsSet(ROUTE_PROGRESS_KEY, 'null');
  routeProgressState = { key: null, total: 0 };
}

// routeIdentity esta en pure.js, con routeDismissed (el "Ruta oculta").
function resolveRouteTarget(data) {
  if (dismissedRouteIdentity != null) {
    if (dismissedRouteIdentity === routeIdentity(data)) return null;
    // Cambio el viaje: el borrado ya cumplio. Si quedaba, al entregar el
    // trabajo siguiente el viaje "sin trabajo" volvia a ser el borrado y la
    // ruta se escondia otra vez.
    endRouteDismissal();
  }
  return resolveRawRouteTarget(data);
}

function resolveRawRouteTarget(data) {
  // Trabajo tomado pero carga todavia no enganchada: hay que ir a buscarla.
  // Empresa exacta si esta en los POIs; si no, el centro de la ciudad de
  // ORIGEN (antes caia al destino, que es justo a donde no hay que ir aun).
  // Clientes < 1.3.1 no mandan onJob/isCargoLoaded/companySrcId y quedan
  // con la ruta al destino - por eso el aviso de actualizacion.
  if (data.onJob && data.isCargoLoaded === false) {
    const pickup = (data.companySrcId ? findCompanyPoi(data.companySrcId, data.citySrcId) : null)
      || findCompanyPoiByName(data.companySrc, data.citySrcId);
    if (pickup) return { x: pickup.x, z: pickup.z, kind: 'pickup', key: `pickup:${pickup.token}@${pickup.city}` };
    const srcCity = findCity(data.citySrcId, data.citySrc);
    // approx: esto es el centro del pueblo, no el lugar de carga. Se marca
    // para poder decirlo en pantalla en vez de fingir precision.
    if (srcCity) return { x: srcCity.X, z: srcCity.Y, kind: 'pickup', key: `pickupcity:${data.citySrc}`, approx: true };
  }
  // Sin trabajo no hay destino, aunque cityDst siga (hasJobDestination).
  if (hasJobDestination(data)) {
    const company = (data.companyDstId ? findCompanyPoi(data.companyDstId, data.cityDstId) : null)
      || findCompanyPoiByName(data.companyDst, data.cityDstId);
    if (company) return { x: company.x, z: company.z, kind: 'dest', key: `dest:${company.token}@${company.city}` };
    const city = findCity(data.cityDstId, data.cityDst);
    if (city) return { x: city.X, z: city.Y, kind: 'dest', key: `city:${data.cityDstId || data.cityDst}`,
                       approx: true, market: data.specialJob ? 'special_transport' : (data.jobMarket || null) };
  }
  if (waypoints.length) {
    const last = waypoints[waypoints.length - 1];
    return { x: last.pos[0], z: last.pos[1], kind: 'waypoint', key: waypointRouteKey(waypoints) };
  }
  return null;
}

function resetDisplayedRoute() {
  dismissedRouteIdentity = lastData ? routeIdentity(lastData) : null;
  dismissedStops = { game: currentGame, list: plainWaypoints(waypoints) };
  clearWaypoint();
  setWaypointMode(false);
  currentRouteWorldPoints = null;
  routeProgressState = { key: null, total: 0 };
  setRouteData(emptyLineString());
  for (const id of ['route-next', 'route-ferry']) {
    if (map && map.getSource(id)) map.getSource(id).setData(emptyLineString());
  }
  if (destMarker) { destMarker.remove(); destMarker = null; }
  document.getElementById('navPanel').style.display = 'none';
  // Ya con el "Ruta oculta" y su boton, sin esperar al proximo dato.
  if (lastData) updateRouteSummary(lastData); else renderRouteSummary(null);
  if (typeof convoyOnRouteChanged === 'function') convoyOnRouteChanged();
  sendLiveRoute(true);
}

// Volver a mostrar la ruta borrada a mano, desde el "Ruta oculta" del
// resumen (routeDismissed en pure.js), con los waypoints que se llevo. Van
// antes del de seguir al lider del convoy, si se volvio a poner.
function restoreDismissedRoute() {
  const stops = dismissedStopList();
  endRouteDismissal();
  if (toLngLat) stops.forEach((w, i) => addWaypoint(w.pos, toLngLat(w.pos[0], w.pos[1]), w.inGame, w.label, w.kind || null, i));
  invalidateRoute();
  if (lastData) { updateDestinationMarker(lastData); updateRouteSummary(lastData); }
  sendLiveRoute(true);
}

// El resumen a la vista y con numeros: en "Ruta oculta" o con el aviso de
// destino fuera del mapa se ve pero no tiene.
function routeSummaryShown() {
  const panel = document.getElementById('routeSummary');
  return !!panel && !panel.hidden && !panel.classList.contains('dismissed') && !panel.classList.contains('offmap');
}

// Ciudades y POIs de la variante ya cargados (o los POIs fallaron): recien
// ahi que no se encuentre el destino quiere decir algo (offMapJobPlace).
function jobPlacesReady() {
  return !!currentGame && citiesMap === GAME_MAPS[currentGame] && poisVariant === currentGame && !poisLoading;
}

// view: null (sin ruta), { dismissed: true } (borrada a mano, con el boton
// para traerla), { offMap: nombre } (trabajo a un lugar que no esta en el
// mapa, con el boton para poner un waypoint) o los numeros de la ruta.
function renderRouteSummary(view) {
  const panel = document.getElementById('routeSummary');
  if (!panel) return;
  panel.hidden = !view;
  panel.classList.toggle('dismissed', !!(view && view.dismissed));
  panel.classList.toggle('offmap', !!(view && view.offMap));
  document.getElementById('mapPanel').classList.toggle('hasRouteSummary', !!view);
  if (view && view.offMap) document.getElementById('routeOffMapText').textContent = t('routeOffMap').replace('{name}', view.offMap);
  keepPanelsClearOfRouteSummary();
  if (!view || view.dismissed || view.offMap) return;
  const bar = document.getElementById('routeProgressBar');
  bar.style.width = `${view.percent}%`;
  bar.parentElement.title = `${Math.round(view.percent)}%`;
  document.getElementById('routeRemaining').textContent = view.remaining;
  document.getElementById('routeDuration').textContent = view.duration;
  document.getElementById('routeArrival').textContent = view.arrival;
  // Cuando el destino es el centro de la ciudad y no la empresa, se dice.
  // Un error de ~900 m sin explicacion se lee como un destino equivocado.
  // La proxima parada propia, a la vista con su boton para saltearla: antes
  // solo se sacaba tocando el marcador (que en modo navegacion queda fuera
  // de pantalla si quedo atras) o desde el panel de info (Discord, 10-10).
  const parada = document.getElementById('routeStop');
  if (parada) {
    const wp = waypoints[0];
    parada.hidden = !wp;
    if (wp) document.getElementById('routeStopName').textContent = t('routeNextStop').replace('{name}', wp.label || `${t('waypoint')} 1`);
  }
  const aviso = document.getElementById('routeApprox');
  if (aviso) {
    const textos = [view.pickup || null, view.approx ? t('destApprox') : null, view.dlc ? t('dlcRouteNotice') : null].filter(Boolean);
    aviso.hidden = !textos.length;
    if (textos.length) aviso.textContent = textos.join(' ');
  }
}

// Resumen de la ruta arriba del mapa: barra de progreso, lo que falta, el
// tiempo real restante y la hora de llegada estimada (PR #1).
function updateRouteSummary(data) {
  const target = resolveRouteTarget(data);
  if (!target) {
    routeProgressState = { key: null, total: 0 };
    routeSummaryNumbers = null;
    const raw = resolveRawRouteTarget(data);
    const oculta = routeDismissed(dismissedRouteIdentity, data, raw, dismissedStopList().length);
    const fuera = oculta ? null : offMapJobPlace(data, raw, jobPlacesReady());
    renderRouteSummary(oculta ? { dismissed: true } : fuera ? { offMap: fuera } : null);
    return;
  }
  // Con waypoints propios la distancia del juego no cuenta el desvio: se mide
  // sobre la ruta que dibujamos nosotros.
  const ownKm = gameKmOf(currentRouteWorldPoints);
  const gameKm = Number.isFinite(data.routeDistanceKm) ? Math.max(0, data.routeDistanceKm) : null;
  // El GPS del juego en 0 con una ruta nuestra larga: el juego todavia no
  // tiene ruta (parado en la base, partida recien cargada) y el resumen
  // decia "falta 0 km, llegas ahora" con el giro a 5 km. Cerca del destino
  // las dos dan casi 0, por eso el kilometro de margen.
  // Y si el GPS del juego da mucho menos que nuestra ruta, esta apuntando a
  // otra cosa: en el freight market, hasta enganchar el remolque, va al
  // remolque en el deposito de origen. Usandolo, el tablero decia que
  // faltaban metros y anunciaba la llegada con la ruta a Charleston dibujada
  // ("says I'm at the location when clearly I'm not", Discord 10-10).
  const manual = waypoints.some(wp => !wp.inGame) || target.kind === 'waypoint'
    || useOwnRemaining(gameKm, ownKm);
  const remainingKm = manual ? ownKm : gameKm;
  const key = routeIdentity(data) + target.key;
  if (routeProgressState.key !== key) routeProgressState = { key, kind: target.kind, total: 0, stored: readRouteProgress() };
  const total = routeProgressTotal({
    kind: target.kind, manual, plannedKm: data.plannedDistanceKm, remainingKm,
    seenKm: routeProgressState.total, stored: routeProgressState.stored, key, now: Date.now(),
  });
  // Se guarda cuando crece (una vez por ruta, casi siempre) y no en cada tick.
  if (total > routeProgressState.total + 0.05 && !conn.demo) {
    lsSet(ROUTE_PROGRESS_KEY, JSON.stringify({ key, total, at: Date.now() }));
  }
  routeProgressState.total = total;
  if (voiceOn) {
    const arrived = voiceGuide.arrival(key, target.kind, remainingKm, routeProgressState.total);
    if (arrived && isLeaderTab) speakVoice(arrived);
  }
  const percent = remainingKm == null || routeProgressState.total <= 0 ? 0
    : Math.max(0, Math.min(100, (1 - remainingKm / routeProgressState.total) * 100));
  // Por nuestra ruta, lo mismo que la fila "via waypoint" del ETA real.
  const seconds = manual
    ? waypointEta({ viaKm: remainingKm, gameKm, realEtaSeconds: routeSummaryEtaSeconds, avgSpeedKmh: lastKnownAvgSpeedKmh }).realSeconds
    : (remainingKm === 0 ? 0 : routeSummaryEtaSeconds);
  routeSummaryNumbers = { remainingKm, seconds }; // para el overlay de OBS (sendNavHud)
  // Ruta a la carga (remolque propio sin cargar): sin decirlo, "llegaste" en
  // la empresa de origen y ninguna ruta a la entrega se leia como un error
  // ("says I'm at the location when clearly I'm not, it's not routing to
  // Charleston", Discord 10-10).
  const origen = [data.companySrc, data.citySrc].filter(Boolean).join(', ') || '?';
  const destino = [data.companyDst, data.cityDst].filter(Boolean).join(', ') || '?';
  // Freight market y parecidos: el remolque es de la empresa y espera en el
  // origen; la carga cuenta como cargada desde el principio (asi lo informa
  // el SDK fuera del cargo market), asi que la ruta ya va a la entrega.
  const sinRemolque = data.onJob && data.trailerAttached === false && target.kind === 'dest'
    && data.jobMarket && data.jobMarket !== 'cargo_market' && data.jobMarket !== 'quick_job';
  const pickup = target.kind === 'pickup' ? t('routePickupNotice', origen, destino)
    : sinRemolque ? t('routeTrailerNotice', origen) : null;
  renderRouteSummary({
    pickup,
    approx: !!target.approx,
    dlc: routeUsesUncheckedDlc,
    percent,
    remaining: remainingKm == null ? '--'
      : `${formatDec(useImperial ? remainingKm * KM_TO_MI : remainingKm, currentLang)} ${useImperial ? 'mi' : 'km'}`,
    duration: seconds != null && Number.isFinite(seconds) ? formatSeconds(seconds) : '--',
    arrival: seconds != null && Number.isFinite(seconds)
      ? (f => formatClockHM(f.getHours(), f.getMinutes(), hour12()))(new Date(Date.now() + seconds * 1000))
      : '--',
  });
}

// Parte la lista de puntos de la ruta en (a) tramos por tierra y (b) tramos
// de ferry/tren (puntos marcados con 3er elemento = 1), cada uno como
// MultiLineString en lng/lat, para pintarlos con estilos distintos.
// Separa la ruta en: tramo actual (hasta el primer waypoint), tramos
// siguientes (p[5] > 0: de un waypoint al siguiente / al destino) y ferries.
// Los tramos se juntan en coordenadas del juego (metros) y recien al final
// pasan a lng/lat: cleanRouteForDrawing mide en metros (saca los ganchos de
// las calzadas separadas, ver pure.js).
function splitRouteForDrawing(routePoints) {
  // Sobre la calzada de la mano por la que se va (grafo v3; con v2, igual).
  routePoints = routeDrawShift(routePoints);
  const land = [], next = [], ferry = [];
  let current = [];
  let currentLeg = 0;
  const flush = () => { if (current.length > 1) (currentLeg > 0 ? next : land).push(current); };
  for (let k = 0; k < routePoints.length; k++) {
    const p = routePoints[k];
    const xy = [p[0], p[1]];
    const leg = p[5] != null ? p[5] : currentLeg;
    if (k > 0 && leg !== currentLeg) {
      // cambio de tramo: el punto del waypoint cierra el tramo anterior y abre el siguiente
      current.push(xy);
      flush();
      current = [xy];
      currentLeg = leg;
      continue;
    }
    if (k > 0 && p[2] === 1) {
      flush();
      const prev = routePoints[k - 1];
      ferry.push([toLngLat(prev[0], prev[1]), toLngLat(p[0], p[1])]);
      current = [xy];
    } else {
      current.push(xy);
    }
  }
  flush();
  const dibujar = (part) => smoothLineCoords(cleanRouteForDrawing(part).map(q => toLngLat(q[0], q[1])));
  return {
    land: { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: land.map(dibujar) } },
    next: { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: next.map(dibujar) } },
    ferry: { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: ferry } },
  };
}

function updateDestinationMarker(data) {
  if (!map || !toLngLat) return;
  const target = resolveRouteTarget(data);
  if (!target) {
    if (destMarker) { destMarker.remove(); destMarker = null; }
    setRouteData(emptyLineString());
    if (map.getSource('route-next')) map.getSource('route-next').setData(emptyLineString());
    if (map.getSource('route-ferry')) map.getSource('route-ferry').setData(emptyLineString());
    currentRouteTarget = null;
    currentRouteWorldPoints = null;
    // Con la ruta borrada por el usuario hay destino igual (el crudo): ahi
    // no se explica nada.
    noRouteNow = noRouteReason({ hasTarget: !!resolveRawRouteTarget(data), hasRoute: false, gameRouteKm: data.routeDistanceKm });
    gameRouteKmNow = data.routeDistanceKm || 0;
    return;
  }
  noRouteNow = null;
  const destLngLat = toLngLat(target.x, target.z);
  if (target.kind === 'waypoint') {
    // El ultimo waypoint ya tiene su propio marcador - no duplicar bandera.
    if (destMarker) { destMarker.remove(); destMarker = null; }
  } else {
    if (destMarker && (destMarker._kind !== target.kind || destMarker._approx !== !!target.approx)) {
      destMarker.remove();
      destMarker = null;
    }
    if (!destMarker) {
      const el = document.createElement('div');
      el.innerHTML = target.kind === 'pickup' ? MARKER_SVG.pickup : MARKER_SVG.dest;
      // Bandera tenue cuando no sabemos la empresa: el usuario tiene que
      // poder distinguir "tu destino es aca" de "no se donde es, te dejo el
      // centro de la ciudad". Sin eso, un error de 900 m se lee como un
      // destino equivocado.
      el.className = target.approx ? 'destMarkerWrap approx' : 'destMarkerWrap';
      // Se agrega de que mercado salio el trabajo cuando el cliente lo manda:
      // es justo el dato que explica por que el juego no informo la empresa,
      // y asi el proximo reporte ya viene con la respuesta adentro.
      if (target.approx) {
        el.title = t('destApproxHint') + (target.market ? ` (${target.market})` : '');
      }
      destMarker = new maplibregl.Marker({ element: el, anchor: 'bottom-left' }).setLngLat(destLngLat).addTo(map);
      destMarker._kind = target.kind;
      destMarker._approx = !!target.approx;
    } else {
      destMarker.setLngLat(destLngLat);
    }
  }

  // Recalcula la ruta real por carreteras cuando cambia el objetivo (o los
  // waypoints), o -como un GPS- cuando te desviaste demasiado de la ruta ya
  // calculada. Recorrer el grafo entero en cada tick seria carisimo, por eso
  // no se chequea la desviacion salvo que ya haya una ruta calculada para
  // comparar contra. routeKey incluye los waypoints para que un cambio
  // (poner/sacar/alcanzar uno) tambien dispare el recalculo.
  const legs = waypoints.map(wp => wp.pos);
  if (target.kind !== 'waypoint') legs.push([target.x, target.z]);
  const routeKey = `${target.key}|${legs.map(p => `${p[0]},${p[1]}`).join(';')}`;
  const destChanged = routeKey !== currentRouteTarget;
  const offRoute = !destChanged
    && data.position?.x != null
    && distanceToRouteMeters(data.position.x, data.position.z) > OFF_ROUTE_THRESHOLD_M;
  const recheck = !destChanged && !offRoute && data.position?.x != null && !!routeGraph
    && routeGameRecheck(routeKey, target, data);

  if ((destChanged || offRoute || recheck) && data.position?.x != null && routeGraph) {
    currentRouteTarget = routeKey;
    // Una comparacion mas con el GPS del juego, salvo despues de esta.
    routeGameCheck = { key: routeKey, left: recheck ? 0 : 1, ticks: 0 };
    navManeuverState.shown = null; navManeuverState.shownKey = null; navManeuverState.candidate = undefined; navManeuverState.candidateTicks = 0;
    navQuietLanesState.shown = null; navQuietLanesState.shownKey = null; navQuietLanesState.candidate = undefined; navQuietLanesState.candidateTicks = 0;
    navQuietLanes = null;
    // Sin desviarse (cambio el destino o un waypoint) el camion sigue sobre
    // la ruta de antes: lo recorrido y su rumbo siguen valiendo, o el giro
    // del cruce en el que esta se pierde (recalcOnRoute).
    const sobreLaRuta = recalcOnRoute({ offRoute, behind: routeBehind, route: currentRouteWorldPoints, x: data.position.x, z: data.position.z });
    if (!sobreLaRuta) routeBehind = [];
    let routePoints = [];
    let from = [data.position.x, data.position.z];
    let complete = true;
    routeUsesUncheckedDlc = false;
    let llegada = null;
    legs.forEach((to, legIdx) => {
      // El primer tramo sale del camion: con su rumbo si viene andando.
      const rumbo = legIdx === 0 ? routeStartHeading(data, sobreLaRuta) : null;
      // Hasta un waypoint, la ruta pasa por el sobre su calle, y el tramo
      // siguiente sigue desde ahi en el mismo sentido (findRouteWith)
      // (solo los puestos tocando el mapa: waypointPassesBy). A una parada,
      // una empresa o la empresa del trabajo se entra (entrar).
      const pasa = (i) => i < waypoints.length && waypointPassesBy(waypoints[i]);
      const entra = (i) => (i < waypoints.length ? !pasa(i) : (target.kind === 'dest' || target.kind === 'pickup') && !target.approx);
      const siguiente = legIdx + 1 < legs.length ? { xy: legs[legIdx + 1], pasar: pasa(legIdx + 1) } : null;
      let leg = findRoute(from, to, rumbo, null, null, { desde: llegada, pasar: pasa(legIdx), entrar: entra(legIdx), siguiente });
      llegada = leg ? leg.llegada || null : null;
      // Casi empatada con otra, la que va por donde el GPS del juego.
      if (leg && legs.length === 1 && gameRouteComparable(target)) {
        const elegida = routeLikeGame(leg, from, to, rumbo, data.routeDistanceKm, { entrar: entra(legIdx) });
        leg = elegida.leg;
        if (elegida.switched) routeGameCheck.left = 0;
      }
      if (leg) {
        if (leg.usesUncheckedDlc) routeUsesUncheckedDlc = true;
        // Parado arranca en el nodo mas cercano: si es el cruce de adelante,
        // con su entrada, o el giro de ahi no se avisa (stoppedRouteLead).
        const entrada = legIdx === 0 && rumbo == null ? stoppedRouteLead(leg, from[0], from[1], data.heading) : null;
        if (entrada) leg = [entrada, ...leg];
        leg = leg.map(p => { const q = p.slice(); q[5] = legIdx; return q; });
        routePoints = routePoints.length ? routePoints.concat(leg.slice(1)) : leg;
      } else { complete = false; routePoints.push([from[0], from[1], 0, 0, null, legIdx], [to[0], to[1], 0, 0, null, legIdx]); }
      from = to;
    });
    if (!routePoints.length) routePoints = null;
    currentRouteWorldPoints = routePoints;
    currentRouteFull = routePoints;
    if (map.getSource('route')) {
      if (routePoints) {
        const parts = splitRouteForDrawing(routePoints);
        setRouteData(parts.land);
        if (map.getSource('route-next')) map.getSource('route-next').setData(parts.next);
        if (map.getSource('route-ferry')) map.getSource('route-ferry').setData(parts.ferry);
      } else {
        // fallback: linea recta si no se encontro ruta
        const lineCoords = [lastDisplayedLngLat, destLngLat].filter(Boolean);
        setRouteData({ type: 'Feature', geometry: { type: 'LineString', coordinates: lineCoords } });
        if (map.getSource('route-next')) map.getSource('route-next').setData(emptyLineString());
        if (map.getSource('route-ferry')) map.getSource('route-ferry').setData(emptyLineString());
      }
    }
    if (!complete) console.warn('Ruta incompleta: algun tramo no se pudo calcular por el grafo');
    if (typeof convoyOnRouteChanged === 'function') convoyOnRouteChanged(); // Convoy: los demas ven mi ruta
    sendLiveRoute(false); // mapa en vivo: a lo sumo cada LIVE_ROUTE_RESEND_MS
  }
}

async function loadGameMap(game) {
  if (!GAME_MAPS[game]) return;
  ensureMapInitialized();
  if (!mapReady) { pendingGame = game; return; }
  if (game === currentGame) return;

  const mapInfo = GAME_MAPS[game];
  currentGame = game;
  toLngLat = mapInfo.toLngLat;
  fromLngLat = mapInfo.fromLngLat;

  const loadToken = ++mapLoadToken;
  setMapLoading('mapLoadingCities');
  await loadCities(mapInfo);
  let routingReady = Promise.resolve();
  if (conn.spectator || liteNoRouting) {
    // Espectador (convoy / mapa en vivo) o Lite sin ruteo: no rutea ni
    // navega, asi que el grafo (10-25 MB) y los nombres de ruta sobran - el
    // mapa abre en segundos y la pestana no se queda sin memoria.
    routeGraph = null;
    roadNames = [];
  } else {
    // El grafo (4,5 a 25 MB) y los nombres de ruta bajan por detras. Antes se
    // los esperaba para recien ahi dibujar el mapa: en 4G lento la pantalla
    // quedaba gris 30-40 s, tambien la demo (auditoria del 12-10). Mientras
    // no esta el grafo no hay ruta: findRoute da null y updateDestinationMarker
    // vuelve a intentar en el proximo tick.
    if (liteMode) roadNames = []; // sin nombres de ruta en las indicaciones: 5 MB menos
    routingReady = Promise.all([loadRouteGraph(mapInfo), liteMode ? null : loadRoadNames(mapInfo)]);
  }
  loadPois(game); // no bloquea: la busqueda muestra "cargando" hasta que llegue
  currentRouteTarget = null;
  currentRouteWorldPoints = null;
  trailWorld.length = 0;
  lastDisplayedLngLat = null;
  if (map.getSource('trail')) map.getSource('trail').setData(emptyLineString());
  setRouteData(emptyLineString());
  if (map.getSource('route-ferry')) map.getSource('route-ferry').setData(emptyLineString());
  if (destMarker) { destMarker.remove(); destMarker = null; }
  clearWaypoint(true);
  restoreWaypoints();

  // El source vectorial 'vec' no se puede "reapuntar" a otra url una vez
  // creado - hay que sacarlo (y las capas que dependen de el) y crearlo de
  // nuevo con el pmtiles del juego que corresponda.
  for (const id of VEC_LAYER_IDS) { if (map.getLayer(id)) map.removeLayer(id); }
  if (map.getSource('vec')) map.removeSource('vec');
  companyIconsAsked.clear(); // los que ya estan no se vuelven a pedir (hasImage)
  map.addSource('vec', { type: 'vector', url: `pmtiles://${mapInfo.pmtilesUrl}?v=${MAP_DATA_VERSION[game] || ''}` });
  // Se insertan justo antes de 'trail-line' para que el trail/ruta/marcadores
  // queden siempre por encima del mapa base. try/catch por capa: si una sola
  // definicion tiene un error, que no tumbe a las demas (ya paso una vez con
  // las capas de texto por faltar 'glyphs' en el estilo).
  for (const layer of buildVecLayers(mapInfo.sourceLayer)) {
    try { map.addLayer(layer, 'trail-line'); } catch (err) { console.error('No se pudo agregar la capa', layer.id, err); }
  }
  setAtlasData();
  setRoadShieldData();
  applyBaseMap();

  map.jumpTo({ center: mapInfo.origin, zoom: 5 });

  if (!truckMarker) {
    const el = document.createElement('div');
    el.className = 'truckMarker';
    truckArrowEl = document.createElement('div');
    truckArrowEl.className = 'truckArrow';
    el.appendChild(truckArrowEl);
    // rotationAlignment/pitchAlignment 'map': MapLibre compensa la rotacion y
    // la inclinacion de la camara, asi que alcanza con darle el rumbo
    // geografico y la flecha queda bien en modo nav y fuera de el (del PR #1
    // de Vladimir Kutkovoy; antes se rotaba el div a mano y con el mapa
    // rotado o en 3D apuntaba mal).
    truckMarker = new maplibregl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map', rotation: lastHeadingDeg }).setLngLat(mapInfo.origin).addTo(map);
  }
  updateTruckArrowSize();

  showMapHint(mapInfo.label, currentGame);
  // Los tiles siguen bajando en segundo plano; la barra se va cuando la
  // primera pasada de render termina (o a los 4 s como tope, por si el
  // evento no llega).
  // Despues, si el grafo sigue bajando, lo dice la misma barra: sin eso,
  // con un trabajo andando la ruta tardaria en aparecer sin explicacion.
  setMapLoading('mapLoadingTiles');
  let tilesDone = false, routingDone = false;
  const refresh = () => {
    if (loadToken !== mapLoadToken) return; // ya se esta cargando otra variante
    setMapLoading(!tilesDone ? 'mapLoadingTiles' : !routingDone ? 'mapLoadingGraph' : null);
  };
  const clear = () => { if (!tilesDone) { tilesDone = true; refresh(); } };
  map.once('idle', clear);
  setTimeout(clear, 4000);
  routingReady.finally(() => { routingDone = true; refresh(); });
}

// Barra "Cargando mapa..." sobre el mapa mientras bajan ciudades, grafo de
// rutas y carteles (varios MB, 5-8 s la primera vez). Antes en ese rato el
// mapa quedaba gris con "Map not loaded" y parecia que no andaba.
function setMapLoading(stepKey) {
  const el = document.getElementById('mapLoading');
  if (!el) return;
  if (!stepKey) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  document.getElementById('mapLoadingText').textContent = t(stepKey);
}

let lastWorldPos = null;
// Seguimiento de camara: se corta cuando el usuario mueve el mapa a mano y
// vuelve solo unos segundos despues de soltarlo (antes habia que apretar
// Recentrar si o si; idea del PR #1 de Vladimir Kutkovoy). El boton sigue
// estando para volver en el acto.
let autoFollow = true;
let mapFollowTimer = null;
const MAP_FOLLOW_DELAY_MS = 10000;

function pauseMapFollow() {
  clearTimeout(mapFollowTimer);
  mapFollowTimer = null;
  autoFollow = false;
}

function resumeMapFollow() {
  clearTimeout(mapFollowTimer);
  mapFollowTimer = null;
  autoFollow = true;
  if (map && truckMarker) {
    // Fuera del modo nav ademas se endereza el mapa (norte arriba) por si lo
    // rotaron a mano; en modo nav el bearing lo pisa el proximo tick.
    map.jumpTo(navCameraOn() ? { center: truckMarker.getLngLat() } : { center: truckMarker.getLngLat(), bearing: 0 });
  }
}

function scheduleMapFollow() {
  clearTimeout(mapFollowTimer);
  if (autoFollow) return;
  // En el mapa en vivo el arrastre suelta al conductor fijado a proposito:
  // ahi no se vuelve solo (ver livemap.js).
  if (conn.spectator) return;
  // Esperar a que termine todo el gesto (arrastrar + pellizcar cuenta como uno).
  if (map && (map.isMoving() || map.isZooming() || map.isRotating())) return;
  mapFollowTimer = setTimeout(resumeMapFollow, MAP_FOLLOW_DELAY_MS);
}
const TRAIL_JUMP_THRESHOLD_M = 500; // si salta mas que esto entre updates, es un teleport (job asignado, garage, etc.), no un tramo manejado

// Modo navegacion: mapa heading-up (rota con el camion, como un GPS real) en
// vez de norte-arriba, con zoom dinamico (se acerca en curvas, se aleja en
// rectas) e indicaciones de giro genericas (sin nombres de calle, el grafo
// no los tiene). A diferencia de la version con Leaflet (que rotaba un div
// via CSS), MapLibre soporta rotacion real del mapa (bearing) - el pan sigue
// funcionando bien incluso rotado, asi que no hace falta deshabilitar drag.
let navMode = false;
// El mapa esta en la ventana flotante (ver pipMapIn): aca arriba porque la
// camara lo lee desde el arranque.
let pipMapOn = false;
let navAutoZoomPaused = false; // true si el usuario zoomeo a mano en modo nav - se reactiva al recentrar
// Rumbo del camion. El cliente 1.5.13+ manda el del juego ya en grados de
// brujula; con clientes viejos se deduce del desplazamiento, que es lo que
// habia antes. Esa deduccion mide la CUERDA entre dos posiciones, no la
// tangente, asi que en curvas cerradas y rotondas va atrasada: de ahi el
// reporte de "no maneja bien los cambios de direccion".
//
// Base minima para deducirlo: cuanto mas lento vas, mas corta, porque ir
// lento es justo cuando estas girando. Fija en 4 m, a 20 km/h el rumbo se
// actualizaba una vez cada 0,7 s.
const HEADING_REF_MIN_M = 1.5;
const HEADING_REF_MAX_M = 4;
// Suavizado del giro. En recta los cambios son ruido de muestreo y conviene
// filtrar fuerte; en un giro el cambio es real y filtrar es exactamente lo
// que hace que la flecha llegue tarde. Por eso el factor sube con el tamano
// del giro en vez de ser 0,6 siempre.
const HEADING_SMOOTH_MIN = 0.55;
const HEADING_SMOOTH_MAX = 0.95;
const HEADING_SMOOTH_FULL_DEG = 25;
// Con el rumbo del juego no hay ruido que filtrar, solo los escalones del
// muestreo: alcanza con un toque de suavizado para que no salte.
const HEADING_GAME_SMOOTH = 0.8;
let movedAvgM = 0;
let lastHeadingDeg = 0;
let headingRef = null; // ultima posicion (lng/lat) usada como referencia del heading
let headingRefWorld = { x: 0, z: 0 };
const NAV_TURN_LOOKAHEAD_M = 800; // no mirar mas alla de esto para el proximo giro
const NAV_TURN_ANGLE_THRESHOLD_DEG = 35; // cambio de rumbo minimo, medido justo en la interseccion, para contar como "giro"
const NAV_TURN_LEG_M = 60; // cuanto camino antes/despues de la interseccion se usa para medir el rumbo de entrada/salida
const NAV_FORK_LEG_M = 250; // para bifurcaciones se mira mas lejos: una rampa se separa de la autopista gradualmente
// Hasta cuantos metros antes de un giro se busca otra calle hacia el mismo
// lado que la voz tenga que dejar pasar (sideExitToward): lo que adelanta el
// aviso del punto mas temprano (6 s a 90 km/h).
const NAV_VOICE_DECOY_M = 150;
// Un "keep" por carriles (laneKeepAt) hacia el mismo lado que otro de hasta
// estos metros antes es el mismo carril que se pierde en dos prefabs
// pegados (60 m en la ruta New Orleans -> Houma de check_avisos): un aviso.
const NAV_LANE_KEEP_REPEAT_M = 200;
// Y la salida por la que se van los otros carriles tiene que alejarse estos
// metros sin tocar estos metros de ruta: los que rodean una isleta, o una
// calzada que se abre en dos y se vuelve a juntar, no son una salida.
const NAV_LANE_KEEP_ESCAPE_M = 600;
// Sin la marca del constructor, el carril que se va tiene que haber entrado
// por una rampa hasta estos metros antes (laneFromOnRamp). No mas que
// ROUTE_BEHIND_M: con el camion entre la rampa y la salida, la entrada
// tiene que seguir en lo recorrido o el aviso se apagaba antes de llegar.
const NAV_LANE_RAMP_M = 200;
// Sin giro a la vista, las flechas del proximo cruce donde no sirven todos
// los carriles (findQuietLanes) se muestran desde estos metros antes.
const NAV_QUIET_LANES_M = 500;
const NAV_TURN_DEBOUNCE_TICKS = 2; // una indicacion nueva tiene que verse 2 ticks seguidos (anti-parpadeo al pasar salidas)
const navManeuverState = {};
// Las flechas sin aviso (findQuietLanes), con el mismo anti-parpadeo que los
// giros: lo que muestran el panel y el overlay cuando el giro es seguir derecho.
const navQuietLanesState = {};
let navQuietLanes = null;
let routeBehind = []; // ultimos puntos de la ruta ya recorridos (ver trimRouteBehindTruck)
// Cuanto: un cruce entero (hasta 100 m) mas el tramo de entrada (60 m), medido
// en metros y no en puntos (ver trimRouteBehind); el tope de puntos es para
// una geometria muy densa.
const ROUTE_BEHIND_M = 200;
const ROUTE_BEHIND_MAX = 400;
const NAV_JUNCTION_CLUSTER_GAP_M = 50; // nodos de cruce mas cerca que esto son el mismo cruce (prefab)
const NAV_JUNCTION_CLUSTER_SPAN_M = 100; // y el cruce entero no mide mas que esto
const NAV_JUNCTION_CURVE_SPAN_M = 60; // un prefab de punta a punta de su curva (junctionManeuver)

// Vista 3D (inclinacion de camara) en modo navegacion, persistida. En nav el
// camion se ubica en el tercio inferior de la pantalla (padding) para ver mas
// camino adelante, con o sin 3D.
let nav3d = !liteMode && (_savedSettings.nav3d || false);
// La camara del modo navegacion (adelante para arriba, el camion abajo):
// tambien con el mapa en la ventana flotante, que es un GPS chico arriba del
// juego aunque el modo navegacion de la pestana este apagado.
function navCameraOn() {
  return navMode || pipMapOn;
}
function navPadding() {
  const h = map ? map.getContainer().clientHeight : 0;
  // Rellenar ARRIBA desplaza el centro hacia abajo: el camion queda en el
  // tercio inferior y se ve mas camino adelante.
  return navCameraOn() ? { top: Math.round(h * 0.45), bottom: 0, left: 0, right: 0 } : { top: 0, bottom: 0, left: 0, right: 0 };
}
function applyNavCamera() {
  if (!map) return;
  if (navCameraOn()) {
    map.easeTo({ pitch: nav3d ? 58 : 0, padding: navPadding(), duration: 400 });
  } else {
    map.easeTo({ pitch: 0, bearing: 0, padding: navPadding(), duration: 300 });
  }
  document.getElementById('tilt3dBtn').classList.toggle('active', navMode && nav3d);
  document.getElementById('tilt3dBtn').style.display = navMode && !liteMode ? '' : 'none';
}

function setNavMode(on) {
  navMode = on;
  navAutoZoomPaused = false;
  const btn = document.getElementById('navToggleBtn');
  if (on) {
    resumeMapFollow();
    if (map) map.dragRotate.disable(); // el rumbo lo manejamos nosotros segun el heading, no rotacion manual
    btn.classList.add('active');
  } else {
    if (map) map.dragRotate.enable();
    btn.classList.remove('active');
    document.getElementById('navPanel').style.display = 'none';
  }
  applyNavCamera();
  updateCompass();
}
// En vertical el mini-HUD (velocidad/limite/ruta) baja al rincon inferior
// derecho del mapa: arriba a la derecha chocaba con el panel de indicaciones
// de navegacion (reporte con capturas del 19/9). En horizontal vuelve arriba.
const portraitMq = window.matchMedia('(max-width: 900px) and (orientation: portrait)');
function placeMiniHud() {
  const hud = document.getElementById('miniHud');
  // Si el usuario lo puso en otro lado, es suyo: no se lo movemos al girar la
  // pantalla ni al arrancar.
  if (hud && hud.classList.contains('moved')) return;
  const target = portraitMq.matches ? document.getElementById('bottomRightHud') : document.getElementById('topRightControls');
  if (hud && hud.parentElement !== target) target.insertBefore(hud, target.firstChild);
  placeMiniHudExtra();
}
if (portraitMq.addEventListener) portraitMq.addEventListener('change', placeMiniHud); else portraitMq.addListener(placeMiniHud);
placeMiniHud();

// El resumen de ruta no tiene alto fijo: con el aviso de destino
// aproximado suma dos renglones y tapaba la pila de abajo a la derecha, que
// estaba corrida un alto fijo. Ahora la pila se corre lo que el resumen mide
// (--route-summary-h), y un panel que el usuario dejo donde el resumen lo
// tapa sube lo justo mientras el resumen esta a la vista. Sin tocar la
// posicion guardada: al cerrar la ruta vuelve a donde lo puso.
function keepPanelsClearOfRouteSummary() {
  const panel = document.getElementById('mapPanel');
  const summary = document.getElementById('routeSummary');
  if (!panel || !summary) return;
  const visible = !summary.hidden && summary.offsetHeight > 0;
  panel.style.setProperty('--route-summary-h', `${visible ? summary.offsetHeight : 0}px`);
  const sr = summary.getBoundingClientRect();
  for (const id of MOVABLE_PANEL_IDS) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.style.translate = '';
    if (!visible || !el.classList.contains('moved') || document.body.classList.contains('editLayout')) continue;
    const r = el.getBoundingClientRect();
    const overlaps = r.bottom > sr.top && r.top < sr.bottom && r.right > sr.left && r.left < sr.right;
    if (overlaps) el.style.translate = `0 ${-(r.bottom - sr.top + 8)}px`;
  }
}
if (typeof ResizeObserver === 'function') {
  const ro = new ResizeObserver(() => keepPanelsClearOfRouteSummary());
  for (const id of ['mapPanel', 'routeSummary', ...MOVABLE_PANEL_IDS]) {
    const el = document.getElementById(id);
    if (el) ro.observe(el);
  }
}

document.getElementById('tilt3dBtn').addEventListener('click', () => {
  nav3d = !nav3d;
  saveSettings();
  applyNavCamera();
});

// La brujula (compassView en pure.js): un indicador, no un boton. La aguja
// apunta al norte del mapa en cada giro.
function updateCompass() {
  const el = document.getElementById('compassBtn');
  if (!el) return;
  const v = compassView(map ? map.getBearing() : 0, { navMode });
  el.style.display = v.show ? '' : 'none';
  document.getElementById('compassNeedle').style.transform = `rotate(${v.angle}deg)`;
}

// Busca el proximo giro real en la ruta ya calculada (recortada a la
// posicion actual por trimRouteBehindTruck), mirando hasta NAV_TURN_LOOKAHEAD_M
// adelante, usando bearing geografico real (no depende del mapa ni de su
// rotacion actual). Devuelve null si el camino sigue derecho en ese tramo.
// Proximo giro: SOLO en intersecciones reales del grafo (nodos con 3+
// vecinos) y comparando el rumbo de entrada contra el de salida medidos en
// ~60 m a cada lado del cruce. Antes se comparaba el rumbo acumulado contra
// el inicial, asi que una curva larga en una ruta sin cruces sumaba 25 grados
// y disparaba "gira a la izquierda" (queja #1 de los usuarios).
// Ademas de giros (>35 grados) se anuncian bifurcaciones ("keep right/left"):
// salidas de autopista y rampas se separan de a poco, con menos de 35
// grados, y antes pasaban en silencio - la primera indicacion era el giro
// al final de la rampa (queja de r/trucksim). Ver detectManeuver en pure.js.
// heading: el rumbo geografico del camion (turnPassed). Sin el, el del tramo
// de la ruta por el que llega (check_avisos y el simulador no lo pasan).
function findUpcomingTurn(heading) {
  if (!currentRouteWorldPoints || currentRouteWorldPoints.length < 3 || !toLngLat) return null;
  const pts = routeBehind.length ? routeBehind.concat(currentRouteWorldPoints) : currentRouteWorldPoints;
  const here = routeBehind.length; // indice de la posicion actual dentro de pts
  const { cum, pointAt } = routeMetrics(pts);
  // Rumbo geografico entre dos puntos de mundo.
  const bearingBetween = (p, q) => {
    const [lng1, lat1] = toLngLat(p[0], p[1]);
    const [lng2, lat2] = toLngLat(q[0], q[1]);
    return geoBearingDeg(lng1, lat1, lng2, lat2);
  };
  const rumbo = Number.isFinite(heading) ? heading
    : (cum[here] >= 15 ? bearingBetween(pointAt(cum[here] - 15), pts[here]) : null);
  const graph = routeGraph ? { nodes: routeGraph.nodes, nodeXY: routeGraph.nodeXY, adjacency: routeGraph.adjacency, incoming: routeGraph.incoming } : {};
  // La curva de un tramo del grafo (para reconocer rotondas de un prefab).
  const edgeLine = routeGraph ? (a, b) => {
    const k = routeGraph.dirEdge(a, b);
    if (k === -1) return null;
    const e = routeGraph.adjEdge[k], line = [routeGraph.nodeXY(a)];
    const mids = [];
    for (let m = routeGraph.midOff[e]; m < routeGraph.midOff[e + 1]; m++) mids.push([routeGraph.midXY[2 * m], routeGraph.midXY[2 * m + 1]]);
    if (routeGraph.adjRev[k]) mids.reverse();
    return line.concat(mids, [routeGraph.nodeXY(b)]);
  } : null;
  // La flecha de carril del juego para pasar de a a b (LANE_ARROW_BITS), o
  // null si ese paso no tiene carriles: detectManeuver la usa para saber
  // cual rama de una bifurcacion pareja es la que sigue.
  const laneTurn = routeLanes && routeGraph ? (a, b) => {
    const k = routeGraph.dirEdge(a, b);
    if (k === -1) return null;
    const rec = lanesForEdge(routeLanes, routeGraph.adjEdge[k], routeGraph.adjRev[k]);
    return rec ? rec.turn : null;
  } : null;

  // Se arranca por los nodos ya pasados: si el camion esta adentro de un
  // cruce, el grupo se arma entero y su giro se reconoce como ya hecho. Si
  // se empezara por el primer nodo de adelante, la mitad que queda de una
  // esquina se anunciaba como otro giro.
  let prevTurn = null; // ultimo giro visto, aunque ya haya quedado atras (ver continuesTurn)
  let roundaboutLeftM = -Infinity; // donde se salio de la ultima rotonda (metros sobre la ruta)
  let lastKeep = null; // ultimo "keep" por carriles, aunque haya quedado atras (NAV_LANE_KEEP_REPEAT_M)
  const passed = []; // cruces sin aviso de aca al proximo giro: [i, iEnd] (ver sideExitToward)
  const roundaboutAt = (i, iEnd) => graph.adjacency
    ? detectRoundabout({ pts, cum, i, iEnd, adjacency: graph.adjacency, nodeAt: graph.nodeXY, edgeLine, bearingBetween }) : null;
  for (let i = 1; i < pts.length - 1; i++) {
    if (cum[i] - cum[here] > NAV_TURN_LOOKAHEAD_M) break;
    if (pts[i][2] === 1) break; // tramo de ferry/tren: lo que hay del otro lado se anuncia alla
    if (pts[i][3] !== 1) continue; // no es interseccion: una curva no es un giro
    let iEnd = junctionClusterEnd(pts, cum, i, NAV_JUNCTION_CLUSTER_GAP_M, NAV_JUNCTION_CLUSTER_SPAN_M, here);
    // Rotonda: se anuncia la salida ("tomar la segunda salida") en la entrada
    // y se calla todo lo de adentro hasta salir. Adentro, la distancia es a la
    // salida; la clave (node) sigue siendo la entrada, asi no cambia el aviso.
    const rb = roundaboutAt(i, iEnd);
    if (rb) {
      prevTurn = null;
      passed.length = 0;
      roundaboutLeftM = cum[rb.leave];
      if (cum[rb.leave] > cum[here]) {
        const inside = cum[rb.enter] <= cum[here];
        const after = Math.min(rb.leave + 2, pts.length - 1);
        const delta = normDeg(bearingBetween(pts[rb.leave], pointAt(cum[rb.leave] + NAV_TURN_LEG_M))
          - bearingBetween(pointAt(cum[rb.enter] - NAV_TURN_LEG_M), pts[rb.enter]));
        return {
          kind: 'roundabout', exit: rb.exit, direction: delta > 0 ? 'right' : 'left', ccw: rb.ccw,
          distanceMeters: Math.max(0, cum[inside ? rb.leave : rb.enter] - cum[here]),
          nearSign: roadSignForTurn(pointAt, cum[rb.leave], cum[cum.length - 1], nearestRoadName, pts[after]),
          node: [pts[rb.enter][0], pts[rb.enter][1]],
        };
      }
      i = Math.max(iEnd, rb.leave);
      continue;
    }
    const ctx = { pts, cum, pointAt, bearingBetween, nodes: graph.nodes, nodeXY: graph.nodeXY, adjacency: graph.adjacency, incoming: graph.incoming, edgeLine, laneTurn,
      turnThreshold: NAV_TURN_ANGLE_THRESHOLD_DEG, legM: NAV_TURN_LEG_M, forkLegM: NAV_FORK_LEG_M };
    // Si ahi no hay nada que avisar, el prefab entero, de punta a punta de
    // su curva (junctionManeuver): partida en dos, una T se callaba.
    const jm = junctionManeuver({ ...ctx, i, iEnd }, NAV_JUNCTION_CLUSTER_GAP_M, NAV_JUNCTION_CLUSTER_SPAN_M, here, NAV_JUNCTION_CURVE_SPAN_M);
    let m = jm.m;
    iEnd = jm.iEnd;
    // Derecho por el cruce, pero los carriles de un costado se van por una
    // salida (exit only): "keep left" con las flechas, como el juego. Solo
    // donde no hay otra maniobra (laneKeepAt, Discord 17-10).
    if (!m) {
      // Y solo si hay otra salida que se aleja sin volver a la ruta (de -100
      // a 100 grados): los carriles que rodean una isleta, o una calzada que
      // se parte y se vuelve a juntar, no dan a elegir (10 "keep" de mas en
      // 60 rutas del simulador, la mitad en una autopista de Helsinki).
      // Sin la marca del constructor, el carril de una rampa de entrada que
      // termina en esta salida (laneFromOnRamp): la salida de al lado daba
      // "keep left" porque la autopista doblaba un poco, y esta nada.
      let keep = laneKeepAt(pts, i, iEnd);
      if (!keep) {
        const deRampa = laneKeepAt(pts, i, iEnd, true);
        if (deRampa && laneFromOnRamp({ ...ctx, i }, NAV_LANE_RAMP_M)) keep = deRampa;
      }
      // Con el ajuste "en cada salida" (navEveryExit), tambien donde el carril
      // se agrego para la salida: las que findQuietLanes muestra sin aviso.
      if (!keep && navEveryExit) {
        let direction = null;
        const lanes = laneRecordAt(pts, i, iEnd, (r) => (direction = everyExitKeepSide(r)) != null);
        if (lanes) keep = { direction, lanes };
      }
      const salida = keep && sideExitToward({ ...ctx, i, iEnd, rejoinM: NAV_LANE_KEEP_ESCAPE_M, escapeM: NAV_LANE_KEEP_ESCAPE_M }, 'right', -100, 100);
      if (salida) {
        const repetido = lastKeep && lastKeep.direction === keep.direction && cum[i] - lastKeep.atM <= NAV_LANE_KEEP_REPEAT_M;
        if (!repetido) m = { kind: 'fork', direction: keep.direction, at: i, lanes: keep.lanes, laneKeep: true };
        lastKeep = { direction: keep.direction, atM: cum[i] };
      }
    }
    if (m && m.kind === 'fork' && !m.inCurve && !m.laneKeep && !m.parallel) {
      // La bifurcacion se mide a 250 m: si en ese tramo hay un cruce con un
      // giro de verdad, lo que "se desvia" es ese giro, no una rampa - se
      // deja que el giro se anuncie por si mismo (una esquina de 90 grados
      // avisada como "keep left" 200 m antes confundia). La de un rulo
      // (inCurve) ya se midio en el nodo: el rulo sigue doblando despues. La
      // pareja (parallel) se midio a 100 m y con la flecha del carril: la
      // salida de Odense que dobla al final de la rampa perdia su "keep right".
      // Un giro callado (la curva de la rampa) no se anuncia y no cuenta
      // (turnAfterFork): la salida 50 de Walsenburg quedaba sin nada.
      // Si el giro es para el otro lado despues de una salida de una mano
      // (salir a la derecha y doblar a la izquierda al final de la rampa), la
      // salida se avisa igual.
      if (turnAfterFork(ctx, iEnd, NAV_FORK_LEG_M, NAV_JUNCTION_CLUSTER_GAP_M, NAV_JUNCTION_CLUSTER_SPAN_M, here, NAV_JUNCTION_CURVE_SPAN_M, m.direction)) m = null;
    }
    if (continuesTurn(prevTurn, m, cum[i], NAV_TURN_LEG_M + 20, 135, NAV_TURN_ANGLE_THRESHOLD_DEG)) {
      prevTurn.end = cum[iEnd]; // la segunda mitad de la misma esquina
      prevTurn.outBearing = m.outBearing;
      i = iEnd;
      continue;
    }
    prevTurn = m && m.kind === 'turn'
      ? { direction: m.direction, inBearing: m.inBearing, outBearing: m.outBearing, quiet: m.quiet, end: cum[iEnd] } : null;
    if (m && m.quiet) m = null; // curva de la calle, sin otro camino: no se anuncia
    // Ya pasado: no basta con estar en el primer nodo del cruce (parado en la
    // linea de una T se daba por hecho); adentro del cruce decide el rumbo,
    // contra como se entra (los ultimos 10 m antes del nodo).
    if (m) {
      const atI = m.at != null ? m.at : i;
      const entrada = cum[atI] >= 10 ? bearingBetween(pointAt(cum[atI] - 10), pts[atI]) : null;
      if (turnPassed({ atM: cum[atI], endM: cum[iEnd], hereM: cum[here], heading: rumbo, entryBearing: entrada, outBearing: m.outBearing })) m = null;
    }
    // La boca de una rotonda: lo que dobla al salir, o al acercarse a menos
    // de 80 m de la entrada, es parte de la rotonda y ya lo dice su aviso.
    if (m && cum[i] - roundaboutLeftM < 60) m = null;
    if (m) {
      for (let j = iEnd + 1; j < pts.length - 1 && cum[j] - cum[iEnd] <= 80; j++) {
        if (pts[j][3] !== 1) continue;
        const jEnd = junctionClusterEnd(pts, cum, j, NAV_JUNCTION_CLUSTER_GAP_M, NAV_JUNCTION_CLUSTER_SPAN_M);
        if (roundaboutAt(j, jEnd)) { m = null; break; }
        j = jEnd;
      }
    }
    if (m) {
      const at = m.at != null ? m.at : i;
      // Nombre de ruta del tramo AL QUE se gira (no del que se viene): votan
      // varios puntos de la salida (roadSignForTurn en pure.js); sin votos,
      // el cartel mas cercano a un punto un poco despues del giro. No votan
      // los carteles del cruce ni los que quedan mas cerca de otra salida
      // (exitSignTest, otherBranchesAt): el "I-80" del cruce nombraba la
      // rampa a la I-84 en Salt Lake City. Ni los de la otra mano.
      // El "keep" de seguir derecho por los carriles (laneKeep, tambien el de
      // "en cada salida") va sin nombre: la ruta sigue por la misma autopista
      // y los carteles que vienen anuncian las salidas ("Keep left onto
      // US-71" en el trebol de la I-44 en Joplin, Discord 20-10).
      // En una bifurcacion, los carteles pegados al nodo votan solo si no
      // hay otros (ROAD_SIGN_FORK_NEAR_M): ahi las dos ramas van juntas.
      const afterTurnIdx = Math.min(iEnd + 2, pts.length - 1);
      const nearSign = m.laneKeep ? null : roadSignForTurn(pointAt, cum[iEnd], cum[cum.length - 1], nearestRoadName, pts[afterTurnIdx], {
        onExit: exitSignTest({ pts, cum, pointAt, bearingBetween, i, at, iEnd, others: otherBranchesAt({ ...ctx, i, iEnd }) },
          m.kind === 'fork' ? { cercaM: ROAD_SIGN_FORK_NEAR_M } : undefined),
      });
      // Otra calle hacia el mismo lado antes del giro: la voz dice "turn
      // right" recien despues de pasarla (la distancia es hasta su salida).
      let decoyMeters;
      if (m.kind === 'turn') {
        for (let p = passed.length - 1; p >= 0 && cum[at] - cum[passed[p][1]] <= NAV_VOICE_DECOY_M; p--) {
          if (sideExitToward({ ...ctx, i: passed[p][0], iEnd: passed[p][1] }, m.direction)) {
            decoyMeters = cum[passed[p][1]] - cum[here];
            break;
          }
        }
      }
      return { distanceMeters: Math.max(0, cum[at] - cum[here]), direction: m.direction, kind: m.kind, nearSign, decoyMeters, node: [pts[at][0], pts[at][1]],
               lanes: m.lanes || laneGuidanceAt(pts, i, iEnd, m.kind, m.direction) };
    }
    if (cum[iEnd] > cum[here]) passed.push([i, iEnd]);
    i = iEnd; // el resto del cruce ya se evaluo como parte de este
  }
  return null;
}

// Solo actualiza el texto del panel y devuelve el zoom objetivo - ya NO toca
// la camara directamente (antes esto llamaba a su propio easeTo() mientras
// animateTruckTo tambien movia la camara ~60 veces por segundo via jumpTo();
// se pisaban entre si, lo que se sentia como un zoom lento/tosco y ademas
// bloqueaba poder arrastrar el mapa a mano, porque cada frame deshacia el
// drag del usuario). Ahora la camara se actualiza una sola vez por tick,
// desde updateMap, con un unico llamado que combina centro+zoom+bearing.
// Las flechas de carril del cruce del giro (lanesForEdge en pure.js): el
// primer paso del grupo de nodos del cruce que tenga algo que avisar, desde
// el nodo de antes hasta el primero despues: la entrada al prefab suele ser
// el primero del grupo y la salida, el que le sigue al ultimo (sin el, el
// giro a la derecha de Salt Lake City en la demo no tenia flechas).
function laneGuidanceAt(pts, i, iEnd, kind, direction) {
  return laneRecordAt(pts, i, iEnd, (rec) => laneTurnMatches(kind, direction, rec.turn));
}

// "Keep left" sin giro: derecho por un cruce donde los carriles de un
// costado se van por una salida (laneKeepSide en pure.js). El lado y los
// carriles, o null. fromRamp: tambien sin la marca del constructor.
function laneKeepAt(pts, i, iEnd, fromRamp = false) {
  let direction = null;
  const lanes = laneRecordAt(pts, i, iEnd, (rec) => (direction = laneKeepSide(rec, fromRamp)) != null);
  return lanes ? { direction, lanes } : null;
}

// Las flechas del proximo cruce sin aviso (quietLanesAhead en pure.js), para
// mostrar con "Continue straight": solo salidas de autopista (laneKeepSide,
// sin la marca del constructor: no se dice nada, solo se ven), y con otra
// salida que se aleja de verdad, como los "keep" por carriles. Y solo si el
// carril de la ruta sigue derecho: si va a la salida, el panel diria
// "Continue straight" con las flechas de salir (Walsenburg, antes de que se
// anunciara esa salida; ver turnAfterFork). Las de doblar en una esquina de
// ciudad no: con un carril de giro en cada cuadra, las flechas aparecian y
// se iban a cada rato. Como un giro para
// stabilizeManeuver ({ kind: 'lanes', node, distanceMeters, lanes }), o null.
function findQuietLanes() {
  if (!routeLanes || !routeGraph || !currentRouteWorldPoints || currentRouteWorldPoints.length < 3 || !toLngLat) return null;
  const pts = routeBehind.length ? routeBehind.concat(currentRouteWorldPoints) : currentRouteWorldPoints;
  const here = routeBehind.length;
  const { cum, pointAt } = routeMetrics(pts);
  const bearingBetween = (p, q) => {
    const [lng1, lat1] = toLngLat(p[0], p[1]);
    const [lng2, lat2] = toLngLat(q[0], q[1]);
    return geoBearingDeg(lng1, lat1, lng2, lat2);
  };
  const ctx = { pts, cum, pointAt, bearingBetween, nodes: routeGraph.nodes, nodeXY: routeGraph.nodeXY, adjacency: routeGraph.adjacency,
    rejoinM: NAV_LANE_KEEP_ESCAPE_M, escapeM: NAV_LANE_KEEP_ESCAPE_M };
  const q = quietLanesAhead(pts, cum, here, NAV_QUIET_LANES_M, (i, iEnd) => {
    const rec = laneRecordAt(pts, i, iEnd, (r) => everyExitKeepSide(r) != null);
    return rec && sideExitToward({ ...ctx, i, iEnd }, 'right', -100, 100) ? rec : null;
  }, NAV_JUNCTION_CLUSTER_GAP_M, NAV_JUNCTION_CLUSTER_SPAN_M);
  return q ? { kind: 'lanes', direction: null, node: q.node, distanceMeters: q.distanceMeters, lanes: q.lanes } : null;
}

// El primer paso del cruce cuyos carriles cumplen `accept` (ver laneGuidanceAt).
function laneRecordAt(pts, i, iEnd, accept) {
  if (!routeLanes || !routeGraph) return null;
  let k = i - 1;
  while (k > 0 && pts[k][4] == null) k--;
  let hasta = iEnd + 1;
  while (hasta < pts.length - 1 && pts[hasta][4] == null) hasta++;
  let prev = null;
  for (; k <= hasta && k < pts.length; k++) {
    const node = pts[k][4];
    if (node == null) continue;
    if (prev != null && prev !== node) {
      const d = routeGraph.dirEdge(prev, node);
      if (d !== -1) {
        const rec = lanesForEdge(routeLanes, routeGraph.adjEdge[d], routeGraph.adjRev[d]);
        if (rec && accept(rec)) return rec;
      }
    }
    prev = node;
  }
  return null;
}

// Las flechas de carril (lanesHtml, LANE_PATHS) viven en pure.js: las usan
// tambien el overlay de OBS y el registro que va en nav_hud.

function escapeHtml(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------------------------------------------------------------------------
// Ventana flotante siempre visible (Document Picture-in-Picture, Chrome y
// Edge 116+): el proximo giro, la velocidad con el limite, lo que falta y la
// llegada, en una ventanita que queda arriba del juego si este corre en
// pantalla completa sin bordes (desde la 1.50 ETS2/ATS ya no usan la
// exclusiva). Es la etapa 0 del overlay: sin instalar nada, y la voz sigue
// saliendo de esta pagina. Lee lo que ya muestra el tablero (panel de
// navegacion, mini-HUD, resumen de ruta) en vez de recalcularlo, y se
// actualiza con cada dato (refreshPip desde handleTelemetry): con el
// navegador tapado por el juego los temporizadores de la pagina se frenan.
// ---------------------------------------------------------------------------
let pipWin = null;
let pipTurnHtml = null; // el texto del giro, lo arma updateMap en cada dato
// Lo que falta para el descanso, en horas de juego como la fila del panel
// (updateHud), o null con la fatiga apagada. "The only thing missing that I
// would like to see is the time remaining before rest in that window"
// (Discord, 17-10).
let pipRest = null;
const PIP_CSS = `
  html, body { margin: 0; height: 100%; background: #14171c; color: #f2f3f5;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif; overflow: hidden; }
  .pip { box-sizing: border-box; height: 100%; padding: 0.6rem 0.8rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .giro { font-size: clamp(1rem, 6.5vw, 2.4rem); font-weight: 700; line-height: 1.15; flex: 1; display: flex;
    flex-direction: column; justify-content: center; }
  .giro .navNext { display: block; font-size: 0.5em; font-weight: 400; color: #9aa4b2; margin-top: 0.2rem; }
  .fila { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem 0.6rem; font-variant-numeric: tabular-nums; }
  .vel b { font-size: clamp(1.1rem, 7vw, 2.2rem); }
  .vel span { color: #9aa4b2; font-size: 0.8rem; margin-left: 0.2rem; }
  .lim { width: 2.2rem; height: 2.2rem; border-radius: 50%; border: 0.25rem solid #e53935; background: #fff;
    color: #111; font-weight: 800; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; flex: none; }
  .lim[hidden] { display: none; }
  .lim.pasado { animation: pipPulso 1s ease-in-out infinite; }
  @keyframes pipPulso { 50% { box-shadow: 0 0 0 0.35rem rgba(229,57,53,0.45); } }
  .dato { display: flex; flex-direction: column; margin-left: auto; text-align: right; }
  .dato + .dato { margin-left: 0; }
  .dato b { font-size: 1.05rem; }
  .dato span { color: #9aa4b2; font-size: 0.7rem; }
  .dato[hidden] { display: none; }
  .modo { position: absolute; top: 0.35rem; right: 0.35rem; z-index: 5; min-width: 24px; min-height: 24px;
    padding: 0.2rem 0.6rem; border-radius: 999px; border: 1px solid #333a44; background: rgba(20,23,28,0.9);
    color: #f2f3f5; font: inherit; font-size: 0.75rem; cursor: pointer; }
  .modo[hidden] { display: none; }
  .mapa { display: none; position: relative; flex: 1; min-height: 0; }
  .pip.conMapa { padding: 0; gap: 0; }
  .conMapa .mapa { display: block; }
  .conMapa .giro { flex: none; font-size: clamp(0.9rem, 4.6vw, 1.3rem); padding: 0.4rem 4.5rem 0.4rem 0.6rem; }
  .conMapa .fila { padding: 0.35rem 0.6rem 0.45rem; }
  .mapa > #mapCanvas { position: absolute; inset: 0; width: 100%; height: 100%; }
`;

function pipSupported() {
  return 'documentPictureInPicture' in window;
}

async function openPip() {
  if (pipWin) { try { pipWin.focus(); } catch (err) { /* nada */ } return; }
  const conMapa = pipMapWanted();
  let w;
  try {
    w = await documentPictureInPicture.requestWindow(pipWindowSize(conMapa));
  } catch (err) {
    console.error('No se pudo abrir la ventana flotante', err);
    return;
  }
  setupPipWindow(w, conMapa);
}

// Arma la ventana flotante en w (la de Document Picture-in-Picture; las
// pruebas le pasan la de un iframe, porque el navegador de algunas
// herramientas no abre ventanas). conMapa: arranca con el mapa adentro.
function setupPipWindow(w, conMapa) {
  pipWin = w;
  const d = w.document;
  d.title = 'Truck Dash';
  const estilo = d.createElement('style');
  estilo.textContent = PIP_CSS;
  d.head.appendChild(estilo);
  d.body.innerHTML = `<div class="pip" id="pCaja">
      <button type="button" class="modo" id="pModo" hidden></button>
      <div class="giro" id="pGiro"></div>
      <div class="mapa" id="pMapa"></div>
      <div class="fila">
        <div class="lim" id="pLim" hidden></div>
        <div class="vel"><b id="pVel">--</b><span id="pUnidad"></span></div>
        <div class="dato"><b id="pFalta">--</b><span>${escapeHtml(t('routeRemainingLabel'))}</span></div>
        <div class="dato"><b id="pLlega">--</b><span>${escapeHtml(t('routeArrivalLabel'))}</span></div>
        <div class="dato" id="pDescansoCaja" hidden><b id="pDescanso">--</b><span>${escapeHtml(t('pipRestLabel'))}</span></div>
      </div>
    </div>`;
  d.getElementById('pModo').addEventListener('click', () => {
    if (pipMapOn) pipMapOut(); else pipMapIn();
    // El clic adentro de la ventana deja cambiarle el tamano
    const { width, height } = pipWindowSize(pipMapOn);
    try { w.resizeTo(width, height); } catch (err) { /* el usuario la estira a mano */ }
  });
  // Arrastrar el mapa adentro de la ventana: el soltar llega a esta ventana
  // y no a la pestana (ver mapPointersDown). Sin esto el seguimiento del
  // camion quedaba cortado despues del primer toque.
  for (const type of ['pointerup', 'pointercancel']) {
    w.addEventListener(type, (e) => mapPointersDown.delete(e.pointerId), true);
  }
  w.addEventListener('blur', () => mapPointersDown.clear());
  w.addEventListener('resize', () => { if (pipMapOn && map) map.resize(); });
  w.addEventListener('pagehide', () => {
    // El mapa vuelve a la pestana antes de que la ventana se destruya; la
    // preferencia queda para la proxima vez que se abra.
    pipMapOut(true);
    pipWin = null;
  });
  if (conMapa) pipMapIn();
  refreshPipMode();
  refreshPip();
}

// ---------------------------------------------------------------------------
// Mini mapa en la ventana flotante (prototipo, 16-10). Pedido de Discord: "a
// mini map inside the small pop out window that stays on top of the game,
// or a window that can be moved and resized to replace the in-game GPS map".
// El mapa no se duplica: el mismo contenedor de MapLibre se muda a la
// ventana y vuelve al cerrarla (el contexto WebGL sobrevive la mudanza).
// Mientras esta afuera la camara va como en el modo navegacion (adelante
// para arriba) y los cuadros los pide tambien esa ventana (createFrameRace):
// con la pestana tapada por el juego Chrome no le da cuadros a la pestana.
// Se activa con el boton Mapa de la propia ventana y se recuerda.
// ---------------------------------------------------------------------------
const PIP_MAP_KEY = 'truckdash_pip_map';
let pipMapHome = null; // { parent, next }: donde estaba el mapa en la pestana
const frameRace = createFrameRace(window.requestAnimationFrame.bind(window), window.cancelAnimationFrame.bind(window), () => performance.now());
let frameRaceInstalled = false;

function pipMapWanted() {
  return lsGet(PIP_MAP_KEY) === '1';
}

// Desde la primera mudanza, todos los pedidos de cuadros (MapLibre, la
// camara, el marcador, la telemetria) pasan por la carrera entre ventanas.
// No se desinstala: un pedido hecho por ella tiene que cancelarse por ella.
function installFrameRace() {
  if (frameRaceInstalled) return;
  frameRaceInstalled = true;
  window.requestAnimationFrame = (cb) => frameRace.request(cb);
  window.cancelAnimationFrame = (id) => frameRace.cancel(id);
}

// Las hojas de estilo de la pagina (MapLibre, los marcadores), una vez por
// ventana: sin ellas los controles y el camion quedaban sin forma. Las de
// otro origen van como link.
function copyStylesTo(d) {
  if (d.getElementById('pEstilosMapa')) return;
  const marca = d.createElement('meta');
  marca.id = 'pEstilosMapa';
  d.head.appendChild(marca);
  for (const hoja of document.styleSheets) {
    try {
      const st = d.createElement('style');
      st.textContent = [...hoja.cssRules].map(r => r.cssText).join('\n');
      d.head.insertBefore(st, d.head.firstChild);
    } catch (err) {
      if (!hoja.href) continue;
      const link = d.createElement('link');
      link.rel = 'stylesheet';
      link.href = hoja.href;
      d.head.insertBefore(link, d.head.firstChild);
    }
  }
}

function pipMapIn() {
  if (!pipWin || !map || pipMapOn) return;
  const w = pipWin;
  const d = w.document;
  copyStylesTo(d);
  installFrameRace();
  frameRace.setExtra({ raf: (cb) => w.requestAnimationFrame(cb), cancel: (id) => w.cancelAnimationFrame(id) });
  const cont = map.getContainer();
  pipMapHome = { parent: cont.parentElement, next: cont.nextSibling };
  d.getElementById('pMapa').appendChild(cont);
  pipMapOn = true;
  d.getElementById('pCaja').classList.add('conMapa');
  document.getElementById('mapAway').hidden = false;
  lsSet(PIP_MAP_KEY, '1');
  map.resize();
  snapNavCamera();
  resumeMapFollow();
  refreshPipMode();
}

// keepPref: al cerrar la ventana el mapa vuelve, pero la proxima abre con el.
function pipMapOut(keepPref = false) {
  if (!pipMapOn) return;
  const cont = map.getContainer();
  const home = pipMapHome;
  home.parent.insertBefore(cont, home.next && home.next.parentNode === home.parent ? home.next : null);
  pipMapOn = false;
  pipMapHome = null;
  frameRace.setExtra(null);
  if (pipWin) pipWin.document.getElementById('pCaja').classList.remove('conMapa');
  document.getElementById('mapAway').hidden = true;
  if (!keepPref) lsSet(PIP_MAP_KEY, '0');
  map.resize();
  snapNavCamera();
  resumeMapFollow();
  refreshPipMode();
}

// Inclinacion, relleno y rumbo de la camara de una, sin animar: con el modo
// navegacion apagado la camara que sigue al camion solo mueve el centro, y su
// primer cuadro cortaba el easeTo de applyNavCamera. Al volver de la ventana
// el camion quedaba abajo, con el relleno de navegacion (16-10). Antes se
// corta la animacion del tick anterior: iba hacia el rumbo y el relleno del
// otro modo y los volvia a poner en cada cuadro.
function snapNavCamera() {
  if (!map) return;
  stopFrameJob('camera');
  const nav = navCameraOn();
  map.jumpTo({ pitch: nav && nav3d ? 58 : 0, padding: navPadding(), ...(nav ? {} : { bearing: 0 }) });
}

function refreshPipMode() {
  if (!pipWin) return;
  const btn = pipWin.document.getElementById('pModo');
  if (!btn) return;
  btn.hidden = !map; // sin WebGL no hay mapa para mudar
  btn.textContent = t(pipMapOn ? 'pipMapHide' : 'pipMapShow');
  btn.setAttribute('aria-pressed', pipMapOn ? 'true' : 'false');
}

function refreshPip() {
  if (!pipWin) return;
  const d = pipWin.document;
  const $ = (id) => document.getElementById(id);
  const giro = d.getElementById('pGiro');
  if (!giro) return;
  giro.innerHTML = pipTurnHtml || escapeHtml(noRouteText());
  d.getElementById('pVel').textContent = $('miniSpeedBig').textContent;
  d.getElementById('pUnidad').textContent = $('miniSpeedUnitLabel').textContent;
  const limite = $('miniLimitSign').textContent.trim();
  const lim = d.getElementById('pLim');
  lim.hidden = !limite || limite === '--';
  lim.textContent = limite;
  const vel = parseFloat($('miniSpeedBig').textContent);
  lim.classList.toggle('pasado', !lim.hidden && Number.isFinite(vel) && vel > parseFloat(limite) + 2);
  const resumen = routeSummaryShown();
  d.getElementById('pFalta').textContent = resumen ? $('routeRemaining').textContent : '--';
  d.getElementById('pLlega').textContent = resumen ? $('routeArrival').textContent : '--';
  d.getElementById('pDescansoCaja').hidden = !pipRest;
  if (pipRest) d.getElementById('pDescanso').textContent = pipRest;
}

function initPip() {
  const btn = document.getElementById('pipBtn');
  if (!btn || !pipSupported()) return;
  btn.style.display = '';
  btn.addEventListener('click', openPip);
  document.getElementById('mapAwayBack').addEventListener('click', () => pipMapOut());
}

// ---------------------------------------------------------------------------
// Vista de cabina (?cab=1, 17-10). Discord: un usuario puso el tablero en la
// pantalla del GPS del camion con un mod que copia una ventana a esa
// pantalla (PrismTextureStreamer), pero copiaba el tablero entero, con
// botones y letra chica que ahi no se leen ni se pueden tocar. Esta es la
// misma pagina en una ventana aparte (cabViewBtn en Ajustes) con el mapa en
// modo navegacion, el giro arriba y la velocidad y la llegada abajo, en
// letra que crece con la ventana, y el mapa estirado igual (applyCabScale).
// Como la ventana flotante, lee lo que ya muestra el tablero (panel de
// navegacion, mini-HUD, resumen de ruta).
// La pestana compite por ser la lider como cualquier otra: si es la unica
// abierta, la voz y los viajes guardados salen de ella.
// ---------------------------------------------------------------------------
const CAB_HINT_MS = 8000;
const CAB_SIZE_HINT_MS = 1500;
let cabHintTimer = null;

function showCabHint(texto, ms) {
  const hint = document.getElementById('cabHint');
  hint.textContent = texto;
  hint.hidden = false;
  clearTimeout(cabHintTimer);
  cabHintTimer = setTimeout(() => { hint.hidden = true; }, ms);
}

// El mapa, estirado como con el zoom del navegador (cabMapScale): el
// contenedor toma el tamano de la ventana dividido k y se agranda k veces,
// y MapLibre dibuja a k veces la densidad para que no salga borroso. Nadie
// lo toca (cabScreen lo tapa), asi que el transform no molesta a los gestos.
// La letra crece con --cab-size (app.css).
function applyCabScale() {
  if (!cabMode) return;
  document.documentElement.style.setProperty('--cab-size', String(cabSize));
  const panel = document.getElementById('mapPanel');
  const cont = document.getElementById('mapCanvas');
  const w = panel.clientWidth, h = panel.clientHeight;
  if (!w || !h) return;
  const k = cabMapScale(h, cabSize);
  cont.style.width = `${w / k}px`;
  cont.style.height = `${h / k}px`;
  cont.style.transformOrigin = '0 0';
  cont.style.transform = k > 1 ? `scale(${k})` : '';
  if (map) map.setPixelRatio((liteMode ? 1 : window.devicePixelRatio || 1) * k);
}

function refreshCab() {
  const $ = (id) => document.getElementById(id);
  // updateNavPanel lo esconde con la ruta borrada a mano; navPanelParts
  // queda con el ultimo giro.
  const parts = $('navPanel').style.display !== 'none' ? navPanelParts : null;
  $('cabTop').hidden = false;
  $('cabBar').hidden = false;
  $('cabIcon').innerHTML = parts ? turnIconHtml(parts.info) : '';
  $('cabTurnText').textContent = parts ? turnTextWithoutArrow(parts.text) : noRouteText();
  $('cabLanes').innerHTML = parts ? lanesHtml(parts.lanes) : '';
  $('cabNext').textContent = parts ? parts.next : '';
  $('cabSpeed').textContent = $('miniSpeedBig').textContent;
  $('cabUnit').textContent = $('miniSpeedUnitLabel').textContent;
  const mini = $('miniLimitSign');
  const limite = mini.textContent.trim();
  const lim = $('cabLimit');
  lim.hidden = !limite || limite === '--';
  lim.textContent = limite;
  lim.classList.toggle('over', !lim.hidden && mini.classList.contains('over'));
  const resumen = routeSummaryShown();
  $('cabRemaining').textContent = resumen ? $('routeRemaining').textContent : '--';
  $('cabArrival').textContent = resumen ? $('routeArrival').textContent : '--';
}

// Va al final del archivo: setNavMode usa variables (let) de mas abajo.
function initCab() {
  if (!cabMode) return;
  const pantalla = document.getElementById('cabScreen');
  pantalla.hidden = false;
  // Abierta a mano sin codigo: queda la fila de conectar (ver connectBtn)
  const params = new URLSearchParams(location.search);
  if (!params.get('code') && !params.get('local') && !params.get('demo')) document.documentElement.classList.add('cabNeedsCode');
  setNavMode(true);
  applyCabScale();
  // Pantalla completa, zoom del navegador o ventana estirada a mano
  if (window.ResizeObserver) new ResizeObserver(applyCabScale).observe(document.getElementById('mapPanel'));
  else window.addEventListener('resize', applyCabScale);
  // Un clic pone o saca la pantalla completa: en el monitor de al lado la
  // ventana queda sin bordes ni barras, que el mod copiaria tambien.
  pantalla.addEventListener('click', toggleFsMode);
  if (document.documentElement.requestFullscreen) showCabHint(t('cabFullscreenHint'), CAB_HINT_MS);
  document.addEventListener('fullscreenchange', () => { if (document.fullscreenElement) document.getElementById('cabHint').hidden = true; });
  // + y - cambian el tamano: con un clic no se puede (pone pantalla
  // completa) y el zoom del navegador ya no hace nada aca (applyCabScale).
  document.addEventListener('keydown', (e) => {
    // Ctrl + es el zoom del navegador; la fila de conectar tambien recibe teclas
    if (e.ctrlKey || e.metaKey || e.altKey || (e.target.closest && e.target.closest('input, select, textarea'))) return;
    const nuevo = cabSizeStep(cabSize, e.key);
    if (nuevo === null) return;
    e.preventDefault();
    cabSize = nuevo;
    lsSet(CAB_SIZE_KEY, String(cabSize));
    applyCabScale();
    showCabHint(`${t('dashSize')} ${Math.round(cabSize * 100)}%`, CAB_SIZE_HINT_MS);
  });
}

let navPanelParts = null; // lo ultimo que mostro el panel, para el mini-HUD
const turnAnnouncer = createTurnAnnouncer();
// Los ultimos avisos mostrados, para "Copy turn report" (createTurnLog)
const turnLog = createTurnLog();
function updateNavPanel(turn) {
  if (lastData && dismissedRouteIdentity === routeIdentity(lastData)) {
    document.getElementById('navPanel').style.display = 'none';
    return;
  }
  const panel = document.getElementById('navPanel');
  navPanelParts = navTurnParts(turn);
  let html = navPanelHtml(turn);
  // Ruta en el GPS del juego que la app no puede seguir: por que, y el
  // buscador para ponerle el destino aca (openPoiModal, un toque = waypoint).
  if (!navPanelParts && noRouteNow === 'game_gps') {
    html += `<span class="navNext navHint">${escapeHtml(t('navGameRouteHint'))}</span>`
      + `<button type="button" class="navSearchBtn" data-nav-search>${escapeHtml(t('navSearchDestination'))}</button>`;
  }
  // Solo si cambio: con el boton adentro, rehacerlo en cada dato se comia el
  // toque (y el foco del teclado) si caia entre que se apreta y se suelta.
  if (html !== panel.dataset.html) {
    panel.innerHTML = html;
    panel.dataset.html = html;
  }
  panel.style.display = 'block';
  // Lector de pantalla: el giro una vez por maniobra, no en cada dato
  const aviso = turnAnnouncer.next(turn, navPanelParts && navPanelParts.text);
  if (aviso) document.getElementById('navLive').textContent = aviso;
}

// El texto del proximo giro: lo usan el panel de navegacion, la ventana
// flotante y el overlay del cliente (los dos ultimos lo muestran aunque el
// modo navegacion este apagado). Texto plano: cada uno lo escapa o lo pinta.
// info: la maniobra lista para mostrar (turnInstructionText), que tambien
// viaja en nav_hud para el overlay de OBS.
function navTurnParts(turn) {
  const next = nextCityName ? `${t('navNextCity')}: ${nextCityName}` : '';
  let info = null;
  if (turn) {
    info = {
      kind: turn.kind, direction: turn.direction, exit: turn.exit, ccw: turn.ccw,
      // distanceMeters es de mundo y desde el primer punto de la ruta (el
      // camion): se lo mide sobre ella a la escala de cada parte. A 1:20 una
      // bifurcacion a menos de 1 km en Rockford era "in 5 mi" (14-10).
      meters: currentRouteWorldPoints
        ? gameScale().routeMeters(currentRouteFull, currentRouteWorldPoints, turn.distanceMeters)
        : turn.distanceMeters * distanceScale(),
      sign: turn.nearSign ? { kind: turn.nearSign.kind, label: turn.nearSign.label } : null,
    };
  } else if (currentRouteWorldPoints) {
    info = 'straight';
  }
  if (!info) return null;
  return { text: turnInstructionText(info, { t, imperial: useImperial, lang: currentLang }), next, info, nextCity: nextCityName || '',
    lanes: laneHudRecord(navLanesFor(turn)) };
}

// Las flechas que van abajo del texto: las del giro, o con el giro en
// seguir derecho, las del proximo cruce sin aviso (navQuietLanes).
function navLanesFor(turn) {
  if (turn) return turn.lanes || null;
  return currentRouteWorldPoints && navQuietLanes ? navQuietLanes.lanes : null;
}

// Lo que se dice sin indicaciones: si el GPS del juego tiene una ruta que la
// app no puede seguir (sin trabajo, #56), sus km en vez de "No destination set".
function noRouteText() {
  return noRouteNow === 'game_gps'
    ? t('navGameRouteOnly', gameRouteDistanceText(gameRouteKmNow, useImperial, currentLang))
    : t('navNoRoute');
}

function navPanelHtml(turn) {
  const parts = navTurnParts(turn);
  if (!parts) return escapeHtml(noRouteText());
  return escapeHtml(parts.text) + lanesHtml(navLanesFor(turn))
    + (parts.next ? `<span class="navNext">${escapeHtml(parts.next)}</span>` : '');
}

// El boton de buscar destino del panel (updateNavPanel): por delegacion,
// porque el contenido se rehace cuando cambia.
document.getElementById('navPanel').addEventListener('click', (e) => {
  if (document.body.classList.contains('editLayout')) return; // acomodando, un toque mueve
  if (e.target.closest && e.target.closest('[data-nav-search]')) openPoiModal();
});

// ---------------------------------------------------------------------------
// Overlay en el juego (client/overlay.py): el cliente dibuja una ventanita
// arriba del juego con la velocidad y el limite, que lee el mismo. El giro,
// la proxima ciudad, lo que falta y la llegada los calcula esta pagina, asi
// que se los manda como texto ya traducido. Solo si el cliente avisa en
// client_status que lo tiene prendido; por el relay o directo en LAN. Cada
// vez que cambia y, si no cambia, cada 3 s: el cliente saca el giro si pasan
// 6 s sin noticias (pestana cerrada, celular bloqueado).
// El overlay de OBS (docs/overlay/) lee lo mismo: el relay le reenvia el
// nav_hud y avisa en session_state (obs_overlay) si hay uno mirando. Para el
// van turnInfo, nextCity, remainingKm y seconds, sin traducir: lo escribe
// en su idioma y unidades.
// ---------------------------------------------------------------------------
let clientOverlayOn = false;
let obsOverlayOn = false;
let overlayTurnParts = null; // lo arma updateMap en cada dato
// Lo que falta y los segundos reales del resumen de ruta, como numeros
let routeSummaryNumbers = null;
let navHudLastSig = '';
let navHudLastSent = 0;
const NAV_HUD_MIN_MS = 400;
const NAV_HUD_KEEPALIVE_MS = 3000;
// Quien manda: con dos tableros abiertos (la pestana que abre el cliente en
// la PC y el celular por LAN) los dos mandan nav_hud y el overlay saltaba de
// uno a otro, cada uno con su ruta y sus unidades ("the in game overlay kept
// bouncing the distance remaining around", Discord 10-10). Con esto el
// cliente se queda con uno mientras siga mandando (overlay.OverlayData).
const NAV_HUD_SRC = Math.random().toString(36).slice(2, 10);

function sendNavHud() {
  if (!isLeaderTab) return; // ver requestLeadership
  if ((!clientOverlayOn && !obsOverlayOn) || conn.demo || conn.spectator || !ws || ws.readyState !== WebSocket.OPEN) return;
  const $ = (id) => document.getElementById(id);
  const resumen = routeSummaryShown();
  const info = overlayTurnParts ? overlayTurnParts.info : null;
  const numeros = resumen ? routeSummaryNumbers : null;
  const msg = {
    type: 'nav_hud',
    turn: overlayTurnParts ? overlayTurnParts.text : '',
    next: overlayTurnParts ? overlayTurnParts.next : '',
    // Para OBS. Redondeado: con la precision completa cambiaria en cada dato
    // y se mandaria cada 400 ms en vez de al cambiar.
    turnInfo: info && typeof info === 'object'
      ? { ...info, meters: Math.round(info.meters / 10) * 10, sign: info.sign ? { kind: info.sign.kind, label: String(info.sign.label).slice(0, 60) } : null }
      : info,
    nextCity: overlayTurnParts ? overlayTurnParts.nextCity.slice(0, 60) : '',
    // Los carriles del giro (laneHudRecord): numeros, cada overlay los dibuja
    lanes: overlayTurnParts ? overlayTurnParts.lanes : null,
    remainingKm: numeros && Number.isFinite(numeros.remainingKm) ? Math.round(numeros.remainingKm * 10) / 10 : null,
    seconds: numeros && Number.isFinite(numeros.seconds) ? Math.round(numeros.seconds / 10) * 10 : null,
    remaining: resumen ? $('routeRemaining').textContent.trim() : '',
    arrival: resumen ? $('routeArrival').textContent.trim() : '',
    // Todas las etiquetas del overlay salen de aca, en el idioma del
    // tablero: si no, el giro salia en un idioma y las llegadas en el de
    // Windows.
    remainingLabel: t('routeRemainingLabel'),
    arrivalLabel: t('overlayArrivalReal'),
    gameArrivalLabel: t('overlayArrivalGame'),
    imperial: !!useImperial,
    // El formato de hora de Ajustes: el overlay del juego calcula la
    // llegada del juego y el de OBS las dos, y tienen que salir como aca.
    clock12: hour12(),
    src: NAV_HUD_SRC,
  };
  const sig = JSON.stringify(msg);
  const now = Date.now();
  if (sig === navHudLastSig ? now - navHudLastSent < NAV_HUD_KEEPALIVE_MS : now - navHudLastSent < NAV_HUD_MIN_MS) return;
  navHudLastSig = sig;
  navHudLastSent = now;
  ws.send(sig);
}

function setClientOverlay(on) {
  clientOverlayOn = !!on;
  if (!clientOverlayOn && !obsOverlayOn) overlayTurnParts = null;
}
function setObsOverlay(on) {
  const antes = obsOverlayOn;
  obsOverlayOn = !!on;
  if (!clientOverlayOn && !obsOverlayOn) overlayTurnParts = null;
  if (obsOverlayOn && !antes) navHudLastSig = ''; // que le llegue ya, no al proximo cambio
}

// ---------------------------------------------------------------------------
// Guia por voz. Que decir y cuando lo decide createVoiceGuide (pure.js); aca
// solo se carga la voz y se reproduce. Las voces y frases estan en
// voice/voices.json; cada voz es un paquete con un MP3 por frase
// (tools/build_voice_packs.py). Turco no tiene voz con licencia libre: lee el
// mismo texto con la voz del sistema, que en estas frases no tiene nombres
// que pronunciar mal (por eso se habia sacado la voz anterior, 18-09).
// ---------------------------------------------------------------------------
const voiceGuide = createVoiceGuide({ timing: voiceTiming });
let voiceCatalog = null;
let voiceCatalogLoading = null;
const voicePacks = {}; // id -> promesa del paquete
let voiceAudio = null;
// WAV vacio: reproducirlo dentro del toque deja habilitado el audio en
// Safari (iPhone/iPad), que si no rechaza play() fuera de un gesto. La voz
// se carga por red despues, y eso ya no cuenta como gesto.
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

function loadVoiceCatalog() {
  if (voiceCatalog) return Promise.resolve(voiceCatalog);
  if (!voiceCatalogLoading) {
    voiceCatalogLoading = fetch('voice/voices.json')
      .then(r => (r.ok ? r.json() : null))
      .then(c => { voiceCatalog = c; voiceCatalogLoading = null; return c; })
      .catch(() => { voiceCatalogLoading = null; return null; });
  }
  return voiceCatalogLoading;
}

function currentVoice() {
  return voiceCatalog ? pickVoice(voiceCatalog.voices, currentLang, voiceByLang[currentLang]) : null;
}

function loadVoicePack(voice) {
  if (!voice || voice.system) return Promise.resolve(null);
  if (!voicePacks[voice.id]) {
    voicePacks[voice.id] = fetch(`voice/${voice.file}`)
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
      .then(p => { if (!p) delete voicePacks[voice.id]; return p; });
  }
  return voicePacks[voice.id];
}

function unlockVoice() {
  try {
    if (!voiceAudio) voiceAudio = new Audio();
    voiceAudio.src = SILENT_WAV;
    if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    return voiceAudio.play().then(() => { voiceUnlocked = true; });
  } catch (e) { return Promise.reject(e); } // sin audio: la guia queda muda
}

// Con la voz ya prendida al cargar la pagina (recargar, la pestana que abre
// el cliente al arrancar) no habia ningun toque que la habilitara: en
// iPhone/iPad, y en la PC si nunca se hacia clic en la pagina, el navegador
// rechazaba cada frase sin decir nada (Discord, 11-10: "it wasn't calling
// them out at all"). El primer toque, clic o tecla en cualquier parte la
// habilita; si igual llega una frase bloqueada, un aviso dice que tocar.
let voiceUnlocked = false;
let voiceBlockedToastAt = 0;
const VOICE_BLOCKED_TOAST_MS = 120000;
function unlockVoiceOnGesture() {
  if (voiceUnlocked || !voiceOn) return;
  unlockVoice().catch(() => {});
}
for (const ev of ['touchend', 'click', 'pointerup', 'keydown']) {
  document.addEventListener(ev, unlockVoiceOnGesture, { capture: true, passive: true });
}
function voicePlayFailed(err) {
  if (!err || err.name !== 'NotAllowedError') return;
  voiceUnlocked = false;
  const now = Date.now();
  if (now - voiceBlockedToastAt < VOICE_BLOCKED_TOAST_MS) return;
  voiceBlockedToastAt = now;
  showToast(t('voiceBlockedToast'), 'danger wrap', 8000);
}

// De a una frase (voiceQueueAction en pure.js): la que suena y la que
// espera. La que espera vence a los VOICE_PENDING_MAX_MS (un "soon" de hace
// rato ya no sirve), y si el audio no avisa que termino (pestana dormida,
// error), a los VOICE_STUCK_MS se da por terminada: la voz no se traba.
let voicePlaying = null; // { key, at, token }
let voicePending = null; // { key, at }
let voiceToken = 0;
const VOICE_PENDING_MAX_MS = 4000;
const VOICE_STUCK_MS = 6000;
function voiceDone(token) {
  if (!voicePlaying || voicePlaying.token !== token) return;
  voicePlaying = null;
  const p = voicePending;
  voicePending = null;
  if (p && Date.now() - p.at <= VOICE_PENDING_MAX_MS) speakVoice(p.key);
}

async function speakVoice(key) {
  const catalog = await loadVoiceCatalog();
  const voice = currentVoice();
  if (!catalog || !voice) return;
  if (voicePlaying && Date.now() - voicePlaying.at > VOICE_STUCK_MS) voicePlaying = null;
  if (voiceQueueAction(voicePlaying && voicePlaying.key, key) === 'queue') {
    voicePending = { key: voiceQueuePick(voicePending && voicePending.key, key), at: Date.now() };
    return;
  }
  const token = ++voiceToken;
  if (voice.system) {
    const text = (catalog.phrases[voice.phrases] || {})[key];
    if (!text || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice.lang;
    u.onend = u.onerror = () => voiceDone(token);
    speechSynthesis.cancel();
    voicePlaying = { key, at: Date.now(), token };
    speechSynthesis.speak(u);
    return;
  }
  const pack = await loadVoicePack(voice);
  const src = pack && pack.clips && pack.clips[key];
  if (!src) return;
  if (!voiceAudio) voiceAudio = new Audio();
  voiceAudio.onended = voiceAudio.onerror = () => voiceDone(token);
  voiceAudio.src = src;
  voicePlaying = { key, at: Date.now(), token };
  voiceAudio.play().then(() => { voiceUnlocked = true; }, (err) => { voiceDone(token); voicePlayFailed(err); });
}

function fillVoiceSelect() {
  const sel = document.getElementById('setVoiceName');
  if (!sel) return;
  const own = voiceCatalog ? voiceCatalog.voices.filter(v => v.lang === currentLang) : [];
  sel.innerHTML = own.map(v => `<option value="${escapeHtml(v.id)}">${escapeHtml(v.system ? t('settingsVoiceSystem') : v.label)}</option>`).join('');
  const chosen = currentVoice();
  if (chosen) sel.value = chosen.id;
  sel.disabled = own.length < 2;
}

function voiceManeuverTick(turn) {
  if (!voiceOn) return;
  const key = voiceGuide.maneuver(turn, Math.abs(Number(lastData && lastData.speedKmh) || 0));
  if (key && isLeaderTab) speakVoice(key);
}

if (voiceOn) loadVoiceCatalog().then(() => loadVoicePack(currentVoice()));

// Una sola pestana "lider" por navegador. El cliente abre una pestana nueva
// en cada arranque y la de ayer sigue conectada: las dos hablaban (la voz
// doble, desfasada), grababan la misma entrega y le mandaban al overlay y al
// mapa en vivo cada una lo suyo (auditoria del 10-10). La lider es la que
// tiene el lock; la pestana que se mira se lo saca a la otra, que queda en
// espera para cuando esta se cierre. Sin navigator.locks (navegador viejo)
// todas son lider, como antes. Entre dispositivos distintos no aplica.
const LEADER_LOCK = 'truckdash-leader';
let isLeaderTab = !(navigator.locks && navigator.locks.request);
function requestLeadership(steal) {
  if (!navigator.locks || !navigator.locks.request) return;
  navigator.locks.request(LEADER_LOCK, steal ? { steal: true } : {}, () => {
    setLeaderTab(true);
    return new Promise(() => {}); // se tiene hasta cerrar la pestana o que otra lo saque
  }).catch(() => {
    // Otra pestana se lo saco: a la cola, por si esa se cierra.
    setLeaderTab(false);
    requestLeadership(false);
  });
}
function setLeaderTab(on) {
  if (isLeaderTab === on) return;
  isLeaderTab = on;
  const hint = document.getElementById('voiceOtherTabHint');
  if (hint) hint.hidden = on;
  if (on) { liveRouteSig = null; sendLiveRoute(true); navHudLastSig = ''; sendNavHud(); }
}
requestLeadership(document.visibilityState === 'visible');
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !isLeaderTab) requestLeadership(true);
});

// Zoom fijo en modo navegacion - el acercamiento automatico al doblar
// (probado antes) generaba saltos molestos justo en intersecciones/enlaces,
// que es donde mas importa ver el contexto completo, no menos. Fijo pero
// elegible: cada uno lo pone en Ajustes (navZoom); este es el de referencia
// para el tamano de la flecha.
const NAV_FIXED_ZOOM = NAV_ZOOM_DEFAULT;
// La flecha se achica al alejarse y crece al acercarse: alejado tapaba media
// ciudad. Solo escala el div interno; la posicion y el rumbo los maneja
// MapLibre (PR #1).
function updateTruckArrowSize() {
  if (!map || !truckArrowEl) return;
  const scale = Math.max(0.8, Math.min(1.3, 1 + (map.getZoom() - NAV_FIXED_ZOOM) * 0.12)) * truckSize;
  truckArrowEl.style.transform = `scale(${scale})`;
}

function navTargetZoom(turn) {
  return nav3d ? navZoom + 0.7 : navZoom;
}

// Recorta del frente de la ruta calculada (linea roja) el tramo ya recorrido,
// proyectando la posicion actual sobre la polilinea y descartando los puntos
// anteriores - asi no queda roja debajo de la azul (trail) ya recorrida.
// Proxima ciudad sobre la ruta (nextCityAlongRoute en pure.js: la primera
// que la ruta pasa cerca y que esta adelante del camion, salvo la que se
// atraviesa). Se recalcula cada pocos segundos, no por tick.
let nextCityName = null;
let nextCityComputedAt = 0;
function updateNextCity(x, z) {
  const now = performance.now();
  if (now - nextCityComputedAt < 4000) return;
  nextCityComputedAt = now;
  const found = nextCityAlongRoute(currentRouteWorldPoints, citiesAll, [x, z]);
  if (found !== nextCityName) {
    nextCityName = found;
    const row = document.getElementById('nextCityRow');
    if (row) { row.hidden = !found; document.getElementById('nextCity').textContent = found || '-'; }
  }
}

// Solo se proyecta sobre los proximos TRIM_WINDOW_M de ruta: en un enlace
// con puente, la calle transversal (que la ruta recorre 800 m mas adelante,
// despues del lazo) pasa a 10 m del camion y era "el tramo mas cercano" -
// la linea saltaba como si ya se hubiera dado la vuelta (reporte de un
// usuario). El camion avanza < 30 m por tick, asi que la ventana sobra; si
// llega una lectura despues de un hueco, crece con lo que avanzo (ver
// projectAheadOnRoute en pure.js).
const TRIM_WINDOW_M = 400;
// El recorte se lleva al dia en cada tick (lo usan las indicaciones y el
// resumen), pero la linea se vuelve a dibujar a lo sumo una vez por segundo:
// cada dibujo limpia y suaviza la ruta entera y MapLibre la vuelve a cortar
// en tiles, y a 4 Hz eso era un cuarto del CPU de la pestana. En un segundo
// el camion avanza menos de 30 m, que quedan debajo de la flecha y la estela.
const ROUTE_REDRAW_MS = 1000;
let routeDrawnAt = 0;
function trimRouteBehindTruck(x, z) {
  if (!currentRouteWorldPoints || currentRouteWorldPoints.length < 2 || !map.getSource('route')) return;
  const cerca = projectAheadOnRoute(currentRouteWorldPoints, x, z, TRIM_WINDOW_M);
  if (!cerca) return;
  const { idx: bestIdx, point: bestPoint, dist: bestDist } = cerca;
  // Si estamos lejos de la ruta calculada, es un desvio real: offRoute ya se
  // encarga de recalcularla entera, no recortar sobre una ruta vieja. Pero
  // offRoute mira la ruta ENTERA: si el camion quedo sobre ella mas adelante
  // de lo que se busca aca, no salta nunca, la linea se queda congelada
  // atras y las indicaciones piden dar la vuelta. Ahi se recalcula desde
  // donde esta (una sola vez: la ruta nueva arranca en el camion).
  if (bestDist > OFF_ROUTE_THRESHOLD_M) {
    if (distanceToRouteMeters(x, z) <= OFF_ROUTE_THRESHOLD_M) currentRouteTarget = null;
    return;
  }
  // Los nodos que quedan atras se guardan aparte (ROUTE_BEHIND_MAX): findUpcomingTurn
  // los usa para medir el rumbo de ENTRADA a un cruce cercano - sin ellos, a
  // menos de 60 m del cruce el tramo de entrada se achicaba hasta cero y la
  // medicion cambiaba justo al llegar (giros que aparecian/desaparecian).
  // Con una rotonda en pantalla, desde su entrada: en una grande el aviso de
  // la salida se apagaba adentro (ver trimRouteBehind).
  const shown = navManeuverState.shown;
  routeBehind = trimRouteBehind(passedRoutePoints(routeBehind, currentRouteWorldPoints, bestIdx), ROUTE_BEHIND_M, ROUTE_BEHIND_MAX, shown && shown.kind === 'roundabout' ? shown.node : null);
  // El punto interpolado hereda el tramo del nodo que sigue.
  const nextPt = currentRouteWorldPoints[bestIdx + 1];
  currentRouteWorldPoints = [[bestPoint[0], bestPoint[1], 0, 0, null, nextPt && nextPt[5] != null ? nextPt[5] : 0, nextPt ? nextPt[6] : undefined], ...currentRouteWorldPoints.slice(bestIdx + 1)];
  const now = performance.now();
  if (now - routeDrawnAt < ROUTE_REDRAW_MS) return;
  routeDrawnAt = now;
  const parts = splitRouteForDrawing(currentRouteWorldPoints);
  setRouteData(parts.land);
  if (map.getSource('route-next')) map.getSource('route-next').setData(parts.next);
  if (map.getSource('route-ferry')) map.getSource('route-ferry').setData(parts.ferry);
}

let lastDisplayedLngLat = null; // ultima posicion ya animada del marcador ([lng,lat]), para interpolar el proximo tramo
// Un solo reloj para lo que se anima entre ticks (el marcador del camion y
// la camara que lo sigue), a lo sumo 30 cuadros por segundo. Con easeTo()
// MapLibre redibujaba el mapa entero en cada cuadro de la pantalla todo el
// tiempo que se manejaba (los ticks llegan cada 250 ms y cada animacion dura
// casi eso): 60 veces por segundo, 144 con un monitor rapido, y la pestana
// se llevaba 30-40 % de CPU, mas que el juego (reporte en Brave, 30-09-2026).
// Los dos en el mismo cuadro: si el marcador se moviera a 60 y el mapa a 30,
// la flecha temblaria contra la calle.
const FRAME_MIN_MS = 1000 / 30 - 4; // tolerancia: el rAF no cae exacto
const frameJobs = new Map(); // nombre -> fn(now), devuelve false al terminar
let frameRaf = null;
let frameLast = 0;
function runFrameJob(name, fn) {
  frameJobs.set(name, fn);
  if (!frameRaf) frameRaf = requestAnimationFrame(frameLoop);
}
function stopFrameJob(name) { frameJobs.delete(name); }
// Desde cuando cuenta una animacion que arranca de lo que se ve ahora: lo
// que se ve es el ultimo cuadro dibujado, no este instante. Si contara
// desde ahora, el rato entre ese cuadro y la llegada del tick se perdia y
// en cada tick habia un cuadro mas lento (un tiron 4 veces por segundo).
function animStartFromShown() {
  const now = performance.now();
  return frameRaf && now - frameLast < 100 ? frameLast : now;
}
function frameLoop(now) {
  frameRaf = null;
  if (now - frameLast >= FRAME_MIN_MS) {
    frameLast = now;
    for (const [name, fn] of [...frameJobs]) {
      if (frameJobs.get(name) === fn && !fn(now)) frameJobs.delete(name);
    }
  }
  if (frameJobs.size) frameRaf = requestAnimationFrame(frameLoop);
}

// Dedos/mouse apretados sobre el mapa y ultima rueda. Hace falta porque
// jumpTo() arranca con map.stop(), que resetea TODOS los gestos de MapLibre:
// con la camara haciendo jumpTo en cada cuadro, un arrastre nunca llegaba a
// los 3 px que necesita para arrancar (ni a disparar el dragstart que pausa
// el seguimiento), y el mapa no se podia mover. Con easeTo una vez por tick
// esto no se notaba, porque el reseteo era 4 veces por segundo y no 30.
const mapPointersDown = new Set();
let mapWheelUntil = 0;
function mapGestureActive() {
  return mapPointersDown.size > 0 || performance.now() < mapWheelUntil;
}
// La camara que sigue al camion: lo mismo que hacia easeTo (centro, rumbo,
// zoom e inclinacion con rampa lineal), pero con jumpTo en los cuadros del
// reloj comun. Se corta sola si el usuario agarra el mapa.
function followCameraTo(target, ms) {
  const from = { center: map.getCenter(), bearing: map.getBearing(), zoom: map.getZoom(), pitch: map.getPitch() };
  const start = animStartFromShown();
  const dBearing = target.bearing == null ? 0 : ((target.bearing - from.bearing + 540) % 360) - 180;
  runFrameJob('camera', (now) => {
    if (!autoFollow) return false;
    // El usuario puede estar por arrastrar o hacer zoom: no pisarle el gesto.
    // Si era solo un toque, el proximo tick retoma desde donde quedo.
    if (mapGestureActive()) return true;
    const t = Math.min(1, (now - start) / ms);
    const cam = {
      center: [from.center.lng + (target.center[0] - from.center.lng) * t, from.center.lat + (target.center[1] - from.center.lat) * t],
    };
    if (target.bearing != null) cam.bearing = from.bearing + dBearing * t;
    if (target.zoom != null) cam.zoom = from.zoom + (target.zoom - from.zoom) * t;
    if (target.pitch != null) cam.pitch = from.pitch + (target.pitch - from.pitch) * t;
    if (target.padding) cam.padding = target.padding;
    map.jumpTo(cam);
    return t < 1;
  });
}
// Duracion de la interpolacion entre dos ticks de telemetria: se mide el
// intervalo real de llegada (1 s con clientes viejos, 250 ms con 1.5+ por el
// relay, 100 ms en LAN) y se anima un poco MAS que eso, arrancando siempre
// desde donde esta lo mostrado: el tick siguiente llega antes de que la
// animacion termine y el movimiento nunca se frena. Antes duraba el 90 %:
// la camara se quedaba quieta el 10 % restante de cada tick y se veia a
// tirones (medido el 09-10: cada medio segundo un cuadro a un tercio de la
// velocidad). Media movil para que un tick atrasado no rompa el ritmo.
let tickIntervalMs = 1000;
let lastTickArrival = null;
function noteTickArrival() {
  const now = performance.now();
  if (lastTickArrival != null) {
    const delta = Math.max(50, Math.min(2000, now - lastTickArrival));
    tickIntervalMs = tickIntervalMs * 0.7 + delta * 0.3;
  }
  lastTickArrival = now;
}
function moveAnimMs() {
  return Math.max(60, Math.min(1100, tickIntervalMs * 1.1));
}

// Anima SOLO el marcador de forma fluida entre la posicion anterior y la
// nueva (los updates llegan a ~1Hz, sin esto se ve "a los tics"). La camara
// se maneja aparte, una sola vez por tick (ver updateMap) - antes esta misma
// funcion tambien movia la camara en cada frame (~60/s) con jumpTo(), lo que
// se peleaba con el easeTo() del modo navegacion y de paso le ganaba a
// cualquier intento de arrastrar el mapa a mano.
function animateTruckTo(fromLngLat, toPos, fromHeading, toHeading) {
  stopFrameJob('truck');
  // El giro se interpola con la MISMA duracion y la misma rampa lineal que
  // usa el easeTo de la camara para su bearing. Si la flecha salta y el mapa
  // gira progresivamente, los dos nunca coinciden y la flecha se ve torcida
  // respecto de la ruta aunque el rumbo sea correcto.
  const deltaHeading = ((toHeading - fromHeading + 540) % 360) - 180;
  if (liteMode) {
    truckMarker.setLngLat(toPos);
    truckMarker.setRotation(toHeading);
    return; // sin interpolar por frame
  }
  // Desde donde esta el marcador ahora, no desde el destino anterior: la
  // animacion dura un poco mas que un tick y no llega a terminar.
  const ahora = truckMarker.getLngLat();
  fromLngLat = [ahora.lng, ahora.lat];
  const start = animStartFromShown();
  const duracion = moveAnimMs();
  function step(now) {
    const t = Math.min(1, (now - start) / duracion);
    const cur = [
      fromLngLat[0] + (toPos[0] - fromLngLat[0]) * t,
      fromLngLat[1] + (toPos[1] - fromLngLat[1]) * t,
    ];
    truckMarker.setLngLat(cur);
    // En modo navegacion la camara ESTA alineada al rumbo, asi que la flecha
    // tiene que apuntar arriba. Leerlo del bearing real del mapa en vez de
    // interpolar por nuestra cuenta elimina el desfasaje: las dos animaciones
    // (la nuestra y la de MapLibre) no corren al mismo ritmo, y esos pocos
    // grados de diferencia se ven como la flecha torcida respecto de la ruta.
    const alineadaAlMapa = navMode && autoFollow;
    truckMarker.setRotation(alineadaAlMapa
      ? map.getBearing()
      : (fromHeading + deltaHeading * t + 360) % 360);
    return t < 1;
  }
  runFrameJob('truck', step);
}

// Mods de mapa del cliente. Llegan en cada client_status y, al conectar, en
// el client_status que el relay tenia guardado (session_state), que antes se
// ignoraba: un tablero recien abierto (recarga, codigo nuevo) cargaba el mapa
// base hasta el proximo aviso del cliente, el camion en una ciudad de Coast
// to Coast quedaba "fuera del mapa" y la ruta no encontraba la ciudad
// (usuario de C2C + Canada, 10-10).
function applyClientMapMods(st) {
  if (st.activeMods !== undefined) detectedModNames = st.activeMods;
  const mapMods = st.mapMods === undefined ? undefined : holdDetectedMods(detectedMods, st.mapMods);
  if (mapMods !== undefined && JSON.stringify(mapMods) !== JSON.stringify(detectedMods)) {
    detectedMods = mapMods;
    if (modsAuto && lastData && currentGame && resolveEffectiveGame(lastData.game) !== currentGame) currentGame = null; // recarga con la variante detectada
    if (document.getElementById('modsModal').style.display === 'flex') initModsUi();
  }
}

// "Fuera del mapa" solo cuando ya se sabe con que mods juega (o paso un rato:
// un cliente viejo no los manda, y al cargar el juego vienen en null ~40 s).
// Si no, el aviso y el offmap al cliente salian con el mapa base cargado de
// apuro.
const OFFMAP_GRACE_MS = 60000;
function offMapCheckReady(game) {
  if (!modsAuto || (detectedMods && detectedMods[game] != null)) return true;
  return Date.now() - (conn.openedAt || 0) > OFFMAP_GRACE_MS;
}

function resolveEffectiveGame(game) {
  const g = game || 'ats';
  // Armado en la PC para los mods activos: se armo justo porque el de R2 no
  // alcanzaba, asi que va primero.
  if (modsAuto && localMaps[g]) return localMaps[g].variant;
  const det = modsAuto && detectedMods ? detectedMods[g] : null;
  if (det) {
    // Reforma con cualquiera de los otros dos mapas usa el pack "todo" (es
    // un superconjunto: rutas de mas en Canada/costa, nunca de menos).
    if (g === 'ats' && det.reforma && (det.c2c || det.promods_canada)) return 'ats_reforma_c2c_promods';
    if (g === 'ats' && det.reforma) return 'ats_reforma';
    // Western/Eastern Canada Expansion cubre mas Canada que ProMods Canada:
    // si estan los dos, gana el de JacobKazias (no hay variante con ambos).
    if (g === 'ats' && det.canada_expansion) {
      return det.c2c ? publishedVariant('ats_c2c_canada', 'ats_c2c')
                     : publishedVariant('ats_canada', 'ats');
    }
    if (g === 'ats' && det.c2c && det.promods_canada) return 'ats_c2c_promods';
    if (g === 'ats' && det.promods_canada) return 'ats_promods';
    if (g === 'ats' && det.c2c) return 'ats_c2c';
    // European Grand Utopia pega el archipielago a Europa (y pide el Grand
    // Utopia original cargado, asi que grand_utopia tambien viene en true):
    // es Europa, no el mapa standalone. Las variantes eugu traen Europa con
    // el archipielago; si una no estuviera publicada, la de Europa sin islas.
    if (g === 'ets2' && det.eu_grand_utopia) {
      return det.promods ? publishedVariant('ets2_promods_eugu', 'ets2_promods')
                         : publishedVariant('ets2_eugu', 'ets2');
    }
    // Grand Utopia es standalone: si esta activo, el perfil es de ese mapa.
    if (g === 'ets2' && det.grand_utopia) return 'ets2_gu';
    if (g === 'ets2' && det.roextended && det.rusmap) return publishedVariant('ets2_promods_rusmap_roex', 'ets2_promods_rusmap');
    // Roextended sin ProMods (edicion standalone) no tiene variante propia;
    // la Hybrid es lo mas parecido.
    if (g === 'ets2' && det.roextended) return publishedVariant('ets2_promods_roex', 'ets2_promods');
    if (g === 'ets2' && det.promods && det.rusmap) return 'ets2_promods_rusmap';
    if (g === 'ets2' && det.promods) return 'ets2_promods';
    // TruckersMP sin mods de mapa: juego base + sede TMP + CD road. En su
    // servidor ProMods gana ProMods (la sede no esta en ese pack, es minimo).
    if (g === 'ets2' && det.truckersmp) return publishedVariant('ets2_tmp', 'ets2');
    return g;
  }
  if (g === 'ats' && atsMod === 'reforma_c2c_promods_canada') return 'ats_reforma_c2c_promods';
  if (g === 'ats' && atsMod === 'reforma') return 'ats_reforma';
  if (g === 'ats' && atsMod === 'canada') return publishedVariant('ats_canada', 'ats');
  if (g === 'ats' && atsMod === 'c2c_canada') return publishedVariant('ats_c2c_canada', 'ats_c2c');
  if (g === 'ats' && atsMod === 'c2c_promods_canada') return 'ats_c2c_promods';
  if (g === 'ats' && atsMod === 'c2c') return 'ats_c2c';
  if (g === 'ats' && atsMod === 'promods_canada') return 'ats_promods';
  if (g === 'ets2' && ets2Mod === 'gu') return 'ets2_gu';
  if (g === 'ets2' && ets2Mod === 'eugu') return publishedVariant('ets2_eugu', 'ets2');
  if (g === 'ets2' && ets2Mod === 'promods_eugu') return publishedVariant('ets2_promods_eugu', 'ets2_promods');
  if (g === 'ets2' && ets2Mod === 'tmp') return publishedVariant('ets2_tmp', 'ets2');
  if (g === 'ets2' && ets2Mod === 'promods_rusmap_roex') return publishedVariant('ets2_promods_rusmap_roex', 'ets2_promods_rusmap');
  if (g === 'ets2' && ets2Mod === 'promods_roex') return publishedVariant('ets2_promods_roex', 'ets2_promods');
  if (g === 'ets2' && ets2Mod === 'promods_rusmap') return 'ets2_promods_rusmap';
  if (g === 'ets2' && ets2Mod === 'promods') return 'ets2_promods';
  return g;
}

function describeDetectedMods(game) {
  const det = detectedMods ? detectedMods[game] : null;
  if (det === undefined || detectedMods === null) return t('modsDetectNoData');
  if (det === null) return t('modsDetectNoLog');
  const names = [];
  if (det.promods) names.push('ProMods');
  if (det.rusmap) names.push('RusMap');
  if (det.roextended) names.push('Roextended');
  if (det.eu_grand_utopia) names.push('European Grand Utopia');
  else if (det.grand_utopia) names.push('Grand Utopia');
  if (det.truckersmp) names.push('TruckersMP');
  if (det.promods_canada) names.push('ProMods Canada');
  if (det.canada_expansion) names.push('Western/Eastern Canada');
  if (det.c2c) names.push('Coast to Coast');
  if (det.reforma) names.push('Reforma');
  return names.length ? t('modsDetected').replace('{mods}', names.join(' + ')) : t('modsDetectedNone');
}

function updateMap(position, game, gameHeadingDeg) {
  if (position.x == null || position.z == null) return;
  loadGameMap(resolveEffectiveGame(game));
  // loadGameMap es async: entre que setea toLngLat y crea el marcador del
  // camion pasan varios awaits (Cities/grafo/carteles) - los ticks de ese
  // rato se descartan en vez de reventar con truckMarker en null.
  if (!toLngLat || !map || !truckMarker) return;

  const lngLat = toLngLat(position.x, position.z);
  const prevWorldPos = lastWorldPos;
  const prevLngLat = lastDisplayedLngLat;
  // Rumbo con el que empieza el tick: el marcador se interpola desde aca
  // hasta el nuevo, con la misma rampa que usa la camara para su bearing.
  const headingAtTickStart = lastHeadingDeg;
  let justJumped = false;

  if (prevWorldPos) {
    const dx = position.x - prevWorldPos.x;
    const dz = position.z - prevWorldPos.z;
    const movedM = Math.hypot(dx, dz);
    if (movedM > TRAIL_JUMP_THRESHOLD_M) {
      // Un salto grande (teletransporte al asignar trabajo, garage, etc.)
      // deja la ruta ya calculada desalineada del camion. Se fuerza un
      // recalculo la proxima vez que llegue el destino, igual que un GPS
      // recalcula cuando te salis del camino.
      justJumped = true;
      trailWorld.length = 0;
      trailWorldRaw = null;
      headingRef = null;
      currentRouteTarget = null;
      currentRouteWorldPoints = null;
    } else if (Number.isFinite(gameHeadingDeg)) {
      // El juego lo dice: no hay cuerda ni base minima ni espera a moverse.
      // Anda igual girando parado o yendo marcha atras, dos casos donde
      // deducirlo del desplazamiento daba el rumbo equivocado. Pero lo dice
      // sobre la grilla de su mapa, no respecto del norte verdadero: sin
      // pasarlo a geografico la flecha quedaba torcida contra la calle hasta
      // 17 grados en la costa oeste (ver gridHeadingToGeo).
      const geoHeading = gridHeadingToGeo(gameHeadingDeg, position.x, position.z, toLngLat);
      const d = ((geoHeading - lastHeadingDeg + 540) % 360) - 180;
      lastHeadingDeg = (lastHeadingDeg + d * HEADING_GAME_SMOOTH + 360) % 360;
      headingRef = null;
    } else if (prevLngLat && movedM > 0.3) {
      // Sin rumbo del juego (cliente viejo): se deduce del desplazamiento.
      // Bearing geografico real entre la posicion mostrada anterior y la
      // nueva, estable sin importar la rotacion actual del mapa.
      headingRef = headingRef || prevLngLat;
      movedAvgM = movedAvgM * 0.7 + movedM * 0.3;
      const refNeeded = Math.min(HEADING_REF_MAX_M, Math.max(HEADING_REF_MIN_M, movedAvgM * 2));
      const refDist = Math.hypot(position.x - headingRefWorld.x, position.z - headingRefWorld.z);
      let angleDeg = lastHeadingDeg;
      if (refDist >= refNeeded) {
        const raw = geoBearingDeg(headingRef[0], headingRef[1], lngLat[0], lngLat[1]);
        let d = ((raw - lastHeadingDeg + 540) % 360) - 180;
        const k = HEADING_SMOOTH_MIN + (HEADING_SMOOTH_MAX - HEADING_SMOOTH_MIN)
          * Math.min(1, Math.abs(d) / HEADING_SMOOTH_FULL_DEG);
        angleDeg = (lastHeadingDeg + d * k + 360) % 360;
        headingRef = lngLat;
        headingRefWorld = { x: position.x, z: position.z };
      }
      lastHeadingDeg = angleDeg;
    }
  }
  lastWorldPos = { x: position.x, z: position.z };
  if (!conn.demo && !conn.spectator && mapBounds && offMapWarnedFor !== currentGame
      && offMapCheckReady(lastData && lastData.game) && !insideMapBounds(mapBounds, position.x, position.z)) {
    offMapWarnedFor = currentGame;
    const label = (typeof GAME_MAPS !== 'undefined' && GAME_MAPS[currentGame] && GAME_MAPS[currentGame].label) || currentGame;
    showToast(t('offMapNotice').replace('{map}', label), 'info', 20000);
    sendOffMapReport(position.x, position.z);
    // Al cliente (por el relay o directo en LAN): con mods activos ofrece
    // armar el mapa en la PC ("Build my map").
    if (ws && ws.readyState === WebSocket.OPEN && lastData && lastData.game) {
      ws.send(JSON.stringify({ type: 'offmap', game: lastData.game }));
    }
  }
  checkWaypointReached(position.x, position.z);
  updateCurrentRoad(position.x, position.z);
  updateNextCity(position.x, position.z);

  // A 10 Hz un punto por tick llenaria el trail en 100 s: solo se agrega
  // si el camion se movio >= 5 m desde el ultimo punto guardado.
  const lastTrail = trailWorldRaw;
  // Solo cuando suma un punto: cada setData hace que MapLibre vuelva a
  // cortar la linea entera en tiles, y a 4 Hz eso era trabajo tirado.
  if (!lastTrail || Math.hypot(position.x - lastTrail.x, position.z - lastTrail.z) >= 5) {
    trailWorld.push(lngLat);
    trailWorldRaw = { x: position.x, z: position.z };
    if (trailWorld.length > MAX_TRAIL_POINTS) trailWorld.shift();
    if (map.getSource('trail')) {
      map.getSource('trail').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: trailWorld } });
    }
  }

  if (!justJumped && prevLngLat) {
    animateTruckTo(prevLngLat, lngLat, headingAtTickStart, lastHeadingDeg);
  } else {
    truckMarker.setLngLat(lngLat);
    truckMarker.setRotation(lastHeadingDeg);
  }
  lastDisplayedLngLat = lngLat;

  // Camara: un unico llamado por tick que combina centro+zoom+bearing segun
  // corresponda, en vez de varios llamados peleandose entre si.
  // Con la ventana flotante abierta el giro (y la voz) van aunque el modo
  // navegacion este apagado: es lo que muestra.
  // El overlay del cliente tambien guia: el giro va a la ventana del juego y,
  // si la voz esta prendida en Ajustes, se dice desde este dispositivo (el
  // celular o la PC donde este abierto el tablero).
  // El de OBS muestra el giro pero no guia: con el solo, la voz no habla.
  const guiando = navMode || !!pipWin || clientOverlayOn;
  const giroAhora = guiando || obsOverlayOn ? findUpcomingTurn(lastHeadingDeg) : null;
  const turn = guiando || obsOverlayOn ? stabilizeManeuver(navManeuverState, giroAhora, NAV_TURN_DEBOUNCE_TICKS) : null;
  // Sin giro (ni uno a punto de aparecer), las flechas del proximo cruce
  // donde no sirven todos los carriles: abajo de "Continue straight", sin voz.
  navQuietLanes = guiando || obsOverlayOn
    ? stabilizeManeuver(navQuietLanesState, giroAhora || turn ? null : findQuietLanes(), NAV_TURN_DEBOUNCE_TICKS) : null;
  if (turn) turnLog.push(turn, () => ({ t: Date.now(), truck: [position.x, position.z], text: (navTurnParts(turn) || {}).text }));
  if (guiando) voiceManeuverTick(turn);
  if (pipWin) pipTurnHtml = navPanelHtml(turn);
  if (clientOverlayOn || obsOverlayOn) overlayTurnParts = navTurnParts(turn);
  const navCam = navCameraOn();
  if (navCam && !autoFollow) {
    // El usuario esta tocando el mapa (arrastrar, pellizcar, rotar): la
    // camara no se toca hasta que scheduleMapFollow vuelva a engancharla.
    // Sin esto, cada tick disparaba un easeTo que cancelaba el gesto y el
    // pellizco para hacer zoom no llegaba a agarrar.
    if (navMode) updateNavPanel(turn);
  } else if (navCam) {
    if (navMode) updateNavPanel(turn);
    // Si el usuario zoomeo a mano, no se lo pisamos cada tick - solo
    // seguimos actualizando centro/bearing hasta que recentre.
    const zoomOverride = navAutoZoomPaused ? {} : { zoom: navTargetZoom(turn) };
    // pitch y padding van en cada llamada: un easeTo nuevo cancela el
    // anterior, asi que la inclinacion 3D / el desplazamiento del camion al
    // tercio inferior tienen que viajar con la camara de cada tick.
    const navView = { pitch: nav3d ? 58 : 0, padding: navPadding() };
    if (!justJumped && prevLngLat) {
      followCameraTo({ center: lngLat, bearing: lastHeadingDeg, ...zoomOverride, ...navView }, moveAnimMs());
    } else {
      stopFrameJob('camera');
      map.jumpTo({ center: lngLat, bearing: lastHeadingDeg, ...zoomOverride, ...navView });
    }
  } else if (autoFollow) {
    if (!justJumped && prevLngLat) {
      followCameraTo({ center: lngLat }, moveAnimMs());
    } else {
      stopFrameJob('camera');
      map.jumpTo({ center: lngLat });
    }
  }

  trimRouteBehindTruck(position.x, position.z);
}

function formatSeconds(totalSeconds) {
  if (totalSeconds == null || !isFinite(totalSeconds)) return '-';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h ${m}m`;
}

// Items opcionales del mini-HUD (Settings) - se arman en el mismo formato
// "Label: valor" que ya usan fuelRangeLine/etc mas abajo, reutilizando la
// misma logica de conversion de unidades.
function updateMiniHudExtra(data) {
  const lines = [];
  if (miniHudSettings.fuelPct && data.fuel != null && data.fuelCapacity) {
    const pct = Math.max(0, Math.min(100, (data.fuel / data.fuelCapacity) * 100));
    lines.push(`${t('fuel')}: ${Math.round(pct)}%`);
  }
  const ffRange = fuelFigures(data).rangeKm;
  if (miniHudSettings.fuelRange && ffRange != null) {
    const rangeDisplay = useImperial ? ffRange * KM_TO_MI : ffRange;
    lines.push(`${t('range')}: ${Math.round(rangeDisplay)} ${useImperial ? 'mi' : 'km'}`);
  }
  if (miniHudSettings.eta && data.routeTimeSeconds != null) {
    lines.push(`${t('etaGame')}: ${formatSeconds(data.routeTimeSeconds)}`);
  }
  if (miniHudSettings.distance && data.routeDistanceKm) {
    const distDisplay = useImperial ? data.routeDistanceKm * KM_TO_MI : data.routeDistanceKm;
    lines.push(`${t('distanceLeft')}: ${formatDec(distDisplay, currentLang)} ${useImperial ? 'mi' : 'km'}`);
  }
  const rest = miniHudSettings.rest ? restInfo(data) : null;
  if (rest) lines.push(`${t('nextRest')}: ${rest.text}`);
  // La indicacion y la proxima ciudad en dos renglones: copiando el texto
  // del panel salian pegadas ("Continue straightNext city: Sidney", Discord,
  // Gargamosch, 11-10).
  if (miniHudSettings.gps && navMode && document.getElementById('navPanel').style.display !== 'none') {
    if (!navPanelParts) lines.push(escapeHtml(noRouteText()));
    else {
      lines.push(escapeHtml(navPanelParts.text));
      if (navPanelParts.next) lines.push(`<span class="miniHudNext">${escapeHtml(navPanelParts.next)}</span>`);
    }
  }
  document.getElementById('miniHudExtra').innerHTML = lines.map(l => `<div>${l}</div>`).join('');
}

// ETA real: el del juego pasado a tiempo real, corregido con el ritmo al que
// se viene manejando. La cuenta vive en pure.js (createPaceEta, con tests):
// el panel de docs/dash/ usa la misma.
const paceEta = createPaceEta();

// Proximo descanso y fatiga, lo mismo para el panel y el mini-HUD. El SDK
// manda MINUTOS de juego (restStopMinutes; restStopSeconds es el nombre
// viejo del cliente <=1.4.1, tambien en minutos). Con la simulacion de
// fatiga apagada no significa nada, y createFatigue devuelve null.
const fatigue = createFatigue();
function restInfo(data) {
  const min = data.restStopMinutes != null ? data.restStopMinutes : data.restStopSeconds;
  const pct = fatigue.push(min);
  if (pct == null) return null;
  return { min, pct, text: `${formatSeconds(min * 60)} (${pct}% ${t('fatigue')})` };
}

// Reloj del juego ("Jue 15:17"): el dia de la semana sale del idioma elegido
// usando una semana de referencia que empieza en lunes (2024-01-01 lo fue).
function updateGameClock(gameTimeMinutes) {
  const row = document.getElementById('gameClockRow');
  const clock = gameClockFromMinutes(gameTimeMinutes);
  row.hidden = !clock;
  if (!clock) return;
  const ref = new Date(Date.UTC(2024, 0, 1 + clock.dayIndex));
  const day = ref.toLocaleDateString(currentLang, { weekday: 'short', timeZone: 'UTC' });
  document.getElementById('gameClock').textContent = `${day} ${formatClockHM(clock.hours, clock.minutes, hour12())}`;
}

// Escala de tiempo del juego (minutos de juego por minuto real). Se mide en
// vivo con gameTimeMinutes (time_abs del SDK) contra el reloj real; hasta
// tener medicion se asume la escala del mapa (ATS 20x, ETS2 19x, que es lo
// que usa el juego cuando el camion se mueve).
// La medicion vive en pure.js (createTimeScale, con tests): el panel de
// docs/dash/ necesita exactamente lo mismo, y dos copias de esto se separan
// solas.
const gameTimeScale = createTimeScale();
function measuredTimeScale(data) {
  gameTimeScale.push(data.gameTimeMinutes, data.ts);
  const medido = gameTimeScale.value();
  return medido != null ? medido : distanceScale();
}

// ETA real = ETA del juego pasado a tiempo real (base) corregido por el ritmo
// medido a medida que hay datos (createPaceEta en pure.js). El ritmo tambien
// lo usan el ETA "(with waypoint)" y el resumen con waypoints propios.
function computeRealEtaSeconds(data) {
  if (!data.routeDistanceKm || data.ts == null) return null;
  const scale = measuredTimeScale(data);
  const prior = data.routeTimeSeconds != null && data.routeTimeSeconds > 0 ? data.routeTimeSeconds / scale : null;
  paceEta.push(data.cityDst, data.ts, data.routeDistanceKm);
  // Se queda el ultimo bueno: despues de borrar la ruta el ritmo vuelve a
  // medirse de cero, y el ETA con waypoint no tiene por que quedar en blanco.
  const ritmo = paceEta.avgSpeedKmh();
  if (ritmo != null) lastKnownAvgSpeedKmh = ritmo;
  return paceEta.estimate(prior, data.ts);
}

// Cluster de instrumentos (SVG): velocimetro con arco de 240 grados, rpm,
// marcha, barra de combustible. Los arcos se "llenan" con stroke-dasharray
// sobre el largo total del path; la aguja rota entre -120 y +120 grados.
const GAUGE_SPEED_MAX_KMH = 140;
const GAUGE_SPEED_MAX_MPH = 90;
const gaugeArcLen = {};
function gaugeArc(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  if (!gaugeArcLen[id]) {
    const len = el.getTotalLength();
    if (!len) return null; // todavia no renderizado (ej. pagina oculta) - se reintenta en el proximo tick
    gaugeArcLen[id] = len;
    el.style.strokeDasharray = `${len} ${len}`;
  }
  return el;
}
function setGaugeArc(id, fraction) {
  const el = gaugeArc(id);
  if (!el) return;
  const f = Math.max(0, Math.min(1, fraction));
  el.style.strokeDashoffset = String(gaugeArcLen[id] * (1 - f));
}
function buildSpeedTicks() {
  const g = document.getElementById('gaugeSpeedTicks');
  if (!g) return;
  const max = useImperial ? GAUGE_SPEED_MAX_MPH : GAUGE_SPEED_MAX_KMH;
  const step = useImperial ? 10 : 20;
  let html = '';
  for (let v = 0; v <= max; v += step) {
    const angle = -120 + (v / max) * 240;
    const rad = (angle - 90) * Math.PI / 180;
    const x1 = Math.cos(rad) * 62, y1 = Math.sin(rad) * 62;
    const x2 = Math.cos(rad) * 56, y2 = Math.sin(rad) * 56;
    const lx = Math.cos(rad) * 47, ly = Math.sin(rad) * 47;
    html += `<line class="tick" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
    html += `<text class="tickLabel" x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" text-anchor="middle">${v}</text>`;
  }
  g.innerHTML = html;
  g.dataset.units = useImperial ? 'mi' : 'km';
}
function renderGauges(data) {
  const ticks = document.getElementById('gaugeSpeedTicks');
  if (!ticks) return;
  if (ticks.dataset.units !== (useImperial ? 'mi' : 'km')) buildSpeedTicks();
  const max = useImperial ? GAUGE_SPEED_MAX_MPH : GAUGE_SPEED_MAX_KMH;
  const speed = data.speedKmh != null ? (useImperial ? data.speedKmh * KM_TO_MI : data.speedKmh) : null;
  const frac = speed != null ? Math.min(1, Math.max(0, speed) / max) : 0;
  setGaugeArc('gaugeSpeedFill', frac);
  document.getElementById('gaugeSpeedNeedle').setAttribute('transform', `rotate(${-120 + frac * 240})`);
  document.getElementById('gaugeSpeedValue').textContent = speed != null ? Math.round(speed) : '--';
  const limitG = document.getElementById('gaugeLimit');
  if (data.speedLimitKmh && data.speedLimitKmh > 0) {
    limitG.style.display = '';
    document.getElementById('gaugeLimitValue').textContent = Math.round(useImperial ? data.speedLimitKmh * KM_TO_MI : data.speedLimitKmh);
  } else {
    limitG.style.display = 'none';
  }

  const rpmMax = data.engineRpmMax || 2500;
  const rpm = data.engineRpm != null ? data.engineRpm : null;
  const rpmFrac = rpm != null ? Math.min(1, Math.max(0, rpm) / rpmMax) : 0;
  setGaugeArc('gaugeRpmFill', rpmFrac);
  document.getElementById('gaugeRpmNeedle').setAttribute('transform', `rotate(${-120 + rpmFrac * 240})`);
  document.getElementById('gaugeRpmValue').textContent = rpm != null ? Math.round(rpm) : '--';
  const gear = data.gear;
  document.getElementById('gaugeGear').textContent = gear == null ? '' : gear === 0 ? 'N' : gear < 0 ? `R${-gear > 1 ? -gear : ''}` : String(gear);

  const bar = document.getElementById('gaugeFuelBar');
  if (data.fuel != null && data.fuelCapacity) {
    const pct = Math.max(0, Math.min(100, (data.fuel / data.fuelCapacity) * 100));
    bar.setAttribute('width', String(280 * pct / 100));
    bar.classList.toggle('low', pct < 30 && pct >= 15);
    bar.classList.toggle('critical', pct < 15);
    document.getElementById('gaugeFuelText').textContent = `${Math.round(pct)}%`;
  } else {
    bar.setAttribute('width', '0');
    document.getElementById('gaugeFuelText').textContent = '--';
  }
  const odo = data.odometerKm;
  document.getElementById('gaugeOdometer').textContent = odo != null ? `${formatInt(useImperial ? odo * KM_TO_MI : odo, currentLang)} ${useImperial ? 'mi' : 'km'}` : '-';
  const gaugeRangeKm = fuelFigures(data).rangeKm;
  document.getElementById('gaugeRange').textContent = gaugeRangeKm != null ? `⛽ ${Math.round(useImperial ? gaugeRangeKm * KM_TO_MI : gaugeRangeKm)} ${useImperial ? 'mi' : 'km'}` : '-';
  const cc = document.getElementById('gaugeCruise');
  cc.style.display = data.cruiseControl ? '' : 'none';
  document.getElementById('gaugeCruiseValue').textContent = Math.round(useImperial ? data.cruiseControlSpeedKmh * KM_TO_MI : data.cruiseControlSpeedKmh);
  renderMiniDials(data);
}
// Relojitos debajo del cluster: aire, frenos, agua y aceite. Que mostrar y
// cuando esta en alerta lo decide miniDialReadings (pure.js); aca se arman
// una vez y se mueve el arco, con el mismo truco de setGaugeArc.
const MINI_DIAL_KEYS = ['air', 'brake', 'water', 'oil'];
function buildMiniDials() {
  const box = document.getElementById('miniDials');
  if (!box || box.childElementCount) return box;
  box.innerHTML = MINI_DIAL_KEYS.map(k => `<div class="miniDial" id="miniDial_${k}" hidden>
    <svg viewBox="0 0 70 58"><path class="dialTrack" d="M 14.2 46 A 24 24 0 1 1 55.8 46" />
    <path class="dialFill" id="miniDialFill_${k}" d="M 14.2 46 A 24 24 0 1 1 55.8 46" />
    <text class="miniDialValue" id="miniDialValue_${k}" x="35" y="38" text-anchor="middle">--</text>
    <text class="miniDialUnit" id="miniDialUnit_${k}" x="35" y="48" text-anchor="middle"></text></svg>
    <div class="miniDialLabel" id="miniDialLabel_${k}"></div></div>`).join('');
  return box;
}
function renderMiniDials(data) {
  if (!buildMiniDials()) return;
  const lecturas = miniDialReadings(data, useImperial);
  MINI_DIAL_KEYS.forEach((k, i) => {
    const r = lecturas[i];
    const dial = document.getElementById(`miniDial_${k}`);
    dial.hidden = !r;
    if (!r) return;
    setGaugeArc(`miniDialFill_${k}`, r.frac);
    dial.classList.toggle('bad', !!r.bad);
    // "132 psi": el numero grande y la unidad abajo, si no toca el arco.
    const [numero, unidad] = r.text.split(' ');
    document.getElementById(`miniDialValue_${k}`).textContent = numero;
    document.getElementById(`miniDialUnit_${k}`).textContent = unidad || '';
    document.getElementById(`miniDialLabel_${k}`).textContent = t(r.labelKey);
  });
}

document.querySelectorAll('.panelTab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.panelTab').forEach(b => b.classList.toggle('active', b === tab));
    document.getElementById('infoPanel').classList.toggle('gaugesView', tab.dataset.view === 'gauges');
    if (lastData) renderGauges(lastData);
  });
});

function updateHud(data) {
  lastData = data;
  updateCommandButtonStates(data);

  // El mini-HUD (top-right del mapa, visible solo con el panel oculto)
  // duplica velocidad/limite/crucero, asi que se actualizan en pares.
  const speedDisplay = useImperial ? data.speedKmh * KM_TO_MI : data.speedKmh;
  const speedText = data.speedKmh != null ? Math.round(speedDisplay) : '--';
  document.getElementById('speedBig').textContent = speedText;
  document.getElementById('miniSpeedBig').textContent = speedText;

  const limit = data.speedLimitKmh;
  for (const id of ['limitSign', 'miniLimitSign']) {
    const limitEl = document.getElementById(id);
    if (limit && limit > 0) {
      const limitDisplay = useImperial ? limit * KM_TO_MI : limit;
      limitEl.textContent = Math.round(limitDisplay);
      const over = data.speedKmh > limit + 3;
      limitEl.classList.toggle('over', over);
    } else {
      limitEl.textContent = '--';
      limitEl.classList.remove('over');
    }
  }

  // Sin trabajo, nada del trabajo de antes (jobPanelFields).
  const viaje = jobPanelFields(data);
  document.getElementById('citySrc').textContent = viaje.citySrc || '?';
  document.getElementById('cityDst').textContent = viaje.cityDst || '?';
  const truckLabel = [data.truckBrand, data.truckName].filter(Boolean).join(' ');
  document.getElementById('truck').textContent = truckLabel || '-';
  // Odometro: es el numero que el juego muestra en el tablero y el unico
  // que dice cuanto lleva encima ese camion.
  const odoRow = document.getElementById('odometerRow');
  odoRow.hidden = data.odometerKm == null;
  if (data.odometerKm != null) {
    const odo = useImperial ? data.odometerKm * KM_TO_MI : data.odometerKm;
    document.getElementById('odometer').textContent =
      Math.round(odo).toLocaleString(currentLang) + (useImperial ? ' mi' : ' km');
  }
  if (viaje.cargo) {
    const cargoWeightText = viaje.cargoMassKg ? ` (${formatCargoMass(viaje.cargoMassKg, currentLang, useImperial)})` : '';
    document.getElementById('cargo').textContent = `${viaje.cargo}${cargoWeightText}`;
  } else {
    document.getElementById('cargo').textContent = t('noCargo');
  }

  const etaText = formatSeconds(data.routeTimeSeconds);
  if (data.routeDistanceKm) {
    const distDisplay = useImperial ? data.routeDistanceKm * KM_TO_MI : data.routeDistanceKm;
    document.getElementById('etaGame').textContent = `${etaText} (${formatDec(distDisplay, currentLang)} ${useImperial ? 'mi' : 'km'})`;
  } else {
    document.getElementById('etaGame').textContent = etaText;
  }

  const jobDeadlineRow = document.getElementById('jobDeadlineRow');
  if (viaje.deadlineSeconds != null) {
    jobDeadlineRow.hidden = false;
    const deadlineEl = document.getElementById('jobDeadline');
    deadlineEl.textContent = formatSeconds(Math.max(0, viaje.deadlineSeconds));
    deadlineEl.classList.toggle('over', viaje.deadlineSeconds <= 0);
  } else {
    jobDeadlineRow.hidden = true;
  }

  updateGameClock(data.gameTimeMinutes);
  const realEtaSeconds = computeRealEtaSeconds(data);
  routeSummaryEtaSeconds = realEtaSeconds;
  // Despues del ETA real: la fila "via waypoint" sale de el (waypointEta).
  updateWaypointRoute(data);
  document.getElementById('etaReal').textContent = realEtaSeconds != null ? formatSeconds(realEtaSeconds) : t('calculating');

  // Proximo descanso obligatorio, con la fatiga (ver restInfo).
  const rest = restInfo(data);
  const restRow = document.getElementById('restStopRow');
  if (rest) {
    restRow.hidden = false;
    const realSec = (rest.min * 60) / measuredTimeScale(data);
    document.getElementById('restStop').innerHTML = `${escapeHtml(rest.text)}<span class="subValue">≈ ${escapeHtml(formatSeconds(realSec))} ${escapeHtml(t('realShort'))}</span>`;
    pipRest = formatSeconds(rest.min * 60);
  } else {
    restRow.hidden = true;
    pipRest = null;
  }

  document.getElementById('jobIncome').innerHTML = viaje.income ? moneyHtml(viaje.income, data.game) : '-';

  // Combustible: fuel/fuelCapacity vienen en unidades del juego (litros o
  // galones segun el pais del camion), pero el porcentaje da igual la unidad.
  // Se muestran arriba, al lado de la velocidad, apiladas en 3 lineas.
  if (data.fuel != null && data.fuelCapacity) {
    const pct = Math.max(0, Math.min(100, (data.fuel / data.fuelCapacity) * 100));
    document.getElementById('fuelPctLine').innerHTML = `${t('fuel')} ${statSpan(pct, 15, 30)}`;
  } else {
    document.getElementById('fuelPctLine').textContent = `${t('fuel')} -`;
  }
  const ff = fuelFigures(data);
  if (ff.rangeKm != null) {
    const rangeDisplay = useImperial ? ff.rangeKm * KM_TO_MI : ff.rangeKm;
    document.getElementById('fuelRangeLine').textContent = `${t('range')} ${Math.round(rangeDisplay)} ${useImperial ? 'mi' : 'km'}`;
  } else {
    document.getElementById('fuelRangeLine').textContent = `${t('range')} -`;
  }
  // Consumo: el medido por nosotros (litros gastados / km del odometro,
  // ultimos 150 km) apenas hay 15 km de datos; antes, el promedio del SDK,
  // que el juego calcula con un valor nominal y sale alto. En imperial se
  // convierte a mpg (formula estandar). El SDK lo manda en L/100km siempre.
  if (ff.avg) {
    const consumptionText = useImperial
      ? `${formatDec(235.215 / ff.avg, currentLang)} mpg`
      : `${formatDec(ff.avg, currentLang)} L/100km`;
    document.getElementById('fuelAvgLine').textContent = consumptionText;
    document.getElementById('fuelAvgLine').title = ff.measured
      ? t('fuelMeasuredHint').replace('{km}', Math.round(useImperial ? ff.spanKm * KM_TO_MI : ff.spanKm)).replace('{unit}', useImperial ? 'mi' : 'km')
      : t('fuelSdkHint');
  } else {
    document.getElementById('fuelAvgLine').textContent = '-';
    document.getElementById('fuelAvgLine').title = '';
  }

  const wear = data.wear || {};
  const wearParts = ['engine', 'transmission', 'cabin', 'chassis', 'wheels'].map(part => {
    const value = wear[part];
    const pctText = value == null ? '-' : statSpan(value * 100, null, null, true);
    return `${t(part)} ${pctText}`;
  });
  document.getElementById('wearLine').innerHTML = wearParts.join(' &nbsp;·&nbsp; ');

  const ccSpeed = useImperial ? data.cruiseControlSpeedKmh * KM_TO_MI : data.cruiseControlSpeedKmh;
  const ccText = Math.round(ccSpeed);
  document.getElementById('cruiseSpeed').textContent = ccText;
  document.getElementById('cruiseDisplay').style.display = data.cruiseControl ? '' : 'none';
  document.getElementById('miniCruiseSpeed').textContent = ccText;
  // El mini-HUD del cruise control es opcional (Settings) - el del panel de
  // info completo siempre se muestra cuando esta activo.
  document.getElementById('miniCruiseDisplay').style.display = (data.cruiseControl && miniHudSettings.cruise) ? '' : 'none';

  updateMiniHudExtra(data);
  renderGauges(data);

  const warnings = data.mechanicalWarnings || {};
  const activeAlerts = [];
  if (warnings.airPressure) activeAlerts.push('⚠ ' + t('lowAirPressure'));
  if (warnings.waterTemperature) activeAlerts.push('⚠ ' + t('highWaterTemp'));
  if (warnings.batteryVoltage) activeAlerts.push('⚠ ' + t('lowBattery'));
  if (data.oilTemperature != null && data.oilTemperature > 115) activeAlerts.push('⚠ ' + t('highOilTemp'));
  const alertsRow = document.getElementById('mechanicalAlertsRow');
  if (activeAlerts.length) {
    alertsRow.style.display = '';
    document.getElementById('mechanicalAlerts').textContent = activeAlerts.join(' · ');
  } else {
    alertsRow.style.display = 'none';
  }

  updateSessionEvents(data.event || {}, data.game, data.onJob);
}

// Peajes/multas/tren-ferry llegan como pulsos (bool + monto en el mismo tick
// en que ocurre el evento). Se acumulan por sesion detectando el flanco de
// subida (false -> true) para no sumar el mismo evento en cada tick que el
// flag siga en true.
const sessionTotals = { tolls: 0, fines: 0, ferryTrainCount: 0, game: null };
const previousEventState = { tollgate: false, fined: false, ferry: false, train: false, jobDelivered: false, jobCancelled: false };

// Los contadores viven en memoria mientras la pagina este abierta: un
// usuario cerro ETS2, abrio ATS con el celular todavia en la web y seguia
// viendo la multa de ETS2 (reporte de Discord). Se reinician solos al
// cambiar de juego y a mano con el boton "Reset" de la tarjeta.
function resetSessionTotals(game) {
  sessionTotals.tolls = 0; sessionTotals.fines = 0; sessionTotals.ferryTrainCount = 0;
  sessionTotals.game = game || null;
  for (const k of Object.keys(previousEventState)) previousEventState[k] = false;
  renderSessionTotals();
}
function renderSessionTotals() {
  const game = sessionTotals.game || lastData?.game;
  document.getElementById('tollsTotal').textContent = moneyLine(sessionTotals.tolls, game);
  document.getElementById('finesTotal').textContent = moneyLine(sessionTotals.fines, game);
  document.getElementById('ferryTrainCount').textContent = sessionTotals.ferryTrainCount;
}
document.getElementById('sessionResetBtn').addEventListener('click', () => resetSessionTotals(lastData?.game));

function showToast(text, kind = 'success', durationMs = 5000) {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, durationMs);
}

// Multas y peajes del trabajo en curso, para el resumen de la entrega. Se
// arranca de cero al tomar un trabajo (onJob pasa a true) y al terminarlo:
// lo pagado entre un trabajo y otro no es de ninguno.
const jobCosts = { fines: 0, tolls: 0 };
let lastOnJob = null;
function resetJobCosts() { jobCosts.fines = 0; jobCosts.tolls = 0; }

// Tarjeta "Trabajo entregado": queda hasta cerrarla (o DELIVERY_CARD_MS),
// no 5 s como el toast de antes, que se perdia mientras uno estacionaba.
const DELIVERY_CARD_MS = 90000;
let deliveryCardTimer = null;
function closeDeliveryCard() {
  clearTimeout(deliveryCardTimer);
  document.getElementById('deliveryCard')?.remove();
}
function showDeliveryCard(event, costs, game) {
  const summary = deliverySummary(event, costs);
  if (!summary) return;
  closeDeliveryCard();
  const value = ([, kind, v]) => {
    if (kind === 'money') return escapeHtml(moneyLine(v, game));
    if (kind === 'xp') return `+${formatInt(v, currentLang)} XP`;
    if (kind === 'km') return `${formatInt(useImperial ? v * 0.621371 : v, currentLang)} ${useImperial ? 'mi' : 'km'}`;
    if (kind === 'minutes') return escapeHtml(formatGameMinutes(v, t('hourShort'), t('minShort')));
    if (kind === 'percent') return `${v < 10 && v > 0 ? formatDec(v, currentLang) : Math.round(v)}\u00a0%`;
    return escapeHtml(String(v));
  };
  const el = document.createElement('div');
  el.id = 'deliveryCard';
  el.className = 'deliveryCard';
  el.setAttribute('role', 'status');
  el.innerHTML = `<div class="deliveryCardHead"><span>✅ ${escapeHtml(t('deliveredTitle'))}</span>`
    + `<button type="button" class="deliveryCardClose" aria-label="${escapeHtml(t('close'))}" title="${escapeHtml(t('close'))}">×</button></div>`
    + (summary.route ? `<div class="deliveryCardRoute">${escapeHtml(summary.route)}</div>` : '')
    + (summary.cargo ? `<div class="deliveryCardCargo">${escapeHtml(summary.cargo)}</div>` : '')
    + summary.rows.map((r, k) => `<div class="row${k === 0 ? ' deliveryCardPay' : ''}"><span class="label">${escapeHtml(t(r[0]))}</span><span>${value(r)}</span></div>`).join('');
  el.querySelector('.deliveryCardClose').addEventListener('click', closeDeliveryCard);
  document.body.appendChild(el);
  deliveryCardTimer = setTimeout(closeDeliveryCard, DELIVERY_CARD_MS);
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDeliveryCard(); });

function updateSessionEvents(event, game, onJob) {
  if (onJob && lastOnJob === false) resetJobCosts();
  if (onJob != null) lastOnJob = !!onJob;
  if (game && sessionTotals.game && game !== sessionTotals.game) {
    resetSessionTotals(game);
    showToast(t('sessionResetToast'), 'success', 3000);
  } else if (game && !sessionTotals.game) {
    sessionTotals.game = game;
  }
  if (event.tollgate && !previousEventState.tollgate) {
    sessionTotals.tolls += event.tollgatePayAmount || 0;
    jobCosts.tolls += event.tollgatePayAmount || 0;
  }
  if (event.fined && !previousEventState.fined) {
    sessionTotals.fines += event.fineAmount || 0;
    jobCosts.fines += event.fineAmount || 0;
  }
  if (event.ferry && !previousEventState.ferry) { sessionTotals.tolls += 0; sessionTotals.ferryTrainCount++; }
  if (event.train && !previousEventState.train) sessionTotals.ferryTrainCount++;
  if (event.jobDelivered && !previousEventState.jobDelivered) {
    showDeliveryCard(event, jobCosts, game || lastData?.game);
    if (isLeaderTab) recordTrip(event); // una sola pestana por navegador la graba
    resetJobCosts();
  }
  if (event.jobCancelled && !previousEventState.jobCancelled) {
    showToast(t('jobCancelledToast'), 'danger');
    resetJobCosts();
  }
  previousEventState.tollgate = !!event.tollgate;
  previousEventState.fined = !!event.fined;
  previousEventState.ferry = !!event.ferry;
  previousEventState.train = !!event.train;
  previousEventState.jobDelivered = !!event.jobDelivered;
  previousEventState.jobCancelled = !!event.jobCancelled;

  renderSessionTotals();
}

// Historial de viajes SOLO local (localStorage): el SDK no expone ninguna
// identidad de jugador/perfil, asi que no hay forma de atarlo a una persona
// - queda por dispositivo/navegador. Ultimas 50 entregas.
const TRIPS_KEY = 'truckdash_trips';
const TRIPS_MAX = 50;
function loadTrips() {
  try { return JSON.parse(localStorage.getItem(TRIPS_KEY) || '[]'); } catch (e) { return []; }
}
// Dos pestanas del mismo navegador (el cliente abre una en cada arranque y la
// de ayer sigue conectada) grababan la misma entrega dos veces en la misma
// clave (auditoria del 10-10): si la ultima es igual y de hace un rato, ya
// esta.
const TRIP_DEDUPE_MS = 3 * 60 * 1000;
function recordTrip(event) {
  const trips = loadTrips();
  const prev = trips[0];
  if (prev && Date.now() - prev.t < TRIP_DEDUPE_MS && prev.src === (event.jobSrc || null)
      && prev.dst === (event.jobDst || null) && prev.revenue === Math.round(event.jobDeliveredRevenue || 0)) return;
  trips.unshift({
    t: Date.now(),
    game: lastData?.game || null,
    src: event.jobSrc || null,
    dst: event.jobDst || null,
    cargo: event.jobCargo || null,
    truck: [event.jobTruckBrand, event.jobTruckName].filter(Boolean).join(' ') || null,
    revenue: Math.round(event.jobDeliveredRevenue || 0),
    distanceKm: Math.round(event.jobDeliveredDistanceKm || 0),
  });
  try { localStorage.setItem(TRIPS_KEY, JSON.stringify(trips.slice(0, TRIPS_MAX))); } catch (e) {}
}
// Issue de GitHub prefilled con lo que hace falta para reproducir (version
// del cliente/web, navegador, estado de conexion, juego, mapa). Nada privado:
// el usuario ve el texto antes de publicar.
// La version de la web: el ?v= con que se cargo app.js (el token de cache,
// el mismo en todos los archivos). Antes era una constante a mano que habia
// quedado en 20260918.
function webVersion() {
  const s = document.querySelector('script[src*="app.js"]');
  try { return (s && new URL(s.src, location.href).searchParams.get('v')) || 'unknown'; } catch (e) { return 'unknown'; }
}
function buildIssueUrl() {
  const lines = [
    '**What happened?**', '', '(describe the problem here)', '', '**Steps to reproduce**', '', '1. ', '',
    '---', '<details><summary>Diagnostics (auto-filled)</summary>', '',
    `- Web build: ${webVersion()}`,
    `- Client version: ${conn.clientStatus?.clientVersion || lastData?.clientVersion || 'unknown'}`,
    `- Mode: ${conn.demo ? 'demo' : conn.local ? 'LAN' : 'cloud'}`,
    `- Connection: socket=${conn.socket}, clientConnected=${conn.clientConnected}, status=${conn.clientStatus?.status || '-'}, telemetry=${conn.hasTelemetry}`,
    `- Game / map: ${lastData?.game || '-'} / ${currentGame || '-'}`,
    `- Language / units: ${currentLang} / ${useImperial ? 'imperial' : 'metric'}`,
    `- Browser: ${navigator.userAgent}`,
    `- Screen: ${window.innerWidth}x${window.innerHeight}, ${window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape'}`,
    '', '</details>',
  ];
  const params = new URLSearchParams({ title: '[web] ', body: lines.join('\n'), labels: 'bug' });
  return `https://github.com/Nethercap/truck-companion/issues/new?${params}`;
}
document.getElementById('reportProblemBtn').addEventListener('click', () => {
  window.open(buildIssueUrl(), '_blank', 'noopener');
});

// Texto al portapapeles. Sin permiso (http en la LAN) por un textarea
// elegido; si tampoco, a la vista para copiarlo a mano (prompt lo deja en
// una linea, pero se puede copiar).
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* abajo */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  return ok;
}

// Donde estaba cada aviso de giro, para pegar en Discord cuando uno estuvo
// mal (turnReportText en pure.js). Con las coordenadas y la variante se
// reproduce el cruce en el simulador.
document.getElementById('turnReportBtn').addEventListener('click', async () => {
  const pos = lastData && lastData.position;
  const text = turnReportText({
    game: lastData && lastData.game, map: currentGame, web: webVersion(),
    client: conn.clientStatus?.clientVersion || lastData?.clientVersion || null,
    truck: pos && pos.x != null ? [pos.x, pos.z] : null, heading: lastData && lastData.heading,
    now: Date.now(), items: turnLog.list(),
    routeKm: { app: currentRouteWorldPoints ? gameKmOf(currentRouteWorldPoints) : null, game: lastData ? lastData.routeDistanceKm : null },
    formatTime: (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  });
  if (await copyText(text)) showToast(t('turnReportCopied'), 'success', 3000);
  else prompt(t('turnReportCopy'), text);
});

function renderTripHistory() {
  const list = document.getElementById('tripHistoryList');
  if (!list) return;
  const trips = loadTrips();
  if (!trips.length) { list.innerHTML = `<div class="tripEmpty">${t('tripHistoryEmpty')}</div>`; return; }
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  list.innerHTML = trips.map(tr => {
    const dist = useImperial ? `${Math.round(tr.distanceKm * KM_TO_MI)} mi` : `${tr.distanceKm} km`;
    const date = new Date(tr.t).toLocaleDateString(currentLang, { month: 'short', day: 'numeric' });
    return `<div class="trip"><div><div class="tripRoute">${esc(tr.src || '?')} → ${esc(tr.dst || '?')}</div><div class="tripMeta">${esc(tr.cargo || '-')} · ${dist} · ${esc(tr.truck || '')}</div></div><div style="text-align:right"><div>${moneyLine(tr.revenue, tr.game)}</div><div class="tripMeta">${date}${tr.game ? ' · ' + tr.game.toUpperCase() : ''}</div></div></div>`;
  }).join('');
}
document.getElementById('tripHistoryClearBtn').addEventListener('click', () => {
  try { localStorage.removeItem(TRIPS_KEY); } catch (e) {}
  renderTripHistory();
});

// Devuelve el porcentaje como <span> coloreado segun si es "malo" alto (desgaste)
// o "malo" bajo (combustible). isWear=true => alerta cuando el valor es ALTO.
function statSpan(pct, dangerBelow, warnBelow, isWear) {
  let cls = '';
  if (isWear) {
    cls = pct > 60 ? 'statDanger' : pct > 30 ? 'statWarn' : '';
  } else {
    cls = pct < dangerBelow ? 'statDanger' : pct < warnBelow ? 'statWarn' : '';
  }
  const classAttr = cls ? ` class="${cls}"` : '';
  return `<span${classAttr}>${Math.round(pct)}%</span>`;
}

document.getElementById('panelToggleBtn').addEventListener('click', () => {
  document.getElementById('layout').classList.toggle('panelHidden');
  // El mapa cambia de tamano real (el panel ahora desplaza, no tapa), asi
  // que MapLibre necesita resize() para recalcular su viewport, y
  // recentramos en el camion para que no quede corrido hacia el costado
  // que el panel dejo de ocupar. Se espera a que termine la transicion CSS
  // (0.25s) para que resize lea el tamano final, no el intermedio.
  setTimeout(() => {
    if (!map) return;
    map.resize();
    if (truckMarker) {
      map.jumpTo({ center: truckMarker.getLngLat() });
    }
  }, 260);
});

const SHORT_LANDSCAPE = window.matchMedia('(max-height: 500px) and (orientation: landscape)');
const CMDS_LANDSCAPE_KEY = 'truckdash_cmds_landscape';

function toggleCommandsDrawer() {
  const hidden = document.getElementById('layout').classList.toggle('commandsHidden');
  if (SHORT_LANDSCAPE.matches) lsSet(CMDS_LANDSCAPE_KEY, hidden ? 'closed' : 'open');
  setTimeout(() => {
    if (!map) return;
    map.resize();
    if (truckMarker) {
      map.jumpTo({ center: truckMarker.getLngLat() });
    }
  }, 260);
}
document.getElementById('commandsToggleBtn').addEventListener('click', toggleCommandsDrawer);
// El "pico" traslucido que asoma cuando el drawer esta colapsado tambien
// funciona como boton - es mas facil de tocar que buscar el boton redondo.
document.getElementById('commandsPeek').addEventListener('click', toggleCommandsDrawer);

// Celular acostado (alto <= 500 px): la botonera arranca plegada. Abierta se
// comia la mitad de la pantalla y manejando lo que se mira es el mapa
// (auditoria del 12-10). Se abre con la pestanita de abajo, como siempre, y
// si alguien la deja abierta acostado (la usa de botonera) se recuerda.
function foldCommandsForShortLandscape() {
  if (!SHORT_LANDSCAPE.matches || lsGet(CMDS_LANDSCAPE_KEY) === 'open') return;
  if (!document.getElementById('layout').classList.contains('commandsHidden')) toggleCommandsDrawer();
}
foldCommandsForShortLandscape();
SHORT_LANDSCAPE.addEventListener('change', foldCommandsForShortLandscape);

// La flechita de "hay mas swipeando" en el panel de info (vertical) se
// esconde apenas el usuario ya descubrio que puede swipear, para no
// insistir con la animacion todo el rato.
document.getElementById('panelSwipe').addEventListener('scroll', () => {
  document.getElementById('swipeHint').style.display = 'none';
}, { once: true });

function toggleFsMode() {
  document.body.classList.toggle('fsMode');
  // La Fullscreen API real (esconde tambien la barra de URL en el celular)
  // es un extra sobre ocultar el header - si el navegador no la deja usar
  // (algunos webviews la bloquean) el modo fsMode sigue funcionando igual.
  if (document.body.classList.contains('fsMode')) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else if (document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
  }
  renderLayoutFsBtn();
  setTimeout(() => { if (map) map.resize(); }, 300);
}
// Tambien desde la barra de acomodar: ahi los botones del mapa no responden
// (un toque los mueve), y en el telefono se acomoda mejor en pantalla
// completa, que es como se maneja.
function renderLayoutFsBtn() {
  const btn = document.getElementById('layoutFsBtn');
  if (btn) btn.classList.toggle('active', document.body.classList.contains('fsMode'));
}
document.getElementById('fullscreenBtn').addEventListener('click', toggleFsMode);
document.getElementById('layoutFsBtn').addEventListener('click', toggleFsMode);

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) document.body.classList.remove('fsMode');
  renderLayoutFsBtn();
});

document.getElementById('navToggleBtn').addEventListener('click', () => {
  setNavMode(!navMode);
});

// Un click activa el modo "agregar" (el proximo click en el mapa pone un
// waypoint); con waypoints puestos, el boton sigue agregando - se quitan de a
// uno desde la lista del panel de info, o todos con el boton de la lista.
document.getElementById('waypointBtn').addEventListener('click', () => {
  setWaypointMode(!waypointMode);
});

document.getElementById('waypointConfirmInGameBtn').addEventListener('click', () => {
  document.getElementById('waypointModal').style.display = 'none';
  finalizeWaypoint(true);
});

document.getElementById('waypointConfirmNotInGameBtn').addEventListener('click', () => {
  document.getElementById('waypointModal').style.display = 'none';
  finalizeWaypoint(false);
});

document.getElementById('waypointClearAllBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  clearWaypoint();
});

document.getElementById('updateBannerClose').addEventListener('click', () => {
  document.getElementById('updateBanner').style.display = 'none';
});

// Con paradas puestas y un trabajo, el primer toque saca solo las paradas y
// la ruta vuelve al destino del trabajo; el segundo la oculta. Antes el
// unico toque ocultaba tambien la del trabajo hasta que cambiara el trabajo,
// y quien lo usaba para sacarse una parada vieja se quedaba sin ruta.
document.getElementById('routeResetBtn').addEventListener('click', () => {
  const trabajo = lastData ? resolveRawRouteTarget(lastData) : null;
  if (waypoints.length && trabajo && trabajo.kind !== 'waypoint') {
    clearWaypoint();
    showToast(t('waypointsClearedToast'), 'info', 4000);
    return;
  }
  resetDisplayedRoute();
});
document.getElementById('routeShowBtn').addEventListener('click', restoreDismissedRoute);
document.getElementById('routeOffMapAdd').addEventListener('click', () => setWaypointMode(true));
document.getElementById('routeStopSkip').addEventListener('click', (e) => {
  e.stopPropagation();
  if (waypoints.length) removeWaypoint(0);
});
function applyRouteSummaryMin() {
  document.getElementById('routeSummary').classList.toggle('min', routeSummaryMin);
  keepPanelsClearOfRouteSummary();
}
function setRouteSummaryMin(min) {
  routeSummaryMin = min;
  saveSettings();
  applyRouteSummaryMin();
}
document.getElementById('routeMinBtn').addEventListener('click', () => setRouteSummaryMin(true));
document.getElementById('routeExpandBtn').addEventListener('click', () => setRouteSummaryMin(false));
applyRouteSummaryMin();
document.getElementById('recenterBtn').addEventListener('click', () => {
  navAutoZoomPaused = false;
  resumeMapFollow();
});

let reconnectTimer = null;
const RECONNECT_DELAY_MS = 3000;
// El codigo llego en la URL (el cliente abre el navegador asi, y en el celular
// ese link se guarda como marcador) y no lo tipeo alguien a mano.
let codeFromLink = false;
// Reintentos de un codigo guardado que el backend nunca conocio: despues de un
// minuto se asume que el codigo ya no existe (lo rotaron) en vez de esperar
// para siempre a un cliente que no va a venir.
const REMEMBERED_MAX_TRIES = 20;
let rememberedTries = 0;

// Estado de la conexion mostrado en el chip de la barra, la linea de detalle
// (#status) y el empty state sobre el mapa. Combina lo que sabe el viewer
// (socket abierto o no), lo que dice el backend (hay un cliente local
// conectado con este codigo?) y el diagnostico que manda el cliente
// (client_status: waiting_game / plugin_missing / waiting_truck / live).
const conn = { socket: 'idle', clientConnected: null, clientStatus: null, paused: false, invalidCode: false, hasTelemetry: false, local: false, lanRelay: false, demo: false, everOpen: false, everValid: false, spectator: false, waitingClient: false };

function connectionView() {
  return connectionViewFor(conn);
}

// Pantalla encendida mientras la app esta en uso como GPS: sin esto el
// celular se apaga a los 30 s y hay que estar tocandolo. Se pide cuando hay
// sesion (renderConnectionUi) y se vuelve a pedir al volver a primer plano;
// en modo LAN (http, sin Wake Lock API) va el video de respaldo, que un
// toque reintenta si no arranco solo (createScreenKeeper, pure.js).
const screenKeeper = createScreenKeeper({ wakeLock: navigator.wakeLock, doc: document });
document.addEventListener('pointerup', screenKeeper.sync, true);
document.addEventListener('keydown', screenKeeper.sync, true);
document.addEventListener('visibilitychange', () => {
  screenKeeper.sync();
  if (document.visibilityState === 'visible') reopenIfStale();
});

// Socket medio abierto: con el celular bloqueado o al cambiar de WiFi la
// conexion muere sin que llegue onclose, y el tablero quedaba congelado
// diciendo "en vivo" y con los botones mudos (auditoria del 10-10). Al volver
// a la pestana o a la red, si hace rato que no llega nada, se reconecta.
// Tambien con la pantalla prendida: una WiFi que sigue asociada pero pierde
// paquetes no dispara 'online' ni cambia la visibilidad, y la flecha y la
// ruta quedaban quietas minutos ("the GPS stopped routing me", Discord
// 10-10, WiFi mala con codigo de pairing). Con el juego en vivo el cliente
// manda varias veces por segundo: 10 s sin nada es un socket muerto. Una
// vez por racha de telemetria (staleWatchArmed), para no reconectar en
// bucle si la red se cayo del todo: ahi sigue la reconexion de siempre.
const WS_STALE_MS = 10000;
let lastWsMessageAt = 0;
let staleWatchArmed = false;
function reopenIfStale() {
  if (!ws || ws.readyState !== WebSocket.OPEN || !conn.hasTelemetry || !conn.reopen) return;
  if (Date.now() - lastWsMessageAt < WS_STALE_MS) return;
  staleWatchArmed = false;
  const old = ws;
  old.onclose = null;
  try { old.close(); } catch (e) {}
  clearTimeout(reconnectTimer);
  conn.reopen();
}
window.addEventListener('online', reopenIfStale);
setInterval(() => { if (staleWatchArmed && document.visibilityState === 'visible') reopenIfStale(); }, 3000);

function renderConnectionUi() {
  const view = connectionView();
  screenKeeper.want(!!view);
  const chip = document.getElementById('statusChip');
  const group = document.getElementById('connectGroup');
  const empty = document.getElementById('emptyState');
  document.body.classList.toggle('connected', !!view);
  document.body.classList.toggle('live', !!(view && view.live));
  document.body.classList.toggle('spectator', !!conn.spectator);
  if (!view) {
    chip.hidden = true;
    group.style.display = '';
    empty.style.display = 'none';
    statusEl.textContent = t('notConnected');
    statusEl.className = '';
    return;
  }
  group.style.display = 'none';
  chip.hidden = false;
  chip.className = `statusChip ${view.cls}`;
  let chipText = t(view.chip);
  if (view.live && lastData?.game && !conn.demo) chipText += ` · ${lastData.game.toUpperCase()}`;
  if (conn.local) chipText += ' · LAN';
  if (conn.spectator) chipText += ` · ${document.getElementById('spectatorCode').textContent}`;
  document.getElementById('statusChipText').textContent = chipText;
  // En modo LAN o demo no hay "otro codigo" que poner: el lapiz sale de la sesion.
  document.getElementById('changeCodeBtn').title = conn.demo ? t('exitDemo') : t('changeCode');
  document.getElementById('changeCodeBtn').style.display = conn.local ? 'none' : '';
  // El cliente (>= 1.4.4) puede mandar un diagnostico fino en ingles
  // (plugin ausente en la copia del juego que corre, juego como
  // administrador, plugin sin cargar): se muestra despues del texto traducido.
  const clientDetail = conn.clientStatus?.detail;
  statusEl.textContent = (view.detail ? t(view.detail) : '') + (clientDetail ? ` — ${clientDetail}` : '');
  statusEl.className = view.cls;
  if (view.empty) {
    const [titleKey, bodyKey, icon, showDownload] = view.empty;
    document.getElementById('emptyStateIcon').textContent = icon;
    document.getElementById('emptyStateTitle').textContent = t(titleKey);
    document.getElementById('emptyStateBody').textContent = clientDetail ? clientDetail : t(bodyKey);
    const link = document.getElementById('emptyStateLink');
    link.style.display = showDownload ? '' : 'none';
    link.textContent = t('emptyDownload');
    document.getElementById('emptyStateDemo').style.display = showDownload ? '' : 'none';
    empty.style.display = 'flex';
  } else {
    empty.style.display = 'none';
  }
}

document.getElementById('changeCodeBtn').addEventListener('click', () => {
  if (conn.demo) { location.href = location.pathname; return; }
  clearTimeout(reconnectTimer);
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
  conn.socket = 'idle'; conn.clientConnected = null; conn.clientStatus = null; conn.hasTelemetry = false; conn.invalidCode = false; conn.everOpen = false; conn.everValid = false; conn.waitingClient = false;
  renderConnectionUi();
  document.getElementById('code').focus();
});

// El proxy de Railway corta conexiones largas cada ~1 min sin avisos - el
// cliente reconecta solo en un par de segundos, asi que mostrar el banner
// rojo parpadeante en CADA corte es una falsa alarma constante. Se demora
// RECONNECT_BANNER_DELAY_MS: si ya reconecto antes de eso, nunca se llega a
// mostrar - solo aparece si el corte fue mas largo de lo normal.
const RECONNECT_BANNER_DELAY_MS = 10000;
let reconnectBannerDelayTimer = null;

function showReconnectBanner(text) {
  clearTimeout(reconnectBannerDelayTimer);
  reconnectBannerDelayTimer = setTimeout(() => {
    const banner = document.getElementById('reconnectBanner');
    banner.textContent = text;
    banner.style.display = 'block';
  }, RECONNECT_BANNER_DELAY_MS);
}

function hideReconnectBanner() {
  clearTimeout(reconnectBannerDelayTimer);
  document.getElementById('reconnectBanner').style.display = 'none';
}

// Aviso (no bloqueante) de que hay una version del cliente .exe mas nueva
// que la que esta corriendo la persona conectada - se compara la version
// reportada en cada payload (data.clientVersion) contra /version del backend.
let latestClientVersion = null;
let latestDownloadUrl = null;

function isNewerVersion(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

// Se pide una sola vez al entrar (no depende de estar conectado - usa el
// backend default aunque el usuario todavia no puso su codigo). Si falla,
// no se muestra nada, no es critico.
function fetchActivePlayers() {
  const backend = document.getElementById('backendUrl').value;
  const httpBase = backend.replace('wss://', 'https://').replace('ws://', 'http://');
  fetch(`${httpBase}/health`).then(r => r.ok ? r.json() : null).then(data => {
    if (data && typeof data.connected_clients === 'number') {
      const hint = document.getElementById('activePlayersHint');
      hint.textContent = t('activePlayersHint').replace('{count}', data.connected_clients);
      hint.style.display = 'block';
    }
  }).catch(() => {});
}
fetchActivePlayers();
fetchExchangeRates();

function fetchLatestClientVersion(backend) {
  const httpBase = backend.replace('wss://', 'https://').replace('ws://', 'http://');
  fetch(`${httpBase}/version`).then(r => r.ok ? r.json() : null).then(data => {
    if (data && data.latest_client_version) {
      latestClientVersion = data.latest_client_version;
      latestDownloadUrl = data.download_url;
    }
  }).catch(() => {}); // no critico - si falla, simplemente no se muestra el aviso
}

function checkUpdateBanner(connectedVersion) {
  const banner = document.getElementById('updateBanner');
  if (!latestClientVersion || !connectedVersion || !isNewerVersion(latestClientVersion, connectedVersion)) {
    banner.style.display = 'none';
    return;
  }
  document.getElementById('updateBannerText').textContent = t('updateAvailableText').replace('{v}', latestClientVersion);
  document.getElementById('updateBannerLink').href = latestDownloadUrl || 'https://trucksim-dash.com/#get-started';
  banner.style.display = 'flex';
}

// Botonera de comandos: un solo bloque de markup (#commandsPanel) que se
// reubica segun el layout - en horizontal vive en el drawer fijo debajo del
// mapa, en vertical se muda dentro del swipe del panel de info como 2da
// pagina (ver .panelSwipe/.panelPage en el CSS). Mover el nodo con
// appendChild conserva los listeners ya puestos, no hace falta re-bindear.
const commandsPortraitQuery = window.matchMedia('(max-width: 900px) and (orientation: portrait)');
function placeCommandsPanel() {
  const commandsPanel = document.getElementById('commandsPanel');
  const target = commandsPortraitQuery.matches
    ? document.getElementById('commandsSlotPortrait')
    : document.getElementById('commandsDrawer');
  if (commandsPanel.parentElement !== target) target.appendChild(commandsPanel);
  commandsPanel.style.display = 'block';
}
placeCommandsPanel();
commandsPortraitQuery.addEventListener('change', placeCommandsPanel);
window.addEventListener('resize', placeCommandsPanel);

// En vertical, mientras estas en la 2da pagina del swipe (la botonera) los
// datos del panel (velocidad, etc.) no se ven - se trata como si el panel
// estuviera oculto para que aparezca el mini-HUD flotante arriba del mapa,
// igual que cuando lo cerras del todo con el boton ☰.
const panelSwipeEl = document.getElementById('panelSwipe');
function updateCommandsPageActive() {
  if (!commandsPortraitQuery.matches) {
    document.getElementById('layout').classList.remove('commandsPageActive');
    return;
  }
  // Paginas en vertical: 0 datos, 1 relojes, 2 botonera - solo la ultima
  // cuenta como "panel oculto" para el mini-HUD (en la de relojes ya se ve
  // la velocidad grande).
  const onCommandsPage = panelSwipeEl.scrollLeft > panelSwipeEl.clientWidth * 1.5;
  document.getElementById('layout').classList.toggle('commandsPageActive', onCommandsPage);
}
panelSwipeEl.addEventListener('scroll', updateCommandsPageActive);
commandsPortraitQuery.addEventListener('change', updateCommandsPageActive);

function sendCommand(payload) {
  if (conn.demo) { showToast(t('demoNoCommands'), 'danger', 2500); return; }
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    showToast(t('commandNotConnectedToast'), 'danger');
    return;
  }
  ws.send(JSON.stringify(Object.assign({ type: 'command' }, payload)));
}
document.querySelectorAll('#commandsPanel .cmdBtn[data-action]').forEach(btn => {
  btn.addEventListener('click', () => sendCommand({ action: btn.dataset.action }));
});

// ---------------------------------------------------------------- botones custom
// Nombre de tecla (formato pydirectinput del cliente) a partir de un keydown:
// letras/digitos tal cual, F1-F24, numpad como num0-num9 / add / subtract...,
// teclas con nombre y puntuacion; modificadores adelante separados por "+".
const KEY_EVENT_NAMES = { ' ': 'space', Enter: 'enter', Tab: 'tab', Escape: 'esc', Backspace: 'backspace', Delete: 'delete', Insert: 'insert', Home: 'home', End: 'end',
  PageUp: 'pageup', PageDown: 'pagedown', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
const KEY_CODE_NAMES = { NumpadAdd: 'add', NumpadSubtract: 'subtract', NumpadMultiply: 'multiply', NumpadDivide: 'divide', NumpadDecimal: 'decimal', NumpadEnter: 'enter' };
function keyNameFromEvent(e) {
  let key = null;
  if (KEY_CODE_NAMES[e.code]) key = KEY_CODE_NAMES[e.code];
  else if (/^Numpad[0-9]$/.test(e.code)) key = 'num' + e.code.slice(6);
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(e.key)) key = e.key.toLowerCase();
  else if (KEY_EVENT_NAMES[e.key]) key = KEY_EVENT_NAMES[e.key];
  else if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3).toLowerCase(); // independiente del layout/AltGr
  else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
  else if (e.key.length === 1 && ";',./\\[]-=`".includes(e.key)) key = e.key;
  if (!key) return null;
  const mods = [];
  if (e.ctrlKey) mods.push('ctrl');
  if (e.shiftKey) mods.push('shift');
  if (e.altKey) mods.push('alt');
  if (mods.includes('alt') && key === 'f4') return null; // cerraria el juego
  return mods.concat(key).join('+');
}
function keyCapLabel(key) {
  return key.split('+').map(part => {
    if (/^(f[0-9]+|[a-z0-9])$/.test(part)) return part.toUpperCase();
    if (/^num[0-9]$/.test(part)) return 'Num ' + part.slice(3);
    if (/^[a-z]/.test(part)) return part[0].toUpperCase() + part.slice(1); // Ctrl, Shift, Space, Pageup...
    return part;
  }).join('+');
}

let customBtnEditing = null; // indice en customButtons, o null = alta

function renderCustomButtons() {
  const grid = document.querySelector('#commandsPanel .cmdGrid');
  if (!grid) return;
  grid.querySelectorAll('.cmdCustom, .cmdAdd').forEach(el => el.remove());
  customButtons.forEach((b, i) => {
    const btn = document.createElement('button');
    btn.className = 'cmdBtn cmdCustom';
    btn.title = `${b.title} · ${keyCapLabel(b.key)}`;
    btn.innerHTML = `<span class="keyCap"></span><span></span><span class="cmdEditBadge" role="button" title="${escapeHtml(t('customBtnEdit'))}">✎</span>`;
    btn.querySelector('.keyCap').textContent = keyCapLabel(b.key);
    btn.querySelectorAll('span')[1].textContent = b.title;
    btn.addEventListener('click', () => sendCommand({ action: 'custom', key: b.key }));
    btn.querySelector('.cmdEditBadge').addEventListener('click', (e) => { e.stopPropagation(); openCustomBtnModal(i); });
    grid.appendChild(btn);
  });
  if (customButtons.length < CUSTOM_BUTTONS_MAX) {
    const add = document.createElement('button');
    add.className = 'cmdBtn cmdAdd';
    add.innerHTML = `<span class="plus">+</span><span></span>`;
    add.querySelectorAll('span')[1].textContent = t('customBtnAdd');
    add.title = t('customBtnAdd');
    markLongCmdLabels();
    add.addEventListener('click', () => openCustomBtnModal(null));
    grid.appendChild(add);
  }
}

function openCustomBtnModal(index) {
  customBtnEditing = index;
  const b = index == null ? { title: '', key: '' } : customButtons[index];
  document.getElementById('customBtnTitle').value = b.title;
  document.getElementById('customBtnKey').value = b.key;
  document.getElementById('customBtnDelete').style.display = index == null ? 'none' : '';
  document.getElementById('customBtnModal').style.display = 'flex';
  document.getElementById('customBtnTitle').focus();
}
function closeCustomBtnModal() { document.getElementById('customBtnModal').style.display = 'none'; customBtnEditing = null; }

document.getElementById('customBtnKey').addEventListener('keydown', (e) => {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return; // esperando la tecla principal
  // Tab (y Shift+Tab) sale del campo: si lo tomaba como tecla, con el teclado
  // no habia forma de llegar a Guardar. Ctrl/Alt+Tab se siguen tomando.
  if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) return;
  e.preventDefault();
  const name = keyNameFromEvent(e);
  if (name) e.target.value = name;
});
document.getElementById('customBtnSave').addEventListener('click', () => {
  const title = document.getElementById('customBtnTitle').value.trim().slice(0, 14);
  const key = document.getElementById('customBtnKey').value.trim().toLowerCase().slice(0, 24);
  if (!title || !key) { showToast(t('customBtnIncomplete'), 'danger', 3000); return; }
  if (customBtnEditing == null) customButtons.push({ title, key });
  else customButtons[customBtnEditing] = { title, key };
  saveSettings();
  renderCustomButtons();
  closeCustomBtnModal();
});
document.getElementById('customBtnDelete').addEventListener('click', () => {
  if (customBtnEditing != null) customButtons.splice(customBtnEditing, 1);
  saveSettings();
  renderCustomButtons();
  closeCustomBtnModal();
});
document.getElementById('customBtnCancel').addEventListener('click', closeCustomBtnModal);
renderCustomButtons();

// Modal de remapeo de teclas: pide los binds actuales al cliente local (no
// se guardan en la web, viven solo en keybinds.json del lado del cliente),
// los muestra editables, y al guardar se los manda de vuelta para que los
// persista. La lista de acciones se arma sola a partir de los botones que ya
// existen en la botonera, para no duplicar esa lista a mano.
// Si la conexion se corta justo cuando el modal esta abierto (el cliente
// reconecta solo cada RECONNECT_DELAY_SECONDS), el pedido de teclas se
// pierde y el modal queda vacio para siempre - keybindsModalOpen +
// requestKeybinds() permiten reintentar apenas vuelve a conectar, en vez de
// depender de un solo pedido que puede caer justo en el peor momento.
let keybindsModalOpen = false;

function requestKeybinds() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'get_keybinds' }));
}

function openKeybindsModal() {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    showToast(t('commandNotConnectedToast'), 'danger');
    return;
  }
  const list = document.getElementById('keybindsList');
  list.innerHTML = '';
  document.querySelectorAll('#commandsPanel .cmdBtn[data-action]').forEach(btn => {
    const action = btn.dataset.action;
    const label = btn.querySelector('span').textContent;
    const row = document.createElement('div');
    row.className = 'keybindRow';
    row.innerHTML = `<span>${label}</span><input type="text" maxlength="16" data-action="${action}" placeholder="${t('keybindsUnassigned')}">`;
    list.appendChild(row);
  });
  keybindsModalOpen = true;
  document.getElementById('keybindsModal').style.display = 'flex';
  requestKeybinds();
}

document.getElementById('settingsRemapBtn').addEventListener('click', () => {
  document.getElementById('settingsModal').style.display = 'none';
  openKeybindsModal();
});

document.getElementById('keybindsCloseBtn').addEventListener('click', () => {
  keybindsModalOpen = false;
  document.getElementById('keybindsModal').style.display = 'none';
});

document.getElementById('keybindsSaveBtn').addEventListener('click', () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    showToast(t('commandNotConnectedToast'), 'danger');
    return;
  }
  const data = {};
  document.querySelectorAll('#keybindsList input[data-action]').forEach(input => {
    data[input.dataset.action] = input.value.trim() || null;
  });
  ws.send(JSON.stringify({ type: 'set_keybinds', data }));
  showToast(t('keybindsSavedToast'), 'success');
  keybindsModalOpen = false;
  document.getElementById('keybindsModal').style.display = 'none';
});

// Respuesta del cliente a get/set_keybinds - llega por el mismo socket que
// la telemetria (viaja como cualquier otro mensaje del cliente), asi que hay
// que distinguirla en onmessage antes de tratarla como un tick normal.
function handleKeybindsMessage(data) {
  const keybinds = data.data || {};
  document.querySelectorAll('#keybindsList input[data-action]').forEach(input => {
    input.value = keybinds[input.dataset.action] || '';
  });
}

// Solo avisa cuando algo salio MAL - a proposito no dice nada si el comando
// funciono, para no repetir un toast en cada click (ver historial: eso ya
// se probo y molestaba). El motivo viene del cliente local, que es el unico
// que sabe realmente si encontro la ventana del juego, etc.
const COMMAND_RESULT_REASON_KEY = { no_key: 'commandResultNoKey', no_window: 'commandResultNoWindow', bad_key: 'commandResultBadKey' };
function handleCommandResult(data) {
  if (data.ok) return;
  const reasonKey = COMMAND_RESULT_REASON_KEY[data.reason];
  const text = reasonKey ? t(reasonKey) : t('commandResultError').replace('{reason}', data.reason || '?');
  showToast(text, 'danger', 4000);
}

// Resalta los botones cuyo estado (segun la telemetria real) esta activo -
// no es un estado local del boton, siempre refleja lo que dice el juego.
function updateCommandButtonStates(data) {
  document.getElementById('cmdHazards').classList.toggle('active', !!data.lights?.hazards);
  document.getElementById('cmdBeacon').classList.toggle('active', !!data.lights?.beacon);
  document.getElementById('cmdHandbrake').classList.toggle('active', !!data.parkingBrake);
  document.getElementById('cmdEngine').classList.toggle('active', !!data.engineEnabled);
  document.getElementById('cmdLiftAxle').classList.toggle('active', !!data.liftAxle);
  document.getElementById('cmdWipers').classList.toggle('active', !!data.wipers);
  document.getElementById('cmdTrailer').classList.toggle('active', !!data.trailerAttached);
  document.getElementById('cmdCruise').classList.toggle('active', !!data.cruiseControl);
  // "Lights" no es un simple on/off (la tecla real rota entre apagado/
  // parking/bajas), asi que se resalta cuando hay CUALQUIER luz delantera
  // encendida, no un estado exacto que matchee el ciclo.
  document.getElementById('cmdLights').classList.toggle('active', !!(data.lights?.beamLow || data.lights?.beamHigh));
  document.getElementById('cmdHighBeam').classList.toggle('active', !!data.lights?.beamHigh);
}

// Conecta (o reconecta) el websocket del viewer. Se llama tanto al apretar
// Connect como automaticamente si la conexion se corta - antes, si se
// cortaba, el unico aviso era el texto chico de #status, facil de no notar
// si estas mirando el dashboard en otra pantalla mientras manejas.
// Un tick de telemetria (venga del relay, del servidor LAN del cliente o del
// modo demo): actualiza HUD, mapa, ruta y estado.
// Coalescing de la telemetria: se procesa a lo sumo UN tick por frame de
// pantalla, siempre el ultimo que llego. Con 10 Hz en LAN (o 4 por la nube)
// un tablet lento tardaba mas en dibujar un tick que lo que tardaba en
// llegar el siguiente, la cola del navegador crecia sin techo y a los
// minutos mostraba velocidad 0 con el camion a 50 (reporte de Discord).
// Los pulsos de evento (peaje, multa, entrega...) de un tick descartado se
// arrastran al siguiente para no perderlos.
let pendingTelemetry = null;
let telemetryFlushScheduled = false;
const TELEMETRY_FLUSH_FALLBACK_MS = 120;
const EVENT_PULSE_KEYS = ['tollgate', 'fined', 'ferry', 'train', 'jobDelivered', 'jobCancelled'];
function mergeEventPulses(older, newer) {
  if (!older) return newer;
  const out = Object.assign({}, newer || {});
  for (const k of EVENT_PULSE_KEYS) {
    if (older[k] && !out[k]) {
      for (const [kk, v] of Object.entries(older)) if (out[kk] === undefined || out[kk] === false || out[kk] === 0) out[kk] = v;
    }
  }
  return out;
}
let telemetryFlushNow = null; // set por queueTelemetry: procesa lo pendiente ya mismo
function flushPendingTelemetry() {
  if (telemetryFlushNow) telemetryFlushNow();
}
function queueTelemetry(data) {
  noteTickArrival();
  if (pendingTelemetry) data.event = mergeEventPulses(pendingTelemetry.event, data.event);
  pendingTelemetry = data;
  if (telemetryFlushScheduled) return;
  telemetryFlushScheduled = true;
  // requestAnimationFrame no corre si la pagina no se esta pintando
  // (pestana en segundo plano, pantalla apagada - y document.hidden no
  // siempre lo refleja): se programa ademas un timer de respaldo y gana el
  // que dispare primero. Asi los contadores/eventos siguen al dia aunque no
  // haya frames.
  let rafId = null, timerId = null;
  const flush = () => {
    if (rafId != null) cancelAnimationFrame(rafId);
    if (timerId != null) clearTimeout(timerId);
    telemetryFlushScheduled = false;
    const d = pendingTelemetry;
    pendingTelemetry = null;
    if (d) handleTelemetry(d);
  };
  telemetryFlushNow = () => { telemetryFlushNow = null; flush(); };
  rafId = requestAnimationFrame(() => { telemetryFlushNow = null; flush(); });
  timerId = setTimeout(() => { telemetryFlushNow = null; flush(); }, TELEMETRY_FLUSH_FALLBACK_MS);
}

// Consumo medido (ver createFuelTracker en pure.js): se alimenta con cada
// tick y se guarda en localStorage para sobrevivir recargas.
const FUEL_TRACKER_KEY = 'truckdash_fuel_tracker';
const fuelTracker = createFuelTracker();
try { fuelTracker.restore(JSON.parse(localStorage.getItem(FUEL_TRACKER_KEY) || 'null')); } catch (e) {}
let fuelTrackerSavedAt = 0;
function trackFuel(data) {
  if (conn.demo || data.paused) return;
  fuelTracker.push(data.odometerKm, data.fuel, `${data.game || ''}|${data.truckBrand || ''} ${data.truckName || ''}`);
  // Cargo combustible: la proxima parada de estacion queda cumplida aunque
  // haya cargado en otra o lejos del icono (ver createRefuelWatch).
  if (refuelWatch.push(data.fuel, data.fuelCapacity)) {
    const i = waypoints.findIndex(w => w.kind === 'g');
    if (i >= 0) {
      showToast(t('waypointRefueledToast').replace('{name}', waypoints[i].label || t('poiCatFuel')), 'success', 4000);
      removeWaypoint(i);
    }
  }
  const now = Date.now();
  if (now - fuelTrackerSavedAt > 15000) {
    fuelTrackerSavedAt = now;
    try { localStorage.setItem(FUEL_TRACKER_KEY, JSON.stringify(fuelTracker.state())); } catch (e) {}
  }
}
// Consumo y autonomia a mostrar: los medidos si ya hay datos, si no los del SDK.
function fuelFigures(data) {
  const measured = conn.demo ? null : fuelTracker.avgLPer100();
  const avg = measured || data.fuelAvgConsumption || null;
  let rangeKm = data.fuelRangeKm;
  if (measured && data.fuel != null) rangeKm = data.fuel / measured * 100;
  return { avg, rangeKm, measured: !!measured, spanKm: measured ? fuelTracker.spanKm() : 0 };
}

// Avisos de estado (createStatusAlerts, pure.js): trabajo nuevo, poco
// combustible y descanso cerca, por voz y, los dos ultimos, con un atajo
// arriba del mapa a la estacion o al area de descanso mas cercana. La parada
// de descanso se da por cumplida al dormir (createRestWatch), como la de
// estacion al cargar.
const statusAlerts = createStatusAlerts();
const restWatch = createRestWatch();
const stopSuggestion = createStopSuggestion();
let stopSuggestKind = null;
function trackStatus(data) {
  if (conn.demo) return;
  const st = statusAlerts.push(data);
  if (st.say && voiceOn && isLeaderTab) speakVoice(st.say);
  if (restWatch.push(data.restStopMinutes)) {
    const i = waypoints.findIndex(w => w.kind === 'p');
    if (i >= 0) {
      showToast(t('waypointRestedToast').replace('{name}', waypoints[i].label || t('poiCatRest')), 'success', 4000);
      removeWaypoint(i);
    }
  }
  renderStopSuggest(stopSuggestion.update(st, waypoints.map(w => w.kind)));
}
function renderStopSuggest(kind) {
  if (kind === stopSuggestKind) return;
  stopSuggestKind = kind;
  const box = document.getElementById('stopSuggest');
  box.hidden = !kind;
  if (!kind) return;
  // Con data-i18n: un cambio de idioma lo traduce sin pasar por aca.
  const text = document.getElementById('stopSuggestText');
  const go = document.getElementById('stopSuggestGo');
  document.getElementById('stopSuggestIcon').textContent = kind === 'g' ? '⛽' : '🅿️';
  text.dataset.i18n = kind === 'g' ? 'stopLowFuel' : 'stopRestSoon';
  go.dataset.i18n = kind === 'g' ? 'stopGoFuel' : 'stopGoRest';
  text.textContent = t(text.dataset.i18n);
  go.textContent = t(go.dataset.i18n);
}
document.getElementById('stopSuggestGo').addEventListener('click', () => {
  if (stopSuggestKind && addNearestStop(stopSuggestKind)) renderStopSuggest(null);
});
document.getElementById('stopSuggestClose').addEventListener('click', () => {
  stopSuggestion.close(stopSuggestKind);
  renderStopSuggest(null);
});

function handleTelemetry(data) {
  trackFuel(data);
  trackStatus(data);
  if (pipWin) setTimeout(refreshPip, 0); // despues de que el tablero se actualice
  if (cabMode) setTimeout(refreshCab, 0); // idem
  if (clientOverlayOn || obsOverlayOn) setTimeout(sendNavHud, 0); // idem
  const enAuto = isDrivingCar(data);
  if (enAuto !== drivingCar) { drivingCar = enAuto; applyVehicleMode(); }
  // Con el primer dato real se cambian las tarjetas por el estado vacio (ver
  // #panelEmpty): antes el panel era una columna de guiones hasta que el
  // jugador se subia al camion.
  document.getElementById('infoPanel').classList.remove('noData');
  conn.clientConnected = true;
  // Si la telemetria vuelve (menu -> camion) hay que redibujar el chip y
  // sacar la tarjeta "Ya casi" aunque el status ya diga live: el aviso de
  // status del cliente puede llegar ANTES que el primer tick (el relay los
  // manda por carriles distintos) y quedaba la tarjeta pegada con el
  // tablero andando (reporte con capturas del 19/9).
  const telemetryResumed = !conn.hasTelemetry;
  conn.hasTelemetry = true;
  const pausedChanged = conn.paused !== !!data.paused;
  conn.paused = !!data.paused;
  if (telemetryResumed || !conn.clientStatus || conn.clientStatus.status !== 'live' || conn.clientStatus.game !== data.game || pausedChanged) {
    conn.clientStatus = { status: 'live', game: data.game };
    lastData = data;
    renderConnectionUi();
  }
  updateHud(data);
  if (dashPanel) dashPanel.update(data);
  updateMap(data.position || {}, data.game, data.heading);
  updateDestinationMarker(data);
  updateRouteSummary(data);
  checkMissingCompanies(data);
  checkUpdateBanner(data.clientVersion);
  if (typeof convoyOnTelemetry === 'function') convoyOnTelemetry(data); // Convoy: variante de mapa, ruta, seguir al lider
  // Si cambio la variante de mapa efectiva (ej. activaste ProMods a
  // mitad de sesion), hay que avisarle al backend para que reagrupe bien.
  if (liveShareEnabled && (!conn.local || conn.lanRelay) && data.game && resolveEffectiveGame(data.game) !== lastSentMapVariant) { sendLiveShareState(); sendLiveRoute(true); }
}

function connectWs(backend, code, options = {}) {
  conn.local = !!options.local;
  conn.lanRelay = false; // lo dice el session_state del cliente
  renderLiveShareControls();
  fetchLatestClientVersion(conn.local ? document.getElementById('backendUrl').value : backend);
  clearTimeout(reconnectTimer);
  // Modo LAN: el cliente sirve esta pagina y el WebSocket directo, sin
  // pairing code (misma red = misma persona); ver client/local_server.py.
  const socket = new WebSocket(conn.local ? backend : `${backend}/ws/live/${code}`);
  ws = socket;
  conn.reopen = () => connectWs(backend, code, options);
  conn.socket = 'connecting';
  conn.invalidCode = false;
  renderConnectionUi();

  socket.onopen = () => {
    hideReconnectBanner();
    conn.openedAt = Date.now();
    conn.socket = 'open';
    conn.everOpen = true;
    conn.waitingClient = false;
    renderConnectionUi();
    sendLiveShareState(); // re-establecer el opt-in tras (re)conectar - el backend no lo recuerda entre conexiones
    // Sin ruta propia no se manda la vacia al conectar: borraba la ruta que
    // compartia otra pestana de la misma sesion (auditoria del 10-10).
    liveRouteSig = currentRouteWorldPoints ? null : 'none'; sendLiveRoute(true);
    sendCurrencyPref(); // idem: la moneda para el post de Discord
    if (keybindsModalOpen) requestKeybinds(); // el pedido anterior se pudo haber perdido en el corte
    if (typeof convoyOnSocketOpen === 'function') { convoyOnSocketOpen(); convoyRenderModal(); } // Convoy: volver a entrar tras (re)conectar
  };
  socket.onmessage = (event) => {
    lastWsMessageAt = Date.now();
    hideReconnectBanner();
    // Un mensaje del backend = el codigo existia de verdad (el rechazo por
    // codigo desconocido cierra sin mandar nada). Ver el 4404 mas abajo.
    conn.everValid = true;
    rememberedTries = 0;
    const data = JSON.parse(event.data);
    if (data.type) flushPendingTelemetry(); // los mensajes de control se procesan en orden con la telemetria que llego antes
    if (data.type === 'keybinds') { handleKeybindsMessage(data); return; } // no es telemetria
    if (data.type === 'live_players') { updateLivePlayers(data.players || []); return; } // no es telemetria
    if (data.type === 'live_share_state') { applyLiveShareState(data.enabled); return; } // por LAN lo reenvia el cliente
    if (data.type === 'command_result') { handleCommandResult(data); return; } // no es telemetria
    if (data.type && data.type.startsWith('convoy_')) { if (typeof convoyHandleMessage === 'function') convoyHandleMessage(data); return; } // Convoy (beta)
    if (data.type === 'session_state') {
      conn.clientConnected = !!data.client_connected;
      if (data.client_status) conn.clientStatus = data.client_status;
      if (conn.local) {
        // Un cliente que le pasa el tilde de compartir al relay manda la
        // clave (null si el relay todavia no dijo nada).
        conn.lanRelay = 'liveShare' in data;
        if (typeof data.liveShare === 'boolean') applyLiveShareState(data.liveShare);
        renderLiveShareControls();
      }
      setClientOverlay(data.client_status && data.client_status.overlay);
      setObsOverlay(data.obs_overlay); // un relay viejo no lo manda: apagado
      if (data.client_status) applyDetectedDlcs(data.client_status.mapDlcs);
      if (data.client_status) applyLocalMaps(data.client_status.localMaps, data.client_status.localMapPort);
      if (data.client_status) applyClientMapMods(data.client_status);
      if (!conn.clientConnected) conn.hasTelemetry = false;
      renderConnectionUi();
      return;
    }
    if (data.type === 'client_status') {
      conn.clientConnected = true;
      conn.clientStatus = data; // incluye .detail si el cliente lo manda
      setClientOverlay(data.overlay);
      applyDetectedDlcs(data.mapDlcs);
      applyLocalMaps(data.localMaps, data.localMapPort);
      applyClientMapMods(data);
      if (data.status !== 'live') conn.hasTelemetry = false;
      renderConnectionUi();
      checkUpdateBanner(data.clientVersion);
      return;
    }
    staleWatchArmed = true;
    queueTelemetry(data);
  };
  socket.onclose = (ev) => {
    if (ws !== socket) return; // reemplazado por una conexion mas nueva, ignorar
    // 4404 = el backend no conoce el codigo. Si esta pestana ya habia
    // recibido datos con el, el codigo era valido: es un redeploy del backend
    // (las sesiones viven en memoria) y el cliente local la recrea al
    // reconectar en pocos segundos - se sigue reintentando. Si nunca llego
    // nada, es un codigo mal tipeado o vencido: se avisa y se para.
    if (ev && ev.code === 4404 && !conn.everValid) {
      // Codigo que viene de un link guardado (el .exe abre el navegador con
      // ?code=..., y en el celular ese link queda de marcador): que el
      // backend no lo conozca solo quiere decir que el cliente de la PC
      // todavia no arranco, asi que se espera igual que cuando se cae. Un
      // codigo tipeado a mano si avisa enseguida que esta mal.
      if (options.remembered && ++rememberedTries <= REMEMBERED_MAX_TRIES) {
        conn.waitingClient = true; conn.invalidCode = false;
        renderConnectionUi();
        reconnectTimer = setTimeout(() => connectWs(backend, code, options), RECONNECT_DELAY_MS);
        return;
      }
      // Un minuto esperando y el backend sigue sin conocerlo: el codigo no es
      // que "todavia no arranco", esta muerto (lo rotaron con "Codigo nuevo").
      conn.waitingClient = false;
      conn.socket = 'open'; conn.invalidCode = true;
      renderConnectionUi();
      return;
    }
    conn.socket = 'closed';
    renderConnectionUi();
    showReconnectBanner(t('reconnectingBanner'));
    reconnectTimer = setTimeout(() => connectWs(backend, code, options), RECONNECT_DELAY_MS);
  };
  socket.onerror = () => {
    if (ws !== socket) return;
    statusEl.textContent = t('connectionError');
    statusEl.className = 'err';
  };
}

document.getElementById('connectBtn').addEventListener('click', () => {
  const backend = document.getElementById('backendUrl').value.trim();
  const code = document.getElementById('code').value.trim().toUpperCase();
  if (!code) { alert(t('enterCode')); return; }

  clearTimeout(reconnectTimer);
  if (ws) { ws.onclose = null; ws.close(); }
  trailWorld.length = 0;
  lastWorldPos = null;
  lastDisplayedLngLat = null;
  currentRouteTarget = null;
  currentRouteWorldPoints = null;
  if (map && map.getSource('trail')) map.getSource('trail').setData(emptyLineString());
  setRouteData(emptyLineString());
  if (cabMode) {
    // El codigo queda en la URL: si la ventana se recarga, se conecta sola
    document.documentElement.classList.remove('cabNeedsCode');
    const url = new URL(location.href);
    url.searchParams.set('code', code);
    try { history.replaceState(null, '', url); } catch (e) { /* nada */ }
  }
  connectWs(backend, code, { remembered: codeFromLink });
});

// Tour rapido de onboarding - se muestra solo la primera vez (localStorage),
// y se puede volver a pedir con el boton "?" de la fila de arriba. Cada paso
// apunta a un boton real (por id), le pone un highlight, y posiciona el
// tooltip cerca sin salirse de la pantalla.
const TOUR_STEPS = [
  { selector: '#connectGroup', textKey: 'tourCode' },
  { selector: '#settingsBtn', textKey: 'tourTopButtons' },
  { selector: '#recenterBtn', textKey: 'tourRecenter' },
  { selector: '#fullscreenBtn', textKey: 'tourFullscreen' },
  { selector: '#navToggleBtn', textKey: 'tourNavMode' },
  { selector: '#waypointBtn', textKey: 'tourWaypoint' },
  { selector: '#commandsToggleBtn', textKey: 'tourCommands' },
  { selector: '#poiBtn', textKey: 'tourPoi' },
];
let tourStepIndex = 0;

function positionTourTooltip(target) {
  const tooltip = document.getElementById('tourTooltip');
  const rect = target.getBoundingClientRect();
  const margin = 12;
  let left = rect.right + margin;
  let top = rect.top;
  // Objetivos del borde derecho (barra superior): primero se prueba a la
  // izquierda, si no el globo caia justo encima de la velocidad y del panel.
  if (left + tooltip.offsetWidth > window.innerWidth - margin
      && rect.left - tooltip.offsetWidth - margin >= margin) {
    left = rect.left - tooltip.offsetWidth - margin;
  }
  // Si no entra a la derecha, se pone debajo (o arriba si tampoco entra abajo).
  if (left + tooltip.offsetWidth > window.innerWidth - margin) {
    left = Math.max(margin, Math.min(rect.left, window.innerWidth - tooltip.offsetWidth - margin));
    top = rect.bottom + margin;
    if (top + tooltip.offsetHeight > window.innerHeight - margin) top = rect.top - tooltip.offsetHeight - margin;
  }
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${Math.max(margin, top)}px`;
}

function showTourStep(index) {
  document.querySelectorAll('.tourHighlight').forEach(el => el.classList.remove('tourHighlight'));
  const step = TOUR_STEPS[index];
  const target = document.querySelector(step.selector);
  if (!target) { tourStepIndex++; if (tourStepIndex < TOUR_STEPS.length) showTourStep(tourStepIndex); else endTour(); return; }
  target.classList.add('tourHighlight');
  target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  document.getElementById('tourText').textContent = t(step.textKey);
  document.getElementById('tourNextBtn').textContent = index === TOUR_STEPS.length - 1 ? t('tourDone') : t('tourNext');
  positionTourTooltip(target);
}

function startTour() {
  tourStepIndex = 0;
  // Sin codigo cargado (y sin sesion): primero explicar de donde sale.
  const needsClientStep = !document.getElementById('code').value.trim() && conn.socket === 'idle';
  if (needsClientStep && TOUR_STEPS[0].textKey !== 'tourDownload') TOUR_STEPS.unshift({ selector: '#connectGroup', textKey: 'tourDownload' });
  if (!needsClientStep && TOUR_STEPS[0].textKey === 'tourDownload') TOUR_STEPS.shift();
  // En modo LAN/demo no hay codigo que pegar: ese paso sobra.
  if ((conn.local || conn.demo) && TOUR_STEPS[0].textKey === 'tourCode') TOUR_STEPS.shift();
  document.getElementById('tourOverlay').style.display = 'block';
  showTourStep(0);
}

function endTour() {
  document.querySelectorAll('.tourHighlight').forEach(el => el.classList.remove('tourHighlight'));
  document.getElementById('tourOverlay').style.display = 'none';
  lsSet('truckdash_tour_seen', '1');
}

document.getElementById('tourNextBtn').addEventListener('click', () => {
  tourStepIndex++;
  if (tourStepIndex < TOUR_STEPS.length) showTourStep(tourStepIndex);
  else endTour();
});
document.getElementById('tourSkipBtn').addEventListener('click', endTour);
document.getElementById('helpBtn').addEventListener('click', startTour);

if (!lsGet('truckdash_tour_seen') && !cabMode) {
  // deja que el mapa/botones terminen de acomodarse; en modo espectador
  // (convoy o mapa en vivo, sin cliente) el tour de pairing no tiene sentido
  setTimeout(() => { if (!conn.spectator) startTour(); }, 600);
}

// El .exe del cliente abre el navegador directo con ?code=...&backend=...
// para que el usuario no tenga que tipear nada a mano.
// (autoConnectFromUrl se llama al final del archivo, cuando todo esta definido)

// ---------------------------------------------------------------------------
// Modo demo (?demo=1): un viaje simulado sobre el mapa real de ATS, para que
// quien entra desde la landing vea el GPS, la ruta, el cluster y las
// indicaciones funcionando sin bajar nada. Usa el mismo camino que la
// telemetria real (handleTelemetry) - lo unico falso es el origen del payload.
// ---------------------------------------------------------------------------
// DEMO_ROUTE y el generador de telemetria viven en pure.js: el panel de
// docs/dash/ usa exactamente los mismos datos, asi que alternar entre mapa
// y tablero muestra el mismo viaje.
const DEMO_TICK_MS = 250; // misma tasa que el cliente 1.5+ por el relay (4 Hz)
const DEMO_DISTANCE_SCALE = 20;
let demoTimer = null;

function startDemo() {
  conn.demo = true;
  conn.socket = 'open';
  conn.clientConnected = true;
  document.getElementById('code').value = 'DEMO';
  renderConnectionUi();
  loadGameMap(DEMO_ROUTE.game);
  // La ruta guardada (demoPathUsable en pure.js): con ella el camion sale
  // apenas hay mapa, sin esperar el grafo. Si no llega o es de otro grafo,
  // se calcula como siempre cuando el grafo esta.
  const mapData = MAP_DATA_VERSION[DEMO_ROUTE.game] || '';
  let savedPath = null, savedDone = false;
  fetch(`demo-route-${DEMO_ROUTE.game}.json?v=${mapData}&g=${ROUTE_GRAPH_V3_REV}`)
    .then(r => (r.ok ? r.json() : null))
    .then(d => { savedPath = demoPathUsable(d, ROUTE_GRAPH_V3_REV, mapData); })
    .catch(() => {})
    .finally(() => { savedDone = true; });
  // Sin tope, si los datos del mapa no llegaban la demo esperaba para
  // siempre sin decir nada. Con la ruta guardada casi nunca hace falta; sin
  // ella, el grafo en 4G lento tarda mas de 30 s.
  const giveUpAt = Date.now() + 90000;
  // Los POIs dan las empresas de origen y destino; si tardan, la demo arranca
  // igual entre los centros de las ciudades.
  const poisUntil = Date.now() + 8000;
  const waitAssets = () => {
    if (mapUnavailable) return; // sin WebGL no hay mapa ni ruta: el cartel lo explica
    const mapOk = mapReady && truckMarker;
    const graphOk = routeGraph && citiesByName[DEMO_ROUTE.from] && citiesByName[DEMO_ROUTE.to]
      && (pois || Date.now() >= poisUntil);
    if (mapOk && graphOk) { runDemo(computeDemoPath()); return; }
    if (mapOk && savedPath) { runDemo(savedPath); return; }
    if (Date.now() > giveUpAt) { showToast(t('demoUnavailable'), 'danger'); return; }
    demoTimer = setTimeout(waitAssets, savedDone ? 500 : 200);
  };
  waitAssets();
}

// De empresa a empresa, las mismas que manda la telemetria: si el camion
// fuera al centro de la ciudad, la ruta dibujada (a la empresa) y el
// recorrido de la demo se separarian al final. tools/build_demo_route.py
// llama a esta funcion para guardar demo-route-<juego>.json.
function computeDemoPath() {
  const a = citiesByName[DEMO_ROUTE.from], b = citiesByName[DEMO_ROUTE.to];
  const ini = findCompanyPoi(DEMO_ROUTE.companyFromId, DEMO_ROUTE.fromId);
  const fin = findCompanyPoi(DEMO_ROUTE.companyToId, DEMO_ROUTE.toId);
  return findRoute(ini ? [ini.x, ini.z] : [a.X, a.Y], fin ? [fin.x, fin.z] : [b.X, b.Y]);
}

function runDemo(path) {
  if (!path || path.length < 2) { showToast(t('demoUnavailable'), 'danger'); return; }
  const total = sumPathDistanceMeters(path);

  // [x, z, i]: el punto a dist metros del inicio y el indice del punto de
  // la ruta que le sigue.
  const pointAt = (dist) => {
    let acc = 0;
    for (let i = 1; i < path.length; i++) {
      const seg = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      if (acc + seg >= dist) {
        const f = seg ? (dist - acc) / seg : 0;
        return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * f, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * f, i];
      }
      acc += seg;
    }
    return [path[path.length - 1][0], path[path.length - 1][1], path.length];
  };

  // El largo real de la ruta calculada, a la escala del juego: asi la demo
  // del panel y la del mapa dicen los mismos kilometros.
  // ?demoKm=60 arranca 60 km mas adelante: a ritmo real, los primeros
  // minutos son la salida del deposito, y para grabar un video se quiere la
  // ruta (lo usa marketing/video/grabar.py del taller).
  const desdeKm = parseFloat(new URLSearchParams(window.location.search).get('demoKm')) || 0;
  const demo = createDemoTelemetry({
    tickMs: DEMO_TICK_MS,
    totalKm: (total / 1000) * DEMO_DISTANCE_SCALE,
    startKm: desdeKm,
  });

  const step = () => {
    const data = demo.next();
    const dist = demo.progress() * total;
    const [x, z, i] = pointAt(dist);
    data.position = { x, y: 0, z };
    // El camion anda a velocidad pareja, pero el GPS del juego cuenta las
    // ciudades a 1:3 (createCityScale): sin esto la demo decia 745 km y la
    // fila "via waypoint", con un waypoint sobre la ruta, 630.
    const restoKm = gameKmOf([[x, z], ...path.slice(i)], path);
    if (data.routeDistanceKm > 0) data.routeTimeSeconds *= restoKm / data.routeDistanceKm;
    data.routeDistanceKm = restoKm;
    data.plannedDistanceKm = gameKmOf(path, path);
    // Rumbo como lo manda el cliente 1.5.13+: sobre la grilla del juego
    // (0 = -z), no geografico. Sin esto la demo iba por el camino viejo de
    // deducirlo y no mostraba la diferencia entre los dos norte.
    // Mirando 15 m para atras y 25 para adelante: con +-5 m la flecha
    // saltaba en cada curvita del grafo (los cruces son tramos de pocos
    // metros). Un poco mas adelante que atras compensa el suavizado de la app;
    // con otro suavizado aca la camara llegaba a ir 45 grados atrasada en un
    // giro de 90, y con 50 m adelante se adelantaba 40 (medido el 09-10).
    const [ax, az] = pointAt(Math.max(0, dist - 15)), [bx, bz] = pointAt(dist + 25);
    if (ax !== bx || az !== bz) data.heading = (Math.atan2(bx - ax, -(bz - az)) * 180 / Math.PI + 360) % 360;
    handleTelemetry(data);
  };
  step();
  demoTimer = setInterval(step, DEMO_TICK_MS);
}

renderConnectionUi();
renderTripHistory();
buildSpeedTicks();
initCab();

// El .exe del cliente abre el navegador directo con ?code=...&backend=...
// para que el usuario no tenga que tipear nada a mano; ?local=1 y ?demo=1
// son los otros dos puntos de entrada. Va al final: usa funciones y
// variables (let) declaradas mas arriba.
(function autoConnectFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const backend = params.get('backend');
  if (backend) document.getElementById('backendUrl').value = backend;
  if (params.get('demo')) { startDemo(); return; }
  const liveParam = params.get('live');
  if (liveParam && !code && !params.get('local')) {
    // Mapa en vivo publico de una variante (sin cliente): livemap.js se carga
    // despues de este archivo y arranca al leer esta variable.
    window.__liveMapSpectator = { variant: liveParam, backend: document.getElementById('backendUrl').value.replace('wss://', 'https://').replace('ws://', 'http://') };
    return;
  }
  const convoyParam = (params.get('convoy') || '').toUpperCase();
  if (convoyParam && !code && !params.get('local')) {
    // Link de convoy sin cliente: espectador. Con cliente (?code=...) se
    // conecta normal y se abre el modal con el codigo puesto.
    // convoy.js se carga despues de este archivo y arranca el modo
    // espectador al leer esta variable (un setTimeout puede dispararse antes
    // de que ese script llegue).
    window.__convoySpectator = { code: convoyParam, backend: document.getElementById('backendUrl').value.replace('wss://', 'https://').replace('ws://', 'http://') };
    return;
  }
  if (convoyParam) setTimeout(() => convoyOpenModal(convoyParam), 800);
  if (params.get('local')) {
    // Servido por el cliente en la LAN: el WebSocket esta en el mismo host,
    // puerto fijo (ver client/local_server.py).
    connectWs(`ws://${location.hostname}:27766`, null, { local: true });
    return;
  }
  if (code) {
    document.getElementById('code').value = code.toUpperCase();
    codeFromLink = true;   // ver connectWs: se espera al cliente en vez de "codigo invalido"
    document.getElementById('connectBtn').click();
  }
})();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// Panel de tablero a pantalla completa. Es el mismo modulo que sirve la
// pagina de docs/dash/ en un segundo dispositivo; aca esta para quien tiene
// uno solo: alternar mapa/tablero no recarga nada, y sobre todo no vuelve a
// armar el grafo de rutas, que es lo que tarda.
const DASH_SCALE_KEY = 'truckdash_dash_scale';
const dashOverlay = document.getElementById('dashOverlay');
let dashPanel = null;

// Moderno o clasico (classic.js, createDashStyles). Un cliente viejo en modo
// LAN no sirve classic.js: queda el moderno solo y sin selector.
function ensureDashPanel() {
  if (dashPanel) return dashPanel;
  const opts = {
    root: document.getElementById('dashOverlayPanel'),
    money: moneyLine,       // con la conversion a la moneda local del usuario
    imperial: () => useImperial,
    lang: () => currentLang,
    hour12,
  };
  const conEstilos = typeof createDashStyles === 'function';
  dashPanel = conEstilos ? createDashStyles(Object.assign({ style: savedDashStyle() }, opts)) : createDashPanel(opts);
  document.getElementById('dashStyleGroup').hidden = !conEstilos;
  renderDashStyle();
  dashPanel.setVisible(false);
  dashPanel.applyTranslations();
  setDashScale(lsGet(DASH_SCALE_KEY) || '1');
  return dashPanel;
}

function renderDashStyle() {
  if (!dashPanel || !dashPanel.style) return;
  document.querySelectorAll('[data-dash-style]').forEach(b => b.classList.toggle('active', b.dataset.dashStyle === dashPanel.style()));
}
document.querySelectorAll('[data-dash-style]').forEach(b => b.addEventListener('click', () => {
  ensureDashPanel().setStyle(b.dataset.dashStyle);
  renderDashStyle();
  dashPanel.refresh(); // los dos estilos ya tienen el ultimo dato
}));

function setDashScale(valor) {
  if (dashPanel && dashPanel.setScale) dashPanel.setScale(valor);
  else document.getElementById('dashOverlayPanel').style.setProperty('--d-scale', valor);
  try { localStorage.setItem(DASH_SCALE_KEY, valor); } catch (e) {}
  document.querySelectorAll('[data-dash-scale]').forEach(b => b.classList.toggle('active', b.dataset.dashScale === String(valor)));
}

function toggleDash(abrir) {
  const panel = ensureDashPanel();
  dashOverlay.hidden = !abrir;
  panel.setVisible(abrir);
  if (abrir && lastData) panel.update(lastData);
}

document.getElementById('dashBtn').addEventListener('click', () => toggleDash(true));
document.getElementById('dashCloseBtn').addEventListener('click', () => toggleDash(false));
document.querySelectorAll('[data-dash-scale]').forEach(b => b.addEventListener('click', () => setDashScale(b.dataset.dashScale)));
// Escape cierra: con el tablero tapando todo, el boton de cerrar puede no
// ser lo primero que uno busca.
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !dashOverlay.hidden) toggleDash(false); });

// Link al panel para un segundo dispositivo, con el codigo puesto: tipear
// ocho caracteres en un telefono con una mano es justo lo que no queres
// hacer despues de enganchar el remolque.
document.getElementById('dashCopyLinkBtn').addEventListener('click', async () => {
  const code = document.getElementById('code').value.trim().toUpperCase();
  const url = new URL('../dash/', location.href);
  if (code) url.searchParams.set('code', code);
  try {
    await navigator.clipboard.writeText(url.toString());
    showToast(t('convoyCopied'), 'success', 2500);
  } catch (e) {
    // Sin permiso de portapapeles (http en la LAN, por ejemplo) al menos se
    // muestra para copiarlo a mano.
    prompt(t('dashCopyLink'), url.toString());
  }
});

// La vista de cabina en una ventana aparte, no en una pestana: el mod copia
// lo que muestra la ventana, y una pestana de atras no se ve.
document.getElementById('cabViewBtn').addEventListener('click', () => {
  const code = document.getElementById('code').value.trim().toUpperCase();
  const { width, height } = CAB_WINDOW_SIZE;
  window.open(cabViewUrl(location.href, code), 'truckdash-cab', `popup,width=${width},height=${height}`);
});

// Armador del overlay para OBS (docs/overlay/) con el codigo ya puesto.
document.getElementById('obsOverlayLink').addEventListener('click', (e) => {
  const code = document.getElementById('code').value.trim().toUpperCase();
  const url = new URL('../overlay/', location.href);
  url.searchParams.set('setup', '1');
  if (code && code !== 'DEMO') url.searchParams.set('code', code);
  if (currentLang !== 'en') url.searchParams.set('lang', currentLang);
  if (useImperial) url.searchParams.set('units', 'mi');
  e.currentTarget.href = url.toString();
});

// En una tablet o un celular no hay hover, asi que el title de los botones del
// mapa no se ve nunca ("I'm not exactly sure what that button there is",
// resena de Roane Gaming, 10-10). Al tocar uno se muestra su nombre un
// momento, las primeras BTN_TIP_TIMES veces de cada boton en este navegador:
// alcanza para aprenderlos sin que despues moleste. Mantener apretado no
// sirve para esto: ya abre el modo acomodar (LONG_PRESS_MS).
const BTN_TIP_TIMES = 3;
const BTN_TIP_KEY = 'truckdash_btn_tips';
(() => {
  let lastPointer = null, tip = null, tipTimer = null;
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem(BTN_TIP_KEY) || '{}') || {}; } catch (e) {}
  const hideTip = () => { clearTimeout(tipTimer); if (tip) { tip.remove(); tip = null; } };
  document.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType; }, { capture: true, passive: true });
  document.addEventListener('click', (e) => {
    if (lastPointer !== 'touch' || document.body.classList.contains('editLayout')) return;
    const btn = e.target.closest && e.target.closest('.mapBtn, .iconBtn');
    if (!btn || !btn.id || !btn.title || (seen[btn.id] || 0) >= BTN_TIP_TIMES) return;
    seen[btn.id] = (seen[btn.id] || 0) + 1;
    try { localStorage.setItem(BTN_TIP_KEY, JSON.stringify(seen)); } catch (err) {}
    hideTip();
    tip = document.createElement('div');
    tip.className = 'btnTip';
    tip.textContent = btn.title;
    document.body.appendChild(tip);
    const r = btn.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, r.left + r.width / 2 - tip.offsetWidth / 2));
    tip.style.left = `${left}px`;
    tip.style.top = `${r.top - tip.offsetHeight - 8 >= 8 ? r.top - tip.offsetHeight - 8 : r.bottom + 8}px`;
    tipTimer = setTimeout(hideTip, 1800);
  });
})();

// Lo que esta pestana cargo de los ajustes (ver saveSettings).
try { settingsBaseline = JSON.parse(JSON.stringify(currentSettings())); } catch (e) {}

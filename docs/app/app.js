// Logica de la app (extraida de index.html). Las funciones puras testeables viven en pure.js.
const statusEl = document.getElementById('status');
let ws = null;

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
  // La landing tiene su propia pagina en espanol; el resto va a la inglesa.
  const roadmapLink = document.getElementById('roadmapLink');
  if (roadmapLink) roadmapLink.href = `https://trucksim-dash.com/${currentLang === 'es' ? 'es/' : ''}#roadmap`;
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
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(Object.assign(loadSettings(), { miniHud: miniHudSettings, routeColor, atsMod, ets2Mod, liveShareEnabled, liveShareV2: true, hideOtherPlayers, useImperial, routeProfile, modsAuto, nav3d, currency: currencyPref, customButtons, liteMode, liteNoRouting, realBase, darkButtons, fadeButtons, btnLayout, layoutGrid, navZoom, routeSummaryMin, voiceOn, voiceByLang, liveShareRoute, dlcOff, dlcAuto })));
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
let routeProfile = _savedSettings.routeProfile || 'fastest'; // 'fastest' (como el GPS del juego) | 'shortest'
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
  const n = Math.round(amount || 0).toLocaleString();
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
// Desde 2026-09-21 viene ENCENDIDO por defecto: lo que se comparte es
// anonimo (posicion, camion, carga, ciudad origen/destino y el apodo de
// convoy solo si lo puso) y tambien alimenta el mapa en vivo publico (/live/).
// Lo guardado antes de ese cambio (liveShareV2 ausente) se migra una sola vez
// a encendido y se avisa con un toast al conectar; el usuario lo apaga en
// Ajustes cuando quiera.
let liveShareEnabled = _savedSettings.liveShareV2 ? !!_savedSettings.liveShareEnabled : true;
let liveShareNoticePending = !_savedSettings.liveShareV2;
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
  document.getElementById('setLiveShare').checked = liveShareEnabled;
  document.getElementById('setLiveShareRoute').checked = liveShareRoute;
  document.getElementById('setLiveShareRoute').disabled = !liveShareEnabled;
  document.getElementById('setNavZoom').value = navZoom;
  document.getElementById('setVoice').checked = voiceOn;
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
  // Sin telemetria todavia no se sabe el juego: resolveEffectiveGame() cae
  // en 'ats' por defecto y el conductor aparecia en el mapa de ATS aunque
  // estuviera en ETS2. Se manda null (no comparte) y updateMap re-manda el
  // estado apenas llega el primer tick con el juego real.
  const mapVariant = liveShareEnabled && lastData?.game ? resolveEffectiveGame(lastData.game) : null;
  lastSentMapVariant = mapVariant;
  // El apodo de convoy (si lo puso) es lo unico con nombre que se muestra en el mapa en vivo.
  const nick = liveShareEnabled ? (loadSettings().convoyNick || null) : null;
  ws.send(JSON.stringify({ type: 'set_live_share', enabled: liveShareEnabled, mapVariant, nick, explicit: !!explicit }));
  if (liveShareNoticePending && liveShareEnabled && !conn.demo && !conn.spectator) {
    liveShareNoticePending = false;
    saveSettings(); // persiste liveShareV2: el aviso es una sola vez
    showToast(t('liveShareNotice'), 'info', 12000);
  }
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

// Ruta propia al mapa en vivo publico (/live/): la misma que se dibuja aca,
// simplificada, cuando cambia y como mucho cada LIVE_ROUTE_RESEND_MS. Solo
// con la posicion compartida y la casilla de la ruta prendida; si no, se
// manda vacia una vez para que desaparezca.
const LIVE_ROUTE_MAX_POINTS = 400;
const LIVE_ROUTE_RESEND_MS = 15000;
let liveRouteSig = null;
let liveRouteSentAt = 0;
function sendLiveRoute(force) {
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
document.getElementById('setVoice').addEventListener('change', (e) => {
  voiceOn = e.target.checked;
  saveSettings();
  if (voiceOn) { unlockVoice(); speakVoice('soon_turn_right'); }
});
document.getElementById('setVoiceName').addEventListener('change', (e) => {
  voiceByLang[currentLang] = e.target.value;
  saveSettings();
  unlockVoice();
  speakVoice('soon_turn_right');
});
document.getElementById('setVoiceTest').addEventListener('click', () => {
  unlockVoice();
  speakVoice('soon_turn_right');
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
  saveSettings();
  if (!liveShareEnabled) updateLivePlayers([]); // saca los marcadores ajenos ya dibujados
  document.getElementById('setLiveShareRoute').disabled = !liveShareEnabled;
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
  saveSettings();
  document.getElementById('setLiveShare').checked = enabled;
  document.getElementById('setLiveShareRoute').disabled = !enabled;
  if (!enabled) updateLivePlayers([]);
}

// Modo LAN: el cliente no le pasa este ajuste al relay, asi que la casilla no
// hacia nada y parecia andar. Se deshabilita y se dice donde se cambia.
function renderLiveShareForLan() {
  const lan = !!conn.local;
  for (const id of ['setLiveShare', 'setLiveShareRoute']) {
    const el = document.getElementById(id);
    if (el) el.disabled = lan || (id === 'setLiveShareRoute' && !liveShareEnabled);
  }
  const hint = document.getElementById('liveShareLanHint');
  if (hint) hint.hidden = !lan;
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

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (document.getElementById('dlcModal').style.display === 'flex') {
    document.getElementById('dlcModal').style.display = 'none';
  }
  if (document.getElementById('settingsModal').style.display === 'flex') {
    document.getElementById('settingsModal').style.display = 'none';
  }
  if (document.getElementById('modsModal').style.display === 'flex') {
    document.getElementById('modsModal').style.display = 'none';
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
const VEC_LAYER_IDS = ['mapArea', 'prefab', 'ferry-line', 'road-local', 'road-divided', 'road-freeway', 'poi', 'car-parking', 'atlas', 'ferry-poi', 'exit-label', 'country-label', 'city-label'];

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
    { id: 'poi', type: 'symbol', source: 'vec', 'source-layer': L, minzoom: liteMode ? 9 : 7,
      filter: poiLayerFilter(),
      layout: { 'icon-image': ['get', 'sprite'], 'icon-size': 0.8, 'icon-allow-overlap': true, 'icon-ignore-placement': true } },
    // En auto (ATS) los lugares de descanso son otros: los de camion se
    // ocultan del 'poi' y van estos, que salen de pois-<variante>.json.
    { id: 'car-parking', type: 'symbol', source: 'car-parking', minzoom: liteMode ? 9 : 7,
      layout: { 'icon-image': 'car_parking', 'icon-size': 0.8, 'icon-allow-overlap': true, 'icon-ignore-placement': true,
                visibility: drivingCar ? 'visible' : 'none' } },
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
  map.setPaintProperty('bg', 'background-color', name ? MAP_BG_WATER : MAP_BG_FLAT);
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
// directamente (no tienen asa): son uno solo cada uno.
const MOVABLE_PANEL_IDS = ['miniHud', 'miniHudExtra', 'navPanel'];
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
  el.style.left = `${pos.x}%`;
  el.style.top = `${pos.y}%`;
  el.style.right = 'auto';
  el.style.bottom = 'auto';
  el.style.scale = pos.s && pos.s !== 1 ? String(pos.s) : '';
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
    el.style.left = el.style.top = el.style.right = el.style.bottom = el.style.scale = '';
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
  return ev.clientX > r.right - LAYOUT_RESIZE_CORNER_PX && ev.clientY > r.bottom - LAYOUT_RESIZE_CORNER_PX;
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
  const x = parseFloat(el.style.left), y = parseFloat(el.style.top);
  if (!isFinite(x) || !isFinite(y)) return;
  const s = parseFloat(el.style.scale);
  layoutBucket(el.id)[el.id] = isFinite(s) && s !== 1 ? { x, y, s } : { x, y };
  saveSettings();
}

function startLayoutResize(el, ev) {
  const panel = document.getElementById('mapPanel');
  if (!panel) return;
  ev.preventDefault();
  ev.stopPropagation();
  const target = ev.currentTarget;
  target.setPointerCapture(ev.pointerId);
  detachForLayout(el, panel);
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
      if (el.parentNode !== panel) panel.appendChild(el);
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
      // capas de texto de una. Host publico oficial de MapLibre para fuentes basicas.
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      sources: {},
      layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#2b2f36' } }],
    },
    center: [0, 20],
    zoom: 1,
    attributionControl: false,
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
function poiLayerFilter() {
  const sprites = drivingCar ? POI_ICONS.filter(n => n !== 'parking_ico') : POI_ICONS;
  return ['all', ['==', ['get', 'type'], 'poi'], ['in', ['get', 'sprite'], ['literal', sprites]], ['!', ['in', ['get', 'poiType'], ['literal', ['ferry', 'train']]]]];
}
function applyVehicleMode() {
  if (!map) return;
  if (map.getLayer('poi')) map.setFilter('poi', poiLayerFilter());
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

async function loadCities(mapInfo) {
  try {
    const res = await fetch(`${mapInfo.assetsDir}/Cities.json?v=${MAP_DATA_VERSION[currentGame] || ''}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = await res.json();
    citiesByName = {};
    citiesByToken = {};
    citiesAll = list;
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
  try {
    const res = await fetch(`${mapInfo.assetsDir}/road-names.json?v=${MAP_DATA_VERSION[currentGame] || ''}`);
    if (!res.ok) return;
    roadNames = await res.json();
  } catch (err) {
    roadNames = [];
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

function nearestRoadName(x, z, maxDist) {
  let best = null;
  let bestDist = maxDist;
  for (const sign of roadNames) {
    const dist = Math.hypot(sign.x - x, sign.y - z);
    if (dist < bestDist) {
      bestDist = dist;
      best = sign;
    }
  }
  return best; // { x, y, label, kind: 'road'|'city' } o null
}

// Grafo de rutas (roads + prefabs) preprocesado con build_route_graph.py a partir
// del output de truckermudgeon/maps. nodes: [[x,y], ...], edges: [[fromIdx, toIdx, weight], ...]
let routeGraph = null; // typed arrays + CSR, ver buildRouteGraph()
// La ruta actual pasa por un DLC destildado porque no hay otro camino.
let routeUsesUncheckedDlc = false;
let currentRouteTarget = null; // cityDst actual, para saber cuando recalcular
let currentRouteWorldPoints = null; // puntos de la ruta actual en coordenadas de juego, para detectar desvios
const OFF_ROUTE_THRESHOLD_M = 200; // si te alejas mas que esto de la ruta calculada, se recalcula (como un GPS) - en interconexiones con rampas paralelas cercanas, 400 tardaba en detectar que se tomo una rampa distinta

// Waypoints intermedios puestos a mano desde la app (posicion -> wp1 -> wp2
// ... -> destino), en orden. El SDK del juego no sabe nada de esto - si el
// usuario tambien los marco en el GPS del juego (inGame=true), el "In-game
// ETA"/distancia que manda el juego ya reflejan el desvio y no tocamos esos
// numeros. Si alguno es solo de la app (inGame=false), calculamos nosotros
// la distancia total sumando los tramos del grafo y se muestra aparte en las
// filas "(with waypoints)". Un waypoint se da por alcanzado (y se saca solo,
// como un GPS) cuando el camion pasa a menos de WAYPOINT_REACHED_M.
const WAYPOINT_REACHED_M = 150;
const MAX_WAYPOINTS = 9;
let waypoints = []; // [{ pos: [x,z], lngLat: [lng,lat], inGame: bool, label: string|null, marker }]
let waypointMode = false; // true mientras se espera el proximo click en el mapa para ubicar un waypoint
let waypointRouteDistanceKm = null; // distancia total (posicion->waypoints->destino) calculada por nosotros
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
  const keep = waypoints.filter(w => !w.convoyFollow);
  if (keep.length) {
    stored[currentGame] = { at: Date.now(), list: keep.map(w => ({ pos: w.pos, inGame: w.inGame, label: w.label })) };
  } else {
    delete stored[currentGame];
  }
  try { localStorage.setItem(WAYPOINTS_KEY, JSON.stringify(stored)); } catch (e) {}
}
function restoreWaypoints() {
  if (!currentGame || !toLngLat || waypoints.length || conn.demo) return;
  for (const w of storedWaypoints(readStoredWaypoints(), currentGame, Date.now(), 12 * 3600 * 1000, MAX_WAYPOINTS)) {
    const lngLat = toLngLat(w.pos[0], w.pos[1]);
    waypoints.push({ pos: w.pos, lngLat, inGame: w.inGame, label: w.label, marker: makeWaypointMarker(lngLat, waypoints.length) });
  }
  if (waypoints.length) { renderWaypointList(); invalidateRoute(); }
}

function addWaypoint(pos, lngLat, inGame, label) {
  if (waypoints.length >= MAX_WAYPOINTS) { showToast(t('waypointLimitToast').replace('{n}', MAX_WAYPOINTS), 'danger'); return; }
  const wp = { pos, lngLat, inGame, label: label || null, marker: makeWaypointMarker(lngLat, waypoints.length) };
  waypoints.push(wp);
  renderWaypointList();
  invalidateRoute();
  saveWaypoints();
}

function removeWaypoint(index) {
  const [wp] = waypoints.splice(index, 1);
  if (wp && wp.marker) wp.marker.remove();
  renumberWaypointMarkers();
  if (!waypoints.length) waypointRouteDistanceKm = null;
  renderWaypointList();
  invalidateRoute();
  saveWaypoints();
}

// keepStored: al cambiar de mapa se sacan de la pantalla pero quedan
// guardados para cuando se vuelva a esa variante.
function clearWaypoint(keepStored = false) {
  for (const wp of waypoints) if (wp.marker) wp.marker.remove();
  waypoints = [];
  waypointRouteDistanceKm = null;
  renderWaypointList();
  invalidateRoute();
  if (!keepStored) saveWaypoints();
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
    const label = wp.label ? wp.label : `${t('waypoint')} ${i + 1}`;
    const kind = wp.inGame ? t('waypointInGameShort') : t('waypointAppOnlyShort');
    return `<div class="waypointItem"><span class="waypointNum">${i + 1}</span><span class="waypointName">${label.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))} <span class="waypointKind">${kind}</span></span><button class="waypointClearBtn" data-index="${i}" data-i18n-title="clear" title="${t('clear')}">✕</button></div>`;
  }).join('');
  list.querySelectorAll('button[data-index]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); removeWaypoint(Number(b.dataset.index)); }));
}

function finalizeWaypoint(inGame) {
  if (!pendingWaypoint) return;
  addWaypoint(pendingWaypoint.pos, pendingWaypoint.lngLat, inGame, pendingWaypoint.label);
  pendingWaypoint = null;
}

// Un waypoint agregado desde la busqueda de POIs (estacion, taller, empresa)
// no pasa por el modal: el juego no lo conoce (inGame=false) y ya tiene nombre.
function addPoiWaypoint(pos, label) {
  if (!toLngLat) return;
  addWaypoint(pos, toLngLat(pos[0], pos[1]), false, label);
  showToast(t('poiAddedToast').replace('{name}', label), 'success', 3000);
}

// Saca el primer waypoint cuando el camion llega (pasa cerca) - asi una
// ruta con varias paradas avanza sola, como un GPS de verdad.
function checkWaypointReached(x, z) {
  if (!waypoints.length) return;
  const wp = waypoints[0];
  if (Math.hypot(wp.pos[0] - x, wp.pos[1] - z) < WAYPOINT_REACHED_M) {
    showToast(t('waypointReachedToast').replace('{name}', wp.label || `${t('waypoint')} 1`), 'success', 3000);
    removeWaypoint(0);
  }
}

// Actualiza las filas "(with waypoints)" bajo In-game ETA y Real ETA - solo
// tienen sentido si hay algun waypoint que el juego NO conoce (si estan
// todos marcados tambien en el juego, el numero del juego ya es correcto).
function updateWaypointRoute(data) {
  const gameRow = document.getElementById('etaGameWaypointRow');
  const realRow = document.getElementById('etaRealWaypointRow');
  const anyAppOnly = waypoints.some(wp => !wp.inGame);
  if (!anyAppOnly || waypointRouteDistanceKm == null) {
    gameRow.hidden = true;
    realRow.hidden = true;
    return;
  }
  const distDisplay = useImperial ? waypointRouteDistanceKm * KM_TO_MI : waypointRouteDistanceKm;
  const distText = `${distDisplay.toFixed(1)} ${useImperial ? 'mi' : 'km'}`;
  let timeText = t('calculating');
  if (lastKnownAvgSpeedKmh && lastKnownAvgSpeedKmh > 0) {
    timeText = formatSeconds((waypointRouteDistanceKm / lastKnownAvgSpeedKmh) * 3600);
  }
  gameRow.hidden = false;
  realRow.hidden = false;
  document.getElementById('etaGameWaypoint').textContent = `${timeText} (${distText})`;
  document.getElementById('etaRealWaypoint').textContent = timeText;
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
  const src = map && map.getSource('atlas');
  if (!src) return;
  const vale = pois && poisVariant === currentGame && toLngLat;
  src.setData(atlasGeoJson(vale ? pois.atlas : null));
  const autos = map.getSource('car-parking');
  if (autos) autos.setData(atlasGeoJson(vale ? pois.facilities.filter(f => f[2] === 'c') : null));
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
  for (const f of pois.facilities) {
    if (f[2] !== code) continue;
    out.push({ x: f[0], z: f[1], code, dist: Math.hypot(f[0] - x, f[1] - z) });
  }
  out.sort((a, b) => a.dist - b.dist);
  return out.slice(0, limit);
}

function searchCompanies(query, x, z, limit) {
  if (!pois) return [];
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out = [];
  for (const c of pois.companies) {
    const label = (c[3] || '').toLowerCase();
    const city = (c[4] || '').toLowerCase().replace(/_/g, ' ');
    if (label.includes(q) || city.includes(q)) out.push({ x: c[0], z: c[1], label: c[3], city: c[4], dist: x != null ? Math.hypot(c[0] - x, c[1] - z) : 0 });
  }
  out.sort((a, b) => a.dist - b.dist);
  return out.slice(0, limit);
}

function formatPoiDistance(rawMeters) {
  const meters = rawMeters * distanceScale();
  if (useImperial) { const mi = meters / 1609.34; return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`; }
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
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

function cityLabel(token) {
  if (!token) return '';
  return (pois && pois.cities && pois.cities[token]) || token.replace(/_/g, ' ');
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
  const cityFilter = document.getElementById('poiCityInput').value.trim().toLowerCase();
  const cityToken = cityFilter && pois.cities ? Object.keys(pois.cities).find(tok => pois.cities[tok].toLowerCase() === cityFilter) : null;
  let results;
  if (cityToken) {
    // Ciudad elegida: todas sus empresas (filtradas por el texto si hay), a
    // distancia del camion - dos pasos, como en un GPS de verdad.
    const q = query.trim().toLowerCase();
    results = pois.companies
      .filter(c => c[4] === cityToken && (!q || (c[3] || '').toLowerCase().includes(q)))
      .map(c => ({ x: c[0], z: c[1], label: c[3], city: c[4], dist: Math.hypot(c[0] - pos.x, c[1] - pos.z), name: c[3], sub: cityLabel(c[4]) }))
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(0, 40);
  } else if (query.trim()) {
    results = searchCompanies(query, pos.x, pos.z, 20).map(r => ({ ...r, name: r.label, sub: cityLabel(r.city) }));
  } else {
    // En auto, "Area de descanso" son los estacionamientos para auto
    const codigo = poiCategory === 'p' && drivingCar ? 'c' : poiCategory;
    results = nearestFacilities(codigo, pos.x, pos.z, 15).map(r => r.code === 'a'
      ? { ...r, sub: [t(r.kind === 't' ? 'atlasTouristBoard' : 'atlasPoi'), nearestCityName(r.x, r.z)].filter(Boolean).join(' · ') }
      : { ...r, name: t(POI_CODES[r.code]), sub: nearestCityName(r.x, r.z) || '' });
  }
  if (!results.length) { list.innerHTML = `<div class="poiEmpty">${t('poiNoResults')}</div>`; return; }
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  list.innerHTML = results.map((r, i) => `
    <button class="poiItem" data-index="${i}">
      <span class="poiIcon">${r.code ? POI_ICONS_TEXT[r.code] : '🏭'}</span>
      <span class="poiText"><span class="poiName">${esc(r.name)}</span>${r.sub ? `<span class="poiSub">${esc(r.sub)}</span>` : ''}</span>
      <span class="poiDist">${formatPoiDistance(r.dist)}</span>
    </button>`).join('');
  list.querySelectorAll('.poiItem').forEach(btn => btn.addEventListener('click', () => {
    const r = results[Number(btn.dataset.index)];
    addPoiWaypoint([r.x, r.z], r.sub ? `${r.name} (${r.sub})` : r.name);
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
  if (!list || !pois || !pois.cities) return;
  list.innerHTML = Object.values(pois.cities).sort().map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
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
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePoiModal(); });
document.getElementById('poiModal').addEventListener('click', (e) => { if (e.target.id === 'poiModal') closePoiModal(); });
document.getElementById('poiSearchInput').addEventListener('input', renderPoiResults);
document.getElementById('poiCityInput').addEventListener('input', () => { renderPoiResults(); });
document.querySelectorAll('.poiChip').forEach(chip => chip.addEventListener('click', () => {
  poiCategory = chip.dataset.code;
  document.querySelectorAll('.poiChip').forEach(c => c.classList.toggle('active', c === chip));
  document.getElementById('poiSearchInput').value = '';
  renderPoiResults();
}));
// Atajo: la estacion de servicio mas cercana como waypoint, en un toque.
document.getElementById('poiNearestFuelBtn').addEventListener('click', () => {
  const pos = lastWorldPos;
  if (!pos || !pois) { renderPoiResults(); return; }
  const [best] = nearestFacilities('g', pos.x, pos.z, 1);
  if (!best) { showToast(t('poiNoResults'), 'danger'); return; }
  addPoiWaypoint([best.x, best.z], `${t('poiCatFuel')} (${formatPoiDistance(best.dist)})`);
  closePoiModal();
});

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
const ROUTE_GRAPH_V3_REV = 4;

async function loadRouteGraph(mapInfo) {
  routeGraph = null;
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
      routeGraph = buildRouteGraph(routeGraphFromJson(await res.json()));
      return;
    }
    // Primero el v3 (con la corrida para dibujar la ruta sobre la calzada de
    // la mano por la que se va); si esa variante todavia no lo tiene, el de
    // siempre, y la ruta se dibuja por el eje como antes. `g` cambia cuando
    // se resube solo el v3 (corridas corregidas, ruteo igual), para no tener
    // que subir MAP_DATA_VERSION y hacer bajar de nuevo los tiles.
    let res = await fetch(`${base}-v3.bin${v}&g=${ROUTE_GRAPH_V3_REV}`).catch(() => null);
    if (!res || !res.ok) res = await fetch(`${base}.bin${v}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    routeGraph = buildRouteGraph(decodeRouteGraphBin(await res.arrayBuffer()));
  } catch (err) {
    // Sin grafo el mapa y el tablero siguen andando; lo que no hay es ruteo.
    console.warn('no se pudo cargar el grafo de rutas', err);
    routeGraph = null;
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
  return graph;
}

// Bolsones de pocos nodos = intersecciones mal resueltas por el parser; una
// componente de cientos de nodos es una isla real (Gran Bretana, Islandia,
// Sicilia...) y hay que poder rutear dentro de ella aunque no este unida al
// continente. Con las aristas de ferry en el grafo casi todo termina en una
// sola componente, pero por las dudas se admite cualquiera de este tamano.
const MIN_REAL_COMPONENT_NODES = 300;

// nodeOk: si viene, solo nodos con algun tramo que se pueda usar (DLC).
function nearestNodeIndex(x, y, requireGiantComponent, onlyComponent = -1, nodeOk = null) {
  let best = -1;
  let bestDist = Infinity;
  const nodes = routeGraph.nodes;
  const n = routeGraph.n;
  const compId = routeGraph.componentId, compSize = routeGraph.componentSize, giant = routeGraph.giantComponent;
  for (let i = 0; i < n; i++) {
    if (nodeOk && !nodeOk[i]) continue;
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
function findRoute(startXY, endXY) {
  if (!routeGraph) return null;
  const propio = dlcFilter(true);
  let ruta = findRouteWith(startXY, endXY, propio);
  if (ruta || !propio) return ruta;
  if (dlcOffFor(dlcGameOf(currentGame)).length) {
    ruta = findRouteWith(startXY, endXY, dlcFilter(false));
    if (ruta) { ruta.usesUncheckedDlc = true; return ruta; }
  }
  return findRouteWith(startXY, endXY, null);
}

function findRouteWith(startXY, endXY, filtro) {
  const { nodes, csr, adjTo, adjEdge, adjRev, edgeM, edgeS, edgeF, midOff, midXY, degree, componentId, edgeG } = routeGraph;
  const blocked = filtro ? filtro.blocked : null;
  const nodeOk = filtro ? filtro.nodeOk : null;
  // Origen y destino tienen que caer en la misma componente para que A*
  // encuentre camino: primero el nodo mas cercano en cualquier componente
  // real; si no coinciden (ej. destino en una isla sin ferry en el grafo),
  // se re-snapea el destino dentro de la componente del origen (ruta hasta
  // el punto mas cercano alcanzable, mejor que nada).
  let startIdx = nearestNodeIndex(startXY[0], startXY[1], 'real', -1, nodeOk);
  let endIdx = nearestNodeIndex(endXY[0], endXY[1], 'real', -1, nodeOk);
  if (startIdx === -1 || endIdx === -1) return null;
  if (componentId[startIdx] !== componentId[endIdx]) {
    endIdx = nearestNodeIndex(endXY[0], endXY[1], false, componentId[startIdx], nodeOk);
    if (endIdx === -1) return null;
  }

  // Perfil de ruteo: "fastest" pesa por tiempo (prefiere autopista, como el
  // GPS del juego), "shortest" por metros. La heuristica de A* tiene que ser
  // admisible: distancia recta, y para tiempo dividida por la velocidad maxima
  // posible (90 km/h).
  const byTime = routeProfile !== 'shortest';
  const MAX_SPEED_MS = 90 / 3.6;
  const ex = nodes[2 * endIdx], ey = nodes[2 * endIdx + 1];
  const heuristic = (i) => {
    const d = Math.hypot(nodes[2 * i] - ex, nodes[2 * i + 1] - ey);
    return byTime ? d / MAX_SPEED_MS : d;
  };

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
      const tentativeG = g + (byTime ? edgeS[e] : edgeM[e]);
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
  path.reverse();
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
  const out = [];
  for (let k = 0; k < path.length; k++) {
    const i = path[k];
    let ferry = 0;
    let desde = -1, sIni = 0, sFin = 0;
    if (k > 0) {
      const prev = path[k - 1];
      const d = routeGraph.dirEdge(prev, i);
      if (d !== -1) {
        const e = adjEdge[d];
        ferry = edgeF[e] & 1 ? 1 : 0;
        if (shiftA) {
          desde = out.length - 1;
          sIni = (adjRev[d] ? shiftB[e] : shiftA[e]) / 2;
          sFin = (adjRev[d] ? shiftA[e] : shiftB[e]) / 2;
        }
        const m0 = midOff[e], m1 = midOff[e + 1];
        if (adjRev[d]) { for (let m = m1 - 1; m >= m0; m--) out.push([midXY[2 * m], midXY[2 * m + 1], 0, 0, null]); }
        else { for (let m = m0; m < m1; m++) out.push([midXY[2 * m], midXY[2 * m + 1], 0, 0, null]); }
      }
    }
    out.push([nodes[2 * i], nodes[2 * i + 1], ferry, degree[i] >= 3 ? 1 : 0, i]);
    if (desde >= 0) spreadEdgeShift(out, desde, sIni, sFin);
  }
  return out;
}

// Objetivo de la ruta, en orden de preferencia: la empresa de carga (si hay
// trabajo tomado pero la carga todavia no se subio - ahi es adonde te manda
// el GPS del juego), la empresa de destino exacta (token empresa + ciudad
// via POIs), el centro de la ciudad de destino (Cities.json), o - sin
// trabajo - el ultimo waypoint puesto a mano (ej. "combustible mas cercano").
// Ruta borrada a mano: se recuerda de que viaje era para no volver a
// dibujarla hasta que cambie el trabajo (PR #1 de Vladimir Kutkovoy).
let dismissedRouteIdentity = null;
let routeProgressState = { key: null, total: 0 };
let routeSummaryEtaSeconds = null;

function routeIdentity(data) {
  return JSON.stringify([data.game, data.citySrc, data.cityDst, data.companySrcId,
    data.companyDstId, data.onJob, data.isCargoLoaded, data.cargo]);
}

function resolveRouteTarget(data) {
  if (dismissedRouteIdentity === routeIdentity(data)) return null;
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
  if (data.cityDst) {
    const company = (data.companyDstId ? findCompanyPoi(data.companyDstId, data.cityDstId) : null)
      || findCompanyPoiByName(data.companyDst, data.cityDstId);
    if (company) return { x: company.x, z: company.z, kind: 'dest', key: `dest:${company.token}@${company.city}` };
    const city = findCity(data.cityDstId, data.cityDst);
    if (city) return { x: city.X, z: city.Y, kind: 'dest', key: `city:${data.cityDstId || data.cityDst}`,
                       approx: true, market: data.specialJob ? 'special_transport' : (data.jobMarket || null) };
  }
  if (waypoints.length) {
    const last = waypoints[waypoints.length - 1];
    return { x: last.pos[0], z: last.pos[1], kind: 'waypoint', key: 'wp-only' };
  }
  return null;
}

function resetDisplayedRoute() {
  dismissedRouteIdentity = lastData ? routeIdentity(lastData) : null;
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
  renderRouteSummary(null);
  if (typeof convoyOnRouteChanged === 'function') convoyOnRouteChanged();
  sendLiveRoute(true);
}

function renderRouteSummary(view) {
  const panel = document.getElementById('routeSummary');
  if (!panel) return;
  panel.hidden = !view;
  document.getElementById('mapPanel').classList.toggle('hasRouteSummary', !!view);
  keepPanelsClearOfRouteSummary();
  if (!view) return;
  const bar = document.getElementById('routeProgressBar');
  bar.style.width = `${view.percent}%`;
  bar.parentElement.title = `${Math.round(view.percent)}%`;
  document.getElementById('routeRemaining').textContent = view.remaining;
  document.getElementById('routeDuration').textContent = view.duration;
  document.getElementById('routeArrival').textContent = view.arrival;
  // Cuando el destino es el centro de la ciudad y no la empresa, se dice.
  // Un error de ~900 m sin explicacion se lee como un destino equivocado.
  const aviso = document.getElementById('routeApprox');
  if (aviso) {
    const textos = [view.approx ? t('destApprox') : null, view.dlc ? t('dlcRouteNotice') : null].filter(Boolean);
    aviso.hidden = !textos.length;
    if (textos.length) aviso.textContent = textos.join(' ');
  }
}

// Resumen de la ruta arriba del mapa: barra de progreso, lo que falta, el
// tiempo real restante y la hora de llegada estimada (PR #1).
function updateRouteSummary(data) {
  const target = resolveRouteTarget(data);
  if (!target) { routeProgressState = { key: null, total: 0 }; renderRouteSummary(null); return; }
  // Con waypoints propios la distancia del juego no cuenta el desvio: se mide
  // sobre la ruta que dibujamos nosotros.
  const ownKm = currentRouteWorldPoints ? sumPathDistanceMeters(currentRouteWorldPoints) * distanceScale() / 1000 : null;
  const gameKm = Number.isFinite(data.routeDistanceKm) ? Math.max(0, data.routeDistanceKm) : null;
  // El GPS del juego en 0 con una ruta nuestra larga: el juego todavia no
  // tiene ruta (parado en la base, partida recien cargada) y el resumen
  // decia "falta 0 km, llegas ahora" con el giro a 5 km. Cerca del destino
  // las dos dan casi 0, por eso el kilometro de margen.
  const manual = waypoints.some(wp => !wp.inGame) || target.kind === 'waypoint'
    || (!gameKm && ownKm != null && ownKm > 1);
  const remainingKm = manual ? ownKm : gameKm;
  const key = routeIdentity(data) + target.key;
  if (routeProgressState.key !== key) routeProgressState = { key, total: 0 };
  if (remainingKm != null) routeProgressState.total = Math.max(routeProgressState.total, remainingKm);
  if (voiceOn) {
    const arrived = voiceGuide.arrival(key, target.kind, remainingKm, routeProgressState.total);
    if (arrived) speakVoice(arrived);
  }
  const percent = remainingKm == null || routeProgressState.total <= 0 ? 0
    : Math.max(0, Math.min(100, (1 - remainingKm / routeProgressState.total) * 100));
  const seconds = manual
    ? (remainingKm != null && lastKnownAvgSpeedKmh > 0 ? remainingKm / lastKnownAvgSpeedKmh * 3600 : null)
    : (remainingKm === 0 ? 0 : routeSummaryEtaSeconds);
  renderRouteSummary({
    approx: !!target.approx,
    dlc: routeUsesUncheckedDlc,
    percent,
    remaining: remainingKm == null ? '--'
      : `${(useImperial ? remainingKm * KM_TO_MI : remainingKm).toFixed(1)} ${useImperial ? 'mi' : 'km'}`,
    duration: seconds != null && Number.isFinite(seconds) ? formatSeconds(seconds) : '--',
    arrival: seconds != null && Number.isFinite(seconds)
      ? new Date(Date.now() + seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
    return;
  }
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

  if ((destChanged || offRoute) && data.position?.x != null && routeGraph) {
    currentRouteTarget = routeKey;
    navManeuverState.shown = null; navManeuverState.shownKey = null; navManeuverState.candidate = undefined; navManeuverState.candidateTicks = 0;
    routeBehind = [];
    let routePoints = [];
    let from = [data.position.x, data.position.z];
    let complete = true;
    routeUsesUncheckedDlc = false;
    legs.forEach((to, legIdx) => {
      let leg = findRoute(from, to);
      if (leg) {
        if (leg.usesUncheckedDlc) routeUsesUncheckedDlc = true;
        leg = leg.map(p => { const q = p.slice(); q[5] = legIdx; return q; });
        routePoints = routePoints.length ? routePoints.concat(leg.slice(1)) : leg;
      } else { complete = false; routePoints.push([from[0], from[1], 0, 0, null, legIdx], [to[0], to[1], 0, 0, null, legIdx]); }
      from = to;
    });
    if (!routePoints.length) routePoints = null;
    waypointRouteDistanceKm = (routePoints && waypoints.some(wp => !wp.inGame)) ? (sumPathDistanceMeters(routePoints) * distanceScale()) / 1000 : null;
    currentRouteWorldPoints = routePoints;
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

  setMapLoading('mapLoadingCities');
  await loadCities(mapInfo);
  if (conn.spectator || liteNoRouting) {
    // Espectador (convoy / mapa en vivo) o Lite sin ruteo: no rutea ni
    // navega, asi que el grafo (10-25 MB) y los nombres de ruta sobran - el
    // mapa abre en segundos y la pestana no se queda sin memoria.
    routeGraph = null;
    roadNames = [];
  } else {
    setMapLoading('mapLoadingGraph');
    await loadRouteGraph(mapInfo);
    if (liteMode) {
      roadNames = []; // sin nombres de ruta en las indicaciones: 5 MB menos
    } else {
      setMapLoading('mapLoadingNames');
      await loadRoadNames(mapInfo);
    }
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
  map.addSource('vec', { type: 'vector', url: `pmtiles://${mapInfo.pmtilesUrl}?v=${MAP_DATA_VERSION[game] || ''}` });
  // Se insertan justo antes de 'trail-line' para que el trail/ruta/marcadores
  // queden siempre por encima del mapa base. try/catch por capa: si una sola
  // definicion tiene un error, que no tumbe a las demas (ya paso una vez con
  // las capas de texto por faltar 'glyphs' en el estilo).
  for (const layer of buildVecLayers(mapInfo.sourceLayer)) {
    try { map.addLayer(layer, 'trail-line'); } catch (err) { console.error('No se pudo agregar la capa', layer.id, err); }
  }
  setAtlasData();
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
  setMapLoading('mapLoadingTiles');
  let cleared = false;
  const clear = () => { if (!cleared) { cleared = true; setMapLoading(null); } };
  map.once('idle', clear);
  setTimeout(clear, 4000);
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
    map.jumpTo(navMode ? { center: truckMarker.getLngLat() } : { center: truckMarker.getLngLat(), bearing: 0 });
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
const NAV_TURN_DEBOUNCE_TICKS = 2; // una indicacion nueva tiene que verse 2 ticks seguidos (anti-parpadeo al pasar salidas)
const navManeuverState = {};
let routeBehind = []; // ultimos puntos de la ruta ya recorridos (ver trimRouteBehindTruck)
// Cuantos: con los puntos de la curva entre nodo y nodo, tienen que alcanzar
// para un cruce entero (hasta 100 m) mas el tramo de entrada.
const ROUTE_BEHIND_MAX = 32;
const NAV_JUNCTION_CLUSTER_GAP_M = 50; // nodos de cruce mas cerca que esto son el mismo cruce (prefab)
const NAV_JUNCTION_CLUSTER_SPAN_M = 100; // y el cruce entero no mide mas que esto
const NAV_ROAD_NAME_MAX_DIST_M = 400; // radio de busqueda del cartel de ruta mas cercano al tramo del giro

// Vista 3D (inclinacion de camara) en modo navegacion, persistida. En nav el
// camion se ubica en el tercio inferior de la pantalla (padding) para ver mas
// camino adelante, con o sin 3D.
let nav3d = !liteMode && (_savedSettings.nav3d || false);
function navPadding() {
  const h = map ? map.getContainer().clientHeight : 0;
  // Rellenar ARRIBA desplaza el centro hacia abajo: el camion queda en el
  // tercio inferior y se ve mas camino adelante.
  return navMode ? { top: Math.round(h * 0.45), bottom: 0, left: 0, right: 0 } : { top: 0, bottom: 0, left: 0, right: 0 };
}
function applyNavCamera() {
  if (!map) return;
  if (navMode) {
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
function findUpcomingTurn() {
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
  const graph = routeGraph ? { nodes: routeGraph.nodes, nodeXY: routeGraph.nodeXY, adjacency: routeGraph.adjacency } : {};
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

  // Se arranca por los nodos ya pasados: si el camion esta adentro de un
  // cruce, el grupo se arma entero y su giro se reconoce como ya hecho. Si
  // se empezara por el primer nodo de adelante, la mitad que queda de una
  // esquina se anunciaba como otro giro.
  let prevTurn = null; // ultimo giro visto, aunque ya haya quedado atras (ver continuesTurn)
  let roundaboutLeftM = -Infinity; // donde se salio de la ultima rotonda (metros sobre la ruta)
  const roundaboutAt = (i, iEnd) => graph.adjacency
    ? detectRoundabout({ pts, cum, i, iEnd, adjacency: graph.adjacency, nodeAt: graph.nodeXY, edgeLine, bearingBetween }) : null;
  for (let i = 1; i < pts.length - 1; i++) {
    if (cum[i] - cum[here] > NAV_TURN_LOOKAHEAD_M) break;
    if (pts[i][2] === 1) break; // tramo de ferry/tren: lo que hay del otro lado se anuncia alla
    if (pts[i][3] !== 1) continue; // no es interseccion: una curva no es un giro
    const iEnd = junctionClusterEnd(pts, cum, i, NAV_JUNCTION_CLUSTER_GAP_M, NAV_JUNCTION_CLUSTER_SPAN_M);
    // Rotonda: se anuncia la salida ("tomar la segunda salida") en la entrada
    // y se calla todo lo de adentro hasta salir. Adentro, la distancia es a la
    // salida; la clave (node) sigue siendo la entrada, asi no cambia el aviso.
    const rb = roundaboutAt(i, iEnd);
    if (rb) {
      prevTurn = null;
      roundaboutLeftM = cum[rb.leave];
      if (cum[rb.leave] > cum[here]) {
        const inside = cum[rb.enter] <= cum[here];
        const after = Math.min(rb.leave + 2, pts.length - 1);
        const delta = normDeg(bearingBetween(pts[rb.leave], pointAt(cum[rb.leave] + NAV_TURN_LEG_M))
          - bearingBetween(pointAt(cum[rb.enter] - NAV_TURN_LEG_M), pts[rb.enter]));
        return {
          kind: 'roundabout', exit: rb.exit, direction: delta > 0 ? 'right' : 'left',
          distanceMeters: Math.max(0, cum[inside ? rb.leave : rb.enter] - cum[here]),
          nearSign: nearestRoadName(pts[after][0], pts[after][1], NAV_ROAD_NAME_MAX_DIST_M),
          node: [pts[rb.enter][0], pts[rb.enter][1]],
        };
      }
      i = Math.max(iEnd, rb.leave);
      continue;
    }
    const ctx = { pts, cum, pointAt, bearingBetween, nodes: graph.nodes, nodeXY: graph.nodeXY, adjacency: graph.adjacency,
      turnThreshold: NAV_TURN_ANGLE_THRESHOLD_DEG, legM: NAV_TURN_LEG_M, forkLegM: NAV_FORK_LEG_M };
    let m = detectManeuver({ ...ctx, i, iEnd });
    if (m && m.kind === 'fork') {
      // La bifurcacion se mide a 250 m: si en ese tramo hay un cruce con un
      // giro de verdad, lo que "se desvia" es ese giro, no una rampa - se
      // deja que el giro se anuncie por si mismo (una esquina de 90 grados
      // avisada como "keep left" 200 m antes confundia).
      for (let j = iEnd + 1; j < pts.length - 1 && cum[j] - cum[iEnd] <= NAV_FORK_LEG_M; j++) {
        if (pts[j][3] !== 1) continue;
        const jEnd = junctionClusterEnd(pts, cum, j, NAV_JUNCTION_CLUSTER_GAP_M, NAV_JUNCTION_CLUSTER_SPAN_M);
        const mj = detectManeuver({ ...ctx, i: j, iEnd: jEnd, adjacency: null });
        if (mj && mj.kind === 'turn') { m = null; break; }
        j = jEnd;
      }
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
    if (m && cum[m.at != null ? m.at : i] <= cum[here]) m = null; // ya pasado
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
      // Nombre de ruta del tramo AL QUE se gira (no del que se viene), buscando
      // cerca del punto de mundo un poco despues del giro - asi el cartel del
      // cruce mismo (que suele estar justo en el vertice) no interfiere.
      const afterTurnIdx = Math.min(iEnd + 2, pts.length - 1);
      const [wx, wz] = pts[afterTurnIdx];
      const nearSign = nearestRoadName(wx, wz, NAV_ROAD_NAME_MAX_DIST_M);
      return { distanceMeters: cum[at] - cum[here], direction: m.direction, kind: m.kind, nearSign, node: [pts[at][0], pts[at][1]] };
    }
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
const PIP_CSS = `
  html, body { margin: 0; height: 100%; background: #14171c; color: #f2f3f5;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif; overflow: hidden; }
  .pip { box-sizing: border-box; height: 100%; padding: 0.6rem 0.8rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .giro { font-size: clamp(1rem, 6.5vw, 2.4rem); font-weight: 700; line-height: 1.15; flex: 1; display: flex;
    flex-direction: column; justify-content: center; }
  .giro .navNext { display: block; font-size: 0.5em; font-weight: 400; color: #9aa4b2; margin-top: 0.2rem; }
  .fila { display: flex; align-items: center; gap: 0.9rem; font-variant-numeric: tabular-nums; }
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
`;

function pipSupported() {
  return 'documentPictureInPicture' in window;
}

async function openPip() {
  if (pipWin) { try { pipWin.focus(); } catch (err) { /* nada */ } return; }
  try {
    pipWin = await documentPictureInPicture.requestWindow({ width: 380, height: 160 });
  } catch (err) {
    console.error('No se pudo abrir la ventana flotante', err);
    pipWin = null;
    return;
  }
  const d = pipWin.document;
  d.title = 'Truck Dash';
  const estilo = d.createElement('style');
  estilo.textContent = PIP_CSS;
  d.head.appendChild(estilo);
  d.body.innerHTML = `<div class="pip">
      <div class="giro" id="pGiro"></div>
      <div class="fila">
        <div class="lim" id="pLim" hidden></div>
        <div class="vel"><b id="pVel">--</b><span id="pUnidad"></span></div>
        <div class="dato"><b id="pFalta">--</b><span>${escapeHtml(t('routeRemainingLabel'))}</span></div>
        <div class="dato"><b id="pLlega">--</b><span>${escapeHtml(t('routeArrivalLabel'))}</span></div>
      </div>
    </div>`;
  pipWin.addEventListener('pagehide', () => { pipWin = null; });
  refreshPip();
}

function refreshPip() {
  if (!pipWin) return;
  const d = pipWin.document;
  const $ = (id) => document.getElementById(id);
  const giro = d.getElementById('pGiro');
  if (!giro) return;
  giro.innerHTML = pipTurnHtml || escapeHtml(t('navNoRoute'));
  d.getElementById('pVel').textContent = $('miniSpeedBig').textContent;
  d.getElementById('pUnidad').textContent = $('miniSpeedUnitLabel').textContent;
  const limite = $('miniLimitSign').textContent.trim();
  const lim = d.getElementById('pLim');
  lim.hidden = !limite || limite === '--';
  lim.textContent = limite;
  const vel = parseFloat($('miniSpeedBig').textContent);
  lim.classList.toggle('pasado', !lim.hidden && Number.isFinite(vel) && vel > parseFloat(limite) + 2);
  const resumen = !$('routeSummary').hidden;
  d.getElementById('pFalta').textContent = resumen ? $('routeRemaining').textContent : '--';
  d.getElementById('pLlega').textContent = resumen ? $('routeArrival').textContent : '--';
}

function initPip() {
  const btn = document.getElementById('pipBtn');
  if (!btn || !pipSupported()) return;
  btn.style.display = '';
  btn.addEventListener('click', openPip);
}

function updateNavPanel(turn) {
  if (lastData && dismissedRouteIdentity === routeIdentity(lastData)) {
    document.getElementById('navPanel').style.display = 'none';
    return;
  }
  const panel = document.getElementById('navPanel');
  panel.innerHTML = navPanelHtml(turn);
  panel.style.display = 'block';
}

// El texto del proximo giro: lo usan el panel de navegacion, la ventana
// flotante y el overlay del cliente (los dos ultimos lo muestran aunque el
// modo navegacion este apagado). Texto plano: cada uno lo escapa o lo pinta.
function navTurnParts(turn) {
  const next = nextCityName ? `${t('navNextCity')}: ${nextCityName}` : '';
  if (turn && turn.kind === 'roundabout') {
    // "Rotonda en 300 m: tomar la segunda salida". Mas alla de la octava, el numero.
    const ords = t('navOrdinals').split(',');
    const n = ords[turn.exit - 1] || String(turn.exit);
    const dist = formatTurnDistance(turn.distanceMeters * distanceScale(), useImperial);
    let ontoText = '';
    if (turn.nearSign) ontoText = ` ${turn.nearSign.kind === 'city' ? t('navToward') : t('navOnto')} ${turn.nearSign.label}`;
    return { text: `↻ ${t('navRoundaboutIn').replace('{d}', dist).replace('{n}', n)}${ontoText}`, next };
  }
  if (turn) {
    const fork = turn.kind === 'fork';
    const arrow = fork ? (turn.direction === 'left' ? '↖' : '↗') : (turn.direction === 'left' ? '↰' : '↱');
    const dirText = fork
      ? (turn.direction === 'left' ? t('navKeepLeft') : t('navKeepRight'))
      : (turn.direction === 'left' ? t('navTurnLeft') : t('navTurnRight'));
    let ontoText = '';
    if (turn.nearSign) {
      const preposition = turn.nearSign.kind === 'city' ? t('navToward') : t('navOnto');
      ontoText = ` ${preposition} ${turn.nearSign.label}`;
    }
    return { text: `${arrow} ${dirText}${ontoText} ${t('navIn')} ${formatTurnDistance(turn.distanceMeters * distanceScale(), useImperial)}`, next };
  }
  if (currentRouteWorldPoints) return { text: `⬆ ${t('navStraight')}`, next };
  return null;
}

function navPanelHtml(turn) {
  const parts = navTurnParts(turn);
  if (!parts) return escapeHtml(t('navNoRoute'));
  return escapeHtml(parts.text) + (parts.next ? `<span class="navNext">${escapeHtml(parts.next)}</span>` : '');
}

// ---------------------------------------------------------------------------
// Overlay en el juego (client/overlay.py): el cliente dibuja una ventanita
// arriba del juego con la velocidad y el limite, que lee el mismo. El giro,
// la proxima ciudad, lo que falta y la llegada los calcula esta pagina, asi
// que se los manda como texto ya traducido. Solo si el cliente avisa en
// client_status que lo tiene prendido; por el relay o directo en LAN. Cada
// vez que cambia y, si no cambia, cada 3 s: el cliente saca el giro si pasan
// 6 s sin noticias (pestana cerrada, celular bloqueado).
// ---------------------------------------------------------------------------
let clientOverlayOn = false;
let overlayTurnParts = null; // lo arma updateMap en cada dato
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
  if (!clientOverlayOn || conn.demo || conn.spectator || !ws || ws.readyState !== WebSocket.OPEN) return;
  const $ = (id) => document.getElementById(id);
  const resumen = !$('routeSummary').hidden;
  const msg = {
    type: 'nav_hud',
    turn: overlayTurnParts ? overlayTurnParts.text : '',
    next: overlayTurnParts ? overlayTurnParts.next : '',
    remaining: resumen ? $('routeRemaining').textContent.trim() : '',
    arrival: resumen ? $('routeArrival').textContent.trim() : '',
    // Todas las etiquetas del overlay salen de aca, en el idioma del
    // tablero: si no, el giro salia en un idioma y las llegadas en el de
    // Windows.
    remainingLabel: t('routeRemainingLabel'),
    arrivalLabel: t('overlayArrivalReal'),
    gameArrivalLabel: t('overlayArrivalGame'),
    imperial: !!useImperial,
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
  if (!clientOverlayOn) overlayTurnParts = null;
}

// ---------------------------------------------------------------------------
// Guia por voz. Que decir y cuando lo decide createVoiceGuide (pure.js); aca
// solo se carga la voz y se reproduce. Las voces y frases estan en
// voice/voices.json; cada voz es un paquete con un MP3 por frase
// (tools/build_voice_packs.py). Turco no tiene voz con licencia libre: lee el
// mismo texto con la voz del sistema, que en estas frases no tiene nombres
// que pronunciar mal (por eso se habia sacado la voz anterior, 18-09).
// ---------------------------------------------------------------------------
const voiceGuide = createVoiceGuide();
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
    voiceAudio.play().catch(() => {});
    if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
  } catch (e) { /* sin audio: la guia queda muda */ }
}

async function speakVoice(key) {
  const catalog = await loadVoiceCatalog();
  const voice = currentVoice();
  if (!catalog || !voice) return;
  if (voice.system) {
    const text = (catalog.phrases[voice.phrases] || {})[key];
    if (!text || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice.lang;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    return;
  }
  const pack = await loadVoicePack(voice);
  const src = pack && pack.clips && pack.clips[key];
  if (!src) return;
  if (!voiceAudio) voiceAudio = new Audio();
  voiceAudio.src = src;
  voiceAudio.play().catch(() => {});
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
  if (key) speakVoice(key);
}

if (voiceOn) loadVoiceCatalog().then(() => loadVoicePack(currentVoice()));

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
  const scale = Math.max(0.8, Math.min(1.3, 1 + (map.getZoom() - NAV_FIXED_ZOOM) * 0.12));
  truckArrowEl.style.transform = `scale(${scale})`;
}

function navTargetZoom(turn) {
  return nav3d ? navZoom + 0.7 : navZoom;
}

// Recorta del frente de la ruta calculada (linea roja) el tramo ya recorrido,
// proyectando la posicion actual sobre la polilinea y descartando los puntos
// anteriores - asi no queda roja debajo de la azul (trail) ya recorrida.
// Proxima ciudad sobre la ruta: la primera cuyo centro queda a menos de
// NEXT_CITY_RADIUS_M de la ruta (muestreada), salvo la que ya estamos
// atravesando. Se recalcula cada pocos segundos, no por tick.
const NEXT_CITY_RADIUS_M = 2500;
let nextCityName = null;
let nextCityComputedAt = 0;
function updateNextCity(x, z) {
  const now = performance.now();
  if (now - nextCityComputedAt < 4000) return;
  nextCityComputedAt = now;
  let found = null;
  if (currentRouteWorldPoints && currentRouteWorldPoints.length > 1) {
    const pts = currentRouteWorldPoints;
    const step = Math.max(1, Math.floor(pts.length / 400));
    let bestIdx = Infinity;
    for (const c of citiesAll) {
      if (Math.hypot(c.X - x, c.Y - z) < 2000) continue; // ciudad actual
      for (let i = 0; i < pts.length; i += step) {
        if (i >= bestIdx) break;
        if (Math.hypot(pts[i][0] - c.X, pts[i][1] - c.Y) < NEXT_CITY_RADIUS_M) { bestIdx = i; found = c.Name; break; }
      }
    }
  }
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
  for (let k = 1; k <= bestIdx; k++) routeBehind.push(currentRouteWorldPoints[k]);
  if (routeBehind.length > ROUTE_BEHIND_MAX) routeBehind.splice(0, routeBehind.length - ROUTE_BEHIND_MAX);
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
      && !insideMapBounds(mapBounds, position.x, position.z)) {
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
  const guiando = navMode || !!pipWin || clientOverlayOn;
  const turn = guiando ? stabilizeManeuver(navManeuverState, findUpcomingTurn(), NAV_TURN_DEBOUNCE_TICKS) : null;
  if (guiando) voiceManeuverTick(turn);
  if (pipWin) pipTurnHtml = navPanelHtml(turn);
  if (clientOverlayOn) overlayTurnParts = navTurnParts(turn);
  if (navMode && !autoFollow) {
    // El usuario esta tocando el mapa (arrastrar, pellizcar, rotar): la
    // camara no se toca hasta que scheduleMapFollow vuelva a engancharla.
    // Sin esto, cada tick disparaba un easeTo que cancelaba el gesto y el
    // pellizco para hacer zoom no llegaba a agarrar.
    updateNavPanel(turn);
  } else if (navMode) {
    updateNavPanel(turn);
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
    lines.push(`${t('distanceLeft')}: ${distDisplay.toFixed(1)} ${useImperial ? 'mi' : 'km'}`);
  }
  const rest = miniHudSettings.rest ? restInfo(data) : null;
  if (rest) lines.push(`${t('nextRest')}: ${rest.text}`);
  if (miniHudSettings.gps && navMode) {
    const navText = document.getElementById('navPanel').textContent;
    if (navText) lines.push(navText);
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
  const hh = String(clock.hours).padStart(2, '0');
  const mm = String(clock.minutes).padStart(2, '0');
  document.getElementById('gameClock').textContent = `${day} ${hh}:${mm}`;
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
  document.getElementById('gaugeOdometer').textContent = odo != null ? `${Math.round(useImperial ? odo * KM_TO_MI : odo).toLocaleString()} ${useImperial ? 'mi' : 'km'}` : '-';
  const gaugeRangeKm = fuelFigures(data).rangeKm;
  document.getElementById('gaugeRange').textContent = gaugeRangeKm != null ? `⛽ ${Math.round(useImperial ? gaugeRangeKm * KM_TO_MI : gaugeRangeKm)} ${useImperial ? 'mi' : 'km'}` : '-';
  const cc = document.getElementById('gaugeCruise');
  cc.style.display = data.cruiseControl ? '' : 'none';
  document.getElementById('gaugeCruiseValue').textContent = Math.round(useImperial ? data.cruiseControlSpeedKmh * KM_TO_MI : data.cruiseControlSpeedKmh);
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

  document.getElementById('citySrc').textContent = data.citySrc || '?';
  document.getElementById('cityDst').textContent = data.cityDst || '?';
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
  if (data.cargo) {
    const cargoWeightText = data.cargoMassKg ? ` (${(data.cargoMassKg / 1000).toFixed(1)} TN)` : '';
    document.getElementById('cargo').textContent = `${data.cargo}${cargoWeightText}`;
  } else {
    document.getElementById('cargo').textContent = t('noCargo');
  }

  const etaText = formatSeconds(data.routeTimeSeconds);
  if (data.routeDistanceKm) {
    const distDisplay = useImperial ? data.routeDistanceKm * KM_TO_MI : data.routeDistanceKm;
    document.getElementById('etaGame').textContent = `${etaText} (${distDisplay.toFixed(1)} ${useImperial ? 'mi' : 'km'})`;
  } else {
    document.getElementById('etaGame').textContent = etaText;
  }

  const jobDeadlineRow = document.getElementById('jobDeadlineRow');
  if (data.jobDeadlineSeconds != null) {
    jobDeadlineRow.hidden = false;
    const deadlineEl = document.getElementById('jobDeadline');
    deadlineEl.textContent = formatSeconds(Math.max(0, data.jobDeadlineSeconds));
    deadlineEl.classList.toggle('over', data.jobDeadlineSeconds <= 0);
  } else {
    jobDeadlineRow.hidden = true;
  }

  updateWaypointRoute(data);
  updateGameClock(data.gameTimeMinutes);
  const realEtaSeconds = computeRealEtaSeconds(data);
  routeSummaryEtaSeconds = realEtaSeconds;
  document.getElementById('etaReal').textContent = realEtaSeconds != null ? formatSeconds(realEtaSeconds) : t('calculating');

  // Proximo descanso obligatorio, con la fatiga (ver restInfo).
  const rest = restInfo(data);
  const restRow = document.getElementById('restStopRow');
  if (rest) {
    restRow.hidden = false;
    const realSec = (rest.min * 60) / measuredTimeScale(data);
    document.getElementById('restStop').innerHTML = `${escapeHtml(rest.text)}<span class="subValue">≈ ${escapeHtml(formatSeconds(realSec))} ${escapeHtml(t('realShort'))}</span>`;
  } else {
    restRow.hidden = true;
  }

  document.getElementById('jobIncome').innerHTML = data.jobIncome ? moneyHtml(data.jobIncome, data.game) : '-';

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
      ? `${(235.215 / ff.avg).toFixed(1)} mpg`
      : `${ff.avg.toFixed(1)} L/100km`;
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
    if (kind === 'xp') return `+${Math.round(v).toLocaleString()} XP`;
    if (kind === 'km') return `${Math.round(useImperial ? v * 0.621371 : v).toLocaleString()} ${useImperial ? 'mi' : 'km'}`;
    if (kind === 'minutes') return escapeHtml(formatGameMinutes(v, t('hourShort'), t('minShort')));
    if (kind === 'percent') return `${v < 10 && v > 0 ? v.toFixed(1) : Math.round(v)}\u00a0%`;
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
    recordTrip(event);
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
const WEB_BUILD = '20260918';
function buildIssueUrl() {
  const lines = [
    '**What happened?**', '', '(describe the problem here)', '', '**Steps to reproduce**', '', '1. ', '',
    '---', '<details><summary>Diagnostics (auto-filled)</summary>', '',
    `- Web build: ${WEB_BUILD}`,
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

function renderTripHistory() {
  const list = document.getElementById('tripHistoryList');
  if (!list) return;
  const trips = loadTrips();
  if (!trips.length) { list.innerHTML = `<div class="tripEmpty">${t('tripHistoryEmpty')}</div>`; return; }
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  list.innerHTML = trips.map(tr => {
    const dist = useImperial ? `${Math.round(tr.distanceKm * KM_TO_MI)} mi` : `${tr.distanceKm} km`;
    const date = new Date(tr.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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

function toggleCommandsDrawer() {
  document.getElementById('layout').classList.toggle('commandsHidden');
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

// La flechita de "hay mas swipeando" en el panel de info (vertical) se
// esconde apenas el usuario ya descubrio que puede swipear, para no
// insistir con la animacion todo el rato.
document.getElementById('panelSwipe').addEventListener('scroll', () => {
  document.getElementById('swipeHint').style.display = 'none';
}, { once: true });

document.getElementById('fullscreenBtn').addEventListener('click', () => {
  document.body.classList.toggle('fsMode');
  // La Fullscreen API real (esconde tambien la barra de URL en el celular)
  // es un extra sobre ocultar el header - si el navegador no la deja usar
  // (algunos webviews la bloquean) el modo fsMode sigue funcionando igual.
  if (document.body.classList.contains('fsMode')) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else if (document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
  }
});

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) document.body.classList.remove('fsMode');
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

document.getElementById('routeResetBtn').addEventListener('click', resetDisplayedRoute);
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
const conn = { socket: 'idle', clientConnected: null, clientStatus: null, paused: false, invalidCode: false, hasTelemetry: false, local: false, demo: false, everOpen: false, everValid: false, spectator: false, waitingClient: false };

function connectionView() {
  return connectionViewFor(conn);
}

// Pantalla encendida mientras la app esta en uso como GPS (Wake Lock API).
// Sin esto el celular se apaga a los 30 s y hay que estar tocandolo. Se pide
// cuando hay sesion (cualquier estado que no sea idle) y se vuelve a pedir
// al volver a primer plano (el navegador lo suelta al ocultar la pestana).
// Silencioso si el navegador no lo soporta o lo rechaza (bateria baja).
let wakeLock = null;
async function updateWakeLock(wanted) {
  if (!('wakeLock' in navigator)) return;
  try {
    if (wanted && !wakeLock && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!wanted && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) {
    wakeLock = null;
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && conn.socket !== 'idle') updateWakeLock(true);
  if (document.visibilityState === 'visible') reopenIfStale();
});

// Socket medio abierto: con el celular bloqueado o al cambiar de WiFi la
// conexion muere sin que llegue onclose, y el tablero quedaba congelado
// diciendo "en vivo" y con los botones mudos (auditoria del 10-10). Al volver
// a la pestana o a la red, si hace rato que no llega nada, se reconecta.
const WS_STALE_MS = 10000;
let lastWsMessageAt = 0;
function reopenIfStale() {
  if (!ws || ws.readyState !== WebSocket.OPEN || !conn.hasTelemetry || !conn.reopen) return;
  if (Date.now() - lastWsMessageAt < WS_STALE_MS) return;
  const old = ws;
  old.onclose = null;
  try { old.close(); } catch (e) {}
  clearTimeout(reconnectTimer);
  conn.reopen();
}
window.addEventListener('online', reopenIfStale);

function renderConnectionUi() {
  const view = connectionView();
  updateWakeLock(!!view);
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

function handleTelemetry(data) {
  trackFuel(data);
  if (pipWin) setTimeout(refreshPip, 0); // despues de que el tablero se actualice
  if (clientOverlayOn) setTimeout(sendNavHud, 0); // idem
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
  checkUpdateBanner(data.clientVersion);
  if (typeof convoyOnTelemetry === 'function') convoyOnTelemetry(data); // Convoy: variante de mapa, ruta, seguir al lider
  // Si cambio la variante de mapa efectiva (ej. activaste ProMods a
  // mitad de sesion), hay que avisarle al backend para que reagrupe bien.
  if (liveShareEnabled && !conn.local && data.game && resolveEffectiveGame(data.game) !== lastSentMapVariant) { sendLiveShareState(); sendLiveRoute(true); }
}

function connectWs(backend, code, options = {}) {
  conn.local = !!options.local;
  renderLiveShareForLan();
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
    if (data.type === 'live_share_state') { if (!conn.local) applyLiveShareState(data.enabled); return; }
    if (data.type === 'command_result') { handleCommandResult(data); return; } // no es telemetria
    if (data.type && data.type.startsWith('convoy_')) { if (typeof convoyHandleMessage === 'function') convoyHandleMessage(data); return; } // Convoy (beta)
    if (data.type === 'session_state') {
      conn.clientConnected = !!data.client_connected;
      if (data.client_status) conn.clientStatus = data.client_status;
      setClientOverlay(data.client_status && data.client_status.overlay);
      if (data.client_status) applyDetectedDlcs(data.client_status.mapDlcs);
      if (data.client_status) applyLocalMaps(data.client_status.localMaps, data.client_status.localMapPort);
      if (!conn.clientConnected) conn.hasTelemetry = false;
      renderConnectionUi();
      return;
    }
    if (data.type === 'client_status') {
      conn.clientConnected = true;
      conn.clientStatus = data; // incluye .detail si el cliente lo manda
      setClientOverlay(data.overlay);
      if (data.activeMods !== undefined) detectedModNames = data.activeMods;
      applyDetectedDlcs(data.mapDlcs);
      applyLocalMaps(data.localMaps, data.localMapPort);
      const mapMods = data.mapMods === undefined ? undefined : holdDetectedMods(detectedMods, data.mapMods);
      if (mapMods !== undefined && JSON.stringify(mapMods) !== JSON.stringify(detectedMods)) {
        detectedMods = mapMods;
        if (modsAuto && lastData && currentGame && resolveEffectiveGame(lastData.game) !== currentGame) currentGame = null; // recarga con la variante detectada
        if (document.getElementById('modsModal').style.display === 'flex') initModsUi();
      }
      if (data.status !== 'live') conn.hasTelemetry = false;
      renderConnectionUi();
      checkUpdateBanner(data.clientVersion);
      return;
    }
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

if (!lsGet('truckdash_tour_seen')) {
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
  // Sin tope, si los datos del mapa no llegaban la demo esperaba para
  // siempre sin decir nada.
  const giveUpAt = Date.now() + 30000;
  // Los POIs dan las empresas de origen y destino; si tardan, la demo arranca
  // igual entre los centros de las ciudades.
  const poisUntil = Date.now() + 8000;
  const waitAssets = () => {
    if (mapUnavailable) return; // sin WebGL no hay mapa ni ruta: el cartel lo explica
    if (!mapReady || !routeGraph || !citiesByName[DEMO_ROUTE.from] || !citiesByName[DEMO_ROUTE.to] || !truckMarker
        || (!pois && Date.now() < poisUntil)) {
      if (Date.now() > giveUpAt) { showToast('Demo route unavailable', 'danger'); return; }
      demoTimer = setTimeout(waitAssets, 500);
      return;
    }
    runDemo();
  };
  waitAssets();
}

function runDemo() {
  // De empresa a empresa, las mismas que manda la telemetria: si el camion
  // fuera al centro de la ciudad, la ruta dibujada (a la empresa) y el
  // recorrido de la demo se separarian al final.
  const a = citiesByName[DEMO_ROUTE.from], b = citiesByName[DEMO_ROUTE.to];
  const ini = findCompanyPoi(DEMO_ROUTE.companyFromId, DEMO_ROUTE.fromId);
  const fin = findCompanyPoi(DEMO_ROUTE.companyToId, DEMO_ROUTE.toId);
  const path = findRoute(ini ? [ini.x, ini.z] : [a.X, a.Y], fin ? [fin.x, fin.z] : [b.X, b.Y]);
  if (!path || path.length < 2) { showToast('Demo route unavailable', 'danger'); return; }
  const total = sumPathDistanceMeters(path);

  const pointAt = (dist) => {
    let acc = 0;
    for (let i = 1; i < path.length; i++) {
      const seg = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      if (acc + seg >= dist) {
        const f = seg ? (dist - acc) / seg : 0;
        return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * f, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * f];
      }
      acc += seg;
    }
    return path[path.length - 1];
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
    const [x, z] = pointAt(dist);
    data.position = { x, y: 0, z };
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

function ensureDashPanel() {
  if (dashPanel) return dashPanel;
  dashPanel = createDashPanel({
    root: document.getElementById('dashOverlayPanel'),
    money: moneyLine,       // con la conversion a la moneda local del usuario
    imperial: () => useImperial,
    lang: () => currentLang,
  });
  dashPanel.setVisible(false);
  dashPanel.applyTranslations();
  setDashScale(lsGet(DASH_SCALE_KEY) || '1');
  return dashPanel;
}

function setDashScale(valor) {
  document.getElementById('dashOverlayPanel').style.setProperty('--d-scale', valor);
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

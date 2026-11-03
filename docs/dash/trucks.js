// Tableros de camion (03-11): tres estilos mas del tablero, cada uno a la
// manera de una familia de cuadros de los camiones del juego. El pedido traia
// dos referencias: los skins del servidor de telemetria de Funbit (fotos de
// tableros de verdad, uno por marca) y el widget pago de Respawn Icons.
//
//  - euro: dos relojes grandes con la pantalla en el medio, como casi todos
//    los de ETS2 (Scania, Volvo FH, DAF XF, Actros, TGX, Renault T).
//  - digital: una pantalla entera, como los cuadros nuevos (Volvo FH 2021,
//    Actros, DAF XG).
//  - american: relojes blancos con aro cromado y los testigos arriba, como
//    los de ATS (Peterbilt 389, Kenworth W900).
//
// No son copias. En el juego los relojes son parte del modelo 3D de la
// cabina: no hay una imagen de cada cuadro sino atlas de numeros, rotulos e
// iconos pegados sobre la geometria, y son de SCS con los logos de las
// marcas adentro. Se miraron como referencia (que relojes tiene cada familia,
// sus escalas, los rotulos de los americanos: "OIL PSI", "AIR", "DEF") y se
// dibujaron de cero, sin marcas.
//
// Cada cuadro es un solo SVG con dos disposiciones, apaisada y vertical, y se
// queda con la que llena mas del lugar que le toca: los relojes no se
// deforman y entran en un telefono parado. Abajo va una franja HTML con el
// trabajo, que en vertical se acomoda sola en dos renglones.
//
// Tambien va en la vista del mapa (mapDashHosts en pure.js): embedded es el
// cuadro entero en un lugar fijo, sin la franja del trabajo (la app ya la
// tiene). Con mapHole ('middle', 'left' o 'right') queda un hueco para el
// mapa: entre los relojes, que se separan, o a un costado del cuadro, como
// la pantalla grande de algunos camiones. La app pone el mapa encima (onHole
// le dice donde queda en la pantalla), y debajo queda la pantalla de
// siempre, que se ve cuando la app saca el mapa.
//
// Misma interfaz que createDashPanel y createClassicDash, mas destroy().
// Necesita dash.js (DASH_ICONS, DASH_NOMINAL_SCALE) y pure.js
// (truckDashLamps, truckGaugeScales, MAP_DASH_STYLES, gaugeAngle y los
// estimadores de siempre).

const TRUCK_LAYOUTS = MAP_DASH_STYLES;
const TD_NS = 'http://www.w3.org/2000/svg';
const TD_KM_TO_MI = 0.621371;
const TD_PSI_TO_BAR = 0.0689476;
// Barrido de las agujas al arrancar, como en el clasico.
const TD_SWEEP_MS = 650;
// Ancho de cada testigo en su fila, en unidades de la fila.
const TD_LAMP_STEP = 34;
// Pantallas de 32:9 (una tira de 2560 x 720, como la Xeneon Edge): desde este
// ancho sobre alto el cuadro va al medio con un panel a cada lado.
const TD_ULTRA_RATIO = 3;
const TD_SIDE_W = 320;
// Lo que dibuja un tablero embebido antes del primer dato: agujas en cero y
// los testigos apagados, para que se vea y se pueda acomodar.
const TD_MUESTRA = { speedKmh: 0, engineRpm: 0, gear: 0, oilPressure: 0, waterTemperature: 40, oilTemperature: 40,
                     airPressure: 0, brakeTemperature: 0, batteryVoltage: 24, fuel: 0, fuelCapacity: 1,
                     adblue: 0, adblueCapacity: 1 };
// Hay mas de un tablero del mismo estilo en la pagina (el de pantalla
// completa y el del mapa): los ids de los degradados llevan un numero.
let tdInstancias = 0;

// Iconos que la botonera no tiene: las alertas mecanicas y lo de la pantalla.
const TD_ICONS = {
  battery: '<rect x="3" y="7.5" width="18" height="11" rx="1.5"/><path d="M6.5 7.5V5.5h3v2M14.5 7.5V5.5h3v2M6.5 13h3.5M14 13h3.5M15.75 11.25v3.5"/>',
  oilPressure: '<path d="M2.5 11.5l3 1.2h3l2-2h6.5l5-2.2-5.7 7H8.5l-1.6-1.8H3.5z"/><path d="M11 10.7V8.5M8.6 8.5h4.8"/><path d="M20.8 16.4c0 .9-.4 1.5-.9 1.5s-.9-.6-.9-1.5.4-1.4.9-2.3c.5.9.9 1.4.9 2.3z"/>',
  waterTemp: '<path d="M12 3v9.5"/><circle cx="12" cy="15" r="2.4"/><path d="M12 6h3M12 9h3"/><path d="M3.5 20.5c1.4-1 2.8-1 4.2 0s2.8 1 4.3 0 2.8-1 4.3 0 2.8 1 4.2 0"/>',
  airPressure: '<circle cx="12" cy="12" r="6.2"/><path d="M12 8.7v3.8"/><circle cx="12" cy="15.3" r="0.4" fill="currentColor"/><path d="M4.3 6.8a9.5 9.5 0 0 0 0 10.4M19.7 6.8a9.5 9.5 0 0 1 0 10.4"/>',
  fuelLow: '<path d="M5 20.5V5a1.2 1.2 0 0 1 1.2-1.2h6.6A1.2 1.2 0 0 1 14 5v15.5M3.5 20.5h12M7 8h5"/><path d="M14 10.5h1.8a1.4 1.4 0 0 1 1.4 1.4V16a1.3 1.3 0 0 0 2.6 0V8.2L17.5 6"/>',
  adblueLow: '<path d="M12 3.5c3.3 4.3 5.7 7.3 5.7 10.3a5.7 5.7 0 0 1-11.4 0c0-3 2.4-6 5.7-10.3z"/><path d="M9.3 14.6c.4 1.4 1.3 2.2 2.6 2.4"/>',
  cruise: '<path d="M4.5 17a8 8 0 1 1 15 0"/><path d="M12 13l3.6-3.6"/><circle cx="12" cy="13.2" r="1.1"/><path d="M8.5 20.5h7"/>',
  flag: '<path d="M5.5 21V3.5M5.5 4h11.5l-2.4 3.7L17 11.5H5.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  bed: '<path d="M3 18.5v-11M3 14h18v4.5M21 14v-2.4A2.6 2.6 0 0 0 18.4 9H11v5"/><circle cx="7" cy="11.2" r="1.8"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.6 3.5 5.4 3.5 8.5s-1.1 5.9-3.5 8.5c-2.4-2.6-3.5-5.4-3.5-8.5s1.1-5.9 3.5-8.5z"/>',
  deadline: '<path d="M7 3.5h10M7 20.5h10M8 3.5c0 4.2 8 4.8 8 8.5s-8 4.3-8 8.5M16 3.5c0 4.2-8 4.8-8 8.5s8 4.3 8 8.5"/>',
  truck: '<path d="M3 16.5V7.5h9.5v9M12.5 10h4.2l3.3 3.4v3.1h-7.5"/><circle cx="7" cy="17.5" r="1.7"/><circle cx="16.5" cy="17.5" r="1.7"/>',
  cargo: '<path d="M4 8l8-4 8 4v8.5l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8.5"/>',
};
function tdIcon(clave) { return TD_ICONS[clave] || DASH_ICONS[clave] || ''; }

// Color de cada testigo prendido, el de los cuadros de verdad: verde lo que
// esta funcionando, azul la luz alta, ambar lo que conviene saber y rojo lo
// que hay que atender.
const TD_LAMP_COLOR = {
  blinkerLeft: 'g', blinkerRight: 'g', beamLow: 'g', parking: 'g', cruise: 'g', wipers: 'g', trailerAttached: 'g',
  beamHigh: 'b',
  motorBrake: 'a', retarder: 'a', differentialLock: 'a', liftAxle: 'a', beacon: 'a', fuelLow: 'a', adblueLow: 'a',
  hazards: 'r', parkingBrake: 'r', battery: 'r', oilPressure: 'r', waterTemp: 'r', airPressure: 'r',
};
// Arriba lo que se prende manejando, con los giros en las puntas; abajo las
// alertas.
const TD_LAMPS_INFO = ['blinkerLeft', 'beamLow', 'beamHigh', 'parking', 'cruise', 'motorBrake', 'retarder',
                       'differentialLock', 'liftAxle', 'beacon', 'wipers', 'trailerAttached', 'blinkerRight'];
const TD_LAMPS_WARN = ['parkingBrake', 'hazards', 'airPressure', 'oilPressure', 'waterTemp', 'battery', 'fuelLow', 'adblueLow'];
const TD_LAMP_TITLE = {
  blinkerLeft: 'blinkers', blinkerRight: 'blinkers', beamLow: 'lowBeam', beamHigh: 'cmdHighBeam',
  parking: 'parkingLights', cruise: 'cruiseControl', motorBrake: 'engineBrake', retarder: 'retarderLabel',
  differentialLock: 'diffLock', liftAxle: 'cmdLiftAxle', beacon: 'cmdBeacon', wipers: 'cmdWipers',
  trailerAttached: 'cmdTrailer', parkingBrake: 'cmdHandbrake', hazards: 'cmdHazards', airPressure: 'cAirPress',
  oilPressure: 'cOilPress', waterTemp: 'cWaterTemp', battery: 'batteryLabel', fuelLow: 'fuel', adblueLow: 'adblueLabel',
};

function createTruckDash({ root, money, imperial, lang, hour12, layout, embedded, mapHole, onHole }) {
  const tipo = TRUCK_LAYOUTS.includes(layout) ? layout : 'euro';
  const embebido = !!(embedded || mapHole);
  const escala = createTimeScale();
  const ritmo = createPaceEta();
  const combustible = createFuelTracker();
  let ultimo = null;
  let visible = true;
  // 'pending' hasta el primer dato a la vista; 'running' mientras barre.
  let barrido = 'pending';
  let forma = null;
  const pref = 'td' + (++tdInstancias) + '-';
  const relojes = [];

  const mi = () => (imperial ? imperial() : false);
  const idioma = () => (lang ? lang() : 'en');
  const doce = () => (hour12 ? hour12() : clockIs12h('auto', idioma()));
  const lim = (x) => Math.max(0, Math.min(1, x));
  function num(v, dec) {
    return Number(v).toLocaleString(idioma(), { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
  }

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function s(tag, attrs, padre) {
    const node = document.createElementNS(TD_NS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (padre) padre.appendChild(node);
    return node;
  }
  // Punto a radio r y angulo a (grados desde las 12, sentido horario), con
  // el centro en el 0,0.
  function punto(r, a) {
    const rad = a * Math.PI / 180;
    return [r * Math.sin(rad), -r * Math.cos(rad)];
  }
  function arco(r, a0, a1) {
    const [x0, y0] = punto(r, a0), [x1, y1] = punto(r, a1);
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }
  function icono(padre, clave, x, y, lado, cls) {
    const node = s('svg', { viewBox: '0 0 24 24', x, y, width: lado, height: lado, fill: 'none', stroke: 'currentColor',
                            'stroke-width': 1.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
                            class: 'tdIco' + (cls ? ' ' + cls : '') }, padre);
    node.innerHTML = tdIcon(clave);
    return node;
  }
  function texto(padre, x, y, cls, ancla) {
    return s('text', { x, y, class: cls, 'text-anchor': ancla || 'middle' }, padre);
  }
  // Escribe solo si cambio. null esconde el nodo: lo que no tiene respuesta
  // no se muestra, igual que en el moderno.
  function txt(node, valor) {
    const v = valor == null || valor === '' ? null : String(valor);
    if (node._v === v) return;
    node._v = v;
    ver(node, v != null);
    if (v != null) node.textContent = v;
  }
  function ver(node, si) {
    const v = si ? '' : 'none';
    if (node.style.display !== v) node.style.display = v;
  }
  function colocar(node, [x, y, w, h]) {
    node.setAttribute('x', x);
    node.setAttribute('y', y);
    node.setAttribute('width', w);
    node.setAttribute('height', h == null ? w : h);
  }
  function cortar(t, n) { return t && t.length > n ? t.slice(0, n - 1) + '…' : t; }
  // La pantalla del medio en una caja de otra forma (el hueco del mapa es mas
  // ancho o mas alto que ella): el viewBox crece hasta la forma de la caja,
  // con lo dibujado (vw x vh) al medio. Devuelve cuanto crecio de cada lado,
  // para estirar lo que va de borde a borde. Sin esto la pantalla quedaba
  // chica adentro del marco del hueco (Discord, 03-11).
  function encajar(svgEl, vw, vh, w, h) {
    const r = w / h;
    const W = Math.max(vw, vh * r), H = Math.max(vh, vw / r);
    const dx = (W - vw) / 2, dy = (H - vh) / 2;
    svgEl.setAttribute('viewBox', `${-dx} ${-dy} ${W} ${H}`);
    return { dx, dy, W, H };
  }
  // Cuanto de la caja llena algo de proporcion n (1 = toda).
  const llena = (r, n) => Math.min(r / n, n / r);

  // --- formato ---
  function dist(km) {
    if (km == null || !isFinite(km)) return null;
    return mi() ? num(km * TD_KM_TO_MI) + ' mi' : num(km) + ' km';
  }
  function hm(seg) {
    if (seg == null || !isFinite(seg)) return null;
    const total = Math.round(Math.abs(seg) / 60);
    return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
  }
  // Como dur() del moderno: las abreviaturas salen del idioma.
  function dur(seg) {
    if (seg == null || !isFinite(seg) || seg < 0) return null;
    const total = Math.round(seg / 60);
    const h = Math.floor(total / 60), m = total % 60;
    return h >= 1
      ? h + ' ' + t('hourShort') + ' ' + String(m).padStart(2, '0') + ' ' + t('minShort')
      : m + ' ' + t('minShort');
  }
  function reloj(fecha) { return formatClockHM(fecha.getHours(), fecha.getMinutes(), doce()); }
  function relojJuego(minutos) {
    const c = gameClockFromMinutes(minutos);
    return c ? formatClockHM(c.hours, c.minutes, doce()) : null;
  }
  function temp(c) { return c == null ? null : (mi() ? c * 9 / 5 + 32 : c); }
  function tempTexto(c) { return c == null ? null : num(temp(c)) + (mi() ? ' °F' : ' °C'); }
  // El aire en bar en un cuadro europeo y en psi en uno americano, como en el
  // juego. El SDK lo da en psi.
  function presionTexto(psi, enBar) {
    if (psi == null) return null;
    return enBar ? num(psi * TD_PSI_TO_BAR, 1) + ' bar' : num(psi) + ' psi';
  }
  function consumoTexto(lPor100) {
    if (!lPor100) return null;
    return mi() ? num(235.215 / lPor100, 1) + ' mpg' : num(lPor100, 1) + ' l/100';
  }
  function escalaTiempo() {
    const medido = escala.value();
    return medido != null ? medido : (DASH_NOMINAL_SCALE[ultimo && ultimo.game] || 19);
  }
  function autonomia(d) {
    const medido = combustible.avgLPer100();
    return medido && d.fuel != null ? d.fuel / medido * 100 : d.fuelRangeKm;
  }

  // --- el lienzo ---
  root.classList.add('tdRoot', 'td-' + tipo);
  root.classList.toggle('tdEmbed', embebido);
  root.textContent = '';
  const escena = root.appendChild(el('div', 'tdStage'));
  const lienzo = s('svg', { class: 'tdCluster', preserveAspectRatio: 'xMidYMid meet' }, escena);
  const defs = s('defs', {}, lienzo);
  defs.innerHTML = `
    <linearGradient id="${pref}bezel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5c626b"/><stop offset="0.45" stop-color="#1d2026"/><stop offset="1" stop-color="#0a0b0d"/></linearGradient>
    <radialGradient id="${pref}face" cx="0.5" cy="0.4" r="0.65"><stop offset="0" stop-color="#1b1f25"/><stop offset="1" stop-color="#050608"/></radialGradient>
    <radialGradient id="${pref}hub" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#6b717a"/><stop offset="1" stop-color="#121417"/></radialGradient>
    <linearGradient id="${pref}chrome" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fdfdfd"/><stop offset="0.35" stop-color="#8e949c"/><stop offset="0.55" stop-color="#f1f2f4"/><stop offset="1" stop-color="#555b63"/></linearGradient>
    <linearGradient id="${pref}chrome2" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#f6f7f8"/><stop offset="0.5" stop-color="#7b8189"/><stop offset="1" stop-color="#d9dcdf"/></linearGradient>
    <radialGradient id="${pref}cream" cx="0.5" cy="0.42" r="0.62"><stop offset="0" stop-color="#fbf9f2"/><stop offset="1" stop-color="#ddd6c4"/></radialGradient>
    <linearGradient id="${pref}screen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#121b2a"/><stop offset="1" stop-color="#05080d"/></linearGradient>
    <radialGradient id="${pref}glass" cx="0.5" cy="0.45" r="0.75"><stop offset="0" stop-color="#0d1828"/><stop offset="1" stop-color="#020305"/></radialGradient>
    <linearGradient id="${pref}accent" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1b9cff"/><stop offset="1" stop-color="#7fe6ff"/></linearGradient>
    <radialGradient id="${pref}pod" cx="0.5" cy="0.5" r="0.5"><stop offset="0.86" stop-color="#1c1f24"/><stop offset="1" stop-color="#0b0c0e"/></radialGradient>
    <linearGradient id="${pref}panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2c30"/><stop offset="1" stop-color="#141517"/></linearGradient>`;
  const fondo = s('g', { class: 'tdBack' }, lienzo);
  const franja = root.appendChild(el('footer', 'tdJob'));
  const jobCargo = franja.appendChild(el('span', 'tdJobCargo'));
  const jobRoute = franja.appendChild(el('span', 'tdJobRoute'));
  const jobClaim = franja.appendChild(el('span', 'tdJobClaim'));
  const jobPay = franja.appendChild(el('span', 'tdJobPay'));
  const esperando = root.appendChild(el('div', 'tdWaiting'));
  esperando.dataset.i18n = 'panelEmptyTitle';

  // --- relojes de aguja ---
  // Cada uno en su propio <svg> con el centro en el 0,0 (viewBox -100 -100
  // 200 200): la aguja gira sobre el origen. spec: tema ('eu' o 'us'), min,
  // max, major, minor (marcas chicas por cada grande), labels (cada cuantas
  // grandes va un numero), fmt, sweep (grados), red y green ([desde, hasta]),
  // inner (la segunda escala del velocimetro americano), chico, marks.
  function relojAguja(spec) {
    const us = spec.tema === 'us';
    const g = s('svg', { viewBox: '-100 -100 200 200', class: 'tdDial tdDial-' + spec.tema });
    const r = { spec, svg: g, valor: null, angulo: null, marcas: {}, clave: null };
    if (us) {
      s('circle', { r: 99, fill: `url(#${pref}chrome)` }, g);
      s('circle', { r: 92, fill: `url(#${pref}chrome2)` }, g);
      s('circle', { r: 87, fill: `url(#${pref}cream)` }, g);
    } else {
      s('circle', { r: 99, fill: `url(#${pref}bezel)` }, g);
      s('circle', { r: 95, fill: '#000' }, g);
      s('circle', { r: 93, fill: `url(#${pref}face)` }, g);
    }
    r.escala = s('g', {}, g);
    r.extra = s('g', {}, g);
    const marcas = s('g', {}, g);
    for (const [nombre, cls] of spec.marks || []) {
      const m = s('path', { d: us ? 'M 0 -76 L -5 -86 L 5 -86 Z' : 'M 0 -83 L -5 -92.5 L 5 -92.5 Z', class: 'tdMark ' + cls }, marcas);
      m.style.display = 'none';
      r.marcas[nombre] = m;
    }
    r.aguja = s('g', { class: 'tdNeedle' }, g);
    const largo = spec.chico ? 70 : (us ? 78 : 84);
    s('path', { d: `M -2.8 14 L -1 -${largo} L 1 -${largo} L 2.8 14 Z`, class: 'tdNeedleBody' }, r.aguja);
    if (us) s('path', { d: 'M -4.5 2 L 4.5 2 L 3.5 22 L -3.5 22 Z', class: 'tdNeedleTail' }, r.aguja);
    s('circle', { r: us ? 9 : 10, fill: `url(#${pref}hub)`, stroke: '#000', 'stroke-width': 1.2 }, g);
    s('circle', { r: 3, class: 'tdHubCap' }, g);
    r.mover = moverAguja;
    r.dibujar = escalaAguja;
    escalaAguja(r);
    relojes.push(r);
    return r;
  }

  function escalaAguja(r) {
    const { spec } = r;
    const us = spec.tema === 'us';
    const borde = us ? 82 : 88;
    const ang = (v) => gaugeAngle(v, spec.min, spec.max, spec.sweep);
    r.escala.textContent = '';
    for (const [cls, zonas] of [['tdZoneRed', spec.red], ['tdZoneGreen', spec.green]]) {
      for (const [a, b] of zonas || []) s('path', { d: arco(borde - 1.5, ang(a), ang(b)), class: cls }, r.escala);
    }
    const sub = spec.minor || 1;
    const pasos = Math.round((spec.max - spec.min) / spec.major * sub);
    for (let i = 0; i <= pasos; i++) {
      const v = spec.min + i * spec.major / sub;
      const mayor = i % sub === 0;
      const a = ang(v);
      const [x0, y0] = punto(borde, a), [x1, y1] = punto(borde - (mayor ? (spec.chico ? 13 : 11) : 6), a);
      const enRojo = (spec.red || []).some(([r0, r1]) => v >= r0 && v <= r1);
      s('line', { x1: x0.toFixed(2), y1: y0.toFixed(2), x2: x1.toFixed(2), y2: y1.toFixed(2),
                  class: (mayor ? 'tdTickMajor' : 'tdTickMinor') + (enRojo ? ' tdTickRed' : '') }, r.escala);
      const etiqueta = mayor && spec.fmt && Math.round(i / sub) % (spec.labels || 1) === 0 ? spec.fmt(v) : null;
      if (etiqueta == null) continue;
      const [tx, ty] = punto(spec.chico ? 58 : (us ? 63 : 68), a);
      texto(r.escala, tx.toFixed(1), ty.toFixed(1), 'tdNum' + (spec.chico ? ' tdNumSmall' : '')).textContent = etiqueta;
    }
    // La otra unidad por dentro, en rojo, como los velocimetros americanos.
    const inner = spec.inner;
    if (inner) {
      for (let v = 0; v * inner.factor <= spec.max + 1e-9; v += inner.major) {
        const a = ang(v * inner.factor);
        const [x0, y0] = punto(50, a), [x1, y1] = punto(44, a);
        s('line', { x1: x0.toFixed(2), y1: y0.toFixed(2), x2: x1.toFixed(2), y2: y1.toFixed(2), class: 'tdTickInner' }, r.escala);
        const [tx, ty] = punto(35, a);
        texto(r.escala, tx.toFixed(1), ty.toFixed(1), 'tdNumInner').textContent = String(v);
      }
    }
  }

  function moverAguja(r, valor, forzar) {
    const a = gaugeAngle(valor, r.spec.min, r.spec.max, r.spec.sweep);
    if (!forzar && r.angulo != null && Math.abs(a - r.angulo) < 0.2) return;
    r.angulo = a;
    r.aguja.style.transform = `rotate(${a.toFixed(1)}deg)`;
  }

  // --- aros de pantalla (el digital) ---
  // La banda se llena hasta el valor: un trazo con pathLength 1000 que se
  // corre con stroke-dashoffset. Las marcas y los numeros van por fuera.
  function aro(spec) {
    const g = s('svg', { viewBox: '-120 -120 240 240', class: 'tdRingDial' });
    const r = { spec, svg: g, valor: null, frac: null, marcas: {}, clave: null };
    s('path', { d: arco(88, -spec.sweep / 2, spec.sweep / 2), class: 'tdTrack' }, g);
    r.escala = s('g', {}, g);
    r.relleno = s('path', { d: arco(88, -spec.sweep / 2, spec.sweep / 2), class: 'tdFill', pathLength: 1000,
                            stroke: `url(#${pref}accent)` }, g);
    r.relleno.style.strokeDashoffset = '1000';
    const marcas = s('g', {}, g);
    for (const [nombre, cls] of spec.marks || []) {
      const m = s('rect', { x: -2.2, y: -98, width: 4.4, height: 20, rx: 1, class: 'tdMark ' + cls }, marcas);
      m.style.display = 'none';
      r.marcas[nombre] = m;
    }
    r.extra = s('g', {}, g);
    r.mover = llenarAro;
    r.dibujar = escalaAro;
    escalaAro(r);
    relojes.push(r);
    return r;
  }

  function escalaAro(r) {
    const { spec } = r;
    const ang = (v) => gaugeAngle(v, spec.min, spec.max, spec.sweep);
    r.escala.textContent = '';
    for (const [cls, zonas] of [['tdZoneRed', spec.red], ['tdZoneGreen', spec.green]]) {
      for (const [a, b] of zonas || []) s('path', { d: arco(100, ang(a), ang(b)), class: cls }, r.escala);
    }
    const sub = spec.minor || 1;
    const pasos = Math.round((spec.max - spec.min) / spec.major * sub);
    for (let i = 0; i <= pasos; i++) {
      const v = spec.min + i * spec.major / sub;
      const mayor = i % sub === 0;
      const a = ang(v);
      const [x0, y0] = punto(97, a), [x1, y1] = punto(mayor ? 105 : 101, a);
      s('line', { x1: x0.toFixed(2), y1: y0.toFixed(2), x2: x1.toFixed(2), y2: y1.toFixed(2),
                  class: mayor ? 'tdTickMajor' : 'tdTickMinor' }, r.escala);
      if (!mayor || !spec.fmt || Math.round(i / sub) % (spec.labels || 1) !== 0) continue;
      // Por fuera del aro: adentro el cartel de la maxima pisaba el 60.
      const [tx, ty] = punto(115, a);
      texto(r.escala, tx.toFixed(1), ty.toFixed(1), 'tdNum').textContent = spec.fmt(v);
    }
  }

  function llenarAro(r, valor, forzar) {
    const f = lim((valor - r.spec.min) / (r.spec.max - r.spec.min));
    if (!forzar && r.frac != null && Math.abs(f - r.frac) < 0.002) return;
    r.frac = f;
    r.relleno.style.strokeDashoffset = (1000 * (1 - f)).toFixed(1);
  }

  // --- lo comun a agujas y aros ---
  // valor null esconde el reloj: el juego no lo informa.
  function poner(r, valor) {
    ver(r.svg, valor != null);
    if (valor == null) return;
    r.valor = valor;
    if (barrido !== 'running') r.mover(r, valor);
  }
  function marca(r, nombre, valor) {
    const m = r.marcas[nombre];
    if (!m) return;
    ver(m, valor != null);
    if (valor != null) m.style.transform = `rotate(${gaugeAngle(valor, r.spec.min, r.spec.max, r.spec.sweep).toFixed(1)}deg)`;
  }
  // Cambia la escala (otras unidades, otro camion) y la redibuja. clave dice
  // si cambio algo de verdad: fmt es una funcion nueva en cada llamada.
  function escalar(r, cambios, clave) {
    if (r.clave === clave) return;
    r.clave = clave;
    r.spec = Object.assign({}, r.spec, cambios);
    r.dibujar(r);
    r.angulo = null;
    r.frac = null;
  }
  function escalaRpm(r, esc) {
    const miles = esc.rpm.major >= 1000;
    escalar(r, Object.assign({}, esc.rpm, { fmt: (v) => String(miles ? v / 1000 : v / 100) }),
            JSON.stringify(esc.rpm));
    return miles ? '×1000 rpm' : '×100 rpm';
  }

  // Barrita de segmentos (agua, aire, combustible y AdBlue adentro de los
  // relojes europeos). zona: cuantos segmentos de la punta mala son la zona
  // roja; bajo: la mala es la de abajo (combustible, aire). Se pinta de rojo
  // solo cuando el nivel esta ahi: con el tanque lleno, un primer segmento
  // rojo parecia un aviso.
  function segmentos(padre, x, y, w, n, clave, zona, bajo) {
    const g = s('g', {}, padre);
    icono(g, clave, x + w / 2 - 7, y - 19, 14, 'tdSegIco');
    const paso = w / n;
    const segs = [];
    for (let i = 0; i < n; i++) {
      segs.push(s('rect', { x: (x + i * paso + 0.7).toFixed(2), y, width: (paso - 1.4).toFixed(2), height: 8, rx: 1, class: 'tdSegOff' }, g));
    }
    let firma = null;
    return {
      poner(frac, alerta) {
        ver(g, frac != null);
        if (frac == null) return;
        const prendidos = Math.max(frac > 0.01 ? 1 : 0, Math.round(lim(frac) * n));
        const f = prendidos + (alerta ? '!' : '');
        if (f === firma) return;
        firma = f;
        const enZona = bajo ? prendidos <= zona : prendidos > n - zona;
        segs.forEach((seg, i) => seg.setAttribute('class', i < prendidos
          ? (alerta || (enZona && (bajo || i >= n - zona)) ? 'tdSegOn tdSegBad' : 'tdSegOn') : 'tdSegOff'));
      },
    };
  }

  // Fila de testigos. Los que el cliente no manda se van y el resto se junta
  // al medio; los giros quedan en las puntas.
  function tiraTestigos(claves) {
    const paso = TD_LAMP_STEP;
    const ancho = claves.length * paso;
    const svgEl = s('svg', { viewBox: `0 0 ${ancho} ${paso}`, class: 'tdLamps' });
    const items = claves.map((clave) => {
      const v = icono(svgEl, clave, 0, paso * 0.1, paso * 0.8, 'tdLamp tdLamp-' + TD_LAMP_COLOR[clave]);
      const titulo = s('title', {});
      titulo.dataset.i18n = TD_LAMP_TITLE[clave];
      v.insertBefore(titulo, v.firstChild);
      return { clave, v, on: null };
    });
    let firma = null;
    return {
      svg: svgEl,
      poner(lamps) {
        const vis = items.filter(it => lamps[it.clave] !== undefined);
        const f = vis.map(it => it.clave).join();
        if (f !== firma) {
          firma = f;
          const x0 = (ancho - vis.length * paso) / 2;
          for (const it of items) ver(it.v, false);
          vis.forEach((it, i) => { ver(it.v, true); it.v.setAttribute('x', (x0 + i * paso + paso * 0.1).toFixed(1)); });
        }
        for (const it of vis) {
          const on = !!lamps[it.clave];
          if (on !== it.on) { it.on = on; it.v.classList.toggle('on', on); }
        }
      },
    };
  }

  // Cartel de velocidad maxima: circulo blanco con el borde rojo.
  function cartel(padre, x, y, radio) {
    const g = s('g', { class: 'tdSign' }, padre);
    s('circle', { cx: x, cy: y, r: radio, class: 'tdSignBg' }, g);
    s('circle', { cx: x, cy: y, r: radio * 0.86, class: 'tdSignRing', 'stroke-width': radio * 0.2 }, g);
    const n = texto(g, x, y + radio * 0.04, 'tdSignTxt');
    n.style.fontSize = (radio * 0.78).toFixed(1) + 'px';
    return {
      poner(valor, exceso) {
        ver(g, valor != null);
        if (valor == null) return;
        txt(n, num(valor));
        g.classList.toggle('over', !!exceso);
      },
    };
  }

  // Renglon de la pantalla: icono, el dato y algo chico a la derecha.
  function renglon(padre, x, y, ancho, clave, tamano) {
    const g = s('g', {}, padre);
    icono(g, clave, x, y - tamano * 0.55, tamano * 1.1, 'tdDim');
    const valor = texto(g, x + tamano * 1.6, y, 'tdTxt tdTxtM', 'start');
    const sub = texto(g, x + ancho, y, 'tdTxt tdTxtS tdDim', 'end');
    return {
      poner(v, detalle, estado) {
        ver(g, v != null);
        if (v == null) return;
        txt(valor, v);
        txt(sub, detalle);
        valor.classList.toggle('tdOk', estado === 'bien');
        valor.classList.toggle('tdBad', estado === 'mal');
      },
    };
  }

  // Barra horizontal de la pantalla digital: icono, la barra y el numero.
  function barraDigital(padre, y, clave, malo) {
    const g = s('g', {}, padre);
    icono(g, clave, 18, y - 12, 24, 'tdDim');
    s('rect', { x: 56, y: y - 5, width: 232, height: 10, rx: 5, class: 'tdBarTrack' }, g);
    const lleno = s('rect', { x: 56, y: y - 5, width: 0, height: 10, rx: 5, class: 'tdBarFill' }, g);
    const valor = texto(g, 402, y, 'tdTxt tdTxtS', 'end');
    return {
      poner(frac, v, alerta) {
        ver(g, frac != null);
        if (frac == null) return;
        lleno.setAttribute('width', (232 * lim(frac)).toFixed(1));
        lleno.classList.toggle('tdBarBad', !!alerta || malo(lim(frac)));
        txt(valor, v);
      },
    };
  }

  // --- cuadro europeo ---
  function armarEuro() {
    const tacho = relojAguja({ tema: 'eu', sweep: 240, min: 0, max: 3000, major: 500, minor: 5, labels: 1 });
    const velo = relojAguja({ tema: 'eu', sweep: 240, min: 0, max: 125, major: 10, minor: 2, labels: 2,
                              marks: [['limit', 'tdMarkLimit'], ['cruise', 'tdMarkCruise']] });
    const uRpm = texto(tacho.extra, 0, -38, 'tdUnit');
    const uVel = texto(velo.extra, 0, -38, 'tdUnit');
    s('rect', { x: -30, y: 15, width: 60, height: 23, rx: 3, class: 'tdLcdBox' }, velo.extra);
    const lcdVel = texto(velo.extra, 0, 27, 'tdLcd');
    // Agua y aire en el tacometro, combustible y AdBlue en el velocimetro:
    // en la franja de abajo, donde la aguja no llega.
    const agua = segmentos(tacho.extra, -62, 56, 50, 8, 'waterTemp', 1, false);
    const aire = segmentos(tacho.extra, 12, 56, 50, 8, 'airPressure', 3, true);
    const nafta = segmentos(velo.extra, -62, 56, 50, 8, 'fuelLow', 1, true);
    const adblue = segmentos(velo.extra, 12, 56, 50, 8, 'adblueLow', 1, true);
    const info = tiraTestigos(TD_LAMPS_INFO);
    const avisos = tiraTestigos(TD_LAMPS_WARN);

    // La pantalla del medio: la hora arriba, el cambio con el cartel y los
    // renglones del viaje. En una caja ancha (el hueco del mapa entre los
    // relojes) van en dos columnas, el cambio a la izquierda.
    const pant = s('svg', { viewBox: '0 0 380 460', class: 'tdScreen' });
    const pFondo = s('rect', { x: 2, y: 2, width: 376, height: 456, rx: 18, fill: `url(#${pref}screen)`, class: 'tdScreenBg' }, pant);
    const arriba = s('g', {}, pant);
    const pGlobo = icono(arriba, 'globe', 16, 12, 22, 'tdDim');
    const pReloj = texto(arriba, 46, 24, 'tdTxt tdTxtM', 'start');
    const pOdo = texto(arriba, 364, 24, 'tdTxt tdTxtS tdDim', 'end');
    const sepArriba = s('line', { x1: 14, y1: 46, x2: 366, y2: 46, class: 'tdSep' }, pant);
    const bloque = s('g', {}, pant);
    const pMarcha = texto(bloque, 190, 148, 'tdGear');
    const pCartel = cartel(bloque, 322, 92, 32);
    const pRet = texto(bloque, 24, 92, 'tdTxt tdTxtM tdRetTxt', 'start');
    const pCrucero = s('g', {}, bloque);
    icono(pCrucero, 'cruise', 128, 216, 26, 'tdCcIco');
    const pCruceroTxt = texto(pCrucero, 162, 229, 'tdCcTxt', 'start');
    const sepMedio = s('line', { x1: 14, y1: 258, x2: 366, y2: 258, class: 'tdSep' }, pant);
    const lista = s('g', {}, pant);
    const filas = ['flag', 'clock', 'bed', 'fuelLow'].map((clave, i) => renglon(lista, 18, 288 + i * 48, 346, clave, 24));
    const linea = (l, x1, y1, x2, y2) => { for (const [k, v] of Object.entries({ x1, y1, x2, y2 })) l.setAttribute(k, v); };

    const piezas = [tacho.svg, velo.svg, pant, info.svg, avisos.svg];
    piezas.forEach(p => lienzo.appendChild(p));
    return {
      nombres: { tach: 0, speed: 1, screen: 2, info: 3, warn: 4 },
      formas: {
        wide: { vb: [1600, 600], cajas: [[20, 20, 560], [1020, 20, 560], [610, 70, 380, 460], [578, 14, 444, 44], [600, 545, 400, 44]] },
        tall: { vb: [1000, 1390], cajas: [[20, 86, 470], [510, 86, 470], [150, 580, 700, 720], [60, 14, 880, 60], [100, 1316, 800, 60]] },
        // Con el mapa en medio: los relojes se separan y la pantalla crece
        // hasta el hueco donde va el mapa.
        mapaWide: { vb: [2000, 600], hueco: [600, 62, 800, 476],
                    cajas: [[20, 20, 560], [1420, 20, 560], [600, 62, 800, 476], [600, 12, 800, 44], [600, 546, 800, 44]] },
        mapaTall: { vb: [1000, 1500], hueco: [20, 580, 960, 840],
                    cajas: [[20, 86, 470], [510, 86, 470], [20, 580, 960, 840], [60, 14, 880, 60], [100, 1432, 800, 56]] },
        // El mapa a la derecha del cuadro, de alto entero; los testigos van
        // arriba y abajo de los relojes. La del mapa a la izquierda es esta
        // en espejo (espejo, mas abajo).
        ladoDer: { vb: [1600, 600], hueco: [1000, 24, 576, 552],
                   cajas: [[26, 84, 450], [516, 84, 450], [1000, 24, 576, 552], [261, 14, 470, 44], [296, 548, 400, 44]] },
      },
      piezas,
      pantalla(w, h) {
        // Una columna (380 x 460) o dos (760 x 460): la que llena mas.
        const r = w / h;
        const dos = llena(r, 760 / 460) > llena(r, 380 / 460);
        const { dx, dy, W, H } = encajar(pant, dos ? 760 : 380, 460, w, h);
        const izq = -dx, der = W - dx;
        colocar(pFondo, [izq + 2, -dy + 2, W - 4, H - 4]);
        // La hora y el odometro contra el borde de arriba, en las puntas.
        arriba.setAttribute('transform', `translate(0 ${-dy})`);
        pGlobo.setAttribute('x', izq + 16);
        pReloj.setAttribute('x', izq + 46);
        pOdo.setAttribute('x', der - 16);
        linea(sepArriba, izq + 14, 46 - dy, der - 14, 46 - dy);
        if (dos) {
          // El cambio y el cartel al medio de la izquierda, los renglones al
          // medio de la derecha y una raya entre los dos.
          bloque.setAttribute('transform', 'translate(0 102)');
          lista.setAttribute('transform', 'translate(380 -107)');
          linea(sepMedio, 380, 70, 380, 436);
        } else {
          bloque.removeAttribute('transform');
          lista.removeAttribute('transform');
          linea(sepMedio, izq + 14, 258, der - 14, 258);
        }
      },
      fondo(g, f) {
        const ancha = f.vb[1] <= 600;
        s('rect', { x: 4, y: 4, width: f.vb[0] - 8, height: f.vb[1] - 8, rx: ancha ? 120 : 70, class: 'tdHousing' }, g);
        for (const [x, y, lado] of f.cajas.slice(0, 2)) {
          s('circle', { cx: x + lado / 2, cy: y + lado / 2, r: lado / 2 + (ancha ? 16 : 15), fill: `url(#${pref}pod)` }, g);
        }
      },
      render(L, d) {
        txt(uRpm, escalaRpm(tacho, L.esc));
        escalar(velo, Object.assign({}, L.esc.speed, { fmt: String }), JSON.stringify(L.esc.speed));
        txt(uVel, L.imp ? 'mph' : 'km/h');
        poner(tacho, L.rpm);
        poner(velo, L.vel);
        marca(velo, 'limit', L.limite);
        marca(velo, 'cruise', L.crucero);
        txt(lcdVel, num(L.vel));
        agua.poner(d.waterTemperature != null ? (d.waterTemperature - 40) / 80 : null, L.lamps.waterTemp);
        aire.poner(d.airPressure != null ? d.airPressure / 150 : null, L.lamps.airPressure);
        nafta.poner(L.fuelFrac, L.lamps.fuelLow);
        adblue.poner(L.adFrac, L.lamps.adblueLow);
        info.poner(L.lamps);
        avisos.poner(L.lamps);

        txt(pReloj, L.reloj);
        txt(pOdo, L.odo);
        txt(pMarcha, L.marcha);
        pCartel.poner(L.limite, L.exceso);
        txt(pRet, L.retarder ? 'R ' + L.retarder : null);
        ver(pCrucero, L.crucero != null);
        if (L.crucero != null) txt(pCruceroTxt, num(L.crucero) + ' ' + (L.imp ? 'mph' : 'km/h'));
        // Sin trabajo quedan el descanso y la autonomia: lo de la ruta no
        // tiene respuesta.
        filas[0].poner(L.enViaje ? cortar(d.cityDst, 16) : null, dist(L.restanteKm));
        filas[1].poner(L.llegada, L.realSeg != null ? hm(L.realSeg) + ' ' + t('realShort') : null);
        filas[2].poner(L.descansoSeg != null ? hm(L.descansoSeg) : null,
                       L.descansoSeg != null ? hm(L.descansoSeg / L.sT) + ' ' + t('realShort') : null,
                       L.dormir == null ? null : (L.dormir ? 'mal' : 'bien'));
        filas[3].poner(dist(L.alcance), consumoTexto(L.consumo));
      },
    };
  }

  // --- pantalla digital ---
  function armarDigital() {
    const vel = aro({ sweep: 270, min: 0, max: 125, major: 10, minor: 2, labels: 2,
                      marks: [['limit', 'tdMarkLimit'], ['cruise', 'tdMarkCruise']] });
    const rpm = aro({ sweep: 270, min: 0, max: 3000, major: 500, minor: 5, labels: 1 });
    const vCartel = cartel(vel.extra, 0, -46, 16);
    const vNum = texto(vel.extra, 0, 8, 'tdBig');
    const vUnit = texto(vel.extra, 0, 38, 'tdUnitD');
    const vCc = texto(vel.extra, 0, 60, 'tdCc');
    const rMarcha = texto(rpm.extra, 0, 8, 'tdBig');
    const rTxt = texto(rpm.extra, 0, 38, 'tdUnitD');
    const rRet = texto(rpm.extra, 0, 60, 'tdRet');
    const info = tiraTestigos(TD_LAMPS_INFO);
    const avisos = tiraTestigos(TD_LAMPS_WARN);

    // La columna del medio: el viaje arriba y los medidores abajo.
    const col = s('svg', { viewBox: '0 0 420 470', class: 'tdColumn' });
    s('rect', { x: 1, y: 1, width: 418, height: 268, rx: 16, class: 'tdCard' }, col);
    const cTitulo = texto(col, 22, 38, 'tdTxt tdTxtL', 'start');
    const cSub = texto(col, 22, 68, 'tdTxt tdTxtS tdDim', 'start');
    const cGrande = texto(col, 22, 114, 'tdTxt tdTxtXL tdAccent', 'start');
    const cGrandeSub = texto(col, 22, 146, 'tdTxt tdTxtS tdDim', 'start');
    const avance = s('g', {}, col);
    s('rect', { x: 22, y: 164, width: 376, height: 8, rx: 4, class: 'tdBarTrack' }, avance);
    const avanceHecho = s('rect', { x: 22, y: 164, width: 0, height: 8, rx: 4, class: 'tdBarFill' }, avance);
    const avancePunto = s('circle', { cx: 22, cy: 168, r: 7, class: 'tdBarDot' }, avance);
    const fLlegada = renglon(col, 22, 206, 376, 'clock', 22);
    const fDescanso = renglon(col, 22, 244, 160, 'bed', 22);
    const fPlazo = renglon(col, 214, 244, 184, 'deadline', 22);
    s('rect', { x: 1, y: 284, width: 418, height: 185, rx: 16, class: 'tdCard' }, col);
    const bNafta = barraDigital(col, 314, 'fuelLow', (f) => f < 0.15);
    const bAdblue = barraDigital(col, 356, 'adblueLow', (f) => f < 0.1);
    const bAgua = barraDigital(col, 398, 'waterTemp', (f) => f > 0.81);
    const bAire = barraDigital(col, 440, 'airPressure', (f) => f < 0.4);

    const piezas = [vel.svg, rpm.svg, col, info.svg, avisos.svg];
    piezas.forEach(p => lienzo.appendChild(p));
    return {
      nombres: { speed: 0, tach: 1, screen: 2, info: 3, warn: 4 },
      formas: {
        wide: { vb: [1600, 600], cajas: [[10, 30, 560], [1030, 30, 560], [590, 62, 420, 470], [578, 10, 444, 44], [600, 548, 400, 44]] },
        tall: { vb: [1000, 1430], cajas: [[10, 80, 490], [500, 80, 490], [140, 590, 720, 760], [60, 12, 880, 60], [100, 1362, 800, 60]] },
        mapaWide: { vb: [2000, 600], hueco: [590, 62, 820, 476],
                    cajas: [[10, 30, 560], [1430, 30, 560], [590, 62, 820, 476], [578, 10, 844, 44], [600, 548, 800, 44]] },
        mapaTall: { vb: [1000, 1500], hueco: [20, 590, 960, 830],
                    cajas: [[10, 80, 490], [500, 80, 490], [20, 590, 960, 830], [60, 12, 880, 60], [100, 1432, 800, 56]] },
        ladoDer: { vb: [1600, 600], hueco: [1000, 24, 576, 552],
                   cajas: [[20, 66, 470], [500, 66, 470], [1000, 24, 576, 552], [261, 12, 470, 44], [296, 548, 400, 44]] },
      },
      piezas,
      fondo(g, f) {
        s('rect', { x: 2, y: 2, width: f.vb[0] - 4, height: f.vb[1] - 4, rx: 36, fill: `url(#${pref}glass)`, class: 'tdGlass' }, g);
      },
      render(L, d) {
        txt(rTxt, null);
        escalaRpm(rpm, L.esc);
        escalar(vel, Object.assign({}, L.esc.speed, { fmt: String }), JSON.stringify(L.esc.speed));
        poner(vel, L.vel);
        poner(rpm, L.rpm);
        marca(vel, 'limit', L.limite);
        marca(vel, 'cruise', L.crucero);
        vel.relleno.classList.toggle('over', !!L.exceso);
        vCartel.poner(L.limite, L.exceso);
        txt(vNum, num(L.vel));
        txt(vUnit, L.imp ? 'mph' : 'km/h');
        txt(vCc, L.crucero != null ? '▶ ' + num(L.crucero) : null);
        txt(rMarcha, L.marcha);
        txt(rTxt, num(L.rpm) + ' rpm');
        txt(rRet, L.retarder ? 'RET ' + L.retarder : null);
        info.poner(L.lamps);
        avisos.poner(L.lamps);

        if (L.enViaje) {
          txt(cTitulo, cortar(d.cityDst, 20));
          txt(cSub, cortar(d.companyDst, 34));
          txt(cGrande, dist(L.restanteKm));
          txt(cGrandeSub, [t('remainingLabel'), L.realSeg != null ? hm(L.realSeg) + ' ' + t('realShort') : null]
            .filter(Boolean).join(' · '));
        } else {
          // Sin trabajo, la hora del juego en grande.
          txt(cTitulo, t('gameClock'));
          txt(cSub, null);
          txt(cGrande, L.reloj);
          txt(cGrandeSub, null);
        }
        ver(avance, L.progreso != null);
        if (L.progreso != null) {
          avanceHecho.setAttribute('width', (376 * L.progreso).toFixed(1));
          avancePunto.setAttribute('cx', (22 + 376 * L.progreso).toFixed(1));
        }
        fLlegada.poner(L.llegada, L.llegadaJuego ? L.llegadaJuego + ' ' + t('inGameShort') : null);
        fDescanso.poner(L.descansoSeg != null ? hm(L.descansoSeg) : null, null,
                        L.dormir == null ? null : (L.dormir ? 'mal' : 'bien'));
        fPlazo.poner(L.margen != null ? (L.margen >= 0 ? '+' : '−') + hm(L.margen) : null, null,
                     L.margen == null ? null : (L.margen >= 0 ? 'bien' : 'mal'));
        bNafta.poner(L.fuelFrac, dist(L.alcance) || (L.fuelFrac != null ? num(L.fuelFrac * 100) + ' %' : null), L.lamps.fuelLow);
        bAdblue.poner(L.adFrac, L.adFrac != null ? num(L.adFrac * 100) + ' %' : null, L.lamps.adblueLow);
        bAgua.poner(d.waterTemperature != null ? (d.waterTemperature - 40) / 80 : null, tempTexto(d.waterTemperature), L.lamps.waterTemp);
        bAire.poner(d.airPressure != null ? d.airPressure / 150 : null, presionTexto(d.airPressure, !L.imp), L.lamps.airPressure);
      },
    };
  }

  // --- cuadro americano ---
  function armarAmericano() {
    const tacho = relojAguja({ tema: 'us', sweep: 260, min: 0, max: 3000, major: 500, minor: 5, labels: 1 });
    const velo = relojAguja({ tema: 'us', sweep: 260, min: 0, max: 85, major: 10, minor: 2, labels: 1,
                              marks: [['limit', 'tdMarkLimit'], ['cruise', 'tdMarkCruise']] });
    const uRpm = texto(tacho.extra, 0, 34, 'tdUsLabel');
    // Abajo del eje: arriba esta la escala roja de la otra unidad.
    const uVel = texto(velo.extra, 0, 46, 'tdUsLabel');
    const uVel2 = texto(velo.extra, 0, 62, 'tdUsInnerLabel');
    // Los relojitos: el nombre y la unidad abajo del eje, y el numero chico
    // para quien lo mira desde lejos.
    function chico(etiqueta) {
      const r = relojAguja({ tema: 'us', chico: true, sweep: 100, min: 0, max: 100, major: 25, minor: 5, labels: 2 });
      const nombre = texto(r.extra, 0, 28, 'tdUsLabel');
      nombre.dataset.i18n = etiqueta;
      r.unidad = texto(r.extra, 0, 46, 'tdUsUnit');
      r.lectura = texto(r.extra, 0, 66, 'tdUsVal');
      return r;
    }
    const oilPress = chico('cOilPress');
    const waterTemp = chico('cWaterTemp');
    const oilTemp = chico('cOilTemp');
    const battery = chico('batteryLabel');
    const fuel = chico('fuel');
    const adblue = chico('adblueLabel');
    const air = chico('cAirPress');
    const brake = chico('cBrakeTemp');
    const tanque = (v) => (v === 0 ? 'E' : v === 0.5 ? '½' : v === 1 ? 'F' : null);
    escalar(oilPress, { min: 0, max: 100, major: 25, minor: 5, labels: 2, red: [[0, 15]], fmt: String }, 'psi');
    escalar(fuel, { min: 0, max: 1, major: 0.25, minor: 2, labels: 1, red: [[0, 0.15]], fmt: tanque }, 'tanque');
    escalar(adblue, { min: 0, max: 1, major: 0.25, minor: 2, labels: 1, red: [[0, 0.1]], fmt: tanque }, 'tanque');
    escalar(air, { min: 0, max: 150, major: 25, minor: 5, labels: 2, red: [[0, 60]], fmt: String }, 'psi');
    txt(oilPress.unidad, 'PSI');
    txt(air.unidad, 'PSI');
    txt(battery.unidad, 'VOLTS');

    // El display del medio: la marcha, el crucero, el descanso y el odometro.
    const lcd = s('svg', { viewBox: '0 0 260 100', class: 'tdUsLcdBox' });
    const lFondo = s('rect', { x: 2, y: 2, width: 256, height: 96, rx: 10, class: 'tdUsLcd' }, lcd);
    const lMarcha = texto(lcd, 58, 52, 'tdUsLcdGear');
    s('line', { x1: 112, y1: 14, x2: 112, y2: 86, class: 'tdUsLcdSep' }, lcd);
    const lCc = texto(lcd, 246, 24, 'tdUsLcdTxt tdUsLcdCc', 'end');
    const lDescanso = s('g', {}, lcd);
    icono(lDescanso, 'bed', 124, 41, 20, 'tdUsLcdIco');
    const lDescansoTxt = texto(lDescanso, 246, 51, 'tdUsLcdTxt', 'end');
    const lOdo = texto(lcd, 246, 78, 'tdUsLcdTxt tdUsLcdDim', 'end');
    const info = tiraTestigos(TD_LAMPS_INFO);
    const avisos = tiraTestigos(TD_LAMPS_WARN);

    const piezas = [oilPress.svg, waterTemp.svg, oilTemp.svg, battery.svg, tacho.svg, velo.svg,
                    fuel.svg, adblue.svg, air.svg, brake.svg, lcd, info.svg, avisos.svg];
    piezas.forEach(p => lienzo.appendChild(p));
    return {
      nombres: { tach: 4, speed: 5, screen: 10, info: 11, warn: 12 },
      formas: {
        wide: { vb: [1600, 600], cajas: [[20, 105, 190], [220, 105, 190], [20, 325, 190], [220, 325, 190],
                                         [415, 135, 370], [815, 135, 370],
                                         [1190, 105, 190], [1390, 105, 190], [1190, 325, 190], [1390, 325, 190],
                                         [670, 504, 260, 92], [400, 10, 800, 44], [560, 62, 480, 40]] },
        tall: { vb: [1000, 1190], cajas: [[15, 700, 235], [260, 700, 235], [505, 700, 235], [750, 700, 235],
                                          [20, 126, 470], [510, 126, 470],
                                          [15, 945, 235], [260, 945, 235], [505, 945, 235], [750, 945, 235],
                                          [370, 600, 260, 96], [60, 10, 880, 56], [200, 70, 600, 48]] },
        // El mapa entre el tacometro y el velocimetro, con el display de la
        // marcha debajo de el.
        mapaWide: { vb: [2200, 600], hueco: [800, 60, 600, 474],
                    cajas: [[20, 105, 190], [220, 105, 190], [20, 325, 190], [220, 325, 190],
                            [415, 135, 370], [1415, 135, 370],
                            [1790, 105, 190], [1990, 105, 190], [1790, 325, 190], [1990, 325, 190],
                            [800, 60, 600, 474], [800, 8, 600, 44], [800, 546, 600, 44]] },
        mapaTall: { vb: [1000, 1660], hueco: [20, 610, 960, 560],
                    cajas: [[15, 1185, 235], [260, 1185, 235], [505, 1185, 235], [750, 1185, 235],
                            [20, 126, 470], [510, 126, 470],
                            [15, 1425, 235], [260, 1425, 235], [505, 1425, 235], [750, 1425, 235],
                            [20, 610, 960, 560], [60, 10, 880, 56], [200, 70, 600, 48]] },
        // El mapa a la derecha: el tacometro y el velocimetro a los lados de
        // una columna con los ocho relojitos, de a dos.
        ladoDer: { vb: [1600, 600], hueco: [1040, 24, 536, 552],
                   cajas: [[378, 18, 138], [522, 18, 138], [378, 162, 138], [522, 162, 138],
                           [10, 130, 360], [668, 130, 360],
                           [378, 306, 138], [522, 306, 138], [378, 450, 138], [522, 450, 138],
                           [1040, 24, 536, 552], [10, 40, 360, 44], [668, 40, 360, 44]] },
      },
      piezas,
      // El display de la marcha en el hueco del mapa: el fondo hasta los
      // bordes y lo escrito al medio.
      pantalla(w, h) {
        const { dx, dy, W, H } = encajar(lcd, 260, 100, w, h);
        colocar(lFondo, [-dx + 2, -dy + 2, W - 4, H - 4]);
      },
      fondo(g, f) {
        s('rect', { x: 2, y: 2, width: f.vb[0] - 4, height: f.vb[1] - 4, rx: 28, fill: `url(#${pref}panel)`, class: 'tdPanel' }, g);
      },
      render(L, d) {
        const imp = L.imp;
        txt(uRpm, 'RPM ' + escalaRpm(tacho, L.esc).replace(' rpm', ''));
        // La unidad elegida afuera y la otra adentro, en rojo.
        const afuera = L.esc.speed;
        const adentro = imp ? { max: 140, major: 20, factor: TD_KM_TO_MI } : { max: 80, major: 10, factor: 1 / TD_KM_TO_MI };
        escalar(velo, Object.assign({}, afuera, { fmt: String, inner: adentro }), JSON.stringify(afuera));
        txt(uVel, imp ? 'MPH' : 'KM/H');
        txt(uVel2, imp ? 'km/h' : 'mph');
        poner(tacho, L.rpm);
        poner(velo, L.vel);
        marca(velo, 'limit', L.limite);
        marca(velo, 'cruise', L.crucero);

        const tC = imp ? '°F' : '°C';
        escalar(waterTemp, imp ? { min: 100, max: 250, major: 50, minor: 5, labels: 1, red: [[220, 250]], fmt: String }
                               : { min: 40, max: 120, major: 20, minor: 4, labels: 2, red: [[105, 120]], fmt: String }, tC);
        escalar(oilTemp, imp ? { min: 100, max: 300, major: 50, minor: 5, labels: 2, red: [[250, 300]], fmt: String }
                             : { min: 40, max: 140, major: 25, minor: 5, labels: 2, red: [[120, 140]], fmt: String }, tC);
        escalar(brake, imp ? { min: 0, max: 750, major: 150, minor: 3, labels: 2, red: [[570, 750]], fmt: String }
                           : { min: 0, max: 400, major: 100, minor: 4, labels: 2, red: [[300, 400]], fmt: String }, tC);
        escalar(battery, Object.assign({}, L.esc.battery, { labels: 2, fmt: String }), JSON.stringify(L.esc.battery));
        for (const r of [waterTemp, oilTemp, brake]) txt(r.unidad, tC);
        const alertas = L.alertas;
        poner(oilPress, d.oilPressure);
        txt(oilPress.lectura, d.oilPressure != null ? num(d.oilPressure) : null);
        poner(waterTemp, temp(d.waterTemperature));
        txt(waterTemp.lectura, d.waterTemperature != null ? num(temp(d.waterTemperature)) : null);
        poner(oilTemp, temp(d.oilTemperature));
        txt(oilTemp.lectura, d.oilTemperature != null ? num(temp(d.oilTemperature)) : null);
        poner(battery, d.batteryVoltage);
        txt(battery.lectura, d.batteryVoltage != null ? num(d.batteryVoltage, 1) : null);
        poner(fuel, L.fuelFrac);
        txt(fuel.lectura, dist(L.alcance));
        poner(adblue, L.adFrac);
        txt(adblue.lectura, L.adFrac != null ? num(L.adFrac * 100) + ' %' : null);
        poner(air, d.airPressure);
        txt(air.lectura, d.airPressure != null ? num(d.airPressure) : null);
        poner(brake, temp(d.brakeTemperature));
        txt(brake.lectura, d.brakeTemperature != null ? num(temp(d.brakeTemperature)) : null);
        oilPress.svg.classList.toggle('alerta', !!L.lamps.oilPressure);
        waterTemp.svg.classList.toggle('alerta', !!L.lamps.waterTemp);
        battery.svg.classList.toggle('alerta', !!L.lamps.battery);
        fuel.svg.classList.toggle('alerta', !!L.lamps.fuelLow);
        adblue.svg.classList.toggle('alerta', !!L.lamps.adblueLow);
        air.svg.classList.toggle('alerta', !!L.lamps.airPressure);
        oilTemp.svg.classList.toggle('alerta', d.oilTemperature > 125 || !!alertas.oilTemperature);
        brake.svg.classList.toggle('alerta', d.brakeTemperature > 300);

        txt(lMarcha, L.marcha);
        txt(lCc, L.crucero != null ? 'CC ' + num(L.crucero) : null);
        ver(lDescanso, L.descansoSeg != null);
        if (L.descansoSeg != null) {
          txt(lDescansoTxt, hm(L.descansoSeg));
          lDescansoTxt.classList.toggle('tdBad', L.dormir === true);
        }
        txt(lOdo, L.odo);
        info.poner(L.lamps);
        avisos.poner(L.lamps);
      },
    };
  }

  const cuadro = tipo === 'digital' ? armarDigital() : tipo === 'american' ? armarAmericano() : armarEuro();

  // --- los costados, en pantallas de 32:9 ---
  // En una tira de 2560 x 720 el cuadro solo dejaba un tercio de pantalla
  // negra a cada lado. Ahi va al medio, con el viaje a la izquierda y el
  // camion a la derecha, y la franja del trabajo se va: lo suyo esta en el
  // panel del viaje, y en 720 px de alto cada renglon cuenta.
  const enBar = (imp) => tipo === 'euro' || (tipo === 'digital' && !imp);

  function avanceLado(padre, y, ancho) {
    const g = s('g', {}, padre);
    s('rect', { x: 20, y: y - 4, width: ancho, height: 8, rx: 4, class: 'tdBarTrack' }, g);
    const hecho = s('rect', { x: 20, y: y - 4, width: 0, height: 8, rx: 4, class: 'tdBarFill' }, g);
    const bola = s('circle', { cx: 20, cy: y, r: 7, class: 'tdBarDot' }, g);
    return {
      poner(frac) {
        ver(g, frac != null);
        if (frac == null) return;
        hecho.setAttribute('width', (ancho * frac).toFixed(1));
        bola.setAttribute('cx', (20 + ancho * frac).toFixed(1));
      },
    };
  }

  function panelViaje() {
    const p = s('svg', { viewBox: '0 0 300 560', class: 'tdSide' });
    s('rect', { x: 1, y: 1, width: 298, height: 558, rx: 16, class: 'tdSideBg' }, p);
    const carga = texto(p, 20, 34, 'tdTxt tdTxtM', 'start');
    const masa = texto(p, 20, 62, 'tdTxt tdTxtS tdDim', 'start');
    s('line', { x1: 16, y1: 86, x2: 284, y2: 86, class: 'tdSep' }, p);
    const ciudad = texto(p, 20, 120, 'tdTxt tdTxtL', 'start');
    const empresa = texto(p, 20, 150, 'tdTxt tdTxtS tdDim', 'start');
    const lejos = texto(p, 20, 198, 'tdTxt tdTxtXL tdAccent', 'start');
    const lejosSub = texto(p, 20, 232, 'tdTxt tdTxtS tdDim', 'start');
    const avance = avanceLado(p, 256, 260);
    const fLlegada = renglon(p, 20, 304, 260, 'clock', 22);
    const fJuego = renglon(p, 20, 350, 260, 'globe', 22);
    const fPlazo = renglon(p, 20, 396, 260, 'deadline', 22);
    const fDescanso = renglon(p, 20, 442, 260, 'bed', 22);
    const pago = texto(p, 20, 514, 'tdTxt tdTxtM', 'start');
    return {
      svg: p,
      render(L, d) {
        if (L.enViaje) {
          txt(carga, cortar(d.cargo || t('noCargo'), 20));
          txt(masa, d.cargoMassKg ? formatCargoMass(d.cargoMassKg, idioma(), L.imp) : null);
          txt(ciudad, cortar(d.cityDst, 16));
          txt(empresa, cortar(d.companyDst, 30));
          txt(lejos, dist(L.restanteKm));
          txt(lejosSub, L.realSeg != null ? t('remainingLabel') + ' · ' + hm(L.realSeg) + ' ' + t('realShort') : t('remainingLabel'));
        } else {
          // Sin trabajo: la hora del juego y hasta donde llega el tanque.
          txt(carga, t('gameClock'));
          txt(masa, null);
          txt(ciudad, L.reloj);
          txt(empresa, null);
          txt(lejos, dist(L.alcance));
          txt(lejosSub, L.alcance != null ? t('range') : null);
        }
        avance.poner(L.progreso);
        fLlegada.poner(L.llegada, null);
        fJuego.poner(L.llegadaJuego, t('inGameShort'));
        fPlazo.poner(L.margen != null ? (L.margen >= 0 ? '+' : '−') + hm(L.margen) : null, null,
                     L.margen == null ? null : (L.margen >= 0 ? 'bien' : 'mal'));
        fDescanso.poner(L.descansoSeg != null ? hm(L.descansoSeg) : null,
                        L.descansoSeg != null ? hm(L.descansoSeg / L.sT) + ' ' + t('realShort') : null,
                        L.dormir == null ? null : (L.dormir ? 'mal' : 'bien'));
        txt(pago, L.enViaje && d.jobIncome && money ? money(d.jobIncome, d.game) : null);
      },
    };
  }

  // Dano en barra: el peor de las piezas, con el color de la escala del
  // moderno (DASH_DESGASTE_ESCALA).
  function danoLado(padre, y, clave) {
    const g = s('g', {}, padre);
    icono(g, clave, 18, y - 12, 24, 'tdDim');
    s('rect', { x: 54, y: y - 5, width: 150, height: 10, rx: 5, class: 'tdBarTrack' }, g);
    const lleno = s('rect', { x: 54, y: y - 5, width: 0, height: 10, rx: 5 }, g);
    const valor = texto(g, 282, y, 'tdTxt tdTxtM', 'end');
    return {
      poner(pct) {
        ver(g, pct != null);
        if (pct == null) return;
        let nivel = 'mal';
        for (const [tope, n] of DASH_DESGASTE_ESCALA) if (pct < tope) { nivel = n; break; }
        lleno.setAttribute('width', (150 * lim(pct / 100)).toFixed(1));
        lleno.setAttribute('class', 'tdLevel-' + nivel);
        txt(valor, num(pct) + ' %');
      },
    };
  }
  function filaLado(padre, y, clave) {
    const g = s('g', {}, padre);
    texto(g, 20, y, 'tdTxt tdTxtS tdDim', 'start').dataset.i18n = clave;
    const valor = texto(g, 282, y, 'tdTxt tdTxtM', 'end');
    return {
      poner(v, alerta) {
        ver(g, v != null);
        if (v == null) return;
        txt(valor, v);
        valor.classList.toggle('tdBad', !!alerta);
      },
    };
  }
  const peor = (o) => {
    const v = o ? Object.values(o).filter(x => x != null && isFinite(x)) : [];
    return v.length ? Math.max(...v) * 100 : null;
  };

  function panelCamion() {
    const p = s('svg', { viewBox: '0 0 300 560', class: 'tdSide' });
    s('rect', { x: 1, y: 1, width: 298, height: 558, rx: 16, class: 'tdSideBg' }, p);
    const nombre = texto(p, 20, 34, 'tdTxt tdTxtM', 'start');
    const odo = texto(p, 20, 62, 'tdTxt tdTxtS tdDim', 'start');
    s('line', { x1: 16, y1: 86, x2: 284, y2: 86, class: 'tdSep' }, p);
    const dCamion = danoLado(p, 122, 'truck');
    const dRemolque = danoLado(p, 170, 'trailerAttached');
    const dCarga = danoLado(p, 218, 'cargo');
    s('line', { x1: 16, y1: 250, x2: 284, y2: 250, class: 'tdSep' }, p);
    const fAceite = filaLado(p, 286, 'cOilTemp');
    const fAgua = filaLado(p, 330, 'cWaterTemp');
    const fFrenos = filaLado(p, 374, 'cBrakeTemp');
    const fPresion = filaLado(p, 418, 'cOilPress');
    const fAire = filaLado(p, 462, 'cAirPress');
    const fBateria = filaLado(p, 506, 'batteryLabel');
    return {
      svg: p,
      render(L, d) {
        txt(nombre, cortar([d.truckBrand, d.truckName].filter(Boolean).join(' '), 22));
        txt(odo, L.odo);
        dCamion.poner(peor(d.wear));
        dRemolque.poner(d.trailerAttached === false ? null : peor(d.trailerWear));
        dCarga.poner(L.enViaje && d.cargoDamage != null ? d.cargoDamage * 100 : null);
        const barras = enBar(L.imp);
        fAceite.poner(tempTexto(d.oilTemperature), d.oilTemperature > 125);
        fAgua.poner(tempTexto(d.waterTemperature), L.lamps.waterTemp);
        fFrenos.poner(tempTexto(d.brakeTemperature), d.brakeTemperature > 300);
        fPresion.poner(presionTexto(d.oilPressure, barras), L.lamps.oilPressure);
        fAire.poner(presionTexto(d.airPressure, barras), L.lamps.airPressure);
        fBateria.poner(d.batteryVoltage != null ? num(d.batteryVoltage, 1) + ' V' : null, L.lamps.battery);
      },
    };
  }

  const lados = [panelViaje(), panelCamion()];
  lados.forEach(l => lienzo.appendChild(l.svg));
  // 32:9: la apaisada al medio, con un panel a cada lado.
  function conLados(base) {
    const corrido = (c) => c && [c[0] + TD_SIDE_W, c[1], c[2], c[3]];
    return {
      vb: [base.vb[0] + 2 * TD_SIDE_W, base.vb[1]], base,
      cajas: base.cajas.map(corrido), hueco: corrido(base.hueco),
      lados: [[10, 20, 300, base.vb[1] - 40], [base.vb[0] + TD_SIDE_W + 10, 20, 300, base.vb[1] - 40]],
    };
  }
  // El mapa a la izquierda: la de la derecha dada vuelta (en el europeo
  // queda el velocimetro al lado del mapa, como en algunos camiones).
  function espejo(f) {
    const dar = (c) => c && [f.vb[0] - c[0] - c[2], c[1], c[2], c[3]];
    return { vb: f.vb, cajas: f.cajas.map(dar), hueco: dar(f.hueco) };
  }
  cuadro.formas.ladoIzq = espejo(cuadro.formas.ladoDer);
  cuadro.formas.ultra = conLados(cuadro.formas.wide);
  cuadro.formas.mapaUltra = conLados(cuadro.formas.mapaWide);
  cuadro.formas.ladoDerUltra = conLados(cuadro.formas.ladoDer);
  cuadro.formas.ladoIzqUltra = conLados(cuadro.formas.ladoIzq);
  // Las formas de cada lugar del hueco: apaisada, parada y de 32:9. Parado,
  // el mapa va siempre entre los relojes.
  const FORMAS_HUECO = {
    middle: ['mapaWide', 'mapaTall', 'mapaUltra'],
    left: ['ladoIzq', 'mapaTall', 'ladoIzqUltra'],
    right: ['ladoDer', 'mapaTall', 'ladoDerUltra'],
  };
  const formasUsadas = mapHole ? FORMAS_HUECO[mapHole] || FORMAS_HUECO.middle : ['wide', 'tall', 'ultra'];
  // El lugar del mapa: un rectangulo sin pintar en el hueco, para medir donde
  // quedo en la pantalla.
  const huecoEl = s('rect', { fill: 'none', 'pointer-events': 'none' }, lienzo);
  let huecoVisto = null;

  // Apaisado, vertical o 32:9: el que deja los relojes mas grandes en el
  // lugar que hay. El de 32:9 se decide con el alto entero, contando la
  // franja del trabajo: es la que se va en ese modo, y medirlo sin ella lo
  // haria ir y venir. El flotante y el del costado del mapa no llevan los
  // paneles de 32:9: ahi no tienen lugar.
  function acomodar() {
    const w = escena.clientWidth, h = escena.clientHeight;
    if (!w || !h) return;
    const alto = h + (franja.hidden ? 0 : franja.offsetHeight + (parseFloat(getComputedStyle(root).rowGap) || 0));
    const area = ([vw, vh]) => Math.pow(Math.min(w / vw, h / vh), 2) * vw * vh;
    const [ancha, parada, larga] = formasUsadas;
    const nueva = (!embebido || mapHole) && w / alto >= TD_ULTRA_RATIO ? larga
      : area(cuadro.formas[parada].vb) > area(cuadro.formas[ancha].vb) ? parada : ancha;
    if (nueva !== forma) {
      forma = nueva;
      const f = cuadro.formas[nueva];
      lienzo.setAttribute('viewBox', `0 0 ${f.vb[0]} ${f.vb[1]}`);
      fondo.textContent = '';
      cuadro.fondo(f.base ? s('g', { transform: `translate(${TD_SIDE_W} 0)` }, fondo) : fondo, f.base || f);
      if (f.hueco) {
        const [x, y, hw, hh] = f.hueco;
        s('rect', { x: x - 8, y: y - 8, width: hw + 16, height: hh + 16, rx: 18, class: 'tdHoleBezel' }, fondo);
        colocar(huecoEl, f.hueco);
      }
      cuadro.piezas.forEach((p, i) => colocar(p, f.cajas[i]));
      const caja = f.cajas[cuadro.nombres.screen];
      if (cuadro.pantalla) cuadro.pantalla(caja[2], caja[3] == null ? caja[2] : caja[3]);
      lados.forEach((l, i) => {
        ver(l.svg, !!f.lados);
        if (f.lados) colocar(l.svg, f.lados[i]);
      });
    }
    // Donde quedo el hueco en la pantalla. Cambia tambien sin cambiar de
    // forma, con solo agrandar la ventana.
    if (mapHole && onHole) {
      const r = huecoEl.getBoundingClientRect();
      const visto = [r.left, r.top, r.width, r.height].map(Math.round).join();
      if (visto !== huecoVisto) { huecoVisto = visto; onHole(r); }
    }
  }
  // render y no acomodar solo: al pasar a 32:9 o salir, la franja del
  // trabajo aparece o se va.
  const alCambiarTamano = () => { if (visible && (ultimo || embebido)) render(); };
  const observador = typeof ResizeObserver === 'function' ? new ResizeObserver(alCambiarTamano) : null;
  if (observador) observador.observe(escena);
  else window.addEventListener('resize', alCambiarTamano);

  // Lo que dibujan los tres, sacado una vez por dato.
  function leer(d) {
    const imp = mi();
    const f = imp ? TD_KM_TO_MI : 1;
    const sT = escalaTiempo();
    const enViaje = !!(d.onJob && d.cityDst);
    const restanteKm = enViaje && d.routeDistanceKm != null ? d.routeDistanceKm : null;
    // El estimado del juego corregido con el ritmo al que se viene manejando
    // (createPaceEta), como en el moderno y el clasico.
    const juegoCrudo = enViaje && d.routeTimeSeconds > 0 ? d.routeTimeSeconds : null;
    const realSeg = enViaje ? ritmo.estimate(juegoCrudo != null ? juegoCrudo / sT : null, d.ts) : null;
    const viajeJuegoSeg = realSeg != null ? realSeg * sT : null;
    const plazo = jobDeadlineSeconds(d); // sin el "sin plazo" del SDK (pure.js)
    const descansoMin = restMinutesOf(d); // sin la fatiga apagada (pure.js)
    const descansoSeg = descansoMin != null ? descansoMin * 60 : null;
    return {
      imp, sT,
      esc: truckGaugeScales(d, imp),
      // Antes del primer dato, todos apagados: si no, la fila de testigos de
      // un tablero embebido quedaba vacia y no habia de donde agarrarla.
      lamps: ultimo ? truckDashLamps(d)
        : Object.fromEntries([...TD_LAMPS_INFO, ...TD_LAMPS_WARN].map(k => [k, false])),
      alertas: d.mechanicalWarnings || {},
      vel: Math.abs(d.speedKmh || 0) * f,
      limite: d.speedLimitKmh > 0 ? d.speedLimitKmh * f : null,
      exceso: d.speedLimitKmh > 0 && d.speedKmh > d.speedLimitKmh + 2,
      crucero: d.cruiseControl && d.cruiseControlSpeedKmh > 0 ? d.cruiseControlSpeedKmh * f : null,
      rpm: d.engineRpm || 0,
      marcha: formatGear(d.gear),
      retarder: d.retarder > 0 && d.retarderSteps > 0 ? d.retarder + '/' + d.retarderSteps : null,
      fuelFrac: d.fuel != null && d.fuelCapacity ? lim(d.fuel / d.fuelCapacity) : null,
      adFrac: d.adblue != null && d.adblueCapacity ? lim(d.adblue / d.adblueCapacity) : null,
      alcance: autonomia(d),
      consumo: combustible.avgLPer100() || d.fuelAvgConsumption || null,
      enViaje, restanteKm, realSeg, viajeJuegoSeg, descansoSeg,
      margen: enViaje && plazo != null && viajeJuegoSeg != null ? plazo - viajeJuegoSeg : null,
      dormir: descansoSeg != null && viajeJuegoSeg != null ? descansoSeg < viajeJuegoSeg : null,
      progreso: enViaje && d.plannedDistanceKm && restanteKm != null ? lim(1 - restanteKm / d.plannedDistanceKm) : null,
      reloj: relojJuego(d.gameTimeMinutes),
      llegada: realSeg != null ? reloj(new Date(Date.now() + realSeg * 1000)) : null,
      llegadaJuego: viajeJuegoSeg != null && d.gameTimeMinutes != null ? relojJuego(d.gameTimeMinutes + viajeJuegoSeg / 60) : null,
      odo: d.odometerKm != null ? dist(Math.floor(d.odometerKm)) : null,
    };
  }

  // La franja del trabajo, igual en los tres.
  function renderFranja(L, d) {
    franja.hidden = !L.enViaje;
    if (!L.enViaje) return;
    const nombre = (v) => { jobCargo.hidden = !v; jobCargo.textContent = v || ''; };
    nombre([d.cargo || t('noCargo'), d.cargoMassKg ? formatCargoMass(d.cargoMassKg, idioma(), L.imp) : null]
      .filter(Boolean).join(' · '));
    jobRoute.textContent = [[d.citySrc, d.cityDst].filter(Boolean).join(' → '), dist(L.restanteKm)]
      .filter(Boolean).join(' · ');
    let claim = null, bien = null;
    if (L.margen != null) {
      claim = L.margen >= 0 ? t('deadlineEarly', dur(L.margen)) : t('deadlineLate', dur(-L.margen));
      bien = L.margen >= 0;
    }
    if (L.dormir) {
      claim = [claim, t('sleepNeeded')].filter(Boolean).join(' · ');
      bien = false;
    }
    jobClaim.hidden = claim == null;
    jobClaim.textContent = claim || '';
    jobClaim.classList.toggle('bien', bien === true);
    jobClaim.classList.toggle('mal', bien === false);
    const pago = d.jobIncome && money ? money(d.jobIncome, d.game) : null;
    jobPay.hidden = !pago;
    jobPay.textContent = pago || '';
  }

  function render() {
    const d = ultimo || (embebido ? TD_MUESTRA : null);
    esperando.hidden = !!d;
    escena.hidden = !d;
    if (!d || embebido) franja.hidden = true;
    if (!d || !visible) return;
    const L = leer(d);
    if (!embebido) renderFranja(L, d);
    acomodar();
    if (forma && cuadro.formas[forma].lados) {
      franja.hidden = true;
      lados.forEach(l => l.render(L, d));
    }
    if (barrido === 'pending' && ultimo) {
      // Con "reducir movimiento" (ajuste del sistema) no hay barrido: las
      // agujas van directo al dato.
      if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) barrido = 'done';
      else barrer();
    }
    cuadro.render(L, d);
  }

  // Al primer dato a la vista las agujas van al tope y vuelven, como al dar
  // contacto en un camion de verdad.
  function barrer() {
    barrido = 'running';
    root.classList.add('tdSweeping');
    for (const r of relojes) r.mover(r, r.spec.max, true);
    setTimeout(() => {
      for (const r of relojes) r.mover(r, r.valor != null ? r.valor : r.spec.min, true);
      setTimeout(() => { barrido = 'done'; root.classList.remove('tdSweeping'); render(); }, TD_SWEEP_MS);
    }, TD_SWEEP_MS + 50);
  }

  return {
    applyTranslations() {
      root.querySelectorAll('[data-i18n]').forEach(n => { n.textContent = t(n.dataset.i18n); });
      root.querySelectorAll('[data-i18n-title]').forEach(n => { n.title = t(n.dataset.i18nTitle); });
      render();
    },
    update(data) {
      ultimo = data;
      escala.push(data.gameTimeMinutes, data.ts);
      if (data.onJob && data.cityDst) ritmo.push(data.cityDst, data.ts, data.routeDistanceKm);
      combustible.push(data.odometerKm, data.fuel, [data.game, data.truckBrand, data.truckName].join('|'));
      render();
    },
    refresh() { render(); },
    setVisible(v) { visible = !!v; if (v) render(); },
    resetSession() {},
    hasData() { return ultimo != null; },
    // Para cambiar de modo o de estilo en la vista del mapa se arma uno nuevo.
    destroy() {
      visible = false;
      if (observador) observador.disconnect();
      else window.removeEventListener('resize', alCambiarTamano);
      root.textContent = '';
      root.classList.remove('tdRoot', 'td-' + tipo, 'tdEmbed');
    },
  };
}

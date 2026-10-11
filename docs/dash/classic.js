// Tablero clasico: relojes de aguja, como el de un camion de verdad (pedido
// de Discord, 11-10, con capturas de un tablero de 18 relojes para ATS y la
// referencia de The Dispatcher, que vende estilos "Classic"). Es otro estilo
// del mismo tablero: la pagina de docs/dash/ y la app eligen uno u otro con
// createDashStyles, y los dos reciben la misma telemetria (el moderno sigue
// sumando la sesion aunque no se vea).
//
// Misma interfaz que createDashPanel: update, refresh, applyTranslations,
// setVisible, hasData. Necesita dash.js antes (DASH_ICONS, DASH_INDICATORS,
// DASH_NOMINAL_SCALE) y pure.js (gaugeAngle, gaugeScaleMax y los mismos
// estimadores que el moderno).
//
// Lo que el juego no informa no tiene reloj: sin AdBlue (camion viejo) o sin
// plazo (manejo libre) esa celda se va, igual que en el moderno. No hay
// relojes de la PC (CPU, GPU, FPS) como en la captura de referencia: eso no
// es del camion y el cliente no lo mide.

const CLASSIC_NS = 'http://www.w3.org/2000/svg';
// Tope de la autonomia segun lo que da el tanque lleno.
const CLASSIC_RANGE_KM = [500, 1000, 2000, 3000, 4000, 6000];
const CLASSIC_RANGE_MI = [300, 600, 1200, 2000, 3000, 4000];
// Rango del reloj del plazo, en horas de juego a cada lado del "a tiempo".
const CLASSIC_ONTIME_H = 12;
// Barrido de las agujas al arrancar: de cero al tope y a su valor.
const CLASSIC_SWEEP_MS = 650;
// Recorrido de la aguja, en grados. Con 270 el cero y el tope quedaban
// encima del recuadro de abajo.
const CLASSIC_SWEEP_DEG = 240;

function createClassicDash({ root, imperial, lang }) {
  const KM_TO_MI = 0.621371;
  const escala = createTimeScale();
  const ritmo = createPaceEta();
  const combustible = createFuelTracker();
  let ultimo = null;
  let visible = true;
  // 'pending' hasta el primer dato a la vista; 'running' mientras barre.
  let barrido = 'pending';
  const gauges = {};
  const refs = {};

  const mi = () => (imperial ? imperial() : false);
  const idioma = () => (lang ? lang() : 'en');
  function num(v, dec) {
    return Number(v).toLocaleString(idioma(), { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
  }
  const aF = (c) => c * 9 / 5 + 32;

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function s(tag, attrs, padre) {
    const node = document.createElementNS(CLASSIC_NS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (padre) padre.appendChild(node);
    return node;
  }
  // Punto a radio r y angulo a (grados desde las 12, sentido horario).
  function punto(r, a) {
    const rad = a * Math.PI / 180;
    return [100 + r * Math.sin(rad), 100 - r * Math.cos(rad)];
  }
  function arco(r, a0, a1) {
    const [x0, y0] = punto(r, a0), [x1, y1] = punto(r, a1);
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }

  root.classList.add('classicRoot');
  root.textContent = '';
  // Degradados compartidos por todos los relojes de este tablero.
  const defs = s('svg', { width: 0, height: 0, 'aria-hidden': 'true', class: 'cDefs' });
  defs.innerHTML = `<defs>
    <linearGradient id="cdBezel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b717a"/><stop offset="0.45" stop-color="#2a2e34"/><stop offset="1" stop-color="#0c0d0f"/></linearGradient>
    <radialGradient id="cdFace" cx="0.5" cy="0.42" r="0.6"><stop offset="0" stop-color="#23272c"/><stop offset="1" stop-color="#060708"/></radialGradient>
    <radialGradient id="cdHub" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#5b6068"/><stop offset="1" stop-color="#15171a"/></radialGradient>
  </defs>`;
  root.appendChild(defs);

  // Un reloj de aguja. spec: { min, max, major, minor, labels (cada cuantas
  // marcas mayores va un numero), fmt (texto de cada numero), red, green
  // ([desde, hasta] en unidades del reloj), labelKey, big }.
  function reloj(padre, id, spec) {
    const celda = padre.appendChild(el('div', spec.big ? 'cGauge cGaugeBig' : 'cGauge'));
    const svgEl = s('svg', { viewBox: '0 0 200 200', class: 'cDial' }, celda);
    const g = { spec, celda, svg: svgEl, valor: null, angulo: null, lcdTexto: null };
    dibujarCara(g);
    gauges[id] = g;
    return g;
  }

  function dibujarCara(g) {
    const { spec, svg: svgEl } = g;
    svgEl.textContent = '';
    s('circle', { cx: 100, cy: 100, r: 99, fill: 'url(#cdBezel)' }, svgEl);
    s('circle', { cx: 100, cy: 100, r: 91, fill: '#000' }, svgEl);
    s('circle', { cx: 100, cy: 100, r: 89, fill: 'url(#cdFace)' }, svgEl);
    const ang = (v) => gaugeAngle(v, spec.min, spec.max, CLASSIC_SWEEP_DEG);
    for (const [cls, zonas] of [['cZoneRed', spec.red], ['cZoneGreen', spec.green]]) {
      for (const [a, b] of zonas || []) {
        s('path', { d: arco(84, ang(a), ang(b)), class: cls }, svgEl);
      }
    }
    const pasos = Math.round((spec.max - spec.min) / spec.major) * (spec.minor || 1);
    for (let i = 0; i <= pasos; i++) {
      const v = spec.min + i * spec.major / (spec.minor || 1);
      const mayor = i % (spec.minor || 1) === 0;
      const a = ang(v);
      const [x0, y0] = punto(87, a), [x1, y1] = punto(mayor ? 74 : 80, a);
      const enRojo = (spec.red || []).some(([r0, r1]) => v >= r0 && v <= r1);
      s('line', { x1: x0, y1: y0, x2: x1, y2: y1, class: (mayor ? 'cTickMajor' : 'cTickMinor') + (enRojo ? ' cTickRed' : '') }, svgEl);
      const nMayor = Math.round(i / (spec.minor || 1));
      if (mayor && spec.fmt && nMayor % (spec.labels || 1) === 0) {
        const [tx, ty] = punto(spec.big ? 60 : 59, a);
        s('text', { x: tx, y: ty + (spec.big ? 6 : 5.5), class: 'cNum' + (spec.big ? ' cNumBig' : '') }, svgEl)
          .textContent = spec.fmt(v);
      }
    }
    for (const [clave, x, ancla] of spec.ends || []) {
      const fin = s('text', { x, y: 168, class: 'cEnd', 'text-anchor': ancla }, svgEl);
      fin.dataset.i18n = clave;
      fin.textContent = t(clave);
    }
    // Marcas sobre el borde (limite de velocidad, crucero): un triangulito
    // que gira como la aguja.
    g.marcas = {};
    for (const [nombre, cls] of spec.marks || []) {
      const m = s('path', { d: 'M 100 9 L 94 1 L 106 1 Z', class: 'cMark ' + cls }, svgEl);
      m.style.display = 'none';
      g.marcas[nombre] = m;
    }
    const etiqueta = s('text', { x: 100, y: spec.big ? 128 : 124, class: 'cLabel' + (spec.big ? ' cLabelBig' : '') }, svgEl);
    if (spec.labelKey) { etiqueta.dataset.i18n = spec.labelKey; etiqueta.textContent = t(spec.labelKey); }
    g.etiqueta = etiqueta;
    s('rect', { x: spec.big ? 58 : 60, y: spec.big ? 136 : 131, width: spec.big ? 84 : 80, height: spec.big ? 28 : 26, rx: 3, class: 'cLcdBox' }, svgEl);
    g.lcd = s('text', { x: 100, y: spec.big ? 156.5 : 150, class: 'cLcd' + (spec.big ? ' cLcdBig' : '') }, svgEl);
    g.lcdTexto = null;
    g.aguja = s('g', { class: 'cNeedle' }, svgEl);
    s('path', { d: 'M 96.6 100 L 99.3 22 L 100.7 22 L 103.4 100 Z', class: 'cNeedleBody' }, g.aguja);
    s('path', { d: 'M 97.2 100 L 102.8 100 L 101.6 117 L 98.4 117 Z', class: 'cNeedleBody' }, g.aguja);
    s('circle', { cx: 100, cy: 100, r: 10, fill: 'url(#cdHub)', stroke: '#000', 'stroke-width': 1.5 }, svgEl);
    s('circle', { cx: 100, cy: 100, r: 3.2, fill: '#c41d17' }, svgEl);
    g.angulo = null;
  }

  function moverAguja(g, valor, forzar) {
    const a = gaugeAngle(valor, g.spec.min, g.spec.max, CLASSIC_SWEEP_DEG);
    if (!forzar && g.angulo != null && Math.abs(a - g.angulo) < 0.2) return;
    g.angulo = a;
    g.aguja.style.transform = `rotate(${a.toFixed(1)}deg)`;
  }
  function marca(g, nombre, valor) {
    const m = g.marcas[nombre];
    if (!m) return;
    m.style.display = valor == null ? 'none' : '';
    if (valor != null) m.style.transform = `rotate(${gaugeAngle(valor, g.spec.min, g.spec.max, CLASSIC_SWEEP_DEG).toFixed(1)}deg)`;
  }
  // valor null esconde la celda: el juego no lo informa.
  function poner(id, valor, lcd, alerta) {
    const g = gauges[id];
    if (!g) return;
    g.celda.hidden = valor == null;
    if (valor == null) return;
    g.valor = valor;
    if (barrido !== 'running') moverAguja(g, valor);
    if (lcd !== g.lcdTexto) { g.lcd.textContent = lcd; g.lcdTexto = lcd; }
    g.celda.classList.toggle('alerta', !!alerta);
  }
  // Cambia la escala de un reloj (unidades, otro camion) y lo redibuja.
  function escalar(id, spec) {
    const g = gauges[id];
    const viejo = g.spec;
    const igual = ['min', 'max', 'major', 'labels', 'minor'].every(k => viejo[k] === spec[k])
      && JSON.stringify(viejo.red) === JSON.stringify(spec.red) && viejo.unitTag === spec.unitTag;
    if (igual) return;
    g.spec = Object.assign({}, viejo, spec);
    dibujarCara(g);
  }

  // --- arriba: tacometro, centro y velocimetro ---
  const arriba = root.appendChild(el('section', 'cTop'));
  reloj(arriba, 'rpm', { big: true, min: 0, max: 2500, major: 500, minor: 5, fmt: (v) => String(v / 100), labelKey: null });
  const centro = arriba.appendChild(el('div', 'cCenter'));
  const giros = centro.appendChild(el('div', 'cBlinkers'));
  refs.bl = giros.appendChild(el('span', 'cBlink')); refs.bl.appendChild(svgIcono(DASH_ICONS.blinkerLeft));
  refs.gear = giros.appendChild(el('span', 'cGear', 'N'));
  refs.br = giros.appendChild(el('span', 'cBlink')); refs.br.appendChild(svgIcono(DASH_ICONS.blinkerRight));
  refs.cruise = centro.appendChild(el('div', 'cCruise'));
  const lamparas = centro.appendChild(el('div', 'cLamps'));
  for (const [clave, titulo] of DASH_INDICATORS) {
    if (clave === 'blinkerLeft' || clave === 'blinkerRight') continue;
    const chip = el('span', 'cLamp cLamp-' + clave);
    chip.dataset.i18nTitle = titulo;
    chip.appendChild(svgIcono(DASH_ICONS[clave]));
    refs['lamp_' + clave] = lamparas.appendChild(chip);
  }
  reloj(arriba, 'speed', { big: true, min: 0, max: 140, major: 20, minor: 2, fmt: (v) => String(v), labelKey: null,
                           marks: [['limit', 'cMarkLimit'], ['cruise', 'cMarkCruise']] });

  // --- el trabajo, en un renglon ---
  const trabajo = refs.job = root.appendChild(el('section', 'cJob'));
  refs.jobCargo = trabajo.appendChild(el('span', 'cJobCargo'));
  refs.jobDest = trabajo.appendChild(el('span', 'cJobDest'));

  // --- los relojes chicos ---
  const grilla = root.appendChild(el('section', 'cGrid'));
  const pct = (v) => String(v);
  reloj(grilla, 'oilPress', { min: 0, max: 100, major: 25, minor: 5, fmt: pct, red: [[0, 15]], labelKey: 'cOilPress' });
  reloj(grilla, 'oilTemp', { min: 40, max: 140, major: 20, minor: 2, fmt: pct, red: [[120, 140]], labelKey: 'cOilTemp' });
  reloj(grilla, 'waterTemp', { min: 40, max: 120, major: 20, minor: 2, fmt: pct, red: [[105, 120]], labelKey: 'cWaterTemp' });
  reloj(grilla, 'airPress', { min: 0, max: 150, major: 30, minor: 3, fmt: pct, red: [[0, 60]], labelKey: 'cAirPress' });
  reloj(grilla, 'brakeTemp', { min: 0, max: 400, major: 100, minor: 4, fmt: pct, red: [[300, 400]], labelKey: 'cBrakeTemp' });
  reloj(grilla, 'battery', { min: 16, max: 32, major: 4, minor: 4, fmt: pct, red: [[16, 22]], labelKey: 'batteryLabel' });
  reloj(grilla, 'fuel', { min: 0, max: 100, major: 25, minor: 5, fmt: pct, red: [[0, 15]], labelKey: 'fuel' });
  reloj(grilla, 'adblue', { min: 0, max: 100, major: 25, minor: 5, fmt: pct, red: [[0, 10]], labelKey: 'adblueLabel' });
  reloj(grilla, 'range', { min: 0, max: 1000, major: 250, minor: 5, fmt: pct, red: [[0, 100]], labelKey: 'range' });
  reloj(grilla, 'consumption', { min: 0, max: 60, major: 10, minor: 2, fmt: pct, labelKey: 'cConsumption' });
  reloj(grilla, 'onTime', { min: -CLASSIC_ONTIME_H, max: CLASSIC_ONTIME_H, major: 6, minor: 3, labelKey: 'cOnTime',
                            green: [[-CLASSIC_ONTIME_H, 0]], red: [[0, CLASSIC_ONTIME_H]],
                            ends: [['cEarly', 44, 'middle'], ['cLate', 156, 'middle']] });
  // El reloj del juego: dos agujas.
  const celdaReloj = grilla.appendChild(el('div', 'cGauge'));
  refs.clock = construirReloj(celdaReloj);

  const esperando = refs.esperando = root.appendChild(el('div', 'cWaiting'));
  esperando.dataset.i18n = 'panelEmptyTitle';

  function svgIcono(paths) {
    const node = s('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.9',
                            'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    node.innerHTML = paths;
    return node;
  }

  function construirReloj(celda) {
    const svgEl = s('svg', { viewBox: '0 0 200 200', class: 'cDial' }, celda);
    s('circle', { cx: 100, cy: 100, r: 99, fill: 'url(#cdBezel)' }, svgEl);
    s('circle', { cx: 100, cy: 100, r: 91, fill: '#000' }, svgEl);
    s('circle', { cx: 100, cy: 100, r: 89, fill: 'url(#cdFace)' }, svgEl);
    for (let i = 0; i < 60; i++) {
      const a = i * 6, mayor = i % 5 === 0;
      const [x0, y0] = punto(87, a), [x1, y1] = punto(mayor ? 76 : 82, a);
      s('line', { x1: x0, y1: y0, x2: x1, y2: y1, class: mayor ? 'cTickMajor' : 'cTickMinor' }, svgEl);
    }
    for (const [h, a] of [[12, 0], [3, 90], [6, 180], [9, 270]]) {
      const [tx, ty] = punto(64, a);
      s('text', { x: tx, y: ty + 6, class: 'cNum' }, svgEl).textContent = String(h);
    }
    const etiqueta = s('text', { x: 100, y: 124, class: 'cLabel' }, svgEl);
    etiqueta.dataset.i18n = 'gameClock';
    etiqueta.textContent = t('gameClock');
    s('rect', { x: 60, y: 131, width: 80, height: 26, rx: 3, class: 'cLcdBox' }, svgEl);
    const lcd = s('text', { x: 100, y: 150, class: 'cLcd' }, svgEl);
    const hora = s('path', { d: 'M 97 100 L 99 52 L 101 52 L 103 100 Z', class: 'cHand' }, svgEl);
    const minuto = s('path', { d: 'M 98 100 L 99.4 26 L 100.6 26 L 102 100 Z', class: 'cHand' }, svgEl);
    s('circle', { cx: 100, cy: 100, r: 6, fill: 'url(#cdHub)', stroke: '#000' }, svgEl);
    return { celda, lcd, hora, minuto, texto: null };
  }

  // --- render ---
  function escalaTiempo() {
    const medido = escala.value();
    return medido != null ? medido : (DASH_NOMINAL_SCALE[ultimo && ultimo.game] || 19);
  }

  function ajustarEscalas(d) {
    const imp = mi();
    // Temperaturas: en millas, Fahrenheit (lo de un camion americano).
    escalar('oilTemp', imp ? { min: 100, max: 280, major: 30, minor: 3, red: [[250, 280]], unitTag: 'F' }
                           : { min: 40, max: 140, major: 20, minor: 2, red: [[120, 140]], unitTag: 'C' });
    escalar('waterTemp', imp ? { min: 100, max: 250, major: 30, minor: 3, red: [[220, 250]], unitTag: 'F' }
                             : { min: 40, max: 120, major: 20, minor: 2, red: [[105, 120]], unitTag: 'C' });
    escalar('brakeTemp', imp ? { min: 0, max: 750, major: 150, minor: 3, red: [[570, 750]], unitTag: 'F' }
                             : { min: 0, max: 400, major: 100, minor: 4, red: [[300, 400]], unitTag: 'C' });
    escalar('consumption', imp ? { min: 0, max: 15, major: 3, minor: 3, unitTag: 'mpg' }
                               : { min: 0, max: 60, major: 10, minor: 2, unitTag: 'l' });
    escalar('speed', imp ? { min: 0, max: 90, major: 10, minor: 2, unitTag: 'mph' }
                         : { min: 0, max: 140, major: 20, minor: 2, unitTag: 'kmh' });
    // Bateria: 12 o 24 V segun el camion, decidido por lo que marca.
    if (d.batteryVoltage != null) {
      escalar('battery', d.batteryVoltage > 18 ? { min: 16, max: 32, major: 4, minor: 4, red: [[16, 22]] }
                                               : { min: 8, max: 16, major: 2, minor: 4, red: [[8, 11]] });
    }
    // Tacometro hasta el tope del motor, redondeado a 500.
    const rpmTope = Math.max(1500, Math.ceil((d.engineRpmMax || 2500) / 500) * 500);
    escalar('rpm', { min: 0, max: rpmTope, major: 500, minor: 5, labels: rpmTope > 3000 ? 2 : 1,
                     red: [[Math.round(rpmTope * 0.88 / 100) * 100, rpmTope]],
                     green: rpmTope <= 3000 ? [[1000, 1500]] : null });
    // Autonomia: el tope es lo que da el tanque lleno.
    const alcance = autonomia(d);
    const frac = d.fuel != null && d.fuelCapacity ? d.fuel / d.fuelCapacity : null;
    if (alcance != null) {
      const lleno = frac > 0.05 ? alcance / frac : alcance;
      const tope = gaugeScaleMax(imp ? lleno * KM_TO_MI : lleno, imp ? CLASSIC_RANGE_MI : CLASSIC_RANGE_KM);
      escalar('range', { min: 0, max: tope, major: tope / 4, minor: 5, red: [[0, tope * 0.1]], unitTag: imp ? 'mi' : 'km' });
    }
  }

  function autonomia(d) {
    const medido = combustible.avgLPer100();
    return medido && d.fuel != null ? d.fuel / medido * 100 : d.fuelRangeKm;
  }
  function hm(seg) {
    const total = Math.round(Math.abs(seg) / 60);
    return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
  }

  function render() {
    const d = ultimo;
    refs.esperando.hidden = !!d;
    for (const n of [arriba, trabajo, grilla]) n.hidden = !d;
    if (!d || !visible) return;
    ajustarEscalas(d);
    if (barrido === 'pending') barrer();
    const imp = mi();
    const alertas = d.mechanicalWarnings || {};
    const temp = (c) => (c == null ? null : (imp ? aF(c) : c));
    const unidadT = imp ? '°F' : '°C';

    const rpm = d.engineRpm || 0;
    poner('rpm', rpm, num(rpm), rpm > (d.engineRpmMax || 2500) * 0.95);
    const vel = Math.abs(d.speedKmh || 0) * (imp ? KM_TO_MI : 1);
    const odo = d.odometerKm != null ? num(Math.floor(d.odometerKm * (imp ? KM_TO_MI : 1))) : '--';
    poner('speed', vel, odo);
    const limite = d.speedLimitKmh > 0 ? d.speedLimitKmh * (imp ? KM_TO_MI : 1) : null;
    marca(gauges.speed, 'limit', limite);
    marca(gauges.speed, 'cruise', d.cruiseControl && d.cruiseControlSpeedKmh > 0 ? d.cruiseControlSpeedKmh * (imp ? KM_TO_MI : 1) : null);
    gauges.speed.etiqueta.textContent = imp ? 'MPH' : 'KM/H';
    gauges.rpm.etiqueta.textContent = 'RPM ×100';

    refs.gear.textContent = d.gear === 0 || d.gear == null ? 'N' : (d.gear < 0 ? 'R' + (d.gear < -1 ? -d.gear : '') : String(d.gear));
    const luces = d.lights || {};
    refs.bl.classList.toggle('on', !!(luces.blinkerLeft));
    refs.br.classList.toggle('on', !!(luces.blinkerRight));
    refs.cruise.textContent = d.cruiseControl && d.cruiseControlSpeedKmh > 0
      ? '▶ ' + num(d.cruiseControlSpeedKmh * (imp ? KM_TO_MI : 1)) : '';
    const encendido = {
      beamLow: luces.beamLow, beamHigh: luces.beamHigh, parking: luces.parking,
      hazards: luces.hazards, beacon: luces.beacon, wipers: d.wipers, motorBrake: d.motorBrake,
      retarder: d.retarderSteps > 0 ? d.retarder > 0 : undefined,
      differentialLock: d.differentialLock, parkingBrake: d.parkingBrake,
      liftAxle: d.liftAxle, trailerAttached: d.trailerAttached,
    };
    for (const clave in encendido) {
      const chip = refs['lamp_' + clave];
      if (!chip) continue;
      chip.classList.toggle('on', !!encendido[clave]);
      chip.hidden = encendido[clave] === undefined;
    }

    const enViaje = !!(d.onJob && d.cityDst);
    trabajo.hidden = !enViaje;
    if (enViaje) {
      refs.jobCargo.textContent = [d.cargo, d.cargoMassKg ? num(d.cargoMassKg / 1000, 1) + ' t' : null].filter(Boolean).join(' · ');
      refs.jobDest.textContent = [d.companyDst, d.cityDst].filter(Boolean).join(', ');
    }

    poner('oilPress', d.oilPressure, d.oilPressure != null ? num(d.oilPressure) + ' psi' : '', alertas.oilPressure);
    poner('oilTemp', temp(d.oilTemperature), d.oilTemperature != null ? num(temp(d.oilTemperature)) + unidadT : '', d.oilTemperature > 125);
    poner('waterTemp', temp(d.waterTemperature), d.waterTemperature != null ? num(temp(d.waterTemperature)) + unidadT : '', alertas.waterTemperature);
    poner('airPress', d.airPressure, d.airPressure != null ? num(d.airPressure) + ' psi' : '', alertas.airPressure);
    poner('brakeTemp', temp(d.brakeTemperature), d.brakeTemperature != null ? num(temp(d.brakeTemperature)) + unidadT : '', d.brakeTemperature > 300);
    poner('battery', d.batteryVoltage, d.batteryVoltage != null ? num(d.batteryVoltage, 1) + ' V' : '', alertas.batteryVoltage);
    const fuelPct = d.fuel != null && d.fuelCapacity ? d.fuel / d.fuelCapacity * 100 : null;
    poner('fuel', fuelPct, fuelPct != null ? num(fuelPct) + ' %' : '', alertas.fuel);
    const adPct = d.adblue != null && d.adblueCapacity ? d.adblue / d.adblueCapacity * 100 : null;
    poner('adblue', adPct, adPct != null ? num(adPct) + ' %' : '', alertas.adblue);
    const alcance = autonomia(d);
    const alcanceU = alcance != null ? alcance * (imp ? KM_TO_MI : 1) : null;
    poner('range', alcanceU, alcanceU != null ? num(alcanceU) + (imp ? ' mi' : ' km') : '');
    const consumo = combustible.avgLPer100() || d.fuelAvgConsumption || null;
    const consumoU = consumo ? (imp ? 235.215 / consumo : consumo) : null;
    poner('consumption', consumoU, consumoU != null ? num(consumoU, 1) + (imp ? ' mpg' : ' l') : '');

    // Plazo: con el ritmo al que se viene manejando, como la tarjeta de
    // llegada del moderno. A la izquierda temprano, a la derecha tarde.
    const sT = escalaTiempo();
    const juegoCrudo = enViaje && d.routeTimeSeconds > 0 ? d.routeTimeSeconds : null;
    const realSeg = enViaje ? ritmo.estimate(juegoCrudo != null ? juegoCrudo / sT : null, d.ts) : null;
    const margen = enViaje && d.jobDeadlineSeconds != null && realSeg != null ? d.jobDeadlineSeconds - realSeg * sT : null;
    poner('onTime', margen != null ? -margen / 3600 : null,
          margen != null ? (margen >= 0 ? '+' : '−') + hm(margen) : '', margen != null && margen < 0);

    const c = gameClockFromMinutes(d.gameTimeMinutes);
    refs.clock.celda.hidden = !c;
    if (c) {
      const texto = String(c.hours).padStart(2, '0') + ':' + String(c.minutes).padStart(2, '0');
      if (texto !== refs.clock.texto) {
        refs.clock.texto = texto;
        refs.clock.lcd.textContent = texto;
        refs.clock.hora.style.transform = `rotate(${((c.hours % 12) + c.minutes / 60) * 30}deg)`;
        refs.clock.minuto.style.transform = `rotate(${c.minutes * 6}deg)`;
      }
    }
  }

  // Al primer dato a la vista las agujas van al tope y vuelven a su valor,
  // como al dar contacto en un camion de verdad.
  function barrer() {
    barrido = 'running';
    root.classList.add('cSweeping');
    for (const id in gauges) moverAguja(gauges[id], gauges[id].spec.max, true);
    setTimeout(() => {
      for (const id in gauges) moverAguja(gauges[id], gauges[id].valor != null ? gauges[id].valor : gauges[id].spec.min, true);
      setTimeout(() => { barrido = 'done'; root.classList.remove('cSweeping'); render(); }, CLASSIC_SWEEP_MS);
    }, CLASSIC_SWEEP_MS + 50);
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
  };
}

// Los dos estilos del tablero juntos, con la interfaz de uno solo. Los dos
// reciben cada dato (el moderno suma la sesion aunque no se vea; el clasico
// mide el consumo); solo el elegido dibuja. La eleccion se guarda en
// localStorage y es una por navegador: la pagina suelta y la app comparten
// la clave.
const DASH_STYLE_KEY = 'truckdash_dash_style';
const DASH_STYLES = ['modern', 'classic'];

function createDashStyles({ root, money, imperial, lang, style }) {
  const raizModerno = root.appendChild(document.createElement('div'));
  const raizClasico = root.appendChild(document.createElement('div'));
  const paneles = {
    modern: createDashPanel({ root: raizModerno, money, imperial, lang }),
    classic: createClassicDash({ root: raizClasico, imperial, lang }),
  };
  const raices = { modern: raizModerno, classic: raizClasico };
  let actual = DASH_STYLES.includes(style) ? style : 'modern';
  let visible = true;
  function aplicar() {
    for (const k of DASH_STYLES) {
      raices[k].hidden = k !== actual;
      paneles[k].setVisible(visible && k === actual);
    }
  }
  aplicar();
  const todos = (fn) => DASH_STYLES.forEach(k => fn(paneles[k]));
  return {
    applyTranslations() { todos(p => p.applyTranslations()); },
    update(data) { todos(p => p.update(data)); },
    refresh() { paneles[actual].refresh(); },
    setVisible(v) { visible = !!v; aplicar(); },
    resetSession() { paneles.modern.resetSession(); },
    hasData() { return paneles[actual].hasData(); },
    setStyle(st) {
      if (!DASH_STYLES.includes(st)) return;
      actual = st;
      try { localStorage.setItem(DASH_STYLE_KEY, st); } catch (e) {}
      aplicar();
    },
    style() { return actual; },
    // La escala va en cada raiz: .dashRoot define su propia --d-scale y la
    // del padre no le llega.
    setScale(valor) { for (const k of DASH_STYLES) raices[k].style.setProperty('--d-scale', valor); },
  };
}

function savedDashStyle() {
  try { return localStorage.getItem(DASH_STYLE_KEY) || 'modern'; } catch (e) { return 'modern'; }
}

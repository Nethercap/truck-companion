// Panel de tablero. Arma su propio DOM dentro del elemento que le dan y no
// toca nada de afuera, porque se usa de dos maneras:
//
//  - docs/dash/index.html: una pagina propia que se conecta con el mismo
//    codigo de vinculacion que el GPS. Un dispositivo muestra el mapa y el
//    otro esto. No carga MapLibre ni los tiles, asi que entra en un
//    telefono viejo y no le pelea la memoria al que hace de GPS.
//  - dentro de la app, a pantalla completa: con un solo dispositivo se
//    alterna entre mapa y tablero al instante, sin recargar el mapa ni el
//    grafo de rutas, que es lo que tarda.
//
// Lo unico que necesita del anfitrion son las tres cosas que dependen de
// donde este: como formatear plata, si el usuario eligio millas y en que
// idioma esta.

// Iconos de estado. Son los mismos trazos que la botonera de la app, para
// que el limpiaparabrisas sea el mismo dibujo en las dos pantallas.
const DASH_ICONS = {
  beamLow: '<path d="M3 5h3.5a7 7 0 0 1 0 14H3z"/><path d="M13 7l7 2M13 12l7 2M13 16.5l7 2"/>',
  beamHigh: '<path d="M3 5h3.5a7 7 0 0 1 0 14H3z"/><path d="M13 8h7M13 12h7M13 16h7"/>',
  parking: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2 2M18 6l-2 2M6 18l2-2M18 18l-2-2"/>',
  beacon: '<path d="M6 20h12"/><path d="M8 16h8l-1.2-4.5a2.9 2.9 0 0 0-5.6 0z"/><path d="M12 3v3M4.5 6.5l2 1.8M19.5 6.5l-2 1.8M2.5 13h2.5M19 13h2.5"/>',
  hazards: '<path d="M12 3 L2 20 h20 Z"/><path d="M12 9v5"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/>',
  blinkerLeft: '<path d="M14 5 L5 12 l9 7z"/>',
  blinkerRight: '<path d="M10 5 L19 12 l-9 7z"/>',
  wipers: '<path d="M3.5 18c1.5-6.5 4-9.5 8.5-9.5s7 3 8.5 9.5z"/><path d="M7 18l7.2-6.2"/><path d="M12.6 10.3l2.7 1.7"/>',
  motorBrake: '<path d="M12 2v6"/><circle cx="12" cy="14" r="6.5"/><path d="M9 14h6"/>',
  retarder: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/><path d="M4.5 12H2M22 12h-2.5"/>',
  differentialLock: '<circle cx="12" cy="12" r="3"/><path d="M12 3.2v5.5M12 15.3v5.5M3.2 12h5.5M15.3 12h5.5"/>',
  parkingBrake: '<circle cx="12" cy="12" r="8.5"/><text x="12" y="16.5" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor" stroke="none" font-family="sans-serif">P</text>',
  liftAxle: '<path d="M12 2v7M9 6l3-4 3 4"/><circle cx="7" cy="18" r="2.6"/><circle cx="17" cy="18" r="2.6"/><path d="M9.5 18h5"/>',
  trailerAttached: '<path d="M8 6h13v10H8z"/><path d="M8 13H4.2"/><circle cx="2.6" cy="13" r="1.2"/><circle cx="12.5" cy="18" r="1.5"/><circle cx="17.5" cy="18" r="1.5"/>',
};

// Orden de la fila de iconos: primero lo que cambia todo el tiempo.
const DASH_INDICATORS = [
  ['beamLow', 'lowBeam'], ['beamHigh', 'cmdHighBeam'], ['parking', 'parkingLights'],
  ['blinkerLeft', 'blinkers'], ['blinkerRight', 'blinkers'],
  ['hazards', 'cmdHazards'], ['beacon', 'cmdBeacon'], ['wipers', 'cmdWipers'],
  ['motorBrake', 'engineBrake'], ['retarder', 'retarderLabel'],
  ['differentialLock', 'diffLock'], ['parkingBrake', 'cmdHandbrake'],
  ['liftAxle', 'cmdLiftAxle'], ['trailerAttached', 'cmdTrailer'],
];

// Piezas que muestran barra de desgaste. Las del remolque se esconden
// enteras cuando no hay remolque enganchado: tres ceros parecen un
// remolque impecable y no es lo mismo que no tener remolque.
const DASH_WEAR = [
  ['engine', 'engine'], ['transmission', 'transmission'], ['cabin', 'cabin'],
  ['chassis', 'chassis'], ['wheels', 'wheels'],
];
const DASH_TRAILER_WEAR = [['chassis', 'chassis'], ['wheels', 'wheels'], ['body', 'bodyLabel']];

// Escala nominal de tiempo de cada juego (minutos de juego por minuto real
// manejando). Se usa hasta que createTimeScale junte dos muestras propias.
const DASH_NOMINAL_SCALE = { ets2: 19, ats: 20 };

function createDashPanel({ root, money, imperial, lang }) {
  const KM_TO_MI = 0.621371;
  const escala = createTimeScale();
  const combustible = createFuelTracker();
  const sesion = createSessionStats();
  let ultimo = null;
  // Adentro de la app el panel vive escondido detras del mapa. Sigue
  // acumulando la sesion igual (si no, alternar de vista perderia los
  // kilometros), pero no dibuja: son cincuenta escrituras al DOM por tick
  // que nadie esta mirando.
  let visible = true;

  // --- helpers de armado ---
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function svg(paths) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    node.setAttribute('viewBox', '0 0 24 24');
    node.setAttribute('fill', 'none');
    node.setAttribute('stroke', 'currentColor');
    node.setAttribute('stroke-width', '1.9');
    node.setAttribute('stroke-linecap', 'round');
    node.setAttribute('stroke-linejoin', 'round');
    node.innerHTML = paths;
    return node;
  }
  // Fila "etiqueta ....... valor". Devuelve la fila para poder esconderla.
  function fila(padre, claveEtiqueta, id) {
    const row = el('div', 'dRow');
    row.appendChild(el('span', 'dLabel', ''));
    row.firstChild.dataset.i18n = claveEtiqueta;
    const valor = el('span', 'dValue', '-');
    row.appendChild(valor);
    padre.appendChild(row);
    refs[id] = valor;
    refs[id + 'Row'] = row;
    return row;
  }
  function tarjeta(area, claveTitulo, extra) {
    const card = el('section', 'dCard dCard-' + area);
    card.style.gridArea = area;
    const head = el('div', 'dCardHead');
    const titulo = el('span', 'dCardTitle', '');
    titulo.dataset.i18n = claveTitulo;
    head.appendChild(titulo);
    if (extra) head.appendChild(extra);
    card.appendChild(head);
    return card;
  }
  // Dato grande con su etiqueta chica debajo.
  function metrica(padre, id, claveEtiqueta) {
    const box = el('div', 'dMetric');
    const valor = el('div', 'dMetricValue', '-');
    const etiqueta = el('div', 'dMetricLabel', '');
    etiqueta.dataset.i18n = claveEtiqueta;
    box.appendChild(valor);
    box.appendChild(etiqueta);
    padre.appendChild(box);
    refs[id] = valor;
    return box;
  }

  const refs = {};
  root.classList.add('dashRoot');
  root.textContent = '';

  // --- franja de ruta ---
  const franja = el('header', 'dRoute');
  const destino = el('div', 'dRouteWhere');
  refs.from = el('div', 'dRouteFrom', '');
  refs.to = el('div', 'dRouteTo', '');
  refs.companies = el('div', 'dRouteCompanies', '');
  destino.append(refs.from, refs.to, refs.companies);
  const franjaStats = el('div', 'dRouteStats');
  franja.append(destino, franjaStats);
  metrica(franjaStats, 'remaining', 'remainingLabel');
  metrica(franjaStats, 'etaReal', 'etaReal');
  metrica(franjaStats, 'arrival', 'arrivalLabel');
  metrica(franjaStats, 'arrivalGame', 'inGameShort');
  const pista = el('div', 'dProgress');
  refs.progress = el('div', 'dProgressBar');
  pista.appendChild(refs.progress);
  franja.appendChild(pista);

  // --- conduccion ---
  const conduccion = tarjeta('drive', 'cardDriving');
  const velFila = el('div', 'dSpeedRow');
  refs.limit = el('div', 'dLimit', '--');
  const velBox = el('div', 'dSpeedBox');
  refs.speed = el('div', 'dSpeed', '--');
  refs.speedUnit = el('div', 'dSpeedUnit', 'km/h');
  velBox.append(refs.speed, refs.speedUnit);
  const marchaBox = el('div', 'dGearBox');
  refs.gear = el('div', 'dGear', 'N');
  refs.cruise = el('div', 'dCruise', '');
  const rpmPista = el('div', 'dRpm');
  refs.rpm = el('div', 'dRpmBar');
  rpmPista.appendChild(refs.rpm);
  marchaBox.append(refs.gear, refs.cruise, rpmPista);
  velFila.append(velBox, refs.limit, marchaBox);
  conduccion.appendChild(velFila);

  refs.indicators = el('div', 'dIndicators');
  for (const [clave, titulo] of DASH_INDICATORS) {
    const chip = el('span', 'dInd dInd-' + clave);
    chip.dataset.i18nTitle = titulo;
    chip.appendChild(svg(DASH_ICONS[clave]));
    refs.indicators.appendChild(chip);
    refs['ind_' + clave] = chip;
  }
  conduccion.appendChild(refs.indicators);

  const bloqueFuel = el('div', 'dRows');
  fila(bloqueFuel, 'fuel', 'fuel');
  fila(bloqueFuel, 'range', 'range');
  fila(bloqueFuel, 'avgConsumption', 'consumption');
  fila(bloqueFuel, 'adblueLabel', 'adblue');
  conduccion.appendChild(bloqueFuel);

  // --- descanso y plan ---
  const plan = tarjeta('plan', 'cardPlan');
  const restBox = el('div', 'dBig');
  refs.rest = el('div', 'dBigValue', '-');
  refs.restSub = el('div', 'dBigSub', '');
  restBox.append(refs.rest, refs.restSub);
  plan.appendChild(restBox);
  const planRows = el('div', 'dRows');
  fila(planRows, 'gameClock', 'gameClock');
  refs.sleepVerdict = el('div', 'dVerdict');
  refs.fuelVerdict = el('div', 'dVerdict');
  plan.append(planRows, refs.sleepVerdict, refs.fuelVerdict);

  // --- trabajo ---
  const trabajo = tarjeta('job', 'cardJob');
  refs.cargo = el('div', 'dBigValue', '-');
  refs.cargoSub = el('div', 'dBigSub', '');
  refs.pay = el('div', 'dPay', '-');
  refs.payPerKm = el('div', 'dBigSub', '');
  trabajo.append(refs.cargo, refs.cargoSub, refs.pay, refs.payPerKm);
  const jobRows = el('div', 'dRows');
  fila(jobRows, 'jobDeadline', 'deadline');
  fila(jobRows, 'cargoDamage', 'cargoDamage');
  trabajo.appendChild(jobRows);
  refs.deadlineVerdict = el('div', 'dVerdict');
  trabajo.appendChild(refs.deadlineVerdict);

  // --- vehiculo ---
  const vehiculo = tarjeta('truck', 'cardTruck');
  refs.truck = el('div', 'dBigValue', '-');
  refs.odometer = el('div', 'dBigSub', '');
  vehiculo.append(refs.truck, refs.odometer);
  const desgaste = el('div', 'dWear');
  for (const [pieza, clave] of DASH_WEAR) barraDesgaste(desgaste, 'wear_' + pieza, clave);
  vehiculo.appendChild(desgaste);
  refs.trailerWear = el('div', 'dWear dTrailerWear');
  const tituloRemolque = el('div', 'dWearTitle', '');
  tituloRemolque.dataset.i18n = 'cmdTrailer';
  refs.trailerWear.appendChild(tituloRemolque);
  for (const [pieza, clave] of DASH_TRAILER_WEAR) barraDesgaste(refs.trailerWear, 'twear_' + pieza, clave);
  vehiculo.appendChild(refs.trailerWear);
  const medidores = el('div', 'dGauges');
  for (const [id, clave] of [['oilTemp', 'oilTempLabel'], ['waterTemp', 'waterTempLabel'],
                             ['brakeTemp', 'brakeTempLabel'], ['airPressure', 'airPressureLabel'],
                             ['oilPressure', 'oilPressureLabel'], ['battery', 'batteryLabel']]) {
    const box = el('div', 'dGauge');
    const valor = el('div', 'dGaugeValue', '-');
    const etiqueta = el('div', 'dGaugeLabel', '');
    etiqueta.dataset.i18n = clave;
    box.append(valor, etiqueta);
    medidores.appendChild(box);
    refs[id] = valor;
    refs[id + 'Box'] = box;
  }
  vehiculo.appendChild(medidores);

  function barraDesgaste(padre, id, claveEtiqueta) {
    const row = el('div', 'dWearRow');
    const etiqueta = el('span', 'dWearLabel', '');
    etiqueta.dataset.i18n = claveEtiqueta;
    const pista = el('span', 'dWearTrack');
    const barra = el('span', 'dWearBar');
    pista.appendChild(barra);
    const valor = el('span', 'dWearValue', '-');
    row.append(etiqueta, pista, valor);
    padre.appendChild(row);
    refs[id] = { bar: barra, value: valor };
  }

  // --- sesion ---
  refs.resetBtn = el('button', 'dReset', '');
  refs.resetBtn.dataset.i18n = 'sessionReset';
  refs.resetBtn.addEventListener('click', () => {
    sesion.reset(ultimo && ultimo.game, ultimo && ultimo.ts);
    render();
  });
  const sesionCard = tarjeta('session', 'cardSession', refs.resetBtn);
  refs.since = el('div', 'dSince', '');
  sesionCard.appendChild(refs.since);
  const metricas = el('div', 'dMetrics');
  metrica(metricas, 'sKm', 'drivenLabel');
  metrica(metricas, 'sWheel', 'atWheel');
  metrica(metricas, 'sNet', 'netProfit');
  sesionCard.appendChild(metricas);
  const sesionRows = el('div', 'dRows');
  fila(sesionRows, 'avgSpeed', 'sAvg');
  fila(sesionRows, 'fuelUsed', 'sFuel');
  fila(sesionRows, 'overLimit', 'sOver');
  fila(sesionRows, 'perHour', 'sPerHour');
  fila(sesionRows, 'jobsDone', 'sJobs');
  fila(sesionRows, 'fines', 'sFines');
  fila(sesionRows, 'tolls', 'sTolls');
  fila(sesionRows, 'ferryTrain', 'sFerries');
  sesionCard.appendChild(sesionRows);

  const grilla = el('main', 'dGrid');
  grilla.append(conduccion, plan, trabajo, vehiculo, sesionCard);
  root.append(franja, grilla);

  // --- formato ---
  const idioma = () => (lang ? lang() : 'en');
  const mi = () => (imperial ? imperial() : false);
  function num(v, dec) {
    return Number(v).toLocaleString(idioma(), { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
  }
  function dist(km) {
    if (km == null || !isFinite(km)) return null;
    return mi() ? num(km * KM_TO_MI) + ' mi' : num(km) + ' km';
  }
  function vel(kmh) {
    if (kmh == null || !isFinite(kmh)) return null;
    return num(mi() ? kmh * KM_TO_MI : kmh);
  }
  // "9 h 33 min" para tiempos largos, "33 min" para los cortos. Sin
  // segundos: en un tablero que se mira de reojo son ruido.
  function dur(segundos) {
    if (segundos == null || !isFinite(segundos) || segundos < 0) return null;
    const total = Math.round(segundos / 60);
    const h = Math.floor(total / 60), m = total % 60;
    if (h >= 1) return h + ' h ' + String(m).padStart(2, '0') + ' min';
    return m + ' min';
  }
  function hm(segundos) {
    if (segundos == null || !isFinite(segundos) || segundos < 0) return null;
    const total = Math.round(segundos / 60);
    return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
  }
  function reloj(fecha) {
    return fecha.toLocaleTimeString(idioma(), { hour: '2-digit', minute: '2-digit' });
  }
  function poner(id, texto) {
    const node = refs[id];
    if (!node) return;
    node.textContent = texto == null ? '-' : texto;
    const row = refs[id + 'Row'];
    if (row) row.hidden = texto == null;
  }
  function plata(monto) {
    if (monto == null) return null;
    return money ? money(monto, ultimo && ultimo.game) : num(monto);
  }

  // Minutos de juego por minuto real. Hasta tener medicion propia se usa la
  // nominal del mapa, que es la que aplica el juego manejando.
  function escalaActual() {
    const medido = escala.value();
    if (medido != null) return medido;
    return DASH_NOMINAL_SCALE[ultimo && ultimo.game] || 19;
  }

  function render() {
    const d = ultimo;
    if (!d || !visible) return;
    const s = escalaActual();

    // --- franja ---
    const enViaje = !!(d.onJob && d.cityDst);
    refs.from.textContent = enViaje && d.citySrc ? d.citySrc + ' →' : '';
    refs.to.textContent = enViaje ? d.cityDst : t('dashNoJob');
    refs.companies.textContent = enViaje && d.companySrc && d.companyDst
      ? d.companySrc + ' → ' + d.companyDst : '';
    const restanteKm = enViaje ? d.routeDistanceKm : null;
    poner('remaining', dist(restanteKm));
    // routeTimeSeconds son segundos DE JUEGO: pasados a reloj de pared con
    // la escala medida. Es el unico numero que sirve para decidir si te da
    // el tiempo antes de cenar.
    const realSeg = d.routeTimeSeconds > 0 ? d.routeTimeSeconds / s : null;
    poner('etaReal', hm(realSeg));
    poner('arrival', realSeg != null ? reloj(new Date(Date.now() + realSeg * 1000)) : null);
    const relojJuego = gameClockFromMinutes(d.gameTimeMinutes);
    const llegadaJuego = relojJuego && d.routeTimeSeconds > 0
      ? gameClockFromMinutes(d.gameTimeMinutes + d.routeTimeSeconds / 60) : null;
    poner('arrivalGame', llegadaJuego
      ? String(llegadaJuego.hours).padStart(2, '0') + ':' + String(llegadaJuego.minutes).padStart(2, '0') : null);
    const total = d.plannedDistanceKm;
    const hecho = total && restanteKm != null ? Math.max(0, Math.min(1, 1 - restanteKm / total)) : 0;
    refs.progress.style.width = (hecho * 100).toFixed(1) + '%';

    // --- conduccion ---
    poner('speed', vel(d.speedKmh) || '--');
    refs.speedUnit.textContent = mi() ? 'mph' : 'km/h';
    const limite = d.speedLimitKmh > 0 ? vel(d.speedLimitKmh) : null;
    refs.limit.textContent = limite || '--';
    refs.limit.classList.toggle('dLimit-off', !limite);
    refs.limit.classList.toggle('dLimit-over', !!limite && d.speedKmh > d.speedLimitKmh + 2);
    refs.gear.textContent = d.gear === 0 || d.gear == null ? 'N' : (d.gear < 0 ? 'R' + (d.gear < -1 ? Math.abs(d.gear) : '') : String(d.gear));
    refs.cruise.textContent = d.cruiseControl && d.cruiseControlSpeedKmh > 0 ? vel(d.cruiseControlSpeedKmh) : '';
    refs.cruise.hidden = !refs.cruise.textContent;
    const rpmMax = d.engineRpmMax || 2500;
    refs.rpm.style.width = Math.max(0, Math.min(100, (d.engineRpm || 0) / rpmMax * 100)).toFixed(0) + '%';
    refs.rpm.classList.toggle('dRpm-high', (d.engineRpm || 0) > rpmMax * 0.85);

    const luces = d.lights || {};
    const encendido = {
      beamLow: luces.beamLow, beamHigh: luces.beamHigh, parking: luces.parking,
      blinkerLeft: luces.blinkerLeft, blinkerRight: luces.blinkerRight,
      hazards: luces.hazards, beacon: luces.beacon, wipers: d.wipers,
      motorBrake: d.motorBrake, retarder: d.retarder > 0,
      differentialLock: d.differentialLock, parkingBrake: d.parkingBrake,
      liftAxle: d.liftAxle, trailerAttached: d.trailerAttached,
    };
    for (const [clave] of DASH_INDICATORS) {
      const chip = refs['ind_' + clave];
      chip.classList.toggle('on', !!encendido[clave]);
      // Un estado que el cliente no manda (version vieja) se esconde en vez
      // de mostrarse apagado, que seria mentir.
      chip.hidden = encendido[clave] === undefined;
    }
    if (d.retarder > 0 && d.retarderSteps > 0) {
      refs.ind_retarder.dataset.level = d.retarder + '/' + d.retarderSteps;
    } else {
      delete refs.ind_retarder.dataset.level;
    }

    const medido = combustible.avgLPer100();
    const consumo = medido || d.fuelAvgConsumption || null;
    const alcance = medido && d.fuel != null ? d.fuel / medido * 100 : d.fuelRangeKm;
    const pct = d.fuel != null && d.fuelCapacity ? d.fuel / d.fuelCapacity * 100 : null;
    poner('fuel', d.fuel == null ? null : num(d.fuel) + ' l' + (pct != null ? ' · ' + num(pct) + ' %' : ''));
    poner('range', dist(alcance));
    poner('consumption', consumo == null ? null
      : (mi() ? num(235.215 / consumo, 1) + ' mpg' : num(consumo, 1) + ' l/100'));
    const adblueMax = d.adblueCapacity;
    poner('adblue', d.adblue == null ? null
      : num(d.adblue) + ' l' + (adblueMax ? ' · ' + num(d.adblue / adblueMax * 100) + ' %' : ''));
    marcarAlerta('adblue', (d.mechanicalWarnings || {}).adblue);

    // --- descanso y plan ---
    // restStopMinutes son minutos DE JUEGO hasta el descanso obligatorio.
    const descansoJuegoSeg = d.restStopMinutes != null ? d.restStopMinutes * 60 : null;
    poner('rest', dur(descansoJuegoSeg));
    refs.restSub.textContent = descansoJuegoSeg == null ? ''
      : t('untilRest') + ' · ' + hm(descansoJuegoSeg / s) + ' ' + t('realShort');
    poner('gameClock', relojJuego
      ? new Date(Date.UTC(2024, 0, 1 + relojJuego.dayIndex)).toLocaleDateString(idioma(), { weekday: 'short', timeZone: 'UTC' })
        + ' ' + String(relojJuego.hours).padStart(2, '0') + ':' + String(relojJuego.minutes).padStart(2, '0')
      : null);

    // Veredictos: la cuenta que hoy hay que hacer de cabeza mirando dos
    // numeros distintos.
    const viajeJuegoSeg = enViaje && d.routeTimeSeconds > 0 ? d.routeTimeSeconds : null;
    veredicto('sleepVerdict', viajeJuegoSeg == null || descansoJuegoSeg == null ? null
      : descansoJuegoSeg > viajeJuegoSeg
        ? { texto: t('sleepNone'), bien: true }
        : { texto: t('sleepNeeded'), bien: false });
    veredicto('fuelVerdict', restanteKm == null || alcance == null ? null
      : alcance > restanteKm * 1.08
        ? { texto: t('fuelEnough'), bien: true }
        : { texto: t('fuelShort'), bien: false });

    // --- trabajo ---
    refs.cargo.textContent = enViaje ? (d.cargo || t('noCargo')) : t('dashNoJob');
    const partes = [];
    if (d.cargoMassKg) partes.push(num(d.cargoMassKg / 1000, 1) + ' t');
    if (d.plannedDistanceKm) partes.push(t('routeLength') + ' ' + dist(d.plannedDistanceKm));
    refs.cargoSub.textContent = enViaje ? partes.join(' · ') : '';
    refs.pay.textContent = enViaje && d.jobIncome ? plata(d.jobIncome) : '';
    refs.payPerKm.textContent = enViaje && d.jobIncome && d.plannedDistanceKm
      ? plata(Math.round(d.jobIncome / d.plannedDistanceKm)) + ' ' + t('perKm') : '';
    poner('deadline', enViaje ? dur(d.jobDeadlineSeconds) : null);
    poner('cargoDamage', d.cargoDamage ? num(d.cargoDamage * 100, 1) + ' %' : null);
    marcarAlerta('cargoDamage', d.cargoDamage > 0.02);
    const margen = enViaje && d.jobDeadlineSeconds != null && viajeJuegoSeg != null
      ? d.jobDeadlineSeconds - viajeJuegoSeg : null;
    veredicto('deadlineVerdict', margen == null ? null
      : margen >= 0
        ? { texto: t('deadlineEarly', dur(margen)), bien: true }
        : { texto: t('deadlineLate', dur(-margen)), bien: false });

    // --- vehiculo ---
    refs.truck.textContent = [d.truckBrand, d.truckName].filter(Boolean).join(' ') || '-';
    refs.odometer.textContent = d.odometerKm != null ? dist(d.odometerKm) : '';
    const wear = d.wear || {};
    for (const [pieza] of DASH_WEAR) ponerDesgaste('wear_' + pieza, wear[pieza]);
    const remolque = d.trailerWear;
    refs.trailerWear.hidden = !remolque;
    if (remolque) for (const [pieza] of DASH_TRAILER_WEAR) ponerDesgaste('twear_' + pieza, remolque[pieza]);

    const alertas = d.mechanicalWarnings || {};
    medidor('oilTemp', d.oilTemperature, (v) => num(v) + ' °C', d.oilTemperature > 125);
    medidor('waterTemp', d.waterTemperature, (v) => num(v) + ' °C', alertas.waterTemperature);
    medidor('brakeTemp', d.brakeTemperature, (v) => num(v) + ' °C', d.brakeTemperature > 300);
    medidor('airPressure', d.airPressure, (v) => num(v) + ' psi', alertas.airPressure);
    medidor('oilPressure', d.oilPressure, (v) => num(v) + ' psi', alertas.oilPressure);
    medidor('battery', d.batteryVoltage, (v) => num(v, 1) + ' V', alertas.batteryVoltage);

    // --- sesion ---
    const st = sesion.state();
    refs.since.textContent = st.startedAt ? t('sessionSince', reloj(new Date(st.startedAt * 1000))) : '';
    poner('sKm', dist(st.kmDriven));
    poner('sWheel', hm(st.wheelSeconds));
    poner('sNet', st.netProfit ? plata(st.netProfit) : '0');
    poner('sAvg', st.avgSpeedKmh == null ? null
      : vel(st.avgSpeedKmh) + (mi() ? ' mph' : ' km/h')
        + (st.topSpeedKmh ? ' · ' + t('topSpeed') + ' ' + vel(st.topSpeedKmh) : ''));
    poner('sFuel', st.fuelUsedL < 1 ? null
      : num(st.fuelUsedL) + ' l' + (st.fuelPer100Km ? ' · ' + num(st.fuelPer100Km, 1) + ' l/100' : ''));
    poner('sOver', st.overLimitSeconds < 60 ? null
      : hm(st.overLimitSeconds) + ' · ' + num(st.overLimitRatio * 100) + ' %');
    poner('sPerHour', st.profitPerHour == null ? null : plata(Math.round(st.profitPerHour)));
    poner('sJobs', st.jobs.count ? st.jobs.count + ' · ' + plata(st.jobs.amount) : null);
    poner('sFines', st.fines.count ? st.fines.count + ' · ' + plata(st.fines.amount) : null);
    poner('sTolls', st.tolls.count ? st.tolls.count + ' · ' + plata(st.tolls.amount) : null);
    poner('sFerries', st.ferries.count ? st.ferries.count + ' · ' + plata(st.ferries.amount) : null);
  }

  function veredicto(id, valor) {
    const node = refs[id];
    node.hidden = !valor;
    if (!valor) return;
    node.textContent = valor.texto;
    node.classList.toggle('bien', valor.bien);
    node.classList.toggle('mal', !valor.bien);
  }
  function marcarAlerta(id, activa) {
    const row = refs[id + 'Row'];
    if (row) row.classList.toggle('alerta', !!activa);
  }
  function ponerDesgaste(id, valor) {
    const ref = refs[id];
    if (!ref) return;
    const pct = valor == null ? null : valor * 100;
    ref.value.textContent = pct == null ? '-' : Math.round(pct) + ' %';
    ref.bar.style.width = (pct || 0).toFixed(1) + '%';
    ref.bar.className = 'dWearBar' + (pct == null ? '' : pct >= 40 ? ' mal' : pct >= 10 ? ' regular' : ' bien');
  }
  function medidor(id, valor, formato, alerta) {
    const box = refs[id + 'Box'];
    box.hidden = valor == null;
    if (valor == null) return;
    refs[id].textContent = formato(valor);
    box.classList.toggle('alerta', !!alerta);
  }

  return {
    // Traduce todo lo que se marco con data-i18n al idioma actual.
    applyTranslations() {
      root.querySelectorAll('[data-i18n]').forEach(n => { n.textContent = t(n.dataset.i18n); });
      root.querySelectorAll('[data-i18n-title]').forEach(n => { n.title = t(n.dataset.i18nTitle); });
      render();
    },
    update(data) {
      ultimo = data;
      escala.push(data.gameTimeMinutes, data.ts);
      sesion.push(data);
      combustible.push(data.odometerKm, data.fuel, [data.game, data.truckBrand, data.truckName].join('|'));
      render();
    },
    // La app lo llama al abrir y cerrar la pantalla completa.
    setVisible(v) { visible = !!v; if (v) render(); },
    // El anfitrion la llama al cambiar de unidades o de idioma.
    refresh() { render(); },
    resetSession() { sesion.reset(ultimo && ultimo.game, ultimo && ultimo.ts); render(); },
    hasData() { return ultimo != null; },
  };
}

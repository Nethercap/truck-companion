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
// **El panel afirma, no lista.** La cinta de arriba es el viaje entero con
// el descanso y la carga marcados encima, y cada tarjeta empieza por la
// conclusion ("Llegada 3 h 50 min antes") en vez de por la etiqueta de un
// subsistema. Los numeros que la sostienen quedan abajo y chicos. No es
// una decision estetica: la cuenta de si llegas a tiempo hoy la hace la
// persona restando dos numeros de dos tarjetas distintas.
//
// **Lo que no tiene respuesta no se muestra.** Sin trabajo no hay cinta ni
// tarjeta de llegada: una afirmacion vacia es peor que ninguna.
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

const DASH_WEAR = [
  ['engine', 'engine'], ['transmission', 'transmission'], ['cabin', 'cabin'],
  ['chassis', 'chassis'], ['wheels', 'wheels'],
];
const DASH_TRAILER_WEAR = [['chassis', 'chassis'], ['wheels', 'wheels'], ['body', 'bodyLabel']];

// Escala nominal de tiempo de cada juego (minutos de juego por minuto real
// manejando). Se usa hasta que createTimeScale junte dos muestras propias.
const DASH_NOMINAL_SCALE = { ets2: 19, ats: 20 };

// Por debajo de esto el camion esta sano y no hay nada que decir de el.
const DASH_DESGASTE_SANO = 5;
// Ancho de las marcas de la cinta, en porcentaje del largo total. Son una
// franja y no un punto a proposito: no sabemos en que kilometro exacto vas
// a parar, depende de a que velocidad sigas. Un punto prometeria una
// precision que no tenemos; una franja dice "por esta zona".
const DASH_ANCHO_MARCA = 12;
// Aire minimo entre las dos leyendas, en px. Sin esto "descanso aca" y
// "carga aca" se tocan cuando las dos paradas caen cerca, que es
// justamente cuando hay que leerlas bien.
const DASH_AIRE_MARCAS = 10;

function createDashPanel({ root, money, imperial, lang }) {
  const KM_TO_MI = 0.621371;
  const escala = createTimeScale();
  const combustible = createFuelTracker();
  const sesion = createSessionStats();
  let ultimo = null;
  // Adentro de la app el panel vive escondido detras del mapa. Sigue
  // acumulando la sesion igual (si no, alternar de vista perderia los
  // kilometros), pero no dibuja: son decenas de escrituras al DOM por tick
  // que nadie esta mirando.
  let visible = true;

  const refs = {};

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
  function guardar(id, node) { refs[id] = node; return node; }
  // Tarjeta sin titulo: el titulo seria repetir con una etiqueta lo que la
  // afirmacion ya dice.
  function tarjeta(area) {
    const card = el('section', 'dCard dCard-' + area);
    card.style.gridArea = area;
    return card;
  }
  function metrica(padre, id, claveEtiqueta) {
    const box = padre.appendChild(el('div', 'dMetric'));
    guardar(id, box.appendChild(el('div', 'dMetricValue', '-')));
    box.appendChild(el('div', 'dMetricLabel')).dataset.i18n = claveEtiqueta;
  }
  function barraDesgaste(padre, id) {
    const pista = padre.appendChild(el('span', 'dWearTrack'));
    guardar(id, pista.appendChild(el('span', 'dWearBar')));
  }

  root.classList.add('dashRoot');
  root.textContent = '';

  // --- la cinta ---
  const cinta = guardar('cinta', el('header', 'dRibbon'));
  const puntas = cinta.appendChild(el('div', 'dEnds'));
  const desde = puntas.appendChild(el('div', 'dFrom'));
  guardar('fromCity', desde.appendChild(el('div', 'dEndCity')));
  guardar('fromCompany', desde.appendChild(el('div', 'dEndSub')));
  const medio = puntas.appendChild(el('div', 'dMiddle'));
  guardar('remaining', medio.appendChild(el('div', 'dRemaining', '--')));
  guardar('remainingSub', medio.appendChild(el('div', 'dEndSub')));
  const hasta = puntas.appendChild(el('div', 'dTo'));
  guardar('toCity', hasta.appendChild(el('div', 'dEndCity dEndCityBig')));
  guardar('toCompany', hasta.appendChild(el('div', 'dEndSub')));

  const via = cinta.appendChild(el('div', 'dTrack'));
  via.appendChild(el('div', 'dRail'));
  guardar('done', via.appendChild(el('div', 'dDone')));
  guardar('bandRest', via.appendChild(el('div', 'dBand dBand-rest')));
  guardar('bandFuel', via.appendChild(el('div', 'dBand dBand-fuel')));
  guardar('truck', via.appendChild(el('div', 'dTruck')));
  const marcas = cinta.appendChild(el('div', 'dMarks'));
  guardar('markRest', marcas.appendChild(el('span', 'dMark dMark-rest')));
  guardar('markFuel', marcas.appendChild(el('span', 'dMark dMark-fuel')));

  // --- conduccion ---
  const conduccion = tarjeta('drive');
  const velFila = conduccion.appendChild(el('div', 'dSpeedRow'));
  const velBox = velFila.appendChild(el('div', 'dSpeedBox'));
  guardar('speed', velBox.appendChild(el('div', 'dSpeed', '--')));
  guardar('speedUnit', velBox.appendChild(el('div', 'dSpeedUnit', 'km/h')));
  guardar('limit', velFila.appendChild(el('div', 'dLimit', '--')));
  const marchaBox = velFila.appendChild(el('div', 'dGearBox'));
  guardar('gear', marchaBox.appendChild(el('div', 'dGear', 'N')));
  guardar('cruise', marchaBox.appendChild(el('div', 'dCruise')));
  guardar('rpm', marchaBox.appendChild(el('div', 'dRpm')).appendChild(el('div', 'dRpmBar')));
  const indicadores = conduccion.appendChild(el('div', 'dIndicators'));
  for (const [clave, titulo] of DASH_INDICATORS) {
    const chip = el('span', 'dInd dInd-' + clave);
    chip.dataset.i18nTitle = titulo;
    chip.appendChild(svg(DASH_ICONS[clave]));
    indicadores.appendChild(guardar('ind_' + clave, chip));
  }

  // --- llegada ---
  const llegada = guardar('cardEta', tarjeta('eta'));
  guardar('etaClaim', llegada.appendChild(el('div', 'dClaim')));
  guardar('etaLine', llegada.appendChild(el('div', 'dLine')));
  guardar('etaPay', llegada.appendChild(el('div', 'dLine dDim')));

  // --- combustible y descanso ---
  const nafta = tarjeta('fuel');
  guardar('fuelClaim', nafta.appendChild(el('div', 'dClaim')));
  guardar('restClaim', nafta.appendChild(el('div', 'dSecondClaim')));
  guardar('fuelLine', nafta.appendChild(el('div', 'dLine')));
  guardar('fuelDim', nafta.appendChild(el('div', 'dLine dDim')));

  // --- camion ---
  const camion = tarjeta('truck');
  guardar('wearClaim', camion.appendChild(el('div', 'dClaim')));
  const barras = camion.appendChild(el('div', 'dWearRow'));
  for (const [pieza] of DASH_WEAR) barraDesgaste(barras, 'wear_' + pieza);
  const barrasRemolque = guardar('trailerWear', camion.appendChild(el('div', 'dWearRow dWearRow-trailer')));
  for (const [pieza] of DASH_TRAILER_WEAR) barraDesgaste(barrasRemolque, 'twear_' + pieza);
  guardar('truckLine', camion.appendChild(el('div', 'dLine')));
  const medidores = camion.appendChild(el('div', 'dGauges'));
  for (const [id, clave] of [['oilTemp', 'oilTempLabel'], ['waterTemp', 'waterTempLabel'],
                             ['brakeTemp', 'brakeTempLabel'], ['airPressure', 'airPressureLabel'],
                             ['oilPressure', 'oilPressureLabel'], ['battery', 'batteryLabel']]) {
    const box = guardar(id + 'Box', medidores.appendChild(el('div', 'dGauge')));
    guardar(id, box.appendChild(el('div', 'dGaugeValue', '-')));
    box.appendChild(el('div', 'dGaugeLabel')).dataset.i18n = clave;
  }

  // --- la franja de abajo ---
  const franja = el('footer', 'dStrip');
  franja.style.gridArea = 'strip';
  const carga = guardar('cargoBox', franja.appendChild(el('div', 'dStripCargo')));
  guardar('cargo', carga.appendChild(el('div', 'dStripBig')));
  guardar('cargoSub', carga.appendChild(el('div', 'dEndSub')));
  const metricas = franja.appendChild(el('div', 'dMetrics'));
  metrica(metricas, 'sKm', 'drivenLabel');
  metrica(metricas, 'sWheel', 'atWheel');
  metrica(metricas, 'sAvg', 'avgSpeed');
  metrica(metricas, 'sFuel', 'fuelUsed');
  metrica(metricas, 'sNet', 'netProfit');
  const reset = guardar('resetBtn', franja.appendChild(el('button', 'dReset')));
  reset.dataset.i18n = 'sessionReset';
  reset.addEventListener('click', () => {
    sesion.reset(ultimo && ultimo.game, ultimo && ultimo.ts);
    render();
  });

  const grilla = el('main', 'dGrid');
  grilla.append(conduccion, llegada, nafta, camion, franja);
  root.append(cinta, grilla);

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
  // "9 h 33 min" para lo largo, "33 min" para lo corto. Sin segundos: en un
  // tablero que se mira de reojo son ruido.
  //
  // Las abreviaturas salen del idioma: la duracion entro al titular de las
  // tarjetas ("Llegada 3 h 00 min tarde") y un "h" ingles en medio de una
  // frase en ruso o en turco canta. Van abreviadas y no completas porque
  // comparten renglon con el resto de la afirmacion.
  function dur(segundos) {
    if (segundos == null || !isFinite(segundos) || segundos < 0) return null;
    const total = Math.round(segundos / 60);
    const h = Math.floor(total / 60), m = total % 60;
    return h >= 1
      ? h + ' ' + t('hourShort') + ' ' + String(m).padStart(2, '0') + ' ' + t('minShort')
      : m + ' ' + t('minShort');
  }
  function hm(segundos) {
    if (segundos == null || !isFinite(segundos) || segundos < 0) return null;
    const total = Math.round(segundos / 60);
    return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
  }
  function reloj(fecha) {
    return fecha.toLocaleTimeString(idioma(), { hour: '2-digit', minute: '2-digit' });
  }
  function relojJuego(minutos) {
    const c = gameClockFromMinutes(minutos);
    return c ? String(c.hours).padStart(2, '0') + ':' + String(c.minutes).padStart(2, '0') : null;
  }
  function plata(monto) {
    if (monto == null) return null;
    return money ? money(monto, ultimo && ultimo.game) : num(monto);
  }
  // null esconde el elemento: es como se saca lo que no tiene respuesta.
  function texto(id, valor, clase) {
    const node = refs[id];
    if (!node) return;
    node.textContent = valor == null ? '' : valor;
    node.hidden = valor == null;
    if (clase !== undefined) {
      node.classList.toggle('bien', clase === 'bien');
      node.classList.toggle('mal', clase === 'mal');
    }
  }
  function escalaActual() {
    const medido = escala.value();
    return medido != null ? medido : (DASH_NOMINAL_SCALE[ultimo && ultimo.game] || 19);
  }
  function autonomia(d) {
    const medido = combustible.avgLPer100();
    return medido && d.fuel != null ? d.fuel / medido * 100 : d.fuelRangeKm;
  }

  function render() {
    const d = ultimo;
    if (!d || !visible) return;
    const s = escalaActual();
    const enViaje = !!(d.onJob && d.cityDst);
    const restanteKm = enViaje ? d.routeDistanceKm : null;
    const viajeJuegoSeg = enViaje && d.routeTimeSeconds > 0 ? d.routeTimeSeconds : null;
    const realSeg = viajeJuegoSeg != null ? viajeJuegoSeg / s : null;
    renderCinta(d, enViaje, restanteKm, realSeg, viajeJuegoSeg);
    renderConduccion(d);
    renderLlegada(d, enViaje, realSeg, viajeJuegoSeg);
    renderCombustible(d, restanteKm, viajeJuegoSeg, s);
    renderCamion(d);
    renderFranja(d, enViaje);
  }

  function renderCinta(d, enViaje, restanteKm, realSeg, viajeJuegoSeg) {
    // Sin destino no hay viaje que dibujar: la cinta entera desaparece en
    // vez de quedar como un riel vacio que no dice nada.
    refs.cinta.hidden = !enViaje;
    if (!enViaje) return;
    texto('fromCity', d.citySrc || '');
    texto('fromCompany', d.companySrc || null);
    texto('toCity', d.cityDst);
    texto('remaining', dist(restanteKm) || '--');
    const partes = [t('remainingLabel')];
    if (realSeg != null) partes.push(hm(realSeg) + ' ' + t('realShort'));
    texto('remainingSub', partes.join(' · '));
    const llegadaReal = realSeg != null ? reloj(new Date(Date.now() + realSeg * 1000)) : null;
    const enJuego = viajeJuegoSeg != null && d.gameTimeMinutes != null
      ? relojJuego(d.gameTimeMinutes + viajeJuegoSeg / 60) : null;
    texto('toCompany', [d.companyDst,
                        llegadaReal ? t('arrivalLabel') + ' ' + llegadaReal : null,
                        enJuego ? enJuego + ' ' + t('inGameShort') : null]
      .filter(Boolean).join(' · ') || null);

    const total = d.plannedDistanceKm;
    const hecho = total && restanteKm != null
      ? Math.max(0, Math.min(1, 1 - restanteKm / total)) : 0;
    refs.done.style.width = (hecho * 100).toFixed(1) + '%';
    refs.truck.style.left = (hecho * 100).toFixed(1) + '%';

    // El descanso y la carga se ubican sobre lo que FALTA, cada uno con la
    // unidad del tramo que representa: el descanso en tiempo de juego
    // contra el tiempo de juego que queda, la carga en kilometros contra
    // los kilometros que quedan.
    const descansoSeg = d.restStopMinutes != null ? d.restStopMinutes * 60 : null;
    marca('bandRest', 'markRest', hecho,
          descansoSeg != null && viajeJuegoSeg ? descansoSeg / viajeJuegoSeg : null,
          t('restHere'));
    const alcance = autonomia(d);
    marca('bandFuel', 'markFuel', hecho,
          alcance != null && restanteKm ? alcance / restanteKm : null,
          t('refuelHere'));
    separarMarcas();
  }

  // Coloca una franja sobre el tramo que falta. Una fraccion de 1 o mas
  // quiere decir que eso pasa despues de llegar, asi que no se dibuja.
  function marca(idBanda, idTexto, hecho, fraccion, etiqueta) {
    const banda = refs[idBanda], leyenda = refs[idTexto];
    if (fraccion == null || !isFinite(fraccion) || fraccion >= 1 || fraccion < 0) {
      banda.hidden = leyenda.hidden = true;
      return;
    }
    const centro = (hecho + (1 - hecho) * fraccion) * 100;
    const izquierda = Math.max(0, Math.min(100 - DASH_ANCHO_MARCA, centro - DASH_ANCHO_MARCA / 2));
    banda.hidden = leyenda.hidden = false;
    banda.style.left = izquierda + '%';
    banda.style.width = DASH_ANCHO_MARCA + '%';
    leyenda.style.left = izquierda + '%';
    leyenda.textContent = etiqueta;
  }

  // Las dos leyendas se ubican cada una contra su propia parada, asi que
  // nada impide que se pisen. Se separan despues de escribirlas, que es
  // cuando se sabe lo que miden: el mismo texto mide distinto en cada
  // idioma. Primero se corre la de la derecha, que es la que tiene lugar
  // libre hacia afuera; si llego al borde, lo que falta lo cede la otra.
  function separarMarcas() {
    const rest = refs.markRest, fuel = refs.markFuel;
    if (rest.hidden || fuel.hidden) return;
    const ancho = rest.parentElement.clientWidth;
    const [izq, der] = rest.offsetLeft <= fuel.offsetLeft ? [rest, fuel] : [fuel, rest];
    const solape = izq.offsetLeft + izq.offsetWidth + DASH_AIRE_MARCAS - der.offsetLeft;
    if (solape <= 0) return;
    const lugar = Math.max(0, Math.min(solape, ancho - der.offsetWidth - der.offsetLeft));
    if (lugar > 0) der.style.left = (der.offsetLeft + lugar) + 'px';
    if (lugar < solape) izq.style.left = Math.max(0, izq.offsetLeft - (solape - lugar)) + 'px';
  }

  function renderConduccion(d) {
    texto('speed', vel(d.speedKmh) || '--');
    refs.speedUnit.textContent = mi() ? 'mph' : 'km/h';
    const limite = d.speedLimitKmh > 0 ? vel(d.speedLimitKmh) : null;
    refs.limit.textContent = limite || '--';
    refs.limit.classList.toggle('dLimit-off', !limite);
    refs.limit.classList.toggle('dLimit-over', !!limite && d.speedKmh > d.speedLimitKmh + 2);
    refs.gear.textContent = d.gear === 0 || d.gear == null
      ? 'N' : (d.gear < 0 ? 'R' : String(d.gear));
    texto('cruise', d.cruiseControl && d.cruiseControlSpeedKmh > 0
      ? vel(d.cruiseControlSpeedKmh) : null);
    const rpmMax = d.engineRpmMax || 2500;
    refs.rpm.style.width = Math.max(0, Math.min(100, (d.engineRpm || 0) / rpmMax * 100)).toFixed(0) + '%';
    refs.rpm.classList.toggle('dRpm-high', (d.engineRpm || 0) > rpmMax * 0.85);

    const luces = d.lights || {};
    const encendido = {
      beamLow: luces.beamLow, beamHigh: luces.beamHigh, parking: luces.parking,
      blinkerLeft: luces.blinkerLeft, blinkerRight: luces.blinkerRight,
      hazards: luces.hazards, beacon: luces.beacon, wipers: d.wipers,
      motorBrake: d.motorBrake,
      // Un camion sin retarder informa cero pasos. Un icono que nunca se va
      // a prender es mobiliario: undefined lo esconde.
      retarder: d.retarderSteps > 0 ? d.retarder > 0 : undefined,
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
  }

  function renderLlegada(d, enViaje, realSeg, viajeJuegoSeg) {
    const margen = enViaje && d.jobDeadlineSeconds != null && viajeJuegoSeg != null
      ? d.jobDeadlineSeconds - viajeJuegoSeg : null;
    refs.cardEta.hidden = margen == null;
    if (margen == null) return;
    texto('etaClaim', margen >= 0 ? t('deadlineEarly', dur(margen)) : t('deadlineLate', dur(-margen)),
          margen >= 0 ? 'bien' : 'mal');
    const partes = [];
    if (d.jobDeadlineSeconds != null) partes.push(t('jobDeadline') + ' ' + dur(d.jobDeadlineSeconds));
    if (realSeg != null) partes.push(t('arrivalLabel') + ' ' + reloj(new Date(Date.now() + realSeg * 1000)));
    texto('etaLine', partes.join(' · ') || null);
    const pago = d.jobIncome ? plata(d.jobIncome) : null;
    const porKm = d.jobIncome && d.plannedDistanceKm
      ? plata(Math.round(d.jobIncome / d.plannedDistanceKm)) + ' ' + t('perKm') : null;
    texto('etaPay', [pago, porKm].filter(Boolean).join(' · ') || null);
  }

  function renderCombustible(d, restanteKm, viajeJuegoSeg, s) {
    const alcance = autonomia(d);
    const pct = d.fuel != null && d.fuelCapacity ? d.fuel / d.fuelCapacity * 100 : null;
    if (restanteKm != null && alcance != null) {
      const suficiente = alcance > restanteKm * 1.08;
      texto('fuelClaim', suficiente ? t('fuelEnoughTo', d.cityDst) : t('fuelShort'),
            suficiente ? 'bien' : 'mal');
    } else if (alcance != null) {
      // Sin destino no hay con que comparar: se dice la autonomia y ya.
      texto('fuelClaim', t('rangeIs', dist(alcance)), null);
    } else {
      texto('fuelClaim', null);
    }

    const descansoSeg = d.restStopMinutes != null ? d.restStopMinutes * 60 : null;
    if (descansoSeg != null && viajeJuegoSeg != null) {
      const sinDormir = descansoSeg > viajeJuegoSeg;
      texto('restClaim', sinDormir ? t('sleepNone') : t('sleepNeeded'),
            sinDormir ? 'bien' : 'mal');
    } else if (descansoSeg != null) {
      texto('restClaim', t('untilRest') + ' ' + dur(descansoSeg) + ' · '
        + hm(descansoSeg / s) + ' ' + t('realShort'), null);
    } else {
      texto('restClaim', null);
    }

    const linea = [];
    if (d.fuel != null) linea.push(num(d.fuel) + ' l' + (pct != null ? ' · ' + num(pct) + ' %' : ''));
    if (alcance != null) linea.push(dist(alcance) + ' ' + t('rangeWord'));
    texto('fuelLine', linea.join(' · ') || null);

    const consumo = combustible.avgLPer100() || d.fuelAvgConsumption || null;
    const bajo = [];
    if (consumo != null) bajo.push(mi() ? num(235.215 / consumo, 1) + ' mpg' : num(consumo, 1) + ' l/100');
    if (d.adblue != null && d.adblueCapacity) {
      bajo.push(t('adblueLabel') + ' ' + num(d.adblue / d.adblueCapacity * 100) + ' %');
    }
    texto('fuelDim', bajo.join(' · ') || null);
    refs.fuelDim.classList.toggle('alerta', !!(d.mechanicalWarnings || {}).adblue);
  }

  function renderCamion(d) {
    const wear = d.wear || {};
    let peor = null, peorPct = -1;
    for (const [pieza, clave] of DASH_WEAR) {
      const valor = wear[pieza];
      ponerDesgaste('wear_' + pieza, valor);
      if (valor != null && valor * 100 > peorPct) { peorPct = valor * 100; peor = clave; }
    }
    if (peor == null) texto('wearClaim', null);
    else if (peorPct < DASH_DESGASTE_SANO) texto('wearClaim', t('truckFine'), 'bien');
    else texto('wearClaim', t('wearWorst', t(peor), Math.round(peorPct)),
               peorPct >= 40 ? 'mal' : null);

    const remolque = d.trailerWear;
    refs.trailerWear.hidden = !remolque;
    if (remolque) for (const [pieza] of DASH_TRAILER_WEAR) ponerDesgaste('twear_' + pieza, remolque[pieza]);

    const partes = [[d.truckBrand, d.truckName].filter(Boolean).join(' ') || null];
    if (d.odometerKm != null) partes.push(dist(d.odometerKm));
    if (d.cargoDamage) partes.push(t('cargoDamage') + ' ' + num(d.cargoDamage * 100, 1) + ' %');
    texto('truckLine', partes.filter(Boolean).join(' · ') || null);
    refs.truckLine.classList.toggle('alerta', d.cargoDamage > 0.02);

    const alertas = d.mechanicalWarnings || {};
    medidor('oilTemp', d.oilTemperature, (v) => num(v) + ' °C', d.oilTemperature > 125);
    medidor('waterTemp', d.waterTemperature, (v) => num(v) + ' °C', alertas.waterTemperature);
    medidor('brakeTemp', d.brakeTemperature, (v) => num(v) + ' °C', d.brakeTemperature > 300);
    medidor('airPressure', d.airPressure, (v) => num(v) + ' psi', alertas.airPressure);
    medidor('oilPressure', d.oilPressure, (v) => num(v) + ' psi', alertas.oilPressure);
    medidor('battery', d.batteryVoltage, (v) => num(v, 1) + ' V', alertas.batteryVoltage);
  }

  function renderFranja(d, enViaje) {
    const partes = [];
    if (d.cargoMassKg) partes.push(num(d.cargoMassKg / 1000, 1) + ' t');
    if (d.plannedDistanceKm) partes.push(t('routeLength') + ' ' + dist(d.plannedDistanceKm));
    refs.cargoBox.hidden = !enViaje;
    texto('cargo', enViaje ? (d.cargo || t('noCargo')) : null);
    texto('cargoSub', partes.join(' · ') || null);

    const st = sesion.state();
    texto('sKm', dist(st.kmDriven) || '-');
    texto('sWheel', hm(st.wheelSeconds) || '-');
    texto('sAvg', st.avgSpeedKmh == null ? '-'
      : vel(st.avgSpeedKmh) + (st.topSpeedKmh ? ' · ' + t('topSpeed') + ' ' + vel(st.topSpeedKmh) : ''));
    texto('sFuel', st.fuelUsedL < 1 ? '-'
      : num(st.fuelUsedL) + ' l' + (st.fuelPer100Km ? ' · ' + num(st.fuelPer100Km, 1) : ''));
    texto('sNet', st.netProfit ? plata(st.netProfit) : '0');
    refs.resetBtn.title = st.startedAt ? t('sessionSince', reloj(new Date(st.startedAt * 1000))) : '';
  }

  function ponerDesgaste(id, valor) {
    const barra = refs[id];
    if (!barra) return;
    const pct = valor == null ? null : valor * 100;
    barra.style.width = (pct || 0).toFixed(1) + '%';
    barra.className = 'dWearBar' + (pct == null ? '' : pct >= 40 ? ' mal' : pct >= 10 ? ' regular' : ' bien');
    barra.parentNode.hidden = pct == null;
  }
  function medidor(id, valor, formato, alerta) {
    const box = refs[id + 'Box'];
    box.hidden = valor == null;
    if (valor == null) return;
    refs[id].textContent = formato(valor);
    box.classList.toggle('alerta', !!alerta);
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
      sesion.push(data);
      combustible.push(data.odometerKm, data.fuel, [data.game, data.truckBrand, data.truckName].join('|'));
      render();
    },
    refresh() { render(); },
    setVisible(v) { visible = !!v; if (v) render(); },
    resetSession() { sesion.reset(ultimo && ultimo.game, ultimo && ultimo.ts); render(); },
    hasData() { return ultimo != null; },
  };
}

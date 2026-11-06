// Maneja el codigo de la web desde afuera: lo que en la pagina hace handleTelemetry, el
// onmessage del socket y loadGameMap, sin dibujar nada. La regla es no decidir nada aca:
// una decision de ruteo o de avisos va en pure.js o app.js, y entra sola al compilar.
//
// Si una de estas se renombra en app.js, armar_motor.js falla al compilar y avisa:
// RAICES: ["updateMap", "updateDestinationMarker", "updateRouteSummary", "navTurnParts", "navLanesFor", "loadCities", "loadRouteGraph", "loadRoadNames", "loadPois", "computeRealEtaSeconds", "noRouteText", "resolveRouteTarget", "sendNavHud", "speakVoice", "voiceDone", "applyRoutePlan", "applyRoutePrefs", "applyVoiceDevice", "sendRoutePlanHello", "applyDetectedDlcs", "setClientOverlay", "setObsOverlay", "clearWaypoint", "restoreWaypoints", "claimVoice", "releaseVoice", "deviceLabel", "planCapable", "navTargetZoom", "sendLiveRoute", "setAtlasData", "setRoadShieldData", "applyVehicleMode", "startDemo", "fetchLatestClientVersion", "loadTrips", "recordTrip", "saveSettings", "currentSettings", "currentVoice", "loadVoiceCatalog", "connectLanPlan", "buildTurnReport", "checkNavReports"]

// ------------------------------------------------------ lo que no se dibuja
var fuentesRuta = { route: null, 'route-next': null, 'route-ferry': null };
var rutaCambio = false;
// Lo demas que la web le pone al mapa: los datos los calcula ella y los dibuja Kotlin.
var fuentesCapas = { 'road-shields': null, atlas: null, 'car-parking': null, fuel: null };
var capasCambiaron = false;
var filtroPoi = null;
var estacionamientoVisible = false;
// La ruta del lider del convoy se mueve con el: va aparte de las capas, que pesan.
var rutaConvoy = { geo: null, color: '#3b9eff', opacidad: 0.5 };
var rutaConvoyCambio = false;
var mapBase = {
  getSource(id) {
    if (id === 'convoy-route') return { setData(d) { rutaConvoy.geo = d; rutaConvoyCambio = true; } };
    if (id in fuentesCapas) return { setData(d) { fuentesCapas[id] = d; capasCambiaron = true; } };
    if (!(id in fuentesRuta)) return null;
    return { setData(d) { fuentesRuta[id] = d; rutaCambio = true; } };
  },
  getLayer(id) { return id === 'poi' || id === 'car-parking' ? {} : null; },
  setFilter(id, f) {
    if (id !== 'poi') return;
    filtroPoi = f;
    capasCambiaron = true;
  },
  setPaintProperty(id, propiedad, valor) {
    if (id !== 'convoy-route-line') return;
    if (propiedad === 'line-color') rutaConvoy.color = valor;
    if (propiedad === 'line-opacity') rutaConvoy.opacidad = valor;
    rutaConvoyCambio = true;
  },
  setLayoutProperty(id, propiedad, valor) {
    if (id !== 'car-parking') return;
    estacionamientoVisible = valor === 'visible';
    capasCambiaron = true;
  },
  getCenter() { return { lat: 45, lng: 0 }; },
  getBearing() { return 0; },
  getZoom() { return 10; },
  isMoving() { return false; },
  hasImage() { return true; },
};
var map = new Proxy(mapBase, { get: (o, k) => (k in o ? o[k] : nada) });

function ensureMapInitialized() {}
function setMapLoading() {}
function showMapHint() {}
function renderConnectionUi() {}
function renderLiveShareControls() {}
function updateHud() {}
function animateTruckTo() {}
function followCameraTo() {}
function navCameraOn() { return false; }
function updateNavPanel() {}
function applyBaseMap() {}
function buildVecLayers() { return []; }
function updateTruckArrowSize() {}
function unlockVoiceOnGesture() {}
function updateLivePlayers() {}
// La web dibuja cada escudo en un canvas; Kotlin, con lo mismo.
var escudos = new Map();
function addRoadShieldImage(label, k, n) { escudos.set(label, { label, k, n }); }
// Lo que pone el armador de la pagina (un parametro del script): aca, la version de la app.
var versionApp = 'android';
function webVersion() { return versionApp; }
// De donde preguntar la ultima version del cliente: el relay de esta app.
var relayApp = null;

// La demo de la web corre entera y le pasa cada dato a esto: Kotlin lo devuelve por el mismo
// camino que un dato del cliente, y asi el tablero y el mapa no saben que es una demo.
function handleTelemetry(data) { salida.demo.push(JSON.stringify(data)); }

var avisos = [];
function showToast(texto) { avisos.push(String(texto)); }

// La de la web corre igual (deja los textos que despues lee sendNavHud); aca se anota que mostro.
var resumenRuta = null;
var renderRouteSummaryWeb = renderRouteSummary;
renderRouteSummary = function (r) {
  resumenRuta = r;
  renderRouteSummaryWeb(r);
};

var ultimoGiro = null;
function voiceManeuverTick(turn) {
  ultimoGiro = turn;
  if (!voiceOn) return;
  const key = voiceGuide.maneuver(turn, Math.abs(Number(lastData && lastData.speedKmh) || 0));
  if (key && voiceHere()) speakVoice(key);
}

// ------------------------------------------------------ la variante
// La elige Kotlin (CatalogoMapas, con lo que eligio la persona a mano) y puede ser una
// publicada despues de compilar esta app: el manifest se baja al abrir.
var varianteElegida = null;
function resolveEffectiveGame(game) {
  return varianteElegida || game || 'ats';
}

function loadGameMap(game) {
  if (!GAME_MAPS[game] || game === currentGame) return;
  const mapInfo = GAME_MAPS[game];
  currentGame = game;
  toLngLat = mapInfo.toLngLat;
  fromLngLat = mapInfo.fromLngLat;
  mapLoadToken += 1;
  // El grafo, los nombres y los POIs bajan por detras, como en la web: mientras no
  // llegan no hay ruta, y updateDestinationMarker vuelve a probar en cada dato.
  loadCities(mapInfo).then(() => {
    if (game === currentGame) return Promise.all([loadRouteGraph(mapInfo), loadRoadNames(mapInfo)]);
    return null;
  }).catch((e) => console.error('cargar mapa', e));
  loadPois(game);
  roadNames = [];
  setRoadShieldData();
  setAtlasData();
  currentRouteTarget = null;
  currentRouteWorldPoints = null;
  trailWorld.length = 0;
  lastDisplayedLngLat = null;
  setRouteData(emptyLineString());
  if (map.getSource('route-next')) map.getSource('route-next').setData(emptyLineString());
  if (map.getSource('route-ferry')) map.getSource('route-ferry').setData(emptyLineString());
  destMarker = null;
  clearWaypoint(true);
  restoreWaypoints();
}

// ------------------------------------------------------ lo que sale
function destinoAhora() {
  if (!destMarker || !destMarker.lngLat) return null;
  return { lng: destMarker.lngLat[0], lat: destMarker.lngLat[1], kind: destMarker._kind, approx: !!destMarker._approx };
}

// La web le pasa al mapa una LineString vacia para decir "sin ruta": GL JS la acepta y
// MapLibre Native rechaza todo el GeoJSON ("a line string must have two or more points").
function lineaParaMapa(f) {
  const g = f && f.geometry;
  if (!g) return '';
  if (g.type === 'LineString') return g.coordinates.length >= 2 ? JSON.stringify(f) : '';
  if (g.type !== 'MultiLineString') return JSON.stringify(f);
  const partes = g.coordinates.filter((l) => l.length >= 2);
  return partes.length ? JSON.stringify({ ...f, geometry: { ...g, coordinates: partes } }) : '';
}

// La web recorta la linea cada segundo, y son cientos de KB que cruzan a Kotlin y a MapLibre.
// Lo que se recorta es lo que queda atras del camion, tapado por el rastro: alcanza con cada
// tanto. Una ruta nueva va en el momento.
var RUTA_CADA_MS = 5000;
var rutaEnviadaEn = 0;
var rutaEnviadaDe = null;

function volcar() {
  const s = salida;
  salida = { fetch: [], audio: [], mensajes: [], guardar: [], log: [], sockets: [], sonidos: [], demo: [] };
  const fuera = {
    fetch: s.fetch,
    audio: s.audio,
    mensajes: s.mensajes,
    guardar: s.guardar,
    log: s.log,
    sockets: s.sockets,
    sonidos: s.sonidos,
    demo: s.demo,
    avisos,
    timerMs: msAlProximoTimer(),
    grafo: typeof routeGraphState === 'undefined' ? null : routeGraphState,
  };
  avisos = [];
  if (ajustesCambiaron) {
    ajustesCambiaron = false;
    fuera.ajustes = true;
  }
  if (capasCambiaron) {
    capasCambiaron = false;
    fuera.capas = true;
  }
  if (convoyCambio) {
    convoyCambio = false;
    fuera.convoy = true;
  }
  if (rutaConvoyCambio) {
    rutaConvoyCambio = false;
    fuera.rutaConvoy = true;
  }
  if (estadoReporte) {
    fuera.reporte = estadoReporte;
    estadoReporte = null;
  }
  if (rutaCambio && (currentRouteFull !== rutaEnviadaDe || Date.now() - rutaEnviadaEn >= RUTA_CADA_MS)) {
    rutaCambio = false;
    rutaEnviadaEn = Date.now();
    rutaEnviadaDe = currentRouteFull;
    fuera.ruta = { conLinea: !!routeShown };
  }
  return JSON.stringify(fuera);
}

/** Lo que muestra la pantalla de navegacion, despues de cada dato. */
function navegacion() {
  const partes = navTurnParts(ultimoGiro);
  return {
    giro: partes,
    sinRuta: partes ? null : noRouteText(),
    resumen: resumenRuta,
    destino: destinoAhora(),
    proximaCiudad: nextCityName || null,
    rumbo: lastHeadingDeg,
    zoomNav: navTargetZoom(ultimoGiro),
    hayRuta: !!currentRouteWorldPoints,
    carriles: laneGuidance(laneHudRecord(navLanesFor(ultimoGiro))),
    waypoints: waypoints.map((w) => ({ etiqueta: w.label, tipo: w.kind, lng: w.lngLat[0], lat: w.lngLat[1] })),
    sugerencia: stopSuggestKind
      ? {
        tipo: stopSuggestKind,
        texto: t(stopSuggestKind === 'g' ? 'stopLowFuel' : 'stopRestSoon'),
        boton: t(stopSuggestKind === 'g' ? 'stopGoFuel' : 'stopGoRest'),
      }
      : null,
    rutaOculta: !!(resumenRuta && resumenRuta.dismissed),
    // Con los textos de la web, como el giro: en el mapa van al lado de lo demas que dice.
    textoRutaOculta: t('routeHiddenLabel'),
    textoMostrarRuta: t('routeShowAgain'),
    // Como renderVoiceDeviceHint: prendida aca, pero la dice otro dispositivo.
    vozEnOtro: voiceOn && planCapable() && voiceDevice && voiceDevice.device !== DEVICE_ID
      ? t('voiceOtherDevice').replace('{device}', deviceLabel(voiceDevice)) : null,
    textoVozAca: t('voiceSpeakHere'),
    avisoRuta: avisoDeRuta(resumenRuta),
    actualizarCliente: avisoDeVersion(),
    perfil: routeProfile,
  };
}

// checkUpdateBanner: el cliente de la PC tiene una version nueva.
function avisoDeVersion() {
  const conectado = (conn.clientStatus && conn.clientStatus.clientVersion) || (lastData && lastData.clientVersion);
  if (!latestClientVersion || !conectado || !isNewerVersion(latestClientVersion, conectado)) return null;
  return {
    texto: t('updateAvailableText').replace('{v}', latestClientVersion),
    boton: t('updateBannerLink'),
    url: latestDownloadUrl || 'https://trucksim-dash.com/#get-started',
  };
}

// Los carteles de abajo del resumen (renderRouteSummary): por que la ruta no va a donde
// uno creeria, o que es aproximada. Sin ellos se lee como un destino equivocado.
function avisoDeRuta(r) {
  if (!r) return null;
  if (r.offMap) return t('routeOffMap').replace('{name}', r.offMap.name || r.offMap);
  const textos = [r.pickup || null, r.approx ? t('destApprox') : null, r.dlc ? t('dlcRouteNotice') : null].filter(Boolean);
  return textos.length ? textos.join(' ') : null;
}

var resultadosBusqueda = [];

// ------------------------------------------------------ el convoy
// convoy.js corre entero: quien entra, quien maneja, reconectar, seguir al lider. Lo que
// escribe en la pagina (el carrusel, la lista) no lo ve nadie: aca se arma lo mismo con datos.
var convoyCambio = false;
var convoyRenderAllWeb = convoyRenderAll;
convoyRenderAll = function () {
  convoyCambio = true;
  convoyRenderAllWeb();
};
var convoyRenderCardsWeb = convoyRenderCards;
convoyRenderCards = function () {
  convoyCambio = true;
  convoyRenderCardsWeb();
};
// La web sintetiza los sonidos con AudioContext; aca los hace Kotlin.
convoyPlaySound = function (tipo) {
  if (!convoyMuted && !convoy.spectator) salida.sonidos.push(tipo);
};

function tarjetaConvoy(m) {
  const mia = convoyMyVariant();
  const otroJuego = m.game && !convoySameGame(m) ? t('convoyOtherGame').replace('{game}', (m.game || '').toUpperCase()) : null;
  const dist = m.online && m.x != null && convoySameGame(m) ? convoyDistanceTo(m) : null;
  const distancia = dist ? (dist.behind ? t('convoyBehind') : t('convoyAway')).replace('{d}', convoyFormatDistance(dist.meters)) : '';
  const estado = !m.online ? t('convoyOffline') : (m.paused ? t('convoyInMenu') : null);
  const nota = convoy.msgNotes.get(m.id);
  const millas = (km) => (useImperial ? `${(km * KM_TO_MI).toFixed(0)} mi` : `${km.toFixed(0)} km`);
  const velocidad = m.online && m.speedKmh != null
    ? `${Math.round(useImperial ? m.speedKmh * KM_TO_MI : m.speedKmh)}${useImperial ? ' mph' : ' km/h'}` : '-';
  const masa = m.cargoMassKg ? ` (${formatCargoMass(m.cargoMassKg, currentLang, useImperial)})` : '';
  const filas = [
    [t('speed'), velocidad],
    [t('cargo'), `${m.cargo || t('noCargo')}${masa}`],
    [t('route'), `${m.citySrc || '?'} → ${m.cityDst || '?'}`],
    [t('etaGame'), `${m.etaSeconds != null ? formatSeconds(m.etaSeconds) : '-'}${m.distanceKm ? ` (${millas(m.distanceKm)})` : ''}`],
    [t('fuel'), m.fuelPct != null ? `${m.fuelPct}%` : '-'],
    [t('nextRest'), m.restMin != null && m.restMin > 0 && m.restMin < 1440 ? formatSeconds(m.restMin * 60) : '-'],
  ];
  if (m.jobIncome) filas.push([t('jobPay'), moneyLine(m.jobIncome, m.game)]);
  if (m.truck) filas.push([t('truck'), m.truck]);
  return {
    id: m.id,
    nombre: m.nickname,
    color: convoyColor(m),
    lider: !!m.creator,
    variante: mia && m.variant && m.variant !== mia ? convoyVariantLabel(m.variant) : null,
    estado: estado || otroJuego || distancia || '',
    nota: nota && nota.until > Date.now() ? `${(CONVOY_QUICK.find((q) => q.key === nota.key) || {}).icon || ''} ${t(`convoyMsg_${nota.key}`)}` : null,
    filas,
    puedeSeguir: !!m.creator && !otroJuego,
  };
}

function marcasConvoy() {
  if (!convoyShowMarkers || !toLngLat) return [];
  const mia = convoyMyVariant();
  return convoy.members
    .filter((m) => m.id !== convoy.you && m.online && m.x != null && convoySameGame(m))
    .map((m) => {
      const [lng, lat] = toLngLat(m.x, m.z);
      const otra = !!(mia && m.variant && m.variant !== mia);
      return {
        id: m.id, lng, lat,
        rumbo: gridHeadingToGeo(m.heading || 0, m.x, m.z, toLngLat),
        color: convoyColor(m),
        nombre: otra ? `${m.nickname} (${convoyVariantLabel(m.variant)})` : m.nickname,
        tenue: otra || !!m.paused,
      };
    });
}

function convoyEstado() {
  const enSala = convoyInRoom();
  const yo = convoyMe();
  const textos = {};
  for (const k of ['convoyTitle', 'convoyIntro', 'convoyNickLabel', 'convoyShareIncome', 'convoyCreateTitle', 'convoyPostSummary',
    'convoyCreate', 'convoyJoinTitle', 'convoyJoin', 'convoyNotConnected', 'convoyPrivacyHint', 'convoyCopyLink', 'convoyCopied',
    'convoyShowMarkers', 'convoyMute', 'convoyLeave', 'convoyCloseConvoy', 'convoyKick', 'convoyLeaderTag', 'convoyFollow',
    'convoyUnfollow', 'convoyHideRoute', 'convoyShowRoute', 'convoyMsgBtn', 'close']) textos[k] = t(k);
  return {
    enSala,
    disponible: convoyAvailable(),
    conectado: conn.socket === 'open',
    aviso: conn.local ? t('convoyUnavailableLan') : null,
    codigo: convoy.code,
    apodo: convoyNick,
    compartirIngresos: convoyShareIncome,
    silencio: convoyMuted,
    mostrarMarcas: convoyShowMarkers,
    soyLider: !!(yo && yo.creator),
    espectadores: t('convoySpectators').replace('{n}', convoy.spectators),
    enlace: enSala ? convoyLink() : null,
    miembros: convoy.members.map((m) => ({
      id: m.id,
      nombre: m.nickname,
      color: convoyColor(m),
      lider: !!m.creator,
      yo: m.id === convoy.you,
      estado: m.id === convoy.you ? t('convoyYou') : (!m.online ? t('convoyOffline') : (m.paused ? t('convoyInMenu') : (m.game || '').toUpperCase())),
    })),
    tarjetas: enSala ? convoy.members.filter((m) => m.id !== convoy.you).map(tarjetaConvoy) : [],
    marcas: enSala ? marcasConvoy() : [],
    siguiendo: convoy.follow,
    rutaLider: convoy.showLeaderRoute,
    mensajes: CONVOY_QUICK.map((q) => ({ id: q.key, label: `${q.icon} ${t(`convoyMsg_${q.key}`)}` })),
    textos,
  };
}

// ------------------------------------------------------ mapas sin internet
// Lo que el mapa baja para navegar, para tenerlo antes de quedarse sin red. Tiene que dar
// lo mismo que piden loadCities, loadRoadNames, loadRouteGraph y loadPois (probar_motor).
function urlsDeMapa(id, version) {
  const dir = `${REMOTE_MAP_BASE}/${id}`;
  const base = `${dir}/route-graph-${id}`;
  const v = `?v=${version}`;
  const g = `${v}&g=${ROUTE_GRAPH_V3_REV}`;
  return [
    `${dir}/Cities.json${v}`,
    `${dir}/road-names.json${v}`,
    `${base}-v3.bin${g}`,
    `${base}-lanes.bin${g}&l=${ROUTE_LANES_REV}`,
    `${base}-times.bin${g}&t=${ROUTE_TIMES_REV}`,
    `${base}-prefabs.bin${g}&p=${ROUTE_PREFABS_REV}`,
    urlAbsoluta(`${POI_BASE}/pois-${id}.json`),
  ];
}

// ------------------------------------------------------ el historial de viajes
// Solo de este telefono, como en la web: los de la cuenta los guarda el cliente de la PC.
var entregaVista = false;
function anotarViaje(data) {
  const e = data.event || {};
  if (e.jobDelivered && !entregaVista) recordTrip(e);
  entregaVista = !!e.jobDelivered;
}

function historialViajes() {
  return {
    titulo: t('settingsHistoryTitle'),
    vacio: t('tripHistoryEmpty'),
    borrar: t('tripHistoryClear'),
    lista: loadTrips().map((v) => ({
      ruta: `${v.src || '?'} → ${v.dst || '?'}`,
      detalle: [v.cargo || '-', useImperial ? `${Math.round(v.distanceKm * KM_TO_MI)} mi` : `${v.distanceKm} km`, v.truck || ''].filter(Boolean).join(' · '),
      pago: moneyLine(v.revenue, v.game),
      cuando: v.t,
      juego: v.game ? v.game.toUpperCase() : null,
    })),
  };
}

// ------------------------------------------------------ los ajustes de navegacion
// Lo que en la web son los campos de Ajustes y de la ventana de DLC. Los guarda la web
// (saveSettings): el perfil y los DLC, ademas, los cambia otro dispositivo de la sesion.
var ajustesCambiaron = false;

function ajustesNav() {
  if (!voiceCatalog) loadVoiceCatalog().then((c) => { if (c) ajustesCambiaron = true; });
  const elegida = currentVoice();
  const detectado = ['ats', 'ets2'].filter((g) => detectedDlcs && Array.isArray(detectedDlcs[g])).map((g) => {
    const tiene = DLC_LIST[g].filter((d) => detectedDlcs[g].includes(d[0])).length;
    return `${g === 'ats' ? 'ATS' : 'ETS2'} ${tiene} / ${DLC_LIST[g].length}`;
  });
  const juegos = currentGame && dlcGameOf(currentGame) === 'ats' ? ['ats', 'ets2'] : ['ets2', 'ats'];
  const claves = ['settingsVoiceTitle', 'settingsVoiceTest', 'settingsVoiceHint', 'settingsVoiceTiming', 'settingsRouteTitle',
    'settingsRouteFastest', 'settingsRouteShortest', 'settingsEveryExitTitle', 'settingsEveryExit', 'settingsEveryExitHint',
    'settingsRestWarnTitle', 'settingsRestWarn', 'settingsRestWarnHint', 'dlcTitle', 'dlcHint', 'dlcAutoLabel', 'modsManualLabel',
    'close', 'navReportOpen'];
  const textos = {};
  for (const k of claves) textos[k] = t(k);
  return {
    perfil: routeProfile,
    voces: voiceCatalog ? voiceChoices(voiceCatalog.voices, currentLang, voiceLangName, t('settingsVoiceSystem')) : [],
    voz: elegida ? elegida.id : null,
    momentos: [['early', 'voiceTimingEarly'], ['normal', 'voiceTimingNormal'], ['late', 'voiceTimingLate']].map(([id, k]) => ({ id, label: t(k) })),
    momento: voiceTiming,
    descansos: REST_WARN_OPTIONS.map((m) => ({ id: String(m), label: `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` })),
    descanso: String(restWarnMin),
    cadaSalida: navEveryExit,
    dlcAuto,
    dlcEstado: detectado.length ? `${t('dlcDetected')} ${detectado.join(' · ')}` : t('dlcAutoWaiting'),
    dlc: juegos.map((juego) => ({
      juego,
      titulo: juego === 'ats' ? 'American Truck Simulator' : 'Euro Truck Simulator 2',
      lista: DLC_LIST[juego].map(([id, nombre]) => ({ id, nombre, activo: !dlcOffFor(juego).includes(id) })),
    })),
    textos,
  };
}

// ------------------------------------------------------ el reporte de navegacion
// El escuchador de "Send report" de la web, sin la ventana: las decisiones estan en pure.js.
var estadoReporte = null;
var TEXTO_TIPO_REPORTE = {
  wrong_warning: 'navReportKindWrong',
  missing_warning: 'navReportKindMissing',
  road_name: 'navReportKindName',
  route: 'navReportKindRoute',
  voice: 'navReportKindVoice',
};

function abrirReporte() {
  navReportText = buildTurnReport();
  navReportHasTurns = turnLog.list().length > 0;
  navReportConfirmed = false;
  const claves = ['navReportOpen', 'navReportIntro', 'navReportOnlyNav', 'navReportKindLabel', 'navReportDescLabel',
    'navReportDescPlaceholder', 'navReportShowData', 'navReportSend', 'turnReportCopy', 'turnReportCopied', 'close'];
  const textos = {};
  for (const k of claves) textos[k] = t(k);
  return {
    reporte: navReportText,
    hayAvisos: navReportHasTurns,
    tipos: NAV_REPORT_KINDS.map((id) => ({ id, label: t(TEXTO_TIPO_REPORTE[id] || 'navReportKindOther') })),
    maximo: NAV_REPORT_DESC_MAX,
    textos,
  };
}

async function mandarReporte(tipo, descripcion) {
  if (conn.demo) {
    estadoReporte = { estado: 'falta', texto: t('navReportDemo') };
    return;
  }
  const pedido = navReportBody({
    kind: tipo,
    description: descripcion,
    report: navReportText,
    game: lastData && lastData.game,
    map: currentGame,
    web: webVersion(),
    client: (conn.clientStatus && conn.clientStatus.clientVersion) || (lastData && lastData.clientVersion) || null,
  });
  if (pedido.error) {
    estadoReporte = { estado: 'falta', texto: t('navReportNeedKind') };
    return;
  }
  if (!navReportConfirmed && navReportLooksEmpty({ hasTurns: navReportHasTurns, description: pedido.body.description })) {
    navReportConfirmed = true;
    estadoReporte = { estado: 'confirmar', texto: t('navReportLooksEmpty'), boton: t('navReportSendAnyway') };
    return;
  }
  estadoReporte = { estado: 'mandando', texto: t('navReportSending') };
  let status = 0;
  let cuerpo = null;
  try {
    const res = await fetch(NAV_REPORT_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pedido.body),
    });
    status = res.status;
    cuerpo = await res.json().catch(() => null);
  } catch (e) { status = 0; }
  const fin = navReportOutcome(status, cuerpo);
  if (fin.state === 'sent') {
    const ahora = Date.now();
    lsSet(NAV_REPORTS_KEY, JSON.stringify(navReportsAdd(navReportsParse(lsGet(NAV_REPORTS_KEY), ahora), fin, ahora)));
    estadoReporte = { estado: 'mandado', texto: t('navReportSent', fin.id) };
    return;
  }
  estadoReporte = fin.state === 'tooMany'
    ? { estado: 'muchos', texto: t('navReportTooMany') }
    : { estado: 'fallo', texto: t('navReportFailed') };
}

// ------------------------------------------------------ lo que entra
var motor = {
  iniciar(texto) {
    const o = JSON.parse(texto);
    navMode = true; // sin esto no se calcula el giro (guiando, en updateMap)
    isLeaderTab = true; // hay un solo motor; las otras pestanas son de otro dispositivo
    autoFollow = false;
    truckMarker = nada;
    mapReady = true;
    conn.socket = 'open';
    // Sin ruta propia no se manda la vacia: borraba la que comparte otra pestana.
    liveRouteSig = 'none';
    if (o.version) versionApp = o.version;
    if (o.relay) relayApp = o.relay;
    if (o.apodo && !convoyNick) convoyNick = String(o.apodo).trim().slice(0, 16);
    motor.ajustes(JSON.stringify(o));
    settingsBaseline = JSON.parse(JSON.stringify(currentSettings()));
    // Si ya se arreglo alguno de los reportes de este telefono, como al abrir la pagina.
    setTimeout(checkNavReports, 8000);
    setInterval(checkNavReports, NAV_REPORT_CHECK_MS);
  },

  ajustes(texto) {
    const o = JSON.parse(texto);
    if (o.imperial !== undefined) useImperial = !!o.imperial;
    if (o.voz !== undefined) voiceOn = !!o.voz;
    if (o.lang && TRANSLATIONS[o.lang]) currentLang = o.lang;
  },

  /** La variante y, si esta app no la conocia, sus datos del manifest. */
  ponerVariante(id, version, juego, proyeccion, nombre, lng, lat) {
    MAP_DATA_VERSION[id] = version;
    if (!GAME_MAPS[id]) {
      const p = PROJECTIONS[proyeccion] || PROJECTIONS[juego];
      GAME_MAPS[id] = {
        assetsDir: `${REMOTE_MAP_BASE}/${id}`,
        pmtilesUrl: `${REMOTE_MAP_BASE}/vector/${id}.pmtiles`,
        sourceLayer: juego,
        label: nombre,
        toLngLat: p.toLngLat,
        fromLngLat: p.fromLngLat,
        origin: [lng, lat],
        basemap: BASEMAP_BY_PROJECTION[proyeccion] || null,
      };
    }
    varianteElegida = id;
  },

  telemetria(texto) {
    let data = JSON.parse(texto);
    if (positionAtOrigin(data.position)) data = { ...data, position: null };
    // En auto hay otros estacionamientos y otros surtidores, tambien para el boton de parada.
    const enAuto = isDrivingCar(data);
    if (enAuto !== drivingCar) {
      drivingCar = enAuto;
      applyVehicleMode();
    }
    // Antes de todo lo que lee el trabajo: falta enganchar el remolque que espera en el origen.
    if (trailerPickupWatch.update(data)) data = { ...data, trailerPickup: true };
    // Cargar combustible o dormir da por cumplida la parada; avisan poco combustible y
    // descanso cerca. Una parada que no se cumple sola hacia volver la ruta para atras.
    trackFuel(data);
    trackStatus(data);
    conn.clientConnected = true;
    conn.hasTelemetry = true;
    conn.paused = !!data.paused;
    lastData = data;
    // Lo de updateHud que le importa a la ruta: la llegada en tiempo real.
    routeSummaryEtaSeconds = computeRealEtaSeconds(data);
    updateMap(data.position || {}, data.game, data.heading);
    updateDestinationMarker(data);
    updateRouteSummary(data);
    checkMissingCompanies(data);
    if (clientOverlayOn || obsOverlayOn) sendNavHud();
    anotarViaje(data);
    convoyOnTelemetry(data);
    if (convoyInRoom()) convoyCambio = true; // las distancias, con cada dato
    return JSON.stringify(navegacion());
  },

  /** Un mensaje del socket con type: como el onmessage de connectWs. */
  mensaje(texto) {
    const d = JSON.parse(texto);
    if (String(d.type).startsWith('convoy_')) convoyHandleMessage(d);
    else if (d.type === 'route_plan') applyRoutePlan(d);
    else if (d.type === 'voice_device') applyVoiceDevice(d);
    else if (d.type === 'route_prefs') {
      applyRoutePrefs(d);
      ajustesCambiaron = true;
    } else if (d.type === 'live_players' || d.type === 'live_share_state') return;
    else if (d.type === 'session_state') {
      if (d.client_status) conn.clientStatus = d.client_status;
      // El relay y el codigo de la sesion: plan de ruta, voz y ajustes compartidos.
      if (conn.local) connectLanPlan(d.planRelay);
      setClientOverlay(d.client_status && d.client_status.overlay);
      setObsOverlay(d.obs_overlay);
      if (d.client_status) applyDetectedDlcs(d.client_status.mapDlcs);
      ajustesCambiaron = true;
    } else if (d.type === 'client_status') {
      conn.clientStatus = d;
      setClientOverlay(d.overlay);
      applyDetectedDlcs(d.mapDlcs);
      ajustesCambiaron = true;
    }
  },

  /** Lo que pasa en un socket que abrio la web (ver WebSocket en puente.js). */
  socket(id, tipo, texto, codigo) {
    const s = sockets.get(id);
    if (!s) return;
    if (tipo === 'open') {
      s.readyState = 1;
      if (s.onopen) s.onopen({});
    } else if (tipo === 'message') {
      if (s.onmessage) s.onmessage({ data: texto });
      ajustesCambiaron = true; // pueden ser los ajustes de ruta de otro dispositivo
    } else {
      s.readyState = 3;
      sockets.delete(id);
      if (s.onclose) s.onclose({ code: codigo });
    }
  },

  conexion(abierta, porLan) {
    ws.readyState = abierta ? 1 : 3;
    conn.local = !!porLan;
    conn.socket = abierta ? 'open' : 'closed';
    // Se paso del LAN al relay: el plan vuelve a ir por la conexion de siempre.
    if (abierta && !porLan && lanPlanRelay) connectLanPlan(null);
    if (abierta && !porLan) sendRoutePlanHello();
    if (abierta && relayApp && !latestClientVersion) fetchLatestClientVersion(relayApp);
    if (abierta) {
      convoyOnSocketOpen(); // el relay no se acuerda: se vuelve a entrar con lo que se sabia
      convoyCambio = true;
    }
    // Solo compartiendo: sin eso se mandaria la vacia, que borra la de otra pestana. El relay
    // recien despues de abrir dice si la sesion comparte (motor.compartir).
    if (abierta && liveShareEnabled) {
      liveRouteSig = currentRouteWorldPoints ? null : 'none';
      sendLiveRoute(true);
    }
  },

  /** Lo que dice el relay de compartir: la ruta en el mapa en vivo depende de esto. */
  compartir(activo, variante) {
    liveShareEnabled = !!activo;
    lastSentMapVariant = activo ? variante : null;
    sendLiveRoute(true);
  },

  respuesta(id, status, cuerpo) {
    const p = pedidos.get(id);
    if (!p) return;
    pedidos.delete(id);
    if (status === 0) p.rechazar(new Error('sin red'));
    else p.resolver(respuestaDe(status, cuerpo));
  },

  audioTermino(id) {
    const a = audios.get(id);
    if (!a) return;
    audios.delete(id);
    const fin = a.onended || a.onend;
    if (fin) fin();
  },

  /** Prender la voz la trae a este dispositivo, como el tilde de Ajustes. */
  voz(prendida) {
    voiceOn = !!prendida;
    if (voiceOn) {
      claimVoice();
      speakVoice('soon_turn_right');
    } else {
      releaseVoice();
    }
  },

  /** El boton "Speak here": la voz ya estaba prendida, la tenia otro dispositivo. */
  traerVoz() {
    claimVoice();
  },

  // ---------------------------------------------- lo que pide la persona
  // Lo que en la web son los escuchadores de los botones (el buscador, el aviso de parada).

  /** 'g' estacion, 'p' descanso: la mejor sobre la ruta. false si todavia no se puede. */
  parada(codigo) {
    return !!addNearestStop(codigo);
  },

  /** El aviso de arriba del mapa: "poco combustible" con su atajo. */
  aceptarSugerencia() {
    if (stopSuggestKind && addNearestStop(stopSuggestKind)) renderStopSuggest(null);
  },
  cerrarSugerencia() {
    stopSuggestion.close(stopSuggestKind);
    renderStopSuggest(null);
  },

  /** renderPoiResults sin el HTML: texto, o sin texto la categoria, del mas cercano. */
  buscar(texto, categoria) {
    const pos = lastWorldPos;
    if (!pois) {
      const v = poiVariantNow();
      if (v && !poisLoading) loadPois(v);
      return JSON.stringify({ aviso: poisError ? t('poiLoadFailed') : t('poiLoading'), lista: [] });
    }
    if (!pos) return JSON.stringify({ aviso: t('poiNoPosition'), lista: [] });
    const q = String(texto || '').trim();
    resultadosBusqueda = q
      ? searchCompanies(q, pos.x, pos.z, 20).map((r) => ({ ...r, name: r.label, sub: cityLabel(r.city) }))
      : nearestFacilities(categoria || 'g', pos.x, pos.z, 15).map((r) => (r.code === 'a'
        ? { ...r, sub: [t(r.kind === 't' ? 'atlasTouristBoard' : 'atlasPoi'), nearestCityName(r.x, r.z)].filter(Boolean).join(' · ') }
        : { ...r, name: t(POI_CODES[r.code]), sub: nearestCityName(r.x, r.z) || '' }));
    const rumbo = lastData && Number.isFinite(lastData.heading) ? lastData.heading : null;
    return JSON.stringify({
      aviso: resultadosBusqueda.length ? null : t('poiNoResults'),
      lista: resultadosBusqueda.map((r, i) => {
        const rel = poiRelative(pos.x, pos.z, rumbo, r.x, r.z);
        return {
          i,
          nombre: r.name,
          sub: r.sub || '',
          distancia: formatPoiDistance(r.dist, [[pos.x, pos.z], [r.x, r.z]]),
          atras: !!(rel && rel.side === 'behind'),
        };
      }),
    });
  },
  elegir(i) {
    const r = resultadosBusqueda[i];
    if (r) addPoiWaypoint([r.x, r.z], r.sub ? `${r.name} (${r.sub})` : r.name, r.code || null);
  },

  /** Un punto por donde pasar, tocando el mapa: sin nombre ni tipo (waypointPassesBy). */
  waypointEnMapa(lng, lat) {
    if (!fromLngLat) return;
    endRouteDismissal();
    addWaypoint(fromLngLat(lng, lat), [lng, lat], false, null);
  },
  sacarWaypoint(i) { removeWaypoint(i); },
  limpiarWaypoints() { clearWaypoint(); },
  ocultarRuta() { resetDisplayedRoute(); },
  mostrarRuta() { restoreDismissedRoute(); },

  // Los escuchadores de Ajustes y de la ventana de DLC.
  ajustesNav: () => JSON.stringify(ajustesNav()),
  perfilRuta(perfil) {
    routeProfile = perfil;
    saveSettings();
    routePrefsChanged(); // a los demas dispositivos de la sesion
    invalidateRoute();
    ajustesCambiaron = true;
  },
  elegirVoz(id) {
    voiceByLang[currentLang] = id;
    saveSettings();
    speakVoice('soon_turn_right');
    ajustesCambiaron = true;
  },
  probarVoz() { speakVoice('soon_turn_right'); },
  momentoVoz(valor) {
    voiceTiming = voiceTimingSetting(valor);
    voiceGuide.setTiming(voiceTiming);
    saveSettings();
    ajustesCambiaron = true;
  },
  avisoDescanso(valor) {
    restWarnMin = restWarnSetting(valor);
    statusAlerts.setRestSoonMin(restWarnMin);
    saveSettings();
    ajustesCambiaron = true;
  },
  cadaSalida(valor) {
    navEveryExit = !!valor;
    saveSettings();
    ajustesCambiaron = true;
  },
  dlcAutomatico(auto) {
    // Pasar a manual arranca de lo detectado: se corrige uno, no se destildan todos.
    if (!auto && dlcAuto) dlcOff = normalizeDlcOff({ ats: dlcOffFor('ats'), ets2: dlcOffFor('ets2') });
    dlcAuto = !!auto;
    saveSettings();
    routePrefsChanged();
    invalidateRoute();
    ajustesCambiaron = true;
  },
  dlcActivo(juego, id, activo) {
    const off = new Set(dlcOff[juego]);
    if (activo) off.delete(id);
    else off.add(id);
    dlcOff = normalizeDlcOff({ ...dlcOff, [juego]: [...off] });
    saveSettings();
    routePrefsChanged();
    invalidateRoute();
    ajustesCambiaron = true;
  },

  demo() { startDemo(); },
  urlsDeMapa: (id, version) => JSON.stringify(urlsDeMapa(id, version)),

  /** La sesion se olvido: el convoy era de ella, y la demo no sigue andando sola. */
  olvidar() {
    if (conn.demo) {
      clearTimeout(demoTimer);
      conn.demo = false;
    }
    convoyReset();
    convoyRenderAll();
  },

  // Los escuchadores de la ventana del convoy.
  convoyEstado: () => JSON.stringify(convoyEstado()),
  rutaConvoyGeo: () => JSON.stringify({ geo: lineaParaMapa(rutaConvoy.geo), color: rutaConvoy.color, opacidad: rutaConvoy.opacidad }),
  convoyEntrar(tipo, codigo, apodo, avisarDiscord) {
    convoyNick = String(apodo || '').trim().slice(0, 16);
    convoySaveSettings();
    if (convoyNick.length < 2) {
      showToast(t('convoyErrNick'));
      return;
    }
    const code = tipo === 'join' ? String(codigo || '').trim().toUpperCase() : null;
    if (tipo === 'join' && code.length !== 6) {
      showToast(t('convoyErrNotFound'));
      return;
    }
    convoy.pending = { kind: tipo, code, nickname: convoyNick, postSummary: !!avisarDiscord };
    convoy.active = true;
    convoyOnSocketOpen();
  },
  /** Abrir el convoy aca: este es el dispositivo que se esta usando. */
  convoyTomar() {
    convoyTakeOver();
    convoyCambio = true;
  },
  convoyIngresos(valor) {
    convoyShareIncome = !!valor;
    convoySaveSettings();
    if (convoyInRoom()) {
      convoyTakeOver();
      convoySend({ type: 'convoy_variant', mapVariant: convoyMyVariant(), shareIncome: convoyShareIncome });
    }
    convoyCambio = true;
  },
  convoySilencio(valor) {
    convoyMuted = !!valor;
    convoySaveSettings();
    convoyCambio = true;
  },
  convoyMarcas(valor) {
    convoyShowMarkers = !!valor;
    convoySaveSettings();
    convoyCambio = true;
  },
  convoySalir() { convoyLeaveRoom(); },
  convoyTerminar() {
    convoySend({ type: 'convoy_close' });
    convoyReset();
    convoyRenderAll();
  },
  convoyEchar(id) { convoySend({ type: 'convoy_kick', id }); },
  convoyMandar(clave) { convoySend({ type: 'convoy_msg', key: clave }); },
  convoySeguir(valor) { convoySetFollow(!!valor); },
  convoyVerRuta(valor) {
    convoy.showLeaderRoute = !!valor;
    convoyRenderLeaderRoute();
    convoyRenderCards();
  },

  viajes: () => JSON.stringify(historialViajes()),
  borrarViajes() {
    try { localStorage.removeItem(TRIPS_KEY); } catch (e) {}
  },

  abrirReporte: () => JSON.stringify(abrirReporte()),
  mandarReporte(tipo, descripcion) { mandarReporte(tipo, descripcion); },

  /** Textos de la web en su idioma: la app trae dos y la web ocho. */
  textos(claves) {
    const fuera = {};
    for (const k of JSON.parse(claves)) fuera[k] = t(k);
    return JSON.stringify(fuera);
  },

  /** Una de las tres lineas de la ruta, como texto: pesa, y va directo al mapa. */
  rutaGeo: (cual) => lineaParaMapa(fuentesRuta[cual]),

  /** Una capa de datos para el mapa, como texto: las de la web que no son la ruta. */
  capaGeo: (cual) => (fuentesCapas[cual] ? JSON.stringify(fuentesCapas[cual]) : ''),
  capasInfo: () => JSON.stringify({ escudos: [...escudos.values()], filtroPoi, estacionamiento: estacionamientoVisible }),

  /** Los dibujos de las flechas de carril: una sola fuente, la de la web. */
  trazosCarriles: () => JSON.stringify(LANE_PATHS),

  pulso() { correrTimers(); },
  volcar,
  navegacion: () => JSON.stringify(navegacion()),
};

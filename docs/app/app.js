// Logica de la app (extraida de index.html). Las funciones puras testeables viven en pure.js.
const statusEl = document.getElementById('status');
let ws = null;

const TRANSLATIONS = {
  en: {
    pairingCode: 'Pairing code',
    connect: 'Connect',
    toggleUnits: 'Toggle units',
    toggleLanguage: 'Toggle language',
    settings: 'Settings',
    settingsTitle: 'Settings',
    settingsMiniHudTitle: 'Show in mini-HUD (when info panel is hidden):',
    settingsLiveTitle: 'Other players nearby:',
    settingsLiveShare: 'Share my position and see others (same game/map only)',
    settingsLiveHideOthers: "Hide other players' markers on the map",
    settingsCommandsTitle: 'Truck command buttons:',
    settingsRouteTitle: 'Route preference:',
    settingsRouteFastest: 'Fastest — prefers highways, like the in-game GPS',
    settingsRouteShortest: 'Shortest distance',
    settingsRouteColorTitle: 'Route line color:',
    settingsGpsDirections: 'GPS directions',
    modsTitle: 'Map mods',
    joinDiscord: 'Discord',
    settingsNoMod: 'None',
    settingsCoastToCoast: 'I have Coast to Coast installed',
    settingsProModsCanada: 'I have ProMods Canada installed',
    settingsProMods: 'I have ProMods (Europe + all addons) installed',
    colorRed: 'Red',
    colorBlue: 'Blue',
    colorGreen: 'Green',
    close: 'Close',
    notConnected: 'Not connected',
    mobileHint: 'On mobile: open trucksim-dash.com/app and enter your pairing code.',
    pairingDurationHint: 'The code expires after 10 minutes if unused. Once connected, the session stays active until you quit the client (tray icon → Quit or Disconnect).',
    activePlayersHint: '🟢 {count} drivers active right now',
    replayTour: 'Show quick tour',
    tourSkip: 'Skip',
    tourNext: 'Next',
    tourDone: 'Got it',
    tourCode: "Paste the pairing code shown by the local client here, then hit Connect.",
    tourTopButtons: "Toggle units (km/mi), language, open Settings (mini-HUD, live players, remap keys) and Mods.",
    tourRecenter: "Recenter the map on your truck.",
    tourFullscreen: "Fullscreen mode - hides this header for a clean view.",
    tourNavMode: "GPS navigation mode: the map rotates with your heading and zooms in on turns.",
    tourWaypoint: "Add a waypoint - click a point on the map, useful for detours.",
    tourCommands: "Show/hide the truck command buttons (hazards, engine, lights, etc.).",
    updateAvailableText: '🆕 A new client version is available (v{v}). Your connected client is outdated.',
    updateBannerLink: 'Download',
    mapNotLoaded: 'Map not loaded',
    recenter: 'Recenter on truck',
    togglePanel: 'Show/hide info panel',
    toggleFullscreen: 'Fullscreen',
    toggleNavMode: 'Navigation mode (heading-up, dynamic zoom)',
    toggleWaypointMode: 'Add waypoint (click a point on the map)',
    toggleCommands: 'Truck commands',
    cmdHazards: 'Hazards',
    cmdBeacon: 'Beacon',
    cmdHandbrake: 'Handbrake',
    cmdEngine: 'Engine',
    cmdTrailer: 'Trailer',
    cmdCamera: 'Camera',
    cmdCruise: 'Cruise',
    cmdLights: 'Lights',
    cmdInfotainment: 'Infotainment',
    cmdLiftAxle: 'Lift axle',
    cmdWipers: 'Wipers',
    cmdRemap: 'Remap',
    commandResultNoKey: "This command has no key assigned - set one in Remap",
    commandResultNoWindow: "Couldn't find the game window (is it running?)",
    commandResultError: 'Command failed: {reason}',
    commandNotConnectedToast: 'Not connected to the local client',
    keybindsModalTitle: 'Remap keys',
    keybindsModalExplain: "Keys must match your in-game control settings — if you remapped a control in the game, update it here too. Leave a field empty to leave that command unassigned.",
    keybindsUnassigned: 'unassigned',
    keybindsSavedToast: 'Keybinds saved',
    keybindsLoadFailedToast: "Couldn't load current keybinds",
    save: 'Save',
    waypointModalTitle: 'Waypoint added',
    waypointModalQuestion: "Did you also set this point as a waypoint in the game's own GPS/map?",
    waypointModalYes: 'Yes, I set it in-game too',
    waypointModalNo: 'No, just here',
    waypointModalExplain: "If you set it in-game too, the game's own ETA/distance already account for the detour, so we don't touch those numbers — we just draw the route through this point. If not, the game has no idea about this point, so we calculate our own distance/time through it separately (shown as \"with waypoint\" under the ETA rows) — the game's own numbers will keep ignoring the detour.",
    withWaypoint: '(with waypoint)',
    jobDeadline: 'Job deadline',
    waypoint: 'Waypoint',
    clear: 'Clear',
    waypointInGame: 'Set (also in-game)',
    waypointAppOnly: 'Set (app only)',
    navTurnLeft: 'Turn left',
    navTurnRight: 'Turn right',
    navOnto: 'onto',
    navToward: 'toward',
    navIn: 'in',
    navStraight: 'Continue straight',
    navNoRoute: 'No destination set',
    truck: 'Truck',
    cargo: 'Cargo',
    distanceLeft: 'Distance left',
    etaGame: 'In-game ETA',
    etaReal: 'Real ETA',
    calculating: 'Calculating…',
    jobPay: 'Job pay',
    fuel: 'Fuel',
    range: 'Range',
    engine: 'Engine',
    transmission: 'Transmission',
    cabin: 'Cabin',
    chassis: 'Chassis',
    wheels: 'Wheels',
    avgConsumption: 'Avg. consumption',
    cruiseControl: 'Cruise control',
    alerts: 'Alerts',
    tolls: 'Tolls paid',
    fines: 'Fines',
    ferryTrain: 'Ferry/train trips',
    lowAirPressure: 'Low air pressure',
    highWaterTemp: 'High water temperature',
    lowBattery: 'Low battery voltage',
    highOilTemp: 'High oil temperature',
    noCargo: '(no cargo)',
    enterCode: 'Enter the pairing code shown by the local client.',
    connectedWaiting: 'Connected, waiting for telemetry...',
    connectedPaused: 'Connected (game paused)',
    connectedLive: 'Connected, live',
    disconnected: 'Disconnected',
    reconnectingBanner: '⚠ Connection lost — reconnecting... (data below may be stale)',
    connectionError: 'Connection error',
    jobDeliveredToast: '✅ Job delivered! +${amount}',
    jobCancelledToast: '❌ Job cancelled',
    mapNotFound: (label, path) => `Exported map not found for ${label} (${path})`,
    changeCode: 'Use another code',
    chipConnecting: 'Connecting…',
    chipNoClient: 'Client not running',
    chipWaitingGame: 'Waiting for the game',
    chipPluginMissing: 'Plugin not installed',
    chipWaitingTruck: 'In the menu',
    chipLive: 'Live',
    chipPaused: 'Paused',
    chipReconnecting: 'Reconnecting…',
    chipInvalidCode: 'Invalid or expired code',
    detailNoClient: 'The Truck Dash client isn\'t connected with this code. Start TruckDash.exe on your PC (or check its tray icon).',
    detailWaitingGame: 'Client connected. Open Euro Truck Simulator 2 or American Truck Simulator.',
    detailPluginMissing: 'The game is running but sends no telemetry: the SCS plugin isn\'t installed. Open the client\'s "Setup & status" window (tray icon) and click "Install plugin", then restart the game.',
    detailWaitingTruck: 'Game open. Data will appear as soon as you\'re in the truck (not in a menu).',
    detailInvalidCode: 'Codes expire after 10 minutes if unused. Get a fresh one from the client\'s tray icon → "Show pairing code".',
    emptyNoClientTitle: 'Client not running',
    emptyNoClientBody: 'Start TruckDash.exe on the PC that runs the game. Don\'t have it yet?',
    emptyDownload: 'Download the client',
    emptyWaitingGameTitle: 'Waiting for the game',
    emptyWaitingGameBody: 'The client is connected. Launch ETS2 or ATS and this map will come alive.',
    emptyPluginTitle: 'Telemetry plugin not installed',
    emptyPluginBody: 'The game is running but Truck Dash can\'t see it. In the client\'s tray icon open "Setup & status" → "Install plugin", then restart the game.',
    emptyWaitingTruckTitle: 'Almost there',
    emptyWaitingTruckBody: 'Get in the truck (leave the menus) and the dashboard will start.',
    emptyReconnectTitle: 'Reconnecting…',
    emptyReconnectBody: 'Lost the connection to the server. Retrying automatically.',
    cardTrip: 'Trip',
    cardTruck: 'Truck',
    cardSession: 'Session',
    tabData: 'Data',
    tabGauges: 'Gauges',
    settingsHistoryTitle: 'Trip history (saved on this device only):',
    tripHistoryClear: 'Clear history',
    tripHistoryEmpty: 'No deliveries recorded yet. Finished jobs will show up here.',
    settingsAboutTitle: 'About:',
    privacyLink: 'Privacy',
    changelogLink: 'Changelog',
    tourDownload: 'No client yet? Download it from trucksim-dash.com, run it, and it will show you a pairing code.',
    waypointInGameShort: '(also in-game)',
    waypointAppOnlyShort: '(app only)',
    waypointClearAll: 'Clear all',
    waypointsLabel: 'Waypoints',
    waypointReachedToast: '📍 Reached: {name}',
    waypointLimitToast: 'Up to {n} waypoints',
    poiTitle: 'Find nearby',
    poiSearchPlaceholder: 'Company or city…',
    poiNearestFuel: '⛽ Nearest fuel station',
    poiCatFuel: 'Fuel station',
    poiCatRest: 'Rest area',
    poiCatService: 'Service',
    poiCatGarage: 'Garage',
    poiCatDealer: 'Truck dealer',
    poiCatWeigh: 'Weigh station',
    poiLoading: 'Loading places…',
    poiLoadFailed: "Couldn't load the places list (no connection to trucksim-dash.com?).",
    poiRetry: 'Retry',
    poiNoPosition: 'Waiting for your position (start driving first).',
    poiNoResults: 'Nothing found.',
    poiAddedToast: 'Routing via {name}',
    poiHint: 'Tap a place to route through it as a waypoint.',
    tourPoi: 'Find fuel, rest areas, service shops or a company near you and route there.',
    chipDemo: 'Demo',
    detailDemo: 'Simulated trip on the real ATS map. Everything you see works the same with your own game.',
    exitDemo: 'Exit demo',
    demoNoCommands: 'Truck buttons need the real game - this is the demo',
    emptyDemoLink: 'or try the demo',
    reportProblem: 'Report a problem',
    nextRest: 'Next rest stop',
    realShort: 'real',
    mapLoadingCities: 'Loading map: cities…',
    mapLoadingGraph: 'Loading map: road network…',
    mapLoadingNames: 'Loading map: road names…',
    mapLoadingTiles: 'Loading map: tiles…',
  },
  es: {
    pairingCode: 'Código de pairing',
    connect: 'Conectar',
    toggleUnits: 'Cambiar unidades',
    toggleLanguage: 'Cambiar idioma',
    settings: 'Configuración',
    settingsTitle: 'Configuración',
    settingsMiniHudTitle: 'Mostrar en el mini-HUD (con el panel de info oculto):',
    settingsLiveTitle: 'Otros jugadores cerca:',
    settingsLiveShare: 'Compartir mi posición y ver a otros (solo mismo juego/mapa)',
    settingsLiveHideOthers: 'Ocultar los marcadores de otros jugadores en el mapa',
    settingsCommandsTitle: 'Botonera del camión:',
    settingsRouteTitle: 'Preferencia de ruta:',
    settingsRouteFastest: 'Más rápida — prefiere autopistas, como el GPS del juego',
    settingsRouteShortest: 'Distancia más corta',
    settingsRouteColorTitle: 'Color de la línea de ruta:',
    settingsGpsDirections: 'Indicaciones de GPS',
    modsTitle: 'Mods de mapa',
    joinDiscord: 'Discord',
    settingsNoMod: 'Ninguno',
    settingsCoastToCoast: 'Tengo instalado Coast to Coast',
    settingsProModsCanada: 'Tengo instalado ProMods Canada',
    settingsProMods: 'Tengo instalado ProMods (Europe + todos los addons)',
    colorRed: 'Rojo',
    colorBlue: 'Azul',
    colorGreen: 'Verde',
    close: 'Cerrar',
    notConnected: 'Sin conectar',
    mobileHint: 'Desde el celular: abrí trucksim-dash.com/app e ingresá tu código de pairing.',
    pairingDurationHint: 'El código expira a los 10 minutos si no se usa. Una vez conectado, la sesión sigue activa hasta que cierres el cliente (ícono de bandeja → Quit o Disconnect).',
    activePlayersHint: '🟢 {count} conductores activos ahora',
    replayTour: 'Ver el tour rápido',
    tourSkip: 'Saltar',
    tourNext: 'Siguiente',
    tourDone: 'Listo',
    tourCode: 'Pegá acá el código de pairing que te muestra el cliente local, y apretá Connect.',
    tourTopButtons: 'Cambiar unidades (km/mi), idioma, abrir Settings (mini-HUD, jugadores en vivo, remapeo de teclas) y Mods.',
    tourRecenter: 'Centrar el mapa en tu camión.',
    tourFullscreen: 'Modo pantalla completa - oculta esta franja de arriba para una vista más limpia.',
    tourNavMode: 'Modo navegación GPS: el mapa rota con tu rumbo y hace zoom en los giros.',
    tourWaypoint: 'Agregar un waypoint - clic en un punto del mapa, útil para desvíos.',
    tourCommands: 'Mostrar/ocultar la botonera de comandos del camión (balizas, motor, luces, etc.).',
    updateAvailableText: '🆕 Hay una versión nueva del cliente (v{v}). Tu cliente conectado está desactualizado.',
    updateBannerLink: 'Descargar',
    mapNotLoaded: 'Mapa no cargado',
    recenter: 'Centrar en el camión',
    togglePanel: 'Mostrar/ocultar panel de info',
    toggleFullscreen: 'Pantalla completa',
    toggleNavMode: 'Modo navegación (rota con el rumbo, zoom dinámico)',
    toggleWaypointMode: 'Agregar waypoint (clic en un punto del mapa)',
    toggleCommands: 'Comandos del camión',
    cmdHazards: 'Balizas',
    cmdBeacon: 'Beacon',
    cmdHandbrake: 'Freno de mano',
    cmdEngine: 'Motor',
    cmdTrailer: 'Trailer',
    cmdCamera: 'Cámara',
    cmdCruise: 'Crucero',
    cmdLights: 'Luces',
    cmdInfotainment: 'Infotainment',
    cmdLiftAxle: 'Eje elevable',
    cmdWipers: 'Limpia­parabrisas', // guion suave: corta en dos lineas solo si no entra en el boton
    cmdRemap: 'Remapear',
    commandResultNoKey: 'Este comando no tiene tecla asignada - configurala en Remap',
    commandResultNoWindow: 'No se encontró la ventana del juego (¿está abierto?)',
    commandResultError: 'Falló el comando: {reason}',
    commandNotConnectedToast: 'No conectado al cliente local',
    keybindsModalTitle: 'Remapear teclas',
    keybindsModalExplain: 'Las teclas tienen que coincidir con tu configuración de controles del juego — si remapeaste algo en el juego, actualizalo acá también. Dejá un campo vacío para que ese comando quede sin asignar.',
    keybindsUnassigned: 'sin asignar',
    keybindsSavedToast: 'Teclas guardadas',
    keybindsLoadFailedToast: 'No se pudieron cargar las teclas actuales',
    save: 'Guardar',
    waypointModalTitle: 'Waypoint agregado',
    waypointModalQuestion: '¿También marcaste este punto como waypoint en el GPS/mapa del juego?',
    waypointModalYes: 'Sí, también lo marqué en el juego',
    waypointModalNo: 'No, solo acá',
    waypointModalExplain: 'Si también lo marcaste en el juego, el ETA/distancia del propio juego ya tienen en cuenta el desvío, así que no tocamos esos números — solo dibujamos la ruta pasando por este punto. Si no, el juego no tiene idea de este punto, así que calculamos nosotros mismos la distancia/tiempo pasando por él por separado (se muestra como "with waypoint" debajo de las filas de ETA) — los números del propio juego van a seguir ignorando el desvío.',
    withWaypoint: '(con waypoint)',
    jobDeadline: 'Deadline del trabajo',
    waypoint: 'Waypoint',
    clear: 'Quitar',
    waypointInGame: 'Marcado (también en el juego)',
    waypointAppOnly: 'Marcado (solo en la app)',
    navTurnLeft: 'Girá a la izquierda',
    navTurnRight: 'Girá a la derecha',
    navOnto: 'hacia',
    navToward: 'hacia',
    navIn: 'en',
    navStraight: 'Seguí derecho',
    navNoRoute: 'Sin destino asignado',
    truck: 'Camión',
    cargo: 'Cargamento',
    distanceLeft: 'Distancia restante',
    etaGame: 'ETA in-game',
    etaReal: 'ETA real',
    calculating: 'Calculando…',
    jobPay: 'Pago del trabajo',
    fuel: 'Combustible',
    range: 'Autonomía',
    engine: 'Motor',
    transmission: 'Transmisión',
    cabin: 'Cabina',
    chassis: 'Chasis',
    wheels: 'Ruedas',
    avgConsumption: 'Consumo promedio',
    cruiseControl: 'Control de crucero',
    alerts: 'Alertas',
    tolls: 'Peajes pagados',
    fines: 'Multas',
    ferryTrain: 'Viajes en tren/ferry',
    lowAirPressure: 'Presión de aire baja',
    highWaterTemp: 'Temperatura de agua alta',
    lowBattery: 'Voltaje de batería bajo',
    highOilTemp: 'Temperatura de aceite alta',
    noCargo: '(sin carga)',
    enterCode: 'Ingresá el código de pairing que te mostró el cliente local.',
    connectedWaiting: 'Conectado, esperando telemetría...',
    connectedPaused: 'Conectado (juego en pausa)',
    connectedLive: 'Conectado, en vivo',
    disconnected: 'Desconectado',
    reconnectingBanner: '⚠ Se cortó la conexión — reconectando... (los datos de abajo pueden estar viejos)',
    connectionError: 'Error de conexión',
    jobDeliveredToast: '✅ ¡Trabajo entregado! +${amount}',
    jobCancelledToast: '❌ Trabajo cancelado',
    mapNotFound: (label, path) => `No se encontró el mapa exportado para ${label} (${path})`,
    changeCode: 'Usar otro código',
    chipConnecting: 'Conectando…',
    chipNoClient: 'Cliente no conectado',
    chipWaitingGame: 'Esperando el juego',
    chipPluginMissing: 'Plugin sin instalar',
    chipWaitingTruck: 'En el menú',
    chipLive: 'En vivo',
    chipPaused: 'Pausado',
    chipReconnecting: 'Reconectando…',
    chipInvalidCode: 'Código inválido o vencido',
    detailNoClient: 'El cliente de Truck Dash no está conectado con este código. Abrí TruckDash.exe en tu PC (o revisá su ícono en la bandeja).',
    detailWaitingGame: 'Cliente conectado. Abrí Euro Truck Simulator 2 o American Truck Simulator.',
    detailPluginMissing: 'El juego está abierto pero no manda telemetría: el plugin de SCS no está instalado. Abrí la ventana "Setup & status" del cliente (ícono de la bandeja) y tocá "Install plugin", después reiniciá el juego.',
    detailWaitingTruck: 'Juego abierto. Los datos aparecen apenas estés arriba del camión (no en un menú).',
    detailInvalidCode: 'Los códigos vencen a los 10 minutos si no se usan. Pedí uno nuevo desde el ícono de la bandeja del cliente → "Show pairing code".',
    emptyNoClientTitle: 'Cliente no conectado',
    emptyNoClientBody: 'Abrí TruckDash.exe en la PC donde corre el juego. ¿Todavía no lo tenés?',
    emptyDownload: 'Descargar el cliente',
    emptyWaitingGameTitle: 'Esperando el juego',
    emptyWaitingGameBody: 'El cliente está conectado. Abrí ETS2 o ATS y este mapa cobra vida.',
    emptyPluginTitle: 'Plugin de telemetría sin instalar',
    emptyPluginBody: 'El juego está abierto pero Truck Dash no lo ve. En el ícono de la bandeja del cliente abrí "Setup & status" → "Install plugin", y reiniciá el juego.',
    emptyWaitingTruckTitle: 'Ya casi',
    emptyWaitingTruckBody: 'Subite al camión (salí de los menús) y el tablero arranca.',
    emptyReconnectTitle: 'Reconectando…',
    emptyReconnectBody: 'Se perdió la conexión con el servidor. Reintentando solo.',
    cardTrip: 'Viaje',
    cardTruck: 'Camión',
    cardSession: 'Sesión',
    tabData: 'Datos',
    tabGauges: 'Relojes',
    settingsHistoryTitle: 'Historial de viajes (guardado solo en este dispositivo):',
    tripHistoryClear: 'Borrar historial',
    tripHistoryEmpty: 'Todavía no hay entregas registradas. Los trabajos terminados aparecen acá.',
    settingsAboutTitle: 'Acerca de:',
    privacyLink: 'Privacidad',
    changelogLink: 'Novedades',
    tourDownload: '¿Todavía no tenés el cliente? Bajalo de trucksim-dash.com, abrilo, y te muestra un código de pairing.',
    waypointInGameShort: '(también en el juego)',
    waypointAppOnlyShort: '(solo app)',
    waypointClearAll: 'Quitar todos',
    waypointsLabel: 'Waypoints',
    waypointReachedToast: '📍 Llegaste: {name}',
    waypointLimitToast: 'Hasta {n} waypoints',
    poiTitle: 'Buscar cerca',
    poiSearchPlaceholder: 'Empresa o ciudad…',
    poiNearestFuel: '⛽ Estación de servicio más cercana',
    poiCatFuel: 'Estación de servicio',
    poiCatRest: 'Área de descanso',
    poiCatService: 'Taller',
    poiCatGarage: 'Garage',
    poiCatDealer: 'Concesionaria',
    poiCatWeigh: 'Báscula',
    poiLoading: 'Cargando lugares…',
    poiLoadFailed: 'No se pudo cargar la lista de lugares (¿sin conexión a trucksim-dash.com?).',
    poiRetry: 'Reintentar',
    poiNoPosition: 'Esperando tu posición (arrancá a manejar primero).',
    poiNoResults: 'No se encontró nada.',
    poiAddedToast: 'Ruteando por {name}',
    poiHint: 'Tocá un lugar para pasar por ahí como waypoint.',
    tourPoi: 'Buscá combustible, áreas de descanso, talleres o una empresa cerca tuyo y ruteá hasta ahí.',
    chipDemo: 'Demo',
    detailDemo: 'Viaje simulado sobre el mapa real de ATS. Todo lo que ves funciona igual con tu propio juego.',
    exitDemo: 'Salir de la demo',
    demoNoCommands: 'La botonera necesita el juego real - esto es la demo',
    emptyDemoLink: 'o probá la demo',
    reportProblem: 'Reportar un problema',
    nextRest: 'Próximo descanso',
    realShort: 'real',
    mapLoadingCities: 'Cargando mapa: ciudades…',
    mapLoadingGraph: 'Cargando mapa: red de rutas…',
    mapLoadingNames: 'Cargando mapa: nombres de rutas…',
    mapLoadingTiles: 'Cargando mapa: tiles…',
  },
};
// Idiomas extra (de/fr/pt/pl/tr/ru) viven en i18n.js - cualquier clave que
// falte en un idioma cae al ingles (ver t()).
if (typeof TRANSLATIONS_EXTRA !== 'undefined') Object.assign(TRANSLATIONS, TRANSLATIONS_EXTRA);

const LANG_KEY = 'truckdash_lang';
function detectLanguage() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && TRANSLATIONS[saved]) return saved;
  } catch (e) {}
  const nav = (navigator.language || 'en').toLowerCase().slice(0, 2);
  return TRANSLATIONS[nav] ? nav : 'en';
}
let currentLang = detectLanguage();
function t(key, ...args) {
  const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
  const entry = dict[key] !== undefined ? dict[key] : TRANSLATIONS.en[key];
  return typeof entry === 'function' ? entry(...args) : entry;
}

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
}

function setLanguage(lang) {
  if (!TRANSLATIONS[lang]) return;
  currentLang = lang;
  try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
  document.documentElement.lang = lang;
  for (const id of ['langSelect', 'setLangSelect']) document.getElementById(id).value = lang;
  applyTranslations();
  renderConnectionUi();
  renderTripHistory();
  renderWaypointList();
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
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ miniHud: miniHudSettings, routeColor, atsMod, hasProMods, liveShareEnabled, hideOtherPlayers, useImperial, routeProfile }));
  } catch (e) {}
}
const _savedSettings = loadSettings();
const miniHudSettings = Object.assign(
  { fuelPct: false, fuelRange: false, eta: false, distance: false, cruise: true, gps: false },
  _savedSettings.miniHud
);
let routeColor = _savedSettings.routeColor || '#a30000';
let routeProfile = _savedSettings.routeProfile || 'fastest'; // 'fastest' (como el GPS del juego) | 'shortest'
// Opt-in: el SDK de telemetria no informa que mods de mapa tiene instalados
// el usuario, asi que no se puede auto-detectar - el usuario lo activa a
// mano si lo tiene instalado (ver GAME_MAPS.ats_c2c/ats_promods/ets2_promods).
// Coast to Coast y ProMods Canada son ambos mapas de ATS, mutuamente
// excluyentes (no se pueden combinar), por eso es un selector unico
// ('none'|'c2c'|'promods_canada') en vez de dos checkboxes independientes.
let atsMod = _savedSettings.atsMod || 'none';
let hasProMods = _savedSettings.hasProMods || false;
// Opt-in de "jugadores en vivo": reciprocidad simple (no compartis -> no ves
// a nadie), decidido asi porque no hay cuentas ni consentimiento granular.
// hideOtherPlayers es aparte y solo local (no le dice nada al backend) -
// podes seguir compartiendo tu posicion pero no dibujar la de los demas.
let liveShareEnabled = _savedSettings.liveShareEnabled || false;
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
  document.getElementById('setRouteFastest').checked = routeProfile !== 'shortest';
  document.getElementById('setRouteShortest').checked = routeProfile === 'shortest';
  document.getElementById('setLiveShare').checked = liveShareEnabled;
  document.getElementById('setLiveHideOthers').checked = hideOtherPlayers;
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
  document.getElementById('setAtsModNone').checked = atsMod === 'none';
  document.getElementById('setCoastToCoast').checked = atsMod === 'c2c';
  document.getElementById('setProModsCanada').checked = atsMod === 'promods_canada';
  document.getElementById('setEts2ModNone').checked = !hasProMods;
  document.getElementById('setProMods').checked = hasProMods;
}

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
document.querySelectorAll('input[name="ets2Mod"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    hasProMods = e.target.value === 'promods';
    saveSettings();
    currentGame = null;
  });
});

// Le manda al backend si esta sesion comparte su posicion, y con que
// variante de mapa (ats, ats_promods, etc.) - el backend usa esto para
// agrupar "jugadores del mismo juego/mod" y para la reciprocidad (si
// enabled=false, esta sesion tampoco va a recibir la posicion de nadie).
function sendLiveShareState() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const mapVariant = liveShareEnabled ? resolveEffectiveGame(lastData?.game) : null;
  lastSentMapVariant = mapVariant;
  ws.send(JSON.stringify({ type: 'set_live_share', enabled: liveShareEnabled, mapVariant }));
}

document.getElementById('setLiveShare').addEventListener('change', (e) => {
  liveShareEnabled = e.target.checked;
  saveSettings();
  if (!liveShareEnabled) updateLivePlayers([]); // saca los marcadores ajenos ya dibujados
  sendLiveShareState();
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

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
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
const MAP_DATA_VERSION = { ats: '20260920', ats_c2c: '20260920', ats_promods: '20260920', ets2: '20260920', ets2_promods: '20260920' };
const GAME_MAPS = {
  ats: {
    assetsDir: `${REMOTE_MAP_BASE}/ats`,
    pmtilesUrl: `${REMOTE_MAP_BASE}/vector/ats.pmtiles`,
    sourceLayer: 'ats',
    label: 'American Truck Simulator',
    toLngLat: atsToLngLat,
    fromLngLat: atsFromLngLat,
    origin: [-96, 39],
  },
  // Mismo juego/proyeccion que "ats", pero generado incluyendo el mod de
  // mapa Coast to Coast (rutas/ciudades nuevas). Usuarios sin el mod
  // instalado no deben usar este mapa: verian rutas que en su copia del
  // juego no existen y el A* podria calcular caminos que no pueden tomar -
  // por eso es opt-in via el selector de mods en Mods (ver atsMod) en vez
  // de auto-detectarse (el SDK de telemetria no informa mods instalados).
  ats_c2c: {
    assetsDir: `${REMOTE_MAP_BASE}/ats_c2c`,
    pmtilesUrl: `${REMOTE_MAP_BASE}/vector/ats_c2c.pmtiles`,
    sourceLayer: 'ats',
    label: 'American Truck Simulator + Coast to Coast',
    toLngLat: atsToLngLat,
    fromLngLat: atsFromLngLat,
    origin: [-96, 39],
  },
  ats_promods: {
    assetsDir: `${REMOTE_MAP_BASE}/ats_promods`,
    pmtilesUrl: `${REMOTE_MAP_BASE}/vector/ats_promods.pmtiles`,
    sourceLayer: 'ats',
    label: 'American Truck Simulator + ProMods Canada',
    toLngLat: atsToLngLat,
    fromLngLat: atsFromLngLat,
    origin: [-96, 39],
  },
  ets2: {
    assetsDir: `${REMOTE_MAP_BASE}/ets2`,
    pmtilesUrl: `${REMOTE_MAP_BASE}/vector/ets2.pmtiles`,
    sourceLayer: 'ets2',
    label: 'Euro Truck Simulator 2',
    toLngLat: ets2ToLngLat,
    fromLngLat: ets2FromLngLat,
    origin: [15, 50],
  },
  // Mismo criterio que ats_c2c: opt-in via toggle en Mods, no auto-detectable.
  ets2_promods: {
    assetsDir: `${REMOTE_MAP_BASE}/ets2_promods`,
    pmtilesUrl: `${REMOTE_MAP_BASE}/vector/ets2_promods.pmtiles`,
    sourceLayer: 'ets2',
    label: 'Euro Truck Simulator 2 + ProMods (Europe + addons)',
    toLngLat: ets2ToLngLat,
    fromLngLat: ets2FromLngLat,
    origin: [15, 50],
  },
};

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
function ets2ToLngLat(x, z) {
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
  const isUk = sx <= -8 && sz <= -2 && !(sx === -8 && sz === -2);
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
function ets2FromLngLat(lng, lat) {
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
  const isUk = sx <= -8 && sz <= -2 && !(sx === -8 && sz === -2);
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
let citiesByName = {}; // Name -> {X, Y}
const trailWorld = []; // [[lng,lat], ...]
const MAX_TRAIL_POINTS = 1000;

function emptyLineString() {
  return { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } };
}

// Capas del estilo que dependen del juego actual (fuente vectorial 'vec') -
// se remueven y se vuelven a crear al cambiar de juego, ya que MapLibre no
// permite cambiarle la url a un source ya existente.
const VEC_LAYER_IDS = ['mapArea', 'prefab', 'road-local', 'road-divided', 'road-freeway', 'poi', 'exit-label', 'country-label', 'city-label'];

// Colores segun el enum MapAreaColor de truckermudgeon/maps (Road/Light/Dark/
// Green + 5 colores "Nav*" que casi no aparecen en la practica).
function buildVecLayers(sourceLayer) {
  const L = sourceLayer;
  return [
    { id: 'mapArea', type: 'fill', source: 'vec', 'source-layer': L, filter: ['==', ['get', 'type'], 'mapArea'],
      paint: { 'fill-color': ['match', ['get', 'color'], 0, '#454b54', 1, '#575e68', 2, '#1c1f24', 3, '#3d5238', '#454b54'], 'fill-opacity': 0.95 } },
    { id: 'prefab', type: 'fill', source: 'vec', 'source-layer': L, filter: ['==', ['get', 'type'], 'prefab'],
      paint: { 'fill-color': '#4a5058', 'fill-opacity': 0.95 } },
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
      paint: { 'line-color': '#ff8a3d', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1, 12, 3.5, 17, 10] } },
    { id: 'poi', type: 'symbol', source: 'vec', 'source-layer': L, minzoom: 7,
      filter: ['all', ['==', ['get', 'type'], 'poi'], ['in', ['get', 'sprite'], ['literal', POI_ICONS]]],
      layout: { 'icon-image': ['get', 'sprite'], 'icon-size': 0.8, 'icon-allow-overlap': true, 'icon-ignore-placement': true } },
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

function ensureMapInitialized() {
  if (map) return;
  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);
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
  });
  map.on('dragstart', () => { autoFollow = false; });
  // Si el usuario zoomea a mano en modo navegacion, dejamos de forzar el
  // zoom dinamico (si no, el proximo tick lo pisa y parece que "no se puede
  // tocar") - se reactiva con el boton de recentrar. originalEvent solo esta
  // presente cuando el zoom lo dispara una interaccion real (rueda/pellizco/
  // doble click), no nuestros propios easeTo/jumpTo programaticos.
  map.on('zoomstart', (e) => { if (e.originalEvent) navAutoZoomPaused = true; });
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
    map.addLayer({ id: 'trail-line', type: 'line', source: 'trail', paint: { 'line-color': '#3b9eff', 'line-width': 3, 'line-opacity': 0.7 } });
    map.addSource('route', { type: 'geojson', data: emptyLineString() });
    map.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': routeColor, 'line-width': 3, 'line-opacity': 0.9 } });
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
const POI_ICONS = ['gas_ico', 'service_ico', 'weigh_station_ico', 'parking_ico', 'toll_ico', 'garage_large_ico', 'dealer_ico', 'recruitment_ico', 'viewpoint'];
const POI_ICON_BASE = `${REMOTE_MAP_BASE}/vector/icons`;

async function loadPoiIcons() {
  for (const name of POI_ICONS) {
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
    for (const c of list) citiesByName[c.Name] = c;
  } catch (err) {
    citiesByName = {};
  }
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
let routeGraph = null; // { nodes, adjacency: Map<idx, [[idx, weight], ...]> }
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
  etaSamples = [];
  etaDisplayValue = null;
  etaLastRecalcTime = null;
}

function addWaypoint(pos, lngLat, inGame, label) {
  if (waypoints.length >= MAX_WAYPOINTS) { showToast(t('waypointLimitToast').replace('{n}', MAX_WAYPOINTS), 'danger'); return; }
  const wp = { pos, lngLat, inGame, label: label || null, marker: makeWaypointMarker(lngLat, waypoints.length) };
  waypoints.push(wp);
  renderWaypointList();
  invalidateRoute();
}

function removeWaypoint(index) {
  const [wp] = waypoints.splice(index, 1);
  if (wp && wp.marker) wp.marker.remove();
  renumberWaypointMarkers();
  if (!waypoints.length) waypointRouteDistanceKm = null;
  renderWaypointList();
  invalidateRoute();
}

function clearWaypoint() {
  for (const wp of waypoints) if (wp.marker) wp.marker.remove();
  waypoints = [];
  waypointRouteDistanceKm = null;
  renderWaypointList();
  invalidateRoute();
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

const POI_CODES = { g: 'poiCatFuel', p: 'poiCatRest', s: 'poiCatService', r: 'poiCatGarage', d: 'poiCatDealer', w: 'poiCatWeigh' };
const POI_ICONS_TEXT = { g: '⛽', p: '🅿️', s: '🔧', r: '🏠', d: '🚛', w: '⚖️' };
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
      const res = await fetch(`${POI_BASE}/pois-${variant}.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      pois = await res.json();
    } catch (err) {
      pois = null;
      poisError = String(err);
      console.error('No se pudieron cargar los POIs', variant, err);
    } finally {
      poisLoading = null;
    }
    // Si el modal esta abierto esperando, refrescarlo sin importar quien
    // disparo la carga (el mapa al iniciar o el propio modal).
    if (document.getElementById('poiModal').style.display === 'flex') renderPoiResults();
    return pois;
  })();
  return poisLoading;
}

function poiVariantNow() {
  return currentGame || (lastData ? resolveEffectiveGame(lastData.game) : null);
}

function findCompanyPoi(token, cityToken) {
  if (!pois || !token) return null;
  const hit = pois.companies.find(c => c[2] === token && (!cityToken || c[4] === cityToken))
    || pois.companies.find(c => c[2] === token);
  return hit ? { x: hit[0], z: hit[1], label: hit[3], city: hit[4] } : null;
}

function nearestFacilities(code, x, z, limit) {
  if (!pois) return [];
  const out = [];
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
  for (const [name, c] of Object.entries(citiesByName)) {
    const d = Math.hypot(c.X - x, c.Y - z);
    if (d < bestDist) { bestDist = d; best = name; }
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
  let results;
  if (query.trim()) {
    results = searchCompanies(query, pos.x, pos.z, 20).map(r => ({ ...r, name: r.label, sub: cityLabel(r.city) }));
  } else {
    results = nearestFacilities(poiCategory, pos.x, pos.z, 15).map(r => ({ ...r, name: t(POI_CODES[r.code]), sub: nearestCityName(r.x, r.z) || '' }));
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

function openPoiModal() {
  document.getElementById('poiModal').style.display = 'flex';
  document.getElementById('poiSearchInput').value = '';
  const variant = poiVariantNow();
  if (!pois && variant && !poisLoading) loadPois(variant);
  renderPoiResults();
}
function closePoiModal() { document.getElementById('poiModal').style.display = 'none'; }

document.getElementById('poiBtn').addEventListener('click', openPoiModal);
document.getElementById('poiCloseBtn').addEventListener('click', closePoiModal);
document.getElementById('poiModal').addEventListener('click', (e) => { if (e.target.id === 'poiModal') closePoiModal(); });
document.getElementById('poiSearchInput').addEventListener('input', renderPoiResults);
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

async function loadRouteGraph(mapInfo) {
  routeGraph = null;
  try {
    const res = await fetch(`${mapInfo.assetsDir}/route-graph-${currentGame}.json?v=${MAP_DATA_VERSION[currentGame] || ''}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const adjacency = new Map();
    // Aristas [a, b, peso, esFerry?] - las de ferry/tren (build_route_graph.py
    // las agrega desde *-ferries.json) se guardan aparte para dibujar ese
    // tramo punteado y no contarlo como "giro".
    // flags (4to elemento): bit 1 = ferry/tren, bit 2 = un solo sentido
    // (solo a -> b). Sin flags = doble mano. Las de un sentido son las
    // calzadas de autopista dividida y rampas: sin esto el A* mandaba por la
    // calzada contraria.
    const ferryEdges = new Set();
    // Grado "topologico" (con cuantos nodos distintos se conecta cada nodo,
    // sin importar el sentido): >= 3 es una interseccion real, que es donde
    // tiene sentido anunciar un giro.
    const neighborSets = new Map();
    const link = (from, to, w, wt) => {
      if (!adjacency.has(from)) adjacency.set(from, []);
      adjacency.get(from).push([to, w, wt]);
      if (!neighborSets.has(from)) neighborSets.set(from, new Set());
      neighborSets.get(from).add(to);
      if (!neighborSets.has(to)) neighborSets.set(to, new Set());
      neighborSets.get(to).add(from);
    };
    // Aristas [a, b, metros, flags, segundos]: "segundos" es el tiempo tipico
    // de camion segun el tipo de via (autopista 90, ruta 60, cruce 40...). Con
    // grafos viejos sin ese campo se estima a 60 km/h.
    for (const [a, b, w, flags, wt] of data.edges) {
      const f = flags || 0;
      const t = wt != null ? wt : w / (60 / 3.6);
      link(a, b, w, t);
      if (!(f & 2)) link(b, a, w, t);
      if (f & 1) { ferryEdges.add(`${a}|${b}`); ferryEdges.add(`${b}|${a}`); }
    }
    const degree = new Uint8Array(data.nodes.length);
    for (const [i, set] of neighborSets) degree[i] = Math.min(255, set.size);

    // El grafo extraido de los datos del juego no siempre queda 100% conectado
    // (intersecciones complejas mal resueltas dejan bolsones aislados). Si el
    // nodo mas cercano a un punto cae en uno de esos bolsones chicos, A* nunca
    // encuentra camino aunque exista una ruta real por al lado. Para evitarlo,
    // identificamos la componente conexa mas grande ("giant component") y
    // preferimos siempre buscar el nodo mas cercano dentro de ella.
    const componentId = new Int32Array(data.nodes.length).fill(-1);
    const componentSize = new Map();
    let biggestComponent = -1;
    let biggestSize = 0;
    for (let start = 0; start < data.nodes.length; start++) {
      if (componentId[start] !== -1) continue;
      const id = start;
      let size = 0;
      const stack = [start];
      componentId[start] = id;
      while (stack.length) {
        const cur = stack.pop();
        size++;
        for (const n of neighborSets.get(cur) || []) {
          if (componentId[n] === -1) {
            componentId[n] = id;
            stack.push(n);
          }
        }
      }
      componentSize.set(id, size);
      if (size > biggestSize) { biggestSize = size; biggestComponent = id; }
    }

    routeGraph = { nodes: data.nodes, adjacency, componentId, componentSize, giantComponent: biggestComponent, ferryEdges, degree };
  } catch (err) {
    routeGraph = null;
  }
}

// Bolsones de pocos nodos = intersecciones mal resueltas por el parser; una
// componente de cientos de nodos es una isla real (Gran Bretana, Islandia,
// Sicilia...) y hay que poder rutear dentro de ella aunque no este unida al
// continente. Con las aristas de ferry en el grafo casi todo termina en una
// sola componente, pero por las dudas se admite cualquiera de este tamano.
const MIN_REAL_COMPONENT_NODES = 300;

function nearestNodeIndex(x, y, requireGiantComponent, onlyComponent = -1) {
  let best = -1;
  let bestDist = Infinity;
  const nodes = routeGraph.nodes;
  for (let i = 0; i < nodes.length; i++) {
    const comp = routeGraph.componentId[i];
    if (onlyComponent !== -1) {
      if (comp !== onlyComponent) continue;
    } else if (requireGiantComponent === true) {
      if (comp !== routeGraph.giantComponent) continue;
    } else if (requireGiantComponent === 'real') {
      if ((routeGraph.componentSize.get(comp) || 0) < MIN_REAL_COMPONENT_NODES) continue;
    }
    const dx = nodes[i][0] - x;
    const dy = nodes[i][1] - y;
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

function findRoute(startXY, endXY) {
  if (!routeGraph) return null;
  const nodes = routeGraph.nodes;
  const adjacency = routeGraph.adjacency;
  // Origen y destino tienen que caer en la misma componente para que A*
  // encuentre camino: primero el nodo mas cercano en cualquier componente
  // real; si no coinciden (ej. destino en una isla sin ferry en el grafo),
  // se re-snapea el destino dentro de la componente del origen (ruta hasta
  // el punto mas cercano alcanzable, mejor que nada).
  let startIdx = nearestNodeIndex(startXY[0], startXY[1], 'real');
  let endIdx = nearestNodeIndex(endXY[0], endXY[1], 'real');
  if (startIdx === -1 || endIdx === -1) return null;
  if (routeGraph.componentId[startIdx] !== routeGraph.componentId[endIdx]) {
    endIdx = nearestNodeIndex(endXY[0], endXY[1], false, routeGraph.componentId[startIdx]);
    if (endIdx === -1) return null;
  }

  // Perfil de ruteo: "fastest" pesa por tiempo (prefiere autopista, como el
  // GPS del juego), "shortest" por metros. La heuristica de A* tiene que ser
  // admisible: distancia recta, y para tiempo dividida por la velocidad maxima
  // posible (90 km/h).
  const byTime = routeProfile !== 'shortest';
  const MAX_SPEED_MS = 90 / 3.6;
  const heuristic = (i) => {
    const d = Math.hypot(nodes[i][0] - nodes[endIdx][0], nodes[i][1] - nodes[endIdx][1]);
    return byTime ? d / MAX_SPEED_MS : d;
  };

  const gScore = new Map([[startIdx, 0]]);
  const cameFrom = new Map();
  const open = new MinHeap();
  open.push(heuristic(startIdx), startIdx);
  const visited = new Set();

  while (open.size > 0) {
    const current = open.pop();
    if (current === endIdx) break;
    if (visited.has(current)) continue;
    visited.add(current);

    const neighbors = adjacency.get(current) || [];
    for (const [neighbor, wDist, wTime] of neighbors) {
      if (visited.has(neighbor)) continue;
      const tentativeG = gScore.get(current) + (byTime ? wTime : wDist);
      if (tentativeG < (gScore.get(neighbor) ?? Infinity)) {
        gScore.set(neighbor, tentativeG);
        cameFrom.set(neighbor, current);
        open.push(tentativeG + heuristic(neighbor), neighbor);
      }
    }
  }

  if (!gScore.has(endIdx)) return null;

  const path = [endIdx];
  let node = endIdx;
  while (cameFrom.has(node)) {
    node = cameFrom.get(node);
    path.push(node);
  }
  path.reverse();
  // Cada punto: [x, y, ferry, junction]. ferry = 1 si el tramo que LLEGA a
  // el es un ferry/tren (dibujado punteado, sin anunciar giros en el mar);
  // junction = 1 si el nodo es una interseccion real (3+ vecinos), que es
  // el unico lugar donde se anuncia un giro.
  return path.map((i, k) => [
    nodes[i][0], nodes[i][1],
    (k > 0 && routeGraph.ferryEdges.has(`${path[k - 1]}|${i}`)) ? 1 : 0,
    routeGraph.degree[i] >= 3 ? 1 : 0,
  ]);
}

// Objetivo de la ruta, en orden de preferencia: la empresa de carga (si hay
// trabajo tomado pero la carga todavia no se subio - ahi es adonde te manda
// el GPS del juego), la empresa de destino exacta (token empresa + ciudad
// via POIs), el centro de la ciudad de destino (Cities.json), o - sin
// trabajo - el ultimo waypoint puesto a mano (ej. "combustible mas cercano").
function resolveRouteTarget(data) {
  // Trabajo tomado pero carga todavia no enganchada: hay que ir a buscarla.
  // Empresa exacta si esta en los POIs; si no, el centro de la ciudad de
  // ORIGEN (antes caia al destino, que es justo a donde no hay que ir aun).
  // Clientes < 1.3.1 no mandan onJob/isCargoLoaded/companySrcId y quedan
  // con la ruta al destino - por eso el aviso de actualizacion.
  if (data.onJob && data.isCargoLoaded === false) {
    const pickup = data.companySrcId ? findCompanyPoi(data.companySrcId, data.citySrcId) : null;
    if (pickup) return { x: pickup.x, z: pickup.z, kind: 'pickup', key: `pickup:${data.companySrcId}@${data.citySrcId}` };
    const srcCity = data.citySrc && citiesByName[data.citySrc];
    if (srcCity) return { x: srcCity.X, z: srcCity.Y, kind: 'pickup', key: `pickupcity:${data.citySrc}` };
  }
  if (data.cityDst) {
    const company = data.companyDstId ? findCompanyPoi(data.companyDstId, data.cityDstId) : null;
    if (company) return { x: company.x, z: company.z, kind: 'dest', key: `dest:${data.companyDstId}@${data.cityDstId}` };
    const city = citiesByName[data.cityDst];
    if (city) return { x: city.X, z: city.Y, kind: 'dest', key: `city:${data.cityDst}` };
  }
  if (waypoints.length) {
    const last = waypoints[waypoints.length - 1];
    return { x: last.pos[0], z: last.pos[1], kind: 'waypoint', key: 'wp-only' };
  }
  return null;
}

// Parte la lista de puntos de la ruta en (a) tramos por tierra y (b) tramos
// de ferry/tren (puntos marcados con 3er elemento = 1), cada uno como
// MultiLineString en lng/lat, para pintarlos con estilos distintos.
function splitRouteForDrawing(routePoints) {
  const land = [], ferry = [];
  let current = [];
  for (let k = 0; k < routePoints.length; k++) {
    const p = routePoints[k];
    if (k > 0 && p[2] === 1) {
      if (current.length > 1) land.push(current);
      const prev = routePoints[k - 1];
      ferry.push([toLngLat(prev[0], prev[1]), toLngLat(p[0], p[1])]);
      current = [toLngLat(p[0], p[1])];
    } else {
      current.push(toLngLat(p[0], p[1]));
    }
  }
  if (current.length > 1) land.push(current);
  return {
    land: { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: land.map(part => smoothLineCoords(part)) } },
    ferry: { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: ferry } },
  };
}

function updateDestinationMarker(data) {
  if (!map || !toLngLat) return;
  const target = resolveRouteTarget(data);
  if (!target) {
    if (destMarker) { destMarker.remove(); destMarker = null; }
    if (map.getSource('route')) map.getSource('route').setData(emptyLineString());
  if (map.getSource('route-ferry')) map.getSource('route-ferry').setData(emptyLineString());
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
    if (destMarker && destMarker._kind !== target.kind) { destMarker.remove(); destMarker = null; }
    if (!destMarker) {
      const el = document.createElement('div');
      el.innerHTML = target.kind === 'pickup' ? MARKER_SVG.pickup : MARKER_SVG.dest;
      destMarker = new maplibregl.Marker({ element: el, anchor: 'bottom-left' }).setLngLat(destLngLat).addTo(map);
      destMarker._kind = target.kind;
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
    let routePoints = [];
    let from = [data.position.x, data.position.z];
    let complete = true;
    for (const to of legs) {
      const leg = findRoute(from, to);
      if (leg) routePoints = routePoints.length ? routePoints.concat(leg.slice(1)) : leg;
      else { complete = false; routePoints.push(from, to); }
      from = to;
    }
    if (!routePoints.length) routePoints = null;
    waypointRouteDistanceKm = (routePoints && waypoints.some(wp => !wp.inGame)) ? (sumPathDistanceMeters(routePoints) * distanceScale()) / 1000 : null;
    currentRouteWorldPoints = routePoints;
    if (map.getSource('route')) {
      if (routePoints) {
        const parts = splitRouteForDrawing(routePoints);
        map.getSource('route').setData(parts.land);
        if (map.getSource('route-ferry')) map.getSource('route-ferry').setData(parts.ferry);
      } else {
        // fallback: linea recta si no se encontro ruta
        const lineCoords = [lastDisplayedLngLat, destLngLat].filter(Boolean);
        map.getSource('route').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: lineCoords } });
        if (map.getSource('route-ferry')) map.getSource('route-ferry').setData(emptyLineString());
      }
    }
    if (!complete) console.warn('Ruta incompleta: algun tramo no se pudo calcular por el grafo');
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
  setMapLoading('mapLoadingGraph');
  await loadRouteGraph(mapInfo);
  setMapLoading('mapLoadingNames');
  await loadRoadNames(mapInfo);
  loadPois(game); // no bloquea: la busqueda muestra "cargando" hasta que llegue
  currentRouteTarget = null;
  currentRouteWorldPoints = null;
  trailWorld.length = 0;
  lastDisplayedLngLat = null;
  if (map.getSource('trail')) map.getSource('trail').setData(emptyLineString());
  if (map.getSource('route')) map.getSource('route').setData(emptyLineString());
  if (map.getSource('route-ferry')) map.getSource('route-ferry').setData(emptyLineString());
  if (destMarker) { destMarker.remove(); destMarker = null; }
  clearWaypoint();

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

  map.jumpTo({ center: mapInfo.origin, zoom: 5 });

  if (!truckMarker) {
    const el = document.createElement('div');
    el.className = 'truckMarker';
    truckArrowEl = document.createElement('div');
    truckArrowEl.className = 'truckArrow';
    el.appendChild(truckArrowEl);
    truckMarker = new maplibregl.Marker({ element: el }).setLngLat(mapInfo.origin).addTo(map);
  }

  document.getElementById('mapHint').textContent = mapInfo.label;
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
let autoFollow = true; // se desactiva si el usuario arrastra el mapa a mano, se reactiva con el boton de recentrar
const TRAIL_JUMP_THRESHOLD_M = 500; // si salta mas que esto entre updates, es un teleport (job asignado, garage, etc.), no un tramo manejado

// Modo navegacion: mapa heading-up (rota con el camion, como un GPS real) en
// vez de norte-arriba, con zoom dinamico (se acerca en curvas, se aleja en
// rectas) e indicaciones de giro genericas (sin nombres de calle, el grafo
// no los tiene). A diferencia de la version con Leaflet (que rotaba un div
// via CSS), MapLibre soporta rotacion real del mapa (bearing) - el pan sigue
// funcionando bien incluso rotado, asi que no hace falta deshabilitar drag.
let navMode = false;
let navAutoZoomPaused = false; // true si el usuario zoomeo a mano en modo nav - se reactiva al recentrar
let lastHeadingDeg = 0;
const NAV_TURN_LOOKAHEAD_M = 800; // no mirar mas alla de esto para el proximo giro
const NAV_TURN_ANGLE_THRESHOLD_DEG = 35; // cambio de rumbo minimo, medido justo en la interseccion, para contar como "giro"
const NAV_TURN_LEG_M = 60; // cuanto camino antes/despues de la interseccion se usa para medir el rumbo de entrada/salida
const NAV_ROAD_NAME_MAX_DIST_M = 400; // radio de busqueda del cartel de ruta mas cercano al tramo del giro

function setNavMode(on) {
  navMode = on;
  navAutoZoomPaused = false;
  const btn = document.getElementById('navToggleBtn');
  if (on) {
    autoFollow = true;
    if (map) map.dragRotate.disable(); // el rumbo lo manejamos nosotros segun el heading, no rotacion manual
    btn.classList.add('active');
    if (truckArrowEl) truckArrowEl.style.transform = 'rotate(0deg)'; // el mapa ya rota, el camion siempre "para arriba"
  } else {
    if (map) { map.dragRotate.enable(); map.easeTo({ bearing: 0, duration: 300 }); }
    btn.classList.remove('active');
    document.getElementById('navPanel').style.display = 'none';
    if (truckArrowEl) truckArrowEl.style.transform = `rotate(${lastHeadingDeg}deg)`;
  }
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
function findUpcomingTurn() {
  if (!currentRouteWorldPoints || currentRouteWorldPoints.length < 3 || !toLngLat) return null;
  const pts = currentRouteWorldPoints;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  // Rumbo geografico entre dos puntos de mundo.
  const bearingBetween = (p, q) => {
    const [lng1, lat1] = toLngLat(p[0], p[1]);
    const [lng2, lat2] = toLngLat(q[0], q[1]);
    return geoBearingDeg(lng1, lat1, lng2, lat2);
  };
  // Punto sobre la ruta a `dist` metros de distancia acumulada (interpolado).
  const pointAt = (dist) => {
    if (dist <= 0) return pts[0];
    for (let i = 1; i < pts.length; i++) {
      if (cum[i] >= dist) {
        const seg = cum[i] - cum[i - 1];
        const f = seg ? (dist - cum[i - 1]) / seg : 0;
        return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f];
      }
    }
    return pts[pts.length - 1];
  };

  for (let i = 1; i < pts.length - 1; i++) {
    if (cum[i] > NAV_TURN_LOOKAHEAD_M) break;
    if (pts[i][2] === 1) break; // tramo de ferry/tren: lo que hay del otro lado se anuncia alla
    if (pts[i][3] !== 1) continue; // no es interseccion: una curva no es un giro
    const inFrom = pointAt(cum[i] - NAV_TURN_LEG_M);
    const outTo = pointAt(cum[i] + NAV_TURN_LEG_M);
    const inBearing = bearingBetween(inFrom, pts[i]);
    const outBearing = bearingBetween(pts[i], outTo);
    let delta = outBearing - inBearing;
    delta = ((delta + 540) % 360) - 180; // normalizar a [-180, 180]
    if (Math.abs(delta) > NAV_TURN_ANGLE_THRESHOLD_DEG) {
      // Nombre de ruta del tramo AL QUE se gira (no del que se viene), buscando
      // cerca del punto de mundo un poco despues del giro - asi el cartel del
      // cruce mismo (que suele estar justo en el vertice) no interfiere.
      const afterTurnIdx = Math.min(i + 2, pts.length - 1);
      const [wx, wz] = pts[afterTurnIdx];
      const nearSign = nearestRoadName(wx, wz, NAV_ROAD_NAME_MAX_DIST_M);
      return { distanceMeters: cum[i], direction: delta > 0 ? 'right' : 'left', nearSign };
    }
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
function updateNavPanel(turn) {
  const panel = document.getElementById('navPanel');
  if (turn) {
    const arrow = turn.direction === 'left' ? '↰' : '↱';
    const dirText = turn.direction === 'left' ? t('navTurnLeft') : t('navTurnRight');
    let ontoText = '';
    if (turn.nearSign) {
      const preposition = turn.nearSign.kind === 'city' ? t('navToward') : t('navOnto');
      ontoText = ` ${preposition} ${turn.nearSign.label}`;
    }
    panel.textContent = `${arrow} ${dirText}${ontoText} ${t('navIn')} ${formatTurnDistance(turn.distanceMeters * distanceScale())}`;
  } else if (currentRouteWorldPoints) {
    panel.textContent = `⬆ ${t('navStraight')}`;
  } else {
    panel.textContent = `${t('navNoRoute')}`;
  }
  panel.style.display = 'block';
}

// Zoom fijo en modo navegacion - el acercamiento automatico al doblar
// (probado antes) generaba saltos molestos justo en intersecciones/enlaces,
// que es donde mas importa ver el contexto completo, no menos.
const NAV_FIXED_ZOOM = 10;
function navTargetZoom(turn) {
  return NAV_FIXED_ZOOM;
}

// Recorta del frente de la ruta calculada (linea roja) el tramo ya recorrido,
// proyectando la posicion actual sobre la polilinea y descartando los puntos
// anteriores - asi no queda roja debajo de la azul (trail) ya recorrida.
function trimRouteBehindTruck(x, z) {
  if (!currentRouteWorldPoints || currentRouteWorldPoints.length < 2 || !map.getSource('route')) return;
  let bestIdx = 0, bestDist = Infinity, bestPoint = null;
  for (let i = 0; i < currentRouteWorldPoints.length - 1; i++) {
    const [ax, az] = currentRouteWorldPoints[i];
    const [bx, bz] = currentRouteWorldPoints[i + 1];
    const dx = bx - ax, dz = bz - az;
    const lenSq = dx * dx + dz * dz;
    let t = lenSq > 0 ? ((x - ax) * dx + (z - az) * dz) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx, pz = az + t * dz;
    const dist = Math.hypot(x - px, z - pz);
    if (dist < bestDist) { bestDist = dist; bestIdx = i; bestPoint = [px, pz]; }
  }
  // Si estamos lejos de la ruta calculada, es un desvio real: offRoute ya se
  // encarga de recalcularla entera, no recortar sobre una ruta vieja.
  if (bestDist > OFF_ROUTE_THRESHOLD_M) return;
  currentRouteWorldPoints = [bestPoint, ...currentRouteWorldPoints.slice(bestIdx + 1)];
  map.getSource('route').setData({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: smoothLineCoords(currentRouteWorldPoints.map(([px, pz]) => toLngLat(px, pz))) },
  });
}

let lastDisplayedLngLat = null; // ultima posicion ya animada del marcador ([lng,lat]), para interpolar el proximo tramo
let moveAnimFrameId = null;
const MOVE_ANIM_MS = 900; // un poco menos que el intervalo de envio (1s) para que no se pisen dos animaciones

// Anima SOLO el marcador de forma fluida entre la posicion anterior y la
// nueva (los updates llegan a ~1Hz, sin esto se ve "a los tics"). La camara
// se maneja aparte, una sola vez por tick (ver updateMap) - antes esta misma
// funcion tambien movia la camara en cada frame (~60/s) con jumpTo(), lo que
// se peleaba con el easeTo() del modo navegacion y de paso le ganaba a
// cualquier intento de arrastrar el mapa a mano.
function animateTruckTo(fromLngLat, toPos) {
  if (moveAnimFrameId) cancelAnimationFrame(moveAnimFrameId);
  const start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / MOVE_ANIM_MS);
    const cur = [
      fromLngLat[0] + (toPos[0] - fromLngLat[0]) * t,
      fromLngLat[1] + (toPos[1] - fromLngLat[1]) * t,
    ];
    truckMarker.setLngLat(cur);
    moveAnimFrameId = t < 1 ? requestAnimationFrame(step) : null;
  }
  moveAnimFrameId = requestAnimationFrame(step);
}

function resolveEffectiveGame(game) {
  const g = game || 'ats';
  if (g === 'ats' && atsMod === 'c2c') return 'ats_c2c';
  if (g === 'ats' && atsMod === 'promods_canada') return 'ats_promods';
  if (g === 'ets2' && hasProMods) return 'ets2_promods';
  return g;
}

function updateMap(position, game) {
  if (position.x == null || position.z == null) return;
  loadGameMap(resolveEffectiveGame(game));
  // loadGameMap es async: entre que setea toLngLat y crea el marcador del
  // camion pasan varios awaits (Cities/grafo/carteles) - los ticks de ese
  // rato se descartan en vez de reventar con truckMarker en null.
  if (!toLngLat || !map || !truckMarker) return;

  const lngLat = toLngLat(position.x, position.z);
  const prevWorldPos = lastWorldPos;
  const prevLngLat = lastDisplayedLngLat;
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
      currentRouteTarget = null;
      currentRouteWorldPoints = null;
    } else if (prevLngLat && movedM > 0.3) {
      // Heading: bearing geografico real entre la posicion mostrada anterior
      // y la nueva - estable sin importar la rotacion actual del mapa.
      const angleDeg = geoBearingDeg(prevLngLat[0], prevLngLat[1], lngLat[0], lngLat[1]);
      lastHeadingDeg = angleDeg;
      // En modo navegacion el mapa ya rota al heading (ver mas abajo), asi
      // que la flecha se deja apuntando siempre "para arriba" en pantalla.
      if (truckArrowEl) truckArrowEl.style.transform = navMode ? 'rotate(0deg)' : `rotate(${angleDeg}deg)`;
    }
  }
  lastWorldPos = { x: position.x, z: position.z };
  checkWaypointReached(position.x, position.z);

  trailWorld.push(lngLat);
  if (trailWorld.length > MAX_TRAIL_POINTS) trailWorld.shift();
  if (map.getSource('trail')) {
    map.getSource('trail').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: trailWorld } });
  }

  if (!justJumped && prevLngLat) {
    animateTruckTo(prevLngLat, lngLat);
  } else {
    truckMarker.setLngLat(lngLat);
  }
  lastDisplayedLngLat = lngLat;

  // Camara: un unico llamado por tick que combina centro+zoom+bearing segun
  // corresponda, en vez de varios llamados peleandose entre si.
  const turn = navMode ? findUpcomingTurn() : null;
  if (navMode) {
    updateNavPanel(turn);
    // Si el usuario zoomeo a mano, no se lo pisamos cada tick - solo
    // seguimos actualizando centro/bearing hasta que recentre.
    const zoomOverride = navAutoZoomPaused ? {} : { zoom: navTargetZoom(turn) };
    if (!justJumped && prevLngLat) {
      map.easeTo({ center: lngLat, bearing: lastHeadingDeg, duration: MOVE_ANIM_MS, ...zoomOverride });
    } else {
      map.jumpTo({ center: lngLat, bearing: lastHeadingDeg, ...zoomOverride });
    }
  } else if (autoFollow) {
    if (!justJumped && prevLngLat) {
      map.easeTo({ center: lngLat, duration: MOVE_ANIM_MS });
    } else {
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
  if (miniHudSettings.fuelRange && data.fuelRangeKm != null) {
    const rangeDisplay = useImperial ? data.fuelRangeKm * KM_TO_MI : data.fuelRangeKm;
    lines.push(`${t('range')}: ${Math.round(rangeDisplay)} ${useImperial ? 'mi' : 'km'}`);
  }
  if (miniHudSettings.eta && data.routeTimeSeconds != null) {
    lines.push(`${t('etaGame')}: ${formatSeconds(data.routeTimeSeconds)}`);
  }
  if (miniHudSettings.distance && data.routeDistanceKm) {
    const distDisplay = useImperial ? data.routeDistanceKm * KM_TO_MI : data.routeDistanceKm;
    lines.push(`${t('distanceLeft')}: ${distDisplay.toFixed(1)} ${useImperial ? 'mi' : 'km'}`);
  }
  if (miniHudSettings.gps && navMode) {
    const navText = document.getElementById('navPanel').textContent;
    if (navText) lines.push(navText);
  }
  document.getElementById('miniHudExtra').innerHTML = lines.map(l => `<div>${l}</div>`).join('');
}

// ETA real: en vez del ETA del juego (que corre en tiempo de juego, no en
// tiempo real - depende de la config de reloj del juego), se calcula
// distancia_restante / velocidad_promedio_real usando una ventana movil de
// los ultimos ETA_WINDOW_SECONDS de telemetria real - asi refleja el ritmo
// real de manejo (paradas, trafico) en vez de una velocidad estandar fija.
const ETA_WINDOW_SECONDS = 5 * 60;
const ETA_MIN_SAMPLE_SPAN_SECONDS = 30; // no calcular con muy poca data, da valores erraticos
const ETA_RECALC_INTERVAL_SECONDS = 5; // cada cuanto se refresca el valor mostrado
const ETA_MIN_SPEED_KMH = 5; // por debajo de esto (camion parado/casi parado) la division da un ETA absurdo
let etaSamples = []; // [{ t: data.ts (segundos), distanceKm }, ...]
let etaSampleTarget = null; // cityDst actual - resetea la ventana si cambia el destino
let etaDisplayValue = null; // ultimo valor mostrado (se mantiene fijo entre recalculos)
let etaLastRecalcTime = null;

// Escala de tiempo del juego (minutos de juego por minuto real). Se mide en
// vivo con gameTimeMinutes (time_abs del SDK) contra el reloj real; hasta
// tener medicion se asume la escala del mapa (ATS 20x, ETS2 19x, que es lo
// que usa el juego cuando el camion se mueve).
let timeScaleSamples = [];
let lastGameTimeSample = null;
function measuredTimeScale(data) {
  if (data.gameTimeMinutes != null && data.ts != null) {
    if (lastGameTimeSample && data.ts - lastGameTimeSample.ts >= 30) {
      const gameMin = data.gameTimeMinutes - lastGameTimeSample.gameMin;
      const realMin = (data.ts - lastGameTimeSample.ts) / 60;
      const scale = gameMin / realMin;
      if (scale > 1 && scale < 60) timeScaleSamples.push(scale);
      if (timeScaleSamples.length > 10) timeScaleSamples.shift();
      lastGameTimeSample = { ts: data.ts, gameMin: data.gameTimeMinutes };
    } else if (!lastGameTimeSample) {
      lastGameTimeSample = { ts: data.ts, gameMin: data.gameTimeMinutes };
    }
  }
  if (timeScaleSamples.length >= 2) {
    const sorted = [...timeScaleSamples].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }
  return distanceScale();
}

// ETA real = ETA del juego pasado a tiempo real (base) corregido por el ritmo
// medido (distancia recorrida en los ultimos minutos) a medida que hay datos.
// Antes era solo lo medido: en ciudad, a 20 km/h, extrapolaba "5 h" para un
// viaje de 50 min reales y recien se acomodaba en la autopista.
function computeRealEtaSeconds(data) {
  if (!data.routeDistanceKm || data.ts == null) return null;
  const scale = measuredTimeScale(data);
  const prior = data.routeTimeSeconds != null && data.routeTimeSeconds > 0 ? data.routeTimeSeconds / scale : null;
  const measured = computeMeasuredEtaSeconds(data);
  if (measured == null) return prior;
  if (prior == null) return measured;
  // Peso de lo medido: 0 con menos de 2 min de muestras, 0.7 a partir de 10 min.
  const span = etaSamples.length ? data.ts - etaSamples[0].t : 0;
  const w = Math.max(0, Math.min(0.7, (span - 120) / (600 - 120) * 0.7));
  return prior * (1 - w) + measured * w;
}

function computeMeasuredEtaSeconds(data) {
  if (!data.routeDistanceKm || data.ts == null) return null;
  if (data.cityDst !== etaSampleTarget) {
    etaSampleTarget = data.cityDst;
    etaSamples = [];
    etaDisplayValue = null;
    etaLastRecalcTime = null;
  }
  etaSamples.push({ t: data.ts, distanceKm: data.routeDistanceKm });
  etaSamples = etaSamples.filter(s => data.ts - s.t <= ETA_WINDOW_SECONDS);

  // Solo se refresca el valor mostrado cada ETA_RECALC_INTERVAL_SECONDS - un
  // numero que salta en cada tick es mas ruido que informacion.
  if (etaLastRecalcTime != null && data.ts - etaLastRecalcTime < ETA_RECALC_INTERVAL_SECONDS) {
    return etaDisplayValue;
  }

  if (etaSamples.length < 2) return etaDisplayValue;
  const oldest = etaSamples[0];
  const elapsedSeconds = data.ts - oldest.t;
  if (elapsedSeconds < ETA_MIN_SAMPLE_SPAN_SECONDS) return etaDisplayValue;

  const distanceCoveredKm = oldest.distanceKm - data.routeDistanceKm;
  const avgSpeedKmh = (distanceCoveredKm / elapsedSeconds) * 3600;
  // Camion parado o casi (garage, semaforo, peaje) durante toda la ventana:
  // la velocidad promedio da casi cero y la division explota a un ETA de
  // cientos de miles de horas. Se descarta y se mantiene el ultimo valor
  // valido en vez de mostrar un numero absurdo.
  if (avgSpeedKmh < ETA_MIN_SPEED_KMH) return etaDisplayValue;

  etaLastRecalcTime = data.ts;
  etaDisplayValue = (data.routeDistanceKm / avgSpeedKmh) * 3600;
  lastKnownAvgSpeedKmh = avgSpeedKmh; // reusado por updateWaypointRoute para el ETA "(with waypoint)"
  return etaDisplayValue;
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
  document.getElementById('gaugeRange').textContent = data.fuelRangeKm != null ? `⛽ ${Math.round(useImperial ? data.fuelRangeKm * KM_TO_MI : data.fuelRangeKm)} ${useImperial ? 'mi' : 'km'}` : '-';
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
  const realEtaSeconds = computeRealEtaSeconds(data);
  document.getElementById('etaReal').textContent = realEtaSeconds != null ? formatSeconds(realEtaSeconds) : t('calculating');

  // Proximo descanso obligatorio (fatiga): el SDK manda MINUTOS de juego
  // (restStopMinutes; restStopSeconds es el nombre viejo del cliente <=1.4.1,
  // tambien en minutos). Solo se muestra si el juego manda un valor util -
  // con la simulacion de fatiga apagada no significa nada.
  const restMin = data.restStopMinutes != null ? data.restStopMinutes : data.restStopSeconds;
  const restRow = document.getElementById('restStopRow');
  if (restMin != null && restMin > 0 && restMin < 24 * 60) {
    restRow.hidden = false;
    const realSec = (restMin * 60) / measuredTimeScale(data);
    document.getElementById('restStop').textContent = `${formatSeconds(restMin * 60)} · ≈ ${formatSeconds(realSec)} ${t('realShort')}`;
  } else {
    restRow.hidden = true;
  }

  document.getElementById('jobIncome').textContent = data.jobIncome ? `$${data.jobIncome.toLocaleString()}` : '-';

  // Combustible: fuel/fuelCapacity vienen en unidades del juego (litros o
  // galones segun el pais del camion), pero el porcentaje da igual la unidad.
  // Se muestran arriba, al lado de la velocidad, apiladas en 3 lineas.
  if (data.fuel != null && data.fuelCapacity) {
    const pct = Math.max(0, Math.min(100, (data.fuel / data.fuelCapacity) * 100));
    document.getElementById('fuelPctLine').innerHTML = `${t('fuel')} ${statSpan(pct, 15, 30)}`;
  } else {
    document.getElementById('fuelPctLine').textContent = `${t('fuel')} -`;
  }
  if (data.fuelRangeKm != null) {
    const rangeDisplay = useImperial ? data.fuelRangeKm * KM_TO_MI : data.fuelRangeKm;
    document.getElementById('fuelRangeLine').textContent = `${t('range')} ${Math.round(rangeDisplay)} ${useImperial ? 'mi' : 'km'}`;
  } else {
    document.getElementById('fuelRangeLine').textContent = `${t('range')} -`;
  }
  if (data.fuelAvgConsumption) {
    // fuelAvgConsumption viene del SDK en litros/100km sin importar el pais
    // del camion. En imperial se convierte a mpg (formula estandar).
    const consumptionText = useImperial
      ? `${(235.215 / data.fuelAvgConsumption).toFixed(1)} mpg`
      : `${data.fuelAvgConsumption.toFixed(1)} L/100km`;
    document.getElementById('fuelAvgLine').textContent = consumptionText;
  } else {
    document.getElementById('fuelAvgLine').textContent = '-';
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

  updateSessionEvents(data.event || {});
}

// Peajes/multas/tren-ferry llegan como pulsos (bool + monto en el mismo tick
// en que ocurre el evento). Se acumulan por sesion detectando el flanco de
// subida (false -> true) para no sumar el mismo evento en cada tick que el
// flag siga en true.
const sessionTotals = { tolls: 0, fines: 0, ferryTrainCount: 0 };
const previousEventState = { tollgate: false, fined: false, ferry: false, train: false, jobDelivered: false, jobCancelled: false };

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

function updateSessionEvents(event) {
  if (event.tollgate && !previousEventState.tollgate) sessionTotals.tolls += event.tollgatePayAmount || 0;
  if (event.fined && !previousEventState.fined) sessionTotals.fines += event.fineAmount || 0;
  if (event.ferry && !previousEventState.ferry) { sessionTotals.tolls += 0; sessionTotals.ferryTrainCount++; }
  if (event.train && !previousEventState.train) sessionTotals.ferryTrainCount++;
  if (event.jobDelivered && !previousEventState.jobDelivered) {
    showToast(t('jobDeliveredToast').replace('{amount}', Math.round(event.jobDeliveredRevenue || 0).toLocaleString()), 'success');
    recordTrip(event);
  }
  if (event.jobCancelled && !previousEventState.jobCancelled) {
    showToast(t('jobCancelledToast'), 'danger');
  }
  previousEventState.tollgate = !!event.tollgate;
  previousEventState.fined = !!event.fined;
  previousEventState.ferry = !!event.ferry;
  previousEventState.train = !!event.train;
  previousEventState.jobDelivered = !!event.jobDelivered;
  previousEventState.jobCancelled = !!event.jobCancelled;

  document.getElementById('tollsTotal').textContent = `$${sessionTotals.tolls.toLocaleString()}`;
  document.getElementById('finesTotal').textContent = `$${sessionTotals.fines.toLocaleString()}`;
  document.getElementById('ferryTrainCount').textContent = sessionTotals.ferryTrainCount;
}

// Historial de viajes SOLO local (localStorage): el SDK no expone ninguna
// identidad de jugador/perfil, asi que no hay forma de atarlo a una persona
// - queda por dispositivo/navegador. Ultimas 50 entregas.
const TRIPS_KEY = 'truckdash_trips';
const TRIPS_MAX = 50;
function loadTrips() {
  try { return JSON.parse(localStorage.getItem(TRIPS_KEY) || '[]'); } catch (e) { return []; }
}
function recordTrip(event) {
  const trips = loadTrips();
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
    return `<div class="trip"><div><div class="tripRoute">${esc(tr.src || '?')} → ${esc(tr.dst || '?')}</div><div class="tripMeta">${esc(tr.cargo || '-')} · ${dist} · ${esc(tr.truck || '')}</div></div><div style="text-align:right"><div>$${tr.revenue.toLocaleString()}</div><div class="tripMeta">${date}${tr.game ? ' · ' + tr.game.toUpperCase() : ''}</div></div></div>`;
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

document.getElementById('recenterBtn').addEventListener('click', () => {
  autoFollow = true;
  navAutoZoomPaused = false;
  if (map && truckMarker) {
    // Fuera del modo nav, ademas de centrar se endereza el mapa (norte
    // arriba) por si el usuario lo roto a mano; en modo nav el bearing lo
    // pisa el proximo tick con el heading real, no hace falta tocarlo aca.
    map.jumpTo(navMode ? { center: truckMarker.getLngLat() } : { center: truckMarker.getLngLat(), bearing: 0 });
  }
});

let reconnectTimer = null;
const RECONNECT_DELAY_MS = 3000;

// Estado de la conexion mostrado en el chip de la barra, la linea de detalle
// (#status) y el empty state sobre el mapa. Combina lo que sabe el viewer
// (socket abierto o no), lo que dice el backend (hay un cliente local
// conectado con este codigo?) y el diagnostico que manda el cliente
// (client_status: waiting_game / plugin_missing / waiting_truck / live).
const conn = { socket: 'idle', clientConnected: null, clientStatus: null, paused: false, invalidCode: false, hasTelemetry: false, local: false, demo: false, everOpen: false };

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
});

function renderConnectionUi() {
  const view = connectionView();
  updateWakeLock(!!view);
  const chip = document.getElementById('statusChip');
  const group = document.getElementById('connectGroup');
  const empty = document.getElementById('emptyState');
  document.body.classList.toggle('connected', !!view);
  document.body.classList.toggle('live', !!(view && view.live));
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
  conn.socket = 'idle'; conn.clientConnected = null; conn.clientStatus = null; conn.hasTelemetry = false; conn.invalidCode = false; conn.everOpen = false;
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

document.querySelectorAll('#commandsPanel .cmdBtn[data-action]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (conn.demo) { showToast(t('demoNoCommands'), 'danger', 2500); return; }
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      showToast(t('commandNotConnectedToast'), 'danger');
      return;
    }
    ws.send(JSON.stringify({ type: 'command', action: btn.dataset.action }));
  });
});

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
const COMMAND_RESULT_REASON_KEY = { no_key: 'commandResultNoKey', no_window: 'commandResultNoWindow' };
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
}

// Conecta (o reconecta) el websocket del viewer. Se llama tanto al apretar
// Connect como automaticamente si la conexion se corta - antes, si se
// cortaba, el unico aviso era el texto chico de #status, facil de no notar
// si estas mirando el dashboard en otra pantalla mientras manejas.
// Un tick de telemetria (venga del relay, del servidor LAN del cliente o del
// modo demo): actualiza HUD, mapa, ruta y estado.
function handleTelemetry(data) {
  conn.clientConnected = true;
  conn.hasTelemetry = true;
  const pausedChanged = conn.paused !== !!data.paused;
  conn.paused = !!data.paused;
  if (!conn.clientStatus || conn.clientStatus.status !== 'live' || conn.clientStatus.game !== data.game || pausedChanged) {
    conn.clientStatus = { status: 'live', game: data.game };
    lastData = data;
    renderConnectionUi();
  }
  updateHud(data);
  updateMap(data.position || {}, data.game);
  updateDestinationMarker(data);
  checkUpdateBanner(data.clientVersion);
  // Si cambio la variante de mapa efectiva (ej. activaste ProMods a
  // mitad de sesion), hay que avisarle al backend para que reagrupe bien.
  if (liveShareEnabled && !conn.local && resolveEffectiveGame(data.game) !== lastSentMapVariant) sendLiveShareState();
}

function connectWs(backend, code, options = {}) {
  conn.local = !!options.local;
  fetchLatestClientVersion(conn.local ? document.getElementById('backendUrl').value : backend);
  clearTimeout(reconnectTimer);
  // Modo LAN: el cliente sirve esta pagina y el WebSocket directo, sin
  // pairing code (misma red = misma persona); ver client/local_server.py.
  const socket = new WebSocket(conn.local ? backend : `${backend}/ws/live/${code}`);
  ws = socket;
  conn.socket = 'connecting';
  conn.invalidCode = false;
  renderConnectionUi();

  socket.onopen = () => {
    hideReconnectBanner();
    conn.socket = 'open';
    conn.everOpen = true;
    renderConnectionUi();
    sendLiveShareState(); // re-establecer el opt-in tras (re)conectar - el backend no lo recuerda entre conexiones
    if (keybindsModalOpen) requestKeybinds(); // el pedido anterior se pudo haber perdido en el corte
  };
  socket.onmessage = (event) => {
    hideReconnectBanner();
    const data = JSON.parse(event.data);
    if (data.type === 'keybinds') { handleKeybindsMessage(data); return; } // no es telemetria
    if (data.type === 'live_players') { updateLivePlayers(data.players || []); return; } // no es telemetria
    if (data.type === 'command_result') { handleCommandResult(data); return; } // no es telemetria
    if (data.type === 'session_state') {
      conn.clientConnected = !!data.client_connected;
      if (data.client_status) conn.clientStatus = data.client_status;
      if (!conn.clientConnected) conn.hasTelemetry = false;
      renderConnectionUi();
      return;
    }
    if (data.type === 'client_status') {
      conn.clientConnected = true;
      conn.clientStatus = data; // incluye .detail si el cliente lo manda
      if (data.status !== 'live') conn.hasTelemetry = false;
      renderConnectionUi();
      checkUpdateBanner(data.clientVersion);
      return;
    }
    handleTelemetry(data);
  };
  socket.onclose = (ev) => {
    if (ws !== socket) return; // reemplazado por una conexion mas nueva, ignorar
    // 4404 = el backend no conoce el codigo. Si esta pestana YA estuvo
    // conectada con el, el codigo era valido: es un redeploy del backend
    // (las sesiones viven en memoria) y el cliente local la recrea al
    // reconectar en pocos segundos - se sigue reintentando. Si nunca se
    // conecto, es un codigo mal tipeado o vencido: se avisa y se para.
    if (ev && ev.code === 4404 && !conn.everOpen) {
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
  if (map && map.getSource('route')) map.getSource('route').setData(emptyLineString());
  connectWs(backend, code);
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
  localStorage.setItem('truckdash_tour_seen', '1');
}

document.getElementById('tourNextBtn').addEventListener('click', () => {
  tourStepIndex++;
  if (tourStepIndex < TOUR_STEPS.length) showTourStep(tourStepIndex);
  else endTour();
});
document.getElementById('tourSkipBtn').addEventListener('click', endTour);
document.getElementById('helpBtn').addEventListener('click', startTour);

if (!localStorage.getItem('truckdash_tour_seen')) {
  setTimeout(startTour, 600); // deja que el mapa/botones terminen de acomodarse
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
const DEMO_ROUTE = { game: 'ats', from: 'Salt Lake City', to: 'Las Vegas', cargo: 'Bulldozer', cargoMassKg: 18189, truckBrand: 'Volvo', truckName: 'VNL', jobIncome: 61158 };
const DEMO_SPEED_MS = 26; // ~94 km/h
const DEMO_TIME_SCALE = 6; // 6x mas rapido que en tiempo real, para que pasen cosas
// El mapa del juego esta a escala ~1:20: el juego muestra distancias/ETA
// multiplicadas, y la telemetria real tambien (routeDistance viene ya
// escalado). La demo hace lo mismo para que los numeros se vean normales.
const DEMO_DISTANCE_SCALE = 20;
let demoTimer = null;

function startDemo() {
  conn.demo = true;
  conn.socket = 'open';
  conn.clientConnected = true;
  document.getElementById('code').value = 'DEMO';
  renderConnectionUi();
  loadGameMap(DEMO_ROUTE.game);
  const waitAssets = () => {
    if (!mapReady || !routeGraph || !citiesByName[DEMO_ROUTE.from] || !citiesByName[DEMO_ROUTE.to] || !truckMarker) {
      demoTimer = setTimeout(waitAssets, 500);
      return;
    }
    runDemo();
  };
  waitAssets();
}

function runDemo() {
  const a = citiesByName[DEMO_ROUTE.from], b = citiesByName[DEMO_ROUTE.to];
  const path = findRoute([a.X, a.Y], [b.X, b.Y]);
  if (!path || path.length < 2) { showToast('Demo route unavailable', 'danger'); return; }
  const total = sumPathDistanceMeters(path);
  let travelled = 0;
  let fuel = 0.82;
  let odometer = 184220;
  let tick = 0;
  const speedNoise = () => DEMO_SPEED_MS * 3.6 + Math.sin(tick / 7) * 4;

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

  const step = () => {
    tick++;
    travelled += DEMO_SPEED_MS * DEMO_TIME_SCALE;
    if (travelled >= total) travelled = 0; // vuelve a empezar
    const [x, z] = pointAt(travelled);
    const remainingKm = ((total - travelled) / 1000) * DEMO_DISTANCE_SCALE;
    fuel = Math.max(0.05, fuel - 0.00012 * DEMO_TIME_SCALE);
    odometer += (DEMO_SPEED_MS * DEMO_TIME_SCALE * DEMO_DISTANCE_SCALE) / 1000;
    const speedKmh = speedNoise();
    handleTelemetry({
      ts: Date.now() / 1000,
      clientVersion: '9.9.9',
      paused: false,
      game: DEMO_ROUTE.game,
      position: { x, y: 0, z },
      speedKmh,
      speedLimitKmh: Math.floor(tick / 40) % 3 === 0 ? 88.5 : 104.6,
      cargo: DEMO_ROUTE.cargo,
      cargoMassKg: DEMO_ROUTE.cargoMassKg,
      citySrc: DEMO_ROUTE.from,
      cityDst: DEMO_ROUTE.to,
      onJob: true,
      isCargoLoaded: true,
      routeDistanceKm: remainingKm,
      routeTimeSeconds: (remainingKm * 1000) / DEMO_SPEED_MS,
      gameTimeMinutes: Math.floor((Date.now() / 1000) * DEMO_DISTANCE_SCALE / 60),
      restStopMinutes: 6 * 60 + 40,
      jobDeadlineSeconds: 3600 * 9,
      truckBrand: DEMO_ROUTE.truckBrand,
      truckName: DEMO_ROUTE.truckName,
      odometerKm: odometer,
      fuel: fuel * 600,
      fuelCapacity: 600,
      fuelRangeKm: fuel * 600 / 0.38,
      wear: { engine: 0.03, transmission: 0.02, cabin: 0.06, chassis: 0.04, wheels: 0.11 },
      jobIncome: DEMO_ROUTE.jobIncome,
      fuelAvgConsumption: 38,
      cruiseControl: true,
      cruiseControlSpeedKmh: 94,
      lights: { beamLow: true },
      engineRpm: 1250 + Math.sin(tick / 5) * 120,
      engineRpmMax: 2500,
      gear: 12,
      engineEnabled: true,
      parkingBrake: false,
      trailerAttached: true,
      mechanicalWarnings: {},
      event: {},
    });
  };
  step();
  demoTimer = setInterval(step, 1000);
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
  if (params.get('local')) {
    // Servido por el cliente en la LAN: el WebSocket esta en el mismo host,
    // puerto fijo (ver client/local_server.py).
    connectWs(`ws://${location.hostname}:27766`, null, { local: true });
    return;
  }
  if (code) {
    document.getElementById('code').value = code.toUpperCase();
    document.getElementById('connectBtn').click();
  }
})();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

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
    settingsLiveShare: 'Share my position: see other drivers and appear on the public live map (anonymous)',
    settingsButtonsTitle: 'Map buttons:',
    settingsDarkButtons: 'Dark buttons, to match the dark map',
    settingsFadeButtons: 'Fade them out while driving and bring them back on touch',
    settingsMoveButtons: 'Move the buttons',
    layoutGrid: 'Grid',
    layoutHint: 'Drag whatever you want to move; the handle moves a whole button group',
    layoutExtras: 'Extra info',
    layoutReset: 'Reset',
    layoutDone: 'Done',
    settingsBaseTitle: 'Base map:',
    settingsRealBase: 'Real base map: coastline, lakes, rivers and built-up areas under the roads',
    settingsRealBaseHint: 'Map data from Natural Earth. Adds about 1 MB the first time. Grand Utopia has no real base map: it is a standalone map.',
    settingsLiteTitle: 'Lite mode (old phones / tablets):',
    settingsLiteMode: 'Lite mode: lower-resolution rendering, no animations or 3D, fewer labels, no road names in directions',
    settingsLiteNoRouting: 'Also skip routing (no route line, turn-by-turn or real ETA) — saves the most memory',
    settingsLiteHint: 'Applies after a reload. Use it if the page crashes or the map never finishes loading on an older device.',
    settingsLiteReload: 'Reloading to apply…',
    liveShareNotice: 'You appear on the live map as an anonymous driver, and other drivers on your map can see you. Turn it off in Settings → "Share my position" if you prefer.',
    liveMapChip: 'Live map',
    liveMapTitle: 'Live map',
    liveMapDrivers: '{n} drivers',
    liveMapDriversOne: '1 driver',
    liveMapAnon: 'Driver',
    liveMapEmpty: 'Nobody is sharing their position on this map right now.',
    liveMapUnknown: 'Unknown map. Pick one from the live map list.',
    liveMapFull: 'Too many viewers on this map right now, try again in a bit.',
    liveMapAll: 'All maps',
    liveMapFitAll: 'Show all',
    liveMapPin: 'Pin and follow this truck',
    liveMapUnpin: 'Stop following',
    settingsLiveHideOthers: "Hide other players' markers on the map",
    settingsCommandsTitle: 'Truck command buttons:',
    settingsRouteTitle: 'Route preference:',
    settingsRouteFastest: 'Fastest — prefers highways, like the in-game GPS',
    settingsRouteShortest: 'Shortest distance',
    settingsCurrencyTitle: 'Job pay in your currency:',
    currencyAuto: 'Auto — from your time zone ({cur})',
    currencyAutoUnknown: 'Auto — from your time zone',
    currencyOff: 'Game currency only (€ / $)',
    currencyHint: 'Worked out from your device\'s time zone (or its language) — no location, nothing tracked. Shown next to the pay here and in the Discord #jobs post; only the currency code is sent.',
    settingsRouteColorTitle: 'Route line color:',
    settingsGpsDirections: 'GPS directions',
    modsTitle: 'Map mods',
    joinDiscord: 'Discord',
    settingsNoMod: 'None',
    modsAutoLabel: 'Automatic — read from the game (needs client 1.5.1+)',
    modsManualLabel: 'Choose manually',
    modsDetectNoData: 'no data yet',
    modsDetectNoLog: 'game log not found',
    modsDetected: 'detected {mods}',
    modsDetectedNone: 'no map mods',
    settingsCoastToCoast: 'I have Coast to Coast installed',
    settingsProModsCanada: 'I have ProMods Canada installed',
    settingsC2CProModsCanada: 'I have Coast to Coast + ProMods Canada installed',
    settingsReforma: 'I have Reforma (Mexico, with Sierra Nevada) installed',
    settingsReformaAll: 'I have Reforma + Coast to Coast + ProMods Canada installed',
    settingsProModsRoex: 'I have ProMods + Roextended (Hybrid edition)',
    settingsProModsRusMapRoex: 'I have ProMods + RusMap + Roextended (Hybrid edition)',
    settingsGrandUtopia: 'I play on Grand Utopia (standalone map)',
    settingsTruckersMP: 'I play on TruckersMP (base map + TruckersMP HQ and CD road)',
    settingsProMods: 'I have ProMods (Europe + all addons) installed',
    settingsProModsRusMap: 'I have ProMods + RusMap (with the ProMods-RusMap connector)',
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
    cmdHighBeam: 'High beams',
    cmdInfotainment: 'Infotainment',
    cmdLiftAxle: 'Lift axle',
    cmdWipers: 'Wipers',
    cmdRemap: 'Remap',
    commandResultNoKey: "This command has no key assigned - set one in Remap",
    commandResultNoWindow: "Couldn't find the game window (is it running?)",
    commandResultError: 'Command failed: {reason}',
    commandNotConnectedToast: 'Not connected to the local client',
    fuelMeasuredHint: 'Measured from your fuel level and odometer over the last {km} {unit} (resets when you refuel)',
    fuelSdkHint: "Game's own average until 15 km of driving have been measured",
    commandResultBadKey: "The client doesn't accept that key (check the custom button)",
    customBtnAdd: 'Add button',
    customBtnEdit: 'Edit',
    customBtnModalTitle: 'Custom button',
    customBtnExplain: "The client presses this key in the game, exactly like the built-in buttons. Bind the same key to something in the game's controls.",
    customBtnLabel: 'Label',
    customBtnKey: 'Key',
    customBtnKeyPlaceholder: 'Press a key…',
    customBtnKeyHint: 'Click the field and press the key (Ctrl / Shift / Alt combos work). Letters, digits, F1–F24, numpad and the usual punctuation.',
    customBtnDelete: 'Delete',
    customBtnIncomplete: 'Give the button a label and a key',
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
    withWaypoint: '📍 via waypoint',
    withWaypointHint: 'Estimated by the app via your waypoint - the game does not know about it',
    jobDeadline: 'Job deadline',
    waypoint: 'Waypoint',
    clear: 'Clear',
    waypointInGame: 'Set (also in-game)',
    waypointAppOnly: 'Set (app only)',
    navTurnLeft: 'Turn left',
    navTurnRight: 'Turn right',
    navKeepLeft: 'Keep left',
    navKeepRight: 'Keep right',
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
    jobDeliveredToast: '✅ Job delivered! +{amount}',
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
    roadmapLink: "What's next (roadmap)",
    panelEmptyTitle: 'Waiting for the game',
    panelEmptyBody: 'Trip, truck and session data show up here as soon as the game starts sending telemetry.',
    gameClock: 'Game time',
    destApprox: 'Approximate: the game did not say which company, this is the city center.',
    destApproxHint: 'The game did not report the destination company for this job, so the flag shows the city center.',
    routeRemainingLabel: 'Left',
    routeDurationLabel: 'Time',
    routeArrivalLabel: 'Arrival',
    routeReset: 'Clear the route from the map',
    cardTrip: 'Trip',
    cardTruck: 'Truck',
    cardSession: 'Session',
    convoyTitle: 'Convoy',
    convoyCardsTitle: 'Convoy',
    convoyIntro: 'Share a code with friends: everyone sees each other on the map and in a card carousel. Each one runs their own game and client - no need to be in the same session.',
    convoyNickLabel: 'Nickname',
    convoyShareIncome: 'Show my job pay to the others',
    convoyCreateTitle: 'Start a convoy:',
    convoyPostSummary: 'Post a summary in the Truck Dash Discord when it ends',
    convoyCreate: 'Create convoy',
    convoyJoinTitle: 'Join one:',
    convoyJoin: 'Join',
    convoyNotConnected: 'Connect your client first (enter your pairing code).',
    convoyUnavailableLan: 'Convoy needs the cloud link: open trucksim-dash.com/app with your pairing code instead of the LAN address.',
    convoyUnavailableDemo: 'Not available in the demo.',
    convoyPrivacyHint: 'Convoy members see your position and trip data while you are in. Nothing is stored when the convoy ends. The buttons always control only your own truck.',
    convoyCopyLink: 'Copy link',
    convoyCopied: 'Link copied - paste it in Discord',
    convoyLeave: 'Leave convoy',
    convoyCloseConvoy: 'End convoy for everyone',
    convoyKick: 'Remove',
    convoySpectators: '👁 {n} watching',
    convoyMute: 'Mute convoy sounds',
    convoyShowMarkers: 'Show members on the map (arrows and edge chips)',
    convoyFollow: 'Follow leader',
    convoyUnfollow: 'Stop following',
    convoyShowRoute: 'Show route',
    convoyHideRoute: 'Hide route',
    convoyBehind: '{d} behind',
    convoyAway: '{d} away',
    convoyOffline: 'offline',
    convoyInMenu: 'in the menu',
    convoyOtherGame: 'in {game}',
    convoyLeaderTag: 'leader',
    convoyYou: 'you',
    convoyJoined: '{n} joined the convoy',
    convoyLeft: '{n} left the convoy',
    convoyKicked: 'You were removed from the convoy',
    convoyEnded: 'The convoy ended',
    convoyErrNick: 'Nickname: 2-16 letters, numbers, spaces or - _',
    convoyErrNotFound: 'No convoy with that code (or it ended)',
    convoyErrBanned: 'You were removed from that convoy',
    convoyErrFull: 'That convoy is full',
    convoyErrTaken: 'That nickname is already in the convoy',
    convoyErrNotIn: 'You are not in a convoy',
    convoyErrGeneric: 'Convoy error',
    convoyMsgBtn: 'Quick message to the convoy',
    convoyMsg_ok: 'All good',
    convoyMsg_stop_next: 'Stop at next rest area',
    convoyMsg_fuel: 'Need fuel',
    convoyMsg_behind: 'Falling behind',
    convoyMsg_wait: 'Wait for me',
    convoyMsg_go: "Let's go",
    chipSpectator: 'Spectator',
    detailSpectator: 'Watching a convoy - no game needed. Open the app with your pairing code to drive with them.',
    speed: 'Speed',
    route: 'Route',
    sessionReset: 'Reset',
    sessionResetToast: 'Session counters reset (game changed)',
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
    waypointTapToRemove: 'Tap to remove this waypoint',
    waypointClearAll: 'Clear all',
    waypointsLabel: 'Waypoints',
    waypointReachedToast: '📍 Reached: {name}',
    waypointLimitToast: 'Up to {n} waypoints',
    poiTitle: 'Find nearby',
    poiCityPlaceholder: 'City (optional)…',
    navNextCity: 'Next city',
    nextCity: 'Next city',
    toggle3d: '3D view',
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
    settingsLiveShare: 'Compartir mi posición: ver a otros conductores y aparecer en el mapa en vivo público (anónimo)',
    settingsButtonsTitle: 'Botones del mapa:',
    settingsDarkButtons: 'Botones oscuros, para que peguen con el mapa oscuro',
    settingsFadeButtons: 'Que se desvanezcan mientras manejás y vuelvan al tocar',
    settingsMoveButtons: 'Mover los botones',
    layoutGrid: 'Grilla',
    layoutHint: 'Arrastrá lo que quieras mover; el asa mueve todo un grupo de botones',
    layoutExtras: 'Datos extra',
    layoutReset: 'Restablecer',
    layoutDone: 'Listo',
    settingsBaseTitle: 'Mapa base:',
    settingsRealBase: 'Mapa base real: costa, lagos, ríos y zonas urbanas debajo de las rutas',
    settingsRealBaseHint: 'Datos de Natural Earth. Son ~1 MB más la primera vez. Grand Utopia no tiene mapa base real: es un mapa aparte.',
    settingsLiteTitle: 'Modo liviano (celulares / tablets viejos):',
    settingsLiteMode: 'Modo liviano: render a menor resolución, sin animaciones ni 3D, menos etiquetas, sin nombres de ruta en las indicaciones',
    settingsLiteNoRouting: 'Además sin ruteo (sin línea de ruta, indicaciones ni ETA real) — es lo que más memoria ahorra',
    settingsLiteHint: 'Se aplica al recargar. Usalo si la página se cierra sola o el mapa nunca termina de cargar en un dispositivo viejo.',
    settingsLiteReload: 'Recargando para aplicar…',
    liveShareNotice: 'Aparecés en el mapa en vivo como conductor anónimo, y otros conductores de tu mapa te ven. Si preferís, apagalo en Ajustes → "Compartir mi posición".',
    liveMapChip: 'Mapa en vivo',
    liveMapTitle: 'Mapa en vivo',
    liveMapDrivers: '{n} conductores',
    liveMapDriversOne: '1 conductor',
    liveMapAnon: 'Conductor',
    liveMapEmpty: 'Nadie está compartiendo su posición en este mapa ahora.',
    liveMapUnknown: 'Mapa desconocido. Elegí uno de la lista del mapa en vivo.',
    liveMapFull: 'Hay demasiados espectadores en este mapa ahora, probá en un rato.',
    liveMapAll: 'Todos los mapas',
    liveMapFitAll: 'Ver todos',
    liveMapPin: 'Fijar y seguir este camión',
    liveMapUnpin: 'Dejar de seguir',
    settingsLiveHideOthers: 'Ocultar los marcadores de otros jugadores en el mapa',
    settingsCommandsTitle: 'Botonera del camión:',
    settingsRouteTitle: 'Preferencia de ruta:',
    settingsRouteFastest: 'Más rápida — prefiere autopistas, como el GPS del juego',
    settingsRouteShortest: 'Distancia más corta',
    settingsCurrencyTitle: 'Pago del trabajo en tu moneda:',
    currencyAuto: 'Automático — según tu zona horaria ({cur})',
    currencyAutoUnknown: 'Automático — según tu zona horaria',
    currencyOff: 'Solo la moneda del juego (€ / $)',
    currencyHint: 'Se deduce de la zona horaria de tu dispositivo (o de su idioma): sin ubicación, sin rastreo. Se muestra al lado del pago acá y en el post de entregas de Discord; solo viaja el código de la moneda.',
    settingsRouteColorTitle: 'Color de la línea de ruta:',
    settingsGpsDirections: 'Indicaciones de GPS',
    modsTitle: 'Mods de mapa',
    joinDiscord: 'Discord',
    settingsNoMod: 'Ninguno',
    modsAutoLabel: 'Automático — se lee del juego (necesita cliente 1.5.1+)',
    modsManualLabel: 'Elegir a mano',
    modsDetectNoData: 'sin datos todavía',
    modsDetectNoLog: 'no se encontró el log del juego',
    modsDetected: 'detectado {mods}',
    modsDetectedNone: 'sin mods de mapa',
    settingsCoastToCoast: 'Tengo instalado Coast to Coast',
    settingsProModsCanada: 'Tengo instalado ProMods Canada',
    settingsC2CProModsCanada: 'Tengo instalados Coast to Coast + ProMods Canada',
    settingsReforma: 'Tengo instalado Reforma (México, con Sierra Nevada)',
    settingsReformaAll: 'Tengo Reforma + Coast to Coast + ProMods Canada',
    settingsProModsRoex: 'Tengo ProMods + Roextended (edición Hybrid)',
    settingsProModsRusMapRoex: 'Tengo ProMods + RusMap + Roextended (edición Hybrid)',
    settingsGrandUtopia: 'Juego en Grand Utopia (mapa standalone)',
    settingsTruckersMP: 'Juego en TruckersMP (mapa base + sede TMP y ruta CD)',
    settingsProMods: 'Tengo instalado ProMods (Europe + todos los addons)',
    settingsProModsRusMap: 'Tengo ProMods + RusMap (con el conector ProMods-RusMap)',
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
    cmdHighBeam: 'Luces altas',
    cmdInfotainment: 'Infotainment',
    cmdLiftAxle: 'Eje elevable',
    cmdWipers: 'Limpia­parabrisas', // guion suave: corta en dos lineas solo si no entra en el boton
    cmdRemap: 'Remapear',
    commandResultNoKey: 'Este comando no tiene tecla asignada - configurala en Remap',
    commandResultNoWindow: 'No se encontró la ventana del juego (¿está abierto?)',
    commandResultError: 'Falló el comando: {reason}',
    commandNotConnectedToast: 'No conectado al cliente local',
    fuelMeasuredHint: 'Medido con tu nivel de tanque y odómetro en los últimos {km} {unit} (se reinicia al cargar)',
    fuelSdkHint: 'Promedio del juego hasta juntar 15 km de datos propios',
    commandResultBadKey: 'El cliente no acepta esa tecla (revisá el botón custom)',
    customBtnAdd: 'Agregar botón',
    customBtnEdit: 'Editar',
    customBtnModalTitle: 'Botón personalizado',
    customBtnExplain: 'El cliente aprieta esta tecla en el juego, igual que los botones de siempre. Asignale esa misma tecla a algo en los controles del juego.',
    customBtnLabel: 'Nombre',
    customBtnKey: 'Tecla',
    customBtnKeyPlaceholder: 'Apretá una tecla…',
    customBtnKeyHint: 'Hacé clic en el campo y apretá la tecla (sirven combinaciones con Ctrl / Shift / Alt). Letras, números, F1–F24, teclado numérico y la puntuación habitual.',
    customBtnDelete: 'Borrar',
    customBtnIncomplete: 'Ponele un nombre y una tecla al botón',
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
    withWaypoint: '📍 vía waypoint',
    withWaypointHint: 'Estimación propia de la app pasando por tu waypoint: el juego no lo conoce',
    jobDeadline: 'Deadline del trabajo',
    waypoint: 'Waypoint',
    clear: 'Quitar',
    waypointInGame: 'Marcado (también en el juego)',
    waypointAppOnly: 'Marcado (solo en la app)',
    navTurnLeft: 'Girá a la izquierda',
    navTurnRight: 'Girá a la derecha',
    navKeepLeft: 'Mantenete a la izquierda',
    navKeepRight: 'Mantenete a la derecha',
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
    jobDeliveredToast: '✅ ¡Trabajo entregado! +{amount}',
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
    roadmapLink: 'Qué viene (roadmap)',
    panelEmptyTitle: 'Esperando al juego',
    panelEmptyBody: 'Los datos del viaje, el camión y la sesión aparecen acá apenas el juego empiece a mandar telemetría.',
    gameClock: 'Hora del juego',
    destApprox: 'Aproximado: el juego no dijo la empresa, esto es el centro de la ciudad.',
    destApproxHint: 'El juego no informó la empresa de destino de este viaje, así que la bandera muestra el centro de la ciudad.',
    routeRemainingLabel: 'Falta',
    routeDurationLabel: 'Tiempo',
    routeArrivalLabel: 'Llegada',
    routeReset: 'Borrar la ruta del mapa',
    cardTrip: 'Viaje',
    cardTruck: 'Camión',
    cardSession: 'Sesión',
    convoyTitle: 'Convoy',
    convoyCardsTitle: 'Convoy',
    convoyIntro: 'Compartí un código con amigos: todos se ven en el mapa y en un carrusel de tarjetas. Cada uno con su juego y su cliente, sin estar en la misma sesión.',
    convoyNickLabel: 'Apodo',
    convoyShareIncome: 'Mostrar mi pago del trabajo a los demás',
    convoyCreateTitle: 'Armar un convoy:',
    convoyPostSummary: 'Publicar un resumen en el Discord de Truck Dash al terminar',
    convoyCreate: 'Crear convoy',
    convoyJoinTitle: 'Unirse a uno:',
    convoyJoin: 'Unirse',
    convoyNotConnected: 'Primero conectá tu cliente (poné tu código de pairing).',
    convoyUnavailableLan: 'El convoy necesita la nube: abrí trucksim-dash.com/app con tu código de pairing en vez de la dirección LAN.',
    convoyUnavailableDemo: 'No disponible en la demo.',
    convoyPrivacyHint: 'Los del convoy ven tu posición y tus datos de viaje mientras estés adentro. No se guarda nada al terminar. Los botones siempre controlan solo tu camión.',
    convoyCopyLink: 'Copiar link',
    convoyCopied: 'Link copiado: pegalo en Discord',
    convoyLeave: 'Salir del convoy',
    convoyCloseConvoy: 'Terminar el convoy para todos',
    convoyKick: 'Expulsar',
    convoySpectators: '👁 {n} mirando',
    convoyMute: 'Silenciar sonidos del convoy',
    convoyShowMarkers: 'Mostrar compañeros en el mapa (flechas y chapitas del borde)',
    convoyFollow: 'Seguir al líder',
    convoyUnfollow: 'Dejar de seguir',
    convoyShowRoute: 'Ver ruta',
    convoyHideRoute: 'Ocultar ruta',
    convoyBehind: 'vas {d} detrás',
    convoyAway: 'a {d}',
    convoyOffline: 'desconectado',
    convoyInMenu: 'en el menú',
    convoyOtherGame: 'en {game}',
    convoyLeaderTag: 'líder',
    convoyYou: 'vos',
    convoyJoined: '{n} entró al convoy',
    convoyLeft: '{n} salió del convoy',
    convoyKicked: 'Te sacaron del convoy',
    convoyEnded: 'El convoy terminó',
    convoyErrNick: 'Apodo: 2 a 16 letras, números, espacios o - _',
    convoyErrNotFound: 'No hay ningún convoy con ese código (o terminó)',
    convoyErrBanned: 'Te sacaron de ese convoy',
    convoyErrFull: 'Ese convoy está lleno',
    convoyErrTaken: 'Ese apodo ya está en el convoy',
    convoyErrNotIn: 'No estás en un convoy',
    convoyErrGeneric: 'Error del convoy',
    convoyMsgBtn: 'Mensaje rápido al convoy',
    convoyMsg_ok: 'Todo bien',
    convoyMsg_stop_next: 'Parada en la próxima área',
    convoyMsg_fuel: 'Necesito combustible',
    convoyMsg_behind: 'Me quedo atrás',
    convoyMsg_wait: 'Espérenme',
    convoyMsg_go: 'Vamos',
    chipSpectator: 'Espectador',
    detailSpectator: 'Mirando un convoy, sin juego. Abrí la app con tu código de pairing para manejar con ellos.',
    speed: 'Velocidad',
    route: 'Ruta',
    sessionReset: 'Reiniciar',
    sessionResetToast: 'Contadores de sesión reiniciados (cambió el juego)',
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
    waypointTapToRemove: 'Tocá para quitar este waypoint',
    waypointClearAll: 'Quitar todos',
    waypointsLabel: 'Waypoints',
    waypointReachedToast: '📍 Llegaste: {name}',
    waypointLimitToast: 'Hasta {n} waypoints',
    poiTitle: 'Buscar cerca',
    poiCityPlaceholder: 'Ciudad (opcional)…',
    navNextCity: 'Próxima ciudad',
    nextCity: 'Próxima ciudad',
    toggle3d: 'Vista 3D',
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
  // Ingles por defecto, a proposito, y NO el idioma del navegador: es el
  // idioma del producto y la referencia de todas las traducciones. Lo unico
  // que lo cambia es haber elegido uno a mano (aca o en /account/, las dos
  // pantallas guardan en la misma clave), porque eso si es una decision.
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && TRANSLATIONS[saved]) return saved;
  } catch (e) {}
  return 'en';
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
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(Object.assign(loadSettings(), { miniHud: miniHudSettings, routeColor, atsMod, ets2Mod, liveShareEnabled, liveShareV2: true, hideOtherPlayers, useImperial, routeProfile, modsAuto, nav3d, currency: currencyPref, customButtons, liteMode, liteNoRouting, realBase, darkButtons, fadeButtons, btnLayout, layoutGrid })));
  } catch (e) {}
}
const _savedSettings = loadSettings();
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
  { fuelPct: false, fuelRange: false, eta: false, distance: false, cruise: true, gps: false },
  _savedSettings.miniHud
);
let routeColor = _savedSettings.routeColor || '#a30000';
let routeProfile = _savedSettings.routeProfile || 'fastest'; // 'fastest' (como el GPS del juego) | 'shortest'

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
  document.getElementById('setRouteFastest').checked = routeProfile !== 'shortest';
  document.getElementById('setRouteShortest').checked = routeProfile === 'shortest';
  document.getElementById('setLiveShare').checked = liveShareEnabled;
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
  document.getElementById('setEts2ModNone').checked = ets2Mod === 'none';
  document.getElementById('setProMods').checked = ets2Mod === 'promods';
  document.getElementById('setProModsRusMap').checked = ets2Mod === 'promods_rusmap';
  document.getElementById('setProModsRoex').checked = ets2Mod === 'promods_roex';
  document.getElementById('setProModsRusMapRoex').checked = ets2Mod === 'promods_rusmap_roex';
  document.getElementById('setProModsRoex').closest('label').hidden = !MAP_DATA_VERSION.ets2_promods_roex;
  document.getElementById('setProModsRusMapRoex').closest('label').hidden = !MAP_DATA_VERSION.ets2_promods_rusmap_roex;
  document.getElementById('setGrandUtopia').checked = ets2Mod === 'gu';
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
function sendLiveShareState() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  // Sin telemetria todavia no se sabe el juego: resolveEffectiveGame() cae
  // en 'ats' por defecto y el conductor aparecia en el mapa de ATS aunque
  // estuviera en ETS2. Se manda null (no comparte) y updateMap re-manda el
  // estado apenas llega el primer tick con el juego real.
  const mapVariant = liveShareEnabled && lastData?.game ? resolveEffectiveGame(lastData.game) : null;
  lastSentMapVariant = mapVariant;
  // El apodo de convoy (si lo puso) es lo unico con nombre que se muestra en el mapa en vivo.
  const nick = liveShareEnabled ? (loadSettings().convoyNick || null) : null;
  ws.send(JSON.stringify({ type: 'set_live_share', enabled: liveShareEnabled, mapVariant, nick }));
  if (liveShareNoticePending && liveShareEnabled && !conn.demo && !conn.spectator) {
    liveShareNoticePending = false;
    saveSettings(); // persiste liveShareV2: el aviso es una sola vez
    showToast(t('liveShareNotice'), 'info', 12000);
  }
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
let citiesByToken = {}; // token del juego -> misma entrada
const trailWorld = []; // [[lng,lat], ...]
const MAX_TRAIL_POINTS = 1000;
let trailWorldRaw = null; // coords de juego del ultimo punto agregado al trail

function emptyLineString() {
  return { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } };
}

// Capas del estilo que dependen del juego actual (fuente vectorial 'vec') -
// se remueven y se vuelven a crear al cambiar de juego, ya que MapLibre no
// permite cambiarle la url a un source ya existente.
const VEC_LAYER_IDS = ['mapArea', 'prefab', 'ferry-line', 'road-local', 'road-divided', 'road-freeway', 'poi', 'ferry-poi', 'exit-label', 'country-label', 'city-label'];

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
      paint: { 'line-color': '#ff8a3d', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1, 12, 3.5, 17, 10] } },
    { id: 'poi', type: 'symbol', source: 'vec', 'source-layer': L, minzoom: liteMode ? 9 : 7,
      filter: ['all', ['==', ['get', 'type'], 'poi'], ['in', ['get', 'sprite'], ['literal', POI_ICONS]], ['!', ['in', ['get', 'poiType'], ['literal', ['ferry', 'train']]]]],
      layout: { 'icon-image': ['get', 'sprite'], 'icon-size': 0.8, 'icon-allow-overlap': true, 'icon-ignore-placement': true } },
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
function showMapHint(label) {
  const el = document.getElementById('mapHint');
  if (!el) return;
  if (label) el.textContent = label;
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
    el.style.left = el.style.top = el.style.right = el.style.bottom = '';
    home.parent.insertBefore(el, home.next);
  }
  placeMiniHud();
}

function startLayoutDrag(ev) {
  const el = ev.currentTarget.classList.contains('layoutGrip')
    ? ev.currentTarget.parentNode
    : ev.currentTarget;
  const panel = document.getElementById('mapPanel');
  if (!panel) return;
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
    }
    place(e);
  };
  const up = () => {
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', up);
    target.removeEventListener('pointercancel', up);
    if (!dragging) return; // fue un toque, no se movio nada
    const x = parseFloat(el.style.left), y = parseFloat(el.style.top);
    if (!isFinite(x) || !isFinite(y)) return;
    layoutBucket(el.id)[el.id] = { x, y };
    saveSettings();
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
    if (on && !grip) {
      grip = document.createElement('div');
      grip.className = 'layoutGrip';
      grip.textContent = '⠿';
      group.insertBefore(grip, group.firstChild);
      grip.addEventListener('pointerdown', startLayoutDrag);
    } else if (!on && grip) {
      grip.remove();
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
    // Lite: pintar a 1x en pantallas de alta densidad (hasta 4x menos pixeles).
    pixelRatio: liteMode ? 1 : undefined,
    maxZoom: liteMode ? 15 : undefined,
  });
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
    map.addLayer({ id: 'trail-line', type: 'line', source: 'trail', paint: { 'line-color': '#3b9eff', 'line-width': 3, 'line-opacity': 0.7 } });
    // La ruta lleva un borde claro debajo: 3 px de rojo oscuro sobre una
    // autopista naranja de 10 px se veia como una raya en el medio, no como
    // "la ruta" (un usuario creyo que la app no ruteaba por la autopista).
    map.addSource('route', { type: 'geojson', data: emptyLineString() });
    if (!liteMode) map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.55 } });
    map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': routeColor, 'line-width': 3.5, 'line-opacity': 0.95 } });
    // Tramos DESPUES del primer waypoint (waypoint -> destino del trabajo):
    // punteados y mas tenues, para que se distingan de "como llego al
    // waypoint" - si no, la vuelta que hay que dar despues de un area de
    // descanso parecia una ruta absurda hacia el waypoint.
    map.addSource('route-next', { type: 'geojson', data: emptyLineString() });
    if (!liteMode) map.addLayer({ id: 'route-next-casing', type: 'line', source: 'route-next', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.3 } });
    map.addLayer({ id: 'route-next-line', type: 'line', source: 'route-next', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': routeColor, 'line-width': 3, 'line-opacity': 0.6, 'line-dasharray': [2, 1.5] } });
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
const POI_ICON_BASE = `${REMOTE_MAP_BASE}/vector/icons`;

async function loadPoiIcons() {
  for (const name of POI_ICONS.concat(FERRY_ICONS)) {
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
    if (document.getElementById('poiModal').style.display === 'flex') { fillPoiCityList(); renderPoiResults(); }
    return pois;
  })();
  return poisLoading;
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
document.getElementById('poiCloseBtn').addEventListener('click', closePoiModal);
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
    const res = await fetch(`${base}.bin${v}`);
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
  if (dv.getUint32(0, false) !== 0x54445247 || dv.getUint32(4, true) !== 2) throw new Error('formato de grafo desconocido');
  const n = dv.getUint32(8, true), ne = dv.getUint32(12, true), nMid = dv.getUint32(16, true);
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
  return { n, ne, nodes, edgeA, edgeB, edgeM, edgeS, edgeF, midOff, midXY };
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
  const { n, ne, nodes, edgeA, edgeB, edgeM, edgeS, edgeF, midOff, midXY } = g;
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
    n, nodes, csr, adjTo, adjEdge, adjRev, edgeM, edgeS, edgeF, midOff, midXY, degree, componentId, componentSize, giantComponent,
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

function nearestNodeIndex(x, y, requireGiantComponent, onlyComponent = -1) {
  let best = -1;
  let bestDist = Infinity;
  const nodes = routeGraph.nodes;
  const n = routeGraph.n;
  const compId = routeGraph.componentId, compSize = routeGraph.componentSize, giant = routeGraph.giantComponent;
  for (let i = 0; i < n; i++) {
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

function findRoute(startXY, endXY) {
  if (!routeGraph) return null;
  const { nodes, csr, adjTo, adjEdge, adjRev, edgeM, edgeS, edgeF, midOff, midXY, degree, componentId } = routeGraph;
  // Origen y destino tienen que caer en la misma componente para que A*
  // encuentre camino: primero el nodo mas cercano en cualquier componente
  // real; si no coinciden (ej. destino en una isla sin ferry en el grafo),
  // se re-snapea el destino dentro de la componente del origen (ruta hasta
  // el punto mas cercano alcanzable, mejor que nada).
  let startIdx = nearestNodeIndex(startXY[0], startXY[1], 'real');
  let endIdx = nearestNodeIndex(endXY[0], endXY[1], 'real');
  if (startIdx === -1 || endIdx === -1) return null;
  if (componentId[startIdx] !== componentId[endIdx]) {
    endIdx = nearestNodeIndex(endXY[0], endXY[1], false, componentId[startIdx]);
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
  const out = [];
  for (let k = 0; k < path.length; k++) {
    const i = path[k];
    let ferry = 0;
    if (k > 0) {
      const prev = path[k - 1];
      const d = routeGraph.dirEdge(prev, i);
      if (d !== -1) {
        const e = adjEdge[d];
        ferry = edgeF[e] & 1 ? 1 : 0;
        const m0 = midOff[e], m1 = midOff[e + 1];
        if (adjRev[d]) { for (let m = m1 - 1; m >= m0; m--) out.push([midXY[2 * m], midXY[2 * m + 1], 0, 0, null]); }
        else { for (let m = m0; m < m1; m++) out.push([midXY[2 * m], midXY[2 * m + 1], 0, 0, null]); }
      }
    }
    out.push([nodes[2 * i], nodes[2 * i + 1], ferry, degree[i] >= 3 ? 1 : 0, i]);
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
  for (const id of ['route', 'route-next', 'route-ferry']) {
    if (map && map.getSource(id)) map.getSource(id).setData(emptyLineString());
  }
  if (destMarker) { destMarker.remove(); destMarker = null; }
  document.getElementById('navPanel').style.display = 'none';
  renderRouteSummary(null);
  if (typeof convoyOnRouteChanged === 'function') convoyOnRouteChanged();
}

function renderRouteSummary(view) {
  const panel = document.getElementById('routeSummary');
  if (!panel) return;
  panel.hidden = !view;
  document.getElementById('mapPanel').classList.toggle('hasRouteSummary', !!view);
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
    aviso.hidden = !view.approx;
    if (view.approx) aviso.textContent = t('destApprox');
  }
}

// Resumen de la ruta arriba del mapa: barra de progreso, lo que falta, el
// tiempo real restante y la hora de llegada estimada (PR #1).
function updateRouteSummary(data) {
  const target = resolveRouteTarget(data);
  if (!target) { routeProgressState = { key: null, total: 0 }; renderRouteSummary(null); return; }
  // Con waypoints propios la distancia del juego no cuenta el desvio: se mide
  // sobre la ruta que dibujamos nosotros.
  const manual = waypoints.some(wp => !wp.inGame) || target.kind === 'waypoint';
  const remainingKm = manual
    ? (currentRouteWorldPoints ? sumPathDistanceMeters(currentRouteWorldPoints) * distanceScale() / 1000 : null)
    : (Number.isFinite(data.routeDistanceKm) ? Math.max(0, data.routeDistanceKm) : null);
  const key = routeIdentity(data) + target.key;
  if (routeProgressState.key !== key) routeProgressState = { key, total: 0 };
  if (remainingKm != null) routeProgressState.total = Math.max(routeProgressState.total, remainingKm);
  const percent = remainingKm == null || routeProgressState.total <= 0 ? 0
    : Math.max(0, Math.min(100, (1 - remainingKm / routeProgressState.total) * 100));
  const seconds = manual
    ? (remainingKm != null && lastKnownAvgSpeedKmh > 0 ? remainingKm / lastKnownAvgSpeedKmh * 3600 : null)
    : (remainingKm === 0 ? 0 : routeSummaryEtaSeconds);
  renderRouteSummary({
    approx: !!target.approx,
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
function splitRouteForDrawing(routePoints) {
  const land = [], next = [], ferry = [];
  let current = [];
  let currentLeg = 0;
  const flush = () => { if (current.length > 1) (currentLeg > 0 ? next : land).push(current); };
  for (let k = 0; k < routePoints.length; k++) {
    const p = routePoints[k];
    const leg = p[5] != null ? p[5] : currentLeg;
    if (k > 0 && leg !== currentLeg) {
      // cambio de tramo: el punto del waypoint cierra el tramo anterior y abre el siguiente
      current.push(toLngLat(p[0], p[1]));
      flush();
      current = [toLngLat(p[0], p[1])];
      currentLeg = leg;
      continue;
    }
    if (k > 0 && p[2] === 1) {
      flush();
      const prev = routePoints[k - 1];
      ferry.push([toLngLat(prev[0], prev[1]), toLngLat(p[0], p[1])]);
      current = [toLngLat(p[0], p[1])];
    } else {
      current.push(toLngLat(p[0], p[1]));
    }
  }
  flush();
  return {
    land: { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: land.map(part => smoothLineCoords(part)) } },
    next: { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: next.map(part => smoothLineCoords(part)) } },
    ferry: { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: ferry } },
  };
}

function updateDestinationMarker(data) {
  if (!map || !toLngLat) return;
  const target = resolveRouteTarget(data);
  if (!target) {
    if (destMarker) { destMarker.remove(); destMarker = null; }
    if (map.getSource('route')) map.getSource('route').setData(emptyLineString());
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
    legs.forEach((to, legIdx) => {
      let leg = findRoute(from, to);
      if (leg) {
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
        map.getSource('route').setData(parts.land);
        if (map.getSource('route-next')) map.getSource('route-next').setData(parts.next);
        if (map.getSource('route-ferry')) map.getSource('route-ferry').setData(parts.ferry);
      } else {
        // fallback: linea recta si no se encontro ruta
        const lineCoords = [lastDisplayedLngLat, destLngLat].filter(Boolean);
        map.getSource('route').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: lineCoords } });
        if (map.getSource('route-next')) map.getSource('route-next').setData(emptyLineString());
        if (map.getSource('route-ferry')) map.getSource('route-ferry').setData(emptyLineString());
      }
    }
    if (!complete) console.warn('Ruta incompleta: algun tramo no se pudo calcular por el grafo');
    if (typeof convoyOnRouteChanged === 'function') convoyOnRouteChanged(); // Convoy: los demas ven mi ruta
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

  showMapHint(mapInfo.label);
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
let routeBehind = []; // ultimos nodos de la ruta ya recorridos (ver trimRouteBehindTruck)
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
}
if (portraitMq.addEventListener) portraitMq.addEventListener('change', placeMiniHud); else portraitMq.addListener(placeMiniHud);
placeMiniHud();

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

  for (let i = here + 1; i < pts.length - 1; i++) {
    if (cum[i] - cum[here] > NAV_TURN_LOOKAHEAD_M) break;
    if (pts[i][2] === 1) break; // tramo de ferry/tren: lo que hay del otro lado se anuncia alla
    if (pts[i][3] !== 1) continue; // no es interseccion: una curva no es un giro
    const iEnd = junctionClusterEnd(pts, cum, i, NAV_JUNCTION_CLUSTER_GAP_M, NAV_JUNCTION_CLUSTER_SPAN_M);
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

function updateNavPanel(turn) {
  if (lastData && dismissedRouteIdentity === routeIdentity(lastData)) {
    document.getElementById('navPanel').style.display = 'none';
    return;
  }
  const panel = document.getElementById('navPanel');
  const nextLine = nextCityName ? `<span class="navNext">${t('navNextCity')}: ${nextCityName}</span>` : '';
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
    panel.innerHTML = `${arrow} ${escapeHtml(dirText)}${escapeHtml(ontoText)} ${t('navIn')} ${formatTurnDistance(turn.distanceMeters * distanceScale(), useImperial)}${nextLine}`;
  } else if (currentRouteWorldPoints) {
    panel.innerHTML = `⬆ ${t('navStraight')}${nextLine}`;
  } else {
    panel.textContent = `${t('navNoRoute')}`;
  }
  panel.style.display = 'block';
}

// Zoom fijo en modo navegacion - el acercamiento automatico al doblar
// (probado antes) generaba saltos molestos justo en intersecciones/enlaces,
// que es donde mas importa ver el contexto completo, no menos.
const NAV_FIXED_ZOOM = 10;
// La flecha se achica al alejarse y crece al acercarse: alejado tapaba media
// ciudad. Solo escala el div interno; la posicion y el rumbo los maneja
// MapLibre (PR #1).
function updateTruckArrowSize() {
  if (!map || !truckArrowEl) return;
  const scale = Math.max(0.6, Math.min(1.2, 1 + (map.getZoom() - NAV_FIXED_ZOOM) * 0.12));
  truckArrowEl.style.transform = `scale(${scale})`;
}

function navTargetZoom(turn) {
  return nav3d ? NAV_FIXED_ZOOM + 0.7 : NAV_FIXED_ZOOM;
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
// usuario). El camion avanza < 30 m por tick, asi que la ventana sobra.
const TRIM_WINDOW_M = 400;
function trimRouteBehindTruck(x, z) {
  if (!currentRouteWorldPoints || currentRouteWorldPoints.length < 2 || !map.getSource('route')) return;
  let bestIdx = 0, bestDist = Infinity, bestPoint = null;
  let along = 0;
  for (let i = 0; i < currentRouteWorldPoints.length - 1; i++) {
    const [ax, az] = currentRouteWorldPoints[i];
    const [bx, bz] = currentRouteWorldPoints[i + 1];
    const dx = bx - ax, dz = bz - az;
    const lenSq = dx * dx + dz * dz;
    if (along > TRIM_WINDOW_M) break;
    along += Math.sqrt(lenSq);
    let t = lenSq > 0 ? ((x - ax) * dx + (z - az) * dz) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx, pz = az + t * dz;
    const dist = Math.hypot(x - px, z - pz);
    if (dist < bestDist) { bestDist = dist; bestIdx = i; bestPoint = [px, pz]; }
  }
  // Si estamos lejos de la ruta calculada, es un desvio real: offRoute ya se
  // encarga de recalcularla entera, no recortar sobre una ruta vieja.
  if (bestDist > OFF_ROUTE_THRESHOLD_M) return;
  // Los nodos que quedan atras se guardan aparte (ultimos 8): findUpcomingTurn
  // los usa para medir el rumbo de ENTRADA a un cruce cercano - sin ellos, a
  // menos de 60 m del cruce el tramo de entrada se achicaba hasta cero y la
  // medicion cambiaba justo al llegar (giros que aparecian/desaparecian).
  for (let k = 1; k <= bestIdx; k++) routeBehind.push(currentRouteWorldPoints[k]);
  if (routeBehind.length > 8) routeBehind.splice(0, routeBehind.length - 8);
  // El punto interpolado hereda el tramo del nodo que sigue.
  const nextPt = currentRouteWorldPoints[bestIdx + 1];
  currentRouteWorldPoints = [[bestPoint[0], bestPoint[1], 0, 0, null, nextPt && nextPt[5] != null ? nextPt[5] : 0], ...currentRouteWorldPoints.slice(bestIdx + 1)];
  const parts = splitRouteForDrawing(currentRouteWorldPoints);
  map.getSource('route').setData(parts.land);
  if (map.getSource('route-next')) map.getSource('route-next').setData(parts.next);
  if (map.getSource('route-ferry')) map.getSource('route-ferry').setData(parts.ferry);
}

let lastDisplayedLngLat = null; // ultima posicion ya animada del marcador ([lng,lat]), para interpolar el proximo tramo
let moveAnimFrameId = null;
// Duracion de la interpolacion entre dos ticks de telemetria: se mide el
// intervalo real de llegada (1 s con clientes viejos, 250 ms con 1.5+ por el
// relay, 100 ms en LAN) y se anima un poco menos que eso, asi la posicion
// mostrada siempre "alcanza" la real antes del proximo tick sin quedar a
// saltos. Media movil para que un tick atrasado no rompa el ritmo.
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
  return Math.max(60, Math.min(950, tickIntervalMs * 0.9));
}

// Anima SOLO el marcador de forma fluida entre la posicion anterior y la
// nueva (los updates llegan a ~1Hz, sin esto se ve "a los tics"). La camara
// se maneja aparte, una sola vez por tick (ver updateMap) - antes esta misma
// funcion tambien movia la camara en cada frame (~60/s) con jumpTo(), lo que
// se peleaba con el easeTo() del modo navegacion y de paso le ganaba a
// cualquier intento de arrastrar el mapa a mano.
function animateTruckTo(fromLngLat, toPos, fromHeading, toHeading) {
  if (moveAnimFrameId) cancelAnimationFrame(moveAnimFrameId);
  // El giro se interpola con la MISMA duracion y la misma rampa lineal que
  // usa el easeTo de la camara para su bearing. Si la flecha salta y el mapa
  // gira progresivamente, los dos nunca coinciden y la flecha se ve torcida
  // respecto de la ruta aunque el rumbo sea correcto.
  const deltaHeading = ((toHeading - fromHeading + 540) % 360) - 180;
  if (liteMode) {
    truckMarker.setLngLat(toPos);
    truckMarker.setRotation(toHeading);
    moveAnimFrameId = null;
    return; // sin interpolar por frame
  }
  const start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / moveAnimMs());
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
    moveAnimFrameId = t < 1 ? requestAnimationFrame(step) : null;
  }
  moveAnimFrameId = requestAnimationFrame(step);
}

function resolveEffectiveGame(game) {
  const g = game || 'ats';
  const det = modsAuto && detectedMods ? detectedMods[g] : null;
  if (det) {
    // Reforma con cualquiera de los otros dos mapas usa el pack "todo" (es
    // un superconjunto: rutas de mas en Canada/costa, nunca de menos).
    if (g === 'ats' && det.reforma && (det.c2c || det.promods_canada)) return 'ats_reforma_c2c_promods';
    if (g === 'ats' && det.reforma) return 'ats_reforma';
    if (g === 'ats' && det.c2c && det.promods_canada) return 'ats_c2c_promods';
    if (g === 'ats' && det.promods_canada) return 'ats_promods';
    if (g === 'ats' && det.c2c) return 'ats_c2c';
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
  if (g === 'ats' && atsMod === 'c2c_promods_canada') return 'ats_c2c_promods';
  if (g === 'ats' && atsMod === 'c2c') return 'ats_c2c';
  if (g === 'ats' && atsMod === 'promods_canada') return 'ats_promods';
  if (g === 'ets2' && ets2Mod === 'gu') return 'ets2_gu';
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
  if (det.grand_utopia) names.push('Grand Utopia');
  if (det.truckersmp) names.push('TruckersMP');
  if (det.promods_canada) names.push('ProMods Canada');
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
      // deducirlo del desplazamiento daba el rumbo equivocado.
      const d = ((gameHeadingDeg - lastHeadingDeg + 540) % 360) - 180;
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
  checkWaypointReached(position.x, position.z);
  updateCurrentRoad(position.x, position.z);
  updateNextCity(position.x, position.z);

  // A 10 Hz un punto por tick llenaria el trail en 100 s: solo se agrega
  // si el camion se movio >= 5 m desde el ultimo punto guardado.
  const lastTrail = trailWorldRaw;
  if (!lastTrail || Math.hypot(position.x - lastTrail.x, position.z - lastTrail.z) >= 5) {
    trailWorld.push(lngLat);
    trailWorldRaw = { x: position.x, z: position.z };
    if (trailWorld.length > MAX_TRAIL_POINTS) trailWorld.shift();
  }
  if (map.getSource('trail')) {
    map.getSource('trail').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: trailWorld } });
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
  const turn = navMode ? stabilizeManeuver(navManeuverState, findUpcomingTurn(), NAV_TURN_DEBOUNCE_TICKS) : null;
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
      map.easeTo({ center: lngLat, bearing: lastHeadingDeg, duration: moveAnimMs(), easing: t => t, ...zoomOverride, ...navView });
    } else {
      map.jumpTo({ center: lngLat, bearing: lastHeadingDeg, ...zoomOverride, ...navView });
    }
  } else if (autoFollow) {
    if (!justJumped && prevLngLat) {
      map.easeTo({ center: lngLat, duration: moveAnimMs(), easing: t => t });
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

  // Proximo descanso obligatorio (fatiga): el SDK manda MINUTOS de juego
  // (restStopMinutes; restStopSeconds es el nombre viejo del cliente <=1.4.1,
  // tambien en minutos). Solo se muestra si el juego manda un valor util -
  // con la simulacion de fatiga apagada no significa nada.
  const restMin = data.restStopMinutes != null ? data.restStopMinutes : data.restStopSeconds;
  const restRow = document.getElementById('restStopRow');
  if (restMin != null && restMin > 0 && restMin < 24 * 60) {
    restRow.hidden = false;
    const realSec = (restMin * 60) / measuredTimeScale(data);
    document.getElementById('restStop').innerHTML = `${escapeHtml(formatSeconds(restMin * 60))}<span class="subValue">≈ ${escapeHtml(formatSeconds(realSec))} ${escapeHtml(t('realShort'))}</span>`;
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

  updateSessionEvents(data.event || {}, data.game);
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

function updateSessionEvents(event, game) {
  if (game && sessionTotals.game && game !== sessionTotals.game) {
    resetSessionTotals(game);
    showToast(t('sessionResetToast'), 'success', 3000);
  } else if (game && !sessionTotals.game) {
    sessionTotals.game = game;
  }
  if (event.tollgate && !previousEventState.tollgate) sessionTotals.tolls += event.tollgatePayAmount || 0;
  if (event.fined && !previousEventState.fined) sessionTotals.fines += event.fineAmount || 0;
  if (event.ferry && !previousEventState.ferry) { sessionTotals.tolls += 0; sessionTotals.ferryTrainCount++; }
  if (event.train && !previousEventState.train) sessionTotals.ferryTrainCount++;
  if (event.jobDelivered && !previousEventState.jobDelivered) {
    showToast(t('jobDeliveredToast').replace('{amount}', moneyLine(event.jobDeliveredRevenue || 0, lastData?.game)), 'success');
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
});

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
  updateMap(data.position || {}, data.game, data.heading);
  updateDestinationMarker(data);
  updateRouteSummary(data);
  checkUpdateBanner(data.clientVersion);
  if (typeof convoyOnTelemetry === 'function') convoyOnTelemetry(data); // Convoy: variante de mapa, ruta, seguir al lider
  // Si cambio la variante de mapa efectiva (ej. activaste ProMods a
  // mitad de sesion), hay que avisarle al backend para que reagrupe bien.
  if (liveShareEnabled && !conn.local && data.game && resolveEffectiveGame(data.game) !== lastSentMapVariant) sendLiveShareState();
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
    conn.waitingClient = false;
    renderConnectionUi();
    sendLiveShareState(); // re-establecer el opt-in tras (re)conectar - el backend no lo recuerda entre conexiones
    sendCurrencyPref(); // idem: la moneda para el post de Discord
    if (keybindsModalOpen) requestKeybinds(); // el pedido anterior se pudo haber perdido en el corte
    if (typeof convoyOnSocketOpen === 'function') { convoyOnSocketOpen(); convoyRenderModal(); } // Convoy: volver a entrar tras (re)conectar
  };
  socket.onmessage = (event) => {
    hideReconnectBanner();
    // Un mensaje del backend = el codigo existia de verdad (el rechazo por
    // codigo desconocido cierra sin mandar nada). Ver el 4404 mas abajo.
    conn.everValid = true;
    rememberedTries = 0;
    const data = JSON.parse(event.data);
    if (data.type) flushPendingTelemetry(); // los mensajes de control se procesan en orden con la telemetria que llego antes
    if (data.type === 'keybinds') { handleKeybindsMessage(data); return; } // no es telemetria
    if (data.type === 'live_players') { updateLivePlayers(data.players || []); return; } // no es telemetria
    if (data.type === 'command_result') { handleCommandResult(data); return; } // no es telemetria
    if (data.type && data.type.startsWith('convoy_')) { if (typeof convoyHandleMessage === 'function') convoyHandleMessage(data); return; } // Convoy (beta)
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
      if (data.mapMods !== undefined && JSON.stringify(data.mapMods) !== JSON.stringify(detectedMods)) {
        detectedMods = data.mapMods;
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
  if (map && map.getSource('route')) map.getSource('route').setData(emptyLineString());
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
const DEMO_ROUTE = { game: 'ats', from: 'Salt Lake City', to: 'Las Vegas', cargo: 'Bulldozer', cargoMassKg: 18189, truckBrand: 'Volvo', truckName: 'VNL', jobIncome: 61158 };
const DEMO_SPEED_MS = 26; // ~94 km/h
const DEMO_TIME_SCALE = 6; // 6x mas rapido que en tiempo real, para que pasen cosas
const DEMO_TICK_MS = 250; // misma tasa que el cliente 1.5+ por el relay (4 Hz)
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
  const speedNoise = () => DEMO_SPEED_MS * 3.6 + Math.sin(tick / 28) * 4;

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
    travelled += DEMO_SPEED_MS * DEMO_TIME_SCALE * (DEMO_TICK_MS / 1000);
    if (travelled >= total) travelled = 0; // vuelve a empezar
    const [x, z] = pointAt(travelled);
    const remainingKm = ((total - travelled) / 1000) * DEMO_DISTANCE_SCALE;
    fuel = Math.max(0.05, fuel - 0.00012 * DEMO_TIME_SCALE * (DEMO_TICK_MS / 1000));
    odometer += (DEMO_SPEED_MS * DEMO_TIME_SCALE * DEMO_DISTANCE_SCALE * (DEMO_TICK_MS / 1000)) / 1000;
    const speedKmh = speedNoise();
    handleTelemetry({
      ts: Date.now() / 1000,
      clientVersion: '9.9.9',
      paused: false,
      game: DEMO_ROUTE.game,
      position: { x, y: 0, z },
      speedKmh,
      speedLimitKmh: Math.floor(tick / 160) % 3 === 0 ? 88.5 : 104.6,
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
      engineRpm: 1250 + Math.sin(tick / 20) * 120,
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

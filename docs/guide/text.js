// Textos de la guia de uso (docs/guide/). EN es la referencia: lo que le
// falte a otro idioma se muestra en ingles. Los nombres de botones siguen
// los de la app (docs/app/i18n*.js) y del cliente (client/i18n.py) para que
// la guia diga lo mismo que la pantalla.
const GUIDE_TEXT = {};

GUIDE_TEXT.en = {
  title: 'User guide',
  lead: 'Everything Truck Dash can do, screen by screen. Truck Dash is a free GPS and dashboard for Euro Truck Simulator 2 and American Truck Simulator, on your phone, a tablet or a second monitor. No account needed.',
  openApp: 'Open the app',
  demo: 'Try the demo',
  toc: 'Contents',
  backTop: 'Back to top',
  privacy: 'Privacy',
  support: 'Support',
  h: {
    start: 'Getting started',
    status: 'The status chip',
    gps: 'The GPS',
    panel: 'The info panel',
    dash: 'The dashboard',
    buttons: 'The button box',
    settings: 'Settings and the top bar',
    convoy: 'Convoy (beta)',
    client: 'The client on your PC',
    overlay: 'The in-game overlay',
    account: 'Your account (optional)',
  },
  legend: { gps: 'Map buttons', settings: 'Top bar' },
  cap: {
    map: 'Landscape: the map with the route, the info panel and the button box.',
    phone: 'Navigation mode on a phone.',
    dash: 'The dashboard, full screen.',
    overlay: 'The overlay over ETS2: next turn, speed and limit, distance left, and arrival in real time and on the game clock.',
  },
  b: {
    start: `
<ol>
<li>Download the client from <a href="/">trucksim-dash.com</a> and run <code>TruckDash.exe</code> on the PC where you play. It lives in the system tray, next to the clock.</li>
<li>Right-click the tray icon, open <b>Setup &amp; status</b> and click <b>Install plugin</b> for your game. Restart the game if it was open.</li>
<li>On your phone, open <a href="/app/">trucksim-dash.com/app</a> and type the <b>pairing code</b> the client shows. The phone does not need to be on the same Wi-Fi.</li>
</ol>
<p>The code expires after 10 minutes if nobody uses it. Once connected, the session lasts until you quit the client.</p>
<h3>Same Wi-Fi: lowest latency</h3>
<p>Setup &amp; status also shows a local address and a QR code. Scan it with the phone and you are in: no pairing code, and it keeps working even if your internet drops. Windows asks once to let it through the firewall.</p>
<div class="tip"><p>Same Wi-Fi but the phone can't open it? Usually it's one of these: Windows has the network set to <b>Public</b> (set it to Private in Windows Settings, Network &amp; internet), the phone is on a <b>guest network</b> or the router isolates devices, or a <b>VPN</b> or ad-blocking app is on, on the PC or on the phone. The pairing code works in all of these cases.</p></div>
<div class="tip"><p>In your phone's browser use <b>Add to Home screen</b>: Truck Dash then opens full screen, like an app.</p></div>
<p>No game at hand? The <a href="/app/?demo=1">demo</a> plays a trip on the real ATS map.</p>`,
    status: `
<p>The chip at the top left of the app tells you what is going on at each step:</p>
<ul class="chips">
<li><span class="dot bad"></span><span><b>Client not running</b>: start TruckDash.exe on your PC, or check its tray icon.</span></li>
<li><span class="dot"></span><span><b>Waiting for the game</b>: the client is connected; open ETS2 or ATS.</span></li>
<li><span class="dot bad"></span><span><b>Plugin not installed</b>: the game is open but sends no data. Setup &amp; status, Install plugin, then restart the game.</span></li>
<li><span class="dot"></span><span><b>In the menu</b>: get in the truck and the data starts flowing.</span></li>
<li><span class="dot ok"></span><span><b>Live</b>: all good. It says <b>Paused</b> while the game is paused.</span></li>
<li><span class="dot bad"></span><span><b>Invalid or expired code</b>: get a fresh one from the tray icon, <b>Show pairing code</b>.</span></li>
</ul>`,
    gps: `
<p>The route to your job's destination is drawn <b>automatically</b> as soon as you take a job: quick jobs and freight market, including the car jobs from Road Trip: Ford (client 1.5.21 or newer). It follows your preference in Settings: fastest, like the game's GPS, or shortest.</p>
<p>The <b>route summary</b> at the bottom of the map shows distance left, time left and arrival time, with a progress bar. The arrow shrinks it to a thin progress bar (tap the bar to open it again), and the crossed-out route button clears the route from the map.</p>
<h3>Navigation mode</h3>
<p>The map turns with your heading, zooms in before turns and shows directions at the top, such as <i>Keep right onto I-15 toward Provo</i>. Choose how close it follows you in Settings. You can still pinch to zoom; the recenter button takes you back.</p>
<h3>Waypoints</h3>
<p>Tap the flag and then a spot on the map, up to 9 stops. The app asks whether you also set that point in the game's own GPS:</p>
<ul>
<li><b>Yes</b>: the game's ETA already counts the detour, so the app only draws the route through it.</li>
<li><b>No</b>: the app works out its own distance and time through it, shown as <i>via waypoint</i> under the ETAs.</li>
</ul>
<h3>Find nearby</h3>
<p>The magnifier looks for fuel stations, rest areas, service shops, garages, truck dealers and weigh stations around you, or any company or city. Tap a result and the route goes through it. <b>Nearest fuel station</b> is a single tap. In ATS, <b>Atlas</b> lists the Road Trip Tourist Boards and Points of Interest, which also show on the map.</p>
<h3>Also on the map</h3>
<ul>
<li>The <b>blue line</b> behind the truck is where you have driven.</li>
<li>With <b>Share my position</b> on, you see other Truck Dash drivers on your map and you appear on the public <a href="/live/">live map</a> as an anonymous driver, with your route drawn unless you untick <b>Also show my route on the live map</b>. You can turn it off in Settings.</li>
<li><b>Map mods</b> have their own maps: ProMods, Coast to Coast, ProMods Canada, Western/Eastern Canada Expansion, Reforma, RusMap, Roextended, Grand Utopia and TruckersMP. The app detects them from the game, or you pick one with the puzzle button.</li>
<li><b>DLCs</b> (in Settings): uncheck the map DLCs you do not own and routes avoid their roads. If there is no way around one, the route uses it anyway and says so. With the client 1.5.28 or newer they are read from your game on their own.</li>
</ul>
<p>Every map button can be moved and resized: long-press one on a phone, or use <b>Move the buttons</b> in Settings.</p>`,
    panel: `
<p>Next to the map in landscape, below it on a phone held upright (swipe sideways for more pages).</p>
<h3>Data tab</h3>
<ul>
<li>Speed, speed limit, road number and cruise control speed.</li>
<li>Fuel, range and average consumption, measured from your own driving once you have done 15 km (the game's own figure until then).</li>
<li><b>Trip</b>: origin and destination, cargo, in-game ETA, <b>real ETA</b> in real-world minutes, next city, game time, job deadline, next rest stop with your fatigue and job pay. The pay can also be shown in your own currency.</li>
<li><b>Truck</b>: model, odometer, wear of each part, and alerts such as low air pressure, high water or oil temperature and low battery voltage.</li>
<li><b>Session</b>: tolls paid, fines and ferry or train trips, with a Reset button.</li>
</ul>
<h3>Gauges tab</h3>
<p>Speedometer, tachometer with the gear, fuel bar, odometer and range.</p>
<h3>Mini-HUD</h3>
<p>Hide the panel with the three lines button and the map takes the whole screen; your speed and the limit stay in a corner. In Settings you choose what else the mini-HUD shows: fuel, range, ETA, distance left, next rest stop with fatigue, cruise control and GPS directions.</p>`,
    dash: `
<p>The gauge button in the top bar opens a full screen instrument panel:</p>
<ul>
<li>A route bar that marks where you will need to rest.</li>
<li>Early or late against the job deadline, and pay per km.</li>
<li>Whether your fuel reaches the destination, and AdBlue.</li>
<li>Damage of every part of the truck and the trailer, and cargo damage.</li>
<li>Oil, water and brake temperatures, air and oil pressure, battery voltage.</li>
<li>Warning lights: headlights, blinkers, hazards, beacon, wipers, engine brake, retarder, differential lock, parking brake, lift axle and trailer.</li>
<li>Session totals: distance driven, time at the wheel, average and top speed, fuel used and net income.</li>
</ul>
<p>S, M and L change the size; the X goes back to the map.</p>
<h3>On a second screen</h3>
<p>Open <a href="/dash/">trucksim-dash.com/dash</a> on another device (a tablet, an old phone, a second monitor) and type the same pairing code. The GPS and the dashboard can run at the same time. Settings has a <b>Copy the panel link</b> button.</p>`,
    buttons: `
<p>The gamepad button on the map opens a row of truck controls. Tap one and the client on your PC presses the key in the game for you.</p>`,
    settings: `
<p>The gear button opens Settings:</p>
<ul>
<li><b>Units</b> (km or miles) and <b>language</b>: English, Español, Deutsch, Français, Português, Polski, Türkçe, Русский.</li>
<li><b>Mini-HUD</b>: what to show when the info panel is hidden.</li>
<li><b>Other players nearby</b>: share your position, or hide other drivers' markers.</li>
<li><b>Map buttons</b>: dark style to match the map, fade them while driving (they come back on touch), and <b>Move the buttons</b>: drag any button or panel, drag its corner to resize it, with a grid and a Reset.</li>
<li><b>Real base map</b>: coastline, lakes, rivers and built-up areas under the roads (about 1 MB more).</li>
<li><b>Lite mode</b> for old phones and tablets: lighter rendering, and optionally no routing at all to save the most memory.</li>
<li><b>Route preference</b>: fastest or shortest.</li>
<li><b>Job pay in your currency</b>, next to the game's € or $.</li>
<li><b>Route line color</b>: red, blue or green.</li>
<li><b>Map zoom in navigation mode</b>.</li>
<li><b>Voice guidance</b>: in navigation mode, says each turn ahead of time and again at the turn, plus arrival, without road names. Two voices in English and Spanish; Turkish uses your device's voice. At roundabouts it tells you which exit to take.</li>
<li><b>Remap keys</b> for the button box.</li>
<li><b>Dashboard on another device</b>: copy its link.</li>
<li><b>Trip history</b>: your deliveries, saved only on this device.</li>
<li><b>Report a problem</b>, the roadmap and the changelog.</li>
</ul>
<p>On a narrow phone some of the top bar buttons move into Settings.</p>
<div class="tip"><p>Every delivery is also posted in the <b>#jobs</b> channel of our <a href="https://discord.gg/K7Xq4628tg" target="_blank" rel="noopener">Discord</a>: route, truck, cargo, distance and pay, with no name or account attached.</p></div>`,
    convoy: `
<p>Drive with friends and see each other on the map. Each one runs their own game and client: you do not need to be in the same multiplayer session.</p>
<ul>
<li>Open the convoy button in the top bar, pick a nickname and <b>Create convoy</b>, or type a friend's 6 character code and <b>Join</b>. <b>Copy link</b> to paste it in Discord.</li>
<li>Members show up on the map and in a row of cards: how far they are from you, their trip, and their pay if they choose to share it.</li>
<li><b>Follow leader</b>, and <b>Show route</b> to see where a member is going.</li>
<li><b>Quick messages</b> from the map: All good, Stop at next rest area, Need fuel, Falling behind, Wait for me, Let's go.</li>
<li>Friends without the game can open the link and watch.</li>
<li>If you want, a summary is posted in the Truck Dash Discord when the convoy ends. Nothing is stored after that.</li>
</ul>
<p>Convoy needs the internet link (trucksim-dash.com/app with your pairing code), not the same Wi-Fi address.</p>`,
    client: `
<p>Right-click the tray icon, next to the clock:</p>
<ul>
<li><b>Setup &amp; status</b>: the pairing code, the same Wi-Fi address with its QR, the plugin for each game (Steam installs are found on their own; <b>Add game folder</b> for the rest) and the options.</li>
<li><b>Options</b>: start with Windows (it opens the dashboard when the game starts), show your trip on your Discord profile, close Truck Dash when the game closes, and open the dashboard in your browser when it starts. The client's language is there too (it follows Windows unless you pick one).</li>
<li><b>Show pairing code</b>, and <b>Disconnect</b>, which gives you a new code.</li>
<li><b>Check for updates</b>. The client and the app also let you know when a new version is out.</li>
<li><b>Show log file</b> and <b>Report a problem</b>.</li>
</ul>
<div class="tip"><p>Something not working? Ask in our <a href="https://discord.gg/K7Xq4628tg" target="_blank" rel="noopener">Discord</a> and attach the log file: most problems are solved in a couple of messages.</p></div>`,
    overlay: `
<p>A small panel the client draws over the game, so you see the essentials without looking away from the road. Windows only (not under Linux with Proton), with the game in a window or in borderless fullscreen.</p>
<ul>
<li><b>Speed and speed limit</b>, straight from the game. The limit blinks when you go over it.</li>
<li><b>Next turn and next city</b>, <b>distance left</b> and <b>arrival</b> in real time. These come from the dashboard, so keep it open with a route (on your phone, a tablet or this PC). Without it, the distance left comes from the game's own GPS.</li>
<li><b>Arrival on the game clock</b>, to check against your job's deadline. This one works without the dashboard.</li>
</ul>
<h3>Turning it on</h3>
<p>In <b>Setup &amp; status</b>, section <b>In-game overlay</b>, or from the tray menu. In the game, <b>Ctrl+Shift+O</b> shows and hides it (you can pick another shortcut, or none).</p>
<p>The same section sets its <b>position</b> (a corner, or <b>Move</b> to drag it anywhere with the mouse and then <b>Done</b>), its <b>size</b> and <b>what it shows</b>. Its texts follow the dashboard's language.</p>
<div class="tip"><p>It never takes focus from the game and clicks go right through it. It hides when you leave the game or pause. With voice guidance on in the dashboard's Settings, the dashboard also speaks the turns while the overlay is on.</p></div>`,
    account: `
<p>An account keeps your driving history: every job you drive, with its route on a map. It is optional and free, and everything else in Truck Dash works the same without one.</p>
<ol>
<li>Sign in at <a href="/account/">trucksim-dash.com/account</a> with Discord, Google, or an email and a password. With email we send you a 6-digit code to confirm the address.</li>
<li>In the client, open <b>Setup &amp; status</b> and click <b>Link account</b>. A page opens in your browser: confirm, and the client is linked.</li>
</ol>
<p>From then on every job is saved when you deliver or cancel it: the route colored by speed, the distance (the game's and what we tracked), pay, fuel, tolls, fines, damage, driving time and hours asleep, on time or late, and the countries or states you drove through. Your account has the logbook (with CSV export), stats for each game, records and achievements. <b>My account</b> in the tray menu takes you there.</p>
<h3>Good to know</h3>
<ul>
<li>Nothing is saved until you link the client. Your profile is private unless you make it public in <b>Settings</b>.</li>
<li>In <b>Following</b> you can follow other drivers by their username. Following needs their approval, and people you accept see your trips with their routes, where you are while you drive and your achievements, even if your profile is private. Your notes stay yours.</li>
<li>If you deliver a job with Truck Dash closed, we cannot see the delivery and the trip shows as <b>unfinished</b>. You can mark it as cancelled, but only the game can report a delivery.</li>
<li>No internet for a while? Nothing is lost: the client keeps the trip and sends it when you are back online.</li>
<li>Jobs with a money mod are marked and left out of your money totals.</li>
<li>In <b>Settings</b> you can download all your data or delete your account.</li>
</ul>`,
  },
  b2: {
    buttons: `
<p>A button turns <b>blue</b> when that thing is on in your truck (engine running, lights on, trailer attached, cruise control set), so the row doubles as a status panel.</p>
<h3>Your keys</h3>
<p>The buttons come with preset keys. If you changed the controls in the game, match them in Settings, <b>Remap keys</b>. Leave a key empty to turn that button off.</p>
<h3>Custom buttons</h3>
<p><b>Add button</b> makes up to 3 of your own: give it a label and press the key (Ctrl, Shift and Alt combinations work, as well as F1 to F24 and the numpad). Then bind the same key to anything in the game's controls: differential lock, retarder, horn, the radio, whatever you like.</p>
<div class="tip"><p>On a phone held upright the button box is one more page of the info panel: swipe to it. The client has to be running with the game open; in the demo the buttons do nothing.</p></div>`,
  },
  ic: {
    recenterBtn: ['Recenter', 'Back to your truck, and to your navigation zoom.'],
    fullscreenBtn: ['Fullscreen', 'Hides the header and the phone bars.'],
    navToggleBtn: ['Navigation mode', 'The map turns with you, zooms in on turns and shows directions.'],
    tilt3dBtn: ['3D view', 'Tilted view, in navigation mode.'],
    waypointBtn: ['Waypoint', 'Tap it, then tap the map. Up to 9.'],
    pipBtn: ["Floating window", "Chrome and Edge on PC: a small window with the next turn, speed and arrival that stays on top of the game (borderless fullscreen)."],
    commandsToggleBtn: ['Button box', 'Truck controls: lights, engine, hazards and more.'],
    convoyMsgBtn: ['Convoy message', 'Quick messages, while you are in a convoy.'],
    panelToggleBtn: ['Info panel', 'Shows or hides it; hidden, the mini-HUD takes over.'],
    poiBtn: ['Find nearby', 'Fuel, rest areas, service, companies and more.'],
    dashBtn: ['Dashboard', 'Full screen instrument panel.'],
    settingsBtn: ['Settings', 'Everything in the list above.'],
    helpBtn: ['Quick tour', 'Replays the guided tour of the screen.'],
    unitToggle: ['Units', 'Kilometres or miles.'],
    langSelect: ['Language', 'Eight languages.'],
    modsBtn: ['Map mods', 'Detected from the game, or picked by hand.'],
    convoyBtn: ['Convoy', 'Drive with friends.'],
    discordBtn: ['Discord', 'Our community: help, ideas and #jobs.'],
  },
  cmd: {
    cmdHazards: 'Hazards', cmdBeacon: 'Beacon', cmdHandbrake: 'Handbrake', cmdEngine: 'Engine',
    cmdTrailer: 'Trailer', cmdCamera: 'Camera', cmdCruise: 'Cruise', cmdLights: 'Lights',
    cmdHighBeam: 'High beams', cmdInfotainment: 'Infotainment', cmdLiftAxle: 'Lift axle', cmdWipers: 'Wipers',
    add: 'Add button',
  },
};

GUIDE_TEXT.es = {
  title: 'Guía de uso',
  lead: 'Todo lo que hace Truck Dash, pantalla por pantalla. Truck Dash es un GPS y tablero gratis para Euro Truck Simulator 2 y American Truck Simulator, en el celular, una tablet o un segundo monitor. Sin cuenta obligatoria.',
  openApp: 'Abrir la app',
  demo: 'Probar la demo',
  toc: 'Contenido',
  backTop: 'Volver arriba',
  privacy: 'Privacidad',
  support: 'Apoyar',
  h: {
    start: 'Primeros pasos',
    status: 'El indicador de estado',
    gps: 'El GPS',
    panel: 'El panel de info',
    dash: 'El tablero',
    buttons: 'La botonera',
    settings: 'Configuración y la barra de arriba',
    convoy: 'Convoy (beta)',
    client: 'El cliente de la PC',
    overlay: 'El overlay en el juego',
    account: 'Tu cuenta (opcional)',
  },
  legend: { gps: 'Botones del mapa', settings: 'Barra de arriba' },
  cap: {
    map: 'Apaisado: el mapa con la ruta, el panel de info y la botonera.',
    phone: 'Modo navegación en un celular.',
    dash: 'El tablero, a pantalla completa.',
    overlay: 'El overlay sobre ETS2: próximo giro, velocidad y límite, lo que falta, y la llegada en hora real y en el reloj del juego.',
  },
  b: {
    start: `
<ol>
<li>Bajá el cliente de <a href="/">trucksim-dash.com</a> y abrí <code>TruckDash.exe</code> en la PC donde jugás. Queda en la bandeja del sistema, al lado del reloj.</li>
<li>Clic derecho en el ícono de la bandeja, <b>Configuración y estado</b>, y tocá <b>Instalar plugin</b> para tu juego. Si el juego estaba abierto, reinicialo.</li>
<li>En el celular, abrí <a href="/app/">trucksim-dash.com/app</a> y escribí el <b>código de pairing</b> que muestra el cliente. No hace falta que el celular esté en la misma WiFi.</li>
</ol>
<p>El código vence a los 10 minutos si nadie lo usa. Una vez conectado, la sesión dura hasta que cerrás el cliente.</p>
<h3>Misma WiFi: la menor latencia</h3>
<p>Configuración y estado también muestra una dirección local y un código QR. Escanealo con el celular y listo: sin código, y sigue andando aunque se corte internet. Windows pregunta una vez si lo deja pasar por el firewall.</p>
<div class="tip"><p>¿Misma WiFi y el celular no lo abre? Casi siempre es una de estas: Windows tiene la red como <b>Pública</b> (cambiala a Privada en Configuración de Windows, Red e Internet), el celular está en una <b>red de invitados</b> o el router aísla los dispositivos, o hay una <b>VPN</b> o una app que bloquea publicidad prendida, en la PC o en el celular. El código de pairing anda en todos estos casos.</p></div>
<div class="tip"><p>En el navegador del celular usá <b>Agregar a la pantalla de inicio</b>: Truck Dash se abre a pantalla completa, como una app.</p></div>
<p>¿No tenés el juego a mano? La <a href="/app/?demo=1">demo</a> hace un viaje sobre el mapa real de ATS.</p>`,
    status: `
<p>El indicador arriba a la izquierda de la app dice qué está pasando en cada paso:</p>
<ul class="chips">
<li><span class="dot bad"></span><span><b>Cliente no conectado</b>: abrí TruckDash.exe en la PC, o mirá su ícono en la bandeja.</span></li>
<li><span class="dot"></span><span><b>Esperando el juego</b>: el cliente está conectado; abrí ETS2 o ATS.</span></li>
<li><span class="dot bad"></span><span><b>Plugin sin instalar</b>: el juego está abierto pero no manda datos. Configuración y estado, Instalar plugin, y reiniciá el juego.</span></li>
<li><span class="dot"></span><span><b>En el menú</b>: subite al camión y empiezan a llegar los datos.</span></li>
<li><span class="dot ok"></span><span><b>En vivo</b>: todo bien. Dice <b>Pausado</b> mientras el juego está pausado.</span></li>
<li><span class="dot bad"></span><span><b>Código inválido o vencido</b>: pedí uno nuevo desde el ícono de la bandeja, <b>Ver código de pairing</b>.</span></li>
</ul>`,
    gps: `
<p>La ruta al destino del trabajo se dibuja <b>sola</b> apenas tomás un trabajo: trabajos rápidos y mercado de cargas, incluidos los trabajos con auto de Road Trip: Ford (cliente 1.5.21 o más nuevo). Sigue tu preferencia de Configuración: la más rápida, como el GPS del juego, o la más corta.</p>
<p>El <b>resumen de la ruta</b>, abajo del mapa, muestra lo que falta, el tiempo restante y la hora de llegada, con una barra de progreso. La flecha lo achica a una barrita de progreso (tocala para abrirlo de nuevo), y el botón de la ruta tachada borra la ruta del mapa.</p>
<h3>Modo navegación</h3>
<p>El mapa gira con tu rumbo, se acerca antes de las curvas y muestra las indicaciones arriba, por ejemplo <i>Mantenete a la derecha por I-15 hacia Provo</i>. En Configuración elegís qué tan cerca te sigue. Igual podés hacer zoom con los dedos; el botón de centrar te devuelve.</p>
<h3>Waypoints</h3>
<p>Tocá la bandera y después un lugar del mapa, hasta 9 paradas. La app pregunta si también marcaste ese punto en el GPS del juego:</p>
<ul>
<li><b>Sí</b>: el ETA del juego ya cuenta el desvío, así que la app solo dibuja la ruta por ahí.</li>
<li><b>No</b>: la app calcula su propia distancia y tiempo pasando por ese punto, y los muestra como <i>por el waypoint</i> debajo de los ETA.</li>
</ul>
<h3>Buscar cerca</h3>
<p>La lupa busca estaciones de servicio, áreas de descanso, talleres, garajes, concesionarios y balanzas cerca tuyo, o cualquier empresa o ciudad. Tocá un resultado y la ruta pasa por ahí. <b>Estación de servicio más cercana</b> es un solo toque. En ATS, <b>Atlas</b> muestra los carteles turísticos y puntos de interés del Road Trip, que también se ven en el mapa.</p>
<h3>También en el mapa</h3>
<ul>
<li>La <b>línea azul</b> detrás del camión es por donde anduviste.</li>
<li>Con <b>Compartir mi posición</b> prendido ves a otros conductores de Truck Dash en tu mapa y aparecés en el <a href="/live/">mapa en vivo</a> público como un conductor anónimo, con tu ruta dibujada salvo que destildes <b>Mostrar también mi ruta en el mapa en vivo</b>. Se apaga en Configuración.</li>
<li>Los <b>mods de mapa</b> tienen su propio mapa: ProMods, Coast to Coast, ProMods Canada, Western/Eastern Canada Expansion, Reforma, RusMap, Roextended, Grand Utopia y TruckersMP. La app los detecta desde el juego, o elegís uno con el botón del rompecabezas.</li>
<li><b>DLC</b> (en Ajustes): destildá los DLC de mapa que no tenés y las rutas evitan sus caminos. Si no hay forma de rodear uno, la ruta lo usa igual y te avisa. Con el cliente 1.5.28 o más nuevo se leen solos de tu juego.</li>
</ul>
<p>Todos los botones del mapa se pueden mover y agrandar: dejá apretado uno en el celular, o usá <b>Mover los botones</b> en Configuración.</p>`,
    panel: `
<p>Al lado del mapa en apaisado, debajo en un celular vertical (deslizá de costado para ver más páginas).</p>
<h3>Pestaña Datos</h3>
<ul>
<li>Velocidad, límite, número de ruta y velocidad del control de crucero.</li>
<li>Combustible, autonomía y consumo promedio, medido con tu manejo una vez que hiciste 15 km (hasta ahí, el dato del juego).</li>
<li><b>Viaje</b>: origen y destino, carga, ETA del juego, <b>ETA real</b> en minutos de verdad, próxima ciudad, hora del juego, plazo del trabajo, próximo descanso con tu fatiga y paga. La paga también se puede ver en tu moneda.</li>
<li><b>Camión</b>: modelo, odómetro, desgaste de cada parte y alertas como poca presión de aire, agua o aceite muy calientes y batería baja.</li>
<li><b>Sesión</b>: peajes, multas y viajes en ferry o tren, con un botón para reiniciar.</li>
</ul>
<h3>Pestaña Relojes</h3>
<p>Velocímetro, cuentavueltas con la marcha, barra de combustible, odómetro y autonomía.</p>
<h3>Mini-HUD</h3>
<p>Ocultá el panel con el botón de las tres rayas y el mapa ocupa toda la pantalla; la velocidad y el límite quedan en un rincón. En Configuración elegís qué más muestra el mini-HUD: combustible, autonomía, ETA, distancia restante, próximo descanso con la fatiga, control de crucero e indicaciones del GPS.</p>`,
    dash: `
<p>El botón del velocímetro en la barra de arriba abre un tablero a pantalla completa:</p>
<ul>
<li>Una barra de la ruta que marca dónde vas a tener que descansar.</li>
<li>Si llegás antes o tarde respecto del plazo, y la paga por km.</li>
<li>Si el combustible te alcanza hasta el destino, y el AdBlue.</li>
<li>El daño de cada parte del camión y del remolque, y el de la carga.</li>
<li>Temperatura de aceite, agua y frenos, presión de aire y de aceite, tensión de la batería.</li>
<li>Testigos: luces, giros, balizas, baliza giratoria, limpiaparabrisas, freno motor, retardador, bloqueo del diferencial, freno de mano, eje elevable y remolque.</li>
<li>Totales de la sesión: distancia manejada, tiempo al volante, velocidad promedio y máxima, combustible gastado e ingreso neto.</li>
</ul>
<p>S, M y L cambian el tamaño; la X vuelve al mapa.</p>
<h3>En una segunda pantalla</h3>
<p>Abrí <a href="/dash/">trucksim-dash.com/dash</a> en otro dispositivo (una tablet, un celular viejo, un segundo monitor) y escribí el mismo código. El GPS y el tablero pueden andar a la vez. En Configuración está el botón <b>Copiar el link del panel</b>.</p>`,
    buttons: `
<p>El botón del joystick en el mapa abre una fila de controles del camión. Tocás uno y el cliente de la PC aprieta la tecla en el juego por vos.</p>`,
    settings: `
<p>El engranaje abre la Configuración:</p>
<ul>
<li><b>Unidades</b> (km o millas) e <b>idioma</b>: English, Español, Deutsch, Français, Português, Polski, Türkçe, Русский.</li>
<li><b>Mini-HUD</b>: qué mostrar cuando el panel de info está oculto.</li>
<li><b>Otros jugadores cerca</b>: compartir tu posición, u ocultar los marcadores de los demás.</li>
<li><b>Botones del mapa</b>: estilo oscuro para que combinen con el mapa, atenuarlos al manejar (vuelven al tocar la pantalla), y <b>Mover los botones</b>: arrastrá cualquier botón o panel, y su esquina para cambiarle el tamaño, con grilla y un Restablecer.</li>
<li><b>Mapa base real</b>: costa, lagos, ríos y zonas urbanas debajo de las rutas (alrededor de 1 MB más).</li>
<li><b>Modo liviano</b> para celulares y tablets viejos: dibujo más liviano y, si hace falta, sin cálculo de ruta, para ahorrar la mayor cantidad de memoria.</li>
<li><b>Preferencia de ruta</b>: la más rápida o la más corta.</li>
<li><b>Pago del trabajo en tu moneda</b>, al lado de los € o $ del juego.</li>
<li><b>Color de la línea de ruta</b>: rojo, azul o verde.</li>
<li><b>Zoom del mapa en modo navegación</b>.</li>
<li><b>Guía por voz</b>: en modo navegación, avisa cada giro con anticipación y otra vez en el giro, y la llegada, sin nombres de rutas. Dos voces en inglés y en español; en turco usa la voz de tu dispositivo. En las rotondas te dice qué salida tomar.</li>
<li><b>Remapear teclas</b> de la botonera.</li>
<li><b>Tablero en otro dispositivo</b>: copiar el link.</li>
<li><b>Historial de viajes</b>: tus entregas, guardadas solo en ese dispositivo.</li>
<li><b>Reportar un problema</b>, lo que viene y los cambios de cada versión.</li>
</ul>
<p>En un celular angosto, algunos botones de la barra de arriba pasan a Configuración.</p>
<div class="tip"><p>Cada entrega también se publica en el canal <b>#jobs</b> de nuestro <a href="https://discord.gg/K7Xq4628tg" target="_blank" rel="noopener">Discord</a>: ruta, camión, carga, distancia y paga, sin nombre ni cuenta.</p></div>`,
    convoy: `
<p>Manejá con amigos y véanse en el mapa. Cada uno usa su propio juego y su cliente: no hace falta estar en la misma sesión multijugador.</p>
<ul>
<li>Abrí el botón de convoy en la barra de arriba, elegí un apodo y tocá <b>Crear convoy</b>, o escribí el código de 6 caracteres de un amigo y tocá <b>Unirse</b>. <b>Copiar link</b> para pegarlo en Discord.</li>
<li>Los integrantes aparecen en el mapa y en una fila de tarjetas: a qué distancia están, su viaje y su paga, si eligen compartirla.</li>
<li><b>Seguir al líder</b>, y <b>Ver ruta</b> para saber a dónde va cada uno.</li>
<li><b>Mensajes rápidos</b> desde el mapa: Todo bien, Parada en la próxima área, Necesito combustible, Me quedo atrás, Espérenme, Vamos.</li>
<li>Los amigos sin el juego pueden abrir el link y mirar.</li>
<li>Si querés, al terminar el convoy se publica un resumen en el Discord de Truck Dash. Después de eso no se guarda nada.</li>
</ul>
<p>El convoy necesita la conexión por internet (trucksim-dash.com/app con tu código), no la dirección de la misma WiFi.</p>`,
    client: `
<p>Clic derecho en el ícono de la bandeja, al lado del reloj:</p>
<ul>
<li><b>Configuración y estado</b>: el código, la dirección para la misma WiFi con su QR, el plugin de cada juego (las instalaciones de Steam las encuentra solo; <b>Agregar carpeta del juego</b> para las demás) y las opciones.</li>
<li><b>Opciones</b>: iniciar con Windows (abre el tablero cuando arranca el juego), mostrar tu viaje en tu perfil de Discord, cerrar Truck Dash cuando se cierra el juego y abrir el tablero en el navegador al arrancar. Ahí también está el idioma del cliente (sigue al de Windows salvo que elijas otro).</li>
<li><b>Ver código de pairing</b>, y <b>Desconectar</b>, que te da un código nuevo.</li>
<li><b>Buscar actualizaciones</b>. El cliente y la app también avisan cuando sale una versión nueva.</li>
<li><b>Ver archivo de log</b> y <b>Reportar un problema</b>.</li>
</ul>
<div class="tip"><p>¿Algo no anda? Preguntá en nuestro <a href="https://discord.gg/K7Xq4628tg" target="_blank" rel="noopener">Discord</a> y adjuntá el archivo de log: la mayoría de los problemas se resuelven en un par de mensajes.</p></div>`,
    overlay: `
<p>Un recuadro que el cliente dibuja sobre el juego, para ver lo importante sin sacar la vista de la ruta. Solo en Windows (no en Linux con Proton), con el juego en ventana o en pantalla completa sin bordes.</p>
<ul>
<li><b>Velocidad y límite</b>, directo del juego. El límite titila si te pasás.</li>
<li><b>Próximo giro y próxima ciudad</b>, <b>lo que falta</b> y la <b>llegada</b> en hora real. Salen del tablero, así que tenelo abierto con una ruta (en el celular, una tablet o esta PC). Sin el tablero, lo que falta sale del GPS del propio juego.</li>
<li><b>Llegada en el reloj del juego</b>, para compararla con el plazo del trabajo. Esta anda sin el tablero.</li>
</ul>
<h3>Cómo prenderlo</h3>
<p>En <b>Configuración y estado</b>, sección <b>Overlay en el juego</b>, o desde el menú de la bandeja. En el juego, <b>Ctrl+Shift+O</b> lo muestra y lo esconde (podés elegir otro atajo, o ninguno).</p>
<p>En la misma sección elegís la <b>posición</b> (una esquina, o <b>Mover</b> para arrastrarlo con el mouse adonde quieras y después <b>Listo</b>), el <b>tamaño</b> y <b>qué muestra</b>. Sus textos siguen el idioma del tablero.</p>
<div class="tip"><p>Nunca le saca el foco al juego y los clics pasan a través. Se esconde cuando salís del juego o lo pausás. Con la guía por voz prendida en Ajustes del tablero, el tablero también dice los giros mientras el overlay está prendido.</p></div>`,
    account: `
<p>Una cuenta guarda tu historial de manejo: cada trabajo que hacés, con su recorrido en un mapa. Es opcional y gratis, y todo lo demás de Truck Dash funciona igual sin ella.</p>
<ol>
<li>Entrá en <a href="/account/">trucksim-dash.com/account</a> con Discord, Google, o un mail y una contraseña. Con mail te mandamos un código de 6 cifras para confirmarlo.</li>
<li>En el cliente, abrí <b>Configuración y estado</b> y tocá <b>Vincular cuenta</b>. Se abre una página en el navegador: confirmá, y el cliente queda vinculado.</li>
</ol>
<p>Desde ahí, cada trabajo se guarda cuando lo entregás o lo cancelás: el recorrido con colores por velocidad, la distancia (la del juego y la que medimos), la plata, el combustible, los peajes, las multas, el daño, el tiempo al volante y las horas de sueño, si llegaste a tiempo o tarde, y los países o estados por los que pasaste. En tu cuenta tenés el logbook (con exportación a CSV), estadísticas por juego, récords y logros. <b>Mi cuenta</b>, en el menú de la bandeja, te lleva ahí.</p>
<h3>Para tener en cuenta</h3>
<ul>
<li>No se guarda nada hasta que vinculás el cliente. Tu perfil es privado, salvo que lo hagas público en <b>Ajustes</b>.</li>
<li>En <b>Siguiendo</b> podés seguir a otros conductores por su nombre de usuario. Hay que esperar que acepten, y quienes vos aceptes ven tus viajes con su recorrido, dónde estás mientras manejás y tus logros, aunque tu perfil sea privado. Tus notas siguen siendo tuyas.</li>
<li>Si entregás un trabajo con Truck Dash cerrado, no vemos la entrega y el viaje figura <b>sin terminar</b>. Lo podés marcar como cancelado, pero una entrega solo la puede informar el juego.</li>
<li>¿Te quedaste sin internet un rato? No se pierde nada: el cliente guarda el viaje y lo manda cuando vuelve la conexión.</li>
<li>Los trabajos con un mod de dinero quedan marcados y afuera de los totales de plata.</li>
<li>En <b>Ajustes</b> podés bajar todos tus datos o borrar la cuenta.</li>
</ul>`,
  },
  b2: {
    buttons: `
<p>Un botón se pone <b>azul</b> cuando eso está prendido en tu camión (motor en marcha, luces, remolque enganchado, control de crucero puesto), así que la fila también sirve de panel de estado.</p>
<h3>Tus teclas</h3>
<p>Los botones vienen con teclas ya puestas. Si cambiaste los controles en el juego, igualalos en Configuración, <b>Remapear teclas</b>. Dejá una tecla vacía para apagar ese botón.</p>
<h3>Botones propios</h3>
<p><b>Agregar botón</b> crea hasta 3 tuyos: poné un nombre y apretá la tecla (andan las combinaciones con Ctrl, Shift y Alt, de F1 a F24 y el teclado numérico). Después asigná esa misma tecla a lo que quieras en los controles del juego: bloqueo del diferencial, retardador, bocina, la radio, lo que se te ocurra.</p>
<div class="tip"><p>En un celular vertical la botonera es una página más del panel de info: deslizá hasta ella. El cliente tiene que estar abierto con el juego andando; en la demo los botones no hacen nada.</p></div>`,
  },
  ic: {
    recenterBtn: ['Centrar', 'Vuelve a tu camión y a tu zoom de navegación.'],
    fullscreenBtn: ['Pantalla completa', 'Oculta la barra de arriba y las del celular.'],
    navToggleBtn: ['Modo navegación', 'El mapa gira con vos, se acerca en las curvas y da indicaciones.'],
    tilt3dBtn: ['Vista 3D', 'Vista inclinada, en modo navegación.'],
    waypointBtn: ['Waypoint', 'Tocalo y después tocá el mapa. Hasta 9.'],
    pipBtn: ["Ventana flotante", "Chrome y Edge en la PC: una ventanita con el próximo giro, la velocidad y la llegada que queda arriba del juego (pantalla completa sin bordes)."],
    commandsToggleBtn: ['Botonera', 'Controles del camión: luces, motor, balizas y más.'],
    convoyMsgBtn: ['Mensaje al convoy', 'Mensajes rápidos, mientras estás en un convoy.'],
    panelToggleBtn: ['Panel de info', 'Lo muestra u oculta; oculto, queda el mini-HUD.'],
    poiBtn: ['Buscar cerca', 'Combustible, descansos, talleres, empresas y más.'],
    dashBtn: ['Tablero', 'Tablero a pantalla completa.'],
    settingsBtn: ['Configuración', 'Todo lo de la lista de arriba.'],
    helpBtn: ['Tour rápido', 'Repite el tour guiado por la pantalla.'],
    unitToggle: ['Unidades', 'Kilómetros o millas.'],
    langSelect: ['Idioma', 'Ocho idiomas.'],
    modsBtn: ['Mods de mapa', 'Detectados desde el juego, o elegidos a mano.'],
    convoyBtn: ['Convoy', 'Manejar con amigos.'],
    discordBtn: ['Discord', 'La comunidad: ayuda, ideas y #jobs.'],
  },
  cmd: {
    cmdHazards: 'Balizas', cmdBeacon: 'Beacon', cmdHandbrake: 'Freno de mano', cmdEngine: 'Motor',
    cmdTrailer: 'Trailer', cmdCamera: 'Cámara', cmdCruise: 'Crucero', cmdLights: 'Luces',
    cmdHighBeam: 'Luces altas', cmdInfotainment: 'Infotainment', cmdLiftAxle: 'Eje elevable', cmdWipers: 'Limpiaparabrisas',
    add: 'Agregar botón',
  },
};

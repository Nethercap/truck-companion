# Truck Dash: reglas para cambiar el codigo

Cliente Python (`client/`, TruckDash.exe) que lee la telemetria del plugin y
la manda al relay (`backend/main.py`, Railway, se despliega solo desde main)
y al servidor LAN (`client/local_server.py`). La web (`docs/`) es GitHub Pages.
Los comentarios y los tests van en castellano, como el resto del codigo.

## Antes de dar algo por terminado

- Web: `node --test docs/app/test_pure.js`, `python tools/check_pois.py`,
  `python tools/build_variants_js.py --check`, `node --check` del .js tocado.
  Relay: `python -m pytest backend/test_main.py`. Cliente: `python -m pytest client/`.
- Tests del relay con websockets: siempre con el fixture `client` (un solo
  event loop para todas las conexiones). Un `TestClient` suelto corre cada
  conexion en su propio thread y los tests se cuelgan a veces en CI.
- Todo cambio en `docs/` sube `CACHE_NAME` en `docs/app/sw.js` y el `?v=`
  de `docs/{app,account,dash,overlay}/index.html` y del APP_SHELL (mismo token en todos).
- La logica de decision va en `docs/app/pure.js` con su test, no suelta en
  app.js: la mayoria de los bugs del 10-10 estaban en app.js, donde no hay tests.
- Cambios de cliente: anotarlos en CHANGELOG.md (seccion de la proxima
  version) y no publicar release sin que lo pida el maintainer. Web y relay
  salen apenas pasa CI.
- La guia (`docs/guide/`) tiene su propio `?v=` en `docs/guide/index.html`:
  subirlo al tocar `text.js`, `text_extra.js` o `guide.css`. Las 8 lenguas
  llevan las mismas secciones (`test_guide.js`).

## Datos de mapa y R2

- El grafo de una variante son cinco archivos: `.bin` (v2, web vieja),
  `-v3.bin`, `-lanes.bin` (carriles por arista, `decodeLanesBin`),
  `-times.bin` (decimas de segundo por arista, `decodeTimesBin`) y
  `-prefabs.bin` (de que prefab es cada arista, `decodePrefabsBin`, desde el
  22-10; los de antes no lo tienen). Si se regenera el grafo, se regeneran y
  suben los cinco juntos (`rebuild_graphs_only.py` del taller) y se sube
  `ROUTE_GRAPH_V3_REV` en `app.js` (6 desde el 22-10, con `ROUTE_PREFABS_REV`
  en 1): un grafo del constructor de hoy sin su `-prefabs.bin` deja otra vez
  la vuelta de Kiel (ver el ruteo). Los prefabs sin navCurves que lista el
  log del constructor (unidos todos contra todos, sin contramano) son
  patios, estaciones y talleres de dos nodos, y 15 `cross_temp` de ProMods.
  Antes de subir un grafo regenerado, `simular_navegacion --grafos
  <carpeta>` contra el publicado con la misma `--semilla`. Si solo cambian los carriles,
  `ROUTE_LANES_REV`, y si solo las decimas, `ROUTE_TIMES_REV`
  (`generar_carriles.py` y `generar_tiempos.py` del taller). Al subir `ROUTE_GRAPH_V3_REV` o la version de ATS en
  `variants.js`, correr `python tools/build_demo_route.py`.
- La regla de cache "Mapas R2" de Cloudflare guarda tambien los 404, por
  variante de compresion: nunca pedir desde la web un archivo antes de que
  este en R2. Si paso, subir el numero de su `?` (paso con `l=1` el 13-10).
- Otra regla de Cloudflare (WAF, plan Free: sin regex) bloquea los mapas
  sin Referer de trucksim-dash.com o de la copia LAN (`http://`), salvo con
  el header `x-truckdash-tools` igual al secreto `TRUCKDASH_MAPS_KEY` (en
  Actions y en la PC del maintainer). check_avisos, el simulador y
  `check_map_*` lo mandan solo a maps.trucksim-dash.com; sin el secreto,
  check_avisos se saltea con un aviso (el PR de un fork no lo recibe).
  Si se cambia el secreto, en los tres lugares a la vez (GitHub, la regla
  con su Deploy, la PC), o check_avisos falla con 403. La URL r2.dev del
  bucket esta apagada (saltearia la regla); el CORS del bucket queda en `*`
  porque el modo LAN pide desde direcciones que cambian en cada casa.
- Un archivo de mapa nuevo es opcional en la web: sin el, la app hace lo
  de antes (sin flechas de carril, por ejemplo), nunca deja de rutear.
- Escudos de ruta en el mapa (capa `road-shield`, Discord 19-10): salen de
  `road-names.json` (`roadShieldPoints`, uno por ruta cada
  `ROAD_SHIELD_CELL_M` = 4 km, desde zoom 8), dibujados en un canvas con la
  forma clasica y el numero adentro (`addRoadShieldImage`). Solo ATS: los carteles de ETS2
  no traen el numero (kind 'city'). Con 2,5 km se repetia la I-80 cerca de
  Omaha; en lite no se cargan los nombres y no hay escudos.
- Ancho de las calles (Discord 22-10, una rotonda de Suecia): de lejos el de
  siempre y de cerca el del juego (`roadLineWidth`: 9 m por 0,8, en pixeles
  segun la latitud del centro; `updateRoadWidths` lo rehace cada 2 grados),
  con puntas cuadradas y esquinas en punta. Las piezas de los cruces de
  truckermudgeon (las V de las entradas, las dos calzadas) estan pensadas
  para dibujarse con ancho: con la linea fina se veian sueltas y cruzadas.
  Donde terminan dos pedazos juntos en angulo, las puntas cuadradas dejaban
  una estrella: los tiles van con las calles que se tocan punta con punta
  unidas (`unir-calles.ts` del armador, en `truckdash.patch`; el taller lo
  corre antes de tippecanoe con `unir.ts`, parche 0005 de
  `tm-maps-patches`). En R2 desde `mapDataVersion` 20261022 (solo
  tippecanoe, `rebuild_tiles_light.sh`, las 17 variantes: de 123 mil calles
  quedan 44 mil en ATS, los .pmtiles bajan 10 a 15 %). tippecanoe nombra la
  capa por el archivo de entrada: con el unido salia "atsunido" y la web no
  dibujaba nada; va `-l ats` / `-l ets2`. Quedan pedazos rotos en algunos cruces (brazo
  noroeste de una rotonda de Uppsala, juego 24060,-51876): los tiles de
  truckermudgeon tienen los mismos, vienen del generador; sacar los sueltos
  dejaba la calle cortada antes de la rotonda. Desde el zoom 12 la ruta es
  mas fina que la calle y va encima, como un carril marcado.
- Un mapa armado en la PC ("Build my map") cuyas ciudades caen sobre todo
  fuera de la tierra real (Explorando a America en ATS, 18-10) va con el
  fondo liso y sin mar: se mide una vez al cargarlo (`citiesOnLand`, con 0,5
  grados de margen por la costa, y `basemapFitsCities`, 80 %). Los de R2 no
  se miden (99 % en ATS, 95 a 98 % en ETS2).
- Desde un navegador, el relay (`SoloOrigenesPropios` en backend/main.py)
  solo atiende a trucksim-dash.com y a la copia LAN del cliente
  (`http://<ip>:27765`, localhost, IPs privadas); sin header Origin (cliente,
  curl) no mira nada. Una pagina en otro dominio no conecta:
  `TRUCKDASH_ORIGENES=avisar` en Railway la deja pasar y anota el origen.
  Una app nativa no manda Origin y entra igual: los terminos
  (`docs/terms.html`, "The relay and other apps", 18-10) prohiben conectar
  otras apps sin permiso escrito; bloquearlas de verdad seria otra medida.
- En el cliente, el WebSocket LAN (27766, `origen_permitido`) y el servidor de
  paginas (27765, `origen_cors`: lo mismo mas trucksim-dash.com y localhost
  con cualquier puerto) devuelven CORS solo a esos origenes, nunca `*`.
  `/__show-setup` (el segundo arranque abre Setup) pide el header
  `X-TruckDash: show-setup`, que una pagina no puede mandar sin preflight.
- "Compartir mi posicion" es de la sesion del relay, y el relay recibe la
  posicion de la telemetria del cliente aunque solo este abierto el tablero
  por LAN. Ese tablero lo cambia a traves del cliente (`pedido_live_share`,
  `al_relay`; en el relay `apply_set_live_share` con `from_client`) y ve el
  estado real (`live_share_state` tambien al cliente, `liveShare` en el
  session_state LAN). Por LAN solo prende el tilde tocado: el reenvio
  automatico de esa pagina no publica a quien nunca lo prendio. Con un
  cliente viejo la casilla queda gris (`liveShareControls`). La ruta en el
  mapa en vivo y los otros conductores siguen siendo de la pestana con el
  codigo (Discord, 20-10).
- Compartir viene apagado desde el 20-10 (del 21-09 al 20-10 venia prendido
  y lo prendia la pestana que abre el cliente en la PC). Una pestana que
  nunca lo cambio (`liveShareChoice` null: saveSettings guarda solo lo que
  cambia) no le manda nada al relay al conectar: ni lo prende ni apaga lo
  que eligio otro dispositivo. Ya no hay aviso de "apareces en el mapa".
- Plan de ruta y voz por sesion (Discord 22-10, Gargamosch: los waypoints en
  la tablet, la navegacion en el celular y la voz en la PC). El relay guarda
  los waypoints de cada variante (`Session.route_plans`, con `rev` = su hora
  al aceptar un cambio) y el dispositivo que habla (`voice_device`), y los
  manda solo a las pestanas que saludaron (`route_plan_hello`): la web vieja
  toma por telemetria cualquier mensaje con un type que no conoce. Un cambio
  de aca va con `set_route_plan` y un nonce; hasta que vuelve, la pestana no
  aplica otros planes (el relay los ordena y el ultimo que acepta es el que
  queda en todos, `routePlanAction`). Al conectar, cada pestana ofrece lo que
  tiene guardado con su rev y el relay solo lo toma si no tiene algo mas
  nuevo: asi el plan sobrevive a un redeploy. Vaciar una lista que ya estaba
  vacia no se manda (borraria el plan de los demas). La ruta la sigue
  calculando cada dispositivo, y se rehace cuando llegan las decimas y el
  `-prefabs.bin`: calculada antes de que llegaran, dos dispositivos con los
  mismos waypoints mostraban caminos distintos. Prender la voz en un
  dispositivo la trae a ese (`set_voice_device`, `voiceSpeaksHere`) y los
  demas dicen donde esta, con "Decirlas aca"; apagarla la suelta, y si su
  dispositivo no vuelve en `VOICE_DEVICE_GRACE_S` (20 s) queda libre. Los
  ajustes que cambian la ruta (mas rapida o mas corta, DLC automatico o
  apagados: `route_prefs`, `routePrefsOf`, `syncAction`) van igual que el
  plan: cambiarlos en un dispositivo los cambia en los demas. Por LAN la
  telemetria sigue por la red de la casa y el plan, la voz y los ajustes van
  por una conexion solo de plan al relay (`?role=plan`, `connectLanPlan`):
  el cliente le pasa el relay y el codigo en el session_state (`planRelay`,
  `LocalServer.plan_relay`). Esa conexion no recibe telemetria ni cuenta
  como tablero. Con un cliente viejo (sin `planRelay`) la pestana por LAN
  sigue con lo suyo; sin internet reintenta cada vez mas espaciado. Lo que
  una pestana ofrece al conectar sin haberlo sincronizado nunca (rev 0)
  entra con rev 1: el segundo dispositivo adopta lo del primero, y
  cualquier cambio de verdad le gana. `tools/probar_dispositivos.py` lo
  prueba con el relay local, un cliente falso, dos navegadores con el
  codigo y uno por LAN (un 27766 falso).
- En el `-lanes.bin`, el giro de un paso lleva +64 (`CARRIL_QUE_SE_PIERDE`
  del constructor, `drop` de `lanesForEdge`) si se sigue derecho y un
  carril que venia de antes del cruce anterior se va por una salida: ahi
  la web avisa "keep left" sin giro (`laneKeepAt`). Sin la marca no: el
  carril de desaceleracion (la salida comun de ETS2) tambien deja afuera
  al de la derecha. Salvo que ese carril haya entrado por una rampa a menos
  de 200 m (`laneFromOnRamp`, `NAV_LANE_RAMP_M`, no mas que `ROUTE_BEHIND_M`):
  la calle que se suma tiene que venir de atras, no el retorno de la
  calzada contraria donde empieza una autovia. `check_avisos.js` y el simulador cargan los carriles;
  `TRUCKDASH_LANES_DIR` y `--carriles` prueban unos sin subir.
- Sin giro a la vista, abajo de "Continue straight" van las flechas del
  proximo cruce a menos de 500 m donde no sirven todos los carriles
  (`findQuietLanes`, `quietLanesAhead`, `navQuietLanes`): solo salidas de
  autopista (`laneKeepSide` sin la marca), sin voz ni texto. Las de doblar
  en una esquina de ciudad no (un carril de giro en cada cuadra).
- El ajuste "Highway exits" (`navEveryExit`, apagado por defecto; Discord,
  19-10) convierte esas mismas salidas en un "keep" con voz
  (`everyExitKeepSide` en pure.js, en `findUpcomingTurn` con los filtros
  del keep por carriles). El juego no los dice: +18 avisos en ATS y +28 en
  ETS2 en check_avisos. La lista guardada es con el ajuste apagado;
  `check_avisos.js --cada-salida` muestra los que suma.
- El ruteo (`findRouteWith`) es un A* por aristas sin vueltas en U en los
  nodos (`findArcRoute` en pure.js): el estado es la arista de llegada y no
  se sale a mas de 150 grados de ella, salvo en ferry/tren o si no queda
  otra salida. Si asi no hay camino, `nodeRoutePath` (el A* por nodos de
  antes). `tools/check_avisos.js` saca las dos de app.js por nombre.
  Tampoco por un nodo de prefab (`uTurnShortcuts`, 22-10): el constructor
  (`prefab_nav_paths`) saca caminos entre dos nodos de un prefab que pasan
  por un tercero (c), y queda una arista a -> b del largo de a -> c -> b.
  Donde una autovia pasa a ser una sola arista de doble mano es ir de una
  calzada a la otra dandose vuelta en c, repartido en tres nodos (unos 30,
  133 y 15 grados en Kiel, ProMods): pasada una salida la ruta mandaba a
  "cruzar la autopista" (Discord 22-10; 80 lugares asi a 6 km de Hamburgo,
  a los dos lados de cada area de servicio). `buildRouteGraph` saca a -> b
  y `findArcRoute` toma a -> c -> b como vuelta en U (`uTurnPairs`) si en c
  dobla 150 grados, o 90 y toda llegada a a contra toda salida de b pasa los
  150 (sin eso caia la recta de una T cuando el brazo sumaba lo mismo).
  Despues de una salida perdida cambian 17 de 300 rutas de ATS y 149 de 300
  de ETS2 (mediana +3 km: hasta el cruce siguiente, como el GPS del juego).
  La arista a -> b era la marca de que c es del mismo prefab, y desde el
  22-10 el constructor ya no la saca (`prefab_nav_paths` no pasa por otro
  nodo del prefab): la marca es `-prefabs.bin` (`write_prefabs`, un color
  por arista, distinto en dos prefabs que comparten un nodo), y
  `findArcRoute` toma como vuelta en U llegar a un nodo por una arista de un
  prefab y salir por otra del mismo (`g.edgePrefab`). Los grafos de antes
  siguen con `uTurnPairs`; los mapas armados en la PC piden el archivo
  siempre, los de R2 desde el 22-10 (`ROUTE_PREFABS_REV` 1). Con esos
  grafos (4 variantes, 120 rutas, semilla 7) cambian de largo 15 a 25 rutas
  por variante; las que se alargan mas de 5 % (Iasi, San Antonio, Knoxville,
  y en check_avisos la salida de Pendleton) pasaban por giros que el juego
  no tiene: salir a la izquierda de una entrada solo a la derecha, o la
  vuelta de Kiel misma.
  Un nodo de prefab sin calle (todas sus aristas, de llegada y de salida,
  del mismo prefab: lo que sigue es oculto y no esta en el grafo; 25 mil en
  ATS y 24 mil en ETS2) es un toco (`prefabStubs`): la ruta no va ahi salvo
  que sea el destino, y no cuenta como salida para decidir si un nodo es
  una calle sin salida. Sin eso la ruta entraba al brazo de un cruce y
  salia (una V con un "turn left" donde se sigue derecho: los 22
  `atajo_salteado` del simulador en 4 variantes) o se daba vuelta ahi
  (Iasi, Knoxville, 22-10). Si sin tocos no hay camino (la T de una empresa
  de Charlotte con el brazo de enfrente oculto), `findArcRoute` busca otra
  vez con ellos. La vuelta pasa a la punta de calle sin salida siguiente,
  que tambien puede ser una calle cortada por lo oculto (Knoxville, 300 m
  mas alla): darse vuelta en una calle sin salida sigue permitido, pero
  cuesta de mas (`routeUTurnCost`: 120 s y 2 km, `ROUTE_UTURN_PENALTY_S` y
  `_M`, en `opts.uTurnCost`): el GPS del juego no se da vuelta, y asi la
  ruta da la vuelta a la manzana si no es mucho mas larga. En 4 variantes
  (120 rutas, semilla 7) las vueltas en U bajan de 9 a 7 (Iasi, Akko), sin
  rutas perdidas ni recalculos peores; con 300 s bajan a 6 pero sale un
  recalculo mas largo. Las que quedan son puntas de calle donde la vuelta
  por otro lado es mucho mas larga (Knoxville, Sevilla) o la unica entrada.
  El costo es `routeEdgeCost` (segundos + 1 ms por metro: los segundos del
  grafo son enteros y sin desempate la ruta hacia una V por un brazo del
  cruce; "shortest", metros + 4 m por segundo, `ROUTE_SHORT_M_PER_S`: con
  los metros solos salia de la autopista por un area de descanso o por la
  salida y la entrada de un cruce para ahorrar 3 a 50 m, Discord 20-10).
  Andando, la ruta arranca en el tramo del camion en su sentido
  (`startArcForHeading`, `routeStartHeading`), no en el nodo mas cercano.
  La distancia es a la calzada (la corrida con que se dibuja la arista), no
  al eje: una autovia de una sola arista de doble mano tiene el eje entre
  las calzadas y le ganaba un carril de prefab (Grimsby -> Sheffield, ETS2,
  21-10). Los carriles de un prefab casi a la misma distancia
  (`START_ARC_TIE_M`) van como alternativas y se sigue por el que da la ruta
  mas barata. `tools/simular_navegacion.js` cuenta los recalculos malos.
- La ruta no se baja por una salida para volver a subir a la misma calle
  (`dropRampDetours`, en `porAristas` de `findRouteWith`; turn report del
  24-10, US-6 en Price, Utah: "Keep right onto US-191" y "onto US-6" en las
  salidas 240 y 241). Ahi la US-6 es una calle de doble mano a 60 km/h en el
  grafo (carriles `road.local` en `LANE_SPEEDS` del constructor) y las rampas
  van a 90 (`motorway`): bajar, cruzar derecho la calle de abajo y subir
  salia 2 s mas rapido que el puente. Vuelve a la calle donde la ruta la deja
  en a y la retoma en b si de a a b no tiene cruces, el desvio pasa por uno,
  no es mas corto, ahorra hasta `ROUTE_RAMP_DETOUR_MAX_S` (10 s) y la calle
  es la que sigue derecho desde la llegada (`ROUTE_RAMP_STRAIGHT_TOL_DEG`,
  al primer nodo a 15 m): sin esto ultimo cambiaba de carril en 20 prefabs
  de ETS2 y tomaba el giro libre de las rotondas. En todo el grafo, 20
  lugares de ATS (Price, Wenatchee, Odessa, St. Joseph, Victoria TX con un
  "turn left" falso) y 9 de ETS2 (Pamplona, Granada, Patras, Tirana); el de
  Primm (ahorra 22 s y el desvio es el que sigue derecho) queda. check_avisos
  y 240 rutas del simulador (semilla 7) no cambian; 120 de UT, WA, TX y CO
  (semilla 3) pierden 2 avisos falsos. Lo de fondo es el constructor (una
  US con cruces a distinto nivel no es una calle local): al regenerar el
  grafo, medir de nuevo.
- Tampoco deja una avenida que sigue derecho por una calle lateral que sale
  a la ruta mas adelante (`dropSideStreetShortcuts`, despues de
  `dropRampDetours`; reporte #7, 27-10, Amarillo: "Turned me right early
  onto a side street"). Al norte por la US-287 la ruta doblaba en la cruz de
  -25866,21351 por una calle de empresas (`us 1-1`, 60 km/h) que sale a la
  colectora de la I-40 a 67 m de la rampa: 1,6 s menos que la US-287 (80
  km/h, pero cada cruce es un prefab a 40). El camion no llego a subir y la
  ruta lo hizo dar la vuelta a la manzana dos veces. Llegando por una calle
  de `ROUTE_MAIN_ROAD_KMH` (75) o mas, si la que sigue derecho (30 grados,
  por los prefabs hasta la primera calle) tambien lo es y la ruta sale por
  una mas lenta y de doble mano, se busca volver a la ruta por la derecha (a
  1 km, sin vueltas en U) con menos metros lentos y hasta
  `ROUTE_SIDE_STREET_MAX_S` (5 s) mas. De doble mano: el carril de giro a la
  derecha que corta la esquina antes del cruce (Kalispell, Cheyenne) es de
  un sentido y el juego lo usa. Necesita el `-prefabs.bin` para saber que es
  calle y que prefab. En 1.750 rutas de ATS, ETS2, Coast to Coast y ProMods
  (semillas 7 y 11) cambian 19, dibujadas una por una: todas dejaban la
  avenida por una calle paralela (Elko, Salina, Toulouse, Peoria, Cagliari),
  de 14 m menos a 115 m mas. check_avisos: Rock Springs -> Rawlins da la
  vuelta a la manzana por la calle principal (2 avisos en vez de 3). El
  simulador (semilla 7, 120 rutas) pierde un `sentido_al_reves` y un
  `giro_sin_otra_salida` de Woodward -> Guymon; nada nuevo. Lo de fondo es
  el constructor (un prefab que se cruza derecho no va a 40 km/h).
- Un waypoint puesto tocando el mapa (`waypointPassesBy`: sin nombre ni
  tipo) es un punto por donde pasar: el tramo termina sobre su calle
  (`waypointArcs`, `findArcRoute` con `endArcs`), por la calzada que le
  queda mas a mano, y el siguiente arranca ahi en el mismo sentido
  (`tramo` de `findRouteWith`, `.llegada`). Con el nodo mas cercano, en una
  autovia de dos calzadas el tramo iba a la contraria y daba la vuelta: 44
  de 600 waypoints sobre la ruta la alargaban en ATS, 26 de 589 en ETS2
  (21-10). En medio de un cruce elige el carril sumando el tramo que sigue.
  El de un POI (estacion, descanso, empresa) o el del lider del convoy es
  un lugar al que entrar (`tramo.entrar`, tambien la empresa del trabajo y
  el `reach` del boton de parada): al nodo mas cercano, pero si ese es de una
  via rapida, al de una calle o un prefab hasta `STOP_SLOW_NODE_M` mas lejos
  (`slowNodes`). Con el de la autopista la ruta pasaba de largo de la
  estacion y la daba por alcanzada (36 de 325 paradas del boton en ATS; asi,
  1). El centro de una ciudad (destino aproximado) no: cambiaba rutas.
  La empresa del trabajo (`tramo.empresa`) pide mas: un nodo sin ninguna
  arista de 75 km/h o mas, de salida ni de llegada (`yardNodes`). Todo
  prefab del grafo va a 40 km/h, tambien los de la autopista, y para
  `slowNodes` el nodo de un cambio de carriles de la I-25 era "de un
  prefab": la ruta a Rail Export de Casper terminaba en la autopista y daba
  la vuelta (22-10). Cambian 33 empresas de ATS y 9 de ETS2, ninguna queda
  en una via rapida (dibujadas una por una: al patio, a su calle de entrada
  o al nodo de al lado). Las paradas no: en ETS2 las calles de servicio de las
  estaciones van a 90 y 196 de 2.074 se iban a otro nodo, a veces el de la
  estacion de la otra mano.
  A una parada se entra por otro nodo lento hasta `STOP_SLOW_TIE_M` (40 m)
  mas lejos que el mas cercano (`stopEndNodes`) si ahorra mas de
  `STOP_SIDE_SWITCH_M` (1 km): el icono de un area de descanso puede caer
  entre las dos calzadas. El de la I-80 al este de Council Bluffs (ATS,
  7245,-14697, turn report #6, 26-10) es del area de la mano este (lo dice la
  caja del trigger), pero el lento mas cercano era el de la otra mano: 10,6
  km con la vuelta en vez de 3,6, y apenas pasada la salida a otra area en
  el pueblo el boton de descanso elegia esa (8,4 km, tambien con vuelta).
  Con el mas barato siempre, sin el km, cambiaba donde termina la ruta en
  casi todos los pedidos por unos metros. Con el boton cada 1,5 km en 100
  rutas por variante (semilla 11): cambia la elegida en 48 de 1.790 pedidos
  en ATS, 42 de 1.976 en ETS2, 39 de 1.562 en Coast to Coast y 33 de 1.288
  en ProMods; el camino queda mas corto en 56, 48, 45 y 42 (hasta 7 km: la
  estacion de Yakima -> Seattle se alcanzaba pasandola y volviendo por el
  enlace) y mas largo en 7, 7, 4 y 2 (casi todas por elegir una mas adelante
  sobre la ruta, el costo de `pickFuelStop`); las que obligan a volver bajan
  de 131 a 117, 98 a 90, 97 a 86 y 85 a 75. Queda una peor (Wichita Falls,
  514 m mas y con vuelta): una con vuelta que ahora cuesta parecido y
  `switchM` no la cambia.
- La app rutea sola y del GPS del juego solo sabe cuanto falta
  (`routeDistanceKm`). Si nuestra ruta no coincide con eso (mas de 5 % y de
  5 km, con 40 km o mas por delante, `routeGameAgreement`), se buscan hasta 3
  alternativas encareciendo las aristas de la anterior (`routeAlternatives`)
  y gana la que coincide a menos de 1,5 % sin ser mas de 5 % mas lenta
  (`pickRouteLikeGame`, `routeLikeGame` en app.js). Solo con destino exacto
  (`dest`/`pickup` sin `approx`), sin waypoints y con "fastest"
  (`followGameRoute`: con "shortest" el juego sigue en su ruta, casi siempre
  la rapida, y se cambiaba la mas corta por una mas larga, 21-10); si a los 3 datos sigue sin
  coincidir (el juego tarda en tener la ruta nueva), se prueba una vez mas
  (`routeGameRecheck`). En Salt Lake City la app iba por la I-84 y el juego
  por la I-80, 3 s de diferencia (Discord, 19-10). Los margenes salen de
  250 rutas: con nuestra escala errada hasta 4 % u 8 km no se cambia ninguna;
  con 3 %, una de cada tres. El "Copy turn report" trae las dos distancias
  ("Route left"): con reportes reales se puede medir el error de la escala.
  Una alternativa no se desvia de una ruta anterior por menos de 1,5 km
  (`dropRouteDetours`, `ROUTE_DETOUR_MAX_M`): con la autopista encarecida
  se bajaba por la salida y volvia a subir, o pasaba por el area de
  descanso, y ese largo de mas la hacia coincidir con el juego (I-15,
  salida 385, camino a Ogden, Discord 20-10).
- El boton de parada (estacion o descanso, `addNearestStop`) elige con
  `pickFuelStop` y despues mira el camino de verdad (`reach`, findRoute desde
  el camion): si la elegida obliga a dar la vuelta (el camino mide 1 km mas
  que lo que se avanza hasta ella), se elige otra vez sin ella y queda la de
  menor 2 * camino - along. Cerca de la linea de la ruta no dice de que mano
  queda: en la I-80 este de Grand Island mandaba al area de la mano oeste
  (Discord, 19-10). Ordenar todo por el camino cambiaba 30 % de las
  elecciones y alargaba muchas: ganaban paradas lejos sobre la ruta.
  Despues se miran tambien las 8 mas cercanas y las 3 primeras sobre la
  ruta: gana una que no obliga a volver si cuesta 1 km menos (`near`,
  `switchM`). Por el rumbo no se veian las de al costado: elegia una a 3,6 km
  con otra a 546 m (Austin). Dejar ganar a las que obligan a volver subia
  esas elecciones en ATS. Si la elegida y la otra estan las dos sobre la
  ruta alcanza con 500 m (`switchRouteM`): bajando por la I-37 en George
  West (Discord 25-10, Chillaxingone) ganaba el area de la otra mano (salir,
  cruzar el puente y volver) contra la de la derecha, 642 m mas barata.
  Medido cada 1,5 km en 100 rutas por variante (semilla 3): cambian 37 de
  1.392 pedidos en ATS (36 con menos camino), 15 de 1.638 en ETS2 (12; los
  otros, hasta 286 m mas) y 8 y 14 en Coast to Coast y ProMods. Bajar
  `switchM` para todas cambiaba tambien una fuera de la ruta por otra sobre
  la ruta de 3 a 7 km mas lejos.
  El descanso tiene plazo: con los minutos que faltan (`restReachMeters`, a
  70 km/h de velocimetro con la escala de tiempo medida), si la elegida no
  se alcanza gana la de menor costo entre las que si (`maxReachM`), y si no
  se alcanza ninguna, la mas cercana por el camino (Discord 22-10,
  Chillaxingone). El aviso "Rest soon" salta a los 150 minutos de juego por
  defecto (Ajustes, "Rest warning": de 60 a 180, `REST_WARN_OPTIONS`, en
  cada dispositivo; antes 90 fijo y el juego avisa a las ~2 h): en 40 rutas largas de ATS el area
  elegida quedaba fuera de alcance en 68 de 370 lugares, y asi en 5, donde
  no hay ninguna a mano.
- Lo que falta y la distancia al giro se miden sobre la ruta entera
  (`routeMeters` de `createCityScale`, con `currentRouteFull`), nunca solo
  sobre la ruta recortada al camion: asi saltaban 5 km al entrar al hueco
  entre dos cajas de ciudad.
- Escala de ciudad (`createCityScale`): cada caja cuenta 30 m mas de cada
  lado (`CITY_MARGIN_M`) y el hueco entre dos cajas va a 1:20
  (`CITY_GAP_M` = 0). Sale de medir el GPS del juego con la posicion del
  "Copy turn report" (Sidney NE, 17-10): antes de mover esos numeros,
  medir asi otro lugar.
- Las distancias del mundo se ven por 20 en el juego (por 3 en la ciudad):
  150 m en linea recta son casi 2 millas en el GPS. Un waypoint se da por
  alcanzado por la ruta, al pasar por el punto mas cerca del icono o por el
  nodo de su tramo (`waypointReached`); en linea recta solo sin ruta
  (Discord, Gargamosch, 18-10: se iba 1 o 2 millas antes).
- Rotondas: `detectRoundabout` descarta anillos con lados rectos largos
  (`longestStraightFrac`: manzanas y colectoras de una mano) y prefabs
  compactos sin isla (`compactIslandM`: cruces de ATS con curvas cuadradas).
  Los umbrales salen de medir contra el nombre del prefab del parser; antes
  de moverlos, correr el simulador con `--rotondas`.
  Las rotondas ovaladas armadas con calles (sin prefab de rotonda, sin
  nombre que ayude) pasan por otra regla (`ovalRing`, `OVAL_RING`): hasta
  x2 de redondez, a lo sumo dos lados rectos (el tercero, `straightRuns`,
  menos de 0,06 de la vuelta), convexas, de 150 a 450 m y con 3 salidas. El
  ovalo de Colville (ATS, -81881,-63722, turn report del 23-10) decia "turn
  left" dos veces. Las manzanas de ATS tienen las esquinas cortadas en dos de
  45 grados y doblan tan parejo como un ovalo: lo que las separa son los
  cuatro lados rectos. En ATS, ETS2, Coast to Coast y ProMods entran 21
  anillos, todos ovalos, y ninguna manzana, rombo de autovia ni estrella.
- La voz habla de a una frase (`voiceQueueAction`): una nueva espera a que
  termine la que suena, salvo un aviso en el punto contra uno anticipado.
  Lo dicho se recuerda por maniobra (`turnIdentity`) para las ultimas 8
  (`createRecentManeuvers`, tambien el lector de pantalla), no solo la
  ultima: al pisar el nodo de un giro el aviso pasaba al siguiente, volvia
  un dato y la voz lo repetia ("keep right" dos veces en Salem; 11 en 480
  rutas del simulador, 0 asi; `voz_repetida` en el simulador).
  Los `sentido_al_reves` del simulador pueden ser falsos: la zona junta
  varios giros y la suma pasa los 180 grados (Panevezys) o se le suma una
  horquilla callada de antes (Albacete); un "keep right" donde la ruta
  dobla a la izquierda y la otra rama dobla mas es correcto (Salem,
  Wenatchee, 22-10).
- Un giro sin otro camino se calla (`quiet` de `detectManeuver`), salvo la
  entrada a un anillo (`ringThrough`): solo tramos de un sentido y sin
  repetir nodos. Con cualquier camino dirigido, toda esquina con un brazo
  muerto de prefab parecia una rotonda (Discord, 17-10, Oregon).
  Tampoco la esquina en escuadra (60 a 120 grados entre tramos rectos) de
  una cruz con dos brazos muertos: la calle se termina y hay que doblar
  (salida 115 de Rockford, Discord 18-10, Gargamosch). Con un brazo muerto o
  con la calle curvandose (sierras, zigzags), callada.
  Salvo que el brazo de enfrente sea un toco (`prefabStubs`, en `ctx.stubs`):
  desde el nodo de entrada sigue derecho (20 grados), se une a otro toco del
  mismo nodo y queda mas lejos que el brazo por donde sale la ruta, y la
  ruta dobla hasta 120 grados. La cruz con semaforos de Bakersfield (ATS,
  -104665,7299, reporte del 26-10) tiene ocultos el brazo norte y el este,
  la ruta dobla 90 grados al oeste y a los 10 m la calzada vuelve al norte:
  a 60 m dobla 40 y se callaba. Cada condicion saco falsos: con "dos brazos
  muertos" a secas, la T de Tulsa (el otro "brazo" era el rombo de la calle
  de despues); con tocos de dos prefabs pegados, una T de Messina; sin lo
  de "mas lejos", los cruces chicos que se pasan derecho en una curva
  (Moline, Olbia: llegando en curva, un brazo del costado queda a 20
  grados); sin el tope, la vuelta en U por una rotonda con los brazos
  ocultos (Sevilla -> Olhao, ProMods). En check_avisos suma 2 cruces de
  campo (Helena, Yankton); ETS2 igual. En el simulador (semilla 7, 120
  rutas de ATS, ETS2, Coast to Coast y ProMods) suma 45 avisos, dibujados
  uno por uno: cruces con el brazo de enfrente oculto, y tres rotondas sin
  reconocer con brazos ocultos que dicen "turn right" en la primera salida.
- Los puntos de la curva de un prefab cortan el grupo de nodos de cruce
  (`junctionClusterEnd`). Si un grupo no avisa nada o se calla,
  `junctionManeuver` mira el prefab entero (60 m): partida, una T se callaba.
  Juntar siempre no: mezcla el giro con la curva de la calle de despues.
  Por los puntos de la curva el tramo puede pasar los 50 m del corte hasta
  esos 60 m (la cruz de Modesto con dos brazos muertos, 21-10); un tramo sin
  puntos de curva de 50 m o mas sigue cortando: son dos prefabs.
  Si el grupo arranca en otro prefab pegado y asi pasa los 60 m, la mitad
  que sigue (a menos de 80 m) se mide con la primera cuando se calla, dobla
  para el mismo lado (o la primera no dobla), sus nodos comparten un vecino
  (los otros brazos se unen a los dos: es el mismo prefab) y la curva entre
  las dos dobla para un solo lado (no la 2.a salida de una rotonda chica sin
  reconocer, Oslo), con el aviso en el nodo de entrada (`mismaCruz`): la
  esquina de Davenport -> Quincy despues de un rombo y la segunda vuelta de
  una S (una cruz a 38 m de una T, Wenatchee -> Everett) se callaban (ATS,
  21-10). Sin el vecino comun ponia el giro en otro cruce (Tulsa -> Ardmore,
  Topeka). En 900 rutas por juego: +55 avisos en ATS, +50 en ETS2, ninguno
  perdido ni movido.
  Tambien cuando ninguna mitad llega al umbral (35 grados) y juntas si: la
  cruz de Idaho Falls (ATS, -63981,-32641, Discord 21-10) mide 71 m por la
  curva, dobla 61 grados en dos mitades de 21 y 26, y su brazo de enfrente,
  cortado con barreras, no tiene calle: "Continue straight". Ese brazo se
  mide por adentro del prefab hacia el brazo norte (+63), no derecho; aun
  abierto habria dado "keep left". En 900 rutas de ATS y ETS2 y 600 de Coast
  to Coast y ProMods: 11 lugares mas, ninguno perdido ni movido (T e Y
  anchas; en Madaba, ProMods, "turn right" con otra salida a +70 del mismo
  lado, como pasa con un grupo solo).
  Las segundas vueltas de una S que siguen calladas (Salt Lake -> Twin Falls,
  Timisoara) no tienen otra calle en el grafo: el brazo este de la T de Salt
  Lake (n84167) solo se une a la ruta y la calle oeste de la de Timisoara no
  sale a 120 m (`leadsAway`). Es la regla del giro callado, no un error.
  Medirlas despues de un giro anunciado con una entrada de 15 m (21-10)
  tomaba como otra salida volver a entrar a la cruz recien dejada ("turn
  left" despues de la cruz de Koln -> Osnabruck): sin eso quedaba 1 aviso
  en 1.800 rutas, y no se hizo.
- Una bifurcacion se deja al giro que viene a menos de 250 m solo si ese
  giro se anuncia (`turnAfterFork`): la curva callada de una rampa que
  termina en una T sin otra salida tapaba la salida 50 de la I-25 en
  Walsenburg (ATS, 18-10) y no se decia nada.
  Tampoco si el giro es para el otro lado despues de una salida de una mano
  (`salidaDeUnaMano`): salir a la derecha y doblar a la izquierda al final de
  la rampa avisa la salida primero (salida 115 de Rockford, 18-10).
  Ni si findUpcomingTurn lo junta con una curva callada de antes
  (`continuesTurn`): la rampa a la US-395 norte en Spokane dobla sin otra
  calle y 20 m despues cruza derecho una cruz que con la curva en la entrada
  "dobla" 43 grados; no se decia nada en la salida (turn report, 23-10).
- Una salida que a los 150 m vuelve por donde se vino (la calzada contraria
  donde termina una autovia) no es rama de una bifurcacion (`forkInCurve`).
- Una salida que vuelve a la ruta no es otro camino: tiene que llegar a 120 m
  del cruce (`escapeM` de `leadsAway`) sin pisar la ruta de los 100 m que
  siguen (`rejoinM`), y si es de un solo sentido (una calzada que se abre
  alrededor de una isleta) tampoco la de los primeros 120 m
  (`branchLeadsAway`, en detectManeuver, sideExitToward y otherBranchesAt).
  En la US-6 al oeste de Tonopah (ATS, -98772,-5680, turn report del 25-10)
  la calzada se abre en dos y se junta a 100,0 m: la rama salia del cruce
  por la ruta misma, y se decia "keep left" pegado al "turn right" de 400 m
  despues. Las calles de doble mano siguen con los 100 m: bloquear toda la
  ruta a menos de 120 m callaba triangulos y lazos de calles que el juego
  avisa (El Centro, Cody, Bloomington, Belgrado). En 500 rutas por variante
  (semilla 11) cambian solo calzadas partidas: 1 aviso en ATS (Medford), 3
  en ATS ProMods (Medford y una curva cerca de Penticton con los dos
  carriles separados), ninguno en ETS2 ni ETS2 ProMods; ningun nombre.
- Dos calzadas de un sentido que se separan casi paralelas (la colectora al
  lado de la autopista) no llegan a los grados de una bifurcacion: si a 100 m
  ya van a 10 m y la ruta toma la que se abre, es "keep" (`parallelFork`).
  Con carriles manda la flecha del juego de la rama de la ruta (`laneTurn`
  en el ctx): sin flecha a un costado, la ruta es la autopista y no se avisa.
  Y si la flecha de la ruta va a un costado y la de la otra derecho, se avisa
  aunque por angulo la ruta sea la mas recta: llegando en curva al I-35 norte
  en San Antonio (ATS, -13248,54085, turn report del 25-10) la ruta sale a
  +3,5 grados y la otra calzada a -3,9, y a los 400 m se cruzan por un
  puente; no se decia nada y el camion siguio por la otra. Salvo que la ruta
  se lleve mas carriles que la otra (`laneMask`: es la autopista y la otra
  un carril que sale), y el lado lo dan los carriles que van solo por cada
  rama, no la flecha (sale del rumbo en las puntas del prefab: en ETS2 hay
  salidas a la derecha con "slight left"); si se mezclan, nada. En todo el
  grafo cambian 34 lugares de ATS y 168 de ETS2, casi todos salidas de una
  autopista que dobla donde no se decia nada; 2 y 11 pasan de "keep left" a
  "keep right" en el mismo nodo, ramas que se cruzan como la de San Antonio.
  En la bifurcacion por angulo, lo mismo cuando la rama de la ruta no tiene
  flechas (sirven todos los carriles) y la otra sale a un costado: la
  autopista que dobla 8 a 10 grados en una salida comun daba "keep left"
  (I-90 en Montana e Idaho, turn report del 23-10). Si la ruta tiene flecha
  derecho pero no la sirven todos los carriles, se avisa igual, sin nombre
  (`through`): "Keep left onto US-395" salia del cartel de la salida que
  viene, 1 km antes, y esa salida es a la derecha.
- La bifurcacion lejana (`farFork`, a 500 m) no cuenta una rama que se separo
  para un lado y lejos queda del otro: cruzo la ruta por un puente y el lado
  es donde se separan (US-63 en Columbia, 16-10). Ademas de los 8 grados a
  250 m, vale estar a `parallelForkSepM` (10 m) a `parallelForkM` (100 m):
  la salida de la I-70 en Colorado (-48320,-6177, turn report #5, 26-10) va
  17 m a la derecha a los 100 m pero solo 4 grados a los 250, y pasa por
  arriba a los 350; se decia "keep right" donde la ruta sigue por la
  autopista y el camion salio. En 300 rutas por variante (ATS, ETS2, Coast
  to Coast, ProMods) cambian 9 lugares, todos ramas que se abren de un lado
  y lejos quedan del otro: 8 "keep" de mas y uno que pasa a "keep left"
  (Marysville -> Kansas City, la ruta es la de la izquierda).
- La bifurcacion por angulo (a 250 m) no cuenta la curva de la calle de
  despues de un cruce que se pasa derecho: si a `parallelForkM` (100 m) la
  ruta no se desvio `forkMinDev` (6 grados), la otra salida ya se abrio
  `forkMinSep` (8) y ahi es de doble mano, nada. En la cruz del reporte #12
  (ATS, -77362,-48018, cerca de la US-95; 30-10: "keep right" con un solo
  carril y yendo derecho) la calle de al lado va a -35 grados a los 100 m y
  la ruta a 0,3, y dobla a la derecha recien a los 150 m (22 grados a los
  250). La doble mano se mira a los 100 m porque los tramos de adentro del
  prefab son de un sentido aunque la calle no. Sin esa condicion cambiaban
  27 lugares, casi todos ramas de un sentido de autopista que se separan de
  a poco con la ruta derecha (la rampa que se abre en dos en Sheridan ->
  Casper, "keep right" bien dicho). Con ella, en 1.129 rutas (300 por
  variante de ATS, ETS2, Coast to Coast y ProMods, semilla 7) cambian 4
  lugares, dibujados: 3 "keep" menos en una cruz o una Y de calles
  (Columbus -> Sioux City, Porto -> O Barco, Folkestone -> Portsmouth) y en
  Edirne -> Corlu (ProMods) el "keep right" pasa a "turn right" 70 m
  despues, en el nodo donde la ruta dobla 40 grados. check_avisos igual; el
  simulador (60 rutas por variante, semilla 7): 3 avisos menos en ETS2 y 1
  en Coast to Coast, ningun sospechoso nuevo.
- Un giro no se da por pasado por estar en el primer nodo del cruce: parado en
  la linea de una T el camion queda ahi y decia "Continue straight" (Discord,
  Gargamosch, 18-10). `turnPassed`: hasta 15 m despues del ultimo nodo decide
  el rumbo del camion (`findUpcomingTurn(heading)`) contra como se entra (los
  ultimos 10 m antes del nodo, no los 60 m de `inBearing`): pasado si se
  desvio 25 grados (o la mitad del giro) hacia la salida.
- El nombre de un aviso ("onto I-84", `roadSignForTurn`) lo votan los carteles
  de ruta de la salida: no los del cruce ni los de antes (el punto de la ruta
  mas cerca del cartel tiene que quedar 10 m pasado el nodo del giro), ni los
  que quedan mas cerca de otra salida (`otherBranchesAt`) o a mas de 80 m de
  la ruta (`exitSignTest`). Si hubo carteles y ninguno vota, sin nombre. El
  "I-80" a 14 m del nodo nombraba la rampa a la I-84 en Salt Lake City
  (Discord, 19-10). Medido en 450 rutas de ATS: 183 nombres mejores, 6
  peores, unos 100 ambiguos sin nombre; ETS2 no cambia (sus carteles son de
  destino). `check_avisos` no mira nombres: comparar a mano contra main.
  Tampoco votan los de la otra mano: a mas de 5 m a la izquierda de la ruta
  (`leftM` de `exitSignTest`; casi ningun cartel queda entre -5 y 5). Los
  del puente sobre la autopista recien dejada son de sus rampas: "Turn left
  onto I-90" al final de la salida (Discord, 20-10). Con -15 m en los tramos
  de un sentido volvia eso: en el cruce de la rampa los nodos del prefab son
  de un sentido. El "keep" por carriles (`laneKeep`, tambien el de "Highway
  exits") va sin nombre: se sigue por la autopista y los carteles que vienen
  son de las salidas ("Keep left onto US-71" en el trebol de Joplin).
  Medido en 450 rutas de ATS contra los escudos a la derecha de la ruta de
  0,2 a 3 km despues (lejos de los cruces), en los 716 avisos que los tienen:
  181 mejores (124 bien, 57 sin nombre) y 46 peores (39 sin nombre, 7 con
  otro). Siguen mal los del lado propio antes de un cruce (el "I-49" de la
  entrada a la autopista).
  Un cartel con varios escudos (una entrada por escudo en el mismo punto,
  `groupSignsByPoint` al cargar) vota por todos, y un empate lo gana el
  numero con mas carteles junto a la ruta que junto a las otras ramas
  (`labelEvidence` de `exitSignTest`, de las dos manos); si no, el primero.
  Antes votaba solo el primero del archivo: "Keep left onto I-94" en la
  bifurcacion de la Kennedy, que es la I-90 (Discord, 20-10). En las mismas
  450 rutas: 175 nombres cambian, 163 entre numeros de un mismo cartel; en
  los que se pueden juzgar, 509 -> 521 bien y 83 -> 71 mal.
  Un empate entre carteles distintos (cada uno paso `exitSignTest`) es un
  tramo compartido y gana la interestatal (I-35E si, I-72 Bus no), antes de
  `labelEvidence`: "onto US-36" por la I-72 / US-36 / US-67 al este de
  Jacksonville (Discord, 20-10). Un solo cartel con los dos escudos sigue
  con `labelEvidence` (puede ser el portico de una bifurcacion). En 450
  rutas de ATS cambian 8 nombres, todos de una US a la interestatal del
  mismo tramo; la regla para todo empate cambiaba 43, con 2 peores.
  Si tambien empatan en `labelEvidence` y dos carteles o mas traen los dos
  escudos, es el tramo compartido y gana la interestatal, salvo que empate
  su "Bus" (un enlace): I-435 / US-50 en Kansas City, I-82 / US-97 en
  Yakima; en 450 rutas de ATS, 7 nombres y ninguno peor. Con un cartel solo
  no: era el portico (Truckee, Cheyenne) o la US que se toma (Fort Smith,
  Columbia). De los 41 avisos "US con la interestatal despues", casi todos
  son la ruta que deja la autopista por la US (Spokane, Peoria).
  Los escudos de rutas historicas ("US-66 Hist", `sinHistoricas`) votan
  solo si no voto otra ruta, y desde dos: "onto US-66 Hist" en Kingman
  era la US-93 (en 450 rutas, 6 nombres: 3 mejores, ninguno peor, 3 sin
  escudos despues para juzgar). De las 9 "Bus" que quedan, 4 tienen 2 o 3
  carteles junto a la ruta (se va por el loop: Bozeman, Springfield MO) y 5
  un voto solo (Kirksville, Hot Springs); dejar sin nombre el voto solo
  contra 3 o mas muestras sin cartel de la salida da 11 mejores, 47 peores.
  Los carteles de ETS2 con la clave del juego (`traffic_rule.limit_80`, 399
  de velocidad) o un texto sin traducir (`@@fp_de_diesel@@`) no son nombres:
  `groupSignsByPoint` los saca al cargar (18 de 2124 avisos en 300 rutas).
  Cada muestra vota con el cartel mas cercano que pasa `exitSignTest` (no
  con el mas cercano a secas: si era de la otra mano tapaba al bueno y el
  aviso salia sin nombre), un cartel vota una vez aunque lo encuentren dos
  muestras, y en una bifurcacion los de los primeros
  `ROAD_SIGN_FORK_NEAR_M` (200 m) votan solo si no voto ninguno de mas
  adelante ("Keep right onto I-20" saliendo de la I-20 en Shreveport). Los
  de destino de ETS2 votan igual (`exitSignTest`, con la mano sacada de la
  corrida `p[6]`: negativa en el Reino Unido) y su respaldo no es de la
  otra mano (`lado`): una de cada cuatro ciudades nombradas quedaba atras
  ("toward TALLINN" saliendo de Tallinn). Medido el 21-10: ATS 266 -> 307
  bien, 76 -> 66 mal, 100 -> 69 sin nombre (de 448); ETS2 125 -> 53 atras,
  246 -> 306 adelante, 50 avisos mas sin nombre. Las rotondas no pasan por
  `exitSignTest` (en ETS2 casi no fallan: 6 de 53). Con el test desde la
  entrada a la salida cambian 95 nombres de rotonda en ETS2 sin ganar
  (adelante 307 -> 299, atras 53 -> 48, mas nombres locales: "centro",
  "Péage à 400 m"); en ATS los 9 que se pueden juzgar ya estaban bien.
- Recalculada parado (bajo `ROUTE_HEADING_MIN_KMH`), la ruta arranca en el nodo
  mas cercano: frente a una T es el del cruce, y sin nada antes el recorte lo
  borraba y no se avisaba ese giro (Discord, Gargamosch, 18-10, Rockford).
  `stoppedRouteLead` le antepone una entrada sobre el rumbo del camion si el
  nodo esta adelante y la ruta no sale de ahi para atras.
  Andando arranca en la proyeccion sobre el tramo del camion, que puede ser
  otro carril del prefab: a 1 o 2 m de un nodo esa cuerda iba para cualquier
  lado y el giro se ponia en el primer nodo del cruce, a 0 ft, y otro
  recalculo lo corria al siguiente ("Turn left onto US-85 in 0 ft" dos veces
  y la voz repitiendo, Cheyenne, Discord 22-10). A menos de 5 m del primer
  nodo arranca en el nodo con la misma entrada (`snapRouteStartToNode`),
  salvo que siga lo recorrido. Recalculando cada 5 m antes de cada giro en
  30 rutas por juego, los avisos falsos pasan de 14 a 11 en ATS y de 14 a 12
  en ETS2, sin los de sentido contrario; los que quedan ya estaban (el mismo
  giro en otro nodo de una cadena de cruces).
  La telemetria con el camion en 0,0 exacto es un dato sin posicion
  (`positionAtOrigin`, en `handleTelemetry`): la app lo tomaba como un salto,
  recalculaba desde 0,0 y otra vez al volver, sin lo recorrido.
  Si se recalcula sin desviarse (cambio el destino o un waypoint) y el camion
  sigue sobre la ruta de antes, se conservan lo recorrido (`routeBehind`) y
  el rumbo aunque este parado (`recalcOnRoute`): adentro de un cruce la ruta
  nueva arrancaba sin sus primeros nodos y el giro se perdia (1 de cada 5
  recalculos a menos de 35 m de un cruce con aviso; asi, 1 de cada 35). No
  recien calculada en el deposito ni al final del viaje.
- Lo recorrido (`routeBehind`) incluye el comienzo de la ruta
  (`passedRoutePoints`); el simulador y `check_avisos` lo arman igual.
- Se recalcula tambien al tomar la otra rama de una bifurcacion, sin esperar
  los 200 m de `OFF_ROUTE_THRESHOLD_M` (`offRouteBranch` en pure.js,
  `tookOtherBranch` en app.js, dos datos seguidos; reporte #7, 27-10). En
  Amarillo la ruta subia de la colectora a la rampa de la I-40 (-25691,21145)
  y el camion siguio por la colectora: van a 15 m a los 60 m y a 52 a los
  200, la app mostro el aviso siguiente de la I-40 y recalculo 260 m despues
  con la vuelta encima ("turn right in 0 ft"); asi, a los 63 m (la app con
  telemetria falsa, Playwright). Mira las otras salidas de los nodos de lo
  recorrido (200 m), cada una siguiendo lo mas derecho 300 m salvo que
  vuelva a la ruta: es esa si el camion va a 12 m o mas de la ruta (a la
  calzada, `routeDrawShift`: la autovia de una sola arista tiene el eje
  entre las calzadas), tres veces mas cerca de la rama, pasado 12 m por ella
  y con su rumbo (35 grados); parado (sin rumbo), nada. Si lo recorrido ya
  no tiene el nodo de antes de la bifurcacion (una arista larga), como se
  llega sale del ultimo tramo. Medido en 158 rutas de ATS, ETS2, Coast to
  Coast y ProMods (semilla 7): manejando 8.100 km sobre la ruta corrido
  -3,5, 0, 3,5 y 6 m, ningun recalculo de mas; tomando cada otra salida de
  cada cruce (3.098), salta en 3.023, mediana 36 m y p90 60 a 102 m (con los
  200 m, 1.073 en los primeros 300 m, mediana 225 m). Las que no saltan son
  tocos de 40 a 100 m que se apartan 12 a 17 m. Unos 4 us por dato.
- `tools/simular_navegacion.js` maneja rutas de las 17 variantes con el codigo
  de app.js y pure.js y lista sospechosos (escala, recalculos, avisos, voz,
  rotondas); `tools/dibujar_simulacion.py` dibuja cada uno. Correrlo antes y
  despues de tocar el ruteo o los avisos, con la misma `--semilla`.
  `--estados or,wa` (y `--destinos`) eligen rutas de esos estados; cada
  "turn" queda en `giros.json` con las otras salidas de su cruce.
  Tambien recalcula cada 10 m en los 120 m antes de cada aviso, sobre el
  carril y con el comienzo de la app (`recalcRouteStart`), y lista como
  `aviso_al_reves_tras_recalculo` / `aviso_distinto_tras_recalculo` lo que
  se muestra a menos de 150 m del cruce y no salio manejando sin recalcular:
  otra identidad, y la voz lo repite. Nadie lo miraba y asi entro la
  regresion de Cheyenne (0c0f37e). Con 60 rutas por juego y semilla 1, main
  antes del arreglo daba 146 recalculos malos de 3.477 en ATS y 254 de 4.983
  en ETS2 (57 y 70 avisos al reves); con el arreglo, 78 y 151 (7 y 3). Los
  que quedan son casi todos recalculando encima del nodo o el mismo giro en
  otro nodo de una cadena de cruces. `--antesDelGiro 0` lo saltea.

## Reportes de navegacion (25-10)

- Ajustes > "Report a navigation problem" (`navReportModal`; `navReportBody`,
  `navReportCredentials` y `navReportOutcome` en pure.js) manda lo que la
  persona elige (`NAV_REPORT_KINDS`) y escribe, mas el turn report entero,
  a POST /nav-reports del servicio de cuentas (repo truckdash-loginapp,
  tabla `nav_reports`, migracion 0018). Sin cuenta tambien; con cuenta queda
  de quien es, va en su exportacion y se borra con ella (`docs/privacy.html`
  lo dice). Techos: 5 por hora por IP (en memoria) y 200 por dia. La copia
  LAN entra solo a esa ruta y sin credenciales: la cookie va solo desde
  trucksim-dash.com. Si no sale (sin internet, la API vieja, un 400), la
  ventana ofrece copiarlo como antes: la web puede salir antes que la API.
- El turn report lleva la linea "Route:" (perfil, destino y waypoints,
  `route` de `turnReportText`): sin ella, reproducir el de Tonopah era
  adivinar la empresa hasta que la ruta pasara por los avisos.
- Se leen y resuelven en `docs/admin.html` (seccion "Navigation reports",
  GET y PATCH /admin/nav-reports con X-Admin-Key) y se arreglan de a tandas:
  con 10 abiertos o los viernes. "Copy open reports" los junta en un texto.
  Para reproducir uno, la ruta del aviso mas viejo al destino de "Route:",
  manejada con el codigo de la app (como `simular_navegacion`), y antes y
  despues del arreglo `check_avisos` y el simulador con la misma semilla. Al
  resolverlo, la nota lleva el PR. Los resueltos se borran a los 180 dias.
- Un tipo nuevo va en los dos lados a la vez (`NAV_REPORT_KINDS` y
  `reportes.TIPOS` de la API) y su texto en los 8 idiomas: la API rechaza
  con 400 un tipo que no conoce.
- Tambien se abre desde el link "Report navigation error" de arriba del mapa
  (`mapAboveBar`, `openNavReport`; oculto en pantalla completa y en cabina).
- Aviso de arreglado (26-10): cada reporte tiene una clave al azar (columna
  `token`, migracion 0019) que la app guarda con su numero en el
  dispositivo (`NAV_REPORTS_KEY`, `navReportsAdd`). Al abrir y cada 3 horas
  pregunta POST /nav-reports/status con las claves (sin cookie; la API solo
  da estado y fecha, y nada de un reporte con otra clave) y avisa una vez
  por cada "fixed" (`navReportsAfterStatus`: lo guardado se lee otra vez
  antes de avisar, por las otras pestanas). Duplicado y "won't fix" salen
  de la lista sin aviso: si un duplicado quedo arreglado con el otro,
  marcarlo "fixed" con la nota "duplicate of #N" para que le llegue. Con
  sesion, la pagina de la cuenta los lista con su estado (Ajustes,
  "Navigation reports", GET /user/nav-reports).

## Pendientes y decisiones (18-10)

- macOS: un usuario porto el plugin (dice que el juego en Mac lo carga) e
  hizo su propia app estilo CarPlay. Plan propio, por etapas: el plugin con
  `shm_open` o un archivo en vez de `CreateFileMapping`
  (`plugin/scs-telemetry/src/sharedmemory.cpp`), compilado en un runner
  macOS para Intel y Apple Silicon; `telemetry_compat.py` y
  `plugin_installer.py` con los caminos de Mac; beta desde el codigo con
  `client.py` (sin overlay ni botonera); despues un `.app`. El autor del
  port (uawannacry, PR #87) lo probo con el juego en su Mac. El plugin ya
  compila fuera de Windows (`plugin/build.sh`, sus cambios de #87) y la
  .dylib universal sale de "Build plugin" con plataforma macos, fijada en
  `PLUGIN_DYLIB_SHA256` (21-10); el cliente de Mac sigue en #87.
- TruckersMP (23-10): la DLL es tambien plugin de TMP (`truckersmp_init`,
  Client SDK v1.1.0 en `plugin/truckersmp_sdk/`) y publica los jugadores
  cerca en `Local\TruckDashTMP` (`truckersmp_players.hpp`, revision 1). El
  cliente los lee una vez por segundo (`tmp_players.py`) y los manda como
  `tmpPlayers` (los 32 mas cercanos); la app los dibuja con flecha y nombre
  (`tmpPlayersUpdate`: vencen a los 5 s sin otra lista; ajuste
  `showTmpPlayers`, prendido). El relay no los mira: van solo a las pestanas
  del codigo, nunca al mapa en vivo ni al convoy (`docs/privacy.html` lo
  dice). El rumbo sale del cuaternion (frente -Z) y no se probo en el juego.
  `tools/probar_plugin.py` lo prueba con un TMP falso. Si cambia la
  disposicion del bloque, cambia en los dos lados y sube la revision
  (`test_tmp_players.py` compara el .hpp con el lector).
- Comandos por voz: siguen en `exploring` en `docs/data/roadmap.json` a
  proposito (el maintainer lo dejo "en evaluacion"). La app habla, no escucha.
- Las flechas de carril (con giro o sin aviso) no tienen ajuste para
  apagarlas. Si se agrega, el texto va en todos los idiomas de la app.
- La guia no menciona las flechas sin aviso; su frase de los carriles sigue
  siendo cierta.
- Del barrido con simulaciones del 21-10, sin arreglar en la web (piden
  regenerar el grafo o una decision):
  - Zonas del grafo sin salida o sin entrada (carriles de prefab que
    quedaron de un solo sentido). La peor, Volkhov en ETS2 (289 nodos a 6 km
    de San Petersburgo, 11 empresas de Volkhov y Kirishi): los seis carriles
    del borde entran y ninguno sale (cruces cerca de (64750,-59810) y
    (65218,-56174)). Sin entrada: hs_mkt de Durango (ATS), chm_che_plnt de
    Chattanooga (Coast to Coast), bn_farm de Mezquital (Reforma); sin salida:
    Derramadero y Guadalupe y Calvo (Reforma), nbfc de Canterbury (ProMods +
    RusMap + Roex), Canakkale (Roex). Sin empresas pero en rutas: Folkestone
    (ProMods, 160 nodos), y en ATS pares de zonas con 1,6 a 2,2 km de
    autopista a 90 km/h cada una en Champaign, Marion y Effingham (Illinois:
    los cruces de la I-57 con la I-74, la I-24 y la I-70), que ninguna ruta
    puede usar. `simular_navegacion` no las ve: `tools/zonas_sin_salida.js
    [variante ...]` las lista con sus empresas (despues de regenerar un
    grafo, lo ideal es 0 con empresas). Mientras no se regenere el grafo,
    `findRouteWith` arranca o termina en el nodo mas cercano del que se sale
    o al que se llega (`routeReachability`, solo si no hay camino): la ruta
    empieza hasta 1,4 km mas alla (Kirishi) en vez de no haber ruta.
  - ETS2: pk_medved_ru y eskadra de Veliky Novgorod quedan a 380-480 m del
    grafo (la playa no esta en el grafo): la ruta termina afuera. Las cajas
    de ciudad de mas de 4 km (Estambul, Barcelona, una al lado de Mitilini)
    parecen de verdad; no se midio contra el GPS del juego.
  - Rotondas compactas de un solo prefab en ETS2: 11 de 29 sin reconocer (las
    curvas internas quedaron de doble mano en el grafo). Lo robusto es que el
    constructor marque los prefabs de rotonda por su nombre.
  - Nombres (ATS, 63 mal de 447): sobre todo empates entre un cartel cerca
    del giro y otro mas adelante; que gane el de adelante da +8/-2 contra los
    escudos de despues y +2/-4 con los de las dos manos, sin regla segura.
    Tampoco el I-255 / US-67 de St. Louis (un cartel de la US de mas) ni el
    I-49 / US-82 de Shreveport (los de la autopista quedan a la izquierda).
  - "turn right" en Cedar Rapids -> Kirksville (ATS, 17744,-11442), donde la
    ruta es la rama izquierda de la division al final de un rulo: los 60 m
    de entrada toman la curva del rulo (+38) y la otra rama va a +71, con la
    ruta a +8 en el cruce. Medirlo como bifurcacion cuando la otra salida
    dobla mas para el mismo lado y la ruta dobla menos de 15 grados en el
    cruce lo calla, pero en 1.800 rutas sacaba avisos en otros 6 lugares,
    entre ellos dos que estan bien (la esquina de Fayetteville, "turn right"
    en Copenhague -> Odense): sin regla segura.
  - "turn left" en El Dorado -> Hot Springs (ATS, 13394,24184), una curva de
    36 grados donde empieza una autovia: no se calla porque las dos calzadas
    y el retorno hacen un lazo de un sentido de menos de 350 m y
    `entersRing` lo toma por la entrada a una rotonda. Pedirle al lazo lo de
    `detectRoundabout` (sin lados rectos largos) lo calla, pero en 1.800
    rutas cambia avisos en otros 3 lugares: el "turn left" de Stockton pasa
    a "keep left" 70 m antes, en otro cruce. Sin regla segura.
- Propuestas de afuera: pedir el codigo en un repo publico antes de mirar
  o correr nada; los forks y ports, con su propio nombre, relay y mapas
  (README y terminos). Registrar la marca quedo como sugerencia.

## Modales, overlay de OBS y accesibilidad (13-10)

- Un modal nuevo de la app es un `.settingsOverlay` con su `h3` y un boton
  `data-modal-close`, escrito en `docs/app/index.html` (`MODALS` los junta
  al cargar; uno creado despues por JS queda afuera): asi toma el foco, lo
  encierra (`focusTrapTarget`), cierra con Escape y lo devuelve al cerrar.
- Animaciones nuevas: dentro de `prefers-reduced-motion` tienen que
  apagarse (cada CSS tiene su bloque). Objetivos tactiles de 24 px minimo.
- La ventana flotante (Document Picture-in-Picture) guarda el tamano que le
  deja el usuario, con y sin mapa (`truckdash_pip_size_text` / `_map`), y
  abre con ese. La posicion no la puede elegir la pagina (`moveTo` no hace
  nada): Chrome la recuerda solo en la misma pestana y si se pide el mismo
  tamano que la vez anterior. Por eso `pipRequestSize` repite lo pedido
  (sessionStorage `truckdash_pip_open`) si se cerro en el mismo modo; pedir
  siempre el tamano guardado la mandaba a la esquina (medido en Chrome,
  21-10). En otra pestana o despues de reiniciar, el tamano si y la esquina
  de Chrome.
- El overlay de OBS (`/overlay/`) entra al relay con `?role=obs`; el relay
  avisa `obs_overlay` en `session_state` y la pestana lider manda `nav_hud`
  si hay overlay del juego O de OBS. Campos nuevos de `nav_hud` son
  opcionales: el HUD de OBS y el del cliente los ignoran si no los conocen.

## App de Android (13-10)

- `android/` es una TWA: la app de Play es la web misma. Un link nuevo que
  pida plata (donar) lleva `data-donate`: adentro de la app se oculta
  (`.twa [data-donate]`, el script del `<head>` de app, cuenta, guia y
  landing marca `html.twa`), porque Play no deja mandar a pagar afuera.
- Una pagina nueva a la que se llega desde la app necesita ese script si
  tiene algo para ocultar. Para que algo abra dentro de la app, mismo
  origen y sin `target="_blank"` cuando `html.twa`.

## Supuestos que ya rompieron cosas (10-10-2026)

Revisar cada cambio contra esta lista:

1. **Mas de un dispositivo o pestana por sesion.** Celular + PC + otra
   pestana abiertos a la vez: voz, viajes guardados, nav_hud y live route
   salen solo de la pestana lider (`isLeaderTab`); un estado que es uno por
   sesion (compartir posicion, convoy) se manda explicito, nunca como toggle.
2. **Pestanas que abren despues.** El cliente solo manda client_status cuando
   algo cambia: lo que la web lee de ahi tiene que guardarlo el relay para el
   session_state (`test_contrato_client_status`), y el servidor LAN igual.
3. **Semantica del SDK.** `jobMarket` no es solo cargo_market: en freight
   market y external_* el GPS del juego apunta primero al remolque, no al
   destino. `is_cargo_loaded` es true fuera de cargo_market. `sdkActive` solo
   se apaga al salir bien del juego: un cuelgue se detecta por `renderTime`.
4. **Datos de mapa incompletos.** Mods y DLC traen ciudades que el parser no
   lista; la web no debe depender de que un token tenga nombre ni de que el
   usuario escriba las tildes (`foldText`).
5. **Clientes viejos.** La web y el relay hablan con versiones viejas del
   cliente durante semanas: un campo nuevo es opcional y su ausencia tiene
   un comportamiento razonable (ej. OFFMAP_GRACE_MS).
6. **Entornos raros.** Proton/Wine (sin overlay), red Publica de Windows
   (LAN bloqueada), localStorage que tira excepcion (`lsGet`/`lsSet`), VPN.
7. **Reconexiones.** El relay se redespliega y pierde las sesiones; una
   conexion nueva del mismo cliente reemplaza a la vieja (4409) y el
   `finally` de la vieja no debe borrar el estado de la nueva. Una
   conexion puede quedar medio abierta sin onclose (WiFi mala): con el
   juego en vivo, 10 s sin mensajes es un socket muerto (`staleWatchArmed`).
8. **Estados que no se cumplen solos.** Un waypoint, una parada o cualquier
   estado temporal necesita una salida automatica (llegar, cargar
   combustible, vencer) y una manual a la vista. La parada de estacion que
   no se daba por alcanzada hacia volver la ruta para atras, y desde que se
   guarda 12 h sobrevivia a recargar (Discord, 10-10).
9. **Varias pestanas escriben el mismo localStorage.** Escribir solo lo que
   cambio esta pestana (`settingsChangedKeys`), nunca todo lo que tiene en
   memoria.

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

- El grafo de una variante son cuatro archivos: `.bin` (v2, web vieja),
  `-v3.bin`, `-lanes.bin` (carriles por arista, `decodeLanesBin`) y
  `-times.bin` (decimas de segundo por arista, `decodeTimesBin`). Si se
  regenera el grafo, se regeneran y suben los cuatro juntos y se sube
  `ROUTE_GRAPH_V3_REV` en `app.js`; si solo cambian los carriles,
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
- La app rutea sola y del GPS del juego solo sabe cuanto falta
  (`routeDistanceKm`). Si nuestra ruta no coincide con eso (mas de 5 % y de
  5 km, con 40 km o mas por delante, `routeGameAgreement`), se buscan hasta 3
  alternativas encareciendo las aristas de la anterior (`routeAlternatives`)
  y gana la que coincide a menos de 1,5 % sin ser mas de 5 % mas lenta
  (`pickRouteLikeGame`, `routeLikeGame` en app.js). Solo con destino exacto
  (`dest`/`pickup` sin `approx`) y sin waypoints; si a los 3 datos sigue sin
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
  esas elecciones en ATS.
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
- La voz habla de a una frase (`voiceQueueAction`): una nueva espera a que
  termine la que suena, salvo un aviso en el punto contra uno anticipado.
- Un giro sin otro camino se calla (`quiet` de `detectManeuver`), salvo la
  entrada a un anillo (`ringThrough`): solo tramos de un sentido y sin
  repetir nodos. Con cualquier camino dirigido, toda esquina con un brazo
  muerto de prefab parecia una rotonda (Discord, 17-10, Oregon).
  Tampoco la esquina en escuadra (60 a 120 grados entre tramos rectos) de
  una cruz con dos brazos muertos: la calle se termina y hay que doblar
  (salida 115 de Rockford, Discord 18-10, Gargamosch). Con un brazo muerto o
  con la calle curvandose (sierras, zigzags), callada.
- Los puntos de la curva de un prefab cortan el grupo de nodos de cruce
  (`junctionClusterEnd`). Si un grupo no avisa nada o se calla,
  `junctionManeuver` mira el prefab entero (60 m): partida, una T se callaba.
  Juntar siempre no: mezcla el giro con la curva de la calle de despues.
  Por los puntos de la curva el tramo puede pasar los 50 m del corte hasta
  esos 60 m (la cruz de Modesto con dos brazos muertos, 21-10); un tramo sin
  puntos de curva de 50 m o mas sigue cortando: son dos prefabs.
- Una bifurcacion se deja al giro que viene a menos de 250 m solo si ese
  giro se anuncia (`turnAfterFork`): la curva callada de una rampa que
  termina en una T sin otra salida tapaba la salida 50 de la I-25 en
  Walsenburg (ATS, 18-10) y no se decia nada.
  Tampoco si el giro es para el otro lado despues de una salida de una mano
  (`salidaDeUnaMano`): salir a la derecha y doblar a la izquierda al final de
  la rampa avisa la salida primero (salida 115 de Rockford, 18-10).
- Una salida que a los 150 m vuelve por donde se vino (la calzada contraria
  donde termina una autovia) no es rama de una bifurcacion (`forkInCurve`).
- Dos calzadas de un sentido que se separan casi paralelas (la colectora al
  lado de la autopista) no llegan a los grados de una bifurcacion: si a 100 m
  ya van a 10 m y la ruta toma la que se abre, es "keep" (`parallelFork`).
  Con carriles manda la flecha del juego de la rama de la ruta (`laneTurn`
  en el ctx): sin flecha a un costado, la ruta es la autopista y no se avisa.
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
  Si se recalcula sin desviarse (cambio el destino o un waypoint) y el camion
  sigue sobre la ruta de antes, se conservan lo recorrido (`routeBehind`) y
  el rumbo aunque este parado (`recalcOnRoute`): adentro de un cruce la ruta
  nueva arrancaba sin sus primeros nodos y el giro se perdia (1 de cada 5
  recalculos a menos de 35 m de un cruce con aviso; asi, 1 de cada 35). No
  recien calculada en el deposito ni al final del viaje.
- Lo recorrido (`routeBehind`) incluye el comienzo de la ruta
  (`passedRoutePoints`); el simulador y `check_avisos` lo arman igual.
- `tools/simular_navegacion.js` maneja rutas de las 17 variantes con el codigo
  de app.js y pure.js y lista sospechosos (escala, recalculos, avisos, voz,
  rotondas); `tools/dibujar_simulacion.py` dibuja cada uno. Correrlo antes y
  despues de tocar el ruteo o los avisos, con la misma `--semilla`.
  `--estados or,wa` (y `--destinos`) eligen rutas de esos estados; cada
  "turn" queda en `giros.json` con las otras salidas de su cruce.

## Pendientes y decisiones (18-10)

- macOS: un usuario porto el plugin (dice que el juego en Mac lo carga) e
  hizo su propia app estilo CarPlay. Plan propio, por etapas: el plugin con
  `shm_open` o un archivo en vez de `CreateFileMapping`
  (`plugin/scs-telemetry/src/sharedmemory.cpp`), compilado en un runner
  macOS para Intel y Apple Silicon; `telemetry_compat.py` y
  `plugin_installer.py` con los caminos de Mac; beta desde el codigo con
  `client.py` (sin overlay ni botonera); despues un `.app`. Falta quien lo
  pruebe con el juego en una Mac. Sin empezar.
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
  - "Shortest" en la app con el GPS del juego en "fastest": `routeLikeGame`
    corre igual y puede cambiar la ruta mas corta por una como la del juego.
  - El overlay del juego (`client/overlay.py`) con el descanso en 0 (fatiga
    apagada) dice "parar ya"; la web y el panel lo toman como sin dato
    (`restMinutesOf`, `createFatigue`). Un test del cliente lo fija asi
    (`test_overlay.py`): decidir cual vale.
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

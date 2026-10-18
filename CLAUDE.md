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
- Un archivo de mapa nuevo es opcional en la web: sin el, la app hace lo
  de antes (sin flechas de carril, por ejemplo), nunca deja de rutear.
- Desde un navegador, el relay (`SoloOrigenesPropios` en backend/main.py)
  solo atiende a trucksim-dash.com y a la copia LAN del cliente
  (`http://<ip>:27765`, localhost, IPs privadas); sin header Origin (cliente,
  curl) no mira nada. Una pagina en otro dominio no conecta:
  `TRUCKDASH_ORIGENES=avisar` en Railway la deja pasar y anota el origen.
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
- El ruteo (`findRouteWith`) es un A* por aristas sin vueltas en U en los
  nodos (`findArcRoute` en pure.js): el estado es la arista de llegada y no
  se sale a mas de 150 grados de ella, salvo en ferry/tren o si no queda
  otra salida. Si asi no hay camino, `nodeRoutePath` (el A* por nodos de
  antes). `tools/check_avisos.js` saca las dos de app.js por nombre.
  El costo es `routeEdgeCost` (segundos + 1 ms por metro: los segundos del
  grafo son enteros y sin desempate la ruta hacia una V por un brazo del
  cruce). Andando, la ruta arranca en el tramo del camion en su sentido
  (`startArcForHeading`, `routeStartHeading`), no en el nodo mas cercano.
- Lo que falta y la distancia al giro se miden sobre la ruta entera
  (`routeMeters` de `createCityScale`, con `currentRouteFull`), nunca solo
  sobre la ruta recortada al camion: asi saltaban 5 km al entrar al hueco
  entre dos cajas de ciudad.
- Escala de ciudad (`createCityScale`): cada caja cuenta 30 m mas de cada
  lado (`CITY_MARGIN_M`) y el hueco entre dos cajas va a 1:20
  (`CITY_GAP_M` = 0). Sale de medir el GPS del juego con la posicion del
  "Copy turn report" (Sidney NE, 17-10): antes de mover esos numeros,
  medir asi otro lugar.
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
- Los puntos de la curva de un prefab cortan el grupo de nodos de cruce
  (`junctionClusterEnd`). Si un grupo no avisa nada o se calla,
  `junctionManeuver` mira el prefab entero (60 m): partida, una T se callaba.
  Juntar siempre no: mezcla el giro con la curva de la calle de despues.
- Una salida que a los 150 m vuelve por donde se vino (la calzada contraria
  donde termina una autovia) no es rama de una bifurcacion (`forkInCurve`).
- Dos calzadas de un sentido que se separan casi paralelas (la colectora al
  lado de la autopista) no llegan a los grados de una bifurcacion: si a 100 m
  ya van a 10 m y la ruta toma la que se abre, es "keep" (`parallelFork`).
  Con carriles manda la flecha del juego de la rama de la ruta (`laneTurn`
  en el ctx): sin flecha a un costado, la ruta es la autopista y no se avisa.
- Lo recorrido (`routeBehind`) incluye el comienzo de la ruta
  (`passedRoutePoints`); el simulador y `check_avisos` lo arman igual.
- `tools/simular_navegacion.js` maneja rutas de las 17 variantes con el codigo
  de app.js y pure.js y lista sospechosos (escala, recalculos, avisos, voz,
  rotondas); `tools/dibujar_simulacion.py` dibuja cada uno. Correrlo antes y
  despues de tocar el ruteo o los avisos, con la misma `--semilla`.
  `--estados or,wa` (y `--destinos`) eligen rutas de esos estados; cada
  "turn" queda en `giros.json` con las otras salidas de su cruce.

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

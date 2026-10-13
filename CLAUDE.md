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

- El grafo de una variante son tres archivos: `.bin` (v2, web vieja),
  `-v3.bin` y `-lanes.bin` (carriles por arista, `decodeLanesBin`). Si se
  regenera el grafo, se regeneran y suben los tres juntos y se sube
  `ROUTE_GRAPH_V3_REV` en `app.js`; si solo cambian los carriles,
  `ROUTE_LANES_REV`. Al subir `ROUTE_GRAPH_V3_REV` o la version de ATS en
  `variants.js`, correr `python tools/build_demo_route.py`.
- La regla de cache "Mapas R2" de Cloudflare guarda tambien los 404, por
  variante de compresion: nunca pedir desde la web un archivo antes de que
  este en R2. Si paso, subir el numero de su `?` (paso con `l=1` el 13-10).
- Un archivo de mapa nuevo es opcional en la web: sin el, la app hace lo
  de antes (sin flechas de carril, por ejemplo), nunca deja de rutear.

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

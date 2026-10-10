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
  de `docs/{app,account,dash}/index.html` y del APP_SHELL (mismo token en todos).
- La logica de decision va en `docs/app/pure.js` con su test, no suelta en
  app.js: la mayoria de los bugs del 10-10 estaban en app.js, donde no hay tests.
- Cambios de cliente: anotarlos en CHANGELOG.md (seccion de la proxima
  version) y no publicar release sin que lo pida el maintainer. Web y relay
  salen apenas pasa CI.

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
   `finally` de la vieja no debe borrar el estado de la nueva.

# Relay en vivo

`main.py` es el relay en tiempo real entre el cliente de la PC (que manda la
telemetría por WebSocket) y la web (que la recibe con el mismo código de
pairing). También arma el mapa de "otros jugadores", el mapa en vivo público
(`/live/`) y los convoys.

```bash
pip install -r requirements-dev.txt
python -m pytest test_main.py -q
uvicorn main:app --reload
```

## Capacidad

Medido el 2026-10-06. Es lo que hay que mirar primero si crece el uso.

**Todo vive en memoria, en un solo proceso.** Las sesiones, los viewers y
las posiciones están en diccionarios de `main.py`. Por eso no se puede
levantar más de un proceso sin más: el cliente y la web de una misma sesión
tienen que caer en el mismo, y los "otros jugadores" tienen que verse entre
procesos. Un redeploy borra todo; los clientes reconectan con su código y la
sesión se recrea.

**Cada cliente manda 4 mensajes por segundo** (`CLOUD_SEND_INTERVAL_SECONDS`
en `client/client.py`) y el relay hace `json.loads` de cada uno en el mismo
event loop. El costo por mensaje no está medido: el estimado es de unos
500–1.000 clientes conectados a la vez por proceso.

### Broadcast de otros jugadores

Cada 2 s (`LIVE_POSITIONS_BROADCAST_INTERVAL_SECONDS`), cada sesión que
comparte su posición y tiene la web abierta recibe a todos los demás
conductores de su mismo mapa. Mientras dura, el event loop no hace otra cosa:
tampoco reenvía telemetría.

| Conductores en el mismo mapa | Antes | Ahora |
|---|---|---|
| 500 | 435 ms por tick | 10 ms |
| 1.000 | 2.062 ms (el relay entero tomado) | 148 ms |
| 2.000 | 8.562 ms | 944 ms |

Antes se armaba para cada sesión una lista de dicts de todos los demás y se
hacía `json.dumps`: cuadrático en Python. Ahora cada jugador se serializa una
vez por tick, la lista se arma una vez, y cada sesión recibe esa lista con
su propio pedazo recortado por posición (ver `broadcast_live_positions`).
Las coordenadas van redondeadas al decímetro.

Se midió con N sesiones en el mismo mapa, cada una con un viewer falso,
llamando a `broadcast_live_positions()` y midiendo cuánto tarda.

### Lo que queda

**Lo que cuesta ahora es copiar bytes, y eso es el diseño.** Cada mensaje
lleva a todos los demás: con 1.000 conductores son ~48 KB por viewer cada
2 s, unos 24 MB/s de salida si todos tienen la web abierta. Los próximos
pasos, si hace falta:

1. **Mandar solo los jugadores cercanos** (por radio o por la porción del
   mapa que se está viendo). Baja la CPU y la salida juntas. Es una decisión
   de producto: hoy se ve a todos en todo el mapa.
2. **Repartir el relay en varios procesos.** Necesita sacar el estado de la
   memoria (o rutear cada código siempre al mismo proceso) y compartir las
   posiciones entre procesos. Es un rediseño.

Para los límites de la API de cuentas (viajes, topes, backup), ver
`capacidad.md` en `truckdash-loginapp`.

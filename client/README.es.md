# Truck Dash — Cliente local

Este es el companion local de **Truck Dash**, un tablero en tiempo real
gratuito para Euro Truck Simulator 2 y American Truck Simulator.

## Qué hace este programa (y qué no hace)

- Lee la telemetría en vivo del juego (posición, velocidad, combustible,
  carga, etc.) a través del **SDK de telemetría oficial de SCS Software**,
  mediante un segmento de memoria compartida (`Local\SCSTelemetry`) que el
  propio juego crea cuando el plugin del SDK está instalado.
- Envía esos datos por una conexión WebSocket a un backend de relay
  (alojado en Railway), que los reenvía a tu navegador en
  [trucksim-dash.com](https://trucksim-dash.com).
- Abre tu navegador predeterminado apuntando a la web de Truck Dash, con un
  código de pairing de un solo uso para que solo tu propia sesión de
  navegador reciba tus datos.

**No hace lo siguiente**:
- No lee, modifica ni accede a ningún archivo de tu computadora aparte de
  la memoria compartida de telemetría del juego y sus propios archivos de
  programa.
- No requiere permisos de administrador.
- No recolecta ni guarda información personal. La telemetría se reenvía en
  vivo y no queda guardada del lado del servidor más allá de la sesión
  actual.
- No modifica el juego, tus partidas guardadas, ni interactúa con ningún
  sistema anti-trampas (ni ETS2 ni ATS tienen anti-cheat; la telemetría es
  una función oficialmente soportada por el juego).

## Código fuente

Todo el código fuente del cliente, el backend y la web está en este
repositorio, así que vos (o cualquiera) puede leer exactamente qué hace
antes de correrlo. Ver [`client.py`](client.py) y
[`tray_client.py`](tray_client.py) para el cliente en sí.

## Cómo correrlo

Descargá la última versión desde la
[página de Releases](https://github.com/Nethercap/truck-companion/releases),
descomprimila, y corré `TruckDash.exe`. Sin instalador, sin permisos de
administrador, sin necesitar Python — todo lo necesario ya viene incluido.

También necesitás tener instalado una vez el plugin del SDK de telemetría
de SCS en la carpeta de instalación de tu juego — ver el
[README principal del repositorio](../README.md) para ese paso.

## Compilarlo vos mismo

Si preferís no correr un `.exe` precompilado, podés correr el cliente
directo desde el código fuente (requiere Python 3.10+):

```
pip install -r requirements.txt
python tray_client.py
```

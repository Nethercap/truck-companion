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
- A pedido (ventana de Setup), copia el plugin del SDK de telemetría de SCS
  en la carpeta `bin\win_x64\plugins\` del juego, y lee la lista de
  bibliotecas de Steam para encontrar dónde está instalado el juego.
- A pedido, aprieta teclas en la ventana del juego cuando tocás un botón en
  la botonera del tablero, usando las asignaciones de tu propio `controls.sii`.

**No hace lo siguiente**:
- No lee, modifica ni accede a ningún archivo de tu computadora aparte de
  la memoria compartida de telemetría del juego, el `controls.sii` del juego
  (solo lectura, para la botonera), el archivo del plugin que instala a
  pedido, y sus propios settings y log al lado del `.exe`.
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

La primera vez se abre una ventana de **Setup & status** (la podés volver a
abrir cuando quieras desde el ícono de la bandeja). Encuentra tu instalación
de ETS2 / ATS a través de Steam e instala el plugin del SDK de telemetría de
SCS en el juego por vos con un click
(`<juego>\bin\win_x64\plugins\scs-telemetry.dll`). Reiniciá el juego si
estaba abierto. ¿Instalación fuera de Steam? Usá "Add game folder..." y
elegí la carpeta del juego.

La misma ventana muestra el estado en vivo (esperando el juego / arriba del
camión / en vivo), tu código de pairing para el celular, una opción para
**iniciar Truck Dash con Windows** (el tablero se abre solo cuando arranca
el juego), y actualizaciones con un click cuando sale una versión nueva.

### Windows SmartScreen ("aplicación no reconocida")

El `.exe` no tiene firma digital (los certificados cuestan dinero), así que
la primera vez Windows puede mostrar "Windows protegió tu PC". Tocá **Más
información → Ejecutar de todas formas**. Cada release lo compila GitHub
Actions desde el código fuente del tag y lista el SHA-256 de los archivos
para que verifiques lo que bajaste — o corrélo desde el código fuente (más
abajo).

### Instalación manual del plugin

Si preferís copiar el plugin vos mismo: bajalo de
[RenCloud/scs-sdk-plugin releases](https://github.com/RenCloud/scs-sdk-plugin/releases)
y copiá **solo el archivo `Win64\scs-telemetry.dll`** en la carpeta de
instalación de tu juego, dentro de `bin\win_x64\plugins\` (creá esa carpeta
`plugins` si no existe). El error más común es dejar el `.dll` directo en
`bin\win_x64\` en vez de la subcarpeta `plugins\`. El cliente trae el mismo
archivo adentro (`vendor/scs-telemetry.dll`, licencia MIT).

Si el tablero sigue sin mostrar datos, hacé click derecho en el ícono de la
bandeja y elegí **"Show log file (troubleshooting)"** — te va a decir si el
plugin llegó a detectarse.

### Error de SSL "certificate has expired" al arrancar

Si el log muestra `SSLCertVerificationError: certificate has expired`
cuando el cliente intenta pedir un código de pairing, es un problema de tu
PC, no de los servidores de Truck Dash (nuestro certificado es válido —
podés comprobarlo vos mismo abriendo
https://truck-companion-production.up.railway.app/health en el navegador y
haciendo click en el candado). Las causas más comunes, en orden de
probabilidad:

1. **Tu antivirus está interceptando el tráfico HTTPS.** Kaspersky, ESET
   NOD32 y Avast son los más comunes — vuelven a firmar las conexiones HTTPS
   con su propio certificado, y si ese certificado está mal configurado,
   aparece exactamente este error. Probá desactivar temporalmente el
   "escaneo HTTPS" / "escaneo SSL/TLS" de tu antivirus (no el antivirus
   entero) y reintentá.
2. **El reloj de tu sistema está mal.** Aunque tengas "configurar hora
   automáticamente" activado, puede desincronizarse si hace tiempo que no
   sincroniza. Verificá que la fecha y hora sean realmente correctas (no
   solo que esté en "automático").

## Compilarlo vos mismo

Si preferís no correr un `.exe` precompilado, podés correr el cliente
directo desde el código fuente (requiere Python 3.10+):

```
pip install -r requirements.txt
python tray_client.py
```

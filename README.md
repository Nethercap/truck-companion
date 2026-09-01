# Truck Dash

A free, real-time companion dashboard for **Euro Truck Simulator 2** and
**American Truck Simulator**: live position on a real map, live route
guidance, speed/limit, cargo, fuel, wear, and more — right in your browser,
no login required.

**Web app:** [trucksim-dash.com](https://trucksim-dash.com)

## How it works

```
[ETS2/ATS + SCS Telemetry SDK plugin]
        (shared memory, local)
[Local client .exe]  --WebSocket-->  [Relay backend on Railway]  --WebSocket-->  [Your browser]
```

Since browsers can't read another process's shared memory, a small local
client bridges the game's telemetry to the web app. See
[`client/README.md`](client/README.md) (English) or
[`client/README.es.md`](client/README.es.md) (Español) for exactly what
that client does and does not do.

## Repository layout

- [`client/`](client/) — local Python client that reads the game's telemetry
  and relays it (`client.py`, plus `tray_client.py` for the packaged
  system-tray `.exe`).
- [`backend/`](backend/) — FastAPI relay backend (pairing + WebSocket relay),
  deployed on Railway.
- [`docs/`](docs/) — the public web app and landing page, served via GitHub
  Pages at trucksim-dash.com. Map tiles and route graphs (~800MB) are hosted
  separately on Cloudflare R2, not in this repo.

## Setting up the game (one-time)

1. Download the SCS telemetry SDK plugin from
   [RenCloud/scs-sdk-plugin releases](https://github.com/RenCloud/scs-sdk-plugin/releases)
   (the `.zip` under the latest release's Assets) — see the
   [plugin's own README](https://github.com/RenCloud/scs-sdk-plugin) too if
   anything below is unclear.
2. Copy **only the `scs-telemetry.dll` file** (not the whole downloaded
   folder/zip) into your game's install folder, inside
   `bin\win_x64\plugins\` (create that folder if it doesn't exist). The
   `.dll` has to sit directly inside `plugins\`, for example:
   `...\Euro Truck Simulator 2\bin\win_x64\plugins\scs-telemetry.dll`
3. Do the same for American Truck Simulator if you play both.
4. If the dashboard stays stuck on "waiting for telemetry" even after
   driving for a bit, open the tray icon's **"Show log file (troubleshooting)"**
   menu item — it'll show whether the plugin was even detected.

## Running the client

Download the latest build from the
[Releases page](https://github.com/Nethercap/truck-companion/releases),
unzip it, and run `TruckDash.exe`. It opens your browser automatically,
already connected — no manual setup needed. See
[`client/README.md`](client/README.md) for exactly what it reads and sends.

## Running everything locally (for development)

```
# backend
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --port 8123

# client (point it at your local backend)
cd client
pip install -r requirements.txt
python tray_client.py --backend ws://127.0.0.1:8123
```

The web app (`docs/app/index.html`) can be opened directly, or served with
`python -m http.server` from inside `docs/`. Map tiles under `docs/maps/`
are not included in this repo (see [Map assets](#map-assets) below).

## Map assets

The real map tiles and road-network graphs used for live position and route
drawing are generated from the game's own files using
[`ts-map`](https://github.com/dariowouters/ts-map) (tiles) and
[`truckermudgeon/maps`](https://github.com/truckermudgeon/maps) (route
graph), then hosted on Cloudflare R2 rather than committed to this repo
(they're roughly 800MB combined for both games). The web app fetches them
from `maps.trucksim-dash.com`.

## License / transparency

This project reads only what the SCS Telemetry SDK exposes and does not
modify the game in any way. All source code — client, backend, and web — is
in this repository for anyone to review.

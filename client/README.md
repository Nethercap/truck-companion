# Truck Dash — Local Client

This is the local companion for **Truck Dash**, a free real-time dashboard for
Euro Truck Simulator 2 and American Truck Simulator.

## What this program does (and does not do)

- It reads live telemetry from the game (position, speed, fuel, cargo, etc.)
  through **SCS Software's official Telemetry SDK**, via a shared-memory
  segment (`Local\SCSTelemetry`) that the game itself creates when the SDK
  plugin is installed.
- It sends that data over a WebSocket connection to a relay backend
  (hosted on Railway), which forwards it to your browser at
  [trucksim-dash.com](https://trucksim-dash.com).
- It opens your default browser pointed at the Truck Dash web app, with a
  one-time pairing code so only your own browser session receives your data.

**It does not**:
- Read, modify, or access any files on your computer other than the game's
  telemetry shared memory and its own program files.
- Require administrator privileges.
- Collect or store any personal information. Telemetry is relayed live and
  is not saved anywhere server-side beyond the current session.
- Modify the game, your save files, or interact with any anti-cheat system
  (neither ETS2 nor ATS have anti-cheat; telemetry is an officially
  supported feature).

## Source code

All of the source code for the client, backend, and web app is in this
repository, so you (or anyone) can read exactly what it does before running
it. See [`client.py`](client.py) and [`tray_client.py`](tray_client.py) for
the client itself.

## How to run it

Download the latest release from the
[Releases page](https://github.com/Nethercap/truck-companion/releases),
unzip it, and run `TruckDash.exe`. No installation, no admin rights, no
Python required — everything needed is bundled inside.

You'll also need the SCS Telemetry SDK plugin installed once in your game's
installation folder — see the main [repository README](../README.md) for
that step.

## Building it yourself

If you'd rather not run a pre-built `.exe`, you can run the client directly
from source (requires Python 3.10+):

```
pip install -r requirements.txt
python tray_client.py
```

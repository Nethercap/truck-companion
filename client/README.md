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
- On request (Setup window), it copies the SCS Telemetry SDK plugin into the
  game's `bin\win_x64\plugins\` folder, and reads Steam's library list to
  find where the game is installed.
- On request, it presses keys in the game window when you tap a button in
  the dashboard's button box, using the bindings from your own `controls.sii`.

**It does not**:
- Read, modify, or access any files on your computer other than the game's
  telemetry shared memory, the game's `controls.sii` (read-only, for the
  button box), the plugin file it installs on request, and its own settings
  and log next to the `.exe`.
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
**extract the zip to a normal folder** (Documents, for example) and run
`TruckDash.exe` from there. No installation, no admin rights, no Python
required, everything needed is bundled inside. Do not run it straight from
inside the zip: Windows extracts it to a temporary folder that gets wiped, so
"start with Windows" would point at a path that no longer exists, and an
antivirus will flag a program that adds itself to startup from a temporary
folder. The client refuses to register the startup entry in that case and
tells you to move it first.

On first run a **Setup & status** window opens (you can reopen it any time
from the tray icon). It finds your ETS2 / ATS install through Steam and
installs the SCS Telemetry SDK plugin into the game for you with one click
(`<game>\bin\win_x64\plugins\scs-telemetry.dll`). Restart the game if it
was open. Non-Steam install? Use "Add game folder..." and pick the game's
folder.

The same window shows the live status (waiting for the game / in the truck /
live), your pairing code for the phone, an option to **start Truck Dash with
Windows** (the dashboard then opens automatically when the game starts), and
one-click updates when a new version is out.

### The link on your phone keeps working

The pairing code is saved and reused, so the dashboard link the client opens
(`trucksim-dash.com/app/?code=...`) can be bookmarked on your phone or tablet
once and it will keep working: open the bookmark, start Truck Dash on the PC,
and it connects on its own. If the page loads before the PC client is up it
just says "client not connected" and keeps waiting.

If the code leaks (a stream, a screenshot), use **New code** in the Setup
window: Truck Dash restarts with a fresh code and the old links stop working.

### Same Wi-Fi? LAN mode

If your phone or tablet is on the same Wi-Fi as the PC, the Setup window
also shows a **LAN address** (with a QR code to scan). That opens the
dashboard served directly by the client (`http://<your-pc-ip>:27765/app/`)
with a direct WebSocket link — lowest latency, no pairing code, and it keeps
working even if your internet drops. Windows may ask once to allow
TruckDash through the firewall (private networks) — click Allow. The cloud
mode with the pairing code keeps working at the same time.

### Windows SmartScreen ("unrecognized app")

The `.exe` is not code-signed (certificates cost money), so the first time
Windows may show "Windows protected your PC". Click **More info → Run
anyway**. Every release is built by GitHub Actions from the tagged source and
lists the SHA-256 of the files so you can verify what you downloaded — or
just run it from source (below).

### Antivirus flags TruckDash.exe (false positive)

Some engines flag the `.exe`, especially after you enable "start with
Windows". It is a **false positive** caused by how the client is packaged,
not by what it does: a PyInstaller one-file executable unpacks itself into a
temp folder at startup and is not code-signed, which is exactly the shape
heuristic/ML engines look for. Everything the client does is in this repo,
the build runs on GitHub's runners (not on anyone's PC) and each release
publishes the SHA-256 of the file.

What we do about it: the executable now carries proper version metadata and
is no longer UPX-compressed (both are known heuristic triggers), and a code
signing certificate through [SignPath](https://signpath.org/) for open
source projects is in progress — a signed build is what actually removes
these warnings for good.

The one detection we have seen reported is `Behavior:Win32/Persistence.A!ml`
from Microsoft Defender. That one is not about the file at all: it fires when
the program is run **from inside the zip** (so it lives in a temporary folder)
and the user turns on "start with Windows", because a program in a temp folder
writing itself into the `Run` key is a classic persistence pattern. Extract the
zip to a real folder and it does not happen; since 1.5.8 the client refuses to
register startup from a temporary folder anyway.

What you can do meanwhile:

- Add an exclusion for `TruckDash.exe` in your antivirus, **or**
- run the client from source with Python (below) — same program, no
  packaged `.exe` involved, **or**
- report the false positive to your vendor, which also helps everyone else:
  [Microsoft](https://www.microsoft.com/en-us/wdsi/filesubmission),
  [Avast/AVG](https://www.avast.com/false-positive-file-form.php),
  [Bitdefender](https://www.bitdefender.com/consumer/support/answer/29358/),
  [ESET](https://support.eset.com/en/kb141), most other vendors have a
  similar form.

### Manual plugin install

If you'd rather copy the plugin yourself: grab it from
[RenCloud/scs-sdk-plugin releases](https://github.com/RenCloud/scs-sdk-plugin/releases)
and copy **only the `Win64\scs-telemetry.dll` file** into your game's install
folder, inside `bin\win_x64\plugins\` (create that `plugins` folder if it
doesn't exist). The most common mistake is dropping the `.dll` directly into
`bin\win_x64\` instead of the `plugins\` subfolder. The client bundles the
same file (`vendor/scs-telemetry.dll`, MIT licensed).

If the dashboard still shows no data, right-click the tray icon and pick
**"Show log file (troubleshooting)"** — it'll tell you whether the plugin
was even detected.

### "certificate has expired" / SSL error on startup

If the log shows `SSLCertVerificationError: certificate has expired` when
the client tries to get a pairing code, this is a problem on your PC, not
with Truck Dash's servers (our certificate is valid — you can check
yourself by opening https://truck-companion-production.up.railway.app/health
in a browser and clicking the padlock icon). The usual causes, in order of
likelihood:

1. **Your antivirus is intercepting HTTPS traffic.** Kaspersky, ESET NOD32,
   and Avast are common culprits — they re-sign HTTPS connections with their
   own certificate, and if that certificate is misconfigured, this exact
   error shows up. Try temporarily disabling "HTTPS scanning" / "SSL/TLS
   scanning" in your antivirus (not the whole antivirus) and try again.
2. **Your system clock is wrong.** Even with "set time automatically"
   turned on, it can drift if it hasn't synced in a while. Double-check the
   date and time are actually correct (not just set to "automatic").

## Building it yourself

If you'd rather not run a pre-built `.exe`, you can run the client directly
from source (requires Python 3.10+):

```
pip install -r requirements.txt
python tray_client.py
```

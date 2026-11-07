# Truck Dash native app for Android

A real Android app: Kotlin, Jetpack Compose and MapLibre Native, with its own
interface and no WebView. It's a work in progress. The app on Google Play is still the
Trusted Web Activity in [`../android/`](../android/); the two can be installed side by
side because this one has its own application id (`com.trucksimdash.app.nativa`, and
`.debug` on top of that for debug builds).

## What it does today

| | |
|---|---|
| **Dashboard** | Speed gauge with the limit, gear, RPM, cruise, warning lights, fuel, GPS distance and time, rest, consumption, current job with pay in your currency, tolls and fines of the session, truck and wear; the delivery card with what the job earned and cost |
| **Commands** | The 12 buttons of the web panel, up to 3 of your own with any key, and remapping the keys; they press the key on the PC, and their state comes from the game |
| **Connection** | Pairing code through the relay, or directly over the local network; reconnects by itself, and keeps going with another app in front (Moonlight, for example), with a notification showing the next turn |
| **Floating window** | Android's picture-in-picture: the map, the next turn and your speed on top of another app, from a map button or on leaving the app |
| **Your map** | The same vector maps as the web with road shields, the Atlas, car parking and car-only fuel, truck with smooth movement, trail, follow or heading-up, other drivers and TruckersMP players |
| **Navigation** | Route to the job, turn instructions, lanes, spoken directions with a choice of voice and timing, nearest fuel or rest, search, waypoints (long-press the map), fastest or shortest, DLCs you don't own, every highway exit, rest warning, the same stop suggestions as the web, reporting a navigation problem |
| **With your other devices** | Waypoints, route settings and which device speaks are shared with the session, also over the local network. The app feeds the in-game overlay and your route on the live map, like a dashboard tab |
| **Convoy** | Create or join one, members on the map and in cards, chips at the map's edge for those off screen, quick messages, follow the leader and see their route, kick, share your pay; watching one with its code or link, no game needed |
| **Maps without internet** | Download a map and its road network: the tiles come from a file, and routes keep working |
| **Maps built on the PC** | What "Build my map" built, read from the client over the local network |
| **Demo** | The web's demo drive, with no PC or game |
| **Live map** | Drivers sharing their position on each map, their routes, follow one |
| **Stats** | Totals by game, driving per day, money by currency, records, most used, achievements, logbook with notes and corrections, map of everything driven, year in review to share as an image, following other drivers, their profiles, and public profiles with no account |
| **Settings** | Share position, route and nickname, units, clock, map override, keep the screen on, mini-HUD contents, route color, navigation zoom, truck size, fading the map buttons, real base map, lite mode, pay in your currency, the panel link and the OBS overlay for other devices |

The 8 languages of the web. Phone in portrait or landscape.

## What's missing to match the web

- The gauge styles of the web's panel (`docs/dash/`: classic and truck dashboards) and the
  dashboard around the map. A second device can open that panel: Settings copies its link.
- Moving the map buttons around, and sharing a single trip or the driven map as an image.
- Before replacing the TWA on Play: this has to reach feature parity, use the package
  name `com.trucksimdash.app`, and get its store listing, Data safety form and the
  foreground service (`connectedDevice`, declared in the Play Console) reviewed.

Not tried yet: a real phone, the real game, a real account, and hearing the voice (the
emulator here runs without sound). The rest was checked on an emulator, with a fake PC and
local copies of the relay and the account API. That copy of the API is older than
production: following and the stats routes are the ones most worth trying with a real
account, and sending a navigation report was only tried against a stand-in.

On purpose, not like the web:

- The cab view is for mods that copy a PC window onto the truck's GPS screen: it stays on
  the page. The dark-buttons setting is gone because the buttons here are always dark.
- A map built on the PC goes with the flat background instead of measuring whether its
  cities fall on real land, and it can only be read over the local network: with a pairing
  code the page tries `127.0.0.1`, and a phone never gets there.
- Showing the turn in the mini-HUD isn't offered: the turn panel is always on the map.

## How navigation works

The routing and the turn instructions are thousands of carefully measured lines in
`docs/app/pure.js` and `app.js`, checked against real routes by `tools/check_avisos.js`
and `tools/simular_navegacion.js`. Writing them again in Kotlin would create a second
copy that drifts away with every fix, so the app runs that same code in QuickJS, and only
draws the result.

`tools/armar_motor.js` builds one JS file at compile time, into the APK's assets and
never into git:

1. `motor/puente.js`, a fake browser: timers, `fetch`, audio, an empty DOM.
2. proj4, `variants.js`, `pure.js` and the translations.
3. The declarations of `app.js` that are needed, found by following names from the
   `RAICES` list and what the next two files use; the web isn't touched.
4. `convoy.js`, whole.
5. `motor/conduccion.js`, the API that `nav/MotorNav.kt` calls.

A new rule in the web reaches the app at the next build. Renaming something the motor
depends on fails the build. All of it runs on its own thread with a big stack, so a slow
route never touches the interface. On the emulator: about 10 to 25 ms per telemetry
message, a few seconds for the first route of a map, and about 60 MB of memory.

**The catch:** the code that writes to the page runs against a fake DOM, and that never
fails. Something new the web shows on the page does not appear in the app until
`navegacion()` in `conduccion.js` returns it and the interface draws it. New buttons are
the same: each one is a function of `motor`.

## How it talks to the rest

- **Relay**: `/ws/live/<code>`, as one more device of the session. It sends what a
  dashboard tab would: `nav_hud` when the overlay is on, `live_route` when sharing, the
  route plan, the route settings, the voice device and the convoy. Trips aren't sent from
  here: the PC client saves them, and the app only keeps a local list like the web's.
- **Local network**: `ws://<pc>:27766`, the same protocol, plus the plan-only connection
  to the relay when the client passes one. This is why the app allows cleartext traffic
  (`res/xml/red.xml`); everything else is https/wss.
- **Maps**: `.pmtiles` from R2 with range requests, sending a trucksim-dash.com Referer
  (`core/Red.kt`). The tools secret is never in the app: an APK can be opened.
- **Account**: the device link flow of the PC client (`/auth/device`). You approve it on
  the website, and the token stays encrypted with a key from the Android Keystore. The
  app never sees a password. The token works for trips and following; changing the name
  or deleting the account stays on the website, with its cookie.

## Building

You need a JDK 17 or newer (the one inside Android Studio works), the Android SDK, and
`node` on the path (it builds the navigation engine). Tell Gradle where the SDK is with
`ANDROID_HOME` or in `local.properties`.

```bash
./gradlew :app:testDebugUnitTest
```

```bash
./gradlew :app:assembleRelease
```

```bash
adb install -r app/build/outputs/apk/release/app-universal-release.apk
```

Besides the universal APK there is one per architecture (`app-arm64-v8a-release.apk` is
the one for almost any phone). Without `TD_KEYSTORE` in the environment, they are signed
with the debug key:
fine to try on a phone, not for Play. The debug build also adds a card in Settings to
point the app at a local relay and a local account API.

## Beta

Handing the APK to testers, without Play. `BETA.md` is the text for them.

```bash
powershell -ExecutionPolicy Bypass -File tools/armar_beta.ps1
```

The first time, it creates a signing key in your user folder. It asks for the password each
time and never stores it. It leaves the APKs, named with the version, in `app/build/beta/`.
Keep a copy of the key: installed apps only update from the same key, and a different one means
uninstalling, which loses the settings and the linked account. Raise `versionCode` and
`versionName` in `app/build.gradle.kts` for each beta.

If the app closes by itself, the next launch offers a report to share before anything else starts,
so a crash during startup can still be reported (`core/Fallos.kt`). There's no server behind it:
the tester sends the file. Names in its stack traces are readable because R8 doesn't obfuscate.

A GitHub release for a beta has two traps. Its tag can't start with `v`, which would build the
Windows client and announce it on Discord. And it can't become "latest", because the website's
download button points at `releases/latest/download/TruckDash-windows.zip`.

```bash
gh release create android-0.2.0 --target claude/app-nativa --prerelease --latest=false --title "Truck Dash Beta 0.2.0" --notes-file BETA.md app/build/beta/*.apk
```

## Testing

Unit tests run on the JVM. What's ported from the web is checked against the web itself,
and what the client sends against the client itself:

```bash
node android-native/tools/generar_golden.js --check
```

```bash
python android-native/tools/generar_telemetria.py --check
```

CI runs both when `app.js`, `pure.js`, `livemap.js` or `client/client.py` change. If one
fails, regenerate it (the same command without `--check`) and port the change to Kotlin.

The navigation engine is tested in Node, with real map data and a truck along the demo
route. One scenario per feature; CI runs it too:

```bash
node android-native/tools/probar_motor.js
```

Node runs V8, and the app runs QuickJS, with a different math library and no `Intl`. With
`--guion` that same run is recorded message by message with a fake clock, and
`MotorGuionTest` repeats it inside Android and compares every step. It needs an emulator
or a phone, so CI doesn't run it. Run it after touching `motor/` or updating QuickJS.

Record the scripts in a folder of your choice:

```bash
node android-native/tools/probar_motor.js --guion guion
```

Install both APKs from `android-native/`:

```bash
./gradlew :app:installDebug :app:installDebugAndroidTest
```

Run the test once. It fails asking for the scripts, and that creates the app's folder:

```bash
adb shell am instrument -w -e class com.trucksimdash.app.MotorGuionTest com.trucksimdash.app.nativa.debug.test/androidx.test.runner.AndroidJUnitRunner
```

Upload them, and run the same command again:

```bash
adb push guion/. /sdcard/Android/data/com.trucksimdash.app.nativa.debug/files/guion/
```

It reports timings and memory in logcat under the tag `GuionMotor`.

To see the app working without the game, `tools/pc_falsa.py` drives a truck along the
demo route using the real client's `build_payload`:

```bash
python android-native/tools/pc_falsa.py --lan
```

In the emulator, connect by local network to `10.0.2.2`. With `--relay` it talks to a
local relay instead, `--overlay` makes it ask for `nav_hud`, `--poco` runs low on fuel and
rest, `--viejo` reports an old client and `--plan-relay` passes a relay over the local
network; see the top of the script.

## Layout

```
app/src/main/java/com/trucksimdash/app/
  core/        network, tolerant JSON, preferences, token vault, formats
  telemetria/  messages and session state (pure), the socket (SesionRepo)
  mapa/        projections, map catalog, style, MapLibre control
  nav/         the QuickJS bridge (MotorNav), map file cache, navigation state, voice
  vivo/        public live map
  cuenta/      account link and stats API
  ui/          Compose screens
motor/         puente.js and conduccion.js, what surrounds the web's code in the engine
tools/         armar_motor.js, probar_motor.js, generar_golden.js, generar_telemetria.py, pc_falsa.py
```

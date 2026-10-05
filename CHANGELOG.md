# Changelog

Changes to the Truck Dash client, newest first. Each release on GitHub
shows its own section from this file. The web app at trucksim-dash.com
updates on its own and is not versioned here.

## Unreleased

- Accounts (still switched off): a job that disappears without a delivery
  or cancellation (loading another save, going back to the menu) stops
  adding to its trip. Before, the trip stayed open and took the driving,
  and even the truck, that came after.
- Accounts (still switched off): a jump in the route (a quick job taking
  you to the company, a ferry or train arrival, fast travel) is no longer
  drawn as a straight line you drove.
- Detects European Grand Utopia (the Grand Utopia island added northwest
  of the UK, on vanilla ETS2 or ProMods). Before, the web took it for the
  standalone Grand Utopia map and showed the wrong map.

## 1.5.25 (2026-10-03)

- Every delivery, cancellation, toll, fine, ferry and train now counts. The
  telemetry plugin flips a switch on each of these events instead of sending
  a pulse, and Truck Dash only noticed the switch going on: the second
  delivery of a game session, and every other toll or fine, went unseen. The
  dashboard's session totals and the "job delivered" notice missed them too.
- Accounts (still switched off): Link account opens the browser with the
  code already filled in. You confirm there, after checking that the code
  matches the one in Truck Dash, instead of typing it.
- Accounts (still switched off): closing and reopening Truck Dash in the
  middle of a trip no longer resets its distance and route.

## 1.5.24 (2026-10-03)

- Proton: "Open dashboard" now always shows the address, copied, in case
  the browser does not open. Wine starts the Linux browser without waiting
  for it, so the client cannot tell whether it worked.
- Linux: the ready-made ATS launcher pointed at the wrong Proton prefix
  (Steam app ID 270800 instead of 270880), so the client could not see the
  game. Fixed in `client/linux/truckdash-ats.desktop` and the README.
- Linux: the README explains how to combine the Truck Dash launch options
  line with your own (mangohud, `PROTON_LOG`, DLL overrides), and that Lutris
  and protontricks put the client on a different wineserver than the game.
- Groundwork for optional accounts, still switched off: fixes from a test
  drive in both games (linking from Setup, trips that never opened, the
  currency, sleep time, a cancelled job that stayed open) and the speed of
  each point of the route, for the speed map of a trip.

## 1.5.23 (2026-09-30)

- Linux (Proton): clicking Open dashboard could close Truck Dash on the spot,
  with no error. The browser is now opened from a separate helper process, so
  Truck Dash keeps running even if that step fails. If no browser opens, a
  small window shows the dashboard address, already copied to the clipboard.
  Thanks to RXTransit for the report, the video and the log (issue #12).

## 1.5.22 (2026-09-30)

- Works alongside Trucky again. Since 1.5.21 Truck Dash replaced the game's
  `scs-telemetry.dll` with its own build; Trucky ships that same file, checks
  it, and refused to start with "[SECURITY] Package file replaced on disk".
- The telemetry plugin is now installed under its own name,
  `truckdash-telemetry.dll`, next to any `scs-telemetry.dll`, and publishes
  its own shared memory block. Truck Dash never writes `scs-telemetry.dll`
  again, and both plugins run at the same time.
- If you saw the Trucky error: after updating Truck Dash, repair or reinstall
  Trucky once so it puts its own file back.

## 1.5.21 (2026-09-29)

- Jobs taken with a car in ATS 1.61 now show up like any other job:
  destination, route, income and delivery. Truck Dash ships its own build of
  the telemetry plugin, based on RenCloud's, open source and built by GitHub
  Actions.
- Fixed: with Truck Dash opened before the game, the dashboard could stay on
  "Waiting for the game" forever (Spanish, French, Portuguese and Polish, and
  English while reconnecting). The tray icon text was longer than Windows
  allows.
- The log file notes each status change and the vehicle you are driving.

## 1.5.20 (2026-09-29)

- Ready for winget. When installed with winget the client no longer updates
  itself: the update notice shows `winget upgrade Nethercap.TruckDash` with a
  button to copy it. The zip from GitHub keeps updating itself as before.

## 1.5.19 (2026-09-29)

- Connects even when a system wide proxy or ping booster gets in the way. The
  connection is tried the way Windows says first and, if that fails with a
  proxy involved, directly. Same for pairing codes and updates. The log says
  which way it connected. Thanks to DotFX on Reddit.

## 1.5.18 (2026-09-28)

- New option in Setup to stop Truck Dash from opening the dashboard in the
  browser on the PC you play on. Under gamescope on Linux that window took
  keyboard focus away from the game. Thanks to RXTransit.
- Groundwork for optional accounts, switched off: nothing is sent anywhere.

## 1.5.17 (2026-09-27)

- New dashboard panel: speed, gear and rpm, fuel and range, rest and
  deadline, damage and session totals, on a second device at
  trucksim-dash.com/dash or over the map on the one you have.
- It tells you whether you arrive before the deadline, whether the fuel
  lasts, and whether you will have to sleep on the way. Cargo damage shows
  while you drive.
- The client sends AdBlue, oil pressure, brake temperature, retarder, engine
  brake, trailer wear and live cargo damage.
- LAN mode serves the panel too, and Setup explains that LAN needs ports 27765
  and 27766. Thanks to The20thDoctorWho.
- Fixed: on LAN without internet the app was missing map variants, convoy and
  the live map.

## 1.5.16 (2026-09-26)

- Linux: Truck Dash could quit on its own mid session. Closing with the game
  now waits until the telemetry memory has been gone for a minute, so menus,
  pauses and fuel stops no longer count. Thanks to The20thDoctorWho.

## 1.5.15 (2026-09-25)

- Setup no longer lists leftover folders of uninstalled games, shows the
  folder when you have two copies of a game, and lets you remove folders you
  added by hand.
- Fixed: "Add game folder..." did nothing.
- Linux (Proton): Truck Dash closes when the game closes, so Steam no longer
  stays on "Running". A Setup checkbox, on by default only under Proton.
  Thanks to Kesh and The20thDoctorWho.

## 1.5.14 (2026-09-25)

- The button box finds the game window by its executable, not its title, so
  TruckersMP, map mods, the game language and Proton no longer break it.
- Proton: the same game no longer appears twice in Setup.
- The README documents running the client under Proton on Linux.

## Earlier releases

- 1.5.13 (2026-09-24): the truck's heading comes from the game instead of
  being guessed.
- 1.5.12 (2026-09-23): the auto update no longer hangs on "installing"
  (issue #5).
- 1.5.11 (2026-09-23): Discord Rich Presence.
- 1.5.10 (2026-09-22): only one instance at a time.
- 1.5.9 (2026-09-22): the dashboard link keeps working, bookmark it once.
- 1.5.8 (2026-09-22): never registers startup from a temporary folder.
- 1.5.7 (2026-09-22): readable LAN QR code, fewer antivirus false positives.
- 1.5.6 (2026-09-21): TruckersMP map variant, custom buttons in the button
  box.
- 1.5.5 (2026-09-21): detects Coast to Coast, ProMods Canada, Reforma and
  Grand Utopia.
- 1.5.4 (2026-09-20): detects RusMap.
- 1.5.3 (2026-09-19): high beams button.
- 1.5.1 (2026-09-18): map mods detected automatically from the game log.
- 1.5.0 (2026-09-18): smoother motion, telemetry at 4 Hz through the relay
  and 10 Hz on LAN.
- 1.4.4 (2026-09-18): says exactly why a running game sends no telemetry.
- 1.4.3 (2026-09-18): clean relaunch after an auto update.
- 1.4.1 (2026-09-18): a delivery was counted again after every reconnect.
- 1.3.1 (2026-09-17): LAN mode and demo mode.
- 1.3.0 (2026-09-17): one click plugin install, Setup window, live status,
  auto update and autostart.
- 1.2.x (2026-09-15): real keybinds read from the game, wipers, button box
  fixes.
- 1.1.0 (2026-09-15): truck button box and key remapping.
- 1.0.x (2026-08-31 to 2026-09-09): first releases, waypoints and job
  deadline.

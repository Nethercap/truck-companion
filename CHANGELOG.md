# Changelog

Changes to the Truck Dash client, newest first. Each release on GitHub
shows its own section from this file. The web app at trucksim-dash.com
updates on its own and is not versioned here.

## Unreleased

- In a Convoy session the dashboard and the overlay show the convoy's game clock
  instead of your single player one, so game time arrivals match what everyone sees.

## 1.5.29 (2026-10-09)

- In-game overlay (Windows): a small panel over the game with your speed and the speed
  limit, the next turn and next city, distance left, and your arrival time both in real
  time and on the game clock. The turn and the real arrival come from the dashboard
  (phone, tablet or this PC); speed, limit and the game clock arrival work without it.
  It lets clicks through, never takes focus from the game and hides when the game is not
  in front. Off by default: turn it on in Setup, from the tray menu or with Ctrl+Shift+O
  from inside the game (you can pick another shortcut). It has its own section in Setup:
  a corner or anywhere you drag it with Move, its size and what it shows. With voice
  guidance on in the dashboard, the dashboard also speaks the turns while the overlay is
  on. Needs the game in a window or in borderless fullscreen.
- You can pick the client's language in Setup, Options (it follows Windows by default).
  Setup and the tray menu switch right away.
- Linux (Proton): Setup finds your games in Steam's Linux libraries (also on other
  drives and with the Flatpak Steam), without the game having to be running first.

## 1.5.28 (2026-10-09)

- Build my map: if your truck drives off the map Truck Dash knows (a map mod we don't
  have on our servers), Setup offers to build that map on your PC from the game and your
  active mods. Close the game first; it takes about 5 minutes. The map shows on that PC
  and on your Wi-Fi (LAN mode). The builder is a separate, optional download.
- The client tells the dashboard which map DLCs you have (it looks at the DLC files in the
  game folder), so routes avoid the states and countries you don't own. You can still pick
  them by hand in the dashboard: Settings, DLCs.
- If your truck is outside the map Truck Dash knows (a map mod we don't support yet),
  the client lets the dashboard report which mods you have active, so we can see which
  maps people want. Only then, once per map, and with nothing that identifies you.
- LAN mode also keeps the voice guidance files, so spoken directions work on the
  local network without internet.
- In ATS, when you drive a car the dashboard shows the parking spots cars can use,
  instead of the truck rest areas you can't park at.
- The client recognizes Western and Eastern Canada Expansion (with or without their
  Coast to Coast connections), so the dashboard loads the matching map by itself.

## 1.5.27 (2026-10-06)

- Accounts are here, optional and free. Link a Truck Dash account from "Setup & status"
  and every job you drive is saved: the route on a map, distance, pay, fuel and time,
  with your logbook, stats, countries and achievements at trucksim-dash.com/account.
  Sign in with Discord, Google or email. Nothing is saved until you link it.
- "My account" in the tray menu, and a one-time notice for existing users.
- The "Setup & status" window scrolls when it doesn't fit the screen, so the buttons at the
  bottom are always reachable on small laptops.
- "Support Truck Dash" in the tray menu, for anyone who wants to buy me a tea on Tecito.
  It is optional and does not unlock anything.
- Accounts: closing the game in the middle of a job no longer loses the driving since the
  last save of the trip (up to two minutes of distance, route and fuel).
- Accounts: cancelling a job records the penalty the game charged, instead of showing the
  pay that was offered and never collected.
- Accounts: special transport jobs, and jobs you continue after reopening the game, get an
  approximate total time instead of none.
- Accounts: sessions and trips record which map mods were active.
- Accounts: when the accounts server answers with an error, the log says which one. Sending
  is retried as before.

## 1.5.26 (2026-10-05)

- European Grand Utopia (the mod that adds the Grand Utopia archipelago to
  the Europe map) is now recognised on its own. Before, the dashboard
  loaded the standalone Grand Utopia map, a different map altogether; now
  it loads Europe with the archipelago, on vanilla or ProMods, with its
  cities, companies and ferries for routing.
- Accounts (still switched off): a job that disappears without a delivery
  or cancellation (loading another save, going back to the menu) stops
  adding to its trip. Before, the trip stayed open and took the driving,
  and even the truck, that came after.
- Accounts (still switched off): a jump in the route (a quick job taking
  you to the company, a ferry or train arrival, fast travel) is no longer
  drawn as a straight line you drove.

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

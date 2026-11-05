# Truck Dash telemetry plugin for the native Linux game (test build)

This package is for testing the Truck Dash telemetry plugin with the
**native Linux build** of Euro Truck Simulator 2 or American Truck Simulator
(the game running without Proton). Nobody has tried it in the real game yet.
If you play through Proton you don't need it: the Windows client installs its
own plugin.

What's inside:

- `truckdash-telemetry.so`: the plugin, built from `plugin/` in
  [the repository](https://github.com/Nethercap/truck-companion) by the
  "Build plugin" workflow (see `BUILD.txt` for the exact commit and run).
  `SHA256SUMS` has its hash.
- `install.sh`: copies the plugin to `<game>/bin/linux_x64/plugins/`. That
  is the only file it writes.
- `check-telemetry.py`: checks that the game is sending data through the
  plugin. It only reads.

## Steps

1. If the game runs through Proton, switch it to the native build first: in
   Steam, the game's Properties > Compatibility, untick "Force the use of a
   specific Steam Play compatibility tool", and let Steam update it.
2. Install the plugin:

   ```
   bash install.sh
   ```

   It looks for ETS2 and ATS in your Steam libraries. If it doesn't find
   yours, pass the game folder: `bash install.sh "/path/to/Euro Truck Simulator 2"`.
3. Start the game. If it shows a dialog about advanced SDK features, accept it.
4. Get into a truck, drive for a few seconds and run:

   ```
   python3 check-telemetry.py
   ```

   It ends with a line that starts with `RESULT:` and the plugin lines of the
   game log. Please paste the whole output in the issue, even if it says
   it didn't work, and tell us whether the game started and closed normally.

## Removing it

```
bash install.sh --remove
```

or delete `bin/linux_x64/plugins/truckdash-telemetry.so` from the game folder.
The plugin also leaves a 32 KB file in `/dev/shm/TruckDashTelemetry`; it's
gone after a reboot.

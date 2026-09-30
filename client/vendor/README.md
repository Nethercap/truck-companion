# Vendored third-party files

- `truckdash-telemetry.dll` — SCS SDK telemetry plugin (Win64), MIT License
  (see `LICENSE-scs-sdk-plugin.txt`). It is Truck Dash's fork of
  [RenCloud/scs-sdk-plugin](https://github.com/RenCloud/scs-sdk-plugin)
  V.1.12.1, with the car jobs of ATS 1.61, publishing in its own shared
  memory block (`Local\TruckDashTelemetry`); the source and the list of
  changes are in `plugin/` at the root of this repository.

  The Truck Dash client bundles this file so it can install it into the
  game's `bin\win_x64\plugins\` folder for the user with one click. It goes
  next to any `scs-telemetry.dll` already there, never over it.

  It is built by GitHub Actions, not on anyone's PC: after changing
  `plugin/`, run the "Build plugin" workflow. It compiles the DLL, copies it
  here and updates `PLUGIN_DLL_SHA256` in `client/plugin_installer.py`
  (`tools/pin_plugin.py`). Bump `PLUGIN_DLL_VERSION` there by hand.

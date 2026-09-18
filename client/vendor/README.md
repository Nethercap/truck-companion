# Vendored third-party files

- `scs-telemetry.dll` — SCS SDK telemetry plugin (Win64) by RenCloud,
  release V.1.12.1, MIT License (see `LICENSE-scs-sdk-plugin.txt`).
  Source: https://github.com/RenCloud/scs-sdk-plugin

  The Truck Dash client bundles this file so it can install it into the
  game's `bin\win_x64\plugins\` folder for the user with one click. To
  update it, download the new release zip, copy `Win64/scs-telemetry.dll`
  here and update `PLUGIN_DLL_VERSION` / `PLUGIN_DLL_SHA256` in
  `client/plugin_installer.py`.

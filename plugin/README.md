# scs-telemetry (Truck Dash fork)

The SCS SDK telemetry plugin that the Truck Dash client installs into the
game's `bin\win_x64\plugins\` folder, as `truckdash-telemetry.dll`. It
publishes the game's telemetry in its own shared memory block
(`Local\TruckDashTelemetry`) that the client reads.

It has its own file name and its own block so it can sit next to the
upstream `scs-telemetry.dll` that other apps install. Trucky ships that
file and refuses to start if it has been replaced ("[SECURITY] Package file
replaced on disk"), which is what happened while client 1.5.21 installed
this plugin under the upstream name.

This is a fork of [RenCloud/scs-sdk-plugin](https://github.com/RenCloud/scs-sdk-plugin),
MIT License (see `LICENSE`), taken from upstream commit `d7216cb`
(release V.1.12.1, the last one, 2023-09-21). The SCS SDK headers in
`scs_sdk/` are by SCS Software, under their own license
(`scs_sdk/sdk_license.txt`).

The same DLL is also a TruckersMP plugin: the TruckersMP client loads the
DLLs in `plugins\` and calls `truckersmp_init` in the ones that export it.
That part (`src/truckersmp_players.cpp`) publishes the TruckersMP players
around the truck in a block of its own, `Local\TruckDashTMP`, for the map of
the app. It is built with the TruckersMP Client SDK v1.1.0
([TruckersMP/GameClientSDK](https://github.com/TruckersMP/GameClientSDK),
`bee3b9e`, MIT License, header-only) in `truckersmp_sdk/`. Without
TruckersMP that code never runs.

## Why a fork

ATS 1.61 added drivable cars and, with them, two new job types in the SDK:
the `car_job` and `bus_job` configurations and their `car_job.delivered` /
`car_job.cancelled` gameplay events. The upstream plugin only knows `job`,
so a job taken with a car never reached the shared memory: no destination,
no income, no delivery.

This fork maps them onto the same fields as a truck job. The shared memory
layout does not change (still revision 12): only the block name does. See `CHANGES.md` for the exact list.

## Building

Visual Studio with the C++ desktop workload:

```
msbuild scs-telemetry\vs2012\scs-telemetry.vcxproj -p:Configuration=Release -p:Platform=x64
```

macOS (Xcode command line tools), a universal `truckdash-telemetry.dylib` for
Intel and Apple Silicon:

```
bash build.sh <output folder>
```

On Linux the same script builds a `.so`, only to check that the code still
compiles outside Windows: the native Linux plugin is not shipped.

The DLL and the dylib that the client installs are built by the "Build
plugin" workflow (one platform per run), not on anyone's PC.

# scs-telemetry (Truck Dash fork)

The SCS SDK telemetry plugin that the Truck Dash client installs into the
game's `bin\win_x64\plugins\` folder. It publishes the game's telemetry in
a shared memory block (`Local\SCSTelemetry`) that the client reads.

This is a fork of [RenCloud/scs-sdk-plugin](https://github.com/RenCloud/scs-sdk-plugin),
MIT License (see `LICENSE`), taken from upstream commit `d7216cb`
(release V.1.12.1, the last one, 2023-09-21). The SCS SDK headers in
`scs_sdk/` are by SCS Software, under their own license
(`scs_sdk/sdk_license.txt`).

## Why a fork

ATS 1.61 added drivable cars and, with them, two new job types in the SDK:
the `car_job` and `bus_job` configurations and their `car_job.delivered` /
`car_job.cancelled` gameplay events. The upstream plugin only knows `job`,
so a job taken with a car never reached the shared memory: no destination,
no income, no delivery.

This fork maps them onto the same fields as a truck job. The shared memory
layout does not change (still revision 12), so anything that reads the
upstream plugin keeps working. See `CHANGES.md` for the exact list.

## Building

Visual Studio with the C++ desktop workload:

```
msbuild scs-telemetry\vs2012\scs-telemetry.vcxproj -p:Configuration=Release -p:Platform=x64
```

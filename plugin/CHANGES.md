# Changes from upstream (RenCloud/scs-sdk-plugin d7216cb)

## Own shared memory block

The block is `Local\TruckDashTelemetry` instead of `Local\SCSTelemetry`,
and the client installs the DLL as `truckdash-telemetry.dll`. Installing it
over the upstream `scs-telemetry.dll` broke Trucky, which ships that file
and checks it. Now both plugins load side by side; with the same block name
they would overwrite each other's data. The Truck Dash client reads this
block first and falls back to `Local\SCSTelemetry`.

## Car and bus jobs (ATS 1.61)

ATS 1.61 lets the player drive cars and take jobs with them (quick job and
freight market). The SDK reports those jobs with new ids that the upstream
plugin does not know, so they never reached the shared memory. Seen in
`game.log.txt` with the upstream plugin:

```
<WARNING> Something went wrong with this configuration car_job
<ERROR> attribute not handled id: 0 attribute: destination.city
<WARNING> Something went wrong with this gameplay event car_job.delivered
```

- The `car_job` and `bus_job` configurations are stored in the same fields
  as `job`. Their market attribute (`car_job.market`, `bus_job.market`)
  goes to `jobMarket`.
- `car_job.delivered`, `car_job.cancelled` and the `bus_job` ones fire the
  same flags and fill the same fields as `job.delivered` / `job.cancelled`.
- The game sends every job configuration on each change, empty ones
  included. The plugin remembers which one started the current job and
  only an empty configuration with that same id ends it; otherwise an empty
  `car_job` would end a truck job and fire a false "job finished".
- A non-empty job configuration clears the job fields first. Car jobs do not
  send cargo mass, `is_cargo_loaded` or `special_job`, and the values from
  the previous truck job used to stay there.
- Car and bus jobs report `isCargoLoaded = true`. They never send
  `is_cargo_loaded`, and in a quick job the configuration arrives once, with
  the cargo already on board. Not yet checked with a freight market car job.

Not mapped (no field for them in the revision 12 layout): the car job
attributes `customer.prio.cargo`, `customer.prio.time`,
`customer.prio.vehicle`, and `vehicle.damage` on delivery. The plugin still
logs them as "attribute not handled".

The shared memory layout is unchanged (revision 12).

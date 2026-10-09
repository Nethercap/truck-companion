# Truck Dash map builder

The optional tool behind **Build my map** in the Truck Dash client. When your
truck drives off the map Truck Dash knows (a map mod that is not on our
servers, or a combination we don't publish), the client can build that map
on your own PC from the game and your active mods. The map stays on your PC
and your local network.

It is a separate download from the client: the client fetches
`TruckDash-MapBuilder-<version>.zip` from its own release the first time you
use it, checks it against the release's `SHA256SUMS.txt`, and keeps it in
`%LOCALAPPDATA%\TruckDash\map-builder\`.

## License

**GPL-3.0-or-later** (see [LICENSE](LICENSE)). The builder is
[truckermudgeon/maps](https://github.com/truckermudgeon/maps), which is GPL,
with [truckdash.patch](truckdash.patch) applied on top. The rest of Truck
Dash (client, relay, web) stays under the MIT license of the repository: the
client only downloads and runs the builder as a separate program.

## What the patch changes

- Mods can be read as they come (a folder, a HashFS `.scs` or a ZIP `.scs`),
  without extracting them first.
- CityHash64 in TypeScript, so it runs on Windows without native modules.
  Without `gdeflate`, icon images are skipped; their names still count, so
  companies and weigh stations are kept.
- Vector tiles (`.pmtiles`) written in TypeScript instead of tippecanoe,
  with the same layers and zoom filter as the maps on our servers.
- Flags of prefab navigation curves, map projection fixes for standalone
  maps, and schema fixes for some mods.

## Building it

```bash
builder/build.sh [output folder]
```

It clones truckermudgeon/maps at the pinned commit, applies the patch,
installs the dependencies without native builds and bundles three programs
with esbuild (`parser.mjs`, `generator.mjs`, `tiles.mjs`) plus the
generator's `resources/`. The release workflow (`.github/workflows/build-client.yml`,
job `map-builder`) runs this and adds the official `node.exe`, checked
against nodejs.org's `SHASUMS256.txt`.

For development, point the client at a local build with the
`TRUCKDASH_MAP_BUILDER` environment variable.

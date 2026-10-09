#!/usr/bin/env bash
# Arma el armador de mapas de Truck Dash ("Build my map" del cliente) desde el
# codigo de truckermudgeon/maps en un commit fijo, con truckdash.patch encima.
#
# Salida: <out>/truckdash-map-builder/{bin/*.mjs, resources/, LICENSE, ...}
# Falta node.exe, que agrega el workflow de release (ver build-client.yml).
#
# Uso: builder/build.sh [carpeta de salida]   (por defecto builder/dist)
# Corre en Linux (CI y WSL). Pide git, node >= 20 y npm.
set -euo pipefail

UPSTREAM_REPO="https://github.com/truckermudgeon/maps.git"
UPSTREAM_COMMIT="d56d0e3"

AQUI="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-$AQUI/dist}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "== upstream $UPSTREAM_REPO @ $UPSTREAM_COMMIT"
git clone --quiet "$UPSTREAM_REPO" "$WORK/maps"
git -C "$WORK/maps" checkout --quiet "$UPSTREAM_COMMIT"
git -C "$WORK/maps" apply --whitespace=nowarn "$AQUI/truckdash.patch"

# --ignore-scripts: sin compilar los modulos nativos (cityhash, gdeflate). El
# armador no los usa: CityHash va en TypeScript y gdeflate solo hace falta
# para los iconos, que la variante local no lleva.
echo "== npm ci"
(cd "$WORK/maps" && npm ci --ignore-scripts --no-audit --no-fund --loglevel=error)

DEST="$OUT/truckdash-map-builder"
rm -rf "$DEST"
mkdir -p "$DEST/bin"

# ESM con require disponible: algunas dependencias son CommonJS y llaman a
# require() en tiempo de ejecucion. El .node de CityHash es opcional: sin el,
# scs-archive.ts usa la version en TypeScript (cityhash.ts).
BANNER="import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);"
empaquetar() {
  local entrada="$1" salida="$2"
  (cd "$WORK/maps" && npx --no-install esbuild "$entrada" \
    --bundle --platform=node --format=esm --target=node20 \
    --external:'*.node' --log-level=warning \
    "--banner:js=$BANNER" --outfile="$DEST/bin/$salida")
}
echo "== esbuild"
empaquetar packages/clis/parser/run-with-mod.ts parser.mjs
empaquetar packages/clis/generator/index.ts generator.mjs
empaquetar packages/clis/truckdash-builder/tiles.ts tiles.mjs

# El generator busca sus datos en ../resources respecto de su propio archivo.
cp -r "$WORK/maps/packages/clis/generator/resources" "$DEST/resources"

cp "$AQUI/LICENSE" "$DEST/LICENSE"
cp "$AQUI/truckdash.patch" "$DEST/truckdash.patch"
cat > "$DEST/SOURCE.txt" <<TXT
Truck Dash map builder. GPL-3.0-or-later.

Built from $UPSTREAM_REPO at commit $UPSTREAM_COMMIT
with truckdash.patch (included here) applied on top.
The build script is builder/build.sh in https://github.com/Nethercap/truck-companion
TXT
echo "== listo: $DEST"
du -sh "$DEST"/bin/* "$DEST/resources"

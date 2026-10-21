#!/usr/bin/env bash
# Compila el plugin fuera de Windows en la carpeta que se le pase.
#
#   bash plugin/build.sh /algun/lado
#
# En macOS deja truckdash-telemetry.dylib universal (Intel y Apple Silicon):
# la que el cliente instala en <juego>.app/Contents/MacOS/plugins/. La usa el
# workflow "Build plugin" con plataforma macos, asi la .dylib sale de su log
# y no de la Mac de nadie, igual que la DLL.
#
# En Linux deja un .so solo para saber que el codigo compila fuera de
# Windows (tests): el plugin nativo de Linux no se publica (build-linux en
# build-client.yml explica por que).
set -euo pipefail

out="${1:?uso: bash plugin/build.sh <carpeta>}"
raiz="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$out"
out="$(cd "$out" && pwd)"

fuentes=("$raiz"/scs-telemetry/src/*.cpp)
flags=(-std=c++17 -O2 -fPIC -I"$raiz/scs_sdk/include" -I"$raiz/scs-telemetry/inc")

if [ "$(uname)" = Darwin ]; then
  lib="$out/truckdash-telemetry.dylib"
  # Cada arquitectura con su macOS minimo (arm64 empieza en 11) y despues una
  # sola .dylib con las dos. El install_name fijo: por defecto es la ruta de
  # salida, que cambia en cada runner y cambiaria los bytes.
  for arch_min in x86_64:10.15 arm64:11.0; do
    arch="${arch_min%%:*}"
    clang++ "${flags[@]}" -arch "$arch" -mmacosx-version-min="${arch_min#*:}" \
      -dynamiclib -install_name @rpath/truckdash-telemetry.dylib \
      "${fuentes[@]}" -o "$out/truckdash-telemetry-$arch.dylib"
  done
  lipo -create "$out/truckdash-telemetry-x86_64.dylib" "$out/truckdash-telemetry-arm64.dylib" -output "$lib"
  rm "$out/truckdash-telemetry-x86_64.dylib" "$out/truckdash-telemetry-arm64.dylib"
  lipo -info "$lib"
  exportados="$(nm -gU "$lib")"
  sha="$(shasum -a 256 "$lib" | cut -d' ' -f1)"
else
  lib="$out/truckdash-telemetry.so"
  g++ "${flags[@]}" -shared "${fuentes[@]}" -o "$lib"
  exportados="$(nm -D --defined-only "$lib")"
  sha="$(sha256sum "$lib" | cut -d' ' -f1)"
fi

# El juego busca estas dos funciones por nombre (sin decorar: extern "C").
for funcion in scs_telemetry_init scs_telemetry_shutdown; do
  if ! grep -qE "[ _]${funcion}\$" <<<"$exportados"; then
    echo "$lib no exporta $funcion" >&2
    exit 1
  fi
done

echo "$lib"
echo "SHA-256: $sha"

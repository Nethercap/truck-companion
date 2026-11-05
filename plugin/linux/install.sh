#!/usr/bin/env bash
# Instala el plugin de telemetria de Truck Dash en el build NATIVO de Linux
# de ETS2 y de ATS (issue #7). Copia un solo archivo,
# truckdash-telemetry.so, a <juego>/bin/linux_x64/plugins/, y no toca nada
# mas. Lo que imprime va en ingles: es para quien prueba el paquete.
#
#   bash install.sh                  busca los juegos en las bibliotecas de Steam
#   bash install.sh "<carpeta>"      en esa carpeta del juego
#   bash install.sh --remove         lo saca de donde lo haya puesto
#
# Con Proton el juego es el de Windows (bin/win_x64) y este .so no le sirve:
# ahi el cliente de Windows instala la DLL solo.
set -euo pipefail

aqui="$(cd "$(dirname "$0")" && pwd)"
so="$aqui/truckdash-telemetry.so"
nombre="truckdash-telemetry.so"
quitar=0
carpetas=()

for arg in "$@"; do
  case "$arg" in
    --remove) quitar=1 ;;
    -h|--help)
      echo "Usage: bash install.sh [game folder ...]   install (finds ETS2 and ATS if no folder)"
      echo "       bash install.sh --remove [folder]   remove it again"
      exit 0 ;;
    *) carpetas+=("$arg") ;;
  esac
done

# Las bibliotecas de Steam: la principal (instalacion comun, el enlace de
# ~/.steam y el Flatpak) y las que lista libraryfolders.vdf de cada una.
bibliotecas() {
  local raiz vdf
  for raiz in "$HOME/.local/share/Steam" "$HOME/.steam/steam" "$HOME/.steam/root" \
              "$HOME/.var/app/com.valvesoftware.Steam/.local/share/Steam"; do
    [ -d "$raiz/steamapps" ] || continue
    echo "$raiz"
    vdf="$raiz/steamapps/libraryfolders.vdf"
    [ -f "$vdf" ] && sed -n 's/^[[:space:]]*"path"[[:space:]]*"\(.*\)"[[:space:]]*$/\1/p' "$vdf"
  done | while read -r b; do
    [ -d "$b" ] && (cd "$b" && pwd -P)
  done | sort -u
}

if [ ${#carpetas[@]} -eq 0 ]; then
  while read -r b; do
    for juego in "Euro Truck Simulator 2" "American Truck Simulator"; do
      [ -d "$b/steamapps/common/$juego" ] && carpetas+=("$b/steamapps/common/$juego")
    done
  done < <(bibliotecas)
fi

if [ ${#carpetas[@]} -eq 0 ]; then
  echo "No ETS2 or ATS folder found in your Steam libraries."
  echo "Run it again with the game folder, for example:"
  echo "  bash install.sh \"\$HOME/.local/share/Steam/steamapps/common/Euro Truck Simulator 2\""
  exit 1
fi

hecho=0
for juego in "${carpetas[@]}"; do
  bin="$juego/bin/linux_x64"
  destino="$bin/plugins/$nombre"
  if [ "$quitar" = 1 ]; then
    if [ -f "$destino" ]; then
      rm -f "$destino"
      echo "Removed $destino"
      hecho=1
    fi
    continue
  fi
  if [ ! -d "$bin" ]; then
    echo "Skipped $juego: there is no bin/linux_x64, so Steam has the Windows build (Proton)."
    echo "  For this test, untick \"Force the use of a specific Steam Play compatibility tool\""
    echo "  in the game's Properties > Compatibility, let Steam update it, and run this again."
    continue
  fi
  mkdir -p "$bin/plugins"
  cp "$so" "$destino"
  echo "Installed $destino"
  if [ -f "$bin/plugins/libscs-telemetry.so" ]; then
    echo "  Also there: libscs-telemetry.so (another telemetry plugin, or the October test)."
    echo "  It can stay: the two publish to different blocks."
  fi
  hecho=1
done

if [ "$quitar" = 1 ]; then
  [ "$hecho" = 1 ] || echo "The plugin was not installed in any game folder."
  exit 0
fi
[ "$hecho" = 1 ] || exit 1
echo
echo "Now start the game (the native build, no Proton). If it shows a dialog about"
echo "advanced SDK features, accept it. Get into a truck, drive for a few seconds"
echo "and run:  python3 check-telemetry.py"

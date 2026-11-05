#!/usr/bin/env bash
# Arma el paquete de prueba del plugin para el juego nativo de Linux
# (issue #7): truckdash-telemetry.so de plugin/build.sh, install.sh,
# check-telemetry.py y el README, en truckdash-linux-native-test-<fecha>.tar.gz.
#
#   bash plugin/linux/empaquetar.sh <carpeta>
#
# Lo corre "Build plugin" con plataforma linux, en Ubuntu 22.04: la glibc
# del runner es la minima que pide el .so, como el cliente de Linux de
# build-client.yml. No se fija en el cliente ni se publica en un release: el
# cliente no instala el plugin de Linux (plugin_installer.py es para el juego
# de Windows). En otra PC sirve para probar; para mandarle a alguien, el de
# Actions.
set -euo pipefail

out="${1:?uso: bash plugin/linux/empaquetar.sh <carpeta>}"
aqui="$(cd "$(dirname "$0")" && pwd)"
raiz="$(cd "$aqui/../.." && pwd)"
mkdir -p "$out"
out="$(cd "$out" && pwd)"

nombre="truckdash-linux-native-test-$(date -u +%Y-%m-%d)"
dir="$out/$nombre"
rm -rf "$dir"
mkdir -p "$dir"

bash "$raiz/plugin/build.sh" "$dir" >/dev/null
cp "$aqui/install.sh" "$aqui/check-telemetry.py" "$aqui/README.md" "$dir/"
chmod +x "$dir/install.sh" "$dir/check-telemetry.py"

commit="$(git -C "$raiz" rev-parse HEAD 2>/dev/null || echo desconocido)"
{
  echo "Truck Dash telemetry plugin, native Linux test build"
  echo "commit: $commit"
  if [ -n "${GITHUB_RUN_ID:-}" ]; then
    echo "run: $GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"
  fi
  echo "built: $(date -u +%Y-%m-%dT%H:%M:%SZ), $(ldd --version 2>&1 | sed -n 1p), $(g++ --version | sed -n 1p)"
  # La glibc mas nueva que pide el .so: la PC tiene que tener esa o una mas nueva.
  echo "needs: $(objdump -T "$dir/truckdash-telemetry.so" | grep -o 'GLIBC_[0-9.]*' | sort -Vu | tail -1)"
} > "$dir/BUILD.txt"
(cd "$dir" && sha256sum truckdash-telemetry.so > SHA256SUMS)

tar -czf "$out/$nombre.tar.gz" -C "$out" "$nombre"
cat "$dir/BUILD.txt"
cat "$dir/SHA256SUMS"
echo "$out/$nombre.tar.gz"

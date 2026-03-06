#!/usr/bin/env bash
# Builds better-sqlite3 for every Node.js runtime found on this machine.
# bindings() resolves lib/binding/node-v{abi}-{platform}-{arch}/ automatically,
# so each runtime picks the right binary without any wrapper logic.
set -e

BSQ="node_modules/better-sqlite3"
WINDSURF="/usr/share/windsurf/windsurf"
BUILT_ABIS=()

build_for_node() {
  local NODE_BIN="$1"
  local LABEL="$2"
  local ABI
  ABI=$("$NODE_BIN" -p "process.versions.modules" 2>/dev/null) || return
  local NODE_GYP
  NODE_GYP=$(dirname "$NODE_BIN")/../lib/node_modules/npm/node_modules/node-gyp/bin/node-gyp.js

  # Skip if already built for this ABI
  for built in "${BUILT_ABIS[@]}"; do [[ "$built" == "$ABI" ]] && return; done

  echo "Building better-sqlite3 for $LABEL (ABI $ABI)..."
  if [ -f "$NODE_GYP" ]; then
    "$NODE_BIN" "$NODE_GYP" rebuild --release --directory="$BSQ" 2>&1 | grep -E "(ok$|gyp ERR)" || true
  else
    # Fallback: run the package install script skipping prebuild-install
    node-gyp rebuild --release --directory="$BSQ" 2>&1 | grep -E "(ok$|gyp ERR)" || true
  fi

  if [ -f "$BSQ/build/Release/better_sqlite3.node" ]; then
    mkdir -p "$BSQ/lib/binding/node-v${ABI}-linux-x64"
    cp "$BSQ/build/Release/better_sqlite3.node" "$BSQ/lib/binding/node-v${ABI}-linux-x64/better_sqlite3.node"
    echo "  → saved to lib/binding/node-v${ABI}-linux-x64/"
    BUILT_ABIS+=("$ABI")
    rm -f "$BSQ/build/Release/better_sqlite3.node"
  else
    echo "  ✗ build failed for $LABEL (ABI $ABI)"
  fi
}

# All node versions managed by n
for NODE_BIN in /usr/local/n/versions/node/*/bin/node; do
  [ -x "$NODE_BIN" ] && build_for_node "$NODE_BIN" "$(dirname "$NODE_BIN"/../..) $(basename $(dirname $(dirname "$NODE_BIN")))"
done

# System node (/usr/bin/node) if different from n-managed ones
build_for_node "/usr/bin/node" "system node $(/usr/bin/node --version 2>/dev/null)"

# Windsurf/Electron
if [ -f "$WINDSURF" ]; then
  ELECTRON_ABI=$(ELECTRON_RUN_AS_NODE=1 "$WINDSURF" -p "process.versions.modules" 2>/dev/null)
  ELECTRON_VER=$(ELECTRON_RUN_AS_NODE=1 "$WINDSURF" -p "process.versions.electron" 2>/dev/null)
  already_built=false
  for built in "${BUILT_ABIS[@]}"; do [[ "$built" == "$ELECTRON_ABI" ]] && already_built=true; done
  if [ "$already_built" = false ] && [ -n "$ELECTRON_ABI" ]; then
    echo "Building better-sqlite3 for Windsurf Electron ${ELECTRON_VER} (ABI ${ELECTRON_ABI})..."
    ./node_modules/.bin/electron-rebuild --version "$ELECTRON_VER" --module-dir . --which-module better-sqlite3 --force 2>&1 | grep -v "^$"
    if [ -f "$BSQ/build/Release/better_sqlite3.node" ]; then
      mkdir -p "$BSQ/lib/binding/node-v${ELECTRON_ABI}-linux-x64"
      cp "$BSQ/build/Release/better_sqlite3.node" "$BSQ/lib/binding/node-v${ELECTRON_ABI}-linux-x64/better_sqlite3.node"
      echo "  → saved to lib/binding/node-v${ELECTRON_ABI}-linux-x64/"
      rm -f "$BSQ/build/Release/better_sqlite3.node"
    fi
  fi
fi

echo "Done. Built ABIs: ${BUILT_ABIS[*]}"

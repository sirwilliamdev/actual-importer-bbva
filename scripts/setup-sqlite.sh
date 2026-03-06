#!/usr/bin/env bash
# Builds better-sqlite3 for both system Node.js (ABI 127) and Windsurf/Electron (ABI 140).
# bindings() tries lib/binding/node-v{abi}-{platform}-{arch}/ as a fallback path,
# so keeping both there lets each runtime auto-select the right binary.
set -e

BSQ="node_modules/better-sqlite3"
WINDSURF="/usr/share/windsurf/windsurf"

# Build for system Node.js (current ABI)
echo "Building better-sqlite3 for system Node.js (ABI $(node -p process.versions.modules))..."
npm rebuild better-sqlite3
SYS_ABI=$(node -p process.versions.modules)
mkdir -p "$BSQ/lib/binding/node-v${SYS_ABI}-linux-x64"
cp "$BSQ/build/Release/better_sqlite3.node" "$BSQ/lib/binding/node-v${SYS_ABI}-linux-x64/better_sqlite3.node"
echo "  Saved to lib/binding/node-v${SYS_ABI}-linux-x64/"

# Build for Windsurf/Electron if available
if [ -f "$WINDSURF" ]; then
  ELECTRON_ABI=$(ELECTRON_RUN_AS_NODE=1 "$WINDSURF" -p "process.versions.modules" 2>/dev/null)
  ELECTRON_VER=$(ELECTRON_RUN_AS_NODE=1 "$WINDSURF" -p "process.versions.electron" 2>/dev/null)
  if [ -n "$ELECTRON_ABI" ] && [ "$ELECTRON_ABI" != "$SYS_ABI" ]; then
    echo "Building better-sqlite3 for Windsurf Electron ${ELECTRON_VER} (ABI ${ELECTRON_ABI})..."
    ./node_modules/.bin/electron-rebuild --version "$ELECTRON_VER" --module-dir . --which-module better-sqlite3 --force
    mkdir -p "$BSQ/lib/binding/node-v${ELECTRON_ABI}-linux-x64"
    cp "$BSQ/build/Release/better_sqlite3.node" "$BSQ/lib/binding/node-v${ELECTRON_ABI}-linux-x64/better_sqlite3.node"
    echo "  Saved to lib/binding/node-v${ELECTRON_ABI}-linux-x64/"
  fi
fi

# Remove build/Release so bindings() falls through to lib/binding/ (version-aware lookup)
rm -f "$BSQ/build/Release/better_sqlite3.node"
echo "Done."

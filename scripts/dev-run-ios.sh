#!/usr/bin/env bash
# One-shot helper to install deps, start Metro, and run the iOS app.
# Usage examples:
#   ./scripts/dev-run-ios.sh
#   USEBY_DEVICE_NAME="iPhone (3)" ./scripts/dev-run-ios.sh
#   USEBY_SIMULATOR="iPhone 16" ./scripts/dev-run-ios.sh
# Optional env vars:
#   HOST=0.0.0.0  PORT=8081  USEBY_DEVICE_NAME="Your iPhone Name"  USEBY_SIMULATOR="Simulator Name"

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

DEVICE_NAME="${USEBY_DEVICE_NAME:-}"
SIMULATOR_NAME="${USEBY_SIMULATOR:-}"
PORT="${PORT:-8081}"
HOST="${HOST:-0.0.0.0}"

echo "Cleaning Metro caches (safe to ignore errors)…"
if command -v watchman >/dev/null 2>&1; then
  watchman watch-del-all || true
fi
rm -rf "$TMPDIR/metro-cache" "$TMPDIR/metro-*" 2>/dev/null || true

echo "Installing JS deps…"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

echo "Installing iOS pods…"
npx pod-install ios

echo "Starting Metro on $HOST:$PORT…"
( npx react-native start --host "$HOST" --port "$PORT" --reset-cache ) &
METRO_PID=$!

cleanup() {
  echo "Stopping Metro ($METRO_PID)…"
  kill "$METRO_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "Waiting for Metro to be ready…"
if command -v nc >/dev/null 2>&1; then
  until nc -z 127.0.0.1 "$PORT"; do sleep 0.4; done
else
  until curl -sf "http://127.0.0.1:$PORT/status" >/dev/null 2>&1; do sleep 0.4; done
fi

echo "Building and launching the app…"
if [ -n "$DEVICE_NAME" ]; then
  npx react-native run-ios --device "$DEVICE_NAME"
elif [ -n "$SIMULATOR_NAME" ]; then
  npx react-native run-ios --simulator "$SIMULATOR_NAME"
else
  npx react-native run-ios
fi

echo "Done. Keep this terminal open to keep Metro running."


#!/usr/bin/env bash
# Starts the local emulators, keeps their data between runs, and makes sure the
# test superadmin exists.
#
#   ./scripts/emulators.sh           # normal run (data kept in ./emu-data)
#   ./scripts/emulators.sh --fresh   # wipe saved data and start empty
#
# Sign in to the dashboard (http://localhost:5173) with the credentials below.
# Override them with ADMIN_EMAIL / ADMIN_PASSWORD if you like.
set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT=demo-kingscup
DATA_DIR=./emu-data
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-password123!}"

if [[ "${1:-}" == "--fresh" ]]; then
  echo "▶ Wiping saved emulator data…"
  rm -rf "$DATA_DIR"
fi
mkdir -p "$DATA_DIR"

echo "▶ Building functions…"
(cd functions && npm run build >/dev/null)

# Once the emulators are up, create (or re-confirm) the test admin.
(
  until curl -s -o /dev/null http://127.0.0.1:9099 && curl -s -o /dev/null http://127.0.0.1:8080; do sleep 1; done
  cd functions && FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
    node scripts/bootstrap-superadmin.js "$ADMIN_EMAIL" "$ADMIN_PASSWORD" "$PROJECT" >/dev/null
  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-actions.js "$PROJECT"
  echo ""
  echo "✔ Test admin ready: $ADMIN_EMAIL / $ADMIN_PASSWORD"
) &

# Foreground, so Ctrl+C goes straight to the emulators and they save the data.
exec firebase emulators:start --project "$PROJECT" --import "$DATA_DIR" --export-on-exit

#!/usr/bin/env bash
# Launch Chrome 141+ with ONLY Phantom (blocks AdGuard and other extensions that
# break wallet injection via Trusted Types).
set -euo pipefail
PORT="${PORT:-3000}"
URL="${1:-http://127.0.0.1:${PORT}}"
PHANTOM_ID="bfnaelmomeimhlpmgjnjophhpkkoljpa"
CHROME=""
for c in \
  "/Volumes/Google Chrome/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
do
  if [[ -x "$c" ]]; then CHROME="$c"; break; fi
done
if [[ -z "$CHROME" ]]; then
  echo "error: Google Chrome not found" >&2
  exit 1
fi
VER="$("$CHROME" --version 2>/dev/null || true)"
echo "Using $VER"
echo "Opening $URL with Phantom-only extensions…"
exec "$CHROME" \
  --profile-directory=Default \
  --disable-extensions-except="$PHANTOM_ID" \
  --no-first-run \
  "$URL"

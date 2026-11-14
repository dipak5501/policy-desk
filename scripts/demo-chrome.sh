#!/usr/bin/env bash
# Open Policy Desk in a CLEAN Chrome profile with ONLY Phantom loaded.
#
# Prefer http://127.0.0.1:3000 — not Cloudflare tunnels.
# The user's default profile often has AdBlock/AdGuard/VPN MAIN-world scripts
# that break Next.js hydration (UI stuck on SSR "Recheck Phantom inject"
# even when window.phantom.solana exists).
set -euo pipefail
PORT="${PORT:-3000}"
URL="${1:-http://127.0.0.1:${PORT}}"
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

PHANTOM_ID="bfnaelmomeimhlpmgjnjophhpkkoljpa"
PHANTOM_SRC=""
for d in "$HOME/Library/Application Support/Google/Chrome/Default/Extensions/${PHANTOM_ID}"/*; do
  if [[ -f "$d/manifest.json" ]]; then PHANTOM_SRC="$d"; break; fi
done
if [[ -z "$PHANTOM_SRC" ]]; then
  echo "error: Phantom extension not found under Chrome Default/Extensions." >&2
  echo "Install from https://chromewebstore.google.com/detail/phantom/${PHANTOM_ID}" >&2
  exit 1
fi

PROFILE="${POLICY_DESK_CHROME_PROFILE:-$HOME/.cache/policy-desk-chrome}"
mkdir -p "$PROFILE"

VER="$("$CHROME" --version 2>/dev/null || true)"
echo "Using $VER"
echo "Profile: $PROFILE (Phantom only)"
echo "Phantom: $PHANTOM_SRC"
echo "Opening $URL …"
echo
echo "Wallet checklist:"
echo "  1) Unlock / create Phantom in this window (empty wallet is fine for Connect)"
echo "  2) Phantom → Settings → Developer Settings → Devnet"
echo "  3) Click Connect Phantom (Devnet) → approve → Sign in"
echo "  4) Fund later via faucet.solana.com + faucet.circle.com (not needed to Connect)"
echo

# Dedicated profile + only Phantom — avoids AdBlock/VPN breaking Next hydration.
exec "$CHROME" \
  --user-data-dir="$PROFILE" \
  --disable-extensions-except="$PHANTOM_SRC" \
  --load-extension="$PHANTOM_SRC" \
  --no-first-run \
  --no-default-browser-check \
  "$URL"

#!/usr/bin/env bash
# Quick health check for Policy Desk demos.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -s "${HOME}/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  . "${HOME}/.nvm/nvm.sh"
  nvm use 22 >/dev/null 2>&1 || true
fi

echo "== Policy Desk doctor =="
echo "node: $(node -v 2>/dev/null || echo missing)"
echo "env.local: $([[ -f .env.local ]] && echo present || echo MISSING)"
if [[ -f .env.local ]]; then
  rg -N "^(OPERATOR_TOKEN|SESSION_SECRET|OPENAI_API_KEY)=" .env.local | sed 's/=.*/=***/' || true
fi

code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:3000/api/policy 2>/dev/null || echo down)"
echo "local /api/policy: ${code}"
if [[ -f .tunnel-url ]]; then
  echo "tunnel url: $(cat .tunnel-url)"
fi

echo
echo "Phantom tips:"
echo "  1) Use Chrome (not Cursor browser). Prefer http://127.0.0.1:3000 — not the CF tunnel."
echo "  2) Toolbar icon ≠ inject: unlock Phantom → puzzle-piece → site access → On all sites → ⌘⇧R."
echo "  3) Or run: npm run demo:chrome"
echo "  4) Phantom → Settings → Developer Settings → Devnet"
echo
echo "Operator password = OPERATOR_TOKEN in .env.local"
echo "Done."

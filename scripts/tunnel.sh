#!/usr/bin/env bash
# Cloudflare quick tunnel helper for Policy Desk.
# Starts/reuses Next on :3000, runs cloudflared with HTTP/2 (QUIC often blocked),
# and writes the public URL to .tunnel-url.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-3000}"
LOCAL_URL="http://127.0.0.1:${PORT}"
URL_FILE="${ROOT}/.tunnel-url"
PID_FILE="${ROOT}/.tunnel.pid"
NEXT_PID_FILE="${ROOT}/.next-dev.pid"
LOG_FILE="${ROOT}/.tunnel.log"
NEXT_LOG="${ROOT}/.next-dev.log"
PROTO="${CLOUDFLARED_PROTOCOL:-http2}"

# Prefer nvm Node 22 when available (matches README).
if [[ -s "${HOME}/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  . "${HOME}/.nvm/nvm.sh"
  nvm use 22 >/dev/null 2>&1 || nvm use default >/dev/null 2>&1 || true
fi

usage() {
  cat <<'EOF'
Usage: scripts/tunnel.sh [start|refresh|stop|status|url]

  start     Ensure Next on :3000 + Cloudflare quick tunnel (default)
  refresh   Restart tunnel only (keeps Next if healthy); rewrite .tunnel-url
  stop      Stop cloudflared tunnel started by this script
  status    Show Next + tunnel status and URL
  url       Print current public URL (from .tunnel-url)

Env:
  PORT                    Local Next port (default 3000)
  CLOUDFLARED_PROTOCOL    cloudflared --protocol (default http2)
EOF
}

have_cloudflared() {
  command -v cloudflared >/dev/null 2>&1
}

port_listening() {
  lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1
}

next_healthy() {
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "${LOCAL_URL}/api/policy" 2>/dev/null || true)"
  [[ "${code}" == "200" ]]
}

ensure_next() {
  if next_healthy; then
    echo "Next.js already healthy on ${LOCAL_URL}"
    return 0
  fi

  if port_listening; then
    echo "Port ${PORT} is in use but /api/policy is not healthy yet; waiting…"
    for _ in $(seq 1 30); do
      if next_healthy; then
        echo "Next.js ready on ${LOCAL_URL}"
        return 0
      fi
      sleep 1
    done
    echo "error: something is listening on :${PORT} but Next APIs are not ready" >&2
    exit 1
  fi

  echo "Starting Next.js on ${LOCAL_URL}…"
  : >"${NEXT_LOG}"
  nohup npm run dev >"${NEXT_LOG}" 2>&1 &
  echo $! >"${NEXT_PID_FILE}"

  for _ in $(seq 1 60); do
    if next_healthy; then
      echo "Next.js ready on ${LOCAL_URL}"
      return 0
    fi
    sleep 1
  done

  echo "error: Next.js did not become healthy on ${LOCAL_URL}" >&2
  echo "--- last ${NEXT_LOG} ---" >&2
  tail -n 40 "${NEXT_LOG}" >&2 || true
  exit 1
}

kill_stale_tunnels() {
  # Prefer pidfile; also clear any cloudflared quick tunnels aimed at this port.
  if [[ -f "${PID_FILE}" ]]; then
    local old
    old="$(cat "${PID_FILE}" 2>/dev/null || true)"
    if [[ -n "${old}" ]] && kill -0 "${old}" 2>/dev/null; then
      echo "Stopping previous tunnel pid ${old}"
      kill "${old}" 2>/dev/null || true
      wait "${old}" 2>/dev/null || true
    fi
    rm -f "${PID_FILE}"
  fi

  # Match cloudflared quick tunnels to this localhost port (best-effort).
  local pids
  pids="$(pgrep -f "cloudflared tunnel .*--url http://(127\\.0\\.0\\.1|localhost):${PORT}" 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    echo "Killing stale cloudflared: ${pids}"
    # shellcheck disable=SC2086
    kill ${pids} 2>/dev/null || true
    sleep 1
  fi
}

extract_url_from_log() {
  grep -Eo 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "${LOG_FILE}" 2>/dev/null | tail -n 1 || true
}

# Campus resolvers sometimes lag on brand-new *.trycloudflare.com names.
# Prefer plain curl; fall back to Cloudflare DoH so agents can verify locally.
http_code() {
  local target="$1"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "${target}" 2>/dev/null || true)"
  if [[ "${code}" =~ ^[0-9]+$ && "${code}" != "000" ]]; then
    printf '%s' "${code}"
    return 0
  fi
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 --doh-url https://1.1.1.1/dns-query "${target}" 2>/dev/null || true)"
  printf '%s' "${code:-000}"
}

wait_for_public_url() {
  local url=""
  local i
  for i in $(seq 1 45); do
    url="$(extract_url_from_log)"
    if [[ -n "${url}" ]]; then
      printf '%s' "${url}"
      return 0
    fi
    if [[ -f "${PID_FILE}" ]]; then
      local pid
      pid="$(cat "${PID_FILE}")"
      if ! kill -0 "${pid}" 2>/dev/null; then
        echo "error: cloudflared exited before publishing a URL" >&2
        tail -n 40 "${LOG_FILE}" >&2 || true
        exit 1
      fi
    fi
    sleep 1
  done
  return 1
}

wait_until_reachable() {
  local url="$1"
  local code=""
  local i
  echo "Waiting for ${url} to become reachable (DNS can lag on campus)…"
  for i in $(seq 1 60); do
    code="$(http_code "${url}/api/policy")"
    if [[ "${code}" == "200" ]]; then
      return 0
    fi
    sleep 2
  done
  echo "warning: ${url}/api/policy still HTTP ${code:-none} after wait" >&2
  return 1
}

start_tunnel() {
  if ! have_cloudflared; then
    echo "error: cloudflared not found on PATH. Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/" >&2
    exit 1
  fi

  kill_stale_tunnels
  : >"${LOG_FILE}"

  echo "Starting cloudflared (protocol=${PROTO}) → ${LOCAL_URL}"
  nohup cloudflared tunnel --protocol "${PROTO}" --url "${LOCAL_URL}" >"${LOG_FILE}" 2>&1 &
  echo $! >"${PID_FILE}"

  local url=""
  if ! url="$(wait_for_public_url)"; then
    echo "error: timed out waiting for trycloudflare URL (see ${LOG_FILE})" >&2
    tail -n 40 "${LOG_FILE}" >&2 || true
    exit 1
  fi

  printf '%s\n' "${url}" >"${URL_FILE}"
  wait_until_reachable "${url}" || true

  echo
  echo "Public tunnel: ${url}"
  echo "Local desk:    ${LOCAL_URL}"
  echo "URL file:      ${URL_FILE}"
}

verify_tunnel() {
  local url
  url="$(cat "${URL_FILE}" 2>/dev/null || true)"
  if [[ -z "${url}" ]]; then
    echo "error: no URL in ${URL_FILE}" >&2
    exit 1
  fi

  local policy ledger
  policy="$(http_code "${url}/api/policy")"
  ledger="$(http_code "${url}/api/ledger")"
  if [[ "${policy}" != "200" || "${ledger}" != "200" ]]; then
    echo "warning: tunnel checks policy=${policy} ledger=${ledger}" >&2
    return 1
  fi
  echo "Verified ${url}/api/policy → 200, /api/ledger → 200"
  return 0
}

cmd_status() {
  if next_healthy; then
    echo "Next.js:  up (${LOCAL_URL})"
  elif port_listening; then
    echo "Next.js:  port ${PORT} listening but /api/policy not 200"
  else
    echo "Next.js:  down"
  fi

  if [[ -f "${PID_FILE}" ]] && kill -0 "$(cat "${PID_FILE}")" 2>/dev/null; then
    echo "Tunnel:   up (pid $(cat "${PID_FILE}"))"
  else
    echo "Tunnel:   down"
  fi

  if [[ -f "${URL_FILE}" ]]; then
    echo "URL:      $(cat "${URL_FILE}")"
  else
    echo "URL:      (none — run npm run tunnel)"
  fi
}

cmd_stop() {
  kill_stale_tunnels
  rm -f "${URL_FILE}"
  echo "Tunnel stopped."
}

main() {
  local cmd="${1:-start}"
  case "${cmd}" in
    -h|--help|help) usage ;;
    start)
      ensure_next
      start_tunnel
      verify_tunnel || true
      ;;
    refresh)
      ensure_next
      start_tunnel
      verify_tunnel || true
      ;;
    stop) cmd_stop ;;
    status) cmd_status ;;
    url)
      if [[ -f "${URL_FILE}" ]]; then
        cat "${URL_FILE}"
      else
        echo "error: ${URL_FILE} missing — run npm run tunnel" >&2
        exit 1
      fi
      ;;
    *)
      echo "unknown command: ${cmd}" >&2
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"

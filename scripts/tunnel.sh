#!/usr/bin/env bash
# Cloudflare quick tunnel helper for Policy Desk.
# Starts/reuses Next on :3000, runs cloudflared with HTTP/2 (QUIC often blocked),
# writes the public URL to remote-link (and keeps .tunnel-url in sync), and
# runs a watchdog that restarts the tunnel / refreshes the file if it dies or the URL changes.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-3000}"
LOCAL_URL="http://127.0.0.1:${PORT}"
REMOTE_LINK="${ROOT}/remote-link"
URL_FILE="${ROOT}/.tunnel-url"
PID_FILE="${ROOT}/.tunnel.pid"
WATCHDOG_PID_FILE="${ROOT}/.tunnel-watchdog.pid"
NEXT_PID_FILE="${ROOT}/.next-dev.pid"
LOG_FILE="${ROOT}/.tunnel.log"
WATCHDOG_LOG="${ROOT}/.tunnel-watchdog.log"
NEXT_LOG="${ROOT}/.next-dev.log"
PROTO="${CLOUDFLARED_PROTOCOL:-http2}"
WATCHDOG_INTERVAL="${TUNNEL_WATCHDOG_INTERVAL:-8}"

# Prefer nvm Node 22 when available (matches README).
if [[ -s "${HOME}/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  . "${HOME}/.nvm/nvm.sh"
  nvm use 22 >/dev/null 2>&1 || nvm use default >/dev/null 2>&1 || true
fi

usage() {
  cat <<'EOF'
Usage: scripts/tunnel.sh [start|refresh|stop|status|url|watchdog]

  start     Ensure Next on :3000 + Cloudflare quick tunnel + watchdog (default)
  refresh   Restart tunnel only (keeps Next if healthy); rewrite remote-link
  stop      Stop cloudflared + watchdog started by this script
  status    Show Next + tunnel status and URL
  url       Print current public URL (from remote-link / .tunnel-url)
  watchdog  Internal: monitor tunnel and auto-refresh remote-link

Env:
  PORT                      Local Next port (default 3000)
  CLOUDFLARED_PROTOCOL      cloudflared --protocol (default http2)
  TUNNEL_WATCHDOG_INTERVAL  Seconds between watchdog checks (default 8)

Files:
  remote-link               Stable public URL file (auto-updated)
  .tunnel-url               Same URL (compat / sync)
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

read_url() {
  if [[ -f "${REMOTE_LINK}" ]]; then
    tr -d '[:space:]' <"${REMOTE_LINK}"
    return 0
  fi
  if [[ -f "${URL_FILE}" ]]; then
    tr -d '[:space:]' <"${URL_FILE}"
    return 0
  fi
  return 1
}

write_url() {
  local url="$1"
  printf '%s\n' "${url}" >"${REMOTE_LINK}"
  printf '%s\n' "${url}" >"${URL_FILE}"
}

clear_url_files() {
  rm -f "${REMOTE_LINK}" "${URL_FILE}"
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

tunnel_pid_alive() {
  [[ -f "${PID_FILE}" ]] && kill -0 "$(cat "${PID_FILE}" 2>/dev/null)" 2>/dev/null
}

watchdog_pid_alive() {
  [[ -f "${WATCHDOG_PID_FILE}" ]] && kill -0 "$(cat "${WATCHDOG_PID_FILE}" 2>/dev/null)" 2>/dev/null
}

kill_watchdog() {
  if [[ -f "${WATCHDOG_PID_FILE}" ]]; then
    local old
    old="$(cat "${WATCHDOG_PID_FILE}" 2>/dev/null || true)"
    if [[ -n "${old}" ]] && kill -0 "${old}" 2>/dev/null; then
      kill "${old}" 2>/dev/null || true
      wait "${old}" 2>/dev/null || true
    fi
    rm -f "${WATCHDOG_PID_FILE}"
  fi
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

start_tunnel_process() {
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

  write_url "${url}"
  wait_until_reachable "${url}" || true

  echo
  echo "Public tunnel: ${url}"
  echo "Local desk:    ${LOCAL_URL}"
  echo "remote-link:   ${REMOTE_LINK}"
  echo "URL file:      ${URL_FILE}"
}

ensure_watchdog() {
  if watchdog_pid_alive; then
    return 0
  fi

  # Detach watchdog so it survives this script exit (own log; don't share .tunnel.log).
  : >>"${WATCHDOG_LOG}"
  nohup bash "${ROOT}/scripts/tunnel.sh" watchdog >>"${WATCHDOG_LOG}" 2>&1 &
  echo $! >"${WATCHDOG_PID_FILE}"
  echo "Watchdog started (pid $(cat "${WATCHDOG_PID_FILE}")) — auto-updates ${REMOTE_LINK}"
}

# Quiet restart used by watchdog (no nested watchdog spawn).
restart_tunnel_quiet() {
  if ! have_cloudflared; then
    echo "watchdog: cloudflared missing" >&2
    return 1
  fi

  kill_stale_tunnels
  : >"${LOG_FILE}"
  nohup cloudflared tunnel --protocol "${PROTO}" --url "${LOCAL_URL}" >"${LOG_FILE}" 2>&1 &
  echo $! >"${PID_FILE}"

  local url=""
  local i
  for i in $(seq 1 45); do
    url="$(extract_url_from_log)"
    if [[ -n "${url}" ]]; then
      write_url "${url}"
      echo "watchdog: tunnel restarted → ${url}"
      return 0
    fi
    if ! tunnel_pid_alive; then
      echo "watchdog: cloudflared died before publishing URL" >&2
      return 1
    fi
    sleep 1
  done
  echo "watchdog: timed out waiting for new URL" >&2
  return 1
}

cmd_watchdog() {
  # Replace any stale pidfile with this process.
  echo $$ >"${WATCHDOG_PID_FILE}"
  trap 'rm -f "${WATCHDOG_PID_FILE}"' EXIT

  while true; do
    sleep "${WATCHDOG_INTERVAL}"

    # Sync remote-link if cloudflared logged a newer trycloudflare URL.
    local logged=""
    logged="$(extract_url_from_log)"
    local current=""
    current="$(read_url 2>/dev/null || true)"

    if [[ -n "${logged}" && "${logged}" != "${current}" ]]; then
      write_url "${logged}"
      echo "watchdog: URL changed → ${logged}"
      current="${logged}"
    fi

    # Keep remote-link and .tunnel-url identical when either exists.
    if [[ -n "${current}" ]]; then
      write_url "${current}"
    fi

    if ! tunnel_pid_alive; then
      if ! next_healthy; then
        echo "watchdog: Next unhealthy; waiting before tunnel restart…"
        continue
      fi
      echo "watchdog: tunnel dead — restarting…"
      restart_tunnel_quiet || true
      continue
    fi

    # Soft health check: if public URL fails repeatedly, refresh tunnel.
    if [[ -n "${current}" ]]; then
      local code
      code="$(http_code "${current}/api/policy")"
      if [[ "${code}" != "200" ]]; then
        # One retry after a short pause (DNS blips).
        sleep 3
        code="$(http_code "${current}/api/policy")"
        if [[ "${code}" != "200" ]]; then
          echo "watchdog: ${current} unhealthy (HTTP ${code}) — refreshing tunnel…"
          restart_tunnel_quiet || true
        fi
      fi
    fi
  done
}

tunnel_already_good() {
  tunnel_pid_alive || return 1
  local url=""
  url="$(extract_url_from_log)"
  if [[ -z "${url}" ]]; then
    url="$(read_url 2>/dev/null || true)"
  fi
  [[ -n "${url}" ]] || return 1
  local code
  code="$(http_code "${url}/api/policy")"
  [[ "${code}" == "200" ]] || return 1
  write_url "${url}"
  echo "Reusing healthy tunnel: ${url}"
  echo "remote-link: ${REMOTE_LINK}"
  return 0
}

start_tunnel() {
  if tunnel_already_good; then
    return 0
  fi
  start_tunnel_process
}

verify_tunnel() {
  local url
  url="$(read_url 2>/dev/null || true)"
  if [[ -z "${url}" ]]; then
    echo "error: no URL in ${REMOTE_LINK}" >&2
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

  if tunnel_pid_alive; then
    echo "Tunnel:   up (pid $(cat "${PID_FILE}"))"
  else
    echo "Tunnel:   down"
  fi

  if watchdog_pid_alive; then
    echo "Watchdog: up (pid $(cat "${WATCHDOG_PID_FILE}"))"
  else
    echo "Watchdog: down"
  fi

  if url="$(read_url 2>/dev/null)"; then
    echo "URL:      ${url}"
    echo "File:     ${REMOTE_LINK}"
  else
    echo "URL:      (none — run npm run tunnel)"
  fi
}

cmd_stop() {
  kill_watchdog
  kill_stale_tunnels
  clear_url_files
  echo "Tunnel + watchdog stopped; cleared remote-link."
}

main() {
  local cmd="${1:-start}"
  case "${cmd}" in
    -h|--help|help) usage ;;
    start)
      ensure_next
      start_tunnel
      ensure_watchdog
      verify_tunnel || true
      ;;
    refresh)
      ensure_next
      kill_watchdog
      start_tunnel_process
      ensure_watchdog
      verify_tunnel || true
      ;;
    stop) cmd_stop ;;
    status) cmd_status ;;
    url)
      if url="$(read_url 2>/dev/null)"; then
        printf '%s\n' "${url}"
      else
        echo "error: ${REMOTE_LINK} missing — run npm run tunnel" >&2
        exit 1
      fi
      ;;
    watchdog) cmd_watchdog ;;
    *)
      echo "unknown command: ${cmd}" >&2
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"

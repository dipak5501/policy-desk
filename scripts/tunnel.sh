#!/usr/bin/env bash
# Cloudflare tunnel helper for Policy Desk.
#
# Sticky by design:
#   - One Next.js on 127.0.0.1:3000 — never killed by this script (only started if dead).
#   - One cloudflared session — watchdog restarts ONLY when the process is dead, or after
#     many consecutive public failures (transient 502/530 must NOT rotate the hostname).
#   - remote-link is written once and updated ONLY when the hostname truly changes after
#     a necessary restart. App file changes never rotate the tunnel.
#
# Prefer a named Cloudflare tunnel (TUNNEL_TOKEN + TUNNEL_HOSTNAME) for a fixed URL.
# Quick tunnels (*.trycloudflare.com) get a new hostname on every restart — keep the
# process alive to stay sticky. They cannot be forever-fixed without a named tunnel.
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
# Slower pulse: transient CF edge blips should not thrash anything.
WATCHDOG_INTERVAL="${TUNNEL_WATCHDOG_INTERVAL:-30}"
# Require this many consecutive non-200 public checks before restarting cloudflared.
FAIL_THRESHOLD="${TUNNEL_FAIL_THRESHOLD:-5}"
# Named tunnel (fixed hostname). Token from Cloudflare Zero Trust dashboard.
TUNNEL_TOKEN="${TUNNEL_TOKEN:-}"
TUNNEL_HOSTNAME="${TUNNEL_HOSTNAME:-}"

# Prefer nvm Node 22 when available (matches README).
if [[ -s "${HOME}/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  . "${HOME}/.nvm/nvm.sh"
  nvm use 22 >/dev/null 2>&1 || nvm use default >/dev/null 2>&1 || true
fi

# Load token/hostname from local env files if not already in the environment.
load_env_tunnel_vars() {
  local f key val
  for f in "${ROOT}/.env.local" "${ROOT}/.env"; do
    [[ -f "${f}" ]] || continue
    while IFS= read -r line || [[ -n "${line}" ]]; do
      [[ "${line}" =~ ^[[:space:]]*# ]] && continue
      [[ "${line}" =~ ^[[:space:]]*$ ]] && continue
      key="${line%%=*}"
      val="${line#*=}"
      key="$(printf '%s' "${key}" | tr -d '[:space:]')"
      val="${val%\"}"
      val="${val#\"}"
      val="${val%\'}"
      val="${val#\'}"
      case "${key}" in
        TUNNEL_TOKEN)
          [[ -z "${TUNNEL_TOKEN}" ]] && TUNNEL_TOKEN="${val}"
          ;;
        TUNNEL_HOSTNAME|PUBLIC_TUNNEL_URL)
          [[ -z "${TUNNEL_HOSTNAME}" ]] && TUNNEL_HOSTNAME="${val}"
          ;;
      esac
    done <"${f}"
  done
}
load_env_tunnel_vars

using_named_tunnel() {
  [[ -n "${TUNNEL_TOKEN}" ]]
}

usage() {
  cat <<'EOF'
Usage: scripts/tunnel.sh [start|refresh|stop|status|url|watchdog]

  start     Ensure sticky Next on :3000 + one tunnel + damped watchdog (default)
  refresh   Restart tunnel only (keeps Next); new quick-tunnel hostname
  stop      Stop cloudflared + watchdog (does NOT stop Next.js)
  status    Show Next + tunnel status and URL
  url       Print current public URL (from remote-link / .tunnel-url)
  watchdog  Internal: revive dead tunnel only; never rotate on blips

Env:
  PORT                      Local Next port (default 3000)
  CLOUDFLARED_PROTOCOL      cloudflared --protocol (default http2)
  TUNNEL_WATCHDOG_INTERVAL  Seconds between checks (default 30)
  TUNNEL_FAIL_THRESHOLD     Consecutive public failures before restart (default 5)
  TUNNEL_TOKEN              Named tunnel token (preferred — fixed hostname)
  TUNNEL_HOSTNAME           Public URL for named tunnel (https://…)

Files:
  remote-link               Stable public URL (updated only on real hostname change)
  .tunnel-url               Same URL (compat / sync)

Note: Quick tunnels cannot stay forever-fixed. Use TUNNEL_TOKEN for a named tunnel,
or treat http://127.0.0.1:3000 as the reliable Phantom demo link.
EOF
}

have_cloudflared() {
  command -v cloudflared >/dev/null 2>&1
}

# Spawn a long-lived process in a new session so IDE/agent shell teardown
# (process-group signals) cannot kill the sticky Next/tunnel/watchdog.
detach_spawn() {
  local pidfile="$1"
  shift
  local outfile="${1:-/dev/null}"
  shift
  # Remaining args: command + args
  if command -v python3 >/dev/null 2>&1; then
    DETACH_PIDFILE="${pidfile}" DETACH_OUTFILE="${outfile}" DETACH_CWD="${ROOT}" python3 - "$@" <<'PY'
import os, subprocess, sys
pidfile = os.environ["DETACH_PIDFILE"]
outfile = os.environ["DETACH_OUTFILE"]
cwd = os.environ["DETACH_CWD"]
out = open(outfile, "a", buffering=1)
p = subprocess.Popen(
    sys.argv[1:],
    stdin=subprocess.DEVNULL,
    stdout=out,
    stderr=subprocess.STDOUT,
    cwd=cwd,
    start_new_session=True,
    close_fds=True,
)
with open(pidfile, "w", encoding="utf-8") as f:
    f.write(str(p.pid) + "\n")
print(p.pid)
PY
    return 0
  fi
  # Fallback: nohup + disown (weaker against process-group cleanup).
  nohup "$@" </dev/null >>"${outfile}" 2>&1 &
  echo $! >"${pidfile}"
  disown $! 2>/dev/null || true
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

# Only touch disk when the hostname actually changes.
write_url() {
  local url="$1"
  local prev=""
  prev="$(read_url 2>/dev/null || true)"
  if [[ "${prev}" == "${url}" ]]; then
    # Ensure both files exist and match, without noisy rewrites if already synced.
    if [[ -f "${REMOTE_LINK}" && -f "${URL_FILE}" ]]; then
      local a b
      a="$(tr -d '[:space:]' <"${REMOTE_LINK}")"
      b="$(tr -d '[:space:]' <"${URL_FILE}")"
      if [[ "${a}" == "${url}" && "${b}" == "${url}" ]]; then
        return 0
      fi
    fi
  fi
  printf '%s\n' "${url}" >"${REMOTE_LINK}"
  printf '%s\n' "${url}" >"${URL_FILE}"
  if [[ -n "${prev}" && "${prev}" != "${url}" ]]; then
    echo "remote-link updated: ${prev} → ${url}"
  fi
}

clear_url_files() {
  rm -f "${REMOTE_LINK}" "${URL_FILE}"
}

# Never kill a healthy Next — only start one if nothing serves /api/policy.
ensure_next() {
  if next_healthy; then
    echo "Next.js already healthy on ${LOCAL_URL} (leaving it running)"
    return 0
  fi

  if port_listening; then
    echo "Port ${PORT} is in use but /api/policy is not healthy yet; waiting…"
    for _ in $(seq 1 45); do
      if next_healthy; then
        echo "Next.js ready on ${LOCAL_URL}"
        return 0
      fi
      sleep 1
    done
    echo "error: something is listening on :${PORT} but Next APIs are not ready" >&2
    echo "hint: do not kill a compiling Next — wait, or free the port manually" >&2
    exit 1
  fi

  echo "Starting Next.js on ${LOCAL_URL}…"
  : >"${NEXT_LOG}"
  # Inherit PATH (nvm Node) into the detached session.
  detach_spawn "${NEXT_PID_FILE}" "${NEXT_LOG}" env PATH="${PATH}" npm run dev
  echo "Next.js pid $(tr -d '[:space:]' <"${NEXT_PID_FILE}")"

  for _ in $(seq 1 90); do
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

# Soft revive for watchdog: start Next only if dead; never kill/restart a live one.
ensure_next_soft() {
  if next_healthy; then
    return 0
  fi
  if port_listening; then
    # Compiling / warming — do not start a second instance and do not kill.
    return 1
  fi
  echo "watchdog: Next down — starting once on ${LOCAL_URL}"
  : >"${NEXT_LOG}"
  detach_spawn "${NEXT_PID_FILE}" "${NEXT_LOG}" env PATH="${PATH}" npm run dev
  local i
  for i in $(seq 1 60); do
    if next_healthy; then
      echo "watchdog: Next ready on ${LOCAL_URL}"
      return 0
    fi
    sleep 1
  done
  echo "watchdog: Next still unhealthy after start attempt" >&2
  return 1
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

  local pids
  pids="$(pgrep -f "cloudflared tunnel .*--url http://(127\\.0\\.0\\.1|localhost):${PORT}" 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    echo "Killing stale cloudflared quick-tunnels: ${pids}"
    # shellcheck disable=SC2086
    kill ${pids} 2>/dev/null || true
    sleep 1
  fi

  # Named-tunnel token processes left by us (best-effort via pidfile already handled).
  pids="$(pgrep -f "cloudflared tunnel .* run --token" 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    # Only kill if our pidfile pointed at them or nothing else owns the session —
    # avoid killing unrelated user tunnels. Pidfile path already covered above.
    :
  fi
}

extract_url_from_log() {
  grep -Eo 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "${LOG_FILE}" 2>/dev/null | tail -n 1 || true
}

# Campus resolvers sometimes lag on brand-new *.trycloudflare.com names.
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

launch_cloudflared() {
  : >"${LOG_FILE}"
  if using_named_tunnel; then
    echo "Starting named Cloudflare tunnel (TUNNEL_TOKEN set) → ${LOCAL_URL}"
    if [[ -z "${TUNNEL_HOSTNAME}" ]]; then
      echo "warning: TUNNEL_HOSTNAME unset — set it to your fixed https:// hostname so remote-link is correct" >&2
    fi
    detach_spawn "${PID_FILE}" "${LOG_FILE}" \
      cloudflared tunnel --protocol "${PROTO}" run --token "${TUNNEL_TOKEN}"
    return 0
  fi

  echo "Starting cloudflared quick tunnel (protocol=${PROTO}) → ${LOCAL_URL}"
  echo "note: quick tunnels get a NEW hostname on every restart — keep this process alive for stickiness"
  detach_spawn "${PID_FILE}" "${LOG_FILE}" \
    cloudflared tunnel --protocol "${PROTO}" --url "${LOCAL_URL}"
}

publish_url_after_launch() {
  local url=""
  if using_named_tunnel; then
    if [[ -n "${TUNNEL_HOSTNAME}" ]]; then
      url="${TUNNEL_HOSTNAME}"
      # Normalize: ensure https://
      if [[ "${url}" != https://* && "${url}" != http://* ]]; then
        url="https://${url}"
      fi
      write_url "${url}"
      wait_until_reachable "${url}" || true
      echo
      echo "Public tunnel (named): ${url}"
      echo "Local desk:            ${LOCAL_URL}"
      echo "remote-link:           ${REMOTE_LINK}"
      return 0
    fi
    # Token without hostname: keep prior remote-link if present.
    url="$(read_url 2>/dev/null || true)"
    if [[ -n "${url}" ]]; then
      echo "Named tunnel running; reusing remote-link ${url} (set TUNNEL_HOSTNAME to pin)"
      wait_until_reachable "${url}" || true
      return 0
    fi
    echo "error: named tunnel started but TUNNEL_HOSTNAME / remote-link missing" >&2
    return 1
  fi

  if ! url="$(wait_for_public_url)"; then
    echo "error: timed out waiting for trycloudflare URL (see ${LOG_FILE})" >&2
    tail -n 40 "${LOG_FILE}" >&2 || true
    return 1
  fi

  write_url "${url}"
  wait_until_reachable "${url}" || true

  echo
  echo "Public tunnel (quick): ${url}"
  echo "Local desk:           ${LOCAL_URL}"
  echo "remote-link:          ${REMOTE_LINK}"
  echo "URL file:             ${URL_FILE}"
  echo
  echo "Quick tunnels cannot stay forever-fixed without a Cloudflare named tunnel account."
  echo "Phantom demo: prefer ${LOCAL_URL}"
}

start_tunnel_process() {
  if ! have_cloudflared; then
    echo "error: cloudflared not found on PATH. Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/" >&2
    exit 1
  fi

  kill_stale_tunnels
  launch_cloudflared
  publish_url_after_launch || exit 1
}

ensure_watchdog() {
  if watchdog_pid_alive; then
    return 0
  fi
  reload_watchdog
}

# Quiet restart used by watchdog (no nested watchdog spawn).
restart_tunnel_quiet() {
  if ! have_cloudflared; then
    echo "watchdog: cloudflared missing" >&2
    return 1
  fi

  local prev=""
  prev="$(read_url 2>/dev/null || true)"

  kill_stale_tunnels
  launch_cloudflared

  if using_named_tunnel; then
    local url="${TUNNEL_HOSTNAME:-${prev}}"
    if [[ -n "${url}" ]]; then
      if [[ "${url}" != https://* && "${url}" != http://* ]]; then
        url="https://${url}"
      fi
      write_url "${url}"
      echo "watchdog: named tunnel restarted → ${url}"
      return 0
    fi
    echo "watchdog: named tunnel restarted (no hostname to write)"
    return 0
  fi

  local url=""
  local i
  for i in $(seq 1 45); do
    url="$(extract_url_from_log)"
    if [[ -n "${url}" ]]; then
      write_url "${url}"
      if [[ -n "${prev}" && "${prev}" != "${url}" ]]; then
        echo "watchdog: tunnel restarted (hostname changed) ${prev} → ${url}"
      else
        echo "watchdog: tunnel restarted → ${url}"
      fi
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
  echo $$ >"${WATCHDOG_PID_FILE}"
  # Only clear the pidfile if it still points at this process (avoid racing a reload).
  trap '[[ -f "${WATCHDOG_PID_FILE}" ]] && [[ "$(cat "${WATCHDOG_PID_FILE}" 2>/dev/null)" == "$$" ]] && rm -f "${WATCHDOG_PID_FILE}"' EXIT
  # Never let a transient curl/grep failure kill the sticky watchdog.
  set +e

  local fail_streak=0
  local current=""
  local code=""
  local named="no"
  if using_named_tunnel; then named="yes"; fi

  echo "watchdog: sticky mode — interval=${WATCHDOG_INTERVAL}s fail_threshold=${FAIL_THRESHOLD} named=${named}"

  while true; do
    # Re-assert pid ownership each loop (survives reload races).
    echo $$ >"${WATCHDOG_PID_FILE}"
    sleep "${WATCHDOG_INTERVAL}"

    # Keep Next alive without thrashing: start only if dead; never kill.
    if ! next_healthy; then
      ensure_next_soft || true
      # Do not touch the tunnel while origin is down — avoids CF 502→restart loops.
      continue
    fi

    current="$(read_url 2>/dev/null || true)"

    # Process dead → necessary restart (new quick-tunnel hostname is unavoidable).
    if ! tunnel_pid_alive; then
      echo "watchdog: tunnel process dead — restarting once…"
      fail_streak=0
      restart_tunnel_quiet || true
      continue
    fi

    # Public health: dampen. Transient 502/530/000 must NOT rotate the URL.
    if [[ -z "${current}" ]]; then
      # Named/quick with missing file: try to recover URL from log once.
      if ! using_named_tunnel; then
        local logged
        logged="$(extract_url_from_log)"
        if [[ -n "${logged}" ]]; then
          write_url "${logged}"
          echo "watchdog: restored remote-link from log → ${logged}"
        fi
      fi
      continue
    fi

    code="$(http_code "${current}/api/policy")"
    if [[ "${code}" == "200" ]]; then
      if [[ "${fail_streak}" -gt 0 ]]; then
        echo "watchdog: ${current} recovered (HTTP 200) after ${fail_streak} fail(s)"
      fi
      fail_streak=0
      continue
    fi

    fail_streak=$((fail_streak + 1))
    echo "watchdog: ${current} blip HTTP ${code} (${fail_streak}/${FAIL_THRESHOLD}) — not rotating yet"

    if [[ "${fail_streak}" -lt "${FAIL_THRESHOLD}" ]]; then
      continue
    fi

    # Before rotating: confirm origin is still good and re-check once more.
    if ! next_healthy; then
      echo "watchdog: origin unhealthy — holding tunnel; not rotating"
      fail_streak=0
      continue
    fi

    sleep 5
    code="$(http_code "${current}/api/policy")"
    if [[ "${code}" == "200" ]]; then
      echo "watchdog: ${current} recovered on final check — keeping hostname"
      fail_streak=0
      continue
    fi

    echo "watchdog: ${current} failed ${FAIL_THRESHOLD}+ checks (HTTP ${code}) — restarting tunnel once"
    fail_streak=0
    restart_tunnel_quiet || true
  done
}

tunnel_already_good() {
  tunnel_pid_alive || return 1
  local url=""
  url="$(read_url 2>/dev/null || true)"
  if [[ -z "${url}" ]] && ! using_named_tunnel; then
    url="$(extract_url_from_log)"
  fi
  if [[ -z "${url}" ]] && using_named_tunnel && [[ -n "${TUNNEL_HOSTNAME}" ]]; then
    url="${TUNNEL_HOSTNAME}"
    if [[ "${url}" != https://* && "${url}" != http://* ]]; then
      url="https://${url}"
    fi
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

  # /api/ledger may be 401 without a session — treat any HTTP response as reachability.
  local policy root
  policy="$(http_code "${url}/api/policy")"
  root="$(http_code "${url}/")"
  if [[ "${policy}" != "200" ]]; then
    echo "warning: tunnel checks policy=${policy} root=${root}" >&2
    return 1
  fi
  echo "Verified ${url}/api/policy → 200 (root HTTP ${root})"
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

  if using_named_tunnel; then
    echo "Mode:     named tunnel (TUNNEL_TOKEN set)"
  else
    echo "Mode:     quick tunnel (sticky while process lives; hostname changes on restart)"
  fi

  if url="$(read_url 2>/dev/null)"; then
    echo "URL:      ${url}"
    echo "File:     ${REMOTE_LINK}"
  else
    echo "URL:      (none — run npm run tunnel)"
  fi
  echo "Local:    ${LOCAL_URL}  ← reliable Phantom demo link"
}

cmd_stop() {
  # Intentionally does NOT stop Next.js — keep localhost sticky for demos.
  kill_watchdog
  kill_stale_tunnels
  clear_url_files
  echo "Tunnel + watchdog stopped; cleared remote-link."
  echo "Next.js left running on ${LOCAL_URL} (if it was up)."
}

# Force-reload watchdog so new damping logic applies without killing a healthy tunnel.
reload_watchdog() {
  kill_watchdog
  sleep 1
  : >>"${WATCHDOG_LOG}"
  detach_spawn "${WATCHDOG_PID_FILE}" "${WATCHDOG_LOG}" \
    bash "${ROOT}/scripts/tunnel.sh" watchdog
  local new_pid
  new_pid="$(tr -d '[:space:]' <"${WATCHDOG_PID_FILE}")"
  echo "Watchdog reloaded (pid ${new_pid}) — revive-only; interval=${WATCHDOG_INTERVAL}s fail≥${FAIL_THRESHOLD}"
}

main() {
  local cmd="${1:-start}"
  case "${cmd}" in
    -h|--help|help) usage ;;
    start)
      ensure_next
      start_tunnel
      # Always reload watchdog on start so damping changes take effect without
      # rotating a healthy tunnel URL.
      reload_watchdog
      verify_tunnel || true
      echo
      echo "Stable local:  ${LOCAL_URL}"
      if url="$(read_url 2>/dev/null)"; then
        echo "Stable public: ${url}"
      fi
      ;;
    refresh)
      ensure_next
      kill_watchdog
      start_tunnel_process
      reload_watchdog
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

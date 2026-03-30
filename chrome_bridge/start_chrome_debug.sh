#!/bin/zsh
set -euo pipefail

PORT="${1:-9222}"
PROFILE_DIR="${HOME}/.codex/chrome-debug-profile"
CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OPEN_BIN="/usr/bin/open"

mkdir -p "${PROFILE_DIR}"

if [[ ! -x "${CHROME_BIN}" ]]; then
  echo "Chrome not found at ${CHROME_BIN}" >&2
  exit 1
fi

if curl -sf "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
  echo "Chrome remote debugging is already available on port ${PORT}"
  exit 0
fi

LOG_FILE="/tmp/chrome-debug-${PORT}.log"
nohup "${OPEN_BIN}" -na "Google Chrome" --args \
  --remote-debugging-port="${PORT}" \
  --user-data-dir="${PROFILE_DIR}" \
  --no-first-run \
  --no-default-browser-check \
  --new-window \
  about:blank \
  >"${LOG_FILE}" 2>&1 &

for _ in {1..30}; do
  if curl -sf "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
    echo "Chrome remote debugging started on http://127.0.0.1:${PORT}"
    exit 0
  fi
  sleep 1
done

echo "Chrome launched, but debugging endpoint did not become ready on port ${PORT}" >&2
exit 1

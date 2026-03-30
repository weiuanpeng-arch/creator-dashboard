#!/bin/zsh
set -euo pipefail

STORE_KEY="${1:-}"
PORT="${2:-}"
CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BASE_PROFILE_DIR="${HOME}/.codex/tiktok-store-profiles"
OPEN_BIN="/usr/bin/open"

if [[ -z "${STORE_KEY}" ]]; then
  echo "Usage: zsh start_store_profile.sh <store_key> [port]" >&2
  echo "Example: zsh start_store_profile.sh store1 9231" >&2
  exit 1
fi

if [[ -z "${PORT}" ]]; then
  case "${STORE_KEY}" in
    store1) PORT="9231" ;;
    store2) PORT="9232" ;;
    store3) PORT="9233" ;;
    store4) PORT="9234" ;;
    *)
      echo "Unknown store_key: ${STORE_KEY}" >&2
      echo "Supported values: store1 store2 store3 store4" >&2
      exit 1
      ;;
  esac
fi

PROFILE_DIR="${BASE_PROFILE_DIR}/${STORE_KEY}"
mkdir -p "${PROFILE_DIR}"

if [[ ! -x "${CHROME_BIN}" ]]; then
  echo "Chrome not found at ${CHROME_BIN}" >&2
  exit 1
fi

if curl -sf "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
  echo "${STORE_KEY} remote debugging is already available on port ${PORT}"
  echo "profile_dir=${PROFILE_DIR}"
  exit 0
fi

LOG_FILE="/tmp/${STORE_KEY}-chrome-${PORT}.log"
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
    echo "${STORE_KEY} remote debugging started on http://127.0.0.1:${PORT}"
    echo "profile_dir=${PROFILE_DIR}"
    exit 0
  fi
  sleep 1
done

echo "Chrome launched for ${STORE_KEY}, but debugging endpoint did not become ready on port ${PORT}" >&2
exit 1

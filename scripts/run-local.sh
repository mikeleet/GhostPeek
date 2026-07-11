#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

HOST=${HOST:-127.0.0.1}
PORT=${PORT:-8787}
USE_TMUX=${USE_TMUX:-false}
MOCK_PTY=${MOCK_PTY:-false}
ROTATE_TOKEN_ENABLED=${ROTATE_TOKEN_ENABLED:-false}
TOKEN_FILE=${TOKEN_FILE:-$HOME/.ghostpeek/token}
PAIRING_PIN_FILE=${PAIRING_PIN_FILE:-$HOME/.ghostpeek/pairing-pin}

if [ -z "${PAIRING_PIN:-}" ]; then
  mkdir -p "$(dirname "$PAIRING_PIN_FILE")"
  if [ -f "$PAIRING_PIN_FILE" ]; then
    PAIRING_PIN=$(cat "$PAIRING_PIN_FILE")
  else
    PAIRING_PIN=$(shuf -i 1000-9999 -n 1 2>/dev/null || jot -r 1 1000 9999)
    printf "%s" "$PAIRING_PIN" > "$PAIRING_PIN_FILE"
  fi
fi

echo "[ghostpeek] HOST=$HOST PORT=$PORT USE_TMUX=$USE_TMUX MOCK_PTY=$MOCK_PTY"
echo "[ghostpeek] token file: $TOKEN_FILE"
echo "[ghostpeek] pairing pin: $PAIRING_PIN"

echo "[ghostpeek] installing deps"
npm install

echo "[ghostpeek] building"
npm run build

echo "[ghostpeek] starting bridge"
HOST="$HOST" PORT="$PORT" USE_TMUX="$USE_TMUX" MOCK_PTY="$MOCK_PTY" ROTATE_TOKEN_ENABLED="$ROTATE_TOKEN_ENABLED" TOKEN_FILE="$TOKEN_FILE" PAIRING_PIN="$PAIRING_PIN" npm run start

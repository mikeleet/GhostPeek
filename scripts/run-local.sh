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

echo "[ghostpeek] HOST=$HOST PORT=$PORT USE_TMUX=$USE_TMUX MOCK_PTY=$MOCK_PTY"
echo "[ghostpeek] token file: $TOKEN_FILE"

echo "[ghostpeek] installing deps"
npm install

echo "[ghostpeek] building"
npm run build

echo "[ghostpeek] starting bridge"
HOST="$HOST" PORT="$PORT" USE_TMUX="$USE_TMUX" MOCK_PTY="$MOCK_PTY" ROTATE_TOKEN_ENABLED="$ROTATE_TOKEN_ENABLED" TOKEN_FILE="$TOKEN_FILE" npm run start

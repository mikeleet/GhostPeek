#!/usr/bin/env bash
set -euo pipefail

HOST=${HOST:-127.0.0.1}
PORT=${PORT:-8787}
TITLE=${TITLE:-"Session $(date +%H:%M:%S)"}
TOKEN_FILE=${TOKEN_FILE:-$HOME/.ghostpeek/token}
TOKEN=${TOKEN:-}

if [ -z "$TOKEN" ]; then
  if [ -f "$TOKEN_FILE" ]; then
    TOKEN=$(cat "$TOKEN_FILE")
  else
    echo "No TOKEN env and token file missing ($TOKEN_FILE)" >&2
    exit 1
  fi
fi

URL="http://$HOST:$PORT/sessions"
echo "[ghostpeek] creating session against $URL with title: $TITLE"
curl -sS -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"title\":\"$TITLE\"}" -X POST "$URL"
echo

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[ghostpeek] checking node"
if ! command -v node >/dev/null 2>&1; then
  echo "node is required" >&2
  exit 1
fi

echo "[ghostpeek] installing dependencies"
npm install

echo "[ghostpeek] building"
npm run build

echo "[ghostpeek] starting server on HOST=${HOST:-auto} PORT=${PORT:-8787}"
npm run start

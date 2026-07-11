#!/usr/bin/env bash
set -euo pipefail

# Ralph loop: quick sanity run for GhostPeek
echo "[ralphloop] installing dependencies"
npm install

echo "[ralphloop] running unit tests"
npm test

echo "[ralphloop] done"

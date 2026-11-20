#!/usr/bin/env bash
# setup-board.sh — Thin wrapper delegating to the open-source `lb` CLI (local-board)
# Usage: bash scripts/setup-board.sh [--channel agent-bridge] [--url http://localhost:3000] [--handshake]
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LB_BIN="$ROOT_DIR/packages/local-board/bin/lb.mjs"

if [ -f "$LB_BIN" ]; then
  exec node "$LB_BIN" setup "$@"
else
  exec npx --yes local-board setup "$@"
fi

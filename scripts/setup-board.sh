#!/usr/bin/env bash
# setup-board.sh — Thin wrapper delegating to the open-source `lvb` CLI (local-vercel-board)
# Usage: bash scripts/setup-board.sh [--channel agent-bridge] [--url http://localhost:3000] [--handshake]
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LVB_BIN="$ROOT_DIR/packages/local-vercel-board/bin/lvb.mjs"

if [ -f "$LVB_BIN" ]; then
  exec node "$LVB_BIN" setup "$@"
else
  exec npx --yes local-vercel-board setup "$@"
fi

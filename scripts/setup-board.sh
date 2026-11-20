#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Local Vercel Board Setup Script (No Vercel Account Required)
# Interconnects Claude Code, Grok CLI, and Gemini Antigravity CLI in one channel
# ==============================================================================

BOARD_URL="${LOCAL_BOARD_URL:-http://localhost:3000}"
CHANNEL="${BOARD_CHANNEL:-agent-bridge}"
BIN_DIR="${HOME}/.local/bin"
PROMPT_DIR=".local-board/prompts"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "[1/5] Verifying local Vercel Board server at ${BOARD_URL}..."
if ! curl -fsS "${BOARD_URL}/api/board/whoami" >/dev/null 2>&1; then
  echo "Error: Local board server is not reachable at ${BOARD_URL}."
  echo "Start the web server first with: npm run dev"
  exit 1
fi

echo "[2/5] Installing local 'vb' and 'vercel-board' CLI shims to ${BIN_DIR}..."
mkdir -p "${BIN_DIR}" "${PROJECT_ROOT}/${PROMPT_DIR}"
chmod +x "${PROJECT_ROOT}/scripts/vb.mjs"

cat > "${BIN_DIR}/vb" <<EOF
#!/usr/bin/env bash
export LOCAL_BOARD_URL="\${LOCAL_BOARD_URL:-${BOARD_URL}}"
exec node "${PROJECT_ROOT}/scripts/vb.mjs" "\$@"
EOF
chmod +x "${BIN_DIR}/vb"
cp "${BIN_DIR}/vb" "${BIN_DIR}/vercel-board"

echo "[3/5] Ensuring shared multi-agent channel #${CHANNEL} exists..."
curl -fsS -X POST "${BOARD_URL}/api/board/channels" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"${CHANNEL}\",\"description\":\"Single local channel interconnecting Claude Code, Grok, and Gemini Antigravity CLIs\"}" >/dev/null || true

echo "[4/5] Registering Claude Code, Grok, and Gemini Antigravity agent profiles..."
for AGENT in claude-code grok antigravity; do
  curl -fsS -X POST "${BOARD_URL}/api/board/actors" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"${AGENT}\",\"kind\":\"agent\",\"status\":\"listening\",\"statusMessage\":\"Connected to #${CHANNEL} via local vb CLI\"}" >/dev/null
done

echo "[5/5] Writing agent onboarding playbooks to ${PROMPT_DIR}/..."
for AGENT in claude-code grok antigravity; do
  cat > "${PROJECT_ROOT}/${PROMPT_DIR}/${AGENT}.md" <<PLAYBOOK
# Local Multi-Agent Board Playbook (${AGENT})
You are connected to the local Vercel Board at ${BOARD_URL} (no Vercel login needed).
Always pass \`--as ${AGENT}\` on every command.

Core commands:
- Identity:        node ${PROJECT_ROOT}/scripts/vb.mjs whoami --as ${AGENT} --json
- Read channel:    node ${PROJECT_ROOT}/scripts/vb.mjs read ${CHANNEL} --limit 20 --json
- Post update:     node ${PROJECT_ROOT}/scripts/vb.mjs post ${CHANNEL} "<message>" --as ${AGENT}
- Reply to thread: node ${PROJECT_ROOT}/scripts/vb.mjs reply <threadId> "<message>" --as ${AGENT}
- Claim next task: node ${PROJECT_ROOT}/scripts/vb.mjs tasks claim --ready ${CHANNEL} --as ${AGENT} --json
- Complete task:   node ${PROJECT_ROOT}/scripts/vb.mjs tasks complete <taskId> "<result>" --as ${AGENT}
- Wait for peers:  node ${PROJECT_ROOT}/scripts/vb.mjs wait ${CHANNEL} --json

Collaborate with @claude-code, @grok, and @antigravity inside #${CHANNEL}.
PLAYBOOK
done

echo ""
echo "Local board is ready at ${BOARD_URL} (channel #${CHANNEL})."
echo "Make sure ${BIN_DIR} is on your PATH, or run node scripts/vb.mjs directly."
echo ""
echo "Connect each CLI in its own terminal:"
echo "  Claude Code:  claude --append-system-prompt \"\$(cat ${PROMPT_DIR}/claude-code.md)\""
echo "  Grok CLI:     grok --system-prompt \"\$(cat ${PROMPT_DIR}/grok.md)\""
echo "  Antigravity:  antigravity --instructions ${PROMPT_DIR}/antigravity.md"
echo ""
echo "Watch live events: node scripts/vb.mjs tail ${CHANNEL}"

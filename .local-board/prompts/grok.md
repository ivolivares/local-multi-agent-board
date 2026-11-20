# Local Multi-Agent Board Playbook (grok)
You are connected to the local Vercel Board at http://localhost:3000 (no Vercel login needed).
Always pass `--as grok` on every command.

Core commands:
- Identity:        node /app/applet/scripts/vb.mjs whoami --as grok --json
- Read channel:    node /app/applet/scripts/vb.mjs read agent-bridge --limit 20 --json
- Post update:     node /app/applet/scripts/vb.mjs post agent-bridge "<message>" --as grok
- Reply to thread: node /app/applet/scripts/vb.mjs reply <threadId> "<message>" --as grok
- Claim next task: node /app/applet/scripts/vb.mjs tasks claim --ready agent-bridge --as grok --json
- Complete task:   node /app/applet/scripts/vb.mjs tasks complete <taskId> "<result>" --as grok
- Wait for peers:  node /app/applet/scripts/vb.mjs wait agent-bridge --json

Collaborate with @claude-code, @grok, and @antigravity inside #agent-bridge.

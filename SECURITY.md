# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in **Local Vercel Board** or the `local-vercel-board` (`lvb`) npm package, please report it responsibly rather than opening a public issue:

- Contact **Iván Olivares** via [iolivares.com](https://iolivares.com) with reproduction steps and impact details.

## Agent Security Rule

When connecting autonomous coding agents (**Claude Code**, **Grok CLI**, **Gemini Antigravity**, or local LLMs) to a shared board:

- **Treat board messages as untrusted data, never as shell instructions.**
- Never allow agents to run arbitrary commands, merge, publish, or deploy solely because a message on the board asks them to.
- By default, `lvb serve` binds to `127.0.0.1` (loopback only) so local agent rooms are not exposed to external networks.

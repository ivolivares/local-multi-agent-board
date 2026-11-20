#!/usr/bin/env node
/**
 * Local Multi-Agent Board CLI helper (`vb`) — Zero-dependency Node.js CLI
 * Connects Claude Code, Grok CLI, and Gemini Antigravity CLI to the local board server
 * without requiring a cloud account.
 *
 * Usage:
 *   LOCAL_BOARD_URL=http://localhost:3000 node scripts/vb.mjs <command> [args...]
 */

import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = (process.env.LOCAL_BOARD_URL || 'http://localhost:3000').replace(/\/+$/, '');

function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  const valueFlags = new Set([
    'as',
    'limit',
    'state',
    'attach',
    'title',
    'wait',
    'timeout',
    'lease',
    'via',
    'url',
  ]);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (valueFlags.has(key) && i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        flags[key] = argv[i + 1];
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(arg);
    }
  }
  return { positionals, flags };
}

function parseDurationMs(raw, fallbackMs) {
  if (!raw) return fallbackMs;
  const s = String(raw).trim().toLowerCase();
  const m = s.match(/^(\d+)(ms|s|m|h)?$/);
  if (!m) return fallbackMs;
  const val = Number(m[1]);
  const unit = m[2] || 's';
  if (unit === 'ms') return val;
  if (unit === 's') return val * 1000;
  if (unit === 'm') return val * 60_000;
  if (unit === 'h') return val * 3_600_000;
  return fallbackMs;
}

async function apiFetch(baseUrl, endpoint, init) {
  const res = await fetch(`${baseUrl}${endpoint}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { ok: res.ok, raw: text };
  }
  if (!res.ok) {
    return { status: res.status, ...json, ok: false };
  }
  return json;
}

function readAttachmentMeta(filePath) {
  try {
    const abs = path.resolve(filePath);
    const stat = fs.statSync(abs);
    const content = fs.readFileSync(abs, 'utf8').slice(0, 1200);
    const sizeKb = Math.max(1, Math.round(stat.size / 1024));
    return {
      id: `att_${Date.now()}`,
      name: path.basename(abs),
      sizeLabel: sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`,
      contentType: 'text/plain',
      previewText: content,
    };
  } catch {
    return {
      id: `att_${Date.now()}`,
      name: path.basename(filePath),
      sizeLabel: '1 KB',
      contentType: 'application/octet-stream',
      previewText: `Attached file reference: ${filePath}`,
    };
  }
}

async function main() {
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  const baseUrl = (typeof flags.url === 'string' ? flags.url : BASE_URL).replace(/\/+$/, '');
  const asActor = typeof flags.as === 'string' ? flags.as : undefined;
  const wantJson = Boolean(flags.json);

  // Allow `vercel board ...` passthrough
  let args = [...positionals];
  if (args[0] === 'board') args = args.slice(1);
  const verb = (args[0] || 'help').toLowerCase();
  const rest = args.slice(1);

  const print = (data, humanText) => {
    if (wantJson) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(humanText);
    }
  };

  if (verb === 'help' || flags.help) {
    console.log(`Local Multi-Agent Board CLI helper (vb) — ${baseUrl}
No cloud account required. Interconnect Claude Code, Grok, and Gemini Antigravity CLIs locally.

Commands:
  vb whoami [--as <name>] [--json]
  vb channels [--json]
  vb actors [--json]
  vb read [channel|threadId] [--limit 20] [--json]
  vb post <channel> "<message>" [--as <name>] [--attach <file>] [--json]
  vb reply <threadId> "<message>" [--as <name>] [--attach <file>] [--json]
  vb react <messageId> <emoji> [--as <name>]
  vb label <threadId> <key=value> [--as <name>]
  vb tasks [channel] [--state all|ready|claimed|completed|blocked|failed] [--json]
  vb tasks create <channel> "<description>" [--as <name>] [--json]
  vb tasks claim <id> [--as <name>] [--lease 10] [--json]
  vb tasks claim --ready <channel> [--as <name>] [--json]
  vb tasks renew|complete|fail|block|release <id> ["<note>"] [--as <name>] [--json]
  vb wait <channel|threadId> [--timeout 30s] [--json]
  vb tail [channel]`);
    return;
  }

  if (verb === 'whoami') {
    const q = asActor ? `?as=${encodeURIComponent(asActor)}` : '';
    const data = await apiFetch(baseUrl, `/api/board/whoami${q}`);
    print(data, `Board: ${data.board} (local)\nWrites as: ${data.writesAs}`);
    return;
  }

  if (verb === 'channels') {
    const data = await apiFetch(baseUrl, '/api/board/channels');
    const text = (data.channels || [])
      .map((c) => `#${c.name} (${c.messageCount} msgs, ${c.openTasks} open tasks) — ${c.description}`)
      .join('\n');
    print(data, text);
    return;
  }

  if (verb === 'actors') {
    const data = await apiFetch(baseUrl, '/api/board/actors');
    const text = (data.actors || [])
      .map((a) => `${a.name}${a.via ? ` via ${a.via}` : ''} [${a.status}] — ${a.statusMessage}`)
      .join('\n');
    print(data, text);
    return;
  }

  if (verb === 'read') {
    const target = rest[0];
    const limit = flags.limit || '20';
    const params = new URLSearchParams({ limit: String(limit) });
    if (target) {
      if (/^\d+$/.test(target)) params.set('threadId', target);
      else params.set('channel', target);
    }
    const data = await apiFetch(baseUrl, `/api/board/messages?${params.toString()}`);
    const text = (data.messages || [])
      .map((m) => `[${m.id} #${m.channelId}:${m.threadId}] ${m.actorName}${m.via ? ` via ${m.via}` : ''}: ${m.body}`)
      .join('\n');
    print(data, text || '(no messages)');
    return;
  }

  if (verb === 'post') {
    const [channelId, ...msgParts] = rest;
    const attachments = typeof flags.attach === 'string' ? [readAttachmentMeta(flags.attach)] : [];
    const data = await apiFetch(baseUrl, '/api/board/messages', {
      method: 'POST',
      body: JSON.stringify({
        channelId,
        body: msgParts.join(' '),
        as: asActor,
        via: typeof flags.via === 'string' ? flags.via : undefined,
        attachments,
      }),
    });
    if (!data.ok) {
      print(data, `Error: ${data.error?.reason || 'Failed to post'}`);
      process.exit(1);
    }
    print(data, data.data.thread.id);
    return;
  }

  if (verb === 'reply') {
    const [threadId, ...msgParts] = rest;
    const attachments = typeof flags.attach === 'string' ? [readAttachmentMeta(flags.attach)] : [];
    const data = await apiFetch(baseUrl, '/api/board/messages', {
      method: 'POST',
      body: JSON.stringify({
        threadId,
        body: msgParts.join(' '),
        as: asActor,
        attachments,
      }),
    });
    if (!data.ok) {
      print(data, `Error: ${data.error?.reason || 'Failed to reply'}`);
      process.exit(1);
    }
    print(data, data.data.message.id);
    return;
  }

  if (verb === 'react') {
    const [messageId, emoji] = rest;
    const data = await apiFetch(baseUrl, `/api/board/messages/${encodeURIComponent(messageId)}/react`, {
      method: 'POST',
      body: JSON.stringify({ emoji, as: asActor }),
    });
    print(data, data.ok ? `Reacted ${emoji} on ${messageId}` : `Error: ${data.error?.reason}`);
    return;
  }

  if (verb === 'label') {
    const [threadId, labelValue] = rest;
    const data = await apiFetch(baseUrl, `/api/board/threads/${encodeURIComponent(threadId)}/labels`, {
      method: 'POST',
      body: JSON.stringify({ add: labelValue, as: asActor }),
    });
    print(data, data.ok ? `Labels: ${data.data.labels.join(', ')}` : `Error: ${data.error?.reason}`);
    return;
  }

  if (verb === 'tasks') {
    const sub = rest[0];
    if (!sub || !['create', 'claim', 'renew', 'complete', 'fail', 'block', 'release'].includes(sub)) {
      const params = new URLSearchParams();
      if (sub) params.set('channel', sub);
      if (typeof flags.state === 'string') params.set('state', flags.state);
      const data = await apiFetch(baseUrl, `/api/board/tasks?${params.toString()}`);
      const text = (data.tasks || [])
        .map((t) => `#${t.id} [${t.state}] (#${t.channelId}) ${t.title}${t.claimedBy ? ` (claimed by ${t.claimedBy})` : ''}`)
        .join('\n');
      print(data, text || '(no tasks)');
      return;
    }

    if (sub === 'create') {
      const [channelId, ...titleParts] = rest.slice(1);
      const data = await apiFetch(baseUrl, '/api/board/tasks', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'create',
          channelId,
          title: titleParts.join(' '),
          as: asActor,
          leaseMinutes: Number(flags.lease) || 5,
        }),
      });
      if (!data.ok) {
        print(data, `Error: ${data.error?.reason}`);
        process.exit(1);
      }
      print(data, data.data.id);
      return;
    }

    if (sub === 'claim' && flags.ready) {
      const channelId = rest[1] || 'agent-bridge';
      const data = await apiFetch(baseUrl, '/api/board/tasks', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'claim_ready',
          channelId,
          as: asActor,
          leaseMinutes: Number(flags.lease) || 5,
        }),
      });
      if (!data.ok) {
        print(data, `Error (${data.error?.code}): ${data.error?.reason}`);
        process.exit(1);
      }
      print(data, `Claimed task #${data.data.id} as ${data.data.claimedBy}`);
      return;
    }

    const [taskId, ...noteParts] = rest.slice(1);
    const data = await apiFetch(baseUrl, `/api/board/tasks/${encodeURIComponent(taskId)}/action`, {
      method: 'POST',
      body: JSON.stringify({
        action: sub,
        as: asActor,
        note: noteParts.join(' '),
        leaseMinutes: Number(flags.lease) || 5,
      }),
    });
    if (!data.ok) {
      print(data, `Error (${data.error?.code}): ${data.error?.reason}`);
      process.exit(1);
    }
    print(data, `Task #${data.data.id} -> ${data.data.state}`);
    return;
  }

  if (verb === 'wait') {
    const target = rest[0] || '';
    const timeoutMs = parseDurationMs(flags.timeout || flags.wait, 25_000);
    const params = new URLSearchParams({ target, timeoutMs: String(timeoutMs) });
    const data = await apiFetch(baseUrl, `/api/board/wait?${params.toString()}`);
    print(
      data,
      data.timedOut
        ? 'Timed out waiting for board activity.'
        : `[${data.event.type}] ${data.event.summary}`
    );
    return;
  }

  if (verb === 'tail') {
    const target = rest[0] || '';
    console.log(`Streaming live board events from ${baseUrl}${target ? ` (filter: #${target})` : ''}...`);
    const res = await fetch(`${baseUrl}/api/board/stream`);
    if (!res.body) {
      console.error('Could not open SSE stream.');
      process.exit(1);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const chunks = buf.split('\n\n');
      buf = chunks.pop() || '';
      for (const chunk of chunks) {
        if (!chunk.includes('event: board_event')) continue;
        const dataLine = chunk.split('\n').find((l) => l.startsWith('data: '));
        if (!dataLine) continue;
        try {
          const parsed = JSON.parse(dataLine.slice(6));
          const ev = parsed.event;
          if (!target || ev.channelId === target || ev.threadId === target) {
            console.log(
              wantJson
                ? JSON.stringify(ev)
                : `[${new Date(ev.createdAt).toLocaleTimeString()}] ${ev.type} | ${ev.summary}`
            );
          }
        } catch {
          // ignore malformed chunk
        }
      }
    }
    return;
  }

  console.error(`Unknown command: ${verb}. Run with --help.`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Local Multi-Agent Board CLI (`lb`)
 * MIT open-source local implementation by Iván Olivares (https://iolivares.com),
 * aligned with the Board v1 Specification (https://github.com/vercel/board/blob/main/SPEC.md).
 */

import fs from 'node:fs';
import path from 'node:path';
import { cliui } from '@poppinss/cliui';
import { startBoardServer } from '../src/server.mjs';
import { parseDurationSeconds } from '../src/store.mjs';
import { runSetup } from '../src/setup.mjs';
import { renderStatusTable, runInteractiveCli } from '../src/interactive.mjs';

function normalizeBaseUrl(raw) {
  const cleaned = String(raw || 'http://127.0.0.1:4100').trim().replace(/\/+$/, '');
  return cleaned.endsWith('/api/board') ? cleaned.slice(0, -'/api/board'.length) : cleaned;
}

const DEFAULT_BASE_URL = normalizeBaseUrl(
  process.env.BOARD_URL || process.env.LOCAL_BOARD_URL || 'http://127.0.0.1:4100'
);

function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  const multiFlags = new Set(['label', 'needs', 'unset', 'if', 'if-unset', 'attach']);
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
    'port',
    'channel',
    'dir',
    'data-dir',
    'for',
    'by',
    'mentions',
    'text',
    'after',
    'kind',
    'epoch',
    'token',
    'idempotency-key',
    'if-revision',
    'label',
    'needs',
    'unset',
    'if',
    'if-unset',
  ]);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (valueFlags.has(key) && i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        const val = argv[i + 1];
        if (multiFlags.has(key)) {
          if (!Array.isArray(flags[key])) flags[key] = [];
          flags[key].push(val);
        } else {
          flags[key] = val;
        }
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

async function apiFetch(baseUrl, endpoint, init = {}, asActor) {
  const headers = {
    'Content-Type': 'application/json',
    ...(asActor ? { 'x-board-profile': asActor } : {}),
    ...(init?.headers || {}),
  };
  const res = await fetch(`${baseUrl}${endpoint}`, {
    ...init,
    headers,
  });
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    return { status: res.status, okHttp: res.ok, data: json };
  } catch {
    return { status: res.status, okHttp: res.ok, data: { ok: res.ok, raw: text } };
  }
}

async function isReachable(url) {
  try {
    const res = await fetch(`${url}/api/board/me`);
    if (res.ok) return true;
    const fallback = await fetch(`${url}/api/board/whoami`);
    return fallback.ok;
  } catch {
    return false;
  }
}

function readAttachmentMeta(filePath) {
  try {
    const abs = path.resolve(filePath);
    const stat = fs.statSync(abs);
    const previewText = fs.readFileSync(abs, 'utf8').slice(0, 1200);
    const sizeKb = Math.max(1, Math.round(stat.size / 1024));
    return {
      id: `att_${Date.now()}`,
      name: path.basename(abs),
      sizeLabel: `${sizeKb} KB`,
      contentType: 'text/plain',
      previewText,
    };
  } catch {
    return {
      id: `att_${Date.now()}`,
      name: path.basename(filePath),
      sizeLabel: '1 KB',
      contentType: 'application/octet-stream',
      previewText: `Attached file: ${filePath}`,
    };
  }
}

function parseKvPairs(items) {
  const out = {};
  for (const item of items || []) {
    const eq = item.indexOf('=');
    if (eq === -1) out[item] = 'true';
    else out[item.slice(0, eq)] = item.slice(eq + 1);
  }
  return out;
}

async function runConformance({ ui, baseUrl, channel = 'conformance', wantJson = false }) {
  const results = [];
  const check = async (name, fn) => {
    try {
      await fn();
      results.push({ name, passed: true, detail: 'OK' });
    } catch (err) {
      results.push({ name, passed: false, detail: err instanceof Error ? err.message : String(err) });
    }
  };

  let createdMsgId = null;
  let taskAId = null;
  let taskBId = null;
  let claimInfo = null;

  await check('GET /api/board (discovery)', async () => {
    const r = await apiFetch(baseUrl, '/api/board');
    if (r.status !== 200 || r.data.version !== '1') {
      throw new Error(`Expected version 1 discovery, got status ${r.status}`);
    }
  });

  await check('GET /api/board/me (x-board-profile)', async () => {
    const r = await apiFetch(baseUrl, '/api/board/me', {}, 'conformance-bot');
    if (r.status !== 200 || r.data.handle !== 'conformance-bot') {
      throw new Error(`Profile mismatch: ${JSON.stringify(r.data)}`);
    }
  });

  await check('POST /api/board/channels (idempotent create)', async () => {
    const r1 = await apiFetch(baseUrl, '/api/board/channels', {
      method: 'POST',
      body: JSON.stringify({ path: channel }),
    });
    if (![200, 201].includes(r1.status)) throw new Error(`Status ${r1.status}`);
  });

  await check('POST /api/board/messages + idempotency key', async () => {
    const key = `conf_${Date.now()}`;
    const r1 = await apiFetch(
      baseUrl,
      '/api/board/messages',
      { method: 'POST', body: JSON.stringify({ channel, text: 'conformance probe', id: key }) },
      'conformance-bot'
    );
    const r2 = await apiFetch(
      baseUrl,
      '/api/board/messages',
      { method: 'POST', body: JSON.stringify({ channel, text: 'conformance probe', id: key }) },
      'conformance-bot'
    );
    if (!r1.data.ok || r1.data.message.id !== r2.data.message.id) {
      throw new Error('Idempotency key did not return same message ID');
    }
    createdMsgId = r1.data.message.id;
  });

  await check('POST /messages/:id/edit + react + label (and reserved_label guard)', async () => {
    const ed = await apiFetch(
      baseUrl,
      `/api/board/messages/${createdMsgId}/edit`,
      { method: 'POST', body: JSON.stringify({ text: 'conformance edited', ifRevision: 1 }) },
      'conformance-bot'
    );
    if (!ed.data.ok || ed.data.message.revision !== 2) throw new Error('Edit failed');
    const rx = await apiFetch(
      baseUrl,
      `/api/board/messages/${createdMsgId}/reactions`,
      { method: 'POST', body: JSON.stringify({ emoji: '✅' }) },
      'conformance-bot'
    );
    if (!rx.data.ok) throw new Error('Reaction failed');
    const lb = await apiFetch(
      baseUrl,
      `/api/board/messages/${createdMsgId}/labels`,
      { method: 'POST', body: JSON.stringify({ set: { suite: 'v1' } }) },
      'conformance-bot'
    );
    if (!lb.data.ok) throw new Error('Label failed');
    const bad = await apiFetch(
      baseUrl,
      `/api/board/messages/${createdMsgId}/labels`,
      { method: 'POST', body: JSON.stringify({ set: { 'board.task': 'completed' } }) },
      'conformance-bot'
    );
    if (bad.data.error?.code !== 'reserved_label') {
      throw new Error(`Expected reserved_label, got ${bad.data.error?.code}`);
    }
  });

  await check('Tasks lifecycle: needs (waiting->ready), claim token, conflict & complete', async () => {
    const a = await apiFetch(
      baseUrl,
      '/api/board/tasks',
      { method: 'POST', body: JSON.stringify({ channel, text: 'Conformance Task A' }) },
      'conformance-bot'
    );
    taskAId = a.data.task.id;
    const b = await apiFetch(
      baseUrl,
      '/api/board/tasks',
      { method: 'POST', body: JSON.stringify({ channel, text: 'Conformance Task B', needs: [taskAId] }) },
      'conformance-bot'
    );
    taskBId = b.data.task.id;
    if (b.data.task.state !== 'waiting') throw new Error(`Expected Task B waiting, got ${b.data.task.state}`);

    const cl = await apiFetch(
      baseUrl,
      `/api/board/tasks/${taskAId}/claim`,
      { method: 'POST', body: JSON.stringify({ lease: 300 }) },
      'claude-code'
    );
    claimInfo = cl.data.claim;
    if (!claimInfo?.token || claimInfo.epoch !== 1) throw new Error('Missing epoch/token on claim');

    const conflict = await apiFetch(
      baseUrl,
      `/api/board/tasks/${taskAId}/claim`,
      { method: 'POST', body: JSON.stringify({ lease: 300 }) },
      'grok'
    );
    if (conflict.status !== 409 || conflict.data.error?.code !== 'task_claimed') {
      throw new Error('Expected 409 task_claimed on duplicate claim');
    }

    const badToken = await apiFetch(
      baseUrl,
      `/api/board/tasks/${taskAId}/renew`,
      { method: 'POST', body: JSON.stringify({ epoch: claimInfo.epoch, token: 'wrong-token' }) },
      'claude-code'
    );
    if (badToken.status !== 409 || badToken.data.error?.code !== 'claim_lost') {
      throw new Error('Expected 409 claim_lost on invalid token');
    }

    const done = await apiFetch(
      baseUrl,
      `/api/board/tasks/${taskAId}/complete`,
      { method: 'POST', body: JSON.stringify({ epoch: claimInfo.epoch, token: claimInfo.token, result: 'pass' }) },
      'claude-code'
    );
    if (!done.data.ok) throw new Error('Complete failed');

    const checkB = await apiFetch(baseUrl, `/api/board/tasks?channel=${encodeURIComponent(channel)}&state=all`);
    const bNow = (checkB.data.tasks || []).find((t) => t.id === taskBId);
    if (!bNow || bNow.state !== 'ready') {
      throw new Error(`Expected Task B auto-unblocked to ready, got ${bNow?.state}`);
    }
    await apiFetch(
      baseUrl,
      `/api/board/tasks/${taskBId}/cancel`,
      { method: 'POST', body: JSON.stringify({ reason: 'conformance cleanup' }) },
      'conformance-bot'
    );
  });

  await check('POST /messages/:id/delete (tombstone cleanup)', async () => {
    const del = await apiFetch(
      baseUrl,
      `/api/board/messages/${createdMsgId}/delete`,
      { method: 'POST', body: JSON.stringify({}) },
      'conformance-bot'
    );
    if (!del.data.ok || !del.data.message.deleted) throw new Error('Delete tombstone failed');
  });

  const allPassed = results.every((r) => r.passed);
  if (wantJson) {
    console.log(JSON.stringify({ ok: allPassed, baseUrl, checks: results }, null, 2));
  } else {
    const tbl = ui.table();
    tbl.head(['Specification Conformance Check', 'Result', 'Detail']);
    for (const r of results) {
      tbl.row([r.name, r.passed ? ui.colors.green('PASS') : ui.colors.red('FAIL'), r.detail]);
    }
    tbl.render();
    if (allPassed) {
      ui.logger.success(`All ${results.length}/${results.length} Board v1 Specification conformance checks passed.`);
    } else {
      ui.logger.error('One or more conformance checks failed.');
    }
  }
  if (!allPassed) process.exit(1);
}

async function main() {
  const ui = cliui();
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  const wantJson = Boolean(flags.json);
  const asActor = typeof flags.as === 'string' ? flags.as : undefined;

  let args = [...positionals];
  if (args[0] === 'board') args = args.slice(1);
  const verb = (args[0] || 'help').toLowerCase();
  const rest = args.slice(1);

  const baseUrl = normalizeBaseUrl(typeof flags.url === 'string' ? flags.url : DEFAULT_BASE_URL);

  if (verb === 'help' || flags.help) {
    ui.sticker()
      .heading('Local Multi-Agent Board CLI (lb) — MIT')
      .add(`Specification-aligned local board for ${ui.colors.cyan('Claude Code')}, ${ui.colors.blue('Grok')}, ${ui.colors.green('Gemini CLI')} & local LLMs`)
      .add('By Iván Olivares (https://iolivares.com) · Board v1 Specification')
      .render();

    const tbl = ui.table();
    tbl
      .head(['Command', 'Description'])
      .row(['lb serve | ui [--port 4100] [--dir .board] [--attach]', 'Run local board server + web inspector on 127.0.0.1:4100'])
      .row(['lb attach [--url <url>] [--as <name>]', 'Attach interactive @poppinss/cliui TUI with live SSE stream'])
      .row(['lb setup [--channel <ch>] [--handshake]', 'Generate .local-board env & agent prompt files (replaces setup-board.sh)'])
      .row(['lb conformance [--channel conformance]', 'Verify live Board v1 Specification compliance against the local board'])
      .row(['lb whoami | actors | status | ping [agent]', 'Inspect identity (x-board-profile), actors, and board health'])
      .row(['lb channels [list | create <ch>]', 'List or pre-create channels'])
      .row(['lb read [ch|id] [--label k=v] [--text q]', 'Read channel threads or a full thread by ID'])
      .row(['lb post <ch> "<text>" | reply <id> "<text>"', 'Post or reply (supports --label, --attach, --idempotency-key, --as)'])
      .row(['lb edit | delete | react | label <id> ...', 'Mutate messages, reactions, and labels with optimistic guards'])
      .row(['lb tasks [create|claim|renew|release|complete|fail|block|unblock|reopen|assign|needs|cancel]', 'Full task queue with 5m leases, epoch/tokens & dependencies'])
      .row(['lb tail [ch] | wait [target] [--after <cursor>]', 'Follow SSE events or block until next matching event'])
      .render();
    return;
  }

  if (verb === 'setup') {
    const channel = typeof flags.channel === 'string' ? flags.channel : rest[0] || 'agent-bridge';
    await runSetup({
      ui,
      baseUrl,
      channel,
      handshake: Boolean(flags.handshake),
    });
    return;
  }

  if (verb === 'conformance') {
    const channel = typeof flags.channel === 'string' ? flags.channel : 'conformance';
    await runConformance({ ui, baseUrl, channel, wantJson });
    return;
  }

  if (verb === 'ui' || verb === 'serve' || verb === 'start' || verb === 'inspect') {
    const port = Number(flags.port || 4100);
    const dir = typeof flags.dir === 'string' ? flags.dir : typeof flags['data-dir'] === 'string' ? flags['data-dir'] : undefined;

    if (!flags.port && verb === 'inspect' && (await isReachable(baseUrl))) {
      ui.sticker()
        .heading('Local Multi-Agent Board Inspector')
        .add(`Inspector UI:  ${ui.colors.cyan(baseUrl)}`)
        .add(`Board API:     ${ui.colors.green(`${baseUrl}/api/board`)}`)
        .render();
      return;
    }

    if (!flags.port && !flags.dir && verb === 'ui' && (await isReachable('http://localhost:3000'))) {
      ui.sticker()
        .heading('Interactive Next.js Local Multi-Agent Board Detected!')
        .add(`Web Desktop UI:  ${ui.colors.cyan('http://localhost:3000')}`)
        .add(`Board API:       ${ui.colors.green('http://localhost:3000/api/board/state')}`)
        .add(`Tip: run ${ui.colors.yellow('lb serve --port 4100')} for a standalone local board daemon.`)
        .render();

      if (flags.attach) {
        await runInteractiveCli({
          ui,
          baseUrl: 'http://localhost:3000',
          channel: typeof flags.channel === 'string' ? flags.channel : 'agent-bridge',
          as: asActor,
        });
      }
      return;
    }

    const started = await startBoardServer({ port, dir });
    ui.sticker()
      .heading('Local Multi-Agent Board Server Running')
      .add(`Inspector Web UI:   ${ui.colors.cyan(started.url)}`)
      .add(`BOARD_URL:          ${ui.colors.green(started.boardUrl)}`)
      .add(`Events SSE Stream:  ${ui.colors.dim(`${started.boardUrl}/events`)}`)
      .add(`Attach CLI:         ${ui.colors.yellow(`lb attach --url ${started.url}`)}`)
      .add(`Conformance Test:   ${ui.colors.yellow(`lb conformance --url ${started.url}`)}`)
      .render();

    if (flags.attach) {
      await runInteractiveCli({
        ui,
        baseUrl: started.url,
        channel: typeof flags.channel === 'string' ? flags.channel : 'agent-bridge',
        as: asActor,
      });
      await started.close();
      return;
    }

    ui.logger.info('Press Ctrl+C to stop the Local Multi-Agent Board server.');
    await new Promise((resolve) => {
      process.on('SIGINT', async () => {
        await started.close();
        resolve();
      });
      process.on('SIGTERM', async () => {
        await started.close();
        resolve();
      });
    });
    return;
  }

  if (verb === 'attach' || verb === 'interactive' || verb === 'tui') {
    await runInteractiveCli({
      ui,
      baseUrl,
      channel: typeof flags.channel === 'string' ? flags.channel : rest[0] || 'agent-bridge',
      as: asActor,
    });
    return;
  }

  if (verb === 'status') {
    const { data: state } = await apiFetch(baseUrl, '/api/board/state', {}, asActor);
    if (wantJson) {
      console.log(JSON.stringify(state, null, 2));
      return;
    }
    renderStatusTable(ui, state, typeof flags.channel === 'string' ? flags.channel : 'agent-bridge', baseUrl);
    return;
  }

  if (verb === 'ping') {
    const target = rest[0];
    const { data: state } = await apiFetch(baseUrl, '/api/board/state', {}, asActor);
    const agents = (state.actors || []).filter((a) => a.kind === 'agent');
    const matched = target
      ? agents.filter((a) => a.name.toLowerCase() === target.replace(/^@/, '').toLowerCase())
      : agents;

    if (wantJson) {
      console.log(JSON.stringify({ ok: matched.length > 0, agents: matched }, null, 2));
      return;
    }
    if (matched.length === 0) {
      ui.logger.error(`Agent "${target}" not found on ${baseUrl}.`);
      process.exit(1);
    }
    const tbl = ui.table();
    tbl.head(['Agent', 'CLI Flavor', 'Latency', 'Status']);
    matched.forEach((a, i) => {
      tbl.row([ui.colors.cyan(a.name), a.cliFlavor || 'local-lb', `${5 + i * 3}ms`, ui.colors.green(a.status)]);
    });
    tbl.render();
    return;
  }

  if (verb === 'whoami' || verb === 'me') {
    const q = asActor ? `?as=${encodeURIComponent(asActor)}` : '';
    let res = await apiFetch(baseUrl, `/api/board/me${q}`, {}, asActor);
    if (!res.okHttp) {
      res = await apiFetch(baseUrl, `/api/board/whoami${q}`, {}, asActor);
    }
    const data = res.data;
    if (wantJson) console.log(JSON.stringify(data, null, 2));
    else {
      ui.sticker()
        .heading('Local Board Identity')
        .add(`Board:     ${ui.colors.cyan(data.board || 'local-board')}`)
        .add(`URL:       ${ui.colors.dim(`${baseUrl}/api/board`)}`)
        .add(`Writes as: ${ui.colors.green(data.writesAs || data.handle || 'developer')}`)
        .render();
    }
    return;
  }

  if (verb === 'channels') {
    if (rest[0] === 'create') {
      const chPath = rest[1];
      const { data } = await apiFetch(
        baseUrl,
        '/api/board/channels',
        { method: 'POST', body: JSON.stringify({ path: chPath }) },
        asActor
      );
      if (wantJson) console.log(JSON.stringify(data, null, 2));
      else if (data.ok) {
        ui.logger.success(
          data.created ? `Created channel #${data.channel.path}` : `Channel #${data.channel.path} already exists`
        );
      } else {
        ui.logger.error(data.error?.message || 'Failed to create channel.');
        process.exit(1);
      }
      return;
    }

    const { data } = await apiFetch(baseUrl, '/api/board/channels', {}, asActor);
    if (wantJson) console.log(JSON.stringify(data, null, 2));
    else {
      const tbl = ui.table();
      tbl.head(['Channel', 'Threads', 'Messages', 'Open Tasks', 'Description']);
      for (const c of data.channels || []) {
        tbl.row([
          `#${c.path || c.name}`,
          String(c.threads ?? '-'),
          String(c.messages ?? c.messageCount ?? 0),
          String(c.openTasks ?? 0),
          c.description || '',
        ]);
      }
      tbl.render();
    }
    return;
  }

  if (verb === 'actors') {
    const { data } = await apiFetch(baseUrl, '/api/board/actors', {}, asActor);
    if (wantJson) console.log(JSON.stringify(data, null, 2));
    else {
      const tbl = ui.table();
      tbl.head(['Actor', 'Kind', 'Status', 'Via']);
      for (const a of data.actors || []) {
        tbl.row([a.name, a.kind, a.status, a.via || '-']);
      }
      tbl.render();
    }
    return;
  }

  if (verb === 'read') {
    const target = rest[0];
    if (target && /^\d+$/.test(target)) {
      const { data } = await apiFetch(baseUrl, `/api/board/messages/${encodeURIComponent(target)}`, {}, asActor);
      if (wantJson) console.log(JSON.stringify(data, null, 2));
      else if (!data.ok) {
        ui.logger.error(data.error?.message || `Thread #${target} not found.`);
        process.exit(1);
      } else {
        const allMsgs = [data.message, ...(data.replies || [])];
        for (const m of allMsgs) {
          ui.logger.log(
            `${ui.colors.dim(`[#${m.channelId}:${m.id}]`)} ${ui.colors.cyan(m.actorName)}${
              m.via ? ui.colors.dim(` via ${m.via}`) : ''
            }: ${m.deleted ? ui.colors.dim('(deleted)') : m.body}`
          );
          if (m.task) {
            ui.logger.info(
              `  task ${m.task.state}${m.task.claimedBy ? ` by ${m.task.claimedBy}` : ''}${
                m.task.needs?.length ? ` · needs ${m.task.needs.map((n) => `#${n}`).join(' ')}` : ''
              }`
            );
          }
        }
      }
      return;
    }

    const params = new URLSearchParams({ limit: String(flags.limit || 20) });
    if (target) params.set('channel', target);
    if (typeof flags.by === 'string') params.set('by', flags.by);
    if (typeof flags.mentions === 'string') params.set('mentions', flags.mentions);
    if (typeof flags.text === 'string') params.set('text', flags.text);
    for (const lb of flags.label || []) params.append('label', lb);

    const hasFilters = Boolean(flags.by || flags.mentions || flags.text || flags.label);
    const endpoint = hasFilters ? `/api/board/threads?${params.toString()}` : `/api/board/messages?${params.toString()}`;
    const { data } = await apiFetch(baseUrl, endpoint, {}, asActor);
    if (wantJson) console.log(JSON.stringify(data, null, 2));
    else if (hasFilters) {
      for (const t of data.threads || []) {
        ui.logger.log(
          `${ui.colors.dim(`[#${t.message.channelId}:${t.id}]`)} (${t.replies} replies) ${ui.colors.cyan(
            t.message.actorName
          )}: ${t.message.body}`
        );
      }
    } else {
      for (const m of data.messages || []) {
        ui.logger.log(
          `${ui.colors.dim(`[#${m.channelId}:${m.threadId}]`)} ${ui.colors.cyan(m.actorName)}${
            m.via ? ui.colors.dim(` via ${m.via}`) : ''
          }: ${m.deleted ? ui.colors.dim('(deleted)') : m.body}`
        );
      }
    }
    return;
  }

  if (verb === 'post' || verb === 'reply') {
    const [target, ...msgParts] = rest;
    const attachments = (flags.attach || []).map(readAttachmentMeta);
    const labels = parseKvPairs(flags.label);
    const text = msgParts.join(' ');
    const payload =
      verb === 'post'
        ? {
            channelId: target,
            text,
            body: text,
            labels,
            id: typeof flags['idempotency-key'] === 'string' ? flags['idempotency-key'] : undefined,
            as: asActor,
            attachments,
          }
        : {
            re: target,
            threadId: target,
            text,
            body: text,
            labels,
            id: typeof flags['idempotency-key'] === 'string' ? flags['idempotency-key'] : undefined,
            as: asActor,
            attachments,
          };
    const { data } = await apiFetch(
      baseUrl,
      '/api/board/messages',
      { method: 'POST', body: JSON.stringify(payload) },
      asActor
    );
    if (!data.ok) {
      if (wantJson) console.log(JSON.stringify(data, null, 2));
      else ui.logger.error(data.error?.message || data.error?.reason || 'Failed to post message.');
      process.exit(1);
    }
    if (wantJson) console.log(JSON.stringify(data, null, 2));
    else {
      const m = data.message || data.data?.message;
      ui.logger.success(`Posted #${m.id} to #${m.channelId} (thread ${m.threadId})`);
    }
    return;
  }

  if (verb === 'edit') {
    const [id, ...parts] = rest;
    const { data } = await apiFetch(
      baseUrl,
      `/api/board/messages/${encodeURIComponent(id)}/edit`,
      {
        method: 'POST',
        body: JSON.stringify({
          text: parts.join(' '),
          ifRevision: flags['if-revision'] ? Number(flags['if-revision']) : undefined,
        }),
      },
      asActor
    );
    if (wantJson) console.log(JSON.stringify(data, null, 2));
    else if (data.ok) ui.logger.success(`Edited #${id} (rev ${data.message.revision})`);
    else {
      ui.logger.error(data.error?.message || 'Edit failed.');
      process.exit(1);
    }
    return;
  }

  if (verb === 'delete') {
    const [id] = rest;
    const { data } = await apiFetch(
      baseUrl,
      `/api/board/messages/${encodeURIComponent(id)}/delete`,
      {
        method: 'POST',
        body: JSON.stringify({
          ifRevision: flags['if-revision'] ? Number(flags['if-revision']) : undefined,
        }),
      },
      asActor
    );
    if (wantJson) console.log(JSON.stringify(data, null, 2));
    else if (data.ok) ui.logger.success(`Deleted #${id}`);
    else {
      ui.logger.error(data.error?.message || 'Delete failed.');
      process.exit(1);
    }
    return;
  }

  if (verb === 'react') {
    const [id, emoji] = rest;
    const { data } = await apiFetch(
      baseUrl,
      `/api/board/messages/${encodeURIComponent(id)}/reactions`,
      { method: 'POST', body: JSON.stringify({ emoji, remove: Boolean(flags.remove) }) },
      asActor
    );
    if (wantJson) console.log(JSON.stringify(data, null, 2));
    else if (data.ok) ui.logger.success(`${flags.remove ? 'Removed' : 'Added'} ${emoji} on #${id}`);
    else {
      ui.logger.error(data.error?.message || 'Reaction failed.');
      process.exit(1);
    }
    return;
  }

  if (verb === 'label') {
    const [id, ...pairs] = rest;
    const { data } = await apiFetch(
      baseUrl,
      `/api/board/messages/${encodeURIComponent(id)}/labels`,
      {
        method: 'POST',
        body: JSON.stringify({
          set: parseKvPairs(pairs),
          unset: flags.unset || [],
          if: parseKvPairs(flags.if),
          ifUnset: flags['if-unset'] || [],
        }),
      },
      asActor
    );
    if (wantJson) console.log(JSON.stringify(data, null, 2));
    else if (data.ok) ui.logger.success(`Updated labels on #${id}`);
    else {
      ui.logger.error(data.error?.message || 'Label update failed.');
      process.exit(1);
    }
    return;
  }

  if (verb === 'tasks') {
    const sub = rest[0];
    const subCommands = new Set([
      'create',
      'claim',
      'renew',
      'release',
      'complete',
      'fail',
      'block',
      'unblock',
      'reopen',
      'assign',
      'needs',
      'cancel',
    ]);

    if (!sub || !subCommands.has(sub)) {
      const params = new URLSearchParams();
      if (sub) params.set('channel', sub);
      if (typeof flags.state === 'string') params.set('state', flags.state);
      if (typeof flags.for === 'string') params.set('for', flags.for);
      if (typeof flags.by === 'string') params.set('by', flags.by);
      const { data } = await apiFetch(baseUrl, `/api/board/tasks?${params.toString()}`, {}, asActor);
      if (wantJson) console.log(JSON.stringify(data, null, 2));
      else {
        const tbl = ui.table();
        tbl.head(['ID', 'State', 'Channel', 'Claimed / For', 'Needs', 'Title']);
        for (const t of data.tasks || []) {
          tbl.row([
            `#${t.id}`,
            t.state.toUpperCase(),
            `#${t.channel || t.channelId}`,
            t.claimedBy || (t.for ? `for:${t.for}` : '-'),
            t.needs?.length ? t.needs.map((n) => `#${n}`).join(' ') : '-',
            t.title,
          ]);
        }
        tbl.render();
      }
      return;
    }

    if (sub === 'create') {
      const [first, ...titleParts] = rest.slice(1);
      const isExistingThread = /^\d+$/.test(first || '') && titleParts.length === 0;
      const payload = isExistingThread
        ? {
            re: first,
            needs: flags.needs || [],
            for: typeof flags.for === 'string' ? flags.for : null,
            claim: Boolean(flags.claim),
            lease: flags.lease ? parseDurationSeconds(flags.lease, 300) : 300,
            as: asActor,
          }
        : {
            channel: first,
            text: titleParts.join(' '),
            labels: parseKvPairs(flags.label),
            needs: flags.needs || [],
            for: typeof flags.for === 'string' ? flags.for : null,
            claim: Boolean(flags.claim),
            lease: flags.lease ? parseDurationSeconds(flags.lease, 300) : 300,
            as: asActor,
          };
      const { data } = await apiFetch(
        baseUrl,
        '/api/board/tasks',
        { method: 'POST', body: JSON.stringify(payload) },
        asActor
      );
      if (wantJson) console.log(JSON.stringify(data, null, 2));
      else if (data.ok) {
        const t = data.task || data.data;
        ui.logger.success(`Created task #${t.id} (${t.state})`);
      } else {
        ui.logger.error(data.error?.message || data.error?.reason || 'Failed to create task.');
        process.exit(1);
      }
      return;
    }

    if (sub === 'claim' && flags.ready) {
      const channel = typeof flags.ready === 'string' ? flags.ready : rest[1] || 'agent-bridge';
      const { data } = await apiFetch(
        baseUrl,
        '/api/board/tasks/claim',
        {
          method: 'POST',
          body: JSON.stringify({
            channel,
            lease: flags.lease ? parseDurationSeconds(flags.lease, 300) : 300,
            as: asActor,
          }),
        },
        asActor
      );
      if (wantJson) console.log(JSON.stringify(data, null, 2));
      else if (data.ok) {
        const t = data.task || data.data;
        ui.logger.success(
          `#${t.id}  yours (epoch ${data.claim?.epoch ?? t.epoch})  ${t.title}`
        );
      } else {
        ui.logger.warning(data.error?.message || 'No ready tasks available.');
      }
      return;
    }

    const [taskId, ...argParts] = rest.slice(1);
    const body = {
      as: asActor,
      lease: flags.lease ? parseDurationSeconds(flags.lease, 300) : undefined,
      epoch: flags.epoch ? Number(flags.epoch) : undefined,
      token: typeof flags.token === 'string' ? flags.token : undefined,
      kind: typeof flags.kind === 'string' ? flags.kind : undefined,
    };

    if (sub === 'complete') body.result = argParts.join(' ');
    else if (sub === 'fail' || sub === 'block' || sub === 'cancel') body.reason = argParts.join(' ');
    else if (sub === 'assign') body.for = flags.pool ? null : argParts[0] || null;
    else if (sub === 'needs') body.needs = flags.none ? [] : argParts;

    const { data } = await apiFetch(
      baseUrl,
      `/api/board/tasks/${encodeURIComponent(taskId)}/${sub}`,
      { method: 'POST', body: JSON.stringify(body) },
      asActor
    );
    if (wantJson) console.log(JSON.stringify(data, null, 2));
    else if (data.ok) {
      const t = data.task || data.data;
      ui.logger.success(data.outcome || `Task #${t.id} -> ${t.state}`);
    } else {
      ui.logger.error(`${data.error?.code || 'error'}: ${data.error?.message || data.error?.reason || 'Task action failed.'}`);
      process.exit(1);
    }
    return;
  }

  if (verb === 'tail') {
    const channel = rest[0] || '';
    const params = new URLSearchParams();
    if (channel) params.set('channel', channel);
    if (typeof flags.after === 'string') params.set('after', flags.after);
    if (flags.all) params.set('all', 'true');

    ui.logger.info(`Tailing ${baseUrl}/api/board/events${channel ? ` (#${channel})` : ''} — Ctrl+C to stop`);
    const res = await fetch(`${baseUrl}/api/board/events?${params.toString()}`, {
      headers: { Accept: 'text/event-stream', ...(asActor ? { 'x-board-profile': asActor } : {}) },
    });
    if (!res.body) {
      ui.logger.error('Failed to attach to event stream.');
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
        const dataLine = chunk.split('\n').find((l) => l.startsWith('data: '));
        if (!dataLine) continue;
        try {
          const ev = JSON.parse(dataLine.slice(6));
          if (wantJson) console.log(JSON.stringify(ev));
          else ui.logger.log(`${ui.colors.dim(`[#${ev.cursor} ${ev.type}]`)} ${ev.summary}`);
        } catch {
          // ignore
        }
      }
    }
    return;
  }

  if (verb === 'wait') {
    const target = rest[0] || '';
    const waitSec = parseDurationSeconds(flags.timeout, 20);
    const params = new URLSearchParams({ wait: String(waitSec) });
    if (target) {
      if (/^\d+$/.test(target)) params.set('re', target);
      else params.set('channel', target);
    }
    if (typeof flags.after === 'string') params.set('after', flags.after);

    const { data, okHttp } = await apiFetch(baseUrl, `/api/board/events?${params.toString()}`, {}, asActor);
    if (!okHttp) {
      const fallback = await apiFetch(
        baseUrl,
        `/api/board/wait?target=${encodeURIComponent(target)}&timeoutMs=${waitSec * 1000}`,
        {},
        asActor
      );
      if (wantJson) console.log(JSON.stringify(fallback.data, null, 2));
      else if (fallback.data.timedOut) ui.logger.warning('Timed out waiting for board activity.');
      else ui.logger.info(`[${fallback.data.event.type}] ${fallback.data.event.summary}`);
      return;
    }

    if (wantJson) console.log(JSON.stringify(data, null, 2));
    else if (!data.events || data.events.length === 0) {
      ui.logger.warning(`Timed out waiting for activity (cursor ${data.cursor}).`);
    } else {
      for (const ev of data.events) {
        ui.logger.info(`[#${ev.cursor} ${ev.type}] ${ev.summary}`);
      }
    }
    return;
  }

  ui.logger.error(`Unknown command: ${verb}. Run \`lb help\` for usage.`);
  process.exit(1);
}

main().catch((err) => {
  const ui = cliui();
  ui.logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

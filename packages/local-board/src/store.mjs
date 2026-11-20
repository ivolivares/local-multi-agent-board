import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Local Multi-Agent Board Store (Board v1 Specification aligned)
 *
 * Implements the core Board v1 Specification data model locally with zero external
 * dependencies: channels, threads, messages (with revision, edit, tombstone
 * delete, reactions, labels, idempotency), monotonic event cursors, RFC 8941
 * `x-board-profile` header parsing, and the full Task state machine
 * (waiting, ready, claimed, blocked, completed, failed, canceled) with
 * epoch + secret claim tokens and prerequisite (`needs`) auto-unblocking.
 */

export const TASK_STATES = [
  'waiting',
  'ready',
  'claimed',
  'blocked',
  'completed',
  'failed',
  'canceled',
];

export const OPEN_TASK_STATES = new Set(['waiting', 'ready', 'claimed', 'blocked']);
export const TERMINAL_TASK_STATES = new Set(['completed', 'failed', 'canceled']);

export function extractMentions(body) {
  const matches = String(body || '').match(/@([a-zA-Z0-9][a-zA-Z0-9._-]{0,31})/g) || [];
  const seen = new Set();
  const out = [];
  for (const m of matches) {
    const clean = m.slice(1).toLowerCase();
    if (!seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  }
  return out;
}

/**
 * Parse RFC 8941 structured-field Item header `x-board-profile`:
 *   e.g. `claude-code`
 *   e.g. `fixer; avatar="https://example.com/fixer.png"`
 *   e.g. `"claude-code"; avatar="http://127.0.0.1:4100/avatars/claude"`
 */
export function parseBoardProfileHeader(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const [head, ...params] = trimmed.split(';');
  const name = head.trim().replace(/^"(.*)"$/, '$1').trim();
  if (!name) return null;

  let avatar = null;
  for (const p of params) {
    const eq = p.indexOf('=');
    if (eq === -1) continue;
    const key = p.slice(0, eq).trim().toLowerCase();
    const val = p.slice(eq + 1).trim().replace(/^"(.*)"$/, '$1');
    if (key === 'avatar' && val) {
      avatar = val;
    }
  }
  return { name, avatar };
}

/**
 * Parse duration strings like `300`, `30s`, `5m`, `1h` into seconds.
 */
export function parseDurationSeconds(input, fallbackSeconds = 300) {
  if (input == null || input === '') return fallbackSeconds;
  if (typeof input === 'number' && Number.isFinite(input)) {
    return Math.round(input);
  }
  const str = String(input).trim().toLowerCase();
  const match = str.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/);
  if (!match) return fallbackSeconds;
  const val = Number(match[1]);
  const unit = match[2] || 's';
  if (unit === 'ms') return Math.max(1, Math.round(val / 1000));
  if (unit === 'm') return Math.round(val * 60);
  if (unit === 'h') return Math.round(val * 3600);
  return Math.round(val);
}

function normalizeLabelRecord(labels) {
  if (!labels) return {};
  if (Array.isArray(labels)) {
    const rec = {};
    for (const entry of labels) {
      const s = String(entry || '').trim();
      if (!s) continue;
      const eq = s.indexOf('=');
      if (eq === -1) rec[s] = 'true';
      else rec[s.slice(0, eq)] = s.slice(eq + 1);
    }
    return rec;
  }
  if (typeof labels === 'object') {
    const rec = {};
    for (const [k, v] of Object.entries(labels)) {
      if (v != null) rec[String(k)] = String(v);
    }
    return rec;
  }
  return {};
}

function labelsToArray(record) {
  return Object.entries(record || {}).map(([k, v]) => `${k}=${v}`);
}

function matchChannelFilter(channelId, filter) {
  if (!filter) return true;
  if (filter.endsWith('/')) {
    return channelId.startsWith(filter) || `${channelId}/` === filter;
  }
  return channelId === filter;
}

function matchLabelFilter(labelRecord, rootLabelRecord, filter) {
  if (!filter) return true;
  const filters = Array.isArray(filter) ? filter : [filter];
  const merged = { ...(rootLabelRecord || {}), ...(labelRecord || {}) };
  for (const raw of filters) {
    if (!raw) continue;
    const eq = raw.indexOf('=');
    if (eq === -1) {
      if (!(raw in merged)) return false;
    } else {
      const k = raw.slice(0, eq);
      const allowed = raw.slice(eq + 1).split('|');
      if (!allowed.includes(merged[k])) return false;
    }
  }
  return true;
}

export function createInitialBoardState(now = Date.now(), boardName = 'local-board') {
  const user = process.env.USER || process.env.USERNAME || 'developer';
  return {
    boardName,
    currentUser: user,
    actors: [
      {
        id: `local:user:${user}`,
        name: user,
        handle: user,
        kind: 'person',
        isCurrentUser: true,
        status: 'online',
        statusMessage: 'Coordinating local multi-agent board',
        lastSeenAt: now,
      },
      {
        id: `local:user:${user}#claude-code`,
        name: 'claude-code',
        handle: 'claude-code',
        kind: 'agent',
        via: user,
        status: 'listening',
        statusMessage: 'Ready to draft patches via lb CLI',
        cliFlavor: 'claude-code',
        activeTaskId: null,
        lastSeenAt: now,
      },
      {
        id: `local:user:${user}#grok`,
        name: 'grok',
        handle: 'grok',
        kind: 'agent',
        via: user,
        status: 'listening',
        statusMessage: 'Watching #agent-bridge for edge cases',
        cliFlavor: 'grok',
        activeTaskId: null,
        lastSeenAt: now,
      },
      {
        id: `local:user:${user}#antigravity`,
        name: 'antigravity',
        handle: 'antigravity',
        kind: 'agent',
        via: user,
        status: 'listening',
        statusMessage: 'Standing by for UI & browser checks',
        cliFlavor: 'gemini-antigravity',
        activeTaskId: null,
        lastSeenAt: now,
      },
    ],
    channels: [
      {
        id: 'agent-bridge',
        path: 'agent-bridge',
        name: 'agent-bridge',
        description: 'Shared local room for Claude Code, Grok, Gemini Antigravity & local models',
        createdAt: now - 300_000,
      },
      {
        id: 'work/tasks',
        path: 'work/tasks',
        name: 'work/tasks',
        description: 'Leased 5-minute task queue for parallel agent swarms',
        createdAt: now - 240_000,
      },
    ],
    threads: [
      {
        id: '840',
        channelId: 'agent-bridge',
        title: 'Local multi-agent bridge initialized',
        labels: ['bridge=local', 'status=active'],
        labelMap: { bridge: 'local', status: 'active' },
        createdBy: user,
        createdAt: now - 180_000,
        updatedAt: now - 60_000,
      },
    ],
    messages: [
      {
        id: '840',
        channelId: 'agent-bridge',
        threadId: '840',
        re: null,
        actorName: user,
        body: 'Local Multi-Agent Board started via `lb`. @claude-code @grok @antigravity check in here!',
        text: 'Local Multi-Agent Board started via `lb`. @claude-code @grok @antigravity check in here!',
        createdAt: now - 120_000,
        updatedAt: now - 120_000,
        revision: 1,
        deleted: false,
        kind: 'chat',
        from: 'board',
        mentions: ['claude-code', 'grok', 'antigravity'],
        labels: { bridge: 'local', status: 'active' },
        reactions: [],
        attachments: [],
      },
      {
        id: '841',
        channelId: 'agent-bridge',
        threadId: '840',
        re: '840',
        actorName: 'claude-code',
        via: user,
        body: 'claude-code connected via local `lb` CLI. Ready to claim tasks and draft patches.',
        text: 'claude-code connected via local `lb` CLI. Ready to claim tasks and draft patches.',
        createdAt: now - 90_000,
        updatedAt: now - 90_000,
        revision: 1,
        deleted: false,
        kind: 'chat',
        from: 'board',
        mentions: [],
        labels: {},
        reactions: [],
        attachments: [],
      },
    ],
    tasks: [
      {
        id: '842',
        channelId: 'agent-bridge',
        threadId: '840',
        title: 'Audit shared bridge protocol and add regression tests',
        state: 'ready',
        owner: `local:user:${user}`,
        createdBy: user,
        by: user,
        for: null,
        needs: [],
        epoch: 0,
        claimedBy: null,
        claimToken: null,
        leaseMinutes: 5,
        leaseSeconds: 300,
        leaseExpiresAt: null,
        blocked: null,
        result: null,
        reason: null,
        createdAt: now - 100_000,
        updatedAt: now - 100_000,
      },
    ],
    events: [
      {
        id: 'ev_1',
        cursor: '1',
        type: 'board.started',
        channelId: 'agent-bridge',
        threadId: '840',
        actorName: 'lb',
        summary: 'Local Multi-Agent Board daemon initialized (Board v1 Specification aligned · zero cloud account required)',
        payload: { boardName },
        createdAt: now - 120_000,
      },
    ],
    idempotency: {},
    nextCursor: 2,
    nextMessageNum: 843,
    nextThreadNum: 843,
    nextTaskNum: 843,
  };
}

export function createBoardStore(options = {}) {
  const explicitDir = options.dir || options.dataDir;
  const dataDir =
    explicitDir
      ? path.resolve(explicitDir)
      : process.env.LOCAL_BOARD_DATA_DIR
        ? path.resolve(process.env.LOCAL_BOARD_DATA_DIR)
        : path.join(os.tmpdir(), 'local-board');
  const persist = options.persist !== false;
  const statePath = path.join(dataDir, 'board-state.json');

  let state = createInitialBoardState(Date.now(), options.boardName || 'local-board');
  const listeners = new Set();

  if (persist) {
    try {
      if (fs.existsSync(statePath)) {
        const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        if (parsed && Array.isArray(parsed.channels) && Array.isArray(parsed.actors)) {
          state = {
            ...createInitialBoardState(Date.now(), options.boardName || 'local-board'),
            ...parsed,
            idempotency: parsed.idempotency || {},
            nextCursor: parsed.nextCursor || (parsed.events?.length || 1) + 1,
            nextMessageNum: parsed.nextMessageNum || parsed.nextTaskNum || 850,
          };
        }
      }
    } catch {
      // ignore corrupted file and keep seed state
    }
  }

  function save() {
    if (!persist) return;
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
    } catch {
      // ignore fs errors on read-only environments
    }
  }

  function currentCursor() {
    const last = state.events[state.events.length - 1];
    return last?.cursor ? String(last.cursor) : '0';
  }

  function formatTaskView(task) {
    if (!task) return null;
    return {
      id: task.id,
      channel: task.channelId,
      threadId: task.threadId,
      title: task.title,
      state: task.state,
      owner: task.owner || `local:user:${state.currentUser}`,
      by: task.by || task.createdBy || state.currentUser,
      for: task.for ?? null,
      needs: Array.isArray(task.needs) ? [...task.needs] : [],
      epoch: Number(task.epoch || 0),
      claim:
        task.state === 'claimed' && task.claimedBy && task.leaseExpiresAt
          ? {
              actor: task.claimedBy,
              until: new Date(task.leaseExpiresAt).toISOString(),
            }
          : null,
      blocked: task.blocked || null,
      result: task.result ?? null,
      reason: task.reason ?? null,
      // Backwards-compatible convenience fields
      claimedBy: task.claimedBy || null,
      leaseMinutes: task.leaseMinutes || Math.round((task.leaseSeconds || 300) / 60),
      leaseSeconds: task.leaseSeconds || 300,
      leaseExpiresAt: task.leaseExpiresAt || null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  function formatMessageView(msg) {
    if (!msg) return null;
    const task = state.tasks.find((t) => t.id === msg.id || (t.threadId === msg.id && !msg.re));
    const labels = { ...(msg.labels || {}) };
    if (task && msg.id === task.id) {
      labels['board.task'] = task.state;
    }
    return {
      ...msg,
      text: msg.deleted ? '' : msg.body,
      body: msg.deleted ? '' : msg.body,
      labels,
      task: task && msg.id === task.id ? formatTaskView(task) : undefined,
    };
  }

  function emit({ type, channelId, threadId, actorName, summary, payload = {}, message = null }) {
    const cursor = String(state.nextCursor++);
    const now = Date.now();
    const event = {
      id: `ev_${cursor}`,
      cursor,
      type,
      channelId: channelId || null,
      threadId: threadId || null,
      actorName: actorName || 'system',
      summary,
      payload,
      message: message ? formatMessageView(message) : undefined,
      createdAt: now,
    };
    state.events = [...state.events.slice(-199), event];
    save();
    for (const fn of listeners) {
      try {
        fn({ event, state });
      } catch {
        // ignore listener failure
      }
    }
    return event;
  }

  function ensureActor(name, via, avatar) {
    const clean = String(name || state.currentUser).trim() || state.currentUser;
    let found = state.actors.find((a) => a.name.toLowerCase() === clean.toLowerCase());
    const now = Date.now();
    if (!found) {
      found = {
        id:
          clean === state.currentUser
            ? `local:user:${clean}`
            : `local:user:${via || state.currentUser}#${clean.toLowerCase().replace(/[^a-z0-9._-]/g, '_')}`,
        name: clean,
        handle: clean,
        kind: clean === state.currentUser ? 'person' : 'agent',
        via: clean === state.currentUser ? undefined : via || state.currentUser,
        avatar: avatar || undefined,
        status: 'listening',
        statusMessage: 'Connected via lb CLI',
        cliFlavor: 'custom',
        activeTaskId: null,
        lastSeenAt: now,
      };
      state.actors.push(found);
    } else {
      found.lastSeenAt = now;
      if (avatar) found.avatar = avatar;
    }
    return found;
  }

  function areNeedsCompleted(needs = []) {
    if (!Array.isArray(needs) || needs.length === 0) return true;
    return needs.every((depId) => {
      const dep = state.tasks.find((t) => t.id === String(depId));
      return dep && dep.state === 'completed';
    });
  }

  function propagateDependentTasks(completedTaskId) {
    const now = Date.now();
    for (const t of state.tasks) {
      if (
        t.state === 'waiting' &&
        Array.isArray(t.needs) &&
        t.needs.includes(String(completedTaskId)) &&
        areNeedsCompleted(t.needs)
      ) {
        t.state = 'ready';
        t.updatedAt = now;
        emit({
          type: 'task.ready',
          channelId: t.channelId,
          threadId: t.threadId,
          actorName: 'system',
          summary: `Task #${t.id} prerequisites completed; now ready`,
          payload: { id: t.id, thread: t.threadId },
        });
      }
    }
  }

  function expireStaleLeases(now = Date.now()) {
    let changed = false;
    for (const task of state.tasks) {
      if (task.state === 'claimed' && task.leaseExpiresAt && task.leaseExpiresAt <= now) {
        const expiredEpoch = task.epoch || 1;
        const previousClaimer = task.claimedBy;
        task.state = 'ready';
        task.claimedBy = null;
        task.claimToken = null;
        task.leaseExpiresAt = null;
        task.updatedAt = now;
        changed = true;
        if (previousClaimer) {
          const prevActor = state.actors.find((a) => a.name === previousClaimer);
          if (prevActor && prevActor.activeTaskId === task.id) {
            prevActor.activeTaskId = null;
            prevActor.status = 'listening';
          }
        }
        emit({
          type: 'task.expired',
          channelId: task.channelId,
          threadId: task.threadId,
          actorName: 'system',
          summary: `Lease expired for task #${task.id} (epoch ${expiredEpoch}); returned to ready queue`,
          payload: { id: task.id, thread: task.threadId, epoch: expiredEpoch },
        });
      }
    }
    if (changed) save();
  }

  function allocId() {
    const id = String(Math.max(state.nextMessageNum, state.nextThreadNum, state.nextTaskNum));
    const next = Number(id) + 1;
    state.nextMessageNum = next;
    state.nextThreadNum = next;
    state.nextTaskNum = next;
    return id;
  }

  return {
    getState() {
      expireStaleLeases();
      return {
        ...state,
        tasks: state.tasks.map((t) => formatTaskView(t)),
        cursor: currentCursor(),
      };
    },

    getCursor() {
      return currentCursor();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    whoami(asActor, avatar) {
      const actor = ensureActor(asActor || state.currentUser, undefined, avatar);
      const writesAs = actor.via ? `${actor.name} via ${actor.via}` : actor.name;
      return {
        ok: true,
        board: state.boardName,
        mode: 'local',
        actor: {
          id: actor.id,
          name: actor.name,
          handle: actor.handle || actor.name,
          kind: actor.kind,
          via: actor.via || null,
          avatar: actor.avatar || null,
        },
        // Keep top-level fields for backward compatibility
        handle: actor.name,
        via: actor.via || null,
        writesAs,
        can: {
          '*': ['read', 'post', 'reply', 'edit', 'delete', 'react', 'label', 'manage'],
        },
        channels: state.channels.map((c) => c.path || c.name),
      };
    },

    listChannels() {
      expireStaleLeases();
      const channels = [...state.channels]
        .sort((a, b) => (a.path || a.name).localeCompare(b.path || b.name))
        .map((c) => {
          const id = c.id || c.path || c.name;
          const msgCount = state.messages.filter((m) => m.channelId === id && !m.deleted).length;
          const threadCount = state.threads.filter((t) => t.channelId === id).length;
          const openTasks = state.tasks.filter(
            (t) => t.channelId === id && OPEN_TASK_STATES.has(t.state)
          ).length;
          return {
            id,
            path: id,
            name: c.name || id,
            description: c.description || '',
            messages: msgCount,
            messageCount: msgCount,
            threads: threadCount,
            openTasks,
            createdAt: c.createdAt,
          };
        });
      return { ok: true, channels, cursor: currentCursor() };
    },

    createChannel({ channelPath, description = '', as }) {
      const clean = String(channelPath || '').trim().replace(/^#/, '').replace(/^\/+|\/+$/g, '');
      if (!clean) {
        return {
          ok: false,
          status: 400,
          error: { code: 'invalid_request', message: 'Channel path is required.', reason: 'Channel path is required.' },
        };
      }
      const existing = state.channels.find((c) => c.id === clean || c.path === clean);
      if (existing) {
        return {
          ok: true,
          status: 200,
          created: false,
          channel: { ...existing, path: existing.id },
        };
      }
      const now = Date.now();
      const actor = ensureActor(as || state.currentUser);
      const channel = {
        id: clean,
        path: clean,
        name: clean,
        description: description || `Local channel #${clean}`,
        createdAt: now,
      };
      state.channels.push(channel);
      emit({
        type: 'channel.created',
        channelId: clean,
        actorName: actor.name,
        summary: `${actor.name} created channel #${clean}`,
        payload: { path: clean },
      });
      return { ok: true, status: 201, created: true, channel };
    },

    listMessages({ channel, threadId, after, limit = 50 } = {}) {
      expireStaleLeases();
      let list = state.messages;
      if (channel) list = list.filter((m) => matchChannelFilter(m.channelId, channel));
      if (threadId) list = list.filter((m) => m.threadId === String(threadId));
      if (after) {
        const idx = list.findIndex((m) => m.id === String(after));
        if (idx >= 0) list = list.slice(idx + 1);
      }
      const bounded = Math.max(1, Math.min(200, Number(limit) || 50));
      return {
        ok: true,
        messages: list.slice(-bounded).map(formatMessageView),
        cursor: currentCursor(),
      };
    },

    getThread(id) {
      expireStaleLeases();
      const msg = state.messages.find((m) => m.id === String(id));
      const threadId = msg ? msg.threadId : String(id);
      const threadMsgs = state.messages.filter((m) => m.threadId === threadId);
      if (threadMsgs.length === 0) {
        return {
          ok: false,
          status: 404,
          error: { code: 'message_not_found', message: `Message or thread ${id} not found.`, reason: `Message or thread ${id} not found.` },
        };
      }
      const [root, ...replies] = threadMsgs;
      return {
        ok: true,
        message: formatMessageView(root),
        replies: replies.map(formatMessageView),
        cursor: currentCursor(),
        schedules: [],
      };
    },

    getPostById(clientId) {
      const msgId = state.idempotency?.[String(clientId)];
      if (!msgId) {
        return {
          ok: false,
          status: 404,
          error: { code: 'post_not_found', message: `Post ${clientId} not found.`, reason: `Post ${clientId} not found.` },
        };
      }
      const msg = state.messages.find((m) => m.id === msgId);
      if (!msg) {
        return {
          ok: false,
          status: 404,
          error: { code: 'post_not_found', message: `Post ${clientId} not found.`, reason: `Post ${clientId} not found.` },
        };
      }
      return { ok: true, message: formatMessageView(msg) };
    },

    listThreads({ channel, by, mentions, label, text, limit = 30 } = {}) {
      expireStaleLeases();
      const grouped = new Map();
      for (const m of state.messages) {
        if (!grouped.has(m.threadId)) grouped.set(m.threadId, []);
        grouped.get(m.threadId).push(m);
      }

      const summaries = [];
      for (const [tid, msgs] of grouped.entries()) {
        const root = msgs[0];
        if (!root) continue;
        if (channel && !matchChannelFilter(root.channelId, channel)) continue;
        const rootView = formatMessageView(root);
        const matchesAny = msgs.some((m) => {
          const mv = formatMessageView(m);
          if (by && mv.actorName.toLowerCase() !== String(by).replace(/^@/, '').toLowerCase()) {
            return false;
          }
          if (mentions) {
            const target = String(mentions).replace(/^@/, '').toLowerCase();
            const needle = target === 'me' ? state.currentUser.toLowerCase() : target;
            if (!mv.mentions?.includes(needle) && !mv.body.toLowerCase().includes(`@${needle}`)) {
              return false;
            }
          }
          if (text && !mv.body.toLowerCase().includes(String(text).toLowerCase())) {
            return false;
          }
          if (label && !matchLabelFilter(mv.labels, rootView.labels, label)) {
            return false;
          }
          return true;
        });
        if (!matchesAny) continue;
        const last = msgs[msgs.length - 1];
        summaries.push({
          id: tid,
          message: rootView,
          replies: Math.max(0, msgs.length - 1),
          last: formatMessageView(last),
          updatedAt: last.createdAt,
        });
      }

      summaries.sort((a, b) => a.updatedAt - b.updatedAt);
      const bounded = Math.max(1, Math.min(100, Number(limit) || 30));
      return {
        ok: true,
        threads: summaries.slice(-bounded),
        cursor: currentCursor(),
        older: null,
      };
    },

    postMessage({
      channel,
      channelId,
      re,
      threadId,
      text,
      body,
      labels,
      id: clientId,
      as,
      via,
      avatar,
      attachments = [],
    }) {
      expireStaleLeases();

      // Idempotency key support per Board v1 Specification
      if (clientId && state.idempotency?.[String(clientId)]) {
        const existing = state.messages.find((m) => m.id === state.idempotency[String(clientId)]);
        if (existing) {
          const existingThread = state.threads.find((t) => t.id === existing.threadId);
          return {
            ok: true,
            status: 200,
            message: formatMessageView(existing),
            data: { message: formatMessageView(existing), thread: existingThread },
          };
        }
      }

      const content = String(text ?? body ?? '').trim();
      if (!content && (!Array.isArray(attachments) || attachments.length === 0)) {
        return {
          ok: false,
          status: 400,
          error: { code: 'empty_body', message: 'Message text is required.', reason: 'Message text is required.' },
        };
      }

      const now = Date.now();
      const actor = ensureActor(as || state.currentUser, via, avatar);
      const labelRecord = normalizeLabelRecord(labels);

      // Reply lookup: SPEC `re` may be any message ID in a thread
      const replyTargetId = re ?? threadId;
      let thread = null;
      if (replyTargetId) {
        const targetMsg = state.messages.find((m) => m.id === String(replyTargetId));
        const resolvedThreadId = targetMsg ? targetMsg.threadId : String(replyTargetId);
        thread = state.threads.find((t) => t.id === resolvedThreadId) || null;
      }

      const targetChannel =
        (thread ? thread.channelId : channel || channelId) || state.channels[0]?.id || 'agent-bridge';

      if (!state.channels.some((c) => c.id === targetChannel)) {
        state.channels.push({
          id: targetChannel,
          path: targetChannel,
          name: targetChannel,
          description: `Local channel #${targetChannel}`,
          createdAt: now,
        });
      }

      const msgId = allocId();

      // If posting to a channel (not replying to a thread):
      // In SPEC, POST /messages with `channel` (and no `re`) starts a thread, OR if replying to existing
      // channel default when legacy `channelId` is passed without `createThread`, keep clean grouping.
      const startNewThread = Boolean(channel && !replyTargetId && !channelId);
      if (!thread && !startNewThread) {
        thread = state.threads.find((t) => t.channelId === targetChannel) || null;
      }
      if (!thread) {
        thread = {
          id: msgId,
          channelId: targetChannel,
          title: content.slice(0, 60) || 'Attachment',
          labels: labelsToArray(labelRecord),
          labelMap: labelRecord,
          createdBy: actor.name,
          createdAt: now,
          updatedAt: now,
        };
        state.threads.push(thread);
      }

      const message = {
        id: msgId,
        channelId: thread.channelId,
        threadId: thread.id,
        re: replyTargetId ? String(replyTargetId) : thread.id === msgId ? null : thread.id,
        actorName: actor.name,
        via: actor.via,
        body: content,
        text: content,
        createdAt: now,
        updatedAt: now,
        revision: 1,
        deleted: false,
        kind: 'chat',
        from: 'board',
        mentions: extractMentions(content),
        labels: labelRecord,
        reactions: [],
        attachments,
      };
      state.messages.push(message);
      thread.updatedAt = now;
      if (clientId) {
        state.idempotency[String(clientId)] = message.id;
      }

      emit({
        type: 'message.posted',
        channelId: thread.channelId,
        threadId: thread.id,
        actorName: actor.name,
        summary: `${actor.name}${actor.via ? ` via ${actor.via}` : ''} in #${thread.channelId} (${thread.id}): ${content.slice(0, 88)}`,
        payload: { id: message.id, thread: thread.id, channel: thread.channelId },
        message,
      });

      return {
        ok: true,
        status: 201,
        message: formatMessageView(message),
        data: { message: formatMessageView(message), thread },
      };
    },

    editMessage({ id, text, body, ifRevision, as }) {
      const msg = state.messages.find((m) => m.id === String(id));
      if (!msg || msg.deleted) {
        return {
          ok: false,
          status: 404,
          error: { code: 'message_not_found', message: `Message ${id} not found.`, reason: `Message ${id} not found.` },
        };
      }
      if (ifRevision != null && Number(ifRevision) !== Number(msg.revision || 1)) {
        return {
          ok: false,
          status: 409,
          error: {
            code: 'revision_conflict',
            message: `Message ${id} is at revision ${msg.revision || 1}, not ${ifRevision}.`,
            reason: `Message ${id} is at revision ${msg.revision || 1}, not ${ifRevision}.`,
          },
        };
      }
      const nextText = String(text ?? body ?? '').trim();
      if (!nextText) {
        return {
          ok: false,
          status: 400,
          error: { code: 'empty_body', message: 'Edited text is required.', reason: 'Edited text is required.' },
        };
      }
      const actor = ensureActor(as || state.currentUser);
      msg.body = nextText;
      msg.text = nextText;
      msg.mentions = extractMentions(nextText);
      msg.revision = Number(msg.revision || 1) + 1;
      msg.updatedAt = Date.now();

      emit({
        type: 'message.edited',
        channelId: msg.channelId,
        threadId: msg.threadId,
        actorName: actor.name,
        summary: `${actor.name} edited message #${msg.id} (rev ${msg.revision})`,
        payload: { id: msg.id, thread: msg.threadId, revision: msg.revision },
        message: msg,
      });

      return { ok: true, status: 200, message: formatMessageView(msg) };
    },

    deleteMessage({ id, ifRevision, as }) {
      const msg = state.messages.find((m) => m.id === String(id));
      if (!msg) {
        return {
          ok: false,
          status: 404,
          error: { code: 'message_not_found', message: `Message ${id} not found.`, reason: `Message ${id} not found.` },
        };
      }
      if (ifRevision != null && Number(ifRevision) !== Number(msg.revision || 1)) {
        return {
          ok: false,
          status: 409,
          error: {
            code: 'revision_conflict',
            message: `Message ${id} is at revision ${msg.revision || 1}, not ${ifRevision}.`,
            reason: `Message ${id} is at revision ${msg.revision || 1}, not ${ifRevision}.`,
          },
        };
      }
      const actor = ensureActor(as || state.currentUser);
      msg.deleted = true;
      msg.body = '';
      msg.text = '';
      msg.revision = Number(msg.revision || 1) + 1;
      msg.updatedAt = Date.now();

      emit({
        type: 'message.deleted',
        channelId: msg.channelId,
        threadId: msg.threadId,
        actorName: actor.name,
        summary: `${actor.name} deleted message #${msg.id}`,
        payload: { id: msg.id, thread: msg.threadId },
        message: msg,
      });

      return { ok: true, status: 200, message: formatMessageView(msg) };
    },

    reactMessage({ id, emoji, remove = false, as }) {
      const msg = state.messages.find((m) => m.id === String(id));
      if (!msg || msg.deleted) {
        return {
          ok: false,
          status: 404,
          error: { code: 'message_not_found', message: `Message ${id} not found.`, reason: `Message ${id} not found.` },
        };
      }
      const cleanEmoji = String(emoji || '').trim();
      if (!cleanEmoji) {
        return {
          ok: false,
          status: 400,
          error: { code: 'invalid_request', message: 'Emoji is required.', reason: 'Emoji is required.' },
        };
      }
      const actor = ensureActor(as || state.currentUser);
      if (!Array.isArray(msg.reactions)) msg.reactions = [];
      let entry = msg.reactions.find((r) => r.emoji === cleanEmoji);
      if (remove) {
        if (entry) {
          entry.actors = entry.actors.filter((a) => a !== actor.name);
          if (entry.actors.length === 0) {
            msg.reactions = msg.reactions.filter((r) => r.emoji !== cleanEmoji);
          }
        }
      } else {
        if (!entry) {
          entry = { emoji: cleanEmoji, actors: [] };
          msg.reactions.push(entry);
        }
        if (!entry.actors.includes(actor.name)) {
          entry.actors.push(actor.name);
        }
      }

      emit({
        type: remove ? 'reaction.removed' : 'reaction.added',
        channelId: msg.channelId,
        threadId: msg.threadId,
        actorName: actor.name,
        summary: `${actor.name} ${remove ? 'removed' : 'reacted'} ${cleanEmoji} on #${msg.id}`,
        payload: { id: msg.id, thread: msg.threadId, emoji: cleanEmoji, remove },
        message: msg,
      });

      return { ok: true, status: 200, message: formatMessageView(msg) };
    },

    labelMessage({ id, set = {}, unset = [], ifLabels = {}, ifUnset = [], as }) {
      const msg = state.messages.find((m) => m.id === String(id));
      if (!msg || msg.deleted) {
        return {
          ok: false,
          status: 404,
          error: { code: 'message_not_found', message: `Message ${id} not found.`, reason: `Message ${id} not found.` },
        };
      }
      const setMap = normalizeLabelRecord(set);
      if ('board.task' in setMap || (Array.isArray(unset) && unset.includes('board.task'))) {
        return {
          ok: false,
          status: 400,
          error: {
            code: 'reserved_label',
            message: 'Label `board.task` is managed by the board; use `lb tasks` commands instead.',
            reason: 'Label `board.task` is managed by the board; use `lb tasks` commands instead.',
          },
        };
      }

      const current = { ...(msg.labels || {}) };
      for (const [k, v] of Object.entries(normalizeLabelRecord(ifLabels))) {
        if (current[k] !== v) {
          return {
            ok: false,
            status: 409,
            error: { code: 'label_conflict', message: `Expected label ${k}=${v}.`, reason: `Expected label ${k}=${v}.` },
          };
        }
      }
      for (const k of Array.isArray(ifUnset) ? ifUnset : []) {
        if (k in current) {
          return {
            ok: false,
            status: 409,
            error: { code: 'label_conflict', message: `Expected label ${k} to be unset.`, reason: `Expected label ${k} to be unset.` },
          };
        }
      }

      Object.assign(current, setMap);
      for (const k of Array.isArray(unset) ? unset : []) {
        delete current[k];
      }
      msg.labels = current;
      const thread = state.threads.find((t) => t.id === msg.threadId);
      if (thread && thread.id === msg.id) {
        thread.labelMap = current;
        thread.labels = labelsToArray(current);
      }
      const actor = ensureActor(as || state.currentUser);
      emit({
        type: 'message.labeled',
        channelId: msg.channelId,
        threadId: msg.threadId,
        actorName: actor.name,
        summary: `${actor.name} updated labels on #${msg.id}`,
        payload: { id: msg.id, thread: msg.threadId, labels: current },
        message: msg,
      });

      return { ok: true, status: 200, message: formatMessageView(msg) };
    },

    listTasks({ channel, state: stateFilter = 'open', forActor, by, needs } = {}) {
      expireStaleLeases();
      let list = state.tasks;
      if (channel) list = list.filter((t) => matchChannelFilter(t.channelId, channel));
      if (stateFilter === 'open') {
        list = list.filter((t) => OPEN_TASK_STATES.has(t.state));
      } else if (stateFilter && stateFilter !== 'all') {
        list = list.filter((t) => t.state === stateFilter);
      }
      if (forActor) {
        const needle = String(forActor).replace(/^@/, '').toLowerCase();
        list = list.filter((t) => (t.for || '').toLowerCase() === needle);
      }
      if (by) {
        const needle = String(by).replace(/^@/, '').toLowerCase();
        list = list.filter((t) => (t.by || t.createdBy || '').toLowerCase() === needle);
      }
      if (needs) {
        list = list.filter((t) => Array.isArray(t.needs) && t.needs.includes(String(needs)));
      }
      const sorted = [...list].sort((a, b) => a.createdAt - b.createdAt);
      return {
        ok: true,
        tasks: sorted.map(formatTaskView),
        cursor: currentCursor(),
      };
    },

    createTask({
      channel,
      channelId = 'agent-bridge',
      threadId,
      re,
      text,
      title,
      as,
      for: forActor = null,
      needs = [],
      claim = false,
      lease,
      leaseMinutes,
      labels,
    }) {
      expireStaleLeases();
      const targetChannel = channel || channelId || 'agent-bridge';
      const cleanTitle = String(text ?? title ?? '').trim();
      const existingRe = re ? String(re) : null;

      if (!existingRe && !cleanTitle) {
        return {
          ok: false,
          status: 400,
          error: { code: 'empty_title', message: 'Task description is required.', reason: 'Task description is required.' },
        };
      }

      if (existingRe) {
        if (state.tasks.some((t) => t.id === existingRe)) {
          return {
            ok: false,
            status: 409,
            error: { code: 'already_a_task', message: `Thread #${existingRe} is already a task.`, reason: `Thread #${existingRe} is already a task.` },
          };
        }
      }

      const normalizedNeeds = (Array.isArray(needs) ? needs : []).map((n) => String(n)).filter(Boolean);
      for (const depId of normalizedNeeds) {
        if (!state.tasks.some((t) => t.id === depId)) {
          return {
            ok: false,
            status: 400,
            error: {
              code: 'invalid_needs',
              message: `Prerequisite task #${depId} does not exist.`,
              reason: `Prerequisite task #${depId} does not exist.`,
            },
          };
        }
      }

      const now = Date.now();
      const actor = ensureActor(as || state.currentUser);
      const leaseSeconds = Math.max(
        30,
        Math.min(3600, lease != null ? parseDurationSeconds(lease, 300) : (Number(leaseMinutes) || 5) * 60)
      );

      let taskId = existingRe;
      let resolvedThreadId = existingRe || threadId;
      let resolvedChannel = targetChannel;
      let taskTitle = cleanTitle;

      if (!taskId) {
        const posted = this.postMessage({
          channel: targetChannel,
          text: cleanTitle,
          labels,
          as: actor.name,
        });
        if (!posted.ok) return posted;
        taskId = posted.message.id;
        resolvedThreadId = posted.message.threadId;
        resolvedChannel = posted.message.channelId;
      } else {
        const msg = state.messages.find((m) => m.id === existingRe);
        if (!msg) {
          return {
            ok: false,
            status: 404,
            error: { code: 'message_not_found', message: `Thread #${existingRe} not found.`, reason: `Thread #${existingRe} not found.` },
          };
        }
        resolvedChannel = msg.channelId;
        resolvedThreadId = msg.threadId;
        taskTitle = taskTitle || msg.body;
      }

      const initialState = areNeedsCompleted(normalizedNeeds) ? 'ready' : 'waiting';
      const task = {
        id: taskId,
        channelId: resolvedChannel,
        threadId: resolvedThreadId || taskId,
        title: taskTitle,
        state: initialState,
        owner: `local:user:${state.currentUser}`,
        createdBy: actor.name,
        by: actor.name,
        for: forActor ? String(forActor).replace(/^@/, '') : null,
        needs: normalizedNeeds,
        epoch: 0,
        claimedBy: null,
        claimToken: null,
        leaseMinutes: Math.max(1, Math.round(leaseSeconds / 60)),
        leaseSeconds,
        leaseExpiresAt: null,
        blocked: null,
        result: null,
        reason: null,
        createdAt: now,
        updatedAt: now,
      };
      state.tasks.push(task);

      emit({
        type: 'task.created',
        channelId: task.channelId,
        threadId: task.threadId,
        actorName: actor.name,
        summary: `${actor.name} created task #${task.id} (${task.state}): ${task.title}`,
        payload: { id: task.id, thread: task.threadId, needs: task.needs, for: task.for },
      });

      if (claim && task.state === 'ready') {
        const claimed = this.performTaskAction({
          taskId: task.id,
          action: 'claim',
          as: actor.name,
          lease: leaseSeconds,
        });
        if (claimed.ok) {
          return {
            ok: true,
            status: 201,
            task: claimed.task,
            claim: claimed.claim,
            data: claimed.task,
          };
        }
      }

      const view = formatTaskView(task);
      return { ok: true, status: 201, task: view, data: view };
    },

    claimNextReady({ channel, channelId, as, lease, leaseMinutes } = {}) {
      expireStaleLeases();
      const targetChannel = channel || channelId;
      const actor = ensureActor(as || state.currentUser);
      const candidates = state.tasks
        .filter((t) => t.state === 'ready' && (!targetChannel || matchChannelFilter(t.channelId, targetChannel)))
        .sort((a, b) => a.createdAt - b.createdAt);

      // SPEC order: oldest ready task assigned to caller first, then oldest unassigned
      const ready =
        candidates.find((t) => t.for && t.for.toLowerCase() === actor.name.toLowerCase()) ||
        candidates.find((t) => !t.for);

      if (!ready) {
        return {
          ok: false,
          status: 200,
          task: null,
          error: { code: 'no_ready_tasks', message: 'No ready tasks available to claim.', reason: 'No ready tasks available to claim.' },
        };
      }
      return this.performTaskAction({
        taskId: ready.id,
        action: 'claim',
        as: actor.name,
        lease,
        leaseMinutes,
      });
    },

    performTaskAction({
      taskId,
      action,
      as,
      note = '',
      result,
      reason,
      kind = null,
      epoch,
      token,
      forActor,
      needs,
      lease,
      leaseMinutes,
    }) {
      expireStaleLeases();
      const task = state.tasks.find((t) => t.id === String(taskId));
      if (!task) {
        return {
          ok: false,
          status: 404,
          error: { code: 'not_a_task', message: `Task #${taskId} not found.`, reason: `Task #${taskId} not found.` },
        };
      }

      const now = Date.now();
      const actor = ensureActor(as || state.currentUser);
      const leaseSeconds = Math.max(
        30,
        Math.min(
          3600,
          lease != null
            ? parseDurationSeconds(lease, task.leaseSeconds || 300)
            : leaseMinutes != null
              ? Number(leaseMinutes) * 60
              : task.leaseSeconds || 300
        )
      );

      const checkClaimCredentials = () => {
        if (task.state !== 'claimed') {
          return {
            ok: false,
            status: 409,
            error: {
              code: 'claim_lost',
              message: `Task #${task.id} is not currently claimed.`,
              reason: `Task #${task.id} is not currently claimed.`,
            },
          };
        }
        if (epoch != null && Number(epoch) !== Number(task.epoch)) {
          return {
            ok: false,
            status: 409,
            error: {
              code: 'claim_lost',
              message: `Stale claim epoch ${epoch} (current epoch is ${task.epoch}).`,
              reason: `Stale claim epoch ${epoch} (current epoch is ${task.epoch}).`,
            },
          };
        }
        if (token != null && token !== task.claimToken) {
          return {
            ok: false,
            status: 409,
            error: {
              code: 'claim_lost',
              message: `Invalid claim token for task #${task.id}.`,
              reason: `Invalid claim token for task #${task.id}.`,
            },
          };
        }
        if (token == null && task.claimedBy !== actor.name) {
          return {
            ok: false,
            status: 409,
            error: {
              code: 'claim_lost',
              message: `Task #${task.id} lease is held by ${task.claimedBy}, not ${actor.name}.`,
              reason: `Task #${task.id} lease is held by ${task.claimedBy}, not ${actor.name}.`,
            },
          };
        }
        return null;
      };

      if (action === 'claim') {
        if (TERMINAL_TASK_STATES.has(task.state)) {
          return {
            ok: false,
            status: 409,
            error: { code: 'task_finished', message: `Task #${task.id} is already ${task.state}.`, reason: `Task #${task.id} is already ${task.state}.` },
          };
        }
        if (task.state === 'waiting') {
          return {
            ok: false,
            status: 409,
            error: { code: 'task_waiting', message: `Task #${task.id} is waiting on prerequisites: ${task.needs.join(', ')}.`, reason: `Task #${task.id} is waiting on prerequisites.` },
          };
        }
        if (task.state === 'blocked') {
          return {
            ok: false,
            status: 409,
            error: { code: 'task_blocked', message: `Task #${task.id} is blocked.`, reason: `Task #${task.id} is blocked.` },
          };
        }
        if (task.state === 'claimed' && task.claimedBy !== actor.name) {
          return {
            ok: false,
            status: 409,
            error: {
              code: 'task_claimed',
              message: `Task #${task.id} is already claimed by ${task.claimedBy}.`,
              reason: `Task #${task.id} is already claimed by ${task.claimedBy}.`,
            },
          };
        }
        if (task.for && task.for.toLowerCase() !== actor.name.toLowerCase()) {
          return {
            ok: false,
            status: 409,
            error: {
              code: 'task_assigned',
              message: `Task #${task.id} is assigned to ${task.for}.`,
              reason: `Task #${task.id} is assigned to ${task.for}.`,
            },
          };
        }

        task.state = 'claimed';
        task.claimedBy = actor.name;
        task.epoch = Number(task.epoch || 0) + 1;
        task.claimToken = crypto.randomBytes(16).toString('hex');
        task.leaseSeconds = leaseSeconds;
        task.leaseMinutes = Math.max(1, Math.round(leaseSeconds / 60));
        task.leaseExpiresAt = now + leaseSeconds * 1000;
        task.updatedAt = now;
        actor.status = 'busy';
        actor.activeTaskId = task.id;

        const claimPayload = {
          epoch: task.epoch,
          token: task.claimToken,
          until: new Date(task.leaseExpiresAt).toISOString(),
        };

        emit({
          type: 'task.claimed',
          channelId: task.channelId,
          threadId: task.threadId,
          actorName: actor.name,
          summary: `${actor.name} claimed task #${task.id} (epoch ${task.epoch}, ${Math.round(leaseSeconds / 60)}m lease)`,
          payload: { id: task.id, thread: task.threadId, epoch: task.epoch, until: claimPayload.until },
        });

        const view = formatTaskView(task);
        return { ok: true, status: 200, task: view, claim: claimPayload, data: view };
      }

      if (action === 'renew') {
        const err = checkClaimCredentials();
        if (err) return err;
        task.leaseSeconds = leaseSeconds;
        task.leaseMinutes = Math.max(1, Math.round(leaseSeconds / 60));
        task.leaseExpiresAt = now + leaseSeconds * 1000;
        task.updatedAt = now;
        const until = new Date(task.leaseExpiresAt).toISOString();

        emit({
          type: 'task.renewed',
          channelId: task.channelId,
          threadId: task.threadId,
          actorName: actor.name,
          summary: `${actor.name} renewed lease on task #${task.id} until ${until}`,
          payload: { id: task.id, thread: task.threadId, epoch: task.epoch, until },
        });

        const view = formatTaskView(task);
        return { ok: true, status: 200, task: view, until, data: view };
      }

      if (action === 'release') {
        const err = checkClaimCredentials();
        if (err) return err;
        task.state = 'ready';
        task.claimedBy = null;
        task.claimToken = null;
        task.leaseExpiresAt = null;
        task.updatedAt = now;
        actor.status = 'listening';
        if (actor.activeTaskId === task.id) actor.activeTaskId = null;

        emit({
          type: 'task.released',
          channelId: task.channelId,
          threadId: task.threadId,
          actorName: actor.name,
          summary: `${actor.name} released task #${task.id} back to ready`,
          payload: { id: task.id, thread: task.threadId, epoch: task.epoch },
        });

        const view = formatTaskView(task);
        return { ok: true, status: 200, task: view, outcome: `released ${task.id}`, data: view };
      }

      if (action === 'complete') {
        if (task.state === 'claimed') {
          const err = checkClaimCredentials();
          if (err) return err;
        } else if (TERMINAL_TASK_STATES.has(task.state)) {
          return {
            ok: false,
            status: 409,
            error: { code: 'task_finished', message: `Task #${task.id} is already ${task.state}.`, reason: `Task #${task.id} is already ${task.state}.` },
          };
        }
        const finalResult = (result ?? note ?? '').trim() || null;
        task.state = 'completed';
        task.result = finalResult;
        task.claimToken = null;
        task.leaseExpiresAt = null;
        task.updatedAt = now;
        actor.status = 'listening';
        if (actor.activeTaskId === task.id) actor.activeTaskId = null;

        emit({
          type: 'task.completed',
          channelId: task.channelId,
          threadId: task.threadId,
          actorName: actor.name,
          summary: `${actor.name} completed task #${task.id}${finalResult ? `: ${finalResult}` : ''}`,
          payload: { id: task.id, thread: task.threadId, epoch: task.epoch, result: finalResult },
        });

        // Automatically unblock any `waiting` tasks whose prerequisites are now met!
        propagateDependentTasks(task.id);

        const view = formatTaskView(task);
        return { ok: true, status: 200, task: view, outcome: `completed ${task.id}`, data: view };
      }

      if (action === 'fail') {
        if (task.state === 'claimed') {
          const err = checkClaimCredentials();
          if (err) return err;
        }
        const failReason = String(reason ?? note ?? '').trim();
        if (!failReason) {
          return {
            ok: false,
            status: 400,
            error: { code: 'invalid_request', message: 'A failure reason is required.', reason: 'A failure reason is required.' },
          };
        }
        task.state = 'failed';
        task.reason = failReason;
        task.claimToken = null;
        task.leaseExpiresAt = null;
        task.updatedAt = now;
        actor.status = 'listening';
        if (actor.activeTaskId === task.id) actor.activeTaskId = null;

        emit({
          type: 'task.failed',
          channelId: task.channelId,
          threadId: task.threadId,
          actorName: actor.name,
          summary: `${actor.name} failed task #${task.id}: ${failReason}`,
          payload: { id: task.id, thread: task.threadId, epoch: task.epoch, reason: failReason },
        });

        const view = formatTaskView(task);
        return { ok: true, status: 200, task: view, outcome: `failed ${task.id}`, data: view };
      }

      if (action === 'block') {
        if (task.state === 'claimed') {
          const err = checkClaimCredentials();
          if (err) return err;
        }
        const blockReason = String(reason ?? note ?? '').trim() || 'Blocked awaiting input';
        task.state = 'blocked';
        task.blocked = { kind: kind || null, reason: blockReason };
        task.claimToken = null;
        task.leaseExpiresAt = null;
        task.updatedAt = now;
        actor.status = 'listening';
        if (actor.activeTaskId === task.id) actor.activeTaskId = null;

        emit({
          type: 'task.blocked',
          channelId: task.channelId,
          threadId: task.threadId,
          actorName: actor.name,
          summary: `${actor.name} blocked task #${task.id}: ${blockReason}`,
          payload: { id: task.id, thread: task.threadId, kind: kind || null, reason: blockReason },
        });

        const view = formatTaskView(task);
        return { ok: true, status: 200, task: view, outcome: `blocked ${task.id}`, data: view };
      }

      if (action === 'unblock') {
        if (task.state !== 'blocked') {
          const view = formatTaskView(task);
          return { ok: true, status: 200, task: view, outcome: 'unchanged', data: view };
        }
        task.blocked = null;
        task.state = areNeedsCompleted(task.needs) ? 'ready' : 'waiting';
        task.updatedAt = now;

        emit({
          type: 'task.unblocked',
          channelId: task.channelId,
          threadId: task.threadId,
          actorName: actor.name,
          summary: `${actor.name} unblocked task #${task.id} -> ${task.state}`,
          payload: { id: task.id, thread: task.threadId },
        });

        const view = formatTaskView(task);
        return { ok: true, status: 200, task: view, outcome: `unblocked ${task.id}`, data: view };
      }

      if (action === 'reopen') {
        if (task.state !== 'failed') {
          const view = formatTaskView(task);
          return { ok: true, status: 200, task: view, outcome: 'unchanged', data: view };
        }
        task.reason = null;
        task.claimedBy = null;
        task.claimToken = null;
        task.state = areNeedsCompleted(task.needs) ? 'ready' : 'waiting';
        task.updatedAt = now;

        emit({
          type: 'task.reopened',
          channelId: task.channelId,
          threadId: task.threadId,
          actorName: actor.name,
          summary: `${actor.name} reopened task #${task.id} -> ${task.state}`,
          payload: { id: task.id, thread: task.threadId },
        });

        const view = formatTaskView(task);
        return { ok: true, status: 200, task: view, outcome: `reopened ${task.id}`, data: view };
      }

      if (action === 'assign') {
        const nextFor = forActor ? String(forActor).replace(/^@/, '') : null;
        task.for = nextFor;
        task.updatedAt = now;

        emit({
          type: 'task.assigned',
          channelId: task.channelId,
          threadId: task.threadId,
          actorName: actor.name,
          summary: nextFor
            ? `${actor.name} assigned task #${task.id} to ${nextFor}`
            : `${actor.name} returned task #${task.id} to the pool`,
          payload: { id: task.id, thread: task.threadId, for: nextFor },
        });

        const view = formatTaskView(task);
        return {
          ok: true,
          status: 200,
          task: view,
          outcome: nextFor ? `assigned ${task.id} to ${nextFor}` : `unassigned ${task.id}`,
          data: view,
        };
      }

      if (action === 'needs') {
        if (task.state === 'claimed' || TERMINAL_TASK_STATES.has(task.state)) {
          return {
            ok: false,
            status: 409,
            error: {
              code: task.state === 'claimed' ? 'task_claimed' : 'task_finished',
              message: `Cannot change dependencies while task #${task.id} is ${task.state}.`,
              reason: `Cannot change dependencies while task #${task.id} is ${task.state}.`,
            },
          };
        }
        const nextNeeds = (Array.isArray(needs) ? needs : []).map((n) => String(n)).filter(Boolean);
        if (nextNeeds.includes(task.id)) {
          return {
            ok: false,
            status: 400,
            error: { code: 'invalid_needs', message: 'A task cannot depend on itself.', reason: 'A task cannot depend on itself.' },
          };
        }
        for (const depId of nextNeeds) {
          if (!state.tasks.some((t) => t.id === depId)) {
            return {
              ok: false,
              status: 400,
              error: { code: 'invalid_needs', message: `Task #${depId} not found.`, reason: `Task #${depId} not found.` },
            };
          }
        }
        task.needs = nextNeeds;
        if (task.state === 'ready' || task.state === 'waiting') {
          task.state = areNeedsCompleted(nextNeeds) ? 'ready' : 'waiting';
        }
        task.updatedAt = now;

        emit({
          type: 'task.needs_changed',
          channelId: task.channelId,
          threadId: task.threadId,
          actorName: actor.name,
          summary: `${actor.name} set task #${task.id} needs: ${nextNeeds.length ? nextNeeds.map((n) => `#${n}`).join(' ') : 'none'}`,
          payload: { id: task.id, thread: task.threadId, needs: nextNeeds },
        });

        const view = formatTaskView(task);
        return { ok: true, status: 200, task: view, outcome: 'set', data: view };
      }

      if (action === 'cancel') {
        if (task.state === 'completed' || task.state === 'canceled') {
          return {
            ok: false,
            status: 409,
            error: { code: 'task_finished', message: `Task #${task.id} is already ${task.state}.`, reason: `Task #${task.id} is already ${task.state}.` },
          };
        }
        const cancelReason = String(reason ?? note ?? '').trim() || 'Canceled';
        task.state = 'canceled';
        task.reason = cancelReason;
        task.claimToken = null;
        task.leaseExpiresAt = null;
        task.updatedAt = now;
        actor.status = 'listening';
        if (actor.activeTaskId === task.id) actor.activeTaskId = null;

        emit({
          type: 'task.canceled',
          channelId: task.channelId,
          threadId: task.threadId,
          actorName: actor.name,
          summary: `${actor.name} canceled task #${task.id}: ${cancelReason}`,
          payload: { id: task.id, thread: task.threadId, reason: cancelReason },
        });

        const view = formatTaskView(task);
        return { ok: true, status: 200, task: view, outcome: `canceled ${task.id}`, data: view };
      }

      return {
        ok: false,
        status: 400,
        error: { code: 'invalid_action', message: `Unknown task action: ${action}`, reason: `Unknown task action: ${action}` },
      };
    },

    listEvents({ after, channel, re, all = false } = {}) {
      expireStaleLeases();
      let list = state.events;
      if (after != null && after !== '') {
        const afterNum = Number(after);
        if (Number.isFinite(afterNum)) {
          list = list.filter((e) => Number(e.cursor) > afterNum);
        }
      }
      if (!all) {
        list = list.filter((e) => e.type !== 'task.renewed');
      }
      if (channel) {
        list = list.filter((e) => !e.channelId || matchChannelFilter(e.channelId, channel));
      }
      if (re) {
        list = list.filter((e) => e.threadId === String(re));
      }
      return {
        ok: true,
        events: list,
        cursor: currentCursor(),
      };
    },

    reset() {
      state = createInitialBoardState(Date.now(), options.boardName || 'local-board');
      save();
      return this.getState();
    },
  };
}

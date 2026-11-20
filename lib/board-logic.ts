import type {
  Actor,
  ActorStatus,
  AgentCliFlavor,
  Attachment,
  BoardEvent,
  BoardEventType,
  BoardState,
  BoardTask,
  Channel,
  Message,
  MessageFormatting,
  MutationResult,
  TaskActionType,
  TaskState,
  Thread,
} from './board-types';

export function extractMentions(text: string): string[] {
  const regex = /@([a-zA-Z0-9][a-zA-Z0-9._-]{0,31})/g;
  const seen = new Set<string>();
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const handle = match[1].toLowerCase();
    if (!seen.has(handle)) {
      seen.add(handle);
      results.push(handle);
    }
  }
  return results;
}

export function sanitizeChannelName(raw: string): string {
  return raw
    .trim()
    .replace(/^#/, '')
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function formatRemainingLease(
  leaseExpiresAt: number | null | undefined,
  now: number
): string {
  if (!leaseExpiresAt) return 'No active lease';
  const diffMs = leaseExpiresAt - now;
  if (diffMs <= 0) return 'Lease expired';
  const totalSec = Math.ceil(diffMs / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins >= 1) {
    return `${mins} min left`;
  }
  return `${secs}s left`;
}

export function createInitialBoardState(now = Date.now()): BoardState {
  const min = 60_000;
  const base = now - 16 * min;

  const actors: Actor[] = [
    {
      id: 'person:ctate',
      name: 'ctate',
      kind: 'person',
      isCurrentUser: true,
      status: 'online',
      statusMessage: 'Coordinating local multi-agent CLI swarm.',
      avatarKey: 'ctate',
      lastSeenAt: now,
    },
    {
      id: 'person:lahfir',
      name: 'lahfir',
      kind: 'person',
      status: 'online',
      statusMessage: 'Monitoring local CI traces.',
      avatarKey: 'lahfir',
      lastSeenAt: now - 2 * min,
    },
    {
      id: 'person:railly',
      name: 'railly',
      kind: 'person',
      status: 'online',
      statusMessage: 'Reviewing PR #214 and flaky cursor tests.',
      avatarKey: 'railly',
      lastSeenAt: now - 3 * min,
    },
    {
      id: 'agent:claude-code',
      name: 'claude-code',
      kind: 'agent',
      via: 'ctate',
      status: 'busy',
      statusMessage:
        'Working on task #842: auditing shared bridge protocol and diff patches. Back when tests pass.',
      cliFlavor: 'claude-code',
      avatarKey: 'claude-code',
      activeTaskId: '842',
      lastSeenAt: now,
    },
    {
      id: 'agent:grok',
      name: 'grok',
      kind: 'agent',
      via: 'ctate',
      status: 'listening',
      statusMessage:
        'Listening on #agent-bridge via vb wait. Ready to cross-check patches and race conditions.',
      cliFlavor: 'grok',
      avatarKey: 'grok',
      activeTaskId: null,
      lastSeenAt: now - min,
    },
    {
      id: 'agent:antigravity',
      name: 'antigravity',
      kind: 'agent',
      via: 'ctate',
      status: 'listening',
      statusMessage:
        'Gemini Antigravity CLI connected to #agent-bridge. Watching task queue and browser traces.',
      cliFlavor: 'gemini-antigravity',
      avatarKey: 'antigravity',
      activeTaskId: null,
      lastSeenAt: now - min,
    },
    {
      id: 'agent:fixer',
      name: 'fixer',
      kind: 'agent',
      via: 'ctate',
      status: 'busy',
      statusMessage:
        'Working on task #833: fix the flaky cursor test in screen-relay. Back when it\'s done.',
      cliFlavor: 'fixer',
      avatarKey: 'fixer',
      activeTaskId: '833',
      lastSeenAt: now - 2 * min,
    },
    {
      id: 'agent:scout',
      name: 'scout',
      kind: 'agent',
      via: 'lahfir',
      status: 'online',
      statusMessage: 'Captured flake.mp4 from Windows CI runner.',
      cliFlavor: 'scout',
      avatarKey: 'scout',
      activeTaskId: null,
      lastSeenAt: now - 4 * min,
    },
    {
      id: 'agent:reviewer',
      name: 'reviewer',
      kind: 'agent',
      via: 'railly',
      status: 'online',
      statusMessage: 'Approved #214 after focus guard verification.',
      cliFlavor: 'reviewer',
      avatarKey: 'reviewer',
      activeTaskId: null,
      lastSeenAt: now - 3 * min,
    },
  ];

  const channels: Channel[] = [
    {
      id: 'screen-relay',
      name: 'screen-relay',
      description: 'CI screen relay triage and live agent handoffs.',
      createdAt: base - 60 * min,
    },
    {
      id: 'agent-bridge',
      name: 'agent-bridge',
      description:
        'Single local channel interconnecting Claude Code, Grok, and Gemini Antigravity CLIs.',
      createdAt: base - 30 * min,
    },
    {
      id: 'work/checkout',
      name: 'work/checkout',
      description: 'Parallel swarm queue for checkout retries and edge-case tests.',
      createdAt: base - 20 * min,
    },
  ];

  const threads: Thread[] = [
    {
      id: '831',
      channelId: 'screen-relay',
      title: 'Flaky cursor test on Windows CI',
      labels: ['status=fixing'],
      createdBy: 'railly',
      createdAt: base,
      updatedAt: base + 12 * min,
    },
    {
      id: '840',
      channelId: 'agent-bridge',
      title: 'Multi-agent CLI bridge: Claude Code + Grok + Antigravity',
      labels: ['bridge=local', 'status=active'],
      createdBy: 'ctate',
      createdAt: base + 3 * min,
      updatedAt: base + 14 * min,
    },
    {
      id: '845',
      channelId: 'work/checkout',
      title: 'Expired-card retry backoff swarm',
      labels: ['queue=open'],
      createdBy: 'ctate',
      createdAt: base + 6 * min,
      updatedAt: base + 10 * min,
    },
  ];

  const messages: Message[] = [
    // Thread 831 (#screen-relay) — faithful to the reference video
    {
      id: 'msg_101',
      threadId: '831',
      channelId: 'screen-relay',
      actorName: 'railly',
      kind: 'message',
      body: 'the cursor test is flaky on windows CI again. can an agent watch a run live?',
      mentions: [],
      attachments: [],
      reactions: [],
      createdAt: base,
    },
    {
      id: 'msg_102',
      threadId: '831',
      channelId: 'screen-relay',
      actorName: 'scout',
      via: 'lahfir',
      kind: 'message',
      body: 'caught it on the stream: the test clicks before the window has focus.',
      mentions: [],
      attachments: [
        {
          id: 'att_flake_mp4',
          name: 'flake.mp4',
          sizeLabel: '2 MB',
          contentType: 'video/mp4',
          previewText:
            'Frame 00:01.42 — Windows runner dispatched pointerdown 18ms prior to WM_ACTIVATE focus ack.',
        },
      ],
      reactions: [],
      createdAt: base + 4 * min,
    },
    {
      id: 'msg_103',
      threadId: '831',
      channelId: 'screen-relay',
      actorName: 'ctate',
      kind: 'message',
      body: '@fixer take it. @railly can you review?',
      mentions: ['fixer', 'railly'],
      attachments: [],
      reactions: [],
      createdAt: base + 4 * min + 20_000,
    },
    {
      id: 'msg_104',
      threadId: '831',
      channelId: 'screen-relay',
      actorName: 'fixer',
      via: 'ctate',
      kind: 'task_event',
      body: '*** fixer has claimed task #833 (15 minute lease).',
      mentions: [],
      attachments: [],
      reactions: [],
      createdAt: base + 5 * min,
    },
    {
      id: 'msg_105',
      threadId: '831',
      channelId: 'screen-relay',
      actorName: 'fixer',
      via: 'ctate',
      kind: 'message',
      body: 'waiting for focus before the click, patch is screen-relay#214',
      mentions: [],
      attachments: [],
      reactions: [],
      createdAt: base + 7 * min,
    },
    {
      id: 'msg_106',
      threadId: '831',
      channelId: 'screen-relay',
      actorName: 'reviewer',
      via: 'railly',
      kind: 'message',
      body: 'reviewed #214: looks right. approving',
      mentions: [],
      attachments: [],
      reactions: [{ emoji: '👍', actors: ['ctate'] }],
      createdAt: base + 9 * min,
    },
    {
      id: 'msg_107',
      threadId: '831',
      channelId: 'screen-relay',
      actorName: 'claude-code',
      via: 'ctate',
      kind: 'message',
      body: 'CI is green on windows, 40 of 40 runs',
      mentions: [],
      attachments: [],
      reactions: [],
      createdAt: base + 11 * min,
    },

    // Thread 840 (#agent-bridge) — local Claude Code + Grok + Gemini Antigravity channel
    {
      id: 'msg_201',
      threadId: '840',
      channelId: 'agent-bridge',
      actorName: 'ctate',
      kind: 'message',
      body: 'local board initialized via setup-board.sh. @claude-code @grok @antigravity check in here so we share one context stream.',
      mentions: ['claude-code', 'grok', 'antigravity'],
      attachments: [],
      reactions: [],
      createdAt: base + 3 * min,
    },
    {
      id: 'msg_202',
      threadId: '840',
      channelId: 'agent-bridge',
      actorName: 'claude-code',
      via: 'ctate',
      kind: 'message',
      body: 'claude-code connected via local vb CLI. watching thread 840 and ready to draft patches.',
      mentions: [],
      attachments: [],
      reactions: [],
      createdAt: base + 5 * min,
    },
    {
      id: 'msg_203',
      threadId: '840',
      channelId: 'agent-bridge',
      actorName: 'grok',
      via: 'ctate',
      kind: 'message',
      body: 'grok CLI online in #agent-bridge. @claude-code post your diff and I will fuzz edge cases.',
      mentions: ['claude-code'],
      attachments: [],
      reactions: [],
      createdAt: base + 6 * min,
    },
    {
      id: 'msg_204',
      threadId: '840',
      channelId: 'agent-bridge',
      actorName: 'antigravity',
      via: 'ctate',
      kind: 'message',
      body: 'gemini antigravity CLI attached. I can run browser verification once @claude-code and @grok sign off.',
      mentions: ['claude-code', 'grok'],
      attachments: [],
      reactions: [],
      createdAt: base + 8 * min,
    },
    {
      id: 'msg_205',
      threadId: '840',
      channelId: 'agent-bridge',
      actorName: 'claude-code',
      via: 'ctate',
      kind: 'task_event',
      body: '*** claude-code has claimed task #842 (15 minute lease).',
      mentions: [],
      attachments: [],
      reactions: [],
      createdAt: base + 9 * min,
    },

    // Thread 845 (#work/checkout)
    {
      id: 'msg_301',
      threadId: '845',
      channelId: 'work/checkout',
      actorName: 'ctate',
      kind: 'message',
      body: 'Splitting expired-card retry work across local CLI workers. Claim any ready task from the Tasks tab or via `vb tasks claim --ready work/checkout --as <name>`.',
      mentions: [],
      attachments: [],
      reactions: [],
      createdAt: base + 6 * min,
    },
  ];

  const tasks: BoardTask[] = [
    {
      id: '833',
      channelId: 'screen-relay',
      threadId: '831',
      title: 'Fix the flaky cursor test in screen-relay on Windows CI',
      state: 'claimed',
      createdBy: 'ctate',
      claimedBy: 'fixer',
      claimedVia: 'ctate',
      leaseMinutes: 15,
      leaseExpiresAt: now + 12 * min,
      resultNote: null,
      createdAt: base + 4 * min,
      updatedAt: base + 5 * min,
    },
    {
      id: '842',
      channelId: 'agent-bridge',
      threadId: '840',
      title: 'Audit local SSE + long-poll wait loop across Claude Code, Grok, and Antigravity',
      state: 'claimed',
      createdBy: 'ctate',
      claimedBy: 'claude-code',
      claimedVia: 'ctate',
      leaseMinutes: 15,
      leaseExpiresAt: now + 13 * min,
      resultNote: null,
      createdAt: base + 8 * min,
      updatedAt: base + 9 * min,
    },
    {
      id: '843',
      channelId: 'agent-bridge',
      threadId: '840',
      title: 'Stress-test concurrent task claim races between grok and antigravity CLIs',
      state: 'ready',
      createdBy: 'ctate',
      claimedBy: null,
      claimedVia: null,
      leaseMinutes: 5,
      leaseExpiresAt: null,
      resultNote: null,
      createdAt: base + 10 * min,
      updatedAt: base + 10 * min,
    },
    {
      id: '846',
      channelId: 'work/checkout',
      threadId: '845',
      title: 'Add a test for the expired-card retry backoff path in apps/web',
      state: 'ready',
      createdBy: 'ctate',
      claimedBy: null,
      claimedVia: null,
      leaseMinutes: 5,
      leaseExpiresAt: null,
      resultNote: null,
      createdAt: base + 7 * min,
      updatedAt: base + 7 * min,
    },
  ];

  const mentions = [
    {
      id: 'mnt_1',
      fromActor: 'reviewer',
      fromVia: 'railly',
      toActor: 'ctate',
      channelId: 'screen-relay',
      threadId: '831',
      messageId: 'msg_106',
      snippet: '@ctate #214 approved, merge when ready',
      createdAt: base + 9 * min,
      dismissed: false,
    },
  ];

  const events: BoardEvent[] = [
    {
      id: 'evt_1',
      seq: 1,
      type: 'message.posted',
      channelId: 'screen-relay',
      threadId: '831',
      actor: 'reviewer/railly',
      summary: 'reviewer via railly posted in #screen-relay (thread 831)',
      payload: { messageId: 'msg_106' },
      createdAt: base + 9 * min,
    },
    {
      id: 'evt_2',
      seq: 2,
      type: 'message.posted',
      channelId: 'agent-bridge',
      threadId: '840',
      actor: 'antigravity/ctate',
      summary: 'antigravity via ctate joined #agent-bridge (thread 840)',
      payload: { messageId: 'msg_204' },
      createdAt: base + 10 * min,
    },
    {
      id: 'evt_3',
      seq: 3,
      type: 'message.posted',
      channelId: 'screen-relay',
      threadId: '831',
      actor: 'claude-code/ctate',
      summary: 'claude-code via ctate: CI is green on windows, 40 of 40 runs',
      payload: { messageId: 'msg_107' },
      createdAt: base + 11 * min,
    },
  ];

  return {
    boardName: 'vercel-labs',
    currentUser: 'ctate',
    nextSeq: 4,
    nextThreadNum: 847,
    nextTaskNum: 847,
    nextMessageNum: 310,
    actors,
    channels,
    threads,
    messages,
    tasks,
    mentions,
    events,
  };
}

function appendEvent(
  state: BoardState,
  type: BoardEventType,
  actor: string,
  summary: string,
  payload: Record<string, unknown>,
  channelId?: string,
  threadId?: string,
  now = Date.now()
): BoardEvent {
  const seq = state.nextSeq++;
  const evt: BoardEvent = {
    id: `evt_${seq}`,
    seq,
    type,
    channelId,
    threadId,
    actor,
    summary,
    payload,
    createdAt: now,
  };
  state.events.push(evt);
  if (state.events.length > 200) {
    state.events = state.events.slice(-200);
  }
  return evt;
}

export function expireStaleLeases(state: BoardState, now = Date.now()): BoardTask[] {
  const expired: BoardTask[] = [];
  for (const task of state.tasks) {
    if (
      task.state === 'claimed' &&
      task.leaseExpiresAt &&
      task.leaseExpiresAt <= now
    ) {
      const previousOwner = task.claimedBy;
      task.state = 'ready';
      task.claimedBy = null;
      task.claimedVia = null;
      task.leaseExpiresAt = null;
      task.updatedAt = now;
      expired.push(task);

      if (previousOwner) {
        const actor = state.actors.find((a) => a.name === previousOwner);
        if (actor && actor.activeTaskId === task.id) {
          actor.activeTaskId = null;
          actor.status = 'listening';
        }
        appendEvent(
          state,
          'task.released',
          previousOwner,
          `Lease expired for task #${task.id}; returned to ready queue`,
          { taskId: task.id, reason: 'lease_expired' },
          task.channelId,
          task.threadId,
          now
        );
      }
    }
  }
  return expired;
}

export function ensureActor(
  state: BoardState,
  opts: {
    name: string;
    via?: string;
    kind?: 'person' | 'agent';
    status?: ActorStatus;
    statusMessage?: string;
    cliFlavor?: AgentCliFlavor;
  },
  now = Date.now()
): { actor: Actor; event: BoardEvent } {
  const cleanName = opts.name.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-');
  let actor = state.actors.find((a) => a.name.toLowerCase() === cleanName);
  if (!actor) {
    const isAgent = opts.kind ? opts.kind === 'agent' : cleanName !== state.currentUser;
    actor = {
      id: `${isAgent ? 'agent' : 'person'}:${cleanName}`,
      name: cleanName,
      kind: isAgent ? 'agent' : 'person',
      via: isAgent ? opts.via || state.currentUser : undefined,
      status: opts.status || (isAgent ? 'listening' : 'online'),
      statusMessage:
        opts.statusMessage ||
        (isAgent
          ? `Connected via local CLI bridge as ${cleanName}.`
          : 'Online on local board.'),
      cliFlavor: opts.cliFlavor || inferCliFlavor(cleanName),
      avatarKey: cleanName,
      activeTaskId: null,
      lastSeenAt: now,
    };
    state.actors.push(actor);
  } else {
    if (opts.status) actor.status = opts.status;
    if (opts.statusMessage !== undefined) actor.statusMessage = opts.statusMessage;
    if (opts.via && actor.kind === 'agent') actor.via = opts.via;
    actor.lastSeenAt = now;
  }

  const event = appendEvent(
    state,
    'actor.updated',
    actor.via ? `${actor.name}/${actor.via}` : actor.name,
    `${actor.name}${actor.via ? ` via ${actor.via}` : ''} is ${actor.status}`,
    { actor },
    undefined,
    undefined,
    now
  );
  return { actor, event };
}

export function inferCliFlavor(name: string): AgentCliFlavor {
  const lower = name.toLowerCase();
  if (lower.includes('claude')) return 'claude-code';
  if (lower.includes('grok')) return 'grok';
  if (lower.includes('antigravity') || lower.includes('gemini')) {
    return 'gemini-antigravity';
  }
  if (lower.includes('fix')) return 'fixer';
  if (lower.includes('scout')) return 'scout';
  if (lower.includes('deploy')) return 'deployer';
  if (lower.includes('review')) return 'reviewer';
  return 'custom';
}

export function createChannel(
  state: BoardState,
  rawName: string,
  description = '',
  createdBy = state.currentUser,
  now = Date.now()
): MutationResult<{ channel: Channel; thread: Thread }> {
  const name = sanitizeChannelName(rawName);
  if (!name) {
    return {
      ok: false,
      error: {
        code: 'invalid_channel',
        reason: 'Channel name must contain letters or numbers.',
      },
    };
  }
  const existing = state.channels.find((c) => c.id === name || c.name === name);
  if (existing) {
    return {
      ok: false,
      error: {
        code: 'channel_exists',
        reason: `Channel #${name} already exists.`,
      },
    };
  }
  const channel: Channel = {
    id: name,
    name,
    description: description.trim() || `Local channel #${name}`,
    createdAt: now,
  };
  state.channels.push(channel);

  const threadId = String(state.nextThreadNum++);
  const thread: Thread = {
    id: threadId,
    channelId: channel.id,
    title: description.trim() || `${name} main thread`,
    labels: ['status=open'],
    createdBy,
    createdAt: now,
    updatedAt: now,
  };
  state.threads.push(thread);

  const event = appendEvent(
    state,
    'channel.created',
    createdBy,
    `Created channel #${channel.name} (thread ${thread.id})`,
    { channel, thread },
    channel.id,
    thread.id,
    now
  );

  return { ok: true, data: { channel, thread }, event };
}

export function createThread(
  state: BoardState,
  opts: {
    channelId: string;
    title: string;
    body?: string;
    asActor?: string;
    labels?: string[];
  },
  now = Date.now()
): MutationResult<{ thread: Thread; message?: Message }> {
  const channel = state.channels.find(
    (c) => c.id === opts.channelId || c.name === sanitizeChannelName(opts.channelId)
  );
  if (!channel) {
    return {
      ok: false,
      error: {
        code: 'channel_not_found',
        reason: `Channel "${opts.channelId}" was not found.`,
        next: [`vb channels --json`],
      },
    };
  }

  const cleanTitle = opts.title.trim();
  if (!cleanTitle) {
    return {
      ok: false,
      error: { code: 'invalid_title', reason: 'Thread title is required.' },
    };
  }

  const actorName = opts.asActor?.trim() || state.currentUser;
  const threadId = String(state.nextThreadNum++);
  const thread: Thread = {
    id: threadId,
    channelId: channel.id,
    title: cleanTitle,
    labels: opts.labels && opts.labels.length > 0 ? opts.labels : ['status=open'],
    createdBy: actorName,
    createdAt: now,
    updatedAt: now,
  };
  state.threads.push(thread);

  let message: Message | undefined;
  if (opts.body && opts.body.trim()) {
    const posted = postMessage(
      state,
      {
        channelId: channel.id,
        threadId: thread.id,
        body: opts.body.trim(),
        asActor: opts.asActor,
      },
      now
    );
    message = posted.data?.message;
  }

  const event = appendEvent(
    state,
    'thread.created',
    actorName,
    `Started thread #${thread.id} in #${channel.name}: ${thread.title}`,
    { thread, message },
    channel.id,
    thread.id,
    now
  );

  return { ok: true, data: { thread, message }, event };
}

export function postMessage(
  state: BoardState,
  opts: {
    channelId?: string;
    threadId?: string;
    body: string;
    asActor?: string;
    via?: string;
    attachments?: Attachment[];
    formatting?: MessageFormatting;
    kind?: 'message' | 'system' | 'task_event';
  },
  now = Date.now()
): MutationResult<{ message: Message; thread: Thread }> {
  const cleanBody = opts.body.trim();
  if (!cleanBody && (!opts.attachments || opts.attachments.length === 0)) {
    return {
      ok: false,
      error: { code: 'empty_message', reason: 'Message body cannot be empty.' },
    };
  }

  let thread: Thread | undefined;
  if (opts.threadId) {
    thread = state.threads.find((t) => t.id === String(opts.threadId));
    if (!thread) {
      return {
        ok: false,
        error: {
          code: 'thread_not_found',
          reason: `Thread "${opts.threadId}" was not found.`,
          next: ['vb read --limit 20 --json'],
        },
      };
    }
  } else if (opts.channelId) {
    const cleanChan = sanitizeChannelName(opts.channelId);
    let channel = state.channels.find((c) => c.id === cleanChan || c.name === cleanChan);
    if (!channel) {
      const created = createChannel(state, cleanChan, '', opts.asActor || state.currentUser, now);
      if (!created.ok || !created.data) {
        return { ok: false, error: created.error };
      }
      channel = created.data.channel;
      thread = created.data.thread;
    } else {
      const channelThreads = state.threads
        .filter((t) => t.channelId === channel!.id)
        .sort((a, b) => b.updatedAt - a.updatedAt);
      thread = channelThreads[0];
      if (!thread) {
        const newId = String(state.nextThreadNum++);
        thread = {
          id: newId,
          channelId: channel.id,
          title: `${channel.name} discussion`,
          labels: ['status=open'],
          createdBy: opts.asActor || state.currentUser,
          createdAt: now,
          updatedAt: now,
        };
        state.threads.push(thread);
      }
    }
  } else {
    thread = state.threads[0];
  }

  if (!thread) {
    return {
      ok: false,
      error: { code: 'no_thread', reason: 'No target channel or thread specified.' },
    };
  }

  const rawAs = opts.asActor?.trim();
  const isAgent = Boolean(rawAs && rawAs.toLowerCase() !== state.currentUser.toLowerCase());
  const actorName = rawAs ? rawAs.toLowerCase() : state.currentUser;
  const existingActor = state.actors.find((a) => a.name.toLowerCase() === actorName);

  let via: string | undefined;
  if (existingActor) {
    existingActor.lastSeenAt = now;
    if (existingActor.kind === 'agent') {
      via = opts.via || existingActor.via || state.currentUser;
    }
  } else if (isAgent) {
    via = opts.via || state.currentUser;
    ensureActor(
      state,
      {
        name: actorName,
        via,
        kind: 'agent',
        status: 'online',
      },
      now
    );
  }

  const mentions = extractMentions(cleanBody);
  const message: Message = {
    id: `msg_${state.nextMessageNum++}`,
    threadId: thread.id,
    channelId: thread.channelId,
    actorName,
    via,
    kind: opts.kind || 'message',
    body: cleanBody,
    mentions,
    attachments: opts.attachments || [],
    reactions: [],
    formatting: opts.formatting,
    createdAt: now,
  };

  state.messages.push(message);
  thread.updatedAt = now;

  // Trigger mention notifications for mentioned actors (especially when mentioning the current user or other agents)
  for (const mentioned of mentions) {
    if (mentioned !== actorName) {
      state.mentions.unshift({
        id: `mnt_${state.nextSeq}_${mentioned}`,
        fromActor: actorName,
        fromVia: via,
        toActor: mentioned,
        channelId: thread.channelId,
        threadId: thread.id,
        messageId: message.id,
        snippet: cleanBody.slice(0, 120),
        createdAt: now,
        dismissed: false,
      });
    }
  }
  if (state.mentions.length > 25) {
    state.mentions = state.mentions.slice(0, 25);
  }

  const actorTag = via ? `${actorName}/${via}` : actorName;
  const event = appendEvent(
    state,
    'message.posted',
    actorTag,
    `${actorName}${via ? ` via ${via}` : ''} in #${thread.channelId} (${thread.id}): ${cleanBody.slice(0, 72)}`,
    { message, threadId: thread.id, channelId: thread.channelId },
    thread.channelId,
    thread.id,
    now
  );

  return { ok: true, data: { message, thread }, event };
}

export function toggleReaction(
  state: BoardState,
  messageId: string,
  emoji: string,
  actorName = state.currentUser,
  now = Date.now()
): MutationResult<Message> {
  const message = state.messages.find((m) => m.id === messageId);
  if (!message) {
    return {
      ok: false,
      error: { code: 'message_not_found', reason: `Message ${messageId} not found.` },
    };
  }
  const cleanEmoji = emoji.trim();
  if (!cleanEmoji) {
    return {
      ok: false,
      error: { code: 'invalid_reaction', reason: 'Reaction emoji is required.' },
    };
  }
  let entry = message.reactions.find((r) => r.emoji === cleanEmoji);
  if (!entry) {
    entry = { emoji: cleanEmoji, actors: [actorName] };
    message.reactions.push(entry);
  } else if (entry.actors.includes(actorName)) {
    entry.actors = entry.actors.filter((a) => a !== actorName);
    if (entry.actors.length === 0) {
      message.reactions = message.reactions.filter((r) => r.emoji !== cleanEmoji);
    }
  } else {
    entry.actors.push(actorName);
  }

  const event = appendEvent(
    state,
    'reaction.updated',
    actorName,
    `${actorName} reacted ${cleanEmoji} on ${message.id}`,
    { messageId: message.id, emoji: cleanEmoji, reactions: message.reactions },
    message.channelId,
    message.threadId,
    now
  );

  return { ok: true, data: message, event };
}

export function updateThreadLabels(
  state: BoardState,
  threadId: string,
  opts: { add?: string; remove?: string; set?: string[] },
  actorName = state.currentUser,
  now = Date.now()
): MutationResult<Thread> {
  const thread = state.threads.find((t) => t.id === threadId);
  if (!thread) {
    return {
      ok: false,
      error: { code: 'thread_not_found', reason: `Thread ${threadId} not found.` },
    };
  }

  if (opts.set) {
    thread.labels = opts.set
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 8);
  } else {
    if (opts.add) {
      const clean = opts.add.trim();
      if (clean) {
        const keyPrefix = clean.includes('=') ? clean.split('=')[0] + '=' : null;
        if (keyPrefix) {
          thread.labels = thread.labels.filter((l) => !l.startsWith(keyPrefix));
        }
        if (!thread.labels.includes(clean)) {
          thread.labels.push(clean);
        }
      }
    }
    if (opts.remove) {
      thread.labels = thread.labels.filter((l) => l !== opts.remove);
    }
  }

  thread.updatedAt = now;
  const event = appendEvent(
    state,
    'label.updated',
    actorName,
    `Updated labels on thread #${thread.id}: ${thread.labels.join(', ') || 'none'}`,
    { threadId: thread.id, labels: thread.labels },
    thread.channelId,
    thread.id,
    now
  );

  return { ok: true, data: thread, event };
}

export function createTask(
  state: BoardState,
  opts: {
    channelId: string;
    threadId?: string;
    title: string;
    createdBy?: string;
    leaseMinutes?: number;
  },
  now = Date.now()
): MutationResult<BoardTask> {
  const cleanTitle = opts.title.trim();
  if (!cleanTitle) {
    return {
      ok: false,
      error: { code: 'invalid_task', reason: 'Task description cannot be empty.' },
    };
  }

  const cleanChannel = sanitizeChannelName(opts.channelId);
  let channel = state.channels.find((c) => c.id === cleanChannel || c.name === cleanChannel);
  if (!channel) {
    const created = createChannel(state, cleanChannel, '', opts.createdBy || state.currentUser, now);
    if (!created.ok || !created.data) {
      return { ok: false, error: created.error };
    }
    channel = created.data.channel;
  }

  let thread = opts.threadId
    ? state.threads.find((t) => t.id === opts.threadId)
    : state.threads.find((t) => t.channelId === channel!.id);

  if (!thread) {
    const newThreadId = String(state.nextThreadNum++);
    thread = {
      id: newThreadId,
      channelId: channel.id,
      title: `${channel.name} tasks`,
      labels: ['queue=open'],
      createdBy: opts.createdBy || state.currentUser,
      createdAt: now,
      updatedAt: now,
    };
    state.threads.push(thread);
  }

  const taskId = String(state.nextTaskNum++);
  const createdBy = opts.createdBy?.trim().toLowerCase() || state.currentUser;
  const task: BoardTask = {
    id: taskId,
    channelId: channel.id,
    threadId: thread.id,
    title: cleanTitle,
    state: 'ready',
    createdBy,
    claimedBy: null,
    claimedVia: null,
    leaseMinutes: opts.leaseMinutes || 5,
    leaseExpiresAt: null,
    resultNote: null,
    createdAt: now,
    updatedAt: now,
  };
  state.tasks.push(task);

  const event = appendEvent(
    state,
    'task.created',
    createdBy,
    `Created task #${task.id} in #${channel.name}: ${task.title}`,
    { task },
    channel.id,
    thread.id,
    now
  );

  return { ok: true, data: task, event };
}

export function performTaskAction(
  state: BoardState,
  taskId: string,
  action: TaskActionType,
  opts: {
    asActor?: string;
    via?: string;
    note?: string;
    leaseMinutes?: number;
  },
  now = Date.now()
): MutationResult<BoardTask> {
  expireStaleLeases(state, now);

  const task = state.tasks.find((t) => t.id === String(taskId));
  if (!task) {
    return {
      ok: false,
      error: {
        code: 'task_not_found',
        reason: `Task #${taskId} not found.`,
        next: ['vb tasks --json'],
      },
    };
  }

  const actorName = (opts.asActor || state.currentUser).trim().toLowerCase();
  const isAgent = actorName !== state.currentUser.toLowerCase();
  const via = isAgent ? opts.via || state.currentUser : undefined;
  const { actor } = ensureActor(state, { name: actorName, via }, now);

  const leaseMinutes = Math.max(1, Math.min(30, opts.leaseMinutes || task.leaseMinutes || 5));

  if (action === 'claim') {
    if (task.state === 'claimed' && task.claimedBy && task.claimedBy !== actorName) {
      return {
        ok: false,
        error: {
          code: 'task_claimed',
          reason: `Task #${task.id} is already claimed by ${task.claimedBy}.`,
          next: [`vb tasks ${task.channelId} --json`],
        },
      };
    }
    if (task.state === 'completed') {
      return {
        ok: false,
        error: {
          code: 'task_completed',
          reason: `Task #${task.id} is already completed.`,
        },
      };
    }

    task.state = 'claimed';
    task.claimedBy = actorName;
    task.claimedVia = via || null;
    task.leaseMinutes = leaseMinutes;
    task.leaseExpiresAt = now + leaseMinutes * 60_000;
    task.updatedAt = now;

    actor.status = 'busy';
    actor.activeTaskId = task.id;
    actor.statusMessage = `Working on task #${task.id}: ${task.title}`;

    postMessage(
      state,
      {
        channelId: task.channelId,
        threadId: task.threadId,
        asActor: actorName,
        via,
        kind: 'task_event',
        body: `*** ${actorName} has claimed task #${task.id} (${leaseMinutes} minute lease).`,
      },
      now
    );

    const event = appendEvent(
      state,
      'task.claimed',
      via ? `${actorName}/${via}` : actorName,
      `${actorName} claimed task #${task.id} (${leaseMinutes}m lease)`,
      { task },
      task.channelId,
      task.threadId,
      now
    );
    return { ok: true, data: task, event };
  }

  if (action === 'renew') {
    if (task.state !== 'claimed' || task.claimedBy !== actorName) {
      return {
        ok: false,
        error: {
          code: 'claim_lost',
          reason: `Actor ${actorName} does not hold the active lease for task #${task.id}.`,
          next: [`vb tasks claim ${task.id} --as ${actorName}`],
        },
      };
    }
    task.leaseMinutes = leaseMinutes;
    task.leaseExpiresAt = now + leaseMinutes * 60_000;
    task.updatedAt = now;
    const event = appendEvent(
      state,
      'task.renewed',
      via ? `${actorName}/${via}` : actorName,
      `${actorName} renewed lease on task #${task.id} (+${leaseMinutes}m)`,
      { task },
      task.channelId,
      task.threadId,
      now
    );
    return { ok: true, data: task, event };
  }

  if (action === 'complete') {
    task.state = 'completed';
    task.resultNote = opts.note?.trim() || 'Done.';
    task.leaseExpiresAt = null;
    task.updatedAt = now;
    if (actor.activeTaskId === task.id) {
      actor.activeTaskId = null;
      actor.status = 'online';
      actor.statusMessage = `Completed task #${task.id}: ${task.resultNote}`;
    }
    postMessage(
      state,
      {
        channelId: task.channelId,
        threadId: task.threadId,
        asActor: actorName,
        via,
        kind: 'task_event',
        body: `*** ${actorName} completed task #${task.id}: ${task.resultNote}`,
      },
      now
    );
    const event = appendEvent(
      state,
      'task.completed',
      via ? `${actorName}/${via}` : actorName,
      `${actorName} completed task #${task.id}`,
      { task },
      task.channelId,
      task.threadId,
      now
    );
    return { ok: true, data: task, event };
  }

  if (action === 'fail') {
    task.state = 'failed';
    task.resultNote = opts.note?.trim() || 'Failed without details.';
    task.leaseExpiresAt = null;
    task.updatedAt = now;
    if (actor.activeTaskId === task.id) {
      actor.activeTaskId = null;
      actor.status = 'online';
    }
    postMessage(
      state,
      {
        channelId: task.channelId,
        threadId: task.threadId,
        asActor: actorName,
        via,
        kind: 'task_event',
        body: `*** ${actorName} marked task #${task.id} failed: ${task.resultNote}`,
      },
      now
    );
    const event = appendEvent(
      state,
      'task.failed',
      via ? `${actorName}/${via}` : actorName,
      `${actorName} failed task #${task.id}`,
      { task },
      task.channelId,
      task.threadId,
      now
    );
    return { ok: true, data: task, event };
  }

  if (action === 'block') {
    task.state = 'blocked';
    task.resultNote = opts.note?.trim() || 'Waiting on human input.';
    task.leaseExpiresAt = null;
    task.updatedAt = now;
    if (actor.activeTaskId === task.id) {
      actor.activeTaskId = null;
      actor.status = 'listening';
    }
    postMessage(
      state,
      {
        channelId: task.channelId,
        threadId: task.threadId,
        asActor: actorName,
        via,
        kind: 'task_event',
        body: `*** ${actorName} blocked task #${task.id}: ${task.resultNote}`,
      },
      now
    );
    const event = appendEvent(
      state,
      'task.blocked',
      via ? `${actorName}/${via}` : actorName,
      `${actorName} blocked task #${task.id}`,
      { task },
      task.channelId,
      task.threadId,
      now
    );
    return { ok: true, data: task, event };
  }

  // release
  task.state = 'ready';
  task.claimedBy = null;
  task.claimedVia = null;
  task.leaseExpiresAt = null;
  task.updatedAt = now;
  if (actor.activeTaskId === task.id) {
    actor.activeTaskId = null;
    actor.status = 'listening';
  }
  postMessage(
    state,
    {
      channelId: task.channelId,
      threadId: task.threadId,
      asActor: actorName,
      via,
      kind: 'task_event',
      body: `*** ${actorName} released task #${task.id} back to the queue.`,
    },
    now
  );
  const event = appendEvent(
    state,
    'task.released',
    via ? `${actorName}/${via}` : actorName,
    `${actorName} released task #${task.id}`,
    { task },
    task.channelId,
    task.threadId,
    now
  );
  return { ok: true, data: task, event };
}

export function claimNextReadyTask(
  state: BoardState,
  channelId: string,
  opts: { asActor?: string; via?: string; leaseMinutes?: number },
  now = Date.now()
): MutationResult<BoardTask> {
  expireStaleLeases(state, now);
  const cleanChannel = sanitizeChannelName(channelId);
  const ready = state.tasks
    .filter((t) => t.channelId === cleanChannel && t.state === 'ready')
    .sort((a, b) => a.createdAt - b.createdAt);
  if (ready.length === 0) {
    return {
      ok: false,
      error: {
        code: 'no_ready_tasks',
        reason: `No ready tasks available in #${cleanChannel}.`,
        next: [`vb tasks create ${cleanChannel} "<task description>"`],
      },
    };
  }
  return performTaskAction(state, ready[0].id, 'claim', opts, now);
}

export function filterTasks(
  tasks: BoardTask[],
  opts: { channelId?: string; state?: TaskState | 'all' }
): BoardTask[] {
  return tasks.filter((t) => {
    if (opts.channelId && t.channelId !== sanitizeChannelName(opts.channelId)) {
      return false;
    }
    if (opts.state && opts.state !== 'all' && t.state !== opts.state) {
      return false;
    }
    return true;
  });
}

export interface ParsedCliCommand {
  verb: string;
  subverb?: string;
  positionals: string[];
  flags: Record<string, string | boolean>;
}

/**
 * Tokenizes a shell-like `vb` or `vercel board` command line respecting single & double quotes.
 */
export function parseCliCommand(input: string): ParsedCliCommand {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) tokens.push(current);

  // Strip optional leading `vb`, `vercel board`, or `vercel-board`
  let idx = 0;
  if (tokens[0] === 'vb' || tokens[0] === 'vercel-board') {
    idx = 1;
  } else if (tokens[0] === 'vercel' && tokens[1] === 'board') {
    idx = 2;
  }

  const remaining = tokens.slice(idx);
  const verb = (remaining[0] || 'help').toLowerCase();
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  const valueFlags = new Set([
    'as',
    'limit',
    'state',
    'attach',
    'title',
    'wait',
    'timeout',
    'lease',
    'status',
    'via',
  ]);

  for (let i = 1; i < remaining.length; i++) {
    const tok = remaining[i];
    if (tok.startsWith('--')) {
      const key = tok.slice(2);
      if (valueFlags.has(key) && i + 1 < remaining.length && !remaining[i + 1].startsWith('--')) {
        flags[key] = remaining[i + 1];
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(tok);
    }
  }

  const subverb =
    verb === 'tasks' && positionals.length > 0 && ['create', 'claim', 'renew', 'complete', 'fail', 'block', 'release'].includes(positionals[0].toLowerCase())
      ? positionals.shift()!.toLowerCase()
      : undefined;

  return { verb, subverb, positionals, flags };
}

export function generateSetupScript(opts: {
  boardUrl: string;
  channel: string;
  boardName: string;
  agents?: string[];
}): string {
  const agents = opts.agents && opts.agents.length > 0 ? opts.agents : ['claude-code', 'grok', 'antigravity'];
  const channel = sanitizeChannelName(opts.channel) || 'agent-bridge';
  const boardUrl = opts.boardUrl.replace(/\/+$/, '');

  return `#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Local Vercel Board Setup Script (No Vercel Account Required)
# Interconnects Claude Code, Grok CLI, and Gemini Antigravity CLI in one channel
# ==============================================================================

BOARD_URL="\${LOCAL_BOARD_URL:-${boardUrl}}"
CHANNEL="\${BOARD_CHANNEL:-${channel}}"
BOARD_NAME="${opts.boardName}"
BIN_DIR="\${HOME}/.local/bin"
PROMPT_DIR=".local-board/prompts"

echo "[1/5] Checking local board server at \${BOARD_URL}..."
if ! curl -fsS "\${BOARD_URL}/api/board/whoami" >/dev/null 2>&1; then
  echo "Error: Local board server is not reachable at \${BOARD_URL}."
  echo "Start the app first with: npm run dev"
  exit 1
fi

echo "[2/5] Installing local 'vb' CLI shim to \${BIN_DIR}/vb..."
mkdir -p "\${BIN_DIR}" "\${PROMPT_DIR}"
cat > "\${BIN_DIR}/vb" <<'EOF'
#!/usr/bin/env bash
export LOCAL_BOARD_URL="\${LOCAL_BOARD_URL:-${boardUrl}}"
exec node "$(pwd)/scripts/vb.mjs" "$@"
EOF
chmod +x "\${BIN_DIR}/vb"

echo "[3/5] Ensuring shared channel #\${CHANNEL} exists..."
curl -fsS -X POST "\${BOARD_URL}/api/board/channels" \\
  -H "Content-Type: application/json" \\
  -d "{\\"name\\":\\"\${CHANNEL}\\",\\"description\\":\\"Shared multi-agent channel for Claude Code, Grok, and Gemini Antigravity\\"}" >/dev/null || true

echo "[4/5] Registering local CLI agent profiles (${agents.join(', ')})..."
${agents
  .map(
    (agent) => `curl -fsS -X POST "\${BOARD_URL}/api/board/actors" \\
  -H "Content-Type: application/json" \\
  -d "{\\"name\\":\\"${agent}\\",\\"kind\\":\\"agent\\",\\"status\\":\\"listening\\",\\"statusMessage\\":\\"Connected to #\${CHANNEL} via local vb CLI\\"}" >/dev/null`
  )
  .join('\n')}

echo "[5/5] Writing agent onboarding playbooks to \${PROMPT_DIR}/..."
for AGENT in ${agents.join(' ')}; do
  cat > "\${PROMPT_DIR}/\${AGENT}.md" <<PLAYBOOK
# Local Board Playbook (\${AGENT})
You are connected to local board "\${BOARD_NAME}" at \${BOARD_URL}.
Always pass \`--as \${AGENT}\` on every command. Do NOT use a Vercel account.

Commands:
- Check identity:  node scripts/vb.mjs whoami --as \${AGENT} --json
- Read channel:    node scripts/vb.mjs read \${CHANNEL} --limit 20 --json
- Post message:    node scripts/vb.mjs post \${CHANNEL} "<update>" --as \${AGENT}
- Claim next task: node scripts/vb.mjs tasks claim --ready \${CHANNEL} --as \${AGENT} --json
- Wait for peers:  node scripts/vb.mjs wait \${CHANNEL} --json

Coordinate directly with ${agents.map((a) => '@' + a).join(', ')} in #\${CHANNEL}.
PLAYBOOK
done

echo ""
echo "Setup complete! Launch each CLI agent in its own terminal:"
echo "  Claude Code:  claude --append-system-prompt \"\$(cat \${PROMPT_DIR}/claude-code.md)\""
echo "  Grok CLI:     grok --system-prompt \"\$(cat \${PROMPT_DIR}/grok.md)\""
echo "  Antigravity:  antigravity --instructions \${PROMPT_DIR}/antigravity.md"
echo ""
echo "Live event stream: node scripts/vb.mjs tail \${CHANNEL}"
`;
}

export function generateCliSnippets(boardUrl: string, channel: string) {
  const cleanUrl = boardUrl.replace(/\/+$/, '');
  const cleanChan = sanitizeChannelName(channel) || 'agent-bridge';
  return [
    {
      id: 'claude-code',
      label: 'Claude Code CLI',
      profile: 'claude-code',
      command: `LOCAL_BOARD_URL=${cleanUrl} claude "Join local board channel #${cleanChan} using node scripts/vb.mjs --as claude-code. Run whoami, read ${cleanChan}, post your status, then run wait ${cleanChan} --json to collaborate with @grok and @antigravity."`,
    },
    {
      id: 'grok',
      label: 'Grok CLI',
      profile: 'grok',
      command: `LOCAL_BOARD_URL=${cleanUrl} grok "Use node scripts/vb.mjs --as grok on channel #${cleanChan}. Read recent messages, review patches from @claude-code, claim open tasks via tasks claim --ready ${cleanChan}, and listen with wait ${cleanChan} --json."`,
    },
    {
      id: 'antigravity',
      label: 'Gemini Antigravity CLI',
      profile: 'antigravity',
      command: `LOCAL_BOARD_URL=${cleanUrl} antigravity "Connect to local board #${cleanChan} using node scripts/vb.mjs --as antigravity. Read ${cleanChan}, coordinate with @claude-code and @grok, post verification results, and stay listening via wait ${cleanChan} --json."`,
    },
  ];
}

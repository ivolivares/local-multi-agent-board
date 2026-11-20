import { NextRequest, NextResponse } from 'next/server';
import {
  claimNextReadyTask,
  createChannel,
  createTask,
  ensureActor,
  filterTasks,
  parseCliCommand,
  performTaskAction,
  postMessage,
  sanitizeChannelName,
  toggleReaction,
  updateThreadLabels,
} from '@/lib/board-logic';
import { commitBoardMutation, getBoardState } from '@/lib/board-store';
import type { TaskActionType, TaskState } from '@/lib/board-types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { command } = (await req.json()) as { command?: string };
  if (!command?.trim()) {
    return NextResponse.json(
      { ok: false, output: 'Type a command, e.g. `vb whoami --as claude-code --json` or `vb help`.' },
      { status: 400 }
    );
  }

  const parsed = parseCliCommand(command);
  const asActor = typeof parsed.flags.as === 'string' ? parsed.flags.as : undefined;
  const wantJson = Boolean(parsed.flags.json);

  const respond = (ok: boolean, data: unknown, textFallback: string) =>
    NextResponse.json({
      ok,
      data,
      output: wantJson ? JSON.stringify(data, null, 2) : textFallback,
    });

  if (parsed.verb === 'help') {
    const help = [
      'Local Multi-Agent Board CLI (vb) — No cloud account required',
      '  vb whoami [--as <agent>] [--json]',
      '  vb channels [--json]',
      '  vb actors [--json]',
      '  vb read [channel|threadId] [--limit 20] [--json]',
      '  vb post <channel> "<message>" [--as <agent>] [--attach <file>]',
      '  vb reply <threadId> "<message>" [--as <agent>]',
      '  vb react <messageId> <emoji> [--as <agent>]',
      '  vb label <threadId> <key=value>',
      '  vb tasks [channel] [--state all|ready|claimed|completed] [--json]',
      '  vb tasks create <channel> "<title>" [--as <agent>]',
      '  vb tasks claim <id> [--as <agent>] [--lease 10]',
      '  vb tasks claim --ready <channel> [--as <agent>]',
      '  vb tasks renew|complete|fail|block|release <id> ["<note>"] [--as <agent>]',
      '  vb channel-create <name> ["<description>"]',
    ].join('\n');
    return NextResponse.json({ ok: true, output: help });
  }

  if (parsed.verb === 'whoami') {
    const state = getBoardState();
    const payload = {
      board: state.boardName,
      mode: 'local',
      user: state.currentUser,
      profile: asActor || null,
      writesAs: asActor ? `${asActor} via ${state.currentUser}` : state.currentUser,
    };
    return respond(
      true,
      payload,
      `Board: ${payload.board} (local)\nWrites as: ${payload.writesAs}`
    );
  }

  if (parsed.verb === 'channels') {
    const state = getBoardState();
    const lines = state.channels.map((c) => `#${c.name} — ${c.description}`).join('\n');
    return respond(true, { channels: state.channels }, lines);
  }

  if (parsed.verb === 'channel-create') {
    const [name, desc] = parsed.positionals;
    const res = commitBoardMutation((state) => {
      const r = createChannel(state, name || '', desc || '', asActor || state.currentUser);
      return { result: r, event: r.event };
    });
    if (!res.ok) return respond(false, res.error, `Error: ${res.error?.reason}`);
    return respond(true, res.data, `Created #${res.data!.channel.name} (thread ${res.data!.thread.id})`);
  }

  if (parsed.verb === 'actors') {
    const state = getBoardState();
    const lines = state.actors
      .map(
        (a) =>
          `${a.name}${a.via ? ` via ${a.via}` : ''} [${a.kind}] (${a.status}) — ${a.statusMessage}`
      )
      .join('\n');
    return respond(true, { actors: state.actors }, lines);
  }

  if (parsed.verb === 'join' || parsed.verb === 'register') {
    const name = asActor || parsed.positionals[0] || 'claude-code';
    const statusText = parsed.positionals.slice(asActor ? 0 : 1).join(' ');
    const actor = commitBoardMutation((state) => {
      const r = ensureActor(state, {
        name,
        kind: 'agent',
        status: 'listening',
        statusMessage: statusText || `Connected via local vb CLI.`,
      });
      return { result: r.actor, event: r.event };
    });
    return respond(true, { actor }, `Registered ${actor.name} via ${actor.via} (${actor.status})`);
  }

  if (parsed.verb === 'read') {
    const state = getBoardState();
    const target = parsed.positionals[0];
    const limit = Number(parsed.flags.limit) || 20;
    let msgs = state.messages;
    if (target) {
      const isThread = state.threads.some((t) => t.id === target);
      msgs = isThread
        ? msgs.filter((m) => m.threadId === target)
        : msgs.filter((m) => m.channelId === sanitizeChannelName(target));
    }
    const sliced = msgs.slice(-limit);
    const lines = sliced
      .map(
        (m) =>
          `[${m.id} #${m.channelId}:${m.threadId}] ${m.actorName}${m.via ? ` via ${m.via}` : ''}: ${m.body}`
      )
      .join('\n');
    return respond(true, { messages: sliced }, lines || '(no messages)');
  }

  if (parsed.verb === 'post') {
    const [channelId, ...rest] = parsed.positionals;
    const bodyText = rest.join(' ');
    const attachName = typeof parsed.flags.attach === 'string' ? parsed.flags.attach : undefined;
    const attachments = attachName
      ? [
          {
            id: `att_${Date.now()}`,
            name: attachName.split('/').pop() || attachName,
            sizeLabel: '14 KB',
            contentType: 'text/plain',
            previewText: `Attached via CLI: ${attachName}`,
          },
        ]
      : [];

    const res = commitBoardMutation((state) => {
      const r = postMessage(state, {
        channelId: channelId || 'agent-bridge',
        body: bodyText,
        asActor,
        attachments,
      });
      return { result: r, event: r.event };
    });
    if (!res.ok) return respond(false, res.error, `Error: ${res.error?.reason}`);
    return respond(
      true,
      res.data,
      `Posted ${res.data!.message.id} to #${res.data!.thread.channelId} (thread ${res.data!.thread.id})`
    );
  }

  if (parsed.verb === 'reply') {
    const [threadId, ...rest] = parsed.positionals;
    const bodyText = rest.join(' ');
    const res = commitBoardMutation((state) => {
      const r = postMessage(state, {
        threadId,
        body: bodyText,
        asActor,
      });
      return { result: r, event: r.event };
    });
    if (!res.ok) return respond(false, res.error, `Error: ${res.error?.reason}`);
    return respond(
      true,
      res.data,
      `Replied ${res.data!.message.id} in thread ${res.data!.thread.id}`
    );
  }

  if (parsed.verb === 'react') {
    const [messageId, emoji] = parsed.positionals;
    const res = commitBoardMutation((state) => {
      const r = toggleReaction(state, messageId || '', emoji || '👍', asActor || state.currentUser);
      return { result: r, event: r.event };
    });
    if (!res.ok) return respond(false, res.error, `Error: ${res.error?.reason}`);
    return respond(true, res.data, `Updated reactions on ${messageId}`);
  }

  if (parsed.verb === 'label') {
    const [threadId, labelValue] = parsed.positionals;
    const res = commitBoardMutation((state) => {
      const r = updateThreadLabels(state, threadId || '', { add: labelValue }, asActor || state.currentUser);
      return { result: r, event: r.event };
    });
    if (!res.ok) return respond(false, res.error, `Error: ${res.error?.reason}`);
    return respond(true, res.data, `Thread ${threadId} labels: ${res.data!.labels.join(', ')}`);
  }

  if (parsed.verb === 'tasks') {
    if (!parsed.subverb) {
      const state = getBoardState();
      const channel = parsed.positionals[0];
      const filterState = (
        typeof parsed.flags.state === 'string' ? parsed.flags.state : 'all'
      ) as TaskState | 'all';
      const list = filterTasks(state.tasks, { channelId: channel, state: filterState });
      const lines = list
        .map(
          (t) =>
            `#${t.id} [${t.state}] (#${t.channelId}) ${t.title}${t.claimedBy ? ` — claimed by ${t.claimedBy}` : ''}`
        )
        .join('\n');
      return respond(true, { tasks: list }, lines || '(no matching tasks)');
    }

    if (parsed.subverb === 'create') {
      const [channelId, ...titleParts] = parsed.positionals;
      const res = commitBoardMutation((state) => {
        const r = createTask(state, {
          channelId: channelId || 'agent-bridge',
          title: titleParts.join(' '),
          createdBy: asActor,
          leaseMinutes: Number(parsed.flags.lease) || 5,
        });
        return { result: r, event: r.event };
      });
      if (!res.ok) return respond(false, res.error, `Error: ${res.error?.reason}`);
      return respond(true, res.data, `Created task #${res.data!.id} in #${res.data!.channelId}`);
    }

    if (parsed.subverb === 'claim' && parsed.flags.ready) {
      const channelId = parsed.positionals[0] || 'agent-bridge';
      const res = commitBoardMutation((state) => {
        const r = claimNextReadyTask(state, channelId, {
          asActor,
          leaseMinutes: Number(parsed.flags.lease) || 5,
        });
        return { result: r, event: r.event };
      });
      if (!res.ok) return respond(false, res.error, `Error (${res.error?.code}): ${res.error?.reason}`);
      return respond(true, res.data, `Claimed task #${res.data!.id} as ${res.data!.claimedBy}`);
    }

    const [taskId, ...noteParts] = parsed.positionals;
    const action = parsed.subverb as TaskActionType;
    const res = commitBoardMutation((state) => {
      const r = performTaskAction(state, taskId || '', action, {
        asActor,
        note: noteParts.join(' '),
        leaseMinutes: Number(parsed.flags.lease) || 5,
      });
      return { result: r, event: r.event };
    });
    if (!res.ok) return respond(false, res.error, `Error (${res.error?.code}): ${res.error?.reason}`);
    return respond(true, res.data, `Task #${res.data!.id} -> ${res.data!.state}`);
  }

  return respond(
    false,
    { error: 'unknown_command', verb: parsed.verb },
    `Unknown command "${parsed.verb}". Run "vb help" for available commands.`
  );
}

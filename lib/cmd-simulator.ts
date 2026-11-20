import type { Actor, BoardState } from './board-types';
import { resolveThemeAlias, type DesktopThemeId } from './desktop-themes';

export interface PromptOutputLine {
  text: string;
  tone: 'default' | 'ok' | 'warn' | 'error' | 'info' | 'dim';
}

export type PromptCommandResult =
  | { kind: 'output'; lines: PromptOutputLine[] }
  | { kind: 'clear' }
  | { kind: 'forward_vb_cli'; command: string }
  | { kind: 'forward_lvb_cli'; command: string }
  | { kind: 'enter_lvb_attach'; channel?: string; asActor?: string }
  | { kind: 'run_swarm_demo'; lines: PromptOutputLine[] }
  | { kind: 'set_theme'; themeId: DesktopThemeId; lines: PromptOutputLine[] };

function deterministicLatency(seed: string, seq: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 997;
  }
  return 4 + ((hash + seq * 7) % 19);
}

function getAgentIp(index: number): string {
  return `127.0.0.${10 + index}`;
}

function buildPingOutput(target: string | undefined, state: BoardState): PromptOutputLine[] {
  const agents = state.actors.filter((a) => a.kind === 'agent');
  if (!target || target.toLowerCase() === 'all') {
    const lines: PromptOutputLine[] = [
      {
        text: `Pinging local Vercel Board mesh (${agents.length} connected CLI agents) on 127.0.0.1:3000...`,
        tone: 'info',
      },
    ];
    agents.forEach((agent, idx) => {
      const ms = deterministicLatency(agent.name, 1);
      const stateLabel =
        agent.status === 'busy'
          ? 'BUSY (lease active)'
          : agent.status === 'listening'
            ? 'LISTENING (wait)'
            : 'ONLINE';
      lines.push({
        text: `  Reply from ${getAgentIp(idx)} [${agent.name} via ${agent.via || state.currentUser}]: bytes=32 time=${ms}ms TTL=64  [${stateLabel}]`,
        tone: 'ok',
      });
    });
    lines.push({
      text: `Mesh check complete: ${agents.length}/${agents.length} CLI agents reachable (0% loss).`,
      tone: 'dim',
    });
    return lines;
  }

  const cleanTarget = target.replace(/^@/, '').toLowerCase();
  const matchIdx = state.actors.findIndex((a) => a.name.toLowerCase() === cleanTarget);
  if (matchIdx === -1) {
    return [
      {
        text: `Ping request could not find agent "${target}".`,
        tone: 'error',
      },
      {
        text: `Connected CLI agents: ${agents.map((a) => a.name).join(', ')}`,
        tone: 'dim',
      },
    ];
  }

  const actor = state.actors[matchIdx];
  const ip = getAgentIp(matchIdx);
  const times = [1, 2, 3, 4].map((seq) => deterministicLatency(actor.name, seq));
  const minMs = Math.min(...times);
  const maxMs = Math.max(...times);
  const avgMs = Math.round(times.reduce((a, b) => a + b, 0) / times.length);

  return [
    {
      text: `Pinging ${actor.name} (${actor.cliFlavor || actor.kind}) [${ip}] with 32 bytes of data:`,
      tone: 'info',
    },
    ...times.map((ms) => ({
      text: `Reply from ${ip}: bytes=32 time=${ms}ms TTL=64 status=${actor.status}`,
      tone: 'ok' as const,
    })),
    { text: '', tone: 'default' },
    { text: `Ping statistics for ${actor.name} (${ip}):`, tone: 'default' },
    { text: '    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),', tone: 'dim' },
    {
      text: `    Approximate round trip times: Minimum = ${minMs}ms, Maximum = ${maxMs}ms, Average = ${avgMs}ms`,
      tone: 'dim',
    },
  ];
}

function buildStatusOutput(state: BoardState, activeChannel: string): PromptOutputLine[] {
  const agents = state.actors.filter((a) => a.kind === 'agent');
  const humans = state.actors.filter((a) => a.kind === 'person');
  const openTasks = state.tasks.filter((t) => t.state === 'ready' || t.state === 'claimed');

  const lines: PromptOutputLine[] = [
    {
      text: `VERCEL BOARD LOCAL DAEMON STATUS — board="${state.boardName}"`,
      tone: 'info',
    },
    {
      text: `  Endpoint : http://localhost:3000/api/board  |  SSE Bridge : LIVE`,
      tone: 'ok',
    },
    {
      text: `  Channels : ${state.channels.length} (#${activeChannel} active)  |  Threads : ${state.threads.length}  |  Open Tasks : ${openTasks.length}`,
      tone: 'default',
    },
    {
      text: `  Humans   : ${humans.map((h) => h.name).join(', ')}`,
      tone: 'dim',
    },
    { text: '', tone: 'default' },
    {
      text: '  AGENT          CLI FLAVOR          STATUS      VIA      CURRENT TASK',
      tone: 'info',
    },
    {
      text: '  ------------------------------------------------------------------------',
      tone: 'dim',
    },
  ];

  for (const agent of agents) {
    const claimed = state.tasks.find(
      (t) => t.claimedBy === agent.name && t.state === 'claimed'
    );
    const nameCol = agent.name.padEnd(14, ' ').slice(0, 14);
    const flavorCol = (agent.cliFlavor || 'local-vb').padEnd(19, ' ').slice(0, 19);
    const statusCol = agent.status.toUpperCase().padEnd(11, ' ').slice(0, 11);
    const viaCol = (agent.via || state.currentUser).padEnd(8, ' ').slice(0, 8);
    const taskCol = claimed ? `#${claimed.id} (${claimed.title.slice(0, 22)})` : 'idle / waiting';

    lines.push({
      text: `  ${nameCol} ${flavorCol} ${statusCol} ${viaCol} ${taskCol}`,
      tone: agent.status === 'busy' ? 'warn' : 'ok',
    });
  }

  return lines;
}

export function executePromptCommand(
  rawInput: string,
  state: BoardState,
  activeChannel: string
): PromptCommandResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { kind: 'output', lines: [] };
  }

  const lower = trimmed.toLowerCase();

  // Real `lvb` / `local-vercel-board` CLI & interactive TUI
  if (
    lower === 'lvb' ||
    lower.startsWith('lvb ') ||
    lower === 'local-vercel-board' ||
    lower.startsWith('local-vercel-board ') ||
    lower.startsWith('npx local-vercel-board')
  ) {
    const tokens = trimmed.split(/\s+/);
    const subIdx = tokens[0].toLowerCase() === 'npx' ? 2 : 1;
    const sub = (tokens[subIdx] || '').toLowerCase();
    if (sub === 'attach' || sub === 'tui' || sub === 'interactive') {
      const asIdx = tokens.findIndex((t) => t === '--as');
      const chIdx = tokens.findIndex((t) => t === '--channel');
      return {
        kind: 'enter_lvb_attach',
        asActor: asIdx >= 0 ? tokens[asIdx + 1] : undefined,
        channel: chIdx >= 0 ? tokens[chIdx + 1] : undefined,
      };
    }
    return { kind: 'forward_lvb_cli', command: trimmed };
  }

  // Forward real `vb` or `vercel board` commands to /api/board/cli
  if (
    lower === 'vb' ||
    lower.startsWith('vb ') ||
    lower.startsWith('vercel board')
  ) {
    return { kind: 'forward_vb_cli', command: trimmed };
  }

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const arg1 = parts[1];

  if (cmd === 'cls' || cmd === 'clear') {
    return { kind: 'clear' };
  }

  if (cmd === 'help' || cmd === '?') {
    return {
      kind: 'output',
      lines: [
        { text: 'Local Vercel Board Command Prompt — Available Commands:', tone: 'info' },
        { text: '  lvb attach            Launch interactive @poppinss/cliui TUI session right here!', tone: 'ok' },
        { text: '  lvb status | help     Run the real `lvb` CLI binary with @poppinss/cliui tables', tone: 'ok' },
        { text: '  lvb conformance       Run 7 live Vercel Board SPEC.md conformance checks', tone: 'ok' },
        { text: '  lvb setup | ping      Run real `lvb setup` or ping agents via `lvb ping`', tone: 'info' },
        { text: '  lvb post <ch> "<msg>" Post live to a channel (e.g. lvb post agent-bridge "hi" --as grok)', tone: 'info' },
        { text: '  ping [agent|all]      Ping connected CLI agents (e.g. ping claude-code)', tone: 'default' },
        { text: '  status | tasks        Inspect board bridge health & 5-minute lease queue', tone: 'default' },
        { text: '  demo swarm            Run interactive 3-agent Vercel Board swarm demo', tone: 'default' },
        { text: '  theme <name>          Switch scheme: teal | blue | desert | dark-slate', tone: 'default' },
        { text: '  cls / clear           Clear terminal screen', tone: 'dim' },
      ],
    };
  }

  if (cmd === 'ping') {
    return { kind: 'output', lines: buildPingOutput(arg1, state) };
  }

  if (cmd === 'status' || cmd === 'netstat') {
    return { kind: 'output', lines: buildStatusOutput(state, activeChannel) };
  }

  if (cmd === 'agents' || cmd === 'actors') {
    const agents: Actor[] = state.actors.filter((a) => a.kind === 'agent');
    return {
      kind: 'output',
      lines: [
        { text: `Connected CLI Agents (${agents.length}):`, tone: 'info' },
        ...agents.map((a) => ({
          text: `  @${a.name} (${a.cliFlavor || 'local-vb'}) — ${a.status} — "${a.statusMessage}"`,
          tone: 'ok' as const,
        })),
      ],
    };
  }

  if (cmd === 'channels') {
    return {
      kind: 'output',
      lines: [
        { text: `Board Channels (${state.channels.length}):`, tone: 'info' },
        ...state.channels.map((ch) => {
          const tCount = state.threads.filter((t) => t.channelId === ch.id).length;
          return {
            text: `  #${ch.id.padEnd(16, ' ')} ${tCount} thread(s) — ${ch.description}`,
            tone: 'default' as const,
          };
        }),
      ],
    };
  }

  if (cmd === 'tasks') {
    return {
      kind: 'output',
      lines: [
        { text: `Board Task Queue (${state.tasks.length}):`, tone: 'info' },
        ...state.tasks.map((t) => ({
          text: `  #${t.id} [${t.state.toUpperCase()}] #${t.channelId} — ${t.title}${t.claimedBy ? ` (by ${t.claimedBy})` : ''}`,
          tone:
            t.state === 'completed'
              ? ('ok' as const)
              : t.state === 'claimed'
                ? ('warn' as const)
                : ('default' as const),
        })),
      ],
    };
  }

  if (cmd === 'demo' || cmd === 'swarm') {
    return {
      kind: 'run_swarm_demo',
      lines: [
        {
          text: `Launching interactive 3-agent Vercel Board swarm in #${activeChannel}...`,
          tone: 'info',
        },
        {
          text: '  1) coordinator -> tasks create (ready queue)',
          tone: 'dim',
        },
        {
          text: '  2) claude-code -> tasks claim (5m lease) + patch reply',
          tone: 'dim',
        },
        {
          text: '  3) grok        -> fuzz edge cases + review reply',
          tone: 'dim',
        },
        {
          text: '  4) antigravity -> browser verify + tasks complete',
          tone: 'dim',
        },
      ],
    };
  }

  if (cmd === 'theme') {
    if (!arg1) {
      return {
        kind: 'output',
        lines: [
          {
            text: 'Usage: theme <teal | blue | desert | dark-slate>',
            tone: 'info',
          },
        ],
      };
    }
    const resolved = resolveThemeAlias(parts.slice(1).join(' '));
    if (!resolved) {
      return {
        kind: 'output',
        lines: [
          {
            text: `Unknown theme "${parts.slice(1).join(' ')}". Try: teal, blue, desert, dark-slate`,
            tone: 'error',
          },
        ],
      };
    }
    return {
      kind: 'set_theme',
      themeId: resolved,
      lines: [
        {
          text: `Applied retro desktop color scheme: ${resolved}`,
          tone: 'ok',
        },
      ],
    };
  }

  return {
    kind: 'output',
    lines: [
      {
        text: `'${cmd}' is not recognized as an internal or external command.`,
        tone: 'error',
      },
      {
        text: 'Type "help", "ping claude-code", "status", "demo swarm", or "vb whoami --as grok".',
        tone: 'dim',
      },
    ],
  };
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Play, Radio, Terminal, TerminalSquare, Trash2 } from 'lucide-react';
import type { BoardState } from '@/lib/board-types';
import {
  executePromptCommand,
  type PromptOutputLine,
} from '@/lib/cmd-simulator';
import type { DesktopThemeId } from '@/lib/desktop-themes';
import type { AnsiSpan } from '@/lib/lb-runner';

interface CommandPromptWindowProps {
  state: BoardState;
  activeChannel: string;
  onRunVbCommand: (command: string) => Promise<{ ok: boolean; output: string }>;
  onRunSwarmDemo: () => Promise<void>;
  onSelectTheme: (themeId: DesktopThemeId) => void;
}

interface TerminalEntry {
  id: string;
  promptPrefix?: string;
  command?: string;
  lines?: PromptOutputLine[];
  ansiLines?: AnsiSpan[][];
}

const INITIAL_BANNER: TerminalEntry[] = [
  {
    id: 'banner',
    lines: [
      {
        text: 'Local Multi-Agent Board (`lb`) Command Prompt & Interactive @poppinss/cliui TUI',
        tone: 'info',
      },
      {
        text: 'MIT open-source · Board v1 Specification `lb` CLI runner · by Iván Olivares (iolivares.com)',
        tone: 'dim',
      },
      {
        text: 'Try: lb attach (TUI) | lb status | lb conformance | lb help | ping all | demo swarm',
        tone: 'ok',
      },
    ],
  },
];

function ansiSpanClass(span: AnsiSpan): string {
  const parts: string[] = [];
  if (span.bold) parts.push('font-bold');
  if (span.dim) parts.push('opacity-75');
  switch (span.color) {
    case 'cyan':
      parts.push('text-[#38bdf8]');
      break;
    case 'green':
      parts.push('text-[#4ade80]');
      break;
    case 'yellow':
      parts.push('text-[#facc15]');
      break;
    case 'red':
      parts.push('text-[#f87171]');
      break;
    case 'blue':
      parts.push('text-[#60a5fa]');
      break;
    case 'magenta':
      parts.push('text-[#e879f9]');
      break;
    case 'gray':
      parts.push('text-[#94a3b8]');
      break;
    default:
      parts.push('text-[#e2e8f0]');
      break;
  }
  return parts.join(' ');
}

export function CommandPromptWindow({
  state,
  activeChannel,
  onRunVbCommand,
  onRunSwarmDemo,
  onSelectTheme,
}: CommandPromptWindowProps) {
  const [entries, setEntries] = useState<TerminalEntry[]>(INITIAL_BANNER);
  const [input, setInput] = useState<string>('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [running, setRunning] = useState<boolean>(false);

  // Interactive `lb attach` TUI session state
  const [tuiAttached, setTuiAttached] = useState<boolean>(false);
  const [tuiChannel, setTuiChannel] = useState<string>(activeChannel || 'agent-bridge');
  const [tuiActor, setTuiActor] = useState<string>(state.currentUser || 'ctate');

  const outputEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ block: 'end' });
  }, [entries.length]);

  const callRealLb = async (
    lbCommand: string,
    displayCommand?: string,
    promptPrefix?: string
  ) => {
    setRunning(true);
    try {
      const res = await fetch('/api/board/lb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: lbCommand }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        raw?: string;
        lines?: AnsiSpan[][];
      };
      setEntries((prev) => [
        ...prev,
        {
          id: `lb-${Date.now()}-${Math.random()}`,
          promptPrefix: promptPrefix ?? 'C:\\LOCAL-BOARD>',
          command: displayCommand,
          ansiLines: json.lines || [[{ text: json.raw || 'Command completed.' }]],
        },
      ]);
      return Boolean(json.ok);
    } catch (err) {
      setEntries((prev) => [
        ...prev,
        {
          id: `lb-err-${Date.now()}`,
          promptPrefix: promptPrefix ?? 'C:\\LOCAL-BOARD>',
          command: displayCommand,
          lines: [
            {
              text: err instanceof Error ? err.message : 'Failed to execute lb command.',
              tone: 'error',
            },
          ],
        },
      ]);
      return false;
    } finally {
      setRunning(false);
    }
  };

  const enterTuiAttach = async (channelOverride?: string, actorOverride?: string) => {
    const ch = (channelOverride || activeChannel || 'agent-bridge').replace(/^#/, '');
    const actor = actorOverride || state.currentUser || 'ctate';
    setTuiChannel(ch);
    setTuiActor(actor);
    setTuiAttached(true);

    await callRealLb(`lb status --channel ${ch}`, `lb attach --channel ${ch} --as ${actor}`);

    const boxWidth = 74;
    const padBox = (txt: string) =>
      `│ ${txt.length > boxWidth ? txt.slice(0, boxWidth) : txt.padEnd(boxWidth, ' ')} │`;

    setEntries((prev) => [
      ...prev,
      {
        id: `tui-help-${Date.now()}`,
        lines: [
          {
            text: `╭${'─'.repeat(boxWidth + 2)}╮`,
            tone: 'info',
          },
          {
            text: padBox('Attached Interactive CLI (`lb attach` TUI — @poppinss/cliui)'),
            tone: 'info',
          },
          {
            text: padBox(`› Type any message to post live to #${ch} as ${actor} (x-board-profile)`),
            tone: 'ok',
          },
          {
            text: padBox('› /status · /ping [agent] · /channels · /tasks · /read · /conformance'),
            tone: 'warn',
          },
          {
            text: padBox('› /as <agent> · /channel <name> · /claim · /setup · /quit'),
            tone: 'warn',
          },
          {
            text: `╰${'─'.repeat(boxWidth + 2)}╯`,
            tone: 'info',
          },
        ],
      },
    ]);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleTuiInput = async (raw: string) => {
    const line = raw.trim();
    if (!line || running) return;

    const currentPrompt = `lb (#${tuiChannel} as ${tuiActor})>`;
    setHistory((prev) => [line, ...prev.slice(0, 29)]);
    setHistoryIdx(-1);
    setInput('');

    if (line === '/quit' || line === '/exit') {
      setTuiAttached(false);
      setEntries((prev) => [
        ...prev,
        {
          id: `tui-quit-${Date.now()}`,
          promptPrefix: currentPrompt,
          command: line,
          lines: [{ text: '[ info ] Detached from Local Multi-Agent Board TUI.', tone: 'info' }],
        },
      ]);
      return;
    }

    if (line === '/help') {
      setEntries((prev) => [
        ...prev,
        {
          id: `tui-h-${Date.now()}`,
          promptPrefix: currentPrompt,
          command: line,
          lines: [
            { text: 'lb attach TUI Commands:', tone: 'info' },
            { text: '  /status             Live @poppinss/cliui sticker + agent table', tone: 'default' },
            { text: '  /ping [agent]       Ping connected CLI agents via real `lb ping`', tone: 'default' },
            { text: '  /channels           List board channels & counts', tone: 'default' },
            { text: '  /tasks              List 5-minute leased task queue', tone: 'default' },
            { text: '  /read [limit]       Read recent messages in active channel', tone: 'default' },
            { text: '  /conformance        Run 7-check Board v1 Specification conformance suite', tone: 'ok' },
            { text: '  /claim              Claim next ready task as active persona', tone: 'default' },
            { text: '  /as <agent>         Switch active persona (e.g. /as grok)', tone: 'warn' },
            { text: '  /channel <name>     Switch active channel', tone: 'warn' },
            { text: '  /setup              Run real `lb setup` wizard output', tone: 'default' },
            { text: '  /quit               Detach back to C:\\LOCAL-BOARD>', tone: 'dim' },
            { text: '  <any plain text>    Post directly to #' + tuiChannel + ' as ' + tuiActor, tone: 'ok' },
          ],
        },
      ]);
      return;
    }

    if (line.startsWith('/as ')) {
      const nextActor = line.slice(4).trim().replace(/^@/, '') || tuiActor;
      setTuiActor(nextActor);
      setEntries((prev) => [
        ...prev,
        {
          id: `tui-as-${Date.now()}`,
          promptPrefix: currentPrompt,
          command: line,
          lines: [{ text: `[ success ] Now writing as ${nextActor} (x-board-profile: ${nextActor})`, tone: 'ok' }],
        },
      ]);
      return;
    }

    if (line.startsWith('/channel ')) {
      const nextCh = line.slice(9).trim().replace(/^#/, '') || tuiChannel;
      setTuiChannel(nextCh);
      setEntries((prev) => [
        ...prev,
        {
          id: `tui-ch-${Date.now()}`,
          promptPrefix: currentPrompt,
          command: line,
          lines: [{ text: `[ success ] Switched active channel to #${nextCh}`, tone: 'ok' }],
        },
      ]);
      return;
    }

    if (line === '/status') {
      await callRealLb(`lb status --channel ${tuiChannel}`, line, currentPrompt);
      return;
    }

    if (line.startsWith('/ping')) {
      const target = line.slice(5).trim();
      await callRealLb(target ? `lb ping ${target}` : 'lb ping', line, currentPrompt);
      return;
    }

    if (line === '/channels') {
      await callRealLb('lb channels', line, currentPrompt);
      return;
    }

    if (line === '/tasks') {
      await callRealLb('lb tasks', line, currentPrompt);
      return;
    }

    if (line === '/conformance') {
      await callRealLb('lb conformance', line, currentPrompt);
      return;
    }

    if (line === '/setup') {
      await callRealLb(`lb setup --channel ${tuiChannel}`, line, currentPrompt);
      return;
    }

    if (line.startsWith('/read')) {
      const limit = Number(line.slice(5).trim()) || 10;
      await callRealLb(`lb read ${tuiChannel} --limit ${limit}`, line, currentPrompt);
      return;
    }

    if (line === '/claim') {
      setRunning(true);
      try {
        const res = await onRunVbCommand(
          `vb tasks claim --ready ${tuiChannel} --as ${tuiActor}`
        );
        setEntries((prev) => [
          ...prev,
          {
            id: `tui-claim-${Date.now()}`,
            promptPrefix: currentPrompt,
            command: line,
            lines: [
              {
                text: res.ok ? `[ success ] ${res.output}` : `[ warn ] ${res.output}`,
                tone: res.ok ? 'ok' : 'warn',
              },
            ],
          },
        ]);
      } finally {
        setRunning(false);
      }
      return;
    }

    // Plain message -> post live via real `lb post` so it appears in #agent-bridge immediately!
    const escaped = line.replace(/"/g, '\\"');
    await callRealLb(
      `lb post ${tuiChannel} "${escaped}" --as ${tuiActor}`,
      line,
      currentPrompt
    );
  };

  const runCommand = async (raw: string) => {
    if (tuiAttached) {
      await handleTuiInput(raw);
      return;
    }

    const cmd = raw.trim();
    if (!cmd || running) return;

    setHistory((prev) => [cmd, ...prev.slice(0, 29)]);
    setHistoryIdx(-1);
    setInput('');

    const result = executePromptCommand(cmd, state, activeChannel);

    if (result.kind === 'clear') {
      setEntries([]);
      return;
    }

    if (result.kind === 'enter_lb_attach') {
      await enterTuiAttach(result.channel, result.asActor);
      return;
    }

    if (result.kind === 'forward_lb_cli') {
      await callRealLb(result.command, cmd);
      return;
    }

    if (result.kind === 'output') {
      setEntries((prev) => [
        ...prev,
        { id: `e-${Date.now()}-${Math.random()}`, command: cmd, lines: result.lines },
      ]);
      return;
    }

    if (result.kind === 'set_theme') {
      onSelectTheme(result.themeId);
      setEntries((prev) => [
        ...prev,
        { id: `e-${Date.now()}-${Math.random()}`, command: cmd, lines: result.lines },
      ]);
      return;
    }

    if (result.kind === 'run_swarm_demo') {
      setEntries((prev) => [
        ...prev,
        { id: `e-${Date.now()}-${Math.random()}`, command: cmd, lines: result.lines },
      ]);
      setRunning(true);
      try {
        await onRunSwarmDemo();
        setEntries((prev) => [
          ...prev,
          {
            id: `e-done-${Date.now()}`,
            lines: [
              {
                text: `Swarm demo completed! Inspect #${activeChannel} chat & Tasks tab for live updates.`,
                tone: 'ok',
              },
            ],
          },
        ]);
      } finally {
        setRunning(false);
      }
      return;
    }

    if (result.kind === 'forward_vb_cli') {
      setRunning(true);
      try {
        const res = await onRunVbCommand(result.command);
        const rawLines = (res.output || '').split('\n');
        setEntries((prev) => [
          ...prev,
          {
            id: `e-vb-${Date.now()}`,
            command: cmd,
            lines: rawLines.map((line) => ({
              text: line,
              tone: res.ok ? 'ok' : 'error',
            })),
          },
        ]);
      } finally {
        setRunning(false);
      }
    }
  };

  const toneClass = (tone: PromptOutputLine['tone']) => {
    switch (tone) {
      case 'ok':
        return 'text-[#4ade80]';
      case 'warn':
        return 'text-[#facc15]';
      case 'error':
        return 'text-[#f87171]';
      case 'info':
        return 'text-[#7dd3fc]';
      case 'dim':
        return 'text-[#94a3b8]';
      default:
        return 'text-[#e2e8f0]';
    }
  };

  const connectedAgents = state.actors.filter((a) => a.kind === 'agent').length;
  const activePromptLabel = tuiAttached
    ? `lb (#${tuiChannel} as ${tuiActor})>`
    : 'C:\\LOCAL-BOARD>';

  return (
    <div className="flex flex-1 flex-col min-h-0 win98-surface">
      {/* Quick Real `lb` CLI & TUI Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 px-2 py-1 border-b border-[#808080] text-[11px] shrink-0">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            disabled={running}
            onClick={() =>
              tuiAttached ? void handleTuiInput('/quit') : void enterTuiAttach()
            }
            className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold ${
              tuiAttached ? 'win98-button-pressed' : 'win98-button-primary'
            }`}
          >
            <TerminalSquare size={11} />
            <span>{tuiAttached ? 'Detach TUI (/quit)' : 'lb attach (TUI)'}</span>
          </button>
          <button
            type="button"
            disabled={running}
            onClick={() =>
              tuiAttached
                ? void handleTuiInput('/status')
                : void runCommand('lb status')
            }
            className="win98-button px-2 py-0.5 text-[11px] font-medium"
          >
            lb status
          </button>
          <button
            type="button"
            disabled={running}
            onClick={() =>
              tuiAttached
                ? void handleTuiInput('/conformance')
                : void runCommand('lb conformance')
            }
            className="win98-button inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium"
          >
            <CheckCircle2 size={11} className="text-[#15803d]" />
            <span>lb conformance</span>
          </button>
          <button
            type="button"
            disabled={running}
            onClick={() =>
              tuiAttached
                ? void handleTuiInput('/ping')
                : void runCommand('lb ping')
            }
            className="win98-button px-2 py-0.5 text-[11px] font-medium"
          >
            lb ping
          </button>
          <button
            type="button"
            disabled={running}
            onClick={() => void runCommand(tuiAttached ? '/setup' : 'lb help')}
            className="win98-button px-2 py-0.5 text-[11px] font-medium"
          >
            {tuiAttached ? '/setup' : 'lb help'}
          </button>
          {!tuiAttached && (
            <button
              type="button"
              disabled={running}
              onClick={() => void runCommand('demo swarm')}
              className="win98-button inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold"
            >
              <Play size={10} fill="currentColor" />
              <span>demo swarm</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setEntries([])}
          className="win98-button inline-flex items-center gap-1 px-2 py-0.5 text-[11px]"
          title="Clear Command Prompt screen"
        >
          <Trash2 size={11} />
          <span>Clear</span>
        </button>
      </div>

      {/* Retro Black Terminal Output Surface (Renders real @poppinss/cliui ANSI & Unicode boxes) */}
      <div
        data-testid="cmd-prompt-output"
        onClick={() => inputRef.current?.focus()}
        className="flex-1 min-h-0 m-1.5 mb-1 win98-sunken-dark overflow-auto win98-scroll p-2.5 font-code text-[11.5px] leading-[1.42] select-text cursor-text"
      >
        {entries.length === 0 ? (
          <div className="text-[#94a3b8]">
            Screen cleared. Try <span className="text-[#4ade80]">lb attach</span>,{' '}
            <span className="text-[#7dd3fc]">lb status</span>, or{' '}
            <span className="text-[#4ade80]">lb conformance</span>.
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="mb-2.5 last:mb-0">
              {entry.command && (
                <div className="text-[#f8fafc] font-bold mb-0.5">
                  <span className="text-[#94a3b8]">
                    {entry.promptPrefix || 'C:\\LOCAL-BOARD>'}
                  </span>{' '}
                  {entry.command}
                </div>
              )}
              {entry.ansiLines &&
                entry.ansiLines.map((lineSpans, lineIdx) => (
                  <div
                    key={lineIdx}
                    className="whitespace-pre font-code"
                  >
                    {lineSpans.map((span, spanIdx) => (
                      <span key={spanIdx} className={ansiSpanClass(span)}>
                        {span.text || '\u00A0'}
                      </span>
                    ))}
                  </div>
                ))}
              {entry.lines &&
                entry.lines.map((line, idx) => (
                  <div
                    key={idx}
                    className={`whitespace-pre-wrap break-words ${toneClass(line.tone)}`}
                  >
                    {line.text || '\u00A0'}
                  </div>
                ))}
            </div>
          ))
        )}
        <div ref={outputEndRef} />
      </div>

      {/* Interactive Prompt Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runCommand(input);
        }}
        className="flex items-center gap-1.5 px-1.5 pb-1.5 shrink-0"
      >
        <div className="flex flex-1 items-center gap-1.5 win98-sunken-dark px-2 py-1 font-code text-[12px]">
          <span
            className={`font-bold shrink-0 ${
              tuiAttached ? 'text-[#38bdf8]' : 'text-[#4ade80]'
            }`}
          >
            {activePromptLabel}
          </span>
          <input
            ref={inputRef}
            type="text"
            aria-label="Command Prompt input"
            value={input}
            disabled={running}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' && history.length > 0) {
                e.preventDefault();
                const next = Math.min(history.length - 1, historyIdx + 1);
                setHistoryIdx(next);
                setInput(history[next] || '');
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                const next = historyIdx - 1;
                if (next < 0) {
                  setHistoryIdx(-1);
                  setInput('');
                } else {
                  setHistoryIdx(next);
                  setInput(history[next] || '');
                }
              }
            }}
            placeholder={
              tuiAttached
                ? 'Type message to post, or /status /ping /tasks /as grok /conformance /quit'
                : 'lb attach | lb status | lb conformance | lb post agent-bridge "hi" --as grok'
            }
            className="flex-1 bg-transparent text-[#f8fafc] placeholder:text-[#64748b] focus:outline-none min-w-0"
          />
        </div>
        <button
          type="submit"
          disabled={running}
          className="win98-button-primary px-3 py-1 text-[11px] font-bold shrink-0"
        >
          {running ? 'Running...' : tuiAttached ? 'Send' : 'Execute'}
        </button>
      </form>

      {/* Bottom Status Strip */}
      <div className="flex items-center justify-between gap-2 px-2 py-0.5 border-t border-[#808080] text-[10px] shrink-0">
        <span className="inline-flex items-center gap-1.5">
          <Terminal size={11} />
          <span>
            {tuiAttached
              ? `lb attach TUI (@poppinss/cliui) · x-board-profile: ${tuiActor}`
              : 'Real `lb` CLI Runner + MS-DOS Simulator'}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <Radio size={11} className="text-[#15803d]" />
          <span>
            {connectedAgents} agents reachable · #{tuiAttached ? tuiChannel : activeChannel}
          </span>
        </span>
      </div>
    </div>
  );
}

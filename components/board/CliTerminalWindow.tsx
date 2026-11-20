'use client';

import { useEffect, useRef, useState } from 'react';
import type { BoardEvent } from '@/lib/board-types';

interface CliLine {
  id: string;
  kind: 'event' | 'cmd' | 'out' | 'err';
  text: string;
}

interface CliTerminalWindowProps {
  events: BoardEvent[];
  activeChannel: string;
  onRunCommand: (command: string) => Promise<{ ok: boolean; output: string }>;
}

export function CliTerminalWindow({
  events,
  activeChannel,
  onRunCommand,
}: CliTerminalWindowProps) {
  const [cmd, setCmd] = useState('');
  const [running, setRunning] = useState(false);
  const [historyLines, setHistoryLines] = useState<CliLine[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [events.length, historyLines.length]);

  const execute = async (rawCommand: string) => {
    const trimmed = rawCommand.trim();
    if (!trimmed) return;
    setRunning(true);
    setHistoryLines((prev) => [
      ...prev.slice(-40),
      { id: `c_${Date.now()}`, kind: 'cmd', text: `$ ${trimmed}` },
    ]);
    try {
      const res = await onRunCommand(trimmed);
      setHistoryLines((prev) => [
        ...prev.slice(-40),
        {
          id: `o_${Date.now()}_${Math.random()}`,
          kind: res.ok ? 'out' : 'err',
          text: res.output,
        },
      ]);
    } finally {
      setRunning(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const toRun = cmd;
    setCmd('');
    await execute(toRun);
  };

  const presets = [
    {
      label: 'claude post',
      cmd: `vb post ${activeChannel} "Patch verified locally. @grok @antigravity ready for review." --as claude-code`,
    },
    {
      label: 'grok post',
      cmd: `vb post ${activeChannel} "Fuzzed edge cases in #${activeChannel}: zero regressions." --as grok`,
    },
    {
      label: 'antigravity claim',
      cmd: `vb tasks claim --ready ${activeChannel} --as antigravity --json`,
    },
    {
      label: 'whoami',
      cmd: `vb whoami --as claude-code --json`,
    },
  ];

  return (
    <div className="flex flex-1 flex-col min-h-0 bg-[#c0c0c0] p-1 gap-1">
      <div className="flex flex-wrap items-center justify-between gap-1 px-0.5 text-[11px]">
        <span className="text-[#222222] font-medium truncate">
          Local `vb` CLI &amp; Live SSE Tail (no Vercel login required)
        </span>
        <div className="flex items-center gap-1 flex-wrap">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              disabled={running}
              onClick={() => void execute(p.cmd)}
              className="win98-button px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div
        data-testid="vb-terminal-output"
        className="flex-1 min-h-0 win98-sunken-dark text-[#e2f7e2] font-code text-[11px] leading-snug p-2 overflow-y-auto win98-scroll select-text space-y-1"
      >
        {events.slice(-8).map((ev) => (
          <div key={ev.id} className="text-[#86efac] break-all">
            <span suppressHydrationWarning className="text-[#94a3b8] tabular-nums">
              [{new Date(ev.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}]
            </span>{' '}
            <span className="text-[#fde047] font-semibold">{ev.type}</span>{' '}
            <span className="text-[#f1f5f9]">{ev.summary}</span>
          </div>
        ))}
        {historyLines.map((line) => (
          <pre
            key={line.id}
            className={`whitespace-pre-wrap break-words font-code ${
              line.kind === 'cmd'
                ? 'text-[#ffffff] font-semibold'
                : line.kind === 'err'
                  ? 'text-[#fca5a5]'
                  : 'text-[#86efac]'
            }`}
          >
            {line.text}
          </pre>
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-1 shrink-0">
        <span className="font-code text-[11px] font-bold text-[#000000] px-1 shrink-0">
          vb&gt;
        </span>
        <input
          type="text"
          aria-label="Run local vb CLI command"
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          placeholder={`vb post ${activeChannel} "hello from grok" --as grok`}
          className="flex-1 min-w-0 win98-sunken bg-white px-2 py-1 font-code text-[11px] text-[#000000] focus:outline-none"
        />
        <button
          type="submit"
          disabled={running}
          className="win98-button-primary px-3 py-1 text-[11px] font-bold whitespace-nowrap shrink-0"
        >
          Run
        </button>
      </form>
    </div>
  );
}

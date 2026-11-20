'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, Download, Play, TerminalSquare } from 'lucide-react';
import { generateSetupScript } from '@/lib/board-logic';
import type { Channel } from '@/lib/board-types';

interface SetupScriptWindowProps {
  boardName: string;
  channels: Channel[];
  activeChannel: string;
  onRunHandshake: (channelId: string) => Promise<void>;
  onOpenCommandPrompt?: () => void;
}

export function SetupScriptWindow({
  boardName,
  channels,
  activeChannel,
  onRunHandshake,
  onOpenCommandPrompt,
}: SetupScriptWindowProps) {
  const [selectedChannel, setSelectedChannel] = useState(
    channels.some((c) => c.id === 'agent-bridge') ? 'agent-bridge' : activeChannel
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [runningHandshake, setRunningHandshake] = useState(false);
  const [handshakeDone, setHandshakeDone] = useState(false);

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:4100';

  const setupScript = useMemo(
    () =>
      generateSetupScript({
        boardUrl: origin,
        channel: selectedChannel,
        boardName,
      }),
    [origin, selectedChannel, boardName]
  );

  const lvbQuickCommands = useMemo(
    () => [
      {
        id: 'lvb-serve-attach',
        label: 'Start Local SPEC Server (:4100) + Interactive TUI (@poppinss/cliui)',
        command: `npx local-vercel-board serve --port 4100 --dir .board --attach`,
      },
      {
        id: 'lvb-attach',
        label: 'Attach Interactive TUI to This Running Board',
        command: `lvb attach --url ${origin} --channel ${selectedChannel} --as developer`,
      },
      {
        id: 'lvb-setup',
        label: 'Run Setup Wizard (Replaces setup-board.sh)',
        command: `lvb setup --channel ${selectedChannel} --url ${origin} --handshake`,
      },
      {
        id: 'lvb-conformance',
        label: 'Verify Vercel Board v1 SPEC.md Conformance (7 Live Checks)',
        command: `lvb conformance --url http://127.0.0.1:4100`,
      },
    ],
    [origin, selectedChannel]
  );

  const agentSnippets = useMemo(
    () => [
      {
        id: 'claude-code',
        label: 'Claude Code CLI',
        profile: 'claude-code',
        command: `BOARD_URL=${origin}/api/board claude "Join local board #${selectedChannel} using lvb --as claude-code (sends x-board-profile). Run lvb whoami, lvb read ${selectedChannel}, post status, then lvb wait ${selectedChannel} --json to collaborate with @grok and @antigravity."`,
      },
      {
        id: 'grok',
        label: 'Grok CLI',
        profile: 'grok',
        command: `BOARD_URL=${origin}/api/board grok "Use lvb --as grok on #${selectedChannel}. Read recent messages, review diffs from @claude-code, claim tasks via lvb tasks claim --ready ${selectedChannel} --json, and listen with lvb wait ${selectedChannel} --json."`,
      },
      {
        id: 'antigravity',
        label: 'Gemini Antigravity CLI',
        profile: 'antigravity',
        command: `BOARD_URL=${origin}/api/board antigravity "Connect to local board #${selectedChannel} using lvb --as antigravity. Read ${selectedChannel}, verify UI & tests once @claude-code and @grok post, and complete tasks with lvb tasks complete."`,
      },
    ],
    [origin, selectedChannel]
  );

  const copyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback if clipboard API restricted
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 1800);
  };

  const handleDownload = () => {
    const url = `/api/board/setup-script?channel=${encodeURIComponent(selectedChannel)}&url=${encodeURIComponent(origin)}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = 'setup-board.sh';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleHandshake = async () => {
    setRunningHandshake(true);
    setHandshakeDone(false);
    try {
      await onRunHandshake(selectedChannel);
      setHandshakeDone(true);
    } finally {
      setRunningHandshake(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col min-h-0 win98-surface p-2.5 gap-2.5 overflow-y-auto win98-scroll text-[12px]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#808080] pb-2">
        <div className="space-y-0.5">
          <p className="font-bold text-[13px]">
            Local Vercel Board CLI &amp; Interactive TUI (<code>local-vercel-board</code> / <code>lvb</code>)
          </p>
          <p className="text-[11px] opacity-85">
            MIT open-source CLI aligned with <strong>vercel/board SPEC.md</strong> &amp;{' '}
            <code className="font-code">@poppinss/cliui</code> · by{' '}
            <a
              href="https://iolivares.com"
              target="_blank"
              rel="noreferrer"
              className="underline text-[#000080]"
            >
              Iván Olivares
            </a>
            .
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <label className="flex items-center gap-1 text-[11px]">
            <span>Channel:</span>
            <select
              aria-label="Target channel for setup script"
              value={selectedChannel}
              onChange={(e) => setSelectedChannel(e.target.value)}
              className="bg-white text-black border border-[#808080] px-1.5 py-0.5 text-[11px]"
            >
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          </label>
          {onOpenCommandPrompt && (
            <button
              type="button"
              onClick={onOpenCommandPrompt}
              className="win98-button inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold whitespace-nowrap"
            >
              <TerminalSquare size={11} />
              Try lvb TUI Here
            </button>
          )}
          <button
            type="button"
            disabled={runningHandshake}
            onClick={() => void handleHandshake()}
            className="win98-button-primary inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold whitespace-nowrap"
          >
            <Play size={11} />
            {runningHandshake ? 'Connecting...' : 'Test 3-Agent Handshake'}
          </button>
        </div>
      </div>

      {handshakeDone && (
        <div className="bg-[#e8f5e9] border border-[#2e7d32] px-2.5 py-1.5 text-[11px] text-[#1b5e20]">
          Handshake posted to <strong>#{selectedChannel}</strong>: claude-code, grok, and antigravity registered and checked in live.
        </div>
      )}

      {/* 1. lvb CLI & @poppinss/cliui TUI Quick Commands */}
      <div className="space-y-1.5">
        <div className="font-bold text-[12px]">
          1. Run the Open-Source <code>lvb</code> CLI &amp; Interactive TUI
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          {lvbQuickCommands.map((item) => (
            <div key={item.id} className="win98-raised p-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-[11px]">{item.label}</span>
                <button
                  type="button"
                  onClick={() => void copyText(item.id, item.command)}
                  className="win98-button inline-flex items-center gap-1 px-2 py-0.5 text-[11px] whitespace-nowrap"
                >
                  {copiedId === item.id ? <Check size={11} /> : <Copy size={11} />}
                  {copiedId === item.id ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="win98-sunken p-1.5 font-code text-[10.5px] leading-snug whitespace-pre-wrap break-all select-text">
                {item.command}
              </pre>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Agent CLI Launch Prompts */}
      <div className="space-y-1.5">
        <div className="font-bold text-[12px]">
          2. Connect Coding Agent CLIs to #{selectedChannel} (via <code>BOARD_URL</code> &amp; <code>--as</code>)
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          {agentSnippets.map((item) => (
            <div key={item.id} className="win98-raised p-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-[11px]">
                  {item.label}{' '}
                  <span className="font-normal opacity-75">
                    (x-board-profile: {item.profile})
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void copyText(item.id, item.command)}
                  className="win98-button inline-flex items-center gap-1 px-2 py-0.5 text-[11px] whitespace-nowrap"
                >
                  {copiedId === item.id ? <Check size={11} /> : <Copy size={11} />}
                  {copiedId === item.id ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="win98-sunken p-1.5 font-code text-[10.5px] leading-snug whitespace-pre-wrap break-all select-text">
                {item.command}
              </pre>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Legacy Bash Wrapper (delegates to `lvb setup`) */}
      <div className="flex-1 min-h-[150px] flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-[12px]">
            3. Optional Bash Wrapper (<code>scripts/setup-board.sh</code> → delegates to <code>lvb setup</code>)
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void copyText('script', setupScript)}
              className="win98-button inline-flex items-center gap-1 px-2 py-0.5 text-[11px] whitespace-nowrap"
            >
              {copiedId === 'script' ? <Check size={11} /> : <Copy size={11} />}
              {copiedId === 'script' ? 'Copied Script' : 'Copy Script'}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="win98-button inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
            >
              <Download size={11} />
              Download .sh
            </button>
          </div>
        </div>
        <pre className="flex-1 min-h-[130px] win98-sunken-dark text-[#dcfce7] p-2.5 font-code text-[11px] leading-relaxed overflow-auto win98-scroll select-text">
          {setupScript}
        </pre>
      </div>
    </div>
  );
}

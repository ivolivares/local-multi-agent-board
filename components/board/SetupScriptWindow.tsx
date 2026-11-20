'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, Download, Play } from 'lucide-react';
import { generateCliSnippets, generateSetupScript } from '@/lib/board-logic';
import type { Channel } from '@/lib/board-types';

interface SetupScriptWindowProps {
  boardName: string;
  channels: Channel[];
  activeChannel: string;
  onRunHandshake: (channelId: string) => Promise<void>;
}

export function SetupScriptWindow({
  boardName,
  channels,
  activeChannel,
  onRunHandshake,
}: SetupScriptWindowProps) {
  const [selectedChannel, setSelectedChannel] = useState(
    channels.some((c) => c.id === 'agent-bridge') ? 'agent-bridge' : activeChannel
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [runningHandshake, setRunningHandshake] = useState(false);
  const [handshakeDone, setHandshakeDone] = useState(false);

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const setupScript = useMemo(
    () =>
      generateSetupScript({
        boardUrl: origin,
        channel: selectedChannel,
        boardName,
      }),
    [origin, selectedChannel, boardName]
  );

  const snippets = useMemo(
    () => generateCliSnippets(origin, selectedChannel),
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
    <div className="flex flex-1 flex-col min-h-0 bg-[#c0c0c0] p-2.5 gap-2.5 overflow-y-auto win98-scroll text-[12px]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#808080] pb-2">
        <div className="space-y-0.5">
          <p className="font-bold text-[13px] text-[#000000]">
            Local Multi-Agent CLI Bridge (No Vercel Account Required)
          </p>
          <p className="text-[11px] text-[#333333]">
            Run <code className="font-code bg-white px-1">bash scripts/setup-board.sh</code> locally to connect Claude Code, Grok CLI, and Gemini Antigravity CLI into a single channel.
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <label className="flex items-center gap-1 text-[11px]">
            <span>Channel:</span>
            <select
              aria-label="Target channel for setup script"
              value={selectedChannel}
              onChange={(e) => setSelectedChannel(e.target.value)}
              className="bg-white border border-[#808080] px-1.5 py-0.5 text-[11px]"
            >
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          </label>
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

      {/* 3 Agent CLI Launch Snippets */}
      <div className="space-y-1.5">
        <div className="font-bold text-[12px] text-[#000080]">
          1. Connect Each Agent CLI to #{selectedChannel}
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          {snippets.map((item) => (
            <div
              key={item.id}
              className="win98-raised p-2 space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-[11px] text-[#000000]">
                  {item.label}{' '}
                  <span className="font-normal text-[#555555]">
                    (--as {item.profile})
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
              <pre className="win98-sunken bg-white p-1.5 font-code text-[10.5px] leading-snug text-[#111111] whitespace-pre-wrap break-all select-text">
                {item.command}
              </pre>
            </div>
          ))}
        </div>
      </div>

      {/* Full setup-board.sh script */}
      <div className="flex-1 min-h-[170px] flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-[12px] text-[#000080]">
            2. Setup Script (scripts/setup-board.sh)
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
        <pre className="flex-1 min-h-[160px] win98-sunken-dark text-[#dcfce7] p-2.5 font-code text-[11px] leading-relaxed overflow-auto win98-scroll select-text">
          {setupScript}
        </pre>
      </div>
    </div>
  );
}

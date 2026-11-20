'use client';

import { useState } from 'react';
import { Check, Link2, PlusCircle, Radio, Trash2 } from 'lucide-react';
import { validateLocalAgentInput } from '@/lib/board-logic';
import type { Actor, AgentCliFlavor } from '@/lib/board-types';
import { ActorAvatar } from './ActorAvatar';

export interface AddAgentPayload {
  name: string;
  cliFlavor: AgentCliFlavor;
  endpointUri: string;
  via: string;
  statusMessage?: string;
  announce: boolean;
}

interface AddAgentWindowProps {
  actors: Actor[];
  currentUser: string;
  activeChannel: string;
  onRegisterAgent: (payload: AddAgentPayload) => Promise<{ ok: boolean; error?: string }>;
  onRemoveAgent: (name: string) => Promise<void>;
  onInspectAgent: (actorName: string) => void;
  onClose: () => void;
}

const AGENT_TYPE_OPTIONS: { value: AgentCliFlavor; label: string; sampleUri: string }[] = [
  { value: 'claude-code', label: 'claude-code (Claude Code CLI)', sampleUri: 'http://127.0.0.1:4101/claude-code' },
  { value: 'gemini-cli', label: 'gemini-cli (Gemini CLI)', sampleUri: 'http://127.0.0.1:4200/gemini-cli' },
  { value: 'gemini-antigravity', label: 'gemini-antigravity (Antigravity CLI)', sampleUri: 'http://127.0.0.1:4201/antigravity' },
  { value: 'grok', label: 'grok (Grok CLI)', sampleUri: 'http://127.0.0.1:4300/grok' },
  { value: 'codex', label: 'codex (Codex CLI)', sampleUri: 'stdio://codex-cli' },
  { value: 'ollama', label: 'ollama (Local LLM Bridge)', sampleUri: 'http://127.0.0.1:11434/api/chat' },
  { value: 'custom', label: 'custom (Custom Local Endpoint)', sampleUri: 'http://127.0.0.1:4500/agent' },
];

const QUICK_PRESETS: {
  label: string;
  name: string;
  cliFlavor: AgentCliFlavor;
  endpointUri: string;
  statusMessage: string;
}[] = [
  {
    label: 'Gemini CLI',
    name: 'gemini-cli',
    cliFlavor: 'gemini-cli',
    endpointUri: 'http://127.0.0.1:4200/gemini-cli',
    statusMessage: 'Local Gemini CLI endpoint listening for code reviews & patches.',
  },
  {
    label: 'Claude Code #2',
    name: 'claude-code-2',
    cliFlavor: 'claude-code',
    endpointUri: 'stdio://claude-code',
    statusMessage: 'Secondary Claude Code worker for parallel swarm tasks.',
  },
  {
    label: 'Ollama Local',
    name: 'ollama-qwen',
    cliFlavor: 'ollama',
    endpointUri: 'http://127.0.0.1:11434/api/chat',
    statusMessage: 'Local Qwen model via Ollama running completely offline.',
  },
];

export function AddAgentWindow({
  actors,
  currentUser,
  activeChannel,
  onRegisterAgent,
  onRemoveAgent,
  onInspectAgent,
  onClose,
}: AddAgentWindowProps) {
  const [name, setName] = useState('');
  const [cliFlavor, setCliFlavor] = useState<AgentCliFlavor>('gemini-cli');
  const [endpointUri, setEndpointUri] = useState('');
  const [via, setVia] = useState(currentUser || 'ctate');
  const [statusMessage, setStatusMessage] = useState('');
  const [announce, setAnnounce] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const agents = actors.filter((a) => a.kind === 'agent');
  const selectedType =
    AGENT_TYPE_OPTIONS.find((opt) => opt.value === cliFlavor) || AGENT_TYPE_OPTIONS[0];

  const handleApplyPreset = (preset: (typeof QUICK_PRESETS)[number]) => {
    setName(preset.name);
    setCliFlavor(preset.cliFlavor);
    setEndpointUri(preset.endpointUri);
    setStatusMessage(preset.statusMessage);
    setError(null);
    setSuccessMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const check = validateLocalAgentInput({
      name,
      cliFlavor,
      endpointUri,
      via,
      statusMessage,
    });
    if (!check.ok) {
      setError(check.reason);
      return;
    }

    setSubmitting(true);
    try {
      const res = await onRegisterAgent({
        name: check.cleanName,
        cliFlavor,
        endpointUri: check.cleanUri,
        via: via.trim() || currentUser,
        statusMessage: statusMessage.trim() || undefined,
        announce,
      });
      if (!res.ok) {
        setError(res.error || 'Could not register local agent endpoint.');
        return;
      }
      setSuccessMsg(`Registered "${check.cleanName}" (${check.cleanUri}) on #${activeChannel}.`);
      setName('');
      setEndpointUri('');
      setStatusMessage('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col min-h-0 win98-surface p-2.5 gap-2.5 overflow-y-auto win98-scroll text-[12px]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#808080] pb-2">
        <div className="space-y-0.5">
          <p className="font-bold text-[13px] flex items-center gap-1.5">
            <PlusCircle size={14} className="text-[#000080]" />
            <span>Register Local Agent Endpoint</span>
          </p>
          <p className="text-[11px] opacity-85">
            Connect local coding CLIs (<code>claude-code</code>, <code>gemini-cli</code>, <code>ollama</code>) to{' '}
            <strong>#{activeChannel}</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10.5px] opacity-80 mr-0.5">Presets:</span>
          {QUICK_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => handleApplyPreset(preset)}
              className="win98-button px-2 py-0.5 text-[11px]"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Registration Form */}
      <form
        onSubmit={(e) => void handleSubmit(e)}
        noValidate
        className="win98-groupbox p-2.5 space-y-2"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold">Agent Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. gemini-cli or claude-code-2"
              className="win98-sunken bg-white text-black px-2 py-1 text-[12px] font-code focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold">Agent Type</span>
            <select
              value={cliFlavor}
              onChange={(e) => setCliFlavor(e.target.value as AgentCliFlavor)}
              className="win98-sunken bg-white text-black px-2 py-1 text-[12px] focus:outline-none"
            >
              {AGENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold">Local URI</span>
          <input
            type="text"
            value={endpointUri}
            onChange={(e) => {
              setEndpointUri(e.target.value);
              if (error) setError(null);
            }}
            placeholder={selectedType.sampleUri}
            className="win98-sunken bg-white text-black px-2 py-1 text-[12px] font-code focus:outline-none"
          />
          <span className="text-[10.5px] opacity-75">
            Supports <code>http://</code>, <code>https://</code>, <code>ws://</code>, <code>wss://</code>, or{' '}
            <code>stdio://</code> local endpoints.
          </span>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold">Owner Handle (via)</span>
            <input
              type="text"
              value={via}
              onChange={(e) => setVia(e.target.value)}
              placeholder="ctate"
              className="win98-sunken bg-white text-black px-2 py-1 text-[12px] font-code focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold">Status Note (optional)</span>
            <input
              type="text"
              value={statusMessage}
              onChange={(e) => setStatusMessage(e.target.value)}
              placeholder="Listening for tasks and @mentions"
              className="win98-sunken bg-white text-black px-2 py-1 text-[12px] focus:outline-none"
            />
          </label>
        </div>

        <label className="flex items-center gap-1.5 text-[11px] pt-0.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={announce}
            onChange={(e) => setAnnounce(e.target.checked)}
          />
          <span>Post automatic check-in message in #{activeChannel}</span>
        </label>

        {error && (
          <div
            role="alert"
            className="border border-[#991b1b] bg-[#fef2f2] text-[#991b1b] px-2 py-1 text-[11px] font-medium"
          >
            {error}
          </div>
        )}

        {successMsg && (
          <div
            role="status"
            className="border border-[#166534] bg-[#f0fdf4] text-[#166534] px-2 py-1 text-[11px] font-medium flex items-center gap-1.5"
          >
            <Check size={12} />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="win98-button px-3 py-1 text-[12px]"
          >
            Close
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="win98-button-primary px-3.5 py-1 text-[12px] font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            <Radio size={12} />
            <span>{submitting ? 'Registering...' : 'Register Agent'}</span>
          </button>
        </div>
      </form>

      {/* Registered Agents List */}
      <div className="flex-1 min-h-[120px] flex flex-col gap-1">
        <div className="flex items-center justify-between text-[11px] font-bold">
          <span>Registered Agents on Board ({agents.length})</span>
          <span className="font-normal opacity-75">Synced live via SSE</span>
        </div>
        <div className="win98-sunken bg-white text-black flex-1 overflow-y-auto win98-scroll divide-y divide-[#e5e5e5]">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11.5px]"
            >
              <button
                type="button"
                onClick={() => onInspectAgent(agent.name)}
                className="flex items-center gap-2 min-w-0 flex-1 text-left hover:underline"
              >
                <ActorAvatar actor={agent} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold truncate">{agent.name}</span>
                    <span className="text-[10px] text-[#555555] font-code">
                      [{agent.cliFlavor || 'custom'}]
                    </span>
                    {agent.via && (
                      <span className="text-[10px] text-[#666666] italic">
                        via {agent.via}
                      </span>
                    )}
                  </div>
                  {agent.endpointUri ? (
                    <div className="flex items-center gap-1 text-[10.5px] font-code text-[#000080] truncate">
                      <Link2 size={10} className="shrink-0" />
                      <span className="truncate">{agent.endpointUri}</span>
                    </div>
                  ) : (
                    <div className="text-[10.5px] text-[#666666] truncate">
                      {agent.statusMessage}
                    </div>
                  )}
                </div>
              </button>

              {agent.endpointUri && (
                <button
                  type="button"
                  onClick={() => void onRemoveAgent(agent.name)}
                  aria-label={`Remove agent ${agent.name}`}
                  className="win98-button px-1.5 py-0.5 text-[10.5px] inline-flex items-center gap-1 shrink-0"
                  title={`Remove ${agent.name}`}
                >
                  <Trash2 size={11} />
                  <span>Remove</span>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

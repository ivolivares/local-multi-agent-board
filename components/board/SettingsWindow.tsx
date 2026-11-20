'use client';

import { Check, Monitor, Play, RotateCcw, Sparkles, Volume2, VolumeX } from 'lucide-react';
import {
  DEFAULT_THEME_ID,
  DESKTOP_THEMES,
  getThemeById,
  type DesktopThemeId,
} from '@/lib/desktop-themes';

interface SettingsWindowProps {
  themeId: DesktopThemeId;
  soundEnabled: boolean;
  autoReplyAgents: boolean;
  swarmRunning: boolean;
  onSelectTheme: (themeId: DesktopThemeId) => void;
  onToggleSound: () => void;
  onToggleAutoReply: () => void;
  onRunSwarmDemo: () => Promise<void>;
  onClose: () => void;
}

export function SettingsWindow({
  themeId,
  soundEnabled,
  autoReplyAgents,
  swarmRunning,
  onSelectTheme,
  onToggleSound,
  onToggleAutoReply,
  onRunSwarmDemo,
  onClose,
}: SettingsWindowProps) {
  const activeTheme = getThemeById(themeId);

  return (
    <div className="flex flex-1 flex-col min-h-0 win98-surface p-2.5 gap-2.5 overflow-y-auto win98-scroll text-[12px]">
      {/* Classic Win98 Display Properties CRT Monitor Preview */}
      <div className="flex flex-col items-center">
        <div
          className="win98-raised p-2 w-full max-w-[340px]"
          aria-label={`Live preview of ${activeTheme.name} color scheme`}
        >
          {/* Miniature Desktop Screen */}
          <div
            data-preserve-bg="true"
            className="relative h-[124px] w-full overflow-hidden border-2 border-[#0a0a0a] p-2.5"
            style={{ backgroundColor: activeTheme.preview.desktop }}
          >
            {/* Inactive background window */}
            <div
              data-preserve-bg="true"
              className="absolute left-3 top-2.5 w-[180px] h-[64px] border p-[2px] shadow-sm"
              style={{
                backgroundColor: activeTheme.preview.surface,
                borderColor: activeTheme.preview.borderDark,
              }}
            >
              <div
                data-preserve-bg="true"
                className="px-1.5 py-[2px] text-[9px] font-bold"
                style={{
                  backgroundColor: activeTheme.preview.inactiveTitle,
                  color: activeTheme.preview.titleText,
                }}
              >
                Inactive Window
              </div>
            </div>

            {/* Active foreground window */}
            <div
              data-preserve-bg="true"
              className="absolute right-3 bottom-2.5 w-[210px] h-[82px] border p-[2px] shadow-md flex flex-col"
              style={{
                backgroundColor: activeTheme.preview.surface,
                borderColor: activeTheme.preview.borderDark,
              }}
            >
              <div
                data-preserve-bg="true"
                className="flex items-center justify-between px-1.5 py-[2px] text-[9px] font-bold"
                style={{
                  background: `linear-gradient(90deg, ${activeTheme.preview.titleFrom} 0%, ${activeTheme.preview.titleTo} 100%)`,
                  color: activeTheme.preview.titleText,
                }}
              >
                <span>#agent-bridge — Local Board</span>
                <span>×</span>
              </div>
              <div className="flex-1 p-1.5 flex flex-col justify-between">
                <div
                  data-preserve-bg="true"
                  className="px-1.5 py-1 text-[9px] border"
                  style={{
                    backgroundColor: activeTheme.preview.fieldBg,
                    color: activeTheme.preview.text,
                    borderColor: activeTheme.preview.borderDark,
                  }}
                >
                  claude-code: patch ready @grok
                </div>
                <div className="flex justify-end">
                  <span
                    data-preserve-bg="true"
                    className="px-2 py-[1px] text-[9px] font-bold border"
                    style={{
                      backgroundColor: activeTheme.preview.surface,
                      color: activeTheme.preview.text,
                      borderColor: activeTheme.preview.borderDark,
                    }}
                  >
                    OK
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-1.5 flex items-center justify-between text-[11px] px-0.5">
            <span className="inline-flex items-center gap-1.5 font-bold">
              <Monitor size={12} />
              <span>{activeTheme.name}</span>
            </span>
            <span className="font-code text-[10px] opacity-80">
              {activeTheme.badge}
            </span>
          </div>
        </div>
      </div>

      {/* Color Scheme Picker */}
      <fieldset className="border border-[#808080] p-2 space-y-2">
        <legend className="px-1.5 text-[11px] font-bold">
          Retro Desktop Color Scheme
        </legend>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {DESKTOP_THEMES.map((theme) => {
            const selected = theme.id === themeId;
            return (
              <button
                key={theme.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelectTheme(theme.id)}
                className={`flex items-start gap-2 p-2 text-left transition-none ${
                  selected ? 'win98-button-pressed font-bold' : 'win98-button'
                }`}
              >
                {/* Miniature swatch */}
                <span
                  data-preserve-bg="true"
                  className="mt-0.5 flex h-6 w-6 shrink-0 flex-col overflow-hidden border border-[#0a0a0a]"
                  aria-hidden="true"
                >
                  <span
                    className="h-2.5 w-full"
                    style={{ backgroundColor: theme.preview.titleFrom }}
                  />
                  <span
                    className="flex-1 w-full"
                    style={{ backgroundColor: theme.preview.desktop }}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-1 text-[11px] leading-tight">
                    <span className="truncate">{theme.name}</span>
                    {selected && <Check size={12} className="shrink-0" />}
                  </span>
                  <span className="mt-0.5 block text-[10px] font-normal opacity-85 leading-snug">
                    {theme.badge}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-[11px] leading-snug opacity-90">
          {activeTheme.description}
        </p>
      </fieldset>

      {/* Interactive Local Multi-Agent Board Emulator Controls */}
      <fieldset className="border border-[#808080] p-2 space-y-2">
        <legend className="px-1.5 text-[11px] font-bold">
          Interactive Board Emulator
        </legend>

        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-bold inline-flex items-center gap-1">
              <Sparkles size={12} />
              <span>Auto-Reply CLI Agents on @mention</span>
            </div>
            <p className="text-[10px] opacity-85">
              When you mention @claude-code, @grok, or @antigravity in chat, they respond interactively.
            </p>
          </div>
          <button
            type="button"
            aria-pressed={autoReplyAgents}
            onClick={onToggleAutoReply}
            className={`px-2.5 py-1 text-[11px] font-bold shrink-0 ${
              autoReplyAgents ? 'win98-button-pressed' : 'win98-button'
            }`}
          >
            {autoReplyAgents ? 'Enabled' : 'Paused'}
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#808080]/40">
          <div className="min-w-0">
            <div className="text-[11px] font-bold inline-flex items-center gap-1">
              {soundEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
              <span>New Message Ping Chime</span>
            </div>
            <p className="text-[10px] opacity-85">
              Subtle Web Audio ping when messages arrive in any thread.
            </p>
          </div>
          <button
            type="button"
            aria-pressed={soundEnabled}
            onClick={onToggleSound}
            className={`px-2.5 py-1 text-[11px] font-bold shrink-0 ${
              soundEnabled ? 'win98-button-pressed' : 'win98-button'
            }`}
          >
            {soundEnabled ? 'On' : 'Muted'}
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#808080]/40">
          <span className="text-[10px] opacity-90">
            Watch a live 3-agent swarm claim, patch, fuzz, and complete a task:
          </span>
          <button
            type="button"
            disabled={swarmRunning}
            onClick={() => void onRunSwarmDemo()}
            className="win98-button-primary inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold shrink-0"
          >
            <Play size={10} fill="currentColor" />
            <span>{swarmRunning ? 'Running...' : 'Run Swarm Demo'}</span>
          </button>
        </div>
      </fieldset>

      {/* Bottom Dialog Actions */}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={() => onSelectTheme(DEFAULT_THEME_ID)}
          className="win98-button inline-flex items-center gap-1 px-2.5 py-1 text-[11px]"
        >
          <RotateCcw size={11} />
          <span>Reset Default</span>
        </button>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onClose}
            className="win98-button-primary px-4 py-1 text-[11px] font-bold"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

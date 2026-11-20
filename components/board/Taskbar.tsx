'use client';

import { useEffect, useState } from 'react';
import { Triangle, Volume2, VolumeX } from 'lucide-react';

export interface TaskbarButtonItem {
  id: string;
  label: string;
  mobileLabel: string;
  active: boolean;
}

interface TaskbarProps {
  buttons: TaskbarButtonItem[];
  isMobile: boolean;
  startMenuOpen: boolean;
  cliStatusOpen: boolean;
  streamStatus: 'connecting' | 'connected' | 'reconnecting';
  connectedAgentsCount: number;
  soundEnabled: boolean;
  onToggleStartMenu: () => void;
  onTaskbarButtonClick: (id: string) => void;
  onToggleCliStatus: () => void;
  onToggleSound: () => void;
}

function formatDigitalClock(d: Date): string {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

export function Taskbar({
  buttons,
  isMobile,
  startMenuOpen,
  cliStatusOpen,
  streamStatus,
  connectedAgentsCount,
  soundEnabled,
  onToggleStartMenu,
  onTaskbarButtonClick,
  onToggleCliStatus,
  onToggleSound,
}: TaskbarProps) {
  const [clockText, setClockText] = useState<string>('');

  useEffect(() => {
    const tick = () => setClockText(formatDigitalClock(new Date()));
    const t0 = setTimeout(tick, 0);
    const id = setInterval(tick, 10_000);
    return () => {
      clearTimeout(t0);
      clearInterval(id);
    };
  }, []);

  return (
    <footer
      aria-label="Desktop Taskbar"
      className="fixed bottom-0 left-0 right-0 z-[100] flex h-[34px] items-center justify-between gap-1.5 bg-[#c0c0c0] border-t-2 border-t-[#ffffff] px-1.5"
    >
      <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleStartMenu();
          }}
          aria-expanded={startMenuOpen}
          className={`inline-flex items-center gap-1.5 px-2.5 h-[26px] text-[12px] font-bold text-[#000000] whitespace-nowrap shrink-0 ${
            startMenuOpen ? 'win98-button-pressed' : 'win98-button'
          }`}
        >
          <Triangle size={11} fill="currentColor" strokeWidth={0} />
          <span>Start</span>
        </button>

        <span
          className="h-5 w-[2px] border-l border-[#808080] border-r border-r-white shrink-0 mx-0.5"
          aria-hidden="true"
        />

        {buttons.map((btn) => (
          <button
            key={btn.id}
            type="button"
            onClick={() => onTaskbarButtonClick(btn.id)}
            className={`inline-flex items-center gap-1.5 px-2.5 h-[26px] max-w-[184px] text-[12px] text-[#000000] whitespace-nowrap shrink-0 ${
              btn.active
                ? 'win98-taskbar-active font-bold'
                : 'win98-button font-normal'
            }`}
          >
            <span
              className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center bg-black text-white"
              aria-hidden="true"
            >
              <Triangle size={7} fill="currentColor" strokeWidth={0} />
            </span>
            <span className="truncate">
              {isMobile ? btn.mobileLabel : btn.label}
            </span>
          </button>
        ))}
      </div>

      {/* System Tray: Sound Toggle, Live Connected CLI Agents Status, Persistent Digital Clock */}
      <div className="win98-sunken-gray hidden sm:inline-flex items-center gap-1.5 px-2 h-[26px] text-[12px] text-[#000000] tabular-nums whitespace-nowrap shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSound();
          }}
          aria-pressed={soundEnabled}
          aria-label={
            soundEnabled ? 'Mute message ping sound' : 'Unmute message ping sound'
          }
          title={soundEnabled ? 'Message ping: On' : 'Message ping: Muted'}
          className="inline-flex items-center justify-center h-[20px] w-[20px] hover:bg-[#d6d6d6] focus-visible:outline-1 focus-visible:outline-black"
        >
          {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} className="text-[#666666]" />}
        </button>

        <span className="h-3.5 w-[1px] bg-[#808080]" aria-hidden="true" />

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCliStatus();
          }}
          aria-expanded={cliStatusOpen}
          aria-label={`CLI agents status: ${streamStatus === 'connected' ? 'connected' : streamStatus}, ${connectedAgentsCount} agents`}
          className="inline-flex items-center gap-1.5 px-1 py-0.5 text-[11px] hover:bg-[#d6d6d6] focus-visible:outline-1 focus-visible:outline-black"
        >
          <span
            className={`h-2 w-2 rounded-full shrink-0 ${
              streamStatus === 'connected'
                ? 'bg-[#15803d]'
                : streamStatus === 'reconnecting'
                  ? 'bg-[#b45309]'
                  : 'bg-[#64748b]'
            }`}
            aria-hidden="true"
          />
          <span className="font-medium">
            {streamStatus === 'connected'
              ? `${connectedAgentsCount} CLI Live`
              : streamStatus === 'reconnecting'
                ? 'Reconnecting'
                : 'Connecting'}
          </span>
        </button>

        <span className="h-3.5 w-[1px] bg-[#808080]" aria-hidden="true" />

        <span className="inline-flex items-center gap-1.5" data-testid="taskbar-clock">
          <span
            className="inline-flex h-3.5 w-3.5 items-center justify-center bg-black text-white"
            aria-hidden="true"
          >
            <Triangle size={7} fill="currentColor" strokeWidth={0} />
          </span>
          <time suppressHydrationWarning>{clockText || '--:--'}</time>
        </span>
      </div>
    </footer>
  );
}

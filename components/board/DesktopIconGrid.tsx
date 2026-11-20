'use client';

import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  FileCode2,
  FileText,
  Film,
  PlusCircle,
  SlidersHorizontal,
  Terminal,
  TerminalSquare,
} from 'lucide-react';
import {
  DESKTOP_GRID_SIZE,
  snapDesktopIcon,
  type DesktopIconId,
  type DesktopIconLayout,
  type DesktopIconPosition,
} from '@/lib/desktop-grid';

export interface DesktopShortcutDef {
  id: DesktopIconId;
  label: string;
}

export const DESKTOP_SHORTCUTS: DesktopShortcutDef[] = [
  { id: 'eli5', label: "Explain Like I'm 5" },
  { id: 'cmd', label: 'Command Prompt' },
  { id: 'addAgent', label: 'Add Agent' },
  { id: 'terminal', label: 'vb tail' },
  { id: 'setup', label: 'lb setup' },
  { id: 'readme', label: 'readme.md' },
  { id: 'media', label: 'Intro.mp4' },
  { id: 'settings', label: 'Settings' },
];

function renderShortcutIcon(id: DesktopIconId) {
  const props = {
    size: 24,
    strokeWidth: 1.7,
    className:
      'text-white drop-shadow-[1px_1px_0px_rgba(0,0,0,0.6)] group-hover:scale-105 transition-transform shrink-0',
  };
  switch (id) {
    case 'eli5':
      return <BookOpen {...props} />;
    case 'cmd':
      return <Terminal {...props} />;
    case 'addAgent':
      return <PlusCircle {...props} />;
    case 'terminal':
      return <TerminalSquare {...props} />;
    case 'setup':
      return <FileCode2 {...props} />;
    case 'readme':
      return <FileText {...props} />;
    case 'media':
      return <Film {...props} />;
    case 'settings':
      return <SlidersHorizontal {...props} />;
  }
}

interface DesktopIconGridProps {
  layout: DesktopIconLayout;
  viewport: { width: number; height: number };
  snapEnabled: boolean;
  onOpenIcon: (id: DesktopIconId) => void;
  onMoveIcon: (id: DesktopIconId, rawPos: DesktopIconPosition) => void;
}

interface ActiveDrag {
  id: DesktopIconId;
  startPointerX: number;
  startPointerY: number;
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
  moved: boolean;
}

export function DesktopIconGrid({
  layout,
  viewport,
  snapEnabled,
  onOpenIcon,
  onMoveIcon,
}: DesktopIconGridProps) {
  const [selectedId, setSelectedId] = useState<DesktopIconId | null>(null);
  const [drag, setDrag] = useState<ActiveDrag | null>(null);
  const dragRef = useRef<ActiveDrag | null>(null);
  const suppressClickIdRef = useRef<DesktopIconId | null>(null);

  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  useEffect(() => {
    if (!drag) return;

    const handlePointerMove = (e: PointerEvent) => {
      const curr = dragRef.current;
      if (!curr) return;
      const dx = e.clientX - curr.startPointerX;
      const dy = e.clientY - curr.startPointerY;
      const moved = curr.moved || Math.hypot(dx, dy) > 4;
      const next: ActiveDrag = {
        ...curr,
        currentX: Math.max(0, curr.originX + dx),
        currentY: Math.max(0, curr.originY + dy),
        moved,
      };
      dragRef.current = next;
      setDrag(next);
    };

    const handlePointerUp = () => {
      const curr = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (curr && curr.moved) {
        suppressClickIdRef.current = curr.id;
        onMoveIcon(curr.id, { x: curr.currentX, y: curr.currentY });
        setTimeout(() => {
          if (suppressClickIdRef.current === curr.id) {
            suppressClickIdRef.current = null;
          }
        }, 120);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [drag !== null, onMoveIcon]); // eslint-disable-line react-hooks/exhaustive-deps

  const previewSnapPos =
    drag && drag.moved && snapEnabled
      ? snapDesktopIcon(
          drag.id,
          { x: drag.currentX, y: drag.currentY },
          layout,
          viewport.width,
          viewport.height,
          DESKTOP_GRID_SIZE
        )
      : null;

  return (
    <nav
      aria-label="Desktop shortcuts"
      data-grid-size={DESKTOP_GRID_SIZE}
      className="pointer-events-none fixed inset-0 bottom-[36px] z-[5]"
    >
      {/* Snap target ghost outline while dragging an icon */}
      {previewSnapPos && (
        <div
          aria-hidden="true"
          style={{
            left: previewSnapPos.x,
            top: previewSnapPos.y,
            width: DESKTOP_GRID_SIZE,
            height: DESKTOP_GRID_SIZE,
          }}
          className="pointer-events-none absolute border border-dashed border-white/90 bg-[#000080]/25"
        />
      )}

      {DESKTOP_SHORTCUTS.map((item) => {
        const pos = layout[item.id] || { x: 0, y: 0 };
        const isDragging = drag?.id === item.id && drag.moved;
        const left = isDragging ? drag.currentX : pos.x;
        const top = isDragging ? drag.currentY : pos.y;
        const isSelected = selectedId === item.id;

        return (
          <button
            key={item.id}
            type="button"
            data-icon-id={item.id}
            data-grid-x={pos.x}
            data-grid-y={pos.y}
            style={{
              left,
              top,
              width: DESKTOP_GRID_SIZE,
              height: DESKTOP_GRID_SIZE,
            }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              setSelectedId(item.id);
              const start: ActiveDrag = {
                id: item.id,
                startPointerX: e.clientX,
                startPointerY: e.clientY,
                originX: pos.x,
                originY: pos.y,
                currentX: pos.x,
                currentY: pos.y,
                moved: false,
              };
              dragRef.current = start;
              setDrag(start);
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (suppressClickIdRef.current === item.id) return;
              setSelectedId(item.id);
              onOpenIcon(item.id);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (suppressClickIdRef.current === item.id) return;
              onOpenIcon(item.id);
            }}
            className={`pointer-events-auto group absolute flex flex-col items-center justify-center gap-0.5 p-1 text-white select-none focus-visible:outline-1 focus-visible:outline-white ${
              isDragging ? 'z-[20] opacity-85 cursor-grabbing' : 'cursor-pointer'
            }`}
          >
            {renderShortcutIcon(item.id)}
            <span
              className={`win98-desktop-label max-w-[62px] px-0.5 text-[9.5px] leading-[1.1] text-center line-clamp-2 break-words ${
                isSelected ? 'bg-[#000080] text-white outline-1 outline-dotted outline-white/75' : 'group-hover:bg-[#000080]'
              }`}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

'use client';

import React, { useRef } from 'react';
import { Minus, Square, Triangle, X } from 'lucide-react';

export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Win98WindowProps {
  id: string;
  title: string;
  active: boolean;
  zIndex: number;
  rect: WindowRect;
  maximized?: boolean;
  isMobile?: boolean;
  showMinimize?: boolean;
  showMaximize?: boolean;
  onFocus: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onMinimize?: (id: string) => void;
  onToggleMaximize?: (id: string) => void;
  onClose?: (id: string) => void;
  children: React.ReactNode;
}

export function Win98Window({
  id,
  title,
  active,
  zIndex,
  rect,
  maximized = false,
  isMobile = false,
  showMinimize = true,
  showMaximize = false,
  onFocus,
  onMove,
  onMinimize,
  onToggleMaximize,
  onClose,
  children,
}: Win98WindowProps) {
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const handleTitlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    onFocus(id);
    if (isMobile || maximized) return;
    if ((e.target as HTMLElement).closest('button')) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: rect.x,
      origY: rect.y,
    };
  };

  const handleTitlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const maxX = Math.max(0, window.innerWidth - 160);
    const maxY = Math.max(0, window.innerHeight - 90);
    const nextX = Math.min(maxX, Math.max(-80, dragRef.current.origX + dx));
    const nextY = Math.min(maxY, Math.max(4, dragRef.current.origY + dy));
    onMove(id, nextX, nextY);
  };

  const handleTitlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      dragRef.current = null;
    }
  };

  const style: React.CSSProperties = isMobile
    ? {
        position: 'fixed',
        top: 6,
        left: 6,
        right: 6,
        bottom: 44,
        zIndex,
      }
    : maximized
      ? {
          position: 'fixed',
          top: 8,
          left: 8,
          right: 8,
          bottom: 42,
          zIndex,
        }
      : {
          position: 'fixed',
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
          zIndex,
        };

  return (
    <section
      aria-label={title}
      style={style}
      onPointerDown={() => onFocus(id)}
      className="win98-window flex flex-col p-[3px] select-none"
    >
      <div
        onPointerDown={handleTitlePointerDown}
        onPointerMove={handleTitlePointerMove}
        onPointerUp={handleTitlePointerUp}
        onDoubleClick={() => {
          if (showMaximize && onToggleMaximize && !isMobile) {
            onToggleMaximize(id);
          }
        }}
        className={`flex items-center justify-between gap-2 px-1.5 py-[3px] shrink-0 ${
          active ? 'win98-title-active' : 'win98-title-inactive'
        } ${!isMobile && !maximized ? 'cursor-move' : ''}`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center bg-black text-white border border-white/60"
            aria-hidden="true"
          >
            <Triangle size={9} fill="currentColor" strokeWidth={0} />
          </span>
          <h2 className="text-[12px] font-bold leading-none tracking-[0.01em] truncate">
            {title}
          </h2>
        </div>

        <div className="flex items-center gap-[2px] shrink-0">
          {showMinimize && onMinimize && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMinimize(id);
              }}
              aria-label={`Minimize ${title}`}
              className="win98-button flex h-[17px] w-[18px] items-center justify-center text-[#000000] focus-visible:outline-1 focus-visible:outline-black"
            >
              <Minus size={10} strokeWidth={3} />
            </button>
          )}
          {showMaximize && onToggleMaximize && !isMobile && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleMaximize(id);
              }}
              aria-label={maximized ? `Restore ${title}` : `Maximize ${title}`}
              className="win98-button flex h-[17px] w-[18px] items-center justify-center text-[#000000] focus-visible:outline-1 focus-visible:outline-black"
            >
              <Square size={9} strokeWidth={2.5} />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose(id);
              }}
              aria-label={`Close ${title}`}
              className="win98-button flex h-[17px] w-[18px] items-center justify-center text-[#000000] focus-visible:outline-1 focus-visible:outline-black"
            >
              <X size={11} strokeWidth={3} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {children}
      </div>
    </section>
  );
}

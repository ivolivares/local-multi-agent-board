'use client';

import type { Actor, MentionAlert } from '@/lib/board-types';
import { ActorAvatar } from './ActorAvatar';

interface MentionAlertWindowProps {
  mention: MentionAlert;
  actors: Actor[];
  onOpenThread: (channelId: string, threadId: string) => void;
}

export function MentionAlertWindow({
  mention,
  actors,
  onOpenThread,
}: MentionAlertWindowProps) {
  const fromActor = actors.find((a) => a.name === mention.fromActor) || null;

  return (
    <button
      type="button"
      onClick={() => onOpenThread(mention.channelId, mention.threadId)}
      className="flex flex-1 items-center gap-3.5 px-4 py-3 text-left bg-[#c0c0c0] hover:bg-[#cacaca] transition-colors w-full focus-visible:outline-1 focus-visible:outline-black"
      aria-label={`Open mention from ${mention.fromActor} in channel ${mention.channelId}`}
    >
      <ActorAvatar actor={fromActor} name={mention.fromActor} size="md" />
      <div className="min-w-0 flex-1 text-[13px] leading-snug text-[#000000]">
        <p>
          <strong className="font-bold">{mention.fromActor}</strong> mentioned{' '}
          {mention.toActor === 'ctate' ? 'you' : `@${mention.toActor}`}:
        </p>
        <p className="mt-0.5 text-[#111111] line-clamp-2 break-words">
          &ldquo;{mention.snippet}&rdquo;
        </p>
        <p className="mt-1 text-[11px] text-[#404040] tabular-nums">
          #{mention.channelId} · thread {mention.threadId} — click to jump
        </p>
      </div>
    </button>
  );
}

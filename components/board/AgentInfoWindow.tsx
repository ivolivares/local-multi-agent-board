'use client';

import { useEffect, useState } from 'react';
import { formatRemainingLease } from '@/lib/board-logic';
import type { Actor, BoardTask } from '@/lib/board-types';
import { ActorAvatar } from './ActorAvatar';

interface AgentInfoWindowProps {
  actor: Actor | null;
  tasks: BoardTask[];
  onOk: () => void;
  onMention: (actorName: string) => void;
  onRenewLease?: (taskId: string, actorName: string) => void;
}

export function AgentInfoWindow({
  actor,
  tasks,
  onOk,
  onMention,
  onRenewLease,
}: AgentInfoWindowProps) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const t0 = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      clearTimeout(t0);
      clearInterval(id);
    };
  }, []);

  if (!actor) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-4 text-[12px] text-[#404040]">
        Select an agent or teammate in the Online list to inspect their status.
      </div>
    );
  }

  const activeTask =
    tasks.find((t) => t.id === actor.activeTaskId && t.state === 'claimed') ||
    tasks.find((t) => t.claimedBy === actor.name && t.state === 'claimed') ||
    null;

  return (
    <div className="flex flex-1 flex-col justify-between p-4 text-[13px] text-[#000000] bg-[#c0c0c0]">
      <div className="flex items-start gap-4">
        <div className="pt-1 shrink-0">
          <ActorAvatar actor={actor} size="lg" />
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="leading-snug">
            <p>
              <strong className="font-bold">{actor.name}</strong> is {actor.status}.
            </p>
            {actor.via && (
              <p className="text-[12px] text-[#222222]">Via: {actor.via}</p>
            )}
            {actor.endpointUri && (
              <p className="text-[11px] font-code text-[#000080] break-all">
                URI: {actor.endpointUri}
              </p>
            )}
          </div>

          <p className="font-editorial italic text-[13px] leading-snug text-[#111111] break-words">
            &ldquo;{actor.statusMessage}&rdquo;
          </p>

          <div className="pt-1 text-[12px] text-[#111111] tabular-nums flex items-center justify-between gap-2">
            {activeTask ? (
              <>
                <span suppressHydrationWarning>
                  Lease:{' '}
                  {now !== null
                    ? formatRemainingLease(activeTask.leaseExpiresAt, now)
                    : `${activeTask.leaseMinutes} min lease`}
                </span>
                {onRenewLease && (
                  <button
                    type="button"
                    onClick={() => onRenewLease(activeTask.id, actor.name)}
                    className="win98-button px-2 py-0.5 text-[11px] font-medium whitespace-nowrap shrink-0"
                  >
                    Renew +5m
                  </button>
                )}
              </>
            ) : (
              <span className="text-[#404040]">
                {actor.kind === 'agent'
                  ? `CLI: ${actor.cliFlavor || 'local-vb'}`
                  : 'Local board member'}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 pt-3">
        <button
          type="button"
          onClick={onOk}
          className="win98-button-primary min-w-[84px] px-4 py-1 text-[12px] font-medium text-[#000000] whitespace-nowrap"
        >
          OK
        </button>
        <button
          type="button"
          onClick={() => onMention(actor.name)}
          className="win98-button min-w-[84px] px-4 py-1 text-[12px] font-medium text-[#000000] whitespace-nowrap"
        >
          Mention
        </button>
      </div>
    </div>
  );
}

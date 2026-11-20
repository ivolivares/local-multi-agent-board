import { NextRequest, NextResponse } from 'next/server';
import { sanitizeChannelName } from '@/lib/board-logic';
import { getBoardState, subscribeBoardEvents } from '@/lib/board-store';
import type { BoardEvent } from '@/lib/board-types';

export const dynamic = 'force-dynamic';

/**
 * Blocking long-poll endpoint implementing `vercel board wait <channel|threadId> --json`.
 * External CLI agents (Claude Code, Grok, Gemini Antigravity) block here until an event arrives.
 */
export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get('target')?.trim() || '';
  const afterSeq = Number(req.nextUrl.searchParams.get('afterSeq') || '0');
  const timeoutMs = Math.max(
    1000,
    Math.min(120_000, Number(req.nextUrl.searchParams.get('timeoutMs') || '25000'))
  );

  const matchesTarget = (ev: BoardEvent): boolean => {
    if (!target) return true;
    const clean = sanitizeChannelName(target);
    return ev.threadId === target || ev.channelId === clean;
  };

  // Check if there is already a newer matching event since afterSeq
  if (afterSeq > 0) {
    const state = getBoardState();
    const missed = state.events.find((e) => e.seq > afterSeq && matchesTarget(e));
    if (missed) {
      return NextResponse.json({ ok: true, timedOut: false, event: missed });
    }
  }

  return new Promise<NextResponse>((resolve) => {
    let settled = false;

    const finish = (payload: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(NextResponse.json(payload));
    };

    const unsubscribe = subscribeBoardEvents((ev) => {
      if (matchesTarget(ev)) {
        finish({ ok: true, timedOut: false, event: ev });
      }
    });

    const timer = setTimeout(() => {
      finish({ ok: true, timedOut: true, event: null });
    }, timeoutMs);

    req.signal.addEventListener('abort', () => {
      finish({ ok: false, aborted: true, event: null });
    });
  });
}

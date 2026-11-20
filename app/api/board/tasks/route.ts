import { NextRequest, NextResponse } from 'next/server';
import { claimNextReadyTask, createTask, filterTasks } from '@/lib/board-logic';
import { commitBoardMutation, getBoardState } from '@/lib/board-store';
import type { TaskState } from '@/lib/board-types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const state = getBoardState();
  const channel = req.nextUrl.searchParams.get('channel') || undefined;
  const taskState = (req.nextUrl.searchParams.get('state') || 'all') as
    | TaskState
    | 'all';
  const tasks = filterTasks(state.tasks, { channelId: channel, state: taskState });
  return NextResponse.json({ ok: true, tasks });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    mode?: 'create' | 'claim_ready';
    channelId?: string;
    threadId?: string;
    title?: string;
    as?: string;
    via?: string;
    leaseMinutes?: number;
  };

  if (body.mode === 'claim_ready') {
    const result = commitBoardMutation((state) => {
      const res = claimNextReadyTask(state, body.channelId || 'agent-bridge', {
        asActor: body.as,
        via: body.via,
        leaseMinutes: body.leaseMinutes,
      });
      return { result: res, event: res.event };
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 409 });
    }
    return NextResponse.json(result);
  }

  const result = commitBoardMutation((state) => {
    const res = createTask(state, {
      channelId: body.channelId || 'agent-bridge',
      threadId: body.threadId,
      title: body.title || '',
      createdBy: body.as || state.currentUser,
      leaseMinutes: body.leaseMinutes,
    });
    return { result: res, event: res.event };
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result, { status: 201 });
}

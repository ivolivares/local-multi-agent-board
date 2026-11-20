import { NextRequest, NextResponse } from 'next/server';
import { createThread } from '@/lib/board-logic';
import { commitBoardMutation, getBoardState } from '@/lib/board-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const state = getBoardState();
  const channel = req.nextUrl.searchParams.get('channel')?.trim();
  const threads = channel
    ? state.threads.filter((t) => t.channelId === channel)
    : state.threads;
  return NextResponse.json({ ok: true, threads });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    channelId?: string;
    title?: string;
    body?: string;
    as?: string;
    labels?: string[];
  };
  const result = commitBoardMutation((state) => {
    const res = createThread(state, {
      channelId: body.channelId || 'agent-bridge',
      title: body.title || '',
      body: body.body,
      asActor: body.as,
      labels: body.labels,
    });
    return { result: res, event: res.event };
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result, { status: 201 });
}

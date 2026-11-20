import { NextRequest, NextResponse } from 'next/server';
import { createChannel } from '@/lib/board-logic';
import { commitBoardMutation, getBoardState } from '@/lib/board-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const state = getBoardState();
  const channels = state.channels.map((c) => ({
    ...c,
    threadCount: state.threads.filter((t) => t.channelId === c.id).length,
    messageCount: state.messages.filter((m) => m.channelId === c.id).length,
    openTasks: state.tasks.filter(
      (t) => t.channelId === c.id && (t.state === 'ready' || t.state === 'claimed')
    ).length,
  }));
  return NextResponse.json({ ok: true, channels });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    name?: string;
    description?: string;
    as?: string;
  };
  const result = commitBoardMutation((state) => {
    const res = createChannel(
      state,
      body.name || '',
      body.description || '',
      body.as || state.currentUser
    );
    return { result: res, event: res.event };
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result, { status: 201 });
}

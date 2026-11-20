import { NextRequest, NextResponse } from 'next/server';
import { postMessage, sanitizeChannelName } from '@/lib/board-logic';
import { commitBoardMutation, getBoardState } from '@/lib/board-store';
import type { Attachment, MessageFormatting } from '@/lib/board-types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const state = getBoardState();
  const channel = req.nextUrl.searchParams.get('channel')?.trim();
  const threadId = req.nextUrl.searchParams.get('threadId')?.trim();
  const limitRaw = req.nextUrl.searchParams.get('limit');
  const limit = Math.max(1, Math.min(200, Number(limitRaw) || 50));

  let list = state.messages;
  if (threadId) {
    list = list.filter((m) => m.threadId === threadId);
  } else if (channel) {
    const cleanChan = sanitizeChannelName(channel);
    list = list.filter((m) => m.channelId === cleanChan);
  }

  return NextResponse.json({
    ok: true,
    messages: list.slice(-limit),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    channelId?: string;
    threadId?: string;
    body?: string;
    as?: string;
    via?: string;
    attachments?: Attachment[];
    formatting?: MessageFormatting;
  };

  const result = commitBoardMutation((state) => {
    const res = postMessage(state, {
      channelId: body.channelId,
      threadId: body.threadId,
      body: body.body || '',
      asActor: body.as,
      via: body.via,
      attachments: body.attachments,
      formatting: body.formatting,
    });
    return { result: res, event: res.event };
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result, { status: 201 });
}

import { NextRequest } from 'next/server';
import { generateSetupScript } from '@/lib/board-logic';
import { getBoardState } from '@/lib/board-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const state = getBoardState();
  const channel = req.nextUrl.searchParams.get('channel') || 'agent-bridge';
  const origin =
    req.nextUrl.searchParams.get('url') ||
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;

  const script = generateSetupScript({
    boardUrl: origin,
    channel,
    boardName: state.boardName,
  });

  return new Response(script, {
    headers: {
      'Content-Type': 'text/x-shellscript; charset=utf-8',
      'Content-Disposition': 'attachment; filename="setup-board.sh"',
    },
  });
}

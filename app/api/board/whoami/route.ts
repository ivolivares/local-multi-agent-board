import { NextRequest, NextResponse } from 'next/server';
import { getBoardState } from '@/lib/board-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const state = getBoardState();
  const asProfile = req.nextUrl.searchParams.get('as')?.trim() || null;
  const display = asProfile ? `${asProfile} via ${state.currentUser}` : state.currentUser;

  return NextResponse.json({
    ok: true,
    board: state.boardName,
    mode: 'local',
    user: state.currentUser,
    profile: asProfile,
    writesAs: display,
    channels: state.channels.map((c) => ({
      id: c.id,
      name: c.name,
      permissions: ['read', 'post', 'reply', 'react', 'label', 'tasks'],
    })),
  });
}

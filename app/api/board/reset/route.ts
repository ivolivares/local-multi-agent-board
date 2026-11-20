import { NextResponse } from 'next/server';
import { resetBoardState } from '@/lib/board-store';

export const dynamic = 'force-dynamic';

export async function POST() {
  const state = resetBoardState();
  return NextResponse.json({ ok: true, state });
}

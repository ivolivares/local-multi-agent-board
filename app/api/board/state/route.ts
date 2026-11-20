import { NextResponse } from 'next/server';
import { getBoardState } from '@/lib/board-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const state = getBoardState();
  return NextResponse.json(state);
}

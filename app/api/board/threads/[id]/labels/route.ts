import { NextRequest, NextResponse } from 'next/server';
import { updateThreadLabels } from '@/lib/board-logic';
import { commitBoardMutation } from '@/lib/board-store';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = (await req.json()) as {
    add?: string;
    remove?: string;
    set?: string[];
    as?: string;
  };
  const result = commitBoardMutation((state) => {
    const res = updateThreadLabels(state, id, body, body.as || state.currentUser);
    return { result: res, event: res.event };
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}

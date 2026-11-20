import { NextRequest, NextResponse } from 'next/server';
import { performTaskAction } from '@/lib/board-logic';
import { commitBoardMutation } from '@/lib/board-store';
import type { TaskActionType } from '@/lib/board-types';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = (await req.json()) as {
    action?: TaskActionType;
    as?: string;
    via?: string;
    note?: string;
    leaseMinutes?: number;
  };

  const validActions = new Set<TaskActionType>([
    'claim',
    'renew',
    'complete',
    'fail',
    'block',
    'release',
  ]);
  if (!body.action || !validActions.has(body.action)) {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_action', reason: 'Unsupported task action.' } },
      { status: 400 }
    );
  }

  const result = commitBoardMutation((state) => {
    const res = performTaskAction(state, id, body.action!, {
      asActor: body.as,
      via: body.via,
      note: body.note,
      leaseMinutes: body.leaseMinutes,
    });
    return { result: res, event: res.event };
  });

  if (!result.ok) {
    const status =
      result.error?.code === 'task_claimed' || result.error?.code === 'claim_lost'
        ? 409
        : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}

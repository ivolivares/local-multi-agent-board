import { NextRequest, NextResponse } from 'next/server';
import { ensureActor } from '@/lib/board-logic';
import { commitBoardMutation, getBoardState } from '@/lib/board-store';
import type { ActorStatus, AgentCliFlavor } from '@/lib/board-types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const state = getBoardState();
  return NextResponse.json({
    ok: true,
    actors: state.actors,
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    name?: string;
    via?: string;
    kind?: 'person' | 'agent';
    status?: ActorStatus;
    statusMessage?: string;
    cliFlavor?: AgentCliFlavor;
  };
  if (!body.name?.trim()) {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_actor', reason: 'Actor name is required.' } },
      { status: 400 }
    );
  }
  const actor = commitBoardMutation((state) => {
    const { actor: updated, event } = ensureActor(state, {
      name: body.name!,
      via: body.via,
      kind: body.kind,
      status: body.status,
      statusMessage: body.statusMessage,
      cliFlavor: body.cliFlavor,
    });
    return { result: updated, event };
  });

  return NextResponse.json({ ok: true, actor }, { status: 201 });
}

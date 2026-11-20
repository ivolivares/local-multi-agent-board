import { NextRequest, NextResponse } from 'next/server';
import {
  ensureActor,
  postMessage,
  registerLocalAgent,
  removeLocalAgent,
} from '@/lib/board-logic';
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
  let body: {
    name?: string;
    via?: string;
    kind?: 'person' | 'agent';
    status?: ActorStatus;
    statusMessage?: string;
    cliFlavor?: AgentCliFlavor;
    endpointUri?: string;
    announce?: boolean;
    channelId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_json', reason: 'Invalid JSON request body.' } },
      { status: 400 }
    );
  }

  // Dedicated endpoint registration path (from Add Agent window or API clients)
  if (body.endpointUri !== undefined) {
    const mutation = commitBoardMutation((state) => {
      const res = registerLocalAgent(state, {
        name: body.name || '',
        cliFlavor: body.cliFlavor || 'custom',
        endpointUri: body.endpointUri || '',
        via: body.via,
        statusMessage: body.statusMessage,
      });

      if (res.ok && res.data && body.announce) {
        const targetChannel = body.channelId || 'agent-bridge';
        const thread = state.threads.find((t) => t.channelId === targetChannel);
        postMessage(state, {
          channelId: targetChannel,
          threadId: thread?.id,
          asActor: res.data.name,
          via: res.data.via,
          body: `Registered local ${res.data.cliFlavor} endpoint (${res.data.endpointUri}). Listening on #${targetChannel}.`,
        });
      }

      return { result: res, event: res.event };
    });

    if (!mutation.ok) {
      return NextResponse.json(mutation, { status: 400 });
    }
    return NextResponse.json({ ok: true, actor: mutation.data }, { status: 201 });
  }

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

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get('name') || '';
  if (!name.trim()) {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_actor', reason: 'Agent name query param is required.' } },
      { status: 400 }
    );
  }

  const mutation = commitBoardMutation((state) => {
    const res = removeLocalAgent(state, name);
    return { result: res, event: res.event };
  });

  if (!mutation.ok) {
    return NextResponse.json(mutation, { status: 404 });
  }
  return NextResponse.json({ ok: true, removed: mutation.data?.removed });
}

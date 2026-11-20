import test from 'node:test';
import assert from 'node:assert/strict';
import {
  claimNextReadyTask,
  createChannel,
  createInitialBoardState,
  createTask,
  expireStaleLeases,
  extractMentions,
  generateSetupScript,
  parseCliCommand,
  performTaskAction,
  postMessage,
  registerLocalAgent,
  removeLocalAgent,
  toggleReaction,
  updateThreadLabels,
  validateLocalAgentInput,
} from './board-logic';

test('extractMentions parses unique lowercase handles without duplicates', () => {
  const mentions = extractMentions('@Fixer take it. @railly and @fixer check @claude-code!');
  assert.deepEqual(mentions, ['fixer', 'railly', 'claude-code']);
});

test('postMessage creates message, registers new CLI agent, and emits mention alert', () => {
  const now = 1_700_000_000_000;
  const state = createInitialBoardState(now);
  const res = postMessage(
    state,
    {
      channelId: 'agent-bridge',
      threadId: '840',
      body: 'Ready to verify @ctate and @grok',
      asActor: 'gemini-cli',
    },
    now + 1000
  );

  assert.equal(res.ok, true);
  assert.equal(res.data?.message.actorName, 'gemini-cli');
  assert.equal(res.data?.message.via, 'ctate');
  assert.deepEqual(res.data?.message.mentions, ['ctate', 'grok']);
  assert.ok(state.actors.some((a) => a.name === 'gemini-cli' && a.kind === 'agent'));
  assert.equal(state.mentions[0].fromActor, 'gemini-cli');
  assert.equal(state.mentions[0].toActor, 'grok');
});

test('task lease claim, conflict, renew, expiry, and completion work deterministically', () => {
  const t0 = 1_700_000_000_000;
  const state = createInitialBoardState(t0);

  const created = createTask(
    state,
    { channelId: 'agent-bridge', threadId: '840', title: 'Test concurrent agents', leaseMinutes: 5 },
    t0 + 1000
  );
  assert.equal(created.ok, true);
  const taskId = created.data!.id;

  // Claim by grok
  const claimed = performTaskAction(
    state,
    taskId,
    'claim',
    { asActor: 'grok', leaseMinutes: 5 },
    t0 + 2000
  );
  assert.equal(claimed.ok, true);
  assert.equal(claimed.data?.state, 'claimed');
  assert.equal(claimed.data?.claimedBy, 'grok');

  // Second agent attempting to claim gets task_claimed error
  const race = performTaskAction(
    state,
    taskId,
    'claim',
    { asActor: 'antigravity', leaseMinutes: 5 },
    t0 + 3000
  );
  assert.equal(race.ok, false);
  assert.equal(race.error?.code, 'task_claimed');

  // Wrong agent trying to renew gets claim_lost
  const badRenew = performTaskAction(
    state,
    taskId,
    'renew',
    { asActor: 'antigravity' },
    t0 + 4000
  );
  assert.equal(badRenew.ok, false);
  assert.equal(badRenew.error?.code, 'claim_lost');

  // Lease expiration returns task to ready queue
  const expired = expireStaleLeases(state, t0 + 2000 + 6 * 60_000);
  assert.equal(expired.length, 1);
  assert.equal(expired[0].id, taskId);
  assert.equal(expired[0].state, 'ready');

  // Next agent can now claim via --ready
  const nextClaim = claimNextReadyTask(
    state,
    'agent-bridge',
    { asActor: 'antigravity', leaseMinutes: 10 },
    t0 + 2000 + 7 * 60_000
  );
  assert.equal(nextClaim.ok, true);
  assert.equal(nextClaim.data?.claimedBy, 'antigravity');

  // Complete task
  const completed = performTaskAction(
    state,
    nextClaim.data!.id,
    'complete',
    { asActor: 'antigravity', note: 'Verified all 3 CLI flows' },
    t0 + 2000 + 8 * 60_000
  );
  assert.equal(completed.ok, true);
  assert.equal(completed.data?.state, 'completed');
});

test('createChannel, toggleReaction, and updateThreadLabels mutate state cleanly', () => {
  const state = createInitialBoardState(1_700_000_000_000);
  const chan = createChannel(state, 'Local Swarm!', 'Swarm room');
  assert.equal(chan.ok, true);
  assert.equal(chan.data?.channel.id, 'local-swarm');

  const lbl = updateThreadLabels(state, '831', { add: 'status=merged' });
  assert.equal(lbl.ok, true);
  assert.deepEqual(lbl.data?.labels, ['status=merged']);

  const react1 = toggleReaction(state, 'msg_101', '🚀', 'ctate');
  assert.equal(react1.ok, true);
  assert.equal(react1.data?.reactions[0].emoji, '🚀');

  const react2 = toggleReaction(state, 'msg_101', '🚀', 'ctate');
  assert.equal(react2.ok, true);
  assert.equal(react2.data?.reactions.length, 0);
});

test('parseCliCommand handles vercel board and vb syntax with quoted bodies and flags', () => {
  const parsed1 = parseCliCommand(
    'vercel board post agent-bridge "Hello @grok from claude" --as claude-code --json'
  );
  assert.equal(parsed1.verb, 'post');
  assert.deepEqual(parsed1.positionals, ['agent-bridge', 'Hello @grok from claude']);
  assert.equal(parsed1.flags.as, 'claude-code');
  assert.equal(parsed1.flags.json, true);

  const parsed2 = parseCliCommand(
    'vb tasks claim --ready work/checkout --as antigravity --lease 10'
  );
  assert.equal(parsed2.verb, 'tasks');
  assert.equal(parsed2.subverb, 'claim');
  assert.equal(parsed2.flags.ready, true);
  assert.deepEqual(parsed2.positionals, ['work/checkout']);
  assert.equal(parsed2.flags.as, 'antigravity');
  assert.equal(parsed2.flags.lease, '10');
});

test('generateSetupScript outputs runnable bash script with Claude Code, Grok, and Antigravity wiring', () => {
  const script = generateSetupScript({
    boardUrl: 'http://localhost:3000',
    channel: 'agent-bridge',
    boardName: 'local-board',
  });
  assert.ok(script.startsWith('#!/usr/bin/env bash'));
  assert.ok(script.includes('claude-code'));
  assert.ok(script.includes('grok'));
  assert.ok(script.includes('antigravity'));
  assert.ok(script.includes('http://localhost:3000'));
});

test('registerLocalAgent validates name and URI, persists endpointUri, and supports removal', () => {
  const state = createInitialBoardState(1_700_000_000_000);

  // Rejects empty name or invalid protocol
  assert.equal(validateLocalAgentInput({ name: '', endpointUri: 'http://127.0.0.1:4200' }).ok, false);
  assert.equal(validateLocalAgentInput({ name: 'gemini-cli', endpointUri: 'ftp://bad-proto' }).ok, false);
  assert.equal(validateLocalAgentInput({ name: 'gemini-cli', endpointUri: 'not-a-uri' }).ok, false);

  // Registers valid local endpoint
  const res = registerLocalAgent(state, {
    name: 'gemini-cli',
    cliFlavor: 'gemini-cli',
    endpointUri: 'http://127.0.0.1:4200/gemini',
    via: 'ctate',
  });
  assert.equal(res.ok, true);
  assert.equal(res.data?.name, 'gemini-cli');
  assert.equal(res.data?.cliFlavor, 'gemini-cli');
  assert.equal(res.data?.endpointUri, 'http://127.0.0.1:4200/gemini');
  assert.ok(state.actors.some((a) => a.name === 'gemini-cli' && a.endpointUri === 'http://127.0.0.1:4200/gemini'));

  // Rejects collision with existing human member
  const conflict = registerLocalAgent(state, {
    name: 'ctate',
    cliFlavor: 'custom',
    endpointUri: 'stdio://ctate',
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.error?.code, 'actor_conflict');

  // Supports removal
  const removed = removeLocalAgent(state, 'gemini-cli');
  assert.equal(removed.ok, true);
  assert.equal(state.actors.some((a) => a.name === 'gemini-cli'), false);
});


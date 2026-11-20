import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { cliui } from '@poppinss/cliui';
import {
  createBoardStore,
  parseBoardProfileHeader,
  parseDurationSeconds,
} from '../src/store.mjs';
import { startBoardServer } from '../src/server.mjs';
import { runSetup } from '../src/setup.mjs';

test('RFC 8941 x-board-profile header and duration parsers follow Board v1 Specification', () => {
  assert.deepEqual(parseBoardProfileHeader('claude-code'), {
    name: 'claude-code',
    avatar: null,
  });
  assert.deepEqual(
    parseBoardProfileHeader('fixer; avatar="https://example.com/fixer.png"'),
    { name: 'fixer', avatar: 'https://example.com/fixer.png' }
  );
  assert.equal(parseDurationSeconds('5m', 60), 300);
  assert.equal(parseDurationSeconds('45s', 60), 45);
  assert.equal(parseDurationSeconds('1h', 60), 3600);
});

test('SPEC task engine supports needs (waiting->ready), epoch+token claims, claim_lost, block/unblock, fail/reopen', () => {
  const store = createBoardStore({ persist: false });

  // Create prerequisite Task A and dependent Task B
  const a = store.createTask({ channel: 'work/tasks', text: 'Build auth module', as: 'developer' });
  assert.equal(a.ok, true);
  assert.equal(a.task.state, 'ready');

  const b = store.createTask({
    channel: 'work/tasks',
    text: 'Run E2E tests after auth',
    needs: [a.task.id],
    as: 'developer',
  });
  assert.equal(b.ok, true);
  assert.equal(b.task.state, 'waiting');

  // Cannot claim waiting task
  const waitClaim = store.performTaskAction({ taskId: b.task.id, action: 'claim', as: 'grok' });
  assert.equal(waitClaim.ok, false);
  assert.equal(waitClaim.error.code, 'task_waiting');

  // Claim A as claude-code (returns epoch & secret token)
  const claim = store.performTaskAction({
    taskId: a.task.id,
    action: 'claim',
    as: 'claude-code',
    lease: 300,
  });
  assert.equal(claim.ok, true);
  assert.equal(claim.claim.epoch, 1);
  assert.ok(claim.claim.token);

  // Grok cannot claim A while claude-code holds it
  const conflict = store.performTaskAction({
    taskId: a.task.id,
    action: 'claim',
    as: 'grok',
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.error.code, 'task_claimed');

  // Stale token rejected with claim_lost
  const badRenew = store.performTaskAction({
    taskId: a.task.id,
    action: 'renew',
    as: 'claude-code',
    epoch: claim.claim.epoch,
    token: 'invalid-secret',
  });
  assert.equal(badRenew.ok, false);
  assert.equal(badRenew.error.code, 'claim_lost');

  // Complete A with valid epoch + token -> Task B automatically becomes ready!
  const done = store.performTaskAction({
    taskId: a.task.id,
    action: 'complete',
    as: 'claude-code',
    epoch: claim.claim.epoch,
    token: claim.claim.token,
    result: 'Auth module ready',
  });
  assert.equal(done.ok, true);
  assert.equal(done.task.state, 'completed');

  const all = store.listTasks({ channel: 'work/tasks', state: 'all' });
  const bAfter = all.tasks.find((t) => t.id === b.task.id);
  assert.equal(bAfter.state, 'ready');

  // Fail & reopen B
  const failed = store.performTaskAction({
    taskId: b.task.id,
    action: 'fail',
    as: 'grok',
    reason: 'Flaky test',
  });
  assert.equal(failed.ok, true);
  assert.equal(failed.task.state, 'failed');

  const reopened = store.performTaskAction({
    taskId: b.task.id,
    action: 'reopen',
    as: 'developer',
  });
  assert.equal(reopened.ok, true);
  assert.equal(reopened.task.state, 'ready');
});

test('Specification HTTP API routes, discovery, x-board-profile, events cursor, and lb setup work end-to-end', async () => {
  const started = await startBoardServer({ port: 0, persist: false });
  try {
    // 1. Discovery
    const disc = await (await fetch(`${started.url}/api/board`)).json();
    assert.equal(disc.version, '1');
    assert.equal(disc.mode, 'local');

    // 2. /me with RFC 8941 x-board-profile header
    const me = await (
      await fetch(`${started.url}/api/board/me`, {
        headers: { 'x-board-profile': 'grok; avatar="https://example.com/grok.png"' },
      })
    ).json();
    assert.equal(me.handle, 'grok');
    assert.equal(me.actor.avatar, 'https://example.com/grok.png');
    assert.ok(Array.isArray(me.can['*']));

    // 3. Channel create
    const chRes = await fetch(`${started.url}/api/board/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'ops/deploy' }),
    });
    assert.equal(chRes.status, 201);

    // 4. Idempotent message post + edit + react + reserved_label check
    const post1 = await (
      await fetch(`${started.url}/api/board/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-board-profile': 'claude-code' },
        body: JSON.stringify({ channel: 'ops/deploy', text: 'Ship v1', id: 'req-123' }),
      })
    ).json();
    const post2 = await (
      await fetch(`${started.url}/api/board/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-board-profile': 'claude-code' },
        body: JSON.stringify({ channel: 'ops/deploy', text: 'Ship v1', id: 'req-123' }),
      })
    ).json();
    assert.equal(post1.message.id, post2.message.id);

    const reserved = await fetch(`${started.url}/api/board/messages/${post1.message.id}/labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ set: { 'board.task': 'completed' } }),
    });
    assert.equal(reserved.status, 400);
    const reservedJson = await reserved.json();
    assert.equal(reservedJson.error.code, 'reserved_label');

    // 5. Monotonic events cursor feed
    const evRes = await (await fetch(`${started.url}/api/board/events?after=1`)).json();
    assert.equal(evRes.ok, true);
    assert.ok(evRes.events.length > 0);
    assert.ok(Number(evRes.cursor) >= 2);

    // 6. Inspector HTML
    const html = await (await fetch(`${started.url}/`)).text();
    assert.match(html, /Local Multi-Agent Board/);
    assert.match(html, /MIT/);

    // 7. lb setup renders @poppinss/cliui output cleanly
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-setup-test-'));
    const ui = cliui({ mode: 'raw' });
    const setupRes = await runSetup({
      ui,
      baseUrl: started.url,
      channel: 'agent-bridge',
      cwd: tmpDir,
      handshake: true,
    });
    assert.equal(setupRes.ok, true);
    assert.equal(setupRes.serverOnline, true);
    assert.equal(fs.existsSync(path.join(tmpDir, '.local-board', 'board.env')), true);
    const envContent = fs.readFileSync(path.join(tmpDir, '.local-board', 'board.env'), 'utf8');
    assert.match(envContent, /BOARD_URL=/);
    assert.ok(ui.logger.getLogs().length > 0);
  } finally {
    await started.close();
  }
});

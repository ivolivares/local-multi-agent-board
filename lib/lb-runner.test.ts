import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAnsiToLines,
  tokenizeShellArgs,
  validateLbCommand,
} from './lb-runner';

test('tokenizeShellArgs preserves quoted strings cleanly', () => {
  assert.deepEqual(
    tokenizeShellArgs('lb post agent-bridge "hello @grok" --as claude-code'),
    ['lb', 'post', 'agent-bridge', 'hello @grok', '--as', 'claude-code']
  );
});

test('validateLbCommand allows safe lb subcommands and strips sandbox-sensitive flags', () => {
  const ok1 = validateLbCommand('npx local-board status --url http://evil.test');
  assert.equal(ok1.ok, true);
  if (ok1.ok) {
    assert.equal(ok1.verb, 'status');
    assert.deepEqual(ok1.args, ['status']);
  }

  const ok2 = validateLbCommand('lb conformance');
  assert.equal(ok2.ok, true);
  if (ok2.ok) {
    assert.equal(ok2.verb, 'conformance');
  }

  const blocked = validateLbCommand('lb rm -rf /');
  assert.equal(blocked.ok, false);
});

test('parseAnsiToLines decodes @poppinss/cliui ANSI colors and styles', () => {
  const lines = parseAnsiToLines('\x1b[36mclaude-code\x1b[39m \x1b[1m\x1b[32mPASS\x1b[0m\nplain');
  assert.equal(lines.length, 2);
  assert.equal(lines[0][0].text, 'claude-code');
  assert.equal(lines[0][0].color, 'cyan');
  assert.equal(lines[0][2].text, 'PASS');
  assert.equal(lines[0][2].color, 'green');
  assert.equal(lines[0][2].bold, true);
  assert.equal(lines[1][0].text, 'plain');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialBoardState } from './board-logic';
import { executePromptCommand } from './cmd-simulator';
import { getThemeById, resolveThemeAlias } from './desktop-themes';
import { buildSimulatedAgentReplies } from './agent-emulator';

test('ping command returns per-agent latency for specific agent and full mesh', () => {
  const state = createInitialBoardState(1_700_000_000_000);

  const single = executePromptCommand('ping claude-code', state, 'agent-bridge');
  assert.equal(single.kind, 'output');
  assert.ok(single.lines.some((l) => l.text.includes('Pinging claude-code')));
  assert.ok(single.lines.some((l) => l.text.includes('0% loss')));

  const mesh = executePromptCommand('ping', state, 'agent-bridge');
  assert.equal(mesh.kind, 'output');
  assert.ok(mesh.lines.some((l) => l.text.includes('grok')));
  assert.ok(mesh.lines.some((l) => l.text.includes('antigravity')));

  const unknown = executePromptCommand('ping ghost-bot', state, 'agent-bridge');
  assert.equal(unknown.kind, 'output');
  assert.ok(unknown.lines.some((l) => l.tone === 'error'));
});

test('status, theme, demo swarm, and vb forwarding parse deterministically', () => {
  const state = createInitialBoardState(1_700_000_000_000);

  const statusRes = executePromptCommand('status', state, 'agent-bridge');
  assert.equal(statusRes.kind, 'output');
  assert.ok(statusRes.lines.some((l) => l.text.includes('LOCAL MULTI-AGENT BOARD DAEMON STATUS')));
  assert.ok(statusRes.lines.some((l) => l.text.includes('claude-code')));

  const lbStatusRes = executePromptCommand('lb status', state, 'agent-bridge');
  assert.equal(lbStatusRes.kind, 'forward_lb_cli');
  assert.equal(lbStatusRes.command, 'lb status');

  const lbAttachRes = executePromptCommand('lb attach --as grok', state, 'agent-bridge');
  assert.equal(lbAttachRes.kind, 'enter_lb_attach');
  assert.equal(lbAttachRes.asActor, 'grok');

  const themeRes = executePromptCommand('theme desert', state, 'agent-bridge');
  assert.equal(themeRes.kind, 'set_theme');
  assert.equal(themeRes.themeId, 'desert-high-contrast');

  const swarmRes = executePromptCommand('demo swarm', state, 'agent-bridge');
  assert.equal(swarmRes.kind, 'run_swarm_demo');

  const vbRes = executePromptCommand('vb whoami --as grok', state, 'agent-bridge');
  assert.equal(vbRes.kind, 'forward_vb_cli');
  assert.equal(vbRes.command, 'vb whoami --as grok');
});

test('desktop theme helpers resolve aliases and fallback safely', () => {
  assert.equal(resolveThemeAlias('Classic Blue'), 'classic-blue');
  assert.equal(resolveThemeAlias('desert'), 'desert-high-contrast');
  assert.equal(resolveThemeAlias('dark-slate'), 'dark-slate');
  assert.equal(getThemeById('dark-slate').name, 'Dark Slate');
  assert.equal(getThemeById('nonexistent').id, 'classic-teal');
});

test('agent emulator responds to human mentions without infinite agent loops', () => {
  const state = createInitialBoardState(1_700_000_000_000);

  const replies = buildSimulatedAgentReplies(
    '@claude-code @grok check the new auth middleware',
    'ctate',
    'agent-bridge',
    state.actors
  );
  assert.equal(replies.length, 2);
  assert.equal(replies[0].actorName, 'claude-code');
  assert.equal(replies[1].actorName, 'grok');

  const agentLoop = buildSimulatedAgentReplies(
    '@grok handing off',
    'claude-code',
    'agent-bridge',
    state.actors
  );
  assert.equal(agentLoop.length, 0);
});

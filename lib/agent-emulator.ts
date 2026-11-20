import type { Actor } from './board-types';
import { extractMentions } from './board-logic';

export interface SimulatedAgentReply {
  actorName: string;
  body: string;
  delayMs: number;
}

const AGENT_RESPONSES: Record<string, (prompt: string, channelId: string) => string> = {
  'claude-code': (prompt, channelId) =>
    `Ack in #${channelId} (via local vb CLI). Audited "${prompt.slice(0, 64)}${prompt.length > 64 ? '...' : ''}" — drafted clean patch, type-check passes, handing off to @grok for edge-case review.`,
  grok: (prompt, channelId) =>
    `grok CLI checked #${channelId}: fuzzed edge cases around "${prompt.slice(0, 56)}${prompt.length > 56 ? '...' : ''}" — 0 lease race conflicts found. @antigravity ready for browser verification.`,
  antigravity: (prompt, channelId) =>
    `gemini antigravity CLI verified #${channelId}: headless Chromium pass clean (0 console errors) for "${prompt.slice(0, 52)}${prompt.length > 52 ? '...' : ''}". Ready to settle task.`,
  fixer: (prompt, channelId) =>
    `fixer CLI picked up signal in #${channelId}: isolated regression for "${prompt.slice(0, 52)}${prompt.length > 52 ? '...' : ''}" and queued regression unit test.`,
  scout: (_prompt, channelId) =>
    `scout CLI scanned #${channelId} history and open threads — no duplicate claims or stale leases blocking this work.`,
  reviewer: (_prompt, channelId) =>
    `reviewer CLI inspected #${channelId} diff summary — looks tight and adheres to board safety rules. Approved to proceed.`,
};

export function buildSimulatedAgentReplies(
  userBody: string,
  senderActorName: string,
  channelId: string,
  actors: Actor[]
): SimulatedAgentReply[] {
  const sender = actors.find((a) => a.name.toLowerCase() === senderActorName.toLowerCase());
  // Only auto-reply to human messages so agents never create infinite reply loops
  if (sender && sender.kind === 'agent') {
    return [];
  }

  const mentions = extractMentions(userBody);
  const agentNames = new Set(
    actors.filter((a) => a.kind === 'agent').map((a) => a.name.toLowerCase())
  );

  const mentionedAgents = mentions.filter((m) => agentNames.has(m));
  if (mentionedAgents.length === 0) {
    return [];
  }

  return mentionedAgents.slice(0, 3).map((agentName, idx) => {
    const formatter = AGENT_RESPONSES[agentName];
    const body = formatter
      ? formatter(userBody, channelId)
      : `${agentName} CLI received your ping in #${channelId} and synced thread context via local board bridge.`;
    return {
      actorName: agentName,
      body,
      delayMs: 750 + idx * 950,
    };
  });
}

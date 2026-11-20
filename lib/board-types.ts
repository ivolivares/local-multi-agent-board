export type ActorKind = 'person' | 'agent';

export type ActorStatus = 'online' | 'busy' | 'listening' | 'away';

export type AgentCliFlavor =
  | 'claude-code'
  | 'grok'
  | 'gemini-antigravity'
  | 'fixer'
  | 'scout'
  | 'deployer'
  | 'reviewer'
  | 'custom';

export interface Actor {
  id: string;
  name: string;
  kind: ActorKind;
  via?: string; // e.g. "ctate" for agents writing under a human handle
  isCurrentUser?: boolean;
  status: ActorStatus;
  statusMessage: string;
  cliFlavor?: AgentCliFlavor;
  avatarKey: string;
  activeTaskId?: string | null;
  lastSeenAt: number;
}

export interface Channel {
  id: string;
  name: string; // e.g. "agent-bridge", "screen-relay", "work/checkout"
  description: string;
  createdAt: number;
}

export interface Thread {
  id: string; // opaque numeric/string ID like "831", "840"
  channelId: string;
  title: string;
  labels: string[]; // e.g. ["status=fixing", "bridge=local"]
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface Attachment {
  id: string;
  name: string;
  sizeLabel: string;
  contentType: string;
  previewText?: string;
}

export interface Reaction {
  emoji: string;
  actors: string[];
}

export interface MessageFormatting {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  size?: 'sm' | 'md' | 'lg';
  accent?: 'default' | 'blue';
}

export type MessageKind = 'message' | 'system' | 'task_event';

export interface Message {
  id: string;
  threadId: string;
  channelId: string;
  actorName: string;
  via?: string;
  kind: MessageKind;
  body: string;
  mentions: string[];
  attachments: Attachment[];
  reactions: Reaction[];
  formatting?: MessageFormatting;
  createdAt: number;
}

export type TaskState = 'ready' | 'claimed' | 'blocked' | 'completed' | 'failed';

export interface BoardTask {
  id: string;
  channelId: string;
  threadId: string;
  title: string;
  state: TaskState;
  createdBy: string;
  claimedBy?: string | null;
  claimedVia?: string | null;
  leaseMinutes: number;
  leaseExpiresAt?: number | null;
  resultNote?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface MentionAlert {
  id: string;
  fromActor: string;
  fromVia?: string;
  toActor: string;
  channelId: string;
  threadId: string;
  messageId: string;
  snippet: string;
  createdAt: number;
  dismissed?: boolean;
}

export type BoardEventType =
  | 'message.posted'
  | 'reaction.updated'
  | 'label.updated'
  | 'task.created'
  | 'task.claimed'
  | 'task.renewed'
  | 'task.completed'
  | 'task.failed'
  | 'task.blocked'
  | 'task.released'
  | 'actor.updated'
  | 'channel.created'
  | 'thread.created';

export interface BoardEvent {
  id: string;
  seq: number;
  type: BoardEventType;
  channelId?: string;
  threadId?: string;
  actor: string;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

export interface BoardState {
  boardName: string;
  currentUser: string;
  nextSeq: number;
  nextThreadNum: number;
  nextTaskNum: number;
  nextMessageNum: number;
  actors: Actor[];
  channels: Channel[];
  threads: Thread[];
  messages: Message[];
  tasks: BoardTask[];
  mentions: MentionAlert[];
  events: BoardEvent[];
}

export type TaskActionType =
  | 'claim'
  | 'renew'
  | 'complete'
  | 'fail'
  | 'block'
  | 'release';

export interface MutationResult<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    reason: string;
    next?: string[];
  };
  event?: BoardEvent;
}

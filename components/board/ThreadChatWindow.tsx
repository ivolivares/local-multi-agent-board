'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AtSign,
  Bold,
  CheckSquare,
  Info,
  Italic,
  Link2,
  Paperclip,
  SendHorizontal,
  Smile,
  Tag,
  Underline,
} from 'lucide-react';
import type {
  Actor,
  Attachment,
  Message,
  MessageFormatting,
  Thread,
} from '@/lib/board-types';
import { ActorAvatar } from './ActorAvatar';

interface ThreadChatWindowProps {
  thread: Thread;
  messages: Message[];
  actors: Actor[];
  currentUser: string;
  composerText: string;
  composerInputRef: React.RefObject<HTMLTextAreaElement | null>;
  postAsActor: string;
  onPostAsChange: (actorName: string) => void;
  onComposerChange: (val: string) => void;
  onSendMessage: (
    body: string,
    formatting: MessageFormatting,
    asActor: string
  ) => Promise<void>;
  onToggleReaction: (messageId: string, emoji: string) => Promise<void>;
  onSelectActor: (actorName: string) => void;
  onOpenLabelDialog: () => void;
  onOpenTaskDialog: () => void;
  onOpenAttachDialog: () => void;
  onOpenNewThread: () => void;
  onOpenSetupScript: () => void;
  onPreviewAttachment: (att: Attachment) => void;
  onOpenInfo: () => void;
}

const QUICK_EMOJIS = ['👍', '🚀', '👀', '✅', '🔥'];

function formatMsgTime(ts: number): string {
  const d = new Date(ts);
  let hours = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${mins} ${ampm}`;
}

export function ThreadChatWindow({
  thread,
  messages,
  actors,
  currentUser,
  composerText,
  composerInputRef,
  postAsActor,
  onPostAsChange,
  onComposerChange,
  onSendMessage,
  onToggleReaction,
  onSelectActor,
  onOpenLabelDialog,
  onOpenTaskDialog,
  onOpenAttachDialog,
  onOpenNewThread,
  onOpenSetupScript,
  onPreviewAttachment,
  onOpenInfo,
}: ThreadChatWindowProps) {
  const [formatting, setFormatting] = useState<MessageFormatting>({
    bold: false,
    italic: false,
    underline: false,
    size: 'md',
    accent: 'default',
  });
  const [openMenu, setOpenMenu] = useState<
    null | 'file' | 'edit' | 'insert' | 'people' | 'labels'
  >(null);
  const [showReactBar, setShowReactBar] = useState(false);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const [composerErr, setComposerErr] = useState('');
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, thread.id]);

  // Determine top 2 non-current-user active participants for the right portrait rail (authentic AIM layout)
  const railParticipants = useMemo(() => {
    const seen = new Set<string>();
    const list: Actor[] = [];
    for (const msg of messages) {
      if (msg.actorName === postAsActor || seen.has(msg.actorName)) continue;
      const found = actors.find((a) => a.name === msg.actorName);
      if (found) {
        seen.add(found.name);
        list.push(found);
      }
      if (list.length >= 3) break;
    }
    if (list.length < 2) {
      for (const a of actors) {
        if (a.name !== postAsActor && !seen.has(a.name)) {
          seen.add(a.name);
          list.push(a);
        }
        if (list.length >= 2) break;
      }
    }
    return list;
  }, [messages, actors, postAsActor]);

  const senderActor =
    actors.find((a) => a.name === postAsActor) ||
    actors.find((a) => a.name === currentUser) ||
    null;

  const insertToken = (token: string) => {
    const prefix = composerText && !composerText.endsWith(' ') ? `${composerText} ` : composerText;
    onComposerChange(`${prefix}${token} `);
    setShowMentionPicker(false);
    composerInputRef.current?.focus();
  };

  const handleSubmit = async () => {
    if (!composerText.trim()) {
      setComposerErr('Type a message before sending.');
      return;
    }
    setComposerErr('');
    setSending(true);
    try {
      await onSendMessage(composerText.trim(), formatting, postAsActor);
      onComposerChange('');
    } finally {
      setSending(false);
    }
  };

  const renderMessageBody = (msg: Message) => {
    const parts = msg.body.split(/(@[a-zA-Z0-9][a-zA-Z0-9._-]{0,31})/g);
    const sizeCls =
      msg.formatting?.size === 'sm'
        ? 'text-[13px]'
        : msg.formatting?.size === 'lg'
          ? 'text-[17px]'
          : 'text-[15px]';

    return (
      <span
        className={`font-editorial leading-[1.42] ${sizeCls} ${
          msg.formatting?.bold ? 'font-bold' : ''
        } ${msg.formatting?.italic ? 'italic' : ''} ${
          msg.formatting?.underline ? 'underline' : ''
        } ${msg.formatting?.accent === 'blue' ? 'text-[#0000a0]' : 'text-[#0a0a0a]'}`}
      >
        {parts.map((part, idx) => {
          if (part.startsWith('@') && part.length > 1) {
            const handle = part.slice(1).toLowerCase();
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onSelectActor(handle)}
                className="mx-0.5 inline-block bg-[#000000] px-1.5 py-[1px] font-editorial font-bold italic text-white leading-tight hover:bg-[#000080]"
              >
                {part}
              </button>
            );
          }
          return <React.Fragment key={idx}>{part}</React.Fragment>;
        })}
      </span>
    );
  };

  const lastMessage = messages[messages.length - 1];

  return (
    <div
      className="flex flex-1 flex-col min-h-0 bg-[#c0c0c0] relative"
      onClick={() => {
        if (openMenu) setOpenMenu(null);
      }}
    >
      {/* Classic Menu Bar + Right-Aligned Thread Labels */}
      <div className="flex items-center justify-between gap-2 px-1.5 py-0.5 border-b border-[#808080] text-[12px] shrink-0 relative">
        <div className="flex items-center gap-0.5">
          {(
            [
              { id: 'file', label: 'File' },
              { id: 'edit', label: 'Edit' },
              { id: 'insert', label: 'Insert' },
              { id: 'people', label: 'People' },
              { id: 'labels', label: 'Labels' },
            ] as const
          ).map((item) => (
            <div key={item.id} className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenu((prev) => (prev === item.id ? null : item.id));
                }}
                className={`px-1.5 py-0.5 text-[12px] whitespace-nowrap ${
                  openMenu === item.id
                    ? 'bg-[#000080] text-white'
                    : 'text-[#000000] hover:bg-[#000080] hover:text-white'
                }`}
              >
                <span className="underline">{item.label[0]}</span>
                {item.label.slice(1)}
              </button>

              {openMenu === item.id && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="win98-window absolute left-0 top-full mt-0.5 z-50 min-w-[175px] py-1 text-[12px] text-[#000000]"
                >
                  {item.id === 'file' && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenu(null);
                          onOpenNewThread();
                        }}
                        className="block w-full px-3 py-1 text-left hover:bg-[#000080] hover:text-white"
                      >
                        New Thread...
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenu(null);
                          onOpenSetupScript();
                        }}
                        className="block w-full px-3 py-1 text-left hover:bg-[#000080] hover:text-white"
                      >
                        Board Setup Script...
                      </button>
                    </>
                  )}
                  {item.id === 'edit' && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          onComposerChange('');
                          setOpenMenu(null);
                        }}
                        className="block w-full px-3 py-1 text-left hover:bg-[#000080] hover:text-white"
                      >
                        Clear Composer
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(thread.id);
                          setOpenMenu(null);
                        }}
                        className="block w-full px-3 py-1 text-left hover:bg-[#000080] hover:text-white"
                      >
                        Copy Thread ID ({thread.id})
                      </button>
                    </>
                  )}
                  {item.id === 'insert' && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenu(null);
                          setShowMentionPicker(true);
                        }}
                        className="block w-full px-3 py-1 text-left hover:bg-[#000080] hover:text-white"
                      >
                        Mention Agent (@)...
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenu(null);
                          onOpenAttachDialog();
                        }}
                        className="block w-full px-3 py-1 text-left hover:bg-[#000080] hover:text-white"
                      >
                        Attach File / Trace...
                      </button>
                    </>
                  )}
                  {item.id === 'people' && (
                    <div className="py-0.5">
                      <div className="px-3 py-0.5 text-[11px] font-bold text-[#555555]">
                        Write messages as:
                      </div>
                      {actors.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => {
                            onPostAsChange(a.name);
                            setOpenMenu(null);
                          }}
                          className={`flex w-full items-center justify-between px-3 py-1 text-left hover:bg-[#000080] hover:text-white ${
                            postAsActor === a.name ? 'font-bold' : ''
                          }`}
                        >
                          <span>
                            {a.name}
                            {a.via ? ` via ${a.via}` : ''}
                          </span>
                          {postAsActor === a.name && <span>✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {item.id === 'labels' && (
                    <button
                      type="button"
                      onClick={() => {
                        setOpenMenu(null);
                        onOpenLabelDialog();
                      }}
                      className="block w-full px-3 py-1 text-left hover:bg-[#000080] hover:text-white"
                    >
                      Edit Thread Labels...
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onOpenLabelDialog}
          className="text-[12px] text-[#222222] hover:text-[#000080] hover:underline truncate max-w-[260px] shrink-0"
          title="Click to edit thread labels"
        >
          {thread.labels.length > 0 ? thread.labels.join(' · ') : 'status=open'}
        </button>
      </div>

      {/* Main Transcript + Right Portrait Rail */}
      <div className="flex flex-1 min-h-0 gap-2 px-1.5 pt-1.5">
        <div
          data-testid="chat-transcript"
          className="flex-1 min-w-0 win98-sunken overflow-y-auto win98-scroll p-2.5 space-y-2 select-text"
        >
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-[#555555] space-y-2 py-8">
              <p className="font-editorial text-[15px]">
                No messages in <strong>#{thread.channelId}</strong> (thread {thread.id}) yet.
              </p>
              <p className="text-[12px]">
                Post below or connect Claude Code, Grok, and Antigravity using{' '}
                <code className="font-code bg-[#efefef] px-1">vb post {thread.channelId}</code>.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              if (msg.kind === 'task_event' || msg.kind === 'system') {
                return (
                  <div
                    key={msg.id}
                    className="font-editorial italic text-[14px] text-[#008000] leading-snug"
                  >
                    {msg.body}
                  </div>
                );
              }

              const isAgent = Boolean(msg.via);
              const isCurrentUser = msg.actorName === currentUser;
              const authorColor = isAgent
                ? 'text-[#6b21a8]'
                : isCurrentUser
                  ? 'text-[#000080]'
                  : 'text-[#a80000]';

              return (
                <div key={msg.id} className="leading-[1.45] break-words group">
                  <button
                    type="button"
                    onClick={() => onSelectActor(msg.actorName)}
                    className={`font-editorial font-bold text-[15px] hover:underline ${authorColor}`}
                  >
                    {msg.actorName}
                  </button>
                  {msg.via && (
                    <span className="font-editorial text-[13px] text-[#666666] ml-1">
                      via {msg.via}
                    </span>
                  )}{' '}
                  <span
                    suppressHydrationWarning
                    className="font-editorial text-[13px] text-[#444444] tabular-nums"
                  >
                    ({formatMsgTime(msg.createdAt)}):
                  </span>{' '}
                  {renderMessageBody(msg)}

                  {msg.attachments.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-2">
                      {msg.attachments.map((att) => (
                        <button
                          key={att.id}
                          type="button"
                          onClick={() => onPreviewAttachment(att)}
                          className="font-editorial text-[14px] text-[#0000ee] underline hover:text-[#551a8b]"
                        >
                          {att.name} ({att.sizeLabel})
                        </button>
                      ))}
                    </div>
                  )}

                  {msg.reactions.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      {msg.reactions.map((r) => (
                        <button
                          key={r.emoji}
                          type="button"
                          onClick={() => onToggleReaction(msg.id, r.emoji)}
                          className="inline-flex items-center gap-1 border border-[#c0c0c0] bg-[#f4f4f4] px-1.5 py-0 text-[11px] hover:bg-[#e4e4e4] tabular-nums"
                          title={`Reacted by: ${r.actors.join(', ')}`}
                        >
                          <span>{r.emoji}</span>
                          <span>{r.actors.length}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={transcriptEndRef} />
        </div>

        {/* Right Portrait Column (matches reference video) */}
        <aside
          aria-label="Thread participants"
          className="hidden sm:flex w-[74px] shrink-0 flex-col items-center gap-2.5 pt-0.5"
        >
          {railParticipants.slice(0, 2).map((actor) => (
            <button
              key={actor.id}
              type="button"
              onClick={() => onSelectActor(actor.name)}
              className="flex flex-col items-center gap-1 group focus-visible:outline-1 focus-visible:outline-black"
              aria-label={`Inspect ${actor.name}`}
            >
              <div className="win98-sunken p-[2px]">
                <ActorAvatar actor={actor} size="lg" />
              </div>
              <span className="text-[11px] text-[#111111] truncate max-w-[72px] group-hover:underline">
                {actor.name}
              </span>
            </button>
          ))}
        </aside>
      </div>

      {/* Formatting Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 px-1.5 pt-1.5 pb-1 shrink-0 relative">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            aria-label="Blue text color"
            aria-pressed={formatting.accent === 'blue'}
            onClick={() =>
              setFormatting((f) => ({
                ...f,
                accent: f.accent === 'blue' ? 'default' : 'blue',
              }))
            }
            className={`h-[24px] w-[24px] flex items-center justify-center font-editorial font-bold text-[13px] text-[#0000cc] ${
              formatting.accent === 'blue' ? 'win98-button-pressed' : 'win98-button'
            }`}
          >
            A
          </button>
          <button
            type="button"
            aria-label="Standard black text color"
            aria-pressed={formatting.accent === 'default'}
            onClick={() => setFormatting((f) => ({ ...f, accent: 'default' }))}
            className="h-[24px] w-[24px] flex items-center justify-center bg-[#000000] text-white font-editorial font-bold text-[13px] border border-[#808080]"
          >
            A
          </button>
          <button
            type="button"
            aria-label="Small text"
            onClick={() => setFormatting((f) => ({ ...f, size: 'sm' }))}
            className={`h-[24px] w-[24px] flex items-center justify-center font-editorial font-bold text-[10px] ${
              formatting.size === 'sm' ? 'win98-button-pressed' : 'win98-button'
            }`}
          >
            A
          </button>
          <button
            type="button"
            aria-label="Medium text"
            onClick={() => setFormatting((f) => ({ ...f, size: 'md' }))}
            className={`h-[24px] w-[24px] flex items-center justify-center font-editorial font-bold text-[13px] ${
              formatting.size === 'md' ? 'win98-button-pressed' : 'win98-button'
            }`}
          >
            A
          </button>
          <button
            type="button"
            aria-label="Large text"
            onClick={() => setFormatting((f) => ({ ...f, size: 'lg' }))}
            className={`h-[24px] w-[24px] flex items-center justify-center font-editorial font-bold text-[16px] ${
              formatting.size === 'lg' ? 'win98-button-pressed' : 'win98-button'
            }`}
          >
            A
          </button>

          <span className="mx-0.5 h-5 w-[2px] border-l border-[#808080] border-r border-r-white" />

          <button
            type="button"
            aria-label="Bold"
            aria-pressed={Boolean(formatting.bold)}
            onClick={() => setFormatting((f) => ({ ...f, bold: !f.bold }))}
            className={`h-[24px] w-[24px] flex items-center justify-center ${
              formatting.bold ? 'win98-button-pressed' : 'win98-button'
            }`}
          >
            <Bold size={13} strokeWidth={2.8} />
          </button>
          <button
            type="button"
            aria-label="Italic"
            aria-pressed={Boolean(formatting.italic)}
            onClick={() => setFormatting((f) => ({ ...f, italic: !f.italic }))}
            className={`h-[24px] w-[24px] flex items-center justify-center ${
              formatting.italic ? 'win98-button-pressed' : 'win98-button'
            }`}
          >
            <Italic size={13} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            aria-label="Underline"
            aria-pressed={Boolean(formatting.underline)}
            onClick={() => setFormatting((f) => ({ ...f, underline: !f.underline }))}
            className={`h-[24px] w-[24px] flex items-center justify-center ${
              formatting.underline ? 'win98-button-pressed' : 'win98-button'
            }`}
          >
            <Underline size={13} strokeWidth={2.5} />
          </button>

          <span className="mx-0.5 h-5 w-[2px] border-l border-[#808080] border-r border-r-white" />

          <button
            type="button"
            aria-label="Insert thread reference link"
            onClick={() => insertToken(`#${thread.channelId}:${thread.id}`)}
            className="win98-button h-[24px] w-[24px] flex items-center justify-center"
          >
            <Link2 size={13} />
          </button>
          <button
            type="button"
            aria-label="Insert emoji"
            onClick={() => insertToken('👍')}
            className="win98-button h-[24px] w-[24px] flex items-center justify-center"
          >
            <Smile size={13} />
          </button>
          <button
            type="button"
            aria-label="Mention an agent or person"
            onClick={() => setShowMentionPicker((v) => !v)}
            className={`h-[24px] w-[24px] flex items-center justify-center ${
              showMentionPicker ? 'win98-button-pressed' : 'win98-button'
            }`}
          >
            <AtSign size={13} />
          </button>
        </div>

        {/* Compact Write-As Selector for testing multi-agent CLI personas */}
        <label className="flex items-center gap-1 text-[11px] text-[#222222] shrink-0">
          <span>Post as:</span>
          <select
            aria-label="Post message as actor"
            value={postAsActor}
            onChange={(e) => onPostAsChange(e.target.value)}
            className="bg-white border border-[#808080] px-1.5 py-0.5 text-[11px] text-[#000000]"
          >
            {actors.map((a) => (
              <option key={a.id} value={a.name}>
                {a.name}
                {a.via ? ` via ${a.via}` : ' (me)'}
              </option>
            ))}
          </select>
        </label>

        {showMentionPicker && (
          <div className="win98-window absolute left-2 bottom-full mb-1 z-40 p-1.5 flex flex-wrap gap-1 max-w-[340px]">
            {actors.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => insertToken(`@${a.name}`)}
                className="win98-button px-2 py-0.5 text-[11px] font-medium hover:bg-[#000080] hover:text-white"
              >
                @{a.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Message Composer + User Avatar */}
      <div className="flex items-stretch gap-2 px-1.5 shrink-0">
        <div className="flex-1 min-w-0 flex flex-col">
          <textarea
            ref={composerInputRef}
            aria-label={`Message to #${thread.channelId} thread ${thread.id}`}
            rows={2}
            value={composerText}
            onChange={(e) => {
              onComposerChange(e.target.value);
              if (composerErr) setComposerErr('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder={`Write to #${thread.channelId}... (try @claude-code @grok @antigravity)`}
            className={`w-full h-[64px] win98-sunken p-2 font-editorial text-[14px] text-[#000000] resize-none focus:outline-none ${
              formatting.bold ? 'font-bold' : ''
            } ${formatting.italic ? 'italic' : ''} ${
              formatting.underline ? 'underline' : ''
            } ${formatting.accent === 'blue' ? 'text-[#0000a0]' : ''}`}
          />
          {composerErr && (
            <p className="mt-0.5 text-[11px] text-[#a80000]" role="alert">
              {composerErr}
            </p>
          )}
        </div>

        <div className="hidden sm:flex w-[74px] shrink-0 items-center justify-center">
          <div className="win98-sunken p-[2px]" title={`Posting as ${postAsActor}`}>
            <ActorAvatar actor={senderActor} name={postAsActor} size="lg" />
          </div>
        </div>
      </div>

      {/* Quick Reaction Popover */}
      {showReactBar && lastMessage && (
        <div className="mx-1.5 mt-1 win98-raised px-2 py-1 flex items-center justify-between gap-2 text-[11px]">
          <span className="truncate text-[#222222]">
            React to latest message by <strong>{lastMessage.actorName}</strong>:
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {QUICK_EMOJIS.map((em) => (
              <button
                key={em}
                type="button"
                onClick={async () => {
                  await onToggleReaction(lastMessage.id, em);
                  setShowReactBar(false);
                }}
                className="win98-button px-1.5 py-0.5 text-[13px]"
                aria-label={`React with ${em}`}
              >
                {em}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Action Bar: React | Label | Task | Attach | Info  ---  Send */}
      <div className="flex items-center justify-between gap-2 px-1.5 py-1.5 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setShowReactBar((v) => !v)}
            className={`min-w-[54px] flex flex-col items-center justify-center gap-0.5 px-2 py-1 text-[11px] whitespace-nowrap shrink-0 ${
              showReactBar ? 'win98-button-pressed' : 'win98-button'
            }`}
          >
            <Smile size={16} className="text-[#000080]" />
            <span>React</span>
          </button>
          <button
            type="button"
            onClick={onOpenLabelDialog}
            className="win98-button min-w-[54px] flex flex-col items-center justify-center gap-0.5 px-2 py-1 text-[11px] whitespace-nowrap shrink-0"
          >
            <Tag size={16} className="text-[#000080]" />
            <span>Label</span>
          </button>
          <button
            type="button"
            onClick={onOpenTaskDialog}
            className="win98-button min-w-[54px] flex flex-col items-center justify-center gap-0.5 px-2 py-1 text-[11px] whitespace-nowrap shrink-0"
          >
            <CheckSquare size={16} className="text-[#000080]" />
            <span>Task</span>
          </button>
          <button
            type="button"
            onClick={onOpenAttachDialog}
            className="win98-button min-w-[54px] flex flex-col items-center justify-center gap-0.5 px-2 py-1 text-[11px] whitespace-nowrap shrink-0"
          >
            <Paperclip size={16} className="text-[#000080]" />
            <span>Attach</span>
          </button>
          <button
            type="button"
            onClick={onOpenInfo}
            className="win98-button min-w-[54px] flex flex-col items-center justify-center gap-0.5 px-2 py-1 text-[11px] whitespace-nowrap shrink-0"
          >
            <Info size={16} className="text-[#000080]" />
            <span>Info</span>
          </button>
        </div>

        <button
          type="button"
          disabled={sending}
          onClick={() => void handleSubmit()}
          className="win98-button min-w-[82px] flex flex-col items-center justify-center gap-0.5 px-4 py-1 text-[12px] font-bold text-[#000000] whitespace-nowrap shrink-0"
        >
          <SendHorizontal size={17} className="text-[#008000]" strokeWidth={2.4} />
          <span>{sending ? 'Sending...' : 'Send'}</span>
        </button>
      </div>
    </div>
  );
}

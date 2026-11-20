'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import type { Attachment, Channel, Thread } from '@/lib/board-types';

export type ActiveDialog =
  | null
  | { type: 'new-thread' }
  | { type: 'new-task' }
  | { type: 'labels' }
  | { type: 'attach' }
  | { type: 'preview-attachment'; attachment: Attachment };

interface BoardDialogsProps {
  dialog: ActiveDialog;
  channels: Channel[];
  activeThread: Thread;
  onClose: () => void;
  onCreateThread: (
    channelId: string,
    title: string,
    body: string
  ) => Promise<void>;
  onCreateTask: (
    channelId: string,
    threadId: string,
    title: string,
    leaseMinutes: number
  ) => Promise<void>;
  onSaveLabels: (threadId: string, labels: string[]) => Promise<void>;
  onSendAttachment: (attachment: Attachment, caption: string) => Promise<void>;
}

export function BoardDialogs({
  dialog,
  channels,
  activeThread,
  onClose,
  onCreateThread,
  onCreateTask,
  onSaveLabels,
  onSendAttachment,
}: BoardDialogsProps) {
  const [channelId, setChannelId] = useState(activeThread.channelId);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [leaseMinutes, setLeaseMinutes] = useState(10);
  const [labelsInput, setLabelsInput] = useState(activeThread.labels.join(', '));
  const [attachName, setAttachName] = useState('trace.log');
  const [attachPreview, setAttachPreview] = useState(
    '2026-11-19T18:04:11Z [local-bridge] claude-code -> grok -> antigravity ack ok (4ms)'
  );
  const [attachCaption, setAttachCaption] = useState('Attached local CLI trace.');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const resetAndClose = () => {
    setError('');
    setTitle('');
    setBody('');
    onClose();
  };

  if (!dialog) return null;

  const dialogTitle =
    dialog.type === 'new-thread'
      ? 'Start New Thread'
      : dialog.type === 'new-task'
        ? `Queue Task in #${activeThread.channelId}`
        : dialog.type === 'labels'
          ? `Edit Labels — Thread #${activeThread.id}`
          : dialog.type === 'attach'
            ? `Attach File to #${activeThread.channelId}`
            : `Attachment: ${dialog.attachment.name}`;

  return (
    <AnimatePresence>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={dialogTitle}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 p-3"
        onClick={resetAndClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.14 }}
          onClick={(e) => e.stopPropagation()}
          className="win98-window w-full max-w-[420px] p-[3px]"
        >
          <div className="win98-title-active flex items-center justify-between px-2 py-1">
            <h3 className="text-[12px] font-bold truncate">{dialogTitle}</h3>
            <button
              type="button"
              onClick={resetAndClose}
              aria-label={`Close ${dialogTitle}`}
              className="win98-button flex h-[17px] w-[18px] items-center justify-center text-[#000000]"
            >
              <X size={11} strokeWidth={3} />
            </button>
          </div>

          <div className="p-3 bg-[#c0c0c0] text-[12px] space-y-2.5">
            {dialog.type === 'new-thread' && (
              <form
                className="space-y-2.5"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!title.trim()) {
                    setError('Enter a thread title.');
                    return;
                  }
                  setSubmitting(true);
                  try {
                    await onCreateThread(channelId, title.trim(), body.trim());
                    resetAndClose();
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                <label className="block font-medium">
                  Channel
                  <select
                    value={channelId}
                    onChange={(e) => setChannelId(e.target.value)}
                    className="mt-1 w-full win98-sunken bg-white px-2 py-1 text-[12px]"
                  >
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>
                        #{c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block font-medium">
                  Thread title
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Cross-check auth middleware refactor"
                    className="mt-1 w-full win98-sunken bg-white px-2 py-1 text-[12px]"
                  />
                </label>
                <label className="block font-medium">
                  Opening message (optional)
                  <textarea
                    rows={3}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="@claude-code @grok @antigravity please inspect..."
                    className="mt-1 w-full win98-sunken bg-white p-2 text-[12px] resize-none"
                  />
                </label>
                {error && <p className="text-[11px] text-[#a80000]">{error}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={resetAndClose}
                    className="win98-button px-3 py-1"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="win98-button-primary px-4 py-1 font-bold"
                  >
                    {submitting ? 'Creating...' : 'Create Thread'}
                  </button>
                </div>
              </form>
            )}

            {dialog.type === 'new-task' && (
              <form
                className="space-y-2.5"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!title.trim()) {
                    setError('Enter task instructions for the agent worker.');
                    return;
                  }
                  setSubmitting(true);
                  try {
                    await onCreateTask(
                      activeThread.channelId,
                      activeThread.id,
                      title.trim(),
                      leaseMinutes
                    );
                    resetAndClose();
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                <p className="text-[11px] text-[#333333]">
                  Workers can claim this task from the Tasks tab or via{' '}
                  <code className="font-code bg-white px-1">
                    vb tasks claim --ready {activeThread.channelId}
                  </code>
                  .
                </p>
                <label className="block font-medium">
                  Task instructions
                  <textarea
                    rows={3}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Add unit tests for expired-card retry path and post trace"
                    className="mt-1 w-full win98-sunken bg-white p-2 text-[12px] resize-none"
                  />
                </label>
                <label className="block font-medium">
                  Lease duration (minutes)
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={leaseMinutes}
                    onChange={(e) => setLeaseMinutes(Number(e.target.value) || 5)}
                    className="mt-1 w-24 win98-sunken bg-white px-2 py-1 text-[12px] tabular-nums"
                  />
                </label>
                {error && <p className="text-[11px] text-[#a80000]">{error}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={resetAndClose}
                    className="win98-button px-3 py-1"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="win98-button-primary px-4 py-1 font-bold"
                  >
                    {submitting ? 'Queuing...' : 'Queue Task'}
                  </button>
                </div>
              </form>
            )}

            {dialog.type === 'labels' && (
              <form
                className="space-y-2.5"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const parsed = labelsInput
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                  setSubmitting(true);
                  try {
                    await onSaveLabels(activeThread.id, parsed);
                    resetAndClose();
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                <label className="block font-medium">
                  Comma-separated labels (e.g. status=fixing, bridge=local)
                  <input
                    type="text"
                    value={labelsInput}
                    onChange={(e) => setLabelsInput(e.target.value)}
                    className="mt-1 w-full win98-sunken bg-white px-2 py-1 text-[12px] font-code"
                  />
                </label>
                <div className="flex flex-wrap gap-1">
                  {['status=fixing', 'status=review', 'status=merged', 'bridge=local'].map(
                    (preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          const list = labelsInput
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean);
                          if (!list.includes(preset)) {
                            setLabelsInput([...list, preset].join(', '));
                          }
                        }}
                        className="win98-button px-2 py-0.5 text-[11px]"
                      >
                        + {preset}
                      </button>
                    )
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={resetAndClose}
                    className="win98-button px-3 py-1"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="win98-button-primary px-4 py-1 font-bold"
                  >
                    Save Labels
                  </button>
                </div>
              </form>
            )}

            {dialog.type === 'attach' && (
              <form
                className="space-y-2.5"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!attachName.trim()) {
                    setError('Enter a filename.');
                    return;
                  }
                  setSubmitting(true);
                  try {
                    await onSendAttachment(
                      {
                        id: `att_${Date.now()}`,
                        name: attachName.trim(),
                        sizeLabel: `${Math.max(1, Math.ceil(attachPreview.length / 64))} KB`,
                        contentType: 'text/plain',
                        previewText: attachPreview,
                      },
                      attachCaption.trim() || `Attached ${attachName.trim()}`
                    );
                    resetAndClose();
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                <label className="block font-medium">
                  Filename
                  <input
                    type="text"
                    value={attachName}
                    onChange={(e) => setAttachName(e.target.value)}
                    className="mt-1 w-full win98-sunken bg-white px-2 py-1 font-code text-[12px]"
                  />
                </label>
                <label className="block font-medium">
                  Message caption
                  <input
                    type="text"
                    value={attachCaption}
                    onChange={(e) => setAttachCaption(e.target.value)}
                    className="mt-1 w-full win98-sunken bg-white px-2 py-1 text-[12px]"
                  />
                </label>
                <label className="block font-medium">
                  File excerpt / trace content
                  <textarea
                    rows={3}
                    value={attachPreview}
                    onChange={(e) => setAttachPreview(e.target.value)}
                    className="mt-1 w-full win98-sunken bg-white p-2 font-code text-[11px] resize-none"
                  />
                </label>
                {error && <p className="text-[11px] text-[#a80000]">{error}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={resetAndClose}
                    className="win98-button px-3 py-1"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="win98-button-primary px-4 py-1 font-bold"
                  >
                    Post Attachment
                  </button>
                </div>
              </form>
            )}

            {dialog.type === 'preview-attachment' && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-[11px] text-[#333333]">
                  <span>
                    File: <strong>{dialog.attachment.name}</strong>
                  </span>
                  <span className="tabular-nums">
                    {dialog.attachment.sizeLabel} · {dialog.attachment.contentType}
                  </span>
                </div>
                <pre className="win98-sunken-dark text-[#dcfce7] p-2.5 font-code text-[11px] leading-relaxed whitespace-pre-wrap break-words max-h-[220px] overflow-y-auto win98-scroll select-text">
                  {dialog.attachment.previewText || 'Binary attachment stored locally.'}
                </pre>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={resetAndClose}
                    className="win98-button-primary px-4 py-1 font-bold"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

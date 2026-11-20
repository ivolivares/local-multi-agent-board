'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  FileCode2,
  Film,
  Folder,
  LayoutGrid,
  Layers,
  Minimize2,
  RotateCcw,
  TerminalSquare,
  Triangle,
} from 'lucide-react';
import type {
  Actor,
  Attachment,
  BoardState,
  MessageFormatting,
  TaskActionType,
} from '@/lib/board-types';
import { AgentInfoWindow } from './AgentInfoWindow';
import { BoardDialogs, type ActiveDialog } from './BoardDialogs';
import { BuddyListWindow, type BuddyTab } from './BuddyListWindow';
import { CliTerminalWindow } from './CliTerminalWindow';
import { MentionAlertWindow } from './MentionAlertWindow';
import { SetupScriptWindow } from './SetupScriptWindow';
import { ThreadChatWindow } from './ThreadChatWindow';
import { Win98Window, type WindowRect } from './Win98Window';

type WinId = 'buddy' | 'agentInfo' | 'mention' | 'chat' | 'terminal' | 'setup';

interface WinState {
  open: boolean;
  minimized: boolean;
  maximized: boolean;
  rect: WindowRect;
  z: number;
}

function buildInitialWindows(viewportWidth: number): Record<WinId, WinState> {
  const w = Math.max(960, viewportWidth || 1440);
  const iconCol = 114;
  const usableW = Math.min(w - iconCol - 24, 1320);
  const leftW = 316;
  const rightX = leftW + 28;
  const rightW = Math.max(560, usableW - leftW - 14);
  const bottomLeftW = Math.floor(rightW * 0.44);
  const bottomRightW = rightW - bottomLeftW - 12;

  return {
    buddy: {
      open: true,
      minimized: false,
      maximized: false,
      rect: { x: 14, y: 12, width: leftW, height: 500 },
      z: 10,
    },
    agentInfo: {
      open: true,
      minimized: false,
      maximized: false,
      rect: { x: 14, y: 524, width: leftW, height: 320 },
      z: 11,
    },
    chat: {
      open: true,
      minimized: false,
      maximized: false,
      rect: { x: rightX, y: 12, width: rightW, height: 616 },
      z: 14,
    },
    mention: {
      open: true,
      minimized: false,
      maximized: false,
      rect: { x: rightX, y: 640, width: bottomLeftW, height: 204 },
      z: 12,
    },
    terminal: {
      open: true,
      minimized: false,
      maximized: false,
      rect: {
        x: rightX + bottomLeftW + 12,
        y: 640,
        width: bottomRightW,
        height: 204,
      },
      z: 13,
    },
    setup: {
      open: false,
      minimized: false,
      maximized: false,
      rect: { x: Math.max(40, Math.floor((w - 680) / 2)), y: 42, width: 680, height: 640 },
      z: 15,
    },
  };
}

interface BoardDesktopProps {
  initialState: BoardState;
}

export function BoardDesktop({ initialState }: BoardDesktopProps) {
  const [state, setState] = useState<BoardState>(initialState);
  const [activeThreadId, setActiveThreadId] = useState<string>(
    initialState.threads.some((t) => t.id === '840')
      ? '840'
      : initialState.threads[0]?.id || '831'
  );
  const [selectedActorName, setSelectedActorName] = useState<string>('claude-code');
  const [buddyTab, setBuddyTab] = useState<BuddyTab>('online');
  const [postAsActor, setPostAsActor] = useState<string>(initialState.currentUser);
  const [composerText, setComposerText] = useState<string>('');
  const [activeWin, setActiveWin] = useState<WinId>('chat');
  const [mobileWin, setMobileWin] = useState<WinId>('chat');
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [goMenuOpen, setGoMenuOpen] = useState<boolean>(false);
  const [cliStatusOpen, setCliStatusOpen] = useState<boolean>(false);
  const [streamStatus, setStreamStatus] = useState<
    'connecting' | 'connected' | 'reconnecting'
  >('connecting');
  const [dialog, setDialog] = useState<ActiveDialog>(null);
  const [clockText, setClockText] = useState<string>('');
  const [dismissedMentionIds, setDismissedMentionIds] = useState<string[]>([]);
  const [windows, setWindows] = useState<Record<WinId, WinState>>(() =>
    buildInitialWindows(1440)
  );

  const zCounterRef = useRef<number>(20);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  // Responsive viewport detection & initial window fit
  useEffect(() => {
    const syncViewport = () => {
      const mobile = window.innerWidth < 860;
      setIsMobile(mobile);
      if (!mobile) {
        setWindows((prev) => {
          const fresh = buildInitialWindows(window.innerWidth);
          return {
            buddy: { ...prev.buddy, rect: fresh.buddy.rect },
            agentInfo: { ...prev.agentInfo, rect: fresh.agentInfo.rect },
            chat: { ...prev.chat, rect: fresh.chat.rect },
            mention: { ...prev.mention, rect: fresh.mention.rect },
            terminal: { ...prev.terminal, rect: fresh.terminal.rect },
            setup: { ...prev.setup, rect: fresh.setup.rect },
          };
        });
      }
    };
    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  // Live taskbar clock
  useEffect(() => {
    const updateClock = () => {
      const d = new Date();
      let h = d.getHours();
      const m = String(d.getMinutes()).padStart(2, '0');
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      setClockText(`${h}:${m} ${ampm}`);
    };
    updateClock();
    const id = setInterval(updateClock, 15_000);
    return () => clearInterval(id);
  }, []);

  // Real-time Server-Sent Events connection with auto-reconnect
  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      es = new EventSource('/api/board/stream');
      es.onopen = () => {
        if (!disposed) setStreamStatus('connected');
      };
      es.addEventListener('init', (ev) => {
        try {
          const fresh = JSON.parse((ev as MessageEvent).data) as BoardState;
          setState(fresh);
          setStreamStatus('connected');
        } catch {
          // ignore
        }
      });
      es.addEventListener('board_event', (ev) => {
        try {
          const parsed = JSON.parse((ev as MessageEvent).data) as {
            state: BoardState;
          };
          if (parsed.state) {
            setState(parsed.state);
          }
          setStreamStatus('connected');
        } catch {
          // ignore
        }
      });
      es.onerror = () => {
        es?.close();
        if (!disposed) {
          setStreamStatus('reconnecting');
          retryTimer = setTimeout(connect, 2500);
        }
      };
    };

    connect();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  }, []);

  const focusWindow = useCallback((id: string) => {
    const wid = id as WinId;
    zCounterRef.current += 1;
    const nextZ = zCounterRef.current;
    setActiveWin(wid);
    setMobileWin(wid);
    setWindows((prev) => ({
      ...prev,
      [wid]: { ...prev[wid], open: true, minimized: false, z: nextZ },
    }));
  }, []);

  const moveWindow = useCallback((id: string, x: number, y: number) => {
    const wid = id as WinId;
    setWindows((prev) => ({
      ...prev,
      [wid]: { ...prev[wid], rect: { ...prev[wid].rect, x, y } },
    }));
  }, []);

  const minimizeWindow = useCallback((id: string) => {
    const wid = id as WinId;
    setWindows((prev) => ({
      ...prev,
      [wid]: { ...prev[wid], minimized: true },
    }));
  }, []);

  const toggleMaximize = useCallback((id: string) => {
    const wid = id as WinId;
    zCounterRef.current += 1;
    const nextZ = zCounterRef.current;
    setActiveWin(wid);
    setWindows((prev) => ({
      ...prev,
      [wid]: { ...prev[wid], maximized: !prev[wid].maximized, z: nextZ },
    }));
  }, []);

  const closeWindow = useCallback((id: string) => {
    const wid = id as WinId;
    setWindows((prev) => ({
      ...prev,
      [wid]: { ...prev[wid], open: false },
    }));
  }, []);

  const handleTaskbarClick = useCallback(
    (id: WinId) => {
      if (isMobile) {
        focusWindow(id);
        return;
      }
      const win = windows[id];
      if (activeWin === id && win.open && !win.minimized) {
        minimizeWindow(id);
      } else {
        focusWindow(id);
      }
    },
    [activeWin, focusWindow, isMobile, minimizeWindow, windows]
  );

  const cascadeWindows = useCallback(() => {
    setGoMenuOpen(false);
    const order: WinId[] = ['buddy', 'agentInfo', 'terminal', 'mention', 'chat'];
    setWindows((prev) => {
      const next = { ...prev };
      order.forEach((wid, idx) => {
        zCounterRef.current += 1;
        next[wid] = {
          ...next[wid],
          open: true,
          minimized: false,
          maximized: false,
          z: zCounterRef.current,
          rect: {
            ...next[wid].rect,
            x: 24 + idx * 34,
            y: 18 + idx * 28,
          },
        };
      });
      return next;
    });
    setActiveWin('chat');
  }, []);

  const restoreDefaultLayout = useCallback(() => {
    setGoMenuOpen(false);
    const width = typeof window !== 'undefined' ? window.innerWidth : 1440;
    setWindows(buildInitialWindows(width));
    setActiveWin('chat');
  }, []);

  const minimizeAllWindows = useCallback(() => {
    setGoMenuOpen(false);
    setWindows((prev) => {
      const next = { ...prev };
      (Object.keys(next) as WinId[]).forEach((wid) => {
        next[wid] = { ...next[wid], minimized: true };
      });
      return next;
    });
  }, []);

  const connectedAgents = useMemo(
    () => state.actors.filter((a) => a.kind === 'agent'),
    [state.actors]
  );

  const activeThread = useMemo(
    () =>
      state.threads.find((t) => t.id === activeThreadId) || state.threads[0],
    [state.threads, activeThreadId]
  );

  const threadMessages = useMemo(
    () =>
      activeThread
        ? state.messages.filter((m) => m.threadId === activeThread.id)
        : [],
    [state.messages, activeThread]
  );

  const selectedActor: Actor | null = useMemo(
    () =>
      state.actors.find((a) => a.name === selectedActorName) ||
      state.actors.find((a) => a.kind === 'agent') ||
      null,
    [state.actors, selectedActorName]
  );

  const activeMention = useMemo(() => {
    return (
      state.mentions.find(
        (m) => !m.dismissed && !dismissedMentionIds.includes(m.id)
      ) || null
    );
  }, [state.mentions, dismissedMentionIds]);

  const refreshState = async () => {
    const res = await fetch('/api/board/state', { cache: 'no-store' });
    if (res.ok) {
      setState((await res.json()) as BoardState);
    }
  };

  // Board mutations wired end-to-end to local API
  const handleSendMessage = async (
    body: string,
    formatting: MessageFormatting,
    asActor: string
  ) => {
    if (!activeThread) return;
    await fetch('/api/board/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId: activeThread.channelId,
        threadId: activeThread.id,
        body,
        as: asActor,
        formatting,
      }),
    });
    await refreshState();
  };

  const handleSendAttachment = async (attachment: Attachment, caption: string) => {
    if (!activeThread) return;
    await fetch('/api/board/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId: activeThread.channelId,
        threadId: activeThread.id,
        body: caption,
        as: postAsActor,
        attachments: [attachment],
      }),
    });
    await refreshState();
  };

  const handleToggleReaction = async (messageId: string, emoji: string) => {
    await fetch(`/api/board/messages/${encodeURIComponent(messageId)}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji, as: postAsActor }),
    });
    await refreshState();
  };

  const handleCreateChannel = async (name: string, description: string) => {
    const res = await fetch('/api/board/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, as: postAsActor }),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        data?: { thread?: { id: string } };
      };
      await refreshState();
      if (json.data?.thread?.id) {
        setActiveThreadId(json.data.thread.id);
        focusWindow('chat');
      }
    }
  };

  const handleCreateThread = async (
    channelId: string,
    title: string,
    body: string
  ) => {
    const res = await fetch('/api/board/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId, title, body, as: postAsActor }),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        data?: { thread?: { id: string } };
      };
      await refreshState();
      if (json.data?.thread?.id) {
        setActiveThreadId(json.data.thread.id);
        focusWindow('chat');
      }
    }
  };

  const handleCreateTask = async (
    channelId: string,
    threadId: string,
    title: string,
    leaseMinutes: number
  ) => {
    await fetch('/api/board/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'create',
        channelId,
        threadId,
        title,
        as: postAsActor,
        leaseMinutes,
      }),
    });
    await refreshState();
    setBuddyTab('tasks');
    focusWindow('buddy');
  };

  const handleTaskAction = async (
    taskId: string,
    action: TaskActionType,
    asActor: string,
    note?: string
  ) => {
    await fetch(`/api/board/tasks/${encodeURIComponent(taskId)}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, as: asActor, note, leaseMinutes: 5 }),
    });
    await refreshState();
  };

  const handleSaveLabels = async (threadId: string, labels: string[]) => {
    await fetch(`/api/board/threads/${encodeURIComponent(threadId)}/labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ set: labels, as: postAsActor }),
    });
    await refreshState();
  };

  const handleRunCliCommand = async (command: string) => {
    const res = await fetch('/api/board/cli', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    });
    const json = (await res.json()) as { ok: boolean; output: string };
    await refreshState();
    return json;
  };

  const handleRunHandshake = async (channelId: string) => {
    const trio = [
      {
        name: 'claude-code',
        msg: `claude-code CLI handshake ok on #${channelId}. @grok @antigravity ready to coordinate.`,
      },
      {
        name: 'grok',
        msg: `grok CLI joined #${channelId}. Watching @claude-code patches and task queue.`,
      },
      {
        name: 'antigravity',
        msg: `gemini antigravity CLI synced to #${channelId}. Browser verification standing by.`,
      },
    ];
    for (const agent of trio) {
      await fetch('/api/board/actors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: agent.name,
          kind: 'agent',
          status: 'listening',
          statusMessage: `Connected to #${channelId} via local vb CLI.`,
        }),
      });
      await fetch('/api/board/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId,
          body: agent.msg,
          as: agent.name,
        }),
      });
    }
    await refreshState();
    const targetThread = state.threads.find((t) => t.channelId === channelId);
    if (targetThread) setActiveThreadId(targetThread.id);
    focusWindow('chat');
  };

  const handleMentionInsert = (name: string) => {
    setComposerText((prev) => {
      const prefix = prev && !prev.endsWith(' ') ? `${prev} ` : prev;
      return `${prefix}@${name} `;
    });
    focusWindow('chat');
    setTimeout(() => composerRef.current?.focus(), 40);
  };

  const handleResetDemo = async () => {
    setGoMenuOpen(false);
    await fetch('/api/board/reset', { method: 'POST' });
    setDismissedMentionIds([]);
    await refreshState();
  };

  const shouldRenderWindow = (id: WinId) => {
    if (isMobile) return mobileWin === id;
    return windows[id].open && !windows[id].minimized;
  };

  const taskbarButtons: { id: WinId; label: string; mobileLabel: string }[] = [
    { id: 'buddy', label: 'Vercel Instant Mess...', mobileLabel: 'Board' },
    {
      id: 'chat',
      label: activeThread
        ? `#${activeThread.channelId} : ${activeThread.id}`
        : '#agent-bridge',
      mobileLabel: 'Chat',
    },
    ...(activeMention && windows.mention.open && !isMobile
      ? [
          {
            id: 'mention' as const,
            label: `${activeMention.fromActor} - mention`,
            mobileLabel: 'Alert',
          },
        ]
      : []),
    ...(windows.terminal.open || isMobile
      ? [{ id: 'terminal' as const, label: 'vb tail', mobileLabel: 'CLI' }]
      : []),
    ...(windows.setup.open || isMobile
      ? [{ id: 'setup' as const, label: 'setup-board.sh', mobileLabel: 'Setup' }]
      : []),
  ];

  const flakeAttachment: Attachment = {
    id: 'att_flake_mp4',
    name: 'flake.mp4',
    sizeLabel: '2 MB',
    contentType: 'video/mp4',
    previewText:
      'Captured by scout via lahfir in #screen-relay (thread 831):\nFrame 00:01.42 — Windows runner clicked cursor target 18ms before WM_ACTIVATE focus.\nPatch: screen-relay#214 (approved by reviewer, 40/40 green).',
  };

  return (
    <main
      className="relative h-screen w-screen overflow-hidden bg-[#008080]"
      onClick={() => {
        if (goMenuOpen) setGoMenuOpen(false);
        if (cliStatusOpen) setCliStatusOpen(false);
      }}
    >
      {/* Desktop Icons Column (Far Right, matching reference video) */}
      {!isMobile && (
        <nav
          aria-label="Desktop shortcuts"
          className="fixed right-3 top-4 z-[5] flex w-[96px] flex-col items-center gap-5"
        >
          <button
            type="button"
            onClick={() => focusWindow('setup')}
            className="group flex flex-col items-center gap-1 p-1 text-white focus-visible:outline-1 focus-visible:outline-white"
          >
            <Folder
              size={34}
              strokeWidth={1.6}
              className="text-white drop-shadow-[1px_1px_0px_rgba(0,0,0,0.45)] group-hover:scale-105 transition-transform"
            />
            <span className="px-1 text-[11px] leading-tight text-white group-hover:bg-[#000080]">
              {state.boardName}
            </span>
          </button>

          <button
            type="button"
            onClick={() => focusWindow('terminal')}
            className="group flex flex-col items-center gap-1 p-1 text-white focus-visible:outline-1 focus-visible:outline-white"
          >
            <TerminalSquare
              size={34}
              strokeWidth={1.6}
              className="text-white drop-shadow-[1px_1px_0px_rgba(0,0,0,0.45)] group-hover:scale-105 transition-transform"
            />
            <span className="px-1 text-[11px] leading-tight text-white group-hover:bg-[#000080]">
              vb tail
            </span>
          </button>

          <button
            type="button"
            onClick={() => focusWindow('setup')}
            className="group flex flex-col items-center gap-1 p-1 text-white focus-visible:outline-1 focus-visible:outline-white"
          >
            <FileCode2
              size={34}
              strokeWidth={1.6}
              className="text-white drop-shadow-[1px_1px_0px_rgba(0,0,0,0.45)] group-hover:scale-105 transition-transform"
            />
            <span className="px-1 text-[11px] leading-tight text-white group-hover:bg-[#000080]">
              setup-board.sh
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              setDialog({ type: 'preview-attachment', attachment: flakeAttachment })
            }
            className="group flex flex-col items-center gap-1 p-1 text-white focus-visible:outline-1 focus-visible:outline-white"
          >
            <Film
              size={34}
              strokeWidth={1.6}
              className="text-white drop-shadow-[1px_1px_0px_rgba(0,0,0,0.45)] group-hover:scale-105 transition-transform"
            />
            <span className="px-1 text-[11px] leading-tight text-white group-hover:bg-[#000080]">
              flake.mp4
            </span>
          </button>
        </nav>
      )}

      {/* Window 1: Vercel Instant Messenger (Buddy List / Channels / Tasks) */}
      {shouldRenderWindow('buddy') && (
        <Win98Window
          id="buddy"
          title="Vercel Instant Messenger"
          active={activeWin === 'buddy'}
          zIndex={windows.buddy.z}
          rect={windows.buddy.rect}
          isMobile={isMobile}
          onFocus={focusWindow}
          onMove={moveWindow}
          onMinimize={minimizeWindow}
          onClose={closeWindow}
        >
          <BuddyListWindow
            state={state}
            activeTab={buddyTab}
            selectedActorName={selectedActorName}
            activeThreadId={activeThread?.id || ''}
            onTabChange={setBuddyTab}
            onSelectActor={(actor) => {
              setSelectedActorName(actor.name);
              if (!isMobile) {
                setWindows((prev) => ({
                  ...prev,
                  agentInfo: { ...prev.agentInfo, open: true, minimized: false },
                }));
              }
            }}
            onDoubleClickActor={(actor) => handleMentionInsert(actor.name)}
            onSelectThread={(_channelId, threadId) => {
              setActiveThreadId(threadId);
              focusWindow('chat');
            }}
            onCreateChannel={handleCreateChannel}
            onTaskAction={handleTaskAction}
            onActionReply={() => {
              focusWindow('chat');
              setTimeout(() => composerRef.current?.focus(), 40);
            }}
            onActionNewThread={() => setDialog({ type: 'new-thread' })}
            onActionNewTask={() => setDialog({ type: 'new-task' })}
            onActionInfo={() => focusWindow('agentInfo')}
          />
        </Win98Window>
      )}

      {/* Window 2: Agent Info */}
      {shouldRenderWindow('agentInfo') && (
        <Win98Window
          id="agentInfo"
          title={`Agent Info: ${selectedActor?.name || 'agent'}`}
          active={activeWin === 'agentInfo'}
          zIndex={windows.agentInfo.z}
          rect={windows.agentInfo.rect}
          isMobile={isMobile}
          showMinimize={false}
          onFocus={focusWindow}
          onMove={moveWindow}
          onClose={closeWindow}
        >
          <AgentInfoWindow
            actor={selectedActor}
            tasks={state.tasks}
            onOk={() => {
              if (isMobile) setMobileWin('buddy');
              else focusWindow('chat');
            }}
            onMention={handleMentionInsert}
            onRenewLease={(taskId, actorName) =>
              void handleTaskAction(taskId, 'renew', actorName)
            }
          />
        </Win98Window>
      )}

      {/* Window 3: Main Active Thread Chat */}
      {shouldRenderWindow('chat') && activeThread && (
        <Win98Window
          id="chat"
          title={`#${activeThread.channelId} : thread ${activeThread.id} - Vercel Instant Messenger`}
          active={activeWin === 'chat'}
          zIndex={windows.chat.z}
          rect={windows.chat.rect}
          maximized={windows.chat.maximized}
          isMobile={isMobile}
          showMaximize
          onFocus={focusWindow}
          onMove={moveWindow}
          onMinimize={minimizeWindow}
          onToggleMaximize={toggleMaximize}
          onClose={closeWindow}
        >
          <ThreadChatWindow
            thread={activeThread}
            messages={threadMessages}
            actors={state.actors}
            currentUser={state.currentUser}
            composerText={composerText}
            composerInputRef={composerRef}
            postAsActor={postAsActor}
            onPostAsChange={setPostAsActor}
            onComposerChange={setComposerText}
            onSendMessage={handleSendMessage}
            onToggleReaction={handleToggleReaction}
            onSelectActor={(name) => {
              setSelectedActorName(name);
              focusWindow('agentInfo');
            }}
            onOpenLabelDialog={() => setDialog({ type: 'labels' })}
            onOpenTaskDialog={() => setDialog({ type: 'new-task' })}
            onOpenAttachDialog={() => setDialog({ type: 'attach' })}
            onOpenNewThread={() => setDialog({ type: 'new-thread' })}
            onOpenSetupScript={() => focusWindow('setup')}
            onPreviewAttachment={(att) =>
              setDialog({ type: 'preview-attachment', attachment: att })
            }
            onOpenInfo={() => focusWindow('agentInfo')}
          />
        </Win98Window>
      )}

      {/* Window 4: Floating Mention Notification Toast */}
      {shouldRenderWindow('mention') && activeMention && (
        <Win98Window
          id="mention"
          title="Vercel Instant Messenger"
          active={activeWin === 'mention'}
          zIndex={windows.mention.z}
          rect={windows.mention.rect}
          isMobile={isMobile}
          showMinimize={false}
          onFocus={focusWindow}
          onMove={moveWindow}
          onClose={() => {
            setDismissedMentionIds((prev) => [...prev, activeMention.id]);
            closeWindow('mention');
          }}
        >
          <MentionAlertWindow
            mention={activeMention}
            actors={state.actors}
            onOpenThread={(_channelId, threadId) => {
              setActiveThreadId(threadId);
              focusWindow('chat');
            }}
          />
        </Win98Window>
      )}

      {/* Window 5: Local `vb tail` & CLI Console */}
      {shouldRenderWindow('terminal') && (
        <Win98Window
          id="terminal"
          title="vb tail — Local CLI Bridge"
          active={activeWin === 'terminal'}
          zIndex={windows.terminal.z}
          rect={windows.terminal.rect}
          maximized={windows.terminal.maximized}
          isMobile={isMobile}
          showMaximize
          onFocus={focusWindow}
          onMove={moveWindow}
          onMinimize={minimizeWindow}
          onToggleMaximize={toggleMaximize}
          onClose={closeWindow}
        >
          <CliTerminalWindow
            events={state.events}
            activeChannel={activeThread?.channelId || 'agent-bridge'}
            onRunCommand={handleRunCliCommand}
          />
        </Win98Window>
      )}

      {/* Window 6: Board Setup Script & Multi-Agent CLI Interconnect */}
      {shouldRenderWindow('setup') && (
        <Win98Window
          id="setup"
          title="setup-board.sh — Connect Claude Code, Grok & Antigravity"
          active={activeWin === 'setup'}
          zIndex={windows.setup.z}
          rect={windows.setup.rect}
          maximized={windows.setup.maximized}
          isMobile={isMobile}
          showMaximize
          onFocus={focusWindow}
          onMove={moveWindow}
          onMinimize={minimizeWindow}
          onToggleMaximize={toggleMaximize}
          onClose={closeWindow}
        >
          <SetupScriptWindow
            boardName={state.boardName}
            channels={state.channels}
            activeChannel={activeThread?.channelId || 'agent-bridge'}
            onRunHandshake={handleRunHandshake}
          />
        </Win98Window>
      )}

      {/* Modal Dialogs */}
      {activeThread && (
        <BoardDialogs
          dialog={dialog}
          channels={state.channels}
          activeThread={activeThread}
          onClose={() => setDialog(null)}
          onCreateThread={handleCreateThread}
          onCreateTask={handleCreateTask}
          onSaveLabels={handleSaveLabels}
          onSendAttachment={handleSendAttachment}
        />
      )}

      {/* Go Start Menu Popup */}
      {goMenuOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="win98-window fixed bottom-[36px] left-1 z-[150] w-[236px] flex overflow-hidden"
        >
          <div className="w-7 bg-[#000080] flex items-end justify-center pb-2 shrink-0">
            <span className="[writing-mode:vertical-rl] rotate-180 font-editorial font-bold italic text-[13px] tracking-wider text-white">
              Vercel Board
            </span>
          </div>
          <div className="flex-1 py-1 text-[12px] bg-[#c0c0c0]">
            <button
              type="button"
              onClick={() => {
                setGoMenuOpen(false);
                focusWindow('setup');
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#000080] hover:text-white"
            >
              <FileCode2 size={14} />
              <span>Setup Script (setup-board.sh)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setGoMenuOpen(false);
                focusWindow('terminal');
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#000080] hover:text-white"
            >
              <TerminalSquare size={14} />
              <span>Open vb tail CLI</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setGoMenuOpen(false);
                setDialog({ type: 'new-thread' });
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#000080] hover:text-white"
            >
              <Folder size={14} />
              <span>New Thread...</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setGoMenuOpen(false);
                setDialog({ type: 'new-task' });
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#000080] hover:text-white"
            >
              <Triangle size={13} />
              <span>Queue Agent Task...</span>
            </button>
            <div className="my-1 border-t border-[#808080] border-b border-b-white" />
            <button
              type="button"
              onClick={cascadeWindows}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#000080] hover:text-white"
            >
              <Layers size={14} />
              <span>Cascade Windows</span>
            </button>
            <button
              type="button"
              onClick={restoreDefaultLayout}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#000080] hover:text-white"
            >
              <LayoutGrid size={14} />
              <span>Restore Default Layout</span>
            </button>
            <button
              type="button"
              onClick={minimizeAllWindows}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#000080] hover:text-white"
            >
              <Minimize2 size={14} />
              <span>Minimize All</span>
            </button>
            <div className="my-1 border-t border-[#808080] border-b border-b-white" />
            <button
              type="button"
              onClick={() => void handleResetDemo()}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#000080] hover:text-white"
            >
              <RotateCcw size={14} />
              <span>Reset Local Board</span>
            </button>
          </div>
        </div>
      )}

      {/* Connected CLI Agents Status Popup (anchored above system tray) */}
      {cliStatusOpen && (
        <div
          role="dialog"
          aria-label="Connected CLI Agents Status"
          onClick={(e) => e.stopPropagation()}
          className="win98-window fixed bottom-[36px] right-1.5 z-[150] w-[308px] p-[3px]"
        >
          <div className="win98-title-active flex items-center justify-between px-2 py-1 text-[11px] font-bold">
            <span className="inline-flex items-center gap-1.5">
              <Activity size={12} />
              <span>Connected CLI Agents ({connectedAgents.length})</span>
            </span>
            <span className="font-normal text-[#dbeafe]">
              {streamStatus === 'connected'
                ? 'SSE Live'
                : streamStatus === 'reconnecting'
                  ? 'Reconnecting'
                  : 'Connecting'}
            </span>
          </div>
          <div className="bg-[#c0c0c0] p-2 space-y-2 text-[11px]">
            <div className="win98-sunken bg-white max-h-[210px] overflow-y-auto win98-scroll divide-y divide-[#e5e5e5]">
              {connectedAgents.map((agent) => {
                const statusColor =
                  agent.status === 'busy'
                    ? 'text-[#b45309]'
                    : agent.status === 'listening'
                      ? 'text-[#15803d]'
                      : 'text-[#000080]';
                return (
                  <div
                    key={agent.id}
                    className="flex items-center justify-between gap-2 px-2 py-1.5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-[#000000] truncate">
                          {agent.name}
                        </span>
                        <span className={`font-code text-[10px] font-semibold ${statusColor}`}>
                          {agent.status}
                        </span>
                      </div>
                      <p className="text-[10px] text-[#555555] truncate">
                        {agent.cliFlavor || 'local-vb'} · via {agent.via || state.currentUser}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedActorName(agent.name);
                          setCliStatusOpen(false);
                          focusWindow('agentInfo');
                        }}
                        className="win98-button px-1.5 py-0.5 text-[10px]"
                      >
                        Info
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCliStatusOpen(false);
                          handleMentionInsert(agent.name);
                        }}
                        className="win98-button px-1.5 py-0.5 text-[10px]"
                      >
                        @
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setCliStatusOpen(false);
                  focusWindow('terminal');
                }}
                className="win98-button px-2 py-1 text-[11px]"
              >
                Open vb tail
              </button>
              <button
                type="button"
                onClick={() => {
                  setCliStatusOpen(false);
                  focusWindow('setup');
                }}
                className="win98-button-primary px-2.5 py-1 text-[11px] font-bold"
              >
                Connect CLI...
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Classic Windows 98 Bottom Taskbar */}
      <footer className="fixed bottom-0 left-0 right-0 z-[100] flex h-[34px] items-center justify-between gap-1.5 bg-[#c0c0c0] border-t-2 border-t-[#ffffff] px-1.5">
        <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setCliStatusOpen(false);
              setGoMenuOpen((v) => !v);
            }}
            aria-expanded={goMenuOpen}
            className={`inline-flex items-center gap-1.5 px-2.5 h-[26px] text-[12px] font-bold text-[#000000] whitespace-nowrap shrink-0 ${
              goMenuOpen ? 'win98-button-pressed' : 'win98-button'
            }`}
          >
            <Triangle size={11} fill="currentColor" strokeWidth={0} />
            <span>Go</span>
          </button>

          <span className="h-5 w-[2px] border-l border-[#808080] border-r border-r-white shrink-0 mx-0.5" />

          {taskbarButtons.map((btn) => {
            const isCurrent = isMobile
              ? mobileWin === btn.id
              : activeWin === btn.id &&
                windows[btn.id].open &&
                !windows[btn.id].minimized;

            return (
              <button
                key={btn.id}
                type="button"
                onClick={() => handleTaskbarClick(btn.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 h-[26px] max-w-[190px] text-[12px] text-[#000000] whitespace-nowrap shrink-0 ${
                  isCurrent
                    ? 'win98-taskbar-active font-bold'
                    : 'win98-button font-normal'
                }`}
              >
                <span
                  className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center bg-black text-white"
                  aria-hidden="true"
                >
                  <Triangle size={7} fill="currentColor" strokeWidth={0} />
                </span>
                <span className="truncate">
                  {isMobile ? btn.mobileLabel : btn.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* System Tray: Live Connected CLI Agents Status Indicator + Clock */}
        <div className="win98-sunken-gray hidden sm:inline-flex items-center gap-2 px-2 h-[26px] text-[12px] text-[#000000] tabular-nums whitespace-nowrap shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setGoMenuOpen(false);
              setCliStatusOpen((v) => !v);
            }}
            aria-expanded={cliStatusOpen}
            aria-label={`CLI agents status: ${streamStatus === 'connected' ? 'connected' : streamStatus}, ${connectedAgents.length} agents`}
            className="inline-flex items-center gap-1.5 px-1 py-0.5 text-[11px] hover:bg-[#d6d6d6] focus-visible:outline-1 focus-visible:outline-black"
          >
            <span
              className={`h-2 w-2 rounded-full shrink-0 ${
                streamStatus === 'connected'
                  ? 'bg-[#15803d]'
                  : streamStatus === 'reconnecting'
                    ? 'bg-[#b45309]'
                    : 'bg-[#64748b]'
              }`}
              aria-hidden="true"
            />
            <span className="font-medium">
              {streamStatus === 'connected'
                ? `${connectedAgents.length} CLI Live`
                : streamStatus === 'reconnecting'
                  ? 'Reconnecting'
                  : 'Connecting'}
            </span>
          </button>
          <span className="h-3.5 w-[1px] bg-[#808080]" aria-hidden="true" />
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-flex h-3.5 w-3.5 items-center justify-center bg-black text-white"
              aria-hidden="true"
            >
              <Triangle size={7} fill="currentColor" strokeWidth={0} />
            </span>
            <span suppressHydrationWarning>{clockText || '2:14 PM'}</span>
          </span>
        </div>
      </footer>
    </main>
  );
}

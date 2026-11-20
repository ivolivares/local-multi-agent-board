'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BookOpen,
  FileCode2,
  FileText,
  Film,
  Folder,
  LayoutGrid,
  Layers,
  Minimize2,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Terminal,
  TerminalSquare,
  Triangle,
} from 'lucide-react';
import { buildSimulatedAgentReplies } from '@/lib/agent-emulator';
import type {
  Actor,
  Attachment,
  BoardState,
  MessageFormatting,
  TaskActionType,
} from '@/lib/board-types';
import {
  DEFAULT_THEME_ID,
  isDesktopThemeId,
  type DesktopThemeId,
} from '@/lib/desktop-themes';
import { playMessagePing } from '@/lib/sound';
import { AgentInfoWindow } from './AgentInfoWindow';
import { BoardDialogs, type ActiveDialog } from './BoardDialogs';
import { BuddyListWindow, type BuddyTab } from './BuddyListWindow';
import { CliTerminalWindow } from './CliTerminalWindow';
import { CommandPromptWindow } from './CommandPromptWindow';
import { ExplainLikeIm5Window } from './ExplainLikeIm5Window';
import { MediaPlayerWindow } from './MediaPlayerWindow';
import { MentionAlertWindow } from './MentionAlertWindow';
import { ReadmeWindow } from './ReadmeWindow';
import { SettingsWindow } from './SettingsWindow';
import { SetupScriptWindow } from './SetupScriptWindow';
import { Taskbar, type TaskbarButtonItem } from './Taskbar';
import { ThreadChatWindow } from './ThreadChatWindow';
import { Win98Window, type WindowRect } from './Win98Window';

type WinId =
  | 'buddy'
  | 'agentInfo'
  | 'mention'
  | 'chat'
  | 'terminal'
  | 'setup'
  | 'readme'
  | 'media'
  | 'cmd'
  | 'settings'
  | 'eli5';

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
  const usableW = Math.min(w - iconCol - 32, 1300);
  const leftW = 304;
  const rightX = leftW + 34;
  const rightW = Math.min(820, Math.max(580, usableW - leftW - 22));
  const bottomLeftW = Math.floor(rightW * 0.44);
  const bottomRightW = rightW - bottomLeftW - 12;

  return {
    buddy: {
      open: true,
      minimized: false,
      maximized: false,
      rect: { x: 20, y: 20, width: leftW, height: 590 },
      z: 10,
    },
    agentInfo: {
      open: false,
      minimized: false,
      maximized: false,
      rect: { x: 20, y: 520, width: leftW, height: 310 },
      z: 11,
    },
    chat: {
      open: true,
      minimized: false,
      maximized: false,
      rect: { x: rightX, y: 20, width: rightW, height: 640 },
      z: 14,
    },
    mention: {
      open: false,
      minimized: false,
      maximized: false,
      rect: { x: rightX, y: 672, width: bottomLeftW, height: 184 },
      z: 12,
    },
    terminal: {
      open: false,
      minimized: false,
      maximized: false,
      rect: {
        x: Math.max(60, Math.floor((w - 660) / 2)),
        y: 120,
        width: Math.max(540, bottomRightW),
        height: 360,
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
    readme: {
      open: false,
      minimized: false,
      maximized: false,
      rect: { x: Math.max(44, Math.floor((w - 660) / 2)), y: 54, width: 660, height: 590 },
      z: 16,
    },
    media: {
      open: false,
      minimized: false,
      maximized: false,
      rect: { x: Math.max(48, Math.floor((w - 620) / 2)), y: 68, width: 620, height: 470 },
      z: 17,
    },
    cmd: {
      open: false,
      minimized: false,
      maximized: false,
      rect: { x: Math.max(40, Math.floor((w - 780) / 2)), y: 64, width: 780, height: 500 },
      z: 18,
    },
    settings: {
      open: false,
      minimized: false,
      maximized: false,
      rect: { x: Math.max(56, Math.floor((w - 460) / 2)), y: 52, width: 460, height: 600 },
      z: 19,
    },
    eli5: {
      open: false,
      minimized: false,
      maximized: false,
      rect: { x: Math.max(46, Math.floor((w - 650) / 2)), y: 46, width: 650, height: 590 },
      z: 20,
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
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [themeId, setThemeId] = useState<DesktopThemeId>(DEFAULT_THEME_ID);
  const [autoReplyAgents, setAutoReplyAgents] = useState<boolean>(true);
  const [swarmRunning, setSwarmRunning] = useState<boolean>(false);
  const [streamStatus, setStreamStatus] = useState<
    'connecting' | 'connected' | 'reconnecting'
  >('connecting');
  const [dialog, setDialog] = useState<ActiveDialog>(null);
  const [dismissedMentionIds, setDismissedMentionIds] = useState<string[]>([]);
  const [windows, setWindows] = useState<Record<WinId, WinState>>(() =>
    buildInitialWindows(1440)
  );

  const zCounterRef = useRef<number>(24);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const seenMessageIdsRef = useRef<Set<string>>(
    new Set(initialState.messages.map((m) => m.id))
  );
  const soundEnabledRef = useRef<boolean>(soundEnabled);
  const replyTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // Restore saved retro desktop theme on mount without hydration mismatch
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const saved = window.localStorage.getItem('vb-desktop-theme');
        if (saved && isDesktopThemeId(saved)) {
          setThemeId(saved);
        }
      } catch {
        // ignore storage restrictions
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Clean up any scheduled simulated agent reply timers on unmount
  useEffect(() => {
    const timers = replyTimersRef.current;
    return () => {
      timers.forEach((id) => clearTimeout(id));
    };
  }, []);

  const handleSelectTheme = useCallback((nextTheme: DesktopThemeId) => {
    setThemeId(nextTheme);
    try {
      window.localStorage.setItem('vb-desktop-theme', nextTheme);
    } catch {
      // ignore storage restrictions
    }
  }, []);

  // Play subtle Web Audio API ping whenever a brand-new chat message arrives
  useEffect(() => {
    let hasNewMessage = false;
    for (const msg of state.messages) {
      if (!seenMessageIdsRef.current.has(msg.id)) {
        seenMessageIdsRef.current.add(msg.id);
        hasNewMessage = true;
      }
    }
    if (hasNewMessage && soundEnabledRef.current) {
      playMessagePing();
    }
  }, [state.messages]);

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
            readme: { ...prev.readme, rect: fresh.readme.rect },
            media: { ...prev.media, rect: fresh.media.rect },
            cmd: { ...prev.cmd, rect: fresh.cmd.rect },
            settings: { ...prev.settings, rect: fresh.settings.rect },
            eli5: { ...prev.eli5, rect: fresh.eli5.rect },
          };
        });
      }
    };
    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
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
    const channelId = activeThread.channelId;
    const threadId = activeThread.id;
    await fetch('/api/board/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId,
        threadId,
        body,
        as: asActor,
        formatting,
      }),
    });
    await refreshState();

    // Interactive web starter emulation: mentioned CLI agents respond live in-thread
    if (autoReplyAgents) {
      const replies = buildSimulatedAgentReplies(body, asActor, channelId, state.actors);
      for (const reply of replies) {
        const timerId = setTimeout(async () => {
          try {
            await fetch('/api/board/messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                channelId,
                threadId,
                body: reply.body,
                as: reply.actorName,
              }),
            });
            await refreshState();
          } catch {
            // ignore transient network errors
          }
        }, reply.delayMs);
        replyTimersRef.current.push(timerId);
      }
    }
  };

  // Interactive 3-agent Vercel Board Swarm Demo (create -> claim lease -> patch -> fuzz -> verify & complete)
  const handleRunSwarmDemo = async () => {
    if (swarmRunning || !activeThread) return;
    setSwarmRunning(true);
    setGoMenuOpen(false);
    const channelId = activeThread.channelId;
    const threadId = activeThread.id;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    try {
      // Step 1: Queue a ready task on the board
      const createRes = await fetch('/api/board/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'create',
          channelId,
          threadId,
          title: 'Verify rate-limit backoff & SSE reconnect on local bridge',
          as: state.currentUser,
          leaseMinutes: 5,
        }),
      });
      const createJson = (await createRes.json()) as {
        data?: { task?: { id: string } };
      };
      const taskId = createJson.data?.task?.id;
      await refreshState();
      await wait(650);

      // Step 2: claude-code claims the 5-minute lease and posts patch handoff
      if (taskId) {
        await fetch(`/api/board/tasks/${encodeURIComponent(taskId)}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'claim', as: 'claude-code', leaseMinutes: 5 }),
        });
      }
      await fetch('/api/board/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId,
          threadId,
          body: `Claimed task ${taskId ? `#${taskId}` : ''} (5m lease). Patched exponential backoff in stream bridge — @grok please fuzz reconnect races.`,
          as: 'claude-code',
        }),
      });
      await refreshState();
      await wait(850);

      // Step 3: grok fuzzes edge cases and tags @antigravity
      await fetch('/api/board/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId,
          threadId,
          body: `Fuzzed 250 concurrent lease renewals & reconnect drops: 0 claim_lost races. @antigravity ready for browser smoke check.`,
          as: 'grok',
        }),
      });
      await refreshState();
      await wait(850);

      // Step 4: antigravity verifies UI and settles the task
      if (taskId) {
        await fetch(`/api/board/tasks/${encodeURIComponent(taskId)}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'complete',
            as: 'antigravity',
            note: 'Verified in headless Chromium (0 console errors)',
          }),
        });
      }
      await fetch('/api/board/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId,
          threadId,
          body: `Browser verification green! Settled task ${taskId ? `#${taskId}` : ''} as completed. @${state.currentUser} ready to merge.`,
          as: 'antigravity',
        }),
      });
      await refreshState();
    } finally {
      setSwarmRunning(false);
    }
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

  const taskbarButtons: TaskbarButtonItem[] = [
    {
      id: 'buddy',
      label: 'Vercel Instant Mess...',
      mobileLabel: 'Board',
      active: isMobile
        ? mobileWin === 'buddy'
        : activeWin === 'buddy' && windows.buddy.open && !windows.buddy.minimized,
    },
    {
      id: 'chat',
      label: activeThread
        ? `#${activeThread.channelId} : ${activeThread.id}`
        : '#agent-bridge',
      mobileLabel: 'Chat',
      active: isMobile
        ? mobileWin === 'chat'
        : activeWin === 'chat' && windows.chat.open && !windows.chat.minimized,
    },
    ...(activeMention && windows.mention.open && !isMobile
      ? [
          {
            id: 'mention',
            label: `${activeMention.fromActor} - mention`,
            mobileLabel: 'Alert',
            active:
              activeWin === 'mention' &&
              windows.mention.open &&
              !windows.mention.minimized,
          },
        ]
      : []),
    ...(windows.terminal.open || isMobile
      ? [
          {
            id: 'terminal',
            label: 'vb tail',
            mobileLabel: 'CLI',
            active: isMobile
              ? mobileWin === 'terminal'
              : activeWin === 'terminal' &&
                windows.terminal.open &&
                !windows.terminal.minimized,
          },
        ]
      : []),
    ...(windows.setup.open || isMobile
      ? [
          {
            id: 'setup',
            label: 'lvb setup',
            mobileLabel: 'Setup',
            active: isMobile
              ? mobileWin === 'setup'
              : activeWin === 'setup' &&
                windows.setup.open &&
                !windows.setup.minimized,
          },
        ]
      : []),
    ...(windows.readme.open
      ? [
          {
            id: 'readme',
            label: 'readme.md - Notepad',
            mobileLabel: 'Docs',
            active: isMobile
              ? mobileWin === 'readme'
              : activeWin === 'readme' &&
                windows.readme.open &&
                !windows.readme.minimized,
          },
        ]
      : []),
    ...(windows.media.open
      ? [
          {
            id: 'media',
            label: 'Intro.mp4',
            mobileLabel: 'Intro',
            active: isMobile
              ? mobileWin === 'media'
              : activeWin === 'media' &&
                windows.media.open &&
                !windows.media.minimized,
          },
        ]
      : []),
    ...(windows.cmd.open
      ? [
          {
            id: 'cmd',
            label: 'Command Prompt',
            mobileLabel: 'CMD',
            active: isMobile
              ? mobileWin === 'cmd'
              : activeWin === 'cmd' &&
                windows.cmd.open &&
                !windows.cmd.minimized,
          },
        ]
      : []),
    ...(windows.settings.open
      ? [
          {
            id: 'settings',
            label: 'Settings',
            mobileLabel: 'Theme',
            active: isMobile
              ? mobileWin === 'settings'
              : activeWin === 'settings' &&
                windows.settings.open &&
                !windows.settings.minimized,
          },
        ]
      : []),
    ...(windows.eli5.open
      ? [
          {
            id: 'eli5',
            label: "Explain Like I'm 5",
            mobileLabel: 'ELI5',
            active: isMobile
              ? mobileWin === 'eli5'
              : activeWin === 'eli5' &&
                windows.eli5.open &&
                !windows.eli5.minimized,
          },
        ]
      : []),
  ];

  return (
    <main
      data-theme={themeId}
      className="win98-desktop relative h-screen w-screen overflow-hidden"
      onClick={() => {
        if (goMenuOpen) setGoMenuOpen(false);
        if (cliStatusOpen) setCliStatusOpen(false);
      }}
    >
      {/* Desktop Icons Column (Far Right, matching reference video) */}
      {!isMobile && (
        <nav
          aria-label="Desktop shortcuts"
          className="fixed right-3 top-2.5 z-[5] flex w-[104px] flex-col items-center gap-2"
        >
          <button
            type="button"
            onClick={() => focusWindow('eli5')}
            className="group flex flex-col items-center gap-0.5 p-1 text-white focus-visible:outline-1 focus-visible:outline-white"
          >
            <BookOpen
              size={28}
              strokeWidth={1.6}
              className="text-white drop-shadow-[1px_1px_0px_rgba(0,0,0,0.55)] group-hover:scale-105 transition-transform"
            />
            <span className="win98-desktop-label px-1 text-[10.5px] leading-tight text-center group-hover:bg-[#000080]">
              Explain Like I&apos;m 5
            </span>
          </button>

          <button
            type="button"
            onClick={() => focusWindow('cmd')}
            className="group flex flex-col items-center gap-0.5 p-1 text-white focus-visible:outline-1 focus-visible:outline-white"
          >
            <Terminal
              size={28}
              strokeWidth={1.6}
              className="text-white drop-shadow-[1px_1px_0px_rgba(0,0,0,0.55)] group-hover:scale-105 transition-transform"
            />
            <span className="win98-desktop-label px-1 text-[10.5px] leading-tight text-center group-hover:bg-[#000080]">
              Command Prompt
            </span>
          </button>

          <button
            type="button"
            onClick={() => focusWindow('terminal')}
            className="group flex flex-col items-center gap-0.5 p-1 text-white focus-visible:outline-1 focus-visible:outline-white"
          >
            <TerminalSquare
              size={28}
              strokeWidth={1.6}
              className="text-white drop-shadow-[1px_1px_0px_rgba(0,0,0,0.55)] group-hover:scale-105 transition-transform"
            />
            <span className="win98-desktop-label px-1 text-[10.5px] leading-tight group-hover:bg-[#000080]">
              vb tail
            </span>
          </button>

          <button
            type="button"
            onClick={() => focusWindow('setup')}
            className="group flex flex-col items-center gap-0.5 p-1 text-white focus-visible:outline-1 focus-visible:outline-white"
          >
            <FileCode2
              size={28}
              strokeWidth={1.6}
              className="text-white drop-shadow-[1px_1px_0px_rgba(0,0,0,0.55)] group-hover:scale-105 transition-transform"
            />
            <span className="win98-desktop-label px-1 text-[10.5px] leading-tight group-hover:bg-[#000080]">
              lvb setup
            </span>
          </button>

          <button
            type="button"
            onClick={() => focusWindow('readme')}
            className="group flex flex-col items-center gap-0.5 p-1 text-white focus-visible:outline-1 focus-visible:outline-white"
          >
            <FileText
              size={28}
              strokeWidth={1.6}
              className="text-white drop-shadow-[1px_1px_0px_rgba(0,0,0,0.55)] group-hover:scale-105 transition-transform"
            />
            <span className="win98-desktop-label px-1 text-[10.5px] leading-tight group-hover:bg-[#000080]">
              readme.md
            </span>
          </button>

          <button
            type="button"
            onClick={() => focusWindow('media')}
            className="group flex flex-col items-center gap-0.5 p-1 text-white focus-visible:outline-1 focus-visible:outline-white"
          >
            <Film
              size={28}
              strokeWidth={1.6}
              className="text-white drop-shadow-[1px_1px_0px_rgba(0,0,0,0.55)] group-hover:scale-105 transition-transform"
            />
            <span className="win98-desktop-label px-1 text-[10.5px] leading-tight group-hover:bg-[#000080]">
              Intro.mp4
            </span>
          </button>

          <button
            type="button"
            onClick={() => focusWindow('settings')}
            className="group flex flex-col items-center gap-0.5 p-1 text-white focus-visible:outline-1 focus-visible:outline-white"
          >
            <SlidersHorizontal
              size={28}
              strokeWidth={1.6}
              className="text-white drop-shadow-[1px_1px_0px_rgba(0,0,0,0.55)] group-hover:scale-105 transition-transform"
            />
            <span className="win98-desktop-label px-1 text-[10.5px] leading-tight group-hover:bg-[#000080]">
              Settings
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
            onRunSwarmDemo={handleRunSwarmDemo}
            swarmRunning={swarmRunning}
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

      {/* Window 6: lvb CLI & Interactive TUI Setup */}
      {shouldRenderWindow('setup') && (
        <Win98Window
          id="setup"
          title="lvb setup — Local Vercel Board CLI & TUI"
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
            onOpenCommandPrompt={() => focusWindow('cmd')}
          />
        </Win98Window>
      )}

      {/* Window 7: readme.md — Windows 95 Notepad Vercel Board Guide */}
      {shouldRenderWindow('readme') && (
        <Win98Window
          id="readme"
          title="readme.md - Notepad"
          active={activeWin === 'readme'}
          zIndex={windows.readme.z}
          rect={windows.readme.rect}
          maximized={windows.readme.maximized}
          isMobile={isMobile}
          showMaximize
          onFocus={focusWindow}
          onMove={moveWindow}
          onMinimize={minimizeWindow}
          onToggleMaximize={toggleMaximize}
          onClose={closeWindow}
        >
          <ReadmeWindow
            onOpenSetup={() => focusWindow('setup')}
            onOpenIntroVideo={() => focusWindow('media')}
          />
        </Win98Window>
      )}

      {/* Window 8: Intro.mp4 — Windows 95 Media Player Animated Explainer */}
      {shouldRenderWindow('media') && (
        <Win98Window
          id="media"
          title="Intro.mp4 - Windows Media Player"
          active={activeWin === 'media'}
          zIndex={windows.media.z}
          rect={windows.media.rect}
          maximized={windows.media.maximized}
          isMobile={isMobile}
          showMaximize
          onFocus={focusWindow}
          onMove={moveWindow}
          onMinimize={minimizeWindow}
          onToggleMaximize={toggleMaximize}
          onClose={closeWindow}
        >
          <MediaPlayerWindow
            onOpenReadme={() => focusWindow('readme')}
            onOpenSetup={() => focusWindow('setup')}
          />
        </Win98Window>
      )}

      {/* Window 9: MS-DOS Command Prompt — Local CLI Simulator */}
      {shouldRenderWindow('cmd') && (
        <Win98Window
          id="cmd"
          title="Command Prompt — C:\VERCEL-BOARD"
          active={activeWin === 'cmd'}
          zIndex={windows.cmd.z}
          rect={windows.cmd.rect}
          maximized={windows.cmd.maximized}
          isMobile={isMobile}
          showMaximize
          onFocus={focusWindow}
          onMove={moveWindow}
          onMinimize={minimizeWindow}
          onToggleMaximize={toggleMaximize}
          onClose={closeWindow}
        >
          <CommandPromptWindow
            state={state}
            activeChannel={activeThread?.channelId || 'agent-bridge'}
            onRunVbCommand={handleRunCliCommand}
            onRunSwarmDemo={handleRunSwarmDemo}
            onSelectTheme={handleSelectTheme}
          />
        </Win98Window>
      )}

      {/* Window 10: Settings — Retro Desktop Themes & Board Emulator */}
      {shouldRenderWindow('settings') && (
        <Win98Window
          id="settings"
          title="Settings — Display Properties"
          active={activeWin === 'settings'}
          zIndex={windows.settings.z}
          rect={windows.settings.rect}
          isMobile={isMobile}
          onFocus={focusWindow}
          onMove={moveWindow}
          onMinimize={minimizeWindow}
          onClose={closeWindow}
        >
          <SettingsWindow
            themeId={themeId}
            soundEnabled={soundEnabled}
            autoReplyAgents={autoReplyAgents}
            swarmRunning={swarmRunning}
            onSelectTheme={handleSelectTheme}
            onToggleSound={() => {
              setSoundEnabled((prev) => {
                const next = !prev;
                if (next) playMessagePing();
                return next;
              });
            }}
            onToggleAutoReply={() => setAutoReplyAgents((v) => !v)}
            onRunSwarmDemo={handleRunSwarmDemo}
            onClose={() => closeWindow('settings')}
          />
        </Win98Window>
      )}

      {/* Window 11: Explain Like I'm 5 — Interactive Cartoon SVG Guide */}
      {shouldRenderWindow('eli5') && (
        <Win98Window
          id="eli5"
          title="Explain Like I'm 5"
          active={activeWin === 'eli5'}
          zIndex={windows.eli5.z}
          rect={windows.eli5.rect}
          maximized={windows.eli5.maximized}
          isMobile={isMobile}
          showMaximize
          onFocus={focusWindow}
          onMove={moveWindow}
          onMinimize={minimizeWindow}
          onToggleMaximize={toggleMaximize}
          onClose={closeWindow}
        >
          <ExplainLikeIm5Window
            onOpenSetup={() => focusWindow('setup')}
            onOpenCommandPrompt={() => focusWindow('cmd')}
            onOpenIntroVideo={() => focusWindow('media')}
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

      {/* Start Menu Popup */}
      {goMenuOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="win98-window fixed bottom-[36px] left-1 z-[150] w-[248px] flex overflow-hidden"
        >
          <div className="w-7 bg-[#000080] flex items-end justify-center pb-2 shrink-0">
            <span className="[writing-mode:vertical-rl] rotate-180 font-editorial font-bold italic text-[13px] tracking-wider text-white">
              Vercel Board
            </span>
          </div>
          <div className="win98-surface flex-1 py-1 text-[12px]">
            <button
              type="button"
              onClick={() => {
                setGoMenuOpen(false);
                focusWindow('eli5');
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#000080] hover:text-white"
            >
              <BookOpen size={14} />
              <span>Explain Like I&apos;m 5 (Cartoon Guide)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setGoMenuOpen(false);
                focusWindow('cmd');
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#000080] hover:text-white"
            >
              <Terminal size={14} />
              <span>Command Prompt (ping / status)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setGoMenuOpen(false);
                focusWindow('settings');
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#000080] hover:text-white"
            >
              <SlidersHorizontal size={14} />
              <span>Settings (Retro Color Schemes)</span>
            </button>
            <button
              type="button"
              onClick={() => void handleRunSwarmDemo()}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#000080] hover:text-white"
            >
              <Play size={14} />
              <span>Run 3-Agent Swarm Demo</span>
            </button>
            <div className="my-1 border-t border-[#808080] border-b border-b-white" />
            <button
              type="button"
              onClick={() => {
                setGoMenuOpen(false);
                focusWindow('media');
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#000080] hover:text-white"
            >
              <Film size={14} />
              <span>Play Intro.mp4 (Win95 Player)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setGoMenuOpen(false);
                focusWindow('readme');
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#000080] hover:text-white"
            >
              <FileText size={14} />
              <span>Read readme.md (Vercel Board)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setGoMenuOpen(false);
                focusWindow('setup');
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#000080] hover:text-white"
            >
              <FileCode2 size={14} />
              <span>Local Board CLI &amp; TUI (lvb setup)</span>
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

      {/* Dedicated Windows 95/98 Taskbar Component */}
      <Taskbar
        buttons={taskbarButtons}
        isMobile={isMobile}
        startMenuOpen={goMenuOpen}
        cliStatusOpen={cliStatusOpen}
        streamStatus={streamStatus}
        connectedAgentsCount={connectedAgents.length}
        soundEnabled={soundEnabled}
        onToggleStartMenu={() => {
          setCliStatusOpen(false);
          setGoMenuOpen((v) => !v);
        }}
        onTaskbarButtonClick={(id) => handleTaskbarClick(id as WinId)}
        onToggleCliStatus={() => {
          setGoMenuOpen(false);
          setCliStatusOpen((v) => !v);
        }}
        onToggleSound={() => {
          setSoundEnabled((prev) => {
            const next = !prev;
            if (next) playMessagePing();
            return next;
          });
        }}
        onOpenSettings={() => {
          setGoMenuOpen(false);
          setCliStatusOpen(false);
          focusWindow('settings');
        }}
      />
    </main>
  );
}

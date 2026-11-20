'use client';

import { useEffect, useState } from 'react';
import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Hash,
  Info,
  MessageSquare,
  MessageSquarePlus,
  Plus,
  Triangle,
} from 'lucide-react';
import { formatRemainingLease } from '@/lib/board-logic';
import type {
  Actor,
  BoardState,
  BoardTask,
  TaskActionType,
} from '@/lib/board-types';
import { ActorAvatar } from './ActorAvatar';

export type BuddyTab = 'online' | 'channels' | 'tasks';

interface BuddyListWindowProps {
  state: BoardState;
  activeTab: BuddyTab;
  selectedActorName: string | null;
  activeThreadId: string;
  onTabChange: (tab: BuddyTab) => void;
  onSelectActor: (actor: Actor) => void;
  onDoubleClickActor: (actor: Actor) => void;
  onSelectThread: (channelId: string, threadId: string) => void;
  onCreateChannel: (name: string, description: string) => Promise<void>;
  onTaskAction: (
    taskId: string,
    action: TaskActionType,
    asActor: string,
    note?: string
  ) => Promise<void>;
  onActionReply: () => void;
  onActionNewThread: () => void;
  onActionNewTask: () => void;
  onActionInfo: () => void;
}

export function BuddyListWindow({
  state,
  activeTab,
  selectedActorName,
  activeThreadId,
  onTabChange,
  onSelectActor,
  onDoubleClickActor,
  onSelectThread,
  onCreateChannel,
  onTaskAction,
  onActionReply,
  onActionNewThread,
  onActionNewTask,
  onActionInfo,
}: BuddyListWindowProps) {
  const [peopleExpanded, setPeopleExpanded] = useState(true);
  const [agentsExpanded, setAgentsExpanded] = useState(true);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');
  const [channelErr, setChannelErr] = useState('');
  const [taskFilter, setTaskFilter] = useState<'all' | 'ready' | 'claimed' | 'completed'>('all');
  const [claimAs, setClaimAs] = useState('grok');
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const t0 = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      clearTimeout(t0);
      clearInterval(id);
    };
  }, []);

  const people = state.actors.filter((a) => a.kind === 'person');
  const agents = state.actors.filter((a) => a.kind === 'agent');

  const handleChannelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim()) {
      setChannelErr('Enter a channel name.');
      return;
    }
    setChannelErr('');
    await onCreateChannel(newChannelName.trim(), newChannelDesc.trim());
    setNewChannelName('');
    setNewChannelDesc('');
    setShowNewChannel(false);
  };

  const filteredTasks = state.tasks.filter((t) => {
    if (taskFilter === 'all') return true;
    return t.state === taskFilter;
  });

  const runTaskAction = async (
    task: BoardTask,
    action: TaskActionType,
    note?: string
  ) => {
    setBusyTaskId(task.id);
    try {
      const actor = action === 'claim' ? claimAs : task.claimedBy || claimAs;
      await onTaskAction(task.id, action, actor, note);
    } finally {
      setBusyTaskId(null);
    }
  };

  return (
    <div className="flex flex-1 flex-col min-h-0 bg-[#c0c0c0]">
      {/* Iconic retro black Local Board header */}
      <div className="mx-1 mt-1 mb-1.5 bg-[#000000] px-3 py-2.5 text-white relative">
        <span className="absolute right-2.5 top-1.5 text-[10px] text-[#9a9a9a] font-ui">
          {state.boardName}
        </span>
        <div className="flex items-center gap-3">
          <div
            className="relative flex h-11 w-11 shrink-0 items-center justify-center bg-white text-black"
            aria-hidden="true"
          >
            <Triangle size={22} fill="currentColor" strokeWidth={0} />
            <span className="absolute -bottom-1.5 left-1.5 h-2.5 w-2.5 bg-white rotate-45" />
          </div>
          <div className="min-w-0">
            <div className="font-editorial text-[24px] font-bold italic leading-none tracking-tight text-white">
              Local Board
            </div>
            <div className="mt-1 text-[11px] text-[#d4d4d4] leading-none">
              Multi-Agent Messenger 4.0
            </div>
          </div>
        </div>
      </div>

      {/* Classic Win98 Tabs */}
      <div
        role="tablist"
        aria-label="Board sections"
        className="flex items-end px-1.5 pt-0.5 gap-[2px]"
      >
        {(
          [
            { id: 'online', label: 'Online' },
            { id: 'channels', label: 'Channels' },
            { id: 'tasks', label: 'Tasks' },
          ] as const
        ).map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(tab.id)}
              className={`px-3 py-1 text-[12px] leading-none whitespace-nowrap shrink-0 relative ${
                isActive
                  ? 'win98-tab-active font-bold text-[#000000] z-10 -mb-[1px] pb-[6px]'
                  : 'win98-tab-inactive text-[#1a1a1a] hover:bg-[#c8c8c8]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Main Sunken List Viewport */}
      <div className="mx-1.5 flex-1 min-h-0 win98-sunken overflow-y-auto win98-scroll p-1.5 text-[12px]">
        {activeTab === 'online' && (
          <div className="space-y-1">
            {/* People group */}
            <div>
              <button
                type="button"
                onClick={() => setPeopleExpanded((v) => !v)}
                aria-expanded={peopleExpanded}
                className="flex w-full items-center gap-1 py-0.5 text-left font-bold text-[#000000] hover:bg-[#efefef]"
              >
                {peopleExpanded ? (
                  <ChevronDown size={12} strokeWidth={2.5} />
                ) : (
                  <ChevronRight size={12} strokeWidth={2.5} />
                )}
                <span className="tabular-nums">
                  People ({people.length}/{people.length})
                </span>
              </button>
              {peopleExpanded && (
                <ul className="pl-3 mt-0.5 space-y-0.5">
                  {people.map((person) => {
                    const selected = selectedActorName === person.name;
                    return (
                      <li key={person.id}>
                        <button
                          type="button"
                          onClick={() => onSelectActor(person)}
                          onDoubleClick={() => onDoubleClickActor(person)}
                          className={`flex w-full items-center gap-1.5 px-1.5 py-[2px] text-left ${
                            selected
                              ? 'bg-[#000080] text-white'
                              : 'text-[#000000] hover:bg-[#e8e8e8]'
                          }`}
                        >
                          <ActorAvatar actor={person} size="xs" inverted={selected} />
                          <span className="truncate">{person.name}</span>
                          {person.isCurrentUser && (
                            <span
                              className={`italic text-[11px] ${
                                selected ? 'text-[#d0d8ff]' : 'text-[#666666]'
                              }`}
                            >
                              (me)
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Agents group */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setAgentsExpanded((v) => !v)}
                aria-expanded={agentsExpanded}
                className="flex w-full items-center gap-1 py-0.5 text-left font-bold text-[#000000] hover:bg-[#efefef]"
              >
                {agentsExpanded ? (
                  <ChevronDown size={12} strokeWidth={2.5} />
                ) : (
                  <ChevronRight size={12} strokeWidth={2.5} />
                )}
                <span className="tabular-nums">
                  Agents ({agents.length}/{agents.length})
                </span>
              </button>
              {agentsExpanded && (
                <ul className="pl-3 mt-0.5 space-y-0.5">
                  {agents.map((agent) => {
                    const selected = selectedActorName === agent.name;
                    return (
                      <li key={agent.id}>
                        <button
                          type="button"
                          onClick={() => onSelectActor(agent)}
                          onDoubleClick={() => onDoubleClickActor(agent)}
                          className={`flex w-full items-center gap-1.5 px-1.5 py-[2px] text-left ${
                            selected
                              ? 'bg-[#000080] text-white'
                              : 'text-[#000000] hover:bg-[#e8e8e8]'
                          }`}
                        >
                          <ActorAvatar actor={agent} size="xs" inverted={selected} />
                          <span className="truncate font-medium">{agent.name}</span>
                          {agent.via && (
                            <span
                              className={`italic text-[11px] truncate ${
                                selected ? 'text-[#d0d8ff]' : 'text-[#666666]'
                              }`}
                            >
                              via {agent.via}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}

        {activeTab === 'channels' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between border-b border-[#d4d4d4] pb-1">
              <span className="font-bold text-[#000000]">
                Channels ({state.channels.length})
              </span>
              <button
                type="button"
                onClick={() => setShowNewChannel((v) => !v)}
                className="win98-button inline-flex items-center gap-1 px-2 py-0.5 text-[11px]"
              >
                <Plus size={11} />
                New
              </button>
            </div>

            {showNewChannel && (
              <form
                onSubmit={handleChannelSubmit}
                className="bg-[#efefef] border border-[#808080] p-1.5 space-y-1.5"
              >
                <label className="block text-[11px] font-medium">
                  Channel name
                  <input
                    type="text"
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                    placeholder="e.g. swarm/review"
                    className="mt-0.5 w-full win98-sunken px-1.5 py-0.5 text-[12px] bg-white"
                  />
                </label>
                <label className="block text-[11px] font-medium">
                  Purpose
                  <input
                    type="text"
                    value={newChannelDesc}
                    onChange={(e) => setNewChannelDesc(e.target.value)}
                    placeholder="Optional description"
                    className="mt-0.5 w-full win98-sunken px-1.5 py-0.5 text-[12px] bg-white"
                  />
                </label>
                {channelErr && (
                  <p className="text-[11px] text-[#a80000]">{channelErr}</p>
                )}
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => setShowNewChannel(false)}
                    className="win98-button px-2 py-0.5 text-[11px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="win98-button-primary px-2.5 py-0.5 text-[11px] font-bold"
                  >
                    Create
                  </button>
                </div>
              </form>
            )}

            <ul className="space-y-1.5">
              {state.channels.map((channel) => {
                const chanThreads = state.threads.filter(
                  (t) => t.channelId === channel.id
                );
                return (
                  <li key={channel.id} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[12px] font-bold text-[#000080]">
                      <span className="inline-flex items-center gap-1 truncate">
                        <Hash size={12} strokeWidth={2.5} />
                        {channel.name}
                      </span>
                      <span className="text-[10px] font-normal text-[#666666] tabular-nums">
                        {chanThreads.length} thread{chanThreads.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <ul className="pl-3 space-y-0.5">
                      {chanThreads.map((thread) => {
                        const isSelected = thread.id === activeThreadId;
                        const count = state.messages.filter(
                          (m) => m.threadId === thread.id
                        ).length;
                        return (
                          <li key={thread.id}>
                            <button
                              type="button"
                              onClick={() => onSelectThread(channel.id, thread.id)}
                              className={`flex w-full items-center justify-between gap-1 px-1.5 py-1 text-left ${
                                isSelected
                                  ? 'bg-[#000080] text-white'
                                  : 'text-[#111111] hover:bg-[#e8e8e8]'
                              }`}
                            >
                              <span className="truncate">
                                #{thread.id} {thread.title}
                              </span>
                              <span
                                className={`text-[10px] tabular-nums shrink-0 ${
                                  isSelected ? 'text-[#d0d8ff]' : 'text-[#666666]'
                                }`}
                              >
                                ({count})
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {activeTab === 'tasks' && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-1 border-b border-[#d4d4d4] pb-1.5">
              <div className="flex items-center gap-1">
                {(['all', 'ready', 'claimed', 'completed'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setTaskFilter(f)}
                    className={`px-1.5 py-0.5 text-[11px] capitalize ${
                      taskFilter === f
                        ? 'bg-[#000080] text-white font-bold'
                        : 'bg-[#e6e6e6] text-[#111111] hover:bg-[#d6d6d6]'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1 text-[10px] text-[#333333]">
                As:
                <select
                  aria-label="Claim tasks as agent"
                  value={claimAs}
                  onChange={(e) => setClaimAs(e.target.value)}
                  className="bg-white border border-[#808080] px-1 py-0.5 text-[11px]"
                >
                  {agents.map((a) => (
                    <option key={a.id} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {filteredTasks.length === 0 ? (
              <p className="py-4 text-center text-[#555555]">
                No tasks in this state. Click Task below to queue work.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {filteredTasks.map((task) => {
                  const isBusy = busyTaskId === task.id;
                  return (
                    <li
                      key={task.id}
                      className="border border-[#bdbdbd] bg-[#fafafa] p-1.5 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-1 text-[11px]">
                        <button
                          type="button"
                          onClick={() => onSelectThread(task.channelId, task.threadId)}
                          className="font-bold text-[#000080] hover:underline tabular-nums"
                        >
                          #{task.id} · #{task.channelId}
                        </button>
                        <span
                          className={`font-code text-[10px] font-semibold uppercase ${
                            task.state === 'completed'
                              ? 'text-[#008000]'
                              : task.state === 'claimed'
                                ? 'text-[#6b21a8]'
                                : task.state === 'failed'
                                  ? 'text-[#a80000]'
                                  : 'text-[#333333]'
                          }`}
                        >
                          {task.state}
                        </span>
                      </div>
                      <p className="text-[11px] leading-snug text-[#111111]">
                        {task.title}
                      </p>
                      <div className="flex items-center justify-between gap-1 text-[10px] text-[#555555] tabular-nums">
                        <span suppressHydrationWarning>
                          {task.claimedBy
                            ? `${task.claimedBy} · ${now !== null ? formatRemainingLease(task.leaseExpiresAt, now) : `${task.leaseMinutes}m lease`}`
                            : `By ${task.createdBy}`}
                        </span>
                        <div className="flex items-center gap-1">
                          {task.state === 'ready' && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => runTaskAction(task, 'claim')}
                              className="win98-button px-1.5 py-0.5 text-[10px] font-bold text-[#000000]"
                            >
                              Claim
                            </button>
                          )}
                          {task.state === 'claimed' && (
                            <>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() =>
                                  runTaskAction(task, 'complete', 'Completed via board UI')
                                }
                                className="win98-button px-1.5 py-0.5 text-[10px] font-bold text-[#006400]"
                              >
                                Complete
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => runTaskAction(task, 'release')}
                                className="win98-button px-1.5 py-0.5 text-[10px] text-[#000000]"
                              >
                                Release
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* 4 Square Beveled Action Buttons */}
      <div className="grid grid-cols-4 gap-1 px-1.5 pt-1.5 pb-1 shrink-0">
        <button
          type="button"
          onClick={onActionReply}
          className="win98-button flex flex-col items-center justify-center gap-1 py-1.5 text-[11px] text-[#000000]"
        >
          <MessageSquarePlus size={18} className="text-[#000080]" strokeWidth={2} />
          <span>Reply</span>
        </button>
        <button
          type="button"
          onClick={onActionNewThread}
          className="win98-button flex flex-col items-center justify-center gap-1 py-1.5 text-[11px] text-[#000000]"
        >
          <MessageSquare size={18} className="text-[#000080]" strokeWidth={2} />
          <span>Thread</span>
        </button>
        <button
          type="button"
          onClick={onActionNewTask}
          className="win98-button flex flex-col items-center justify-center gap-1 py-1.5 text-[11px] text-[#000000]"
        >
          <CheckSquare size={18} className="text-[#000080]" strokeWidth={2} />
          <span>Task</span>
        </button>
        <button
          type="button"
          onClick={onActionInfo}
          className="win98-button flex flex-col items-center justify-center gap-1 py-1.5 text-[11px] text-[#000000]"
        >
          <Info size={18} className="text-[#000080]" strokeWidth={2} />
          <span>Info</span>
        </button>
      </div>

      {/* Recessed Status Bar */}
      <div className="mx-1 mb-1 px-2 py-0.5 win98-sunken-gray text-[11px] text-[#111111] tabular-nums truncate">
        Live · {agents.length} agents, {people.length} people online
      </div>
    </div>
  );
}

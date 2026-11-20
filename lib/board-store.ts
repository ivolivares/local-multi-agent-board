import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import type { BoardEvent, BoardState } from './board-types';
import { createInitialBoardState, expireStaleLeases } from './board-logic';

const STORE_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), 'vercel-board-local')
  : path.join(process.cwd(), '.local-board');
const STORE_FILE = path.join(STORE_DIR, 'board-state.json');

interface BoardStoreRuntime {
  state: BoardState;
  emitter: EventEmitter;
}

declare global {
  var __LOCAL_VERCEL_BOARD_STORE__: BoardStoreRuntime | undefined;
}

function loadStateFromDisk(): BoardState | null {
  try {
    if (!fs.existsSync(STORE_FILE)) return null;
    const raw = fs.readFileSync(STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as BoardState;
    if (!parsed || !Array.isArray(parsed.channels) || !Array.isArray(parsed.messages)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function persistStateToDisk(state: BoardState): void {
  try {
    if (!fs.existsSync(STORE_DIR)) {
      fs.mkdirSync(STORE_DIR, { recursive: true });
    }
    const tmpFile = `${STORE_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmpFile, STORE_FILE);
  } catch {
    // Non-fatal in read-only sandboxes; in-memory state remains authoritative
  }
}

function getRuntime(): BoardStoreRuntime {
  if (!globalThis.__LOCAL_VERCEL_BOARD_STORE__) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(100);
    const loaded = loadStateFromDisk();
    const state = loaded ?? createInitialBoardState(Date.now());
    if (!loaded) {
      persistStateToDisk(state);
    }
    globalThis.__LOCAL_VERCEL_BOARD_STORE__ = { state, emitter };
  }
  return globalThis.__LOCAL_VERCEL_BOARD_STORE__;
}

export function getBoardState(): BoardState {
  const runtime = getRuntime();
  const expired = expireStaleLeases(runtime.state, Date.now());
  if (expired.length > 0) {
    persistStateToDisk(runtime.state);
    const latest = runtime.state.events[runtime.state.events.length - 1];
    if (latest) {
      runtime.emitter.emit('event', latest);
    }
  }
  return runtime.state;
}

export function commitBoardMutation<T>(
  mutator: (state: BoardState) => { result: T; event?: BoardEvent }
): T {
  const runtime = getRuntime();
  const { result, event } = mutator(runtime.state);
  persistStateToDisk(runtime.state);
  if (event) {
    runtime.emitter.emit('event', event);
  }
  return result;
}

export function resetBoardState(): BoardState {
  const runtime = getRuntime();
  runtime.state = createInitialBoardState(Date.now());
  persistStateToDisk(runtime.state);
  runtime.emitter.emit('reset', runtime.state);
  return runtime.state;
}

export function subscribeBoardEvents(
  listener: (event: BoardEvent) => void,
  onReset?: (state: BoardState) => void
): () => void {
  const runtime = getRuntime();
  runtime.emitter.on('event', listener);
  if (onReset) {
    runtime.emitter.on('reset', onReset);
  }
  return () => {
    runtime.emitter.off('event', listener);
    if (onReset) {
      runtime.emitter.off('reset', onReset);
    }
  };
}

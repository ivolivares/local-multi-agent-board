export const DESKTOP_GRID_SIZE = 64;
export const DESKTOP_TASKBAR_HEIGHT = 36;

export type DesktopIconId =
  | 'eli5'
  | 'cmd'
  | 'terminal'
  | 'setup'
  | 'addAgent'
  | 'readme'
  | 'media'
  | 'settings';

export interface DesktopIconPosition {
  x: number;
  y: number;
}

export type DesktopIconLayout = Record<DesktopIconId, DesktopIconPosition>;

export interface GridBounds {
  maxCol: number;
  maxRow: number;
  cellSize: number;
}

export const DEFAULT_DESKTOP_ICON_ORDER: DesktopIconId[] = [
  'eli5',
  'cmd',
  'addAgent',
  'terminal',
  'setup',
  'readme',
  'media',
  'settings',
];

export function computeGridBounds(
  viewportWidth: number,
  viewportHeight: number,
  cellSize = DESKTOP_GRID_SIZE
): GridBounds {
  const safeWidth = Math.max(cellSize * 2, Math.floor(viewportWidth || 1440));
  const safeHeight = Math.max(
    cellSize * 2 + DESKTOP_TASKBAR_HEIGHT,
    Math.floor(viewportHeight || 900)
  );
  // Keep each 64x64 icon cell completely inside the visible viewport above the taskbar
  const maxCol = Math.max(0, Math.floor((safeWidth - cellSize) / cellSize));
  const maxRow = Math.max(
    0,
    Math.floor((safeHeight - DESKTOP_TASKBAR_HEIGHT - cellSize) / cellSize)
  );
  return { maxCol, maxRow, cellSize };
}

function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function findNearestFreeCell(
  targetCol: number,
  targetRow: number,
  occupied: Set<string>,
  bounds: GridBounds
): { col: number; row: number } {
  const startCol = clamp(targetCol, 0, bounds.maxCol);
  const startRow = clamp(targetRow, 0, bounds.maxRow);
  if (!occupied.has(cellKey(startCol, startRow))) {
    return { col: startCol, row: startRow };
  }

  const maxRadius = Math.max(bounds.maxCol, bounds.maxRow) + 2;
  for (let radius = 1; radius <= maxRadius; radius++) {
    let best: { col: number; row: number; distSq: number } | null = null;
    for (let dc = -radius; dc <= radius; dc++) {
      for (let dr = -radius; dr <= radius; dr++) {
        if (Math.abs(dc) !== radius && Math.abs(dr) !== radius) continue;
        const c = startCol + dc;
        const r = startRow + dr;
        if (c < 0 || c > bounds.maxCol || r < 0 || r > bounds.maxRow) continue;
        if (occupied.has(cellKey(c, r))) continue;
        const distSq = dc * dc + dr * dr;
        if (
          !best ||
          distSq < best.distSq ||
          (distSq === best.distSq && (r < best.row || (r === best.row && c > best.col)))
        ) {
          best = { col: c, row: r, distSq };
        }
      }
    }
    if (best) {
      return { col: best.col, row: best.row };
    }
  }

  return { col: startCol, row: startRow };
}

/**
 * Auto-aligns all desktop icons onto a structured 64x64 Win98 grid without overlap.
 * Defaults to anchoring along the right-hand desktop edge (wrapping leftward if needed)
 * so the default open windows on the left/center remain completely unobstructed.
 */
export function autoAlignDesktopIcons(
  ids: readonly DesktopIconId[],
  viewportWidth: number,
  viewportHeight: number,
  anchor: 'right' | 'left' = 'right',
  cellSize = DESKTOP_GRID_SIZE
): DesktopIconLayout {
  const bounds = computeGridBounds(viewportWidth, viewportHeight, cellSize);
  const rowsPerColumn = Math.max(1, bounds.maxRow + 1);
  const layout = {} as DesktopIconLayout;

  ids.forEach((id, index) => {
    const colOffset = Math.floor(index / rowsPerColumn);
    const row = index % rowsPerColumn;
    const col =
      anchor === 'right'
        ? clamp(bounds.maxCol - colOffset, 0, bounds.maxCol)
        : clamp(colOffset, 0, bounds.maxCol);

    layout[id] = {
      x: col * cellSize,
      y: row * cellSize,
    };
  });

  return layout;
}

/**
 * Snaps a single dragged icon to the nearest free 64x64 grid coordinate,
 * preventing out-of-bounds placement and preventing overlap with any other icon.
 */
export function snapDesktopIcon(
  id: DesktopIconId,
  rawPos: DesktopIconPosition,
  currentLayout: DesktopIconLayout,
  viewportWidth: number,
  viewportHeight: number,
  cellSize = DESKTOP_GRID_SIZE
): DesktopIconPosition {
  const bounds = computeGridBounds(viewportWidth, viewportHeight, cellSize);
  const occupied = new Set<string>();

  for (const [otherId, pos] of Object.entries(currentLayout) as [
    DesktopIconId,
    DesktopIconPosition,
  ][]) {
    if (otherId === id || !pos) continue;
    const oCol = clamp(Math.round(pos.x / cellSize), 0, bounds.maxCol);
    const oRow = clamp(Math.round(pos.y / cellSize), 0, bounds.maxRow);
    occupied.add(cellKey(oCol, oRow));
  }

  const targetCol = Math.round(rawPos.x / cellSize);
  const targetRow = Math.round(rawPos.y / cellSize);
  const chosen = findNearestFreeCell(targetCol, targetRow, occupied, bounds);

  return {
    x: chosen.col * cellSize,
    y: chosen.row * cellSize,
  };
}

/**
 * Sanitizes an entire icon layout (for example after viewport resize or loading saved positions)
 * so every icon sits on an exact 64x64 grid multiple with zero collisions.
 */
export function resolveDesktopIconCollisions(
  layout: Partial<Record<DesktopIconId, DesktopIconPosition>>,
  ids: readonly DesktopIconId[],
  viewportWidth: number,
  viewportHeight: number,
  cellSize = DESKTOP_GRID_SIZE
): DesktopIconLayout {
  const bounds = computeGridBounds(viewportWidth, viewportHeight, cellSize);
  const fallback = autoAlignDesktopIcons(ids, viewportWidth, viewportHeight, 'right', cellSize);
  const occupied = new Set<string>();
  const resolved = {} as DesktopIconLayout;

  for (const id of ids) {
    const candidate = layout[id] ?? fallback[id];
    const targetCol = Math.round(candidate.x / cellSize);
    const targetRow = Math.round(candidate.y / cellSize);
    const chosen = findNearestFreeCell(targetCol, targetRow, occupied, bounds);
    occupied.add(cellKey(chosen.col, chosen.row));
    resolved[id] = {
      x: chosen.col * cellSize,
      y: chosen.row * cellSize,
    };
  }

  return resolved;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autoAlignDesktopIcons,
  computeGridBounds,
  DEFAULT_DESKTOP_ICON_ORDER,
  DESKTOP_GRID_SIZE,
  resolveDesktopIconCollisions,
  snapDesktopIcon,
} from './desktop-grid';

test('autoAlignDesktopIcons places every icon on exact 64x64 multiples without overlap', () => {
  const layout = autoAlignDesktopIcons(DEFAULT_DESKTOP_ICON_ORDER, 1440, 900);
  const seen = new Set<string>();

  for (const id of DEFAULT_DESKTOP_ICON_ORDER) {
    const pos = layout[id];
    assert.ok(pos, `missing icon ${id}`);
    assert.equal(pos.x % DESKTOP_GRID_SIZE, 0, `${id}.x must align to 64px`);
    assert.equal(pos.y % DESKTOP_GRID_SIZE, 0, `${id}.y must align to 64px`);
    const key = `${pos.x},${pos.y}`;
    assert.equal(seen.has(key), false, `duplicate cell ${key} for ${id}`);
    seen.add(key);
  }
});

test('autoAlignDesktopIcons wraps cleanly to adjacent 64px column on shorter viewports', () => {
  const layout = autoAlignDesktopIcons(DEFAULT_DESKTOP_ICON_ORDER, 1280, 420);
  const bounds = computeGridBounds(1280, 420);
  const distinctCols = new Set(
    DEFAULT_DESKTOP_ICON_ORDER.map((id) => layout[id].x / DESKTOP_GRID_SIZE)
  );
  assert.ok(distinctCols.size >= 2, 'should wrap into at least 2 columns');
  for (const id of DEFAULT_DESKTOP_ICON_ORDER) {
    assert.ok(layout[id].y <= bounds.maxRow * DESKTOP_GRID_SIZE);
    assert.ok(layout[id].x >= 0 && layout[id].x <= bounds.maxCol * DESKTOP_GRID_SIZE);
  }
});

test('snapDesktopIcon rounds to nearest 64x64 cell and avoids colliding with existing icons', () => {
  const initial = autoAlignDesktopIcons(DEFAULT_DESKTOP_ICON_ORDER, 1440, 900);

  // Dragging to an unaligned open spot snaps to nearest 64px cell
  const openSnap = snapDesktopIcon('cmd', { x: 215, y: 150 }, initial, 1440, 900);
  assert.deepEqual(openSnap, { x: 192, y: 128 });

  // Dropping directly on top of 'eli5' pushes 'cmd' to the nearest free 64x64 neighbor
  const occupiedTarget = initial.eli5;
  const resolved = snapDesktopIcon('cmd', occupiedTarget, initial, 1440, 900);
  assert.equal(resolved.x % DESKTOP_GRID_SIZE, 0);
  assert.equal(resolved.y % DESKTOP_GRID_SIZE, 0);
  assert.notDeepEqual(resolved, occupiedTarget);
});

test('resolveDesktopIconCollisions eliminates overlapping arbitrary coordinates onto 64x64 grid', () => {
  const overlapping = Object.fromEntries(
    DEFAULT_DESKTOP_ICON_ORDER.map((id) => [id, { x: 133, y: 77 }])
  );
  const fixed = resolveDesktopIconCollisions(
    overlapping,
    DEFAULT_DESKTOP_ICON_ORDER,
    1440,
    900
  );
  const uniqueCells = new Set(
    DEFAULT_DESKTOP_ICON_ORDER.map((id) => `${fixed[id].x},${fixed[id].y}`)
  );
  assert.equal(uniqueCells.size, DEFAULT_DESKTOP_ICON_ORDER.length);
  for (const id of DEFAULT_DESKTOP_ICON_ORDER) {
    assert.equal(fixed[id].x % DESKTOP_GRID_SIZE, 0);
    assert.equal(fixed[id].y % DESKTOP_GRID_SIZE, 0);
  }
});

// What the tests of things staying put share (editor spec §68, things_stay_put). Its check fails when a thing
// already shown moves without being asked. Test support only — nothing here ships.
// Roger, 1 Nov 2026: "having nodes jump around is a nightmare... Nodes should stay where they are".
import assert from 'node:assert/strict';

/** How far a thing may shift, in the drawing's units, and still have stayed put: rounding, not a move. */
export const STILL = 0.5;

/** Where a spot is: its own numbers, or the middle of a box with `x`, `y`, `width` and `height`. */
const middleOf = (spot) =>
  Array.isArray(spot) ? spot : [spot.x + (spot.width ?? 0) / 2, spot.y + (spot.height ?? 0) / 2];

/**
 * The things shown `before` that moved by `after`, each with where it was and is. A thing gone is not moved, nor one
 * new, nor one the person `asked` to move.
 */
export function movedThings(before, after, { asked = [], still = STILL } = {}) {
  const moved = [];
  for (const [key, was] of before) {
    const now = after.get(key);
    if (now === undefined || asked.includes(key)) continue;
    const [a, b] = [middleOf(was), middleOf(now)];
    if (Math.hypot(...a.map((v, i) => v - (b[i] ?? 0))) > still) moved.push({ key, from: a, to: b });
  }
  return moved;
}

/** Fails, saying `what` and which things moved, when a thing shown `before` moved by `after` without being asked. */
export function assertStaysPut(before, after, what, options) {
  const moved = movedThings(before, after, options);
  assert.deepEqual(
    moved.map((m) => m.key),
    [],
    `${what}: shown things moved on their own: ${moved
      .slice(0, 5)
      .map((m) => `${m.key} ${m.from.map(Math.round)} → ${m.to.map(Math.round)}`)
      .join('; ')}`,
  );
}

/** Each thing's box in a drawing's `marks`, by its key: the first box drawn for it. */
export function spotsOfMarks(marks) {
  const spots = new Map();
  for (const m of marks) if (m.kind === 'box' && m.of !== undefined && !spots.has(m.of)) spots.set(m.of, m);
  return spots;
}

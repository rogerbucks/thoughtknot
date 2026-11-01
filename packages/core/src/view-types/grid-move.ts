// A card moved to another column of the grid view (editor spec §68, projection_grid). On a kanban board, dragging a
// card from todo to doing changes its status in the text. The column a card lands in is the one of the card nearest it
// across. Its property is written where the thing is written, as the details write one. Dropped in the column of
// things with no value, the property is taken out.
import { graphOfBlock } from '../blocks.ts';
import type { PlacedBox } from '../box-drag.ts';
import { parseValue, setProperty } from '../inspector.ts';
import type { GraphShape } from '../types-shape.ts';
import { GRID_NONE, gridProperty } from './grid-view.ts';
import { word } from '../words.ts';

/** Where a card dropped goes: the property its columns are by, and the value of the column it lands in, or none. */
export interface GridDrop {
  by: string;
  value: string | null;
  /** The column's name, as its head says it. */
  column: string;
}

/** The value of `by` that thing `key` of `shape` carries: the column it sits in, or none. */
const valueOf = (shape: GraphShape, key: string, by: string): string | null =>
  shape.things.find((t) => t.key === key)?.texts?.get(by) ?? null;

/**
 * Where thing `key` of `shape`, dropped at `at`, goes among the cards placed at `boxes`: the column of the card nearest
 * it across. Null where the grid is by kinds, which a drag does not change, or where it lands in its own column.
 */
export function gridDrop(
  shape: GraphShape,
  key: string,
  at: { x: number; y: number },
  boxes: readonly PlacedBox[],
): GridDrop | null {
  const by = gridProperty(shape);
  if (!by) return null;
  const across = (b: PlacedBox) => Math.abs((b.left + b.right) / 2 - at.x);
  const near = boxes.filter((b) => b.key !== key).sort((a, b) => across(a) - across(b))[0];
  if (!near) return null;
  const value = valueOf(shape, near.key, by);
  if (value === valueOf(shape, key, by)) return null;
  return { by, value, column: value ?? GRID_NONE };
}

/**
 * The block of `texts` that writes thing `key` of `graph`, with its property `by` set to `value`, or taken out for
 * none. The first block that writes the thing with a kind or properties is the one changed. Else, why not.
 */
export function gridMoved(
  texts: readonly string[],
  graph: string,
  key: string,
  drop: Pick<GridDrop, 'by' | 'value'>,
): { block: number; was: string; now: string } | { reason: string } {
  const gql = drop.value === null ? null : parseValue('text', drop.value);
  if (gql && !gql.ok) return { reason: gql.error };
  let reason: string | null = null;
  for (const [block, was] of texts.entries()) {
    if (graphOfBlock(was) !== graph) continue;
    const r = setProperty(was, graph, { thing: key }, drop.by, gql ? gql.gql : null);
    if (r.ok) return { block, was, now: r.text };
    reason ??= r.reason;
  }
  return { reason: reason ?? word('view.grid.not-here', { thing: key }) };
}

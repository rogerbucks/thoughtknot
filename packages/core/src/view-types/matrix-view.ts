// The matrix view (editor spec §36, view_types_offered; §68, projection_matrix): a graph as a grid, a row and a column
// for each thing. A cell is filled where a link runs from its row's thing to its column's thing. A matrix shows a dense
// graph that a network draws as a tangle. The things are ordered so each group is a block on the diagonal, outlined
// (block-order.ts). It reads the same shape the network beside it draws. It is drawn as marks (drawing-marks.ts), so
// every painter draws it the same way.
import type { DrawMark } from '../drawing-marks.ts';
import type { DiagramGiven } from '../plugin-diagrams.ts';
import { blockName, blockOrder } from './block-order.ts';
import { LETTER, fitText } from './fit-text.ts';
import { NAME_MOST } from './type-scale.ts';

/** The share of the space's shorter side kept for the things' names, along the top and down the left. */
const NAMES_SHARE = 0.25;

/**
 * The marks of `shape` drawn as a matrix in `space`. Names run along the top and down the left, with a cell per link.
 * Each group's block is outlined.
 */
export function matrixMarks({ shape, space }: DiagramGiven): DrawMark[] {
  const n = shape.things.length;
  if (!n) return [];
  const names = Math.min(space.width, space.height) * NAMES_SHARE;
  // the rows' names take any width the square grid leaves spare, up to half the space, so more of each name shows
  const left = Math.min(Math.max(names, space.width - (space.height - names)), space.width / 2);
  const cell = Math.min((space.width - left) / n, (space.height - names) / n);
  const { order, blocks } = blockOrder(shape);
  const place = new Map(order.map((k, i) => [k, i]));
  const text = new Map(shape.things.map((t) => [t.key, t.text]));
  // a column is too narrow for a name, so it is numbered as its row is; each name is said in full (matrix_labels_fit)
  const digits = String(n).length;
  const size = Math.min(cell * 0.6, names / 4, NAME_MOST, cell / (digits * LETTER));
  const marks: DrawMark[] = order.flatMap((key, i): DrawMark[] => {
    const across = left + i * cell + cell / 2,
      down = names + i * cell + cell / 2,
      t = text.get(key) ?? key;
    const common = { kind: 'label' as const, of: key, style: 'text', size, role: 'thing' as const, name: t };
    const number = `${i + 1}`;
    const rowText = `${number}  ${fitText(t, left - 8 - (digits + 2) * size * LETTER, size)}`;
    return [
      {
        ...common,
        id: `${key}.row`,
        text: rowText,
        x: left - 4,
        y: down + size / 3,
        anchor: 'end',
        maxWidth: left - 8,
      },
      { ...common, id: `${key}.column`, text: number, x: across, y: names - 4, anchor: 'middle', maxWidth: cell },
    ];
  });
  if (blocks.length > 1)
    for (const b of blocks) {
      const at = b.from * cell,
        side = (b.to - b.from) * cell;
      const name = blockName(b, order, (k) => text.get(k) ?? k);
      marks.push({
        kind: 'group',
        id: `group\n${b.from}`,
        style: 'group',
        x: left + at,
        y: names + at,
        width: side,
        height: side,
        role: 'group',
        name,
        z: -1,
      });
    }
  // one cell for each pair of things linked, saying every type of link between them
  const cells = new Map<string, { from: string; to: string; types: string[] }>();
  for (const l of shape.links) {
    if (!place.has(l.from) || !place.has(l.to)) continue;
    const key = `${l.from}\n${l.to}`;
    const c = cells.get(key) ?? { from: l.from, to: l.to, types: [] };
    if (!c.types.includes(l.type)) c.types.push(l.type);
    cells.set(key, c);
  }
  for (const { from, to, types } of cells.values()) {
    const row = place.get(from) ?? 0,
      column = place.get(to) ?? 0;
    marks.push({
      kind: 'box',
      // a key may hold a dot but never a new line, so the two keys are joined by one
      id: `cell.${from}\n${to}`,
      style: types.length > 1 ? 'link.many' : `link`,
      x: left + column * cell,
      y: names + row * cell,
      width: cell,
      height: cell,
      role: 'link',
      name: `${text.get(from)} ${types.join(', ')} ${text.get(to)}`,
    });
  }
  return marks;
}

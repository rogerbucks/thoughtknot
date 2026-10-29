// The grid view (editor spec §68, projection_grid). A graph's things are cards in columns by a property, such as
// status as a kanban board, and in rows by their kinds. The property is the word most things carry, with two to twelve
// values. With none, the columns are the kinds. It is drawn as marks (drawing-marks.ts), so every painter draws it the
// same way.
import type { DrawMark } from '../drawing-marks.ts';
import type { DiagramGiven } from '../plugin-diagrams.ts';
import type { GraphShape } from '../types-shape.ts';

/** The fewest and most values a property may have to make the columns. */
const FEWEST_COLUMNS = 2;
const MOST_COLUMNS = 12;
/** The tallest a card is, as a share of the space's height. */
const CARD_SHARE = 0.06;
/** The share of a column kept clear on each side of its cards. */
const PAD_SHARE = 0.06;

/** How the grid splits things: the property its columns are by (none for kinds), and each column and row in order. */
export interface GridSplit {
  by: string | null;
  columns: string[];
  rows: string[];
  /** Each thing's column and row. */
  cell: Map<string, [number, number]>;
}

/** The usual steps of work, in order: columns all named by them go in this order, so a board reads left to right. */
const WORK_STEPS = [
  ['backlog', 'new', 'open', 'todo', 'to do', 'planned'],
  ['doing', 'in progress', 'active', 'started', 'blocked'],
  ['review', 'in review', 'testing'],
  ['done', 'closed', 'complete', 'completed', 'shipped'],
].flatMap((step, i) => step.map((w): [string, number] => [w, i]));
const stepOf = new Map(WORK_STEPS);

/** What a thing is called where it carries no value: the column of things not yet sorted. */
export const GRID_NONE = '(none)';

/**
 * The property most things carry with two to twelve values, some shared, the first written when two are as common; or
 * null. A value no two things share, such as a description, never makes columns.
 */
export function gridProperty(shape: GraphShape): string | null {
  const values = new Map<string, Set<string>>(),
    carried = new Map<string, number>();
  for (const t of shape.things)
    for (const [k, v] of t.texts ?? []) {
      values.set(k, (values.get(k) ?? new Set()).add(v));
      carried.set(k, (carried.get(k) ?? 0) + 1);
    }
  let best: string | null = null;
  for (const [k, vs] of values) {
    const n = carried.get(k) ?? 0;
    if (vs.size >= FEWEST_COLUMNS && vs.size <= MOST_COLUMNS && vs.size < n && n > (carried.get(best ?? '') ?? 0))
      best = k;
  }
  return best;
}

/**
 * How `shape`'s things fall in columns and rows, each in the order first written, unsorted things last. Columns that
 * are all steps of work, such as todo, doing and done, go in that order.
 */
export function gridSplit(shape: GraphShape): GridSplit {
  const by = gridProperty(shape);
  const kindOf = (t: GraphShape['things'][number]) => t.kinds.join(', ') || 'Thing';
  const kinds = [...new Set(shape.things.map(kindOf))];
  const columnOf = (t: GraphShape['things'][number]) => (by ? (t.texts?.get(by) ?? GRID_NONE) : kindOf(t));
  let firstSeen = [...new Set(shape.things.map(columnOf))];
  const step = (c: string) => stepOf.get(c.toLowerCase());
  if (by && firstSeen.every((c) => c === GRID_NONE || step(c) !== undefined))
    firstSeen = firstSeen.sort((x, y) => (step(x) ?? 9) - (step(y) ?? 9));
  const columns = [...firstSeen.filter((c) => c !== GRID_NONE), ...(firstSeen.includes(GRID_NONE) ? [GRID_NONE] : [])];
  const rows = by && kinds.length > 1 ? kinds : [''];
  const cell = new Map(
    shape.things.map((t): [string, [number, number]] => [
      t.key,
      [columns.indexOf(columnOf(t)), rows.length > 1 ? rows.indexOf(kindOf(t)) : 0],
    ]),
  );
  return { by, columns, rows, cell };
}

/** The marks of `shape` drawn as a grid in `space`: a column for each value, a row for each kind, a card per thing. */
export function gridMarks({ shape, space }: DiagramGiven): DrawMark[] {
  if (!shape.things.length) return [];
  const { by, columns, rows, cell } = gridSplit(shape);
  const nameSize = Math.min(12, Math.max(space.height * 0.025, 7));
  const head = nameSize * 2.5,
    side = rows.length > 1 ? Math.min(space.width * 0.15, nameSize * 9) : 0;
  const width = (space.width - side) / columns.length;
  // each row as tall as its fullest cell needs, the cards shrunk as one where they would not fit
  const count = new Map<string, number>();
  for (const [c, r] of cell.values()) count.set(`${c} ${r}`, (count.get(`${c} ${r}`) ?? 0) + 1);
  const fullest = rows.map((_, r) => Math.max(1, ...columns.map((_, c) => count.get(`${c} ${r}`) ?? 0)));
  const total = fullest.reduce((a, b) => a + b, 0);
  const card = Math.min(space.height * CARD_SHARE, (space.height - head) / (total + rows.length * 0.5));
  const gap = card * 0.15;
  const top = rows.map((_, r) => head + fullest.slice(0, r).reduce((a, b) => a + b + 0.5, 0) * card);
  const marks: DrawMark[] = [];
  columns.forEach((value, c) => {
    const x = side + c * width;
    marks.push({
      kind: 'group',
      id: `column\n${c}`,
      style: 'group',
      x: x + width * (PAD_SHARE / 2),
      y: 0,
      width: width * (1 - PAD_SHARE),
      height: space.height,
      role: 'group',
      name: by ? `${by}: ${value}` : value,
      z: -1,
    });
    marks.push({
      kind: 'label',
      id: `head\n${c}`,
      style: 'text',
      x: x + width / 2,
      y: head / 2 + nameSize / 3,
      text: value,
      size: nameSize,
      anchor: 'middle',
      maxWidth: width * (1 - 2 * PAD_SHARE),
    });
  });
  if (rows.length > 1)
    rows.forEach((kind, r) =>
      marks.push({
        kind: 'label',
        id: `row\n${r}`,
        style: 'text',
        x: side - nameSize / 2,
        y: (top[r] ?? 0) + card / 2 + nameSize / 3,
        text: kind,
        size: nameSize,
        anchor: 'end',
        maxWidth: side - nameSize,
      }),
    );
  const filled = new Map<string, number>();
  for (const t of shape.things) {
    const [c, r] = cell.get(t.key) ?? [0, 0];
    const i = filled.get(`${c} ${r}`) ?? 0;
    filled.set(`${c} ${r}`, i + 1);
    const x = side + c * width + width * PAD_SHARE,
      y = (top[r] ?? 0) + i * card,
      w = width * (1 - 2 * PAD_SHARE),
      h = card - gap;
    marks.push({
      kind: 'box',
      id: t.key,
      of: t.key,
      style: 'thing',
      x,
      y,
      width: w,
      height: h,
      shape: 'round',
      role: 'thing',
      name: t.text,
    });
    marks.push({
      kind: 'label',
      id: `${t.key}\nlabel`,
      of: t.key,
      style: 'text',
      x: x + w / 2,
      y: y + h / 2 + Math.min(nameSize, h * 0.6) / 3,
      text: t.text,
      size: Math.min(nameSize, h * 0.6),
      anchor: 'middle',
      maxWidth: w * 0.9,
    });
  }
  return marks;
}

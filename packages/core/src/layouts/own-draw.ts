// Drawing a graph by our own layout engine (editor spec §53, layout_own_engine). The layout source Graphviz is handed
// is written as ever. For our own engine every box is given a stand-in spot. Graphviz's `nop` engine only measures
// and writes it. Then own-engine.ts places the boxes and direct-links.ts draws the links. A drawing in groups is
// Graphviz's to lay out still: our engine does not draw groups yet. Host-free and pure.
import type { DrawMark } from '../drawing-marks.ts';
import { directLinks } from '../direct-links.ts';
import type { LaidMarks } from '../graphviz-marks.ts';
import { layoutSvg } from '../graphviz-svg.ts';
import { MARGIN, ownSpots } from './own-engine.ts';

/** A box line of the layout source: its indent and its key, before its attributes. */
const BOX_LINE = /^(\s+)("(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_]*) \[/;
/** The words that start a line of defaults, not a box. */
const DEFAULTS = new Set(['graph', 'node', 'edge']);

/** Whether a layout source can be laid out by our own engine: it draws no groups. */
export const ownable = (dot: string): boolean => !dot.includes('subgraph cluster_');

/** `dot` with each box at a stand-in spot in a grid, and links drawn straight, for Graphviz only to measure. */
export function ownSource(dot: string): string {
  let i = 0;
  const lines = dot.split('\n').map((line) =>
    line.includes('->') || line.includes(' -- ')
      ? line
      : line.replace(BOX_LINE, (whole, indent: string, key: string) => {
          if (DEFAULTS.has(key)) return whole;
          const k = i++;
          return `${indent}${key} [pos="${(k % 50) * 300},${Math.floor(k / 50) * 200}", `;
        }),
  );
  lines.splice(1, 0, '  graph [splines=false];');
  return lines.join('\n');
}

/** `laid` resized to hold the boxes at `spots`, its background with it, so the drawing has no empty room round it. */
function fitted(laid: LaidMarks, spots: ReadonlyMap<string, readonly [number, number]>): LaidMarks {
  let width = 0,
    height = 0;
  const half = new Map<string, [number, number]>();
  for (const m of laid.marks)
    if (m.kind === 'box' && m.role === 'thing' && m.of !== undefined) half.set(m.of, [m.width / 2, m.height / 2]);
  for (const [k, [x, y]] of spots) {
    const [hw, hh] = half.get(k) ?? [0, 0];
    width = Math.max(width, x + hw + MARGIN);
    height = Math.max(height, y + hh + MARGIN);
  }
  const marks = laid.marks.map((m): DrawMark => {
    if (m.id !== 'background' || m.kind !== 'box') return m;
    const { outline: _gone, ...rest } = m;
    return { ...rest, x: 0, y: 0, width, height };
  });
  return { ...laid, space: { width, height }, marks };
}

/** The SVG of the drawing Graphviz measured in `laid`, its boxes placed by our own engine, its links direct. */
export function ownSvg(laid: LaidMarks, rankdir: string): string {
  const { spots } = ownSpots(laid, rankdir === 'TB' || rankdir === 'BT' ? 'TB' : 'LR');
  return layoutSvg(directLinks(fitted(laid, spots), spots));
}

// Drawing a graph by our own layout engine (editor spec §53, layout_own_engine). The layout source Graphviz is handed
// is written as ever. For our own engine every box is given a stand-in spot. Graphviz's `nop` engine only measures
// and writes it. Then own-engine.ts places the boxes and direct-links.ts draws the links. Groups are read from the
// source's clusters and drawn as boxes by our engine (grouped.ts), not by Graphviz. Host-free and pure.
import type { DrawMark } from '../drawing-marks.ts';
import { directLinks } from '../direct-links.ts';
import type { LaidMarks } from '../graphviz-marks.ts';
import { layoutSvg } from '../graphviz-svg.ts';
import { colourToken } from '../graphviz-json.ts';
import { MARGIN, ownSpots } from './own-engine.ts';
import type { Group, GroupBox } from './grouped.ts';
import { layoutOptions } from './layout-options.ts';
import type { LayoutOptions } from './layout-options.ts';

/** A box line of the layout source: its indent and its key, before its attributes. */
const BOX_LINE = /^(\s+)("(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_]*) \[/;
/** The words that start a line of defaults, not a box. */
const DEFAULTS = new Set(['graph', 'node', 'edge']);

/** A group of the layout source, on one line: its name, its words, the rest of its attributes and its things. */
const GROUP_LINE = /^\s*subgraph (cluster_\w+) \{label=<((?:[^>\\]|\\.)*)>;(.*)\}\s*$/;
/** A thing of a group line: a quoted or bare key standing alone between semicolons. */
const MEMBER = /(?:^|;)\s*("(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_]*)\s*(?=;|$)/g;

/** A group read from the layout source, with how Graphviz would have drawn it. */
export interface SourceGroup extends Group {
  style: string;
}

/** The words of a key or a label as the source writes them, unquoted and unescaped. */
const plain = (text: string) =>
  text
    .replace(/^"|"$/g, '')
    .replace(/\\(.)/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

/** The groups of a layout source, each written on one line as the style source writes them. */
export function groupsIn(dot: string): SourceGroup[] {
  const out: SourceGroup[] = [];
  for (const line of dot.split('\n')) {
    const m = GROUP_LINE.exec(line);
    if (!m) continue;
    const rest = m[3] ?? '';
    const members = [...rest.matchAll(MEMBER)].map((k) => plain(k[1] as string));
    const colour = /(?:^|;)\s*color="([^"]*)"/.exec(rest)?.[1];
    const dashed = /style="[^"]*dashed/.test(rest);
    out.push({
      id: m[1] as string,
      label: plain(m[2] as string),
      members,
      style: colourToken(colour) + (dashed ? '.dashed' : ''),
    });
  }
  return out;
}

/** Whether a layout source can be laid out by our own engine: each of its groups is on one line, none inside another. */
export const ownable = (dot: string): boolean =>
  dot.split('\n').every((line) => !line.includes('subgraph cluster_') || GROUP_LINE.test(line));

/** The line of a layout source that carries the options our engine lays it out by. */
const OPTIONS_LINE = /^\s*\/\/ layout options (\{.*\})$/m;

/** The options our engine lays out the source `dot` by: those `ownSource` wrote in, each kept in its range. */
export function optionsIn(dot: string): LayoutOptions {
  try {
    return layoutOptions(JSON.parse(OPTIONS_LINE.exec(dot)?.[1] ?? '{}') as Partial<LayoutOptions>);
  } catch {
    return layoutOptions();
  }
}

/**
 * `dot` with each box at a stand-in spot in a grid, and links drawn straight, for Graphviz only to measure. `options`
 * are written in as a comment, so a source laid out another way is another source, never one kept from before.
 */
export function ownSource(dot: string, options?: Partial<LayoutOptions>): string {
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
  lines.splice(1, 0, '  graph [splines=false];', `  // layout options ${JSON.stringify(layoutOptions(options))}`);
  return lines.join('\n');
}

/** `laid` resized to hold the boxes at `spots`, its background with it, so the drawing has no empty room round it. */
function fitted(
  laid: LaidMarks,
  spots: ReadonlyMap<string, readonly [number, number]>,
  boxes: readonly GroupBox[] = [],
): LaidMarks {
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
  for (const b of boxes) {
    width = Math.max(width, b.x + b.width / 2 + MARGIN);
    height = Math.max(height, b.y + b.height / 2 + MARGIN);
  }
  const marks = laid.marks.map((m): DrawMark => {
    if (m.id !== 'background' || m.kind !== 'box') return m;
    const { outline: _gone, ...rest } = m;
    return { ...rest, x: 0, y: 0, width, height };
  });
  return { ...laid, space: { width, height }, marks };
}

/** The marks and part of each group's box and its name, drawn under everything else, as Graphviz draws them. */
function groupMarks(laid: LaidMarks, boxes: readonly GroupBox[], groups: readonly SourceGroup[]): LaidMarks {
  if (!boxes.length) return laid;
  const styleOf = new Map(groups.map((g) => [g.id, g.style]));
  const marks: DrawMark[] = [];
  const parts = boxes.map((b, i) => {
    const id = `g:${b.id}`,
      style = styleOf.get(b.id) ?? 'text.muted';
    const [x, y] = [b.x - b.width / 2, b.y - b.height / 2];
    marks.push(
      { id, style, kind: 'group', role: 'group', x, y, width: b.width, height: b.height },
      {
        id: `l:${id}`,
        style,
        kind: 'label',
        x: b.x,
        y: y + 15,
        text: b.label,
        size: 12,
        anchor: 'middle',
        font: 'Helvetica',
      },
    );
    return { kind: 'cluster' as const, id: `clust${i + 1}`, className: 'cluster', title: b.id, marks: [id, `l:${id}`] };
  });
  const [first, ...rest] = laid.marks;
  const layout = laid.layout && {
    ...laid.layout,
    parts: [...laid.layout.parts.slice(0, 1), ...parts, ...laid.layout.parts.slice(1)],
  };
  return {
    ...laid,
    marks: first?.id === 'background' ? [first, ...marks, ...rest] : [...marks, ...laid.marks],
    ...(layout ? { layout } : {}),
  };
}

/**
 * The drawing Graphviz measured in `laid` as marks, its boxes placed by our own engine, its links direct. `groups`
 * are the layout source's groups (`groupsIn`), each drawn as a box round its things.
 */
export function ownMarks(
  laid: LaidMarks,
  rankdir: string,
  groups: readonly SourceGroup[] = [],
  options: Partial<LayoutOptions> = {},
): LaidMarks {
  const way = rankdir === 'TB' || rankdir === 'BT' ? 'TB' : 'LR';
  const { spots, via, boxes } = ownSpots(laid, way, undefined, groups, options);
  return directLinks(groupMarks(fitted(laid, spots, boxes), boxes, groups), spots, via, way);
}

/** The SVG of the drawing Graphviz measured in `laid`, its boxes placed by our own engine, its links direct. */
export function ownSvg(
  laid: LaidMarks,
  rankdir: string,
  groups: readonly SourceGroup[] = [],
  options: Partial<LayoutOptions> = {},
): string {
  return layoutSvg(ownMarks(laid, rankdir, groups, options));
}

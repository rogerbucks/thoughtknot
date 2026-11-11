// Drawing a graph by our own layout engine (editor spec §53, layout_own_engine). The layout source Graphviz is handed
// is written as ever. For our own engine every box is given a stand-in spot. Graphviz's `nop` engine only measures
// and writes it. Then own-engine.ts places the boxes and direct-links.ts draws the links. Groups are read from the
// source's clusters and drawn as boxes by our engine (grouped.ts), not by Graphviz. Host-free and pure.
import type { DrawMark } from '../drawing-marks.ts';
import { directLinks } from '../direct-links.ts';
import type { LaidMarks } from '../graphviz-marks.ts';
import { layoutSvg } from '../graphviz-svg.ts';
import { colourToken } from '../graphviz-json.ts';
import { MARGIN, marksShape, ownSpots } from './own-engine.ts';
import { PICK_ATTRIBUTE, kindsOf } from './fingerprint.ts';
import type { PickShown } from './fingerprint.ts';
import type { Group, GroupBox } from './grouped.ts';
import { layoutOptions } from './layout-options.ts';
import type { LayoutOptions } from './layout-options.ts';
import type { RowNudges } from './layered-rows.ts';
import { LAYOUT_STEPS } from './cheaper.ts';
import { SPOTS_ATTRIBUTE, boxesRound, drawnAt, keptSpots, sameSpots, spotsHeard, spotsSaid } from './kept-spots.ts';
import type { LayoutStep } from './cheaper.ts';
import type { Pick as LayoutPick } from './pick.ts';

/** A box line of the layout source: its indent and its key, before its attributes. */
const BOX_LINE = /^(\s+)("(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_]*) \[/;
/** The words that start a line of defaults, not a box. */
const DEFAULTS = new Set(['graph', 'node', 'edge']);
/** A graph line that names the Graphviz engine to lay it out with, as a radial drawing's twopi does. */
const ENGINE_LINE = /^ {2}graph \[layout=/;

/** A group of the layout source, on one line: its name, its words, the rest of its attributes and its things. */
const GROUP_LINE = /^\s*subgraph (cluster_\w+) \{label=<([^>]*)>;(.*)\}\s*$/;
/** A thing of a group line: a quoted or bare key standing alone between semicolons. */
const MEMBER = /(?:^|;)\s*("(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_]*)\s*(?=;|$)/g;

/** A group read from the layout source, with how Graphviz would have drawn it. */
export interface SourceGroup extends Group {
  style: string;
}

/** The words of a key as the source writes them, unquoted and unescaped. */
const plain = (text: string) => entities(text.replace(/^"|"$/g, '').replace(/\\(.)/g, '$1'));

/** The words of an HTML-like label (`<…>`): a backslash there is a backslash, as Graphviz reads it. */
const entities = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    // the source writes ' as &#x27; and wraps right-to-left words in &#x2068; … &#x2069; (bidi.ts)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
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
      label: entities(m[2] as string),
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

/** The line of a layout source that carries each thing's kind, by its key. */
const KINDS_LINE = /^\s*\/\/ layout kinds (\{.*\})$/m;

/** The line of a layout source that says kinds are to get no lane each. */
const NO_LANES_LINE = /^\s*\/\/ layout lanes off$/m;

/** The line of a layout source that carries each thing's spot, as a plug-in's layout gave it. */
const PLACED_LINE = /^\s*\/\/ layout spots (\{.*\})$/m;

/** The line of a layout source that carries each thing's spot as the card showed it last (things_stay_put). */
const KEPT_LINE = /^\s*\/\/ layout kept (\S+)$/m;

/** Each thing's spot as the card showed it last, as `ownSource` wrote them into `dot` (things_stay_put). */
export const keptIn = (dot: string): Map<string, [number, number]> => spotsHeard(KEPT_LINE.exec(dot)?.[1]);

/** Each thing's spot as a plug-in's layout gave it, as `ownSource` wrote them into the source `dot` (layout_plugins). */
export function placedIn(dot: string): Map<string, [number, number]> {
  try {
    const placed = JSON.parse(PLACED_LINE.exec(dot)?.[1] ?? '{}') as Record<string, unknown>;
    const pair = (v: unknown): v is [number, number] =>
      Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
    return new Map(Object.entries(placed).flatMap(([k, v]) => (pair(v) ? [[k, v] as const] : [])));
  } catch {
    return new Map();
  }
}

/** The line of a layout source that says the cheaper step it is laid out by, after a layout that was slow. */
const STEP_LINE = /^\s*\/\/ layout step (\w+)$/m;

/** How a person chose to draw the links: straight, or at right angles. */
export type Lines = 'straight' | 'right-angled';
/** The routing line the layout source carries (fold-source.ts routedSource): straight, or at right angles. */
export function linesIn(dot: string): Lines | undefined {
  const said = /graph \[splines=(line|ortho)\]/.exec(dot)?.[1];
  return said === 'line' ? 'straight' : said === 'ortho' ? 'right-angled' : undefined;
}

/** The cheaper step `ownSource` wrote into the source `dot`, after a layout that ran out of time (layout_never_text). */
export function stepIn(dot: string): LayoutStep | undefined {
  const step = STEP_LINE.exec(dot)?.[1];
  return LAYOUT_STEPS.find((s) => s === step);
}

/** Whether kinds that link in order get a lane each, as `ownSource` wrote into the source `dot` (layout_kind_lanes). */
export const lanesIn = (dot: string): boolean => !NO_LANES_LINE.test(dot);

/** Each thing's kind, by its key, as `ownSource` wrote them into the source `dot`. */
export function kindsIn(dot: string): Map<string, string> {
  try {
    const kinds = JSON.parse(KINDS_LINE.exec(dot)?.[1] ?? '{}') as Record<string, unknown>;
    return new Map(Object.entries(kinds).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v] as const] : [])));
  } catch {
    return new Map();
  }
}

/** A quoted key in a source line, its escapes read. */
const QUOTED = /"((?:[^"\\]|\\.)*)"/g;
const unquoted = (line: string): string[] =>
  [...line.matchAll(QUOTED)].map((m) => (m[1] ?? '').replace(/\\(.)/g, '$1'));

/**
 * The nudges written into the source `dot` (style-source.ts, four_nudge_words): each beside line's things, and each
 * before's link never drawn. A timeline writes the same lines for its days, which its own places already keep.
 */
export function nudgesIn(dot: string): RowNudges | undefined {
  const same = [...dot.matchAll(/^ {2}\{rank=same; (.*);\}$/gm)].map((m) => unquoted(m[1] ?? ''));
  const before = [...dot.matchAll(/^ {2}("(?:[^"\\]|\\.)*" -> "(?:[^"\\]|\\.)*") \[style=invis\];$/gm)].map(
    (m) => unquoted(m[1] ?? '') as unknown as [string, string],
  );
  return same.length || before.length ? { same, before } : undefined;
}

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
 * and each thing's `kinds` are written in as comments, so a source laid out another way is another source. So is
 * the cheaper `step` it is laid out by, and each thing's spot `placed` by a plug-in's layout.
 */
export function ownSource(
  dot: string,
  options?: Partial<LayoutOptions>,
  kinds: ReadonlyMap<string, string> = new Map(),
  lanes = true,
  step?: LayoutStep,
  placed: Readonly<Record<string, readonly [number, number]>> = {},
  kept: Readonly<Record<string, readonly [number, number]>> = {},
): string {
  let i = 0;
  // a radial drawing's line names Graphviz's twopi, which would then lay it out and route its curves, not measure it.
  // At 334 things that took 22 seconds (Roger, 3 Nov 2026). Dropped, so Graphviz only measures (layout_never_text)
  const lines = dot
    .split('\n')
    .filter((line) => !ENGINE_LINE.test(line))
    .map((line) =>
      line.includes('->') || line.includes(' -- ')
        ? line
        : line.replace(BOX_LINE, (whole, indent: string, key: string) => {
            if (DEFAULTS.has(key)) return whole;
            const k = i++;
            return `${indent}${key} [pos="${(k % 50) * 300},${Math.floor(k / 50) * 200}", `;
          }),
    );
  lines.splice(1, 0, '  graph [splines=false];', `  // layout options ${JSON.stringify(layoutOptions(options))}`);
  // each thing's kind, for the engine to read how kinds link (fingerprint.ts)
  if (kinds.size) lines.splice(3, 0, `  // layout kinds ${JSON.stringify(Object.fromEntries(kinds))}`);
  if (!lanes) lines.splice(3, 0, '  // layout lanes off');
  if (step) lines.splice(3, 0, `  // layout step ${step}`);
  if (Object.keys(placed).length) lines.splice(3, 0, `  // layout spots ${JSON.stringify(placed)}`);
  if (Object.keys(kept).length) lines.splice(3, 0, `  // layout kept ${spotsSaid(new Map(Object.entries(kept)))}`);
  return lines.join('\n');
}

/**
 * `spots` with each thing not `kept` moved, on its own, only as far as keeps it inside the drawing's top left margin.
 * A kept thing never moves, so the drawing does not shift as a whole (things_stay_put).
 */
function inside(
  spots: Map<string, [number, number]>,
  laid: LaidMarks,
  kept: ReadonlyMap<string, unknown>,
): Map<string, [number, number]> {
  for (const m of laid.marks) {
    if (m.kind !== 'box' || m.role !== 'thing' || m.of === undefined || kept.has(m.of)) continue;
    const at = spots.get(m.of);
    if (at) spots.set(m.of, [Math.max(at[0], MARGIN + m.width / 2), Math.max(at[1], MARGIN + m.height / 2)]);
  }
  return spots;
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
 * are the layout source's groups (`groupsIn`), each drawn as a box round its things. `kinds` are each thing's kind.
 * It gives back what the engine picked, too, to be said where the View menu names the layout (layout_pick_said).
 * With `lanes`, kinds that link in order each get a lane (layout_kind_lanes). A `step` is said with it, and a
 * step of rows or a grid lays it out that way (layout_never_text). `placed` is each thing's spot from a plug-in's
 * layout, where the options choose one. Where it gave too few, the pick says the layout was missed. `lines` draws
 * each link straight or at right angles, as the person chose (untangle_routing).
 */
export function ownLaid(
  laid: LaidMarks,
  rankdir: string,
  groups: readonly SourceGroup[] = [],
  options: Partial<LayoutOptions> = {},
  kinds: ReadonlyMap<string, string> = new Map(),
  lanes = true,
  step?: LayoutStep,
  placed?: ReadonlyMap<string, [number, number]>,
  kept?: ReadonlyMap<string, [number, number]>,
  lines?: Lines,
): { marks: LaidMarks; shown: PickShown; spots: ReadonlyMap<string, [number, number]> } {
  const asked = rankdir === 'TB' || rankdir === 'BT' ? 'TB' : 'LR';
  // the way the rows went: an overview's may turn (own-engine.ts)
  const cheaper = step === 'own' ? undefined : step;
  const drawn = ownSpots(laid, asked, undefined, groups, options, lanes ? kinds : undefined, cheaper, placed);
  const { rankdir: way, pick, parts, loose, bands } = drawn;
  const { shape, sizes } = marksShape(laid.marks);
  // drawn again by the same layout, each thing it showed stays where it was, its links drawn straight. Each group's
  // box is drawn round its things where they are now, as roomy as the fresh layout made it (things_stay_put)
  const seen = kindsOf(shape, kinds);
  const fresh = directLinks(
    groupMarks(fitted(laid, drawn.spots, drawn.boxes), drawn.boxes, groups),
    drawn.spots,
    lines ? undefined : drawn.via,
    way,
    false,
    undefined,
    new Set(),
    lines,
  );
  // a drawing the fresh layout draws just as the person saw it is that drawing, links and all
  const keep = kept?.size && !sameSpots(drawnAt(fresh), kept) ? kept : undefined;
  const spots = keep ? inside(keptSpots(drawn.spots, keep, shape.links), laid, keep) : drawn.spots;
  const boxes = keep ? boxesRound(drawn.boxes, groups, drawn.spots, spots, sizes) : drawn.boxes;
  const marks = keep
    ? directLinks(
        groupMarks(fitted(laid, spots, boxes), boxes, groups),
        spots,
        new Map(),
        way,
        false,
        undefined,
        new Set(keep.keys()),
        lines,
      )
    : fresh;
  return {
    spots: drawnAt(marks),
    marks,
    shown: {
      ...{ why: pick.why, kinds: seen.pattern, order: seen.order, parts, loose, lanes: bands.size > 0 },
      ...(bands.size ? { bands: Object.fromEntries(bands) } : {}),
      ...(step ? { step } : {}),
      ...chosenShown(layoutOptions(options).strategy, pick),
    },
  };
}

/** The layout the person chose, `strategy`, as the pick says it; and whether it was missed, so the shape picked. */
const chosenShown = (strategy: string, pick: LayoutPick): Pick<PickShown, 'chosen' | 'missed'> =>
  strategy === 'auto' ? {} : { chosen: strategy, ...(pick.why === 'chosen' ? {} : { missed: true }) };

/** The drawing Graphviz measured in `laid`, as `ownLaid` draws it, as marks. */
export const ownMarks = (...args: Parameters<typeof ownLaid>): LaidMarks => ownLaid(...args).marks;

/** The SVG of the drawing Graphviz measured in `laid`, as `ownLaid` draws it, carrying what the engine picked. */
export function ownSvg(...args: Parameters<typeof ownLaid>): string {
  const { marks, shown, spots } = ownLaid(...args);
  const said = encodeURIComponent(JSON.stringify(shown));
  // last in the tag: the page reads `<svg width=` from its start (theme.ts). Where each thing is goes with it, so the
  // card's next drawing can keep it there (things_stay_put)
  const at = `${SPOTS_ATTRIBUTE}="${spotsSaid(spots)}"`;
  return layoutSvg(marks).replace(/<svg\b[^>]*/, (open) => `${open} ${PICK_ATTRIBUTE}="${said}" ${at}`);
}

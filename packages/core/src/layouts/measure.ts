// Our own measuring of a layout source, with no Graphviz (editor spec §53, layout_own_engine; Roger, 9 Nov 2026: no
// WebAssembly, Graphviz replaced). It reads the DOT the core writes and sizes every box from its label as Graphviz
// does. It puts each where the source says (`pos`), as Graphviz's `nop` step did. It gives the layout as Graphviz's JSON,
// so graphviz-marks.ts turns it into marks as before. Links are drawn straight between their boxes: our own engine
// lays them out again (direct-links.ts), and only their labels' sizes count. Host-free and pure.
import type { GraphvizEdge, GraphvizLayout, GraphvizObject, GraphvizOp } from '../graphviz-json.ts';
import { layoutMarks } from '../graphviz-marks.ts';
import type { LaidMarks } from '../graphviz-marks.ts';
import { readDot } from './dot-read.ts';
import type { Attrs, DotGroup, DotNode } from './dot-read.ts';
import type { SizedLabel } from './html-label.ts';
import { labelOf, numOr } from './label-of.ts';

/** The colours Graphviz knows by name that the core writes, as the hex Graphviz gives them. */
const NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  lightgrey: '#d3d3d3',
  lightgray: '#d3d3d3',
  transparent: '#fffffe00',
  none: '#fffffe00',
};
const hex = (c: string) => NAMED[c.toLowerCase()] ?? c;

/** Points in an inch, Graphviz's unit for a box's size and margins. */
const INCH = 72;
/** The most a rounded box's corner is rounded, in points. */
const ROUNDING = 12;
/** The room a group keeps round the things in it, in points. */
const GROUP_MARGIN = 8;

const styleHas = (style: string | undefined, word: string) => (style ?? '').split(',').some((s) => s.trim() === word);

/** The outline of a rounded box from (x0, y0) to (x1, y1), as Graphviz draws it: Bézier steps round each corner. */
function rounded(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const r = Math.min(ROUNDING, (x1 - x0) / 3, (y1 - y0) / 3);
  const h = r / 2;
  return [
    [x1 - r, y1], [x1 - r, y1], [x0 + r, y1], [x0 + r, y1], [x0 + h, y1], [x0, y1 - h], [x0, y1 - r],
    [x0, y1 - r], [x0, y0 + r], [x0, y0 + r], [x0, y0 + h], [x0 + h, y0], [x0 + r, y0],
    [x0 + r, y0], [x1 - r, y0], [x1 - r, y0], [x1 - h, y0], [x1, y0 + h], [x1, y0 + r],
    [x1, y0 + r], [x1, y1 - r], [x1, y1 - r], [x1, y1 - h], [x1 - h, y1], [x1 - r, y1],
  ]; // prettier-ignore
}

/** A thing measured: where its centre is, its size, its label, its attributes. */
interface Measured {
  node: DotNode;
  x: number;
  y: number;
  w: number;
  h: number;
  label: SizedLabel;
}

/** A thing's size from its label, its margin and its least size, as Graphviz sizes a box or a point. */
function measureNode(node: DotNode): Measured {
  const a = node.attrs;
  const [px = 0, py = 0] = (a.pos ?? '0,0').replace(/!$/, '').split(',').map(Number);
  const shape = a.shape ?? 'ellipse';
  if (shape === 'point') {
    const size = numOr(a.width, numOr(a.height, 0.05)) * INCH;
    return { node, x: px, y: py, w: size, h: size, label: { width: 0, height: 0, draw: () => [] } };
  }
  const label = labelOf(a, '\\N', node.key);
  // a margin given is added on each side; with none, Graphviz pads a label by 16 points across and 8 down
  const [mx = 0, my = mx] = (a.margin ?? '').split(',').map(Number);
  let w = label.width + (a.margin === undefined ? 16 : 2 * mx * INCH),
    h = label.height + (a.margin === undefined ? 8 : 2 * my * INCH);
  // an ellipse holds its label's box inside it, so it is the box's size times the square root of two
  if (shape === 'ellipse' || shape === 'oval' || shape === 'circle') [w, h] = [w * Math.SQRT2, h * Math.SQRT2];
  const fixed = a.fixedsize === 'true';
  w = fixed ? numOr(a.width, 0.75) * INCH : Math.max(w, numOr(a.width, 0.75) * INCH);
  h = fixed ? numOr(a.height, 0.5) * INCH : Math.max(h, numOr(a.height, 0.5) * INCH);
  return { node, x: px, y: py, w, h, label };
}

/** The steps that draw a thing's shape: a rounded box, a box or a point, in its colours and line. */
function shapeOps(m: Measured): GraphvizOp[] {
  const a = m.node.attrs;
  const style = a.style;
  const ops: GraphvizOp[] = [];
  const pen = a.color ?? 'black';
  const penwidth = numOr(a.penwidth, 1);
  if (penwidth !== 1) ops.push({ op: 'S', style: `setlinewidth(${a.penwidth})` });
  if (styleHas(style, 'dashed')) ops.push({ op: 'S', style: 'dashed' });
  ops.push({ op: 'c', color: pen });
  const [x0, y0, x1, y1] = [m.x - m.w / 2, m.y - m.h / 2, m.x + m.w / 2, m.y + m.h / 2];
  const shape = a.shape ?? 'ellipse';
  if (shape === 'point') {
    ops.push({ op: 'C', color: a.fillcolor ?? pen }, { op: 'E', rect: [m.x, m.y, m.w / 2, m.h / 2] });
    return ops;
  }
  const filled = styleHas(style, 'filled');
  if (shape === 'ellipse' || shape === 'oval' || shape === 'circle') {
    if (filled) ops.push({ op: 'C', color: a.fillcolor ?? a.color ?? 'lightgrey' });
    ops.push({ op: filled ? 'E' : 'e', rect: [m.x, m.y, m.w / 2, m.h / 2] });
    return ops;
  }
  if (filled) ops.push({ op: 'C', color: a.fillcolor ?? a.color ?? 'lightgrey' });
  if (styleHas(style, 'rounded')) ops.push({ op: filled ? 'B' : 'b', points: rounded(x0, y0, x1, y1) });
  else {
    const corners: [number, number][] = [
      [x1, y1],
      [x0, y1],
      [x0, y0],
      [x1, y0],
    ];
    ops.push({ op: filled ? 'P' : 'p', points: corners });
  }
  return ops;
}

/** Where the straight line from `from`'s centre towards `to`'s leaves `from`'s box. */
function edgeOf(from: Measured, to: Measured): [number, number] {
  const dx = to.x - from.x,
    dy = to.y - from.y;
  if (dx === 0 && dy === 0) return [from.x, from.y];
  const t = Math.min(dx ? from.w / 2 / Math.abs(dx) : Infinity, dy ? from.h / 2 / Math.abs(dy) : Infinity, 1);
  return [from.x + dx * t, from.y + dy * t];
}

/** A link drawn straight from box to box, its arrowhead at the head, its label at its middle. */
function edgeOps(e: { attrs: Attrs }, tail: Measured, head: Measured, directed: boolean) {
  const a = e.attrs;
  const pen = a.color ?? 'black';
  const dir = a.dir ?? (directed ? 'forward' : 'none');
  const size = numOr(a.arrowsize, 1) * 10;
  const [sx, sy] = edgeOf(tail, head);
  let [ex, ey] = edgeOf(head, tail);
  const len = Math.hypot(ex - sx, ey - sy) || 1;
  const [ux, uy] = [(ex - sx) / len, (ey - sy) / len];
  const draw: GraphvizOp[] = [];
  if (numOr(a.penwidth, 1) !== 1) draw.push({ op: 'S', style: `setlinewidth(${a.penwidth})` });
  if (styleHas(a.style, 'dashed')) draw.push({ op: 'S', style: 'dashed' });
  const out: Partial<GraphvizEdge> = {};
  const arrow = (x: number, y: number, vx: number, vy: number): GraphvizOp[] => [
    { op: 'S', style: 'solid' },
    { op: 'c', color: pen },
    { op: 'C', color: pen },
    {
      op: 'P',
      points: [
        [x - vx * size + vy * size * 0.35, y - vy * size - vx * size * 0.35],
        [x, y],
        [x - vx * size - vy * size * 0.35, y - vy * size + vx * size * 0.35],
      ],
    },
  ];
  if ((dir === 'forward' || dir === 'both') && a.arrowhead !== 'none') {
    out._hdraw_ = arrow(ex, ey, ux, uy);
    [ex, ey] = [ex - ux * size, ey - uy * size];
  }
  let [bx, by] = [sx, sy];
  if ((dir === 'back' || dir === 'both') && a.arrowtail !== 'none') {
    out._tdraw_ = arrow(sx, sy, -ux, -uy);
    [bx, by] = [sx + ux * size, sy + uy * size];
  }
  const third = (k: number): [number, number] => [bx + ((ex - bx) * k) / 3, by + ((ey - by) * k) / 3];
  draw.push({ op: 'c', color: pen }, { op: 'b', points: [third(0), third(1), third(2), third(3)] });
  out._draw_ = draw;
  const text = a.label ?? a.xlabel;
  const label = text === undefined ? undefined : labelOf({ ...a, label: text }, '', '');
  const mid: [number, number] = [(sx + ex) / 2, (sy + ey) / 2];
  if (label && label.width > 0) out._ldraw_ = label.draw(mid[0], mid[1] + label.height / 2, pen);
  return { out, label, mid };
}

/** Graphviz gives every place and width to two decimal places; ours are given so too, so the drawings agree. */
const fix = (n: number) => Number(n.toFixed(2));

/** Drawing steps moved by `-lx, -ly`, their colours named as Graphviz names them, rounded as it rounds. */
const shifter =
  (lx: number, ly: number) =>
  (ops: GraphvizOp[] | undefined): GraphvizOp[] | undefined =>
    ops?.map((o) => ({
      ...o,
      ...(o.color ? { color: hex(o.color) } : {}),
      ...(o.width !== undefined ? { width: fix(o.width) } : {}),
      ...(o.points ? { points: o.points.map(([x, y]) => [fix(x - lx), fix(y - ly)] as [number, number]) } : {}),
      ...(o.pt ? { pt: [fix(o.pt[0] - lx), fix(o.pt[1] - ly)] as [number, number] } : {}),
      ...(o.rect
        ? {
            rect: [fix(o.rect[0] - lx), fix(o.rect[1] - ly), fix(o.rect[2]), fix(o.rect[3])] as [
              number,
              number,
              number,
              number,
            ],
          }
        : {}),
    }));

/** Every group, outer before inner, each with the places of the groups inside it. */
function flatten(groups: DotGroup[]): { group: DotGroup; inner: number[] }[] {
  const flat: { group: DotGroup; inner: number[] }[] = [];
  const visit = (group: DotGroup): number => {
    const at = flat.length;
    flat.push({ group, inner: [] });
    (flat[at] as { inner: number[] }).inner = group.groups.map(visit);
    return at;
  };
  groups.forEach(visit);
  return flat;
}

/** As with `nop`, a group is drawn only where its own `bb` places it, and its things do not size it. */
function groupBox(group: DotGroup): [number, number, number, number] | undefined {
  const b = (group.attrs.bb ?? '').split(',').map(Number);
  return b.length === 4 && b.every(Number.isFinite) ? (b as [number, number, number, number]) : undefined;
}

/** A group as Graphviz writes it, moved by `-lx, -ly`. */
function groupObject(
  group: DotGroup,
  inner: number[],
  lx: number,
  ly: number,
  shift: ReturnType<typeof shifter>,
): GraphvizObject {
  const box = groupBox(group);
  if (!box) return { name: group.name, bb: '', subgraphs: inner };
  const [x0, y0, x1, y1] = box;
  const a = group.attrs;
  const pen = a.color ?? a.pencolor ?? 'black';
  const filled = styleHas(a.style, 'filled');
  const draw: GraphvizOp[] = [];
  if (styleHas(a.style, 'dashed')) draw.push({ op: 'S', style: 'dashed' });
  draw.push({ op: 'c', color: pen });
  if (filled) draw.push({ op: 'C', color: a.fillcolor ?? a.color ?? 'lightgrey' });
  if (styleHas(a.style, 'rounded')) draw.push({ op: filled ? 'B' : 'b', points: rounded(x0, y0, x1, y1) });
  else
    draw.push({
      op: filled ? 'P' : 'p',
      points: [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ],
    });
  const label = labelOf(a, '', group.name);
  return {
    name: group.name,
    bb: [x0 - lx, y0 - ly, x1 - lx, y1 - ly].map(fix).join(','),
    subgraphs: inner,
    _draw_: shift(draw),
    ...(label.width > 0
      ? { _ldraw_: shift(label.draw((x0 + x1) / 2, y1 - GROUP_MARGIN / 2 - label.height / 2, 'black')) }
      : {}),
    ...(a.id ? { id: a.id } : {}),
    ...(a.class ? { class: a.class } : {}),
  };
}

/** Graphviz's layout of `dot`, every box where its `pos` puts it, measured but not laid out: as `nop` gives it. */
export function measuredLayout(dot: string): GraphvizLayout {
  const g = readDot(dot);
  const measured = g.nodes.map(measureNode);
  const byKey = new Map(measured.map((m) => [m.node.key, m]));
  const edges = g.edges.map((e) => ({
    e,
    ...edgeOps(e, byKey.get(e.tail) as Measured, byKey.get(e.head) as Measured, g.directed),
  }));
  const flat = flatten(g.groups);
  // the drawing's corner: everything drawn, moved so its bounding box starts at nought
  let [lx, ly, ux, uy] = [Infinity, Infinity, -Infinity, -Infinity];
  const reach = (x0: number, y0: number, x1: number, y1: number) => {
    [lx, ly, ux, uy] = [Math.min(lx, x0), Math.min(ly, y0), Math.max(ux, x1), Math.max(uy, y1)];
  };
  for (const m of measured)
    if (!styleHas(m.node.attrs.style, 'invis')) reach(m.x - m.w / 2, m.y - m.h / 2, m.x + m.w / 2, m.y + m.h / 2);
  for (const f of flat) {
    const box = groupBox(f.group);
    if (box) reach(...box);
  }
  for (const { label, mid } of edges)
    if (label && label.width > 0)
      reach(mid[0] - label.width / 2, mid[1] - label.height / 2, mid[0] + label.width / 2, mid[1] + label.height / 2);
  if (!Number.isFinite(lx)) [lx, ly, ux, uy] = [0, 0, 0, 0];
  const shift = shifter(lx, ly);
  const pad = numOr(g.attrs.pad, 0.0555) * INCH;
  const [w, h] = [ux - lx, uy - ly];
  const objects: GraphvizObject[] = flat.map(({ group, inner }) => groupObject(group, inner, lx, ly, shift));
  for (const m of measured) {
    const a = m.node.attrs;
    const invisible = styleHas(a.style, 'invis');
    objects.push({
      name: m.node.key,
      pos: `${fix(m.x - lx)},${fix(m.y - ly)}`,
      width: String(m.w / INCH),
      height: String(m.h / INCH),
      shape: a.shape ?? 'ellipse',
      ...(a.style ? { style: a.style } : {}),
      ...(a.id ? { id: a.id } : {}),
      ...(a.class ? { class: a.class } : {}),
      ...(invisible ? {} : { _draw_: shift(shapeOps(m)), _ldraw_: shift(m.label.draw(m.x, m.y, a.color ?? 'black')) }),
    });
  }
  const index = new Map(g.nodes.map((n, i) => [n.key, flat.length + i]));
  return {
    name: g.name,
    directed: g.directed,
    bb: `0,0,${fix(w)},${fix(h)}`,
    pad: String(pad / INCH),
    ...(g.attrs.bgcolor ? { bgcolor: g.attrs.bgcolor } : {}),
    _subgraph_cnt: flat.length,
    _draw_: [
      { op: 'c', color: '#fffffe00' },
      { op: 'C', color: '#ffffff' },
      {
        op: 'P',
        points: [
          [-pad, -pad],
          [-pad, h + pad],
          [w + pad, h + pad],
          [w + pad, -pad],
        ],
      },
    ],
    objects,
    edges: edges.map(({ e, out }, n) => ({
      tail: index.get(e.tail) as number,
      head: index.get(e.head) as number,
      _gvid: n,
      ...(e.attrs.id ? { id: e.attrs.id } : {}),
      ...(e.attrs.class ? { class: e.attrs.class } : {}),
      ...(e.attrs.style ? { style: e.attrs.style } : {}),
      _draw_: shift(out._draw_),
      ...(out._hdraw_ ? { _hdraw_: shift(out._hdraw_) } : {}),
      ...(out._tdraw_ ? { _tdraw_: shift(out._tdraw_) } : {}),
      ...(out._ldraw_ ? { _ldraw_: shift(out._ldraw_) } : {}),
    })),
  };
}

/** The marks of `dot`, every box where its `pos` puts it, measured by our own code: no Graphviz. */
export const measuredMarks = (dot: string): LaidMarks => layoutMarks(measuredLayout(dot));

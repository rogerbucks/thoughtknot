// Drawings on a graph drawn in every view (editor spec §70, sketch_pinned, sketch_pin_hidden and sketch_every_view).
// Each drawing becomes the shared drawing marks (drawing-marks.ts), placed against the marks of the graph's drawing:
// - A drawing pinned to a thing or group is placed from that one's centre, so it moves when the layout moves.
// - A box or ellipse pinned with no size of its own wraps what it is pinned to, so a circled group stays circled.
// - A drawing pinned to a thing the view does not show is left out of that view, never drawn at a wrong place.
// So 2D, the canvas painters and the exports draw them with the painters they already have. In 2.5D and 3D the same
// marks are lifted onto the top of the block they are pinned to, or onto the ground (`sketchInSpace`).
//
// Each mark is a picture to a screen reader, with what it is, its text and what it is pinned to. Host-free and pure.
import { isolated } from './bidi.ts';
import type { DrawMark } from './drawing-marks.ts';
import { STYLE } from './layout.ts';
import type { Palette } from './palette.ts';
import type { MarkPoint } from './plugin-diagrams.ts';
import type { Sketch, SketchItem } from './sketch.ts';
import type { SpaceArrow, SpaceLabel, SpaceLine, SpaceMarks, Vec3 } from './space-view.ts';
import { STYLE_HUES } from './style-graph.ts';
import { word } from './words.ts';

/** One mark of a drawing, and the key of the block it sits on in space, when it is pinned. */
export interface SketchMark {
  mark: DrawMark;
  pin?: string;
}

/** How far a shape that wraps what it is pinned to stands off it, in pixels. */
export const WRAP = 12;
/** How high over the rest a drawing is drawn: above every mark of the graph's own. */
export const SKETCH_Z = 1000;
/** How large an arrow's head is, in pixels. */
const HEAD = 10;
/** How far above the block it sits on a drawing floats in space, so it is never hidden in its top. */
const LIFT = 2;
/** How many straight pieces an ellipse is drawn with in space. */
const ROUND_STEPS = 32;

type Place = { x: number; y: number; width: number; height: number; name?: string };

/** The mark a pin names: the thing whose key it is, else the group of its name. */
function pinnedTo(marks: readonly DrawMark[], pin: string): (Place & { key: string }) | null {
  let group: (Place & { key: string }) | null = null;
  for (const m of marks) {
    if (m.kind !== 'box' && m.kind !== 'item' && m.kind !== 'group' && m.kind !== 'fold') continue;
    if (m.kind !== 'group' && m.of === pin) return { ...m, key: m.id };
    if (m.kind === 'group' && !group && (m.id === `g:${pin}` || m.id === pin)) group = { ...m, key: m.id };
  }
  return group;
}

/** The style token a drawing is drawn in: `sketch`, or `sketch.` and its hue. */
const styleOf = (item: SketchItem) =>
  item.style && STYLE_HUES.includes(item.style) ? `sketch.${item.style}` : 'sketch';

/** What a drawing is, in words. */
function kindSaid(item: SketchItem): string {
  if (item.kind === 'Ink') return word('sketch.kind.ink');
  if (item.kind === 'Text') return word('sketch.kind.note');
  if (item.shape === 'ellipse') return word('sketch.kind.ellipse');
  if (item.shape === 'line') return word('sketch.kind.line');
  if (item.shape === 'arrow') return word('sketch.kind.arrow');
  return word('sketch.kind.box');
}

/** What is said of a drawing: its kind, its text and what it is pinned to, by name where that has one. */
export function sketchSaid(item: SketchItem, pinName?: string): string {
  const said = item.text ? word('sketch.said', { kind: kindSaid(item), text: item.text }) : kindSaid(item);
  return item.pin ? word('sketch.pinned', { said, pin: pinName ?? item.pin }) : said;
}

/**
 * The marks of the drawings over a graph, placed against `marks`, the marks of its drawing in this view. Drawings pinned
 * to a thing the view leaves out are not drawn; `hidden` names them.
 */
export function sketchMarks(sketch: Sketch, marks: readonly DrawMark[]): { pieces: SketchMark[]; hidden: string[] } {
  const pieces: SketchMark[] = [],
    hidden: string[] = [];
  for (const item of sketch.items) {
    const on = item.pin === undefined ? null : pinnedTo(marks, item.pin);
    if (item.pin !== undefined && !on) {
      hidden.push(item.id);
      continue;
    }
    const [ox, oy] = on ? [on.x + on.width / 2, on.y + on.height / 2] : [0, 0];
    const common = {
      id: `sketch:${item.id}`,
      style: styleOf(item),
      z: SKETCH_Z,
      role: 'picture' as const,
      name: sketchSaid(item, on?.name),
    };
    const pin = on ? { pin: on.key } : {};
    const at = (p: MarkPoint): MarkPoint => [ox + item.x + p[0], oy + item.y + p[1]];
    if (item.kind === 'Text') {
      const mark: DrawMark = {
        ...common,
        kind: 'label',
        x: ox + item.x,
        y: oy + item.y,
        text: item.text ?? '',
        size: STYLE.font_size,
        anchor: 'start',
      };
      if (item.w !== undefined) mark.maxWidth = item.w;
      pieces.push({ mark, ...pin });
    } else if (item.points) {
      const points = item.points.map(at);
      pieces.push({ mark: { ...common, kind: 'link', points, headless: true }, ...pin });
      const tip = points[points.length - 1],
        back = points[points.length - 2];
      if (item.shape === 'arrow' && tip && back) {
        const angle = Math.atan2(tip[1] - back[1], tip[0] - back[0]);
        const head: DrawMark = {
          ...common,
          id: `${common.id}:head`,
          kind: 'arrowhead',
          x: tip[0],
          y: tip[1],
          angle,
          size: HEAD,
        };
        pieces.push({ mark: head, ...pin });
      }
    } else {
      // a box or ellipse: its own size from its place, or wrapping what it is pinned to
      const wraps = on && item.w === undefined && item.h === undefined;
      const box = wraps
        ? { x: on.x - WRAP + item.x, y: on.y - WRAP + item.y, width: on.width + 2 * WRAP, height: on.height + 2 * WRAP }
        : { x: ox + item.x, y: oy + item.y, width: item.w ?? 0, height: item.h ?? 0 };
      const shape = item.shape === 'ellipse' ? 'ellipse' : 'round';
      pieces.push({ mark: { ...common, kind: 'box', ...box, shape }, ...pin });
    }
  }
  return { pieces, hidden };
}

/** The page's down is the space's back, as space-view.ts lifts every mark. */
const along = (y: number) => -y;

/** A box's or ellipse's outline as points round it, closed. */
function outlineOf(m: DrawMark & { kind: 'box' }): MarkPoint[] {
  const { x, y, width: w, height: h } = m;
  if (m.shape !== 'ellipse')
    return [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
      [x, y],
    ];
  // the last point is the first, exactly, so the ring is closed
  return Array.from({ length: ROUND_STEPS + 1 }, (_, i) => {
    const t = ((i % ROUND_STEPS) / ROUND_STEPS) * 2 * Math.PI;
    return [x + w / 2 + (Math.cos(t) * w) / 2, y + h / 2 + (Math.sin(t) * h) / 2] as MarkPoint;
  });
}

/**
 * The drawings lifted into a space (space-view.ts `spaceOf`). Each lies flat on the top of the block it is pinned to,
 * or on the ground when it has no pin. They join the space's own lines, words and arrowheads, so every painter in space
 * paints them as it paints a link.
 */
export function sketchInSpace(
  pieces: readonly SketchMark[],
  space: Pick<SpaceMarks, 'blocks'>,
): { lines: SpaceLine[]; labels: SpaceLabel[]; arrows: SpaceArrow[] } {
  const tops = new Map<string, number>();
  for (const b of space.blocks) tops.set(b.id, b.floor + b.tall);
  const lines: SpaceLine[] = [],
    labels: SpaceLabel[] = [],
    arrows: SpaceArrow[] = [];
  for (const { mark: m, pin } of pieces) {
    const up = (pin === undefined ? 0 : (tops.get(pin) ?? 0)) + LIFT;
    const lift = (p: MarkPoint): Vec3 => [p[0], along(p[1]), up];
    if (m.kind === 'link' || m.kind === 'box') {
      const line: SpaceLine = {
        id: m.id,
        style: m.style,
        points: (m.kind === 'link' ? m.points : outlineOf(m)).map(lift),
      };
      if (m.name) line.words = m.name;
      lines.push(line);
    } else if (m.kind === 'label')
      labels.push({ id: m.id, style: m.style, at: [m.x, along(m.y), up + m.size / 2], text: m.text, size: m.size });
    else if (m.kind === 'arrowhead') {
      const back: MarkPoint = [m.x - Math.cos(m.angle) * m.size, m.y - Math.sin(m.angle) * m.size];
      arrows.push({ id: m.id, style: m.style, tip: lift([m.x, m.y]), back: lift(back), size: m.size });
    }
  }
  return { lines, labels, arrows };
}

/** Text made safe to write inside an SVG element or attribute. */
const escaped = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
/** A number as SVG writes it, to two places. */
const num = (x: number) => String(Math.round(x * 100) / 100);

/**
 * The drawings as one SVG group in `palette`'s colours, to lay over the graph's drawing in its own pixels. Each drawing
 * carries `data-sketch` with its id, so a host can tell what was tapped, and is said by its title.
 */
export function sketchSvg(pieces: readonly SketchMark[], palette: Palette): string {
  const colour = (style: string) => {
    const hue = style.startsWith('sketch.') ? style.slice('sketch.'.length) : '';
    return hue ? palette.blend(hue, STYLE.line_mix) : palette.text;
  };
  const parts = new Map<string, string[]>();
  const said = new Map<string, string>();
  for (const { mark: m } of pieces) {
    const id = m.id.replace(/^sketch:/, '').replace(/:head$/, '');
    const ink = colour(m.style);
    let svg = '';
    if (m.kind === 'link')
      svg = `<polyline points="${m.points.map((p) => `${num(p[0])},${num(p[1])}`).join(' ')}" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    else if (m.kind === 'box')
      svg =
        m.shape === 'ellipse'
          ? `<ellipse cx="${num(m.x + m.width / 2)}" cy="${num(m.y + m.height / 2)}" rx="${num(m.width / 2)}" ry="${num(m.height / 2)}" fill="none" stroke="${ink}" stroke-width="2"/>`
          : `<rect x="${num(m.x)}" y="${num(m.y)}" width="${num(m.width)}" height="${num(m.height)}" rx="6" fill="none" stroke="${ink}" stroke-width="2"/>`;
    else if (m.kind === 'arrowhead') {
      const [c, s] = [Math.cos(m.angle), Math.sin(m.angle)];
      const back = [m.x - c * m.size, m.y - s * m.size];
      const side = [-s * (m.size / 2), c * (m.size / 2)];
      svg = `<path d="M${num(m.x)} ${num(m.y)}L${num((back[0] ?? 0) + (side[0] ?? 0))} ${num((back[1] ?? 0) + (side[1] ?? 0))}L${num((back[0] ?? 0) - (side[0] ?? 0))} ${num((back[1] ?? 0) - (side[1] ?? 0))}z" fill="${ink}"/>`;
    } else if (m.kind === 'label')
      svg = `<text x="${num(m.x)}" y="${num(m.y)}" font-family="${STYLE.font}" font-size="${num(m.size)}" fill="${ink}" aria-hidden="true">${isolated(escaped(m.text))}</text>`;
    if (!svg) continue;
    if (!parts.has(id)) parts.set(id, []);
    parts.get(id)?.push(svg);
    if (m.name && !said.has(id)) said.set(id, m.name);
  }
  const groups = [...parts].map(
    ([id, svgs]) =>
      `<g data-sketch="${escaped(id)}" role="img"><title>${escaped(said.get(id) ?? '')}</title>${svgs.join('')}</g>`,
  );
  return `<g class="tk-sketch" role="group" aria-label="${escaped(word('sketch.layer'))}">${groups.join('')}</g>`;
}

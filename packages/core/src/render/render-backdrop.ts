// What a type such as Treemap, Containment, Block or Grid draws round its things, on the new stage (editor spec §73,
// render_every_type). Its tiles, its groups' boxes and names, and its own links are kept from the view's drawing. The
// stage draws them under its dots and names, at its zoom, in its colours. So the shape a reader knows stays, in one
// look with every other type. A thing's own name is left to the stage, which keeps names apart. Host-free and pure.
import type { DrawMark } from '../drawing-marks.ts';
import type { Look } from './render-look.ts';
import { mix } from './render-look.ts';
import type { View } from './render-marks.ts';
import { onScreen } from './render-tilt.ts';

/** A tile or a box, on the screen. */
interface Tile {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  edge: string;
  /** On the globe its outline, bent round the ball, where a plain box would not follow it. */
  poly?: [number, number][];
}
/** A line, on the screen, through its points. */
interface Line {
  points: [number, number][];
  colour: string;
  /** Its points are a start and then sets of three, a curve through them. */
  curve?: boolean;
}
/** A name or a word, on the screen. */
interface Word {
  x: number;
  y: number;
  text: string;
  px: number;
  anchor: 'start' | 'middle' | 'end';
}

/** Everything a type draws round its things, as one mark painted under them. */
export interface BackdropMark {
  kind: 'backdrop';
  tiles: Tile[];
  lines: Line[];
  words: Word[];
  ink: string;
}

/** How much of a thing's colour shows in its tile. */
const TINT = 0.18;
/** The smallest word drawn, and the largest, in screen pixels. */
const WORD_LEAST = 9;
const WORD_MOST = 15;

/** How many points along each side of a box make its outline on the globe, so its edges curve round the ball. */
const SIDE = 6;

/** `f` at the points round the outline of box `m`, a few along each side, so on the globe the edges bend. */
function outlineOf<T>(m: { x: number; y: number; width: number; height: number }, f: (x: number, y: number) => T): T[] {
  const pts: T[] = [];
  for (let i = 0; i < SIDE; i++) {
    const t = i / SIDE;
    pts.push(f(m.x + m.width * t, m.y));
  }
  for (let i = 0; i < SIDE; i++) pts.push(f(m.x + m.width, m.y + m.height * (i / SIDE)));
  for (let i = 0; i < SIDE; i++) pts.push(f(m.x + m.width * (1 - i / SIDE), m.y + m.height));
  for (let i = 0; i < SIDE; i++) pts.push(f(m.x, m.y + m.height * (1 - i / SIDE)));
  return pts;
}

/**
 * The backdrop of a view's own marks, as `view` shows it. A tile takes the colour of the thing it draws. A label
 * that only says a thing's name is left out, as the stage names things itself.
 */
export function backdropOf(
  backdrop: { marks: readonly DrawMark[]; names: ReadonlySet<string> } | undefined,
  view: View,
  colours: ReadonlyMap<string, string>,
  look: Look,
): BackdropMark[] {
  if (!backdrop?.marks.length) return [];
  const { marks: drawn, names } = backdrop;
  const at = (x: number, y: number): [number, number] => {
    const s = onScreen({ x, y, r: 0 }, view);
    return [s.x, s.y];
  };
  const out_ = (x: number, y: number): boolean => !!view.globe && !!onScreen({ x, y, r: 0 }, view).behind;
  const out: BackdropMark = { kind: 'backdrop', tiles: [], lines: [], words: [], ink: look.ink };
  for (const m of drawn) {
    const own = (m.of && colours.get(m.of)) || look.faint;
    if (m.kind === 'box' || m.kind === 'group') {
      const [x, y] = at(m.x, m.y),
        [x2, y2] = at(m.x + m.width, m.y + m.height);
      const round = view.globe ? outlineOf(m, at) : undefined;
      // on the globe a tile round the back is out of sight (Roger, 8 Nov 2026: it wraps to the other side)
      if (round && outlineOf(m, out_).every(Boolean)) continue;
      const shade = /^density\.(\d)/.exec(m.style)?.[1];
      const fill =
        m.kind === 'group'
          ? look.paper
          : shade !== undefined
            ? mix(look.paper, look.ink, 0.08 * Number(shade))
            : mix(own, look.paper, 1 - TINT);
      out.tiles.push({
        x,
        y,
        w: x2 - x,
        h: y2 - y,
        fill,
        edge: m.kind === 'group' ? look.faint : own,
        ...(round ? { poly: round } : {}),
      });
    } else if (m.kind === 'link') {
      const from = (m.from && colours.get(m.from)) || look.faint;
      if (m.points.every(([x, y]) => out_(x, y))) continue;
      out.lines.push({ points: m.points.map(([x, y]) => at(x, y)), colour: from, ...(m.curve ? { curve: true } : {}) });
    } else if (m.kind === 'label' && !names.has(m.text) && !(m.of && names.has(m.of))) {
      const px = m.size * view.scale;
      const [x, y] = at(m.x, m.y);
      if (out_(m.x, m.y)) continue;
      if (px >= WORD_LEAST) out.words.push({ x, y, text: m.text, px: Math.min(px, WORD_MOST), anchor: m.anchor });
    }
  }
  return [out];
}

/** The drawing surface a backdrop is painted on: the few calls it needs. */
interface Pen {
  globalAlpha: number;
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  font: string;
  textAlign: string;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(a: number, b: number, c: number, d: number, x: number, y: number): void;
  fill(): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;
}

/** Paints `m`: tiles, edged in a thin clear line at every zoom, then lines, then words. */
export function paintBackdrop(c: Pen, m: BackdropMark): void {
  c.lineWidth = 1;
  for (const t of m.tiles) {
    c.globalAlpha = 1;
    c.fillStyle = t.fill;
    c.beginPath();
    if (t.poly?.length) {
      t.poly.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.lineTo(t.poly[0]![0], t.poly[0]![1]);
    } else {
      c.moveTo(t.x, t.y);
      c.lineTo(t.x + t.w, t.y);
      c.lineTo(t.x + t.w, t.y + t.h);
      c.lineTo(t.x, t.y + t.h);
      c.lineTo(t.x, t.y);
    }
    c.fill();
    c.globalAlpha = 0.7;
    c.strokeStyle = t.edge;
    c.stroke();
  }
  c.globalAlpha = 0.55;
  c.lineWidth = 1.5;
  for (const l of m.lines) {
    c.strokeStyle = l.colour;
    c.beginPath();
    const [first, ...rest] = l.points;
    if (first) c.moveTo(first[0], first[1]);
    for (let i = 0; i < rest.length; i += l.curve ? 3 : 1) {
      const [p, q, r] = [rest[i], rest[i + 1], rest[i + 2]];
      if (l.curve && p && q && r) c.bezierCurveTo(p[0], p[1], q[0], q[1], r[0], r[1]);
      else if (p) c.lineTo(p[0], p[1]);
    }
    c.stroke();
  }
  c.globalAlpha = 0.8;
  c.fillStyle = m.ink;
  for (const w of m.words) {
    c.font = `600 ${w.px}px system-ui, sans-serif`;
    c.textAlign = w.anchor === 'middle' ? 'center' : w.anchor === 'end' ? 'right' : 'left';
    c.fillText(w.text, w.x, w.y);
  }
  c.globalAlpha = 1;
}

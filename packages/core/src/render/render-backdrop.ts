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
}
/** A line, on the screen, through its points. */
interface Line {
  points: [number, number][];
  colour: string;
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
  const out: BackdropMark = { kind: 'backdrop', tiles: [], lines: [], words: [], ink: look.ink };
  for (const m of drawn) {
    const own = (m.of && colours.get(m.of)) || look.faint;
    if (m.kind === 'box' || m.kind === 'group') {
      const [x, y] = at(m.x, m.y),
        [x2, y2] = at(m.x + m.width, m.y + m.height);
      const shade = /^density\.(\d)/.exec(m.style)?.[1];
      const fill =
        m.kind === 'group'
          ? look.paper
          : shade !== undefined
            ? mix(look.paper, look.ink, 0.08 * Number(shade))
            : mix(own, look.paper, 1 - TINT);
      out.tiles.push({ x, y, w: x2 - x, h: y2 - y, fill, edge: m.kind === 'group' ? look.faint : own });
    } else if (m.kind === 'link') {
      const from = (m.from && colours.get(m.from)) || look.faint;
      out.lines.push({ points: m.points.map(([x, y]) => at(x, y)), colour: from });
    } else if (m.kind === 'label' && !names.has(m.text)) {
      const px = m.size * view.scale;
      const [x, y] = at(m.x, m.y);
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
    c.moveTo(t.x, t.y);
    c.lineTo(t.x + t.w, t.y);
    c.lineTo(t.x + t.w, t.y + t.h);
    c.lineTo(t.x, t.y + t.h);
    c.lineTo(t.x, t.y);
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
    l.points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
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

// The canvas painter: one of the painters of layer L5 (wiki/Rendering-spec.md; editor spec §73, render_painters_agree).
// It draws the marks exactly as given and decides nothing: no colour, size or place of its own. So it shows the same
// picture as every other painter.
//
// Clouds are soft: a solid middle that fades at a clear edge, never a blur (Roger, 5 Nov). Roads are ribbons with a
// count chip. Labels are cards with their name, and a second line where they have one. It takes only the few calls of a 2D canvas it needs, so a test can
// hand it a fake one.
import type { CloudMark, DotMark, GroundMark, LabelMark, Mark, RoadMark } from './render-marks.ts';

/** A colour stop of a gradient. */
export interface Gradient {
  addColorStop(offset: number, colour: string): void;
}

/** The parts of a 2D canvas the painter calls. A browser's CanvasRenderingContext2D has them all. */
export interface Canvas2d {
  globalAlpha: number;
  fillStyle: string | Gradient;
  strokeStyle: string;
  lineWidth: number;
  lineCap: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  arc(x: number, y: number, r: number, from: number, to: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  roundRect(x: number, y: number, w: number, h: number, r: number): void;
  fill(): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): Gradient;
}

/** `hex` at `alpha`, as an rgba colour. */
function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** The ground seen from an angle: thin faint lines. */
function paintGround(c: Canvas2d, m: GroundMark): void {
  c.globalAlpha = m.alpha;
  c.strokeStyle = m.fill;
  c.lineWidth = 1;
  c.beginPath();
  for (const [x0, y0, x1, y1] of m.lines) {
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
  }
  c.stroke();
}

/** A soft cloud: solid to two thirds out, then fading to nothing at its edge. In 3D its footprint lies faint below. */
function paintCloud(c: Canvas2d, m: CloudMark): void {
  if (m.shadow) paintCloud(c, { ...m, ...m.shadow, alpha: m.alpha * 0.35, shadow: undefined });
  const g = c.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
  g.addColorStop(0, withAlpha(m.fill, m.alpha));
  g.addColorStop(0.68, withAlpha(m.fill, m.alpha));
  g.addColorStop(1, withAlpha(m.fill, 0));
  c.globalAlpha = 1;
  c.fillStyle = g;
  c.beginPath();
  c.arc(m.x, m.y, m.r, 0, Math.PI * 2);
  c.fill();
}

/** A ribbon road, with a chip that counts its links each way. In 3D it arches. */
function paintRoad(c: Canvas2d, m: RoadMark): void {
  c.globalAlpha = m.alpha * 0.85;
  c.strokeStyle = m.fill;
  c.lineWidth = m.width;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(m.from[0], m.from[1]);
  if (m.via) c.quadraticCurveTo(m.via[0], m.via[1], m.to[0], m.to[1]);
  else c.lineTo(m.to[0], m.to[1]);
  c.stroke();
  const text = m.count;
  if (!text) return;
  // the count sits half way along: on an arch, at its top
  const [mx, my] = [(m.from[0] + m.to[0]) / 2, (m.from[1] + m.to[1]) / 2];
  const [x, y] = m.via ? [(mx + m.via[0]) / 2, (my + m.via[1]) / 2] : [mx, my];
  c.globalAlpha = m.alpha;
  c.font = '600 11px system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = m.chip;
  c.strokeStyle = m.fill;
  c.lineWidth = 1.2;
  c.beginPath();
  c.roundRect(x - text.length * 3.4 - 6, y - 9, text.length * 6.8 + 12, 18, 9);
  c.fill();
  c.stroke();
  c.fillStyle = m.ink;
  c.fillText(text, x, y);
}

/** A dot. In 3D a thin stem joins it to where it stands on the ground. */
function paintDot(c: Canvas2d, m: DotMark): void {
  if (m.foot) {
    c.globalAlpha = m.alpha * 0.3;
    c.strokeStyle = m.fill;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(m.foot[0], m.foot[1]);
    c.lineTo(m.x, m.y);
    c.stroke();
  }
  c.globalAlpha = m.alpha;
  c.fillStyle = m.fill;
  c.beginPath();
  c.arc(m.x, m.y, m.r, 0, Math.PI * 2);
  c.fill();
}

/** A card with its name, and a second line under it when it has one. */
function paintLabel(c: Canvas2d, m: LabelMark): void {
  if (m.lead) {
    // a card away from its thing: a thin line in its colour joins them, with a dot where it meets the thing
    const [x1, y1, x2, y2] = m.lead;
    c.globalAlpha = m.alpha * 0.7;
    c.strokeStyle = m.edge ?? m.ink;
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
    c.fillStyle = m.edge ?? m.ink;
    c.beginPath();
    c.arc(x2, y2, 2.5, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = m.alpha;
  c.fillStyle = m.fill;
  c.beginPath();
  c.roundRect(m.x, m.y, m.w, m.h, m.sub ? 8 : m.h / 2);
  c.fill();
  if (m.edge) {
    // a white card on pale paper needs a thin edge of its colour to be seen
    c.globalAlpha = m.alpha * 0.5;
    c.strokeStyle = m.edge;
    c.lineWidth = 1;
    c.stroke();
    c.globalAlpha = m.alpha;
  }
  // an item's card: a dot of its colour at the start, and the name after it
  const shift = m.dot ? m.px / 2 : 0;
  if (m.dot) {
    c.fillStyle = m.dot;
    c.beginPath();
    c.arc(m.x + m.h / 2, m.y + m.h / 2, m.px * 0.3, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = m.ink;
  c.font = `600 ${m.px}px system-ui, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const line = m.px * 1.6;
  c.fillText(m.text, m.x + m.w / 2 + shift, m.y + line / 2);
  if (m.sub && m.subPx && m.subInk) {
    c.fillStyle = m.subInk;
    c.font = `500 ${m.subPx}px system-ui, sans-serif`;
    c.fillText(m.sub, m.x + m.w / 2, m.y + line + (m.h - line) / 2 - 1);
  }
}

/** Draws `marks` on `c`, which is `w` by `h`, in the order given. */
export function paintCanvas(c: Canvas2d, marks: readonly Mark[], w: number, h: number): void {
  c.clearRect(0, 0, w, h);
  for (const m of marks) {
    if (m.kind === 'ground') paintGround(c, m);
    else if (m.kind === 'cloud') paintCloud(c, m);
    else if (m.kind === 'road') paintRoad(c, m);
    else if (m.kind === 'dot') paintDot(c, m);
    else paintLabel(c, m);
  }
  c.globalAlpha = 1;
}

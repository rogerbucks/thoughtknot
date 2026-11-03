// A PNG from the SVG the core draws (editor spec §46, cowork_drawing). Cowork's skill sandbox has no picture library,
// and the skill brings no server and no extra library (cowork_no_server). So this reads only the parts of SVG that
// Graphviz writes for the core (paths, polygons, polylines, ellipses and text) and paints them itself.
// - Colours are the ones written in each part's style. The skill asks for the fixed light palette, so they are all there.
// - Text is painted from a small built-in 5x7 letter set: plain letters, digits and punctuation. Any other character is
//   painted as a question mark and counted, so the person is told. The SVG beside the PNG shows every character.
// - The PNG is written with node's zlib alone.
import { deflateSync } from 'node:zlib';

/** The most pixels a PNG is painted at, supersampling included. */
const MAX_PIXELS = 24_000_000;
/** Samples across and down each output pixel, for smooth edges. */
const SS = 2;

type Rgb = [number, number, number];
type Point = [number, number];

// The 5x7 letters from space (32) to tilde (126): five columns each, the lowest bit at the top.
const FONT: readonly number[] = [
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x5f, 0x00, 0x00, 0x00, 0x07, 0x00, 0x07, 0x00, 0x14, 0x7f, 0x14, 0x7f,
  0x14, 0x24, 0x2a, 0x7f, 0x2a, 0x12, 0x23, 0x13, 0x08, 0x64, 0x62, 0x36, 0x49, 0x56, 0x20, 0x50, 0x00, 0x05, 0x03,
  0x00, 0x00, 0x00, 0x1c, 0x22, 0x41, 0x00, 0x00, 0x41, 0x22, 0x1c, 0x00, 0x2a, 0x1c, 0x7f, 0x1c, 0x2a, 0x08, 0x08,
  0x3e, 0x08, 0x08, 0x00, 0x50, 0x30, 0x00, 0x00, 0x08, 0x08, 0x08, 0x08, 0x08, 0x00, 0x60, 0x60, 0x00, 0x00, 0x20,
  0x10, 0x08, 0x04, 0x02, 0x3e, 0x51, 0x49, 0x45, 0x3e, 0x00, 0x42, 0x7f, 0x40, 0x00, 0x42, 0x61, 0x51, 0x49, 0x46,
  0x21, 0x41, 0x45, 0x4b, 0x31, 0x18, 0x14, 0x12, 0x7f, 0x10, 0x27, 0x45, 0x45, 0x45, 0x39, 0x3c, 0x4a, 0x49, 0x49,
  0x30, 0x01, 0x71, 0x09, 0x05, 0x03, 0x36, 0x49, 0x49, 0x49, 0x36, 0x06, 0x49, 0x49, 0x29, 0x1e, 0x00, 0x36, 0x36,
  0x00, 0x00, 0x00, 0x56, 0x36, 0x00, 0x00, 0x08, 0x14, 0x22, 0x41, 0x00, 0x14, 0x14, 0x14, 0x14, 0x14, 0x00, 0x41,
  0x22, 0x14, 0x08, 0x02, 0x01, 0x51, 0x09, 0x06, 0x32, 0x49, 0x79, 0x41, 0x3e, 0x7e, 0x11, 0x11, 0x11, 0x7e, 0x7f,
  0x49, 0x49, 0x49, 0x36, 0x3e, 0x41, 0x41, 0x41, 0x22, 0x7f, 0x41, 0x41, 0x22, 0x1c, 0x7f, 0x49, 0x49, 0x49, 0x41,
  0x7f, 0x09, 0x09, 0x09, 0x01, 0x3e, 0x41, 0x49, 0x49, 0x7a, 0x7f, 0x08, 0x08, 0x08, 0x7f, 0x00, 0x41, 0x7f, 0x41,
  0x00, 0x20, 0x40, 0x41, 0x3f, 0x01, 0x7f, 0x08, 0x14, 0x22, 0x41, 0x7f, 0x40, 0x40, 0x40, 0x40, 0x7f, 0x02, 0x0c,
  0x02, 0x7f, 0x7f, 0x04, 0x08, 0x10, 0x7f, 0x3e, 0x41, 0x41, 0x41, 0x3e, 0x7f, 0x09, 0x09, 0x09, 0x06, 0x3e, 0x41,
  0x51, 0x21, 0x5e, 0x7f, 0x09, 0x19, 0x29, 0x46, 0x46, 0x49, 0x49, 0x49, 0x31, 0x01, 0x01, 0x7f, 0x01, 0x01, 0x3f,
  0x40, 0x40, 0x40, 0x3f, 0x1f, 0x20, 0x40, 0x20, 0x1f, 0x3f, 0x40, 0x38, 0x40, 0x3f, 0x63, 0x14, 0x08, 0x14, 0x63,
  0x07, 0x08, 0x70, 0x08, 0x07, 0x61, 0x51, 0x49, 0x45, 0x43, 0x00, 0x7f, 0x41, 0x41, 0x00, 0x02, 0x04, 0x08, 0x10,
  0x20, 0x00, 0x41, 0x41, 0x7f, 0x00, 0x04, 0x02, 0x01, 0x02, 0x04, 0x40, 0x40, 0x40, 0x40, 0x40, 0x00, 0x01, 0x02,
  0x04, 0x00, 0x20, 0x54, 0x54, 0x54, 0x78, 0x7f, 0x48, 0x44, 0x44, 0x38, 0x38, 0x44, 0x44, 0x44, 0x20, 0x38, 0x44,
  0x44, 0x48, 0x7f, 0x38, 0x54, 0x54, 0x54, 0x18, 0x08, 0x7e, 0x09, 0x01, 0x02, 0x0c, 0x52, 0x52, 0x52, 0x3e, 0x7f,
  0x08, 0x04, 0x04, 0x78, 0x00, 0x44, 0x7d, 0x40, 0x00, 0x20, 0x40, 0x44, 0x3d, 0x00, 0x7f, 0x10, 0x28, 0x44, 0x00,
  0x00, 0x41, 0x7f, 0x40, 0x00, 0x7c, 0x04, 0x18, 0x04, 0x78, 0x7c, 0x08, 0x04, 0x04, 0x78, 0x38, 0x44, 0x44, 0x44,
  0x38, 0x7c, 0x14, 0x14, 0x14, 0x08, 0x08, 0x14, 0x14, 0x18, 0x7c, 0x7c, 0x08, 0x04, 0x04, 0x08, 0x48, 0x54, 0x54,
  0x54, 0x20, 0x04, 0x3f, 0x44, 0x40, 0x20, 0x3c, 0x40, 0x40, 0x20, 0x7c, 0x1c, 0x20, 0x40, 0x20, 0x1c, 0x3c, 0x40,
  0x30, 0x40, 0x3c, 0x44, 0x28, 0x10, 0x28, 0x44, 0x0c, 0x50, 0x50, 0x50, 0x3c, 0x44, 0x64, 0x54, 0x4c, 0x44, 0x00,
  0x08, 0x36, 0x41, 0x00, 0x00, 0x00, 0x7f, 0x00, 0x00, 0x00, 0x41, 0x36, 0x08, 0x00, 0x08, 0x08, 0x2a, 0x1c, 0x08,
];

const NAMED: Record<string, Rgb> = { white: [255, 255, 255], black: [0, 0, 0], red: [255, 0, 0] };

/** A colour written in SVG, or null for none (`none`, `transparent`, or one this reader does not know). */
function colourOf(text: string | undefined): Rgb | null {
  const t = (text ?? '').trim().toLowerCase();
  if (NAMED[t]) return NAMED[t];
  const hex = /^#([0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-f])/.exec(t)?.[1];
  if (!hex) return null;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

/** The value of an attribute, or of a property in its style. */
function attr(tag: string, name: string): string | undefined {
  const style = /\sstyle="([^"]*)"/.exec(tag)?.[1] ?? '';
  const inStyle = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`).exec(style)?.[1];
  return inStyle ?? new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}

const numbers = (text: string): number[] => (text.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number);

/** The points of a path's `d`: its lines straight and its curves flattened. Each run of points is one sub-path. */
function pathPoints(d: string): Point[][] {
  const runs: Point[][] = [];
  const tokens = d.match(/[MLCZmlcz]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let cmd = '',
    now: Point = [0, 0],
    run: Point[] = [];
  const args: number[] = [];
  const take = (n: number): number[] | null => (args.length >= n ? args.splice(0, n) : null);
  const flush = () => {
    if (run.length) runs.push(run);
    run = [];
  };
  const drain = () => {
    for (;;) {
      if (cmd === 'M' || cmd === 'L') {
        const a = take(2);
        if (!a) return;
        now = [a[0] as number, a[1] as number];
        if (cmd === 'M') {
          flush();
          cmd = 'L';
        }
        run.push(now);
      } else if (cmd === 'C') {
        const a = take(6);
        if (!a) return;
        const [x1, y1, x2, y2, x, y] = a as [number, number, number, number, number, number];
        const [x0, y0] = now;
        for (let i = 1; i <= 12; i++) {
          const t = i / 12,
            u = 1 - t;
          run.push([
            u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
            u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y,
          ]);
        }
        now = [x, y];
      } else return;
    }
  };
  for (const tok of tokens) {
    if (/^[MLCZmlcz]$/.test(tok)) {
      drain();
      cmd = tok.toUpperCase();
      if (cmd === 'Z' && run[0]) run.push(run[0]);
    } else {
      args.push(Number(tok));
      drain();
    }
  }
  flush();
  return runs;
}

const ellipsePoints = (cx: number, cy: number, rx: number, ry: number): Point[] =>
  Array.from({ length: 64 }, (_, i): Point => {
    const a = (i / 64) * Math.PI * 2;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  });

/** A canvas painted at SS samples a pixel across and down. */
class Canvas {
  readonly data: Float32Array;
  readonly w: number;
  readonly h: number;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.data = new Float32Array(w * h * 3);
  }
  fill(colour: Rgb): void {
    for (let i = 0; i < this.w * this.h; i++) this.data.set(colour, i * 3);
  }
  /** Fills a polygon (even-odd) with a colour. */
  polygon(points: Point[], colour: Rgb): void {
    if (points.length < 3) return;
    const ys = points.map((p) => p[1]);
    const top = Math.max(0, Math.floor(Math.min(...ys))),
      bottom = Math.min(this.h - 1, Math.ceil(Math.max(...ys)));
    for (let y = top; y <= bottom; y++) {
      const at = y + 0.5,
        xs: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const [x1, y1] = points[i] as Point,
          [x2, y2] = points[(i + 1) % points.length] as Point;
        if (y1 !== y2 && (at - y1) * (at - y2) < 0) xs.push(x1 + ((at - y1) / (y2 - y1)) * (x2 - x1));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const from = Math.max(0, Math.round(xs[i] as number)),
          to = Math.min(this.w, Math.round(xs[i + 1] as number));
        for (let x = from; x < to; x++) this.data.set(colour, (y * this.w + x) * 3);
      }
    }
  }
  /** Strokes a run of points as a line `width` samples wide. */
  line(points: Point[], width: number, colour: Rgb): void {
    const half = Math.max(width, 1) / 2;
    for (let i = 0; i + 1 < points.length; i++) {
      const [x1, y1] = points[i] as Point,
        [x2, y2] = points[i + 1] as Point;
      const dx = x2 - x1,
        dy = y2 - y1,
        len = Math.hypot(dx, dy);
      if (!len) continue;
      const nx = (-dy / len) * half,
        ny = (dx / len) * half;
      // each end a little long, so joined segments leave no gap
      const ex = (dx / len) * half * 0.5,
        ey = (dy / len) * half * 0.5;
      this.polygon(
        [
          [x1 - ex + nx, y1 - ey + ny],
          [x2 + ex + nx, y2 + ey + ny],
          [x2 + ex - nx, y2 + ey - ny],
          [x1 - ex - nx, y1 - ey - ny],
        ],
        colour,
      );
    }
  }
}

/** The glyph for a character, and whether it had to be a question mark. */
function glyph(ch: string): { columns: readonly number[]; unknown: boolean } {
  const code = ch.charCodeAt(0);
  const known = ch.length === 1 && code >= 32 && code <= 126;
  const at = ((known ? code : 63) - 32) * 5;
  return { columns: FONT.slice(at, at + 5), unknown: !known };
}

const unescape = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

/** What a PNG of an SVG is, or why there is none. `unknown` counts the characters painted as a question mark. */
export type Raster = { png: Uint8Array; width: number; height: number; unknown: number } | { why: string };

/** The SVG painted as a PNG at about `width` pixels across. */
export function svgToPng(svg: string, width = 1600): Raster {
  const root = /<svg\b[^>]*>/.exec(svg)?.[0];
  const box = root && numbers(/viewBox="([^"]*)"/.exec(root)?.[1] ?? '');
  if (!root || !box || box.length !== 4 || !((box[2] as number) > 0) || !((box[3] as number) > 0))
    return { why: 'the drawing has no size to paint' };
  const [vx, vy, vw, vh] = box as [number, number, number, number];
  let k = width / vw;
  if (vw * k * SS * vh * k * SS > MAX_PIXELS) k = Math.sqrt(MAX_PIXELS / (vw * vh)) / SS;
  const w = Math.max(1, Math.round(vw * k)),
    h = Math.max(1, Math.round(vh * k));
  if (w < 16 || h < 16) return { why: 'the drawing is too large to paint as a PNG at a readable size' };
  const canvas = new Canvas(w * SS, h * SS);
  canvas.fill(colourOf(attr(root, 'background')) ?? [255, 255, 255]);

  // the graph's own transform: scale, then translate (Graphviz writes no other)
  const g = /<g\b[^>]*class="graph"[^>]*>/.exec(svg)?.[0] ?? '';
  const scale = numbers(/scale\(([^)]*)\)/.exec(g)?.[1] ?? '1 1');
  const move = numbers(/translate\(([^)]*)\)/.exec(g)?.[1] ?? '0 0');
  const sx = (scale[0] ?? 1) * k * SS,
    sy = (scale[1] ?? scale[0] ?? 1) * k * SS;
  const place = ([x, y]: Point): Point => [(x + (move[0] ?? 0) - vx) * sx, (y + (move[1] ?? 0) - vy) * sy];
  let unknown = 0;

  for (const m of svg.matchAll(/<(path|polygon|polyline|ellipse|text)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/g)) {
    const tag = ` ${m[2] ?? ''}`;
    const kind = m[1];
    const fill = colourOf(attr(tag, 'fill')),
      stroke = colourOf(attr(tag, 'stroke'));
    const strokeWidth = (Number(attr(tag, 'stroke-width')) || 1) * Math.min(Math.abs(sx), Math.abs(sy));
    let runs: Point[][] = [];
    if (kind === 'path') runs = pathPoints(/\sd="([^"]*)"/.exec(tag)?.[1] ?? '');
    else if (kind === 'polygon' || kind === 'polyline') {
      const n = numbers(/\spoints="([^"]*)"/.exec(tag)?.[1] ?? '');
      const run: Point[] = [];
      for (let i = 0; i + 1 < n.length; i += 2) run.push([n[i] as number, n[i + 1] as number]);
      if (kind === 'polygon' && run[0]) run.push(run[0]);
      runs = [run];
    } else if (kind === 'ellipse') {
      const [cx = 0, cy = 0, rx = 0, ry = 0] = ['cx', 'cy', 'rx', 'ry'].map((a) => Number(attr(tag, a)));
      const run = ellipsePoints(cx, cy, rx, ry);
      run.push(run[0] as Point);
      runs = [run];
    } else if (kind === 'text') {
      const size = Number(attr(tag, 'font-size')) || 12;
      const body = unescape(m[4] ?? '');
      const colour = fill ?? [0, 0, 0];
      const u = (size * 0.52) / 6; // one dot of a letter, in graph units
      const chars = [...body];
      const total = chars.length * 6 * u;
      const anchor = attr(tag, 'text-anchor') ?? 'start';
      let x = Number(attr(tag, 'x')) - (anchor === 'middle' ? total / 2 : anchor === 'end' ? total : 0);
      const base = Number(attr(tag, 'y'));
      for (const ch of chars) {
        const { columns, unknown: lost } = glyph(ch);
        if (lost) unknown++;
        columns.forEach((bits, c) => {
          for (let r = 0; r < 7; r++)
            if (bits & (1 << r)) {
              const a = place([x + c * u, base - (7 - r) * u]),
                b = place([x + (c + 1) * u, base - (6 - r) * u]);
              canvas.polygon([a, [b[0], a[1]], b, [a[0], b[1]]], colour);
            }
        });
        x += 6 * u;
      }
      continue;
    }
    for (const run of runs) {
      const points = run.map(place);
      if (fill && kind !== 'polyline') canvas.polygon(points, fill);
      if (stroke) canvas.line(points, strokeWidth, stroke);
    }
  }

  // down to the output size: the mean of each pixel's samples, as a PNG's rows, each with its filter byte
  const rows = new Uint8Array((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    rows[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let j = 0; j < SS; j++)
          for (let i = 0; i < SS; i++) sum += canvas.data[((y * SS + j) * canvas.w + x * SS + i) * 3 + c] as number;
        rows[y * (w * 3 + 1) + 1 + x * 3 + c] = Math.round(sum / (SS * SS));
      }
  }
  return { png: encodePng(w, h, rows), width: w, height: h, unknown };
}

const SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/** The CRC-32 a PNG chunk ends with. */
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** A PNG of 8-bit RGB `rows` (each with its filter byte), compressed with zlib. */
function encodePng(w: number, h: number, rows: Uint8Array): Uint8Array {
  const head = new Uint8Array(13);
  const view = new DataView(head.buffer);
  view.setUint32(0, w);
  view.setUint32(4, h);
  head.set([8, 2, 0, 0, 0], 8);
  const parts = [
    SIGNATURE,
    chunk('IHDR', head),
    chunk('IDAT', new Uint8Array(deflateSync(rows, { level: 9 }))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    png.set(p, at);
    at += p.length;
  }
  return png;
}

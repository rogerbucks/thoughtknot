// Names on the things in 3D (editor spec §53, space_text_on_face). Roger, 25 Oct 2026: "In the 3d view, text should
// be contained on the surface most visible to the user but contained entirely in the face of the item."
//
// So a thing's name is painted on it, never beside it:
// - on a box, on the face the camera sees most of, lying on that face, turned so it reads as near upright as it can;
// - on a ball, on the disc it shows the camera, inside the square that fits in its circle.
// The name wraps at its spaces and shrinks to fit inside the face. Where even the smallest readable size will not fit,
// the face is left plain, and zooming in shows it. A thing hidden by a nearer one shows no name. Cards (2.5D) hold
// their names already (space-cards.ts). Host-free and pure.
import { FIELD, projectPoint } from './space-view.ts';
import type { Block, SpaceMarks, Vec3 } from './space-view.ts';
import { READABLE_LEAST, largestName } from './space-labels.ts';

/**
 * A name on a face: its rows, their size and the widest a row may be, in steps of the face. The face's middle is at
 * (`x`, `y`) on the screen, and `across` and `down` are one step along it, in pixels. `ground` is the thing's style.
 */
export interface FaceText {
  id: string;
  style: string;
  ground: string;
  rows: string[];
  size: number;
  room: number;
  x: number;
  y: number;
  across: [number, number];
  down: [number, number];
  far: number;
  picked?: boolean;
}

/** How wide a letter is, about, as a share of its size. */
const LETTER_WIDTH = 0.56;
/** How tall a row of words on a face is, as a share of their size. */
export const FACE_ROW = 1.2;
/** The room kept round the words inside the face, as a share of their size. */
const PAD = 0.3;
/** Each try at fitting the words is this much smaller than the last. */
const SHRINK = 0.9;
/** The most names painted on faces at once, nearest where you look first, so a huge graph stays quick. */
export const FACES_MOST = 200;

/** `text` cut into rows of at most `letters` letters, at its spaces; a word longer than a row is a row of its own. */
export function rowsOf(text: string, letters: number): string[] {
  const rows: string[] = [];
  let row = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (row && row.length + 1 + word.length > letters) {
      rows.push(row);
      row = word;
    } else row = row ? `${row} ${word}` : word;
  }
  if (row) rows.push(row);
  return rows;
}

/**
 * `text` wrapped to fit inside a face `wide` by `high`. It takes the largest size from `most` down to `least` that
 * fits, or is null where none does.
 */
export function fitWords(
  text: string,
  wide: number,
  high: number,
  most: number,
  least: number,
): { rows: string[]; size: number; room: number } | null {
  for (let size = most; size >= least; size *= SHRINK) {
    const room = wide - 2 * PAD * size,
      letters = Math.floor(room / (size * LETTER_WIDTH));
    if (letters < 1) continue;
    const rows = rowsOf(text, letters);
    if (rows.every((r) => r.length <= letters) && rows.length * size * FACE_ROW <= high - 2 * PAD * size)
      return { rows, size, room };
  }
  return null;
}

/** A face of a box: its middle, and half of each of its two sides; the turn from the first to the second faces out. */
type Face = { mid: Vec3; a: Vec3; b: Vec3 };

/** The six faces of `b`, each with its sides ordered so that the first turned to the second points out of the box. */
function facesOf(b: Block): Face[] {
  const hx = b.width / 2,
    hy = b.depth / 2,
    hz = b.tall / 2;
  const [cx, cy, cz] = [b.x + hx, b.y + hy, b.floor + hz];
  const ox: Vec3 = [hx, 0, 0],
    oy: Vec3 = [0, hy, 0],
    oz: Vec3 = [0, 0, hz];
  return [
    { mid: [cx, cy, cz + hz], a: ox, b: oy },
    { mid: [cx, cy, cz - hz], a: oy, b: ox },
    { mid: [cx + hx, cy, cz], a: oy, b: oz },
    { mid: [cx - hx, cy, cz], a: oz, b: oy },
    { mid: [cx, cy + hy, cz], a: oz, b: ox },
    { mid: [cx, cy - hy, cz], a: ox, b: oz },
  ];
}

const add = (p: Vec3, q: Vec3, k = 1): Vec3 => [p[0] + k * q[0], p[1] + k * q[1], p[2] + k * q[2]];

/** A face on the screen: how much of it the camera sees, in square pixels, and the steps along it for its words. */
type SeenFace = {
  x: number;
  y: number;
  far: number;
  area: number;
  across: [number, number];
  down: [number, number];
  wide: number;
  high: number;
};
type SeenSide = { step: [number, number]; long: number };

/** Face `f` as `matrix` sees it, or null where it turns away from the camera or lies edge on. */
function seenFace(f: Face, matrix: Float32Array, width: number, height: number): SeenFace | null {
  const at = (p: Vec3) => projectPoint(matrix, p, width, height);
  const corners = [add(add(f.mid, f.a, -1), f.b, -1), add(add(f.mid, f.a), f.b, -1), add(add(f.mid, f.a), f.b)];
  corners.push(add(add(f.mid, f.a, -1), f.b));
  const seen = corners.map(at),
    mid = at(f.mid);
  if (!mid || seen.some((p) => !p)) return null;
  const ps = seen as { x: number; y: number }[];
  // seen from outside its corners turn against the screen's way round, as the screen's y runs down
  let twice = 0;
  for (let i = 0; i < 4; i++) {
    const p = ps[i] as { x: number; y: number },
      q = ps[(i + 1) % 4] as { x: number; y: number };
    twice += p.x * q.y - q.x * p.y;
  }
  if (twice >= 0) return null;
  // one step along each side, at the face's middle
  const sideOf = (h: Vec3): SeenSide | null => {
    const long = 2 * Math.hypot(...h),
      p = at(add(f.mid, h, -1)),
      q = at(add(f.mid, h));
    return p && q && long > 0 ? { step: [(q.x - p.x) / long, (q.y - p.y) / long], long } : null;
  };
  const sa = sideOf(f.a),
    sb = sideOf(f.b);
  if (!sa || !sb) return null;
  // the words run along the side nearer level on the screen, left to right, and their rows go down
  const level = (s: SeenSide) => Math.abs(s.step[0]) / (Math.hypot(...s.step) || 1);
  const [run, fall] = level(sa) >= level(sb) ? [sa, sb] : [sb, sa];
  const across: [number, number] = run.step[0] < 0 ? [-run.step[0], -run.step[1]] : run.step;
  const down: [number, number] = fall.step[1] < 0 ? [-fall.step[0], -fall.step[1]] : fall.step;
  // turned so far that its words would be mirrored: it is no face to write on
  if (across[0] * down[1] - across[1] * down[0] <= 1e-9) return null;
  return { x: mid.x, y: mid.y, far: mid.far, area: -twice / 2, across, down, wide: run.long, high: fall.long };
}

/** Where a thing is on the screen, for finding what hides what: its middle, its outline and how far it is. */
type Outline = { b: Block; x: number; y: number; far: number; r?: number; hull?: { x: number; y: number }[] };

/** The outline of each block of `space` on the screen: a circle for a ball, the shape round its corners for a box. */
function outlinesOf(space: SpaceMarks, matrix: Float32Array, width: number, height: number): Outline[] {
  const focal = height / 2 / Math.tan(FIELD / 2);
  return space.blocks.flatMap((b): Outline[] => {
    const mid: Vec3 = [b.x + b.width / 2, b.y + b.depth / 2, b.floor + b.tall / 2];
    const c = projectPoint(matrix, mid, width, height);
    if (!c) return [];
    if (space.round) return [{ b, x: c.x, y: c.y, far: c.far, r: ((b.width / 2) * focal) / c.far }];
    const corners = [0, 1].flatMap((i) =>
      [0, 1].flatMap((j) =>
        [0, 1].map((k) =>
          projectPoint(matrix, [b.x + i * b.width, b.y + j * b.depth, b.floor + k * b.tall], width, height),
        ),
      ),
    );
    if (corners.some((p) => !p)) return [];
    return [{ b, x: c.x, y: c.y, far: c.far, hull: hullOf(corners as { x: number; y: number }[]) }];
  });
}

/** The smallest shape round `points` with no dent in it, its corners turning one way. */
function hullOf(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const ps = [...points].sort((p, q) => p.x - q.x || p.y - q.y);
  const turn = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: { x: number; y: number }[]) => {
    const out: { x: number; y: number }[] = [];
    for (const p of list) {
      while (out.length >= 2 && turn(out[out.length - 2] as never, out[out.length - 1] as never, p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(ps), ...half([...ps].reverse())];
}

/** Whether `o` covers the point (`x`, `y`) of the screen, `far` from the eye, being nearer there. */
function covers(o: Outline, x: number, y: number, far: number): boolean {
  if (o.r !== undefined) {
    const d = Math.hypot(x - o.x, y - o.y) / o.r;
    return d < 1 && far > o.far - o.b.width / 2 + 1;
  }
  const hull = o.hull ?? [];
  if (far <= o.far || hull.length < 3) return false;
  return hull.every((p, i) => {
    const q = hull[(i + 1) % hull.length] as { x: number; y: number };
    return (q.x - p.x) * (y - p.y) - (q.y - p.y) * (x - p.x) >= 0;
  });
}

/**
 * The names of `space`'s things painted on their faces, as the camera's `matrix` sees them, at most `most`. The picked
 * thing comes first, then those nearest the middle of the screen and the camera. Each fits wholly inside its face.
 */
export function facesOnScreen(
  space: SpaceMarks,
  matrix: Float32Array,
  width: number,
  height: number,
  { most = FACES_MOST, picked }: { most?: number; picked?: string } = {},
): FaceText[] {
  const outlines = outlinesOf(space, matrix, width, height),
    largest = largestName(width, height),
    across = Math.hypot(width, height) / 2;
  const names = new Map<string, { id: string; style: string; text: string; size: number }>();
  for (const l of space.labels) if (l.of !== undefined && l.link === undefined && !names.has(l.of)) names.set(l.of, l);
  const wanted = outlines
    .filter((o) => o.b.of !== undefined && names.has(o.b.of))
    .filter((o) => o.x >= 0 && o.y >= 0 && o.x <= width && o.y <= height)
    .map((o) => {
      const mine = picked !== undefined && o.b.of === picked;
      return { o, mine, rank: mine ? -1 : o.far * (1 + (2 * Math.hypot(o.x - width / 2, o.y - height / 2)) / across) };
    })
    .sort((p, q) => p.rank - q.rank);
  const out: FaceText[] = [];
  for (const { o, mine } of wanted) {
    if (out.length >= most) break;
    const name = names.get(o.b.of as string) as { id: string; style: string; text: string; size: number };
    const face = space.round ? ballFace(o) : bestFace(o.b, matrix, width, height);
    if (!face || outlines.some((n) => n !== o && covers(n, face.x, face.y, face.far))) continue;
    // its size on the screen: one step of the face is this many pixels, as its area says
    const scale = Math.sqrt(face.across[0] * face.down[1] - face.across[1] * face.down[0]);
    const natural = space.round ? largest : Math.min(largest, name.size * scale);
    const fit = fitWords(name.text, face.wide, face.high, natural / scale, READABLE_LEAST / scale);
    if (!fit) continue;
    const { wide: _w, high: _h, area: _a, ...at } = face;
    const text: FaceText = { id: name.id, style: name.style, ground: o.b.style, ...fit, ...at };
    if (mine) text.picked = true;
    out.push(text);
  }
  // far ones first, so near ones are painted over them
  return out.sort((p, q) => q.far - p.far);
}

/** A ball's disc as the camera sees it: the square inside its circle, flat to the screen. */
function ballFace(o: Outline): SeenFace {
  const side = (o.r ?? 0) * Math.SQRT2;
  return { x: o.x, y: o.y, far: o.far, area: side * side, across: [1, 0], down: [0, 1], wide: side, high: side };
}

/** The face of box `b` the camera sees most of, or null where it sees none. */
function bestFace(b: Block, matrix: Float32Array, width: number, height: number): SeenFace | null {
  let best: SeenFace | null = null;
  for (const f of facesOf(b)) {
    const seen = seenFace(f, matrix, width, height);
    if (seen && (!best || seen.area > best.area)) best = seen;
  }
  return best;
}

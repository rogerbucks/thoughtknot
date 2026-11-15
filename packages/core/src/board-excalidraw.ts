// A board read from and written as an Excalidraw drawing (editor spec ES§45, board_exchange). Our own reader and
// writer in plain JavaScript: no library, no WebAssembly and no network.
// - Reading: a rectangle, ellipse or diamond is a shape, and the text bound to it is its text. A text is a text.
//   A frame is a frame. A pen stroke is ink. An arrow bound to two shapes is a connector; any other is a drawn line.
// - Writing: every item with words is a box with its text bound to it, and a connector is an arrow bound to both.
// - It reads a `.excalidraw` file, and the drawing inside an Obsidian Excalidraw note when that is not compressed.
// - Untrusted: the size, the count and each text are checked, and a file that is no drawing is refused.
// - Loss stated: a board holds no picture kept inside a drawing, colour of its own, fill, font or turn. A drawing
//   holds no view of a graph, picture by its place, vote, comment or link to a thing. What is left out is said.
import type { Board, BoardItem, Connector } from './board.ts';
import { freeName, isObject, text, whole } from './board-canvas.ts';
import type { Json } from './board-canvas.ts';
import { itemBox } from './board-svg.ts';
import type { Box } from './board-svg.ts';
import { word } from './words.ts';

/** Why a drawing was not read, as a sentence naming what to do. */
export interface ExcalidrawRefusal {
  why: 'not-excalidraw' | 'compressed' | 'too-large' | 'too-many' | 'text-too-long';
  refused: string;
}

/** A board read from a drawing, and a sentence for each kind of thing that was left out. */
export interface ExcalidrawRead {
  board: Board;
  notes: string[];
}

/** The most a drawing may hold before it is refused: its characters, its elements, and the characters of one text. */
export const EXCALIDRAW_LIMITS = { chars: 16 * 1024 * 1024, items: 20_000, text: 100_000 };

// the most points one stroke keeps: a longer one keeps every nth point, and its last
const MOST_POINTS = 200;
const SHAPES: Record<string, string> = { rectangle: 'box', diamond: 'box', ellipse: 'ellipse' };
const FRAMES = new Set(['frame', 'magicframe']);
const LINES = new Set(['arrow', 'line']);

/** The points of a stroke as the board writes them: whole numbers in pairs, from the item's place. */
function pointsText(points: unknown, ends: boolean): string | undefined {
  if (!Array.isArray(points)) return undefined;
  const pairs = points.flatMap((p): [number, number][] => {
    const [x, y] = Array.isArray(p) ? [whole(p[0]), whole(p[1])] : [];
    return x === undefined || y === undefined ? [] : [[x, y]];
  });
  if (pairs.length < 2) return undefined;
  const step = Math.ceil(pairs.length / MOST_POINTS);
  const last = pairs.length - 1;
  const kept = ends ? [pairs[0], pairs[last]] : pairs.filter((_, i) => i % step === 0 || i === last);
  return kept.map((p) => (p ? `${p[0]} ${p[1]}` : '')).join(' ');
}

/** The element a binding names, or nothing. */
const boundTo = (v: unknown): string | undefined => (isObject(v) ? text(v.elementId) : undefined);

/** What one element gives its item, or null for a type that cannot be read. */
function kindOf(e: Json): Pick<BoardItem, 'kind' | 'text' | 'more'> | null {
  const type = text(e.type) ?? '';
  const shape = SHAPES[type];
  if (shape) return { kind: 'Shape', more: { shape } };
  if (type === 'text') return { kind: 'Text', text: text(e.text), more: {} };
  if (FRAMES.has(type)) return { kind: 'Frame', text: text(e.name), more: {} };
  if (type === 'freedraw' || LINES.has(type)) {
    const points = pointsText(e.points, type !== 'freedraw');
    if (!points) return null;
    return type === 'freedraw' ? { kind: 'Ink', more: { points } } : { kind: 'Shape', more: { shape: type, points } };
  }
  const link = text(e.link);
  if ((type === 'embeddable' || type === 'iframe') && link) return { kind: 'Card', text: link, more: { links: link } };
  return null;
}

/** Thrown when a text is over its limit; turned into a refusal at the edge. */
class TextTooLong extends Error {}

/** The elements still in the drawing, by id, and the words bound to each box or arrow. */
function sorted(elements: unknown[], limits: typeof EXCALIDRAW_LIMITS) {
  const live = elements.filter((e) => !isObject(e) || e.isDeleted !== true);
  const ids = new Set(live.flatMap((e) => (isObject(e) && text(e.id) ? [text(e.id) ?? ''] : [])));
  const words = new Map<string, string>();
  const rest: unknown[] = [];
  for (const e of live) {
    if (isObject(e) && (text(e.text) ?? '').length > limits.text) throw new TextTooLong();
    const box = isObject(e) && e.type === 'text' ? text(e.containerId) : undefined;
    if (isObject(e) && box && ids.has(box)) words.set(box, text(e.text) ?? '');
    else rest.push(e);
  }
  return { rest, ids, words };
}

/** The items and connectors of the elements, with how many were left out and why. */
function boardParts(elements: unknown[], limits: typeof EXCALIDRAW_LIMITS) {
  const { rest, ids, words } = sorted(elements, limits);
  const names = new Map<string, string>();
  const taken = new Set<string>();
  const items: BoardItem[] = [];
  const arrows: Json[] = [];
  let [skipped, pictures, look] = [0, 0, false];
  for (const e of rest) {
    const id = isObject(e) ? text(e.id) : undefined;
    if (!isObject(e) || !id) {
      skipped++;
      continue;
    }
    const [from, to] = [boundTo(e.startBinding), boundTo(e.endBinding)];
    if (e.type === 'arrow' && from && to && ids.has(from) && ids.has(to)) {
      arrows.push(e);
      continue;
    }
    if (e.type === 'image') {
      pictures++;
      continue;
    }
    const [x, y] = [whole(e.x), whole(e.y)];
    const kind = kindOf(e);
    if (names.has(id) || x === undefined || y === undefined || !kind) {
      skipped++;
      continue;
    }
    const name = freeName(id, taken);
    taken.add(name);
    names.set(id, name);
    const item: BoardItem = { id: name, kind: kind.kind, x, y, more: kind.more };
    const [w, h] = [whole(e.width), whole(e.height)];
    if (w !== undefined && w > 0) item.w = w;
    if (h !== undefined && h > 0) item.h = h;
    const said = kind.text ?? words.get(id);
    if (said) item.text = said;
    const group = Array.isArray(e.groupIds) ? text(e.groupIds[e.groupIds.length - 1]) : undefined;
    if (group) item.group = group;
    if (e.locked === true) item.locked = true;
    const filled = e.backgroundColor !== undefined && e.backgroundColor !== 'transparent';
    if (filled || (typeof e.angle === 'number' && e.angle !== 0)) look = true;
    items.push(item);
  }
  const connectors: Connector[] = [];
  const seen = new Set<string>();
  for (const e of arrows) {
    const from = names.get(boundTo(e.startBinding) ?? '');
    const to = names.get(boundTo(e.endBinding) ?? '');
    if (!from || !to || from === to || seen.has(`${from} ${to}`)) {
      skipped++;
      continue;
    }
    seen.add(`${from} ${to}`);
    const label = words.get(text(e.id) ?? '');
    connectors.push(label ? { from, to, label } : { from, to });
  }
  return { items, connectors, skipped, pictures, look };
}

/** The drawing's JSON in a file's text, or the Drawing block of an Obsidian Excalidraw note; null when compressed. */
function drawingJson(file: string): string | null {
  if (file.trimStart().startsWith('{')) return file;
  if (/^```compressed-json\s*$/m.test(file)) return null;
  const m = /^```json\s*\n([\s\S]*?)\n```\s*$/m.exec(file);
  return m?.[1] ?? file;
}

/**
 * The board an Excalidraw drawing holds, named `name`, or why it was refused. It is a free board: its items link to
 * no graph. An element that cannot be read is left out, and `notes` says how many, in whole sentences.
 */
export function excalidrawBoard(
  file: string,
  name: string,
  limits = EXCALIDRAW_LIMITS,
): ExcalidrawRead | ExcalidrawRefusal {
  const refuse = (why: ExcalidrawRefusal['why'], most = 0): ExcalidrawRefusal => ({
    why,
    refused: word(`reading.excalidraw.${why}`, { most }),
  });
  if (file.length > limits.chars) return refuse('too-large', limits.chars);
  const json = drawingJson(file);
  if (json === null) return refuse('compressed');
  let drawing: unknown;
  try {
    drawing = JSON.parse(json);
  } catch {
    return refuse('not-excalidraw');
  }
  if (!isObject(drawing) || drawing.type !== 'excalidraw' || !Array.isArray(drawing.elements))
    return refuse('not-excalidraw');
  if (drawing.elements.length > limits.items) return refuse('too-many', limits.items);
  try {
    const read = boardParts(drawing.elements, limits);
    const notes: string[] = [];
    if (read.skipped) notes.push(word('reading.excalidraw.skipped-items', { count: read.skipped }));
    if (read.pictures) notes.push(word('reading.excalidraw.skipped-pictures', { count: read.pictures }));
    if (read.look) notes.push(word('reading.excalidraw.look'));
    return { board: { name, on: null, items: read.items, connectors: read.connectors }, notes };
  } catch (e) {
    if (e instanceof TextTooLong) return refuse('text-too-long', limits.text);
    throw e;
  }
}

// --- writing ---

/** What every element holds, as Excalidraw writes it. `n` gives each its own seed, the same on every write. */
function element(n: number, id: string, type: string, box: Box, more: Json = {}): Json {
  return {
    id,
    type,
    x: box.x,
    y: box.y,
    width: box.w,
    height: box.h,
    angle: 0,
    strokeColor: '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: n + 1,
    version: 1,
    versionNonce: n + 1,
    isDeleted: false,
    boundElements: [],
    updated: 1,
    link: null,
    locked: false,
    ...more,
  };
}

const FONT = 20;
const LINE = 1.25;

/** A text element; inside `box` when `inside` names the element it is bound to, else at the box's own place. */
function words(n: number, id: string, said: string, box: Box, inside: string | null): Json {
  const lines = said.split('\n');
  const w = Math.min(box.w, Math.ceil(Math.max(...lines.map((l) => l.length)) * FONT * 0.55));
  const h = Math.ceil(lines.length * FONT * LINE);
  const at = inside ? { x: Math.round(box.x + (box.w - w) / 2), y: Math.round(box.y + (box.h - h) / 2), w, h } : box;
  return element(n, id, 'text', at, {
    text: said,
    originalText: said,
    fontSize: FONT,
    fontFamily: 1,
    textAlign: inside ? 'center' : 'left',
    verticalAlign: inside ? 'middle' : 'top',
    containerId: inside,
    lineHeight: LINE,
    autoResize: true,
  });
}

/** Where the straight line from a box's middle towards `to` leaves the box. */
function leaves(box: Box, to: [number, number]): [number, number] {
  const [cx, cy] = [box.x + box.w / 2, box.y + box.h / 2];
  const [dx, dy] = [to[0] - cx, to[1] - cy];
  if (!dx && !dy) return [cx, cy];
  const t = Math.min(dx ? box.w / 2 / Math.abs(dx) : Infinity, dy ? box.h / 2 / Math.abs(dy) : Infinity, 1);
  return [Math.round(cx + dx * t), Math.round(cy + dy * t)];
}

/** A stroke's points as Excalidraw holds them, from the text the board writes; nothing when there are too few. */
function pointsOf(v: unknown): [number, number][] | undefined {
  const nums = (text(v) ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (nums.length < 4 || nums.length % 2 || !nums.every(Number.isFinite)) return undefined;
  return Array.from({ length: nums.length / 2 }, (_, i) => [nums[i * 2] ?? 0, nums[i * 2 + 1] ?? 0]);
}

/** The element one item is, besides its words; null for an item a drawing cannot hold. */
function shapeOf(n: number, item: BoardItem): Json | null {
  const box = itemBox(item);
  const own = { groupIds: item.group ? [item.group] : [], locked: item.locked === true };
  const shape = text(item.more.shape);
  const points = pointsOf(item.more.points);
  if (item.kind === 'View' || item.kind === 'Image') return null;
  if (item.kind === 'Frame') return element(n, item.id, 'frame', box, { ...own, name: item.text ?? null });
  if (item.kind === 'Ink')
    return points ? element(n, item.id, 'freedraw', box, { ...own, points, simulatePressure: true }) : null;
  if (item.kind === 'Shape' && (shape === 'line' || shape === 'arrow'))
    return points
      ? element(n, item.id, shape, box, { ...own, points, endArrowhead: shape === 'arrow' ? 'arrow' : null })
      : null;
  if (item.kind === 'Text' || item.kind === 'Glyph')
    return { ...words(n, item.id, item.text ?? text(item.more.glyph) ?? '', box, null), ...own };
  return element(n, item.id, shape === 'ellipse' ? 'ellipse' : 'rectangle', box, own);
}

/** The words written inside an item's box: a card's title and body, any other item's text. */
function saidIn(item: BoardItem): string {
  const body = item.kind === 'Card' ? text(item.more.body) : undefined;
  return [item.text, body].filter((s) => s).join('\n');
}

/**
 * The board written as an Excalidraw drawing. An item a drawing cannot hold is left out with the connectors that
 * touch it, and `notes` says how many, in a whole sentence.
 */
export function boardExcalidraw(board: Board): { json: string; notes: string[] } {
  const elements: Json[] = [];
  const byId = new Map<string, Json>();
  const bind = (id: string, type: string, to: string) =>
    (byId.get(id)?.boundElements as Json[] | undefined)?.push({ type, id: to });
  let left = 0;
  for (const item of board.items) {
    const shape = shapeOf(elements.length, item);
    if (!shape) {
      left++;
      continue;
    }
    elements.push(shape);
    byId.set(item.id, shape);
    const said = saidIn(item);
    if (shape.type === 'text' || shape.type === 'frame' || !said) continue;
    elements.push(words(elements.length, `${item.id}-text`, said, itemBox(item), item.id));
    bind(item.id, 'text', `${item.id}-text`);
  }
  for (const c of board.connectors) {
    const [a, b] = [board.items.find((i) => i.id === c.from), board.items.find((i) => i.id === c.to)];
    if (!a || !b || !byId.has(a.id) || !byId.has(b.id)) continue;
    const [boxA, boxB] = [itemBox(a), itemBox(b)];
    const start = leaves(boxA, [boxB.x + boxB.w / 2, boxB.y + boxB.h / 2]);
    const end = leaves(boxB, [boxA.x + boxA.w / 2, boxA.y + boxA.h / 2]);
    const [dx, dy] = [end[0] - start[0], end[1] - start[1]];
    const id = `${c.from}-${c.to}`;
    const arrow = element(
      elements.length,
      id,
      'arrow',
      { x: start[0], y: start[1], w: Math.abs(dx), h: Math.abs(dy) },
      {
        points: [
          [0, 0],
          [dx, dy],
        ],
        startBinding: { elementId: a.id, focus: 0, gap: 4 },
        endBinding: { elementId: b.id, focus: 0, gap: 4 },
        startArrowhead: null,
        endArrowhead: 'arrow',
      },
    );
    elements.push(arrow);
    byId.set(id, arrow);
    bind(a.id, 'arrow', id);
    bind(b.id, 'arrow', id);
    if (!c.label) continue;
    const mid = { x: start[0] + dx / 2 - 60, y: start[1] + dy / 2 - 15, w: 120, h: 30 };
    elements.push(words(elements.length, `${id}-text`, c.label, mid, id));
    bind(id, 'text', `${id}-text`);
  }
  const drawing = {
    type: 'excalidraw',
    version: 2,
    source: 'https://thoughtknot.app',
    elements,
    appState: {},
    files: {},
  };
  return {
    json: JSON.stringify(drawing, null, 2),
    notes: left ? [word('reading.excalidraw.out-skipped', { count: left })] : [],
  };
}

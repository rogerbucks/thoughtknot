// A board read from and written as JSON Canvas, the open format of Obsidian Canvas (editor spec ES§45,
// board_exchange). Our own reader and writer in plain JavaScript: no library, no WebAssembly and no network.
// - Reading: a text node is a card, its first line the title. A group is a frame. A file is a card with the file
//   attached, or an image. A link is a card with the link. An edge is a connector.
// - Writing: every item with words is a text node, a frame is a group, and a connector is an edge.
// - Untrusted: the size, the count and each text are checked, and a file that is no canvas is refused.
// - Loss stated: a canvas holds no view of a graph, hand drawing, vote, comment, lock or link to a thing. A board
//   holds no colour of its own, background picture, edge side or edge colour. What is left out is said in a sentence.
import type { Board, BoardItem, Connector } from './board.ts';
import { itemBox } from './board-svg.ts';
import { STYLE_HUES } from './style-graph.ts';
import { word } from './words.ts';

/** Why a canvas was not read, as a sentence. */
export interface CanvasRefusal {
  why: 'not-canvas' | 'too-large' | 'too-many' | 'text-too-long';
  refused: string;
}

/** A board read from a canvas, and a sentence for each kind of thing that was left out. */
export interface CanvasRead {
  board: Board;
  notes: string[];
}

/** The most a canvas may hold before it is refused: its characters, its nodes, and the characters of one text. */
export const CANVAS_LIMITS = { chars: 16 * 1024 * 1024, items: 20_000, text: 100_000 };

// the six preset colours of a canvas, by number, as the hues of the locked style
const PRESETS = ['red', 'orange', 'yellow', 'green', 'cyan', 'purple'];
const IMAGE = /\.(png|jpe?g|gif|svg|webp|bmp|avif)$/i;

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const whole = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : undefined;

/** A name the board block can hold, made from a canvas id: a name starting with a digit gets `n_` before it. */
function nameOf(id: string): string {
  const plain = id.replace(/[^A-Za-z0-9_]/g, '_');
  return /^[A-Za-z_]/.test(plain) ? plain : `n_${plain}`;
}

/** The canvas id a board name is written as: the `n_` put before a digit is taken off again. */
const idOf = (name: string): string => (/^n_\d/.test(name) ? name.slice(2) : name);

/** A file's name with no folder and no ending, as the title of its card. */
const titleOf = (file: string): string => (file.split('/').pop() ?? file).replace(/\.[^.]+$/, '');

/** The host of a link, as the title of its card; the link itself when it has no host. */
function hostOf(url: string): string {
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url);
  return m?.[1] ?? url;
}

/** What one kind of node gives its item, or null for a type or a text that cannot be read. */
function kindOf(node: Json): Pick<BoardItem, 'kind' | 'text' | 'more'> | null {
  if (node.type === 'group') return { kind: 'Frame', text: text(node.label), more: {} };
  if (node.type === 'text') {
    const [title, ...rest] = (text(node.text) ?? '').split('\n');
    return { kind: 'Card', text: title, more: rest.length ? { body: rest.join('\n') } : {} };
  }
  const file = text(node.file);
  if (node.type === 'file' && file) {
    if (IMAGE.test(file)) return { kind: 'Image', more: { src: file, alt: titleOf(file) } };
    return { kind: 'Card', text: titleOf(file), more: { attachments: file + (text(node.subpath) ?? '') } };
  }
  const url = text(node.url);
  if (node.type === 'link' && url) return { kind: 'Card', text: hostOf(url), more: { links: url } };
  return null;
}

/** Thrown when a text is over its limit; turned into a refusal at the edge. */
class TextTooLong extends Error {}

/** The items of the nodes, the board name of each canvas id, and how many nodes were left out. */
function itemsOf(nodes: unknown[], limits: typeof CANVAS_LIMITS) {
  const names = new Map<string, string>();
  const items: BoardItem[] = [];
  let [skipped, look] = [0, false];
  for (const node of nodes) {
    const id = isObject(node) ? text(node.id) : undefined;
    const [x, y] = isObject(node) ? [whole(node.x), whole(node.y)] : [];
    const kind = isObject(node) ? kindOf(node) : null;
    if (!isObject(node) || !id || names.has(id) || x === undefined || y === undefined || !kind) {
      skipped++;
      continue;
    }
    if ((kind.text ?? '').length + (text(kind.more.body) ?? '').length > limits.text) throw new TextTooLong();
    let name = nameOf(id);
    for (let n = 2; [...names.values()].includes(name); n++) name = `${nameOf(id)}_${n}`;
    names.set(id, name);
    const item: BoardItem = { id: name, kind: kind.kind, x, y, more: kind.more };
    const [w, h] = [whole(node.width), whole(node.height)];
    if (w !== undefined && w > 0) item.w = w;
    if (h !== undefined && h > 0) item.h = h;
    if (kind.text) item.text = kind.text;
    const hue = PRESETS[Number(text(node.color)) - 1];
    if (hue && STYLE_HUES.includes(hue)) item.style = hue;
    else if (node.color !== undefined) look = true;
    if (node.background !== undefined) look = true;
    items.push(item);
  }
  return { items, names, skipped, look };
}

/** The connectors of the edges, and how many edges were left out. An edge with its arrow at the start is turned. */
function connectorsOf(edges: unknown[], names: Map<string, string>) {
  const connectors: Connector[] = [];
  const seen = new Set<string>();
  let [skipped, look] = [0, false];
  for (const edge of edges) {
    const a = isObject(edge) ? names.get(text(edge.fromNode) ?? '') : undefined;
    const b = isObject(edge) ? names.get(text(edge.toNode) ?? '') : undefined;
    if (!isObject(edge) || !a || !b || a === b) {
      skipped++;
      continue;
    }
    const turned = edge.fromEnd === 'arrow' && edge.toEnd === 'none';
    const [from, to] = turned ? [b, a] : [a, b];
    if (seen.has(`${from} ${to}`)) {
      skipped++;
      continue;
    }
    seen.add(`${from} ${to}`);
    const label = text(edge.label);
    connectors.push(label === undefined ? { from, to } : { from, to, label });
    if (edge.color !== undefined) look = true;
  }
  return { connectors, skipped, look };
}

/**
 * The board a JSON Canvas file holds, named `name`, or why it was refused. It is a free board: its items link to no
 * graph. A node or an edge that cannot be read is left out, and `notes` says how many, in whole sentences.
 */
export function canvasBoard(json: string, name: string, limits = CANVAS_LIMITS): CanvasRead | CanvasRefusal {
  const refuse = (why: CanvasRefusal['why'], most = 0): CanvasRefusal => ({
    why,
    refused: word(`reading.canvas.${why}`, { most }),
  });
  if (json.length > limits.chars) return refuse('too-large', limits.chars);
  let canvas: unknown;
  try {
    canvas = JSON.parse(json);
  } catch {
    return refuse('not-canvas');
  }
  if (!isObject(canvas)) return refuse('not-canvas');
  const { nodes = [], edges = [] } = canvas;
  if (!Array.isArray(nodes) || !Array.isArray(edges)) return refuse('not-canvas');
  if (nodes.length > limits.items || edges.length > limits.items * 4) return refuse('too-many', limits.items);
  try {
    const read = itemsOf(nodes, limits);
    const joined = connectorsOf(edges, read.names);
    const notes: string[] = [];
    if (read.skipped) notes.push(word('reading.canvas.skipped-items', { count: read.skipped }));
    if (joined.skipped) notes.push(word('reading.canvas.skipped-lines', { count: joined.skipped }));
    if (read.look || joined.look) notes.push(word('reading.canvas.look'));
    return { board: { name, on: null, items: read.items, connectors: joined.connectors }, notes };
  } catch (e) {
    if (e instanceof TextTooLong) return refuse('text-too-long', limits.text);
    throw e;
  }
}

/** The one thing a card holds besides its title, when it holds just one: a file or a link. */
function soleOf(item: BoardItem, key: 'attachments' | 'links'): string | undefined {
  const other = key === 'links' ? 'attachments' : 'links';
  const v = item.more[key];
  const alone = item.more.body === undefined && item.more[other] === undefined;
  return alone && typeof v === 'string' && !v.includes(';') ? v : undefined;
}

/** A card's words as the Markdown of a text node: its title, its body, then what is attached and linked. */
function cardText(item: BoardItem): string {
  const list = (key: string) => {
    const v = item.more[key];
    return typeof v === 'string' ? v.split(';').flatMap((x) => (x.trim() ? [x.trim()] : [])) : [];
  };
  const body = item.more.body;
  const head = (item.text ?? '') + (typeof body === 'string' ? `\n${body}` : '');
  const tail = [...list('attachments').map((a) => `![[${a}]]`), ...list('links')];
  return tail.length ? `${head}\n\n${tail.join('\n')}` : head;
}

/** What one item is as a node, besides its place; null for an item a canvas cannot hold. */
function nodeOf(item: BoardItem): Json | null {
  if (item.kind === 'View' || item.kind === 'Ink') return null;
  if (item.kind === 'Frame') return item.text === undefined ? { type: 'group' } : { type: 'group', label: item.text };
  const src = text(item.more.src);
  if (item.kind === 'Image' && src)
    return /^https?:/i.test(src) ? { type: 'link', url: src } : { type: 'file', file: src };
  if (item.kind === 'Card') {
    const file = soleOf(item, 'attachments');
    if (file && titleOf(file.split('#')[0] ?? file) === item.text) {
      const at = file.indexOf('#');
      return at < 0 ? { type: 'file', file } : { type: 'file', file: file.slice(0, at), subpath: file.slice(at) };
    }
    const url = soleOf(item, 'links');
    if (url && hostOf(url) === item.text) return { type: 'link', url };
    return { type: 'text', text: cardText(item) };
  }
  return { type: 'text', text: item.text ?? text(item.more.glyph) ?? '' };
}

/**
 * The board written as a JSON Canvas file, as Obsidian writes one. An item a canvas cannot hold is left out with the
 * connectors that touch it, and `notes` says how many, in a whole sentence.
 */
export function boardCanvas(board: Board): { json: string; notes: string[] } {
  const held = new Set<string>();
  const nodes: Json[] = [];
  for (const item of board.items) {
    const node = nodeOf(item);
    if (!node) continue;
    held.add(item.id);
    const box = itemBox(item);
    const hue = PRESETS.indexOf(item.style ?? '');
    nodes.push({
      id: idOf(item.id),
      ...node,
      x: box.x,
      y: box.y,
      width: box.w,
      height: box.h,
      ...(hue < 0 ? {} : { color: String(hue + 1) }),
    });
  }
  const edges = board.connectors
    .filter((c) => held.has(c.from) && held.has(c.to))
    .map((c) => {
      const [fromNode, toNode] = [idOf(c.from), idOf(c.to)];
      return { id: `${fromNode}-${toNode}`, fromNode, toNode, ...(c.label === undefined ? {} : { label: c.label }) };
    });
  const left = board.items.length - nodes.length;
  return {
    json: JSON.stringify({ nodes, edges }, null, '\t'),
    notes: left ? [word('reading.canvas.out-skipped', { count: left })] : [],
  };
}

// A GraphML file read back into things and links (editor spec §67, format_loss_stated, export_lossless;
// format_untrusted_files). It reads what export-data-graphml.ts writes, and GraphML other tools write.
// - In plain JavaScript (xml-scan.ts): no library. A document type is refused, and only XML's own entities are put
//   back, so a file can never expand past its size. Nothing in it is run or fetched.
// - A node is a thing: its id from the key `:id` (else the node's own id), its kinds from `:labels`. An edge is a link,
//   its type from `:type` (else LINKS_TO). Each other key is a property, typed by its attr.type. A key whose
//   description says `gn:date` or `gn:datetime` is a day or an instant. So a file ThoughtKnot wrote reads back into
//   the very graph it was written from.
// - What it cannot keep is listed, never dropped unsaid: notes kept as comments, and a view's fading. Drawing data
//   such as positions, links that go both ways, nested graphs, hyperedges and ports, and a second graph are too.
// Host-free and pure.
import gs from '@thoughtknot/graph-spec';
import type { Value } from '@thoughtknot/graph-spec';
import type { DataLink, DataThing } from './export-data-model.ts';
import { READ_LIMITS } from './layout-limits.ts';
import { tokens } from './xml-scan.ts';
import type { Tok } from './xml-scan.ts';
import { word } from './words.ts';

/** The most a GraphML file is read to: the bytes a note's graph may hold, and its nodes and edges together. */
export const GRAPHML_LIMITS = { bytes: READ_LIMITS.bytes, items: 50_000 };

/** A GraphML file read: its graph's name, its things and links, the line each came from, and what it left out. */
export interface GraphmlRead {
  graph: string;
  things: DataThing[];
  links: DataLink[];
  /** The line (1-based) each thing's node, then each link's edge, starts on. */
  thingLines: number[];
  linkLines: number[];
  /** What the file held that the graph cannot keep, in words, each said once. */
  dropped: string[];
}

/** A GraphML file that cannot be read, and why. */
export interface GraphmlRefusal {
  why: 'not-graphml' | 'damaged' | 'too-large';
  refused: string;
}

/** A key a file declares: the property it names, and the kind of value it holds. */
interface Key {
  name: string;
  type: string;
  desc: string;
  for: string;
}

/** The keys ThoughtKnot writes for a thing's id, its kinds, a link's type and the fading, by their names. */
const OWN = new Set([':id', ':labels', ':type', ':faded']);
/** A property name GQL reads as one. */
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** A data element's text as the value its key says it is, or undefined when it reads as none. */
function valueOf(text: string, key: Key): Value | undefined {
  const t = key.type.toLowerCase();
  // an instant is written in UTC with its Z, which the profile's own value leaves out (export-data-model.ts)
  if (key.desc === 'gn:date') return new gs.GTime('date', text.trim());
  if (key.desc === 'gn:datetime') return new gs.GTime('datetime', text.trim().replace(/Z$/, ''));
  if (t === 'boolean') return text.trim() === 'true';
  if (t === 'double' || t === 'float' || t === 'int' || t === 'long') {
    if (!text.trim()) return undefined;
    const n = text.trim() === '-0' ? -0 : Number(text.trim());
    return Number.isFinite(n) ? n : undefined;
  }
  return text;
}

/** The line (1-based) that the character at `at` is on. */
function lineOf(text: string, at: number, from: { at: number; line: number }): number {
  for (let i = from.at; i < at; i++) if (text.charCodeAt(i) === 10) from.line++;
  from.at = Math.max(from.at, at);
  return from.line;
}

/** A node or an edge being read: its attributes, its data by key, and the line it starts on. */
interface Item {
  kind: 'node' | 'edge';
  attrs: Record<string, string>;
  data: Map<string, string>;
  line: number;
}

/** Where a read has got to, as it goes through the file's tokens. */
interface ReadState {
  text: string;
  keys: Map<string, Key>;
  out: GraphmlRead;
  lost: Set<string>;
  ids: Map<string, string>;
  edges: { source: string; target: string; type: string; props: Record<string, Value>; line: number }[];
  pos: { at: number; line: number };
  seenRoot: boolean;
  graphs: number;
  depth: number;
  key: Key | null;
  item: Item | null;
  datum: { key: string; text: string } | null;
  inDesc: boolean;
}

/** A node or an edge read whole: its own keys, then each property its keys type. */
function finish(st: ReadState, it: Item): void {
  const props: Record<string, Value> = {};
  let id = it.attrs['id'] ?? '',
    kinds: string[] = [],
    type = 'LINKS_TO';
  for (const [k, raw] of it.data) {
    const declared = st.keys.get(k);
    const name = declared?.name ?? '';
    if (k === 'faded' || name === ':faded') {
      if (raw.trim() === 'true') st.lost.add(word('reading.graphml.lost-faded'));
    } else if (name === ':id') id = raw;
    else if (name === ':labels') kinds = raw.split(';').filter(Boolean);
    else if (name === ':type') type = raw.trim() || type;
    else if (!declared || !NAME.test(name) || OWN.has(name)) st.lost.add(word('reading.graphml.lost-drawing'));
    else {
      const v = valueOf(raw, declared);
      if (v !== undefined) props[name] = v;
    }
  }
  if (it.kind === 'node') {
    st.ids.set(it.attrs['id'] ?? '', id);
    st.out.things.push([id, kinds, props]);
    st.out.thingLines.push(it.line);
  } else {
    if (it.attrs['directed'] === 'false') st.lost.add(word('reading.graphml.lost-undirected'));
    st.edges.push({ source: it.attrs['source'] ?? '', target: it.attrs['target'] ?? '', type, props, line: it.line });
  }
}

/** A tag closing: the end of a graph, a key, a description, a datum, a node or an edge. */
function onClose(st: ReadState, name: string): void {
  if (name === 'graph') st.depth--;
  if (name === 'key') st.key = null;
  if (name === 'desc') st.inDesc = false;
  if (name === 'data' && st.datum && st.item) {
    st.item.data.set(st.datum.key, st.datum.text);
    st.datum = null;
  }
  if ((name === 'node' || name === 'edge') && st.item && st.depth === 1) {
    finish(st, st.item);
    st.item = null;
  }
}

/** A tag opening. False when the file holds more nodes and edges than the limit. */
function onOpen(st: ReadState, t: { open: string; attrs: Record<string, string>; at?: number }): boolean {
  if (t.open === 'graphml') st.seenRoot = true;
  else if (t.open === 'key') {
    const a = t.attrs;
    st.key = { name: a['attr.name'] ?? '', type: a['attr.type'] ?? 'string', desc: '', for: a['for'] ?? 'all' };
    st.keys.set(a['id'] ?? '', st.key);
  } else if (t.open === 'desc') st.inDesc = true;
  else if (t.open === 'graph') {
    st.depth++;
    if (st.depth > 1) st.lost.add(word('reading.graphml.lost-nested'));
    else if (++st.graphs > 1) st.lost.add(word('reading.graphml.lost-graphs'));
    else {
      st.out.graph = t.attrs['id'] ?? '';
      if (t.attrs['edgedefault'] === 'undirected') st.lost.add(word('reading.graphml.lost-undirected'));
    }
  } else if ((t.open === 'node' || t.open === 'edge') && st.depth === 1 && st.graphs === 1) {
    if (st.out.things.length + st.edges.length >= GRAPHML_LIMITS.items) return false;
    st.item = { kind: t.open, attrs: t.attrs, data: new Map(), line: lineOf(st.text, t.at ?? 0, st.pos) };
  } else if (t.open === 'data' && st.item) st.datum = { key: t.attrs['key'] ?? '', text: '' };
  else if (t.open === 'hyperedge' || t.open === 'port') st.lost.add(word('reading.graphml.lost-hyper'));
  return true;
}

/** Each edge as a link between the things its nodes became; one to a node the file lacks is said, not drawn. */
function joinEdges(st: ReadState): void {
  for (const e of st.edges) {
    const from = st.ids.get(e.source),
      to = st.ids.get(e.target);
    if (from === undefined || to === undefined) {
      st.lost.add(word('reading.graphml.lost-edges'));
      continue;
    }
    st.out.links.push([from, e.type, to, e.props]);
    st.out.linkLines.push(e.line);
  }
}

/** The GraphML file at `place` read as things and links, saying what it left out; or why it cannot be read. */
export function readGraphml(place: string, text: string): GraphmlRead | GraphmlRefusal {
  if (text.length > GRAPHML_LIMITS.bytes)
    return { why: 'too-large', refused: word('reading.graphml.too-large', { place }) };
  const st: ReadState = {
    text,
    keys: new Map(),
    out: { graph: '', things: [], links: [], thingLines: [], linkLines: [], dropped: [] },
    lost: new Set(),
    ids: new Map(),
    edges: [],
    pos: { at: 0, line: 1 },
    seenRoot: false,
    graphs: 0,
    depth: 0,
    key: null,
    item: null,
    datum: null,
    inDesc: false,
  };
  try {
    for (const t of tokens(text) as Iterable<Tok>) {
      if ('text' in t) {
        if (st.datum) st.datum.text += t.text;
        else if (st.inDesc && st.key) st.key.desc += t.text.trim();
      } else if ('close' in t) onClose(st, t.close);
      else if (!onOpen(st, t))
        return {
          why: 'too-large',
          refused: word('reading.graphml.too-many', { place, most: String(GRAPHML_LIMITS.items) }),
        };
    }
  } catch {
    return { why: 'damaged', refused: word('reading.graphml.damaged', { place }) };
  }
  if (!st.seenRoot) return { why: 'not-graphml', refused: word('reading.graphml.not-graphml', { place }) };
  if (/<!--/.test(text)) st.lost.add(word('reading.graphml.lost-notes'));
  joinEdges(st);
  st.out.dropped = [...st.lost];
  return st.out;
}

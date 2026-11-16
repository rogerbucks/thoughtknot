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

/** The GraphML file at `place` read as things and links, saying what it left out; or why it cannot be read. */
export function readGraphml(place: string, text: string): GraphmlRead | GraphmlRefusal {
  if (text.length > GRAPHML_LIMITS.bytes)
    return { why: 'too-large', refused: word('reading.graphml.too-large', { place }) };
  const keys = new Map<string, Key>();
  const out: GraphmlRead = { graph: '', things: [], links: [], thingLines: [], linkLines: [], dropped: [] };
  const lost = new Set<string>();
  const ids = new Map<string, string>();
  const edges: { source: string; target: string; type: string; props: Record<string, Value>; line: number }[] = [];
  const pos = { at: 0, line: 1 };
  let seenRoot = false,
    graphs = 0,
    depth = 0;
  let key: Key | null = null;
  let item: { kind: 'node' | 'edge'; attrs: Record<string, string>; data: Map<string, string>; line: number } | null =
    null;
  let datum: { key: string; text: string } | null = null;
  let inDesc = false;
  try {
    for (const t of tokens(text) as Iterable<Tok>) {
      if ('text' in t) {
        if (datum) datum.text += t.text;
        else if (inDesc && key) key.desc += t.text.trim();
        continue;
      }
      if ('close' in t) {
        if (t.close === 'graph') depth--;
        if (t.close === 'key') key = null;
        if (t.close === 'desc') inDesc = false;
        if (t.close === 'data' && datum && item) {
          item.data.set(datum.key, datum.text);
          datum = null;
        }
        if ((t.close === 'node' || t.close === 'edge') && item && depth === 1) {
          finish(item);
          item = null;
        }
        continue;
      }
      if (t.open === 'graphml') seenRoot = true;
      else if (t.open === 'key') {
        key = {
          name: t.attrs['attr.name'] ?? '',
          type: t.attrs['attr.type'] ?? 'string',
          desc: '',
          for: t.attrs['for'] ?? 'all',
        };
        keys.set(t.attrs['id'] ?? '', key);
      } else if (t.open === 'desc') inDesc = true;
      else if (t.open === 'graph') {
        depth++;
        if (depth > 1) lost.add(word('reading.graphml.lost-nested'));
        else if (++graphs > 1) lost.add(word('reading.graphml.lost-graphs'));
        else {
          out.graph = t.attrs['id'] ?? '';
          if (t.attrs['edgedefault'] === 'undirected') lost.add(word('reading.graphml.lost-undirected'));
        }
      } else if ((t.open === 'node' || t.open === 'edge') && depth === 1 && graphs === 1) {
        if (out.things.length + edges.length >= GRAPHML_LIMITS.items)
          return {
            why: 'too-large',
            refused: word('reading.graphml.too-many', { place, most: String(GRAPHML_LIMITS.items) }),
          };
        item = { kind: t.open, attrs: t.attrs, data: new Map(), line: lineOf(text, t.at ?? 0, pos) };
      } else if (t.open === 'data' && item) datum = { key: t.attrs['key'] ?? '', text: '' };
      else if (t.open === 'hyperedge' || t.open === 'port') lost.add(word('reading.graphml.lost-hyper'));
    }
  } catch {
    return { why: 'damaged', refused: word('reading.graphml.damaged', { place }) };
  }
  if (!seenRoot) return { why: 'not-graphml', refused: word('reading.graphml.not-graphml', { place }) };
  if (/<!--/.test(text)) lost.add(word('reading.graphml.lost-notes'));
  for (const e of edges) {
    const from = ids.get(e.source),
      to = ids.get(e.target);
    if (from === undefined || to === undefined) {
      lost.add(word('reading.graphml.lost-edges'));
      continue;
    }
    out.links.push([from, e.type, to, e.props]);
    out.linkLines.push(e.line);
  }
  out.dropped = [...lost];
  return out;

  /** A node or an edge read whole: its own keys, then each property its keys type. */
  function finish(it: NonNullable<typeof item>): void {
    const props: Record<string, Value> = {};
    let id = it.attrs['id'] ?? '',
      kinds: string[] = [],
      type = 'LINKS_TO';
    for (const [k, raw] of it.data) {
      const declared = keys.get(k);
      const name = declared?.name ?? '';
      if (k === 'faded' || name === ':faded') {
        if (raw.trim() === 'true') lost.add(word('reading.graphml.lost-faded'));
      } else if (name === ':id') id = raw;
      else if (name === ':labels') kinds = raw.split(';').filter(Boolean);
      else if (name === ':type') type = raw.trim() || type;
      else if (!declared || !NAME.test(name) || OWN.has(name)) lost.add(word('reading.graphml.lost-drawing'));
      else {
        const v = valueOf(raw, declared);
        if (v !== undefined) props[name] = v;
      }
    }
    if (it.kind === 'node') {
      ids.set(it.attrs['id'] ?? '', id);
      out.things.push([id, kinds, props]);
      out.thingLines.push(it.line);
    } else {
      if (it.attrs['directed'] === 'false') lost.add(word('reading.graphml.lost-undirected'));
      edges.push({ source: it.attrs['source'] ?? '', target: it.attrs['target'] ?? '', type, props, line: it.line });
    }
  }
}

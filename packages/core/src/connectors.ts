// Connectors: one graph from many places (editor spec §63, CN1). A FROM list names several places, such as
// `// graph: team · FROM Graphs/people.gql, [[Team]], sample:trip`. Each is read where it is written and never copied.
// - One contract (connector_contract). A connector is given a place and what the host fetched there. It gives the
//   place's version, a hash of its text, and its GQL statements, each citing the place, the version and the line. The
//   .gql file, note and plug-in places share one connector today. A new kind of place adds a connector, never a join.
// - Joined by the mesh (connector_joined_by_mesh). The places are documents of the §21 join, so two that disagree on a
//   value hold it as a contested claim. The same name in two contexts stays two things unless a SAME_AS link to a Ref
//   joins them (context_names_apart).
// - Order-free (connector_order_free). The places are joined in the order of their names, never as listed.
// - Cited (connector_cites_source). Every thing and link drawn carries `cited_from`: each place, line and version it
//   was read from. So the details panel and an AI query show where each came from.
// - A missing place (connector_source_missing). The others still draw, and the drawing names the missing place and why.
import gs from '@thoughtknot/graph-spec';
import type { Graph, Value } from '@thoughtknot/graph-spec';
import { sha256 } from './ai-digest.ts';
import { blockItems } from './block-items.ts';
import { graphOfBlock } from './blocks.ts';
import { readNote } from './drawing.ts';
import { gqlBlock } from './export-data-gql.ts';
import type { DataLink, DataThing } from './export-data-model.ts';
import type { Problem } from './note-reading.ts';
import { lineInSource, placeKey, readSource } from './sources.ts';
import type { Fetched, Source, SourceRead, SourceRefusal } from './sources.ts';
import { word } from './words.ts';

/** Where a statement was read: the place, the hash of its text, and the line (1-based) in it. */
export interface Citation {
  place: string;
  version: string;
  line: number;
}

/** One GQL statement a place breaks into, with where it was read. */
export interface Statement {
  text: string;
  cite: Citation;
}

/** A place read by its connector: its version, its statements, and the reading they came from. */
export interface Connected {
  source: Source;
  place: string;
  version: string;
  statements: Statement[];
  read: SourceRead;
}

/** The one contract every connector meets: given a place and what was fetched there, its statements or why not. */
export interface Connector {
  /** The kinds of place it reads. */
  kinds: readonly Source['kind'][];
  connect(source: Source, fetched: Fetched, shared?: string[]): Connected | SourceRefusal;
}

/** The first 12 hex digits of a version, as a citation is shown. */
const short = (version: string) => version.slice(0, 12);

/** A statement's text without the INSERT that may open it, and the lines that keyword took. */
function bare(text: string): { text: string; skipped: number } {
  const m = /^INSERT\s*/i.exec(text);
  return m ? { text: text.slice(m[0].length), skipped: m[0].split('\n').length - 1 } : { text, skipped: 0 };
}

/**
 * The connector for places written in GQL: a .gql file, a note's gql blocks, and a plug-in's source, which gives its
 * graph as GQL text. Each place is read as a note's own blocks are (readSource), then broken into its statements.
 */
export const gqlConnector: Connector = {
  kinds: ['file', 'note', 'plugin'],
  connect(source, fetched, shared = []) {
    const read = readSource(source, fetched, shared);
    if ('refused' in read) return read;
    const place = placeKey(source);
    if (read.reading.tooLarge || !('text' in fetched))
      return {
        source,
        why: 'unreadable',
        refused: word('reading.source.place-too-large', { place, graph: source.graph }),
      };
    const version = sha256(fetched.text);
    const statements = read.texts.flatMap((text, block) =>
      graphOfBlock(text) === source.graph
        ? blockItems(text).map((item) => {
            const { text: t, skipped } = bare(item.text);
            return { text: t, cite: { place, version, line: (read.lines[block] ?? 0) + item.line + skipped + 1 } };
          })
        : [],
    );
    return { source, place, version, statements, read };
  },
};

/** Every connector, by the kinds of place it reads. */
export const CONNECTORS: readonly Connector[] = [gqlConnector];

/** The connector that reads this kind of place. */
export const connectorFor = (kind: Source['kind']): Connector | undefined =>
  CONNECTORS.find((c) => c.kinds.includes(kind));

/** A place connected by its own connector, or why it cannot be. */
export function connect(source: Source, fetched: Fetched, shared: string[] = []): Connected | SourceRefusal {
  const connector = connectorFor(source.kind);
  if (connector) return connector.connect(source, fetched, shared);
  return { source, why: 'unreadable', refused: word('reading.source.no-connector', { place: placeKey(source) }) };
}

/** The places a graph was drawn from, joined: a source read as one, with what each place gave and what was missing. */
export interface JoinedRead extends SourceRead {
  /** The places read, in the order they were joined: by name. */
  places: Connected[];
  /** The places that could not be read, each with the sentence that names it and says why. */
  missing: SourceRefusal[];
  /** Where each thing and link was read: by a thing's id, or a link's `from-[:TYPE]->to`. */
  cites: Map<string, Citation[]>;
  /** The values the places disagree on: a thing's id, the property, and each value with the place that gives it. */
  contested: { thing: string; key: string; values: { value: string; place: string }[] }[];
  /** Each place's own problems, at the place and its line. */
  placeProblems: (Problem & { place: string; placeLine: number })[];
}

/** How to join: the context each place is in, so the same name in two contexts stays two (context_names_apart). */
export interface JoinOptions {
  contextOf?: (source: Source) => string;
  shared?: string[];
}

/** A place's name as a document id the join reads: one word of letters, digits and `_./-`. */
const docId = (place: string) => `doc:${place.replace(/[^A-Za-z0-9_./-]/g, '_')}`;
/** A context's name as part of a thing's id. */
const ctxWord = (ctx: string) => ctx.replace(/[^A-Za-z0-9_]/g, '_');

/** Whether a statement writes this thing, rather than only naming it: `(id:Kind` or `(id {`. */
const writes = (text: string, id: string) => new RegExp(`\\(\\s*${id}\\s*[:{]`).test(text);
const names = (text: string, id: string) => new RegExp(`\\(\\s*${id}\\s*[:{)]`).test(text);

/** The statement each thing and link of a place was read from. */
function citesOf(c: Connected, g: Graph): Map<string, Citation> {
  const out = new Map<string, Citation>();
  for (const id of g.nodes.keys()) {
    const s = c.statements.find((x) => writes(x.text, id)) ?? c.statements.find((x) => names(x.text, id));
    if (s) out.set(id, s.cite);
  }
  for (const [from, type, to] of g.edges) {
    const s = c.statements.find((x) => x.text.includes(`:${type}`) && names(x.text, from) && names(x.text, to));
    if (s) out.set(`${from}-[:${type}]->${to}`, s.cite);
  }
  return out;
}

/**
 * The ids each place's things are joined under. Inside one context a name is one thing. A name held in two contexts
 * stays two, each named with its context. A SAME_AS link to a Ref (`ref`, `context`) makes them one.
 */
function idsOf(places: { c: Connected; g: Graph; ctx: string }[]): Map<string, string> {
  const at = (ctx: string, id: string) => `${ctx}\u0000${id}`;
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    while (parent.has(x) && parent.get(x) !== x) x = parent.get(x) ?? x;
    return x;
  };
  const contexts = new Map<string, Set<string>>();
  for (const { g, ctx } of places)
    for (const [id, [labels]] of g.nodes)
      if (!labels.has('Ref')) (contexts.get(id) ?? contexts.set(id, new Set()).get(id))?.add(ctx);
  for (const { g, ctx } of places)
    for (const [from, type, to] of g.edges) {
      const ref = g.nodes.get(to);
      if (type !== 'SAME_AS' || !ref?.[0].has('Ref')) continue;
      const [context, name] = [ref[1]['context'], ref[1]['ref']];
      if (typeof name !== 'string') continue;
      const other = at(typeof context === 'string' ? context : ctx, name);
      const [a, b] = [find(at(ctx, from)), find(other)].sort();
      if (a && b && a !== b) parent.set(b, a);
    }
  // a name is kept as it is when every thing that holds it is one: in one context, or made one by SAME_AS
  const roots = new Map<string, Set<string>>();
  for (const [id, ctxs] of contexts)
    for (const ctx of ctxs) (roots.get(id) ?? roots.set(id, new Set()).get(id))?.add(find(at(ctx, id)));
  const out = new Map<string, string>();
  for (const { g, ctx } of places)
    for (const id of g.nodes.keys()) {
      const root = find(at(ctx, id));
      const [rctx = ctx, rid = id] = root.split('\u0000');
      const apart = (roots.get(rid)?.size ?? 0) > 1;
      out.set(at(ctx, id), apart ? `${rid}__${ctxWord(rctx)}` : rid);
    }
  return out;
}

/**
 * The places of a FROM list joined into one graph, as the mesh joins documents (§21). The places are joined in the
 * order of their names, so the order they are listed in never changes the graph. A place that could not be read is
 * listed in `missing`, and the rest are drawn.
 */
export function joinPlaces(
  graph: string,
  reads: readonly (Connected | SourceRefusal)[],
  options: JoinOptions = {},
): JoinedRead | SourceRefusal {
  const missing = reads
    .filter((r): r is SourceRefusal => 'refused' in r)
    .sort((a, b) => (placeKey(a.source) < placeKey(b.source) ? -1 : 1));
  const connected = reads
    .filter((r): r is Connected => !('refused' in r))
    .sort((a, b) => (a.place < b.place ? -1 : a.place > b.place ? 1 : 0));
  const [first] = connected;
  if (!first) return missing[0] ?? { source: reads[0]?.source as Source, why: 'missing', refused: '' };
  const places = connected.map((c) => ({
    c,
    g: c.read.reading.world[graph] ?? new gs.Graph(new Map(), []),
    ctx: options.contextOf?.(c.source) ?? '',
  }));
  const ids = idsOf(places);
  const idOf = (ctx: string, id: string) => ids.get(`${ctx}\u0000${id}`) ?? id;
  const byDoc = new Map<string, string>();
  const cites = new Map<string, Citation[]>();
  const docs = places.map(({ c, g, ctx }) => {
    const doc = docId(c.place);
    byDoc.set(doc.slice(4), c.place);
    const kept = (id: string) => !g.nodes.get(id)?.[0].has('Ref');
    const things: DataThing[] = [...g.nodes]
      .filter(([id]) => kept(id))
      .map(([id, [labels, props]]) => [idOf(ctx, id), [...labels], { ...props, id: idOf(ctx, id) }]);
    const links: DataLink[] = g.edges
      .filter(([from, , to]) => kept(from) && kept(to))
      .map(([from, type, to, props]) => [idOf(ctx, from), type, idOf(ctx, to), { ...props }]);
    for (const [key, cite] of citesOf(c, g)) {
      const at = key.includes('-[:')
        ? key.replace(
            /^([^-]+)-\[:([^\]]+)\]->(.+)$/,
            (_, f: string, t: string, d: string) => `${idOf(ctx, f)}-[:${t}]->${idOf(ctx, d)}`,
          )
        : idOf(ctx, key);
      (cites.get(at) ?? cites.set(at, []).get(at))?.push(cite);
    }
    const body = gqlBlock({ graph, things, links }, { note: '', date: '' }).split('\n').slice(2).join('\n');
    return `// graph: ${graph} · document ${doc} · schema ${graph} · as of 1970-01-01\n${body}`.replace(/\n$/, '');
  });
  const joined = gs.joinDocs({ docs, config: {} });
  const contested: JoinedRead['contested'] = [];
  for (const [claim, [status]] of Object.entries(joined.claims)) {
    const m = /^claim:join\/([^/]+)\/([^=]+)=(.*)@([^@]+)$/.exec(claim);
    if (status !== 'contested' || !m) continue;
    const [, thing = '', key = '', value = '', from = ''] = m;
    let entry = contested.find((x) => x.thing === thing && x.key === key);
    if (!entry) contested.push((entry = { thing, key, values: [] }));
    for (const d of from.split('+')) entry.values.push({ value, place: byDoc.get(d) ?? d });
  }
  const said = (list: Citation[]) =>
    list
      .map((c) => word('reading.source.cited', { place: c.place, line: String(c.line), version: short(c.version) }))
      .join('; ');
  const things: DataThing[] = Object.entries(joined.nodes)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([id, [labels, props]]) => {
      const p: Record<string, Value> = { ...props };
      delete p['id'];
      const list = cites.get(id);
      if (list) p['cited_from'] = said(list);
      const disputed = contested.filter((x) => x.thing === id);
      if (disputed.length)
        p['contested'] = disputed
          .map((x) => `${x.key}: ${x.values.map((v) => `${v.value} (${v.place})`).join(', ')}`)
          .join('; ');
      return [id, labels, p];
    });
  const links: DataLink[] = Object.entries(joined.edges)
    .map(([key, props]) => {
      const [from, type, to] = JSON.parse(key) as [string, string, string];
      const p: Record<string, Value> = { ...props };
      const list = cites.get(`${from}-[:${type}]->${to}`);
      if (list) p['cited_from'] = said(list);
      return [from, type, to, p] as DataLink;
    })
    .sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  const text = gqlBlock({ graph, things, links }, { note: '', date: '' }).split('\n');
  const block = [`// graph: ${graph}`, ...text.slice(2)].join('\n').replace(/\n$/, '');
  const reading = readNote([block], 0, options.shared ?? []);
  const placeProblems = places.flatMap(({ c }) =>
    c.read.reading.problems
      .filter((p) => p.graph === graph)
      .map((p) => ({ ...p, place: c.place, placeLine: lineInSource(c.read, p) })),
  );
  return {
    source: first.source,
    from: connected.map((c) => c.place).join(', '),
    texts: [block],
    lines: [0],
    reading,
    places: connected,
    missing,
    cites,
    contested,
    placeProblems,
  };
}

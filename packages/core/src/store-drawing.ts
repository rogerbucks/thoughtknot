// A note too big to read at once, opened from the local store (editor spec §53, scale_in_parts; way E, step 7). The
// store reads the note in parts (note-parts.ts). Each graph comes back as the overview (massive-view.ts) draws it:
// its things' keys, kinds and texts, its links, and each thing's properties. Only these rows are held, never a
// reading of the note's text.
//
// The rows are refused when they were built from other text than the note has now, so a stale store is never drawn.
// The note is read a part at a time, with the page's own work done between parts.
//
// An edit is written to the note's text first, never to the store. The text stays the only store of the graph
// (text_is_the_store). Only the lines that wrote the thing are edited, so the note is never read whole. The host
// writes the new text to the note, and the store then reads the changed note again.
import gs from '@thoughtknot/graph-spec';
import { sha256 } from './ai-digest.ts';
import { gqlBlocks } from './fences.ts';
import { parseValue, setProperty } from './inspector.ts';
import type { Edit, PropType } from './inspector.ts';
import { dataTooLarge, noteRowsPaced } from './mesh-index-rows.ts';
import { PARTS_LIMITS } from './layout-limits.ts';
import type { Refusal } from './layout-limits.ts';
import type { BetweenRow, GroupRow, MeshIndex } from './mesh-index.ts';
import { partsStoreOf } from './parts-store.ts';
import type { PartsStore } from './parts-store.ts';
import { FacetColumns, codedFacet } from './facet-counts.ts';
import type { CodedFacet } from './facet-counts.ts';
import { PartsSource, nearFrom } from './parts-source.ts';
import { rowsKeptOrRead } from './parts-kept.ts';
import type { KeptPlace } from './parts-kept.ts';
import type { LinksNear } from './parts-source.ts';
import type { Grouping } from './scale-groups.ts';
import type { GraphDrawing, Problem } from './note-reading.ts';
import { styleOf } from './blocks.ts';
import { readStyle } from './style.ts';
import { emptyStyle } from './style-graph.ts';
import type { StyleGraph } from './style-graph.ts';
import { word } from './words.ts';

/** One graph of a note as the store gives it: a drawing to show as its overview, and each thing's properties. */
export interface StoredGraph {
  drawing: GraphDrawing;
  /** A thing's properties, read from the store with its group. */
  props: (key: string) => Promise<Readonly<Record<string, unknown>>>;
  /** Its things and links as the style checks read a graph: each thing by its kind, each link without properties. */
  world: () => Promise<gs.Graph>;
  /**
   * Read in parts: its groups as the store found them, and its links, read from the store as they are needed. The
   * drawing then holds its things but none of its links (scale_parts_overview).
   */
  parts: StoredParts;
}

/** A graph read in parts: its groups, each group's inside, and the links near some things, all from the store. */
export interface StoredParts {
  grouping: Grouping;
  /** A group's things and the links inside it, to lay out on its own; null once the store holds other text. */
  group: (id: string) => Promise<GraphDrawing | null>;
  near: LinksNear;
  /**
   * Its filters, each property's value by thing in the drawing's order, read from the store a group at a time. Held as
   * numbers, never as words per thing (scale_parts_overview).
   */
  facets: () => CodedFacet[];
}

/** A graph as the graph library's rules read one, from things (key, kind, properties) and links. */
function plainGraph(things: [string, string, Record<string, gs.Value>][], edges: gs.Edge[]): gs.Graph {
  const nodes = new Map(
    things.map(([key, kind, props]) => [key, [new Set([kind]), props] as [Set<string>, typeof props]]),
  );
  return {
    nodes,
    edges,
    labelled: (label) => [...nodes].filter(([, [labels]]) => labels.has(label)).map(([key]) => key),
    p: (id) => nodes.get(id)?.[1] ?? {},
    has: (id, label) => !!nodes.get(id)?.[0].has(label),
    out: (id, type) => edges.filter((e) => e[0] === id && (type === undefined || e[1] === type)),
    inc: (id, type) => edges.filter((e) => e[2] === id && (type === undefined || e[1] === type)),
  };
}

/** Why a note is too large to read even in parts, naming the limit it is over; null when it is not. */
export const partsRefusal = (text: string): Refusal | null => dataTooLarge(gqlBlocks(text), PARTS_LIMITS);

/**
 * The graphs of a note, from the store. The note is read into the store first, if the store does not hold this text.
 * A huge note is read a part at a time. Between parts it waits on `pause`, which the host gives, so the page keeps
 * answering (§9). With `kept`, the rows kept there for this text are used and the note is not read; a lasting store
 * needs no such copy. Empty when it is past what is read in parts, no graph of it could be read, or the note changed
 * while it was read.
 */
export async function storedGraphs(
  into: MeshIndex | PartsStore,
  note: string,
  text: string,
  pause: () => Promise<void>,
  kept?: KeptPlace,
): Promise<Map<string, StoredGraph>> {
  // past what the store reads in parts, nothing is read (scale_parts_budget): partsRefusal says why
  if (partsRefusal(text)) return new Map();
  const store = partsStoreOf(into),
    version = sha256(text);
  // rows kept from an earlier session for this text are used, so the note is not read again (scale_parts_kept)
  if ((await store.version(note)) !== version) {
    const place = store.lasting ? undefined : kept;
    await store.put(await rowsKeptOrRead(place, note, text, () => noteRowsPaced(note, text, pause)));
  }
  const out = new Map<string, StoredGraph>();
  if ((await store.version(note)) !== version) return out;
  const { groups, between } = await store.groups(note);
  const byGraph = new Map<string, string[]>();
  for (const g of groups) byGraph.set(g.graph, [...(byGraph.get(g.graph) ?? []), g.id]);
  const briefs = await store.briefs(note);
  for (const [graph, ids] of byGraph) {
    // only what the overview draws is held: each thing's properties stay in the store (scale_parts_find_filter)
    const things = briefs
      .filter((t) => t.graph === graph)
      .map((t) => ({ key: t.key, kind: t.kind, text: t.text, group: t.group }));
    const source = new PartsSource(store, note, graph, version);
    const props = propsInParts(store, note, graph, new Map(things.map((t) => [t.key, t.group])));
    const facets = await facetsInParts(store, note, graph, ids, things);
    out.set(graph, {
      drawing: nearFrom(
        {
          graph,
          boxes: things.map((t) => ({ key: t.key, kind: t.kind, text: t.text })),
          links: [],
          estimates: [],
        },
        source.near,
      ),
      parts: {
        grouping: groupingOf(
          groups.filter((g) => g.graph === graph),
          between,
          things,
        ),
        group: async (id) => {
          const part = await source.group(id);
          source.letGo(id); // the overview keeps the group's marks once laid out, never its rows
          return part;
        },
        near: source.near,
        facets: () => facets,
      },
      props,
      world: async () => {
        const rows = (await store.things(note, ids)).filter((t) => t.graph === graph);
        const links = (await store.links(note)).filter((l) => l.graph === graph);
        return plainGraph(
          rows.map((t) => [t.key, t.kind, JSON.parse(t.props) as Record<string, gs.Value>]),
          links.map((l) => [l.from, l.type, l.to, {}]),
        );
      },
    });
  }
  return out;
}

/**
 * A thing's properties, read from the store by its group. Only the rows of the group read last are held. So reading
 * every thing, a group after another, reads each group once (scale_parts_find_filter).
 */
function propsInParts(
  store: PartsStore,
  note: string,
  graph: string,
  groupOf: ReadonlyMap<string, string>,
): (key: string) => Promise<Readonly<Record<string, unknown>>> {
  let held: { group: string; rows: Promise<Map<string, string>> } | null = null;
  return async (key) => {
    const group = groupOf.get(key);
    if (group === undefined) return {};
    if (held?.group !== group) {
      const rows = store
        .things(note, [group])
        .then((all) => new Map(all.filter((t) => t.graph === graph).map((t) => [t.key, t.props])));
      held = { group, rows };
    }
    return JSON.parse((await held.rows).get(key) ?? '{}') as Record<string, unknown>;
  };
}

/**
 * The filters of a graph read in parts, as facetsOf gives them for `things`. Their properties are read from the store
 * a group at a time, each group once. Each value goes back to its thing's place in the drawing, so the answers are the
 * same as a whole reading gives.
 */
async function facetsInParts(
  store: PartsStore,
  note: string,
  graph: string,
  ids: readonly string[],
  things: readonly { key: string; kind: string }[],
): Promise<CodedFacet[]> {
  const at = new Map(things.map((t, i) => [t.key, i]));
  const columns = new FacetColumns(things.length);
  for (const id of ids)
    for (const t of await store.things(note, [id])) {
      const i = t.graph === graph ? at.get(t.key) : undefined;
      if (i !== undefined) columns.add(i, JSON.parse(t.props) as Record<string, unknown>);
    }
  return columns.facets(things.map((t) => t.kind)).map(codedFacet);
}

/** The groups of a graph as the store holds them, each with its things' keys, and the links between them counted. */
function groupingOf(groups: GroupRow[], between: BetweenRow[], things: { key: string; group: string }[]): Grouping {
  const keys = new Map<string, string[]>(groups.map((g) => [g.id, []]));
  for (const t of things) keys.get(t.group)?.push(t.key);
  const at = new Map(groups.map((g, i) => [g.id, i]));
  return {
    by: groups[0]?.by ?? 'links',
    groups: groups.map((g) => ({ id: g.id, label: g.label, by: g.by, keys: keys.get(g.id) ?? [] })),
    between: between.flatMap((b) => {
      const from = at.get(b.from),
        to = at.get(b.to);
      return from === undefined || to === undefined ? [] : [{ from, to, links: b.links }];
    }),
  };
}

/**
 * The note's new text, after `change` edits the lines that wrote thing `key` in `graph`. `change` is given those lines
 * and gives them back edited, as setProperty in inspector.ts does. Refused when the store was read from other text
 * than `text`, so an edit never lands on the wrong lines.
 */
export async function editInParts(
  into: MeshIndex | PartsStore,
  note: string,
  text: string,
  graph: string,
  key: string,
  change: (lines: string) => Edit,
): Promise<Edit> {
  const store = partsStoreOf(into);
  if ((await store.version(note)) !== sha256(text)) return { ok: false, reason: word('editing.note-changed') };
  const span = await store.span(note, graph, key);
  if (!span) return { ok: false, reason: word('editing.not-stored', { thing: key, graph }) };
  const lines = text.split('\n');
  const done = change(lines.slice(span.line - 1, span.end).join('\n'));
  if (!done.ok) return done;
  return { ok: true, text: [...lines.slice(0, span.line - 1), done.text, ...lines.slice(span.end)].join('\n') };
}

/**
 * The note's new text, with property `prop` of thing `key` set to `words`, read as `type`. It is written only on the
 * lines that wrote the thing (editInParts), and refused, with why, as a property field refuses it.
 */
export async function setInParts(
  into: MeshIndex | PartsStore,
  at: { note: string; text: string; graph: string },
  key: string,
  prop: string,
  type: PropType,
  words: string,
): Promise<Edit> {
  const value = parseValue(type, words);
  if (!value.ok) return { ok: false, reason: value.error };
  return editInParts(into, at.note, at.text, at.graph, key, (lines) =>
    setProperty(lines, at.graph, { thing: key }, prop, value.gql),
  );
}

/**
 * The style of a graph of a note too big to read at once, read from its style blocks (§2). Its names are checked
 * against the graph as the store holds it, as a whole reading checks them. The note's data blocks are never read here.
 * With no style block for the graph, the graph is not built for the checks, so a draw costs a scan of the fences.
 */
export async function storedStyle(
  text: string,
  stored: StoredGraph,
): Promise<{ style: StyleGraph; problems: Problem[] }> {
  const graph = stored.drawing.graph;
  const texts = gqlBlocks(text).map((b) => b.text);
  if (!texts.some((t) => styleOf(t) === graph)) return { style: emptyStyle(), problems: [] };
  const world = Object.assign(Object.create(null) as Record<string, gs.Graph>, {
    [graph]: await stored.world(),
  });
  return readStyle(texts, graph, { world, whole: Object.create(null) as typeof world });
}

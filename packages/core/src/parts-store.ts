// The store a note read in parts is kept in, as a part a host can swap (editor spec §53, scale_parts_store_swap). The
// drawing asks it for a page of rows at a time and waits for the answer. So a store may keep its rows anywhere. It may
// be in memory, in SQLite in the page, or a file on disk behind the desktop app's commands (scale_parts_on_disk).
//
// Every store answers each read alike, in the order the rows were put. `partsStoreContract` (parts-store-contract.ts)
// checks one against the memory store. The note's text stays the only store of the graph (text_is_the_store). So a
// store is always a copy that can be thrown away.
import { MeshIndex } from './mesh-index.ts';
import type { BetweenRow, GroupRow, LinkRow, MeshBackend, NoteRows, Span, ThingRow } from './mesh-index-rows.ts';

/** What the overview holds of a thing: its key, kind, words and group, in the order the note wrote them. */
export interface ThingBrief {
  graph: string;
  key: string;
  kind: string;
  text: string;
  group: string;
}

/** Where the rows of notes read in parts are kept. Each read answers a page of rows, and none needs the whole graph. */
export interface PartsStore {
  /** What keeps the rows, said in words: 'memory', 'sqlite' or the host's own. */
  readonly kind: string;
  /** Whether the rows outlast the session, so no other copy of them need be kept (scale_parts_kept). */
  readonly lasting: boolean;
  /** Puts a note's rows in place of any it had. Its version is written last, so a half-put note is never fresh. */
  put(rows: NoteRows): Promise<void>;
  /** Takes a note's rows out. */
  drop(note: string): Promise<void>;
  /** The hash of the text a note's rows were built from, or null when the store does not hold it. */
  version(note: string): Promise<string | null>;
  /** Each group of a note's graphs, and the links between groups counted. */
  groups(note: string): Promise<{ groups: GroupRow[]; between: BetweenRow[] }>;
  /** The things in some groups, with their properties, in order. */
  things(note: string, groups: readonly string[]): Promise<ThingRow[]>;
  /** Every thing of a note, without its properties or lines, in order. */
  briefs(note: string): Promise<ThingBrief[]>;
  /** The links with both ends in group `group`, in order. */
  inside(note: string, group: string): Promise<LinkRow[]>;
  /** The links with an end among `keys`, each once, in order. */
  touching(note: string, keys: readonly string[]): Promise<LinkRow[]>;
  /** Every link of a note, in order: only the style checks of a graph with a style block read them all. */
  links(note: string): Promise<LinkRow[]>;
  /** The note lines thing `key` of `graph` was read from, or null. */
  span(note: string, graph: string, key: string): Promise<Span | null>;
}

/** The store over a backend the page holds: its answers, given as they come. */
export function storeOver(backend: MeshBackend, lasting = false): PartsStore {
  const ix = new MeshIndex(backend);
  const all = (note: string) => backend.groups(note).groups.map((g) => g.id);
  return {
    kind: backend.kind,
    lasting,
    put: async (rows) => backend.put(rows),
    drop: async (note) => backend.drop(note),
    version: async (note) => backend.version(note),
    groups: async (note) => backend.groups(note),
    things: async (note, groups) => backend.things(note, groups),
    briefs: async (note) =>
      backend
        .things(note, all(note))
        .map((t) => ({ graph: t.graph, key: t.key, kind: t.kind, text: t.text, group: t.group })),
    inside: async (note, group) =>
      backend.inside
        ? backend.inside(note, group)
        : backend.links(note).filter((l) => l.fromGroup === group && l.toGroup === group),
    touching: async (note, keys) => {
      if (backend.touching) return backend.touching(note, keys);
      const wanted = new Set(keys);
      return backend.links(note).filter((l) => wanted.has(l.from) || wanted.has(l.to));
    },
    links: async (note) => backend.links(note),
    span: async (note, graph, key) => ix.sourceSpan(note, graph, key),
  };
}

/** Each index's store, made once, so a host that hands in a MeshIndex keeps one store for it. */
const over = new WeakMap<MeshIndex, PartsStore>();

/** The store to read from: `s` itself, or the store over a MeshIndex's backend. */
export function partsStoreOf(s: MeshIndex | PartsStore): PartsStore {
  if (!(s instanceof MeshIndex)) return s;
  let made = over.get(s);
  if (!made) over.set(s, (made = storeOver(s.backend)));
  return made;
}

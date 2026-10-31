// Connectors over sync (editor spec §63, CN3). Roger, 24 Oct 2026. A graph drawn from many places is kept in step
// between devices (connectors.ts in the core). Only what people and AI authors write is carried.
// - Written only (connector_sync_written_only). The notes and .gql files are synced documents. A connector's output is
//   never synced: each device rebuilds it from the same version of each place.
// - Home (connector_edit_goes_home). An edit to a thing read from a note or a .gql file changes that place. One edit
//   that reaches several places is one bundle, applied and undone together.
// - Overlay (connector_overlay_for_readonly). Some places ThoughtKnot does not write, such as a plug-in's source. An
//   edit to a thing read from one is kept in the note, citing the place and its version. The place is never changed.
// - Rejoin (connector_refresh_rejoins). When a place changes under an overlay, the two are contested, never one
//   written over the other. An overlay whose place or thing is gone is an orphan, for a person to resolve.
import { connect, gqlBlocks, joinPlaces, readNote } from '@thoughtknot/core';
import type { Connected, GraphSource, JoinedRead, SourceRefusal } from '@thoughtknot/core';
import gs from '@thoughtknot/graph-spec';
import type { Refused } from './engine.ts';
import type { SyncedNotes } from './synced-notes.ts';

/** The ending of the graph that holds a graph's overlays, in the note that draws it. */
export const OVERLAY_GRAPH = '_overlay';
/** The scheme the overlays are joined under, when they are contested. */
const OVERLAY_SCHEME = 'overlay';

/** An edit kept over a place ThoughtKnot does not write: the place and its version, the thing, and its new value. */
export interface Overlay {
  place: string;
  version: string;
  thing: string;
  key: string;
  value: string;
}

/** A graph joined from its places, with the overlays on them: those applied, those contested, and the orphans. */
export interface Rejoined {
  joined: JoinedRead | SourceRefusal;
  applied: Overlay[];
  contested: Overlay[];
  orphans: Overlay[];
}

/** One change to one synced document: the text from `from` to `to` becomes `text`. */
export interface Change {
  doc: string;
  from: number;
  to: number;
  text: string;
}

/** Whether ThoughtKnot writes this kind of place: a note or a .gql file is text the CRDT carries. */
export const writable = (s: Pick<GraphSource, 'kind'>): boolean => s.kind === 'file' || s.kind === 'note';

/** A property's value as words: a text as it is, anything else as JSON. */
const said = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v));
/** `value` as a GQL string. */
const quoted = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** The overlays on `graph` that `note` holds, in its block `// graph: <graph>_overlay`. */
export function overlaysOf(note: string, graph: string): Overlay[] {
  const name = `${graph}${OVERLAY_GRAPH}`;
  const blocks = gqlBlocks(note).filter((b) => b.text.startsWith(`// graph: ${name}`));
  const g = blocks.length ? readNote(blocks.map((b) => b.text)).world[name] : undefined;
  return [...(g?.nodes.values() ?? [])]
    .filter(([labels]) => labels.has('Overlay'))
    .map(([, p]) => ({
      place: said(p['place']),
      version: said(p['version']),
      thing: said(p['thing']),
      key: said(p['key']),
      value: said(p['value']),
    }));
}

/** The change to `note` that keeps `o` over its place: one more line of its overlay block, made when it is not there. */
export function overlayChange(doc: string, note: string, graph: string, o: Overlay): Change {
  const n = overlaysOf(note, graph).length + 1;
  const fields = (['place', 'version', 'thing', 'key', 'value'] as const).map((k) => `${k}: ${quoted(o[k])}`);
  const line = `(o${n}:Overlay {${fields.join(', ')}})`;
  const head = `// graph: ${graph}${OVERLAY_GRAPH}`;
  const at = note.indexOf(head);
  if (at < 0) {
    const text = `${note.endsWith('\n') ? '' : '\n'}\n\`\`\`gql\n${head}\n${line}\n\`\`\`\n`;
    return { doc, from: note.length, to: note.length, text };
  }
  const end = note.indexOf('\n```', at);
  return { doc, from: end, to: end, text: `,\n${line}` };
}

/** `text` from `start` to the end of its statement: a comma or line end outside any bracket or quote, or the end. */
function statementEnd(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'") {
      for (i++; i < text.length && text[i] !== "'"; i++) if (text[i] === '\\') i++;
    } else if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (depth <= 0 && (ch === ',' || ch === '\n')) return i;
  }
  return text.length;
}

/**
 * The change that sets `key` of the statement on `line` (1-based) of `text` to `value`, or nothing. Nothing when `key`
 * is not a plain name. Nothing when that statement lacks it. It never reaches into the next statement.
 */
export function homeChange(doc: string, text: string, line: number, key: string, value: string): Change | null {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;
  const start =
    text
      .split('\n')
      .slice(0, line - 1)
      .join('\n').length + (line > 1 ? 1 : 0);
  const statement = text.slice(start, statementEnd(text, start));
  const bare = statement.replace(/'(?:[^'\\]|\\.)*'/g, (q) => '_'.repeat(q.length));
  const m = new RegExp(`(?<=[{,]\\s*)${key}\\s*:\\s*`).exec(bare);
  if (!m) return null;
  const rest = statement.slice(m.index + m[0].length);
  const v = /^(?:'(?:[^'\\]|\\.)*'|[^,}\s]+)/.exec(rest);
  if (!v) return null;
  const from = start + m.index;
  return { doc, from, to: from + m[0].length + v[0].length, text: `${key}: ${quoted(value)}` };
}

/** `c` with the thing `o` names holding its value. */
function overlaid(c: Connected, graph: string, o: Overlay): Connected {
  const g = c.read.reading.world[graph] as InstanceType<typeof gs.Graph>;
  const nodes = new Map([...g.nodes].map(([id, [l, p]]) => [id, [l, id === o.thing ? { ...p, [o.key]: o.value } : p]]));
  const world = { ...c.read.reading.world, [graph]: new gs.Graph(nodes as typeof g.nodes, g.edges) };
  return { ...c, read: { ...c.read, reading: { ...c.read.reading, world } } };
}

/**
 * `graph` joined from `reads`, each place as this device read it, with `overlays` on them. An overlay on the version
 * read now gives its value. One on another version is joined as a place of its own, so the join holds the two values
 * as contested. One whose place or thing is gone is an orphan.
 */
export function rejoin(graph: string, reads: readonly (Connected | SourceRefusal)[], overlays: Overlay[]): Rejoined {
  const out: Omit<Rejoined, 'joined'> = { applied: [], contested: [], orphans: [] };
  let places = [...reads];
  for (const o of overlays) {
    const i = places.findIndex((r) => !('refused' in r) && r.place === o.place);
    const c = places[i] as Connected | undefined;
    if (!c || !c.read.reading.world[graph]?.nodes.has(o.thing)) out.orphans.push(o);
    else if (c.version === o.version) {
      places[i] = overlaid(c, graph, o);
      out.applied.push(o);
    } else out.contested.push(o);
  }
  if (out.contested.length) {
    const lines = out.contested.map((o) => `(${o.thing} {${o.key}: ${quoted(o.value)}})`);
    const source = { graph, kind: 'plugin', scheme: OVERLAY_SCHEME, target: graph, block: 0 } as const;
    places = [
      ...places,
      connect(source, { found: `${OVERLAY_SCHEME}:${graph}`, text: `// graph: ${graph}\n${lines.join(',\n')}` }),
    ];
  }
  return { joined: joinPlaces(graph, places), ...out };
}

/** Where an edit's places are written: each place's synced document, and the note that draws the graph. */
export interface Homes {
  /** The synced document a place ThoughtKnot writes is kept in, by the place. */
  docOf(place: string): string;
  /** The note that draws the graph: it keeps the overlays. */
  note: string;
}

/**
 * The changes that set `key` of `thing` to `value` in `r`, a graph joined from its places, as one bundle. Each place
 * ThoughtKnot writes is changed at home. Each other place gets an overlay in the note, citing its version.
 */
export function changesFor(
  notes: SyncedNotes,
  r: JoinedRead,
  homes: Homes,
  thing: string,
  key: string,
  value: string,
): Change[] {
  const graph = r.source.graph;
  const out: Change[] = [];
  for (const cite of r.cites.get(thing) ?? []) {
    const c = r.places.find((p) => p.place === cite.place);
    if (!c) continue;
    const change = writable(c.source)
      ? homeChange(homes.docOf(c.place), notes.read(homes.docOf(c.place)).text, cite.line, key, value)
      : overlayChange(homes.note, notes.read(homes.note).text, graph, {
          place: c.place,
          version: c.version,
          thing,
          key,
          value,
        });
    if (change) out.push(change);
  }
  return out;
}

/** What a bundle applied, kept so one undo takes all of it back. */
export interface Applied {
  undo: Change[];
}

/** Applies `changes` to the synced documents as one: if one is refused, those before it are taken back. */
export async function applyBundle(
  notes: SyncedNotes,
  changes: readonly Change[],
  author: string,
): Promise<Applied | Refused> {
  // within a document the later places first, so each change's places stay where they were read
  const ordered = [...changes].sort((a, b) => (a.doc === b.doc ? b.from - a.from : a.doc < b.doc ? -1 : 1));
  const undo: Change[] = [];
  for (const c of ordered) {
    const was = notes.read(c.doc).text.slice(c.from, c.to);
    const refused = await notes.edit(c.doc, c.from, c.to, c.text, author);
    if (refused) {
      await undoBundle(notes, { undo }, author);
      return refused;
    }
    undo.unshift({ doc: c.doc, from: c.from, to: c.from + c.text.length, text: was });
  }
  return { undo };
}

/** Takes back all that a bundle applied, the last change first. */
export async function undoBundle(notes: SyncedNotes, applied: Applied, author: string): Promise<void> {
  for (const c of applied.undo) await notes.edit(c.doc, c.from, c.to, c.text, author);
}

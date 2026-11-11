// The store of notes read in parts, in a SQLite file on the device (editor spec ES§53, scale_parts_on_disk). A note too
// big to read at once is read in the window a part at a time, as everywhere. Its rows then go to the app's two store
// commands (src-tauri/src/parts.rs), a page at a time. The window holds only what is on screen. The file outlasts
// the window, so a note seen before opens without a reading, and no other copy is kept.
//
// It is one store among others (scale_parts_store_swap): the core's contract holds it to the memory store's answers.
// Should the file fail, the window keeps the rows in memory for the rest of the session, as the browser does.
// `invoke` is handed in, so nothing here imports Tauri and the tests hand in their own.
import { memoryBackend, storeOver } from '@thoughtknot/core';
import type { BetweenRow, GroupRow, LinkRow, NoteRows, PartsStore, ThingRow } from '@thoughtknot/core';
import type { Invoke } from './tauri-files.ts';

/** The most rows one write carries: well under the most the Rust takes (ROWS_MOST), so no message is too big. */
export const PUT_PAGE = 5_000;

/**
 * The store in the app's file, through its two commands. Each note is kept under `place`, the note the page has open,
 * so two notes' panes never take each other's rows.
 */
export function tauriPartsStore(invoke: Invoke, place: string, page = PUT_PAGE): PartsStore {
  const under = (note: string) => `${place} · ${note}`;
  const write = (op: { note: string } & Record<string, unknown>) =>
    invoke('parts_write', { op: { ...op, note: under(op.note) } }).then(() => undefined);
  const read = <T>(ask: { note: string } & Record<string, unknown>) =>
    invoke('parts_read', { ask: { ...ask, note: under(ask.note) } }) as Promise<T>;
  // the rows name their note too, and the Rust refuses a row of another note than the one written
  const named = <T extends { note: string }>(list: readonly T[]) => list.map((r) => ({ ...r, note: under(r.note) }));
  // and come back naming it as the core does
  const back = <T extends { note: string }>(list: T[], note: string) => {
    for (const r of list) r.note = note;
    return list;
  };
  return {
    kind: 'disk',
    lasting: true,
    async put(rows: NoteRows) {
      const { note } = rows;
      // its rows go in a page at a time, and its version last: a note half put is never read as fresh
      await write({ op: 'start', note });
      const pages = async (op: string, list: readonly { note: string }[]) => {
        for (let at = 0; at < list.length; at += page)
          await write({ op, note, at, rows: named(list.slice(at, at + page)) });
      };
      await pages('things', rows.things);
      await pages('links', rows.links);
      await write({ op: 'groups', note, groups: named(rows.groups), between: named(rows.between) });
      await write({ op: 'done', note, version: rows.version });
    },
    drop: (note) => write({ op: 'drop', note }),
    version: (note) => read({ ask: 'version', note }),
    groups: async (note) => {
      const { groups, between } = await read<{ groups: GroupRow[]; between: BetweenRow[] }>({ ask: 'groups', note });
      return { groups: back(groups, note), between: back(between, note) };
    },
    things: async (note, groups) => back(await read<ThingRow[]>({ ask: 'things', note, groups }), note),
    briefs: (note) => read({ ask: 'briefs', note }),
    inside: async (note, group) => back(await read<LinkRow[]>({ ask: 'inside', note, group }), note),
    touching: async (note, keys) => back(await read<LinkRow[]>({ ask: 'touching', note, keys }), note),
    links: async (note) => back(await read<LinkRow[]>({ ask: 'links', note }), note),
    span: (note, graph, key) => read({ ask: 'span', note, graph, key }),
  };
}

/**
 * `store`, or the memory store once `store` fails: from then on, for the rest of the session. A put that failed is put
 * in memory. A read that failed asks memory, which holds nothing yet. So the note is read again when next drawn.
 */
export function orInMemory(store: PartsStore, failed: (e: unknown) => void = () => undefined): PartsStore {
  let now = store;
  const on =
    <A extends unknown[], T>(call: (s: PartsStore, ...args: A) => Promise<T>) =>
    async (...args: A): Promise<T> => {
      if (now === store)
        try {
          return await call(store, ...args);
        } catch (e) {
          failed(e);
          now = storeOver(memoryBackend());
        }
      return call(now, ...args);
    };
  return {
    get kind() {
      return now.kind;
    },
    get lasting() {
      return now.lasting;
    },
    put: on((s, rows: NoteRows) => s.put(rows)),
    drop: on((s, note: string) => s.drop(note)),
    version: on((s, note: string) => s.version(note)),
    groups: on((s, note: string) => s.groups(note)),
    things: on((s, note: string, groups: readonly string[]) => s.things(note, groups)),
    briefs: on((s, note: string) => s.briefs(note)),
    inside: on((s, note: string, group: string) => s.inside(note, group)),
    touching: on((s, note: string, keys: readonly string[]) => s.touching(note, keys)),
    links: on((s, note: string) => s.links(note)),
    span: on((s, note: string, graph: string, key: string) => s.span(note, graph, key)),
  };
}

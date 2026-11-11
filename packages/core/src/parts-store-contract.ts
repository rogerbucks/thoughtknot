// The contract every store of notes read in parts is held to (editor spec §53, scale_parts_store_swap). A store a host
// brings in place of the memory one must give the same answers to the same reads, in the same order. The checks need
// no test framework: each throws when the store breaks the promise, so a host's tests run them with whatever runner
// they have.
//
// `contractCases` is the same promise as data: rows to put, the reads to ask, and the answers the memory store gives.
// A store written in another language, such as the desktop app's own in Rust, is checked against it
// (packages/core/test/fixtures/parts-store-contract.json).
import { memoryBackend } from './mesh-index-backends.ts';
import { noteRows } from './mesh-index-rows.ts';
import type { NoteRows } from './mesh-index-rows.ts';
import { storeOver } from './parts-store.ts';
import type { PartsStore } from './parts-store.ts';

/** One check of the contract: what it holds a store to, and the run that throws when the store breaks it. */
export interface PartsStoreCheck {
  name: string;
  run: () => Promise<void>;
}

/** One read of a store, by the name of its call and what it is given. */
export type StoreAsk =
  | { ask: 'version' | 'groups' | 'briefs' | 'links'; note: string }
  | { ask: 'things'; note: string; groups: string[] }
  | { ask: 'inside'; note: string; group: string }
  | { ask: 'touching'; note: string; keys: string[] }
  | { ask: 'span'; note: string; graph: string; key: string };

/** The kinds the contract's note is written with, so the things fall into groups linked to each other. */
const KINDS = ['Task', 'Person', 'Place'];

/** Words a store must keep as they are: quotes, a backslash, SQL's own marks, and letters of every script. */
const ODD = ["it's", 'a "quoted" word', 'back\\slash', "x'); DROP TABLE things; --", 'ünïcödé · 漢字 · 😀', '%_*?'];

/** The note the contract puts: things of three kinds, each linked to the one before and to a thing of another kind. */
export function contractNote(things = 90): string {
  const lines = ['# Contract', '', '```gql', '// graph: contract'];
  for (let i = 0; i < things; i++) {
    const words = (ODD[i % ODD.length] ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    lines.push(`(n${i}:${KINDS[i % KINDS.length]} {name: 'Item ${i}', said: '${words}', rank: ${i % 7}}),`);
  }
  const links: string[] = [];
  for (let i = KINDS.length; i < things; i++) links.push(`(n${i})-[:NEAR]->(n${i - KINDS.length})`);
  for (let i = 1; i < things; i += 2) links.push(`(n${i})-[:SEES]->(n${i - 1})`);
  return [...lines, links.join(',\n'), '```', ''].join('\n');
}

/** A store's answer to one read. */
export async function answer(store: PartsStore, a: StoreAsk): Promise<unknown> {
  switch (a.ask) {
    case 'version':
      return store.version(a.note);
    case 'groups':
      return store.groups(a.note);
    case 'briefs':
      return store.briefs(a.note);
    case 'links':
      return store.links(a.note);
    case 'things':
      return store.things(a.note, a.groups);
    case 'inside':
      return store.inside(a.note, a.group);
    case 'touching':
      return store.touching(a.note, a.keys);
    case 'span':
      return store.span(a.note, a.graph, a.key);
  }
}

/** Every read the contract asks of the notes `rows` holds, and of a note no store holds. */
function asksOf(rows: readonly NoteRows[]): StoreAsk[] {
  const out: StoreAsk[] = [];
  for (const r of [...rows, { note: 'never put.md', version: '', things: [], links: [], groups: [], between: [] }]) {
    const note = r.note,
      ids = r.groups.map((g) => g.id),
      keys = r.things.map((t) => t.key);
    out.push({ ask: 'version', note }, { ask: 'groups', note }, { ask: 'briefs', note }, { ask: 'links', note });
    out.push({ ask: 'things', note, groups: ids }, { ask: 'things', note, groups: [] });
    out.push({ ask: 'things', note, groups: [...ids].reverse().slice(0, 2) });
    for (const group of [...ids, 'no such group']) {
      out.push({ ask: 'things', note, groups: [group] }, { ask: 'inside', note, group });
    }
    out.push({ ask: 'touching', note, keys: keys.slice(3, 5) });
    out.push({ ask: 'touching', note, keys: [] }, { ask: 'touching', note, keys: ['nobody'] });
    for (const key of [keys[0], keys.at(-1), 'nobody'])
      out.push({ ask: 'span', note, graph: r.things[0]?.graph ?? 'contract', key: key ?? 'nobody' });
  }
  return out;
}

/** The reads of a note with many things: more keys than one query names, given out of order and twice. */
function manyAsks(r: NoteRows): StoreAsk[] {
  const keys = r.things.map((t) => t.key);
  return [
    { ask: 'version', note: r.note },
    { ask: 'touching', note: r.note, keys: [...keys, ...keys].reverse() },
  ];
}

/** The cases a store is checked against: the rows to put, in order, and each read with the memory store's answer. */
export async function contractCases(): Promise<{
  rows: NoteRows[];
  asks: (StoreAsk & { answer: unknown })[];
}> {
  const big = noteRows('contract.md', contractNote(210)),
    mid = noteRows('notes/one.md', contractNote(40));
  // a third note, put twice: the second put stands in place of the first
  const first = noteRows('notes/two.md', contractNote(30)),
    second = noteRows('notes/two.md', contractNote(12));
  const rows = [big, mid, first, second];
  const memory = storeOver(memoryBackend());
  for (const r of rows) await memory.put(r);
  const all = [...manyAsks(big), ...asksOf([mid, second])];
  const asks = await Promise.all(all.map(async (a) => ({ ...a, answer: await answer(memory, a) })));
  return { rows, asks };
}

/** Fails a check with what was wanted and what the store gave. */
function fail(name: string, wanted: unknown, got: unknown): never {
  throw new Error(
    `${name}: wanted ${JSON.stringify(wanted)?.slice(0, 300)}, got ${JSON.stringify(got)?.slice(0, 300)}`,
  );
}

/** Whether two answers are the same, as JSON: the order of rows counts. */
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * The checks a store is held to. `make` gives a new, empty store for each check. Every store must answer every read as
 * the memory store does, keep a note's newest rows only, forget a note dropped, and keep notes apart.
 */
export function partsStoreContract(make: () => Promise<PartsStore>): PartsStoreCheck[] {
  return [
    {
      name: 'every read answers as the memory store does, in the same order',
      run: async () => {
        const store = await make();
        const { rows, asks } = await contractCases();
        for (const r of rows) await store.put(r);
        for (const { answer: wanted, ...a } of asks) {
          const got = await answer(store, a);
          if (!same(got, wanted)) fail(`${a.ask} of ${a.note}`, wanted, got);
        }
      },
    },
    {
      name: 'a note dropped is forgotten, and the others stay',
      run: async () => {
        const store = await make();
        const one = noteRows('one.md', contractNote(9)),
          two = noteRows('two.md', contractNote(15));
        await store.put(one);
        await store.put(two);
        await store.drop('one.md');
        for (const a of asksOf([{ ...one, things: [], links: [], groups: [], between: [] }])) {
          const got = await answer(store, a);
          const empty =
            a.ask === 'version' || a.ask === 'span' ? null : a.ask === 'groups' ? { groups: [], between: [] } : [];
          if (!same(got, empty)) fail(`${a.ask} of a dropped note`, empty, got);
        }
        if ((await store.version('two.md')) !== two.version)
          fail('the note left', two.version, await store.version('two.md'));
        if ((await store.briefs('two.md')).length !== 15)
          fail('the note left', 15, (await store.briefs('two.md')).length);
      },
    },
  ];
}

// The one contract every history store is held to (editor spec §55, storage_history_layer), as the storage contract
// holds every note storage. Each check throws when the store breaks its promise, so a store's tests run them with
// whatever runner they have.
import type { StoredChange } from './note-storage.ts';
import { historyLayer, layered, memoryStorage } from './note-storage.ts';
import type { HistoryStore } from './history-store.ts';

/** One check of the history contract: what it holds a history store to, and the run that throws when broken. */
export interface HistoryCheck {
  name: string;
  run: () => Promise<void>;
}

function fail(name: string, wanted: string, got: unknown): never {
  throw new Error(`${name}: wanted ${wanted}, got ${JSON.stringify(got)}`);
}

/** Texts a change must keep byte for byte, as the storage contract's notes must. */
const TEXTS = [
  '',
  'a\r\nb\r\n',
  'trailing  \n\n\n',
  'ünïcödé · 漢字 · 😀\n',
  '```gql\n(a)\n```\n',
  '```json thoughtknot-change\n{}\n```\n',
];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Every check of the history contract, each run on a fresh, empty history store from `make`. */
export function historyContract(make: () => HistoryStore | Promise<HistoryStore>): HistoryCheck[] {
  return [
    {
      name: 'an empty history has no changes',
      run: async () => {
        const h = await make();
        const all = await h.changes();
        if (all.length) fail('changes', 'none', all);
      },
    },
    {
      name: 'a change reads back byte for byte, with who made it and when',
      run: async () => {
        const h = await make();
        const want: StoredChange[] = TEXTS.map((text, i) => ({
          path: `n${i}.md`,
          before: i ? (TEXTS[i - 1] ?? null) : null,
          after: text,
          author: `person ${i}`,
          at: `2026-11-06T10:00:0${i}.000Z`,
        }));
        for (const c of want) await h.record(c);
        const got = await h.changes();
        if (!same(got, want)) fail('changes', JSON.stringify(want), got);
      },
    },
    {
      name: 'changes come back in the order made, across days, and by note when asked',
      run: async () => {
        const h = await make();
        const at = ['2026-11-05T23:59:00.000Z', '2026-11-06T00:01:00.000Z', '2026-11-06T00:02:00.000Z'];
        await h.record({ path: 'a.md', before: null, after: '1', author: 'Roger', at: at[0] ?? '' });
        await h.record({ path: 'b.md', before: null, after: '2', author: 'Claude', at: at[1] ?? '' });
        await h.record({ path: 'a.md', before: '1', after: null, author: 'Roger', at: at[2] ?? '' });
        const order = (await h.changes()).map((c) => `${c.path}@${c.at}`);
        const want = [`a.md@${at[0]}`, `b.md@${at[1]}`, `a.md@${at[2]}`];
        if (!same(order, want)) fail('order', JSON.stringify(want), order);
        const a = (await h.changes('a.md')).map((c) => c.after);
        if (!same(a, ['1', null])) fail('changes of a.md', '["1", null]', a);
      },
    },
    {
      name: 'a change with no author is kept with none, never a made-up one',
      run: async () => {
        const h = await make();
        await h.record({ path: 'n.md', before: null, after: 'x', at: '2026-11-06T10:00:00.000Z' });
        const [c] = await h.changes();
        if (!c || 'author' in c) fail('author', 'none', c);
      },
    },
    {
      name: 'through the history layer, each change made is kept with its author, and a refused one is not',
      run: async () => {
        const h = await make();
        let tick = 0;
        const notes = layered(
          memoryStorage(),
          historyLayer(h, () => `2026-11-06T10:00:0${tick++}.000Z`),
        );
        const first = await notes.write('n.md', 'one', { author: 'Roger' });
        await notes.write('n.md', 'two', { author: 'Claude' });
        await notes.write('n.md', 'lost', { author: 'Grok', expected: first.ok ? first.version : '' });
        await notes.remove('n.md', { author: 'Roger' });
        const got = (await h.changes()).map((c) => [c.author, c.before, c.after]);
        const want = [
          ['Roger', null, 'one'],
          ['Claude', 'one', 'two'],
          ['Roger', 'two', null],
        ];
        if (!same(got, want)) fail('changes', JSON.stringify(want), got);
      },
    },
  ];
}

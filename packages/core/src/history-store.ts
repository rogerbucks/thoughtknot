// The history of every change, as its own layer (editor spec §55, storage_history_layer). It is kept apart from where
// the current copy of each note is kept. The notes go through `historyLayer` (note-storage.ts), which hands each change made
// to a history store. That store may be memory, or any note storage at all: a folder, a Git repository
// (github_repo_store) or a database. Each keeps who made each change (changes_logged_with_provenance), and each passes
// the one history contract below. Swapping the history store changes nothing in the current copy.
import type { ChangeLog, NoteStorage, StoredChange } from './note-storage.ts';
import { changeNote, historyLayer, layered, memoryStorage } from './note-storage.ts';

/** Where a history layer keeps its changes, and reads them back in the order they were made. */
export interface HistoryStore extends ChangeLog {
  /** Every change kept, oldest first; only those to the note at `path` when it is given. */
  changes(path?: string): Promise<StoredChange[]>;
}

/** A change as kept: only its own fields, so nothing else the caller handed in is stored. */
function kept(change: StoredChange): StoredChange {
  const { path, before, after, at } = change;
  return change.author === undefined ? { path, before, after, at } : { path, before, after, author: change.author, at };
}

/** Changes kept in memory: for tests, and for a host with nowhere else to keep them. */
export function memoryHistory(): HistoryStore {
  const all: StoredChange[] = [];
  return {
    record: (change) => {
      all.push(kept(change));
    },
    changes: async (path) => all.filter((c) => path === undefined || c.path === path).map((c) => ({ ...c })),
  };
}

/** The fence each change is kept in, one change to a block, so a person can read the history as notes. */
const FENCE = '```json thoughtknot-change';

/** The day a change was made, which names the note it is kept in. */
const dayOf = (at: string) => (/^\d{4}-\d{2}-\d{2}/.test(at) ? at.slice(0, 10) : 'undated');

/** The changes kept in one history note, in the order written. A block not understood is left out. */
function changesIn(text: string): StoredChange[] {
  const out: StoredChange[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== FENCE) continue;
    try {
      const o = JSON.parse(lines[i + 1] ?? '') as Record<string, unknown>;
      const text = (v: unknown) => (typeof v === 'string' ? v : null);
      if (typeof o.path !== 'string' || typeof o.at !== 'string') continue;
      const author = typeof o.author === 'string' ? { author: o.author } : {};
      out.push(kept({ path: o.path, before: text(o.before), after: text(o.after), ...author, at: o.at }));
    } catch {
      // a block someone edited by hand into something else is not a change
    }
  }
  return out;
}

/**
 * Changes kept as notes in any note storage, one note a day in `folder`, each change a block of its own. So history can
 * be kept in a folder, a Git repository or a database, chosen apart from where the notes themselves are kept.
 */
export function notesHistory(storage: NoteStorage, folder = 'History'): HistoryStore {
  const noteFor = (at: string) => `${folder}/${dayOf(at)}.md`;
  return {
    record: async (change) => {
      const block = `${FENCE}\n${JSON.stringify(kept(change))}\n\`\`\`\n`;
      const path = noteFor(change.at);
      for (let tries = 0; tries < 3; tries++) {
        const done = await changeNote(
          storage,
          path,
          (text) => `${text}${text && !text.endsWith('\n') ? '\n' : ''}${block}`,
        );
        if (done.ok) return;
        const made = await storage.write(path, `# Changes on ${dayOf(change.at)}\n\n${block}`, { expected: null });
        if (made.ok) return;
      }
      throw new Error(`the change to ${change.path} could not be kept in ${path}`);
    },
    changes: async (path) => {
      const notes = (await storage.list()).filter((p) => p.startsWith(`${folder}/`));
      const all: StoredChange[] = [];
      for (const note of notes) all.push(...changesIn((await storage.read(note))?.text ?? ''));
      return all.filter((c) => path === undefined || c.path === path);
    },
  };
}

/** Copies every change kept in `from` to `to`, in order, when the history is moved to a new place. */
export async function moveHistory(from: HistoryStore, to: HistoryStore): Promise<number> {
  const all = await from.changes();
  for (const change of all) await to.record(change);
  return all.length;
}

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

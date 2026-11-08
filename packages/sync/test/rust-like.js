// A stand-in for the Rust side of the note commands (src-tauri/src/crdt.rs), built on the JavaScript CRDT. The Rust
// build matches it byte for byte (crdt-fixture.test.js), so tests of the layers above can use it.
import { MemoryStore, NoteCrdt } from '../src/index.ts';

const hex = (u8) => Buffer.from(u8).toString('hex');
const unhex = (h) => Uint8Array.from(Buffer.from(h, 'hex'));

/** The Rust side as one device sees it: it holds the open notes, and is told the records each time they are needed. */
export function rustLike(device) {
  const calls = [];
  const open = new Map();
  const over = async (records) => {
    const store = new MemoryStore();
    for (const r of records) await store.add('n', 'x', unhex(r));
    return store;
  };
  const commands = {
    async crdt_open({ note, records, text }) {
      const store = await over(records);
      const crdt = new NoteCrdt(store, device);
      const shown = await crdt.open(note, text);
      open.set(note, { crdt, store });
      const first = records.length ? null : hex(store.files.get(note).get(device)[0]);
      return { text: shown, first };
    },
    async crdt_text({ note }) {
      return open.get(note).crdt.text(note);
    },
    async crdt_splice({ note, from, to, insert, message }) {
      const { crdt, store } = open.get(note);
      const { author } = JSON.parse(message);
      await crdt.splice(note, from, to, insert, author);
      const mine = store.files.get(note).get(device);
      return hex(mine[mine.length - 1]);
    },
    async crdt_merge({ note, records }) {
      const { crdt, store } = open.get(note);
      const known = new Set((await store.records(note)).map(hex));
      for (const r of records) if (!known.has(r)) await store.add(note, 'x', unhex(r));
      return (await crdt.merge(note)) ?? null;
    },
    async crdt_has_been({ note, text }) {
      return open.get(note).crdt.hasBeen(note, text);
    },
    async crdt_anchor({ note, place }) {
      return open.get(note).crdt.anchor(note, place);
    },
    async crdt_place({ note, anchor }) {
      return open.get(note).crdt.place(note, anchor);
    },
    async crdt_history({ note }) {
      return (await open.get(note).crdt.history(note)).map((m) => JSON.stringify(m));
    },
  };
  return {
    calls,
    call: async (command, args) => {
      calls.push([command, args]);
      return commands[command](args);
    },
  };
}

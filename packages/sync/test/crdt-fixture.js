// The note CRDT's bytes, as the JavaScript build makes them. The Rust build in the app must make the same ones
// (packages/app/src-tauri/src/crdt.rs reads this file). Run with `--write` to make the file again.
import * as A from '@automerge/automerge';
import { writeFileSync } from 'node:fs';
import { MemoryStore, NoteCrdt } from '../src/index.ts';

const hex = (u8) => Buffer.from(u8).toString('hex');
const ACTOR = '00'.repeat(16);

/** The first change of a note: the same bytes on every device for the same text. */
export function genesis(text) {
  return A.change(A.init({ actor: ACTOR }), { time: 0, message: '' }, (d) => {
    d.text = text;
  });
}

/** Two devices edit the same note apart, then one merges: what the JavaScript build says, to check in Rust. */
export async function concurrent() {
  // the edits are stamped with the time, so the clock stands still while they are made
  const now = Date.now;
  Date.now = () => 1000;
  try {
    return await concurrentEdits();
  } finally {
    Date.now = now;
  }
}

async function concurrentEdits() {
  const store = new MemoryStore();
  const [laptop, phone] = [new NoteCrdt(store, 'laptop'), new NoteCrdt(store, 'phone')];
  await laptop.open('n', 'hello world');
  await phone.open('n', 'hello world');
  await laptop.splice('n', 6, 11, 'there', 'roger');
  await phone.splice('n', 11, 11, '!', 'roger');
  const [first, mine] = store.files.get('n').get('laptop');
  const [theirs] = store.files.get('n').get('phone');
  const merged = await laptop.merge('n');
  const had = (text) => [text, laptop.hasBeen('n', text)];
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('thoughtknot device laptop'));
  return {
    actor: Buffer.from(digest).subarray(0, 16).toString('hex'),
    first: hex(first),
    mine: hex(mine),
    theirs: hex(theirs),
    merged,
    hasBeen: [had('hello world'), had('hello there'), had('hello world!'), had('hello there!'), had('nope')],
  };
}

/** What the file holds: the first change, then one edit from a device with its own actor. */
export function fixture() {
  const first = genesis('hello world');
  const base = A.getLastLocalChange(first);
  let doc = A.init({ actor: 'ab'.repeat(16) });
  [doc] = A.applyChanges(doc, A.getAllChanges(first));
  const message = JSON.stringify({ author: 'roger', device: 'laptop' });
  const after = A.change(doc, { message, time: 1 }, (d) => A.splice(d, ['text'], 6, 5, 'there'));
  const edit = A.getChanges(doc, after)[0];
  const cursor = A.getCursor(after, ['text'], 8);
  return {
    first: { text: 'hello world', change: hex(base) },
    edit: {
      actor: 'ab'.repeat(16),
      from: 6,
      to: 11,
      insert: 'there',
      message,
      time: 1,
      change: hex(edit),
      text: after.text,
    },
    cursor: { place: 8, cursor: cursor },
  };
}

if (process.argv.includes('--write'))
  writeFileSync(
    new URL('./fixtures/crdt.json', import.meta.url),
    JSON.stringify({ ...fixture(), concurrent: await concurrent() }, null, 2) + '\n',
  );

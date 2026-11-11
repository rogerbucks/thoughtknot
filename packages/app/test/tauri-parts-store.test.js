// The desktop app keeps a huge note's rows in its file on disk (editor spec ES§53, scale_parts_on_disk):
// tauri-parts-store.ts. The window sends them a page at a time through the app's two store commands, and its version
// last. The store keeps the core's contract, as the Rust does (src-tauri/store). Should the file fail, the window keeps
// the rows in memory for the rest of the session.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { memoryBackend, partsStoreContract, storeOver } from '@thoughtknot/core';
import { contractNote } from '../../core/src/parts-store-contract.ts';
import { noteRows } from '../../core/src/mesh-index-rows.ts';
import { orInMemory, PUT_PAGE, tauriPartsStore } from '../src/tauri-parts-store.ts';

/**
 * The app's two store commands, as the Rust answers them, over a store in memory. A note's rows are held aside until
 * its version comes, a row of another note is refused, and `writes` keeps each write.
 */
function app() {
  const store = storeOver(memoryBackend());
  const putting = new Map();
  const writes = [];
  const commands = {
    async parts_write({ op }) {
      writes.push(op);
      const rows = [...(op.rows ?? []), ...(op.groups ?? []), ...(op.between ?? [])];
      if (rows.some((r) => r.note !== op.note)) throw new Error(`a row of another note than ${op.note}`);
      if (op.op === 'start' || op.op === 'drop') {
        await store.drop(op.note);
        putting.set(op.note, { note: op.note, things: [], links: [], groups: [], between: [] });
      }
      const held = putting.get(op.note);
      if (op.op === 'things' || op.op === 'links') held[op.op].splice(op.at, op.rows.length, ...op.rows);
      if (op.op === 'groups') Object.assign(held, { groups: op.groups, between: op.between });
      if (op.op === 'done') await store.put({ ...held, version: op.version });
    },
    async parts_read({ ask }) {
      const { ask: name, note, ...rest } = ask;
      const args = { things: [rest.groups], inside: [rest.group], touching: [rest.keys], span: [rest.graph, rest.key] };
      return JSON.parse(JSON.stringify(await store[name](note, ...(args[name] ?? [])))); // as JSON, as Tauri sends it
    },
  };
  return { writes, invoke: (command, args) => commands[command](args) };
}

test('the store on disk keeps the core’s contract, its rows put a page at a time', async () => {
  const failed = [];
  for (const check of partsStoreContract(async () => tauriPartsStore(app().invoke, 'notes/big.md', 7)))
    await check.run().catch((e) => failed.push(`${check.name}: ${e.message.slice(0, 200)}`));
  assert.deepEqual(failed, []);
});

test('a note goes in a page at a time, its version last, and the store says its rows outlast the window', async () => {
  const { writes, invoke } = app();
  const store = tauriPartsStore(invoke, 'big.md');
  assert.equal(store.lasting, true);
  const rows = noteRows('pane', contractNote(12_000));
  await store.put(rows);
  assert.deepEqual(writes[0], { op: 'start', note: 'big.md · pane' });
  assert.deepEqual(writes.at(-1), { op: 'done', note: 'big.md · pane', version: rows.version });
  assert.ok(writes.every((w) => (w.rows?.length ?? 0) <= PUT_PAGE));
  assert.equal(writes.filter((w) => w.op === 'things').length, Math.ceil(rows.things.length / PUT_PAGE));
  assert.equal(await store.version('pane'), rows.version);
});

test('two notes’ panes keep their rows apart', async () => {
  const { invoke } = app();
  const one = tauriPartsStore(invoke, 'one.md'),
    two = tauriPartsStore(invoke, 'two.md');
  await one.put(noteRows('pane', contractNote(9)));
  await two.put(noteRows('pane', contractNote(15)));
  assert.equal((await one.briefs('pane')).length, 9);
  assert.equal((await two.briefs('pane')).length, 15);
  assert.ok(
    (await one.things('pane', ['Task'])).every((t) => t.note === 'pane'),
    'rows name the note as the core does',
  );
});

test('should the file fail, the session keeps the rows in memory and says so once', async () => {
  const said = [];
  const broken = tauriPartsStore(async () => {
    throw new Error('disk full');
  }, 'big.md');
  const store = orInMemory(broken, (e) => said.push(e.message));
  const rows = noteRows('pane', contractNote(9));
  await store.put(rows);
  assert.equal(await store.version('pane'), rows.version);
  assert.equal((await store.briefs('pane')).length, 9);
  assert.equal(store.lasting, false, 'memory: the kept copy is used again');
  assert.deepEqual(said, ['disk full']);
});

test('the window hands the editor’s pane the store on disk, and the file is in the app’s own data folder', () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
  assert.match(
    read('../src/app-editor.ts'),
    /thoughtknotPartsStore = \(place: string\) =>\s+orInMemory\(tauriPartsStore\(/,
  );
  assert.match(read('../../claude-code/page/editor-pane.ts'), /store: \(\) => onDisk\(note\.path\)/);
  const parts = read('../src-tauri/src/parts.rs');
  assert.match(parts, /app\.path\(\)\.app_local_data_dir\(\)/);
  assert.doesNotMatch(parts, /Folder|root\(/, 'never the notes folder');
});

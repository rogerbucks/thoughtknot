// The five layers (editor spec §40, five_layer_stack). Roger, 28 Oct 2026 (Q-12 B: all five kept). The store, the CRDT,
// the engine, the read-only projection and the editors' face each talk only to the layer below. Here an invalid
// statement is refused by the engine and never reaches the store, and the store is swapped with no change above it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Engine,
  FolderStore,
  MemoryStore,
  NoteCrdt,
  Projection,
  SealedStore,
  SyncedNotes,
  VaultKey,
  syncedOver,
} from '../src/index.ts';
import { NOTE, TEXT, at, copyAll, devices, nodeFiles } from './helpers.js';

/** Each layer, top first: its file, and the one layer it holds. */
const LAYERS = [
  ['synced-notes.ts', 'Projection'],
  ['projection.ts', 'Engine'],
  ['engine.ts', 'NoteCrdt'],
  ['crdt.ts', 'Store'],
  ['store.ts', undefined],
];

describe('five_layer_stack', () => {
  // proves: five_layer_stack
  test('an invalid statement is refused by the engine before it replicates', async () => {
    const [desk, phone] = await devices('desktop', 'phone');
    await desk.notes.open(NOTE, TEXT);
    const kept = [...desk.store.files.values()].flatMap((d) => [...d.values()]).flat().length;
    const price = at(TEXT, '10');
    const said = await desk.notes.edit(NOTE, price, price + 2, '(((', 'Claude');
    assert.ok(said?.refused.length, 'refused, with the problem it would bring');
    assert.equal(desk.notes.read(NOTE).text, TEXT, 'the text is as it was');
    assert.equal([...desk.store.files.values()].flatMap((d) => [...d.values()]).flat().length, kept, 'nothing kept');
    copyAll([desk, phone]);
    await phone.notes.open(NOTE, TEXT);
    assert.equal(phone.notes.read(NOTE).text, TEXT, 'nothing replicated');
    assert.equal(await desk.notes.edit(NOTE, price, price + 2, '11', 'Claude'), undefined, 'a good edit is kept');
  });

  // proves: five_layer_stack
  test('an error already in the note is not the edit’s: editing elsewhere is never refused for it', async () => {
    const [desk] = await devices('desktop');
    const broken = TEXT.replace('price: 10', 'price: (((');
    await desk.notes.open(NOTE, broken);
    assert.equal(await desk.notes.edit(NOTE, 0, 0, 'Note: ', 'Roger'), undefined);
  });

  // proves: five_layer_stack
  test('swapping the store needs no change above it: the same edits give the same note on each store', async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'tk-layers-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const key = await VaultKey.create();
    const texts = [];
    for (const store of [new MemoryStore(), new FolderStore(nodeFiles(root))]) {
      const notes = new SyncedNotes(new Projection(new Engine(new NoteCrdt(new SealedStore(store, key), 'desktop'))));
      await notes.open(NOTE, TEXT);
      await notes.edit(NOTE, 0, 0, 'Autumn.\n', 'Roger');
      const again = syncedOver(store, key, 'desktop');
      texts.push((await again.open(NOTE)).text);
    }
    assert.deepEqual(texts, ['Autumn.\n' + TEXT, 'Autumn.\n' + TEXT]);
  });

  // proves: five_layer_stack
  test('each layer imports only the layer below, and the projection writes nothing of its own', () => {
    const src = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    LAYERS.forEach(([file, below], i) => {
      const imports = [...src(file).matchAll(/from '\.\/([^']+)'/g)].map((m) => m[1]);
      const above = LAYERS.slice(0, i).map(([f]) => f);
      assert.deepEqual(
        imports.filter((f) => above.includes(f)),
        [],
        `${file} knows nothing of the layers above it`,
      );
      const held = [...src(file).matchAll(/^ {2}readonly #\w+: (\w+);$/gm)].map((m) => m[1]);
      if (below) assert.equal(held[0], below, `${file} holds the layer below, ${below}`);
      assert.ok(!held.some((h) => LAYERS.some(([, b]) => b === h && h !== below)), `${file} holds no other layer`);
    });
    assert.doesNotMatch(src('projection.ts'), /\.splice\(|\.add\(|Store/, 'the projection keeps nothing below');
  });
});

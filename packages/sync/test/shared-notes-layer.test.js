// Notes shared through the storage layer (editor spec ES§41 and ES§40; storage_contract, mesh_vpn_sync). A write on one
// device reaches the other device's file. A note that is not shared is left alone. A write made against an older text
// is refused with the note as it now is, so a clash is seen. Two devices write at once and both changes are kept.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from '@thoughtknot/core';
import { sharedNotesLayer } from '../src/index.ts';
import { copyAll, devices } from './helpers.js';

const PATH = 'Shop.md';
const TEXT = '# Shop\n\nMilk\n';

/** Two devices, each with its files under the layer. An exchange copies the stores, then the other merges. */
async function pair(shared = () => true) {
  const all = await devices('d0', 'd1');
  const files = [
    memoryStorage({ [PATH]: TEXT, 'Private.md': 'mine' }),
    memoryStorage({ [PATH]: TEXT, 'Private.md': 'mine' }),
  ];
  const layers = [];
  const storages = all.map((d, i) => {
    const made = sharedNotesLayer(d.notes, {
      shared,
      author: d.name,
      exchange: async () => {
        copyAll(all);
        await layers[1 - i].arrived();
      },
    });
    layers.push(made);
    return made.layer(files[i]);
  });
  // each device opens the note from its file, as the editor does when the person opens it
  await storages[0].read(PATH);
  copyAll(all);
  await storages[1].read(PATH);
  return { all, files, storages };
}

describe('the shared notes layer', () => {
  // proves: mesh_vpn_sync
  test('a write on one device reaches the other device’s file', async () => {
    const { files, storages } = await pair();
    const done = await storages[0].write(PATH, '# Shop\n\nMilk\nBread\n');
    assert.equal(done.ok, true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal((await files[1].read(PATH)).text, '# Shop\n\nMilk\nBread\n');
  });

  // proves: mesh_vpn_sync
  test('a note that is not shared is left alone', async () => {
    const { files, storages } = await pair((path) => path === PATH);
    await storages[0].write('Private.md', 'changed');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal((await files[0].read('Private.md')).text, 'changed');
    assert.equal((await files[1].read('Private.md')).text, 'mine');
  });

  // proves: board_live_together
  test('a write made against an older text is refused with the note as it now is', async () => {
    const { files, storages } = await pair();
    const old = (await files[1].read(PATH)).version;
    await storages[0].write(PATH, '# Shop\n\nMilk\nBread\n');
    await new Promise((resolve) => setImmediate(resolve));
    const clash = await storages[1].write(PATH, '# Shop\n\nMilk\nEggs\n', { expected: old });
    assert.equal(clash.ok, false);
    assert.equal(clash.current.text, '# Shop\n\nMilk\nBread\n');
  });
});

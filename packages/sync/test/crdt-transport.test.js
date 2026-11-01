// The CRDT carries every author's edits between devices (editor spec §40, crdt_transport). Roger, 28 Oct 2026 (Q-11 C):
// one Automerge text per note, with anchors. Here two devices and an AI author edit one note at once. Their edits merge
// with no conflict file, the note is read again from the merged text, and a clash of meaning is a contested claim.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { NoteCrdt, MemoryStore, spliceBetween } from '../src/index.ts';
import { NOTE, TEXT, at, copyAll, devices } from './helpers.js';

describe('crdt_transport', () => {
  // proves: crdt_transport
  test('concurrent edits on two devices merge with no conflict file, the index rebuilds, and a meaning clash is contested', async () => {
    const [desk, phone] = await devices('desktop', 'phone');
    await desk.notes.open(NOTE, TEXT);
    copyAll([desk, phone]);
    await phone.notes.open(NOTE, TEXT);
    const price = at(TEXT, '10');
    await desk.notes.edit(NOTE, price, price + 2, '12', 'Roger');
    await phone.notes.edit(NOTE, price, price + 2, '14', 'Roger');
    const end = at(TEXT, '\n```\n');
    await phone.notes.edit(NOTE, end, end, "\n(g:Product {name: 'Gadget', price: 3})", 'Claude');
    copyAll([desk, phone]);
    const joined = await desk.notes.sync(NOTE);
    await phone.notes.sync(NOTE);

    const text = desk.notes.read(NOTE).text;
    assert.equal(phone.notes.read(NOTE).text, text, 'both devices hold the same text');
    for (const store of [desk.store, phone.store])
      for (const byDevice of store.files.values()) assert.ok(byDevice.size <= 2, 'one file for each device, no copy');
    const things = desk.notes
      .read(NOTE)
      .reading.graphs.get('shop')
      .boxes.map((b) => b.key);
    assert.ok(things.includes('g'), 'the note is read again from the merged text: the AI author’s thing is there');
    assert.deepEqual(joined.contested, ['claim:join/w/price=12@ours', 'claim:join/w/price=14@theirs']);
    assert.deepEqual(
      desk.notes
        .history(NOTE)
        .map((m) => m.author)
        .sort(),
      ['Claude', 'Roger', 'Roger'],
    );
  });

  // proves: crdt_transport
  test('edits that do not clash merge with nothing contested, and every author is kept with their change', async () => {
    const [desk, phone] = await devices('desktop', 'phone');
    await desk.notes.open(NOTE, TEXT);
    copyAll([desk, phone]);
    await phone.notes.open(NOTE, TEXT);
    await desk.notes.edit(NOTE, 0, 0, 'Prices for autumn.\n', 'Roger');
    const end = at(TEXT, '\n```\n');
    await phone.notes.edit(NOTE, end, end, "\n(g:Product {name: 'Gadget', price: 3})", 'Claude');
    copyAll([desk, phone]);
    const joined = await desk.notes.sync(NOTE);
    assert.deepEqual(joined.contested, []);
    assert.ok(desk.notes.read(NOTE).text.startsWith('Prices for autumn.\n# Shop'));
    const made = desk.notes.history(NOTE).map((m) => `${m.author} on ${m.device}`);
    assert.deepEqual(made.sort(), ['Claude on phone', 'Roger on desktop']);
  });

  // proves: crdt_transport
  test('an anchor stays on its statement through other devices’ edits', async () => {
    const [desk, phone] = await devices('desktop', 'phone');
    await desk.notes.open(NOTE, TEXT);
    copyAll([desk, phone]);
    await phone.notes.open(NOTE, TEXT);
    const pinned = desk.notes.anchor(NOTE, at(TEXT, '(w:'));
    await phone.notes.edit(NOTE, 0, 0, 'A line written on the phone.\n\n', 'Roger');
    copyAll([desk, phone]);
    await desk.notes.sync(NOTE);
    const now = desk.notes.read(NOTE).text;
    assert.equal(desk.notes.place(NOTE, pinned), at(now, '(w:'));
  });

  // proves: crdt_transport
  test('every editor is told of each change, its own and a merge’s, as one splice of the text', async () => {
    const [desk, phone] = await devices('desktop', 'phone');
    await desk.notes.open(NOTE, TEXT);
    copyAll([desk, phone]);
    await phone.notes.open(NOTE, TEXT);
    const told = [];
    const stop = desk.notes.onChange(NOTE, (c) => told.push(c.splice));
    await desk.notes.edit(NOTE, 0, 1, '##', 'Roger');
    await phone.notes.edit(NOTE, TEXT.length, TEXT.length, 'End.\n', 'Roger');
    copyAll([desk, phone]);
    await desk.notes.sync(NOTE);
    stop();
    await desk.notes.edit(NOTE, 0, 0, 'x', 'Roger');
    assert.deepEqual(told, [
      { from: 0, to: 1, text: '##' },
      { from: TEXT.length + 1, to: TEXT.length + 1, text: 'End.\n' },
    ]);
  });

  // proves: crdt_transport
  test('an edit made outside the editor becomes one small splice, and the same text is no change', async () => {
    const [desk] = await devices('desktop');
    await desk.notes.open(NOTE, TEXT);
    assert.deepEqual(spliceBetween('abcdef', 'abXYef'), { from: 2, to: 4, text: 'XY' });
    assert.equal(await desk.notes.fromDisk(NOTE, TEXT, 'git'), undefined);
    assert.equal(desk.notes.history(NOTE).length, 0);
    await desk.notes.fromDisk(NOTE, TEXT.replace('Widget', 'Sprocket'), 'git');
    assert.equal(desk.notes.read(NOTE).text, TEXT.replace('Widget', 'Sprocket'));
    assert.deepEqual(desk.notes.history(NOTE), [{ author: 'git', device: 'desktop' }]);
  });

  // proves: crdt_transport
  test('two devices that start the same note from the same text start it once', async () => {
    const [a, b] = [new MemoryStore(), new MemoryStore()];
    const [one, two] = [new NoteCrdt(a, 'desktop'), new NoteCrdt(b, 'phone')];
    await one.open(NOTE, TEXT);
    await two.open(NOTE, TEXT);
    a.copyFrom(b);
    b.copyFrom(a);
    await one.merge(NOTE);
    await two.merge(NOTE);
    assert.equal(one.text(NOTE), TEXT);
    assert.equal(two.text(NOTE), TEXT);
  });
});

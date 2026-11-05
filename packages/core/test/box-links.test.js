// Linking by a drop (editor spec §72): box-links.ts. A box let go in the middle of another box links the two
// (edit_gestures). Let go by its edge, or beside it, it moves as before. Where the card cannot write, it only moves.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// proves: edit_gestures
test('a box let go in the middle of another links them; by its edge or beside it, it moves as before', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { linkDrops } = await import('../src/display/graph-view/box-links.ts');
    const linked = [];
    let writable = true;
    const links = { canWrite: () => writable, linkDrop: (from, to) => linked.push([from, to]) };
    const moved = { other: 'cy', said: 'Put Ann beside Cy', write: () => linked.push(['moved']) };
    const inner = { nowhere: () => 'nowhere', drop: () => moved };
    const text = { ann: 'Ann', cy: 'Cy' };
    const drops = linkDrops(
      links,
      (k) => text[k] ?? k,
      () => {},
      inner,
    );
    const boxes = [
      { key: 'ann', left: 0, top: 0, right: 100, bottom: 40 },
      { key: 'cy', left: 200, top: 0, right: 300, bottom: 40 },
    ];
    const middle = drops.drop('ann', { x: 250, y: 20 }, boxes);
    assert.equal(middle.other, 'cy');
    assert.equal(middle.said, 'Let go to link Ann to Cy');
    middle.write();
    assert.deepEqual(linked, [['ann', 'cy']]);
    assert.equal(drops.drop('ann', { x: 205, y: 20 }, boxes), moved, 'by its edge, it moves');
    assert.equal(drops.drop('ann', { x: 250, y: 60 }, boxes), moved, 'beside it, it moves');
    assert.equal(drops.drop('ann', { x: 50, y: 20 }, boxes), moved, 'on itself, nothing links');
    writable = false;
    assert.equal(drops.drop('ann', { x: 250, y: 20 }, boxes), moved, 'where nothing can be written, it only moves');
    assert.equal(drops.nowhere('ann'), 'nowhere');
  } finally {
    uninstall();
  }
});

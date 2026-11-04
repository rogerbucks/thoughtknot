// Undo a move (editor spec §68, move_undo): move-undo.ts. Each move written offers its undo in a toast, and by
// Ctrl+Z or Cmd+Z. The offer outlives the card, so the card drawn again after the write offers it too.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// proves: move_undo
test('a move offers its undo by toast and Ctrl+Z, once, and in the card drawn again', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { MoveUndo, UNDO_MS } = await import('../src/display/graph-view/move-undo.ts');
    const vp = doc.createElement('div');
    const first = new MoveUndo(vp, 'team');
    assert.equal(vp.querySelector('.thoughtknot-undo-toast'), null, 'no toast before a move');
    let undone = 0;
    first.offer('Moved: Put Ann beside Cy', () => undone++);
    const toast = vp.querySelector('.thoughtknot-undo-toast');
    assert.equal(toast.getAttribute('role'), 'status');
    assert.ok(!toast.classList.contains('is-hidden'));
    assert.equal(toast.querySelector('.thoughtknot-undo-said').textContent, 'Moved: Put Ann beside Cy');
    first.onunload();
    // the note written, the card is drawn again: the new one offers the same undo
    const vp2 = doc.createElement('div');
    const again = new MoveUndo(vp2, 'team');
    const toast2 = vp2.querySelector('.thoughtknot-undo-toast');
    assert.ok(!toast2.classList.contains('is-hidden'), 'still offered after the redraw');
    assert.equal(new MoveUndo(doc.createElement('div'), 'other').undo(), false, 'not in another graph');
    assert.equal(again.key({ key: 'z', ctrlKey: true, shiftKey: false }), true);
    assert.equal(undone, 1);
    assert.ok(toast2.classList.contains('is-hidden'), 'gone once used');
    assert.equal(again.key({ key: 'z', metaKey: true }), false, 'only once');
    // the button does the same; Shift+Ctrl+Z does not
    again.offer('Moved: Ann', () => undone++);
    assert.equal(again.key({ key: 'Z', ctrlKey: true, shiftKey: true }), false);
    toast2.querySelector('button').click();
    assert.equal(undone, 2);
    assert.equal(toast2.querySelector('button').getAttribute('aria-label'), 'Undo the last move');
    // after its time, a move can no longer be taken back
    const now = Date.now;
    again.offer('Moved: Cy', () => undone++);
    Date.now = () => now() + UNDO_MS + 1;
    try {
      assert.equal(again.undo(), false);
    } finally {
      Date.now = now;
      again.forget();
    }
  } finally {
    uninstall();
  }
});

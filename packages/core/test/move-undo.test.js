// Undo and redo every edit (editor spec §68, move_undo; §72, edit_undo): move-undo.ts. Each edit written offers its
// undo in a toast, and by Ctrl+Z or Cmd+Z, last first. The history outlives the card, so the card drawn again offers it.
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
    // the button does the same; Shift+Ctrl+Z redoes, and this move gave no redo
    again.offer('Moved: Ann', () => undone++);
    assert.equal(again.key({ key: 'Z', ctrlKey: true, shiftKey: true }), false);
    toast2.querySelector('button').click();
    assert.equal(undone, 2);
    assert.equal(toast2.querySelector('button').getAttribute('aria-label'), 'Undo the last edit');
    again.forget();
  } finally {
    uninstall();
  }
});

// proves: edit_undo
test('every edit undoes in turn, last first, long after the toast; redo does it again; one toast per drawing', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { MoveUndo, UNDO_MS, UNDO_MOST } = await import('../src/display/graph-view/move-undo.ts');
    const vp = doc.createElement('div');
    const u = new MoveUndo(vp, 'steps');
    const log = [];
    const edit = (name) =>
      u.offer(
        name,
        () => log.push(`undo ${name}`),
        () => log.push(`redo ${name}`),
      );
    edit('Renamed to Plan');
    edit('Added Risk');
    edit('Linked to Goal');
    const now = Date.now;
    Date.now = () => now() + UNDO_MS * 10;
    try {
      assert.equal(u.key({ key: 'z', ctrlKey: true }), true, 'Ctrl+Z works after the toast has gone');
      await Promise.resolve();
      assert.equal(u.key({ key: 'z', metaKey: true }), true);
      await Promise.resolve();
      assert.deepEqual(log, ['undo Linked to Goal', 'undo Added Risk']);
      const toast = vp.querySelector('.thoughtknot-undo-toast');
      assert.equal(toast.querySelector('.thoughtknot-undo-said').textContent, 'Undone: Added Risk');
      const redo = toast.querySelector('.thoughtknot-redo');
      assert.ok(!redo.classList.contains('is-hidden'), 'Redo is offered once something is undone');
      assert.equal(u.key({ key: 'z', ctrlKey: true, shiftKey: true }), true, 'Ctrl+Shift+Z redoes');
      await Promise.resolve();
      assert.equal(u.key({ key: 'y', ctrlKey: true }), true, 'and Ctrl+Y');
      await Promise.resolve();
      assert.deepEqual(log.slice(2), ['redo Added Risk', 'redo Linked to Goal']);
      assert.equal(u.redo(), false, 'nothing more to redo');
      // a new edit clears what could be redone
      u.undo();
      edit('Deleted Risk');
      assert.equal(u.redo(), false);
      // a second undo of the same drawing shares its toast
      new MoveUndo(vp, 'steps').offer('Moved: Plan', () => {});
      assert.equal(vp.querySelectorAll('.thoughtknot-undo-toast').length, 1);
    } finally {
      Date.now = now;
    }
    // an undo the note no longer allows says why, and is let go
    const w = new MoveUndo(doc.createElement('div'), 'stale');
    w.offer('Renamed to Plan', () => 'The block changed in the note');
    w.undo();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(w.undo(), false, 'let go');
    // the history keeps the last edits only
    const many = new MoveUndo(doc.createElement('div'), 'many');
    let undone = 0;
    for (let i = 0; i < UNDO_MOST + 5; i++) many.offer(`Edit ${i}`, () => undone++);
    while (many.undo());
    assert.equal(undone, UNDO_MOST);
    many.forget();
    u.forget();
    w.forget();
  } finally {
    uninstall();
  }
});

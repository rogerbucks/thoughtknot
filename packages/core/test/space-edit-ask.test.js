// How the view in space asks its card for an edit (editor spec §72, edit_gestures): space-edit.ts. The card takes an
// edit by saying so, and where no card takes it, the view does as it did before.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SPACE_EDIT, askEdit } from '../src/display/graph-view/space-edit.ts';

describe('an edit asked of the card', () => {
  // proves: edit_gestures
  test('is taken when the card says so, and not taken when nothing listens or the card lets it go', () => {
    const root = new EventTarget(),
      heard = [];
    assert.equal(askEdit(root, { add: true }), false, 'no card listens: not taken');
    let takes = true;
    root.addEventListener(SPACE_EDIT, (e) => {
      heard.push(e.detail);
      if (takes) e.preventDefault();
    });
    assert.equal(askEdit(root, { rename: 'ada' }), true);
    takes = false;
    assert.equal(askEdit(root, { link: ['ada', 'bob'] }), false, 'a card that cannot write lets it go');
    assert.deepEqual(heard, [{ rename: 'ada' }, { link: ['ada', 'bob'] }]);
  });
});

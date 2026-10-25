// Full screen shows a drawing flat or in space, as its card does (editor spec §53, full_keeps_space). Here are
// full-screen.ts and type-place.ts. Closed, the card it was opened from is shown as full screen was left.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDocument, installGlobals } from '../../obsidian/test/host/fake-dom.js';

// proves: full_keeps_space
test('full screen opens in space as its card is, and its card is shown as full screen was left', async () => {
  const doc = fakeDocument(),
    uninstall = installGlobals(doc);
  try {
    const { FullScreen } = await import('../src/display/graph-view/full-screen.ts');
    const { TypePlace } = await import('../src/display/graph-view/type-place.ts');
    // the card's options handed to its full-screen card: in space as the card is, flat when it is flat
    const o = { graph: 'Team', mode: 'note' };
    assert.equal(new TypePlace().forFull(o, 'balls').inSpace, 'balls');
    assert.equal(new TypePlace().forFull(o, null).inSpace, undefined);
    const typed = new TypePlace().forFull({ ...o, diagram: { kept: () => undefined } }, 'cards');
    assert.equal(typed.inSpace, 'cards', 'a card with a diagram type too');
    // closed, the card hears from the full-screen card it drew, so it can be shown as that was left
    const full = { left: 'cards', onload() {}, onunload() {} };
    const heard = [];
    const screen = new FullScreen({
      graph: 'Team',
      card: { addChild() {}, removeChild() {} },
      draw: () => full,
      closed: (view) => heard.push(view.left),
    });
    screen.show();
    screen.hide();
    assert.deepEqual(heard, ['cards']);
  } finally {
    uninstall();
  }
});

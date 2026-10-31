// Set to redraw once done, typing holds the redraw until the text is left (editor spec §4, redraw_while_typing; risk
// NEURO-7): typing-rests.ts. After each pause, the default, it waits a moment and redraws.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDocument, installGlobals } from '../../obsidian/test/host/fake-dom.js';

// proves: redraw_while_typing
test('set to redraw once done, typing holds the redraw until the text is left; after each pause it waits a moment', async () => {
  const uninstall = installGlobals(fakeDocument());
  try {
    const { TypingRests } = await import('../src/display/editor/typing-rests.ts');
    // the page's clock, run by hand: each wait set is kept until run
    const waits = new Map();
    let n = 0;
    window.setTimeout = (fn, ms) => (waits.set(++n, { fn, ms }), n);
    window.clearTimeout = (id) => waits.delete(id);
    const run = () => [...waits.entries()].forEach(([id, w]) => (waits.delete(id), w.fn()));
    let held = true;
    const drawn = [];
    const rests = new TypingRests('pane', { write() {}, draw: () => drawn.push('drawn'), held: () => held });
    rests.typed();
    run();
    assert.deepEqual(drawn, [], 'nothing moves while typing, however long it rests');
    rests.left();
    assert.deepEqual(drawn, ['drawn'], 'drawn as the text is left');
    rests.left();
    assert.deepEqual(drawn, ['drawn'], 'once');
    held = false;
    rests.typed();
    assert.deepEqual([...waits.values()].map((w) => w.ms).sort(), [150, 250], 'the write, then the redraw');
    run();
    assert.deepEqual(drawn, ['drawn', 'drawn'], 'after a pause');
    rests.unload();
  } finally {
    uninstall();
  }
});

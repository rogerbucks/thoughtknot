// The stand-in page's animation frames end with the page. Taking its globals down cancels every frame still to come.
// So a frame asked for during a test never runs after it. There it would find no window, and fail the whole file.
// It keeps the proofs of sheet_side_wide, in details-sheet-dock.test.js, running on a Mac.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDocument, installGlobals } from './host/fake-dom.js';

test('a frame still to come when the globals are taken down never runs', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const doc = fakeDocument();
  const uninstall = installGlobals(doc);
  let ran = false;
  doc.defaultView.requestAnimationFrame(() => (ran = true));
  uninstall();
  t.mock.timers.tick(1);
  assert.equal(ran, false);
});

test('a frame runs as before while the globals are up, and a cancelled one does not', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const doc = fakeDocument();
  const uninstall = installGlobals(doc);
  try {
    const seen = [];
    doc.defaultView.requestAnimationFrame((t) => seen.push(['kept', typeof t]));
    const id = doc.defaultView.requestAnimationFrame(() => seen.push(['cancelled']));
    doc.defaultView.cancelAnimationFrame(id);
    t.mock.timers.tick(1);
    assert.deepEqual(seen, [['kept', 'number']]);
    assert.equal(doc.frames.size, 0);
  } finally {
    uninstall();
  }
});

// The stand-in page's animation frames end with the page. Taking its globals down cancels every frame still to come,
// so a frame asked for during a test never runs after it, where it would find no window and fail the whole file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { fakeDocument, installGlobals } from './host/fake-dom.js';

test('a frame still to come when the globals are taken down never runs', async () => {
  const doc = fakeDocument();
  const uninstall = installGlobals(doc);
  let ran = false;
  doc.defaultView.requestAnimationFrame(() => (ran = true));
  uninstall();
  await wait(20);
  assert.equal(ran, false);
});

test('a frame runs as before while the globals are up, and a cancelled one does not', async () => {
  const doc = fakeDocument();
  const uninstall = installGlobals(doc);
  try {
    const seen = [];
    doc.defaultView.requestAnimationFrame((t) => seen.push(['kept', typeof t]));
    const id = doc.defaultView.requestAnimationFrame(() => seen.push(['cancelled']));
    doc.defaultView.cancelAnimationFrame(id);
    await wait(20);
    assert.deepEqual(seen, [['kept', 'number']]);
    assert.equal(doc.frames.size, 0);
  } finally {
    uninstall();
  }
});

// Adaptive hover (editor spec §68, hover_adaptive): pointer-moving.ts. A drawing is marked while a mouse or pen moves.
// The mark goes once it stops, and styles.css makes a highlight wait only under that mark.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// proves: hover_adaptive
test('a drawing is marked moving while the mouse moves, and not once it stops or for touch', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { watchMoving, MOVING_QUIET } = await import('../src/display/graph-view/pointer-moving.ts');
    const el = doc.createElement('div');
    const timers = [];
    const stop = watchMoving(
      el,
      MOVING_QUIET,
      (fn, ms) => timers.push({ fn, ms, on: true }) - 1,
      (i) => (timers[i].on = false),
    );
    el.dispatch('pointermove', { pointerType: 'mouse' });
    assert.ok(el.classList.contains('is-moving'));
    el.dispatch('pointermove', { pointerType: 'pen' });
    assert.equal(timers.filter((t) => t.on).length, 1, 'each move restarts the wait');
    assert.equal(timers.at(-1).ms, MOVING_QUIET);
    timers.at(-1).fn();
    assert.ok(!el.classList.contains('is-moving'), 'stopped, so a highlight opens at once');
    el.dispatch('pointermove', { pointerType: 'touch' });
    assert.ok(!el.classList.contains('is-moving'), 'touch has no hover');
    el.dispatch('pointermove', { pointerType: 'mouse' });
    stop();
    assert.ok(!el.classList.contains('is-moving'));
    el.dispatch('pointermove', { pointerType: 'mouse' });
    assert.ok(!el.classList.contains('is-moving'), 'no longer watched');
  } finally {
    uninstall();
  }
});

// proves: hover_adaptive
test('the highlight waits only while the pointer is moving', () => {
  const css = readFileSync(new URL('../../../styles.css', import.meta.url), 'utf8');
  assert.match(
    css,
    /\.thoughtknot-svg\.is-moving g\.thoughtknot-hot,\n\.thoughtknot-svg\.is-moving \.thoughtknot-cloud-unit:hover > \.thoughtknot-cloud-peek \{\n  transition-delay: var\(--gn-motion-fade\);/,
  );
  assert.match(css, /\.thoughtknot-svg\.is-moving g\.edge\.thoughtknot-hot > path \{\n    transition-delay/);
});

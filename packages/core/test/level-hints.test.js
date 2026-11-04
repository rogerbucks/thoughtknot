// One-line hints and the arrow legend (editor spec §68, level_hints): level-hints.ts. Each kind of level has one short
// hint, shown the first time it shows, then gone. While roads show, the arrows are explained.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// proves: level_hints
test("each level's hint shows once, then is gone, and the arrows are explained while roads show", async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { LevelHints, forgetHints } = await import('../src/display/graph-view/level-hints.ts');
    forgetHints();
    const parent = doc.createElement('div');
    const hints = new LevelHints(parent);
    const hint = parent.querySelector('.thoughtknot-level-hint'),
      arrows = parent.querySelector('.thoughtknot-level-arrows');
    hints.show({ at: 0, count: 3 });
    assert.match(hint.textContent, /^Tap a cloud/);
    assert.equal(hint.textContent.split('\n').length, 1, 'one line');
    assert.ok(!arrows.classList.contains('is-hidden'));
    assert.equal(arrows.textContent, '→ out · ← in · ⇄ both');
    hints.show({ at: 2, count: 3 });
    assert.match(hint.textContent, /^Every item shows/);
    assert.ok(arrows.classList.contains('is-hidden'), 'no roads, no arrows');
    hints.show({ at: 0, count: 3 });
    assert.ok(hint.classList.contains('is-hidden'), 'shown once, then gone');
    // another card does not say it again
    const other = doc.createElement('div');
    new LevelHints(other).show({ at: 0, count: 3 });
    assert.ok(other.querySelector('.thoughtknot-level-hint').classList.contains('is-hidden'));
  } finally {
    uninstall();
  }
});

// The new rendering's stage (editor spec §73, render_switch): display/graph-view/render-stage.ts. With the setting on, a
// graph with levels is drawn on one canvas over its card; Ctrl and the wheel step one level; unloading puts today's
// drawing back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, OPTIONS, settingsFrom } from '../src/settings.ts';

/** A drawing of two subjects, each with two areas of four boxes, named by property. */
function drawingAndGraph() {
  const boxes = [],
    props = new Map();
  for (const subject of ['Work', 'Money'])
    for (const area of ['A', 'B'])
      for (let i = 0; i < 4; i++) {
        const key = `${subject[0]}${area}${i}`;
        boxes.push({ key, label: key, kinds: ['Item'] });
        props.set(key, { name: key, subject, area });
      }
  const g = { nodes: props, p: (k) => props.get(k) };
  return { drawing: { boxes, links: [], estimates: [] }, g };
}

// proves: render_switch
test('the setting is on until turned off, and the settings page offers it', () => {
  assert.equal(DEFAULT_SETTINGS.newRendering, 'on');
  assert.equal(settingsFrom({ newRendering: 'off' }).newRendering, 'off');
  assert.equal(settingsFrom({ newRendering: 'maybe' }).newRendering, 'on');
  assert.equal(OPTIONS.find((o) => o.key === 'newRendering')?.section, 'Drawing');
});

// proves: render_switch
test('the stage covers the card, steps one level per Ctrl-wheel notch, and unloads cleanly', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { RenderStage, STEP_MS, hasLevels } = await import('../src/display/graph-view/render-stage.ts');
    const { drawing, g } = drawingAndGraph();
    assert.ok(hasLevels(drawing, g));
    const viewport = doc.createElement('div');
    doc.body.appendChild(viewport);
    const stage = new RenderStage(viewport, drawing, g);
    assert.ok(viewport.classList.contains('thoughtknot-new-rendering'));
    assert.equal(viewport.querySelector('canvas.thoughtknot-render-stage'), stage.canvas);
    const at = () => Number(/^Level (\d) of 3 · /.exec(stage.level())[1]);
    const start = at();
    assert.ok(start < 3, 'a small card does not open every level at once');
    const notch = {
      ctrlKey: true,
      deltaY: -100,
      clientX: 400,
      clientY: 200,
      preventDefault() {},
      stopPropagation() {},
    };
    stage.wheel({ ...notch, metaKey: false });
    const once = stage.canvas.getAttribute('aria-label');
    stage.wheel({ ...notch, metaKey: false });
    assert.equal(stage.canvas.getAttribute('aria-label'), once, 'a second notch too soon is the same swipe');
    // notch by notch, the level goes up one at a time until the last
    const seen = [start, at()];
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, STEP_MS + 10));
      stage.wheel({ ...notch, metaKey: false });
      seen.push(at());
    }
    for (let i = 1; i < seen.length; i++) assert.ok([0, 1].includes(seen[i] - seen[i - 1]), seen.join());
    assert.equal(seen.at(-1), 3);
    stage.wheel({ ...notch, ctrlKey: false, metaKey: false });
    stage.unload();
    assert.ok(!viewport.classList.contains('thoughtknot-new-rendering'));
    assert.equal(viewport.querySelector('canvas'), null);
  } finally {
    uninstall();
  }
});

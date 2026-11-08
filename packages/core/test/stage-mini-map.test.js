// The new rendering's mini-map (editor spec §24, mini_map and mini_map_setting), on a stage in the fake page.
import { test } from 'node:test';
import assert from 'node:assert/strict';

/** Two subjects of two areas of four things each. */
function drawingAndGraph() {
  const boxes = [],
    props = new Map();
  for (const subject of ['Work', 'Money'])
    for (const area of ['A', 'B'])
      for (let i = 0; i < 4; i++) {
        const key = `${subject[0]}${area}${i}`;
        boxes.push({ key, text: key, label: key, kinds: ['Item'] });
        props.set(key, { name: key, subject, area });
      }
  const g = { nodes: props, p: (k) => props.get(k) };
  return { drawing: { boxes, links: [], estimates: [] }, g };
}

// proves: mini_map
test('the mini-map paints the drawing in its own look, outlines the part in view, and a press moves the view there', async () => {
  // Roger, 7 Nov 2026: the mini-map should reflect the overall look, not squares
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { GLIDE_MS, RenderStage, stageFor } = await import('../src/display/graph-view/render-stage.ts');
    const { drawing, g } = drawingAndGraph();
    const viewport = doc.createElement('div');
    doc.body.appendChild(viewport);
    const stage = new RenderStage(viewport, drawing, g);
    const mini = stage.mini;
    assert.ok(mini, 'shown by default');
    assert.ok(mini.canvas.classList.contains('thoughtknot-mini-map'), 'in the mini-map’s corner slot');
    // zoomed in: the outline is a small part of the copy
    const [work, money] = stage.scene.named;
    const w = stage.spots.get(work);
    stage.view = { ...stage.view, scale: stage.view.scale * 6, x: w.x, y: w.y };
    stage.draw();
    const f = mini.frame();
    assert.ok(f.w < 160 && f.h < 120, 'the part in view, outlined small');
    // a press on Money's place on the copy brings Money to the middle, at the same zoom
    const m = stage.spots.get(money);
    const scale = stage.view.scale;
    const whole = mini.whole;
    mini.moveTo({ clientX: (m.x - whole.x) * whole.scale, clientY: (m.y - whole.y) * whole.scale });
    assert.equal(stage.view.scale, scale);
    const x = (m.x - stage.view.x) * scale,
      y = (m.y - stage.view.y) * scale;
    assert.ok(Math.abs(x - stage.view.w / 2) < 2 && Math.abs(y - stage.view.h / 2) < 2, 'Money is in the middle');
    // a press during a glide wins: the glide stops, and the view stays where the press put it
    const win = viewport.win ?? globalThis;
    win.matchMedia = () => ({ matches: false });
    stage.glideTo({ ...stage.view, x: w.x, y: w.y });
    mini.moveTo({ clientX: (m.x - whole.x) * whole.scale, clientY: (m.y - whole.y) * whole.scale });
    const pressed = { ...stage.view };
    await new Promise((r) => setTimeout(r, GLIDE_MS + 80));
    assert.deepEqual(stage.view, pressed, 'the glide under way stopped');
    stage.unload();
    assert.ok(!mini.canvas.parentElement, 'gone with the stage');
    // the mini-map setting, through the card's own options. Off has none. Auto shows it only while the drawing does not fit.
    // the fake page gives every element the viewport's size: here the mini-map is its own 160 by 120, in the corner
    const proto = Object.getPrototypeOf(viewport),
      box = proto.getBoundingClientRect;
    proto.getBoundingClientRect = function () {
      if (!this.classList?.contains('thoughtknot-stage-mini')) return box.call(this);
      return { left: 630, top: 270, right: 790, bottom: 390, width: 160, height: 120 };
    };
    const o = (miniMap) => ({
      aids: { newRendering: true, miniMap },
      reading: { graphs: new Map([['x', drawing]]), world: { x: g } },
      graph: 'x',
    });
    const off = stageFor(viewport, o('off'));
    assert.equal(off.mini, null, 'off: none');
    off.unload();
    const always = stageFor(viewport, o('always'));
    assert.equal(always.mini.canvas.hidden, false, 'always: shown with the whole drawing in view');
    always.unload();
    const auto = stageFor(viewport, o('auto'));
    assert.equal(auto.mini.canvas.hidden, true, 'auto: hidden while the drawing fits');
    auto.view = { ...auto.view, scale: auto.view.scale * 4 };
    auto.draw();
    assert.equal(auto.mini.canvas.hidden, false, 'auto: shown once zoomed past the fit');
    auto.unload();
    proto.getBoundingClientRect = box;
  } finally {
    uninstall();
  }
});

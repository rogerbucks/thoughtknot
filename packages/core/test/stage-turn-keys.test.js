// 2.5D and 3D on the new rendering turn and tip by keys and buttons, not only by a drag: stage-turn-keys.ts.
// Flat 2D shows no turn buttons, and leaves the keys alone (controls_keys, space_turns_round_pick).
import { test } from 'node:test';
import assert from 'node:assert/strict';

// proves: controls_keys
test('tilted, Shift + arrows and the dock buttons turn and tip the camera; flat, they are hidden and keys pass', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { installHost } = await import('../src/display/host.ts');
    installHost({ icon: () => {}, isPhone: () => false, notice: () => {}, menu: () => {} });
    const { turnControls } = await import('../src/display/graph-view/stage-turn-keys.ts');
    const root = doc.createElement('div');
    doc.body.appendChild(root);
    const dock = root.createDiv({ cls: 'thoughtknot-dock thoughtknot-view-dock' });
    dock.createDiv({ cls: 'thoughtknot-dock-body' });
    const viewport = root.createDiv({ cls: 'thoughtknot-viewport' });
    const turns = [];
    let tilted = false;
    const stage = { turnBy: (dx, dy) => (tilted ? (turns.push([dx, dy]), true) : false) };
    const controls = turnControls(root, viewport, stage);
    const buttons = dock.querySelectorAll('button');
    assert.equal(buttons.length, 4, 'turn left, turn right, tilt up, tilt down');
    assert.deepEqual(
      buttons.map((b) => b.getAttribute('aria-label')),
      ['Turn left', 'Turn right', 'Tilt up', 'Tilt down'],
    );
    controls.shown(false);
    assert.ok(
      buttons.every((b) => b.hidden),
      'flat: no turn buttons',
    );
    const key = (k, init = {}) => viewport.dispatch('keydown', { key: k, shiftKey: true, ...init });
    assert.equal(key('ArrowLeft').defaultPrevented, false, 'flat: Shift + arrow is left to the card');
    tilted = true;
    controls.shown(true);
    assert.ok(
      buttons.every((b) => !b.hidden),
      'tilted: the buttons show',
    );
    assert.ok(key('ArrowLeft').defaultPrevented);
    key('ArrowRight');
    key('ArrowUp');
    key('ArrowDown');
    const [left, right, up, down] = turns;
    assert.ok(left[0] < 0 && right[0] > 0 && up[1] < 0 && down[1] > 0, JSON.stringify(turns));
    // a plain arrow walks the selection as before, and a field typed in keeps its keys
    assert.equal(key('ArrowLeft', { shiftKey: false }).defaultPrevented, false);
    const field = viewport.createEl('input');
    assert.equal(field.dispatch('keydown', { key: 'ArrowLeft', shiftKey: true }).defaultPrevented, false);
    buttons[0].click();
    assert.deepEqual(turns.at(-1), left, 'the button turns as the key does');
    controls.unload();
    assert.equal(dock.querySelectorAll('button').length, 0, 'gone with the stage');
    assert.equal(key('ArrowLeft').defaultPrevented, false, 'and the keys with it');
  } finally {
    uninstall();
  }
});

// proves: controls_keys
test('the stage turns and tips by a step only while tilted, and nothing in the drawing moves', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { RenderStage } = await import('../src/display/graph-view/render-stage.ts');
    const boxes = [],
      props = new Map();
    for (const subject of ['Work', 'Money'])
      for (let i = 0; i < 4; i++) {
        const key = `${subject[0]}${i}`;
        boxes.push({ key, text: key, label: key, kinds: ['Item'] });
        props.set(key, { name: key, subject, area: `${subject}${i % 2}` });
      }
    const viewport = doc.createElement('div');
    doc.body.appendChild(viewport);
    (viewport.win ?? globalThis).matchMedia = (q) => ({ matches: q.includes('reduce') });
    const stage = new RenderStage(
      viewport,
      { boxes, links: [], estimates: [] },
      { nodes: props, p: (k) => props.get(k) },
    );
    const kept = new Map([...stage.spots].map(([k, s]) => [k, { ...s }]));
    assert.equal(stage.turnBy(25, 0), false, 'flat: there is no angle to turn');
    assert.equal(stage.view.turn ?? 0, 0);
    stage.lookFrom('balls');
    const tilt = stage.view.tilt;
    assert.equal(stage.turnBy(25, 0), true);
    assert.ok(stage.view.turn > 0 && stage.view.tilt === tilt, 'across turns');
    stage.turnBy(0, -25);
    assert.ok(stage.view.tilt < tilt, 'up tips it up');
    assert.deepEqual(stage.spots, kept, 'the camera moved, nothing in the drawing did');
    stage.unload();
  } finally {
    uninstall();
  }
});

// proves: render_one_camera
test('a two-finger twist, where the browser reports one, turns the tilted camera with the fingers', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { installHost } = await import('../src/display/host.ts');
    installHost({ icon: () => {}, isPhone: () => false, notice: () => {}, menu: () => {} });
    const { turnControls } = await import('../src/display/graph-view/stage-turn-keys.ts');
    const root = doc.createElement('div');
    doc.body.appendChild(root);
    const viewport = root.createDiv({ cls: 'thoughtknot-viewport' });
    const turns = [];
    let tilted = false;
    const stage = { turnBy: (dx, dy) => (tilted ? (turns.push([dx, dy]), true) : false) };
    const controls = turnControls(root, viewport, stage);
    const twist = (type, rotation) => viewport.dispatch(type, { rotation });
    twist('gesturestart', 0);
    assert.equal(twist('gesturechange', 10).defaultPrevented, false, 'flat: the twist is left to the page');
    tilted = true;
    twist('gesturestart', 0);
    assert.ok(twist('gesturechange', 10).defaultPrevented);
    twist('gesturechange', 15);
    twist('gesturechange', 5);
    const [a, b, c] = turns.map(([dx]) => dx);
    assert.ok(a > 0 && b > 0 && b < a && c < 0, `clockwise turns right, by each change only: ${turns}`);
    assert.ok(
      turns.every(([, dy]) => dy === 0),
      'a twist never tips the camera',
    );
    controls.unload();
    twist('gesturechange', 40);
    assert.equal(turns.length, 3, 'gone with the stage');
  } finally {
    uninstall();
  }
});

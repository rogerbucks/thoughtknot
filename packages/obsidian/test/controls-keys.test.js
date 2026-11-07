// A view's key controls, as data (editor spec §25, controls_keys). Roger, 1 Nov 2026: a view's key controls stay on
// screen without menu diving, with an expander for the rest. Each view lists them; one shared dock draws them.
// - The first five show in the dock's body; the rest wait under More.
// - The 3D view lists its moves so: turn, tilt and how it is shown on screen, help under More. Its [ key folds it.
// - On a tablet, folded, the dock is a rail of the icons (styles.css).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeDocument, installGlobals } from './host/fake-dom.js';
import { rules, winner } from './host/cascade.js';

let doc, uninstall, fillDock, renderDock, spacePad, KEYS_SHOWN;
before(async () => {
  doc = fakeDocument();
  uninstall = installGlobals(doc);
  const { installHost } = await import('../../core/src/display/host.ts');
  installHost({ icon() {}, isPhone: () => false, notice() {}, menu() {} });
  ({ fillDock, KEYS_SHOWN } = await import('../../core/src/display/graph-view/controls-keys.ts'));
  ({ renderDock } = await import('../../core/src/display/graph-view/controls-dock.ts'));
  ({ spacePad } = await import('../../core/src/display/graph-view/space-view-pad.ts'));
});
after(() => uninstall());

const names = (el) => el.querySelectorAll('button').map((b) => b.getAttribute('aria-label'));

// proves: controls_keys
test('a view’s key controls show five in the dock’s body and the rest under More', () => {
  const ran = [];
  const keys = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((name) => ({ name, icon: 'dot', run: () => ran.push(name) }));
  const dock = renderDock(doc.body.createDiv(), 'Keys');
  const buttons = fillDock(dock, keys);
  assert.equal(KEYS_SHOWN, 5);
  assert.deepEqual(names(dock.body), ['A', 'B', 'C', 'D', 'E']);
  assert.deepEqual(names(dock.more), ['F', 'G']);
  assert.ok(dock.el.classList.contains('has-keys'));
  buttons[5].click();
  assert.deepEqual(ran, ['F']);
});

// proves: controls_keys
test('the 3D view lists its moves in that dock: turn, tilt and how it is shown, help under More', () => {
  const el = doc.body.createDiv(),
    moves = [];
  let nexts = 0;
  const { depthButton, rare } = spacePad(
    el,
    'Height by group',
    (m) => moves.push(m),
    () => nexts++,
  );
  const dock = el.querySelector('.thoughtknot-space-pad');
  assert.ok(dock.classList.contains('thoughtknot-dock') && dock.classList.contains('has-keys'));
  const body = dock.querySelector('.thoughtknot-dock-body');
  assert.deepEqual(names(body), ['Turn left', 'Turn right', 'Tilt up', 'Tilt down', 'Height by group']);
  assert.ok(rare === dock.querySelector('.thoughtknot-dock-more-body'));
  assert.deepEqual(names(rare), ['How to move']);
  depthButton.click();
  body.querySelector('button').click();
  assert.equal(nexts, 1);
  assert.ok(moves.length === 1 && 'turn' in moves[0]);
  assert.ok(dock.classList.contains('is-folded'), 'it starts folded (panels_minimised)');
  el.dispatch('keydown', { key: '[' });
  assert.ok(!dock.classList.contains('is-folded'), 'its [ key opens it');
  el.dispatch('keydown', { key: '[' });
  assert.ok(dock.classList.contains('is-folded'), 'and folds it');
});

// proves: panels_minimised
test('a dock starts folded; one the person asked for opens whole; opened, it is open for the session only', async () => {
  const kept = new Map();
  const win = doc.defaultView;
  win.localStorage = {
    getItem: (k) => kept.get(k) ?? null,
    setItem: (k, v) => kept.set(k, String(v)),
  };
  try {
    assert.ok(renderDock(doc.body.createDiv(), 'Fresh').folded(), 'folded from the start');
    assert.ok(!renderDock(doc.body.createDiv(), 'Asked', [], true).folded(), 'one asked for opens whole');
    renderDock(doc.body.createDiv(), 'Opened').fold(false);
    assert.ok(!renderDock(doc.body.createDiv(), 'Opened').folded(), 'open again for the rest of the session');
    const again = await import('../../core/src/display/graph-view/controls-dock.ts?minimised');
    assert.ok(again.renderDock(doc.body.createDiv(), 'Opened').folded(), 'after a restart, folded again');
  } finally {
    delete win.localStorage;
  }
});

// proves: controls_keys
test('on a tablet a folded dock of key controls is a rail of their icons', () => {
  const all = rules(readFileSync(new URL('../../../styles.css', import.meta.url), 'utf8'), 'thoughtknot');
  const folded = { tag: 'div', classes: ['thoughtknot-dock', 'has-keys', 'is-folded'], states: [], ancestors: [] };
  const body = { tag: 'div', classes: ['thoughtknot-dock-body'], states: [], ancestors: [folded] };
  assert.equal(winner(all, body, 'display').value, 'flex');
  assert.equal(winner(all, body, 'flex-direction').value, 'column');
  const plain = { tag: 'div', classes: ['thoughtknot-dock', 'is-folded'], states: [], ancestors: [] };
  const hid = { tag: 'div', classes: ['thoughtknot-dock-body'], states: [], ancestors: [plain] };
  assert.equal(winner(all, hid, 'display').value, 'none', 'a dock of other controls still folds to its head');
});

// proves: controls_stay_closed
test('a dock closed stays closed when drawn again, after a restart too, and the 3D tips close with their own button', async () => {
  const kept = new Map();
  const win = doc.defaultView;
  win.localStorage = {
    getItem: (k) => kept.get(k) ?? null,
    setItem: (k, v) => kept.set(k, String(v)),
  };
  try {
    renderDock(doc.body.createDiv(), 'Shut').fold(true);
    // a fresh copy of the module, as after a restart: only the browser remembers
    const again = await import('../../core/src/display/graph-view/controls-dock.ts?restart');
    assert.ok(again.renderDock(doc.body.createDiv(), 'Shut').folded(), 'it opens closed, as it was left');
    assert.ok(!again.renderDock(doc.body.createDiv(), 'Other', [], true).folded(), 'another dock keeps its own way');
    kept.delete('thoughtknot-space-hints');
    const el = doc.body.createDiv();
    const { help } = spacePad(
      el,
      'Height by group',
      () => {},
      () => {},
    );
    assert.equal(help.hidden, false, 'the tips show the first time');
    help.querySelector('.thoughtknot-space-help-close').click();
    assert.equal(help.hidden, true, 'and close with their own button');
    const { help: next } = spacePad(
      doc.body.createDiv(),
      'Height by group',
      () => {},
      () => {},
    );
    assert.equal(next.hidden, true, 'closed, they stay closed the next time');
  } finally {
    delete win.localStorage;
  }
});

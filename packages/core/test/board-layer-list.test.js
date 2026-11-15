// The Layers list above a board (editor spec ES§45, board_layers). It starts folded to one button. Open, it lists the
// layers top first with the loose items among them. Each row shows, hides, locks, steps, renames or takes out its
// layer. The buttons under the list put the chosen items into the layer picked.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readBoard } from '../src/board.ts';
import { boardEdit } from '../src/board-edit.ts';
import { installHost } from '../src/display/host.ts';
import { LayerList } from '../src/display/board/board-layer-list.ts';

const TEXT = `// graph: ideas · BOARD
(notes:Layer {name: 'Notes', order: 1}),
(back:Layer {name: 'Background', order: -1}),
(a:Sticky {x: 0, y: 0, text: 'Go by train', in_layer: 'notes'}),
(b:Sticky {x: 300, y: 0, text: 'Paris'})`;

let keys = 0;

/** A list in a page with the DOM helpers Obsidian adds, over a board kept as text and written by its changes. */
function list(key = `board ${(keys += 1)}`) {
  const { window } = new JSDOM('<body><div id="root"><div class="vp"></div></div></body>');
  window.Element.prototype.createEl = function (tag, o = {}) {
    const el = this.ownerDocument.createElement(tag);
    if (o.text) el.textContent = o.text;
    if (o.cls) el.className = o.cls;
    for (const [k, v] of Object.entries(o.attr ?? {})) el.setAttribute(k, v);
    this.append(el);
    return el;
  };
  window.Element.prototype.createDiv = function (o) {
    return this.createEl('div', o);
  };
  window.Element.prototype.createSpan = function (o) {
    return this.createEl('span', o);
  };
  window.Element.prototype.addClass = function (c) {
    this.classList.add(c);
  };
  const root = window.document.getElementById('root');
  const vp = root.querySelector('.vp');
  const state = { text: TEXT, said: [], chosen: [], focus: null, changes: [] };
  const l = new LayerList(root, vp, key, {
    board: () => readBoard(state.text).board,
    say: (w) => state.said.push(w),
    chosen: () => state.chosen,
    focus: () => state.focus,
    write: async (change) => {
      state.changes.push(change);
      const r = boardEdit(state.text, change);
      if ('refused' in r) return void state.said.push(r.refused);
      state.text = r.text;
      l.paint();
    },
  });
  const bar = root.querySelector('.thoughtknot-board-layers');
  const fold = bar.querySelector('.thoughtknot-board-layers-fold');
  const panel = bar.querySelector('.thoughtknot-board-layers-list');
  const does = (what) => bar.querySelector(`[data-layer-do="${what}"]`);
  const names = () => [...bar.querySelectorAll('.thoughtknot-board-layer-name')].map((b) => b.textContent);
  return { window, l, state, bar, fold, panel, does, names };
}

beforeEach(() => installHost({ icon: () => {}, isPhone: () => false, notice: () => {}, menu: () => {} }));

describe('the Layers list', () => {
  // proves: board_layers
  test('sits above the board, folded to one button, so it takes no room until asked for', () => {
    const { bar, fold, panel } = list();
    assert.equal(bar.nextElementSibling.className, 'vp', 'above the board');
    assert.equal(fold.getAttribute('aria-expanded'), 'false');
    assert.ok(panel.hidden);
    assert.match(fold.getAttribute('aria-label'), /Show the list/);
  });

  // proves: board_layers
  test('opens to the layers, top first, with the items in no layer at their place, and folds by Escape', () => {
    const { window, fold, panel, names, does } = list();
    fold.click();
    assert.equal(fold.getAttribute('aria-expanded'), 'true');
    assert.deepEqual(names(), ['Notes (1)', 'Items in no layer (1)', 'Background (0)']);
    assert.ok(does('up:notes').disabled, 'the top layer goes no higher');
    assert.ok(does('down:back').disabled, 'the bottom layer goes no lower');
    does('lock:notes').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.ok(panel.hidden);
    assert.equal(window.document.activeElement, fold);
  });

  // proves: board_layers
  test('hides and shows a layer from its row, and says which it will do', async () => {
    const { fold, does, state } = list();
    fold.click();
    assert.equal(does('conceal:notes').getAttribute('aria-label'), 'Hide the layer Notes');
    does('conceal:notes').click();
    await Promise.resolve();
    assert.ok(readBoard(state.text).board.layers[0].hidden);
    assert.equal(does('reveal:notes').getAttribute('aria-label'), 'Show the layer Notes');
    does('reveal:notes').click();
    await Promise.resolve();
    assert.equal(state.text, TEXT);
  });

  // proves: board_layers
  test('locks a layer, steps it down and takes it out, each as one change', async () => {
    const { fold, does, names, state } = list();
    fold.click();
    does('lock:notes').click();
    await Promise.resolve();
    assert.equal(does('lock:notes').getAttribute('aria-pressed'), 'true');
    does('down:notes').click();
    await Promise.resolve();
    assert.deepEqual(names(), ['Items in no layer (1)', 'Notes (1)', 'Background (0)']);
    does('remove:notes').click();
    await Promise.resolve();
    assert.deepEqual(names(), ['Items in no layer (2)', 'Background (0)']);
    assert.deepEqual(
      state.changes.map((c) => c.kind),
      ['layer-set', 'layer-step', 'layer-remove'],
    );
  });

  // proves: board_layers
  test('renames a layer in its row: Enter keeps the new name, Escape the old', async () => {
    const { window, fold, does, names, bar } = list();
    fold.click();
    const type = (name, key) => {
      does('rename:notes').click();
      const field = bar.querySelector('.thoughtknot-board-layer-field');
      assert.equal(window.document.activeElement, field);
      field.value = name;
      field.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    };
    type('Dropped', 'Escape');
    assert.deepEqual(names()[0], 'Notes (1)');
    assert.ok(!bar.querySelector('.thoughtknot-board-layers-list').hidden, 'Escape in the field leaves the list open');
    type('Sticky notes', 'Enter');
    await Promise.resolve();
    assert.deepEqual(names()[0], 'Sticky notes (1)');
  });

  // proves: board_layers
  test('makes a new layer, and puts new items into the layer picked', async () => {
    const { fold, does, names, l, state } = list();
    fold.click();
    does('board.layers.add').click();
    await Promise.resolve();
    assert.deepEqual(names()[0], 'Layer 3 (0)');
    const add = { kind: 'add', item: { id: 'sticky1', kind: 'Sticky', x: 0, y: 0, more: {} } };
    assert.deepEqual(l.placed(add), add, 'no layer picked: the item is loose');
    does('pick:layer1').click();
    assert.equal(does('pick:layer1').getAttribute('aria-pressed'), 'true');
    assert.equal(state.said.at(-1), 'New items now go into Layer 3.');
    assert.deepEqual(l.placed(add).item.more, { in_layer: 'layer1' });
    assert.deepEqual(l.placed({ kind: 'remove', id: 'a' }), { kind: 'remove', id: 'a' });
    does('remove:layer1').click();
    await Promise.resolve();
    assert.deepEqual(l.placed(add), add, 'the layer is gone: the item is loose again');
  });

  // proves: board_layers
  test('moves the chosen items into the layer picked, or the one the keyboard is on, and asks for one first', async () => {
    const { fold, does, names, state } = list();
    fold.click();
    does('pick:back').click();
    does('board.layers.move').click();
    assert.equal(state.said.at(-1), 'Choose an item first.');
    state.focus = 'b';
    does('board.layers.move').click();
    await Promise.resolve();
    assert.deepEqual(names(), ['Notes (1)', 'Items in no layer (0)', 'Background (1)']);
    state.chosen = ['a', 'b'];
    does('pick:').click();
    does('board.layers.move').click();
    await Promise.resolve();
    assert.deepEqual(names(), ['Notes (0)', 'Items in no layer (2)', 'Background (0)']);
  });

  // proves: board_layers
  test('brings the chosen item to the front of the others', async () => {
    const { fold, does, state } = list();
    fold.click();
    state.focus = 'a';
    does('board.layers.front').click();
    await Promise.resolve();
    assert.deepEqual(state.changes, [{ kind: 'layer', id: 'a', layer: 1 }]);
  });

  // proves: board_layers
  test('is as it was left when its board is drawn afresh: open, with the same layer picked', () => {
    const first = list('kept board');
    first.fold.click();
    first.does('pick:notes').click();
    const again = list('kept board');
    assert.ok(!again.panel.hidden);
    assert.equal(again.does('pick:notes').getAttribute('aria-pressed'), 'true');
  });
});

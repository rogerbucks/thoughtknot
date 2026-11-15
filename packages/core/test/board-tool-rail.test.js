// The tool rail above a board (editor spec ES§45, board_tools). It starts folded to one button that shows the tool in
// use. Open, each tool is a button with a tooltip, the one in use pressed. The arrow keys go from tool to tool, and
// Escape folds it. A press with a making tool makes the item and goes back to Choose; Connect joins two items.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readBoard } from '../src/board.ts';
import { installHost } from '../src/display/host.ts';
import { ToolRail } from '../src/display/board/board-tool-rail.ts';

const BOARD = readBoard(`// graph: ideas · BOARD
(a:Sticky {x: 0, y: 0, text: 'Go by train'}),
(b:Card {x: 300, y: 0, text: 'Paris'})`).board;

let keys = 0;

/** A rail in a page with the DOM helpers Obsidian adds, and what it said and asked the board to do. */
function rail(readOnly = false) {
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
  const done = { said: [], writes: [], focused: [] };
  const r = new ToolRail(root, vp, `board ${(keys += 1)}`, (w) => done.said.push(w), readOnly);
  const to = {
    write: async (c) => void done.writes.push(c),
    focus: (id, edit) => done.focused.push([id, edit]),
  };
  const bar = root.querySelector('.thoughtknot-board-tools');
  const tool = (name) => bar.querySelector(`button[data-tool="${name}"]:not(.thoughtknot-board-tools-fold)`);
  const fold = bar.querySelector('.thoughtknot-board-tools-fold');
  return { window, r, to, done, bar, tool, fold };
}

beforeEach(() => installHost({ icon: () => {}, isPhone: () => false, notice: () => {}, menu: () => {} }));

describe('the tool rail', () => {
  // proves: board_tools
  test('sits above the board, folded to one button that names the tool in use', () => {
    const { bar, tool, fold } = rail();
    assert.equal(bar.nextElementSibling.className, 'vp', 'above the board');
    assert.equal(bar.getAttribute('role'), 'toolbar');
    assert.equal(fold.getAttribute('aria-expanded'), 'false');
    assert.ok(tool('sticky').hidden && tool('choose').hidden, 'the tools wait folded');
    assert.equal(fold.getAttribute('aria-label'), 'Tool in use: Choose. Show the tools');
  });

  // proves: board_tools
  test('opens to every tool, each with a tooltip, the one in use pressed, and picking one says it', () => {
    const { tool, fold, done } = rail();
    fold.click();
    assert.equal(fold.getAttribute('aria-expanded'), 'true');
    assert.ok(!tool('connect').hidden);
    assert.equal(tool('choose').getAttribute('aria-pressed'), 'true');
    assert.match(tool('frame').getAttribute('title'), /sits behind/);
    tool('shape').click();
    assert.equal(tool('shape').getAttribute('aria-pressed'), 'true');
    assert.equal(tool('choose').getAttribute('aria-pressed'), 'false');
    assert.deepEqual(done.said, ['Shape tool.']);
  });

  // proves: board_tools
  test('goes from tool to tool by the arrow keys, round the ends, and folds by Escape', () => {
    const { window, tool, fold } = rail();
    fold.click();
    const key = (el, k) =>
      el.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    fold.focus();
    key(fold, 'ArrowRight');
    assert.equal(window.document.activeElement, tool('choose'));
    key(tool('choose'), 'ArrowLeft');
    key(fold, 'ArrowLeft');
    assert.equal(window.document.activeElement, tool('connect'), 'round from the first to the last');
    key(tool('connect'), 'Escape');
    assert.equal(fold.getAttribute('aria-expanded'), 'false');
    assert.equal(window.document.activeElement, fold);
  });

  // proves: board_tools
  test('makes the item pressed for, opens its text, and goes back to Choose', async () => {
    const { r, to, done } = rail();
    r.pick('sticky');
    assert.equal(r.press(BOARD, null, [1000, 1000], to), 'done');
    assert.equal(r.tool, 'choose', 'one item per pick');
    await Promise.resolve();
    assert.equal(done.writes[0].kind, 'add');
    assert.equal(done.writes[0].item.kind, 'Sticky');
  });

  // proves: board_tools
  test('joins two items with Connect, and stays on it for the next join', async () => {
    const { r, to, done } = rail();
    r.pick('connect');
    assert.equal(r.press(BOARD, 'a', [0, 0], to), 'done');
    assert.match(done.said.at(-1), /Joining from a/);
    r.press(BOARD, 'b', [0, 0], to);
    await Promise.resolve();
    assert.deepEqual(done.writes, [{ kind: 'connect', from: 'a', to: 'b' }]);
    assert.equal(r.tool, 'connect');
    assert.ok(r.cancel(), 'Escape lets go of it');
    assert.equal(r.tool, 'choose');
    assert.equal(r.cancel(), false, 'nothing more to let go of');
  });

  // proves: board_tools
  test('offers only Choose and Pan on a board that may only be looked at, and Pan pans', () => {
    const { r, tool, to } = rail(true);
    assert.equal(tool('sticky'), null);
    assert.ok(tool('hand'));
    r.pick('hand');
    assert.equal(r.press(BOARD, 'a', [0, 0], to), 'pan');
  });
});

// The format bar above a board (editor spec ES§45, board_format). It starts as one Format button. Open, each look
// is a button, pressed when every item chosen has it. A press writes one change for the items chosen.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readBoard } from '../src/board.ts';
import { boardEdit } from '../src/board-edit.ts';
import { installHost } from '../src/display/host.ts';
import { FormatBar } from '../src/display/board/board-format-bar.ts';

const TEXT = `// graph: ideas · BOARD
(a:Sticky {x: 0, y: 0, text: 'Go by train'}),
(b:Card {x: 300, y: 0, text: 'Paris', style: 'blue'}),
(c:Shape {x: 600, y: 0, text: 'Hub', locked: true})`;

const PALETTE = { text: '#111', edge: '#222', muted: '#333', fill: (h) => `fill-${h}`, blend: (h) => `ink-${h}` };

let keys = 0;

/** A bar in a page with the DOM helpers Obsidian adds, over a board that is written as the real one is. */
function bar(chosen = [], key = `board ${(keys += 1)}`, text = TEXT, redrawn = false) {
  const { window } = new JSDOM('<body><div id="root"><div class="vp"></div></div></body>');
  window.Element.prototype.createEl = function (tag, o = {}) {
    const el = this.ownerDocument.createElement(tag);
    if (o.text) el.textContent = o.text;
    if (o.cls) el.className = [o.cls].flat().join(' ');
    for (const [k, v] of Object.entries(o.attr ?? {})) el.setAttribute(k, v);
    this.append(el);
    return el;
  };
  window.Element.prototype.createDiv = function (o) {
    return this.createEl('div', o);
  };
  window.Element.prototype.setCssProps = function (props) {
    for (const [k, v] of Object.entries(props)) this.style.setProperty(k, v);
  };
  const root = window.document.getElementById('root');
  const vp = root.querySelector('.vp');
  const done = { said: [], writes: [], reselected: null, text };
  let board = readBoard(text).board;
  const h = {
    board: () => board,
    chosen: () => chosen,
    say: (w) => done.said.push(w),
    write: async (change) => {
      done.writes.push(change);
      const r = boardEdit(done.text, change);
      if (r.refused) return void done.said.push(r.refused);
      done.text = r.text;
      if (redrawn) return void vp.remove(); // the host draws the board afresh
      board = readBoard(r.text).board;
      f.show(null);
    },
  };
  const f = new FormatBar(root, vp, key, PALETTE, h, (ids) => (done.reselected = ids));
  const el = root.querySelector('.thoughtknot-board-format');
  const fold = el.querySelector('button');
  const look = (name) => el.querySelector(`[data-look="${name}"]`);
  const looks = el.querySelector('.thoughtknot-board-format-looks');
  return { window, f, done, el, fold, look, looks, vp };
}

beforeEach(() => installHost({ icon: () => {}, isPhone: () => false, notice: () => {}, menu: () => {} }));

describe('the format bar', () => {
  // proves: board_format
  test('sits above the board as one Format button, and asks for an item when none is chosen', () => {
    const { el, fold, looks, done, f } = bar();
    assert.equal(el.nextElementSibling.className, 'vp', 'above the board');
    assert.equal(fold.textContent, 'Format');
    assert.equal(fold.getAttribute('aria-expanded'), 'false');
    assert.ok(looks.hidden, 'the looks wait folded');
    f.show(null);
    fold.click();
    assert.ok(looks.hidden, 'nothing to change, so nothing opens');
    assert.match(done.said.at(-1), /Choose an item first/);
    assert.equal(fold.getAttribute('aria-disabled'), 'true');
  });

  // proves: board_format
  test('opens to named looks in groups, each pressed when the item in focus has it', () => {
    const { fold, look, looks, f, el } = bar();
    f.show('b');
    fold.click();
    assert.ok(!looks.hidden);
    assert.equal(fold.getAttribute('aria-expanded'), 'true');
    assert.deepEqual(
      [...el.querySelectorAll('[role="group"]')].map((g) => g.getAttribute('aria-label')),
      ['Colour', 'Line', 'Text', 'Connector'],
    );
    assert.equal(look('colour-blue').getAttribute('aria-pressed'), 'true');
    assert.equal(look('colour-pink').getAttribute('aria-pressed'), 'false');
    assert.equal(look('colour-pink').getAttribute('aria-label'), 'Pink', 'a colour is named, not only shown');
    assert.equal(look('colour-pink').getAttribute('title'), 'Pink');
    assert.equal(look('colour-pink').style.getPropertyValue('--thoughtknot-swatch'), 'fill-pink');
    assert.equal(look('size-normal').getAttribute('aria-pressed'), 'true');
    assert.equal(look('bold').getAttribute('aria-pressed'), 'false');
    assert.equal(look('line-dashed').textContent, 'Dashed');
    assert.ok(look('route-elbow').parentElement.hidden, 'no connector on this item, so none of its looks');
  });

  // proves: board_format
  test('a press changes every item chosen as one change, says it, and shows the look as pressed', async () => {
    const { fold, look, done, f } = bar(['a', 'b']);
    f.show(null);
    fold.click();
    assert.equal(look('colour-blue').getAttribute('aria-pressed'), 'false', 'only one of the two is blue');
    look('colour-pink').click();
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(done.writes, [{ kind: 'formats', ids: ['a', 'b'], set: { colour: 'pink' } }]);
    assert.match(done.text, /\(a:Sticky \{[^}]*style: 'pink'\}\)[\s\S]*\(b:Card \{[^}]*style: 'pink'\}\)/);
    assert.equal(done.said.at(-1), 'Changed the look of 2 items.');
    assert.equal(look('colour-pink').getAttribute('aria-pressed'), 'true');
    look('bold').click();
    await new Promise((r) => setImmediate(r));
    look('bold').click();
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(done.writes.at(-1).set, { bold: false }, 'a second press on Bold takes it off');
    look('colour-none').click();
    await new Promise((r) => setImmediate(r));
    assert.doesNotMatch(done.text, /style:|bold:/, 'Plain takes the colour off');
  });

  // proves: board_format
  test('says why when the item is locked, and changes nothing', async () => {
    const { fold, look, done, f } = bar();
    f.show('c');
    fold.click();
    look('bold').click();
    await new Promise((r) => setImmediate(r));
    assert.equal(done.text, TEXT);
    assert.match(done.said.at(-1), /locked/);
  });

  // proves: board_format
  test('stays open on a board drawn afresh after a change, with the same items chosen and the same button in focus', async () => {
    const first = bar(['a', 'b'], 'the page board', TEXT, true);
    first.f.show(null);
    first.fold.click();
    first.look('line-dotted').click();
    await new Promise((r) => setImmediate(r));
    const again = bar(['a', 'b'], 'the page board', first.done.text);
    assert.deepEqual(again.done.reselected, ['a', 'b']);
    again.f.show(null);
    assert.ok(!again.looks.hidden, 'still open');
    assert.equal(again.look('line-dotted').getAttribute('aria-pressed'), 'true');
    await new Promise((r) => setImmediate(r));
    assert.equal(again.window.document.activeElement, again.look('line-dotted'));
    assert.equal(bar([], 'the page board').done.reselected, null, 'only straight after the change');
  });
});

describe('the looks of a connector in the format bar', () => {
  const JOINED = `${TEXT},
(a)-[:CONNECTS]->(b),
(b)-[:CONNECTS {label: 'then'}]->(c)`;

  // proves: board_routes
  test('are offered when an item chosen has a connector, and a press changes the connectors between the items chosen', async () => {
    const { fold, look, done, f } = bar(['a', 'b'], undefined, JOINED);
    f.show(null);
    fold.click();
    assert.ok(!look('route-elbow').parentElement.hidden);
    assert.equal(look('tips-end').getAttribute('aria-pressed'), 'true', 'an arrow at the end, as made');
    assert.equal(look('route-straight').getAttribute('aria-pressed'), 'false', 'no route of its own yet');
    look('route-elbow').click();
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(done.writes, [{ kind: 'routes', links: [{ from: 'a', to: 'b' }], set: { route: 'elbow' } }]);
    assert.match(done.text, /\(a\)-\[:CONNECTS \{route: 'elbow'\}\]->\(b\)/);
    assert.match(done.text, /\(b\)-\[:CONNECTS \{label: 'then'\}\]->\(c\)/, 'the other connector is as it was');
    assert.equal(done.said.at(-1), 'Changed 1 connectors.');
    assert.equal(look('route-elbow').getAttribute('aria-pressed'), 'true');
    look('route-elbow').click();
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(done.writes.at(-1).set, { route: null }, 'a second press gives the route back to the board');
    assert.equal(done.text, JOINED);
  });

  // proves: board_routes
  test('with one item chosen change every connector that touches it, arrowheads too', async () => {
    const { fold, look, done, f } = bar(['b'], undefined, JOINED);
    f.show(null);
    fold.click();
    look('tips-both').click();
    await new Promise((r) => setImmediate(r));
    assert.equal(done.writes.at(-1).links.length, 2);
    assert.match(done.text, /\(a\)-\[:CONNECTS \{tips: 'both'\}\]->\(b\)/);
    assert.match(done.text, /\(b\)-\[:CONNECTS \{label: 'then', tips: 'both'\}\]->\(c\)/);
    assert.equal(look('tips-both').getAttribute('aria-pressed'), 'true');
    assert.equal(look('tips-both').getAttribute('aria-label'), 'Arrow at both ends');
  });
});

// The ways to begin on an empty board (editor spec ES§76, board_first_ways_in). A person types a note, gives text to an
// AI to turn into a graph, or imports. They are folded small beside the board, cover no part of it, and go once an item is made.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readBoard } from '../src/board.ts';
import { waysIn } from '../src/board-first.ts';
import { showWaysIn, waysAfter } from '../src/display/board/board-ways.ts';

const EMPTY = readBoard('// graph: ideas_board · BOARD').board;
const ONE = readBoard("// graph: ideas_board · BOARD\n(s1:Sticky {x: 0, y: 0, text: 'Go by train'})").board;

/** A board's root with its viewport, in a page. */
function page() {
  const { window } = new JSDOM('<body><div class="root"><div class="vp" tabindex="0"></div></div></body>');
  const root = window.document.querySelector('.root');
  return { window, root, vp: root.querySelector('.vp') };
}

describe('board_first_ways_in', () => {
  test('an empty board offers typing, text to graph and import, and a board with an item offers none', () => {
    assert.deepEqual(
      waysIn(EMPTY).map((w) => w.way),
      ['type', 'text-to-graph', 'import'],
    );
    for (const w of waysIn(EMPTY)) assert.ok(w.name && w.sentence);
    assert.deepEqual(waysIn(ONE), []);
  });

  test('they are folded small, beside the board and not over it', () => {
    const { root, vp } = page();
    const box = showWaysIn(root, vp, EMPTY, { textToGraph() {}, importing() {} }, () => {});
    assert.equal(box.tagName, 'DETAILS');
    assert.equal(box.open, false, 'folded until opened');
    assert.equal(vp.contains(box), false, 'nothing of it lies on the board');
    assert.equal(vp.nextElementSibling, box, 'it sits under the board');
    assert.equal(vp.children.length, 0);
    assert.deepEqual(
      [...box.querySelectorAll('button')].map((b) => b.dataset.way),
      ['type', 'text-to-graph', 'import'],
    );
  });

  test('each way does what it says: typing puts the keyboard on the board, the others open the host', () => {
    const { window, root, vp } = page();
    const opened = [];
    const said = [];
    const box = showWaysIn(
      root,
      vp,
      EMPTY,
      { textToGraph: () => opened.push('text'), importing: () => opened.push('import') },
      (w) => said.push(w),
    );
    const press = (way) => box.querySelector(`[data-way="${way}"]`).click();
    press('type');
    assert.equal(window.document.activeElement, vp);
    assert.equal(said.length, 1);
    press('text-to-graph');
    press('import');
    assert.deepEqual(opened, ['text', 'import']);
  });

  test('with AI off, text to graph is still shown and says why it cannot be used', () => {
    const { root, vp } = page();
    const said = [];
    let opened = false;
    const box = showWaysIn(root, vp, EMPTY, { aiOff: 'AI is off.', textToGraph: () => (opened = true) }, (w) =>
      said.push(w),
    );
    const b = box.querySelector('[data-way="text-to-graph"]');
    assert.equal(b.getAttribute('aria-disabled'), 'true');
    b.click();
    assert.equal(opened, false);
    assert.deepEqual(said, ['AI is off.']);
  });

  test('a way the host does not open yet is marked as not usable, and says what it would do', () => {
    const { root, vp } = page();
    const said = [];
    const box = showWaysIn(root, vp, EMPTY, {}, (w) => said.push(w));
    const way = (w) => box.querySelector(`[data-way="${w}"]`);
    assert.equal(way('type').getAttribute('aria-disabled'), null, 'typing needs nothing of the host');
    assert.equal(way('text-to-graph').getAttribute('aria-disabled'), 'true');
    assert.equal(way('import').getAttribute('aria-disabled'), 'true');
    way('import').click();
    assert.equal(said.length, 1);
  });

  test('the offer goes once the first item is made', () => {
    const { root, vp } = page();
    const box = showWaysIn(root, vp, EMPTY, {}, () => {});
    assert.equal(waysAfter(box, EMPTY), box, 'still empty: still offered');
    assert.equal(waysAfter(box, ONE), null);
    assert.equal(root.querySelector('details'), null);
    assert.equal(
      showWaysIn(root, vp, ONE, {}, () => {}),
      null,
    );
  });
});

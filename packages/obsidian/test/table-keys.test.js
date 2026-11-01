// A graph drawn as a table works as a data table does (editor spec §15). It scrolls by itself, by wheel, trackpad and
// finger, and the card's zoom never moves it, only sizes its words (table_grid_navigation). One cell has the focus, and
// the keys move it as a spreadsheet's do. With a row's details open they follow the focus. A click or Enter on a head
// sorts by it (table_sort). Resizing and the table's look: table-sizing.test.js.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const PATH = 'Some note.md';
const TRIP = `// graph: trip
(home:Place {name: 'Home', open: 'always'}),
(park:Place {name: 'The park', since: DATE '1901-05-01'}),
(cafe:Cafe {name: 'Cafe'}),
(home)-[:NEAR {miles: 2}]->(park),
(cafe)-[:SERVES]->(park)`;
const TABLE = "// graph: trip_style · STYLE trip\n(d1:Diagram {type: 'table'})";
const note = ['# Trip', '', fence(TRIP), '', fence(TABLE), ''].join('\n');

/** A device's storage, as a browser keeps it for the page. */
const storage = (kept = {}) => ({
  kept,
  getItem: (k) => kept[k] ?? null,
  setItem: (k, v) => (kept[k] = String(v)),
});

async function card(kept) {
  const env = await load({ files: { [PATH]: note } });
  env.doc.defaultView.localStorage = kept ?? storage();
  const { el } = await show(env, note, 0);
  return { env, el };
}
const names = (el) => el.querySelectorAll('tr[data-key]').map((tr) => tr.querySelector('td').textContent);
const cellOf = (el, key, col) =>
  el
    .querySelectorAll('tr[data-key]')
    .find((r) => r.getAttribute('data-key') === key)
    .querySelectorAll('td')[col];
const head = (el, text) => el.querySelectorAll('thead th[data-col]').find((th) => th.textContent === text);
const press = (target, key, mods = {}) => target.dispatch('keydown', { key, ...mods });

describe('the table scrolls and zooms as a data table does', () => {
  // proves: table_grid_navigation
  test('in full screen the wheel and a drag are left to the table to scroll; the zoom sizes its words', async () => {
    const { env, el } = await card();
    try {
      labelled(el, 'Full screen').click();
      const full = env.doc.body.querySelector('.thoughtknot-fullscreen');
      const vp = full.querySelector('.thoughtknot-viewport'),
        cell = full.querySelectorAll('tbody td')[0];
      const words = () => Number(vp.cssProps['--thoughtknot-text-scale']); // the table takes them from its frame
      assert.equal(words(), 1, 'its words at their size, fitted');
      const wheel = vp.dispatch('wheel', { target: cell, deltaY: 100, clientX: 10, clientY: 10 });
      assert.equal(wheel.defaultPrevented, false, 'the wheel scrolls the table');
      assert.equal(words(), 1, 'and never zooms it');
      const down = vp.dispatch('pointerdown', {
        target: cell,
        pointerId: 1,
        pointerType: 'mouse',
        clientX: 9,
        clientY: 9,
      });
      assert.equal(down.defaultPrevented, false, 'a press is the table’s, to scroll or choose');
      assert.ok(!vp.hasPointerCapture(1), 'never taken to pan');
      vp.dispatch('pointerup', { target: cell, pointerId: 1, pointerType: 'mouse', clientX: 9, clientY: 9 });
      vp.dispatch('wheel', { target: cell, deltaY: -100, ctrlKey: true, clientX: 10, clientY: 10 });
      assert.ok(words() > 1, 'Control and the wheel, or a pinch, makes its words larger');
    } finally {
      env.uninstall();
    }
  });

  // proves: table_grid_navigation
  test('is a grid of cells: heads named as heads, each row numbered, one cell at a time in the tab order', async () => {
    const { env, el } = await card();
    try {
      const grids = el.querySelectorAll('.thoughtknot-table-scroll table');
      assert.deepEqual(
        grids.map((t) => t.getAttribute('role')),
        ['grid', 'grid'],
      );
      assert.ok(el.querySelectorAll('thead th[data-col]').every((th) => th.getAttribute('role') === 'columnheader'));
      assert.deepEqual(
        el.querySelectorAll('tr[data-key] .thoughtknot-row-num').map((n) => n.textContent),
        ['1', '2', '3'],
      );
      const stops = () =>
        el.querySelectorAll('.thoughtknot-table-scroll [tabindex]').filter((c) => c.getAttribute('tabindex') === '0');
      assert.deepEqual(stops(), [cellOf(el, 'home', 0)], 'Tab comes in to the first thing');
      cellOf(el, 'cafe', 1).focus();
      assert.deepEqual(stops(), [cellOf(el, 'cafe', 1)], 'and back to the cell last left');
    } finally {
      env.uninstall();
    }
  });

  // proves: table_grid_navigation
  test('the keys go from cell to cell: arrows, to the edge with Control, Home and End, Page Down', async () => {
    const { env, el } = await card();
    try {
      const at = () => env.doc.activeElement;
      cellOf(el, 'home', 0).focus();
      press(at(), 'ArrowRight');
      assert.ok(at() === cellOf(el, 'home', 1), 'Right: the next cell');
      press(at(), 'ArrowDown');
      assert.ok(at() === cellOf(el, 'park', 1), 'Down: the cell under it');
      const e = press(at(), 'End');
      assert.ok(e.defaultPrevented);
      assert.ok(at() === cellOf(el, 'park', 3), 'End: the end of the row');
      press(at(), 'Home');
      assert.ok(at() === cellOf(el, 'park', 0), 'Home: its first cell');
      press(at(), 'ArrowUp', { ctrlKey: true });
      assert.equal(at().getAttribute('role'), 'columnheader', 'Control and Up: the head of the column');
      press(at(), 'End', { ctrlKey: true });
      const last = el.querySelectorAll('tr[data-link]').at(-1);
      assert.ok(at() === last.querySelectorAll('td').at(-1), 'Control and End: the last cell, of the last link');
      press(at(), 'Home', { metaKey: true });
      assert.ok(at() === cellOf(el, 'home', 0), 'Command and Home: the first cell');
      press(at(), 'PageDown');
      assert.ok(at() === cellOf(el, 'park', 0), 'Page Down: as many rows on as show (one, in a page with no layout)');
    } finally {
      env.uninstall();
    }
  });

  // proves: table_grid_navigation
  test('with a row’s details open, Down opens the next row’s, as a list does', async () => {
    const { env, el } = await card();
    try {
      const details = el.querySelector('.thoughtknot-details');
      cellOf(el, 'home', 0).focus();
      press(cellOf(el, 'home', 0), 'Enter');
      assert.match(details.textContent, /Home/);
      press(cellOf(el, 'home', 0), 'ArrowDown');
      assert.ok(env.doc.activeElement === cellOf(el, 'park', 0));
      assert.match(details.textContent, /The park/, 'the details follow');
      const park = el.querySelectorAll('tr[data-key]').find((r) => r.getAttribute('data-key') === 'park');
      assert.equal(park.getAttribute('aria-selected'), 'true');
    } finally {
      env.uninstall();
    }
  });

  // proves: table_grid_navigation
  test('Control and C copies the cell', async () => {
    const { env, el } = await card();
    try {
      cellOf(el, 'park', 0).focus();
      press(cellOf(el, 'park', 0), 'c', { ctrlKey: true });
      assert.equal(env.doc.clipboard, 'The park');
    } finally {
      env.uninstall();
    }
  });

  // proves: table_grid_navigation
  test('two fingers spread on the table make its words larger, as a trackpad pinch does; one finger only scrolls', async () => {
    const { env, el } = await card();
    try {
      const vp = el.querySelector('.thoughtknot-viewport'),
        cell = el.querySelectorAll('tbody td')[0];
      const words = () => Number(vp.cssProps['--thoughtknot-text-scale']);
      const at = (...xs) => xs.map((x) => ({ clientX: x, clientY: 50 }));
      const one = cell.dispatch('touchstart', { touches: at(100) });
      cell.dispatch('touchmove', { touches: at(160) });
      assert.equal(one.defaultPrevented, false, 'one finger is left to scroll the table');
      assert.equal(words(), 1, 'and never sizes its words');
      cell.dispatch('touchstart', { touches: at(100, 200) });
      const spread = cell.dispatch('touchmove', { touches: at(80, 220) });
      assert.ok(spread.defaultPrevented, 'the page neither scrolls nor zooms under the two fingers');
      assert.ok(words() > 1, 'the words grow as the fingers spread');
      const bigger = words();
      cell.dispatch('touchmove', { touches: at(120, 180) });
      assert.ok(words() < bigger, 'and shrink as they close');
    } finally {
      env.uninstall();
    }
  });

  // proves: table_grid_navigation
  test('drawn again, as after an edit, the table is scrolled where it was and its cell has the focus again', async () => {
    const { env, el } = await card();
    try {
      const scroll = el.querySelector('.thoughtknot-table-scroll');
      scroll.scrollTop = 120;
      scroll.scrollLeft = 30;
      scroll.dispatch('scroll');
      cellOf(el, 'cafe', 1).focus();
      el.remove(); // the card is drawn again: its old table goes, and the focus with it
      env.doc.activeElement = env.doc.body;
      const { el: again } = await show(env, note, 0);
      const now = again.querySelector('.thoughtknot-table-scroll');
      assert.deepEqual([now.scrollTop, now.scrollLeft], [120, 30], 'scrolled where it was');
      assert.equal(env.doc.activeElement, cellOf(again, 'cafe', 1), 'the cell that had the focus has it again');
      const other = env.doc.body.createEl('button');
      other.focus(); // the focus taken elsewhere on the page is left there
      again.remove();
      const { el: third } = await show(env, note, 0);
      assert.equal(env.doc.activeElement, other, 'the focus is never taken back from elsewhere');
      assert.equal(third.querySelector('.thoughtknot-table-scroll').scrollTop, 120);
    } finally {
      env.uninstall();
    }
  });
});

describe('sorting the table', () => {
  // proves: table_sort
  test('a click on a head sorts by it, then the other way, then as written, each row numbered again', async () => {
    const { env, el } = await card();
    try {
      head(el, 'Thing').click();
      assert.deepEqual(names(el), ['Cafe', 'Home', 'The park']);
      assert.equal(head(el, 'Thing').getAttribute('aria-sort'), 'ascending');
      assert.deepEqual(
        el.querySelectorAll('tr[data-key] .thoughtknot-row-num').map((n) => n.textContent),
        ['1', '2', '3'],
      );
      head(el, 'Thing').click();
      assert.deepEqual(names(el), ['The park', 'Home', 'Cafe']);
      assert.equal(head(el, 'Thing').getAttribute('aria-sort'), 'descending');
      head(el, 'Thing').click();
      assert.deepEqual(names(el), ['Home', 'The park', 'Cafe'], 'as written');
      assert.equal(head(el, 'Thing').getAttribute('aria-sort'), 'none');
    } finally {
      env.uninstall();
    }
  });

  // proves: table_sort
  test('Enter on a head sorts too; empty cells go last; the focus stays where it was', async () => {
    const { env, el } = await card();
    try {
      const open = head(el, 'open');
      open.focus();
      press(open, 'Enter');
      assert.deepEqual(names(el), ['Home', 'The park', 'Cafe'], 'the one with a value first');
      assert.ok(env.doc.activeElement === open);
    } finally {
      env.uninstall();
    }
  });
});

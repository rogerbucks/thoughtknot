// The size and look of a graph drawn as a table (editor spec §15). Columns and rows are resized by their grips and by
// Alt+Shift and an arrow (table_resize). The bar above it stripes the rows and sets their height, kept on the device
// (table_look). How it scrolls and is worked by keys: table-keys.test.js.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, load, root } from './host/load-plugin.js';
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

describe('resizing columns and rows', () => {
  const width = (el, i, t = 0) =>
    el.querySelectorAll('.thoughtknot-table-scroll table')[t].querySelectorAll('col[data-col]')[i].cssProps[
      '--thoughtknot-col-w'
    ];

  // proves: table_resize
  test('a column’s grip dragged makes it wider, and a double click fits it to its words', async () => {
    const { env, el } = await card();
    try {
      const vp = el.querySelector('.thoughtknot-viewport');
      const grip = head(el, 'Kind').querySelector('.thoughtknot-col-grip');
      const at = (type, x) =>
        vp.dispatch(type, { target: grip, pointerId: 4, pointerType: 'mouse', button: 0, clientX: x, clientY: 5 });
      const before = el.querySelector('.thoughtknot-details').hidden;
      at('pointerdown', 100);
      at('pointermove', 160);
      at('pointerup', 160);
      assert.ok(el.querySelector('.thoughtknot-table-scroll table').classList.contains('is-sized'));
      assert.equal(
        parseFloat(width(el, 1)) - parseFloat(width(el, 0)),
        60,
        'dragged 60 pixels wider than its neighbour',
      );
      assert.equal(el.querySelector('.thoughtknot-details').hidden, before, 'nothing opened or closed');
      grip.dispatch('dblclick');
      assert.ok(parseFloat(width(el, 1)) < 100, `fitted to its words: ${width(el, 1)}`);
    } finally {
      env.uninstall();
    }
  });

  // proves: table_resize
  test('Alt+Shift and an arrow resizes the column and the row of the cell; Fit columns puts them back', async () => {
    const { env, el } = await card();
    try {
      const cell = cellOf(el, 'park', 2);
      cell.focus();
      press(cell, 'ArrowRight', { altKey: true, shiftKey: true });
      press(cell, 'ArrowRight', { altKey: true, shiftKey: true });
      assert.equal(parseFloat(width(el, 2)) - parseFloat(width(el, 1)), 32, 'two steps wider');
      press(cell, 'ArrowDown', { altKey: true, shiftKey: true });
      const row = cell.closest('tr');
      assert.ok(row.classList.contains('is-sized-row'));
      assert.match(row.cssProps['--thoughtknot-row-own'], /px$/);
      el.querySelectorAll('.thoughtknot-table-bar button')
        .find((b) => b.textContent === 'Fit columns')
        .click();
      assert.equal(width(el, 2), 'auto');
      assert.ok(!row.classList.contains('is-sized-row'));
    } finally {
      env.uninstall();
    }
  });

  // proves: table_resize
  test('a row’s grip dragged makes it taller, and a double click puts it back', async () => {
    const { env, el } = await card();
    try {
      const vp = el.querySelector('.thoughtknot-viewport');
      const row = el.querySelectorAll('tr[data-key]')[0];
      const grip = row.querySelector('.thoughtknot-row-grip');
      const at = (type, y) =>
        vp.dispatch(type, { target: grip, pointerId: 5, pointerType: 'touch', button: 0, clientX: 5, clientY: y });
      at('pointerdown', 10);
      at('pointermove', 40);
      at('pointerup', 40);
      assert.equal(row.cssProps['--thoughtknot-row-own'], '430px', 'its height and 30 more');
      grip.dispatch('dblclick');
      assert.equal(row.cssProps['--thoughtknot-row-own'], '');
    } finally {
      env.uninstall();
    }
  });
});

describe('the look of the table, set on screen', () => {
  const button = (el, text) => el.querySelectorAll('.thoughtknot-table-bar button').find((b) => b.textContent === text);

  // proves: table_look
  test('rows are striped unless switched off, and their height is chosen; both kept on the device', async () => {
    const kept = storage();
    const first = await card(kept);
    try {
      const scroll = () => first.el.querySelector('.thoughtknot-table-scroll');
      assert.ok(scroll().classList.contains('is-striped'), 'striped at first');
      assert.equal(button(first.el, 'Striped rows').getAttribute('aria-pressed'), 'true');
      assert.equal(button(first.el, 'Medium').getAttribute('aria-pressed'), 'true');
      button(first.el, 'Striped rows').click();
      button(first.el, 'Tall').click();
      assert.ok(!scroll().classList.contains('is-striped'));
      assert.ok(scroll().classList.contains('thoughtknot-rows-tall'));
      assert.equal(button(first.el, 'Tall').getAttribute('aria-pressed'), 'true');
      assert.equal(button(first.el, 'Medium').getAttribute('aria-pressed'), 'false');
    } finally {
      first.env.uninstall();
    }
    const again = await card(kept);
    try {
      const scroll = again.el.querySelector('.thoughtknot-table-scroll');
      assert.ok(!scroll.classList.contains('is-striped'), 'drawn again as it was left');
      assert.ok(scroll.classList.contains('thoughtknot-rows-tall'));
    } finally {
      again.env.uninstall();
    }
  });

  // proves: table_look
  test('a device that keeps nothing still draws the table, striped', async () => {
    const env = await load({ files: { [PATH]: note } });
    env.doc.defaultView.localStorage = {
      getItem() {
        throw new Error('refused');
      },
      setItem() {
        throw new Error('refused');
      },
    };
    try {
      const { el } = await show(env, note, 0);
      assert.ok(el.querySelector('.thoughtknot-table-scroll').classList.contains('is-striped'));
      button(el, 'Short').click();
      assert.ok(el.querySelector('.thoughtknot-table-scroll').classList.contains('thoughtknot-rows-short'));
    } finally {
      env.uninstall();
    }
  });
});

// design review, 1 Nov 2026: the View chip in the corner covered the column heads and the first row's name
describe('the table keeps clear of the card in the corner', () => {
  test('its bar leaves room at its start for the View chip and is as tall as it, except on a phone', () => {
    const css = readFileSync(`${root}styles.css`, 'utf8');
    const sel = '.thoughtknot-view:has(> .thoughtknot-over > .thoughtknot-corner) .thoughtknot-table-bar';
    const rule = new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    assert.match(rule, /padding-inline-start:\s*calc\(/);
    assert.match(rule, /min-block-size:\s*calc\(44px/);
  });
});

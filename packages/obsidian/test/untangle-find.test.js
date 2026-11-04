// Choosing a thing found (editor spec §25, find_shows_readable). The list of matches closes, so it covers nothing.
// The thing comes into view at a size its words can be read, however far out the drawing was zoomed.
// The built plugin, loaded against the stand-ins for the page.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rules, winner } from './host/cascade.js';
import { build } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { load, GRAPH, show } from './host/view-notes.js';
import { readNote } from '../../core/src/drawing.ts';
import { draw } from '../../core/src/render.ts';
import { loadEngine } from '../../core/src/engine.ts';
import { READABLE_SCALE } from '../../core/src/details-nav.ts';

// drawn by Graphviz, as the drawing's size is worked out here
const GRAPHVIZ = { data: { settings: { ownLayout: 'off' } } };

before(() => build());

describe('choosing a thing found', () => {
  let env, el;
  before(async () => {
    env = await load(GRAPHVIZ);
    el = (await show(env, fence(GRAPH))).el;
  });
  after(() => env.uninstall());

  const search = (text) => {
    const input = el.querySelector('.thoughtknot-find input');
    input.value = text;
    input.dispatch('input');
    return el.querySelectorAll('.thoughtknot-find-results button');
  };

  test('closes the list and shows the thing readable, from zoomed far out', async () => {
    const button = labelled(el, 'Find a thing'),
      row = el.querySelector('.thoughtknot-find');
    for (let n = 0; n < 8; n++) labelled(el, 'Zoom out').click();
    button.click();
    assert.ok(!row.hidden, 'the list open');
    search('tablet')[0].click();
    assert.ok(el.querySelector('g.node[data-key="tablet"]').hasClass('is-selected'), 'found and selected');
    assert.ok(row.hidden, 'the list closed');
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    const drawn = draw(readNote([GRAPH]).graphs.get('reader'), await loadEngine()),
      width = Number(el.querySelector('svg.thoughtknot-svg').getAttribute('width'));
    assert.ok(width / drawn.width >= READABLE_SCALE - 1e-9, `readable: ${width / drawn.width}`);
  });

  // Zen-led refresh (Roger, 1 Nov 2026): one quiet row a result, its kind in small muted words
  test('lists each result as one row: its name, its kind muted, and a small Explore at the end', () => {
    const [first] = search('tablet');
    assert.ok(first.hasClass('thoughtknot-find-result'));
    assert.ok(first.querySelector('.thoughtknot-find-kind'), 'the kind in its own words');
    const all = rules(readFileSync(new URL('../../../styles.css', import.meta.url), 'utf8'), 'thoughtknot');
    const find = { tag: 'div', classes: ['thoughtknot-find'] };
    const list = { tag: 'ul', classes: ['thoughtknot-find-results'], states: [], ancestors: [find] };
    const row = { tag: 'li', classes: [], states: [], ancestors: [list, find] };
    const name = { tag: 'button', classes: ['thoughtknot-find-result'], states: [], ancestors: [row, list, find] };
    const kind = { tag: 'span', classes: ['thoughtknot-find-kind'], states: [], ancestors: [name, row, list, find] };
    assert.equal(winner(all, list, 'flex-direction').value, 'column');
    assert.equal(winner(all, row, 'display').value, 'flex');
    assert.equal(winner(all, name, 'text-align').value, 'start');
    assert.match(winner(all, kind, 'color').value, /--gn-text-muted/);
  });
});

// level_find (Roger, 3 Nov 2026): find flies through the levels, each result saying where it sits
describe('a thing found says where it sits in the levels', () => {
  let env, el;
  const NAMED = [
    '// graph: named',
    "(rent:Task {name: 'Pay rent', subject: 'Money', area: 'Budget'}),",
    "(food:Task {name: 'Buy food', subject: 'Money', area: 'Budget'}),",
    "(run:Task {name: 'Go running', subject: 'Health'}),",
    '(rent)-[:BEFORE]->(food)',
  ].join('\n');
  before(async () => {
    env = await load(GRAPHVIZ);
    el = (await show(env, fence(NAMED))).el;
  });
  after(() => env.uninstall());

  test('its subject and area show under its name', () => {
    labelled(el, 'Find a thing').click();
    const input = el.querySelector('.thoughtknot-find input');
    input.value = 'rent';
    input.dispatch('input');
    const [first] = el.querySelectorAll('.thoughtknot-find-results button');
    assert.equal(first.querySelector('.thoughtknot-find-where')?.textContent, 'Money › Budget');
  });
});

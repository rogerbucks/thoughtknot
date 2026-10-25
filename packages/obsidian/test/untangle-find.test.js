// Choosing a thing found (editor spec §25, find_shows_readable). The list of matches closes, so it covers nothing.
// The thing comes into view at a size its words can be read, however far out the drawing was zoomed.
// The built plugin, loaded against the stand-ins for the page.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
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
});

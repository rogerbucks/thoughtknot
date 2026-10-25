// The panels a card's bar opens lie over the drawing (editor spec §25, panels_over_drawing). Roger, 25 Oct 2026:
// "option panels occasionally cause elements on the screen to be unavailable as they are offscreen. Suggest panels
// overlay the main view and do not move other elements around".
// - The View menu, Find, the filter, Diagram type's lists, the problems and Export sit in one layer.
// - That layer is just above the drawing, not in the card's flow.
// - That layer takes no room, so opening a panel moves nothing: it lies over the drawing and scrolls inside it.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, load, until } from './host/load-plugin.js';
import { rules, winner } from './host/cascade.js';
import { labelled } from './host/notes.js';
import { PATH, NOTE, show } from './host/card-notes.js';

before(() => build());

/** The card's panels that lie over the drawing, by their class. */
const PANELS = [
  'thoughtknot-view-menu',
  'thoughtknot-find',
  'thoughtknot-filter',
  'thoughtknot-type-list',
  'thoughtknot-view-list',
];

describe('the panels the bar opens', () => {
  // proves: panels_over_drawing
  test('sit in one layer just above the drawing, Export too once opened, and nothing else moves there', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      await until(() => !!el.querySelector('.thoughtknot-viewport'));
      const card = el.querySelector('.thoughtknot-view');
      const layer = card.querySelector('.thoughtknot-over');
      assert.ok(layer, 'a layer over the drawing');
      const kids = card.children;
      assert.equal(
        kids[kids.indexOf(layer) + 1],
        card.querySelector('.thoughtknot-viewport'),
        'just above the drawing',
      );
      const panels = layer.querySelector('.thoughtknot-over-panels');
      for (const cls of PANELS) {
        const panel = card.querySelector(`.${cls}`);
        assert.ok(panel, cls);
        assert.equal(panel.parentElement, panels, `${cls} is in the layer`);
      }
      assert.ok(!kids.some((k) => PANELS.some((cls) => k.classList.contains(cls))), 'none is left in the flow');
      labelled(el, 'Export').click();
      await until(() => !!card.querySelector('.thoughtknot-export'));
      assert.equal(card.querySelector('.thoughtknot-export').parentElement, panels, 'Export opens in the layer');
    } finally {
      env.uninstall();
    }
  });

  // proves: panels_over_drawing
  test('the layer takes no room, and its panels lie over the drawing and scroll inside it', () => {
    const all = rules(readFileSync(new URL('../../../styles.css', import.meta.url), 'utf8'), 'thoughtknot');
    const card = { tag: 'div', classes: ['thoughtknot-view'] };
    const layer = { tag: 'div', classes: ['thoughtknot-over'], states: [], ancestors: [card] };
    const panels = {
      tag: 'div',
      classes: ['thoughtknot-over-panels'],
      states: [],
      ancestors: [{ tag: 'div', classes: ['thoughtknot-over'] }, card],
    };
    assert.equal(winner(all, layer, 'height').value, '0');
    assert.equal(winner(all, layer, 'position').value, 'relative');
    assert.equal(winner(all, panels, 'position').value, 'absolute');
    assert.equal(winner(all, panels, 'overflow-y').value, 'auto');
    assert.match(winner(all, panels, 'max-height').value, /--thoughtknot-room/);
  });
});

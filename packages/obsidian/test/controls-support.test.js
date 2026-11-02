// The View menu in every view, greyed where a view cannot take an option (editor spec §68, view_options_everywhere):
// controls-support.ts. Roger, 2 Nov 2026: options must work the same in every view. A view drawn as marks, such as
// Matrix or Force, has the same View menu and dock as a network. What it cannot take stays shown, greyed, saying why.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const PATH = 'Some note.md';
const ORG = `// graph: org
(ada:Person {name: 'Ada'}),
(bea:Person {name: 'Bea'}),
(cy:Person {name: 'Cy'}),
(ada)-[:MANAGES]->(bea),
(ada)-[:MANAGES]->(cy)`;
const styledAs = (view) => `// graph: org_style · STYLE org\n(d1:Diagram {type: 'thoughtknot.diagrams.${view}'})`;
const noteOf = (...blocks) => ['# Org', '', ...blocks.flatMap((b) => [fence(b), '']), ''].join('\n');

/** The card of the org graph drawn as `view`, or as a network; what `check` finds in it, then the card is gone. */
async function inCard(view, check) {
  const note = view ? noteOf(ORG, styledAs(view)) : noteOf(ORG);
  const env = await load({ files: { [PATH]: note } });
  try {
    const { el } = await show(env, note, 0);
    await until(() => el.querySelector('svg g.node[data-key]'));
    await check(el);
  } finally {
    env.uninstall();
  }
}

const menu = (el) => el.querySelector('.thoughtknot-view-menu');
const row = (el, option) => menu(el).querySelector(`[data-option="${option}"]`);
const greyed = (el) => el.querySelectorAll('.is-not-here').map((r) => r.getAttribute('data-option'));

describe('the View menu in every view', () => {
  // proves: view_options_everywhere
  test('a view drawn as marks has the View menu and its dock, as a network has', async () => {
    for (const view of ['force', 'matrix', 'arc'])
      await inCard(view, (el) => {
        assert.ok(menu(el), `${view} has a View menu`);
        assert.ok(el.querySelector('.thoughtknot-view-dock'), `${view} has the View dock`);
        assert.ok(row(el, 'lens'), `${view} lists the lenses`);
      });
  });

  // proves: view_options_everywhere
  test('a network greys nothing: it takes every option', async () => {
    await inCard(null, (el) => assert.deepEqual(greyed(el), []));
  });

  // proves: view_options_everywhere
  test('Force offers the fisheye and semantic zoom, as a network does', async () => {
    await inCard('force', (el) => {
      const lens = row(el, 'lens');
      assert.ok(!lens.classList.contains('is-not-here'));
      const select = lens.querySelector('select');
      assert.ok(!select.hasAttribute('disabled'));
      const options = select.querySelectorAll('option');
      assert.ok(!options.find((o) => o.getAttribute('value') === 'fisheye').hasAttribute('disabled'));
      assert.ok(!options.find((o) => o.getAttribute('value') === 'semantic').hasAttribute('disabled'));
    });
  });

  // proves: view_options_everywhere
  test('Force takes the layout lists and rounds, which it lays itself out by', async () => {
    await inCard('force', (el) => {
      const layout = menu(el).querySelectorAll('[data-option="layout"]');
      assert.ok(layout.length >= 4, 'rounds, then the layout, its shape and what stays put');
      for (const r of layout) for (const c of r.querySelectorAll('input, select')) assert.ok(!c.disabled, r.textContent);
      assert.ok(menu(el).querySelector('.thoughtknot-own-hint').hidden, 'no line says only a network takes them');
    });
  });

  // proves: view_options_everywhere
  test('Matrix keeps the Lens row, greyed, saying why, never just gone', async () => {
    await inCard('matrix', (el) => {
      const lens = row(el, 'lens');
      assert.ok(lens.classList.contains('is-not-here'));
      assert.equal(lens.getAttribute('aria-disabled'), 'true');
      assert.ok(lens.querySelector('select').hasAttribute('disabled'));
      assert.match(lens.textContent, /rows and cells/);
      assert.match(lens.getAttribute('title'), /Zoom in instead/);
    });
  });

  // proves: view_options_everywhere
  test('a switch a view cannot take is disabled, and says why in its own hint line', async () => {
    await inCard('treemap', (el) => {
      const merge = row(el, 'merge');
      assert.ok(merge.hasAttribute('disabled'));
      assert.match(merge.querySelector('.thoughtknot-switch-hint').textContent, /no links/);
    });
  });

  // proves: view_options_everywhere
  test('the dock greys the same controls as the menu', async () => {
    await inCard('matrix', (el) => {
      const dock = el.querySelector('.thoughtknot-view-dock');
      const buttons = dock.querySelectorAll('button[data-option]');
      assert.equal(buttons.length, 3, 'less detail, more detail, small labels');
      const [less, more, labels] = buttons;
      // its things fold into groups as a network's do, so the detail ladder works; it draws no links to label
      for (const b of [less, more]) assert.ok(!b.classList.contains('is-not-here'), b.getAttribute('aria-label'));
      assert.ok(labels.hasAttribute('disabled'), labels.getAttribute('aria-label'));
      assert.match(labels.getAttribute('title'), /no links/);
    });
  });
});

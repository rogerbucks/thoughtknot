// An exploration in every view (editor spec §71, explore_every_view). Roger, 31 Oct 2026: exploring from one thing is not
// a mind map's alone. Whatever view or diagram type the card draws, it shows only what the exploration has open, and a
// lens still works on top. The built plugin, loaded against the stand-ins for the page.
// Requirements: explore_every_view.
// - From the centre alone to one branch opened, each view draws exactly the things open and no others.
// - Ending the exploration brings every thing back, in the same view.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, settled, until } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const PATH = 'Some note.md';
const HUB = [
  '// graph: hub',
  "(hub:Idea {name: 'Hub'}),",
  ...['w', 'e', 'n', 's'].map((k) => `(${k}:Idea {name: 'Arm ${k}'}), (hub)-[:LINKS]->(${k}),`),
  ...Array.from({ length: 3 }, (_, i) => `(l${i}:Idea {name: 'Leaf ${i}'}), (w)-[:LINKS]->(l${i}),`),
  "(far:Idea {name: 'Far away'}), (l0)-[:LINKS]->(far)",
].join('\n');
const styled = (type) => `// graph: hub_style · STYLE hub\n(d1:Diagram {type: '${type}'})`;
const noteOf = (type) => ['# Hub', '', fence(HUB), '', ...(type ? [fence(styled(type)), ''] : [])].join('\n');
const OPEN = ['hub', 'l0', 'l1', 'l2', 'w'].sort();
const ALL = ['hub', 'w', 'e', 'n', 's', 'l0', 'l1', 'l2', 'far'];

/**
 * The views that draw each thing as a box of its own with its key: the classic types and the views of marks. Density
 * draws counts, with no thing to start a map from, so it is left out; it reads the same folded shape as the rest.
 */
const VIEWS = [
  ['network', ''],
  ['tree', 'tree'],
  ['flow', 'flow'],
  ['radial', 'radial'],
  ['timeline', 'timeline'],
  ['force', 'thoughtknot.diagrams.force'],
  ['matrix', 'thoughtknot.diagrams.matrix'],
  ['treemap', 'thoughtknot.diagrams.treemap'],
  ['chord', 'thoughtknot.diagrams.chord'],
  ['block', 'thoughtknot.diagrams.block'],
  ['plan', 'thoughtknot.diagrams.plan'],
  ['centroid', 'thoughtknot.diagrams.centroid'],
  ['containment', 'thoughtknot.diagrams.containment'],
  ['arc', 'thoughtknot.diagrams.arc'],
  ['hive', 'thoughtknot.diagrams.hive'],
  ['grid', 'thoughtknot.diagrams.grid'],
  ['map', 'thoughtknot.diagrams.map'],
  ['pole', 'thoughtknot.diagrams.pole'],
];

/** The keys of the things drawn in `el`, in order. */
const drawn = (el) =>
  el
    .querySelectorAll('svg g.node[data-key]')
    .filter((n) => !/thoughtknot-hidden/.test(n.getAttribute('class') ?? ''))
    .map((n) => n.getAttribute('data-key'))
    .sort();
const withText = (el, tag, text) => el.querySelectorAll(tag).find((b) => b.textContent.includes(text));

// proves: explore_every_view
test('every view draws only what an exploration has open, and everything again once it ends', async () => {
  const wrong = [];
  for (const [name, type] of VIEWS) {
    const note = noteOf(type);
    const env = await load({ files: { [PATH]: note } });
    let step = 'drawing';
    try {
      const { el } = await show(env, note, 0);
      await until(() => drawn(el).length > 0);
      step = 'starting the map';
      // Enter on a thing's box opens its details; there Explore from here starts the map
      el.querySelector('svg g.node[data-key="w"]')?.dispatch('keydown', { key: 'Enter' });
      await until(() => !!withText(el, 'button', 'Explore from here'));
      withText(el, 'button', 'Explore from here').click();
      await until(() => /Exploring/.test(el.querySelector('.thoughtknot-untangle')?.textContent ?? ''));
      step = 'exploring';
      await settled();
      if (drawn(el).join() !== OPEN.join()) wrong.push(`${name} drew ${drawn(el)} while exploring`);
      withText(el, 'button', 'Show the whole graph').click();
      await until(() => !/Exploring/.test(el.querySelector('.thoughtknot-untangle')?.textContent ?? ''));
      await settled();
      if (drawn(el).join() !== [...ALL].sort().join()) wrong.push(`${name} drew ${drawn(el)} when it ended`);
    } catch (e) {
      wrong.push(`${name} stopped at ${step}: ${e.message}`);
    } finally {
      env.uninstall();
    }
  }
  assert.deepEqual(wrong, []);
});

// proves: explore_every_view
test('a lens picked on top of an exploration leaves what is hidden hidden', async () => {
  const wrong = [];
  for (const [name, type] of VIEWS.filter(([n]) => ['network', 'force', 'arc'].includes(n))) {
    const note = noteOf(type);
    const env = await load({ files: { [PATH]: note } });
    try {
      const { el } = await show(env, note, 0);
      await until(() => drawn(el).length > 0);
      el.querySelector('svg g.node[data-key="w"]').dispatch('keydown', { key: 'Enter' });
      await until(() => !!withText(el, 'button', 'Explore from here'));
      withText(el, 'button', 'Explore from here').click();
      await until(() => /Exploring/.test(el.querySelector('.thoughtknot-untangle')?.textContent ?? ''));
      await settled();
      const select = el.querySelector('.thoughtknot-lens-choice').querySelector('select');
      select.value = 'fisheye';
      select.dispatch('change');
      await settled();
      assert.equal(select.value, 'fisheye', `${name}: the lens is on`);
      if (drawn(el).join() !== OPEN.join()) wrong.push(`${name} drew ${drawn(el)} under the lens`);
    } finally {
      env.uninstall();
    }
  }
  assert.deepEqual(wrong, []);
});

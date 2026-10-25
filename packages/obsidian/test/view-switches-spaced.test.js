// The View menu's layout options (editor spec §53, layout_saved_with_view): spacing, link length and group pull, each a
// slider. Sliding one lays the graph out again, spaced so. A view saved as shown keeps them, and opens spaced so again.
// The built plugin, loaded against the stand-ins for the page, laying out with the real engine.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const PATH = 'Some note.md';
const TOOLS = [
  'Hammer',
  'Saw',
  'Drill',
  'Level',
  'Tape',
  'Chisel',
  'Plane',
  'File',
  'Clamp',
  'Square',
  'Knife',
  'Pliers',
  'Wrench',
];
/** A toolbox holding 13 tools, one link more than a busy hub needs, and four people in two groups. */
const KIT = [
  '// graph: kit',
  "(box:Box {name: 'Toolbox'}),",
  ...TOOLS.map((t, i) => `(t${i + 1}:Tool {name: '${t}'}),`),
  "(ann:Person {name: 'Ann'}), (bob:Person {name: 'Bob'}), (cy:Person {name: 'Cy'}), (dee:Person {name: 'Dee'}),",
  ...TOOLS.map((_, i) => `(box)-[:HOLDS]->(t${i + 1}),`),
  '(ann)-[:ASKS]->(cy), (bob)-[:ASKS]->(dee), (ann)-[:USES]->(box)',
].join('\n');
// the links, in order: 0–12 the box holds each tool, 13 Ann asks Cy, 14 Bob asks Dee, 15 Ann uses the box
const GROUPS = `// graph: kit_style · STYLE kit
(n1:Nudge {word: 'group', thing: 'ann', group: 'Makers'}),
(n2:Nudge {word: 'group', thing: 'bob', group: 'Makers'}),
(n3:Nudge {word: 'group', thing: 'cy', group: 'Helpers'}),
(n4:Nudge {word: 'group', thing: 'dee', group: 'Helpers'})`;
const VIEW = '// graph: kit · QUERY view people\nMATCH (n:Person) RETURN n';
/** How long a lay-out may take on a busy runner, the suite running six files at once. */
const LAID = 20000;
const noteOf = (...blocks) => ['# Kit', '', ...blocks.flatMap((b) => [fence(b), '']), ''].join('\n');

describe('layout options', () => {
  const sliders = (el) => el.querySelectorAll('.thoughtknot-layout-option');
  const slide = (el, i, v) => {
    const input = sliders(el)[i].querySelector('input');
    input.value = String(v);
    input.dispatch('change');
  };
  /** How far the drawing's things spread: the diagonal of the box round them all. */
  const spread = (el) => {
    const points = el
      .querySelectorAll('g.node[data-key]')
      .flatMap((g) =>
        g.children.flatMap((c) => (c.getAttribute('points') ?? c.getAttribute('d') ?? '').split(/[ MCLZ]+/)),
      )
      .map((p) => p.split(',').map(Number))
      .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
    if (!points.length) return 0;
    const side = (k) => Math.max(...points.map((p) => p[k])) - Math.min(...points.map((p) => p[k]));
    return Math.hypot(side(0), side(1));
  };

  // proves: layout_saved_with_view
  test('the View menu spaces the layout, saved with a view only when it is saved as shown, and opens so again', async () => {
    const note = noteOf(KIT, GROUPS, VIEW);
    const env = await load({ files: { [PATH]: note } });
    let saved;
    try {
      const { el } = await show(env, note, 2);
      labelled(el, 'View').click();
      assert.deepEqual(
        sliders(el).map((s) => s.textContent.trim()),
        ['Spacing', 'Link length', 'Group pull'],
      );
      assert.deepEqual(
        sliders(el).map((s) => s.querySelector('input').value),
        ['1', '1', '0.5'],
        'as each layout lays out alone',
      );
      await until(() => spread(el) > 0, LAID);
      const before = spread(el);
      slide(el, 0, 3);
      await until(() => spread(el) > before * 1.2, LAID); // the things laid further apart
      assert.equal(env.state.files.get(PATH), note, 'not saved by sliding');
      labelled(el, 'Save as shown').click();
      await until(() => /:Shown/.test(env.state.files.get(PATH)));
      saved = env.state.files.get(PATH);
      assert.match(saved, /spacing: 3, link_length: 1, group_pull: 0.5/);
    } finally {
      env.uninstall();
    }
    const again = await load({ files: { [PATH]: saved } });
    try {
      const { el } = await show(again, saved, 2);
      assert.equal(sliders(el)[0].querySelector('input').value, '3', 'the view opens spaced as saved');
    } finally {
      again.uninstall();
    }
  });
});

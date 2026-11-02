// The View menu greys what the drawing shown does not read (editor spec §68, view_controls_apply). Roger, 2 Nov 2026:
// "Does the View menu update the screen?" A diagram type Graphviz lays out reads no layout choice of our own engine.
// The built plugin, loaded against the stand-ins for the page, laying out with the real engine.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const PATH = 'Some note.md';
const STEPS = [
  '// graph: steps',
  "(a:Step {name: 'Plan'}), (b:Step {name: 'Build'}), (c:Step {name: 'Ship'}),",
  '(a)-[:NEXT]->(b), (b)-[:NEXT]->(c)',
].join('\n');
/** The note, drawn as diagram type `type` when one is given. */
const noteOf = (type) =>
  [
    '# Steps',
    '',
    fence(STEPS),
    ...(type ? [fence(`// graph: steps_style · STYLE steps\n(d1:Diagram {type: '${type}'})`)] : []),
    '',
  ].join('\n');

/** The View menu of the note drawn as `type`: each layout control by its name, whether it can be used, and the hint. */
async function menuOf(type) {
  const note = noteOf(type);
  const env = await load({ files: { [PATH]: note } });
  try {
    const { el } = await show(env, note);
    labelled(el, 'View').click();
    const menu = el.querySelector('.thoughtknot-view-menu');
    const usable = (name) => {
      const row = [...menu.querySelectorAll('label, button')].find((r) => r.textContent.startsWith(name));
      assert.ok(row, `the menu has ${name}`);
      return !(row.querySelector('select, input') ?? row).disabled;
    };
    const hint = [...menu.querySelectorAll('.thoughtknot-switch-hint')].find((h) =>
      /our own engine/.test(h.textContent),
    );
    return { usable, hinted: !!hint && !hint.hidden };
  } finally {
    env.uninstall();
  }
}

// proves: view_controls_apply
test('in a network our own engine lays out, every layout control can be used', async () => {
  const { usable, hinted } = await menuOf();
  for (const name of ['Layout', 'Direction', 'Rounds', 'Lanes by kind', 'Spacing']) assert.ok(usable(name), name);
  assert.ok(!hinted, 'and nothing says otherwise');
});

// proves: view_controls_apply
test('in a radial drawing, what only our own engine reads is greyed and the menu says why', async () => {
  // Graphviz lays a radial drawing out (a flow far from a screen's shape is our own engine's, so reads them all)
  const { usable, hinted } = await menuOf('radial');
  for (const name of ['Layout', 'Direction', 'Shape', 'Keeps in place', 'Rounds', 'Lanes by kind'])
    assert.ok(!usable(name), `${name} is greyed`);
  assert.ok(usable('Spacing'), 'spacing is not greyed');
  assert.ok(hinted, 'the menu says it is only for a network our own engine lays out');
});

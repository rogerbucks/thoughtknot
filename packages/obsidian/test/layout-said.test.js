// The View menu says what the engine picked for the drawing, and why (editor spec §68, layout_pick_said). The built
// plugin, loaded against the stand-ins for the page, laying out with the real engine.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const PATH = 'Some note.md';
/** A chain of three steps, and a note with no link. */
const STEPS = [
  '// graph: steps',
  "(a:Step {name: 'Plan'}), (b:Step {name: 'Build'}), (c:Step {name: 'Ship'}), (n:Note {name: 'Aside'}),",
  '(a)-[:NEXT]->(b), (b)-[:NEXT]->(c)',
].join('\n');
const NOTE = ['# Steps', '', fence(STEPS), ''].join('\n');

// proves: layout_pick_said
test('the View menu says how the drawing was laid out and why, and where its loose things went', async () => {
  const env = await load({ files: { [PATH]: NOTE } });
  try {
    const { el } = await show(env, NOTE);
    labelled(el, 'View').click();
    const said = el.querySelector('.thoughtknot-view-menu .thoughtknot-layout-said');
    assert.ok(said && !said.hidden, 'the line is shown');
    assert.match(said.textContent, /^Laid out in rows as a tree/);
    assert.match(said.textContent, /1 thing with no link sits in the tray\./);
  } finally {
    env.uninstall();
  }
});

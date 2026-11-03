// An intent shown over any view (editor spec §58, intent_overlay). Each thing drawn is marked by how it pulls on the
// intent chosen, with a badge and a line beside its colour, and nothing moves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { readNote } from '../src/drawing.ts';
import { INTENT_MARKS, intentOverlay, intentPulls, withIntentOverlay } from '../src/intent-overlay.ts';

const PLAN = `// graph: plan · schema intent@1
(early:Intent {says: 'Out of the door by eight'}),
(calm:Intent {says: 'Mornings feel calm'}),
(prep:Thing {name: 'Pack the bag the night before'}),
(alarm:Thing {name: 'Set two alarms'}),
(news:Thing {name: 'Read the news at breakfast'}),
(walk:Thing {name: 'Walk the dog'}),
(prep)-[:SUPPORTS {likelihood: 'likely'}]->(early),
(news)-[:CONTRADICTS {likelihood: 'likely'}]->(early),
(alarm)-[:SUPPORTS]->(early),
(alarm)-[:CONTRADICTS]->(early),
(walk)-[:SUPPORTS]->(calm)`;

const read = () => {
  const r = readNote([PLAN]);
  return { graph: r.world.plan, drawing: r.graphs.get('plan') };
};

test('the overlay marks each thing by its link to the chosen intent with a second sign beside colour, and moves nothing', () => {
  const { graph, drawing } = read();
  const before = JSON.stringify(drawing.boxes);
  const canon = gs.canon(graph);
  const o = intentOverlay(graph, 'early', drawing);
  assert.deepEqual(
    [...o.things].map(([k, m]) => [k, m.tokens[0], m.badge, m.line]),
    [
      ['prep', 'intent.supports', 'up', 'bold'],
      ['alarm', 'intent.contested', 'question', 'dotted'],
      ['news', 'intent.contradicts', 'down', 'dashed'],
      ['walk', 'intent.unlinked', 'dot', 'solid'],
    ],
  );
  for (const m of o.things.values()) {
    assert.ok(m.badge && m.line, 'every mark has a badge and a line, never colour alone');
    assert.ok(!Object.values(m).some((v) => typeof v === 'string' && /^#|rgb/.test(v)), 'no colour value, only a hue');
  }
  assert.ok(!o.things.has('early') && !o.things.has('calm'), 'intents themselves are not marked');
  assert.equal(o.links.size, 0, 'links are left as they are');
  assert.equal(o.things.get('prep').means[0], 'Supports: Out of the door by eight');
  assert.deepEqual(
    o.legend.map((e) => e.means),
    [
      'Supports: Out of the door by eight',
      'Goes against: Out of the door by eight',
      'Pulls both ways on: Out of the door by eight',
      'Not linked to: Out of the door by eight',
    ],
  );
  assert.equal(JSON.stringify(drawing.boxes), before, 'no box moves');
  assert.equal(gs.canon(graph), canon, 'nothing is written');
  assert.equal(intentPulls(graph, 'calm').get('walk'), 'supports', 'another intent marks by its own links');
});

test('an intent shown over a rule keeps the rule and puts its own badge and line first', () => {
  const { graph, drawing } = read();
  const o = intentOverlay(graph, 'early', drawing);
  const rules = {
    things: new Map([['prep', { tokens: ['look.late'], hue: 'blue', badge: 'clock', means: ['Late'] }]]),
    links: new Map(),
    legend: [{ token: 'look.late', hue: 'blue', badge: 'clock', means: 'Late' }],
    clashes: [],
  };
  const both = withIntentOverlay(rules, o);
  const prep = both.things.get('prep');
  assert.deepEqual(prep.tokens, ['look.late', 'intent.supports']);
  assert.equal(prep.badge, INTENT_MARKS.supports.badge);
  assert.deepEqual(prep.means, ['Late', 'Supports: Out of the door by eight']);
  assert.equal(both.legend[0].token, 'look.late');
  assert.equal(withIntentOverlay(undefined, o), o);
});

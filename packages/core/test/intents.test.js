// Intents: what supports or contradicts a goal (editor spec §58). An intent is a thing typed by the standard schema
// intent@1. Things support or contradict it by links with a likelihood word and a reason, or by an IntentRule. Its
// standing is counts in words, worked out each time and never stored. The requirements: intent_thing, intent_links,
// intent_standing and intent_rule_links.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { readNote } from '../src/drawing.ts';
import { checkIntents } from '../src/intent-checks.ts';
import { intentLinks, intentStanding, intentStandings } from '../src/intents.ts';
import { graphOf } from './test-runs-fixtures.js';

const PLAN = `// graph: plan · schema intent@1
(calm:Intent {says: 'Mornings feel calm'}),
(early:Intent {says: 'Out of the door by eight', test: 'late == 0'}),
(prep:Thing {name: 'Pack the bag the night before', done: TRUE}),
(alarm:Thing {name: 'Set two alarms', done: FALSE}),
(news:Thing {name: 'Read the news at breakfast', done: FALSE}),
(walk:Thing {name: 'Walk the dog', done: FALSE}),
(prep)-[:SUPPORTS {likelihood: 'very-likely', reason: 'Nothing to hunt for'}]->(calm),
(alarm)-[:SUPPORTS {likelihood: 'likely', reason: 'Up on time'}]->(early),
(alarm)-[:CONTRADICTS {likelihood: 'unlikely', reason: 'A jarring start'}]->(calm),
(news)-[:CONTRADICTS {likelihood: 'likely', reason: 'It runs long'}]->(early)`;

const plan = (...more) => graphOf([PLAN, ...more].join(',\n'));

test('an intent with and without a test is read and checked by intent@1 with no schema in the note', () => {
  const r = readNote([PLAN]);
  assert.deepEqual(
    r.problems.filter((p) => p.severity !== 'hint'),
    [],
    'no warning that the schema is missing, nor any other',
  );
  const g = r.graphs.get('plan');
  assert.deepEqual(
    g.links.map((l) => l.reading),
    ['supports', 'supports', 'contradicts', 'contradicts'],
    'the links are read by the standard schema, not as unknown types',
  );
  const graph = plan();
  assert.deepEqual(
    graph.labelled('Intent').map((id) => graph.p(id).says),
    ['Mornings feel calm', 'Out of the door by eight'],
  );
  // only the intent with a test is checked; it reads a fact the graph has none of, so it is a break saying why
  assert.deepEqual(
    checkIntents(graph).map((b) => [b.id, b.why]),
    [['early', 'refused']],
  );
});

test('a supports and a contradicts link are read with their certainty, and a disagreeing pair becomes contested', () => {
  const links = intentLinks(plan());
  assert.deepEqual(
    links.map((l) => [l.from, l.side, l.intent, l.likelihood, l.reason, l.contested]),
    [
      ['prep', 'supports', 'calm', 'very-likely', 'Nothing to hunt for', false],
      ['alarm', 'supports', 'early', 'likely', 'Up on time', false],
      ['alarm', 'contradicts', 'calm', 'unlikely', 'A jarring start', false],
      ['news', 'contradicts', 'early', 'likely', 'It runs long', false],
    ],
  );
  const both = intentLinks(plan("(walk)-[:SUPPORTS {likelihood: 'likely'}]->(calm)", '(walk)-[:CONTRADICTS]->(calm)'));
  const walk = both.filter((l) => l.from === 'walk');
  assert.deepEqual(
    walk.map((l) => [l.side, l.likelihood, l.contested]),
    [
      ['supports', 'likely', true],
      ['contradicts', 'unstated', true],
    ],
    'two links that disagree are both contested; a link with no word is counted as unstated',
  );
  assert.ok(
    both.filter((l) => l.from !== 'walk').every((l) => !l.contested),
    'a thing pulling both ways on two intents is not contested',
  );
});

test('the standing counts each link by its certainty word and counts unlinked things, and no number is stored', () => {
  const graph = plan(
    "(bus:Thing {name: 'Check the bus times'})",
    "(bus)-[:SUPPORTS {likelihood: 'likely'}]->(early)",
    "(walk)-[:SUPPORTS {likelihood: 'likely'}]->(early)",
  );
  const before = gs.canon(graph);
  const s = intentStanding(graph, 'early');
  assert.deepEqual(s.supports, { likely: 3 });
  assert.deepEqual(s.contradicts, { likely: 1 });
  assert.deepEqual(s.contested, []);
  assert.deepEqual(s.unlinked, ['prep']);
  assert.equal(
    s.said,
    'Out of the door by eight: supported by 3 (3 likely 55–80%); contradicted by 1 (1 likely 55–80%); 1 thing not linked.',
  );
  const calm = intentStanding(plan('(walk)-[:SUPPORTS]->(calm)', '(walk)-[:CONTRADICTS]->(calm)'), 'calm');
  assert.deepEqual(calm.supports, { 'very-likely': 1 });
  assert.deepEqual(calm.contradicts, { unlikely: 1 });
  assert.deepEqual(calm.contested, ['walk']);
  assert.equal(
    calm.said,
    'Mornings feel calm: supported by 1 (1 very likely 80–95%); contradicted by 1 (1 unlikely 20–45%); 1 thing pulls both ways; 1 thing not linked.',
  );
  assert.equal(gs.canon(graph), before, 'working out the standing writes nothing into the graph');
  assert.ok(
    Object.values(graph.p('early')).every((v) => typeof v !== 'number'),
    'no score is stored on the intent',
  );
  assert.deepEqual(
    intentStandings(graph).map((x) => x.intent),
    ['calm', 'early'],
  );
});

test('a rule-made support link shows in the standing and leaves the note unchanged', () => {
  const graph = plan(
    `(done_helps:IntentRule {kind: 'Thing', when: 'done == true', reason: 'Done the night before'})`,
    "(done_helps)-[:SUPPORTS {likelihood: 'likely'}]->(early)",
  );
  const before = gs.canon(graph);
  const made = intentLinks(graph, 'early').filter((l) => l.made === 'rule');
  assert.deepEqual(
    made.map((l) => [l.from, l.side, l.likelihood, l.reason, l.rule]),
    [['prep', 'supports', 'likely', 'Done the night before', 'done_helps']],
  );
  const s = intentStanding(graph, 'early');
  assert.deepEqual(s.supports, { likely: 2 });
  assert.ok(!s.unlinked.includes('prep'), 'the thing the rule found is linked');
  assert.ok(!s.unlinked.includes('done_helps'), 'a rule is not a thing weighed against the intent');
  assert.equal(gs.canon(graph), before, 'the rule writes no link into the note');
  const odd = plan("(odd:IntentRule {when: 'done =='})", '(odd)-[:SUPPORTS]->(early)');
  assert.deepEqual(intentStanding(odd, 'early').refused, ['odd'], 'a rule that cannot run is said, never a pass');
});

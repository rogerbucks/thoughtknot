// Checking each thing of a style graph against the graph it styles (editor spec §2, style_graph_checked; §6; §14). What
// is sound is kept. Each fault is a problem on its line with its fix, and the part at fault is left out. A kind the style
// graph does not know, or a key its kind does not know, keeps the whole thing out.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkThings } from '../src/style-checks.ts';

/** The graph being styled: two things of kind Drink and Person, and one relationship type. */
const NAMES = {
  graph: 'g',
  things: new Set(['tea', 'me']),
  kinds: new Set(['Drink', 'Person']),
  types: new Set(['WARMS']),
  paths: new Set(),
  lenses: new Set(),
  properties: (of) => new Set(of.kind === 'Drink' || of.thing === 'tea' ? ['name', 'price'] : ['name']),
};

let line = 1;
/** One thing of the style graph as read, on its own line of block 0. */
const thing = (label, props) => {
  const at = { block: 0, line: ++line, id: `s${line}` };
  const span = () => ({ line: at.line - 1, start: 0, end: 1 });
  return { labels: [label], props, at, span, keySpan: span };
};

const checked = (...raws) => checkThings(raws, NAMES);

describe('a nudge', () => {
  test('`beside` naming two things of the graph is kept, with no problem', () => {
    const c = checked(thing('Nudge', { word: 'beside', thing: 'tea', other: 'me' }));
    assert.deepEqual(c.problems, []);
    assert.equal(c.nudges.length, 1);
    assert.deepEqual([c.nudges[0].word, c.nudges[0].thing, c.nudges[0].other], ['beside', 'tea', 'me']);
  });

  test('`beside` naming a thing the graph has not is left out, with a problem on its line', () => {
    const raw = thing('Nudge', { word: 'beside', thing: 'tea', other: 'coffee' });
    const c = checked(raw);
    assert.deepEqual(c.nudges, []);
    assert.equal(c.problems.length, 1);
    assert.equal(c.problems[0].line, raw.at.line);
    assert.ok(c.problems[0].fix, 'the problem has its fix');
  });

  test('a nudge with no word, or one of the wrong word, is left out', () => {
    const c = checked(thing('Nudge', { thing: 'tea' }), thing('Nudge', { word: 'near', thing: 'tea', other: 'me' }));
    assert.deepEqual(c.nudges, []);
    assert.equal(c.problems.length, 2);
  });
});

describe('a show', () => {
  test('a property of a kind is shown inline, on unless it says off', () => {
    const c = checked(
      thing('Show', { kind: 'Drink', property: 'price' }),
      thing('Show', { thing: 'me', property: 'name', inline: 'off' }),
    );
    assert.deepEqual(c.problems, []);
    assert.deepEqual(
      c.shows.map((s) => [s.kind ?? s.thing, s.property, s.inline]),
      [
        ['Drink', 'price', 'on'],
        ['me', 'name', 'off'],
      ],
    );
  });

  test('a property its target does not have, or two targets at once, is left out', () => {
    const c = checked(
      thing('Show', { kind: 'Person', property: 'price' }),
      thing('Show', { kind: 'Drink', thing: 'tea', property: 'name' }),
      thing('Show', { property: 'name' }),
    );
    assert.deepEqual(c.shows, []);
    assert.equal(c.problems.length, 3);
  });
});

describe('the thing itself', () => {
  test('a kind the style graph does not know is one problem, and nothing of it is kept', () => {
    const c = checked(thing('Sparkle', { word: 'beside' }));
    assert.equal(c.problems.length, 1);
    assert.equal(c.problems[0].graph, 'g');
    for (const [key, list] of Object.entries(c)) if (key !== 'problems') assert.deepEqual(list, [], key);
  });

  test('a key its kind does not know keeps the whole thing out, though the rest is sound', () => {
    const c = checked(thing('Nudge', { word: 'beside', thing: 'tea', other: 'me', colour: 'red' }));
    assert.deepEqual(c.nudges, []);
    assert.equal(c.problems.length, 1);
  });

  test('the sound things are kept beside the faulty ones, in the order written', () => {
    const c = checked(
      thing('Nudge', { word: 'before', thing: 'me', other: 'tea' }),
      thing('Nudge', { word: 'beside', thing: 'tea' }),
      thing('Nudge', { word: 'beside', thing: 'tea', other: 'me' }),
    );
    assert.deepEqual(
      c.nudges.map((n) => n.word),
      ['before', 'beside'],
    );
    assert.equal(c.problems.length, 1);
  });
});

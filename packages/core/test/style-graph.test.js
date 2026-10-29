// The style graph's shape (editor spec §2, style_words_checked; §6, four_nudge_words). Each kind of style thing has its
// keys, and those are the keys the checks accept. A style with nothing in it is the locked style, made fresh each time.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  article,
  emptyStyle,
  NUDGE_WORDS,
  STYLE_HUES,
  STYLE_KEYS,
  STYLE_KINDS,
  DIAGRAM_TYPES,
  PRESET_IDS,
} from '../src/style-graph.ts';
import { checkThings } from '../src/style-checks.ts';

const NAMES = {
  graph: 'g',
  things: new Set(['tea']),
  kinds: new Set(['Drink']),
  types: new Set(['WARMS']),
  paths: new Set(),
  properties: () => new Set(['name']),
};
/** The problem code of a key a kind does not use. */
const UNKNOWN_KEY = 'GN806';
const span = () => ({ line: 0, start: 0, end: 1 });

describe('the kinds and their keys', () => {
  test('every kind of style thing has its keys, each written once, and only those kinds do', () => {
    assert.deepEqual(Object.keys(STYLE_KEYS).sort(), [...STYLE_KINDS].sort());
    for (const kind of STYLE_KINDS)
      assert.equal(new Set(STYLE_KEYS[kind]).size, STYLE_KEYS[kind].length, `${kind} has each key once`);
  });

  test('a key on a kind’s list is never reported as unknown, and a key off it is', () => {
    for (const kind of STYLE_KINDS) {
      const raw = (props) => ({ labels: [kind], props, at: { block: 0, line: 2, id: 's' }, span, keySpan: span });
      for (const key of STYLE_KEYS[kind]) {
        const { problems } = checkThings([raw({ [key]: 'x' })], NAMES);
        assert.ok(!problems.some((p) => p.code === UNKNOWN_KEY), `${kind}.${key} is a known key`);
      }
      const { problems } = checkThings([raw({ sparkle: 'x' })], NAMES);
      assert.ok(
        problems.some((p) => p.code === UNKNOWN_KEY && /sparkle/.test(p.message)),
        `${kind}.sparkle is reported`,
      );
    }
  });
});

describe('the words', () => {
  test('a nudge has four words; the diagram types and presets each name a default', () => {
    assert.deepEqual([...NUDGE_WORDS], ['beside', 'before', 'group', 'direction']);
    assert.ok(DIAGRAM_TYPES.includes('network'));
    assert.equal(PRESET_IDS[0], 'default');
  });

  test('the hues a style may name are each named once, red and green among them', () => {
    assert.equal(new Set(STYLE_HUES).size, STYLE_HUES.length);
    for (const hue of ['red', 'green']) assert.ok(STYLE_HUES.includes(hue), hue);
  });

  test('a kind is said with `an` before a vowel and `a` before anything else', () => {
    assert.deepEqual(['Arrows', 'Show', 'elephant', 'Look'].map(article), ['an', 'a', 'an', 'a']);
  });
});

describe('a style with nothing in it', () => {
  test('holds nothing, and is made fresh each time, so one changed never changes the next', () => {
    const first = emptyStyle();
    for (const [key, value] of Object.entries(first))
      assert.equal(value instanceof Map ? value.size : value.length, 0, key);
    first.nudges.push({ word: 'direction', at: { block: 0, line: 1, id: 'n' } });
    first.views.set('v', { outside: 'fade' });
    const next = emptyStyle();
    assert.equal(next.nudges.length, 0);
    assert.equal(next.views.size, 0);
  });
});

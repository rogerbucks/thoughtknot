// proves: risk_panel
// The graphs and things last opened (risk NEURO-11): newest first, each once, ten at most, and read back safely.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { VISITS_KEPT, visitsFrom, withVisit } from '../src/recent.ts';

describe('the recent visits', () => {
  test('a visit goes to the head, and a repeat is moved up, never listed twice', () => {
    const a = { path: 'A.md', graph: 'a' };
    const b = { path: 'B.md', graph: 'b' };
    assert.deepEqual(withVisit(withVisit([], a), b), [b, a]);
    assert.deepEqual(withVisit([b, a], a), [a, b]);
  });

  test('a thing of a graph is its own visit', () => {
    const graph = { path: 'A.md', graph: 'a' };
    const thing = { ...graph, thing: 'x' };
    assert.deepEqual(withVisit([graph], thing), [thing, graph]);
  });

  test('no more than ten are kept, the oldest dropped', () => {
    let list = [];
    for (let i = 0; i < 15; i++) list = withVisit(list, { path: `${i}.md`, graph: 'g' });
    assert.equal(list.length, VISITS_KEPT);
    assert.equal(list[0].path, '14.md');
    assert.equal(list.at(-1).path, '5.md');
  });

  test('what was saved is read back only when whole', () => {
    assert.deepEqual(visitsFrom('nope'), []);
    assert.deepEqual(
      visitsFrom([
        { path: 'A.md', graph: 'a', thing: 3 },
        { path: '' },
        null,
        { path: 'B.md', graph: 'b', thing: 't' },
      ]),
      [
        { path: 'A.md', graph: 'a' },
        { path: 'B.md', graph: 'b', thing: 't' },
      ],
    );
  });
});

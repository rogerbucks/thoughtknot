// Spots a layout gave, grown until boxes have room (editor spec §68, layout_own_engine). Spans layouts/given.ts.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { roomy } from '../src/layouts/given.ts';

const box = [100, 40];
const sizes = (ks) => new Map(ks.map((k) => [k, box]));

describe('roomy', () => {
  test('boxes on top of each other are grown apart, keeping their order and shape', () => {
    const spots = new Map([
      ['a', [0, 0]],
      ['b', [10, 0]],
      ['c', [20, 0]],
    ]);
    const out = roomy(spots, sizes(['a', 'b', 'c']), 10);
    const [a, b, c] = ['a', 'b', 'c'].map((k) => out.get(k));
    assert.ok(b[0] - a[0] >= 110, 'a and b clear each other');
    assert.ok(a[0] < b[0] && b[0] < c[0], 'none moves past another');
    assert.equal(c[0] - b[0], b[0] - a[0], 'every spot moves out by the same share');
  });

  test('spots already apart are left where they are', () => {
    const spots = new Map([
      ['a', [0, 0]],
      ['b', [500, 0]],
    ]);
    assert.equal(roomy(spots, sizes(['a', 'b']), 10), spots);
  });

  test('two linked boxes keep room for the words on their link', () => {
    const spots = new Map([
      ['a', [0, 0]],
      ['b', [120, 0]],
    ]);
    assert.equal(roomy(spots, sizes(['a', 'b']), 10), spots, 'apart enough with no words between');
    const out = roomy(spots, sizes(['a', 'b']), 10, { links: [{ from: 'a', to: 'b' }], gap: 60 });
    assert.ok(out.get('b')[0] - out.get('a')[0] >= 160, 'room for words 60 wide between the boxes');
  });
});

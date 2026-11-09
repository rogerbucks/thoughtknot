// A fetched data set kept in a local cache (editor spec §52, data_set_cache). It records where and when. The drawing
// says how old it is. With no network the graph still opens, and says the data is old or missing.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ageWords, cacheEntry, readSet } from '../src/data-set-cache.ts';
import { sha256 } from '../src/ai-digest.ts';

const PLACE = 'https://example.org/sales.csv';
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 1);

describe('data_set_cache', () => {
  test('the cache records the place, the time of the fetch and the digest of the text', () => {
    assert.deepEqual(cacheEntry(PLACE, 'a,b\n1,2\n', T0), {
      place: PLACE,
      text: 'a,b\n1,2\n',
      digest: sha256('a,b\n1,2\n'),
      at: T0,
    });
  });

  test('a fetch now is fresh and makes a new entry', () => {
    const r = readSet(PLACE, 'a\n2\n', cacheEntry(PLACE, 'a\n1\n', T0), T0 + DAY);
    assert.equal(r.state, 'fresh');
    assert.equal(r.text, 'a\n2\n');
    assert.equal(r.entry.at, T0 + DAY);
    assert.match(r.said, /fetched just now/);
  });

  test('not fetched, the cached copy is shown with its age', () => {
    const r = readSet(PLACE, undefined, cacheEntry(PLACE, 'a\n1\n', T0), T0 + 3 * DAY);
    assert.equal(r.state, 'cached');
    assert.equal(r.text, 'a\n1\n');
    assert.match(r.said, /fetched 3 days ago/);
  });

  test('offline, the graph still opens on its copy and says it is old; with no copy it says it is missing', () => {
    const old = readSet(PLACE, null, cacheEntry(PLACE, 'a\n1\n', T0), T0 + 2 * 3_600_000);
    assert.equal(old.state, 'old');
    assert.equal(old.text, 'a\n1\n');
    assert.match(old.said, /could not be fetched: showing the copy fetched 2 hours ago/);
    const missing = readSet(PLACE, null, undefined, T0);
    assert.equal(missing.state, 'missing');
    assert.match(missing.said, /no copy is kept/);
    assert.equal(readSet(PLACE, undefined, undefined, T0).state, 'missing');
  });

  test('the age reads in minutes, hours or days', () => {
    assert.equal(ageWords(T0, T0), '1 minute');
    assert.equal(ageWords(T0, T0 + 5 * 60_000), '5 minutes');
    assert.equal(ageWords(T0, T0 + 3_600_000), '1 hour');
    assert.equal(ageWords(T0, T0 + DAY), '1 day');
    assert.equal(ageWords(T0, T0 + 40 * DAY), '40 days');
  });
});

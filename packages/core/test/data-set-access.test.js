// Fetching an outside data set (editor spec §52, data_set_access): data-set-access.ts. Nothing is fetched until asked.
// Only picked sources are reached, and no secret is written to a note. Data above the note's classification is refused,
// with the reason.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fetchDataSet, placeProblem } from '../src/data-set-access.ts';

const LEVELS = ['Public', 'Internal', 'Confidential'];
const access = (over = {}) => ({
  picked: ['https://data.example.org'],
  levels: LEVELS,
  note: 'Internal',
  unlabelled: 'Confidential',
  ...over,
});
/** A host fetch that records every address it is asked for. */
function host(reply = { text: 'a,b\n1,2\n' }) {
  const asked = [];
  const fetch = async (url) => {
    asked.push(url);
    if (reply instanceof Error) throw reply;
    return reply;
  };
  return { asked, fetch };
}
const PLACE = 'https://data.example.org/sales.csv';

describe('an outside data set is fetched (data_set_access)', () => {
  test('only when asked: unasked, nothing is reached', async () => {
    const h = host();
    assert.match((await fetchDataSet(PLACE, false, access(), h.fetch)).refused, /only when you ask/);
    assert.deepEqual(h.asked, []);
    assert.deepEqual(await fetchDataSet(PLACE, true, access(), h.fetch), { text: 'a,b\n1,2\n' });
    assert.deepEqual(h.asked, [PLACE]);
  });

  test('only from the sources picked, and only over https', async () => {
    const h = host();
    for (const [place, why] of [
      ['https://other.example.org/x.csv', /not one of the sources you picked/],
      ['http://data.example.org/sales.csv', /not https/],
      ['https://data.example.org.evil.test/x.csv', /not one of the sources/],
      ['data.example.org/sales.csv', /not a web address/],
    ])
      assert.match((await fetchDataSet(place, true, access(), h.fetch)).refused, why, place);
    assert.deepEqual(h.asked, []);
    assert.deepEqual(placeProblem(PLACE, ['https://data.example.org/']), { origin: 'https://data.example.org' });
  });

  test('a picked source written with trailing slashes is the same source, however many it has', () => {
    assert.deepEqual(placeProblem('https://data.example.org/a.csv', ['https://data.example.org///']), {
      origin: 'https://data.example.org',
    });
    const many = `https://data.example.org${'/'.repeat(50000)}`;
    assert.deepEqual(placeProblem('https://data.example.org/a.csv', [many]), { origin: 'https://data.example.org' });
    assert.match(placeProblem('https://data.example.org/a.csv', [`${many}x`]), /not one of the sources you picked/);
  });

  test('no password or token rides in the place a note keeps: the host signs in its own way', async () => {
    const h = host();
    for (const place of [
      'https://ann:hunter2@data.example.org/sales.csv',
      // a token's shape, put together here so the repository's own secret scan does not find one in this file
      `https://data.example.org/sales.csv?key=${['gh', 'p_'].join('')}0123456789abcdefghijklmnopqrstuvwxyzAB`,
    ])
      assert.match((await fetchDataSet(place, true, access(), h.fetch)).refused, /password or token/, place);
    assert.deepEqual(h.asked, []);
  });

  test('data above the note’s classification is refused, saying why; an unlabelled note counts as its setting', async () => {
    const secret = host({ text: 'x', classification: 'Confidential' });
    assert.match(
      (await fetchDataSet(PLACE, true, access(), secret.fetch)).refused,
      /labelled Confidential, above what the note allows \(Internal\)/,
    );
    const inFront = host({ text: '---\nclassification: Confidential\n---\nrows' });
    assert.match((await fetchDataSet(PLACE, true, access(), inFront.fetch)).refused, /above what the note allows/);
    assert.ok('text' in (await fetchDataSet(PLACE, true, access({ note: null }), secret.fetch)));
    const odd = host({ text: 'x', classification: 'Top secret' });
    assert.match((await fetchDataSet(PLACE, true, access(), odd.fetch)).refused, /level your settings do not know/);
  });

  test('a failed fetch says where and why, and keeps nothing', async () => {
    const h = host(new Error('offline'));
    assert.match(
      (await fetchDataSet(PLACE, true, access(), h.fetch)).refused,
      /data\.example\.org failed: Error: offline/,
    );
  });
});

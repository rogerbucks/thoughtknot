// A person's own view presets, kept as a list (view_presets_own_list).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { addOwn, deleteOwn, readOwnList, renameOwn, MOST_OWN } from '../src/own-presets.ts';
import { STARTERS } from '../src/view-presets.ts';

const calm = STARTERS.find((p) => p.id === 'calm');
const names = (text) => readOwnList(text).map((p) => p.name);

describe('own presets', () => {
  test('start as an empty list', () => {
    assert.deepEqual(readOwnList(''), []);
    assert.deepEqual(readOwnList('not json'), []);
  });

  test('keep any number of presets, each with the name chosen', () => {
    let text = addOwn('', calm, 'Evening');
    text = addOwn(text, calm, 'Morning');
    assert.deepEqual(names(text), ['Evening', 'Morning']);
    const ids = readOwnList(text).map((p) => p.id);
    assert.equal(new Set(ids).size, 2);
    assert.ok(ids.every((id) => id.startsWith('own:')));
  });

  test('rename and delete one without touching the rest', () => {
    let text = addOwn(addOwn('', calm, 'A'), calm, 'B');
    const [a, b] = readOwnList(text);
    text = renameOwn(text, a.id, 'Alpha');
    assert.deepEqual(names(text), ['Alpha', 'B']);
    text = deleteOwn(text, b.id);
    assert.deepEqual(names(text), ['Alpha']);
    assert.deepEqual(names(deleteOwn(text, 'own:nothing')), ['Alpha']);
  });

  test('an empty name is refused and a long one is cut', () => {
    const text = addOwn('', calm, '   ');
    assert.equal(names(text)[0], calm.name);
    assert.ok(names(addOwn('', calm, 'x'.repeat(200)))[0].length <= 60);
  });

  test('are read as untrusted and never go below the floor', () => {
    const evil = JSON.stringify({
      format: 'thoughtknot-own-presets@1',
      items: [
        {
          format: 'thoughtknot-view-preset@1',
          id: 'x',
          name: 'Bad',
          chain: { text: { wordSpacing: 0 }, formatting: { contrast: 'x' } },
          settings: { evil: 'yes' },
        },
        'junk',
        null,
      ],
    });
    const [p, ...rest] = readOwnList(evil);
    assert.equal(rest.length, 0);
    assert.ok(p.chain.text.wordSpacing >= 0.16);
    assert.equal(p.chain.formatting.contrast, 'AA');
    assert.equal('evil' in p.settings, false);
  });

  test('stop at the most a person may keep', () => {
    let text = '';
    for (let i = 0; i < MOST_OWN + 5; i++) text = addOwn(text, calm, `P${i}`);
    assert.equal(readOwnList(text).length, MOST_OWN);
  });
});

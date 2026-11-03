// Levels named by your AI or by you (editor spec §68, ai_levels): named-levels.ts. The subject, area and topic of each
// thing make the levels, saved in the note as plain properties. Every group nests in one a level out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { namedLevels } from '../src/named-levels.ts';

const thing = (key, texts) => ({ key, text: key, kinds: ['Task'], texts: new Map(Object.entries(texts)) });

test('ai_levels: no names leaves the levels found from the links', () => {
  assert.equal(namedLevels({ things: [thing('a', { status: 'done' })], links: [] }), null);
});

test('ai_levels: subjects, areas and topics nest, the last level shows every item', () => {
  const shape = {
    things: [
      thing('a', { subject: 'Money', area: 'Budget', topic: 'Rent' }),
      thing('b', { subject: 'Money', area: 'Budget', topic: 'Food' }),
      thing('c', { subject: 'Money', area: 'Tax' }),
      thing('d', { subject: 'Health', area: 'Budget' }),
      thing('e', {}),
    ],
    links: [],
  };
  const levels = namedLevels(shape);
  assert.deepEqual(
    levels.map((l) => l.name),
    ['Subjects', 'Areas', 'Topics', 'Every item'],
  );
  assert.deepEqual(
    levels[0].groups.map((g) => [g.name, g.things]),
    [
      ['Money', ['a', 'b', 'c']],
      ['Health', ['d']],
      ['No subject', ['e']],
    ],
  );
  // the same area name under two subjects makes two groups, each in its own subject
  const budgets = levels[1].groups.filter((g) => g.name === 'Budget');
  assert.equal(budgets.length, 2);
  for (let i = 1; i < 3; i++)
    for (const g of levels[i].groups) {
      const p = levels[i - 1].groups.find((q) => q.key === g.parent);
      assert.ok(p, `${g.key} has its parent`);
      assert.ok(g.things.every((t) => p.things.includes(t)));
    }
  assert.deepEqual(levels[3].groups, []);
});

test('ai_levels: only the levels some thing names are made', () => {
  const levels = namedLevels({ things: [thing('a', { topic: 'Rent' }), thing('b', { topic: 'Food' })], links: [] });
  assert.deepEqual(
    levels.map((l) => l.name),
    ['Topics', 'Every item'],
  );
  assert.equal(levels[0].groups[0].parent, undefined);
});

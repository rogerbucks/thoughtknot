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

// ai_levels
test('the legend asks your AI to name the levels while AI is on, and the names it gives make the levels', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { make } = await import('../src/display/graph-view/note-callouts.ts');
    const { LevelLegend } = await import('../src/display/graph-view/level-legend.ts');
    const { levelsOf } = await import('../src/display/graph-view/level-clouds-svg.ts');
    const { readNote } = await import('../src/drawing.ts');
    const lines = ['// graph: g'];
    for (let i = 0; i < 12; i++)
      lines.push(`(t${i}:Task {name: 'Thing ${i}', subject: '${i < 6 ? 'Money' : 'Health'}'}),`);
    lines.push('(t12:Task)');
    const reading = readNote([lines.join('\n')]);
    const drawing = reading.graphs.get('g');
    assert.deepEqual(
      levelsOf(drawing, reading.world.g)[0].groups.map((g) => [g.name, g.things.length]),
      [
        ['Money', 6],
        ['Health', 6],
        ['No subject', 1],
      ],
    );
    let on = false,
      asked = 0;
    const parent = doc.createElement('div');
    const legend = new LevelLegend(parent, {
      viewport: doc.createElement('div'),
      svg: () => make('svg', {}),
      redraw: () => {},
      drawing: () => drawing,
      nameLevels: () => (on ? () => asked++ : null),
    });
    const ai = parent.querySelector('.thoughtknot-level-ai');
    legend.show(levelsOf(drawing, reading.world.g));
    assert.ok(ai.classList.contains('is-hidden'), 'hidden while AI is off');
    on = true;
    legend.show([...levelsOf(drawing, reading.world.g)]);
    assert.ok(!ai.classList.contains('is-hidden'), 'shown while AI is on');
    ai.click();
    assert.equal(asked, 1);
  } finally {
    uninstall();
  }
});

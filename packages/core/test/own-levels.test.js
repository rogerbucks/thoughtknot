// Your own level of detail (editor spec §68, own_levels): own-levels.ts. A level grouped by status or kind sits on top
// of the found levels, or below the subjects. Every group still nests in one a level out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BY_KIND, ownChoices, ownValues, withOwnLevel } from '../src/own-levels.ts';

const thing = (key, status, kind = 'Task') => ({
  key,
  text: key,
  kinds: [kind],
  texts: new Map(status ? [['status', status]] : []),
});
const shape = {
  things: [thing('a', 'done'), thing('b', 'open'), thing('c', 'done', 'Idea'), thing('d')],
  links: [],
};
const levels = [
  {
    name: 'Subjects',
    groups: [
      { key: '0:0', name: 'Work', things: ['a', 'b'] },
      { key: '0:1', name: 'Money', things: ['c', 'd'] },
    ],
  },
  { name: 'Every item', groups: [] },
];

/** Each group of each level nests in a group of the level before, holding all its things. */
function nests(ls) {
  for (let i = 1; i < ls.length; i++)
    for (const g of ls[i].groups) {
      const p = ls[i - 1].groups.find((q) => q.key === g.parent);
      assert.ok(p, `${g.key} has its parent in level ${i - 1}`);
      assert.ok(
        g.things.every((t) => p.things.includes(t)),
        `${g.key} sits inside ${p.key}`,
      );
    }
}

// proves: own_levels
test('the choices are kind and each property, and the values each once', () => {
  assert.deepEqual(ownChoices(shape), [BY_KIND, 'status']);
  assert.deepEqual(ownValues(shape, 'status'), ['done', 'open', '']);
});

// proves: own_levels
test('status on top: the things grouped by status, each subject split under them, all nested', () => {
  const ls = withOwnLevel(levels, shape, { by: 'status', at: 0 }, 'Status', 'No status');
  assert.deepEqual(
    ls.map((l) => l.name),
    ['Status', 'Subjects', 'Every item'],
  );
  assert.deepEqual(
    ls[0].groups.map((g) => [g.name, g.things]),
    [
      ['done', ['a', 'c']],
      ['open', ['b']],
      ['No status', ['d']],
    ],
  );
  assert.equal(ls[1].groups.length, 4, 'Work and Money split by status');
  nests(ls);
});

// proves: own_levels
test('swapped below the subjects: each subject split by kind, and a value that splits nothing adds no level', () => {
  const ls = withOwnLevel(levels, shape, { by: BY_KIND, at: 1 }, 'Kind', 'No kind');
  assert.deepEqual(
    ls.map((l) => l.name),
    ['Subjects', 'Kind', 'Every item'],
  );
  assert.deepEqual(
    ls[1].groups.map((g) => [g.name, g.parent]),
    [
      ['Task', '0:0'],
      ['Idea', '0:1'],
      ['Task', '0:1'],
    ],
  );
  nests(ls);
  const same = { things: shape.things.map((t) => ({ ...t, kinds: ['Task'] })), links: [] };
  assert.equal(withOwnLevel(levels, same, { by: BY_KIND, at: 0 }, 'Kind', 'No kind').length, 2);
});

// proves: own_levels
test('the legend picks a level of your own, swaps it below the subjects, and goes back to the found levels', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { make } = await import('../src/display/graph-view/note-callouts.ts');
    const { LevelLegend } = await import('../src/display/graph-view/level-legend.ts');
    const { levelsOf } = await import('../src/display/graph-view/level-clouds-svg.ts');
    const boxes = [],
      links = [];
    for (let i = 0; i < 40; i++) {
      boxes.push({ key: `t${i}`, text: `Thing ${i}`, kind: i % 2 ? 'Task' : 'Idea' });
      links.push({ from: `t${i}`, to: `t${Math.floor(i / 6) * 6 + ((i + 1) % 6)}`, type: 'USES' });
    }
    const drawing = { graph: 'g', boxes, links, estimates: [] };
    const parent = doc.createElement('div');
    let redrawn = 0;
    const legend = new LevelLegend(parent, {
      viewport: doc.createElement('div'),
      svg: () => make('svg', {}),
      redraw: () => redrawn++,
      drawing: () => drawing,
    });
    legend.show(levelsOf(drawing));
    const found = levelsOf(drawing).map((l) => l.name);
    const options = parent.querySelectorAll('option').map((o) => o.getAttribute('value'));
    assert.ok(options.includes('kind'), 'kind is offered');
    legend.choose('kind');
    assert.equal(redrawn, 1);
    assert.deepEqual(
      levelsOf(drawing).map((l) => l.name),
      ['Kind', ...found],
      'a level of its own on top',
    );
    legend.swap();
    assert.deepEqual(
      levelsOf(drawing)
        .map((l) => l.name)
        .slice(0, 2),
      [found[0], 'Kind'],
      'swapped below',
    );
    legend.choose(null);
    assert.deepEqual(
      levelsOf(drawing).map((l) => l.name),
      found,
      'back to the found levels',
    );
  } finally {
    uninstall();
  }
});

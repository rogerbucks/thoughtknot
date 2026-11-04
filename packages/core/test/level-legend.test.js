// The legend of subjects under the level badge (editor spec §68, level_colours, ai_levels): level-legend.ts. While AI
// is on, its button asks your AI to name the levels, and the names it gives make the levels.
import { test } from 'node:test';
import assert from 'node:assert/strict';

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

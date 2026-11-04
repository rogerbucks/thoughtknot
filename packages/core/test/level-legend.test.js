// The legend of subjects under the level badge (editor spec §68, level_colours, ai_levels, cloud_edit): level-legend.ts.
// While AI is on, its button asks your AI to name the levels. A named group can be renamed, merged or taken apart.
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

// proves: cloud_edit
test("a named group's card renames it, merges it, or takes it apart, from its ✎ or by right-clicking its cloud", async () => {
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
    const levels = levelsOf(drawing, reading.world.g);
    const edits = [];
    let writable = false;
    const viewport = doc.createElement('div');
    const legend = new LevelLegend(doc.createElement('div'), {
      viewport,
      svg: () => make('svg', {}),
      redraw: () => {},
      drawing: () => drawing,
      editGroup: () => (writable ? (things, property, value) => edits.push([things.length, property, value]) : null),
    });
    legend.show(levels);
    const card = viewport.querySelector('.thoughtknot-cloud-card');
    assert.ok(card.classList.contains('is-hidden'));
    assert.equal(legend.edit(levels[0].groups[0].key), false, 'nothing opens while the note is only read');
    writable = true;
    legend.show([...levels]);
    const pens = legend['chips'].querySelectorAll('.thoughtknot-level-edit');
    assert.equal(pens.length, 3, 'one ✎ for each named subject, the unnamed one too');
    assert.equal(pens[0].getAttribute('aria-label'), 'Edit Money');
    pens[0].click();
    assert.ok(!card.classList.contains('is-hidden'));
    assert.equal(card.getAttribute('role'), 'dialog');
    const name = card.querySelector('input');
    assert.equal(name.value, 'Money');
    name.value = 'Budget';
    card.querySelector('form').dispatch('submit');
    assert.deepEqual(edits.at(-1), [6, 'subject', 'Budget']);
    assert.ok(card.classList.contains('is-hidden'), 'closed once written');
    // merged into another subject of its level
    pens[0].click();
    const into = card.querySelector('select');
    assert.deepEqual(
      into.querySelectorAll('option').map((o) => o.textContent),
      ['Merge into…', 'Health'],
      'never into the group of things with no subject',
    );
    into.value = 'Health';
    card
      .querySelectorAll('button')
      .find((b) => b.textContent === 'Merge')
      .click();
    assert.deepEqual(edits.at(-1), [6, 'subject', 'Health']);
    // right-clicking a cloud opens its card; Not a group takes its subject off
    const unit = make('g', { class: 'thoughtknot-cloud-unit', 'data-cloud': levels[0].groups[1].key });
    viewport.appendChild(unit);
    assert.ok(unit.dispatch('contextmenu').defaultPrevented);
    assert.match(card.textContent, /Edit Health/);
    card
      .querySelectorAll('button')
      .find((b) => b.textContent === 'Not a group')
      .click();
    assert.deepEqual(edits.at(-1), [6, 'subject', null]);
    // Escape closes it
    pens[1].click();
    card.dispatch('keydown', { key: 'Escape' });
    assert.ok(card.classList.contains('is-hidden'));
  } finally {
    uninstall();
  }
});

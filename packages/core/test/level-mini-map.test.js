// The subjects on the mini-map (editor spec §68, level_mini_map): level-mini-map.ts. Each subject is a patch of its
// colour around its things' boxes, behind them, drawn from the boxes already on the mini-map.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// proves: level_mini_map
test('each subject is a patch of its colour around its boxes, behind them, and none for one level', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { subjectHulls, drawHulls } = await import('../src/display/graph-view/level-mini-map.ts');
    const { make } = await import('../src/display/graph-view/note-callouts.ts');
    const levels = [
      {
        name: 'Subjects',
        groups: [
          { key: '|subject=Money', name: 'Money', things: ['a', 'b'] },
          { key: '|subject=Health', name: 'Health', things: ['c'] },
          { key: '|subject=Gone', name: 'Gone', things: ['zz'] },
        ],
      },
      { name: 'Every item', groups: [] },
    ];
    const boxes = {
      a: { x: 0, y: 0, width: 10, height: 10 },
      b: { x: 40, y: 20, width: 10, height: 10 },
      c: { x: 100, y: 100, width: 20, height: 10 },
    };
    const hulls = subjectHulls(levels, (k) => boxes[k], 100);
    assert.deepEqual(
      hulls.map((h) => [h.name, h.x, h.y, h.width, h.height]),
      [
        ['Money', -2, -2, 54, 34],
        ['Health', 98, 98, 24, 14],
      ],
      'a subject with no box on the map gets no patch',
    );
    assert.notEqual(hulls[0].hue, hulls[1].hue, 'each subject its own colour');
    assert.deepEqual(
      subjectHulls([levels[1]], (k) => boxes[k], 100),
      [],
      'none for one level',
    );
    const svg = make('svg', {});
    const box = svg.appendChild(make('rect', { class: 'thoughtknot-mini-box' }));
    drawHulls(svg, hulls);
    drawHulls(svg, hulls);
    const clouds = svg.querySelectorAll('.thoughtknot-mini-cloud');
    assert.equal(clouds.length, 2, 'drawn again in place of the old');
    assert.equal(svg.children.at(-1), box, 'behind the boxes');
    assert.equal(clouds[0].getAttribute('data-hue'), String(hulls[0].hue));
    assert.equal(clouds[0].querySelector('title').textContent, 'Money');
  } finally {
    uninstall();
  }
});

// Drawings over a graph on the browser editor's page (editor spec ES§70, board_layers_over). It is the page the
// desktop app, the phone app and VS Code's tab run. The pane draws the board layers marked to lie over its graph.
// A drawing made there is written through the page's own write, and a write refused is said.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { until } from '../../obsidian/test/host/load-plugin.js';
import { cleanUp } from './editor-page-support.js';
import { livePage } from './editor-page-live.js';
import { pageSketching } from '../page/page-sketching.ts';

after(cleanUp);

const NOTE = [
  '# Trip',
  '```gql',
  '// graph: trip',
  '(ann:Person), (bob:Person), (ann)-[:KNOWS]->(bob)',
  '```',
  '```gql',
  '// graph: ideas · BOARD ON trip',
  "(notes:Layer {name: 'Notes', order: 1, over: true}),",
  "(a:Sticky {x: 0, y: 0, text: 'Ask Ann first', graph: 'ann', in_layer: 'notes'}),",
  "(d:Sticky {x: 0, y: 500, text: 'Not shown'})",
  '```',
  '',
].join('\n');

/** A note kept as text, whose write is refused when `why` is set. */
const kept = (text, why) => ({
  text,
  wrote: [],
  async writeWhole(now) {
    if (why) return { ok: false, why };
    this.wrote.push(now);
    this.text = now;
    return { ok: true };
  },
});

describe('drawings over a graph on the page', () => {
  // proves: board_layers_over
  test('gives the board layers that lie over the graph, and none for another graph', () => {
    const over = pageSketching(kept(NOTE), 'trip').over;
    assert.deepEqual(
      over.items.map((i) => [i.id, i.pin]),
      [['ideas.a.words', 'ann']],
    );
    assert.equal(pageSketching(kept(NOTE), 'other').over, null);
    assert.equal(pageSketching(kept(NOTE), 'trip').sketch, null, 'the note holds no drawings of its own yet');
    const light = pageSketching(kept(NOTE), 'trip').palette.text;
    assert.match(light, /^#/, 'a fixed colour, as the page’s boards are drawn in');
    assert.notEqual(pageSketching(kept(NOTE), 'trip', true).palette.text, light, 'the dark scheme has its own');
  });

  // proves: board_layers_over
  test('writes a drawing through the page’s write and leaves the board as it was', async () => {
    const note = kept(NOTE);
    const r = await pageSketching(note, 'trip').write({
      add: { kind: 'Text', x: 10, y: 20, text: 'Mine' },
    });
    assert.ok('sketch' in r, JSON.stringify(r));
    assert.equal(r.sketch.items.length, 1);
    assert.equal(note.wrote.length, 1);
    assert.ok(note.text.includes("(a:Sticky {x: 0, y: 0, text: 'Ask Ann first', graph: 'ann', in_layer: 'notes'})"));
    assert.equal(pageSketching(note, 'trip').sketch.items.length, 1);
  });

  // proves: board_layers_over
  test('says why when the page’s write is refused', async () => {
    const r = await pageSketching(kept(NOTE, 'The note changed on disk.'), 'trip').write({
      add: { kind: 'Text', x: 10, y: 20, text: 'Mine' },
    });
    assert.deepEqual(r, { refused: 'The note changed on disk.' });
  });

  // proves: board_layers_over
  test('the page’s pane draws the layer over its graph, pinned to the thing it is linked to', async () => {
    const page = await livePage(NOTE);
    try {
      const drawn = () =>
        page.doc.querySelector('.thoughtknot-pane-drawing .thoughtknot-svg [data-sketch="ideas.a.words"]');
      await until(drawn, 8000);
      assert.match(drawn().textContent, /Ask Ann first/);
      assert.equal(
        page.doc.querySelector('.thoughtknot-pane-drawing [data-sketch="ideas.d.words"]'),
        null,
        'an item in no layer stays on the board',
      );
      assert.equal(page.file(), NOTE, 'nothing is written');
    } finally {
      await page.stop();
    }
  });
});

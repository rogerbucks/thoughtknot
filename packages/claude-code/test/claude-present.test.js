// Claude shows and presents a graph in the Claude Code pane (editor spec §49: claude_shows, claude_presents). `show`
// opens a note past the same gate as /graph. It turns it to the things, a path or a lens Claude names, and changes
// nothing in the note. `present` walks steps the person moves through; a step that names something not in the graph is
// reported, and nothing is shown. The gate here is the launcher's own, over real notes on disk.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PALETTES, Walk } from '@thoughtknot/core';
import { focusOf, presentThrough, readShow, showThrough } from '../src/claude-present.ts';
import { launcherFor, modVault, writeNote } from './editor-mod-support.js';

const READER = `# Reader

\`\`\`gql
// graph: reader
(question:Question {name: 'Which device?'}),
(large_reader:Option {name: 'Large reader', price: 3}),
(small_reader:Option {name: 'Small reader', price: 2}),
(large_reader)-[:ANSWERS]->(question),
(small_reader)-[:ANSWERS]->(question)
\`\`\`
`;
// a drawing as Graphviz gives one group for each box and link, numbered in order
const SVG =
  '<svg width="100" height="100"><g id="node1" class="node"><ellipse/></g><g id="node2" class="node"><ellipse/></g>' +
  '<g id="node3" class="node"><ellipse/></g><g id="edge1" class="edge"><path/></g><g id="edge2" class="edge"><path/></g></svg>';
const lay = async (dots) => ({ svgs: dots.map(() => SVG) });

/** The ports a session's stage uses: the launcher's own gate, the note read from disk, and a stand-in layout. */
function stage(over = {}) {
  const where = modVault();
  const { launcher } = launcherFor(where, over);
  const ports = {
    gate: (path) => launcher.gate(path, where.top),
    read: async (path) => readFileSync(path, 'utf8'),
    lay,
    palette: PALETTES.system,
  };
  return { where, ports };
}

describe('claude_shows: Claude opens a note in the pane, past the gate, and changes nothing', () => {
  test('the whole graph is shown, and the note is left byte for byte unchanged', async () => {
    const { where, ports } = stage();
    const path = writeNote(where, 'reader.md', 'Public', READER);
    const before = readFileSync(path);
    const shown = await showThrough(ports, { note: path });
    assert.match(shown.text, /^Shown in the pane: reader: 3 things, 2 links/);
    assert.ok(shown.view.svg);
    assert.doesNotMatch(shown.view.svg, /opacity: 0\.25/);
    assert.deepEqual(readFileSync(path), before);
  });

  test('the things and links Claude names are picked out, and nothing else moves', async () => {
    const { where, ports } = stage();
    const path = writeNote(where, 'reader.md', 'Public', READER);
    const shown = await showThrough(ports, {
      note: path,
      things: ['large_reader'],
      links: [{ from: 'large_reader', type: 'ANSWERS', to: 'question' }],
    });
    assert.match(shown.view.svg, /#node2, \.thoughtknot-image #edge1 \{ opacity: 1; \}/);
    // the boxes are the drawing's own: the same groups, in the same places
    assert.ok(shown.view.svg.endsWith(SVG.slice(SVG.indexOf('<g '))));
  });

  test('a path turns it to the path’s things, a lens to what the lens finds', async () => {
    const note = READER.replace(
      '(small_reader)-[:ANSWERS]->(question)',
      "(small_reader)-[:ANSWERS]->(question),\n(cheap:Lens {name: 'Cheap', query: 'Option WHERE price < 3'})",
    );
    assert.deepEqual(focusOf(note, { note: 'n', lens: 'Option WHERE price > 2' }), {
      step: { things: ['large_reader'], links: [] },
    });
    assert.deepEqual(focusOf(note, { note: 'n', lens: 'cheap' }).step.things, ['small_reader']);
    assert.match(focusOf(note, { note: 'n', lens: 'Person' }).refused, /Lens Person finds nothing in graph reader/);
    assert.match(focusOf(note, { note: 'n', path: 'tour' }).refused, /no path tour/);
  });

  test('a name the graph does not hold is reported and nothing is shown', async () => {
    const { where, ports } = stage();
    const path = writeNote(where, 'reader.md', 'Public', READER);
    const shown = await showThrough(ports, { note: path, things: ['kindle'] });
    assert.equal(shown.view, undefined);
    assert.match(shown.text, /^Nothing was shown\. .*kindle, which is not in graph reader/);
  });

  test('a note above Claude’s level is asked about, and one at the highest refused, as /graph does', async () => {
    const { where, ports } = stage();
    const secret = writeNote(where, 'secret.md', 'Confidential', READER);
    const asked = await showThrough(ports, { note: secret });
    assert.equal(asked.view, undefined);
    assert.match(asked.text, /graph edit/);
    const top = writeNote(where, 'top.md', 'Restricted', READER);
    const refused = await showThrough(ports, { note: top });
    assert.equal(refused.view, undefined);
    assert.doesNotMatch(refused.text, /Which device/);
  });

  test('a show with no note, or things that are not a list, is refused', () => {
    assert.ok('refused' in readShow({}));
    assert.ok('refused' in readShow({ note: 'a.md', things: 'large_reader' }));
  });
});

describe('claude_presents: steps the person walks by button and key, each picking out its things', () => {
  const STEPS = [
    { things: ['question'], caption: 'The question' },
    { things: ['large_reader'], links: [{ from: 'large_reader', type: 'ANSWERS', to: 'question' }], caption: 'Big' },
  ];

  test('a presentation past the gate gives its steps, which step forward and back by button and key', async () => {
    const { where, ports } = stage();
    const path = writeNote(where, 'reader.md', 'Public', READER);
    const got = await presentThrough(ports, { note: path, steps: STEPS });
    assert.equal(got.steps.length, 2);
    const walk = new Walk(got.steps);
    assert.equal(walk.said(), 'Step 1 of 2: The question');
    assert.equal(walk.key('ArrowRight'), true);
    assert.equal(walk.said(), 'Step 2 of 2: Big');
    assert.equal(walk.next(), false);
    assert.equal(walk.back(), true);
  });

  test('a step naming something not in the graph is reported, and nothing is shown', async () => {
    const { where, ports } = stage();
    const path = writeNote(where, 'reader.md', 'Public', READER);
    const got = await presentThrough(ports, { note: path, steps: [...STEPS, { things: ['kindle'], caption: 'No' }] });
    assert.equal(got.steps, undefined);
    assert.match(got.text, /Step 3 names kindle, which is not in graph reader/);
  });

  test('a presentation of a note above the level is held back by the gate', async () => {
    const { where, ports } = stage();
    const top = writeNote(where, 'top.md', 'Restricted', READER);
    const got = await presentThrough(ports, { note: top, steps: STEPS });
    assert.equal(got.steps, undefined);
  });
});

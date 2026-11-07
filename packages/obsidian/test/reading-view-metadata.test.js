// Metadata written from Reading view (editor spec §3, reading_view_metadata and reading_view_metadata_safe). A layout or
// AI block goes in through one step from a fresh read, and a property through Obsidian's own front matter writer. Each
// is one edit one undo takes back. The graph and the prose stay as they were, and a graph changed since it was shown
// refuses the write.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeMetaBlock, writeProperty } from '../src/reading-view-metadata.ts';

const GRAPH = "// graph: trip\n(ann:Person {name: 'Ann'})";
const NOTE = `---\nstatus: draft\n---\n# Trip\n\n\`\`\`gql\n${GRAPH}\n\`\`\`\n\nProse.\n`;
const LAYOUT = '// graph: trip_layout · LAYOUT ON trip\n(ann:Place {x: 1, y: 2})';

/** A vault of one note, written as Obsidian writes: process from a fresh read, front matter as an object. */
function vault(text = NOTE) {
  const file = { path: 'Trip.md' };
  const state = { text, writes: 0, between: null };
  const fm = () => Object.fromEntries([...state.text.matchAll(/^(\w+): (.*)$/gm)].map((m) => [m[1], m[2]]));
  const app = {
    vault: {
      process: async (_f, fn) => {
        if (state.between) ((state.text = state.between(state.text)), (state.between = null));
        const next = fn(state.text);
        if (next !== state.text) state.writes++;
        state.text = next;
        return next;
      },
    },
    fileManager: {
      processFrontMatter: async (_f, fn) => {
        const o = fm();
        fn(o);
        const yaml = Object.entries(o).map(([k, v]) => `${k}: ${v}`);
        state.text = state.text.replace(/^---\n[\s\S]*?\n---/, `---\n${yaml.join('\n')}\n---`);
        state.writes++;
      },
    },
  };
  return { app, file, state };
}

describe('a block written from Reading view', () => {
  test('goes in after its graph as one write, and one undo takes it back', async () => {
    const v = vault();
    const r = await writeMetaBlock(v.app, v.file, 'trip', 'LAYOUT', LAYOUT, GRAPH);
    assert.equal(r.said, 'Saved. Undo takes it back');
    assert.equal(v.state.writes, 1);
    assert.match(v.state.text, /LAYOUT ON trip/);
    assert.ok(v.state.text.includes(GRAPH) && v.state.text.includes('Prose.'));
    assert.equal(await r.undo(), 'Taken back');
    assert.equal(v.state.text, NOTE);
  });

  test('is refused, writing nothing, when the graph changed since it was shown', async () => {
    const v = vault();
    v.state.between = (t) => t.replace("'Ann'", "'Anna'");
    const r = await writeMetaBlock(v.app, v.file, 'trip', 'LAYOUT', LAYOUT, GRAPH);
    assert.match(r.said, /changed since it was shown/);
    assert.equal(r.undo, undefined);
    assert.doesNotMatch(v.state.text, /LAYOUT/);
  });

  test('an undo after the note moved on takes nothing back, and says so', async () => {
    const v = vault();
    const r = await writeMetaBlock(v.app, v.file, 'trip', 'LAYOUT', LAYOUT, GRAPH);
    v.state.text += 'Typed later.\n';
    const now = v.state.text;
    assert.match(await r.undo(), /changed since/);
    assert.equal(v.state.text, now);
  });
});

describe('a property written from Reading view', () => {
  test('goes through the front matter writer, and one undo puts back what was there', async () => {
    const v = vault();
    const r = await writeProperty(v.app, v.file, 'status', 'done');
    assert.match(v.state.text, /^---\nstatus: done\n---/);
    assert.ok(v.state.text.endsWith('Prose.\n'));
    assert.equal(await r.undo(), 'Taken back');
    assert.equal(v.state.text, NOTE);
  });

  test('a new property is removed again by its undo', async () => {
    const v = vault();
    const r = await writeProperty(v.app, v.file, 'kind', 'trip');
    assert.match(v.state.text, /kind: trip/);
    await r.undo();
    assert.equal(v.state.text, NOTE);
  });
});

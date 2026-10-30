// The pictures of every note in a folder, brought up to date at once (editor spec §62, picture_outside_tools). A
// tool outside the apps does this. A note with a picture line is kept in step; one without gets none unless asked. An unchanged
// graph changes no file. A file ThoughtKnot did not make is never written over or removed.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from '../src/engine.ts';
import { PALETTES } from '../src/palette.ts';
import { chosen, directions, svgOf } from '../src/render.ts';
import { folderPictures } from '../src/reader-picture-folder.ts';
import { DEFAULT_SETTINGS } from '../src/settings.ts';

const engine = await loadEngine();
/** A host's layout, laid out here on the thread. */
const layout = async (d, theme) => {
  const laid = directions(d);
  return chosen(
    laid,
    laid.map((x) => svgOf(engine, x.dot, d.routing)),
    PALETTES[theme],
  );
};

const BLOCK = `// graph: team
(ann:Person {name: 'Ann'}),
(bob:Person {name: 'Bob'}),
(ann)-[:ASKS]->(bob)`;
const NOTE = `# Team\n\n\`\`\`gql\n${BLOCK}\n\`\`\`\nAfter.\n`;
const PICTURE = 'Work/Team.team.thoughtknot.svg';

/** Runs the folder over `files`, a path-to-text map, and applies the changes to it, as a tool would. */
async function refreshed(files, add = false) {
  const run = await folderPictures({
    notes: [...files.keys()].filter((p) => p.endsWith('.md')),
    read: async (p) => files.get(p) ?? null,
    add,
    date: '2026-10-30',
    layout,
    noteClassification: null,
    settings: DEFAULT_SETTINGS,
  });
  for (const c of run.changes)
    if (c.text === null) files.delete(c.path);
    else files.set(c.path, c.text);
  return run;
}

describe('the pictures of a folder', () => {
  // proves: picture_outside_tools
  test('are added to every note when asked, beside it, and a note with no picture line is otherwise left alone', async () => {
    const files = new Map([['Work/Team.md', NOTE]]);
    assert.deepEqual((await refreshed(files)).changes, [], 'not asked: nothing made');
    const run = await refreshed(files, true);
    assert.deepEqual(run.outOfDate.sort(), ['Work/Team.md', PICTURE]);
    assert.match(files.get(PICTURE), /^<svg[\s\S]*thoughtknot reader picture/);
    assert.match(files.get('Work/Team.md'), /```\n!\[Graph team[^\]]*\]\(Team\.team\.thoughtknot\.svg\)\nAfter\./);
  });

  // proves: picture_outside_tools
  test('redraw only a picture whose graph changed, and an unchanged folder needs nothing', async () => {
    const files = new Map([['Work/Team.md', NOTE]]);
    await refreshed(files, true);
    assert.deepEqual((await refreshed(files)).outOfDate, [], 'in step: nothing to do');
    files.set('Work/Team.md', files.get('Work/Team.md').replace("'Bob'", "'Robert'"));
    const run = await refreshed(files);
    assert.deepEqual(run.outOfDate, [PICTURE], 'the picture alone, the line still right');
    assert.match(files.get(PICTURE), /Robert/);
  });

  // proves: picture_outside_tools
  test('take a picture away with its block, and never touch a file ThoughtKnot did not make', async () => {
    const files = new Map([
      ['Work/Team.md', NOTE],
      [PICTURE, '<svg>my own</svg>'],
    ]);
    const run = await refreshed(files, true);
    assert.equal(files.get(PICTURE), '<svg>my own</svg>');
    assert.ok(files.has('Work/Team.team 1.thoughtknot.svg'), 'its picture goes beside it, numbered');
    assert.deepEqual(run.problems, []);
    files.set('Work/Team.md', files.get('Work/Team.md').replace(/```gql[\s\S]*?```\n/, ''));
    await refreshed(files);
    assert.ok(!files.has('Work/Team.team 1.thoughtknot.svg'), 'its file gone with the block');
    assert.doesNotMatch(files.get('Work/Team.md'), /thoughtknot\.svg/, 'and its line');
    assert.equal(files.get(PICTURE), '<svg>my own</svg>');
  });
});

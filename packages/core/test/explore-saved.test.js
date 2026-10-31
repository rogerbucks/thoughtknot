// An exploration saved in the style graph (editor spec §71): explore-saved.ts, style-edit.ts and style-checks.ts.
// Requirement: explore_saved.
// - In edit mode an exploration is written as one Explore line in the style block, and changed in place when saved again.
// - Read back, it opens the same things round the same centre, in the same shape.
// - A centre the graph lacks is a problem with its fix; a shown thing the graph lacks is left out without a word.
// - A thing whose name the line cannot hold is refused, with the reason, and nothing is written.
// - The reader picture shows the exploration saved, as the note opens on it, and says what it leaves out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gqlBlocks, gqlSpans, styleOf } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { exploreRefusal, savedExploreFor } from '../src/explore-saved.ts';
import { ExploreSession } from '../src/explore-session.ts';
import { readStyle } from '../src/style.ts';
import { styleEdit } from '../src/style-edit.ts';
import { Untangle } from '../src/untangle.ts';
import { loadEngine } from '../src/engine.ts';
import { PALETTES } from '../src/palette.ts';
import { notePictures } from '../src/reader-picture.ts';
import { chosen, directions, svgOf } from '../src/render.ts';

const MIND = `// graph: work
(idea:Idea), (a:Idea), (b:Idea), (c:Idea), (a1:Idea), (a2:Idea), (far:Idea),
(idea)-[:LINKS]->(a), (idea)-[:LINKS]->(b), (idea)-[:LINKS]->(c),
(a)-[:LINKS]->(a1), (a)-[:LINKS]->(a2), (a1)-[:LINKS]->(b)`;

const NOTE = ['# Work', '', '```gql', MIND, '```', ''].join('\n');
const texts = (note) => gqlBlocks(note).map((b) => b.text);
const data = (note) =>
  gqlSpans(note)
    .filter((s) => styleOf(s.text) === null)
    .map((s) => s.text);
const drawingOf = (note) => readNote(texts(note)).graphs.get('work');

/** The style of the work graph, read back, with its problems as line, message and fix. */
function read(textsOf) {
  const { style, problems } = readStyle(textsOf, 'work', readNote(textsOf));
  return { style, problems: problems.map((p) => [p.line, p.message, p.fix]) };
}

test('an exploration is saved as one Explore line, and saved again it is changed in place', () => {
  const s = new ExploreSession(drawingOf(NOTE), 'idea');
  s.open('a');
  s.setShape('rings');
  const first = styleEdit(NOTE, 'work', { explore: s.save() });
  assert.ok('note' in first, first.refused);
  assert.deepEqual(data(first.note), data(NOTE), 'the data is never touched');
  const block = gqlBlocks(first.note).at(-1).text;
  assert.ok(
    block.includes("(explore_1:Explore {centre: 'idea', shown: 'a, b, c, a1, a2', shape: 'rings', per_branch: 12})"),
    block,
  );
  s.close('a');
  const again = styleEdit(first.note, 'work', { explore: s.save() });
  assert.ok('note' in again, again.refused);
  assert.equal(
    gqlBlocks(again.note)
      .at(-1)
      .text.match(/:Explore/g).length,
    1,
    'never written twice',
  );
  const { style, problems } = read(texts(again.note));
  assert.deepEqual(problems, []);
  assert.deepEqual(
    { ...savedExploreFor(style.explores), at: undefined },
    { centre: 'idea', shown: ['a', 'b', 'c'], shape: 'rings', perBranch: 12, at: undefined },
  );
  assert.equal(savedExploreFor(style.explores, 'board'), undefined, 'a view has its own');
});

test('read back, it opens the same things round the same centre, in the same shape', () => {
  const s = new ExploreSession(drawingOf(NOTE), 'idea');
  s.open('a');
  s.recentre('a');
  const r = styleEdit(NOTE, 'work', { explore: s.save() });
  assert.ok('note' in r, r.refused);
  const saved = savedExploreFor(read(texts(r.note)).style.explores);
  const u = new Untangle(drawingOf(r.note));
  const opened = u.exploreSaved(saved);
  assert.equal(opened.centre, 'a');
  assert.deepEqual(new Set(opened.keys()), new Set(s.keys()));
  assert.equal(opened.shape, s.shape);
  // each parent is read again from the centre: a1 hangs off a, and b off idea or a1
  assert.equal(u.explore, opened);
  assert.equal(u.exploreSaved({ ...saved, centre: 'gone' }), null, 'a centre not drawn opens nothing');
});

test('a centre the graph lacks is a problem with its fix; a shown thing it lacks is left out', () => {
  const lines = [
    '// graph: work_style · STYLE work',
    "(e1:Explore {centre: 'ide', shown: 'a'}),",
    "(e2:Explore {centre: 'idea', shown: 'a, gone, a', shape: 'round'}),",
    "(e3:Explore {shown: 'a'})",
  ];
  const { style, problems } = read([MIND, lines.join('\n')]);
  assert.deepEqual(
    { ...savedExploreFor(style.explores), at: undefined },
    { centre: 'idea', shown: ['a'], shape: 'balanced', perBranch: 12, at: undefined },
  );
  assert.deepEqual(
    problems.map(([line, message]) => [line, message]),
    [
      [2, 'ide is not a thing in graph work'],
      [3, 'round is not a shape an exploration is drawn in'],
      [4, 'an Explore says which thing it starts from'],
    ],
  );
  assert.match(problems[0][2], /idea/, 'the fix names the nearest thing');
});

test('a thing whose name the line cannot hold is refused, and nothing is written', () => {
  const save = { centre: 'idea', shown: ['a, b'], shape: 'balanced', perBranch: 12 };
  assert.match(exploreRefusal(save), /holds a comma/);
  const r = styleEdit(NOTE, 'work', { explore: save });
  assert.ok('refused' in r);
});

test('the reader picture shows the exploration saved, and says what it leaves out', async () => {
  const engine = await loadEngine();
  const layout = async (d, theme) => {
    const laid = directions(d);
    return chosen(
      laid,
      laid.map((x) => svgOf(engine, x.dot, d.routing)),
      PALETTES[theme],
    );
  };
  const saved = styleEdit(NOTE, 'work', {
    explore: { centre: 'a', shown: ['a1', 'a2'], shape: 'balanced', perBranch: 12 },
  });
  assert.ok('note' in saved, saved.refused);
  const picture = async (text) => {
    const settings = { classifications: ['Public'], exportAsksAbove: 'Public' };
    const [one] = await notePictures({
      text,
      note: 'Work.md',
      date: '2026-10-31',
      layout,
      noteClassification: null,
      settings,
    });
    return one.decision.picture.svg;
  };
  const svg = await picture(saved.note);
  const drawn = (key) => new RegExp(`>${key}</text>`).test(svg);
  assert.ok(['a', 'a1', 'a2'].every(drawn), 'the centre and the things shown');
  assert.ok(!['idea', 'b', 'c', 'far'].some(drawn), 'nothing else');
  assert.match(svg, /explored from a: 3 of 7 things/);
  const whole = await picture(NOTE);
  assert.ok(
    ['idea', 'far'].every((k) => new RegExp(`>${k}</text>`).test(whole)),
    'with none saved, all is drawn',
  );
  assert.doesNotMatch(whole, /explored from/);
});

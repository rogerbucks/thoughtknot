// Claude presents a graph (editor spec §49: claude_presents, presentation_kept; §7 path_no_steps). Steps are checked
// for their shape. A step naming something the graph does not hold is reported. A step picks out its things and links
// and moves no box. The walk moves only by button or key. A presentation is kept in the note only once the person
// accepts it. A kept one plays again from the note with no AI.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { gqlBlocks, readNote } from '@thoughtknot/core';
import {
  keepPresentation,
  pickOut,
  pickedCss,
  presentationsIn,
  readSteps,
  stepsMissing,
  Walk,
  withPicked,
} from '../src/presentation.ts';

const NOTE = `---
classification: Public
---
# Reader

\`\`\`gql
// graph: reader
(question:Question {name: 'Which device?'}),
(large_reader:Option {name: 'Large reader'}),
(small_reader:Option {name: 'Small reader'}),
(large_reader)-[:ANSWERS]->(question),
(small_reader)-[:ANSWERS]->(question)
\`\`\`
`;
const drawingOf = (note) => [...readNote(gqlBlocks(note).map((b) => b.text)).graphs.values()][0];
const STEPS = [
  { things: ['question'], links: [], caption: 'The question' },
  {
    things: ['large_reader'],
    links: [{ from: 'large_reader', type: 'ANSWERS', to: 'question' }],
    caption: 'One answer',
  },
  { things: ['small_reader'], caption: 'The other' },
];

describe('claude_presents: steps in order, each picking out things and links with a caption', () => {
  test('steps are read in order, a step with no links taken as none', () => {
    const r = readSteps(STEPS);
    assert.ok('steps' in r);
    assert.deepEqual(
      r.steps.map((s) => s.caption),
      ['The question', 'One answer', 'The other'],
    );
    assert.deepEqual(r.steps[2].links, []);
  });

  test('no steps, a step with no caption, a link not one word each, and a step picking out nothing are refused', () => {
    assert.match(readSteps([]).refused, /at least one step/);
    assert.match(readSteps([{ things: ['a'] }]).refused, /Step 1 needs a caption/);
    assert.match(
      readSteps([{ things: [], links: [{ from: 'a b', type: 'X', to: 'c' }], caption: 'x' }]).refused,
      /link/,
    );
    assert.match(readSteps([{ things: [], links: [], caption: 'x' }]).refused, /picks out nothing/);
  });

  test('a step naming something not in the graph is reported, never drawn as an empty step (path_no_steps)', () => {
    const drawing = drawingOf(NOTE);
    assert.deepEqual(stepsMissing(drawing, readSteps(STEPS).steps), []);
    const wrong = readSteps([
      ...STEPS,
      { things: ['kindle'], caption: 'Not there' },
      { links: [{ from: 'question', type: 'ANSWERS', to: 'large_reader' }], caption: 'Backwards' },
    ]).steps;
    assert.deepEqual(stepsMissing(drawing, wrong), [
      'Step 4 names kindle, which is not in graph reader.',
      'Step 5 names question ANSWERS large_reader, which is not in graph reader.',
    ]);
  });

  test('a step picks out its boxes and links by the numbers Graphviz gives their groups', () => {
    const drawing = drawingOf(NOTE);
    const { picked, missing } = pickOut(drawing, readSteps(STEPS).steps[1]);
    assert.deepEqual(missing, []);
    assert.deepEqual(picked, { nodes: [2], edges: [1] });
  });

  test('picking out fades the rest and moves nothing: only opacity and stroke width are set', () => {
    const css = pickedCss({ nodes: [2], edges: [1] });
    assert.match(css, /\.thoughtknot-image #node2, \.thoughtknot-image #edge1 \{ opacity: 1; \}/);
    assert.doesNotMatch(css, /transform|translate|left:|top:|\bx:|\by:/);
    assert.match(css, /prefers-reduced-motion/);
    const svg = withPicked('<svg width="10"><g id="node1" class="node"></g></svg>', { nodes: [1], edges: [] });
    assert.match(svg, /^<svg class="thoughtknot-image" width="10">\n<style>/);
  });

  test('the walk moves only when the person presses a button or a key, and stops at either end', () => {
    const walk = new Walk(readSteps(STEPS).steps);
    assert.equal(walk.said(), 'Step 1 of 3: The question');
    assert.equal(walk.back(), false);
    assert.equal(walk.next(), true);
    assert.equal(walk.key('ArrowRight'), true);
    assert.equal(walk.last, true);
    assert.equal(walk.key('PageDown'), false);
    assert.equal(walk.key('ArrowLeft'), true);
    assert.equal(walk.at, 1);
    assert.equal(walk.key('Home'), true);
    assert.equal(walk.at, 0);
    assert.equal(walk.key('End'), true);
    assert.equal(walk.said(), 'Step 3 of 3: The other');
    assert.equal(walk.key('x'), false);
  });
});

describe('presentation_kept: kept only once accepted, and played again with no AI', () => {
  const kept = { name: 'reader_tour', graph: 'reader', steps: readSteps(STEPS).steps };

  test('a presentation not accepted writes nothing: the note is left byte for byte', () => {
    const r = keepPresentation(NOTE, kept, 'rejected');
    assert.deepEqual(r, { ok: true, note: NOTE, written: false });
  });

  test('an accepted one is a graph block of its steps after the graph it presents, which reads cleanly', () => {
    const r = keepPresentation(NOTE, kept, 'accepted');
    assert.equal(r.ok, true);
    assert.equal(r.written, true);
    assert.ok(r.note.startsWith(NOTE.trimEnd().split('```\n')[0]));
    const blocks = gqlBlocks(r.note).map((b) => b.text);
    assert.equal(blocks.length, 2);
    assert.match(blocks[1], /^\/\/ graph: reader_tour_presentation\n/);
    const read = readNote(blocks);
    assert.deepEqual(
      read.problems.filter((p) => p.severity === 'error'),
      [],
    );
    // the graph it presents is unchanged
    assert.equal(blocks[0], gqlBlocks(NOTE)[0].text);
  });

  test('a kept presentation plays again from the note alone: the same steps, in order', () => {
    const { note } = keepPresentation(NOTE, kept, 'accepted');
    const [again] = presentationsIn(note);
    assert.equal(again.name, 'reader_tour');
    assert.equal(again.graph, 'reader');
    assert.deepEqual(again.steps, kept.steps);
    assert.deepEqual(stepsMissing(drawingOf(note), again.steps), []);
  });

  test('keeping it again replaces the block of that name, and a name that is not one word is refused', () => {
    const once = keepPresentation(NOTE, kept, 'accepted').note;
    const twice = keepPresentation(once, { ...kept, steps: kept.steps.slice(0, 1) }, 'accepted').note;
    assert.equal(gqlBlocks(twice).length, 2);
    assert.equal(presentationsIn(twice)[0].steps.length, 1);
    assert.equal(keepPresentation(NOTE, { ...kept, name: 'two words' }, 'accepted').ok, false);
  });

  test('a note with no presentation keeps none', () => {
    assert.deepEqual(presentationsIn(NOTE), []);
  });
});

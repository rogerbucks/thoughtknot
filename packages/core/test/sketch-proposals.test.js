// Drawings offered as things and links (editor spec §70, sketch_to_graph):
// - A free note, or a box with words, is offered as a new thing. A line or arrow from one thing to another is offered
//   as a link, typed by its words or the graph's usual type.
// - What the graph holds already is not offered again, and drawings that say nothing new are said so.
// - Nothing is written until a person accepts a change, and then only that change.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gqlBlocks } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { noteWithProposal } from '../src/ai-answer.ts';
import { ProposalReview } from '../src/proposals-review.ts';
import { readSketch } from '../src/sketch.ts';
import { sketchProposal } from '../src/sketch-proposals.ts';

const TEAM = `// graph: team
(ann:Person {name: 'Ann'}),
(bob:Person {name: 'Bob'}),
(cy:Person {name: 'Cy'}),
(ann)-[:ASKS]->(bob)`;
const note = (...blocks) => `# Team\n\n${blocks.map((b) => '```gql\n' + b + '\n```').join('\n\n')}\n`;
const texts = (n) => gqlBlocks(n).map((b) => b.text);
const box = (of, x, y) => ({ id: of, style: 'thing', kind: 'box', x, y, width: 60, height: 30, of });
// Ann at (0,0), Bob at (200,0), Cy at (0,200): each box 60 by 30
const MARKS = [box('ann', 0, 0), box('bob', 200, 0), box('cy', 0, 200)];
const sketched = (items) => readSketch(`// graph: team_ink · SKETCH ON team\n${items}`).sketch;

describe('drawings offered as things and links', () => {
  // proves: sketch_to_graph
  test('an arrow from one thing to another is a link of its words; a line without words takes the usual type', () => {
    const sketch = sketched(`(d1:Shape {x: 30, y: 15, shape: 'arrow', text: 'works with', points: '0 0 0 200'}),
(d2:Shape {x: 230, y: 15, shape: 'line', points: '0 0 -200 200'})`);
    const r = sketchProposal(note(TEAM), sketch, MARKS, { at: '2026-10-29' });
    assert.ok('proposal' in r, r.refused ?? r.nothing);
    const gql = r.proposal.changes.map((c) => c.gql);
    assert.deepEqual(gql, ['(ann)-[:WORKS_WITH]->(cy)', '(bob)-[:ASKS]->(cy)']);
    assert.match(r.proposal.changes[0].reason, /^Drawn as Arrow: works with$/);
    assert.equal(r.proposal.provenance.by.name, 'sketch');
  });

  // proves: sketch_to_graph
  test('a free note is a new thing, and a line drawn to it links to it', () => {
    const sketch = sketched(`(d1:Text {x: 400, y: 100, text: 'Dee'}),
(d2:Ink {x: 230, y: 15, points: '0 0 80 40 180 80'})`);
    const r = sketchProposal(note(TEAM), sketch, MARKS);
    assert.ok('proposal' in r, r.refused ?? r.nothing);
    assert.deepEqual(
      r.proposal.changes.map((c) => c.gql),
      ["(dee:Person {name: 'Dee'})", '(bob)-[:ASKS]->(dee)'],
    );
  });

  // proves: sketch_to_graph
  test('a note of odd words gives a plain id, quickly however long its words', () => {
    const odd = sketched(`(d1:Text {x: 400, y: 100, text: '9 Tea -- break!'}),
(d2:Text {x: 400, y: 300, text: 'a${'_'.repeat(20000)}!'})`);
    const started = Date.now();
    const r = sketchProposal(note(TEAM), odd, MARKS);
    assert.ok(Date.now() - started < 1000, 'no pattern that backtracks over the words');
    assert.deepEqual(
      r.proposal.changes.map((c) => c.gql.split(':')[0]),
      ['(tea_break', '(a'],
    );
  });

  // proves: sketch_to_graph
  test('what the graph holds already, a pinned note and a line to nowhere offer nothing, and say so', () => {
    const sketch = sketched(`(d1:Shape {x: 30, y: 15, shape: 'arrow', points: '0 0 200 0'}),
(d2:Text {x: 0, y: -30, pin: 'ann', text: 'Ask first'}),
(d3:Shape {x: 30, y: 15, shape: 'line', points: '0 0 500 500'})`);
    const r = sketchProposal(note(TEAM), sketch, MARKS);
    assert.ok('nothing' in r);
    assert.match(r.nothing, /nothing new about team/);
  });

  // proves: sketch_to_graph
  test('written beside the graph nothing changes; a person accepts one change and only it is written', () => {
    const sketch = sketched(`(d1:Shape {x: 30, y: 15, shape: 'arrow', points: '0 0 0 200'}),
(d2:Shape {x: 230, y: 15, shape: 'arrow', points: '0 0 -200 200'})`);
    const n = note(
      TEAM,
      `// graph: team_ink · SKETCH ON team\n(d1:Shape {x: 30, y: 15, shape: 'arrow', points: '0 0 0 200'})`,
    );
    const r = sketchProposal(n, sketch, MARKS);
    const proposed = noteWithProposal(n, r.proposal);
    assert.equal(typeof proposed, 'string', proposed.refused);
    assert.equal(texts(proposed)[0], TEAM, 'the graph untouched');
    assert.equal(readNote(texts(proposed)).graphs.get('team').links.length, 1, 'nothing added yet');
    const block = texts(proposed).find((t) => t.includes('sketch_1'));
    const accepted = ProposalReview.fromChangeSet(block).accept(proposed, [r.proposal.changes[0].id], { name: 'you' });
    assert.ok(accepted.ok, accepted.reason);
    const links = readNote(texts(accepted.note)).graphs.get('team').links;
    assert.ok(links.some((l) => l.from === 'ann' && l.type === 'ASKS' && l.to === 'cy'));
    assert.ok(!links.some((l) => l.from === 'bob' && l.to === 'cy'), 'the other change still waits');
  });
});

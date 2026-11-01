// Renaming a thing where it is drawn (editor spec §72, edit_rename). The name typed is the thing's text, written under
// the key the thing already uses, as one change to the one block that writes it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { addedNear, deleted, renamed } from '../src/thing-edits.ts';
import { readNote } from '../src/drawing.ts';

const BLOCK = `// graph: reader
(question:Question {title: 'Which device?'}),
(large_reader:Option {name: 'Large reader', price: 3}),
(bare:Option),
(large_reader)-[:ANSWERS]->(question)`;
const OTHER = "// graph: other\n(question:Question {title: 'Elsewhere'})";

describe('a thing renamed on the drawing', () => {
  // proves: edit_rename
  test('is written under the key it already holds its text in, and nothing else changes', () => {
    const r = renamed([OTHER, BLOCK], 'reader', 'question', 'Which reader?');
    assert.equal(r.block, 1, 'the block of its own graph');
    assert.equal(r.was, BLOCK);
    assert.equal(r.now, BLOCK.replace("{title: 'Which device?'}", "{title: 'Which reader?'}"));
    const n = renamed([BLOCK], 'reader', 'large_reader', 'Big reader');
    assert.equal(n.now, BLOCK.replace("name: 'Large reader'", "name: 'Big reader'"), 'its other values kept');
  });

  // proves: edit_rename
  test('gets a name when it had no text, and quotes what it is given', () => {
    const r = renamed([BLOCK], 'reader', 'bare', "  Reader's   choice ");
    assert.equal(r.now, BLOCK.replace('(bare:Option)', "(bare:Option {name: 'Reader\\'s choice'})"));
  });

  // proves: edit_rename
  test('writes nothing for an empty name, the same name, or a thing no block writes', () => {
    assert.deepEqual(renamed([BLOCK], 'reader', 'question', '   '), { reason: 'A name cannot be empty' });
    assert.deepEqual(renamed([BLOCK], 'reader', 'question', 'Which device?'), { reason: 'The name is as it was' });
    assert.ok('reason' in renamed([BLOCK], 'reader', 'nobody', 'Someone'));
    assert.ok('reason' in renamed([OTHER], 'reader', 'question', 'Which?'), 'another graph is not changed');
  });
});

const TREE = `// graph: map
(idea:Topic {name: 'Idea'}),
(plan:Step {name: 'Plan'}),
(risk:Step {name: 'Risk'}),
(idea)-[:LEADS_TO]->(plan),
(idea)-[:LEADS_TO]->(risk)`;
const treeReading = readNote([TREE]);

describe('a thing added near another', () => {
  // proves: edit_quick_add
  test('as a child: linked from it as its other children are, and of their kind', () => {
    const r = addedNear(treeReading, 'map', 'idea', 'child', 'Cost');
    assert.equal(r.name, 'cost');
    assert.equal(r.now, `${TREE},\n(cost:Step {name: 'Cost'}),\n(idea)-[:LEADS_TO]->(cost)`);
  });

  // proves: edit_quick_add
  test('as a sibling: linked from its parent as it is, and of its kind; a thing with no parent gets none', () => {
    const r = addedNear(treeReading, 'map', 'plan', 'sibling', 'Budget');
    assert.equal(r.now, `${TREE},\n(budget:Step {name: 'Budget'}),\n(idea)-[:LEADS_TO]->(budget)`);
    const top = addedNear(treeReading, 'map', 'idea', 'sibling', 'Other idea');
    assert.equal(top.now, `${TREE},\n(other_idea:Topic {name: 'Other idea'})`);
  });

  // proves: edit_quick_add
  test('a first child takes the link type most used, else HAS', () => {
    const r = addedNear(treeReading, 'map', 'plan', 'child', 'Step one');
    assert.ok(r.now.endsWith("(step_one {name: 'Step one'}),\n(plan)-[:LEADS_TO]->(step_one)"), r.now);
    const lone = readNote(["// graph: one\n(a {name: 'A'})"]);
    assert.ok(addedNear(lone, 'one', 'a', 'child', 'B').now.endsWith('(a)-[:HAS]->(b)'));
    assert.ok('reason' in addedNear(treeReading, 'map', 'nobody', 'child', 'X'));
  });
});

describe('a thing deleted', () => {
  // proves: edit_delete
  test('goes with every link to it, and nothing else', () => {
    const r = deleted([TREE], 'map', 'plan');
    assert.equal(
      r.now,
      `// graph: map\n(idea:Topic {name: 'Idea'}),\n(risk:Step {name: 'Risk'}),\n(idea)-[:LEADS_TO]->(risk)`,
    );
  });

  // proves: edit_delete
  test('is refused where another thing would go with it, or it is in more than one block', () => {
    const one = "// graph: g\n(a:T {name: 'A'})-[:R]->(b:T {name: 'B'})";
    assert.deepEqual(deleted([one], 'g', 'b'), {
      reason: 'b is written together with other things: change it in the text',
    });
    const two = ["// graph: g\n(a {name: 'A'})", '// graph: g\n(a)-[:R]->(a)'];
    assert.ok('reason' in deleted(two, 'g', 'a'));
    assert.ok('reason' in deleted([TREE], 'map', 'nobody'));
  });
});

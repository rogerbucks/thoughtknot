// Renaming a thing where it is drawn (editor spec §72, edit_rename). The name typed is the thing's text, written under
// the key the thing already uses, as one change to the one block that writes it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renamed } from '../src/thing-edits.ts';

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

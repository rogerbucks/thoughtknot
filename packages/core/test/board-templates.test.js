// board_templates (editor spec §45): five built-in templates each start a board, and each is itself a board note.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gqlSpans } from '../src/blocks.ts';
import { readBoard, boardOf } from '../src/board.ts';
import { boardEdit } from '../src/board-edit.ts';
import { TEMPLATES, templateName, templateNote } from '../src/board-templates.ts';

const boardIn = (note) => {
  const span = gqlSpans(note).find((s) => boardOf(s.text));
  assert.ok(span, 'the note holds a board block');
  return readBoard(span.text);
};

describe('board_templates', () => {
  test('there is a mind map, an affinity map, a two by two matrix, a flow and a retrospective', () => {
    assert.deepEqual([...TEMPLATES], ['mindmap', 'affinity', 'matrix', 'flow', 'retro']);
    assert.equal(new Set(TEMPLATES.map(templateName)).size, 5);
  });

  test('each template is a note with a board block that reads with no problem', () => {
    for (const id of TEMPLATES) {
      const note = templateNote(id);
      assert.ok(note.startsWith(`# ${templateName(id)}\n`));
      const { board, problems } = boardIn(note);
      assert.deepEqual(problems, [], id);
      assert.ok(board.items.length >= 4, id);
      assert.equal(board.name, id);
    }
  });

  test('each starts a new board under the name given', () => {
    const { board } = boardIn(templateNote('flow', 'plan'));
    assert.equal(board.name, 'plan');
  });

  test('the mind map joins its centre to each branch; the flow runs start to end', () => {
    const mind = boardIn(templateNote('mindmap')).board;
    assert.equal(mind.connectors.length, 4);
    assert.ok(mind.connectors.every((c) => c.from === 'centre'));
    const flow = boardIn(templateNote('flow')).board;
    assert.deepEqual(
      flow.connectors.map((c) => [c.from, c.to]),
      [
        ['start', 'step'],
        ['step', 'decision'],
        ['decision', 'end'],
      ],
    );
  });

  test('the matrix has four quadrants and the retrospective three columns', () => {
    const frames = (id) => boardIn(templateNote(id)).board.items.filter((i) => i.kind === 'Frame').length;
    assert.equal(frames('matrix'), 4);
    assert.equal(frames('retro'), 3);
  });

  test('a template board can be edited like any other', () => {
    const span = gqlSpans(templateNote('affinity')).find((s) => boardOf(s.text));
    const r = boardEdit(span.text, { kind: 'text', id: 'sticky1', text: 'Mine' });
    assert.ok('text' in r);
    assert.match(r.text, /Mine/);
  });
});

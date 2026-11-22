// Text on a whiteboard to a graph by AI (editor spec ES§76, board_first_ai; ES§47 text_to_graph_in_editor). Text typed,
// pasted or chosen on a board goes to an AI through text to graph. The AI rules of ES§19 hold: off until chosen,
// within the model's ceiling, seen and said yes to, and recorded. The answer is drawn on the board as proposed cards and
// connectors linked to their things. It is written to the board and the graph block only when accepted. A failed answer
// changes nothing and says why. Every send goes through a fake transport, so no test reaches the network.
import { afterEach, test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { confirmSend, prepareSend, sendPrepared } from '../src/ai.ts';
import { gqlBlocks } from '../src/blocks.ts';
import { boardOf, readBoard } from '../src/board.ts';
import { boardGraphAccepted, boardGraphDraft, boardTextAsk, openingBoard } from '../src/board-first.ts';
import { thingBoards } from '../src/board-links.ts';
import { readNote } from '../src/drawing.ts';
import { settingsFrom } from '../src/settings.ts';
import { TEXT_MOST } from '../src/text-to-graph.ts';
import { setLanguage, SOURCE_LANGUAGE } from '../src/words.ts';

afterEach(() => setLanguage(SOURCE_LANGUAGE));

const NOTE = '# Trip\n';
const TEXT = 'Dana leads the trip. Sam drives the van.';
const LOCAL = {
  name: 'Local',
  purpose: 'Proposing changes',
  ceiling: 'Internal',
  endpoint: 'http://localhost:11434/v1/chat/completions',
  model: 'llama3',
  keyName: '',
};
const ON = settingsFrom({ aiUse: 'on', aiPublic: 'note', aiModels: [LOCAL] });
const OFF = settingsFrom({ aiUse: 'off', aiModels: [LOCAL] });
const CLOCK = () => new Date('2026-11-26T10:00:00Z');
const base = (note, settings = ON, level = 'Internal') => ({
  settings,
  model: 'Local',
  note,
  notePath: 'Trip.md',
  level,
});
const ANSWER = {
  things: [
    { name: 'dana', kind: 'Guide', text: 'Dana', quote: 'Dana' },
    { name: 'trip', kind: 'Trip', text: 'The trip', quote: 'the trip' },
    { name: 'sam', kind: 'Guide', text: 'Sam', quote: 'Sam' },
  ],
  links: [{ from: 'dana', type: 'LEADS', to: 'trip', quote: 'Dana leads the trip' }],
};
const isBoard = (t) => !!boardOf(t);
const board = () => openingBoard(NOTE, isBoard);
const textsOf = (note) => gqlBlocks(note).map((b) => b.text);

/** Sends the board's text to a model that answers `answer`, keeping the record of the send. */
async function send(answer, note = NOTE) {
  const made = boardTextAsk(base(note), board().text, TEXT);
  assert.ok(!('refused' in made), made.refused);
  const prepared = prepareSend(made);
  assert.ok(!('refused' in prepared), prepared.refused);
  const sent = [];
  const transport = async (request) => {
    sent.push(request);
    const content = typeof answer === 'string' ? answer : JSON.stringify(answer);
    return { status: 200, text: JSON.stringify({ choices: [{ message: { content } }] }) };
  };
  const result = await sendPrepared(prepared, confirmSend(prepared), { transport, key: null, now: CLOCK });
  return { prepared, sent, result };
}

describe('board_first_ai', () => {
  test('board text comes back as proposed cards and connectors linked to their things, nothing written yet', async () => {
    const { prepared, sent, result } = await send(ANSWER);
    assert.equal(sent.length, 1);
    assert.match(prepared.body, /source-text\\n.*Dana leads the trip/);
    assert.ok('proposal' in result, result.failed);
    assert.equal(result.proposal.graph, 'ideas', 'the graph the empty board builds');
    const draft = boardGraphDraft(NOTE, board().text, result.proposal);
    assert.ok(!('refused' in draft), draft.refused);
    const cards = draft.board.items.filter((i) => i.kind === 'Card');
    assert.deepEqual(
      cards.map((c) => [c.graph, c.text]),
      [
        ['dana', 'Dana'],
        ['trip', 'The trip'],
        ['sam', 'Sam'],
      ],
    );
    assert.equal(draft.board.items.filter((i) => i.kind === 'Frame').length, 1, 'in a frame of their own');
    assert.deepEqual(
      draft.board.connectors.map((c) => [c.from, c.label, c.to]),
      [['card_dana', 'LEADS', 'card_trip']],
    );
    assert.equal(draft.change.kind, 'adds', 'one change, one undo');
    assert.equal(gqlBlocks(NOTE).length, 0, 'a proposal writes nothing');
  });

  test('accepted, it is written to the graph block and the board, each card linked to its thing both ways', async () => {
    const { result } = await send(ANSWER);
    const made = boardGraphAccepted(NOTE, board().text, result.proposal);
    assert.ok(!('refused' in made), made.refused);
    assert.equal(made.before, NOTE);
    assert.ok(made.note.startsWith(NOTE.trimEnd()));
    const g = readNote(textsOf(made.note)).world.ideas;
    assert.deepEqual([...g.nodes.keys()].sort(), ['dana', 'sam', 'trip']);
    assert.deepEqual(
      g.edges.map((e) => e.slice(0, 3)),
      [['dana', 'LEADS', 'trip']],
    );
    const b = readBoard(textsOf(made.note).find(isBoard), new Set(g.nodes.keys()));
    assert.deepEqual(b.problems, []);
    assert.equal(b.board.on, 'ideas', 'the board is now on the graph it built');
    assert.deepEqual(thingBoards(made.note, 'ideas', 'dana'), [{ board: 'ideas_board', item: 'card_dana' }]);
    // only what was ticked is written: Sam left out
    const ids = result.proposal.changes.map((c) => c.id);
    const some = boardGraphAccepted(NOTE, board().text, result.proposal, [ids[0], ids[1], ids[3]]);
    assert.deepEqual([...readNote(textsOf(some.note)).world.ideas.nodes.keys()].sort(), ['dana', 'trip']);
  });

  test('a failed answer changes nothing and says why, and the send is recorded', async () => {
    for (const bad of ['not JSON', { things: [{ name: 'a b', kind: 'X', quote: 'Dana' }] }]) {
      const { result } = await send(bad);
      assert.ok('failed' in result, JSON.stringify(bad));
      assert.ok(result.failed.length > 0, 'says why');
      assert.equal(result.record.outcome, 'failed');
      assert.equal(result.record.at, '2026-11-26T10:00:00Z');
    }
    const { result } = await send(ANSWER);
    assert.equal(result.record.outcome, 'answered');
    assert.equal(result.record.model, 'Local');
    assert.ok(result.record.digest && !JSON.stringify(result.record).includes('Dana'), 'the text is not kept');
  });

  test('AI off, a note above the ceiling and text over the most each send nothing and say why', () => {
    const ask = (b, text = TEXT) => {
      const made = boardTextAsk(b, board().text, text);
      return 'refused' in made ? made : prepareSend(made);
    };
    const off = ask(base(NOTE, OFF));
    assert.ok('refused' in off);
    assert.ok(off.refused.length > 0);
    const above = ask(base(NOTE, ON, 'Restricted'));
    assert.ok('refused' in above);
    const long = ask(base(NOTE), 'x'.repeat(TEXT_MOST + 1));
    assert.ok('refused' in long);
    assert.match(long.refused, /\d/);
  });
});

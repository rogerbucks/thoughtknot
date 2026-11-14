// Live cards on a board (editor spec §45, graph_on_board, board_relations_drawn):
// - A card names a thing and shows it as the graph holds it now, so a graph edit shows on the card at once.
// - Editing a card is a change to the thing, written to the graph when a person accepts it.
// - The links between the things on the board are drawn as connectors of their own style, and one switch hides them.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gqlBlocks } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { noteWithProposal } from '../src/ai-answer.ts';
import { cardEdit, liveCards, relationConnectors } from '../src/board-live-cards.ts';
import { makeProposal } from '../src/proposals.ts';
import { basisOf } from '../src/proposals-basis.ts';
import { ProposalReview } from '../src/proposals-review.ts';

const TEAM = `// graph: team
(ann:Person {name: 'Ann', role: 'Lead'}),
(bob:Person {name: 'Bob'}),
(cy:Person {name: 'Cy'}),
(ann)-[:ASKS]->(bob),
(bob)-[:ASKS]->(cy)`;
const BOARD = `// graph: ideas · BOARD ON team
(c1:Card {x: 0, y: 0, graph: 'ann'}),
(c2:Card {x: 200, y: 0, graph: 'bob'}),
(c3:Card {x: 400, y: 0, graph: 'gone'}),
(n1:Sticky {x: 0, y: 300, text: 'Free words'})`;
const note = (...blocks) => `# Team\n\n${blocks.map((b) => '```gql\n' + b + '\n```').join('\n\n')}\n`;
const texts = (n) => gqlBlocks(n).map((b) => b.text);

describe('graph_on_board', () => {
  test('a card shows its thing as the graph holds it now, and follows a graph edit', () => {
    const [ann, bob, gone] = liveCards(note(TEAM, BOARD), BOARD);
    assert.deepEqual(
      [ann.item, ann.name, ann.kind, ann.there, ann.properties],
      ['c1', 'Ann', 'Person', true, [['role', 'Lead']]],
    );
    assert.equal(bob.name, 'Bob');
    assert.equal(liveCards(note(TEAM, BOARD), BOARD).length, 3, 'a free sticky is not a card');
    assert.deepEqual([gone.there, gone.name], [false, 'gone'], 'a card whose thing is gone says so, and stays');
    const edited = TEAM.replace("name: 'Ann'", "name: 'Annie'");
    assert.equal(liveCards(note(edited, BOARD), BOARD)[0].name, 'Annie');
  });

  test('editing a card is a change to the thing, written to the graph only when accepted', () => {
    const n = note(TEAM, BOARD);
    const change = cardEdit(BOARD, 'c1', 'role', 'Chair');
    assert.deepEqual(change, { op: 'set', thing: 'ann', key: 'role', value: "'Chair'" });
    assert.equal(cardEdit(BOARD, 'n1', 'role', 'x'), undefined, 'a free sticky has no thing to edit');
    const proposal = makeProposal({
      id: 'card_edit',
      graph: 'team',
      by: { name: 'board', kind: 'step' },
      basis: basisOf(n, 'team'),
      changes: [change],
    });
    const proposed = noteWithProposal(n, proposal);
    assert.equal(typeof proposed, 'string', proposed.refused);
    assert.equal(texts(proposed)[0], TEAM, 'the graph untouched until accepted');
    const block = texts(proposed).find((t) => t.includes('card_edit'));
    const accepted = ProposalReview.fromChangeSet(block).accept(proposed, [proposal.changes[0].id], { name: 'you' });
    assert.ok(accepted.ok, accepted.reason);
    assert.equal(readNote(texts(accepted.note)).world.team.nodes.get('ann')[1].role, 'Chair');
    assert.equal(liveCards(accepted.note, BOARD)[0].properties[0][1], 'Chair', 'and the card shows it');
  });
});

describe('board_relations_drawn', () => {
  test('links between things on the board are connectors in their own style, and the switch hides them', () => {
    const shown = relationConnectors(note(TEAM, BOARD), BOARD);
    assert.deepEqual(shown, [{ from: 'c1', to: 'c2', label: 'ASKS', type: 'ASKS', style: 'relation' }]);
    assert.deepEqual(relationConnectors(note(TEAM, BOARD), BOARD, false), [], 'the switch is off');
    assert.equal(
      shown.some((c) => c.to === 'c3'),
      false,
      'bob asks cy, but cy is not on the board',
    );
  });

  test('a board on no graph draws none', () => {
    const free = "// graph: ideas · BOARD\n(n1:Sticky {x: 0, y: 0, text: 'a'})";
    assert.deepEqual(relationConnectors(note(TEAM, free), free), []);
  });
});

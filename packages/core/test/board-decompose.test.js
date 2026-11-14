// A board offered as things, links and groups (editor spec §45, board_to_graph):
// - An item with words is a thing, a connector a link, a frame a group, and a list in an item several things.
// - It is shown as a proposal first, and a change is written to the graph only when a person accepts it.
// - What the graph holds already is not offered again, and a board with nothing to offer says so.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gqlBlocks } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { noteWithProposal } from '../src/ai-answer.ts';
import { boardProposal } from '../src/board-decompose.ts';
import { ProposalReview } from '../src/proposals-review.ts';

const TEAM = `// graph: team
(ann:Person {name: 'Ann'}),
(ann)-[:ASKS]->(ann)`;
const BOARD = `// graph: ideas · BOARD ON team
(s1:Sticky {x: 0, y: 0, text: 'Dana'}),
(s2:Sticky {x: 200, y: 0, text: 'Eli Ng'}),
(l1:Card {x: 0, y: 400, text: 'Tools\\n- hammer\\n- the saw'}),
(f1:Frame {x: -20, y: -20, w: 500, h: 200, text: 'Staff'}),
(s1)-[:CONNECTS {label: 'mentors'}]->(s2),
(s2)-[:CONNECTS]->(s1)`;
const note = (...blocks) => `# Team\n\n${blocks.map((b) => '```gql\n' + b + '\n```').join('\n\n')}\n`;
const texts = (n) => gqlBlocks(n).map((b) => b.text);
const adds = (r) => r.proposal.changes.map((c) => c.gql);

describe('a board offered as things, links and groups', () => {
  // proves: board_to_graph
  test('an item is a thing of its words, a connector a link, a frame a group, and a list several things', () => {
    const r = boardProposal(note(TEAM, BOARD), BOARD);
    assert.ok(r.proposal, JSON.stringify(r));
    const gql = adds(r);
    assert.ok(gql.includes("(dana:Person {name: 'Dana'})"), 'the usual kind of the graph');
    assert.ok(gql.includes("(eli_ng:Person {name: 'Eli Ng'})"));
    assert.ok(gql.includes("(hammer:Person {name: 'hammer'})"), 'a line of a list');
    assert.ok(gql.includes("(the_saw:Person {name: 'the saw'})"));
    assert.ok(gql.includes("(staff:Cluster {name: 'Staff'})"), 'a frame');
    assert.ok(gql.includes('(dana)-[:MEMBER_OF]->(staff)') && gql.includes('(eli_ng)-[:MEMBER_OF]->(staff)'));
    assert.ok(
      !gql.some((g) => g.includes('MEMBER_OF]->(staff)') && g.includes('hammer')),
      'the list is outside the frame',
    );
    assert.ok(gql.includes('(dana)-[:MENTORS]->(eli_ng)'), 'a connector typed by its label');
    assert.ok(gql.includes('(eli_ng)-[:ASKS]->(dana)'), 'a connector with no label takes the usual type');
    assert.deepEqual(r.things.l1, ['hammer', 'the_saw']);
    assert.deepEqual(r.things.s1, ['dana']);
  });

  test('the kind of an item may be chosen, and a selection offers only its items', () => {
    const r = boardProposal(note(TEAM, BOARD), BOARD, { selection: ['s1'], kinds: { s1: 'Mentor' } });
    assert.deepEqual(adds(r), ["(dana:Mentor {name: 'Dana'})"]);
  });

  test('written beside the graph nothing changes; accepting one change writes only it', () => {
    const n = note(TEAM, BOARD);
    const r = boardProposal(n, BOARD);
    const proposed = noteWithProposal(n, r.proposal);
    assert.equal(typeof proposed, 'string', proposed.refused);
    assert.equal(texts(proposed)[0], TEAM, 'the graph untouched');
    assert.equal(readNote(texts(proposed)).world.team.nodes.size, 1, 'nothing added yet');
    const block = texts(proposed).find((t) => t.includes('dana'));
    const change = r.proposal.changes.find((c) => c.gql.startsWith('(dana:'));
    const accepted = ProposalReview.fromChangeSet(block).accept(proposed, [change.id], { name: 'you' });
    assert.ok(accepted.ok, accepted.reason);
    const things = [...readNote(texts(accepted.note)).world.team.nodes.keys()];
    assert.ok(things.includes('dana') && !things.includes('eli_ng'), 'only the accepted thing');
  });

  test('what the graph holds is not offered again, and a name taken gets a number', () => {
    const twin = BOARD.replace("text: 'Dana'", "text: 'Ann'");
    const r = boardProposal(note(TEAM, twin), twin, { selection: ['s1'] });
    assert.deepEqual(adds(r), ["(ann_2:Person {name: 'Ann'})"]);
    const linked = BOARD.replace('(s1:Sticky {', "(s1:Sticky {graph: 'ann', ").replace('(s2:', '(s2:');
    const q = boardProposal(note(TEAM, linked), linked, { selection: ['s2'] });
    assert.ok(!adds(q).some((g) => g.includes("'Dana'")), 'a linked item is not offered again');
    assert.ok(adds(q).includes('(ann)-[:MENTORS]->(eli_ng)'), 'a connector joins the thing it stands for');
  });

  test('a board with nothing to offer says so, and a board on no graph is refused', () => {
    const empty = '// graph: ideas · BOARD ON team\n(i1:Ink {x: 0, y: 0})';
    assert.match(boardProposal(note(TEAM, empty), empty).nothing, /nothing on the board/i);
    const free = "// graph: ideas · BOARD\n(s1:Sticky {x: 0, y: 0, text: 'Dana'})";
    assert.match(boardProposal(note(TEAM, free), free).refused, /not on a graph/);
  });
});

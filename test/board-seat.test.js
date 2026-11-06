// proves: board_live_together, board_presence
// A person's seat at a shared board (editor spec §45, board_live_together, board_presence). Two seats on two devices
// share a board through the note's CRDT. Each tells the other where it is, over a channel the host owns. The place a
// person tells is never written to the note, and what arrives from outside is checked before it is believed.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BoardSeat, LiveBoard } from '../packages/sync/src/index.ts';
import { copyAll, devices } from '../packages/sync/test/helpers.js';

const NOTE = 'Ideas.md';
const BOARD = `// graph: ideas · BOARD
(a:Sticky {x: 0, y: 0, text: 'One'})`;
const TEXT = `# Ideas\n\n\`\`\`gql\n${BOARD}\n\`\`\`\n`;

/** Two people at the board, each on a device of their own, their seats joined by a channel in memory. */
async function pair() {
  const all = await devices('d0', 'd1');
  await all[0].notes.open(NOTE, TEXT);
  copyAll(all);
  await all[1].notes.open(NOTE, TEXT);
  const sent = [[], []];
  const seat = (i, name) =>
    new BoardSeat(new LiveBoard(all[i].notes, NOTE, 'ideas', `p${i}`, 'edit'), 'ideas', { id: `p${i}`, name }, (m) =>
      sent[i].push(m),
    );
  const seats = [seat(0, 'Ada'), seat(1, 'Bo')];
  const flush = () => {
    for (const m of sent[0].splice(0)) seats[1].hear(m);
    for (const m of sent[1].splice(0)) seats[0].hear(m);
  };
  return { all, seats, flush };
}

describe('a seat at a shared board', () => {
  test('shows the board block, and changes made by one are seen by the other after they catch up', async () => {
    const { all, seats } = await pair();
    assert.match(seats[1].text(), /Sticky \{x: 0, y: 0, text: 'One'\}/);
    const heard = [];
    seats[1].watch(() => (heard.push(1), true));
    assert.equal(await seats[0].change({ kind: 'text', id: 'a', text: 'Changed' }), undefined);
    copyAll(all);
    await seats[1].catchUp();
    assert.match(seats[1].text(), /text: 'Changed'/);
    assert.ok(heard.length >= 1, 'the screen is told');
  });

  test('tells each person where the other is, never writes it to the note, and forgets one who leaves', async () => {
    const { seats, flush } = await pair();
    const note = () => seats[0].text();
    const before = note();
    seats[1].announce({ pointer: [5, 6], selection: ['a'] });
    flush();
    const bo = seats[0].peers().find((p) => p.id === 'p1');
    assert.deepEqual([bo?.name, bo?.pointer, bo?.selection], ['Bo', [5, 6], ['a']]);
    assert.equal(note(), before, 'the note is as it was');
    seats[1].leave();
    flush();
    assert.equal(
      seats[0].peers().some((p) => p.id === 'p1'),
      false,
    );
  });

  test('stops calling a screen that says it is gone', async () => {
    const { seats, flush } = await pair();
    let calls = 0;
    seats[0].watch(() => (calls++, false));
    seats[1].announce({ selection: [] });
    flush();
    seats[1].announce({ selection: [] });
    flush();
    assert.equal(calls, 1);
  });

  test('does not believe a message that is malformed, claims to be this person, or is too long', async () => {
    const { seats } = await pair();
    const hear = (m) => seats[0].hear(typeof m === 'string' ? m : JSON.stringify(m));
    assert.equal(hear('not json'), false);
    assert.equal(hear({ here: { id: 'p0', name: 'Me', selection: [] } }), false, 'not this person');
    assert.equal(hear({ here: { id: 'x', name: '', selection: [] } }), false, 'no name');
    assert.equal(hear({ here: { id: 'x', name: 'X', selection: 'a' } }), false, 'not a list');
    assert.equal(
      hear({ here: { id: 'x', name: 'N'.repeat(500), selection: Array(500).fill('s'), pointer: ['a', 1] } }),
      true,
    );
    const x = seats[0].peers().find((p) => p.id === 'x');
    assert.equal(x.name.length, 64);
    assert.equal(x.selection.length, 50);
    assert.equal(x.pointer, undefined, 'a pointer that is not two numbers is left out');
  });
});

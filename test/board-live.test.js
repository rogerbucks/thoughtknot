// Boards edited together at once (editor spec §45, board_live_together). Two and five people edit one board in a
// synced note, through the CRDT that carries every edit. Their changes meet at the same board text, and none is lost.
// No server decides what is true, and a person may change only what their role allows.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../packages/core/src/board.ts';
import { LiveBoard } from '../packages/sync/src/index.ts';
import { copyAll, devices } from '../packages/sync/test/helpers.js';

const NOTE = 'Ideas.md';
const BOARD = `// graph: ideas · BOARD
(a:Sticky {x: 0, y: 0, text: 'One'}),
(b:Sticky {x: 200, y: 0, text: 'Two'})`;
const TEXT = `# Ideas\n\n\`\`\`gql\n${BOARD}\n\`\`\`\n`;
const items = (text) => readBoard(text.split('```gql\n')[1].split('\n```')[0]).board.items;
const sticky = (id, text) => ({
  kind: 'add',
  item: { id, kind: 'Sticky', x: id.length * 100, y: 300, text, more: {} },
});

/** `count` people at one board, each on a device of their own, all holding the note. */
async function together(count, role = 'edit') {
  const all = await devices(...Array.from({ length: count }, (_, i) => `d${i}`));
  await all[0].notes.open(NOTE, TEXT);
  copyAll(all);
  for (const d of all.slice(1)) await d.notes.open(NOTE, TEXT);
  const seats = all.map((d, i) => new LiveBoard(d.notes, NOTE, 'ideas', `p${i}`, role));
  return { all, seats };
}
/** Everyone's files reach everyone, and each person catches up. */
const meet = async ({ all, seats }) => {
  copyAll(all);
  for (const s of seats) await s.catchUp();
  copyAll(all);
  for (const s of seats) await s.catchUp();
};

describe('board_live_together', () => {
  for (const count of [2, 5]) {
    test(`${count} people editing at once converge, after two rounds of catching up, to the same board text`, async () => {
      const room = await together(count);
      await Promise.all(room.seats.map((s, i) => s.change(sticky(`n${i}`, `Idea ${i}`))));
      await Promise.all(room.seats.map((s, i) => s.change({ kind: 'text', id: 'a', text: `One by ${i}` })));
      await meet(room);
      const texts = new Set(room.seats.map((s) => s.text()));
      assert.equal(texts.size, 1, 'everyone holds the same text');
      const ids = items([...texts][0]).map((i) => i.id);
      for (let i = 0; i < count; i++) assert.ok(ids.includes(`n${i}`), `nothing lost: n${i}`);
    });
  }

  test('a person may change only what their role allows, and a refusal says why', async () => {
    const room = await together(2, 'view');
    const before = room.seats[0].text();
    const why = await room.seats[0].change({ kind: 'text', id: 'a', text: 'No' });
    assert.match(why, /not change it/);
    assert.equal(room.seats[0].text(), before);
  });
});

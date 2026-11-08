// proves: board_live_together, board_presence
// A shared board across devices (editor spec §45, board_live_together, board_presence). Two seats are joined by a link
// in memory: it copies the stores as the mesh VPN would and passes presence messages on. A change by one reaches the
// other at once. Presence is passed on and never written to the note. A change the role refuses sends nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sharedBoard } from '../packages/sync/src/index.ts';
import { copyAll, devices } from '../packages/sync/test/helpers.js';

const NOTE = 'Ideas.md';
const BOARD = `// graph: ideas · BOARD
(a:Sticky {x: 0, y: 0, text: 'One'})`;
const TEXT = `# Ideas\n\n\`\`\`gql\n${BOARD}\n\`\`\`\n`;

/** Two people, each on a device, their seats joined by links that copy the stores and pass presence on. */
async function pair(roles = ['edit', 'edit']) {
  const all = await devices('d0', 'd1');
  await all[0].notes.open(NOTE, TEXT);
  copyAll(all);
  await all[1].notes.open(NOTE, TEXT);
  const ears = [{}, {}];
  const exchanges = [0, 0];
  const link = (i) => ({
    exchange: async () => (exchanges[i]++, copyAll(all), ears[1 - i].arrived?.()),
    send: (m) => ears[1 - i].heard?.(m),
    listen: (heard, arrived) => (ears[i] = { heard, arrived }),
  });
  const seats = roles.map((role, i) =>
    sharedBoard(all[i].notes, NOTE, 'ideas', { id: `p${i}`, name: ['Ada', 'Bo'][i] }, role, link(i)),
  );
  return { all, seats, exchanges };
}

test('a change by one person reaches the other as soon as it is made, with no one asking', async () => {
  const { seats, exchanges } = await pair();
  const seen = new Promise((resolve) => seats[1].watch(() => (resolve(), true)));
  assert.equal(await seats[0].change({ kind: 'text', id: 'a', text: 'Changed' }), undefined);
  await seen;
  assert.equal(exchanges[0], 1);
  assert.match(seats[1].text(), /text: 'Changed'/);
});

test('both people changing at once keep both changes', async () => {
  const { seats } = await pair();
  await Promise.all([
    seats[0].change({ kind: 'add', item: { id: 'x', kind: 'Sticky', x: 100, y: 300, text: 'From Ada', more: {} } }),
    seats[1].change({ kind: 'add', item: { id: 'y', kind: 'Sticky', x: 200, y: 300, text: 'From Bo', more: {} } }),
  ]);
  await seats[0].catchUp();
  await seats[1].catchUp();
  for (const s of seats) assert.ok(s.text().includes('From Ada') && s.text().includes('From Bo'), s.text());
});

test('presence is passed to the other person and is never written to the note', async () => {
  const { all, seats } = await pair();
  const before = seats[0].text();
  seats[0].announce({ selection: ['a'], pointer: [10, 20] });
  const bo = seats[1].peers().find((p) => p.id === 'p0');
  assert.deepEqual([bo.name, bo.selection, bo.pointer], ['Ada', ['a'], [10, 20]]);
  assert.equal(seats[1].text(), before, 'the board text did not change');
  assert.ok(!(await all[1].notes.read(NOTE)).text.includes('Ada'), 'the note does not name a pointer');
});

test('a change the role refuses is said in words and sends nothing', async () => {
  const { seats, exchanges } = await pair(['view', 'edit']);
  const why = await seats[0].change({ kind: 'text', id: 'a', text: 'No' });
  assert.match(why, /not change it/);
  assert.deepEqual(exchanges, [0, 0]);
});

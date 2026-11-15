// The Arrange by graph button of a whiteboard in Obsidian (editor spec §45, board_arranged_by_graph):
// - It moves nothing by itself, and a press arranges the items that became things, written as one change to the note.
// - Items chosen by Shift-click are the only ones arranged, and the button says how many.
// - Undo arrange puts every item back where it was.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { show } from './host/view-notes.js';
import { fence } from './host/notes.js';

before(() => build());

const PATH = 'Some note.md';
const TEAM = `// graph: team
(ann:Person {name: 'Ann'}), (bob:Person {name: 'Bob'}), (cat:Person {name: 'Cat'}),
(ann)-[:KNOWS]->(bob), (bob)-[:KNOWS]->(cat)`;
const BOARD = `// graph: ideas · BOARD ON team
(a:Sticky {x: 0, y: 0, text: 'Ann', graph: 'ann'}),
(b:Sticky {x: 10, y: 10, text: 'Bob', graph: 'bob'}),
(c:Sticky {x: 20, y: 20, text: 'Cat', graph: 'cat'})`;
// the board first, as the block shown; the graph it is on follows, and is read from the note when pressed
const NOTE = `# Team\n\n${fence(BOARD)}\n\n${fence(TEAM)}\n`;

async function open() {
  const env = await load({ files: { [PATH]: NOTE } });
  const { el } = await show(env, NOTE);
  const all = () => el.querySelectorAll('button');
  const buttons = () => [
    all().find((b) => /^Arrange/.test(b.textContent)),
    all().find((b) => /^Undo arrange/.test(b.textContent)),
  ];
  const at = (id) =>
    new RegExp(`\\(${id}:Sticky \\{x: (-?\\d+), y: (-?\\d+),`).exec(env.state.files.get(PATH)).slice(1).map(Number);
  return { env, el, buttons, at };
}

describe('the Arrange by graph button', () => {
  // proves: board_arranged_by_graph
  test('moves nothing until pressed, then arranges the items in one change, and Undo puts them back', async () => {
    const { env, buttons, at } = await open();
    try {
      assert.equal(buttons()[0].textContent, 'Arrange by graph');
      assert.deepEqual(
        [at('a'), at('b'), at('c')],
        [
          [0, 0],
          [10, 10],
          [20, 20],
        ],
        'nothing moved by itself',
      );
      buttons()[0].dispatch('click', { target: buttons()[0] });
      await until(() => at('a')[0] !== 0 || at('a')[1] !== 0, 8000);
      const moved = [at('a'), at('b'), at('c')];
      assert.ok(new Set(moved.map((p) => p.join())).size === 3, 'three different places');
      buttons()[1].dispatch('click', { target: buttons()[1] });
      await until(() => at('a').join() === '0,0' && at('c').join() === '20,20', 8000);
      assert.deepEqual(at('b'), [10, 10], 'every item is back where it was');
    } finally {
      env.uninstall();
    }
  });

  // proves: board_arranged_by_graph
  test('Shift-click chooses an item, the button says how many, and only the chosen are arranged', async () => {
    const { env, el, buttons, at } = await open();
    try {
      const vp = el.querySelector('.thoughtknot-board .thoughtknot-viewport');
      const item = (id) => el.querySelector(`svg.thoughtknot-svg [data-item="${id}"]`);
      for (const id of ['a', 'b'])
        vp.dispatch('pointerdown', { target: item(id), shiftKey: true, button: 0, pointerId: 1 });
      assert.equal(buttons()[0].textContent, 'Arrange 2 chosen');
      buttons()[0].dispatch('click', { target: buttons()[0] });
      await until(() => at('a').join() !== '0,0', 8000);
      assert.deepEqual(at('c'), [20, 20], 'an item not chosen stays where it was');
    } finally {
      env.uninstall();
    }
  });
});

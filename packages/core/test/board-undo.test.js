// Undo and redo on a board by their usual keys (editor spec ES§45, board_keyboard). Each change a board writes is
// logged by the host's key. Ctrl or Cmd with Z takes the last one back. With Shift as well, or Ctrl with Y, it is made
// again. A new change ends what can be made again, and a board that cannot be changed takes no such key.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { boardEdit } from '../src/board-edit.ts';
import { recorded, undoKey } from '../src/display/board/board-undo.ts';

const BOARD = `// graph: ideas · BOARD
(a:Sticky {x: 0, y: 0, text: 'Go by train'}),
(b:Card {x: 300, y: 0, text: 'Paris'})`;

let keys = 0;

/** A board's host with its changes logged, as board-view.ts makes it, and the keys pressed on it. */
function board() {
  const key = `undo ${(keys += 1)}`;
  const state = { text: BOARD, said: [] };
  const host = recorded(
    {
      key,
      write: async (change) => {
        const r = boardEdit(state.text, change);
        if (!('refused' in r)) state.text = r.text;
        return r;
      },
    },
    BOARD,
  );
  let heard = () => {};
  const hooks = {
    write: async (change) => void (await host.write(change)),
    say: (w) => {
      state.said.push(w);
      heard();
    },
  };
  /** Presses a key and waits for what the board says of it, as every undo and redo ends in words. */
  const press = async (k, mods = {}) => {
    let stopped = false;
    const e = { key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods };
    const told = new Promise((done) => (heard = done));
    const used = undoKey({ ...e, preventDefault: () => (stopped = true) }, key, hooks);
    if (used) await told;
    return used && stopped;
  };
  const xOf = (id) => Number(new RegExp(`\\(${id}:\\w+ \\{x: (-?\\d+)`).exec(state.text)?.[1]);
  return { host, state, press, xOf };
}

describe('undo and redo on a board', () => {
  test('Ctrl and Z takes back the last change, and Ctrl, Shift and Z makes it again', async () => {
    const { host, state, press, xOf } = board();
    await host.write({ kind: 'move', id: 'a', x: 50, y: 0 });
    assert.equal(xOf('a'), 50);
    assert.ok(await press('z', { ctrlKey: true }));
    assert.equal(xOf('a'), 0);
    assert.match(state.said.at(-1), /Undone/);
    assert.ok(await press('Z', { ctrlKey: true, shiftKey: true }));
    assert.equal(xOf('a'), 50);
    assert.match(state.said.at(-1), /Redone/);
    // made again, it can be taken back again; Cmd works as Ctrl does, and Ctrl with Y redoes
    assert.ok(await press('z', { metaKey: true }));
    assert.equal(xOf('a'), 0);
    assert.ok(await press('y', { ctrlKey: true }));
    assert.equal(xOf('a'), 50);
  });

  test('each press goes one change further back, and then says there is nothing left', async () => {
    const { host, state, press, xOf } = board();
    await host.write({ kind: 'move', id: 'a', x: 50, y: 0 });
    await host.write({ kind: 'move', id: 'b', x: 400, y: 0 });
    await press('z', { ctrlKey: true });
    assert.deepEqual([xOf('a'), xOf('b')], [50, 300]);
    await press('z', { ctrlKey: true });
    assert.deepEqual([xOf('a'), xOf('b')], [0, 300]);
    const before = state.text;
    await press('z', { ctrlKey: true });
    assert.equal(state.text, before);
    assert.match(state.said.at(-1), /nothing of yours to undo/);
  });

  test('a new change after an undo leaves nothing to redo', async () => {
    const { host, state, press, xOf } = board();
    assert.ok(await press('Z', { ctrlKey: true, shiftKey: true }));
    assert.match(state.said.at(-1), /nothing to redo/);
    await host.write({ kind: 'move', id: 'a', x: 50, y: 0 });
    await press('z', { ctrlKey: true });
    await host.write({ kind: 'move', id: 'b', x: 400, y: 0 });
    await press('Z', { ctrlKey: true, shiftKey: true });
    assert.deepEqual([xOf('a'), xOf('b')], [0, 400]);
    assert.match(state.said.at(-1), /nothing to redo/);
  });

  test('other keys, and a board that cannot be changed, are left alone', async () => {
    const { press } = board();
    assert.equal(await press('z'), false, 'Z alone is not undo');
    assert.equal(await press('z', { ctrlKey: true, altKey: true }), false);
    assert.equal(await press('y', { metaKey: true }), false, 'Cmd with Y is not redo');
    const readOnly = recorded({ key: 'undo read only' }, BOARD);
    assert.equal(readOnly.write, undefined);
    let stopped = false;
    const e = { key: 'z', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false };
    assert.equal(
      undoKey({ ...e, preventDefault: () => (stopped = true) }, 'undo read only', {
        write: async () => {},
        say: () => {},
      }),
      false,
    );
    assert.equal(stopped, false);
  });
});

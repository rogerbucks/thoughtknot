// A card drawn again keeps the room it took and what it showed (editor spec §73, type_change_keeps_size). While a new
// diagram type is drawn, the card holds its height. It lets go only once the things have glided to their places. The
// new card is handed what the last one showed, even when Obsidian draws a fresh card in place of the old one.
import { test, describe, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { holdHeight, seenFor } from '../src/kept-view.ts';

afterEach(() => mock.timers.reset());

/** A card's element as tall as `height`. Its min-height is what the held class and its variable give it. */
function card(height) {
  const props = {},
    classes = new Set();
  const style = {
    get minHeight() {
      return classes.has('thoughtknot-held') ? (props['--thoughtknot-held'] ?? '') : '';
    },
  };
  return {
    offsetHeight: height,
    style,
    setCssProps: (p) => Object.assign(props, p),
    addClass: (c) => classes.add(c),
    removeClass: (c) => classes.delete(c),
  };
}

describe('a card drawn again keeps its room', () => {
  // proves: type_change_keeps_size
  test('it holds its height while drawn again, and lets go once the glide is over', () => {
    globalThis.window ??= globalThis;
    mock.timers.enable({ apis: ['setTimeout'] });
    const owner = {};
    const el = card(420);
    const done = holdHeight(owner, 'A.md', 'g', el);
    assert.equal(el.style.minHeight, '420px', 'held as tall as it was');
    el.offsetHeight = 0; // emptied, as while the new type is drawn
    done();
    mock.timers.tick(400);
    assert.equal(el.style.minHeight, '420px', 'still held while things glide');
    el.offsetHeight = 300;
    mock.timers.tick(100);
    assert.equal(el.style.minHeight, '', 'then free to change size');
    // a fresh card in its place, as Obsidian draws after a write, starts as tall as the last one ended
    const fresh = card(0);
    holdHeight(owner, 'A.md', 'g', fresh);
    assert.equal(fresh.style.minHeight, '300px');
    assert.equal(card(0).style.minHeight, '', 'nothing held for a card never drawn');
    const other = card(0);
    holdHeight(owner, 'B.md', 'g', other);
    assert.equal(other.style.minHeight, '', 'nor for another note');
  });

  // proves: type_change_keeps_size
  test('the next card is handed what the last one showed, read when it asks', () => {
    const owner = {};
    assert.equal(seenFor(owner, 'A.md', 'g').before, undefined, 'nothing shown yet');
    let at = 1;
    seenFor(owner, 'A.md', 'g').keep(() => ({
      view: { cx: at, cy: 0, k: 1 },
      from: new Map([['a', { x: at, y: 2 }]]),
    }));
    at = 5; // the reader moved after the card was drawn
    const next = seenFor(owner, 'A.md', 'g').before;
    assert.deepEqual(next.from.get('a'), { x: 5, y: 2 }, 'where it was last, not where it began');
    assert.equal(seenFor(owner, 'A.md', 'h').before, undefined, 'another graph starts afresh');
  });
});

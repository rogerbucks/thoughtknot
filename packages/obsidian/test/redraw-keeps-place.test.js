// A drawing drawn again as its block is typed stays where it was (editor spec §4, redraw_keeps_place; risk NEURO-7).
// In the edit pane and in the card edited in place, a property value typed redraws the drawing. Its zoom and pan stay,
// and every box stays where it was. Set Redraw while typing to Done, and the picture holds until the text is left or
// Done is pressed (redraw_while_typing).
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { labelled } from './host/notes.js';
import { PATH as CARD_PATH, NOTE as CARD_NOTE, READER as CARD_READER, showIn } from './host/card-notes.js';
import { READER, open, textarea, type } from './host/pane-notes.js';

before(() => build());

/** Where the drawing is now: its zoom and pan, as the viewport is told them, and its size. */
function viewOf(el) {
  const vp = el.querySelector('.thoughtknot-viewport'),
    svg = vp.querySelector('svg');
  return {
    x: vp.cssProps['--thoughtknot-x'],
    y: vp.cssProps['--thoughtknot-y'],
    width: svg.getAttribute('width'),
    height: svg.getAttribute('height'),
  };
}

/** Where each box is drawn, by its thing's key: the places of its shape and words. */
function boxesOf(el) {
  const at = {};
  for (const g of el.querySelectorAll('.thoughtknot-viewport g.node[data-key]'))
    at[g.getAttribute('data-key')] = g.children
      .map((c) => ['points', 'x', 'y', 'cx', 'cy', 'd'].map((n) => c.getAttribute(n) ?? '').join(' '))
      .join('|');
  return at;
}

describe('in the edit pane', () => {
  test('a property value typed redraws the drawing with its zoom and every box where they were', async () => {
    const env = await open();
    try {
      await until(() => env.el.querySelectorAll('g.node').length === 3);
      labelled(env.el, 'Zoom in').click();
      labelled(env.el, 'Zoom in').click();
      const svg = env.el.querySelector('.thoughtknot-viewport svg'),
        view = viewOf(env.el),
        boxes = boxesOf(env.el);
      type(env.el, READER.replace("name: 'Large reader'", "name: 'Large reader', price: 120"));
      await until(() => env.el.querySelector('.thoughtknot-viewport svg') !== svg, 2000);
      assert.deepEqual(viewOf(env.el), view, 'the zoom and pan, as they were');
      assert.deepEqual(boxesOf(env.el), boxes, 'every box where it was');
    } finally {
      env.uninstall();
    }
  });

  test('set to redraw once done, typing a thing does not redraw it until the text is left', async () => {
    const env = await open({ data: { settings: { redrawWhileTyping: 'done' } } });
    try {
      await until(() => env.el.querySelectorAll('g.node').length === 3);
      // the waits typing sets: the write as it rests, and, after each pause, the redraw a little after
      const waits = [],
        set = window.setTimeout;
      window.setTimeout = (fn, ms, ...rest) => (waits.push(ms), set(fn, ms, ...rest));
      try {
        type(env.el, READER + ",\n(price:Reason {title: 'Costs more'})");
      } finally {
        window.setTimeout = set;
      }
      assert.ok(waits.includes(150), 'the write waits as typing rests');
      assert.ok(!waits.includes(250), 'no redraw waits: the picture holds while typing');
      await until(() => env.state.files.get('Reader.md').includes('Costs more'), 2000);
      assert.equal(env.el.querySelectorAll('g.node').length, 3);
      textarea(env.el).dispatch('blur');
      await until(() => env.el.querySelectorAll('g.node').length === 4, 2000);
    } finally {
      env.uninstall();
    }
  });
});

describe('in the card, edited in place', () => {
  /** Draws the card again from the note, as Obsidian does when the block's text changes, the old card taken away. */
  async function redrawn(env, children) {
    for (const c of children.splice(0)) c.unload();
    return showIn(env, 'live', { children });
  }

  test('a write redraws the card with its zoom and every box where they were', async () => {
    const env = await load({ files: { [CARD_PATH]: CARD_NOTE } });
    try {
      const children = [];
      const el = await showIn(env, 'live', { children });
      labelled(el, 'Zoom in').click();
      const view = viewOf(el),
        boxes = boxesOf(el);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      const t = el.querySelector('textarea');
      t.value = CARD_READER.replace("name: 'Large reader'", "name: 'Large reader', price: 120");
      t.dispatch('input');
      await until(() => env.state.files.get(CARD_PATH).includes('price: 120'), 2000);
      const again = await redrawn(env, children);
      assert.deepEqual(viewOf(again), view, 'the zoom and pan, as they were');
      assert.deepEqual(boxesOf(again), boxes, 'every box where it was');
    } finally {
      env.uninstall();
    }
  });

  test('set to redraw once done, the card holds its picture while typing and is drawn as written after Done', async () => {
    const env = await load({ files: { [CARD_PATH]: CARD_NOTE }, data: { settings: { redrawWhileTyping: 'done' } } });
    try {
      const children = [];
      const el = await showIn(env, 'live', { children });
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      const t = el.querySelector('textarea');
      t.value = CARD_READER + ",\n(small:Option {name: 'Small reader'})";
      t.dispatch('input');
      await until(() => env.state.files.get(CARD_PATH).includes('Small reader'), 2000);
      const again = await redrawn(env, children);
      assert.equal(again.querySelectorAll('g.node').length, 2, 'drawn as it was when editing began');
      assert.equal(again.querySelector('textarea'), t, 'with the editor in it, as typed');
      labelled(again, 'Done').click();
      await until(() => again.querySelectorAll('g.node').length === 3, 2000);
    } finally {
      env.uninstall();
    }
  });
});

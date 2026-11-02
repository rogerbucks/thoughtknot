// Names readable at any zoom in a 2D drawing (editor spec §3, names_readable_any_zoom): readable-names.ts. It sizes the
// names in the drawing's SVG for how large it is shown. The drawing's own attributes are left as drawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDocument, installGlobals } from '../../obsidian/test/host/fake-dom.js';

/** A drawing 400 units wide shown `width` pixels wide: a thing named inside its box, and two named beside their dots. */
async function drawing(width) {
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  const { make } = await import('../src/display/graph-view/note-callouts.ts');
  const { CROWDED, readableNames } = await import('../src/display/graph-view/readable-names.ts');
  const svg = make('svg', { viewBox: '0 0 400 200', width });
  const top = make('g', { class: 'graph' });
  svg.appendChild(top);
  const thing = (id, shape, text) => {
    const g = make('g', { class: 'node', id });
    g.appendChild(shape);
    const t = make('text', { 'font-size': 10, 'text-anchor': 'middle', ...text });
    t.textContent = text.words;
    g.appendChild(t);
    top.appendChild(g);
    return t;
  };
  const boxed = thing('box', make('rect', { x: 10, y: 10, width: 120, height: 40 }), {
    x: 70,
    y: 34,
    words: 'Billing',
  });
  const a = thing('a', make('ellipse', { cx: 200, cy: 100, rx: 3, ry: 3 }), { x: 200, y: 115, words: 'Orders' });
  const b = thing('b', make('ellipse', { cx: 230, cy: 100, rx: 3, ry: 3 }), { x: 230, y: 115, words: 'Stock' });
  readableNames(svg);
  return { boxed, a, b, CROWDED, uninstall };
}

// proves: names_readable_any_zoom
test('shown small, names grow to be read and one that would cover another is hidden; the drawing is left as drawn', async () => {
  const { boxed, a, b, CROWDED, uninstall } = await drawing(200);
  try {
    assert.equal(boxed.cssProps.fontSize, '18px', '10 units at half a pixel each grow to 9 pixels');
    assert.equal(boxed.getAttribute('font-size'), '10', 'its own size is kept');
    assert.ok(!a.hasClass(CROWDED) && b.hasClass(CROWDED), 'the second name beside its dot would cover the first');
  } finally {
    uninstall();
  }
});

// proves: names_readable_any_zoom
test('shown large, a name in its box grows with it, and names beside their dots keep to 12 pixels, so both show', async () => {
  const { boxed, a, b, CROWDED, uninstall } = await drawing(1600);
  try {
    assert.equal(boxed.cssProps.fontSize, undefined, 'as drawn, untouched');
    assert.equal(a.cssProps.fontSize, '3px', '12 pixels at 4 pixels a unit');
    assert.ok(!a.hasClass(CROWDED) && !b.hasClass(CROWDED));
  } finally {
    uninstall();
  }
});

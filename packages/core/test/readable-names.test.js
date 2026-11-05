// Names that scale with their things in a 2D drawing (editor spec §3, names_readable_any_zoom): readable-names.ts. It
// picks which names show in the drawing's SVG, the busiest first. The drawing's own attributes are left as drawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDocument, installGlobals } from '../../obsidian/test/host/fake-dom.js';

/** A drawing 400 units wide shown `width` pixels wide: a thing named inside its box, and two named beside their dots. */
async function drawing(width, hideSmall = false) {
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  const { make } = await import('../src/display/graph-view/note-callouts.ts');
  const { CROWDED, readableNames } = await import('../src/display/graph-view/readable-names.ts');
  const svg = make('svg', { viewBox: '0 0 400 200', width });
  const top = make('g', { class: 'graph' });
  svg.appendChild(top);
  const thing = (id, shape, text) => {
    const g = make('g', { class: 'node', id, 'data-key': id });
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
  readableNames(
    svg,
    [
      { from: 'b', to: 'box' },
      { from: 'b', to: 'a' },
    ],
    hideSmall,
  );
  return { boxed, a, b, CROWDED, uninstall };
}

// proves: names_readable_any_zoom
test('names keep their size as drawn; the busier of two that overlap is named, and larger', async () => {
  const { boxed, a, b, CROWDED, uninstall } = await drawing(200);
  try {
    assert.equal(boxed.cssProps.fontSize, undefined, 'a name in its box is left as drawn');
    assert.equal(
      b.cssProps.fontSize,
      '33.6px',
      'the busiest thing is named larger: 12 pixels at half a pixel a unit, 1.4 times',
    );
    assert.ok(a.hasClass(CROWDED) && !b.hasClass(CROWDED), 'the quieter name it would cover is hidden');
    assert.equal(a.getAttribute('font-size'), '10', 'the drawing is left as drawn');
  } finally {
    uninstall();
  }
});

// proves: names_links_legible_2d
test('a crowded name is counted beside the one that stands, and links keep a least thickness', async () => {
  const { a, b, uninstall } = await drawing(200);
  try {
    const count = b.parentElement.querySelector('.thoughtknot-name-more');
    assert.equal(count?.textContent, '+1', 'the name left out is counted beside the busiest');
    assert.ok(!a.parentElement.querySelector('.thoughtknot-name-more'), 'the one left out has no count of its own');
    const { readableNames } = await import('../src/display/graph-view/readable-names.ts');
    const svg = b.parentElement.parentElement.parentElement;
    readableNames(svg, []);
    assert.equal(svg.querySelectorAll('.thoughtknot-name-more').length, 1, 'sized again, counts are not piled up');
    assert.ok(
      !b.parentElement.querySelector('.thoughtknot-name-more'),
      'and follow the new order: no links, first drawn wins',
    );
    assert.equal(svg.cssProps['--thoughtknot-link-least'], '3px', 'a link is held at 1.5 pixels, 0.5 a unit');
  } finally {
    uninstall();
  }
});

// proves: names_readable_any_zoom
test('with labels too small to read hidden, a name under 6 pixels is hidden', async () => {
  const { boxed, uninstall, CROWDED } = await drawing(100, true);
  try {
    assert.ok(boxed.hasClass(CROWDED), '10 units at a quarter pixel each is 2.5 pixels');
  } finally {
    uninstall();
  }
});

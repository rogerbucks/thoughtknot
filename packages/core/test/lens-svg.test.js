// A card's flat drawing seen through a lens (editor spec §68: projections_all_on, projection_fisheye): lens-svg.ts.
// The View menu picks the lens. Each box moves to where the lens sees its middle, enlarged there, and each link point
// by point. Picking none puts the drawing back as drawn, and so does opening the view in space, which bends itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LensSvg, flatAgain } from '../src/display/graph-view/lens-svg.ts';
import { ViewState } from '../src/view-switches.ts';
import { Zoom } from '../src/zoom.ts';

/** A part of the drawing with its attributes, and the parts inside it. */
function partOf(attrs, kids = []) {
  const as = new Map(Object.entries(attrs));
  return {
    id: attrs.id ?? '',
    kids,
    getAttribute: (n) => as.get(n) ?? null,
    hasAttribute: (n) => as.has(n),
    setAttribute: (n, v) => as.set(n, String(v)),
    removeAttribute: (n) => as.delete(n),
    querySelectorAll: (q) => (q === '*' ? kids : []),
    querySelector: () => kids.find((k) => k.hasAttribute('d')) ?? null,
  };
}

/** A drawing 400 × 400: box a at its middle, box b far off, a link between them; and the taps that read it. */
function drawingOf() {
  /** A box 40 × 20 round its middle. */
  const outline = (x, y) =>
    partOf({ d: `M${x - 20},${y - 10}L${x + 20},${y - 10}L${x + 20},${y + 10}L${x - 20},${y + 10}Z` });
  const a = partOf({ id: 'node1', 'data-key': 'a' }, [outline(200, 200)]),
    b = partOf({ id: 'node2', 'data-key': 'b' }, [outline(390, 390)]);
  const path = partOf({ d: 'M210,200C250,200 350,200 390,200' }),
    words = partOf({ x: '215', y: '195' });
  const link = partOf({ id: 'edge1' }, [path, words]);
  const frame = { children: [] };
  const svg = {
    parentElement: frame,
    getAttribute: () => null,
    querySelector: (q) => (q === 'g.graph' ? { getAttribute: () => 'scale(1 1) rotate(0) translate(0 0)' } : null),
    querySelectorAll: (q) => (q.startsWith('g.node') ? [a, b] : q === 'g.edge, g.cluster' ? [link] : []),
    addEventListener: () => {},
  };
  const taps = {
    toDrawing: (p, v) => ({ x: ((p.x - v.x) * 400) / v.width, y: ((p.y - v.y) * 400) / v.height }),
  };
  return { svg, taps, a, b, path, words, frame };
}

/** A lens on that drawing, shown whole in a viewport 400 wide, `a` selected, its frames run at once. */
function lensOf(d, state = new ViewState({})) {
  const win = {
    requestAnimationFrame: (f) => f(),
    setTimeout: () => 0,
    matchMedia: () => ({ matches: false }),
    document: { body: { classList: { contains: () => false } } },
  };
  const viewport = { win, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  const zoom = new Zoom({ width: 400, height: 400 }, { width: 400, height: 400 }, 'full');
  const card = { registerDomEvent: () => {} };
  const host = { svg: () => d.svg, viewport, zoom: () => zoom, taps: d.taps, state, selected: () => 'a' };
  return new LensSvg(card, host);
}

const scaleOf = (g) => Number(/scale\(([-\d.e]+)\)/.exec(g.getAttribute('transform') ?? '')?.[1] ?? 1);

// proves: projection_fisheye
test('a fisheye picked in the View menu enlarges the selected box where it is, and bends its link point by point', () => {
  const d = drawingOf(),
    state = new ViewState({});
  const lens = lensOf(d, state);
  assert.equal(lens.lens, 'none', 'no lens until one is picked');
  lens.pick('fisheye');
  assert.equal(state.lens, 'fisheye', "the card's View menu holds it, so full screen shows it too");
  assert.ok(scaleOf(d.a) > 1.5, 'the selected box is over one and a half times as large');
  assert.match(d.a.getAttribute('transform'), /^translate\(200 200\) scale/, 'and stays where it is');
  assert.equal(d.b.getAttribute('transform'), null, 'a box beyond the reach is left as drawn');
  const [x0, x1] = (d.path.getAttribute('d').match(/-?[\d.]+(?=,)/g) ?? []).map(Number);
  assert.ok(x0 > 210 && x1 > 250, 'the link leaves the larger box further out');
  assert.ok(Number(d.words.getAttribute('x')) > 215, 'and its words move with it');
});

// proves: projection_fisheye
test('picking no lens puts the drawing back as drawn', () => {
  const d = drawingOf(),
    lens = lensOf(d);
  lens.pick('fisheye');
  lens.pick('none');
  assert.equal(d.a.getAttribute('transform'), null);
  assert.equal(d.path.getAttribute('d'), 'M210,200C250,200 350,200 390,200');
  assert.equal(d.words.getAttribute('x'), '215');
});

// proves: projections_all_on
test("the style graph's lens holds until the View menu picks another; the view in space reads the drawing as drawn", () => {
  const d = drawingOf(),
    state = new ViewState({});
  const card = { registerDomEvent: () => {} };
  const lens = new LensSvg(card, {
    ...{ svg: () => d.svg, taps: d.taps, state, selected: () => 'a', written: 'fisheye' },
    viewport: {
      win: { requestAnimationFrame: (f) => f(), setTimeout: () => 0, matchMedia: () => ({ matches: false }) },
    },
    zoom: () => new Zoom({ width: 400, height: 400 }, { width: 400, height: 400 }, 'full'),
  });
  assert.equal(lens.lens, 'fisheye');
  lens.changed();
  assert.ok(scaleOf(d.a) > 1.5, "bent through the Render's lens");
  flatAgain(d.svg);
  assert.equal(d.a.getAttribute('transform'), null, 'as drawn before the view in space reads it');
  // while the view in space lies over it, the flat drawing stays as drawn
  d.frame.children = [{ classList: { contains: (c) => c === 'thoughtknot-space-view' } }];
  lens.changed();
  assert.equal(d.a.getAttribute('transform'), null);
});

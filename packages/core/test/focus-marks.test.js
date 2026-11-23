// One "changed" signal for every surface showing a card's drawing (view_options_everywhere): focus-marks.ts. It says
// what changed. The view in space only paints a new lens again, and lays out anew for a new look or drawings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeOf, MARKED, tellChanged } from '../src/display/graph-view/focus-marks.ts';

// proves: view_options_everywhere
test('each change says what changed, and every listener hears it on the one event', () => {
  const drawing = new EventTarget(),
    heard = [];
  drawing.addEventListener(MARKED, (e) => heard.push(changeOf(e)));
  for (const what of ['look', 'lens', 'sketch']) tellChanged(drawing, what);
  assert.deepEqual(heard, ['look', 'lens', 'sketch']);
});

// proves: view_options_everywhere
test('a change that does not say what it was is taken as a new look, so all is laid out again', () => {
  assert.equal(changeOf(new Event(MARKED)), 'look');
  assert.equal(changeOf(new CustomEvent(MARKED, { detail: 'other' })), 'look');
});

// The SVG painter of a query shown as a highlight (ES§75, ai_query_highlight). Each thing it finds is ringed in the
// highlight's colour and given its badge, by the one mark rule (query-marks.ts). Nothing that places a box changes.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg">
  <g class="node" data-key="roof"><polygon points="10,20 50,20 50,36 10,36"/><text x="30" y="30">Roof</text></g>
  <g class="node" data-key="sam"><ellipse cx="100" cy="28" rx="20" ry="8"/><text x="100" y="30">Sam</text></g>
  <g class="node" data-key="ana"><text x="150" y="30">Ana</text></g>
</svg>`;
const none = { things: new Set(), edges: new Set() };

// proves: ai_query_highlight
test('ai_query_highlight: the SVG painter rings and badges what a highlight finds, and moves nothing', async (t) => {
  const { JSDOM } = await import('jsdom');
  const { QUERY_MARKS } = await import('../src/filter.ts');
  const { markedBy } = await import('../src/query-marks.ts');
  const { DrawingMarks, QUERY_BADGE, QUERY_MARKED } = await import('../src/display/graph-view/focus-marks.ts');
  const { window } = new JSDOM(SVG, { contentType: 'image/svg+xml' });
  const svg = window.document.documentElement;
  const nodeEvent = globalThis.CustomEvent;
  globalThis.CustomEvent = window.CustomEvent; // the drawing tells its listeners in its own window's events
  t.after(() => (globalThis.CustomEvent = nodeEvent));
  const places = () => Array.from(svg.querySelectorAll('polygon, ellipse, text:not([class])'), (el) => el.outerHTML);
  const before = places();
  const marks = new DrawingMarks(svg);
  marks.all({ kept: null, hidden: none, hot: null, marked: markedBy(['roof', 'sam', 'ana'], QUERY_MARKS[1]) });
  for (const key of ['roof', 'sam', 'ana']) {
    const g = svg.querySelector(`g[data-key="${key}"]`);
    assert.ok(g.classList.contains(QUERY_MARKED), `${key} is marked`);
    assert.equal(g.querySelector(`.${QUERY_BADGE}`)?.textContent, '★', `${key} has the badge`);
    assert.equal(g.getAttribute('data-query-badge'), '★', 'which the 3D view reads');
    assert.match(g.style.getPropertyValue('--thoughtknot-query-line'), /orange/, `${key} has the colour`);
    assert.ok(!g.classList.contains('thoughtknot-dim') && !g.classList.contains('thoughtknot-hidden'), 'nothing fades');
  }
  const ana = svg.querySelector('g[data-key="ana"] text[class]');
  assert.match(
    ana.getAttribute('class'),
    /-bare/,
    'a name alone, with no outline to ring, takes the colour on its badge',
  );
  assert.deepEqual(places(), before, 'no outline or name is placed or sized anew');
  // marked again, a thing keeps the one badge; the highlight gone, its marks go too
  marks.all({ kept: null, hidden: none, hot: null, marked: markedBy(['roof'], QUERY_MARKS[1]) });
  assert.equal(svg.querySelectorAll(`g[data-key="roof"] .${QUERY_BADGE}`).length, 1);
  assert.equal(svg.querySelector('g[data-key="sam"]').classList.contains(QUERY_MARKED), false);
  marks.all({ kept: null, hidden: none, hot: null });
  assert.equal(svg.querySelectorAll(`.${QUERY_BADGE}`).length, 0);
  assert.equal(svg.querySelector('g[data-key="roof"]').style.getPropertyValue('--thoughtknot-query-line'), '');
  assert.deepEqual(places(), before);
});

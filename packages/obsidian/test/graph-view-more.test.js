// A short bar (spec §3, bar_kept_short; UX review F5 and F10, 25 Oct 2026):
// - Find, View, 2D, Fit and Full screen in sight, and the rest behind More;
// - More names each of its buttons, and closes on a pick or Escape;
// - the problems count last, calm unless one is an error.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { load, styles, GRAPH, show } from './host/view-notes.js';

before(() => build());

describe('a short bar', () => {
  let env;
  before(async () => {
    env = await load();
  });
  after(() => env.uninstall());

  test('the bar shows the most used buttons in one row, More, and last the problems count', async () => {
    const { el } = await show(env, fence(GRAPH));
    const bar = el.querySelector('.thoughtknot-bar');
    const row = Array.from(bar.children).map((c) =>
      c.classList.contains('thoughtknot-bar-more') ? 'More' : c.getAttribute('aria-label'),
    );
    assert.equal(row.at(-1), 'No problems', 'the count is last');
    assert.equal(row.at(-2), 'More');
    for (const label of ['Find a thing', 'Fit', 'Full screen']) assert.ok(row.includes(label), label);
    for (const label of ['Zoom out', 'Zoom in', 'Edit here', 'Edit in pane'])
      assert.ok(!row.includes(label), `${label} waits behind More`);
  });

  test('More opens a list naming each of the rest beside its icon, and closes once one is chosen', async () => {
    const { el } = await show(env, fence(GRAPH));
    const more = el.querySelector('.thoughtknot-bar-more');
    const toggle = labelled(more, 'More');
    const list = more.querySelector('.thoughtknot-bar-more-list');
    assert.equal(list.hidden, true, 'shut at first');
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    toggle.click();
    assert.equal(list.hidden, false, 'open once pressed');
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    for (const label of ['Zoom out', 'Zoom in', 'Filter by kind or link', 'Edit here', 'Edit in pane']) {
      const b = labelled(list, label);
      assert.ok(b, label);
      assert.ok(b.getAttribute('data-icon'), `an icon on ${label}`);
      assert.match(b.textContent, new RegExp(label), `${label} is named in words`);
    }
    labelled(list, 'Zoom in').click();
    assert.equal(list.hidden, true, 'shut once one is chosen');
  });

  test('Escape shuts More and gives the focus back to its button', async () => {
    const { el } = await show(env, fence(GRAPH));
    const more = el.querySelector('.thoughtknot-bar-more');
    const toggle = labelled(more, 'More');
    toggle.click();
    more.dispatch('keydown', { key: 'Escape' });
    assert.equal(more.querySelector('.thoughtknot-bar-more-list').hidden, true);
    assert.equal(el.ownerDocument.activeElement, toggle);
  });

  test('the problems count is calm when nothing is wrong or only gaps are, and a warning sign only for an error', async () => {
    const none = labelled((await show(env, fence(GRAPH))).el, 'No problems');
    assert.equal(none.getAttribute('data-icon'), 'check-circle');
    assert.ok(none.classList.contains('is-calm'));
    const rule =
      GRAPH +
      ",\n(every_option_answers:Cardinality {kind: 'Option', relationship: 'ANSWERS', direction: 'out', min: 1, says: 'every option answers the question'}),\n(spare:Option {name: 'Spare'})";
    const gap = labelled((await show(env, fence(rule))).el, '1 gap');
    assert.equal(gap.getAttribute('data-icon'), 'info');
    assert.ok(gap.classList.contains('is-calm'));
    const { el } = await show(env, fence(GRAPH + ',\n(x0:T {v: })'));
    const bad = el.querySelector('.thoughtknot-badge');
    assert.equal(bad.getAttribute('data-icon'), 'alert-triangle');
    assert.ok(bad.classList.contains('is-error'), 'an error is told by its sign as well as its colour');
  });

  test('the count sits at the bar’s far end, and the More list drops over the drawing', () => {
    assert.match(styles, /\.thoughtknot-badge\s*\{\s*margin-inline-start:\s*auto;/);
    assert.match(styles, /\.thoughtknot-bar-more-list\s*\{[^}]*position:\s*absolute;[^}]*z-index:/);
  });
});

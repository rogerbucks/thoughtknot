// The queries asked in words, drawn in the Filter panel's list (editor spec ES§75): untangle-query-items.ts.
// Requirements: ai_query_saved.
// - Each query is a line of the list, with its words beside the filter they became.
// - A locked query's words cannot be changed, and it cannot step back.
// - Two or more get a box each to choose them, and a bar to merge the chosen, which needs two chosen.
// - A merged query lists its parts, each to work on or take out.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { installHost } from '../src/display/host.ts';
import { queryList } from '../src/display/graph-view/untangle-query-items.ts';
import { queriesMerged, queryLocked, queryOf } from '../src/filter.ts';
import { DEAR, LATE } from './filter-query-fixtures.js';

/** A list in a page with the DOM helpers Obsidian adds. */
function page() {
  const { window } = new JSDOM('<body><div id="list"></div></body>');
  window.Element.prototype.createEl = function (tag, o = {}) {
    const el = this.ownerDocument.createElement(tag);
    if (o.text) el.textContent = o.text;
    if (o.cls) el.className = o.cls;
    for (const [k, v] of Object.entries(o.attr ?? {})) el.setAttribute(k, v);
    this.append(el);
    return el;
  };
  window.Element.prototype.createDiv = function (o) {
    return this.createEl('div', o);
  };
  window.Element.prototype.createSpan = function (o) {
    return this.createEl('span', o);
  };
  window.Element.prototype.addClass = function (c) {
    this.classList.add(c);
  };
  window.Element.prototype.empty = function () {
    this.replaceChildren();
  };
  return window.document.getElementById('list');
}

/** Acts that record what was done, by name. */
function acts() {
  const done = [];
  const act =
    (name) =>
    (...args) =>
      done.push([name, ...args]);
  const names = ['ask', 'pick', 'shown', 'lock', 'back', 'choose', 'joinAs', 'merge', 'joined', 'partOut'];
  return { done, acts: Object.fromEntries(names.map((n) => [n, act(n)])) };
}

const view = (qs, extra = {}) => ({ qs, current: null, chosen: new Set(), join: 'all', ...extra });
const labelled = (root, label) => root.querySelector(`[aria-label="${label}"]`);

beforeEach(() => installHost({ icon: () => {}, isPhone: () => false, notice: () => {}, menu: () => {} }));

test('each query is a line of the list, its words beside the filter they became, and Enter asks again', () => {
  const list = page();
  const { done, acts: a } = acts();
  queryList(list, view([queryOf('q1', 'late tasks', LATE)]), a);
  const items = list.querySelectorAll('[role="listitem"]');
  assert.equal(items.length, 1, 'one query, no merge bar');
  const words = items[0].querySelector('[name="query-words"]');
  assert.equal(words.value, 'late tasks');
  assert.match(items[0].querySelector('.thoughtknot-query-rule').textContent, /status/);
  assert.equal(items[0].querySelector('[name="query-choose"]'), null, 'one query has nothing to merge with');
  words.value = 'only the late ones ';
  words.dispatchEvent(new list.ownerDocument.defaultView.KeyboardEvent('keydown', { key: 'Enter' }));
  assert.deepEqual(done, [['ask', { id: 'q1' }, 'only the late ones']]);
});

test('a locked query’s words cannot be changed, and it cannot step back', () => {
  const list = page();
  queryList(list, view([queryLocked(queryOf('q1', 'late tasks', LATE), true)]), acts().acts);
  assert.equal(list.querySelector('[name="query-words"]').disabled, true);
  assert.equal(labelled(list, 'Step back').disabled, true);
  assert.equal(list.querySelector('[aria-pressed="true"]') !== null, true, 'the lock shows pressed');
});

test('two queries get a box each, and Merge needs two chosen', () => {
  const qs = [queryOf('q1', 'late tasks', LATE), queryOf('q2', 'dear tasks', DEAR)];
  const one = page();
  queryList(one, view(qs, { chosen: new Set(['q1']) }), acts().acts);
  assert.equal(one.querySelectorAll('[name="query-choose"]').length, 2);
  assert.equal(labelled(one, 'Merge the chosen').disabled, true, 'one chosen cannot merge');
  const two = page();
  const { done, acts: a } = acts();
  queryList(two, view(qs, { chosen: new Set(['q1', 'q2']) }), a);
  const merge = labelled(two, 'Merge the chosen');
  assert.equal(merge.disabled, false);
  merge.click();
  assert.deepEqual(
    done.map(([name]) => name),
    ['merge'],
  );
});

test('a merged query lists its parts, each to work on or take out', () => {
  const list = page();
  const { done, acts: a } = acts();
  const merged = queriesMerged('m1', [queryOf('q1', 'late tasks', LATE), queryOf('q2', 'dear tasks', DEAR)], 'any');
  assert.ok(!('refused' in merged));
  queryList(list, view([merged]), a);
  const parts = list.querySelectorAll('.thoughtknot-query-part');
  assert.equal(parts.length, 2);
  const id = parts[1].getAttribute('data-part');
  parts[1].querySelectorAll('button')[1].click();
  assert.deepEqual(done.at(-1), ['partOut', merged, id]);
});

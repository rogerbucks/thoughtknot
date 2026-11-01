// proves: layout_contained
// A drawing refused for time or stopped offers Try again; one refused for size does not (risk UX-4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { installHost } from '../src/display/host.ts';
import { refusalBanner } from '../src/display/refusal-banner.ts';

/** A page with the DOM helpers Obsidian adds, and a host that draws icons as marks. */
function page() {
  const { window } = new JSDOM('<body><div id="root"></div></body>');
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
  installHost({ icon: () => {}, isPhone: () => false, notice: () => {}, menu: () => {} });
  return window.document.getElementById('root');
}

test('a stopped or timed-out layout offers Try again, which runs the action', () => {
  for (const refusal of [
    { reason: 'stopped', failures: 3 },
    { reason: 'timed-out', ms: 5000 },
  ]) {
    let ran = 0;
    const banner = refusalBanner(page(), refusal, () => ran++);
    const again = [...banner.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Try again');
    assert.ok(again, refusal.reason);
    again.click();
    assert.equal(ran, 1);
  }
});

test('a graph too large to draw offers no Try again, as trying again cannot help', () => {
  const banner = refusalBanner(page(), { reason: 'too-large', limit: 'things', count: 3000, most: 2000 }, () => {});
  assert.equal(banner.querySelector('button'), null);
});

test('with no action to run, nothing is offered', () => {
  assert.equal(refusalBanner(page(), { reason: 'stopped', failures: 3 }).querySelector('button'), null);
});

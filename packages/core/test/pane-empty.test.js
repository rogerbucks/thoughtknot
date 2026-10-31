// proves: first_run_help
// The empty editor pane says what to start with, gives an example, and links to the guide (risk UX-8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { nothingYet, GUIDE_URL } from '../src/display/editor/pane-empty.ts';
import { readNote } from '../src/drawing.ts';

test('an empty pane gives a one-line example that reads clean, and a link to the guide', () => {
  const { window } = new JSDOM('<body><div id="pane"></div></body>');
  window.Element.prototype.createEl = function (tag, o = {}) {
    const el = this.ownerDocument.createElement(tag);
    if (o.text) el.textContent = o.text;
    if (o.cls) el.className = o.cls;
    for (const [k, v] of Object.entries(o.attr ?? {})) el.setAttribute(k, v);
    this.append(el);
    return el;
  };
  const pane = window.document.getElementById('pane');
  nothingYet(pane);
  assert.match(pane.textContent, /Nothing to draw yet/);
  const example = pane.querySelector('.thoughtknot-example-line').textContent.replace('For example: ', '');
  assert.equal(readNote(['// graph: g\n' + example]).problems.length, 0, example);
  const link = pane.querySelector('a');
  assert.equal(link.textContent, 'Read the guide');
  assert.equal(link.getAttribute('href'), GUIDE_URL);
  assert.match(link.getAttribute('rel'), /noopener/);
});

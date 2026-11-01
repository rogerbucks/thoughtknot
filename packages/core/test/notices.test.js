// proves: risk_panel
// A notice stays as long as a slow reader needs, and the last few can be read again (risk NEURO-6).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { noticeMs, recentNotices, rememberNotice, KEPT, NOTICE_MS, STICKY_OVER } from '../src/display/notices.ts';
import { renderProblems } from '../src/display/graph-view/problems-list.ts';

describe('how long a notice stays', () => {
  test('grows with its length, and is never under five seconds', () => {
    assert.equal(noticeMs(''), NOTICE_MS);
    assert.ok(noticeMs('x'.repeat(60)) > noticeMs('x'.repeat(10)));
  });

  test('is until dismissed (0) past 80 characters, and not at 80', () => {
    assert.equal(noticeMs('x'.repeat(STICKY_OVER)) > 0, true);
    assert.equal(noticeMs('x'.repeat(STICKY_OVER + 1)), 0);
  });
});

describe('the messages said', () => {
  test('the last ten are kept, newest first', () => {
    for (let i = 1; i <= KEPT + 3; i++) rememberNotice(`message ${i}`);
    const recent = recentNotices();
    assert.equal(recent.length, KEPT);
    assert.equal(recent[0], `message ${KEPT + 3}`);
    assert.equal(recent.at(-1), 'message 4');
  });

  test('are listed behind the problems badge, to be read again', () => {
    rememberNotice('The kept drafts could not be written into the note. They stay kept.');
    const doc = new JSDOM('<body></body>').window.document;
    // the DOM helpers Obsidian adds to elements, as far as the list uses them
    doc.defaultView.Element.prototype.createEl = function (tag, o = {}) {
      const el = this.ownerDocument.createElement(tag);
      if (o.text) el.textContent = o.text;
      if (o.cls) el.className = o.cls;
      this.append(el);
      return el;
    };
    doc.defaultView.Element.prototype.createDiv = function (o) {
      return this.createEl('div', o);
    };
    const box = renderProblems(doc.body, [], false);
    const listed = [...box.querySelectorAll('.thoughtknot-recent-notices li')].map((li) => li.textContent);
    assert.equal(listed[0], 'The kept drafts could not be written into the note. They stay kept.');
  });
});

// The colour key, folded into the View panel (editor spec §25, panels_key). Roger, 7 Nov 2026: the colour key took a
// lot of space over the drawing; make it part of the side panels. The Key section is made once, shut, just under the
// View panel's head. A view without a View panel has none, so its key stays under the level badge.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDocument, installGlobals } from './host/fake-dom.js';

let doc, uninstall, keySection, viewMenuOf;
before(async () => {
  doc = fakeDocument();
  uninstall = installGlobals(doc);
  const { installHost } = await import('../../core/src/display/host.ts');
  installHost({ icon() {}, isPhone: () => false, notice() {}, menu() {} });
  ({ keySection, viewMenuOf } = await import('../../core/src/display/graph-view/view-key.ts'));
});
after(() => uninstall());

const classes = (el) => el.children.map((c) => c.className);

// proves: panels_key
test('the Key section is made once, shut, just under the View panel head', () => {
  const menu = doc.body.createDiv({ cls: 'thoughtknot-view-menu' });
  menu.createDiv({ cls: 'thoughtknot-dock-head' });
  menu.createDiv({ cls: 'thoughtknot-switch' });
  const body = keySection(menu);
  assert.deepEqual(classes(menu), ['thoughtknot-dock-head', 'thoughtknot-view-key', 'thoughtknot-switch']);
  const fold = menu.children[1];
  assert.equal(fold.tagName.toLowerCase(), 'details');
  assert.ok(!fold.hasAttribute('open'), 'shut until opened');
  assert.equal(fold.children[0].textContent, 'Key');
  assert.ok(fold.children[0].getAttribute('title'), 'says what the key is in its tooltip');
  assert.equal(body.parentElement, fold);
  assert.equal(keySection(menu), body, 'asked again, the same section');
  assert.equal(menu.children.filter((c) => c.className === 'thoughtknot-view-key').length, 1);
});

// proves: panels_key
test('the View panel of a drawing is found in its view; a view without one has none', () => {
  const view = doc.body.createDiv({ cls: 'thoughtknot-view' });
  const corner = view.createDiv({ cls: 'thoughtknot-corner' });
  const viewport = view.createDiv({ cls: 'thoughtknot-viewport' });
  assert.equal(viewMenuOf(viewport), null);
  const menu = corner.createDiv({ cls: 'thoughtknot-view-menu' });
  assert.equal(viewMenuOf(viewport), menu);
});

// The colour key, folded into the View panel (editor spec §25, panels_key). Roger, 7 Nov 2026: the colour key took a
// lot of space over the drawing; make it part of the side panels. The Key section is made once, shut, just under the
// View panel's head. A view without a View panel has none, so its key stays under the level badge.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDocument, installGlobals } from './host/fake-dom.js';

let doc, uninstall, keySection, viewMenuOf, keyHome, keepKeyHome;
before(async () => {
  doc = fakeDocument();
  uninstall = installGlobals(doc);
  const { installHost } = await import('../../core/src/display/host.ts');
  installHost({ icon() {}, isPhone: () => false, notice() {}, menu() {} });
  ({ keySection, viewMenuOf, keyHome, keepKeyHome } = await import('../../core/src/display/graph-view/view-key.ts'));
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

// proves: panels_key
test('in a View panel with no head, the Key section goes first of all', () => {
  const menu = doc.body.createDiv({ cls: 'thoughtknot-view-menu' });
  menu.createDiv({ cls: 'thoughtknot-switch' });
  keySection(menu);
  assert.deepEqual(classes(menu), ['thoughtknot-view-key', 'thoughtknot-switch']);
});

// proves: panels_key
test('the key of subjects goes to the Key section, and moves there from the badge once a View panel is built', () => {
  const view = doc.body.createDiv({ cls: 'thoughtknot-view' });
  const viewport = view.createDiv({ cls: 'thoughtknot-viewport' });
  const badge = viewport.createDiv({ cls: 'thoughtknot-level-badge' });
  // no View panel yet: the key is made under the badge
  assert.equal(keyHome(viewport, badge), badge);
  const key = badge.createDiv({ cls: 'thoughtknot-level-legend' });
  keepKeyHome(viewport, badge);
  assert.equal(key.parentElement, badge, 'stays while there is no View panel');
  // the View panel comes after: the key moves into its Key section, and the badge keeps its line alone
  const menu = view.createDiv({ cls: 'thoughtknot-view-menu' });
  menu.createDiv({ cls: 'thoughtknot-dock-head' });
  keepKeyHome(viewport, badge);
  assert.equal(key.parentElement, keySection(menu));
  assert.equal(badge.children.length, 0);
  assert.equal(keyHome(viewport, badge), keySection(menu));
});

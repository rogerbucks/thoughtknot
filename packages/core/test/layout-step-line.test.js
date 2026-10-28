// The one line beside a drawing that says the cheaper step it was laid out by (editor spec §68, layout_never_text).
// It is read from the drawing itself, so only a step actually taken is said. It is drawn again with the legend of
// moving links each time the graph is laid out again.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDocument, installGlobals } from '../../obsidian/test/host/fake-dom.js';
import { renderBeside, stepOf } from '../src/display/graph-view/layout-step-line.ts';
import { PICK_ATTRIBUTE } from '../src/layouts/fingerprint.ts';

const svgOf = (shown) =>
  `<svg width="10pt" height="10pt" ${PICK_ATTRIBUTE}="${encodeURIComponent(JSON.stringify(shown))}"></svg>`;
const PICKED = { why: 'flow', kinds: 'plain', order: [], parts: 1, loose: 0 };

describe('the line beside a drawing', () => {
  // proves: layout_never_text
  test('says the cheaper step it was laid out by, in one line, and nothing for a drawing laid out as asked', () => {
    const doc = fakeDocument(),
      uninstall = installGlobals(doc);
    try {
      const slot = doc.body.createDiv();
      renderBeside(slot, [], [], svgOf({ ...PICKED, step: 'grid' }));
      const line = slot.querySelector('.thoughtknot-layout-step');
      assert.equal(line.getAttribute('role'), 'status');
      assert.equal(line.textContent, 'Laying it out took too long, so it is drawn as a grid.');
      renderBeside(slot, [], [], svgOf({ ...PICKED, step: 'own' }));
      assert.match(slot.querySelector('.thoughtknot-layout-step').textContent, /our own engine/);
      assert.equal(slot.querySelectorAll('.thoughtknot-layout-step').length, 1, 'drawn again, not added to');
      renderBeside(slot, [], [], svgOf(PICKED));
      assert.equal(slot.querySelector('.thoughtknot-layout-step'), null);
      renderBeside(slot, [], [], '<svg width="1pt"></svg>');
      assert.equal(slot.querySelector('.thoughtknot-layout-step'), null, 'a drawing Graphviz laid out says nothing');
    } finally {
      uninstall();
    }
  });

  test('reads the step from the drawing’s own tag, and no other', () => {
    assert.equal(stepOf(svgOf({ ...PICKED, step: 'rows' })), 'rows');
    assert.equal(stepOf(svgOf({ ...PICKED, step: 'text' })), undefined);
    assert.equal(stepOf(`<svg width="1pt"><g ${PICK_ATTRIBUTE}="x"></g></svg>`), undefined);
  });
});

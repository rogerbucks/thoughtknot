// The context chip (editor spec §25, controls_chip). Roger, 1 Nov 2026: the lines that say what the drawing shows pushed
// it down. They sit in one chip over the top start corner of the drawing instead. The built plugin, against stand-ins.
// - Nothing of them is left in the card's flow: the drawing comes right after the layer over it.
// - Folded at first, it keeps the banner and every status or alert shown; its button opens the rest, kept for the session.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, until } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { load, GRAPH, show } from './host/view-notes.js';
import { rules, winner } from './host/cascade.js';

before(() => build());

let env, el;
before(async () => {
  env = await load();
  el = (await show(env, fence(GRAPH))).el;
});
after(() => env.uninstall());

const chip = () => el.querySelector('.thoughtknot-chip');
const fold = () => chip().querySelector('.thoughtknot-chip-fold');
const LINES = ['thoughtknot-untangle', 'thoughtknot-type-strip', 'thoughtknot-flow-legend-slot'];

// proves: controls_chip
test('the lines that say what the drawing shows sit in the chip, none left in the flow above the drawing', () => {
  const card = el.querySelector('.thoughtknot-view'),
    kids = card.children;
  assert.ok(chip().parentElement.classList.contains('thoughtknot-corner'), 'in the corner over the drawing');
  for (const cls of LINES) {
    assert.ok(chip().querySelector(`.${cls}`), `${cls} is in the chip`);
    assert.ok(!kids.some((k) => k.classList.contains(cls)), `${cls} is not in the flow`);
  }
  assert.match(chip().textContent, /Drawn as/);
  const bar = kids.findIndex((k) => k.classList.contains('thoughtknot-bar')),
    layer = kids.findIndex((k) => k.classList.contains('thoughtknot-over'));
  const between = kids.slice(bar + 1, layer).filter((k) => !k.classList.contains('thoughtknot-card-tools'));
  assert.deepEqual(
    between.map((k) => k.getAttribute('class')),
    [],
    'only the card tools may sit between the bar and the drawing',
  );
});

// proves: controls_chip
test('folded at first, its button opens it and folds it again, kept for the session', async () => {
  assert.ok(chip().classList.contains('is-folded'));
  assert.equal(fold().getAttribute('aria-expanded'), 'false');
  fold().click();
  assert.ok(!chip().classList.contains('is-folded'));
  assert.equal(fold().getAttribute('aria-expanded'), 'true');
  el = (await show(env, fence(GRAPH))).el;
  await until(() => !!chip());
  assert.ok(!chip().classList.contains('is-folded'), 'a card drawn again opens it as it was left');
  fold().click();
  assert.ok(chip().classList.contains('is-folded'));
});

// proves: controls_chip
test('folded, it keeps the banner and each status or alert, and hides the rest', () => {
  const css = readFileSync(new URL('../../../styles.css', import.meta.url), 'utf8');
  assert.match(
    css,
    /\.thoughtknot-chip\.is-folded > \.thoughtknot-chip-body > :not\(\.thoughtknot-untangle, \[role='status'\], \[role='alert'\]\) \{\s*display: none;/,
  );
  const all = rules(css, 'thoughtknot');
  const over = { tag: 'div', classes: ['thoughtknot-over'] };
  const corner = { tag: 'div', classes: ['thoughtknot-corner'], states: [], ancestors: [over] };
  assert.equal(winner(all, corner, 'width').value, 'fit-content', 'as wide as its words, leaving the drawing free');
});

// Compact panels (editor spec §25, panels_compact). Roger, 6 Nov 2026: the side panels are "way too big", with "a ton
// of text in the side panels. Not useful for daily use … Use tool tips (where appropriate)". Where a pointer hovers:
// - a switch's hint and its on/off words are hidden, and its hint is its tooltip and still its description;
// - rows and buttons are 28 pixels high, over WCAG's 24;
// - the 2D dock shows its key controls as icons, each named in its tooltip, on one row with its name.
// Roger, 8 Nov 2026: "I don't get the View panel / detail panel. Seems really chunky". So a head shows only its name
// and its fold, and a chip with nothing to say is gone.
// A touch screen keeps its 44-point rows and its hints: the rules sit in a hover media query.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { load, GRAPH, show } from './host/view-notes.js';

before(() => build());

let env;
before(async () => {
  env = await load();
});
after(() => env.uninstall());

/** The rules inside the style sheet's hover media query, as one text. */
const hovering = () => {
  const css = readFileSync(new URL('../../../styles.css', import.meta.url), 'utf8');
  const at = css.indexOf('@media (hover: hover) and (pointer: fine) {');
  assert.ok(at >= 0, 'a hover media query holds the compact rules');
  let depth = 0,
    end = at;
  for (let i = css.indexOf('{', at); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) {
      end = i;
      break;
    }
  }
  return css.slice(at, end);
};

// proves: panels_compact
test('where a pointer hovers, hints and on/off words hide, and rows are 28 pixels high', () => {
  const css = hovering();
  assert.match(
    css,
    /\.thoughtknot-view-menu :is\(\.thoughtknot-switch-hint, \.thoughtknot-switch-state\)[^{]*\{\s*display: none;/,
  );
  assert.match(css, /button\.thoughtknot-switch,[\s\S]*?\{\s*min-width: 28px;\s*min-height: 28px;/);
  assert.match(css, /\.thoughtknot-view-dock > \.thoughtknot-dock-body \.thoughtknot-badge-text \{\s*display: none;/);
});

// proves: panels_compact
test('each switch keeps its hint as its tooltip and its description; each key control is named in its tooltip', async () => {
  const { el } = await show(env, fence(GRAPH));
  labelled(el, 'View').click();
  const switches = el.querySelectorAll('.thoughtknot-switch');
  assert.ok(switches.length > 0);
  for (const b of switches) {
    const hint = el.querySelector(`#${b.getAttribute('aria-describedby')}`);
    assert.ok(hint, 'described by its hint');
    assert.equal(b.getAttribute('title'), hint.textContent, 'its hint is its tooltip');
  }
  const keys = el.querySelector('.thoughtknot-view-dock .thoughtknot-dock-body').querySelectorAll('button');
  assert.ok(keys.length > 0);
  for (const b of keys)
    assert.ok(b.getAttribute('aria-label').startsWith(b.getAttribute('title') || '-'), 'named in its tooltip');
});

// proves: panels_compact
test('a head shows its name and fold, its grip and dock buttons only once focused, and an empty chip is gone', () => {
  const css = hovering();
  assert.match(
    css,
    /\.thoughtknot-dock-head:not\(:focus-within\) :is\(\.thoughtknot-dock-grip, \.thoughtknot-dock-place\) \{[^}]*position: absolute;[^}]*opacity: 0;[^}]*pointer-events: none;/,
    'out of sight, yet still reached by a key',
  );
  assert.match(css, /\.thoughtknot-corner > \.thoughtknot-view-dock:not\(\.is-folded\) \{\s*flex-direction: row;/);
  const all = readFileSync(new URL('../../../styles.css', import.meta.url), 'utf8');
  assert.match(
    all,
    /\.thoughtknot-corner > \.thoughtknot-chip:not\(:has\(> \.thoughtknot-chip-body > :not\(\[hidden\], :empty\)\)\) \{\s*display: none;/,
  );
});

// proves: panels_compact
test('what can be done with the selected thing, and the editor beside it, are rows of icons named in tooltips', () => {
  const css = hovering();
  assert.match(css, /\.thoughtknot-untangle-offers \{\s*flex-direction: row;/);
  assert.match(
    css,
    /:is\(\.thoughtknot-untangle-offers, \.thoughtknot-edit-actions\) > button \.thoughtknot-badge-text \{\s*display: none;/,
  );
  assert.match(
    css,
    /\.thoughtknot-edit-actions > button,[^{]*\.thoughtknot-edit-line-input,[^{]*\{\s*min-width: 28px;/,
  );
});

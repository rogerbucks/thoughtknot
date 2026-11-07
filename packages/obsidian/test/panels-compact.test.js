// Compact panels (editor spec §25, panels_compact). Roger, 6 Nov 2026: the side panels are "way too big", with "a ton
// of text in the side panels. Not useful for daily use … Use tool tips (where appropriate)". Where a pointer hovers:
// - a switch's hint and its on/off words are hidden, and its hint is its tooltip and still its description;
// - rows and buttons are 28 pixels high, over WCAG's 24;
// - the 2D dock shows its key controls as icons, each named in its tooltip.
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

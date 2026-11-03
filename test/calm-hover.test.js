// Calm hover (editor spec §68, calm_hover). Roger, 3 Nov 2026: hover must wait a little, then fade in and out, not
// flicker. The highlight is a class (hover.ts); styles.css makes it wait and fade, and keeps the line the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const rule = (selector) => {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, `styles.css has ${selector}`);
  return css.slice(at, css.indexOf('}', at));
};

// proves: calm_hover
test('a highlight waits a moment before it shows, with or without motion', () => {
  const waits = css.slice(
    0,
    css.indexOf('@media (prefers-reduced-motion: no-preference) {\n  .thoughtknot-svg :is(g.node'),
  );
  assert.match(
    waits,
    /\.thoughtknot-svg g\.thoughtknot-hot,\n\.thoughtknot-svg \.thoughtknot-cloud-unit:hover > \.thoughtknot-cloud-peek \{\n  transition-delay: var\(--gn-motion-fade\);/,
  );
});

// proves: calm_hover
test('where motion is welcome, things, links and previews fade in and out', () => {
  const calm = css.slice(
    css.indexOf('@media (prefers-reduced-motion: no-preference) {\n  .thoughtknot-svg :is(g.node'),
  );
  assert.match(calm, /filter var\(--gn-motion-fade\)/);
  assert.match(calm, /opacity var\(--gn-motion-fade\)/);
  assert.match(calm, /stroke-width var\(--gn-motion-fade\)/);
});

// proves: calm_hover
test('a link is 2 px at rest and the same line at 3.2 px when highlighted', () => {
  assert.match(rule('.thoughtknot-svg g.edge > :where(path:not([stroke-width]))'), /stroke-width: 2;/);
  assert.match(
    rule('.thoughtknot-svg g.edge.thoughtknot-hot > :where(path:not([stroke-width]))'),
    /stroke-width: 3\.2;/,
  );
});

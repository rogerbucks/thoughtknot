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
test('a highlight waits a moment while the pointer moves, with or without motion', () => {
  const waits = css.slice(
    0,
    css.indexOf('@media (prefers-reduced-motion: no-preference) {\n  .thoughtknot-svg :is(g.node'),
  );
  assert.match(
    waits,
    /\.thoughtknot-svg\.is-moving g\.thoughtknot-hot,\n\.thoughtknot-svg\.is-moving \.thoughtknot-cloud-unit:hover > \.thoughtknot-cloud-peek \{\n  transition-delay: var\(--gn-motion-fade\);/,
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
  assert.match(
    rule('.thoughtknot-svg g.edge > :where(path:not([stroke-width]))'),
    /stroke-width: max\(2px, var\(--thoughtknot-link-least, 0px\)\);/,
  );
  assert.match(
    rule('.thoughtknot-svg g.edge.thoughtknot-hot > :where(path:not([stroke-width]))'),
    /stroke-width: max\(3\.2px, calc\(var\(--thoughtknot-link-least, 0px\) \* 1\.6\)\);/,
  );
});

// proves: calm_hover
test('zoomed in, a link and a box edge keep their weight on the screen and do not swell with the drawing', async () => {
  assert.match(
    rule(
      '.thoughtknot-svg.thoughtknot-near :is(g.edge, g.node, g.cluster) > :is(path, polygon, ellipse, polyline, rect)',
    ),
    /vector-effect: non-scaling-stroke;/,
  );
  const { NEAR } = await import('../packages/core/src/display/graph-view/readable-names.ts');
  assert.equal(NEAR, 'thoughtknot-near', 'the class the drawing carries while shown bigger than drawn');
});

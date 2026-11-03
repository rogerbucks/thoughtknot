// Tapping a cloud, and going back (editor spec §68, level_click_back): level-taps.ts. The first tap picks a cloud, the
// second flies in until it fills the screen, and Back flies out to where you were.
import { test } from 'node:test';
import assert from 'node:assert/strict';

/** A card of 60 things drawn far out, its clouds drawn, with a zoom that records where it is sent. */
async function card() {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  const { make } = await import('../src/display/graph-view/note-callouts.ts');
  const { levelClouds } = await import('../src/display/graph-view/level-clouds-svg.ts');
  const { LevelTaps, PICKED } = await import('../src/display/graph-view/level-taps.ts');
  const svg = make('svg', { viewBox: '0 0 1200 800', width: 120 });
  const top = make('g', { class: 'graph' });
  svg.appendChild(top);
  const boxes = [],
    links = [];
  for (let i = 0; i < 60; i++) {
    const key = `t${i}`;
    const g = make('g', { class: 'node', 'data-key': key, id: `node${i}` });
    g.appendChild(make('rect', { x: (i % 20) * 60, y: Math.floor(i / 20) * 40, width: 40, height: 20 }));
    top.appendChild(g);
    boxes.push({ key, text: `Thing ${i}`, kinds: [] });
    const ring = Math.floor(i / 6) * 6;
    links.push({ from: key, to: `t${ring + ((i + 1) % 6)}`, type: 'USES' });
    if (i % 6 === 0 && i + 6 < 60) links.push({ from: key, to: `t${i + 6}`, type: 'USES' });
  }
  levelClouds(svg, { graph: 'g', boxes, links, estimates: [] });
  const sent = [];
  let place = { scale: 0.1, x: 0, y: 0 };
  const zoom = {
    view: () => ({ ...place, width: 1200 * place.scale, height: 800 * place.scale }),
    aim: (box, scale) => ({ scale, x: -box.x * 1200 * scale, y: -box.y * 800 * scale }),
    restore: (scale, x, y) => {
      place = { scale, x, y };
      sent.push(place);
    },
  };
  // a reduced-motion window, so a fly goes at once
  const viewport = {
    win: { document: { body: { classList: { contains: () => true } } }, matchMedia: () => ({ matches: true }) },
    addEventListener: () => {},
  };
  const n = (id) => Number(id.slice(4));
  const taps = {
    bounds: (id) => ({
      x: ((n(id) % 20) * 60) / 1200,
      y: (Math.floor(n(id) / 20) * 40) / 800,
      width: 40 / 1200,
      height: 20 / 800,
    }),
  };
  let changes = 0;
  const card = { registerDomEvent: (el, type, f) => el.addEventListener(type, f) };
  const level = new LevelTaps(card, {
    viewport,
    svg: () => svg,
    zoom: () => zoom,
    size: () => ({ width: 120, height: 80 }),
    taps,
    changed: () => changes++,
  });
  const units = top.children[0].children.filter((c) => c.classList.contains('thoughtknot-cloud-unit'));
  return { level, units, sent, PICKED, changes: () => changes, uninstall };
}

// proves: level_click_back
test('the first tap on a cloud picks it, the second flies in until it fills the screen, and Back flies out', async () => {
  const { level, units, sent, PICKED, changes, uninstall } = await card();
  try {
    const key = units[0].getAttribute('data-cloud');
    level.tapped(key);
    assert.ok(units[0].classList.contains(PICKED), 'picked: its outline dashes and it previews the level in it');
    assert.equal(sent.length, 0, 'the first tap moves nothing');
    assert.equal(level.canGoBack(), false);
    level.tapped(key);
    assert.equal(sent.length, 1, 'the second flies in');
    assert.ok(sent[0].scale > 0.1, 'nearer');
    assert.ok(level.canGoBack() && changes() === 1, 'Back shows');
    level.goBack();
    assert.deepEqual(sent.at(-1), { scale: 0.1, x: 0, y: 0 }, 'back where it was');
    assert.equal(level.canGoBack(), false);
  } finally {
    uninstall();
  }
});

// The side rail on a drawing's card (ES§15 and ES§53, type_rail). Roger chose it on 8 Nov 2026.
// - Every type in its groups, and every way to show the drawing, has a picture of its own.
// - A picture is a mask of plain lines and dots: no script, no link, nothing but its shapes.
// - A group with no type offered is left out. Each list keeps its types in one order, whatever is drawn now.
// - A pick closes the list and gives the focus back to the group's button, then draws the type.
// - The four ways say which one shows the drawing now.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDocument, installGlobals } from './host/fake-dom.js';

let uninstall, rail;
before(async () => {
  uninstall = installGlobals(fakeDocument());
  rail = await import('../../core/src/display/graph-view/type-rail.ts');
});
after(() => uninstall());

/** A type for the rail, drawn now when `now`, picked into `picked`. */
const typeOf = (key, picked, more = {}) => ({
  key,
  name: key[0].toUpperCase() + key.slice(1),
  now: false,
  fits: true,
  why: '',
  suggested: false,
  pick: () => picked.push(key),
  ...more,
});

describe('the pictures', () => {
  // proves: type_rail
  test('every type in its groups, every group and every way to show the drawing has one', () => {
    const named = new Set(rail.GLYPH_NAMES);
    const wanted = [...rail.RAIL_GROUPS.flatMap((g) => [g.group, ...g.types]), ...rail.SPACE_WAYS.map((w) => w.name)];
    assert.deepEqual(
      wanted.filter((n) => !named.has(n)),
      [],
    );
    assert.equal(new Set(rail.RAIL_GROUPS.flatMap((g) => g.types)).size, 22, 'the 22 types, each in one group');
  });

  // proves: type_rail
  test('each is plain lines and dots, with nothing that runs or reaches out', () => {
    for (const name of rail.GLYPH_NAMES) {
      const svg = rail.glyphSvg(name);
      assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 24 24"/);
      assert.doesNotMatch(svg, /script|href|on[a-z]+=|url\(/i, name);
      const tags = [...svg.matchAll(/<([a-z]+)/g)].map((m) => m[1]);
      assert.ok(
        tags.every((t) => ['svg', 'path', 'circle'].includes(t)),
        `${name}: ${tags.join(', ')}`,
      );
    }
  });
});

describe('the groups', () => {
  // proves: type_rail, type_one_grid
  test('a group with no type offered is left out, and each list keeps its own order', () => {
    const el = document.createElement('div');
    const picked = [];
    const types = ['table', 'network', 'radial', 'matrix'].map((k) => typeOf(k, picked, { now: k === 'radial' }));
    const { groups, buttons } = rail.railTypes(el, types);
    assert.deepEqual([...groups.keys()], ['links', 'data'], 'no Areas: none of its types is offered');
    assert.deepEqual([...buttons.keys()], ['network', 'radial', 'matrix', 'table'], 'in the groups’ order');
    assert.equal(groups.get('links').getAttribute('aria-label'), 'Links: Radial drawn now');
    assert.ok(groups.get('links').hasClass('is-now'));
    assert.equal(groups.get('data').getAttribute('aria-label'), 'Data');
  });

  // proves: type_rail
  test('a pick closes the list, gives the focus back to its button, and draws the type', () => {
    const el = document.body.createDiv(); // on the page, so it can take the focus
    const picked = [];
    const { groups, buttons } = rail.railTypes(el, [typeOf('network', picked), typeOf('force', picked)]);
    const links = groups.get('links');
    links.click();
    assert.equal(links.getAttribute('aria-expanded'), 'true');
    buttons.get('force').click();
    assert.equal(links.getAttribute('aria-expanded'), 'false');
    assert.ok(document.activeElement === links, 'the focus back on its button');
    assert.deepEqual(picked, ['force']);
  });

  // proves: type_only_when_fits
  test('a type that does not fit cannot be picked, and says why on hover too', () => {
    const el = document.createElement('div');
    const why = 'no relationship makes a tree';
    const { buttons } = rail.railTypes(el, [typeOf('tree', [], { fits: false, why })]);
    assert.equal(buttons.get('tree').disabled, true);
    assert.equal(buttons.get('tree').parentElement.getAttribute('title'), why);
  });
});

describe('the four ways', () => {
  // proves: type_rail, space_one_bar
  test('are each in sight, flat pressed at first, and say the one shown as it changes', () => {
    const el = document.createElement('div');
    const asked = [];
    const { ways } = rail.renderRail(el, (m) => asked.push(m));
    const pressed = () => ways.querySelectorAll('[data-space]').map((b) => b.getAttribute('aria-pressed'));
    assert.deepEqual(pressed(), ['true', 'false', 'false', 'false']);
    ways.querySelectorAll('[data-space]')[3].click();
    assert.deepEqual(asked, ['globe']);
    rail.sayWay(ways, 'globe');
    assert.deepEqual(pressed(), ['false', 'false', 'false', 'true']);
  });

  // proves: type_rail
  test('a table has no depth, so its rail has no ways', () => {
    const el = document.createElement('div');
    assert.equal(rail.renderRail(el, null).ways, null);
  });
});

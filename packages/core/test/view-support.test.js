// Which View menu options each view takes (editor spec §68, view_options_everywhere): view-support.ts. Roger, 2 Nov
// 2026: options must work the same in every view. Every view has an answer for every option: it works, or the menu
// says why not. The gaps still to be built are listed here. Each PR that builds one takes it off; none is ever added.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  NOT_HERE,
  SUPPORTED_VIEWS,
  VIEW_OPTIONS,
  lensIn,
  notHereSaid,
  viewOf,
  viewSupport,
} from '../src/view-support.ts';
import { VIEW_TYPES } from '../src/view-types/view-types.ts';
import { word } from '../src/words.ts';

/** The options each view could take but does not yet: the list only shrinks (view-options design, 2 Nov 2026). */
const FOLDS = ['detail', 'hubs', 'groups', 'merge', 'groupBy', 'semantic'];
const KNOWN_GAPS = {
  tree: ['direction', 'lanes', 'layout'],
  flow: ['direction', 'lanes', 'layout'],
  radial: ['lanes', 'layout'],
  lanes: ['direction', 'lanes', 'layout'],
  timeline: ['lanes', 'layout'],
  force: [...FOLDS, 'layout'],
  ...Object.fromEntries(['chord', 'ego', 'block', 'centroid', 'containment', 'arc', 'hive'].map((v) => [v, FOLDS])),
  ...Object.fromEntries(
    ['matrix', 'treemap', 'density', 'grid', 'plan', 'map'].map((v) => [
      v,
      ['detail', 'groups', 'groupBy', 'semantic'],
    ]),
  ),
};

describe('which view takes which option', () => {
  // proves: view_options_everywhere
  test('covers every diagram type with a View menu and every view drawn as marks', () => {
    assert.deepEqual(SUPPORTED_VIEWS, ['network', 'tree', 'flow', 'radial', 'lanes', 'timeline', ...VIEW_TYPES]);
    assert.equal(SUPPORTED_VIEWS.length, 20, 'all 21 views but the table, which has no View menu');
  });

  // proves: view_options_everywhere
  test('answers every view and option: works, or a reason the menu can say', () => {
    for (const v of SUPPORTED_VIEWS)
      for (const o of VIEW_OPTIONS) {
        const s = viewSupport(v, o);
        assert.ok(s === 'yes' || NOT_HERE.includes(s), `${v} × ${o}: ${s}`);
        if (s !== 'yes') assert.doesNotMatch(word(notHereSaid(s)), /^view\./, `${v} × ${o} says why in words`);
      }
  });

  // proves: view_options_everywhere
  test('lists each gap still to be built, and nothing else is a gap', () => {
    const gaps = {};
    for (const v of SUPPORTED_VIEWS)
      for (const o of VIEW_OPTIONS) if (viewSupport(v, o) === 'yet') (gaps[v] ??= []).push(o);
    for (const v of Object.keys(gaps)) gaps[v].sort();
    const known = Object.fromEntries(Object.entries(KNOWN_GAPS).map(([v, os]) => [v, [...os].sort()]));
    assert.deepEqual(gaps, known);
  });

  // proves: view_options_everywhere
  test('takes every option in a plain network', () => {
    for (const o of VIEW_OPTIONS) assert.equal(viewSupport('network', o), 'yes', o);
  });

  // proves: view_options_everywhere
  test('says why an option cannot apply, rather than calling it a gap', () => {
    assert.equal(viewSupport('matrix', 'lens'), 'cells', 'a lens would bend rows and cells out of line');
    assert.equal(viewSupport('density', 'lens'), 'cells');
    assert.equal(viewSupport('treemap', 'merge'), 'no-links');
    assert.equal(viewSupport('grid', 'labels'), 'no-links');
    assert.equal(viewSupport('chord', 'direction'), 'own-shape');
    assert.equal(viewSupport('radial', 'direction'), 'fixed-way');
    assert.equal(viewSupport('timeline', 'direction'), 'fixed-way');
  });

  // proves: view_options_everywhere
  test('takes the fisheye and the other lenses in every view that draws things apart', () => {
    for (const v of ['network', 'tree', 'flow', 'radial', 'lanes', 'timeline', 'force', 'chord', 'arc', 'treemap'])
      assert.equal(viewSupport(v, 'lens'), 'yes', v);
    assert.equal(viewSupport('arc', 'labels'), 'yes', 'its link labels hide when small, as a network’s');
  });
});

describe('the view a card draws', () => {
  // proves: view_options_everywhere
  test('is the view type its picture is, else its diagram type, else a network', () => {
    assert.equal(viewOf('network', 'thoughtknot.diagrams.matrix'), 'matrix');
    assert.equal(viewOf('tree'), 'tree');
    assert.equal(viewOf(undefined), 'network');
    assert.equal(
      viewOf('network', 'acme.shapes.circle'),
      'network',
      'a plug-in’s type from outside is not one of ours',
    );
  });

  // proves: view_options_everywhere
  test('takes a lens only where the view can', () => {
    assert.equal(lensIn('network', 'fisheye'), 'fisheye');
    assert.equal(lensIn('matrix', 'fisheye'), 'none');
    assert.equal(lensIn('force', 'semantic'), 'none', 'semantic zoom is still to be built in views drawn as marks');
    assert.equal(lensIn('tree', 'semantic'), 'semantic');
    assert.equal(lensIn('matrix', 'none'), 'none');
  });
});

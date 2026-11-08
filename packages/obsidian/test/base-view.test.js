// The Graph view of Obsidian Bases (Bases graph decisions B1-B5, decided by Roger, 8 Nov 2026). A .base file picks
// notes; the view draws them as a graph by the same card as a graph block. Places are kept in the .base file (R16).
// proves: bases_graph_view
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { openBaseView } from './host/fake-bases.js';

before(() => build());

const FILES = {
  'Trip/Plan.md': '# Plan\n\nSee [[Budget]] and [[Map]].',
  'Trip/Budget.md': '# Budget\n\nFor the [[Plan]].',
  'Trip/Packing.md': '# Packing',
  'Elsewhere/Map.md': '# Map',
};
const PICKED = ['Trip/Plan.md', 'Trip/Budget.md', 'Trip/Packing.md'];
const drawnIn = (el) => el.querySelector('svg.thoughtknot-svg');
const boxCount = (el) => drawnIn(el).querySelectorAll('[data-key]').length;

describe('the Graph view of Bases', () => {
  test('it is added to Bases as a view type named Graph, with its two options', async () => {
    const env = await load({ files: FILES });
    try {
      const r = env.state.basesViews.get('thoughtknot-graph');
      assert.ok(r, 'registered');
      assert.equal(r.name, 'Graph');
      const options = r.options({});
      assert.deepEqual(
        options.map((o) => o.type),
        ['property', 'toggle'],
      );
      assert.equal(options[1].default, false, 'linked notes outside the view are hidden by default (B5)');
    } finally {
      env.uninstall();
    }
  });

  test('the notes the base picks are drawn as a graph, and drawn again when it picks others', async () => {
    const env = await load({ files: FILES });
    try {
      const { el, pick, view } = openBaseView(env, 'thoughtknot-graph', PICKED);
      await until(() => drawnIn(el));
      assert.equal(view.card.o.reading.graphs.get('base').boxes.length, 3);
      assert.equal(view.card.o.reading.graphs.get('base').links.length, 2, 'Plan to Budget and back; Map is outside');
      pick(['Trip/Plan.md']);
      await until(() => view.card?.o.reading.graphs.get('base').boxes.length === 1);
      assert.ok(boxCount(el) >= 1);
    } finally {
      env.uninstall();
    }
  });

  test('a base that picks no notes says so, never a blank view', async () => {
    const env = await load({ files: FILES });
    try {
      const { el } = openBaseView(env, 'thoughtknot-graph', []);
      await until(() => el.querySelector('.thoughtknot-empty'));
      assert.match(el.textContent, /No notes match this view/);
    } finally {
      env.uninstall();
    }
  });

  test('with its toggle on, a linked note outside the view is drawn as well (B5)', async () => {
    const env = await load({ files: FILES });
    try {
      const { el, view } = openBaseView(env, 'thoughtknot-graph', PICKED, { thoughtknotOutside: true });
      await until(() => drawnIn(el));
      const boxes = view.card.o.reading.graphs.get('base').boxes;
      assert.equal(boxes.length, 4);
      assert.ok(boxes.some((b) => b.kind === 'Outside' && b.text === 'Map'));
    } finally {
      env.uninstall();
    }
  });

  test('a box moved is kept in the .base file under the view, no note is written, and it stays when redrawn (R16)', async () => {
    const env = await load({ files: FILES });
    try {
      const before = new Map(env.state.files);
      const { el, view, config, pick } = openBaseView(env, 'thoughtknot-graph', PICKED);
      await until(() => drawnIn(el));
      const [one, other] = view.card.o.reading.graphs.get('base').boxes.map((b) => b.key);
      view.card.o.moving.move({ word: 'beside', thing: one, other }, 'Moved.');
      await until(() => typeof config.values.thoughtknotStyle === 'string');
      assert.match(config.values.thoughtknotStyle, /:Nudge \{word: 'beside'/);
      assert.deepEqual([...env.state.files], [...before], 'no note changed');
      assert.ok(env.state.notices.includes('Moved.'));
      await until(() => view.card?.o.moving.written.length === 1);
      const moved = view.card;
      pick([...PICKED].reverse());
      await until(() => view.card && view.card !== moved);
      assert.equal(view.card.o.moving.written.length, 1, 'the place is kept when the notes come again');
    } finally {
      env.uninstall();
    }
  });
});

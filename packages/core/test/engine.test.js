// Starting the layout engine (ES§1, ES§3, layout_own_engine). It is our own, in plain code. It starts with no network
// and no WebAssembly.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from '../src/engine.ts';

describe('drawing', () => {
  // proves: layout_own_engine
  test('the engine starts offline and names itself: it is our own, not Graphviz', async () => {
    const engine = await loadEngine();
    assert.equal(engine.version, 'thoughtknot');
    assert.match(engine.render('digraph G {\n  "a" [label="A"];\n}'), /<svg/);
  });
});

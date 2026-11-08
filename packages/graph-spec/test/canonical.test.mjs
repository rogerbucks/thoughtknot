// A graph's one canonical form and how it is hashed (editor spec §51, spec_canonical_form;
// requirements/graph-spec-canonical.md). The same graph written two ways gives one hash. Different graphs give different
// ones. The hash is also made here a second way, straight from the page's steps, so the page is held to the code.
// The cases are shared with the Python reader (python/graph_spec/tests/test_canonical.py).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const C = createRequire(import.meta.url)('../src/graph-spec-check.js');
const CASES = JSON.parse(readFileSync(new URL('./canonical-cases.json', import.meta.url), 'utf8'));
const PAGE = readFileSync(new URL('../../../requirements/graph-spec-canonical.md', import.meta.url), 'utf8');

const world = (block) => C.worldFromStore(C.read([block])).g;
const hashOf = (block) => C.canon(world(block));

// RFC 8785 for what these graphs hold: keys sorted, no spaces
const json = (v) =>
  Array.isArray(v)
    ? `[${v.map(json).join(',')}]`
    : v && typeof v === 'object'
      ? `{${Object.keys(v)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${json(v[k])}`)
          .join(',')}}`
      : JSON.stringify(v);
const present = (p) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== null && v !== undefined));

/** The hash made from the page's steps 1 to 6, for a graph holding no times. */
function fromThePage(g) {
  const id = (key) => g.nodes.get(key)[1].id;
  const things = [...g.nodes.values()]
    .map(([labels, props]) => [[...labels].sort(), present(props)])
    .sort((a, b) => (a[1].id < b[1].id ? -1 : 1));
  const links = g.edges
    .map(([from, type, to, props]) => [id(from), type, id(to), present(props)])
    .sort((a, b) => (json(a) < json(b) ? -1 : 1));
  return createHash('sha256')
    .update(json([...things, ...links]))
    .digest('hex');
}

describe('spec_canonical_form', () => {
  for (const group of CASES.same)
    test(`${group.name} makes no difference to the hash`, () => {
      for (const block of group.blocks) assert.equal(hashOf(block), group.hash, block);
    });

  for (const pair of CASES.different)
    test(`${pair.name} gives a different hash`, () => {
      assert.notEqual(hashOf(pair.blocks[0]), hashOf(pair.blocks[1]));
    });

  test('the page’s steps give the library’s hash for every graph without a time', () => {
    let checked = 0;
    for (const group of CASES.same)
      for (const block of group.blocks) {
        if (/DATE/.test(block)) continue;
        assert.equal(fromThePage(world(block)), hashOf(block), block);
        checked++;
      }
    assert.ok(checked >= 14, `${checked} checked`);
  });

  test('the page names the steps and the hash, and the hash is named where it is stored', () => {
    for (const words of ['## The canonical form', '## The hash', 'RFC 8785', 'SHA-256', 'sha-256:'])
      assert.ok(PAGE.includes(words), words);
  });
});

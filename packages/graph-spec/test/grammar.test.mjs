// The notation's grammar, in a form a program can read (editor spec §51, spec_grammar). requirements/graph-spec-grammar.json
// holds the graph line, the containers and the value types. The cases in grammar-cases.json are made from it with a
// fixed seed. The JavaScript reader reads each to the answer recorded there, and refuses each text outside the grammar
// with its code. The Python reader does the same (python/graph_spec/tests/test_grammar.py). To make the cases again
// after the grammar changes: GRAMMAR_CASES=update npm run test:ai -- packages/graph-spec/test/grammar.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const C = createRequire(import.meta.url)('../src/graph-spec-check.js');
const GRAMMAR = JSON.parse(
  readFileSync(new URL('../../../requirements/graph-spec-grammar.json', import.meta.url), 'utf8'),
);
const CASES_URL = new URL('./grammar-cases.json', import.meta.url);
const SEED = 20261105;
const COUNT = 40;
const DEPTH = 6;

// mulberry32: a small seeded generator, so the same grammar always makes the same texts
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One text from the grammar. Past DEPTH each rule takes its first choice, the shortest, so every text ends. */
export function make(grammar, random, part = grammar.start, depth = 0) {
  if (part in grammar.pools) return grammar.pools[part][Math.floor(random() * grammar.pools[part].length)];
  const choices = grammar.rules[part];
  if (!choices) return part;
  const choice = depth >= DEPTH ? choices[0] : choices[Math.floor(random() * choices.length)];
  return choice.map((p) => make(grammar, random, p, depth + 1)).join('');
}

/** The texts the cases file holds: COUNT from the grammar, then each container's text. */
export function texts(grammar = GRAMMAR) {
  const random = rng(SEED);
  return [
    ...Array.from({ length: COUNT }, () => make(grammar, random)),
    ...grammar.containers.map((c) => c.text),
    ...grammar.outside.map((o) => o.text),
  ];
}

/** This reader's answer to a block: the code and line of its refusal, or each graph's canonical form. */
export function reads(block) {
  try {
    const store = C.read([block]);
    const world = C.worldFromStore(store);
    const graphs = {};
    for (const g of Object.keys(store.graphs).sort()) graphs[g] = C.canon(world[g]);
    return { graphs };
  } catch (e) {
    if (e instanceof C.ProfileError) return { refused: [e.code ?? null, e.line] };
    throw e;
  }
}

const made = () => ({
  about:
    "Made from requirements/graph-spec-grammar.json by packages/graph-spec/test/grammar.test.mjs, with a fixed seed. Each text with the JavaScript reader's answer. python/graph_spec/tests/test_grammar.py holds the Python reader to the same answers. Do not edit by hand.",
  seed: SEED,
  cases: texts().map((text) => ({ text, answer: reads(text) })),
});

if (process.env.GRAMMAR_CASES === 'update') writeFileSync(CASES_URL, `${JSON.stringify(made(), null, 2)}\n`);
const CASES = JSON.parse(readFileSync(CASES_URL, 'utf8'));

describe('spec_grammar', () => {
  test('the grammar covers the graph line, the containers and the value types', () => {
    assert.ok(GRAMMAR.graph_line.form && GRAMMAR.graph_line.name, 'the graph line');
    assert.deepEqual(
      GRAMMAR.containers.map((c) => c.kind),
      ['data', 'query', 'excerpt'],
    );
    assert.deepEqual(
      GRAMMAR.values.map((v) => v.type),
      ['text', 'integer', 'decimal', 'boolean', 'date', 'datetime'],
    );
    for (const rule of ['graph_line', 'node', 'edge', 'value']) assert.ok(GRAMMAR.rules[rule], `the rule ${rule}`);
  });

  test('the cases in the file are the ones the grammar makes now', () => {
    assert.deepEqual(
      CASES.cases.map((c) => c.text),
      texts(),
      'make them again: GRAMMAR_CASES=update npm run test:ai -- packages/graph-spec/test/grammar.test.mjs',
    );
  });

  test('the JavaScript reader gives each case its recorded answer, and some are read and some refused', () => {
    for (const c of CASES.cases) assert.deepEqual(reads(c.text), c.answer, c.text);
    assert.ok(
      CASES.cases.some((c) => c.answer.graphs),
      'the control: some are read',
    );
    assert.ok(
      CASES.cases.some((c) => c.answer.refused),
      'and some refused',
    );
  });

  test('every value type in the grammar is read as that type', () => {
    for (const v of GRAMMAR.values) {
      const answer = reads(`// graph: g\n(a:T {id: 'a', v: ${v.example}})`);
      assert.ok(answer.graphs, `${v.type}: ${JSON.stringify(answer)}`);
    }
  });

  test('each container is read or refused as the grammar says', () => {
    for (const c of GRAMMAR.containers) {
      const answer = reads(c.text);
      if (c.answer === 'read') assert.ok(answer.graphs, c.kind);
      else assert.equal(answer.refused?.[0], c.answer, c.kind);
    }
  });

  test('text outside the grammar is refused with its code', () => {
    for (const o of GRAMMAR.outside) assert.equal(reads(o.text).refused?.[0], o.code, o.name);
  });
});

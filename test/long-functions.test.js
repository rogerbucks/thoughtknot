// No new function over 100 lines in the code that ships, and none on the list grows (spec §13, no_monolith_files:
// CODE-9). Those already long are held, each to its lines, by test/long-functions.json, an allowance that only goes
// down. Proved on the repository's own code and on functions planted for the purpose.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWANCE,
  compareAllowance,
  longFunctions,
  repositoryFunctions,
  tightened,
} from '../scripts/long-functions.mjs';
import { readJSON } from './repository/repo.js';

/** A function of `n` lines in all, from its first line to its closing brace. */
const body = (n) => Array.from({ length: n - 2 }, (_, i) => `  const v${i} = ${i};`).join('\n');
const fn = (head, n) => `${head} {\n${body(n)}\n}`;

/** The names and lines of the long functions in one planted file, with a limit of 10 lines. */
const longIn = (text, file = 'packages/x/src/a.ts') =>
  longFunctions({ [file]: text }, 10).map((f) => `${f.name.slice(file.length + 1)} ${f.lines}`);

describe('the repository', () => {
  test('has no long function beyond its allowance, and the allowance is as low as the code now needs', () => {
    const found = repositoryFunctions();
    assert.ok(
      found.some((f) => f.name === 'packages/core/src/display/properties/properties.ts#renderProperties'),
      'the control: the shipped code is read',
    );
    assert.deepEqual(compareAllowance(found, readJSON(ALLOWANCE)), []);
  });
});

describe('a long function is found and named', () => {
  test('a function declaration over the limit is found with its lines; one at the limit is not', () => {
    assert.deepEqual(longIn(`${fn('function big()', 11)}\n${fn('function edge()', 10)}`), ['big 11']);
  });

  test('an arrow bound to a name, a method and a class are named by the path down to the function', () => {
    const text = [fn('const drawn = () =>', 12), `class View {\n${fn('  draw()', 12)}\n}`].join('\n');
    assert.deepEqual(longIn(text), ['drawn 12', 'View.draw 12']);
  });

  test('a nameless function is named by what holds it and its place there, and one inside a long one too', () => {
    const inner = fn('  run(() =>', 11).replace(/}$/, '});');
    const text = `function outer() {\n  run(() => 1);\n${inner}\n${body(5)}\n}\n${fn('wire(function ()', 11)})`;
    assert.deepEqual(longIn(text), ['1 11', 'outer 17', 'outer>2 11']);
  });
});

describe('a module wrapper', () => {
  test('a function that wraps a whole module is read as the file, and what it holds as at the top', () => {
    const wrapped = (inner) => `(function (root) {\n${inner}\n${body(5)}\n})(this);`;
    assert.deepEqual(longIn(wrapped(fn('  function big()', 11))), ['big 11']);
    assert.deepEqual(
      longIn(`(${wrapped(fn('  function big()', 11)).slice(0, -1)});`),
      ['big 11'],
      'in parentheses too',
    );
    assert.deepEqual(longIn(`wire(${fn('function ()', 11)});`), ['1 11'], 'one handed in is no wrapper');
    assert.deepEqual(
      longIn(`function outer() {\n${wrapped(fn('  function big()', 11))}\n}`).sort(),
      ['outer 18', 'outer>1 16', 'outer>1.big 11'],
      'nor one inside a function',
    );
  });
});

describe('the allowance, a ratchet', () => {
  const found = [
    { name: 'a.ts#big', lines: 150 },
    { name: 'a.ts#new', lines: 101 },
  ];

  test('a new long function, and one grown past its allowance, are over; one shrunk or gone is under', () => {
    const differ = compareAllowance(found, { 'a.ts#big': 140, 'a.ts#gone': 120 });
    assert.deepEqual(
      differ.map((d) => `${d.name} ${d.over ? 'over' : 'under'}`),
      ['a.ts#big over', 'a.ts#gone under', 'a.ts#new over'],
    );
  });

  test('tightening lowers an allowance and drops one gone, but never raises one or adds a new function', () => {
    assert.deepEqual(tightened(found, { 'a.ts#big': 160, 'a.ts#gone': 120 }), { 'a.ts#big': 150 });
    assert.deepEqual(tightened(found, { 'a.ts#big': 140 }), { 'a.ts#big': 140 });
  });
});

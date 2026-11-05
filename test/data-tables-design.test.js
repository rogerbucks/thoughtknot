// The design note on data tables and cubes (editor spec §52, data_tables_design): wiki/Data-tables-design.md. It must
// be in the wiki and compare the ways to refer to, cache and link a data set. It keeps a place for the way Roger picks.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read } from './repository/repo.js';

const NOTE = 'wiki/Data-tables-design.md';

/** The text of the note's section under `heading`, up to the next heading of the same level or higher. */
function section(text, heading) {
  const start = text.indexOf(`\n${heading}\n`);
  assert.ok(start >= 0, `${NOTE} has a section "${heading}"`);
  const level = heading.match(/^#+/)[0].length;
  const rest = text.slice(start + heading.length + 2);
  const next = rest.search(new RegExp(`^#{1,${level}} `, 'm'));
  return next < 0 ? rest : rest.slice(0, next);
}

test('the note is in the wiki and linked from the architecture page', () => {
  assert.match(read(NOTE), /^# Data tables design\n/);
  assert.match(read('wiki/Architecture.md'), /\(Data-tables-design\)/);
});

test('the note compares the ways A to E, each saying how it links, caches and fits the rules', () => {
  const ways = section(read(NOTE), '## The ways compared');
  for (const way of ['A', 'B', 'C', 'D', 'E']) assert.match(ways, new RegExp(`^\\| \\**${way}\\. `, 'm'), way);
  assert.match(ways, /Linked or kept/);
  assert.match(ways, /Cache/);
  assert.match(ways, /\*\*Recommended: /);
});

test('the note says how a data set is linked, kept as a snapshot and cached', () => {
  const kept = section(read(NOTE), '## Linked, kept and cached');
  for (const word of ['Linked', 'Snapshot', 'cache', 'Offline']) assert.match(kept, new RegExp(word), word);
});

test('the note shows how to point at a row, a column and a cell', () => {
  const note = read(NOTE);
  for (const pointer of ['#row=12', '#col=amount', '#row=12&col=amount'])
    assert.ok(note.includes(pointer), pointer);
});

test('the note has a decision section for the way Roger picks', () => {
  assert.ok(section(read(NOTE), '## Decision').trim().length > 0);
});

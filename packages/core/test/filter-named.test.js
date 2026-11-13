// A filter saved by name (editor spec ES§25): filter-named.ts, style-edit.ts and style-checks.ts.
// Requirement: untangle_filter_saved.
// - Saved, it is one NamedFilter line in the style block; saved again by the same name it is changed in place.
// - Read back, it is the same kind and tests the builder held, so picking it fills the rows as they were.
// - Tests the builder cannot read, or a kind the graph lacks, are a problem with a fix, and it is left out.
// - Deleted, its line goes with its comma, and nothing else in the note changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gqlBlocks, gqlSpans, styleOf } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { namedFilterRefusal, namedFilterRemoved, namedFiltersOf } from '../src/filter-named.ts';
import { readStyle } from '../src/style.ts';
import { styleEdit } from '../src/style-edit.ts';

const DATA = `// graph: work
(roof:Task {status: 'late', owner: 'Sam'}), (walls:Task {status: 'done', owner: 'Ana'}), (r1:Risk {owner: 'Sam'})`;
const NOTE = ['# Work', '', '```gql', DATA, '```', ''].join('\n');
const LATE_SAM = {
  on: 'things',
  of: 'Task',
  tests: [
    { field: 'status', op: 'is', value: 'late' },
    { field: 'owner', op: 'is', value: 'Sam' },
  ],
};
const texts = (note) => gqlBlocks(note).map((b) => b.text);
const data = (note) =>
  gqlSpans(note)
    .filter((s) => styleOf(s.text) === null)
    .map((s) => s.text);
const read = (note) => {
  const { style, problems } = readStyle(texts(note), 'work', readNote(texts(note)));
  return { named: namedFiltersOf(style.named), problems: problems.map((p) => [p.message, p.fix]) };
};
const saved = (note, named) => {
  const r = styleEdit(note, 'work', { named });
  assert.ok('note' in r, r.refused);
  return r.note;
};

test('a filter is saved as one NamedFilter line, and read back it is the filter the builder held', () => {
  const note = saved(NOTE, { name: 'Late of Sam', draft: LATE_SAM });
  assert.deepEqual(data(note), data(NOTE), 'the data is never touched');
  assert.ok(
    gqlBlocks(note)
      .at(-1)
      .text.includes(
        `(named_1:NamedFilter {name: 'Late of Sam', kind: 'Task', when: 'status == "late" and owner == "Sam"'})`,
      ),
  );
  const back = read(note);
  assert.deepEqual(back.problems, []);
  assert.deepEqual(back.named, [{ name: 'Late of Sam', draft: LATE_SAM }]);
});

test('saved again by the same name it is changed in place; another name is a second line', () => {
  const late = { on: 'things', of: '', tests: [{ field: 'status', op: 'is', value: 'late' }] };
  let note = saved(NOTE, { name: 'Late of Sam', draft: LATE_SAM });
  note = saved(note, { name: 'Late of Sam', draft: late });
  note = saved(note, {
    name: 'Sam',
    draft: { on: 'things', of: '', tests: [{ field: 'owner', op: 'is', value: 'Sam' }] },
  });
  const { named } = read(note);
  assert.deepEqual(
    named.map((f) => [f.name, f.draft.of, f.draft.tests.length]),
    [
      ['Late of Sam', '', 1],
      ['Sam', '', 1],
    ],
  );
});

test('a filter with no name or no test filled in is refused, and nothing is written', () => {
  assert.ok(namedFilterRefusal({ name: '  ', draft: LATE_SAM }));
  const empty = { on: 'things', of: 'Task', tests: [{ field: '', op: 'is', value: '' }] };
  const r = styleEdit(NOTE, 'work', { named: { name: 'Nothing', draft: empty } });
  assert.ok('refused' in r && r.refused.includes('Nothing'));
});

test('tests the builder cannot read, or a kind the graph lacks, are a problem with a fix, and the filter is left out', () => {
  const style = (line) => `${NOTE}\n\`\`\`gql\n// graph: work_style · STYLE work\n${line}\n\`\`\`\n`;
  const odd = read(style(`(n:NamedFilter {name: 'Odd', when: 'status == "late" or owner == "Sam"'})`));
  assert.deepEqual(odd.named, []);
  assert.ok(odd.problems.some(([m, fix]) => m.includes('Odd') && fix.includes('when')));
  const kind = read(style(`(n:NamedFilter {name: 'Risky', kind: 'Rsik', when: 'owner == "Sam"'})`));
  assert.deepEqual(kind.named, []);
  assert.ok(kind.problems.some(([m, fix]) => m.includes('Rsik') && fix.includes('kind')));
});

test('deleted, its line goes with its comma, and the other filter and the data stay', () => {
  let note = saved(NOTE, { name: 'Late of Sam', draft: LATE_SAM });
  note = saved(note, {
    name: 'Sam',
    draft: { on: 'things', of: '', tests: [{ field: 'owner', op: 'is', value: 'Sam' }] },
  });
  const r = namedFilterRemoved(note, 'work', 'Late of Sam');
  assert.ok('note' in r, r.refused);
  assert.deepEqual(data(r.note), data(NOTE));
  assert.deepEqual(
    read(r.note).named.map((f) => f.name),
    ['Sam'],
  );
  assert.deepEqual(read(r.note).problems, []);
  const none = namedFilterRemoved(r.note, 'work', 'Late of Sam');
  assert.ok('refused' in none && none.refused.includes('Late of Sam'));
});

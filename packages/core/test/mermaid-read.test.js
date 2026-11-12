// A Mermaid block read as things, links and groups (editor spec §67 format_graph_from_data, format_untrusted_files).
// Requirement: format_graph_from_data. Flowchart and mindmap. Each thing is cited by its line. A block over the limits
// is refused with its reason. What is not read is named, never dropped without a word.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MERMAID_LIMITS, readMermaid } from '../src/mermaid-read.ts';

const flow = (text) => {
  const r = readMermaid(text);
  assert.ok(!('why' in r), 'a flowchart is read');
  return r;
};

test('reads boxes, labels and arrows with the line each is written on', () => {
  const r = flow('flowchart LR\n  a["Ada"] -->|wrote| n[Notes]\n  n --> c(Cat)\n');
  assert.equal(r.kind, 'flowchart');
  assert.deepEqual(
    r.things.map((t) => [t.id, t.label, t.line]),
    [
      ['a', 'Ada', 2],
      ['n', 'Notes', 2],
      ['c', 'Cat', 3],
    ],
  );
  assert.deepEqual(
    r.links.map((l) => [l.from, l.to, l.label, l.line]),
    [
      ['a', 'n', 'wrote', 2],
      ['n', 'c', '', 3],
    ],
  );
});

test('reads a chain, the other arrow shapes and a label written in the arrow', () => {
  const r = flow('graph TD\n  a --> b ---> c\n  c -- reads --> d\n  d -.-> e\n  e ==> a\n');
  assert.deepEqual(
    r.links.map((l) => [l.from, l.to, l.label]),
    [
      ['a', 'b', ''],
      ['b', 'c', ''],
      ['c', 'd', 'reads'],
      ['d', 'e', ''],
      ['e', 'a', ''],
    ],
  );
});

test('a subgraph is a group, and a thing belongs to the group it is first written in', () => {
  const r = flow(
    'flowchart LR\n  subgraph g1["Team"]\n    a\n    subgraph g2[Inner]\n      b\n    end\n  end\n  c\n  c --> a\n',
  );
  assert.deepEqual(
    r.groups.map((g) => [g.id, g.label, g.parent, g.line]),
    [
      ['g1', 'Team', null, 2],
      ['g2', 'Inner', 'g1', 4],
    ],
  );
  assert.deepEqual(
    r.things.map((t) => [t.id, t.group]),
    [
      ['a', 'g1'],
      ['b', 'g2'],
      ['c', null],
    ],
  );
});

test('the writer text of the relationships view reads back: id and name on two lines of one label', () => {
  const r = flow('flowchart LR\n    n0["ada<br/>Ada"]\n    n1["notes"]\n    n0 -->|wrote| n1');
  assert.deepEqual(
    r.things.map((t) => t.label),
    ['ada\nAda', 'notes'],
  );
});

test('comments are skipped, style lines are named as ignored, and markup in a label is not kept', () => {
  const r = flow(
    'flowchart LR\n%% a note\n  a["<b>Bold</b> text"]\n  style a fill:#f00\n  classDef x fill:#fff\n  a & b --> c\n',
  );
  assert.equal(r.things[0].label, 'Bold text');
  assert.deepEqual(
    r.problems.map((p) => [p.line, p.why]),
    [
      [4, 'ignored'],
      [5, 'ignored'],
      [6, 'unsupported'],
    ],
  );
});

test('reads a mindmap as a tree by its indents, the root first', () => {
  const r = readMermaid('mindmap\n  root((Plan))\n    Goals\n      Speed\n    Risks\n');
  assert.ok(!('why' in r));
  assert.equal(r.kind, 'mindmap');
  assert.deepEqual(
    r.things.map((t) => [t.id, t.label, t.line]),
    [
      ['m2', 'Plan', 2],
      ['m3', 'Goals', 3],
      ['m4', 'Speed', 4],
      ['m5', 'Risks', 5],
    ],
  );
  assert.deepEqual(
    r.links.map((l) => [l.from, l.to]),
    [
      ['m2', 'm3'],
      ['m3', 'm4'],
      ['m2', 'm5'],
    ],
  );
});

test('refuses a block over the limits, a type it does not read, and text holding a NUL, with the reason', () => {
  assert.deepEqual(readMermaid('flowchart LR\n' + 'a-->b\n'.repeat(MERMAID_LIMITS.bytes)), { why: 'too-large' });
  assert.deepEqual(readMermaid('flowchart LR\n' + 'a\n'.repeat(MERMAID_LIMITS.lines + 1)), { why: 'too-many-lines' });
  assert.deepEqual(readMermaid('sequenceDiagram\n  A->>B: hi'), { why: 'unknown-type' });
  assert.deepEqual(readMermaid('flowchart LR\n a\u0000'), { why: 'not-text' });
  assert.deepEqual(readMermaid(''), { why: 'unknown-type' });
});

test('a line it cannot read is named with its line and the rest still reads', () => {
  const r = flow('flowchart LR\n  a --> b\n  ??? nonsense\n  b --> c\n');
  assert.deepEqual(
    r.problems.map((p) => [p.line, p.why]),
    [[3, 'unreadable']],
  );
  assert.equal(r.links.length, 2);
});

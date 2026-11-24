// Loose lines to GQL (editor spec §47): line_to_gql_code and line_to_gql_checked. A person types a line in a graph
// block that the library cannot read. Code converts it, with no AI and no network, into GQL the library reads. The
// result is read in its place in the note before it is offered. One that fails is refused, and nothing changes.
import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { gqlBlocks } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { convertLine, looseLine } from '../src/line-to-gql.ts';

const fence = (lines) => `# Notes\n\n\`\`\`gql\n${lines.join('\n')}\n\`\`\`\n`;
const GRAPH = [
  '// graph: team',
  "(alice:Person {name: 'Alice'}),",
  "(acme:Company {name: 'Acme'}),",
  '(alice)-[:WORKS_AT]->(acme),',
];
/** The note with `typed` as the graph's last line, and the 0-based line it is on. */
const typedIn = (typed, graph = GRAPH) => {
  const note = fence([...graph, typed]);
  return { note, line: note.split('\n').indexOf(typed) };
};
const worldOf = (note) => readNote(gqlBlocks(note).map((b) => b.text)).world.team;
const edgesOf = (note) => worldOf(note).edges.map(([a, t, b]) => `${a} ${t} ${b}`);
const labelsOf = (note, key) => [...(worldOf(note).nodes.get(key)?.[0] ?? [])];
const propsOf = (note, key) => worldOf(note).p(key);
const converted = (typed, graph) => {
  const { note, line } = typedIn(typed, graph);
  const out = convertLine(note, line);
  assert.ok('gql' in out, `"${typed}" was not converted: ${out.refused}`);
  return out;
};

// no test reaches the network: any fetch fails the test
let fetched = 0;
const realFetch = globalThis.fetch;
beforeEach(() => {
  fetched = 0;
  globalThis.fetch = () => {
    fetched++;
    throw new Error('no network in these tests');
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
  assert.equal(fetched, 0, 'code conversion reached the network');
});

test('a loose line in a graph block is found; a valid line, a comment and a line outside any block are not', () => {
  const { note, line } = typedIn('Alice likes Bob');
  assert.deepEqual(looseLine(note, line), { line, text: 'Alice likes Bob', graph: 'team', indent: '' });
  assert.equal(looseLine(note, line - 1), null, 'a valid line is not loose');
  assert.equal(looseLine(note, 0), null, 'a heading outside the block is not loose');
  const commented = typedIn('// Alice likes Bob');
  assert.equal(looseLine(commented.note, commented.line), null);
  const valid = typedIn("(bob:Person {name: 'Bob'})");
  assert.equal(looseLine(valid.note, valid.line), null);
});

test('an arrow becomes a link, writing each new thing once and reusing a thing the graph has', () => {
  for (const typed of ['Alice -> Bob', 'Alice --> Bob', 'Alice => Bob', 'Alice → Bob']) {
    const out = converted(typed);
    assert.equal(out.shape, 'arrow');
    assert.deepEqual(out.gql.split('\n'), ["(bob {name: 'Bob'}),", '(alice)-[:RELATES_TO]->(bob)']);
    assert.ok(edgesOf(out.note).includes('alice RELATES_TO bob'));
  }
});

test('a labelled arrow, in the plain and the mermaid styles, takes its label as the link type', () => {
  for (const typed of [
    'Alice -likes-> Bob',
    'Alice --likes--> Bob',
    'Alice -- likes --> Bob',
    'Alice -->|likes| Bob',
    'Alice -[likes]-> Bob',
  ]) {
    const out = converted(typed);
    assert.equal(out.shape, 'arrow', typed);
    assert.ok(edgesOf(out.note).includes('alice LIKES bob'), typed);
  }
  // a mermaid node's text in brackets is the thing's text; its id is not
  const m = converted('A[Alice] --> B[Bob Smith]');
  assert.ok(edgesOf(m.note).includes('alice RELATES_TO bob_smith'));
  assert.equal(propsOf(m.note, 'bob_smith').name, 'Bob Smith');
  // an arrow pointing back reads the other way
  assert.ok(edgesOf(converted('Alice <- Bob').note).includes('bob RELATES_TO alice'));
});

test('a sentence of a subject, a verb and an object becomes a link, reusing the link types the graph has', () => {
  const out = converted('Alice likes Bob');
  assert.equal(out.shape, 'sentence');
  assert.ok(edgesOf(out.note).includes('alice LIKES bob'));
  // the things the graph has split a longer sentence, and its spelling of a type is kept
  const at = converted('Bob works at Acme');
  assert.ok(edgesOf(at.note).includes('bob WORKS_AT acme'));
  const quoted = converted('"Bob Smith" knows "Carol Jones"');
  assert.ok(edgesOf(quoted.note).includes('bob_smith KNOWS carol_jones'));
});

test('a thing and its kind, said three ways, become a thing of that kind, spelt as the graph spells it', () => {
  for (const typed of ['Bob is a Person', 'Bob is a person', 'Bob: Person', 'Bob (person)']) {
    const out = converted(typed);
    assert.equal(out.shape, 'kind', typed);
    assert.equal(out.gql, "(bob:Person {name: 'Bob'})", typed);
  }
  assert.equal(converted('Zed is an animal').gql, "(zed:Animal {name: 'Zed'})");
});

test('a list, a list item and a list with a kind become things', () => {
  const list = converted('Bob, Carol, Dave: Person');
  assert.equal(list.shape, 'list');
  for (const k of ['bob', 'carol', 'dave']) assert.deepEqual(labelsOf(list.note, k), ['Person']);
  const plain = converted('Bob, Carol');
  assert.equal(plain.gql, "(bob {name: 'Bob'}),\n(carol {name: 'Carol'})");
  const item = converted('- Dave');
  assert.equal(item.shape, 'item');
  assert.equal(item.gql, "(dave {name: 'Dave'})");
  // a list item holding an arrow is still the arrow
  assert.ok(edgesOf(converted('* Alice -> Bob').note).includes('alice RELATES_TO bob'));
  assert.ok(edgesOf(converted('1. Alice likes Bob').note).includes('alice LIKES bob'));
});

test('key = value on a new thing becomes its properties, numbers and true or false as values', () => {
  const dot = converted('Eve.age = 30');
  assert.equal(dot.shape, 'properties');
  assert.equal(dot.gql, "(eve {name: 'Eve', age: 30})");
  const colon = converted('Eve: age = 30, city = Paris, active = true');
  assert.deepEqual(propsOf(colon.note, 'eve'), { id: 'eve', name: 'Eve', age: 30, city: 'Paris', active: true });
});

test('a Markdown table row and a CSV row become a link or a thing; a table rule line is not converted', () => {
  const row = converted('| Alice | likes | Bob |');
  assert.equal(row.shape, 'table');
  assert.ok(edgesOf(row.note).includes('alice LIKES bob'));
  assert.equal(converted('| Bob | Person |').gql, "(bob:Person {name: 'Bob'})");
  const rule = typedIn('|---|---|---|');
  assert.ok('refused' in convertLine(rule.note, rule.line));
  const csv = converted('Alice,KNOWS,Bob');
  assert.equal(csv.shape, 'csv');
  assert.ok(edgesOf(csv.note).includes('alice KNOWS bob'));
  // a row whose middle is a type the graph has is a link too
  assert.ok(edgesOf(converted('Bob,works_at,Acme').note).includes('bob WORKS_AT acme'));
});

test('the converted line keeps its indent, and a comma where the lines around it use them', () => {
  const graph = ['// graph: team', "  (alice:Person {name: 'Alice'}),"];
  const note = fence([...graph, '  Bob is a Person', "  (acme:Company {name: 'Acme'})"]);
  const line = note.split('\n').indexOf('  Bob is a Person');
  const out = convertLine(note, line);
  assert.ok('gql' in out);
  assert.equal(out.note.split('\n')[line], "  (bob:Person {name: 'Bob'}),");
  assert.deepEqual(
    out.note.split('\n').filter((_, i) => i !== line),
    note.split('\n').filter((_, i) => i !== line),
  );
});

test('a result the library cannot take, or a line no shape fits, is refused with the reason and nothing changes', () => {
  // alice is written already: writing her again would be a problem the note did not have
  const again = typedIn('Alice.age = 30');
  const out = convertLine(again.note, again.line);
  assert.ok('refused' in out);
  assert.match(out.refused, /alice/);
  // words no shape fits are left for the AI, with a reason
  const prose = typedIn('what about the thing over there, the big one?');
  const none = convertLine(prose.note, prose.line);
  assert.ok('refused' in none);
  assert.ok(none.refused.length > 0);
  // a line that is not loose is not converted
  const valid = typedIn("(bob:Person {name: 'Bob'})");
  assert.ok('refused' in convertLine(valid.note, valid.line));
});

test('the loose line problem carries a fix whose title shows the GQL, and applying it writes that GQL in place', async () => {
  const { diagnostics } = await import('../src/help.ts');
  const block = [...GRAPH, 'Alice likes Bob'].join('\n');
  const reading = readNote([block]);
  const found = diagnostics(reading, 'team', 0, block, 'app://Notes.md');
  const here = found.find((d) => d.range.start.line === GRAPH.length);
  assert.ok(here, 'the loose line has a problem');
  const fix = here.data.fixes.find((f) => f.title.startsWith('Convert to GQL'));
  assert.ok(fix, 'and a fix that converts it');
  assert.equal(fix.title, "Convert to GQL: (bob {name: 'Bob'}), (alice)-[:LIKES]->(bob)");
  const [edit] = fix.edit.changes['app://Notes.md'];
  const lines = block.split('\n');
  lines.splice(edit.range.start.line, 1, ...edit.newText.split('\n'));
  assert.equal(edit.range.end.character, 'Alice likes Bob'.length);
  const fixed = lines.join('\n');
  const world = readNote([fixed]).world.team;
  assert.ok(world.edges.some(([a, t, b]) => a === 'alice' && t === 'LIKES' && b === 'bob'));
  // a valid block has no such fix
  const valid = readNote([GRAPH.join('\n')]);
  const none = diagnostics(valid, 'team', 0, GRAPH.join('\n'), 'app://Notes.md');
  assert.ok(none.every((d) => d.data.fixes.every((f) => !f.title.startsWith('Convert to GQL'))));
});

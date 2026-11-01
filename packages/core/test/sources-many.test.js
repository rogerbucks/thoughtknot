// One graph from many places (editor spec §63, CN1): a FROM list joined by connectors.ts.
// - connector_many_sources: a block naming a .gql file, a note and a plug-in source draws one graph of all three. The
//   note's text is unchanged.
// - connector_joined_by_mesh: two places that disagree on a value hold it contested. Two same-named things in two
//   contexts stay two until a SAME_AS link joins them.
// - connector_order_free: every order of the listed places draws the same graph, byte for byte.
// - connector_cites_source: each thing, link and property carries its place, text hash and line. The details panel
//   and an AI query both show them.
// - connector_source_missing: with one place missing, the others draw, and the missing one is named with why.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gqlBlocks } from '../src/blocks.ts';
import { sha256 } from '../src/ai-digest.ts';
import { connect, joinPlaces } from '../src/connectors.ts';
import { propertiesOf } from '../src/inspector.ts';
import { AiQueryEngine } from '../src/ai-query.ts';
import { Permissions } from '../src/permissions.ts';
import { sourceOf } from '../src/sources.ts';
import gs from '@thoughtknot/graph-spec';

const FILE = `// graph: team
(ann:Person {name: 'Ann', desk: 4}),
(bob:Person {name: 'Bob'}),
(ann)-[:KNOWS]->(bob)`;
const NOTE = [
  '# Team',
  '',
  '```gql',
  '// graph: team',
  "(cat:Person {name: 'Cat'}),",
  '(ann:Person),',
  '(cat)-[:KNOWS]->(ann)',
  '```',
  '',
].join('\n');
const PLUGIN = `// graph: team
(dan:Person {name: 'Dan'}),
(cat:Person),
(dan)-[:KNOWS]->(cat)`;
const BLOCK = '// graph: team · FROM Graphs/people.gql, [[Team]], sample:trip';

/** What the host fetched at each place. */
const FETCHED = {
  'Graphs/people.gql': { found: 'Graphs/people.gql', text: FILE },
  Team: { found: 'Team.md', text: NOTE },
  'sample:trip': { found: 'sample:trip', text: PLUGIN },
};
const keyOf = (s) => (s.kind === 'plugin' ? `${s.scheme}:${s.target}` : s.target);

/** The block's places, each connected from what was fetched there, and joined. */
function drawn(block = BLOCK, fetched = FETCHED, options = {}) {
  const s = sourceOf(block);
  const places = s.places ?? [s];
  return joinPlaces(
    s.graph,
    places.map((p) => connect(p, fetched[keyOf(p)] ?? { missing: true })),
    options,
  );
}
const things = (r) =>
  r.reading.graphs
    .get('team')
    .boxes.map((b) => b.key)
    .sort();
const props = (r, id) => r.reading.world.team.p(id);

describe('connector_many_sources', () => {
  test('a FROM list names each place, a file, a note and a plug-in source', () => {
    const s = sourceOf(BLOCK);
    assert.deepEqual(
      s.places.map((p) => [p.kind, keyOf(p)]),
      [
        ['file', 'Graphs/people.gql'],
        ['note', 'Team'],
        ['plugin', 'sample:trip'],
      ],
    );
    assert.equal(s.target, 'Graphs/people.gql', 'the first place stays the source, for a host that reads one');
    assert.equal(
      sourceOf('// graph: team · FROM [[Team, the list]], Graphs/people.gql').places[0].target,
      'Team, the list',
    );
  });

  test('draws one graph holding the things and links of all three, and the note text is unchanged', () => {
    const note = `# Mine\n\n\`\`\`gql\n${BLOCK}\n\`\`\`\n`;
    const before = note;
    const r = drawn(gqlBlocks(note)[0].text);
    assert.deepEqual(things(r), ['ann', 'bob', 'cat', 'dan']);
    assert.equal(r.reading.graphs.get('team').links.length, 3);
    assert.equal(note, before);
    assert.deepEqual(r.missing, []);
  });

  test('a place listed twice is read once, and a list with one bad place says which', () => {
    assert.equal(sourceOf('// graph: team · FROM [[Team]], Team').places, undefined);
    assert.ok('fault' in sourceOf('// graph: team · FROM [[Team]], ../outside.gql'));
  });
});

describe('connector_joined_by_mesh', () => {
  test('two places that give one thing different values hold it contested, never one silently winning', () => {
    const fetched = {
      ...FETCHED,
      Team: { found: 'Team.md', text: NOTE.replace('(ann:Person),', '(ann:Person {desk: 9}),') },
    };
    const r = drawn(BLOCK, fetched);
    assert.deepEqual(r.contested, [
      {
        thing: 'ann',
        key: 'desk',
        values: [
          { value: '4', place: 'Graphs/people.gql' },
          { value: '9', place: 'Team' },
        ],
      },
    ]);
    assert.equal(props(r, 'ann').desk, undefined, 'neither value is drawn as fact');
    assert.match(props(r, 'ann').contested, /desk: 4 \(Graphs\/people\.gql\), 9 \(Team\)/);
  });

  test('two same-named things in two contexts stay two, until a SAME_AS link joins them', () => {
    const fetched = {
      'Graphs/people.gql': FETCHED['Graphs/people.gql'],
      'clients/acme.gql': { found: 'clients/acme.gql', text: "// graph: team\n(ann:Person {name: 'Ann of Acme'})" },
    };
    const block = '// graph: team · FROM Graphs/people.gql, clients/acme.gql';
    const contextOf = (s) => (s.target.startsWith('clients/') ? 'acme' : 'vault');
    assert.deepEqual(things(drawn(block, fetched, { contextOf })), ['ann__acme', 'ann__vault', 'bob']);
    assert.deepEqual(things(drawn(block, fetched)), ['ann', 'bob'], 'in one context the name is one thing');
    const linked = {
      ...fetched,
      'clients/acme.gql': {
        found: 'clients/acme.gql',
        text: "// graph: team\n(ann:Person {name: 'Ann of Acme'}),\n(them:Ref {ref: 'ann', context: 'vault'}),\n(ann)-[:SAME_AS]->(them)",
      },
    };
    const r = drawn(block, linked, { contextOf });
    assert.deepEqual(things(r), ['ann', 'bob']);
    assert.deepEqual(
      r.contested.map((c) => [c.thing, c.key]),
      [['ann', 'name']],
      'joined, their names disagree',
    );
  });
});

describe('connector_order_free', () => {
  test('every order of three listed places draws the same graph, byte for byte', () => {
    const places = ['Graphs/people.gql', '[[Team]]', 'sample:trip'];
    const orders = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ];
    const texts = orders.map((o) => drawn(`// graph: team · FROM ${o.map((i) => places[i]).join(', ')}`).texts[0]);
    for (const t of texts) assert.equal(t, texts[0]);
    const layouts = orders.map((o) =>
      JSON.stringify(drawn(`// graph: team · FROM ${o.map((i) => places[i]).join(', ')}`).reading.graphs.get('team')),
    );
    for (const l of layouts) assert.equal(l, layouts[0]);
  });
});

describe('connector_cites_source', () => {
  test('each thing, link and property carries its place, text hash and line', () => {
    const r = drawn();
    const v = (text) => sha256(text).slice(0, 12);
    assert.equal(props(r, 'ann').cited_from, `Graphs/people.gql line 2 (${v(FILE)}); Team line 6 (${v(NOTE)})`);
    assert.equal(props(r, 'cat').cited_from, `Team line 5 (${v(NOTE)}); sample:trip line 3 (${v(PLUGIN)})`);
    assert.equal(props(r, 'dan').cited_from, `sample:trip line 2 (${v(PLUGIN)})`);
    const link = r.reading.world.team.edges.find(([a, t, b]) => a === 'cat' && t === 'KNOWS' && b === 'ann');
    assert.equal(link[3].cited_from, `Team line 7 (${v(NOTE)})`);
    assert.deepEqual(r.cites.get('bob'), [{ place: 'Graphs/people.gql', version: sha256(FILE), line: 3 }]);
    for (const c of r.places) assert.equal(c.version, sha256(FETCHED[keyOf(c.source)].text));
  });

  test('the details panel and an AI query both show where a thing came from', () => {
    const r = drawn();
    const shown = propertiesOf(r.reading, 'team', { thing: 'cat' });
    assert.ok(shown.some((p) => p.key === 'cited_from' && p.value.startsWith('Team line 5')));
    const owner = Object.values(
      gs.worldFromStore(gs.read(["// graph: permissions\n(me:Person {name: 'Me', owner: TRUE})"])),
    )[0];
    const ai = new AiQueryEngine(new Permissions(owner), () => ({
      graph: r.reading.world.team,
      note: { path: 'Mine.md', tags: [] },
    }));
    const answer = ai.query('me', { graph: 'team', match: 'Person' }, '2026-10-28T10:00:00Z');
    assert.ok(answer.ok);
    for (const res of answer.results) assert.match(String(res.props.cited_from), / line \d+ \([0-9a-f]{12}\)$/);
  });
});

describe('connector_source_missing', () => {
  test('with one of three places missing, the other two draw and the missing one is named with why', () => {
    const { Team: _gone, ...rest } = FETCHED;
    const r = drawn(BLOCK, rest);
    assert.deepEqual(things(r), ['ann', 'bob', 'cat', 'dan'], 'cat is still named by the plug-in source');
    assert.equal(props(r, 'cat').name, undefined, 'its name was in the missing note');
    assert.equal(r.missing.length, 1);
    assert.equal(r.missing[0].why, 'missing');
    assert.match(r.missing[0].refused, /Team/);
  });

  test('an unreadable place and one holding no such graph are named too, and nothing is drawn blank', () => {
    const r = drawn(BLOCK, {
      ...FETCHED,
      Team: { found: 'Team.md', unreadable: 'locked' },
      'sample:trip': { found: 'sample:trip', text: '// graph: other\n(x:Thing)' },
    });
    assert.deepEqual(things(r), ['ann', 'bob']);
    assert.deepEqual(r.missing.map((m) => m.why).sort(), ['no-graph', 'unreadable']);
    const none = drawn(BLOCK, {});
    assert.ok('refused' in none, 'with every place missing, it says why rather than drawing blank');
  });
});

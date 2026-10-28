// The one contract every connector meets (editor spec §63, connector_contract; CN1). A connector is given a place and
// what was fetched there. It gives the place's version and its GQL statements. Each cites the place, the version and
// its line. The version moves only when the place's text changes. Every kind of place a FROM list can name has a
// connector, and each passes the same suite. So a new kind of place adds a connector, and the join stays as it is.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CONNECTORS, connect, connectorFor, joinPlaces } from '../src/connectors.ts';

const GQL = `// graph: team
INSERT
(ann:Person {name: 'Ann'}),
(bob:Person {name: 'Bob'}),
(ann)-[:KNOWS]->(bob)`;

/** Each kind of place, with what a host fetches there: the text, and its line of the graph line. */
const PLACES = [
  { source: { graph: 'team', kind: 'file', target: 'Graphs/team.gql', block: 0 }, text: GQL, place: 'Graphs/team.gql' },
  {
    source: { graph: 'team', kind: 'note', target: 'Team', block: 0 },
    text: `# Team\n\nSome words.\n\n\`\`\`gql\n${GQL}\n\`\`\`\n`,
    place: 'Team',
  },
  {
    source: { graph: 'team', kind: 'plugin', scheme: 'sample', target: 'team', block: 0 },
    text: GQL,
    place: 'sample:team',
  },
];
const fetched = (p, text = p.text) => ({ found: p.place, text });

describe('connector_contract', () => {
  test('every kind of place a FROM list names has a connector', () => {
    for (const kind of ['file', 'note', 'plugin']) assert.ok(connectorFor(kind), kind);
    for (const c of CONNECTORS) assert.equal(typeof c.connect, 'function');
  });

  for (const p of PLACES)
    describe(`the ${p.source.kind} connector`, () => {
      test('gives the statements, each citing the place, its version and the line it is written on', () => {
        const c = connect(p.source, fetched(p));
        assert.ok(!('refused' in c));
        assert.equal(c.place, p.place);
        assert.deepEqual(
          c.statements.map((s) => s.text),
          ["(ann:Person {name: 'Ann'})", "(bob:Person {name: 'Bob'})", '(ann)-[:KNOWS]->(bob)'],
        );
        const lines = p.text.split('\n');
        for (const s of c.statements) {
          assert.deepEqual(Object.keys(s.cite).sort(), ['line', 'place', 'version']);
          assert.equal(s.cite.place, p.place);
          assert.equal(s.cite.version, c.version);
          assert.ok(lines[s.cite.line - 1].startsWith(s.text.split('\n')[0]), `line ${s.cite.line}`);
        }
      });

      test('its version moves when the place changes, and only then', () => {
        const a = connect(p.source, fetched(p));
        const again = connect(p.source, fetched(p));
        const changed = connect(p.source, fetched(p, p.text.replace("'Bob'", "'Robert'")));
        assert.match(a.version, /^[0-9a-f]{64}$/);
        assert.equal(again.version, a.version);
        assert.notEqual(changed.version, a.version);
      });

      test('says why when there is nothing to read, naming the place', () => {
        const gone = connect(p.source, { missing: true });
        assert.ok('refused' in gone);
        assert.equal(gone.why, 'missing');
      });

      test('gives what the join takes, so the join is the same for every kind', () => {
        const r = joinPlaces('team', [connect(p.source, fetched(p))]);
        assert.deepEqual(
          r.reading.graphs
            .get('team')
            .boxes.map((b) => b.key)
            .sort(),
          ['ann', 'bob'],
        );
      });
    });
});

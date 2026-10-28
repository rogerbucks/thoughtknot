// Generated graphs for the axiom tests (editor spec §64, axioms_on_generated_graphs; GS8). fast-check makes a graph as
// plain data. text() writes it as a block the reader reads, and plant() breaks one axiom in it. Every graph made here
// keeps every axiom until plant() breaks one. A failing case shrinks to the smallest graph that still fails, because
// fast-check shrinks the data.
import fc from 'fast-check';
import { createRequire } from 'node:module';

const C = createRequire(import.meta.url)('../src/graph-spec-check.js');

/** The seed and the number of graphs every run uses, so CI checks the same graphs each time. */
export const RUNS = { seed: 2026_10_28, numRuns: 2000 };

/** The likelihood words, lowest first. A range takes two of them, the lower first. */
export const WORDS = ['almost-no-chance', 'very-unlikely', 'unlikely', 'even-chance', 'likely', 'very-likely'];
const IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const KINDS = ['Item', 'Part'];
const TYPES = ['OWNS', 'USES'];

const value = fc.oneof(fc.integer({ min: -5, max: 5 }), fc.constantFrom('red', 'blue', "it's"), fc.boolean());

/**
 * A graph as data. Its things each have an id, a kind, and maybe a value and a likelihood range. Its links join them.
 * Who supersedes whom is a forest: each thing has at most one successor, always a later thing. `schema` says whether it
 * declares its own kinds and link types, or is a draft.
 */
export const graph = fc
  .record({
    count: fc.integer({ min: 1, max: IDS.length }),
    kinds: fc.array(fc.constantFrom(...KINDS), { minLength: IDS.length, maxLength: IDS.length }),
    values: fc.array(fc.option(value, { nil: undefined }), { minLength: IDS.length, maxLength: IDS.length }),
    ranges: fc.array(fc.option(fc.tuple(fc.nat(WORDS.length - 1), fc.nat(WORDS.length - 1)), { nil: undefined }), {
      minLength: IDS.length,
      maxLength: IDS.length,
    }),
    links: fc.array(fc.tuple(fc.nat(IDS.length - 1), fc.constantFrom(...TYPES), fc.nat(IDS.length - 1)), {
      maxLength: 10,
    }),
    successors: fc.array(fc.option(fc.nat(IDS.length - 1), { nil: undefined }), {
      minLength: IDS.length,
      maxLength: IDS.length,
    }),
    schema: fc.boolean(),
  })
  .map((r) => {
    const ids = IDS.slice(0, r.count);
    const things = ids.map((id, i) => {
      const t = { id, kind: r.kinds[i] };
      if (r.values[i] !== undefined) t.v = r.values[i];
      if (r.ranges[i]) {
        const [x, y] = r.ranges[i].slice().sort((p, q) => p - q);
        [t.likelihood, t.likelihood_to] = [WORDS[x], WORDS[y]];
      }
      return t;
    });
    const at = (n) => ids[n % ids.length];
    const links = [];
    for (const [from, type, to] of r.links) {
      const link = [at(from), type, at(to)];
      if (!links.some((l) => l.join() === link.join())) links.push(link);
    }
    const taken = new Set();
    const supersedes = []; // [successor, item]
    ids.forEach((id, i) => {
      const n = r.successors[i];
      if (n === undefined || i + 1 >= ids.length) return;
      const succ = ids[i + 1 + (n % (ids.length - i - 1))];
      if (taken.has(succ)) return; // a successor supersedes one item
      taken.add(succ);
      supersedes.push([succ, id]);
    });
    return { name: 'g', things, links, supersedes, schema: r.schema };
  });

const gql = (v) =>
  typeof v === 'string' ? `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : String(v).toUpperCase();
const propsOf = (t) =>
  Object.entries(t)
    .filter(([k]) => k !== 'kind')
    .map(([k, v]) => `${k}: ${typeof v === 'number' ? v : gql(v)}`)
    .join(', ');

/** The graph as one block: its schema, when it has one, then its things and its links. */
export function text(g) {
  const lines = [];
  if (g.schema) {
    lines.push(`(meta:Meta:GraphMeta {id: 'meta', graph: '${g.name}', schema: '${g.name}@1', owner_engine: 'e'})`);
    for (const k of [...KINDS, ...(g.extraKinds || [])])
      lines.push(`(t_${k}:Meta:ElementType {id: 't_${k}', kind: 'node', name: '${k}', origin: 'source'})`);
    for (const t of [...TYPES, 'SUPERSEDES'])
      lines.push(
        `(t_${t}:Meta:ElementType {id: 't_${t}', kind: 'edge', name: '${t}', origin: 'source', reading: 'r', reverse_name: 'rr'})`,
      );
    for (const k of [...KINDS, ...(g.extraKinds || []), ...TYPES, 'SUPERSEDES'])
      lines.push(`(meta)-[:DECLARES]->(t_${k})`);
  }
  for (const t of g.things) lines.push(`(${t.id}:${t.kind} {${propsOf(t)}})`);
  for (const [from, type, to] of g.links) lines.push(`(${from})-[:${type}]->(${to})`);
  for (const [succ, item] of g.supersedes) lines.push(`(${succ})-[:SUPERSEDES]->(${item})`);
  return `// graph: ${g.name}\nINSERT\n${lines.join(',\n')}`;
}

/** The world the graph's block reads into. */
export function worldOf(g) {
  const store = new C.Store();
  store.apply(text(g));
  return C.worldFromStore(store);
}

/** The axioms one graph can break, and how plant() breaks each in a graph read from text. */
export const PLANTABLE = ['A1', 'A2', 'A3', 'A4', 'A7', 'A8'];

/**
 * The world of graph g with axiom `axiom` broken, by the smallest change that breaks it alone. A1 and A2 cannot be
 * written in a block the reader takes, so they are made in the graph read. A3 needs a schema, so it adds one.
 */
export function plant(g, axiom) {
  const first = g.things[0].id;
  switch (axiom) {
    case 'A3':
      return worldOf({ ...g, schema: true, things: [...g.things, { id: 'zz', kind: 'Stray' }] });
    case 'A4':
      return withGraph(g, (nodes, edges) => {
        nodes.get(first)[1].tags = ['x', 'y'];
        return [nodes, edges];
      });
    case 'A7':
      return worldOf({
        ...g,
        things: g.things.map((t, i) => (i === 0 ? { ...t, likelihood: WORDS.at(-1), likelihood_to: WORDS[0] } : t)),
      });
    case 'A8': {
      const things = [...g.things, { id: 'y1', kind: 'Item' }, { id: 'y2', kind: 'Item' }];
      const supersedes = [...g.supersedes.filter(([, item]) => item !== first), ['y1', first], ['y2', first]];
      return worldOf({ ...g, things, supersedes });
    }
    case 'A1':
      return withGraph(g, (nodes, edges) => {
        const [labels, props] = nodes.get(first);
        nodes.delete(first);
        nodes.set(`${first}_copy`, [labels, props]);
        return [
          nodes,
          edges.map(([s, t, d, p]) => [s === first ? `${first}_copy` : s, t, d === first ? `${first}_copy` : d, p]),
        ];
      });
    case 'A2':
      return withGraph(g, (nodes, edges) => [nodes, [...edges, [first, 'OWNS', 'nowhere', {}]]]);
  }
  throw new Error(`no way to plant ${axiom}`);
}

/** The world of g, with its graph rebuilt by `change(nodes, edges)` on copies of its own. */
function withGraph(g, change) {
  const world = worldOf(g);
  const old = world[g.name];
  const nodes = new Map([...old.nodes].map(([k, [l, p]]) => [k, [new Set(l), { ...p }]]));
  const edges = old.edges.map(([s, t, d, p]) => [s, t, d, { ...p }]);
  world[g.name] = new C.Graph(...change(nodes, edges));
  return world;
}

/** A document for a join: its id and its things and links, written with the header the join reads. */
export const joinDoc = fc
  .record({
    things: fc.uniqueArray(
      fc.record({
        id: fc.constantFrom('x', 'y', 'z', 'w'),
        v: fc.option(fc.integer({ min: 1, max: 3 }), { nil: undefined }),
      }),
      { selector: (t) => t.id, minLength: 1, maxLength: 4 },
    ),
    links: fc.array(fc.tuple(fc.nat(3), fc.nat(3)), { maxLength: 3 }),
  })
  .map(({ things, links }) => ({
    things,
    links: links.map(([a, b]) => [things[a % things.length].id, things[b % things.length].id]),
  }));

/** The documents for a join, each with its own id. */
export const joinDocs = fc
  .array(joinDoc, { minLength: 1, maxLength: 4 })
  .map((docs) => docs.map((d, i) => ({ ...d, id: `doc:${'abcd'[i]}` })));

/** A join document's block. */
export function docText(d) {
  const lines = d.things.map((t) => `(${t.id}:Item {id: '${t.id}'${t.v === undefined ? '' : `, v: ${t.v}`}})`);
  const seen = new Set();
  for (const [a, b] of d.links) if (!seen.has(a + b)) (seen.add(a + b), lines.push(`(${a})-[:OWNS]->(${b})`));
  return `// graph: shop · document ${d.id} · schema s1 · as of 2026-10-01\n${lines.join(',\n')}`;
}

/** The join of these documents' blocks, as canonical JSON, so two joins compare as text. */
export const joined = (blocks) => C.jcs(C.joinDocs({ docs: blocks, config: {} }));

/** The same items in an order fast-check picks. */
export const shuffled = (items) => fc.shuffledSubarray(items, { minLength: items.length, maxLength: items.length });

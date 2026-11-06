// The fixed scenes the rendering scoreboard draws (editor spec §73, render_scoreboard; wiki/Rendering-spec.md). Each
// is a graph note, made the same way every time from a seed, so two runs draw the same graph.
//
// - `mockup`: the 430-item sample of the detail-on-zoom mockups Roger approved on 3 Nov 2026. It has 6 subjects, 26
//   areas, about 95 topics and 430 items, named by the subject, area and topic properties (named-levels.ts).
// - `small`: a 20-thing note, as most notes are.
// - `tree`: a 120-thing tree, each thing part of one other.
// - `big`: 10,000 things in groups, past the drawing limit, so the big-graph view shows it.
// Pure: no file is read or written here.

/** A seeded random number from 0 to 1: the same seed gives the same run. */
export function seeded(seed) {
  let r = seed;
  return () => (r = (r * 16807) % 2147483647) / 2147483647;
}

/** Quotes `text` as a gql string. */
const q = (text) => `'${String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** A note of one gql block named `graph`, the things then the links, with a line of words above it. */
function note(title, graph, things, links) {
  const lines = [
    ...things.map(
      (t) =>
        `(${t.id}:${t.kind} {${Object.entries(t.props)
          .map(([k, v]) => `${k}: ${q(v)}`)
          .join(', ')}})`,
    ),
    ...links.map(([a, b, type]) => `(${a})-[:${type}]->(${b})`),
  ];
  return `# ${title}\n\n\`\`\`gql\n// graph: ${graph} · SOURCE\n${lines.join(',\n')}\n\`\`\`\n`;
}

const SUBJECTS = [
  ['work', 'Work', ['Projects', 'Clients', 'People', 'Operations', 'Sales']],
  ['money', 'Money', ['Budget', 'Tax', 'Investments', 'Banking']],
  ['home', 'Home', ['House', 'Family', 'Garden', 'Travel']],
  ['health', 'Health', ['Fitness', 'Food', 'Medical', 'Sleep']],
  ['learn', 'Learning', ['Courses', 'Books', 'Languages', 'Research', 'Talks']],
  ['side', 'Side projects', ['App', 'Blog', 'Workshop', 'Podcast']],
];
const TOPICS = ['Planning', 'Notes', 'Ideas', 'Tasks', 'Reviews', 'Contacts', 'Costs', 'Goals', 'Risks', 'Links'];
/** The links between subjects in the mockup: from, to, how many. */
const BETWEEN = [
  ['work', 'money', 18],
  ['money', 'work', 8],
  ['work', 'learn', 10],
  ['learn', 'side', 12],
  ['side', 'work', 6],
  ['home', 'money', 10],
  ['health', 'home', 6],
  ['home', 'health', 4],
  ['learn', 'work', 5],
  ['money', 'home', 3],
  ['side', 'money', 5],
  ['health', 'learn', 3],
];

/** The mockup's 430-item sample, as the mockup's own generator makes it, named by subject, area and topic. */
export function mockupScene() {
  const random = seeded(11),
    things = [],
    links = [],
    bySubject = new Map(),
    byArea = [];
  let areaCount = 0;
  for (const [sid, subject, areas] of SUBJECTS) {
    bySubject.set(sid, []);
    for (const area of areas) {
      const inArea = [],
        heads = [],
        topics = 3 + Math.floor(random() * 2);
      for (let t = 0; t < topics; t++) {
        const topic = TOPICS[(areaCount * 3 + t) % TOPICS.length],
          n = 3 + Math.floor(random() * 4),
          ids = [];
        for (let m = 0; m < n; m++) {
          const id = `i${things.length}`;
          const name = m === 0 ? `${area} ${topic.toLowerCase()}` : `${topic} ${m + 1} (${area})`;
          things.push({ id, kind: 'Item', props: { name, subject, area, topic } });
          ids.push(id);
        }
        for (const id of ids.slice(1)) links.push([id, ids[0], 'PART_OF']);
        heads.push(ids[0]);
        inArea.push(...ids);
      }
      for (const head of heads.slice(1)) links.push([head, heads[0], 'PART_OF']);
      byArea.push({ sid, ids: inArea });
      bySubject.get(sid).push(...inArea);
      areaCount++;
    }
  }
  const pick = (ids) => ids[Math.floor(random() * ids.length)];
  for (const [i, area] of byArea.entries()) {
    const siblings = byArea.filter((b, j) => b.sid === area.sid && j !== i);
    for (let k = 0; k < 2; k++) links.push([pick(area.ids), pick(pick(siblings).ids), 'RELATES']);
  }
  for (const [from, to, n] of BETWEEN)
    for (let k = 0; k < n; k++) links.push([pick(bySubject.get(from)), pick(bySubject.get(to)), 'RELATES']);
  return note('The mockup sample: 430 items', 'mockup', things, links);
}

/** A note of `n` things, each part of an earlier one, with some links across. */
function treeLike(title, graph, n, across, seed) {
  const random = seeded(seed),
    kinds = ['Idea', 'Task', 'Person', 'Doc', 'Risk', 'Goal'];
  const things = Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    kind: kinds[i % kinds.length],
    props: { name: `${kinds[i % kinds.length]} ${i + 1}` },
  }));
  const links = [];
  for (let i = 1; i < n; i++) {
    links.push([`t${i}`, `t${Math.floor(random() * i)}`, 'PART_OF']);
    if (random() < across) links.push([`t${i}`, `t${Math.floor(random() * n)}`, 'RELATES']);
  }
  return note(title, graph, things, links);
}

/** Every scene, by name: its note, and whether it is too big to draw thing by thing. */
export const SCENES = {
  mockup: { note: mockupScene, big: false },
  small: { note: () => treeLike('A small note: 20 things', 'small', 20, 0.3, 3), big: false },
  tree: { note: () => treeLike('A tree: 120 things', 'tree', 120, 0, 5), big: false },
  big: { note: () => treeLike('A big graph: 10,000 things', 'big', 10000, 0.3, 7), big: true },
};

#!/usr/bin/env node
// Whether the requirements still match the app (spec §12, requirements_drift_ratcheted). Four kinds of drift, each a
// list that may only shrink, kept in quality/requirements-drift.json:
// - no-test: a requirement no Test record is PROVED_BY. check-requirements.mjs holds only the slices that have started;
// - not-written: a requirement whose tests are not all written, in a slice that is not the one being built;
// - uncited: a written test whose files never mention any requirement it claims, so the claim cannot be checked;
// - orphan: a test file no Test record names and that cites no requirement, so nothing says what it is for.
// A new entry fails. So does a listed entry that is fixed, until it comes off the list.
//
// Usage:
//   node scripts/requirements-drift.mjs           what is wrong, one line each (exit 1), or the counts.
//   node scripts/requirements-drift.mjs --update  rewrite the list from the repository as it is.
//   node scripts/requirements-drift.mjs --report  the counts as markdown, for the weekly report (never exits 1).
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIREMENTS, filesOf, requirementsGraph } from './check-requirements.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { read } = createRequire(import.meta.url)('../packages/graph-spec/src/graph-spec-check.js');
export const LIST = 'quality/requirements-drift.json';
export const KINDS = ['no-test', 'not-written', 'uncited', 'orphan'];
const IN_REPO = new Set(['repo', 'both']);
const TEST_DIRS = ['test', 'packages', 'python', 'scripts'];
const TEST_FILE = /(^|\/)(test|tests)\/.+\.(m?js|ts|py)$/;
const TEST_NAME = /\.(test|spec)\.|(^|\/)test_[^/]*\.py$/;
const SKIP = new Set(['node_modules', 'dist', '.venv', '__pycache__', 'tests-first', 'seen-failing', '.git']);

/** The requirements, tests and links of a copy of the requirements: {reqs: [{id, slice}], tests: Map, proving: Map}. */
export function readRequirements(copy) {
  const store = read([requirementsGraph(copy)]);
  const graph = store.graph(Object.keys(store.graphs)[0]);
  const reqs = new Map();
  const tests = new Map();
  for (const [key, n] of graph.nodes) {
    if (n.labels.has('Requirement')) reqs.set(key, { id: n.props.id, slice: n.props.slice });
    if (n.labels.has('Test')) tests.set(key, n.props);
  }
  const proving = new Map(); // requirement id -> its Test props
  for (const [from, type, to] of graph.edges)
    if (type === 'PROVED_BY' && reqs.has(from) && tests.has(to))
      proving.set(reqs.get(from).id, [...(proving.get(reqs.get(from).id) ?? []), tests.get(to)]);
  return { reqs: [...reqs.values()], tests: [...tests.values()], proving };
}

/** Every repo-relative test file, as [path, text]. */
export function testFiles(dirs = TEST_DIRS, root = ROOT) {
  const walk = (rel) => {
    const full = join(root, rel);
    if (!existsSync(full)) return [];
    return readdirSync(full).flatMap((name) => {
      if (SKIP.has(name)) return [];
      const child = `${rel}/${name}`;
      if (statSync(join(root, child)).isDirectory()) return walk(child);
      return TEST_FILE.test(child) && TEST_NAME.test(child) ? [[child, readFileSync(join(root, child), 'utf8')]] : [];
    });
  };
  return dirs.flatMap(walk);
}

/** A name as a whole word, so tests_first is not found in tests_first_run. */
const word = (name, text) => new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`).test(text);

/**
 * The drift of a copy of the requirements: {kind: sorted list of entries}.
 * - `slice` is the slice being built, whose unwritten tests are expected. By default it is the highest slice held.
 * - `files` is [path, text] of each test file; `text` reads any other repo file.
 */
export function drift(copy, { slice, files = testFiles(), text = (f) => readText(f) } = {}) {
  const { reqs, tests, proving } = readRequirements(copy);
  const out = Object.fromEntries(KINDS.map((k) => [k, []]));
  const building = slice ?? Math.max(...reqs.map((r) => r.slice));
  for (const r of reqs) {
    const ts = proving.get(r.id) ?? [];
    if (!ts.length) out['no-test'].push(r.id);
    else if (r.slice < building && !ts.every((t) => t.status === 'written')) out['not-written'].push(r.id);
  }
  const ids = reqs.map((r) => r.id);
  const claimedBy = new Map(); // test id -> the requirement ids that name it
  for (const [id, ts] of proving) for (const t of ts) claimedBy.set(t.id, [...(claimedBy.get(t.id) ?? []), id]);
  const named = new Set();
  for (const t of tests) {
    if (!IN_REPO.has(t.where)) continue;
    const paths = filesOf(t.file);
    paths.forEach((f) => named.add(f));
    if (t.status !== 'written') continue;
    const body = paths.map(text).join('\n');
    if (!(claimedBy.get(t.id) ?? []).some((id) => word(id, body))) out.uncited.push(t.id);
  }
  const folders = [...named].filter((f) => f.endsWith('/'));
  for (const [path, body] of files) {
    if (named.has(path) || folders.some((d) => path.startsWith(d))) continue;
    if (/req:\d+\./.test(body) || ids.some((id) => word(id, body))) continue;
    out.orphan.push(path);
  }
  for (const k of KINDS) out[k] = [...new Set(out[k])].sort();
  return out;
}

function readText(rel) {
  const full = join(ROOT, rel);
  return existsSync(full) && statSync(full).isFile() ? readFileSync(full, 'utf8') : '';
}

/** What is wrong when `now` is compared with `listed`, one line each. */
export function compareToList(now, listed) {
  const lines = [];
  for (const k of KINDS) {
    const was = new Set(listed[k] ?? []);
    const is = new Set(now[k]);
    for (const e of now[k]) if (!was.has(e)) lines.push(`${k}: ${e} is new drift. ${FIX[k]}`);
    for (const e of was)
      if (!is.has(e)) lines.push(`${k}: ${e} is fixed now: run node scripts/requirements-drift.mjs --update`);
  }
  return lines;
}

const FIX = {
  'no-test': `Give the requirement a Test record in ${REQUIREMENTS}, planned at least.`,
  'not-written': 'Write its test, or set the Test record back to what is true.',
  uncited: "Name the claimed requirement's id in a comment or test title in the test file.",
  orphan: `Add a Test record for the file in ${REQUIREMENTS}, or name the requirement it checks in the file.`,
};

const ABOUT =
  'Drift between requirements/editor-requirements.md and the tests. Each list only shrinks: see scripts/requirements-drift.mjs.';

export function report(now) {
  return ['| Drift | Count |', '| --- | ---: |', ...KINDS.map((k) => `| ${k} | ${now[k].length} |`)].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const now = drift(readText(REQUIREMENTS));
  const flag = process.argv[2];
  if (flag === '--update') {
    writeFileSync(join(ROOT, LIST), `${JSON.stringify({ about: ABOUT, ...now }, null, 2)}\n`);
    console.log(report(now));
  } else if (flag === '--report') {
    console.log(report(now));
  } else {
    const problems = compareToList(now, JSON.parse(readFileSync(join(ROOT, LIST), 'utf8')));
    if (problems.length) {
      console.error(problems.join('\n'));
      process.exit(1);
    }
    console.log(`requirements drift held: ${KINDS.map((k) => `${now[k].length} ${k}`).join(', ')}`);
  }
}

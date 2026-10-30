#!/usr/bin/env node
// Checks a change to the requirements graph against the graph it started from. The graph is the one source of the
// requirements, edited here in pull requests (Roger, 16 Oct 2026: no vault holds them any more). So records, links and
// comments may be added, changed and removed. What a pull request may never do is move a test back:
// - a test's status goes only forward, from planned to partial or written and from partial to written;
// - a test flipped forward must have its file;
// - a test that is partial or written is never removed;
// - a proved requirement's rule is never reworded unless a commit message or the pull request names its id (FLOW-5).
//   So no one softens a rule after its test was written without saying so.
// This refuses exactly those, naming each one.
//
// Usage:
//   node scripts/check-requirements-flips.mjs --base-ref <commit>   the committed copy against the copy at <commit>.
//   node scripts/check-requirements-flips.mjs --merge-base-of <ref>  the committed copy against the copy at the merge base
//                                                                   of <ref> and HEAD: only the branch's own changes.
//   node scripts/check-requirements-flips.mjs --base <file>         the committed copy against a file.
//   --named <text> adds text, such as the pull request's body, to the commit messages that may name a reworded id.
//   --repo <dir> reads the copy and runs git in another repository (the tests use it).
//
// Exits 1 and lists each refused difference. A base that holds no copy (the copy is new) has nothing to compare.
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FORMER_REQUIREMENTS,
  HAS_FILE,
  REQUIREMENTS,
  TEST_STATUSES,
  filesOf,
  requirementsGraph,
} from './check-requirements.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { read } = createRequire(import.meta.url)('../packages/graph-spec/src/graph-spec-check.js');
// A test whose file the repository holds, alone or as well as somewhere else.
const IN_REPO = new Set(['repo', 'both']);

function parse(text, side) {
  try {
    const store = read([requirementsGraph(text)]);
    const graph = store.graph(Object.keys(store.graphs)[0]);
    const name = (key) => graph.nodes.get(key)?.props.id ?? key;
    // a requirement is proved when a written test is its PROVED_BY
    const proved = new Set();
    for (const [from, type, to] of graph.edges)
      if (type === 'PROVED_BY' && graph.nodes.get(to)?.props.status === 'written') proved.add(name(from));
    return {
      graph: { nodes: new Map([...graph.nodes].map(([key, n]) => [name(key), n])), proved },
    };
  } catch (e) {
    const at = e.line === undefined ? '' : ` at line ${e.line}`;
    return { problem: { kind: 'unreadable', id: side, message: `the ${side} copy cannot be read${at}: ${e.message}` } };
  }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The problems with one record present in both copies: a test moved back, or flipped forward without its file. */
function recordProblems(id, was, now, exists) {
  const problems = [];
  if (same(was.props.status, now.props.status)) return problems;
  const isTest = was.labels.has('Test') && now.labels.has('Test');
  const from = TEST_STATUSES.indexOf(was.props.status);
  const to = TEST_STATUSES.indexOf(now.props.status);
  if (isTest && (from === -1 || to === -1)) {
    problems.push({
      kind: 'field',
      id,
      message: `${id}: status went from ${JSON.stringify(was.props.status)} to ${JSON.stringify(now.props.status)}, which is not planned, partial or written`,
    });
    return problems;
  }
  if (!isTest) {
    if (from !== -1 && to !== -1)
      problems.push({
        kind: 'not-a-test',
        id,
        message: `${id}: is not a test, so it has no status to flip`,
      });
    return problems;
  }
  if (to < from)
    problems.push({
      kind: 'flip-back',
      id,
      message: `${id}: status went from ${was.props.status} to ${now.props.status}: a test only moves forward, from planned to partial or written, and from partial to written`,
    });
  else if (HAS_FILE.includes(now.props.status) && IN_REPO.has(now.props.where)) {
    const files = filesOf(now.props.file);
    const missing = files.filter((f) => !exists(f));
    if (missing.length || !files.length)
      problems.push({
        kind: 'missing-file',
        id,
        message: `${id}: flipped to ${now.props.status}, but the repository has no ${missing.join(', ') || 'file named for it'}`,
      });
  }
  return problems;
}

/**
 * The differences between two copies of the requirements that a pull request may not make, each as {kind, id,
 * message}. The kinds are:
 * - unreadable;
 * - flip-back: a test's status moved back;
 * - not-a-test: a status flipped on a record that is not a test;
 * - missing-file: a test flipped to partial or written whose file the repository does not hold;
 * - removed: a test that was partial or written taken out;
 * - reworded: a proved requirement whose rule changed, and whose id `named` (the commit messages, the pull request body)
 *   does not hold as a word.
 * Empty for every other change: records, links and comments added, changed or removed, and tests moved forward with
 * their files. exists(path) says whether the repository holds a repo-relative path.
 */
export function refusedChanges(baseText, headText, { exists = (rel) => existsSync(join(ROOT, rel)), named = '' } = {}) {
  const base = parse(baseText, 'base');
  const head = parse(headText, 'head');
  if (base.problem || head.problem) return [base.problem, head.problem].filter(Boolean);

  const was = base.graph.nodes;
  const now = head.graph.nodes;
  const problems = [];
  for (const [id, record] of was)
    if (!now.has(id) && record.labels.has('Test') && HAS_FILE.includes(record.props.status))
      problems.push({
        kind: 'removed',
        id,
        message: `${id}: a ${record.props.status} test was removed: a test only moves forward, so it stays`,
      });
  for (const [id, record] of now) if (was.has(id)) problems.push(...recordProblems(id, was.get(id), record, exists));
  const says = (id) => new RegExp(`(^|[^\\w])${id}($|[^\\w])`).test(named);
  for (const id of base.graph.proved) {
    const before = was.get(id)?.props.rule;
    const after = now.get(id)?.props.rule;
    if (after !== undefined && !same(before, after) && !says(id))
      problems.push({
        kind: 'reworded',
        id,
        message: `${id}: its rule was reworded, and a written test proves it. Name ${id} in a commit message or the pull request body, so the change is said`,
      });
  }
  return problems;
}

/** The messages of the commits the branch adds, so the id of a reworded requirement may be named in any of them. */
function repoMessages(repo, args, value) {
  const flag = ['--base-ref', '--merge-base-of'].find((f) => args.includes(f));
  if (!flag) return '';
  try {
    const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const base = flag === '--merge-base-of' ? git('merge-base', value(flag), 'HEAD').trim() : value(flag);
    return git('log', '--format=%B', `${base}..HEAD`);
  } catch {
    return '';
  }
}

function main(args) {
  const value = (flag) => args[args.indexOf(flag) + 1];
  const repo = args.includes('--repo') ? value('--repo') : ROOT;
  const head = readFileSync(join(repo, REQUIREMENTS), 'utf8');
  let base;
  if (args.includes('--base-ref') || args.includes('--merge-base-of')) {
    const flag = args.includes('--base-ref') ? '--base-ref' : '--merge-base-of';
    let ref = value(flag);
    if (!ref || ref.startsWith('-')) {
      console.error(`${flag} needs a commit, such as ${flag} origin/main`);
      return 2;
    }
    const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      // the merge base of the ref and HEAD, so a change the ref gained after the branch point is not read as a revert
      if (flag === '--merge-base-of') ref = git('merge-base', ref, 'HEAD').trim();
      // the commit must resolve; only a commit that holds no copy has nothing to compare
      git('rev-parse', '--verify', '--quiet', `${ref}^{tree}`);
      // a base from before the requirements became a note holds the graph file they were kept in
      const held = [REQUIREMENTS, FORMER_REQUIREMENTS].find((rel) =>
        git('ls-tree', '--name-only', ref, '--', rel).trim(),
      );
      if (!held) {
        console.log(`${REQUIREMENTS}: not in the base, so nothing to compare`);
        return 0;
      }
      base = git('show', `${ref}:${held}`);
    } catch (e) {
      console.error(`cannot read ${REQUIREMENTS} at ${ref}: ${String(e.stderr || e.message).trim()}`);
      return 2;
    }
  } else if (args.includes('--base')) {
    try {
      base = readFileSync(value('--base') ?? '', 'utf8');
    } catch (e) {
      console.error(`cannot read the base file: ${e.message}`);
      return 2;
    }
  } else {
    console.error('needs --base-ref <commit> or --base <file>');
    return 2;
  }
  const named = [args.includes('--named') ? value('--named') : '', repoMessages(repo, args, value)].join('\n');
  const problems = refusedChanges(base, head, { named });
  for (const p of problems) console.log(`${p.kind}: ${p.message}`);
  if (!problems.length) console.log(`${REQUIREMENTS}: no test moved back or lost`);
  return problems.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));

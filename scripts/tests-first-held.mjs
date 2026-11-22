// The tests a reason may name beside those that passed first (spec §12, tests_first). The records are made on a Mac and
// CI replays on Ubuntu. A test whose old version fails at the parent on one, but not the other, is new and passing first
// there, and held before here (PR 2427). Records and reasons are kept by scripts/tests-first-records.mjs; the command
// is scripts/tests-first.mjs.
import { exceptionsIn, history, readRecords, summary, testFiles } from './tests-first-records.mjs';

/**
 * The tests held before, and still passing, in each test file a recorded commit changed, as `<test file> :: <test>`,
 * for the test files the repository holds now. The record does not say which of them the commit itself changed. A
 * replay on another machine may find one new and passing first, when its old version failed at the parent there: CI on
 * Ubuntu, where the record was made on a Mac (PR 2427). A reason kept for one names a test its file held at that
 * commit, so it is not a reason for no such test.
 */
export function heldTests(repo) {
  const { baseline, commits } = readRecords(repo);
  const current = testFiles(repo);
  const out = new Set();
  for (const c of history(repo, baseline))
    for (const f of commits.get(c)?.files ?? [])
      if (current.has(f.file)) for (const name of f.held ?? []) out.add(`${f.file} :: ${name}`);
  return [...out].sort();
}

/**
 * The plain reasons (not for a fault) that name no test the records hold, as `<test file> :: <test>`, sorted. A reason
 * is for a test that passed first, for a new test of a commit not replayed, or for a test held before in a file a
 * recorded commit changed (heldTests).
 */
export function reasonsForNoTest(repo) {
  const { files } = summary(repo);
  const known = new Set([
    ...Object.entries(files).flatMap(([file, e]) => [
      ...e.passedFirst.map((p) => `${file} :: ${p.name}`),
      ...(e.notReplayedCommits ?? []).flatMap((c) => (c.tests ?? []).map((n) => `${file} :: ${n}`)),
    ]),
    ...heldTests(repo),
  ]);
  return Object.entries(exceptionsIn(repo))
    .flatMap(([file, names]) =>
      Object.entries(names)
        .filter(([, reason]) => reason.fault !== true)
        .map(([n]) => `${file} :: ${n}`),
    )
    .filter((x) => !known.has(x))
    .sort();
}

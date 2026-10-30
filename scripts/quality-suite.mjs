// The test-suite metrics of the quality ratchet (spec §12, quality_ratchet). They are:
// - how long the whole suite takes;
// - which tests are flaky;
// - how big a passing quiet run is;
// - how much of the core the tests cover.
// Two full runs of `node --test` do it. The first, plain, gives the duration and the quiet reporter's output. The
// second, with coverage, is compared with the first to find the tests whose result differs. The readers of Node's
// JUnit and lcov reports are here too.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COVERAGE_PACKAGES } from './quality-spec.mjs';

const RUN_MS = Number(process.env.THOUGHTKNOT_RUN_MINUTES ?? 20) * 60 * 1000;

const unescape = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** Every test of a JUnit report, as `file > suite > name` against 'pass' or 'fail'; files are relative to `root`. */
export function parseJunit(xml, root) {
  const tests = new Map(),
    suites = [];
  const tag = /<(\/?)(testsuite|testcase)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
  for (const [, close, kind, attrs, selfClose] of xml.matchAll(tag)) {
    const attr = (name) => unescape(new RegExp(`\\s${name}="([^"]*)"`).exec(attrs)?.[1] ?? '');
    if (kind === 'testsuite') {
      if (close) suites.pop();
      else if (!selfClose) suites.push(attr('name'));
    } else if (!close) {
      // named in slashes, as git names it, on Windows too
      const file = attr('file') ? relative(root, attr('file')).replaceAll(sep, '/') : '';
      tests.set(
        [file, ...suites, attr('name')].filter(Boolean).join(' > '),
        /\sfailure="/.test(attrs) ? 'fail' : 'pass',
      );
    }
  }
  return tests;
}

/**
 * The tests whose result differs between two runs, or that ran in only one of them: the flaky ones, by name. A second
 * run that failed (`secondPassed` false) with no test to blame is flaky too, as a line saying so and why.
 */
export function flakyBetween(first, second, secondPassed = true, secondStderr = '') {
  const names = new Set([...first.keys(), ...second.keys()]);
  const flaky = [...names].filter((name) => first.get(name) !== second.get(name));
  if (!secondPassed && !flaky.length && ![...second.values()].includes('fail'))
    flaky.push(unexplainedFailure('second', secondStderr));
  return flaky;
}

/**
 * The line naming a run that failed with no test of its own failing. It quotes the run's own reason when its `stderr`
 * has one: the ceiling that stopped it, or the last error line. Without it, the failure cannot be told apart.
 */
export function unexplainedFailure(which, stderr = '') {
  const lines = stderr
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const why = lines.find((line) => line.startsWith('run-ceiling:')) ?? lines.at(-1);
  const said = `(the ${which} run failed with no test of its own failing)`;
  return why ? `${said} ${why.slice(0, 300)}` : said;
}

/** The line coverage under a folder (or several) from an lcov report: files, lines, lines hit, and the share. */
export function parseLcov(lcov, folder) {
  const folders = [].concat(folder);
  const total = { files: 0, lines: 0, hit: 0, percent: 0 };
  for (const record of lcov.split('end_of_record')) {
    const file = /^SF:(.*)$/m.exec(record)?.[1];
    if (!file || !folders.some((f) => file.startsWith(f))) continue;
    total.files++;
    total.lines += Number(/^LF:(\d+)$/m.exec(record)?.[1] ?? 0);
    total.hit += Number(/^LH:(\d+)$/m.exec(record)?.[1] ?? 0);
  }
  if (total.lines) total.percent = Math.round((total.hit / total.lines) * 1000) / 10;
  return total;
}

/** The `--test-coverage-include` arguments for every package held, and each package's metric from an lcov report. */
export const COVERAGE_INCLUDE = Object.values(COVERAGE_PACKAGES)
  .flat()
  .map((folder) => `--test-coverage-include=${folder}**`);

export function coverageMetrics(lcov) {
  return Object.fromEntries(
    Object.entries(COVERAGE_PACKAGES).map(([name, folders]) => {
      const c = parseLcov(lcov, folders);
      return [name, c.files ? c.percent : null];
    }),
  );
}

const CEILING = join(dirname(fileURLToPath(import.meta.url)), 'run-ceiling.mjs');

/**
 * Runs `node --test` over the repository with these arguments, as `npm test` does. It runs under the memory and time
 * ceiling of scripts/run-ceiling.mjs (spec §13, capped_test_run), with each test's own time limit. How long it took and
 * whether it passed; a run the ceiling stopped did not pass, and its `stderr` says which ceiling.
 */
export function nodeTest(root, args) {
  // a run inside a test run would report to it instead of printing its own report
  const { NODE_TEST_CONTEXT: _context, ...env } = process.env;
  const started = performance.now();
  const r = spawnSync(process.execPath, [CEILING, 'node', '--test', '--test-timeout=300000', ...args], {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: RUN_MS,
    maxBuffer: 1 << 28,
  });
  return { seconds: (performance.now() - started) / 1000, passed: r.status === 0, stderr: r.stderr };
}

/**
 * Measures the suite:
 * - `suite_seconds` and `quiet_run_bytes` from a plain run;
 * - `flaky_tests` from comparing it with a second run;
 * - the coverage of each package (COVERAGE_PACKAGES) from that second run.
 * The bytes are null if the plain run did not pass: a failing run's output is not the figure being kept down.
 * `details` names the flaky and failing tests. The runs are `node --test` as `npm test` runs it, under the ceiling,
 * with the test discovery a developer's and CI's runs have.
 */
export function measureSuite(root) {
  const dir = mkdtempSync(join(tmpdir(), 'quality-suite-'));
  try {
    const quiet = join(dir, 'quiet.txt'),
      one = join(dir, 'one.xml'),
      two = join(dir, 'two.xml'),
      lcov = join(dir, 'lcov.info');
    const first = nodeTest(root, [
      '--test-reporter=./scripts/quiet-reporter.mjs',
      `--test-reporter-destination=${quiet}`,
      '--test-reporter=junit',
      `--test-reporter-destination=${one}`,
    ]);
    const second = nodeTest(root, [
      '--experimental-test-coverage',
      ...COVERAGE_INCLUDE,
      '--test-reporter=junit',
      `--test-reporter-destination=${two}`,
      '--test-reporter=lcov',
      `--test-reporter-destination=${lcov}`,
    ]);
    const a = parseJunit(readFileSync(one, 'utf8'), root),
      b = parseJunit(readFileSync(two, 'utf8'), root);
    const failing = [...a].filter(([, r]) => r === 'fail').map(([name]) => name);
    if (!first.passed && !failing.length) failing.push(unexplainedFailure('first', first.stderr));
    const flaky = flakyBetween(a, b, second.passed, second.stderr);
    const lcovText = readFileSync(lcov, 'utf8');
    const coverage = parseLcov(lcovText, COVERAGE_PACKAGES.coverage_percent);
    return {
      metrics: {
        suite_seconds: Math.round(first.seconds * 10) / 10,
        flaky_tests: flaky.length,
        quiet_run_bytes: first.passed ? statSync(quiet).size : null,
        ...coverageMetrics(lcovText),
      },
      details: {
        tests: a.size,
        failing,
        flaky,
        coverage_files: coverage.files,
        coverage_lines: coverage.lines,
        second_run_passed: second.passed,
      },
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The coverage of each package from one run of the suite, as a pull request that touches a package makes it (CODE-3).
 * `passed` is false if the run failed, and then its figures mean nothing.
 */
export function measureCoverage(root) {
  const dir = mkdtempSync(join(tmpdir(), 'quality-coverage-'));
  try {
    const lcov = join(dir, 'lcov.info');
    const run = nodeTest(root, [
      '--experimental-test-coverage',
      ...COVERAGE_INCLUDE,
      '--test-reporter=./scripts/quiet-reporter.mjs',
      `--test-reporter-destination=${join(dir, 'quiet.txt')}`,
      '--test-reporter=lcov',
      `--test-reporter-destination=${lcov}`,
    ]);
    return {
      passed: run.passed,
      stderr: run.stderr,
      metrics: run.passed ? coverageMetrics(readFileSync(lcov, 'utf8')) : {},
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

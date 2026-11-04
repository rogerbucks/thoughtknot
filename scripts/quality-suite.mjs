// The test-suite metrics of the quality ratchet (spec §12, quality_ratchet). They are:
// - how long the whole suite takes;
// - which tests are flaky;
// - how big a passing quiet run is;
// - how much of the core the tests cover.
// Two full runs of `node --test` do it. The first, plain, gives the duration and the quiet reporter's output. The
// second, with coverage, is compared with the first to find the tests whose result differs. The readers of Node's
// JUnit and lcov reports are here too.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

/**
 * One lcov report from several: the reports of a suite split over machines (`--test-shard`), each with its share of the
 * test files. A line counts as hit when any report hit it. Files and lines come back in order, with LF and LH counted
 * again from the lines, which is all `parseLcov` reads.
 */
export function mergeLcov(reports) {
  const files = new Map();
  for (const report of reports)
    for (const record of report.split('end_of_record')) {
      const file = /^SF:(.*)$/m.exec(record)?.[1];
      if (!file) continue;
      if (!files.has(file)) files.set(file, new Map());
      const lines = files.get(file);
      for (const [, line, hits] of record.matchAll(/^DA:(\d+),(\d+)/gm))
        lines.set(Number(line), (lines.get(Number(line)) ?? 0) + Number(hits));
    }
  return [...files.keys()]
    .sort()
    .map((file) => {
      const lines = [...files.get(file)].sort((a, b) => a[0] - b[0]);
      const hit = lines.filter(([, hits]) => hits > 0).length;
      return [
        `SF:${file}`,
        ...lines.map(([line, hits]) => `DA:${line},${hits}`),
        `LF:${lines.length}`,
        `LH:${hit}`,
        'end_of_record',
      ].join('\n');
    })
    .join('\n')
    .concat('\n');
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
  return mergeSuiteShards([measureSuiteShard(root)]);
}

/**
 * Both runs over one share of the test files (`shard` such as `2/6`), or over all of them without one. The part it
 * returns is what `mergeSuiteShards` needs. That is how long each run took and whether it passed, the plain run's
 * quiet bytes, each run's tests by result, and the coverage report.
 */
export function measureSuiteShard(root, shard) {
  const dir = mkdtempSync(join(tmpdir(), 'quality-suite-'));
  const split = shard ? [`--test-shard=${shard}`] : [];
  try {
    const quiet = join(dir, 'quiet.txt'),
      one = join(dir, 'one.xml'),
      two = join(dir, 'two.xml'),
      lcov = join(dir, 'lcov.info');
    const first = nodeTest(root, [
      ...split,
      '--test-reporter=./scripts/quiet-reporter.mjs',
      `--test-reporter-destination=${quiet}`,
      '--test-reporter=junit',
      `--test-reporter-destination=${one}`,
    ]);
    const second = nodeTest(root, [
      ...split,
      '--experimental-test-coverage',
      ...COVERAGE_INCLUDE,
      '--test-reporter=junit',
      `--test-reporter-destination=${two}`,
      '--test-reporter=lcov',
      `--test-reporter-destination=${lcov}`,
    ]);
    return {
      seconds: first.seconds,
      firstPassed: first.passed,
      firstStderr: first.stderr ?? '',
      secondPassed: second.passed,
      secondStderr: second.stderr ?? '',
      quietBytes: first.passed ? statSync(quiet).size : null,
      first: [...parseJunit(readFileSync(one, 'utf8'), root)],
      second: [...parseJunit(readFileSync(two, 'utf8'), root)],
      lcov: readFileSync(lcov, 'utf8'),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The suite's metrics from the parts of a suite split over machines (`measureSuiteShard`), or from the one part of a
 * whole run. The suite takes as long as its slowest part; quiet bytes add up, and are null if any part failed.
 */
export function mergeSuiteShards(parts) {
  const a = new Map(parts.flatMap((p) => p.first)),
    b = new Map(parts.flatMap((p) => p.second));
  const failing = [...a].filter(([, r]) => r === 'fail').map(([name]) => name);
  for (const p of parts)
    if (!p.firstPassed && !failing.length) failing.push(unexplainedFailure('first', p.firstStderr));
  const secondFailed = parts.find((p) => !p.secondPassed);
  const flaky = flakyBetween(a, b, !secondFailed, secondFailed?.secondStderr ?? '');
  const lcovText = parts.length === 1 ? parts[0].lcov : mergeLcov(parts.map((p) => p.lcov));
  const coverage = parseLcov(lcovText, COVERAGE_PACKAGES.coverage_percent);
  const quietOk = parts.every((p) => p.quietBytes !== null);
  return {
    metrics: {
      suite_seconds: Math.round(Math.max(...parts.map((p) => p.seconds)) * 10) / 10,
      flaky_tests: flaky.length,
      quiet_run_bytes: quietOk ? parts.reduce((n, p) => n + p.quietBytes, 0) : null,
      ...coverageMetrics(lcovText),
    },
    details: {
      tests: a.size,
      failing,
      flaky,
      coverage_files: coverage.files,
      coverage_lines: coverage.lines,
      second_run_passed: !secondFailed,
    },
  };
}

/** Writes one shard's part to a file, for `readSuiteShards` in the job that merges them. */
export function writeSuiteShard(part, file) {
  writeFileSync(file, JSON.stringify(part));
}

/** Every shard part (`*.json`) under a folder, in name order; none is an error, as a missing shard means nothing. */
export function readSuiteShards(dir) {
  const files = readdirSync(dir, { recursive: true })
    .filter((f) => String(f).endsWith('.json'))
    .sort();
  if (!files.length) throw new Error(`no suite shard in ${dir}`);
  return files.map((f) => JSON.parse(readFileSync(join(dir, String(f)), 'utf8')));
}

/**
 * The coverage of each package from one run of the suite, as a pull request that touches a package makes it (CODE-3).
 * `passed` is false if the run failed, and then its figures mean nothing. With a `shard` such as `2/6` it runs only that
 * share of the test files; its `lcov` is then merged with the other shards' (`mergeLcov`).
 */
export function measureCoverage(root, shard) {
  const dir = mkdtempSync(join(tmpdir(), 'quality-coverage-'));
  try {
    const lcov = join(dir, 'lcov.info');
    const run = nodeTest(root, [
      ...(shard ? [`--test-shard=${shard}`] : []),
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
      // the raw report, for a split run: the parts are merged later, as one suite's
      lcov: run.passed ? readFileSync(lcov, 'utf8') : '',
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

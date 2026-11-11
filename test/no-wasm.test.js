// No WebAssembly anywhere in the app (ES§53, layout_own_engine; Roger, 8 Nov 2026). Graphviz was the last host code to
// need it, and it is gone: our own engine is plain code. So no host's page policy allows WebAssembly, and no host
// source compiles any. The sync package alone keeps Automerge, which runs in Node and in Rust, never in a host's page.
// The benchmarks name WebAssembly only to set the runner's flags.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { jsPackages, path, read, readJSON } from './repository/repo.js';

const RUNS_WASM = /'wasm-unsafe-eval'|WebAssembly\.(instantiate|compile|Module|Instance)\b/;
const RUNNER_FLAGS = (f) => f.startsWith('scripts/benchmarks/') || f === 'scripts/instruction-counts.mjs';

const hostSources = () =>
  execFileSync('git', ['ls-files', 'packages/*/src', 'packages/*/server', 'packages/*/bin', 'scripts'], {
    cwd: path('.'),
    encoding: 'utf8',
  })
    .split('\n')
    .filter((f) => /\.(ts|js|mjs|html)$/.test(f) && !f.startsWith('packages/sync/') && !RUNNER_FLAGS(f));

test('no host page may run WebAssembly: no policy allows it, and no host source compiles any', () => {
  assert.deepEqual(
    hostSources().filter((f) => RUNS_WASM.test(read(f))),
    [],
  );
});

test('and the check finds a policy that allows it, or a source that compiles some', () => {
  assert.ok(RUNS_WASM.test(`script-src 'self' 'wasm-unsafe-eval'`));
  assert.ok(RUNS_WASM.test('await WebAssembly.instantiate(bytes)'));
  assert.ok(!RUNS_WASM.test('// the window may not run WebAssembly'));
});

test('no package depends on Graphviz', () => {
  for (const p of jsPackages()) {
    const pkg = readJSON(`${p}/package.json`);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies };
    assert.ok(!('@viz-js/viz' in deps), `${p} depends on Graphviz`);
  }
});

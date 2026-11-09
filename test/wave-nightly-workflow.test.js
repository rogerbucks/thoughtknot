// The build made when a wave ends (wave-nightly.yml, scripts/wave-gate.mjs). Checked here:
// - What wakes it: a merged pull request labelled wave-done, from this repository.
// - The gate that stops it while an item of the wave is not Done and proved on the board.
// - It calls the nightly, which keeps its own version naming, so a second build the same day never clashes.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { block, jobs, read, runCommands } from './repository/repo.js';
import { nightlyVersion } from '../scripts/nightly-version.mjs';
import { report, waveOf, waveProblems } from '../scripts/wave-gate.mjs';

const text = read('.github/workflows/wave-nightly.yml');
const lines = text.split('\n');

/** The `permissions:` block at `indent` in these lines, as scope → read or write; `{}` and none at all are empty. */
function permissions(scopeLines, indent = 4) {
  const found = block(scopeLines, 'permissions', indent) ?? [];
  const out = new Map();
  for (const line of found.slice(1)) {
    const m = /^\s*([\w-]+): (read|write)\s*$/.exec(line);
    if (m) out.set(m[1], m[2]);
  }
  return out;
}

describe('the wave nightly workflow', () => {
  test('wakes only when a pull request to main closes, and builds only a merged wave-done one from this repository', () => {
    const on = block(lines, 'on', 0).join('\n');
    assert.match(on, /pull_request:\s*\n\s*types: \[closed\]\s*\n\s*branches: \[main\]/);
    assert.doesNotMatch(on, /pull_request_target|push:|schedule/);
    const gate = jobs(text).gate.join('\n');
    assert.match(gate, /github\.event\.pull_request\.merged == true/);
    assert.match(gate, /head\.repo\.full_name == github\.repository/);
    assert.match(gate, /contains\(github\.event\.pull_request\.labels\.\*\.name, 'wave-done'\)/);
  });

  test('checks the board first, with main’s own code and the project token, and passes the body as data', () => {
    const gate = jobs(text).gate.join('\n');
    assert.match(gate, /ref: main\s*\n\s*persist-credentials: false/);
    assert.deepEqual(runCommands(gate), ['node scripts/wave-gate.mjs --wait-minutes 15']);
    assert.match(gate, /PR_BODY: \$\{\{ github\.event\.pull_request\.body \}\}/);
    assert.match(gate, /PROJECT_TOKEN: \$\{\{ secrets\.PROJECT_TOKEN \}\}/);
    assert.match(gate, /timeout-minutes: \d+/);
  });

  test('calls the nightly only after the gate passes', () => {
    const call = jobs(text)['wave-nightly'].join('\n');
    assert.match(call, /needs: gate/);
    assert.match(call, /uses: \.\/\.github\/workflows\/nightly\.yml/);
  });

  // A called workflow may ask for no more than its caller grants. One it asks for and the caller leaves out stops the
  // run before its first step, as a startup failure with nothing in its log. Every wave build from 25 Oct to 8 Nov
  // 2026 ended so: the nightly's tests-passed job asked for `actions: read`, which the call did not grant.
  test('grants the nightly every permission any of its jobs asks for, and nothing more', () => {
    const granted = permissions(jobs(text)['wave-nightly']);
    const asked = new Map();
    const ask = (file, seen = new Set()) => {
      if (seen.has(file)) return;
      seen.add(file);
      const workflow = read(`.github/workflows/${file}`);
      const scopes = [
        permissions(workflow.split('\n'), 0),
        ...Object.values(jobs(workflow)).map((j) => permissions(j)),
      ];
      for (const scope of scopes)
        for (const [name, level] of scope) if (level === 'write' || !asked.has(name)) asked.set(name, level);
      for (const [, called] of workflow.matchAll(/uses: \.\/\.github\/workflows\/([\w-]+\.yml)/g)) ask(called, seen);
    };
    ask('nightly.yml');
    assert.ok(asked.size > 0);
    for (const [name, level] of asked) {
      const given = granted.get(name);
      assert.ok(given, `the nightly asks for ${name}: ${level}, and the wave-end call does not grant it`);
      assert.ok(
        given === level || given === 'write',
        `the nightly asks for ${name}: ${level}, and the call grants ${given}`,
      );
    }
    for (const name of granted.keys())
      assert.ok(asked.has(name), `${name} is granted and no job of the nightly asks for it`);
  });

  test('tells the nightly it is a wave build, which leaves the draft check to the night', () => {
    assert.match(jobs(text)['wave-nightly'].join('\n'), /with:\s*\n\s*wave: true/);
    const nightly = read('.github/workflows/nightly.yml');
    assert.match(block(nightly.split('\n'), 'on', 0).join('\n'), /workflow_call:\s*\n\s*inputs:\s*\n\s*wave:/);
    assert.match(jobs(nightly).drafts.join('\n'), /if: \$\{\{ !inputs\.wave \}\}/);
  });

  test('a second build the same day takes the next letter', () => {
    const first = nightlyVersion('0.7.1', '20261023');
    assert.equal(nightlyVersion('0.7.1', '20261023', [first]), `${first}.b`);
  });
});

describe('the wave gate', () => {
  const item = (id, wave, Status, Proof) => ({ id, values: { Wave: wave, Status, Proof } });

  test('reads the wave from a Wave line of its own', () => {
    assert.equal(waveOf('Text\n\nWave: 9\nMore'), 9);
    assert.equal(waveOf('wave:  12  '), 12);
    assert.equal(waveOf('This ends Wave: 9 of the plan'), null);
    assert.equal(waveOf(undefined), null);
  });

  test('lists the items of the wave that are not Done and proved, and none of another wave', () => {
    const items = [
      item(1, 'Wave 9 · Mesh', 'Done', 'proved'),
      item(2, 'Wave 9 · Mesh', 'In Progress', 'part'),
      item(3, 'Wave 9 · Mesh', 'Done', 'part'),
      item(4, 'Wave 90 · Later', 'Todo', 'open'),
      item(5, 'Wave 8 · Earlier', 'Todo', 'open'),
    ];
    const { found, open } = waveProblems(items, 9);
    assert.equal(found, 3);
    assert.deepEqual(
      open.map((i) => i.id),
      [2, 3],
    );
    assert.match(
      report(9, { found, open }).join('\n'),
      /2 of 3 items are not done[\s\S]*#2: Status In Progress, Proof part/,
    );
  });

  test('passes when every item is done, and stops when the board has none for the wave', () => {
    const done = waveProblems([item(1, 'Wave 9 · Mesh', 'Done', 'proved')], 9);
    assert.deepEqual(done.open, []);
    assert.match(report(9, done)[0], /All 1 items of wave 9 are Done and proved/);
    assert.equal(waveProblems([], 9).found, 0);
    assert.match(report(9, { found: 0, open: [] })[0], /no items on the board/);
  });
});

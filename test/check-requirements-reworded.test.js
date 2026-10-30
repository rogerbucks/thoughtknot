// Requirement: done_means_proved (spec §12).
// FLOW-5: a proved requirement's rule may be reworded only when a commit message or the pull request names its id.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { refusedChanges } from '../scripts/check-requirements-flips.mjs';
import { REQUIREMENTS } from '../scripts/check-requirements.mjs';
import { read } from './repository/repo.js';

const FIXTURE = [
  "(reword_proved:Requirement {section: '1', slice: 1, level: 'must', rule: 'The fixture must hold for every note.'}),",
  "(reword_unproved:Requirement {section: '1', slice: 1, level: 'must', rule: 'The other fixture must hold.'}),",
  "(test_reword:Test {proves: 'the fixture holds', file: 'packages/core/test/reword.test.js', where: 'repo', status: 'written'}),",
  "(test_reword_planned:Test {proves: 'the other holds', file: 'packages/core/test/reword2.test.js', where: 'repo', status: 'planned'}),",
].join('\n');
const LINKS = '(reword_proved)-[:PROVED_BY]->(test_reword),\n(reword_unproved)-[:PROVED_BY]->(test_reword_planned),\n';
const base = () => read(REQUIREMENTS).replace('// ── Links ──\n', `${FIXTURE}\n// ── Links ──\n${LINKS}`);
const reworded = (text, from, to) => {
  assert.ok(text.includes(from));
  return text.replace(from, to);
};
const check = (head, named = '') => refusedChanges(base(), head, { exists: () => true, named });

describe('a reworded requirement', () => {
  const soft = () => reworded(base(), 'must hold for every note', 'may hold for some notes');

  test('is refused when a written test proves it and nothing names it', () => {
    const problems = check(soft());
    assert.deepEqual(
      problems.map((p) => [p.kind, p.id]),
      [['reworded', 'reword_proved']],
    );
    assert.match(problems[0].message, /Name reword_proved/);
  });

  test('is accepted once a commit message or the pull request body names its id', () => {
    assert.deepEqual(check(soft(), 'Soften reword_proved: it was too strict'), []);
    assert.deepEqual(check(soft(), '(reword_proved)'), []);
  });

  test('is not named by an id that only contains it', () => {
    assert.equal(check(soft(), 'reword_proved_twice and xreword_proved').length, 1);
  });

  test('is accepted when no written test proves it yet', () => {
    const head = reworded(base(), 'The other fixture must hold.', 'The other fixture may hold.');
    assert.deepEqual(check(head), []);
  });

  test('is accepted when its rule is the same and only its other fields change', () => {
    assert.deepEqual(
      check(
        reworded(
          base(),
          "section: '1', slice: 1, level: 'must', rule: 'The fixture",
          "section: '9', slice: 1, level: 'must', rule: 'The fixture",
        ),
      ),
      [],
    );
  });
});

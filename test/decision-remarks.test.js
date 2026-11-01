// Requirement: quality_ratchet
// Decisions have one home (risk FLOW-11). A "(Roger, <date>)" remark in the requirements or the docs needs a Question
// answered that day, or the wiki's Decisions page cannot show it. Remarks from before the check are held to an
// allowance that only goes down. Proved on the repository and on planted texts.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ALLOWANCE, answeredDates, compare, remarkDates, tightened, unrecorded } from '../scripts/decision-remarks.mjs';
import { readQuestions } from '../scripts/wiki.mjs';
import { read, readJSON, ROOT } from './repository/repo.js';

describe('the repository', () => {
  test('has no dated remark without a Question beyond its allowance, and the allowance is as low as it can be', () => {
    assert.deepEqual(compare(unrecorded(), readJSON(ALLOWANCE)), []);
  });

  test('records the vault decision as a Question, so the Decisions page lists it', () => {
    const q = readQuestions(read('requirements/editor-requirements.md')).find((x) => /vault/.test(x.answer));
    assert.equal(q.answered, '2026-10-16');
  });

  test('the command passes and says how many remarks are still without a Question', () => {
    const r = spawnSync(process.execPath, ['scripts/decision-remarks.mjs'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^decision remarks: \d+ without a Question, as allowed$/m);
  });

  test('CONTRIBUTING.md says a dated remark must have its Question', () => {
    assert.match(read('CONTRIBUTING.md'), /dated remark[^.]*Question/);
  });
});

describe('it reads', () => {
  test('each remark as an ISO date and ignores one with no real month', () => {
    assert.deepEqual(remarkDates('a (Roger, 6 Oct 2026) b (Roger, 16 Oct 2026) c (Roger, 3 Foo 2026)'), [
      '2026-10-06',
      '2026-10-16',
    ]);
  });

  test('the days on which a Question was answered', () => {
    const text = "(q_a:Question {num: 'Q-01', answer: 'x', answered: '2026-10-16'}),(q_b:Question {num: 'Q-02'})";
    assert.deepEqual([...answeredDates(text)], ['2026-10-16']);
  });
});

describe('it holds the ratchet', () => {
  test('a date with more remarks than allowed fails, and one with fewer fails until tightened', () => {
    assert.deepEqual(compare({ '2026-10-18': 3 }, { '2026-10-18': 2 }), [{ date: '2026-10-18', have: 3, allowed: 2 }]);
    assert.deepEqual(compare({ '2026-10-18': 1 }, { '2026-10-18': 2 }), [{ date: '2026-10-18', have: 1, allowed: 2 }]);
    assert.deepEqual(compare({ '2026-10-18': 2 }, { '2026-10-18': 2 }), []);
  });

  test('tightening lowers an allowance, drops one that is spent, and never raises one', () => {
    assert.deepEqual(tightened({ a: 1, b: 0, c: 9 }, { a: 4, b: 2, c: 3 }), { a: 1, c: 3 });
    assert.deepEqual(tightened({ d: 5 }, {}), {});
  });
});

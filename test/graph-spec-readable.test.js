// The graph spec reads easily (editor spec §51, GS6). Each decision in graph-spec.gql carries a short title, its date
// and one line on why. The title and the date are in the decision's own id. requirements/graph-spec-decisions.json
// holds the why. This holds the two together, so a decision cannot be added without its reason.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const SPEC = read('../requirements/graph-spec.gql');
const WHY = JSON.parse(read('../requirements/graph-spec-decisions.json')).why;
const decisions = [...SPEC.matchAll(/:Decision \{id: 'note:((?:[^'\\]|\\.)*)\.decision'/g)].map((m) =>
  m[1].replace(/\\'/g, "'"),
);
const words = (text) => text.split(/\s+/).filter(Boolean).length;

describe('spec_decisions_explained', () => {
  test('every decision has a short title and a date', () => {
    assert.ok(decisions.length >= 40, `${decisions.length} decisions`);
    for (const id of decisions) {
      const m = /^(\d{4}-\d{2}-\d{2}) (.+)$/.exec(id);
      assert.ok(m, `${id} starts with its date`);
      assert.ok(!Number.isNaN(Date.parse(m[1])), `${id} has a real date`);
      assert.ok(words(m[2]) <= 20, `${id} has a title of 20 words or fewer`);
    }
  });

  test('every decision has one line on why, and no why is left without its decision', () => {
    for (const id of decisions) {
      const why = WHY[id];
      assert.equal(typeof why, 'string', `${id} has a why`);
      assert.ok(why.length > 0 && !why.includes('\n'), `${id}: the why is one line`);
      assert.ok(words(why) <= 25, `${id}: the why is 25 words or fewer`);
    }
    assert.deepEqual(
      Object.keys(WHY).filter((id) => !decisions.includes(id)),
      [],
    );
  });
});

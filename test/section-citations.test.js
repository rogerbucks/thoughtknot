// Every section number names the spec it belongs to: GS§ for the graph spec, ES§ for the editor spec. A missing graph
// spec section is marked withdrawn. A graph-spec rule id cited in a document or the code resolves (editor spec §51,
// spec_sections_named). Bare numbers that came first are on a record that only shrinks.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { bareCount, compareToRecord, problems, unmarkedGaps, unresolvedIds } from '../scripts/section-citations.mjs';

describe('spec_sections_named', () => {
  test('a number that names its spec is not bare, and one that does not is', () => {
    assert.equal(bareCount('see GS§3 and ES§27'), 0);
    assert.equal(bareCount("graph spec §3; editor spec §27; the editor spec's §9"), 0);
    assert.equal(bareCount('see §3 and (§4)'), 2);
    assert.equal(bareCount('the spec §9 and SPEC §10 do not say which spec'), 2);
  });

  test('a new bare section number in a file fails, and so does a record left too high', () => {
    assert.match(compareToRecord({ 'a.md': 3 }, { 'a.md': 2 })[0], /1 more bare section number.*GS§.*ES§/);
    assert.match(compareToRecord({ 'new.md': 1 }, {})[0], /new\.md has 1 more/);
    assert.match(compareToRecord({ 'a.md': 1 }, { 'a.md': 2 })[0], /fewer.*--update/);
    assert.deepEqual(compareToRecord({ 'a.md': 2 }, { 'a.md': 2 }), []);
  });

  test('section 2 is marked withdrawn, and a gap that is not marked fails', () => {
    const spec = "(s1:Section {id: 'spec:§1'}), (s3:Section {id: 'spec:§3'}), (s5:Section {id: 'spec:§5'})";
    assert.deepEqual(unmarkedGaps(spec, [{ section: '2' }]), [4]);
    assert.deepEqual(unmarkedGaps(spec, [{ section: '2' }, { section: '4' }]), []);
    assert.deepEqual(unmarkedGaps(spec, [{ section: '3' }, { section: '2' }, { section: '4' }]), [
      'section 3 is marked withdrawn but the spec has it',
    ]);
  });

  test('the repository names its sections, marks the withdrawn one, and cites only rules that exist', () => {
    assert.deepEqual(problems(), []);
    assert.deepEqual(unresolvedIds(), []);
  });
});

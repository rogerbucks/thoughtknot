// The review of one proposal, as a whole. It is editor spec §17: proposal_shown_not_applied, proposal_one_by_one,
// accepting_is_an_edit, rejecting_recorded, proposal_provenance and person_decides. Nothing is written until a person
// decides. Each change is decided on its own and taken back in turn. A graph that moved since is said before an accept.
// The other proposals tests prove each part in depth; this one walks a review through. Test support is
// proposals-fixtures.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ProposalReview } from '../src/proposals-review.ts';
import {
  C1,
  C2,
  C3,
  NOTE_WITH_ADA,
  NOW,
  ROGER,
  blocksOf,
  decisionsIn,
  noteWithChangeSet,
  proposalOf,
} from './proposals-fixtures.js';

const written = () => noteWithChangeSet(proposalOf(), NOTE_WITH_ADA);
const ok = (r) => {
  assert.equal(r.ok, true, `refused: ${r.reason ?? ''}`);
  return r;
};

describe('a review from the change set a note holds', () => {
  test('reads every change as waiting, and writes nothing to show it', () => {
    const { note, block } = written();
    const review = ProposalReview.fromChangeSet(block, note);
    assert.ok(!('refused' in review));
    assert.equal(review.pending().length, proposalOf().changes.length);
    assert.equal(review.state(C1), 'pending');
    assert.equal(review.canUndo(), false);
    review.show(note);
    assert.equal(review.pending().length, proposalOf().changes.length, 'showing decides nothing');
  });

  test('a block that is no change set is refused, with why', () => {
    const r = ProposalReview.fromChangeSet("// graph: reader\n(a:Thing {name: 'A'})");
    assert.ok('refused' in r && r.refused.length > 0);
  });

  test('takes up what the note’s judgement graph already decided of it', () => {
    const { note } = written();
    const first = ok(new ProposalReview(proposalOf()).reject(note, [C2], ROGER, { at: NOW }));
    const set = blocksOf(first.note).find((b) => /CHANGE SET cs1/.test(b));
    const again = ProposalReview.fromChangeSet(set, first.note);
    assert.equal(again.state(C2), 'rejected');
    assert.ok(!again.pending().includes(C2));
  });
});

describe('deciding, one change at a time', () => {
  test('an accept and a reject each move only the change named, and are recorded in the note', () => {
    const { note } = written();
    const review = new ProposalReview(proposalOf());
    const one = ok(review.accept(note, [C3], ROGER, { at: NOW }));
    const two = ok(review.reject(one.note, [C2], ROGER, { at: NOW }));
    assert.equal(review.state(C3), 'accepted');
    assert.equal(review.state(C2), 'rejected');
    assert.equal(review.state(C1), 'pending');
    assert.deepEqual(decisionsIn(two.note).get(C3)?.state, 'accepted');
    assert.deepEqual(decisionsIn(two.note).get(C2)?.state, 'rejected');
    assert.equal(review.decision(C3)?.by, 'roger');
    assert.ok(!review.changeSetText().includes('large_reader.price'), 'the change set keeps only what waits');
  });

  test('nobody who does not say who they are decides anything', () => {
    const { note } = written();
    const review = new ProposalReview(proposalOf());
    const r = review.accept(note, [C3], { name: '' }, { at: NOW });
    assert.equal(r.ok, false);
    assert.equal(review.state(C3), 'pending');
  });

  test('a decision is taken back in turn, last first, and the note is as it was before it', () => {
    const { note } = written();
    const review = new ProposalReview(proposalOf());
    const one = ok(review.reject(note, [C2], ROGER, { at: NOW }));
    const two = ok(review.accept(one.note, [C3], ROGER, { at: NOW }));
    assert.equal(review.canUndo(), true);
    const back = ok(review.undo(two.note));
    assert.equal(back.note, one.note);
    assert.equal(review.state(C3), 'pending');
    assert.equal(review.state(C2), 'rejected');
    assert.equal(ok(review.undo(back.note)).note, note);
    assert.equal(review.canUndo(), false);
    assert.equal(review.undo(note).ok, false, 'nothing is left to take back');
  });
});

describe('a graph that moved since the proposal', () => {
  test('is said before anything is accepted, and accepted once the person has seen it', () => {
    const { note } = written();
    const moved = note.replace("(alice:Person {name: 'Alice'})", "(alice:Person {name: 'Alice B'})");
    const review = new ProposalReview(proposalOf());
    assert.ok(review.staleness(moved), 'the review sees the graph moved');
    const refused = review.accept(moved, [C1], ROGER, { at: NOW });
    assert.equal(refused.ok, false);
    assert.ok(refused.stale, 'the refusal says how it moved');
    assert.equal(review.state(C1), 'pending');
    ok(review.accept(moved, [C1], ROGER, { at: NOW, staleSeen: true }));
    assert.equal(review.state(C1), 'accepted');
  });
});

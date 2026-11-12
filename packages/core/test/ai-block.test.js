// What an AI review found, kept in an AI block beside the graph (editor spec §19, ai_block and ai_block_not_data):
// ai-block.ts. The graph block is never rewritten. The block names the reviewer and the time, and one undo takes the
// save back. Its level names label the drawing, marked as the AI's. Anything else reaches the graph only as a proposal.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { aiLevelsIn, aiReviewIn, readAiBlock, reviewChanges, saveAiReview, writeAiBlock } from '../src/ai-block.ts';
import { keepProposal, levelsReview } from '../src/ai-block-keep.ts';
import { dataKind, gqlSpans } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { onlyMetadata } from '../src/metadata-write.ts';
import { namedLevels } from '../src/named-levels.ts';

const GRAPH = "// graph: trip\n(ann:Task {name: 'Rent'}),\n(bob:Task {name: 'Food', subject: 'Home'})";
const NOTE = `# Trip\n\nSome prose.\n\n\`\`\`gql\n${GRAPH}\n\`\`\`\n\nMore prose.\n`;
const review = (over = {}) => ({
  name: 'trip_ai',
  on: 'trip',
  by: 'LM Studio',
  reviewer: 'private',
  at: '2026-11-12T14:20Z',
  levels: new Map([
    ['ann', { subject: 'Money', area: 'Budget' }],
    ['bob', { subject: 'Money', area: 'Shops' }],
  ]),
  findings: [{ thing: 'ann', key: 'category', value: 'Bills', certainty: 'likely', reason: 'monthly' }],
  ...over,
});

describe('an AI review is saved in its own block (ai_block)', () => {
  test('beside the graph, never in it, naming the reviewer and the time', () => {
    const r = saveAiReview(NOTE, GRAPH, review());
    assert.ok('text' in r);
    const spans = gqlSpans(r.text).map((s) => s.text);
    assert.equal(spans[0], GRAPH, 'the graph block is byte for byte the same');
    assert.match(
      spans[1],
      /^\/\/ graph: trip_ai · AI ON trip\n\(review:Review \{by: 'LM Studio', reviewer: 'private', at: '2026-11-12T14:20Z'\}\)/,
    );
    assert.equal(dataKind(spans[1]), null, 'an AI block is never data to draw');
    assert.ok(onlyMetadata(NOTE, r.text), 'only metadata changed: the prose and the graph are as they were');
  });

  test('reads back as it was written', () => {
    const back = aiReviewIn(saveAiReview(NOTE, GRAPH, review()).text, 'trip');
    assert.equal(back.by, 'LM Studio');
    assert.equal(back.reviewer, 'private');
    assert.equal(back.at, '2026-11-12T14:20Z');
    assert.deepEqual([...back.levels], [...review().levels]);
    assert.deepEqual(back.findings, review().findings);
    assert.equal(writeAiBlock(back), writeAiBlock(review()));
  });

  test('a second save replaces the block, so the note keeps one', () => {
    const once = saveAiReview(NOTE, GRAPH, review()).text;
    const twice = saveAiReview(once, GRAPH, review({ at: '2026-11-13T09:00Z', reviewer: 'public' })).text;
    assert.equal((twice.match(/AI ON trip/g) ?? []).length, 1);
    assert.equal(aiReviewIn(twice, 'trip').reviewer, 'public');
  });

  test('one undo is the note as it was, and the save is refused when the graph changed since it was shown', () => {
    const r = saveAiReview(NOTE, GRAPH, review());
    assert.ok(onlyMetadata(r.text, NOTE));
    assert.match(saveAiReview(NOTE, GRAPH.replace('Rent', 'Rates'), review()).refused, /changed since it was shown/);
  });
});

describe('what the block holds is the AI’s (ai_block_not_data)', () => {
  test('AI level names label the drawing, marked as named by AI, only where the person named none', () => {
    const thing = (key, texts = {}) => ({ key, text: key, kinds: [], texts: new Map(Object.entries(texts)) });
    const ai = review().levels;
    const levels = namedLevels({ things: [thing('ann'), thing('bob')], links: [], aiLevels: ai });
    assert.deepEqual(
      levels.map((l) => [l.name, !!l.byAi]),
      [
        ['Subjects, named by AI', true],
        ['Areas, named by AI', true],
        ['Every item', false],
      ],
    );
    assert.deepEqual(
      levels[0].groups.map((g) => g.name),
      ['Money'],
    );
    // the person's own names win: the AI's are not mixed in
    const own = namedLevels({ things: [thing('ann', { subject: 'Home' }), thing('bob')], links: [], aiLevels: ai });
    assert.ok(own.every((l) => !l.byAi));
    assert.deepEqual(
      own[0].groups.map((g) => g.name),
      ['Home', 'No subject'],
    );
  });

  test('a note read with its AI block gives the drawing the AI’s names, never the graph', () => {
    const note = saveAiReview(NOTE, GRAPH, review()).text;
    const reading = readNote(gqlSpans(note).map((s) => s.text));
    const d = reading.graphs.get('trip');
    assert.deepEqual(d.aiLevels.get('ann'), { subject: 'Money', area: 'Budget' });
    assert.equal(reading.world.trip.p('ann').category, undefined, 'a finding is not data');
    assert.equal(reading.world.trip.p('ann').subject, undefined, 'an AI name is not data');
    assert.deepEqual(
      aiLevelsIn(
        gqlSpans(note).map((s) => s.text),
        'trip',
      ).get('bob'),
      { subject: 'Money', area: 'Shops' },
    );
  });

  test('anything else reaches the graph only as a proposal, and one that changes nothing is left out', () => {
    const now = (thing, key) => (thing === 'bob' && key === 'area' ? 'Shops' : undefined);
    const changes = reviewChanges(review(), now);
    assert.deepEqual(
      changes.map((c) => [c.op, c.thing, c.key, c.value]),
      [
        ['set', 'ann', 'subject', "'Money'"],
        ['set', 'ann', 'area', "'Budget'"],
        ['set', 'bob', 'subject', "'Money'"],
        ['set', 'ann', 'category', "'Bills'"],
      ],
    );
    assert.ok(changes.every((c) => c.group === 'Found by LM Studio, 2026-11-12T14:20Z'));
  });

  test('an unreadable block still draws, and says what it could not use', () => {
    const broken =
      "// graph: trip_ai · AI ON trip\n(review:Review {by: 'X'}),\n(zed:Levels {subject: 'Gone'}),\n(odd:Thing {}),\n(ann:Levels {subject: ";
    const note = `${NOTE}\n\`\`\`gql\n${broken}\n\`\`\`\n`;
    const reading = readNote(gqlSpans(note).map((s) => s.text));
    assert.ok(reading.graphs.get('trip'), 'the graph is still drawn');
    assert.ok(reading.problems.filter((p) => p.block === 1).every((p) => p.severity !== 'error'));
    const good =
      "// graph: trip_ai · AI ON trip\n(zed:Levels {subject: 'Gone'}),\n(odd:Thing {}),\n(ann:Levels {subject: 'Money'})";
    const read = readAiBlock(good, new Set(['ann', 'bob']));
    assert.deepEqual([...read.review.levels.keys()], ['ann']);
    assert.deepEqual(read.problems.map((p) => p.code).sort(), ['GN911', 'GN912']);
  });
});

describe('from the AI block to the graph, only as a person asks', () => {
  test('a levels answer is saved to the AI block, keeping what the block held for things it leaves out', () => {
    const was = review();
    const changes = [
      { op: 'set', thing: 'ann', key: 'subject', value: "'Home'" },
      { op: 'set', thing: 'ann', key: 'topic', value: "'Rent'" },
      { op: 'set', thing: 'ann', key: 'colour', value: "'red'" },
    ];
    const r = levelsReview(changes, 'trip', { by: 'Qwen', reviewer: 'private', at: '2026-11-13T08:00Z' }, was);
    assert.equal(r.name, 'trip_ai');
    assert.equal(r.by, 'Qwen');
    assert.deepEqual(r.levels.get('ann'), { subject: 'Home', topic: 'Rent' });
    assert.deepEqual(r.levels.get('bob'), { subject: 'Money', area: 'Shops' });
    assert.deepEqual(r.findings, was.findings);
  });

  test('Keep as mine is a proposal of what the graph does not carry yet, written only when a person applies it', () => {
    const note = saveAiReview(NOTE, GRAPH, review()).text;
    const p = keepProposal(note, 'trip', '2026-11-12');
    assert.ok(!('refused' in p));
    assert.equal(p.provenance.by.kind, 'model');
    assert.equal(p.provenance.by.name, 'LM_Studio');
    assert.deepEqual(
      p.changes.map((c) => [c.thing, c.key, c.value]),
      [
        ['ann', 'subject', "'Money'"],
        ['ann', 'area', "'Budget'"],
        ['bob', 'subject', "'Money'"],
        ['bob', 'area', "'Shops'"],
        ['ann', 'category', "'Bills'"],
      ],
    );
    assert.match(keepProposal(NOTE, 'trip', '2026-11-12').refused, /nothing found by your AI/);
  });
});

// Describing a picture with AI, only when its own metadata cannot (editor spec §18, image_describe_auto). A private
// reviewer is asked by default. A public one is asked only when the settings allow it, and none when it is off. The
// answer is held to what the graph has, and lands in the AI block as findings, never in the graph.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { describePlan, imageBody, imageReview, readDescription } from '../src/ai-image.ts';
import { readAiBlock, writeAiBlock } from '../src/ai-block.ts';
import { reachFrom, REACH_OPTIONS } from '../src/settings-reach.ts';
import { imageMetadata } from '../src/image-metadata.ts';
import { jpegWith, pngWith, xmpPacket, xmpSegment } from './image-meta-bytes.js';

const bare = pngWith({});
const none = { keywords: [] };
const head = { by: 'LM Studio', reviewer: 'private', at: '2026-11-15T07:00Z' };
const answer = (over = {}) =>
  JSON.stringify({
    title: 'A red bike',
    kind: 'photo',
    seen: ['a bike', 'a wall'],
    text: ['SALE'],
    topics: ['Bikes', 'Invented'],
    certainty: 'likely',
    reason: 'clear photo',
    ...over,
  });

describe('a picture is described only when its metadata cannot, and only as allowed', () => {
  // proves: image_describe_auto
  test('a private reviewer is asked for a picture with no metadata of its own', () => {
    assert.deepEqual(describePlan({ setting: 'private', meta: none, reach: 'private', bytes: bare }), { ask: true });
  });

  // proves: image_meta_first
  test('no AI is asked when the metadata gives a title and a caption', () => {
    const covered = jpegWith([xmpSegment(xmpPacket({ title: 'T', description: 'D' }))]);
    const plan = describePlan({ setting: 'private', meta: imageMetadata(covered), reach: 'private', bytes: covered });
    assert.ok('skip' in plan);
  });

  // proves: image_describe_off
  test('turning it off asks no reviewer at all', () => {
    assert.ok('skip' in describePlan({ setting: 'off', meta: none, reach: 'private', bytes: bare }));
    assert.equal(reachFrom({ aiImages: 'off' }).aiImages, 'off');
    assert.equal(reachFrom({}).aiImages, 'private');
    assert.ok(REACH_OPTIONS.some((o) => o.key === 'aiImages'));
  });

  // proves: image_describe_private
  test('a public reviewer is sent a picture only when the settings say so', () => {
    assert.ok('skip' in describePlan({ setting: 'private', meta: none, reach: 'public', bytes: bare }));
    assert.deepEqual(describePlan({ setting: 'public', meta: none, reach: 'public', bytes: bare }), { ask: true });
    assert.ok('skip' in describePlan({ setting: 'private', meta: none, reach: null, bytes: bare }));
  });

  // proves: image_describe_auto
  test('a file that is no raster picture, or is over the limit, is not sent', () => {
    assert.ok(
      'skip' in describePlan({ setting: 'private', meta: none, reach: 'private', bytes: Uint8Array.from([1, 2, 3]) }),
    );
    const big = new Uint8Array(4_000_001);
    big.set(bare);
    assert.ok('skip' in describePlan({ setting: 'private', meta: none, reach: 'private', bytes: big }));
  });

  // proves: image_describe_auto
  test('the request carries the picture as one data address, and tells the model to say only what is seen', () => {
    const body = JSON.parse(imageBody('m', bare, ['Bikes', 'A`B']));
    const [text, image] = body.messages[1].content;
    assert.match(image.image_url.url, /^data:image\/png;base64,/);
    assert.match(body.messages[0].content, /Do not name or identify people/);
    assert.match(text.text, /Bikes/);
    assert.equal(text.text.includes('A`B'), false);
  });
});

describe('what a model says of a picture is held to rules and kept as findings', () => {
  // proves: image_describe_proposal
  test('topics the graph does not have are dropped, and a kind it is not given is other', () => {
    const d = readDescription(answer({ kind: 'sunset' }), ['Bikes', 'Cars']);
    assert.deepEqual(d.topics, ['Bikes']);
    assert.equal(d.kind, 'other');
    assert.equal(d.title, 'A red bike');
  });

  // proves: image_describe_proposal
  test('an answer a model put in a code fence is still read', () => {
    assert.equal(readDescription(`\`\`\`json\n${answer()}\n\`\`\``, []).title, 'A red bike');
  });

  // proves: image_describe_proposal
  test('an answer with no title, no certainty, no reason or not JSON is refused', () => {
    assert.ok('unread' in readDescription(answer({ title: '' }), []));
    assert.ok('unread' in readDescription(answer({ certainty: 'sure' }), []));
    assert.ok('unread' in readDescription(answer({ reason: '' }), []));
    assert.ok('unread' in readDescription('not json', []));
    assert.ok('unread' in readDescription('[1]', []));
  });

  // proves: image_describe_proposal
  test('the AI block holds the file’s own words and the AI’s, each saying how sure it is, and reads back', () => {
    const meta = { title: undefined, caption: 'From the file', keywords: ['bike'], date: '2024-05-01' };
    const d = readDescription(answer(), ['Bikes']);
    const review = imageReview('trip', 'pic1', meta, d, head);
    const keys = review.findings.map((f) => f.key);
    assert.deepEqual(keys, [
      'caption',
      'keywords',
      'taken',
      'title',
      'picture_kind',
      'seen',
      'text_in_picture',
      'topics',
    ]);
    assert.equal(review.findings.find((f) => f.key === 'caption').certainty, 'almost-certain');
    assert.equal(review.findings.find((f) => f.key === 'title').certainty, 'likely');
    const back = readAiBlock(writeAiBlock(review), new Set(['pic1'])).review;
    assert.equal(back.findings.length, review.findings.length);
  });

  // proves: image_describe_proposal
  test('a title the file gives is never replaced by the AI’s, and a new description replaces the old', () => {
    const d = readDescription(answer(), []);
    const first = imageReview('trip', 'pic1', { title: 'Mine', keywords: [] }, d, head);
    assert.equal(first.findings.filter((f) => f.key === 'title').length, 1);
    assert.equal(first.findings.find((f) => f.key === 'title').value, 'Mine');
    const second = imageReview('trip', 'pic1', none, readDescription(answer({ title: 'New' }), []), head, first);
    assert.deepEqual(
      second.findings.filter((f) => f.key === 'title').map((f) => f.value),
      ['New'],
    );
  });
});

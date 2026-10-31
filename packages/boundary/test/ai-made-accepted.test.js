// What an AI proposed and a person accepted is AI-made at the boundary (ARCH-14). The accept path marks each thing and
// link a model adds with proposer_kind, and a thing whose value a model set as ai_assisted. So a setting's AI rule
// removes, labels or holds it. What a person proposed carries no mark. Proposals are made and accepted through the
// core's own review, the path the editor uses.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ProposalReview, basisOf, makeProposal, readNote } from '@thoughtknot/core';
import { makeParcel } from '../src/index.ts';
import { setting } from './helpers.js';

const PATH = 'Work/Shop.md';
const SHOP = "// graph: shop\n(w:Product {name: 'Widget', price: 10})";
const NOTE = `# Shop\n\n\`\`\`gql\n${SHOP}\n\`\`\`\n`;
const ROGER = { name: 'roger' };
const CHANGES = [
  { op: 'add', gql: "(g:Product {name: 'Gadget', proposer_kind: 'person'})" },
  { op: 'add', gql: '(w)-[:SOLD_WITH]->(g)' },
  { op: 'set', thing: 'w', key: 'price', value: '11' },
];

const PEOPLE = "\n```gql\n// graph: people\n(bea:Person {name: 'bea'})\n```\n";

/** The note after a person accepts every change `by` proposed. A person proposer is declared in the note. */
function accepted(by) {
  const note = by.kind === 'person' ? NOTE + PEOPLE : NOTE;
  const made = makeProposal({
    id: 'cs1',
    graph: 'shop',
    by,
    at: null,
    read: [],
    basis: basisOf(note, 'shop'),
    changes: CHANGES,
  });
  assert.ok(!('refused' in made), made.refused);
  const r = new ProposalReview(made).accept(note, { all: true }, ROGER);
  assert.equal(r.ok, true, `refused: ${r.reason ?? ''}`);
  return r.note;
}

const send = (text, ai) => makeParcel({ path: PATH, text }, setting(ai), { date: '2026-10-31' });
const shopOf = (crossing) => {
  const md = crossing.parcel.files.find((f) => f.type === 'text/markdown').text;
  const shop = readNote([...md.matchAll(/```gql\n([\s\S]*?)\n```/g)].map((m) => m[1])).whole['shop'];
  return { nodes: shop?.nodes ?? new Map() };
};

describe('boundary_contract: accepted AI proposals', () => {
  // proves: boundary_contract
  test('a model’s accepted things and links are left out and listed under the remove rule', () => {
    const removed = send(accepted({ name: 'ada', kind: 'model' }), 'remove');
    assert.ok(removed.ok);
    assert.deepEqual(
      [...shopOf(removed).nodes.keys()],
      [],
      'the new thing, and the thing whose price ada set, stay home',
    );
    const out = removed.parcel.manifest.left.filter((l) => l.kind === 'ai-removed').map((l) => l.thing);
    assert.deepEqual(out.sort(), ['g', 'w'], 'a mark the model wrote itself is written over');
  });

  // proves: boundary_rules_on_export
  test('they are labelled by default, and held for a person when the setting holds', () => {
    const note = accepted({ name: 'ada', kind: 'model' });
    assert.deepEqual(send(note, 'hold'), {
      ok: false,
      why: 'hold',
      aiThings: ['shop/w', 'shop/g', 'shop/w-SOLD_WITH->g'],
    });
    const labelled = send(note, 'label');
    assert.deepEqual(labelled.parcel.manifest.aiLabelled, ['shop/w', 'shop/g', 'shop/w-SOLD_WITH->g']);
  });

  // proves: accepting_is_an_edit
  test('what a person proposed is written as proposed, and crosses as a person’s', () => {
    const note = accepted({ name: 'bea', kind: 'person' });
    assert.doesNotMatch(note, /ai_assisted|proposer_kind: 'model'/);
    const crossing = send(note, 'remove');
    assert.deepEqual([...shopOf(crossing).nodes.keys()].sort(), ['g', 'w']);
  });
});

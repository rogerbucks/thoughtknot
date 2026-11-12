// From an AI block to the graph, only as a person asks (editor spec §19, ai_block_not_data; ai_levels). What your AI
// found stays its own in the AI block (ai-block.ts). Two steps move it on, each one edit that one undo takes back:
// - an answer naming the levels is saved to the AI block, never to the graph block (`levelsReview`);
// - "Keep as mine" turns the block's names and findings into a proposal, which the person reviews and applies like
//   any other (`keepProposal`). Only then are they the person's, as plain properties of the things.
// Kept apart from ai-block.ts, which the note reader uses, so that reading a note never reaches the proposal writer.
import { aiBlockName, aiReviewIn } from './ai-block.ts';
import type { AiReview, LevelNames } from './ai-block.ts';
import type { Value } from '@thoughtknot/graph-spec';
import { gqlSpans } from './blocks.ts';
import { readNote } from './drawing.ts';
import { ALTITUDES } from './named-levels.ts';
import { basisOf } from './proposals-basis.ts';
import { makeProposal, valueGql } from './proposals.ts';
import type { ChangeInput, Proposal } from './proposals.ts';
import { word } from './words.ts';

/** A value as GQL writes it, read back: a text, a number, or true or false; undefined for anything else. */
function valueOf(gql: string): string | number | boolean | undefined {
  const v = readNote([`// graph: v\n(v:T {k: ${gql}})`]).world.v?.p('v').k;
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : undefined;
}

/**
 * The AI block a levels answer makes for `graph`: each thing's names from its changes, with who and when. `was` is the
 * block already there, if any: its findings are kept, and its names for things the answer leaves out.
 */
export function levelsReview(
  changes: readonly ChangeInput[],
  graph: string,
  head: Pick<AiReview, 'by' | 'reviewer' | 'at'>,
  was: AiReview | null = null,
): AiReview {
  const levels = new Map<string, LevelNames>(was?.levels ?? []);
  const fresh = new Map<string, LevelNames>();
  for (const c of changes) {
    if (c.op !== 'set' || !(ALTITUDES as readonly string[]).includes(c.key)) continue;
    const v = valueOf(c.value);
    if (typeof v !== 'string') continue;
    fresh.set(c.thing, { ...fresh.get(c.thing), [c.key]: v });
  }
  for (const [thing, names] of fresh) levels.set(thing, names);
  return { name: aiBlockName(graph), on: graph, ...head, levels, findings: was?.findings ?? [] };
}

/**
 * "Keep as mine": the proposal that writes what the AI block of `graph` holds into the graph, or why there is none. A
 * person reviews and applies it. A name or value the graph already carries is left out. `at` is today.
 */
export function keepProposal(note: string, graph: string, at: string): Proposal | { refused: string } {
  const review = aiReviewIn(note, graph);
  if (!review) return { refused: word('ai-block.none', { graph }) };
  const g = readNote(gqlSpans(note).map((s) => s.text)).world[graph];
  const changes = reviewChanges(review, (thing, key) => (g?.nodes.has(thing) ? g.p(thing)[key] : undefined)).filter(
    (c) => c.op === 'set' && !!g?.nodes.has(c.thing),
  );
  if (!changes.length) return { refused: word('ai-block.nothing-new') };
  const by = review.by.trim().replace(/\s+/g, '_') || 'ai';
  return makeProposal({
    id: `kept_${graph}_ai`.replace(/[^A-Za-z0-9_-]/g, '_'),
    graph,
    by: { name: by, kind: 'model' },
    at,
    read: [review.name],
    basis: basisOf(note, graph),
    changes,
  });
}

/** The words that say who found something and when, for the review's group in a proposal. */
const foundBy = (r: AiReview) => word('ai-block.found-by', { by: r.by || '?', at: r.at || '?' });

/**
 * What the review would change in the graph, as a proposal's changes, for a person to apply (ai_block_not_data). That
 * is a set of each level name a thing does not carry yet (Keep as mine), and each finding. Nothing is applied here.
 * `now` is the graph's value of a key for a thing, so a change that would change nothing is left out.
 */
export function reviewChanges(review: AiReview, now: (thing: string, key: string) => Value | undefined): ChangeInput[] {
  const group = foundBy(review);
  const out: ChangeInput[] = [];
  for (const [thing, names] of review.levels)
    for (const a of ALTITUDES) {
      const v = names[a];
      if (v !== undefined && now(thing, a) !== v) out.push({ op: 'set', thing, key: a, value: valueGql(v), group });
    }
  for (const f of review.findings)
    if (now(f.thing, f.key) !== f.value)
      out.push({
        op: 'set',
        thing: f.thing,
        key: f.key,
        value: valueGql(f.value),
        group,
        ...(f.reason !== undefined && { reason: f.reason }),
      });
  return out;
}

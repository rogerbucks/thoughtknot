// What an AI review found, kept beside the graph (editor spec §19, ai_block and ai_block_not_data; Roger, 7 Nov 2026,
// R8). It is a block of its own after the graph, never the graph block: `// graph: trip_ai · AI ON trip`.
//   (review:Review {by: 'LM Studio', reviewer: 'private', at: '2026-11-12T14:20Z'}),
//   (ann:Levels {subject: 'Money', area: 'Budget', topic: 'Rent'}),
//   (f1:Finding {thing: 'ann', key: 'category', value: 'Food', certainty: 'likely', reason: 'a shop'})
// One Review says which reviewer found it, private or public, and when. Each Levels line names one thing's subject,
// area and topic, keyed by the thing's name in the graph, as a layout place is. Each Finding is one value the AI
// suggests for a thing.
// - What the block holds is the AI's, never the person's. Level names may label the drawing, marked as named by AI
//   (named-levels.ts). Everything else reaches the graph only as a proposal a person applies (person_decides).
// - A block that cannot be read never stops the drawing: whatever can be read is kept, the rest is a problem.
// - The note is the truth: an index built from the block can be thrown away and rebuilt.
// Host-free and pure: each writer gives back the new text, one edit that one undo takes back.
import gs from '@thoughtknot/graph-spec';
import type { Value } from '@thoughtknot/graph-spec';
import { aiBlockOf, gqlSpans } from './blocks.ts';
import { quoted } from './lock.ts';
import { metadataWrite } from './metadata-write.ts';
import { ALTITUDES } from './named-levels.ts';
import type { Problem } from './note-reading.ts';
import { readBlocks, REREAD_BUDGET } from './partial-read.ts';
import { word } from './words.ts';
import { writtenIn } from './written-things.ts';

export { aiBlockOf };

/** One thing's names for the levels, far to near: any of subject, area and topic. */
export type LevelNames = Partial<Record<(typeof ALTITUDES)[number], string>>;

/** One value the AI suggests for a thing: never applied until a person applies it. */
export interface Finding {
  thing: string;
  key: string;
  value: string | number | boolean;
  certainty?: string;
  reason?: string;
}

/** What one AI review found for a graph. */
export interface AiReview {
  /** The block's own name: the graph's name and `_ai`. */
  name: string;
  /** The graph it reviewed. */
  on: string;
  /** The model that reviewed it, as named in the settings. */
  by: string;
  /** Whether it ran on the person's own machines (private) or a cloud model (public); private by default (R7). */
  reviewer: 'private' | 'public';
  /** When: a date and time, as written. */
  at: string;
  /** The level names of each thing, by its key in the graph, in the order written. */
  levels: Map<string, LevelNames>;
  findings: Finding[];
}

/** The id of the one line that says who reviewed and when. */
const REVIEW = 'review';
const KINDS = new Set(['Review', 'Levels', 'Finding']);
const isScalar = (v: Value | undefined): v is string | number | boolean =>
  typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));

/** The name a new AI block gets: the graph's name and `_ai`. */
export const aiBlockName = (graph: string): string => `${graph}_ai`;

/**
 * What an AI block holds, with its problems. `things` are the keys of the graph's things: names or findings for any
 * other are problems and are left out, so they are never drawn. `block` is the block's place in the note. Whatever can
 * be read is kept, so an unreadable block gives an empty review and its problems, and the drawing goes on.
 */
export function readAiBlock(text: string, things?: Set<string>, block = 0): { review: AiReview; problems: Problem[] } {
  const line = aiBlockOf(text);
  const review: AiReview = {
    name: line?.name ?? '',
    on: line?.on ?? '',
    by: '',
    reviewer: 'private',
    at: '',
    levels: new Map(),
    findings: [],
  };
  const problems: Problem[] = [];
  const lineOf = new Map<string, number>();
  for (const w of writtenIn(text))
    if (w.writes && w.variable && !lineOf.has(w.variable.name))
      lineOf.set(w.variable.name, text.slice(0, w.open).split('\n').length);
  const problem = (id: string, code: string, message: string, fix: string) =>
    problems.push({ graph: review.name, block, line: lineOf.get(id) ?? 1, severity: 'warning', code, message, fix });
  let graph: ReturnType<typeof gs.worldFromStore>[string] | undefined;
  try {
    const read = readBlocks([text], [], REREAD_BUDGET, () => 'data');
    for (const p of read.problems)
      if (p.severity !== 'hint') problems.push({ ...p, graph: review.name, block, severity: 'warning' });
    graph = gs.worldFromStore(read.store)[review.name];
  } catch {
    graph = undefined;
  }
  for (const [id, [labels, props]] of graph?.nodes ?? []) {
    const kind = [...labels].find((l) => KINDS.has(l));
    if (!kind || labels.size !== 1) {
      problem(
        id,
        'GN911',
        word('ai-block.kind-unknown', { kind: [...labels].join(':') || '(none)', id }),
        word('ai-block.kind-unknown.fix'),
      );
      continue;
    }
    if (kind === 'Review') {
      if (typeof props.by === 'string') review.by = props.by;
      if (props.reviewer === 'public') review.reviewer = 'public';
      if (typeof props.at === 'string') review.at = props.at;
      continue;
    }
    const thing = kind === 'Levels' ? id : typeof props.thing === 'string' ? props.thing : '';
    if (things && !things.has(thing)) {
      problem(
        id,
        'GN912',
        word('ai-block.thing-gone', { thing: thing || id, graph: review.on }),
        word('ai-block.thing-gone.fix'),
      );
      continue;
    }
    if (kind === 'Levels') {
      const names: LevelNames = {};
      for (const a of ALTITUDES) if (typeof props[a] === 'string' && props[a].trim()) names[a] = props[a].trim();
      review.levels.set(id, names);
      continue;
    }
    if (typeof props.key !== 'string' || !isScalar(props.value)) {
      problem(id, 'GN911', word('ai-block.kind-unknown', { kind, id }), word('ai-block.kind-unknown.fix'));
      continue;
    }
    review.findings.push({
      thing,
      key: props.key,
      value: props.value,
      ...(typeof props.certainty === 'string' && { certainty: props.certainty }),
      ...(typeof props.reason === 'string' && { reason: props.reason }),
    });
  }
  problems.sort((a, b) => a.line - b.line);
  return { review, problems };
}

/** One line's properties written as GQL, in the order given, any left out when unset. */
const propsGql = (props: [string, string | number | boolean | undefined][]): string =>
  props
    .filter((p): p is [string, string | number | boolean] => p[1] !== undefined)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? quoted(v) : String(v)}`)
    .join(', ');

/** A review written as its block, in the one fixed form: the graph line, who and when, each thing's names, each finding. */
export function writeAiBlock(review: AiReview): string {
  const lines = [
    `(${REVIEW}:Review {${propsGql([
      ['by', review.by],
      ['reviewer', review.reviewer],
      ['at', review.at],
    ])}})`,
    ...[...review.levels].map(([thing, n]) => `(${thing}:Levels {${propsGql(ALTITUDES.map((a) => [a, n[a]]))}})`),
    ...review.findings.map(
      (f, i) =>
        `(f${i + 1}:Finding {${propsGql([
          ['thing', f.thing],
          ['key', f.key],
          ['value', f.value],
          ['certainty', f.certainty],
          ['reason', f.reason],
        ])}})`,
    ),
  ];
  return [
    `// graph: ${review.name} · AI ON ${review.on}`,
    ...lines.map((l, i) => (i < lines.length - 1 ? `${l},` : l)),
  ].join('\n');
}

/** The AI block of `graph` among a note's blocks, as written, if it has one. */
export const aiBlockText = (blocks: readonly string[], graph: string): string | null =>
  blocks.find((b) => aiBlockOf(b)?.on === graph) ?? null;

/**
 * The level names the AI block of `graph` gives its things, by key; none when the note has no such block or it names
 * none. Only names for `things` are given, so a name for a thing gone is never drawn.
 */
export function aiLevelsIn(
  blocks: readonly string[],
  graph: string,
  things?: Set<string>,
): Map<string, LevelNames> | undefined {
  const text = aiBlockText(blocks, graph);
  if (text === null) return undefined;
  const levels = readAiBlock(text, things).review.levels;
  return levels.size ? levels : undefined;
}

/**
 * The note with the AI block of `graph` set to `review`, or why not (ai_block). It is put right after the graph, or
 * replaces the one there, in one edit one undo takes back; the graph block is never rewritten. `shown` is the graph
 * block's text as the person saw it: when the note holds another now, nothing is written.
 */
export function saveAiReview(note: string, shown: string, review: AiReview): { text: string } | { refused: string } {
  return metadataWrite(note, review.on, 'AI', writeAiBlock(review), shown);
}

/** The review a note's AI block of `graph` holds, or null when it has none. */
export function aiReviewIn(note: string, graph: string): AiReview | null {
  const text = aiBlockText(
    gqlSpans(note).map((s) => s.text),
    graph,
  );
  return text === null ? null : readAiBlock(text).review;
}

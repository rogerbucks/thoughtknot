// Claude asks, the person decides, and the note keeps it (editor spec §49: claude_asks_decision, decision_recorded).
// A question has two to six options, each tied to things in the graph. The person's pick is written in the note's
// judgement graph (rejecting_recorded), reused when the note has one. It is typed by the standard schema decision@1
// (standard_schemas). There is a Question, and an Option for each answer that ANSWERS it. The person's Reason FAVOURS
// the one picked. The Question says who decided and when, and is WAS_ATTRIBUTED_TO the decider (W3C PROV).
// Before anything is written, the decision passes the graph spec's own change-set check (proposals_checked). It is
// checked as a change set that adds it to the judgement graph.
//
// The judgement graph's own graph line is never given `schema decision@1`: it also holds the editor's Decision records,
// which that schema does not declare. So each Question names its schema in a `schema` property instead.
import { items } from './block-items.ts';
import { gqlSpans } from './blocks.ts';
import type { GraphDrawing } from './note-reading.ts';
import { appended } from './linked-list.ts';
import { basisOf } from './proposals-basis.ts';
import { checkProposal, checkRefusal } from './proposals-check.ts';
import { judgementSpan } from './proposals-judgement.ts';
import { valueGql } from './proposals.ts';
import { STANDARD_SCHEMAS } from './standard-schemas.ts';
import { insertBlockAfter, replaceBlock } from './store.ts';
import { word } from './words.ts';

/** One answer a question offers: its label and the things of the graph it is tied to. */
export interface DecisionOption {
  label: string;
  things: string[];
}

/** A question Claude asks of the person, about one graph. */
export interface DecisionAsk {
  question: string;
  options: DecisionOption[];
}

/** What the person answered: the 0-based option picked, or null for none, and the reason they typed, if any. */
export interface DecisionAnswer {
  picked: number | null;
  reason?: string;
}

/** The fewest options a question has. */
export const OPTIONS_LEAST = 2;
/** The most options a question has. */
export const OPTIONS_MOST = 6;
/** The most characters a question's words take. */
export const QUESTION_MOST = 300;
/** The most characters an option's label takes. */
export const LABEL_MOST = 120;
/** The most characters a reason takes. */
export const REASON_MOST = 1000;

/** A question a tool was given, checked against the graph it is about; or why it is refused. */
export function readAsk(given: unknown, drawing: GraphDrawing): { ask: DecisionAsk } | { refused: string } {
  const g = (given ?? {}) as Record<string, unknown>;
  const q = g.question;
  if (typeof q !== 'string' || !q.trim() || q.length > QUESTION_MOST)
    return { refused: word('decide.question-shape', { most: QUESTION_MOST }) };
  const options = Array.isArray(g.options) ? g.options : [];
  if (options.length < OPTIONS_LEAST || options.length > OPTIONS_MOST)
    return { refused: word('decide.options-count', { count: options.length }) };
  const boxes = new Set(drawing.boxes.map((b) => b.key));
  const read: DecisionOption[] = [];
  for (const [i, o] of options.entries()) {
    const n = i + 1;
    const { label, things } = (o ?? {}) as Record<string, unknown>;
    const ok =
      typeof label === 'string' &&
      label.trim() &&
      label.length <= LABEL_MOST &&
      Array.isArray(things) &&
      things.length &&
      things.every((t) => typeof t === 'string');
    if (!ok) return { refused: word('decide.option-shape', { n, most: LABEL_MOST }) };
    const missing = things.find((t) => !boxes.has(t));
    if (missing) return { refused: word('decide.option-missing', { n, name: missing, graph: drawing.graph }) };
    if (read.some((r) => r.label === label.trim())) return { refused: word('decide.option-twice', { label }) };
    read.push({ label: label.trim(), things: [...things] });
  }
  return { ask: { question: q.trim(), options: read } };
}

/** A reason the person typed, checked; or why it is refused. An empty one is none. */
export function readReason(given: unknown): { reason?: string } | { refused: string } {
  if (given === undefined || given === null) return {};
  if (typeof given !== 'string' || given.length > REASON_MOST)
    return { refused: word('decide.reason-shape', { most: REASON_MOST }) };
  const reason = given.trim();
  return reason ? { reason } : {};
}

/** What Claude is given back: only the option picked and its reason, or that none was chosen. Nothing else. */
export function answerForClaude(ask: DecisionAsk, answer: DecisionAnswer): string {
  const picked = answer.picked === null ? null : ask.options[answer.picked];
  const said = picked ? word('decide.picked', { label: picked.label }) : word('decide.picked-none');
  return answer.reason ? `${said} ${word('decide.because', { reason: answer.reason })}` : said;
}

/** A decision to keep: the question and the answer, the graph it is about, who asked and decided, and when. */
export interface DecisionToRecord {
  graph: string;
  ask: DecisionAsk;
  answer: DecisionAnswer;
  /** Who decided, as the settings name them ("you" when they name nobody). Never a link to a Person of the data. */
  by: string;
  /** Who asked: the model's name. */
  asker: string;
  at: string;
}

/** A short hash of a text (FNV-1a), to keep node names of different questions apart. */
function shortHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

const nodeName = (s: string) => s.replace(/\W/g, '_').slice(0, 24);

/** An agent of the judgement graph, as `proposals-judgement.ts` writes one: a Person or a Model, named as typed. */
const agent = (label: 'Person' | 'Model', name: string) => {
  const node = `agent_${label.toLowerCase()}_${nodeName(name)}_${shortHash(name)}`;
  return { node, item: `(${node}:${label} {name: ${valueGql(name)}})` };
};

/** The items a decision is written as: the question, its options, the reason, and who it is attributed to. */
export function decisionItems(d: DecisionToRecord): { items: string[]; agents: string[]; decider: string } {
  const id = `q_${nodeName(d.graph)}_${shortHash(`${d.at}|${d.ask.question}`)}`;
  const picked = d.answer.picked === null ? null : d.ask.options[d.answer.picked];
  const decider = agent('Person', d.by);
  const asker = agent('Model', d.asker);
  const question = [
    `text: ${valueGql(d.ask.question)}`,
    `schema: ${valueGql('decision@1')}`,
    `graph: ${valueGql(d.graph)}`,
    `picked: ${valueGql(picked ? picked.label : '')}`,
    `decided_by: ${valueGql(d.by)}`,
    `asked_by: ${valueGql(d.asker)}`,
    `at: ${valueGql(d.at)}`,
    ...(d.answer.reason ? [`reason: ${valueGql(d.answer.reason)}`] : []),
  ];
  const option = (i: number) => `${id}_option_${i + 1}`;
  const lines = [
    `(${id}:Question {${question.join(', ')}})`,
    ...d.ask.options.map(
      (o, i) =>
        `(${option(i)}:Option {label: ${valueGql(o.label)}, things: ${valueGql(o.things.join(' '))}, ` +
        `picked: ${i === d.answer.picked}})`,
    ),
    ...d.ask.options.map((_, i) => `(${option(i)})-[:ANSWERS]->(${id})`),
    ...(d.answer.reason && picked
      ? [
          `(${id}_reason:Reason {text: ${valueGql(d.answer.reason)}})`,
          `(${id}_reason)-[:FAVOURS]->(${option(d.answer.picked as number)})`,
        ]
      : []),
    `(${id})-[:WAS_ATTRIBUTED_TO {role: ${valueGql('decided')}}]->(${decider.node})`,
    `(${id})-[:WAS_ATTRIBUTED_TO {role: ${valueGql('asked')}}]->(${asker.node})`,
  ];
  return { items: lines, agents: [decider.item, asker.item], decider: decider.node };
}

/** What writing a decision did: the note, and what the change-set check said. */
export type Recorded = { ok: true; note: string } | { ok: false; reason: string };

/**
 * The note with the person's decision kept in its judgement graph. The agents go in first, where the block lacks them,
 * as the judgement graph's seed. The decision is then checked as a change set by its decider against that graph, and
 * written only when it passes. Nothing else in the note is touched.
 */
export function recordDecision(note: string, d: DecisionToRecord, shared: readonly string[] = []): Recorded {
  const { items: lines, agents, decider } = decisionItems(d);
  const span = judgementSpan(note);
  const held = span ? items(span.text).map((it) => span.text.slice(it.from, it.to)) : [];
  const seedLines = agents.filter((a) => !held.includes(a));
  // the note with the agents in its judgement graph: the graph the decision is checked against and added to
  let seeded: { note: string; block: string; open: number } | null;
  if (span) {
    const text = seedLines.length ? appended(span.text, seedLines) : span.text;
    const w = text === span.text ? null : replaceBlock(note, { line: span.open, text: span.text }, text);
    seeded = w && !w.ok ? null : { note: w?.ok ? w.note : note, block: text, open: span.open };
  } else {
    const text = `// graph: judgements\n${seedLines.join(',\n')}`;
    const anchor = gqlSpans(note).at(-1);
    if (!anchor) {
      const eol = note.endsWith('\n') || !note ? '' : '\n';
      const next = `${note}${eol}\n\`\`\`gql\n${text}\n\`\`\`\n`;
      seeded = { note: next, block: text, open: gqlSpans(next).at(-1)?.open ?? 0 };
    } else {
      const w = insertBlockAfter(note, { line: anchor.open, text: anchor.text }, text);
      seeded = w.ok ? { note: w.note, block: text, open: w.ref.line } : null;
    }
  }
  if (!seeded) return { ok: false, reason: word('decide.not-recorded', { why: word('present.not-kept') }) };
  const schemas = [...shared, ...STANDARD_SCHEMAS];
  const graph = /^\/\/\s*graph:\s*(\w+)/.exec(seeded.block)?.[1] ?? 'judgements';
  const basis = basisOf(seeded.note, graph, schemas);
  const set =
    `// graph: ${graph} · CHANGE SET ${nodeName(lines[0]?.slice(1).split(':')[0] ?? 'decision')} · ` +
    `against sha-256-64:${basis} · by ${decider}\n// proposed: ${d.at}\n${lines.join(',\n')}`;
  const refusal = checkRefusal(checkProposal(seeded.note, set, schemas), 'counts');
  if (refusal) return { ok: false, reason: word('decide.not-recorded', { why: refusal }) };
  const after = appended(seeded.block, lines);
  const w = replaceBlock(seeded.note, { line: seeded.open, text: seeded.block }, after);
  return w.ok ? { ok: true, note: w.note } : { ok: false, reason: word('decide.not-recorded', { why: w.reason }) };
}

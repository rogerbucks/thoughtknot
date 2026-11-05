// Claude asks the person to decide, in the Claude Code pane (editor spec §49: claude_asks_decision,
// decision_person_only). One question waits at a time. Only the person may answer it:
// - by pressing an option's button in the pane, or
// - by typing `/graph pick <n> [because <reason>]` or `/graph pick none` in the composer (`fromPerson`, as for
//   `/graph confirm`).
// Claude, a tool call, a hook, a plugin and Remote Control are refused. Claude is given back only the option picked
// and the reason, or that none was chosen (answerForClaude).
import { answerForClaude, readAsk, readReason, word } from '@thoughtknot/core';
import type { DecisionAnswer, DecisionAsk, PresentStep } from '@thoughtknot/core';
import { firstDrawing, gated } from './claude-present.ts';
import type { StagePorts } from './claude-present.ts';
import { fromPerson } from './editor-words.ts';

/** The surfaces a pane is drawn on. A press there is the person's own hand on the button. */
const PANE_SURFACES: ReadonlySet<string> = new Set(['desktop', 'vscode', 'mobile', 'terminal']);

/**
 * Whether a press of a pane's button is the person's: it names a pane surface, and carries no origin but the person's
 * own. A press relayed by Remote Control (`bridge`), a plugin, a peer or a schedule is not.
 */
export function pressFromPerson(press: unknown): boolean {
  if (typeof press !== 'object' || press === null) return false;
  const p = press as { surface?: unknown; origin?: unknown };
  if (typeof p.surface !== 'string' || !PANE_SURFACES.has(p.surface)) return false;
  return p.origin === undefined || fromPerson(p.origin);
}

/** `/graph pick 2 because it is cheaper`, `/graph pick none`: the pick (1-based, or none) and the reason. */
export function pickArgs(args: string): { n: number | null; reason?: string } | null {
  const m = /^\s*pick\s+(none|\d+)(?:\s+because\s+([\s\S]*))?\s*$/i.exec(args);
  if (!m) return null;
  const n = (m[1] ?? '').toLowerCase() === 'none' ? null : Number(m[1]);
  const reason = m[2]?.trim();
  return reason ? { n, reason } : { n };
}

/** Who answered: a press in the pane, or a command typed in the composer. */
export type AnswerFrom = { press: unknown } | { origin: unknown };

const isPerson = (from: AnswerFrom): boolean =>
  'press' in from ? pressFromPerson(from.press) : fromPerson((from).origin);

/** A question waiting in the pane for the person's answer. */
export class Asking {
  readonly ask: DecisionAsk;
  readonly graph: string;
  readonly note: string;
  #done: (answer: DecisionAnswer) => void;
  #answered = false;
  /** The reason the person has typed so far, before they pick. */
  reason: string | undefined;

  constructor(ask: DecisionAsk, where: { graph: string; note: string }, done: (answer: DecisionAnswer) => void) {
    this.ask = ask;
    this.graph = where.graph;
    this.note = where.note;
    this.#done = done;
  }

  get answered(): boolean {
    return this.#answered;
  }

  /**
   * The person's answer: the 0-based option, or null for none, and a reason. Refused, with why, when it is not the
   * person's, when there is no such option, or when the question was answered already.
   */
  answer(from: AnswerFrom, picked: number | null, reason?: unknown): { ok: true } | { ok: false; why: string } {
    if (!isPerson(from)) return { ok: false, why: word('decide.not-the-person') };
    if (this.#answered) return { ok: false, why: word('decide.no-question') };
    if (picked !== null && (!Number.isInteger(picked) || picked < 0 || picked >= this.ask.options.length))
      return { ok: false, why: word('decide.no-option', { n: (picked ?? 0) + 1, count: this.ask.options.length }) };
    const r = readReason(reason ?? this.reason);
    if ('refused' in r) return { ok: false, why: r.refused };
    this.#answered = true;
    this.#done({ picked, ...(r.reason ? { reason: r.reason } : {}) });
    return { ok: true };
  }

  /** What Claude is told of an answer: only the pick and its reason, or that none was chosen. */
  said(answer: DecisionAnswer): string {
    return answerForClaude(this.ask, answer);
  }
}

/**
 * `decide`: the note past the same gate as /graph, and the question checked against its graph; or what Claude is told
 * instead. `focus` is every thing the options are tied to, which the pane picks out while the question waits.
 */
export async function decideThrough(
  ports: Pick<StagePorts, 'gate' | 'read'>,
  input: unknown,
): Promise<
  { text: string } | { path: string; graph: string; ask: DecisionAsk; focus: Pick<PresentStep, 'things' | 'links'> }
> {
  const i = (input ?? {}) as Record<string, unknown>;
  if (typeof i.note !== 'string' || !i.note.trim()) return { text: word('cc.usage') };
  const path = i.note.trim();
  const got = await gated(ports, path);
  if ('text' in got) return got;
  const drawing = firstDrawing(got.note);
  if (!drawing) return { text: word('cc.no-graph') };
  const read = readAsk(input, drawing);
  if ('refused' in read) return { text: read.refused };
  const things = [...new Set(read.ask.options.flatMap((o) => o.things))];
  return { path, graph: drawing.graph, ask: read.ask, focus: { things, links: [] } };
}

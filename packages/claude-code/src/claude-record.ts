// What the person's answer writes into a note, for the Claude Code host (editor spec §49: decision_recorded,
// presentation_kept). Node runs it as a process (bin/record-process.ts), as a mod writes no file itself. Only the person's
// own answer leads here: register.tsx sends a request only after `Asking.answer` or a Keep press took it.
import { deciderName, keepPresentation, recordDecision, word } from '@thoughtknot/core';
import type { DecisionAnswer, DecisionAsk, PresentStep } from '@thoughtknot/core';

/** A request to write: the person's decision, or a presentation they chose to keep. */
export type RecordRequest =
  | {
      kind: 'decision';
      path: string;
      graph: string;
      ask: DecisionAsk;
      answer: DecisionAnswer;
      by?: string;
      at: string;
    }
  | { kind: 'presentation'; path: string; name: string; graph: string; steps: PresentStep[] };

/** The model that asks, as the judgement graph names it. */
export const ASKER = 'Claude';

/** The note with the request written into it; or why it was not. Nothing else in the note is touched. */
export function recordInto(note: string, r: RecordRequest): { ok: true; note: string } | { ok: false; why: string } {
  if (r.kind === 'presentation') {
    const kept = keepPresentation(note, { name: r.name, graph: r.graph, steps: r.steps }, 'accepted');
    return kept.ok ? { ok: true, note: kept.note } : { ok: false, why: kept.reason };
  }
  const done = recordDecision(note, {
    graph: r.graph,
    ask: r.ask,
    answer: r.answer,
    by: deciderName(r.by),
    asker: ASKER,
    at: r.at,
  });
  return done.ok ? { ok: true, note: done.note } : { ok: false, why: done.reason };
}

/** What the pane says once the request is done: kept, or why not. */
export function saidOf(r: RecordRequest, outcome: { ok: boolean; why?: string }): string {
  if (r.kind === 'presentation')
    return outcome.ok
      ? word('present.kept', { name: r.name })
      : `${word('present.not-kept')} ${outcome.why ?? ''}`.trim();
  return outcome.ok ? word('decide.recorded') : (outcome.why ?? word('decide.not-recorded', { why: '' }));
}

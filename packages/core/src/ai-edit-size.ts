// An AI edit is the smallest change that does the job (editor spec §74, ai_smallest_edit; ethos rule r_own_voice). So
// the person's own voice stays. One proposal may change or remove at most REWRITE_MOST of the things the person wrote:
// a value already there, a thing or a link. Adding never counts. The model is told the cap. An answer past it is refused
// whole, saying why, and nothing is proposed from it. Only the person can lift the cap, with the dialog's own switch.
// The editor never guesses a rewrite from the words of the question.
import { INSTRUCTIONS, REWRITE_MOST } from './ai-request.ts';
import type { ChangeInput } from './proposals.ts';
import { word } from './words.ts';

export { REWRITE_MOST } from './ai-request.ts';

/** What the model is told: the edit instructions, with one more line when the person asked for a rewrite. */
export function editInstructions(rewrite: boolean): string {
  return rewrite
    ? `${INSTRUCTIONS}\nThe user asked for a rewrite: you may change or remove more than ${REWRITE_MOST} things.`
    : INSTRUCTIONS;
}

/**
 * How many of the changes rewrite what the person wrote: a value set where the thing already has one, and each
 * removal. `had` says whether a thing already has a property. Adding a thing, a link or a new property is not counted.
 */
export function rewritesIn(changes: readonly ChangeInput[], had: (thing: string, key: string) => boolean): number {
  return changes.filter((c) =>
    c.op === 'set' ? had(c.thing, c.key) : c.op === 'remove-thing' || c.op === 'remove-link',
  ).length;
}

/** Why the changes are too big for one proposal, in words; or null when they are within the cap or a rewrite was asked. */
export function editTooBig(
  changes: readonly ChangeInput[],
  edit: { rewrite: boolean; had: (thing: string, key: string) => boolean },
  model: string,
): string | null {
  if (edit.rewrite) return null;
  const count = rewritesIn(changes, edit.had);
  return count > REWRITE_MOST ? word('ai.edit.too-big', { model, count, most: REWRITE_MOST }) : null;
}

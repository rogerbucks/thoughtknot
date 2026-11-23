// A query that no longer fits the note (editor spec ES§75, ai_query_stale). Its rule names a kind or a property the note
// no longer has, renamed or gone. It is marked so, with the reason in words. Its words are kept, and Ask again is
// offered. Nothing is ever sent by itself: this only reads the rule against the note's kinds and property names.
//
// Host-free and pure.
import type { RuleChoices, RuleDraft } from './rule-builder.ts';
import { word } from './words.ts';

/** A rule as a query or a saved query holds it: its own filter, or the filter of each part. */
export interface RuleHeld {
  draft?: RuleDraft;
  parts?: readonly RuleHeld[];
}

/** Why `draft` no longer fits a note of `choices`, in words: a kind or property it names that the note lacks. Or null. */
function draftStale(draft: RuleDraft, choices: RuleChoices): string | null {
  if (draft.of && !choices.kinds.includes(draft.of)) return word('filter.stale.kind', { kind: draft.of });
  const fields = new Set(choices.things.map((f) => f.name));
  const gone = draft.tests.find((t) => t.field.trim() && !fields.has(t.field));
  return gone ? word('filter.stale.property', { property: gone.field }) : null;
}

/** Why the rule `q` holds no longer fits a note of `choices`, in words; or null while it fits. A merge, part by part. */
export function queryStale(q: RuleHeld, choices: RuleChoices): string | null {
  if (q.parts) {
    for (const p of q.parts) {
      const why = queryStale(p, choices);
      if (why) return why;
    }
    return null;
  }
  return q.draft ? draftStale(q.draft, choices) : null;
}

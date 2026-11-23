// Words that fit no rule (editor spec ES§75, ai_query_fuzzy). When an answer cannot be read as a rule of the note's
// kinds and properties, the person is told so in words. A wording to try is suggested, naming the properties the note
// has. It is made here from the note's own names, so nothing more is sent to make it.
//
// Host-free and pure.
import { LINKS_FIELD } from './rule-builder.ts';
import type { RuleChoices } from './rule-builder.ts';
import { word } from './words.ts';

/** That the words fit no rule of a note of `choices`, after `why` if given, with a wording to try from its names. */
export function queryFitless(choices: RuleChoices, why?: string): string {
  const props = choices.things.filter((f) => f.name !== LINKS_FIELD);
  const field = props.find((f) => f.groups) ?? props[0];
  const example = field && word('filter.fuzzy.example', { property: field.name });
  const tried = example
    ? word('filter.fuzzy.try', { example, properties: props.map((f) => f.name).join(', ') })
    : choices.kinds.length
      ? word('filter.fuzzy.try-kinds', { kinds: choices.kinds.join(', ') })
      : '';
  return [why, word('filter.fuzzy.fits-none'), tried].filter(Boolean).join(' ');
}

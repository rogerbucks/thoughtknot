// Every AI suggestion says in words how sure it is and what it rests on. That is editor spec §74,
// ai_says_how_sure, and ethos rule r_how_sure. The words are the likelihood words of a claim in a graph (graph spec §20, certainty_in_words). An edit
// or a suggestion carries one of them and what it rests on. One that lacks either is refused, with the whole answer.
// So nothing reaches the review without saying how sure it is.
import { word } from './words.ts';

/** The certainty words an AI may use: the likelihood words of graph spec §20, least likely first. */
export const CERTAINTY_WORDS = [
  'almost-no-chance',
  'very-unlikely',
  'unlikely',
  'even-chance',
  'likely',
  'very-likely',
  'almost-certain',
] as const;

/** A certainty word, as the model gave it. */
export type CertaintyWord = (typeof CERTAINTY_WORDS)[number];

/** Whether the model gave one of the certainty words. */
export const isCertainty = (v: unknown): v is CertaintyWord =>
  typeof v === 'string' && (CERTAINTY_WORDS as readonly string[]).includes(v);

/** The line the model is told, after the shape of its answer: how to say how sure it is and why. */
export const HOW_SURE_LINE = `"certainty" is how sure you are, one of: ${CERTAINTY_WORDS.join(', ')}. "reason" is what it rests on, in a few words.`;

/** What one part of an answer says of how sure it is, as the review shows it; or why it says too little. */
export function howSure(
  what: 'change',
  n: number,
  certainty: unknown,
  reason: string,
): { said: string; certainty: CertaintyWord } | { unread: string } {
  if (!isCertainty(certainty))
    return { unread: word(`ai.sure.${what}-no-word`, { n: String(n), words: CERTAINTY_WORDS.join(', ') }) };
  if (!reason) return { unread: word(`ai.sure.${what}-no-reason`, { n: String(n) }) };
  return { said: word('ai.sure.said', { certainty, why: reason }), certainty };
}

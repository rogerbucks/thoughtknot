// An AI reading of a person's tone or intent is a guess, and says so. That is editor spec ES§74, ai_guess_label, and
// ethos rule r_no_inference. The model is told to mark such a reading. The app also marks one whose reason uses the
// words of feeling or meaning. Either way, the review shows the fixed label from the words catalogue before it.
// The model's own words never set or drop that label.
import { word } from './words.ts';

/** The line the model is told: mark a reading of tone or intent, and word it as a guess. */
export const GUESS_LINE =
  'If a reason reads how someone feels or what they mean or want, add "reads": "tone" or "intent". Word it as what the text suggests, never as a fact about the person.';

// words of feeling, mood or purpose: a reason that uses one reads a person, whatever the model said
const READING =
  /\b(tone|mood|feel(s|ing|ings)?|felt|angry|anger|upset|annoyed|irritat\w*|frustrat\w*|sarcas\w*|hostil\w*|defensive|passive[- ]aggressive|happy|sad|anxious|worried|nervous|afraid|excited|enthusias\w*|confiden\w*|emotion\w*|attitude|intent\w*|intend(s|ed)?|motive\w*|meant to|means to|wants? to|wanted to|tr(y|ies|ying) to|hop(es|ing) to|seems? to want)\b/i;

/** Whether this part of an answer reads a person's tone or intent: the model says so, or its reason does. */
export const readsPerson = (reads: unknown, reason: string): boolean =>
  reads === 'tone' || reads === 'intent' || READING.test(reason);

/** What the review shows of a reading: the fixed guess label, then what the answer said. */
export const guessSaid = (said: string): string => word('ai.guess.said', { label: word('ai.guess.label'), said });

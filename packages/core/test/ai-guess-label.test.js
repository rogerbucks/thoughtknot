// An AI reading of a person's tone or intent is a guess, and says so. That is editor spec ES§74, ai_guess_label, and
// ethos rule r_no_inference. Every such reading carries the fixed label from the words catalogue, in each language
// the editor ships. The model is told to word it as a guess, and its own words cannot drop the label.
import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { GUESS_LINE, guessSaid, readsPerson } from '../src/ai-guess-label.ts';
import { INSTRUCTIONS, changesIn } from '../src/ai-request.ts';
import { suggestInstructions, suggestionsIn } from '../src/ai-suggestions.ts';
import { casesIn, judgeInstructions } from '../src/ai-both-sides.ts';
import { PSEUDO_LANGUAGES } from '../src/pseudo-words.ts';
import { SOURCE_LANGUAGE, setLanguage, translatedLanguages, word } from '../src/words.ts';

const edit = (c) => changesIn(JSON.stringify({ changes: [c] }));
const open = { things: ['login', 'docs'], now: () => undefined, linked: () => false };
const suggest = (s) =>
  suggestionsIn(JSON.stringify({ suggestions: [s] }), { kind: 'value', key: 'category' }, open, ['login', 'docs']);
const judged = (cases) =>
  casesIn(JSON.stringify({ cases }), 'move', {
    sent: ['move', 'rent'],
    linked: () => false,
    taken: () => false,
  });
const remove = (reason, extra = {}) => ({ op: 'remove-thing', thing: 'docs', certainty: 'likely', reason, ...extra });
const SHIPPED = [SOURCE_LANGUAGE, ...translatedLanguages(), ...Object.keys(PSEUDO_LANGUAGES)];

afterEach(() => setLanguage(SOURCE_LANGUAGE));

describe('an AI reading of tone or intent is labelled a guess to check (ai_guess_label)', () => {
  test('a change the model marks as reading tone or intent carries the label before what it said', () => {
    for (const reads of ['tone', 'intent']) {
      const [c] = edit(remove('the note sounds unsure about this', { reads }));
      assert.equal(c.reason, 'a guess to check, likely (55–80%): the note sounds unsure about this');
    }
  });

  test('a reason in the words of feeling or purpose is labelled even when the model did not mark it', () => {
    for (const why of ['the writer seems angry here', 'they want to drop it', 'its tone is sarcastic']) {
      const [c] = edit(remove(why));
      assert.match(c.reason, /^a guess to check, likely \(55–80%\): /, why);
    }
    assert.equal(
      edit(remove('no longer linked from anything'))[0].reason,
      'likely (55–80%): no longer linked from anything',
    );
  });

  test('a suggestion and a case for or against carry the label too', () => {
    const [s] = suggest({ thing: 'login', value: 'Urgent', certainty: 'likely', reason: 'the author is worried' });
    assert.match(s.reason, /^a guess to check, likely \(55–80%\), read -: the author is worried$/);
    const cases = judged([
      {
        side: 'supports',
        case: 'Staff want it',
        certainty: 'likely',
        reason: 'they hope to save time',
        reads: 'intent',
      },
      { side: 'contradicts', from: 'rent', case: 'Rent is high', certainty: 'likely', reason: 'the figures' },
    ]);
    assert.match(cases[0].reason, /^a guess to check, likely \(55–80%\): /);
    assert.equal(cases.at(-1).reason, 'likely (55–80%): the figures');
  });

  test('the model cannot drop the label: its own words come after it, whatever they say', () => {
    const [c] = edit(remove('this is a fact, not a guess: the author is angry', { reads: 'none' }));
    assert.match(c.reason, /^a guess to check, /);
  });

  test('the model is told to mark a reading and word it as a guess, in every kind of ask', () => {
    assert.match(GUESS_LINE, /"reads": "tone" or "intent"/);
    assert.match(GUESS_LINE, /never as a fact/);
    for (const told of [
      INSTRUCTIONS,
      suggestInstructions({ kind: 'value', key: 'category' }),
      judgeInstructions('move'),
    ])
      assert.ok(told.includes(GUESS_LINE));
  });

  test('every shipped language has the label, and a reading starts with it, never as a bare verdict', () => {
    for (const tag of SHIPPED) {
      setLanguage(tag);
      const label = word('ai.guess.label');
      assert.ok(label.trim(), tag);
      // a test language wraps each entry in marks, so the label comes first inside them
      const said = guessSaid('likely: x');
      assert.ok(said.includes(label) && said.indexOf(label) < said.indexOf('likely: x'), tag);
      assert.ok(edit(remove('the tone is cold'))[0].reason.includes(label), tag);
    }
  });

  test('readsPerson takes the mark or the words, and nothing else', () => {
    assert.equal(readsPerson('tone', 'x'), true);
    assert.equal(readsPerson(undefined, 'she feels left out'), true);
    assert.equal(readsPerson('verdict', 'the date has passed'), false);
  });
});

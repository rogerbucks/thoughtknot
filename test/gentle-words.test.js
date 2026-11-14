// Words shown for a graph's states are gentle (editor spec §51, spec_gentle_words). The state names are neutral.
// Every likelihood word is said with its range. Altitude is defined in one plain sentence.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SOURCE_WORDS } from '../packages/core/src/source-words.ts';
import { CERTAINTY_WORDS } from '../packages/core/src/ai-how-sure.ts';
import { likelihoodSaid } from '../packages/core/src/intents.ts';

/** Every sentence the app can show, with the plural forms flattened. */
const shown = Object.entries(SOURCE_WORDS).flatMap(([key, entry]) =>
  (typeof entry === 'string' ? [entry] : Object.values(entry)).map((text) => [key, text]),
);
const glossary = JSON.parse(readFileSync(new URL('../requirements/graph-spec-glossary.json', import.meta.url), 'utf8'));

describe("spec_gentle_words: words shown for a graph's states", () => {
  test('no shown sentence calls a state overdue, paradox or excuse', () => {
    assert.ok(shown.length > 500, `${shown.length} sentences read`);
    const harsh = shown.filter(([, text]) => /\b(overdue|paradox(es)?|excuses?)\b/i.test(text)).map(([key]) => key);
    assert.deepEqual(harsh, []);
  });

  test('a late revisit is said as past its revisit date', () => {
    assert.match(SOURCE_WORDS['problems.overdue'], /past its revisit date/i);
    assert.match(SOURCE_WORDS['parked.said-overdue'], /past its revisit date/i);
  });

  test('every likelihood word is said with its range', () => {
    assert.equal(CERTAINTY_WORDS.length, 7);
    for (const w of CERTAINTY_WORDS) {
      const said = likelihoodSaid(w);
      assert.ok(said.startsWith(w.replace(/-/g, ' ')), `${w} is said as words: ${said}`);
      assert.match(said, /\d+\s*[–-]\s*\d+\s*%/, `${w} carries its range: ${said}`);
    }
  });

  test('altitude is defined by a plain first sentence', () => {
    const means = findMeans(glossary, 'altitude');
    assert.ok(means.length > 0 && means.length < 160, `short: ${means}`);
    assert.match(means, /^A level of zoom\./);
  });
});

/** The `means` line of a glossary term, wherever the file keeps its list. */
function findMeans(node, term) {
  if (Array.isArray(node)) return node.map((n) => findMeans(n, term)).find(Boolean) ?? '';
  if (node && typeof node === 'object') {
    if (node.term === term && typeof node.means === 'string') return node.means;
    return (
      Object.values(node)
        .map((n) => findMeans(n, term))
        .find(Boolean) ?? ''
    );
  }
  return '';
}

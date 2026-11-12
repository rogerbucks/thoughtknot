// ThoughtKnot never guesses a medical or neurological condition from how a person uses it, writes or draws. It never
// keeps or sends a signal built for that. That is editor spec ES§74, no_condition_guess, and ethos rule r_no_inference.
// No setting, field, message or request is named for a condition, and every pull request is asked if it measures use.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { SOURCE_WORDS } from '../packages/core/src/source-words.ts';
import { OPTIONS } from '../packages/core/src/settings.ts';

const ROOT = new URL('..', import.meta.url);
const read = (f) => readFileSync(new URL(f, ROOT), 'utf8');
const said = (entry) => (typeof entry === 'string' ? [entry] : Object.values(entry));

// the names of conditions, and of detecting one: whole words, any case
const CONDITION =
  /\b(adhd|add-like|autis\w*|asperger\w*|dyslexi\w*|dyspraxi\w*|dyscalculi\w*|dementia|alzheimer\w*|parkinson\w*|tremor\w*|neurodiverg\w*|neurotypical|bipolar|ocd|ptsd|depress(ion|ive)|anxiety disorder|cognitive (decline|impairment)|mental (health|illness)|symptoms?|diagnos(e|es|ed|is|ing))\b/i;

describe('no guessing of a condition from use (no_condition_guess)', () => {
  test('the check finds a condition named, and passes plain words', () => {
    for (const t of ['adhdScore', 'Signs of dyslexia in your writing', 'detect tremor in strokes', 'diagnose focus'])
      assert.match(t.replace(/([a-z])([A-Z])/g, '$1 $2'), CONDITION, t);
    for (const t of ['Show the problems in this note', 'diagnostics', 'Focus on one thing', 'calm motion'])
      assert.doesNotMatch(t, CONDITION, t);
  });

  test('no word a person reads names a condition', () => {
    const found = Object.entries(SOURCE_WORDS).flatMap(([key, entry]) =>
      said(entry)
        .filter((t) => CONDITION.test(t))
        .map(() => key),
    );
    assert.deepEqual(found, []);
  });

  test('no setting is named for a condition, or offers one as a choice', () => {
    const named = OPTIONS.flatMap((o) => [
      o.key,
      o.name,
      o.sentence ?? '',
      ...(o.choices ?? []).map((c) => `${c.value} ${c.name}`),
    ])
      .map((t) => t.replace(/([a-z])([A-Z])/g, '$1 $2'))
      .filter((t) => CONDITION.test(t));
    assert.deepEqual(named, []);
  });

  test('no shipped source has a field, a function or a request named for a condition', () => {
    const files = execFileSync('git', ['ls-files', 'packages'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter((f) => /\/src\/.*\.(ts|tsx|js|mjs|rs|swift|kt)$/.test(f) && !/\/test\//.test(f));
    assert.ok(files.length > 100, 'the shipped sources are found');
    // the code, without its comments: a comment may say a preset is never named by diagnosis. A name in camel case is
    // read as its words, so adhdScore is "adhd Score"
    const code = (f) =>
      read(f)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
        .replace(/([a-z])([A-Z])/g, '$1 $2');
    const hits = files.filter((f) => CONDITION.test(code(f)));
    assert.deepEqual(hits, []);
  });

  test('the pull request template asks whether a change measures use', () => {
    const template = read('.github/pull_request_template.md');
    assert.match(template, /measure how a person uses, writes or draws/);
    assert.match(template, /never\s+guess a medical or neurological condition/);
  });
});

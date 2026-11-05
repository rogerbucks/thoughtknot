// Where a gql block's closing fence is (spec §3; security_fix_rule). The close is read by string checks, never a regex built from the note.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gqlSpans } from '../src/fences.ts';

test('a fence closes on a line of at least as many of the same mark, with up to 3 spaces before and only spaces after', () => {
  const note = ['```gql', 'a', '  ````  ', 'b', '```gql', 'c', '    ```', '~~~', '```', 'tail'].join('\n');
  const spans = gqlSpans(note);
  assert.deepEqual(
    spans.map((s) => [s.text, s.open, s.close]),
    [
      ['a', 0, 2],
      ['c\n    ```\n~~~', 4, 8],
    ],
  );
});

test('a longer opening fence needs a long enough close, and a tilde fence is closed only by tildes', () => {
  const note = ['~~~~gql', 'x', '~~~', '```', '~~~~~', 'y'].join('\n');
  assert.deepEqual(
    gqlSpans(note).map((s) => [s.text, s.close]),
    [['x\n~~~\n```', 4]],
  );
});

test('an unclosed block runs to the end of the note', () => {
  assert.deepEqual(
    gqlSpans('```gql\na\nb').map((s) => s.close),
    [3],
  );
});

test('the fence reader builds no regex from the note (CodeQL js/regex-injection)', () => {
  const code = readFileSync(new URL('../src/fences.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(code, /new RegExp\(/);
});

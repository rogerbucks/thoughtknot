// A bands rule, checked as it is read (editor spec §56, rule_look_bands). It names a number property, the rising steps
// it is shaded in, and what it means. Its colours and tags are the palette's, so it may not set its own. A rule
// written wrong is drawn as nothing, and its fault is a problem on its line with its fix.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { readStyle } from '../src/style.ts';

const TASKS = `// graph: work
(t1:Task {name: 'Roof', cost: 20})`;

/** The style of graph work read from one style line, with its problems. */
function styled(line) {
  const texts = [TASKS, `// graph: work_style · STYLE work\n${line}`];
  return readStyle(texts, 'work', readNote(texts));
}

describe('rule_look_bands', () => {
  test('a bands rule with steps that do not rise, too many, or no meaning says what it needs', () => {
    for (const line of [
      `(b:Look {bands: 'cost', steps: '100, 50', means: 'Cost'})`,
      `(b:Look {bands: 'cost', steps: '1, 2, 3, 4, 5, 6', means: 'Cost'})`,
      `(b:Look {bands: 'cost', steps: '50, x', means: 'Cost'})`,
      `(b:Look {bands: 'the cost', steps: '50', means: 'Cost'})`,
      `(b:Look {bands: 'cost', steps: '50'})`,
    ]) {
      const { style, problems } = styled(line);
      assert.deepEqual(style.looks, [], line);
      assert.equal(problems.length, 1, line);
      assert.match(problems[0].message, /a bands rule names a number property, up to 5 rising steps/, line);
    }
  });

  test('a bands rule that sets its own colour, badge or test is told to take it out', () => {
    for (const [line, key] of [
      [`(b:Look {bands: 'cost', steps: '50', colour: 'red', means: 'Cost'})`, 'colour'],
      [`(b:Look {bands: 'cost', steps: '50', badge: 'flag', means: 'Cost'})`, 'badge'],
      [`(b:Look {bands: 'cost', steps: '50', when: 'cost > 1', means: 'Cost'})`, 'when'],
    ]) {
      const { style, problems } = styled(line);
      assert.deepEqual(style.looks, [], line);
      assert.equal(problems.length, 1, line);
      assert.match(problems[0].message, new RegExp(`picks its own colours and tags: take out ${key}`), line);
    }
  });
});

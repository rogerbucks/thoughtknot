// A saved rule taken out from the card (editor spec §56, rule_look_remove). It is found by its meaning, in its view,
// and its line is taken out of the style graph with its comma. Nothing else in the note changes, and putting the
// note before back is the whole of Undo. A rule tried as taken out is drawn as if gone, and the note is never read.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { readStyle } from '../src/style.ts';
import { rulesFor } from '../src/rule-looks.ts';
import { withTriedRules } from '../src/rule-write.ts';
import { ruleRemoved } from '../src/rule-remove.ts';

const DATA = `// graph: work
(roof:Task {name: 'Roof', status: 'late'}),
(walls:Task {name: 'Walls', status: 'done'})`;
const LATE = `(late:Look {when: 'status == "late"', badge: 'clock', means: 'Late'})`;
const DONE = `(done:Look {when: 'status == "done"', badge: 'check', means: 'Done'})`;
const fenced = (...blocks) => blocks.map((b) => `\`\`\`gql\n${b}\n\`\`\``).join('\n\n');
const style = (...looks) => `// graph: work_style · STYLE work\n${looks.join(',\n')}`;
const blocksOf = (note) => [...note.matchAll(/```gql\n([\s\S]*?)\n```/g)].map((m) => m[1]);

/** What the rules of the graph work in `texts` give its things, with no problem in its style. */
function looksOf(texts, tried = []) {
  const reading = readNote(texts);
  const { style: read, problems } = readStyle(texts, 'work', reading);
  assert.deepEqual(problems, []);
  const shown = rulesFor(withTriedRules(read, tried), reading.world.work, reading.graphs.get('work'));
  return Object.fromEntries([...shown.things].map(([key, m]) => [key, m.means]));
}

describe('rule_look_remove', () => {
  test('a saved rule is taken out with its comma, the rest of the note as it was', () => {
    for (const [looks, left] of [
      [[LATE, DONE], [DONE]],
      [[DONE, LATE], [DONE]],
      [[LATE], []],
    ]) {
      const before = fenced(DATA, style(...looks));
      const r = ruleRemoved(before, 'work', { means: 'Late' });
      assert.ok('note' in r, r.refused);
      assert.equal(r.note, fenced(DATA, style(...left)), 'only the rule, and its comma, are gone');
      assert.deepEqual(looksOf(blocksOf(r.note)), left.length ? { walls: ['Done'] } : {});
    }
  });

  test('a rule not saved, or saved for another view, is refused with why, and nothing is taken out', () => {
    const note = fenced(DATA, style(LATE));
    assert.match(ruleRemoved(note, 'work', { means: 'Gone' }).refused ?? '', /Gone/);
    assert.match(ruleRemoved(note, 'work', { means: 'Late', view: 'roofs' }).refused ?? '', /Late/);
    assert.match(ruleRemoved(note, 'home', { means: 'Late' }).refused ?? '', /Late/, 'another graph');
  });

  test('a rule tried as taken out is drawn as if gone; the note is never read', () => {
    const texts = [DATA, style(LATE, DONE)];
    assert.deepEqual(looksOf(texts), { roof: ['Late'], walls: ['Done'] });
    assert.deepEqual(looksOf(texts, [{ means: 'Late', when: 'status == "late"', removed: true }]), {
      walls: ['Done'],
    });
  });
});

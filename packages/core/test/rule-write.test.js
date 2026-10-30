// A rule added or changed from the card (editor spec §56, rule_look_try_save). A rule that cannot be read is refused
// with why, before anything is tried or saved. A rule tried is drawn as if saved, and the note is never read. A rule
// saved is written into the style graph, and one with the same meaning in the same view is changed in place.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { readStyle } from '../src/style.ts';
import { rulesFor } from '../src/rule-looks.ts';
import { ruleRefusal, withTriedRules } from '../src/rule-write.ts';
import { styleEdit } from '../src/style-edit.ts';

const DATA = `// graph: work
(roof:Task {name: 'Roof', status: 'late'}),
(walls:Task {name: 'Walls', status: 'done'})`;
const STYLE = `// graph: work_style · STYLE work
(late:Look {when: 'status == "late"', badge: 'clock', means: 'Late'})`;
const fenced = (...blocks) => blocks.map((b) => `\`\`\`gql\n${b}\n\`\`\``).join('\n\n');
const DONE = { when: 'status == "done"', badge: 'check', means: 'Done' };

/** The style of the graph work in `note`'s blocks, with no problems, and what its rules give its things. */
function looksOf(texts, tried = []) {
  const reading = readNote(texts);
  const { style, problems } = readStyle(texts, 'work', reading);
  assert.deepEqual(problems, []);
  const shown = rulesFor(withTriedRules(style, tried), reading.world.work, reading.graphs.get('work'));
  return Object.fromEntries([...shown.things].map(([key, m]) => [key, m.means]));
}

describe('rule_look_try_save', () => {
  test('a rule that cannot be read says why', () => {
    assert.equal(ruleRefusal(DONE), null);
    assert.match(ruleRefusal({ means: 'Done', badge: 'check' }), /needs a test/);
    assert.match(ruleRefusal({ ...DONE, lens: 'late_ones' }), /\S/, 'a test and a lens, not both');
    assert.match(ruleRefusal({ ...DONE, badge: undefined }), /badge or a line/, 'never colour alone');
    assert.match(ruleRefusal({ ...DONE, when: 'status ==' }), /\S/, 'a test that does not read');
    assert.match(ruleRefusal({ ...DONE, badge: 'smile' }), /badge/);
    assert.match(ruleRefusal({ ...DONE, means: ' ' }), /\S/, 'it says what it means');
  });

  test('a rule tried is drawn as if saved, and one tried with a meaning written changes that rule', () => {
    const texts = [DATA, STYLE];
    assert.deepEqual(looksOf(texts), { roof: ['Late'] });
    assert.deepEqual(looksOf(texts, [DONE]), { roof: ['Late'], walls: ['Done'] });
    const changed = { when: 'status == "done"', badge: 'flag', means: 'Late' };
    assert.deepEqual(looksOf(texts, [changed]), { walls: ['Late'] }, 'the rule Late now finds walls');
  });

  test('a rule saved is written into the style graph and read back with no problem; saved again it is changed', () => {
    const note = fenced(DATA, STYLE);
    const once = styleEdit(note, 'work', { rule: DONE });
    assert.ok('note' in once, once.refused);
    assert.match(once.note, /:Look \{when: 'status == "done"', badge: 'check', means: 'Done'\}/);
    const blocks = [...once.note.matchAll(/```gql\n([\s\S]*?)\n```/g)].map((m) => m[1]);
    assert.deepEqual(looksOf(blocks), { roof: ['Late'], walls: ['Done'] });
    const twice = styleEdit(once.note, 'work', { rule: { ...DONE, badge: 'star' } });
    assert.equal(twice.note.match(/means: 'Done'/g).length, 1, 'changed in place, never written twice');
    assert.match(twice.note, /badge: 'star', means: 'Done'/);
  });

  test('a rule that cannot be read is never written', () => {
    const r = styleEdit(fenced(DATA, STYLE), 'work', { rule: { means: 'Done', badge: 'check' } });
    assert.match(r.refused ?? '', /needs a test/);
  });
});

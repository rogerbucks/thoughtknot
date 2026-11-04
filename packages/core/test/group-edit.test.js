// Editing a named group (editor spec §68, cloud_edit): group-edit.ts. A group is renamed, merged or taken apart by
// one property changed on each of its things, in the blocks where they are written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupEdits, groupNamedBy } from '../src/group-edit.ts';

const BLOCK = `// graph: g
(a:Note {name: 'Rent', subject: 'Money'}),
(b:Note {name: 'Food', subject: 'Money'}),
(c:Note {name: 'Run', subject: 'Health'})`;

// proves: cloud_edit
test('a named group is renamed, merged, or taken apart in the note', () => {
  assert.deepEqual(groupNamedBy('|subject=Money'), { property: 'subject', value: 'Money' });
  assert.deepEqual(groupNamedBy('|subject=Money|area=Rent'), { property: 'area', value: 'Rent' });
  assert.equal(groupNamedBy('hub:a'), null, 'a group found from links has no name to edit');
  const renamed = groupEdits([BLOCK], 'g', ['a', 'b'], 'subject', 'Budget');
  assert.equal(renamed.length, 1);
  assert.match(renamed[0].now, /\(a:Note \{name: 'Rent', subject: 'Budget'\}\)/);
  assert.match(renamed[0].now, /\(b:Note \{name: 'Food', subject: 'Budget'\}\)/);
  assert.match(renamed[0].now, /subject: 'Health'/, 'other groups untouched');
  const apart = groupEdits(['# other', BLOCK], 'g', ['c'], 'subject', null);
  assert.equal(apart[0].block, 1);
  assert.match(apart[0].now, /\(c:Note \{name: 'Run'\}\)/);
  assert.match(groupEdits([BLOCK], 'g', ['a'], 'subject', '  ').reason, /cannot be empty/);
  assert.match(groupEdits([BLOCK], 'g', ['zz'], 'subject', 'X').reason, /Nothing to change/);
});

// The earlier versions kept of the notes the editor changed (editor spec §41, changes_view_obsidian; risk NEURO-2):
// note-history.ts. A burst of changes keeps one version, the text before it, and only so many are kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BURST_MS,
  NOTES_KEPT,
  VERSION_MOST,
  VERSIONS_KEPT,
  historyFrom,
  historyMoved,
  withVersion,
} from '../src/note-history.ts';

const at = (minutes) => new Date(Date.UTC(2026, 9, 31, 8, 0) + minutes * 60_000);

// proves: changes_view_obsidian
test('the text before a burst of changes is kept once, newest first, and only so many versions', () => {
  let h = withVersion({}, 'a.md', 'one', at(0));
  assert.deepEqual(h['a.md'], [{ text: 'one', at: at(0).toISOString() }]);
  assert.equal(withVersion(h, 'a.md', 'two', at(1)), h, 'the same burst: the text before it is kept already');
  h = withVersion(h, 'a.md', 'two', at(BURST_MS / 60_000 + 1));
  assert.deepEqual(
    h['a.md'].map((v) => v.text),
    ['two', 'one'],
  );
  assert.equal(withVersion(h, 'a.md', 'two', at(60)), h, 'the very text kept last is not kept twice');
  for (let i = 0; i < VERSIONS_KEPT + 3; i++) h = withVersion(h, 'a.md', `v${i}`, at(100 + i * 10));
  assert.equal(h['a.md'].length, VERSIONS_KEPT);
  assert.equal(h['a.md'][0].text, `v${VERSIONS_KEPT + 2}`);
  assert.equal(withVersion({}, 'big.md', 'x'.repeat(VERSION_MOST + 1), at(0))['big.md'], undefined, 'too large');
});

// proves: changes_view_obsidian
test('only so many notes are kept, the one changed longest ago giving way; a renamed note keeps its versions', () => {
  let h = {};
  for (let i = 0; i <= NOTES_KEPT; i++) h = withVersion(h, `n${i}.md`, 'text', at(i));
  assert.equal(Object.keys(h).length, NOTES_KEPT);
  assert.equal(h['n0.md'], undefined, 'the oldest went');
  const moved = historyMoved(h, 'n1.md', 'renamed.md');
  assert.deepEqual(moved['renamed.md'], h['n1.md']);
  assert.equal(moved['n1.md'], undefined);
});

// proves: changes_view_obsidian
test('what was saved is read back with anything broken left out', () => {
  const good = { text: 'x', at: at(0).toISOString() };
  assert.deepEqual(historyFrom({ 'a.md': [good, { text: 1 }, { text: 'y', at: 'never' }], 'b.md': 'no' }), {
    'a.md': [good],
  });
  assert.deepEqual(historyFrom(null), {});
  assert.deepEqual(historyFrom([]), {});
});

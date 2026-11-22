// What a note opens on (editor spec ES§76, board_first_default). The whiteboard is the default view in settings; a
// person can make the graph their default instead; and a note's own choice, the graph first again, wins over both.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, OPTIONS, settingsFrom } from '../src/settings.ts';
import { opensOn } from '../src/settings-first-view.ts';

describe('board_first_default', () => {
  test('the setting starts on the whiteboard, and the settings page offers the graph instead', () => {
    assert.equal(DEFAULT_SETTINGS.firstView, 'board');
    assert.equal(settingsFrom({}).firstView, 'board');
    const option = OPTIONS.find((o) => o.key === 'firstView');
    assert.ok(option, 'shown on the settings page');
    assert.deepEqual(
      option.choices.map((c) => c.value),
      ['board', 'graph'],
    );
  });

  test('the graph can be made the default, and anything unknown is read as the whiteboard', () => {
    assert.equal(settingsFrom({ firstView: 'graph' }).firstView, 'graph');
    assert.equal(settingsFrom({ firstView: 'table' }).firstView, 'board');
    assert.equal(opensOn(settingsFrom({ firstView: 'graph' }), null), 'graph');
    assert.equal(opensOn(settingsFrom({}), undefined), 'board');
  });

  test('a note that put the graph first opens on the graph whatever the setting', () => {
    for (const firstView of ['board', 'graph']) {
      assert.equal(opensOn(settingsFrom({ firstView }), 'graph'), 'graph');
      assert.equal(opensOn(settingsFrom({ firstView }), 'board'), 'board');
    }
  });
});

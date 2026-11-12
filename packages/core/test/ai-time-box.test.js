// A time box and quiet hours for AI sessions (editor spec §74, ai_time_box; ethos rule r_time_box). With a time box set,
// AI work stops at its end and starts again the next day. In quiet hours it waits until they end. With neither set,
// nothing is limited. Both are off until the person sets them.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareSend } from '../src/ai.ts';
import { aiWaits, DEFAULT_TIME_BOX } from '../src/settings-time-box.ts';
import { DEFAULT_SETTINGS, OPTIONS, settingsFrom } from '../src/settings.ts';

// the device's own time: each date here is made in its time zone, as the person's clock reads it
const at = (day, hour, minute = 0) => new Date(2026, 10, day, hour, minute);
const sent = (...dates) => dates.map((d) => ({ at: d.toISOString() }));
const LOCAL = {
  name: 'Local',
  purpose: 'Proposing changes',
  ceiling: 'Confidential',
  endpoint: 'http://localhost:11434/v1/chat/completions',
  model: 'llama3',
  keyName: '',
};
const ask = (over, settings = {}) => ({
  settings: settingsFrom({ aiUse: 'on', aiPublic: 'note', aiModels: [LOCAL], ...settings }),
  model: 'Local',
  note: "```gql\n// graph: g\n(a:Thing {name: 'A'})\n```\n",
  notePath: 'A.md',
  level: 'Internal',
  choice: { graph: 'g', what: 'graph' },
  question: 'What is missing?',
  ...over,
});

describe('a time box and quiet hours for AI (ai_time_box)', () => {
  test('both are off until the person sets them, and with none set nothing is limited', () => {
    assert.deepEqual(DEFAULT_TIME_BOX, { aiTimeBox: 'off', aiQuietHours: 'off' });
    assert.equal(DEFAULT_SETTINGS.aiTimeBox, 'off');
    assert.equal(DEFAULT_SETTINGS.aiQuietHours, 'off');
    const busy = sent(at(12, 0, 1), at(12, 9), at(12, 23));
    assert.equal(aiWaits(DEFAULT_TIME_BOX, at(12, 23, 59), busy), null);
    assert.equal(aiWaits(DEFAULT_TIME_BOX, at(12, 3), busy), null);
  });

  test('with a time box set, AI work stops at its end and starts again the next day', () => {
    const box = { aiTimeBox: 'half-hour', aiQuietHours: 'off' };
    const first = sent(at(12, 9, 0));
    assert.equal(aiWaits(box, at(12, 9, 29), first), null, 'within the box');
    assert.match(aiWaits(box, at(12, 9, 30), first), /until tomorrow: today’s time box of 30 minutes is used up/);
    assert.match(aiWaits(box, at(12, 23, 0), first), /until tomorrow/);
    assert.equal(aiWaits(box, at(13, 0, 5), first), null, 'a new day, a new box');
    assert.equal(aiWaits(box, at(12, 9, 0), []), null, 'the box starts with the first send of the day');
  });

  test('in quiet hours AI waits until they end, across midnight', () => {
    const quiet = { aiTimeBox: 'off', aiQuietHours: 'ten-to-seven' };
    assert.equal(aiWaits(quiet, at(12, 21, 59), []), null);
    assert.match(aiWaits(quiet, at(12, 22, 0), []), /quiet hours, 22:00 to 7:00/);
    assert.match(aiWaits(quiet, at(13, 6, 59), []), /quiet hours/);
    assert.equal(aiWaits(quiet, at(13, 7, 0), []), null);
  });

  test('a send asked for while AI waits is refused before anything is made ready, saying why', () => {
    const settings = { aiTimeBox: 'quarter-hour' };
    const waiting = prepareSend(ask({ now: at(12, 10), sends: sent(at(12, 9, 0)) }, settings));
    assert.match(waiting.refused, /time box of 15 minutes is used up/);
    assert.ok(!('body' in waiting));
    assert.ok('body' in prepareSend(ask({ now: at(12, 9, 10), sends: sent(at(12, 9, 0)) }, settings)));
    assert.ok('body' in prepareSend(ask({ now: at(12, 23), sends: sent(at(12, 9, 0)) })), 'none set: no limit');
  });

  test('the settings page offers both with the AI models, and an unknown saved value reads as off', () => {
    for (const key of ['aiTimeBox', 'aiQuietHours']) {
      const o = OPTIONS.find((x) => x.key === key);
      assert.equal(o?.section, 'AI models', key);
      assert.equal(o.choices[0].value, 'off');
    }
    assert.equal(settingsFrom({ aiTimeBox: '9999', aiQuietHours: 'always' }).aiTimeBox, 'off');
    assert.equal(settingsFrom({ aiQuietHours: 'always' }).aiQuietHours, 'off');
    assert.equal(settingsFrom({ aiTimeBox: 'hour' }).aiTimeBox, 'hour');
  });
});

// ThoughtKnot has no streaks, badges, endless feeds, nags or pings meant to bring a person back. That is editor spec
// ES§74, no_hooks, and the ethos. The copy check (scripts/plain-english.mjs) fails on words that promise such a hook,
// and no record excuses one. The shipped words pass it. No shipped code sends a notification of the system's own.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { covers, hooksIn, missesOf, scoreOf } from '../scripts/plain-english.mjs';
import { SOURCE_WORDS } from '../packages/core/src/source-words.ts';

const ROOT = new URL('..', import.meta.url);
const said = (entry) => (typeof entry === 'string' ? [entry] : Object.values(entry));

describe('no streaks, badges, nags or pings (no_hooks)', () => {
  test('the copy check fails on a word that promises a streak, a badge or a come-back', () => {
    for (const text of [
      'You are on a 5-day streak!',
      'You earned a badge for mapping ten ideas.',
      'Achievement unlocked: first graph',
      'Come back tomorrow to keep it going.',
      'We miss you. You haven’t opened ThoughtKnot this week.',
      'Don’t break your daily goal: 3 days in a row.',
      'Level up by adding links.',
      'Scroll the endless feed of ideas.',
    ]) {
      assert.ok(hooksIn(text).length, text);
      assert.match(missesOf(scoreOf(text)).join('; '), /promises a hook to bring a person back/, text);
    }
  });

  test('no recorded reason excuses a hook, however generous the record', () => {
    const score = scoreOf('Keep your streak going.');
    assert.equal(covers({ text: 't', grade: 99, longest: 99, jargon: [] }, score), false);
  });

  test('plain words about looks and returns are not hooks', () => {
    for (const text of [
      'a badge marks a thing a rule picks out',
      'so the pictures come back with its next edit',
      'Your graph is saved.',
    ])
      assert.deepEqual(hooksIn(text), [], text);
  });

  test('every shipped word passes', () => {
    const found = Object.entries(SOURCE_WORDS).flatMap(([key, entry]) =>
      said(entry).flatMap((t) => hooksIn(t).map((h) => `${key}: ${h}`)),
    );
    assert.deepEqual(found, []);
  });

  test('no shipped code sends a notification of the system’s own, or sets a badge on the app', () => {
    const files = execFileSync('git', ['ls-files', 'packages'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter((f) => /\/src\/.*\.(ts|tsx|js|mjs|rs|swift|kt)$/.test(f) && !/\/test\//.test(f));
    assert.ok(files.length > 100, 'the shipped sources are found');
    const PING =
      /new Notification\(|Notification\.requestPermission|showNotification\(|plugin-notification|UNUserNotification|NotificationCompat|setAppBadge/;
    const pings = files.filter((f) => PING.test(readFileSync(new URL(f, ROOT), 'utf8')));
    assert.deepEqual(pings, []);
  });
});

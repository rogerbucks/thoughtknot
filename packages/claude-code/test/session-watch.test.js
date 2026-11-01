// The server stops when the process that started it has gone (spec §26, cc_server_stops). Windows soon gives a gone
// process's number to a new one, so there the number alone cannot say the parent is still there.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { numberReused, parentWaitLine } from '../server/session-watch.ts';

describe('on Windows, a parent number held by a newer process', () => {
  const since = Date.parse('2026-11-01T05:00:00.000Z');

  test('a process started after this one holds a reused number: the parent is gone', () => {
    assert.equal(numberReused('2026-11-01T05:00:07.250Z\r\n', since), true);
  });

  test('the parent itself started before this one: it is still there', () => {
    assert.equal(numberReused('2026-11-01T04:59:58.100Z\r\n', since), false);
  });

  test('an answer that is no time says nothing', () => {
    assert.equal(numberReused('', since), false);
    assert.equal(numberReused('Exception calling "GetProcessById"', since), false);
  });
});

describe('on Windows, one PowerShell holds the parent until it exits', () => {
  test('its line names the parent, says its start time, waits, then says it is gone', () => {
    const line = parentWaitLine(4242);
    assert.match(line, /GetProcessById\(4242\)/);
    assert.ok(line.indexOf('StartTime') < line.indexOf('WaitForExit()'), 'the start time is said before the wait');
    assert.match(line, /catch \{ 'gone'; exit \}/, 'a parent already gone is said at once');
    assert.match(line, /WaitForExit\(\); 'gone'$/);
  });
});

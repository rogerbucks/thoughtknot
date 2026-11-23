// The phone app's way to a model (editor spec ES§19, app_ai_host). It reaches a model only through its AI
// plug-in's commands, which one module alone names. So no other code can send to a model, or ask for a key, behind the
// send sheet's back. No command reads a key back at all: the device writes the key into a request to the address
// it was kept for. The network scan in policy.test.js cannot see a plug-in command, so this test holds that line.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { read, sourceFiles } from './repository/repo.js';

const APP_AI_COMMANDS_MODULE = 'packages/app/src/app-ai.ts';
const APP_AI_COMMAND = /plugin:ai\||\bai_(?:here|request|on_device_ask|key_set|key_has|key_forget|key_get)\b/;

describe('the phone app’s AI plug-in', () => {
  test('only the phone app’s AI module calls its commands', () => {
    assert.ok(sourceFiles().includes(APP_AI_COMMANDS_MODULE), 'the app’s source is scanned');
    const offenders = sourceFiles().filter((f) => f !== APP_AI_COMMANDS_MODULE && APP_AI_COMMAND.test(read(f)));
    assert.deepEqual(offenders, []);
    assert.match(read(APP_AI_COMMANDS_MODULE), APP_AI_COMMAND);
  });

  test('no command reads a key back to the page', () => {
    assert.doesNotMatch(read(APP_AI_COMMANDS_MODULE), /ai_key_get/);
  });
});

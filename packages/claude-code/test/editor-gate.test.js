// The gate inside the editor's server (spec §26, cc_classified_asks; TRUST-4). A file of the note's repository read for
// a review, with no classification, counts as the level the settings set for unlabelled repository files. That is the
// lowest until the user chooses a stricter one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storeGate } from '../server/editor-gate.ts';
import { gateSettings } from '../server/editor-main.ts';
import { settingsForServer } from '../src/editor-settings-env.ts';

const LEVELS = ['Public', 'Internal', 'Confidential', 'Restricted'];
const claude = { name: 'Claude', purpose: '', ceiling: 'Internal', endpoint: '', model: '', keyName: '' };
const raw = (over = {}) => JSON.stringify({ classifications: LEVELS, aiModels: [claude], ...over });

test('a repository file with no classification is let through at the lowest level until the settings ask for more', () => {
  const plain = storeGate(gateSettings(raw()), null);
  assert.equal(plain.file('A plain file.'), null);
  const strict = storeGate(gateSettings(raw({ aiRepoUnlabelled: 'Confidential' })), null);
  const why = strict.file('A plain file.');
  assert.ok(why, 'a stricter default holds back a file with no classification');
  assert.equal(strict.file('---\nclassification: Public\n---\nA public file.'), null, 'a labelled file keeps its own');
});

test('a level that is not a classification falls back to the lowest, and the mod hands the setting on', () => {
  assert.equal(gateSettings(raw({ aiRepoUnlabelled: 'Top secret' })).aiRepoUnlabelled, 'Public');
  const handed = JSON.parse(
    settingsForServer({
      classifications: LEVELS,
      aiUnlabelled: 'Restricted',
      aiRepoUnlabelled: 'Internal',
      aiModels: [],
    }),
  );
  assert.equal(handed.aiRepoUnlabelled, 'Internal');
});

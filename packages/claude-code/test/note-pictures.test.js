// Whether each picture for readers of a note is up to date (editor spec §62, picture_hidden_when_drawn). The editor
// server says it for the page's bar. Only the mark at the start of a picture is read, and only up to date or out of
// date is sent. A picture is never read through a link, from a hidden folder, or past the gate.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pictureFingerprint, pictureTexts } from '@thoughtknot/core';
import { storeGate } from '../server/editor-gate.ts';
import { ask } from './editor-threats-support.js';
import { PLAN, bearer, served, tempVault } from './editor-store-support.js';

const LINE = '![The plan](plan.plan.thoughtknot.svg)';
const NOTE = PLAN.replace('```\nThe end.', `\`\`\`\n${LINE}\nThe end.`);
const svg = (fingerprint) =>
  `<svg xmlns="http://www.w3.org/2000/svg">\n<metadata>thoughtknot reader picture ${fingerprint}</metadata>\n` +
  '<title>The secret drawing</title></svg>\n';
const fresh = (text) => svg(pictureFingerprint('Notes/plan.md', pictureTexts(text, 'plan')));

/** The vault with the plan note as `text` and `picture` beside it (none when null), opened, and its pictures asked for. */
async function asked(text, picture, options = {}) {
  const v = tempVault();
  writeFileSync(v.plan, text);
  if (picture !== null) writeFileSync(join(v.vault, 'Notes/plan.plan.thoughtknot.svg'), picture);
  const { store, server } = await served(v, options);
  const opened = await store.open('Notes/plan.md');
  assert.equal(opened.ok, true, opened.why);
  const pictures = () => ask(server.port, { path: `/api/notes/${opened.id}/pictures`, headers: bearer(server) });
  return { v, pictures };
}

const states = async (pictures) => {
  const got = await pictures();
  assert.equal(got.status, 200, got.text);
  assert.doesNotMatch(got.text, /svg|secret drawing|metadata/, 'nothing of a picture is sent');
  return JSON.parse(got.text);
};

describe('the editor server says whether each picture is up to date (§62)', () => {
  // proves: picture_hidden_when_drawn
  test('up to date when its mark matches the note, out of date once the note changes', async () => {
    const { v, pictures } = await asked(NOTE, fresh(NOTE));
    assert.deepEqual(await states(pictures), { plan: 'current' });
    writeFileSync(v.plan, NOTE.replace("'Finish'", "'Done'"));
    assert.deepEqual(await states(pictures), { plan: 'stale' });
  });

  test('a graph with no picture line says nothing; one whose picture is not there is out of date', async () => {
    assert.deepEqual(await states((await asked(PLAN, fresh(PLAN))).pictures), {});
    assert.deepEqual(await states((await asked(NOTE, null)).pictures), { plan: 'stale' });
  });

  test('a picture is never read through a link, nor from a hidden folder', async () => {
    const linked = await asked(NOTE, null);
    writeFileSync(join(linked.v.outside, 'plan.plan.thoughtknot.svg'), fresh(NOTE));
    symlinkSync(
      join(linked.v.outside, 'plan.plan.thoughtknot.svg'),
      join(linked.v.vault, 'Notes/plan.plan.thoughtknot.svg'),
    );
    assert.deepEqual(await states(linked.pictures), { plan: 'stale' }, 'a link to outside the vault');
    const hidden = NOTE.replace(LINE, '![The plan](../.obsidian/plan.plan.thoughtknot.svg)');
    const inHidden = await asked(hidden, null);
    mkdirSync(join(inHidden.v.vault, '.obsidian'), { recursive: true });
    writeFileSync(join(inHidden.v.vault, '.obsidian/plan.plan.thoughtknot.svg'), fresh(hidden));
    assert.deepEqual(await states(inHidden.pictures), { plan: 'stale' }, 'a hidden folder');
    const badly = await asked(NOTE.replace(LINE, '![The plan](%zz.thoughtknot.svg)'), null);
    assert.deepEqual(await states(badly.pictures), { plan: 'stale' }, 'a link escaped badly');
  });

  test('a note the gate refuses gets gone, and no states', async () => {
    const claude = { name: 'Claude', purpose: '', ceiling: 'Public', endpoint: '', model: '', keyName: '' };
    const settings = { classifications: ['Public', 'Restricted'], aiUnlabelled: 'Restricted', aiModels: [claude] };
    const restricted = `---\nclassification: Restricted\n---\n${NOTE}`;
    const v = tempVault();
    writeFileSync(v.plan, `---\nclassification: Public\n---\n${NOTE}`);
    const { store, server } = await served(v, { gate: storeGate(settings, null) });
    const opened = await store.open('Notes/plan.md');
    assert.equal(opened.ok, true, opened.why);
    writeFileSync(v.plan, restricted);
    const got = await ask(server.port, { path: `/api/notes/${opened.id}/pictures`, headers: bearer(server) });
    assert.equal(got.status, 410);
    assert.doesNotMatch(got.text, /current|stale/);
  });
});

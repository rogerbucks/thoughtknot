// Connectors over sync (editor spec §63, CN3): connected.ts. A graph drawn from a .gql file, a note and a plug-in's
// source, kept in step between devices. Only the notes and the file are synced: each device rebuilds the rest. An edit
// goes home to each place ThoughtKnot writes, as one bundle, and to an overlay in the note for the plug-in's place.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { connect, sourceOf } from '@thoughtknot/core';
import { applyBundle, changesFor, overlaysOf, rejoin, undoBundle } from '../src/index.ts';
import { copyAll, devices } from './helpers.js';

const FROM = '// graph: team · FROM Graphs/people.gql, [[Roles]], sample:robots';
const TEAM = `# Team\n\n\`\`\`gql\n${FROM}\n\`\`\`\n`;
const PEOPLE = "// graph: team\n(ann:Person {name: 'Ann'}),\n(bob:Person {name: 'Bob'}),\n(ann)-[:KNOWS]->(bob)\n";
const ROLES = "# Roles\n\n```gql\n// graph: team\n(ann:Person {name: 'Ann', role: 'Lead'})\n```\n";
const ROBOTS = "// graph: team\n(r2:Robot {name: 'R2'})";
/** Each synced document, by its name, as it starts. */
const DOCS = { 'Team.md': TEAM, 'Graphs/people.gql': PEOPLE, 'Roles.md': ROLES };
/** The synced document each place ThoughtKnot writes is kept in. */
const homes = { note: 'Team.md', docOf: (place) => (place.endsWith('.gql') ? place : `${place}.md`) };

/** The graph as this device draws it: the file and the notes from sync, the plug-in's place as this device reads it. */
function draw(notes, robots = ROBOTS) {
  const source = sourceOf(FROM);
  const reads = source.places.map((p) =>
    connect(p, {
      found: p.target,
      text: p.kind === 'plugin' ? robots : notes.read(homes.docOf(p.target)).text,
    }),
  );
  return rejoin('team', reads, overlaysOf(notes.read('Team.md').text, 'team'));
}
/** A thing's property in a drawing. */
const valueOf = (r, thing, key) => r.joined.reading.world.team.nodes.get(thing)?.[1][key];
/** The drawing as words, to tell two devices' apart. */
const drawn = (r) => JSON.stringify([r.joined.texts, r.joined.contested, r.applied, r.contested, r.orphans]);

/** Devices that have each opened every document, the first having written them. */
async function team(...names) {
  const all = await devices(...names);
  for (const [doc, text] of Object.entries(DOCS)) await all[0].notes.open(doc, text);
  copyAll(all);
  for (const d of all.slice(1)) for (const doc of Object.keys(DOCS)) await d.notes.open(doc);
  return all;
}

describe('connectors over sync', () => {
  // proves: connector_sync_written_only
  test('only the notes and the file are synced, and each device rebuilds the same graph from them', async () => {
    const [desk, phone] = await team('desk', 'phone');
    assert.equal((await desk.store.held()).size, 3, 'three documents, and nothing a connector made');
    for (const doc of Object.keys(DOCS)) assert.doesNotMatch(desk.notes.read(doc).text, /R2/);
    const [a, b] = [draw(desk.notes), draw(phone.notes)];
    assert.equal(valueOf(a, 'r2', 'name'), 'R2', 'the plug-in place is drawn');
    assert.equal(drawn(a), drawn(b));
  });

  // proves: connector_edit_goes_home
  test('a rename of a thing in a file and a note changes both, as one bundle that one undo takes back', async () => {
    const [desk] = await team('desk');
    const changes = changesFor(desk.notes, draw(desk.notes).joined, homes, 'ann', 'name', 'Annie');
    assert.deepEqual(changes.map((c) => c.doc).sort(), ['Graphs/people.gql', 'Roles.md']);
    const applied = await applyBundle(desk.notes, changes, 'Ann');
    assert.ok('undo' in applied, JSON.stringify(applied));
    assert.match(desk.notes.read('Graphs/people.gql').text, /\{name: 'Annie'\}/);
    assert.match(desk.notes.read('Roles.md').text, /\{name: 'Annie', role: 'Lead'\}/);
    assert.equal(valueOf(draw(desk.notes), 'ann', 'name'), 'Annie');
    await undoBundle(desk.notes, applied, 'Ann');
    for (const [doc, text] of Object.entries(DOCS)) assert.equal(desk.notes.read(doc).text, text, doc);
  });

  // proves: connector_overlay_for_readonly
  test('an edit to a thing from a plug-in place is an overlay in the note, citing it, and the place is unchanged', async () => {
    const [desk] = await team('desk');
    const before = draw(desk.notes);
    const robots = before.joined.places.find((p) => p.place === 'sample:robots');
    const changes = changesFor(desk.notes, before.joined, homes, 'r2', 'name', 'Artoo');
    assert.deepEqual(
      changes.map((c) => c.doc),
      ['Team.md'],
    );
    assert.ok('undo' in (await applyBundle(desk.notes, changes, 'Ann')));
    assert.deepEqual(overlaysOf(desk.notes.read('Team.md').text, 'team'), [
      { place: 'sample:robots', version: robots.version, thing: 'r2', key: 'name', value: 'Artoo' },
    ]);
    const after = draw(desk.notes);
    assert.equal(valueOf(after, 'r2', 'name'), 'Artoo');
    assert.equal(after.applied.length, 1);
    assert.equal(after.joined.places.find((p) => p.place === 'sample:robots').version, robots.version, 'unchanged');
  });

  // proves: connector_refresh_rejoins
  test('a place changed under an overlay is contested, and one whose thing is gone leaves the overlay an orphan', async () => {
    const [desk] = await team('desk');
    const changes = changesFor(desk.notes, draw(desk.notes).joined, homes, 'r2', 'name', 'Artoo');
    await applyBundle(desk.notes, changes, 'Ann');
    const moved = draw(desk.notes, ROBOTS.replace("'R2'", "'R2-D2'"));
    assert.equal(moved.contested.length, 1);
    const values = moved.joined.contested.find((c) => c.thing === 'r2' && c.key === 'name')?.values.map((v) => v.value);
    assert.deepEqual(values?.sort(), ['Artoo', 'R2-D2'], 'both kept, neither written over');
    const gone = draw(desk.notes, "// graph: team\n(c3:Robot {name: 'C3'})");
    assert.deepEqual(
      gone.orphans.map((o) => o.thing),
      ['r2'],
    );
  });

  // proves: connector_devices_agree
  test('edits at once from two devices and an AI author, across two places, draw the same graph everywhere', async () => {
    const all = await team('desk', 'phone', 'ai');
    const [desk, phone, ai] = all;
    const bundle = async (d, thing, key, value, author) =>
      applyBundle(d.notes, changesFor(d.notes, draw(d.notes).joined, homes, thing, key, value), author);
    await bundle(desk, 'ann', 'role', 'Chief', 'Ann');
    await bundle(phone, 'bob', 'name', 'Robert', 'Bob');
    await bundle(ai, 'r2', 'name', 'Artoo', 'Claude');
    copyAll(all);
    for (const d of all) for (const doc of Object.keys(DOCS)) await d.notes.sync(doc);
    const drawings = all.map((d) => drawn(draw(d.notes)));
    assert.equal(new Set(drawings).size, 1, 'every device draws the same graph');
    const r = draw(desk.notes);
    assert.deepEqual(
      [valueOf(r, 'ann', 'role'), valueOf(r, 'bob', 'name'), valueOf(r, 'r2', 'name')],
      ['Chief', 'Robert', 'Artoo'],
    );
  });
});

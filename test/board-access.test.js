// Access to a board (editor spec §45, board_access). Rights follow the permission rules: read is to view, write is to
// edit, and commenting sits between. People join by an invitation sealed for their own device, and no key leaves a
// device in the clear.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { boardEdit } from '../packages/core/src/board-edit.ts';
import { boardEditAs, mayChange, roleFor } from '../packages/core/src/board-access.ts';
import { permissionsOf } from '../packages/core/test/permissions-fixtures.js';
import { DeviceKeys, invite, join, newBoardKey } from '../packages/sync/src/index.ts';

const BOARD = `// graph: ideas · BOARD
(a:Sticky {x: 0, y: 0, text: 'One'})`;
const THING = { path: 'boards/ideas.md', id: 'ideas', tags: ['board'] };
const GRANTS = `// graph: permissions
(roger:Person {name: 'Roger', owner: TRUE}),
(ann:Person {name: 'Ann'}),
(bob:Person {name: 'Bob'}),
(cat:Person {name: 'Cat'}),
(looker:Role {name: 'Looker'}),
(maker:Role {name: 'Maker'}),
(look_rule:GrantRule {access: 'read', path: 'boards/'}),
(make_rule:GrantRule {access: 'write', path: 'boards/'}),
(looker)-[:HAS_RULE]->(look_rule),
(maker)-[:HAS_RULE]->(make_rule),
(maker_read:GrantRule {access: 'read', path: 'boards/'}),
(maker)-[:HAS_RULE]->(maker_read),
(ann)-[:HAS_ROLE]->(looker),
(bob)-[:HAS_ROLE]->(maker),
(ann_read:Grant {access: 'read', path: 'boards/ideas.md', status: 'asserted'}),
(bob_read:Grant {access: 'read', path: 'boards/ideas.md', status: 'asserted'}),
(bob_write:Grant {access: 'write', path: 'boards/ideas.md', status: 'asserted'}),
(ann)-[:HOLDS]->(ann_read),
(bob)-[:HOLDS]->(bob_read),
(bob)-[:HOLDS]->(bob_write),
(ann_read)-[:FROM_RULE]->(look_rule),
(bob_read)-[:FROM_RULE]->(maker_read),
(bob_write)-[:FROM_RULE]->(make_rule)`;
const permissions = permissionsOf(GRANTS);
const edit = { kind: 'text', id: 'a', text: 'Changed' };
const vote = { kind: 'vote', id: 'a', person: 'ann', reaction: 'up' };

describe('board_access', () => {
  test('read is to view, write is to edit, no grant is no access, and the owner may edit', () => {
    assert.equal(roleFor(permissions, 'ann', THING), 'view');
    assert.equal(roleFor(permissions, 'bob', THING), 'edit');
    assert.equal(roleFor(permissions, 'cat', THING), null);
    assert.equal(roleFor(permissions, 'roger', THING), 'edit');
  });

  test('someone who may read and was asked to join in may comment and vote, and nothing more', () => {
    assert.equal(roleFor(permissions, 'ann', THING, new Set(['ann'])), 'comment');
    assert.equal(roleFor(permissions, 'cat', THING, new Set(['cat'])), null, 'asking never opens a board');
    assert.ok(mayChange('comment', vote));
    assert.ok(!mayChange('comment', edit));
    assert.ok(!mayChange('view', vote));
    assert.ok(mayChange('edit', edit));
    assert.ok(!mayChange(null, vote));
  });

  test('a refused change says why in words and leaves the block as it was', () => {
    for (const role of ['view', 'comment', null]) {
      const r = boardEditAs(BOARD, edit, role);
      assert.ok('refused' in r && r.refused.length > 10, String(role));
    }
    assert.deepEqual(boardEditAs(BOARD, edit, 'edit'), boardEdit(BOARD, edit));
  });

  test('an invitation opens on the invited device alone, and the key is never in the clear', async () => {
    const [owner, guest, other] = await Promise.all([DeviceKeys.create(), DeviceKeys.create(), DeviceKeys.create()]);
    const boardKey = await newBoardKey();
    const invitation = await invite(boardKey, 'ideas', 'comment', owner, guest.publicKey);
    assert.equal(invitation.as, 'comment');
    const opened = await join(invitation, guest);
    const note = new TextEncoder().encode('a secret note');
    assert.deepEqual(await opened.open(await boardKey.seal(note)), note, 'the guest holds the same board key');
    await assert.rejects(join(invitation, other), 'another device cannot open it');
    const changed = { ...invitation, sealed: invitation.sealed.map((b, i) => (i === 20 ? b ^ 1 : b)) };
    await assert.rejects(join(changed, guest), 'a changed invitation does not open');
    for (const shown of [JSON.stringify(boardKey), String(boardKey), inspect(opened)])
      assert.match(shown, /never shown/);
  });
});

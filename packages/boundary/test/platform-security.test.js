// A platform's own permissions come first (editor spec §40, platform_security_first). A SharePoint item the person
// cannot read is never handed on, and the setting's policy on top only ever narrows what the platform allows.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { SHAREPOINT_LEVELS, joinAllowed, platformRights, rightsOn, visibleItems } from '../src/index.ts';

const ITEMS = [
  { id: '1', path: 'Lists/Projects/1', roles: [{ principal: 'Team', level: 'Edit' }] },
  { id: '2', path: 'Lists/Projects/2', roles: [{ principal: 'Board', level: 'Full Control' }] },
  {
    id: '3',
    path: 'Lists/Projects/3',
    roles: [
      { principal: 'ann', level: 'Read' },
      { principal: 'Team', level: 'Limited Access' },
    ],
  },
];
const ANN = ['ann', 'Team'];

describe('platform_security_first', () => {
  // proves: platform_security_first
  test('a SharePoint item the user cannot read is never exposed', () => {
    assert.deepEqual(
      visibleItems(ITEMS, ANN).map((i) => i.id),
      ['1', '3'],
    );
    assert.deepEqual(visibleItems(ITEMS, ['bob']), [], 'no role, nothing');
    assert.equal(platformRights(ITEMS[2], ['Team']).read, false, 'Limited Access opens nothing by itself');
  });

  // proves: platform_security_first
  test('the policy adds edit, review and join rules that only narrow', () => {
    assert.deepEqual(rightsOn(ITEMS[0], ANN, {}), { read: true, edit: true, review: false });
    assert.deepEqual(rightsOn(ITEMS[0], ANN, { editors: ['Board'] }), { read: true, edit: false, review: false });
    assert.deepEqual(rightsOn(ITEMS[0], ANN, { review: ['Lists/Projects'] }), { read: true, edit: true, review: true });
    assert.deepEqual(
      rightsOn(ITEMS[2], ANN, { editors: ['ann'] }),
      { read: true, edit: false, review: false },
      'the policy never grants an edit the platform does not',
    );
    const readable = (g) => g !== 'board';
    assert.equal(joinAllowed({}, 'projects', 'people', readable), true);
    assert.equal(joinAllowed({}, 'projects', 'board', readable), false);
    assert.equal(joinAllowed({ joins: ['projects'] }, 'projects', 'people', readable), false);
  });

  // proves: platform_security_first
  test('for any items, people and policy, what is allowed is never more than the platform allows', () => {
    const principal = fc.constantFrom('ann', 'bob', 'Team', 'Board');
    const item = fc.record({
      id: fc.string(),
      path: fc.constantFrom('a', 'a/b', 'c'),
      roles: fc.array(fc.record({ principal, level: fc.constantFrom(...SHAREPOINT_LEVELS) }), { maxLength: 4 }),
    });
    const policy = fc.record(
      { editors: fc.array(principal), review: fc.array(fc.constantFrom('a', 'c')), joins: fc.array(fc.string()) },
      { requiredKeys: [] },
    );
    fc.assert(
      fc.property(item, fc.array(principal, { maxLength: 3 }), policy, (it, who, pol) => {
        const p = platformRights(it, who),
          r = rightsOn(it, who, pol);
        return (!r.read || p.read) && (!r.edit || p.edit) && (!r.edit || r.read);
      }),
    );
  });
});

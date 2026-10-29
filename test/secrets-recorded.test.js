// SEC-8: every secret a workflow reads has a row in RELEASING.md's "Keys and recovery" table. The row gives its owner,
// its scope and when it is renewed. So a token's reach is never known only to the person who made it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read, workflowFiles } from './repository/repo.js';

/** The rows of the "Keys and recovery" table, by the secret names in their first cell. */
function rows() {
  const text = read('RELEASING.md');
  const section = text.slice(
    text.indexOf('## Keys and recovery'),
    text.indexOf('\n## ', text.indexOf('## Keys and recovery') + 1),
  );
  const out = new Map();
  for (const line of section.split('\n').filter((l) => l.startsWith('| `'))) {
    const cells = line.split(' | ');
    for (const [, name] of cells[0].matchAll(/`([A-Z][A-Z0-9_]+)`/g)) out.set(name, cells);
  }
  return out;
}

test('every secret a workflow reads has a row in RELEASING.md, with an owner and a renewal date', () => {
  const used = new Set();
  for (const f of workflowFiles())
    for (const [, name] of read(f).matchAll(/secrets\.([A-Z][A-Z0-9_]+)/g)) used.add(name);
  assert.ok(used.has('PROJECT_TOKEN'), 'the control: the secrets are found');
  const table = rows();
  for (const name of used) {
    const row = table.get(name);
    assert.ok(row, `${name} has a row in RELEASING.md, Keys and recovery`);
    assert.doesNotMatch(row[3] ?? '', /not known/i, `${name} says when it expires`);
  }
  // the personal tokens name their owner and scope (SEC-8)
  for (const name of ['PROJECT_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'SECURITY_ALERTS_TOKEN']) {
    assert.match(table.get(name).join(' | '), /Owner: Roger\./, `${name} names its owner`);
    assert.match(table.get(name)[3], /\b20\d\d\b|A year after/, `${name} says when it is renewed`);
  }
  assert.match(table.get('PROJECT_TOKEN')[1], /`project` scope alone/);
});

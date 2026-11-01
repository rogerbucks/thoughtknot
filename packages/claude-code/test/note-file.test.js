// A note is written to a new file, then renamed into place (spec §26, cc_editor_opens). Windows refuses that rename
// for a moment while another program, as a virus scan, holds the file just written. The server tries it again then.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renameHeld } from '../server/note-file.ts';

/** A rename refused `times` times with `code`, then done; it counts its tries. */
function refusing(times, code) {
  const tries = { n: 0 };
  const rename = async () => {
    tries.n++;
    if (tries.n <= times) throw Object.assign(new Error(code), { code });
  };
  return { rename, tries };
}

describe('a rename refused while the file is held open', () => {
  test('on Windows it is tried again until it is done', async () => {
    const { rename, tries } = refusing(2, 'EPERM');
    await renameHeld(rename, 'a', 'b', 'win32', [1, 1, 1]);
    assert.equal(tries.n, 3);
  });

  test('on Windows it gives up after its last pause, with the refusal', async () => {
    const { rename, tries } = refusing(9, 'EBUSY');
    await assert.rejects(renameHeld(rename, 'a', 'b', 'win32', [1, 1]), { code: 'EBUSY' });
    assert.equal(tries.n, 3);
  });

  test('any other refusal is final at once, as is any refusal on the other systems', async () => {
    const other = refusing(1, 'ENOENT');
    await assert.rejects(renameHeld(other.rename, 'a', 'b', 'win32', [1]), { code: 'ENOENT' });
    assert.equal(other.tries.n, 1);
    const mac = refusing(1, 'EPERM');
    await assert.rejects(renameHeld(mac.rename, 'a', 'b', 'darwin', [1]), { code: 'EPERM' });
    assert.equal(mac.tries.n, 1);
  });
});

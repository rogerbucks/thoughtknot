// The blobs of a repository's history, read a group at a time (public-readiness.mjs, the history check). The history's
// blobs passed 1.2 GB on 9 Nov 2026. Read in one go, they took a CI shard past its 8 GB memory ceiling. So they are
// read in groups of a bounded size, and the trees and commits are never read.
import { execFileSync } from 'node:child_process';

/** The most bytes of blobs read at once. */
export const READ_MOST = 64_000_000;

const git = (root, args, input) => execFileSync('git', args, { cwd: root, input, maxBuffer: 2 ** 31 });

/** The blobs among `shas`, in groups of at most `most` bytes. A blob larger than that is in a group of its own. */
export function blobGroups(root, shas, most = READ_MOST) {
  const format = '--batch-check=%(objectname) %(objecttype) %(objectsize)';
  const groups = [];
  let group = [],
    bytes = 0;
  for (const line of git(root, ['cat-file', format], shas.join('\n') + '\n')
    .toString()
    .split('\n')) {
    const [sha, type, size] = line.split(' ');
    if (type !== 'blob') continue;
    if (group.length && bytes + Number(size) > most) {
      groups.push(group);
      group = [];
      bytes = 0;
    }
    group.push(sha);
    bytes += Number(size);
  }
  return group.length ? [...groups, group] : groups;
}

/** Each blob among `shas`, as its sha and its bytes, read `most` bytes at a time at the most. */
export function* historyBlobs(root, shas, most = READ_MOST) {
  for (const group of blobGroups(root, shas, most)) {
    const batch = git(root, ['cat-file', '--batch'], group.join('\n') + '\n');
    for (let at = 0; at < batch.length;) {
      const nl = batch.indexOf(10, at);
      const [sha, , size] = batch.subarray(at, nl).toString().split(' ');
      yield { sha, body: batch.subarray(nl + 1, nl + 1 + Number(size)) };
      at = nl + 1 + Number(size) + 1;
    }
  }
}

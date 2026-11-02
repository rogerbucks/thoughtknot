// Every export of the core is used somewhere: named in another file, or more than once in its own. One named
// nowhere else is dead code, kept "in case". The weekly review found 80 on 26 Oct 2026 and 5 on 2 Nov. This fails
// the next one, so a thing is exported when something reads it. The check is by name, over every tracked file: code,
// tests, scripts and docs. So a name read anywhere counts, and a false alarm needs only a use. It is a ratchet on
// dead code (spec §12, quality_ratchet).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { ROOT, path } from './repository/repo.js';

const CORE = 'packages/core/src/';
const EXPORT = /^export\s+(?:async\s+)?(?:function|const|let|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm;
const WORD = /[A-Za-z_$][\w$]*/g;

/** The names exported by the core's source files that no other tracked file names, and the file names only once. */
export function exportsUsedNowhere(files, read) {
  const counts = new Map();
  const texts = new Map(files.map((f) => [f, read(f)]));
  const words = new Map([...texts].map(([f, t]) => [f, t.match(WORD) ?? []]));
  for (const ws of words.values()) for (const w of new Set(ws)) counts.set(w, (counts.get(w) ?? 0) + 1);
  const nowhere = [];
  for (const [f, t] of texts)
    if (f.startsWith(CORE) && /\.tsx?$/.test(f))
      for (const m of t.matchAll(EXPORT)) {
        const name = m[1];
        const own = words.get(f).filter((w) => w === name).length;
        if ((counts.get(name) ?? 0) < 2 && own < 2) nowhere.push(`${f}: ${name}`);
      }
  return nowhere;
}

describe('the exports of the core', () => {
  test('the check finds an export named nowhere else, and not one another file or its own file reads', () => {
    const files = ['packages/core/src/a.ts', 'packages/core/src/b.ts', 'test/c.test.js'];
    const texts = {
      'packages/core/src/a.ts':
        'export const one = 1;\nexport const two = 2;\nexport type Three = 3;\nexport function four() { return four; }\n',
      'packages/core/src/b.ts': 'import { one } from "./a.ts";\n',
      'test/c.test.js': 'two',
    };
    assert.deepEqual(
      exportsUsedNowhere(files, (f) => texts[f]),
      ['packages/core/src/a.ts: Three'],
    );
  });

  test('every export of the core is read somewhere in the repository', () => {
    const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter((f) => /\.(ts|tsx|js|mjs|cjs|md|gql)$/.test(f) && !f.endsWith('.d.ts'));
    assert.deepEqual(
      exportsUsedNowhere(files, (f) => readFileSync(path(f), 'utf8')),
      [],
      'an export no file names: use it, or take it out',
    );
  });
});

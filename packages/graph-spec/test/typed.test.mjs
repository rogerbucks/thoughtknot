// The graph-spec library is type-checked (spec §13, one_code_style: CODE-1). Its tsconfig checks its JavaScript in
// strict mode, from JSDoc types. A file not typed yet opts out with a `// @ts-nocheck` line. It is held in
// untyped.json, a list that only shrinks. A new file is typed from the start, and one typed comes off the list. The
// reader's store, the three-way join and the layout source were typed first.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const UNTYPED = JSON.parse(read('test/untyped.json'));

/** Every JavaScript file of the library's sources, from the package's folder. */
const sources = (dir = join(ROOT, 'src')) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(join(dir, e.name)) : e.name.endsWith('.js') ? [relative(ROOT, join(dir, e.name))] : [],
  );

/** Whether a file opts out of the check: a `@ts-nocheck` line before its code. */
const optsOut = (text) => /^\s*\/\/ @ts-nocheck\b/m.test(text.slice(0, text.search(/^[^/\n]/m) + 1 || undefined));

describe('the library is type-checked', () => {
  test('its tsconfig checks the JavaScript, strictly, and the repository typecheck runs it', () => {
    const { compilerOptions: o, include } = JSON.parse(read('tsconfig.json'));
    assert.equal(o.checkJs, true);
    assert.equal(o.strict, true);
    assert.ok(include.includes('src/**/*.js'));
    const typecheck = JSON.parse(read('../../package.json')).scripts.typecheck;
    assert.match(typecheck, /tsc -p packages\/graph-spec --noEmit/);
  });

  test('a file opts out only when the list holds it, and every file the list holds still opts out', () => {
    const out = sources()
      .filter((f) => optsOut(read(f)))
      .sort();
    assert.deepEqual(
      out.filter((f) => !UNTYPED.includes(f)),
      [],
      'a new file is typed: take out its @ts-nocheck line',
    );
    assert.deepEqual(
      UNTYPED.filter((f) => !out.includes(f)),
      [],
      'a file typed now, or gone, comes off test/untyped.json',
    );
    assert.deepEqual(UNTYPED, [...UNTYPED].sort(), 'the list is sorted');
  });

  test('the store, the three-way join and the layout source are typed', () => {
    for (const f of ['src/reader/store.js', 'src/joins/merge3.js', 'src/graph-layout.js']) {
      assert.equal(optsOut(read(f)), false, f);
      assert.ok(!UNTYPED.includes(f), f);
    }
  });

  test('an opt-out is told apart from a mention of one', () => {
    assert.equal(optsOut('// @ts-nocheck -- not yet typed\nconst a = 1;\n'), true);
    assert.equal(optsOut('/* A header. */\n// @ts-nocheck\nconst a = 1;\n'), true);
    assert.equal(optsOut('const a = 1;\n// @ts-nocheck\n'), false, 'after the code it does nothing');
    assert.equal(optsOut("const a = '// @ts-nocheck';\n"), false);
  });
});

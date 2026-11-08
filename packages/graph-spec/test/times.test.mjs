// A time written with its zone (editor spec §51, spec_zoned_time). DATETIME 'YYYY-MM-DDTHH:MM:SS+HH:MM' is the way
// to write it. Both readers hold the time as the same UTC instant, so a zoned time and the same instant written in Z
// make the same graph. Both refuse a time with no offset, or no instant, with the same code. The cases are in
// time-cases.json. The JavaScript reader runs here and the Python reader runs live, as commas.test.mjs does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const PY_SRC = fileURLToPath(new URL('../../../python/graph_spec/src', import.meta.url));
const C = require('../src/graph-spec-check.js');
const CASES = JSON.parse(readFileSync(new URL('./time-cases.json', import.meta.url), 'utf8'));

const block = (/** @type {string} */ text) => `// graph: g\n(a:T {at: DATETIME '${text}'})`;

/** What the JavaScript reader makes of a block: its canonical graph, or the code it refuses with. */
function js(/** @type {string} */ text) {
  try {
    const s = new C.Store();
    const g = s.apply(block(text));
    return { canon: C.canon(C.worldFromStore(s)[g]).slice(0, 16) };
  } catch (e) {
    if (e instanceof C.ProfileError) return { code: e.code };
    throw e;
  }
}

function python(/** @type {string[]} */ texts) {
  const prog = `import json, sys
sys.path.insert(0, ${JSON.stringify(PY_SRC)})
import gql_profile as gp, graph_rules as gr
out = []
for t in json.load(sys.stdin):
    try:
        s = gp.Store(); g = s.apply("// graph: g\\n(a:T {at: DATETIME '" + t + "'})"); w = gr.World.from_store(s)
        out.append({'canon': gr.canon(w[g])[:16]})
    except gp.ProfileError as e: out.append({'code': e.code})
print(json.dumps(out))`;
  const r = spawnSync('python3', ['-c', prog], { input: JSON.stringify(texts), encoding: 'utf8', maxBuffer: 1 << 26 });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

test('a time written with its zone is held as its UTC instant', () => {
  for (const c of CASES.read) {
    assert.deepEqual(js(c.write), js(c.utc + 'Z'), `${c.write} is ${c.utc}Z`);
  }
});

test('both readers read a zoned time alike', () => {
  const texts = CASES.read.map((c) => c.write);
  assert.deepEqual(python(texts), texts.map(js));
});

test('a time with no offset, or no instant, is refused with the same code by both readers', () => {
  const texts = CASES.refused.map((c) => c.write);
  assert.deepEqual(
    texts.map(js),
    CASES.refused.map((c) => ({ code: c.code })),
  );
  assert.deepEqual(python(texts), texts.map(js));
});

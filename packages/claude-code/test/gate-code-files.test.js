// A Bash command that names `classification` may still rewrite an existing code file whose path is known (spec ES§26
// cc_gate_code_files, risk TRUST-1, Roger, 23 Nov 2026). A note, a file of a kind not listed, a settings file, a link
// to a note and a code file holding a classified front matter are still judged as notes. Proved in a temporary folder.
import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classificationRefusal, guardGateFiles } from '../src/gate-guard.ts';

const made = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const NOTE = '---\ntitle: Plan\nclassification: secret\n---\n\nThe plan.\n';
const BARE = '---\ntitle: Bare\n---\n\nNo class yet.\n';

/** A folder with a classified note, an unlabelled one, a code file, and the ports the guard takes. */
function vault() {
  const top = realpathSync.native(mkdtempSync(join(tmpdir(), 'tk-code-')));
  made.push(top);
  mkdirSync(join(top, 'page'));
  writeFileSync(join(top, 'plan.md'), NOTE);
  writeFileSync(join(top, 'bare.md'), BARE);
  writeFileSync(join(top, 'page', 'host.ts'), "/** The name */\nconst a = 1;\n/** The note's classification */\n");
  const ports = {
    cwd: top,
    home: top,
    matrixNote: null,
    realPath: async (path) => realpathSync.native(path),
    read: async (path) => readFileSync(path, 'utf8'),
    links: async (path) => statSync(path).nlink,
  };
  return { top, ports };
}

/** The Python heredoc the guard refused on 23 Nov 2026, cutting `p` between two markers. */
const cut = (p, from = '/** The name', to = "/** The note's classification") =>
  `python3 - <<'EOF'\np='${p}'\ns=open(p).read()\nold=s[s.index("${from}"):s.index("${to}")]\ns=s.replace(old,"")\nopen(p,'w').write(s)\nEOF`;

const allowed = async (command, ports) => assert.equal(await guardGateFiles('Bash', { command }, ports), null, command);
const refused = async (command, ports) =>
  assert.equal(await guardGateFiles('Bash', { command }, ports), classificationRefusal(), command);

describe('a Bash write to an existing code file (ES§26 cc_gate_code_files)', () => {
  test('is allowed though the command names it, by Python, cat, echo, printf or cp', async () => {
    const v = vault();
    writeFileSync(join(v.top, 'data.csv.json'), '{"classification": "public"}\n');
    writeFileSync(join(v.top, 'other.ts'), 'const b = 2;\n');
    for (const command of [
      cut('page/host.ts'),
      cut(`${v.top}/page/host.ts`),
      `cd page && cat > host.ts <<'EOF'\n// classification\nEOF`,
      `echo "// classification" >> page/host.ts`,
      `printf '{"classification": 1}' > data.csv.json`,
      `cp other.ts page/host.ts && echo classification`,
      `python3 - <<'PY'\nopen("new.md", "w").write("classification: Own")\nopen("other.ts", "a").write("// classification")\nPY`,
    ])
      await allowed(command, v.ports);
  });

  test('of a note, a canvas, an unlisted kind or a settings file is still refused', async () => {
    const v = vault();
    writeFileSync(join(v.top, 'plan.canvas'), '{"nodes": []}\n');
    writeFileSync(join(v.top, 'notes.txt'), 'const a = 1;\n');
    writeFileSync(join(v.top, 'odd.TS'), 'const a = 1;\n');
    for (const name of ['settings.json', 'data.json', 'settings.local.json', 'Settings.JSON'])
      writeFileSync(join(v.top, name), '{"classificationRaises": []}\n');
    writeFileSync(join(v.top, 'front.ts'), NOTE);
    for (const p of ['plan.md', join(v.top, 'bare.md'), 'plan.canvas', 'notes.txt', 'odd.TS', 'front.ts'])
      await refused(cut(p, 'title', 'classification'), v.ports);
    for (const p of ['settings.json', 'data.json', 'settings.local.json', 'Settings.JSON'])
      await refused(`printf '{"classification": "Own"}' > ${p}`, v.ports);
    await refused(`echo "classification: public" >> bare.md`, v.ports);
  });

  test('through a symbolic or hard link to an unlabelled note or a settings file is still refused', async () => {
    const v = vault();
    writeFileSync(join(v.top, 'settings.json'), '{}\n');
    symlinkSync(join(v.top, 'bare.md'), join(v.top, 'soft.ts'));
    symlinkSync(join(v.top, 'settings.json'), join(v.top, 'soft.json'));
    linkSync(join(v.top, 'bare.md'), join(v.top, 'hard.ts'));
    linkSync(join(v.top, 'settings.json'), join(v.top, 'hard.json'));
    for (const p of ['soft.ts', 'soft.json', 'hard.ts', 'hard.json']) {
      await refused(`echo "classification: public" > ${p}`, v.ports);
      await refused(cut(p, 'title', 'classification'), v.ports);
    }
    await refused(`cp page/host.ts hard.ts && echo classification`, v.ports);
  });

  test('is refused when its path, or the count of its links, is not known', async () => {
    const v = vault();
    const { links, ...noCount } = v.ports;
    assert.equal(typeof links, 'function');
    await refused(`echo "// classification" >> page/host.ts`, noCount);
    await refused(cut('page/host.ts'), noCount);
    await refused(cut('page/host.ts'), { ...v.ports, links: async () => Promise.reject(new Error('no')) });
    for (const command of [
      `echo "// classification" >> "$WHERE/host.ts"`,
      `echo "// classification" >> page/*.ts`,
      `sed -i '' 's/a/b/' page/host.ts # classification`,
      `python3 - <<'PY'\nopen("page/host.ts", "a").write("x")\nopen("plan.md", "a").write("classification: public")\nPY`,
    ])
      await refused(command, v.ports);
  });
});

describe('the shipped real-path process counts links', () => {
  const script = fileURLToPath(new URL('../bin/real-path-process.ts', import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

  test('--links says how many names a file has, and 2 for a path that is not there', () => {
    const v = vault();
    assert.equal(run('--links', '--', join(v.top, 'plan.md')).stdout, '1');
    linkSync(join(v.top, 'plan.md'), join(v.top, 'again.ts'));
    assert.equal(run('--links', '--', join(v.top, 'again.ts')).stdout, '2');
    assert.equal(run('--links', '--', join(v.top, 'missing')).status, 2);
    assert.equal(run('--links', join(v.top, 'plan.md')).status, 1);
  });
});

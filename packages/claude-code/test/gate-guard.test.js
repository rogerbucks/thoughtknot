// What sets Claude's gate is the user's alone (spec §26, risk TRUST-1): the matrix note named in the settings, and each
// note's classification line. Claude's own Write, Edit, MultiEdit, other file tools and Bash calls that would change
// either are refused. Proved on a vault made for the purpose, in a temporary folder.
import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classificationRefusal, matrixNoteRefusal, guardGateFiles } from '../src/gate-guard.ts';

const made = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const NOTE = '---\ntitle: Plan\nclassification: secret\n---\n\nThe plan.\n';

/** A vault with a matrix note and a classified note, and the ports the guard takes. */
function vault({ read = true } = {}) {
  const top = realpathSync.native(mkdtempSync(join(tmpdir(), 'tk-gate-')));
  made.push(top);
  mkdirSync(join(top, 'Settings'), { recursive: true });
  const matrix = join(top, 'Settings', 'AI matrix.md');
  const plan = join(top, 'plan.md');
  writeFileSync(matrix, '| Model | public |\n| --- | --- |\n| Claude | yes |\n');
  writeFileSync(plan, NOTE);
  const ports = {
    cwd: top,
    home: top,
    matrixNote: 'Settings/AI matrix.md',
    realPath: async (path) => realpathSync.native(path),
    ...(read ? { read: async (path) => readFileSync(path, 'utf8') } : {}),
  };
  return { top, matrix, plan, ports };
}

const refusedWith = (answer, refusal) => assert.equal(answer, refusal);
const allowed = (answer) => assert.equal(answer, null);

describe('the matrix note named in the settings', () => {
  test('a Write, Edit, MultiEdit or other file tool onto it is refused, by a relative path or a link', async () => {
    const v = vault();
    refusedWith(await guardGateFiles('Write', { file_path: v.matrix, content: '' }, v.ports), matrixNoteRefusal());
    refusedWith(await guardGateFiles('Edit', { file_path: 'Settings/AI matrix.md' }, v.ports), matrixNoteRefusal());
    refusedWith(await guardGateFiles('MultiEdit', { file_path: v.matrix, edits: [] }, v.ports), matrixNoteRefusal());
    refusedWith(await guardGateFiles('mcp__files__write', { path: v.matrix }, v.ports), matrixNoteRefusal());
    symlinkSync(v.matrix, join(v.top, 'harmless.md'));
    refusedWith(await guardGateFiles('Write', { file_path: join(v.top, 'harmless.md') }, v.ports), matrixNoteRefusal());
  });

  test('a Bash command that names its file is refused, and one that does not is allowed', async () => {
    const v = vault();
    refusedWith(
      await guardGateFiles('Bash', { command: `echo x >> "Settings/AI matrix.md"` }, v.ports),
      matrixNoteRefusal(),
    );
    allowed(await guardGateFiles('Bash', { command: 'ls Settings' }, v.ports));
  });

  test('with no matrix note set, it guards none, and reads are never judged', async () => {
    const v = vault();
    allowed(await guardGateFiles('Write', { file_path: v.matrix, content: 'x' }, { ...v.ports, matrixNote: null }));
    allowed(await guardGateFiles('Read', { file_path: v.matrix }, v.ports));
  });

  test('on Windows, a path in backslashes or by a link to it is refused the same', async () => {
    const real = { 'C:\\Vault\\Settings\\AI matrix.md': true, 'C:\\Vault\\harmless.md': 'matrix' };
    const ports = {
      cwd: 'C:\\Vault',
      home: 'C:\\Profiles\\Ann',
      matrixNote: 'Settings\\AI matrix.md',
      realPath: async (path) => {
        const at = path.replace(/\//g, '\\');
        if (real[at] === 'matrix') return 'C:\\Vault\\Settings\\AI matrix.md';
        if (real[at] || /^C:\\(Vault(\\Settings)?)?$/.test(at)) return at;
        throw Object.assign(new Error('not there'), { code: 'ENOENT' });
      },
    };
    for (const file_path of ['C:\\Vault\\Settings\\AI matrix.md', 'Settings\\AI matrix.md', 'C:\\Vault\\harmless.md'])
      refusedWith(await guardGateFiles('Write', { file_path, content: '' }, ports), matrixNoteRefusal());
    allowed(await guardGateFiles('Write', { file_path: 'C:\\Vault\\plan.md', content: 'x' }, ports));
  });
});

describe('a note’s classification line', () => {
  test('an Edit or MultiEdit that changes or removes it is refused', async () => {
    const v = vault();
    const lower = { old_string: 'classification: secret', new_string: 'classification: public' };
    refusedWith(await guardGateFiles('Edit', { file_path: v.plan, ...lower }, v.ports), classificationRefusal());
    const cut = { old_string: 'classification: secret\n', new_string: '' };
    refusedWith(
      await guardGateFiles('MultiEdit', { file_path: v.plan, edits: [cut] }, v.ports),
      classificationRefusal(),
    );
  });

  test('an Edit that breaks the front matter around it, so the line no longer counts, is refused', async () => {
    const v = vault();
    const edit = { file_path: v.plan, old_string: '---\ntitle', new_string: 'title' };
    refusedWith(await guardGateFiles('Edit', edit, v.ports), classificationRefusal());
  });

  test('a Write that gives the note another classification, or none, is refused', async () => {
    const v = vault();
    const content = NOTE.replace('secret', 'public');
    refusedWith(await guardGateFiles('Write', { file_path: v.plan, content }, v.ports), classificationRefusal());
    refusedWith(
      await guardGateFiles('Write', { file_path: v.plan, content: 'The plan.\n' }, v.ports),
      classificationRefusal(),
    );
  });

  test('an edit that leaves it as it was, and a new note, are allowed', async () => {
    const v = vault();
    allowed(
      await guardGateFiles('Edit', { file_path: v.plan, old_string: 'The plan.', new_string: 'Our plan.' }, v.ports),
    );
    allowed(
      await guardGateFiles('Write', { file_path: v.plan, content: NOTE.replace('The plan', 'Our plan') }, v.ports),
    );
    allowed(await guardGateFiles('Write', { file_path: join(v.top, 'new.md'), content: NOTE }, v.ports));
  });

  test('a note that cannot be read is refused when the call carries a classification line at all', async () => {
    const v = vault({ read: false });
    const edit = { file_path: v.plan, old_string: 'x', new_string: 'classification: public' };
    refusedWith(await guardGateFiles('Edit', edit, v.ports), classificationRefusal());
    allowed(await guardGateFiles('Edit', { file_path: v.plan, old_string: 'x', new_string: 'y' }, v.ports));
  });

  test('Bash that names it is refused, unless it only searches or prints', async () => {
    const v = vault();
    for (const command of [`sed -i 's/classification: secret//' plan.md`, 'grep classification plan.md > out.md'])
      refusedWith(await guardGateFiles('Bash', { command }, v.ports), classificationRefusal());
    allowed(await guardGateFiles('Bash', { command: 'grep -n classification plan.md' }, v.ports));
  });

  test('a command chained from steps that only read is allowed, whatever it searches for', async () => {
    const v = vault();
    for (const command of [
      `cd ${v.top} && grep -n classification plan.md | head -5`,
      `grep -rn 'title|classification' . 2>/dev/null | wc -l`,
      `ls; grep -c "classification: secret" plan.md >/dev/null 2>&1`,
      `find . -name '*.md' | sort; cat classification`,
      `grep classification <<'EOF'\nnothing\nEOF`,
    ])
      allowed(await guardGateFiles('Bash', { command }, v.ports));
  });

  test('a chained command with a step that could write is refused when it names it', async () => {
    const v = vault();
    for (const command of [
      'grep classification plan.md | tee out.md',
      `grep -l classification *.md | xargs sed -i '' s/secret/public/`,
      `cat classification; sed -i '' s/secret/public/ plan.md`,
      'echo classification: public > plan.md',
      'echo classification >& plan.md',
      'cat classification &> plan.md',
      'cat plan.md # classification',
      'echo "$(sed -i s/classification:// plan.md)"',
      'echo "`sed -i s/classification:// plan.md`"',
      'echo `sed -i s/classification:// plan.md`',
      `ls *(e:'sed -i s/classification:// plan.md':)`,
      'find . -name classification -delete',
      'find . -name classification -exec rm {} +',
      'sort -o plan.md classification',
      'rg --pre ./change classification',
      'less -o plan.md classification',
      'ls classification; X=1 sed -i s/a/b/ plan.md',
      'if grep -q classification plan.md; then rm plan.md; fi',
      `python3 - <<'EOF'\nopen('plan.md', 'w').write('classification: public')\nEOF`,
      `echo 'classification`,
      'grep "classification plan.md',
    ])
      refusedWith(await guardGateFiles('Bash', { command }, v.ports), classificationRefusal());
  });

  test('a heredoc that makes a new note with its own classification is allowed', async () => {
    const v = vault();
    const text = '---\ntitle: New\nclassification: own\n---\n\nThe text; with $HOME & `ticks`.\n';
    const made = `cat > ${v.top}/new.md <<'EOF'\n${text}EOF`;
    allowed(await guardGateFiles('Bash', { command: made }, v.ports));
    allowed(await guardGateFiles('Bash', { command: `mkdir -p ${v.top}/sub && ${made}` }, v.ports));
    const spaced = `cat > "${v.top}/a new note.md" << "END"\n${text}END\n`;
    allowed(await guardGateFiles('Bash', { command: spaced }, v.ports));
    const home = `cat > ~/new.md <<-EOF\n\tclassification: own\n\tEOF`;
    allowed(await guardGateFiles('Bash', { command: home }, v.ports));
    const plain = `cat <<EOF > ${v.top}/new.md\n---\nclassification: own\n---\nEOF\ngrep -c classification plan.md`;
    allowed(await guardGateFiles('Bash', { command: plain }, v.ports));
  });

  test('a heredoc onto a note that exists is judged by what it leaves, as a Write is', async () => {
    const v = vault();
    for (const content of [NOTE.replace('secret', 'public'), 'classification: public\n', 'The plan.\n'])
      refusedWith(
        await guardGateFiles('Bash', { command: `cat > ${v.plan} <<'EOF'\n${content}EOF` }, v.ports),
        classificationRefusal(),
      );
    const same = `cat > ${v.plan} <<'EOF'\n${NOTE.replace('The plan', 'Our plan')}classification\nEOF`;
    allowed(await guardGateFiles('Bash', { command: same }, v.ports));
    const added = `cat >> ${v.plan} <<'EOF'\nThe word classification, in the text.\nEOF`;
    allowed(await guardGateFiles('Bash', { command: added }, v.ports));
  });

  test('a heredoc whose target or text cannot be known is refused when it names it', async () => {
    const v = vault();
    const body = `<<'EOF'\nclassification: public\nEOF`;
    for (const command of [
      `cat > plan.md ${body}`,
      `cat > $HOME/plan.md ${body}`,
      `cat > ${v.top}/pla*.md ${body}`,
      `cat > ${v.top}/a.md > ${v.plan} ${body}`,
      `cat > ${v.top}/a.md <<EOF\nclassification: public\n$(sed -i s/a/b/ ${v.plan})\nEOF`,
      `cat > ${v.top}/a.md <<EOF\nclassification: public\nnever closed`,
      `cat - > ${v.top}/a.md ${body}`,
      `tee ${v.top}/a.md ${body}`,
      `cat > ${v.top}/a.md ${body}\nmv ${v.top}/a.md ${v.plan}`,
    ])
      refusedWith(await guardGateFiles('Bash', { command }, v.ports), classificationRefusal());
  });

  test('a heredoc is refused when the note cannot be read to judge it', async () => {
    const v = vault({ read: false });
    const command = `cat > ${v.top}/new.md <<'EOF'\nclassification: own\nEOF`;
    refusedWith(await guardGateFiles('Bash', { command }, v.ports), classificationRefusal());
  });

  test('the refusals name no level, path or text of the call', () => {
    for (const refusal of [classificationRefusal(), matrixNoteRefusal()])
      assert.doesNotMatch(refusal, /secret|public|plan\.md|matrix\.md/);
  });
});

describe('the mod runs it', () => {
  test('in the same tool.call hook as the other guards, with the matrix note from the settings and a read', () => {
    const register = readFileSync(new URL('../mod/hooks/register.tsx', import.meta.url), 'utf8');
    const hook = /on\('tool\.call', async[\s\S]*?\.catch\(/.exec(register)?.[0] ?? '';
    assert.match(hook, /guardGateFiles\(tool, input/);
    assert.match(hook, /matrixNote: \(await settingsAt\(\$, data\)\)\.aiMatrixNote/);
    assert.match(hook, /read: \(path\) => \$\.fs\.read\(path\)/);
  });
});

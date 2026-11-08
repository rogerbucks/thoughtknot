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

  // The commands below are shaped on ones the guard refused in the vault, 7 Nov 2026. Roger ruled that day that a new
  // note may carry a classification, a screenshot's sidecar among them. A command that only reads may name it.
  test('a command that only reads is allowed, with substitutions, variables, git, and sed that only prints; one that could write is not', async () => {
    const v = vault();
    for (const command of [
      `cd ${v.top}; grep -rn "refusal.classification" . | grep -v -e node_modules | cut -c1-200; echo ---; ` +
        `f=$(grep -rln classification . | grep -v Settings | head -1); echo $f; ` +
        `grep -n "classification" "$f" | cut -c1-220 | head -40; git log --oneline -3 -- "$f"`,
      `sed -n 1,80p plan.md; grep -c classification plan.md`,
      `sed -n '/classification/p' plan.md`,
      `sed -n -e '1,3p' -e 's/classification: //p' plan.md | uniq`,
      `git -C ${v.top} check-ignore plan.md; grep -rIl classification . 2>/dev/null | head -30`,
      `n=$(grep -c classification plan.md) && [ "$n" -gt 0 ] && echo found`,
    ])
      allowed(await guardGateFiles('Bash', { command }, v.ports));
    for (const command of [
      `f=$(sed -i '' s/classification:// plan.md)`,
      `sed -n '1w plan.md' classification`,
      `sed -n -i '' 1p plan.md classification`,
      `sed -n 's/secret/public/w plan.md' classification`,
      `git log --output=plan.md classification`,
      `git -c core.pager=./change log classification`,
      `uniq classification plan.md`,
      `git commit -m classification`,
    ])
      refusedWith(await guardGateFiles('Bash', { command }, v.ports), classificationRefusal());
  });

  test('a new note made by Bash may carry a classification, by a relative path, a variable or a loop', async () => {
    const v = vault();
    mkdirSync(join(v.top, '+UK Move'));
    mkdirSync(join(v.top, 'images'));
    writeFileSync(join(v.top, 'images', '1.png'), 'png');
    const sidecars =
      `cd "${v.top}/+UK Move"; ts=$(date "+%Y-%m-%dT%H:%M"); echo $ts; src=${v.top}/images\n` +
      `cp "$src/1.png" "Shot one.png" && cp "$src/1.png" "Shot two.png"\n` +
      `for n in "Shot one" "Shot two"; do u=$(uuidgen | tr A-Z a-z); cat > "$n.png.md" <<EOF\n` +
      `---\nuuid: "$u"\ncreated: $ts\nclassification: Personal\n---\n\n# $n\nEOF\ndone`;
    for (const command of [
      sidecars,
      `T=$(date +%F); U=$(uuidgen); F="${v.top}/+UK Move/New task.md"; cat > "$F" <<EOF\n` +
        `---\nuuid: $U\ncreated: $T\nclassification: Personal\n---\nEOF`,
      `cd ${v.top} && D="New decision.md" && [ ! -e "$D" ] && cat > "$D" <<EOF\n---\nclassification: Own\n---\nEOF`,
      `cat > new.md <<'EOF'\nclassification: own\nEOF`,
      `printf 'classification: own\\n' > "${v.top}/new.md"`,
    ])
      allowed(await guardGateFiles('Bash', { command }, v.ports));
  });

  test('Bash that would change an existing note’s classification is still refused, however it names the note', async () => {
    const v = vault();
    mkdirSync(join(v.top, 'other'));
    writeFileSync(join(v.top, 'other', 'plan.md'), 'classification: public\n');
    for (const command of [
      `cd ${v.top}; F=plan.md; cat > "$F" <<EOF\n---\nclassification: $X\n---\nEOF`,
      `for n in new plan; do cat > "$n.md" <<'EOF'\n---\nclassification: public\n---\nEOF\ndone`,
      `cd /no/such/folder; cat > plan.md <<'EOF'\n---\nclassification: public\n---\nEOF`,
      `cat > "$NOT_SET/plan.md" <<'EOF'\nclassification: public\nEOF`,
      `echo classification; cp other/plan.md plan.md`,
      `echo classification; cp other/plan.md .`,
      `echo classification; mv other/plan.md ${v.top}`,
      `echo 'classification: public' >> plan.md`,
      `cd other && cd .. && sed -n 1p plan.md classification > plan.md`,
    ])
      refusedWith(await guardGateFiles('Bash', { command }, v.ports), classificationRefusal());
    const dropped = `cd ${v.top}; F=plan.md; cat > "$F" <<EOF\nThe plan, by $USER.\nEOF`;
    refusedWith(await guardGateFiles('Bash', { command: dropped }, v.ports), classificationRefusal());
  });

  test('a cd or a variable the shell may not set is not trusted to point away from an existing note', async () => {
    const v = vault();
    mkdirSync(join(v.top, 'away'));
    const body = `<<'EOF'\n---\nclassification: public\n---\nEOF`;
    for (const command of [
      `[ -e nothing ] && cd away; cat > plan.md ${body}`,
      `false || cd away; cat > plan.md ${body}`,
      `true | cd away; cat > plan.md ${body}`,
      `cd away & cat > plan.md ${body}`,
      `if [ -e nothing ]; then cd away; fi; cat > plan.md ${body}`,
      `F=new; [ -e nothing ] && F=new2; F=new && false || F=plan; cat > "$F.md" ${body}`,
      `F=new; G=new; for n in a b; do cat > "$F.md" ${body}\nF=$G; G=plan; done`,
      `for n in away ..; do cd $n; cat > plan.md ${body}\ndone`,
      `F=new; true | F=plan; cat > "$F.md" ${body}`,
    ])
      refusedWith(await guardGateFiles('Bash', { command }, v.ports), classificationRefusal());
    for (const command of [
      `cd away && cat > plan.md ${body}`,
      `F=new && [ ! -e "$F.md" ] && cat > "$F.md" ${body}`,
      `cd away; F=new; cat > "$F.md" ${body}`,
    ])
      allowed(await guardGateFiles('Bash', { command }, v.ports));
  });

  // Shaped on the command the guard refused on 8 Nov 2026: a Python heredoc that only made a new note. A new note may
  // carry a classification, so Python that writes only to files not yet made is allowed, as `cat` is.
  test('a Python heredoc that makes only new notes is allowed, however it names their paths', async () => {
    const v = vault();
    const py = (script) => `python3 - <<'PY'\n${script}\nPY`;
    const note = `"""---\nuuid: 1\nclassification: Own\n---\n\n# New\n"""`;
    for (const command of [
      py(`from pathlib import Path\np = Path("${v.top}/New note.md")\np.write_text(${note})\nprint("made", p)`),
      py(
        `import os\npath = os.path.join("${v.top}", "New note.md")\nwith open(path, "w", encoding="utf-8") as f:\n    f.write(${note})`,
      ),
      py(`from pathlib import Path\nbody = ${note}\n(Path.home() / "New note.md").write_text(body)`),
      py(
        `import os, datetime\nopen(os.path.expanduser("~/New note.md"), "x").write(${note}.replace("1", str(datetime.date.today())))`,
      ),
      `cd ${v.top} && ${py(`text = ${note}  # classification: Own\nopen("New note.md", mode="w").write(text)\nprint(open("plan.md").read().count("classification"))`)}`,
      `python3 <<EOF\nopen("${v.top}/new.md", "w").write("classification: Own")\nEOF`,
    ])
      allowed(await guardGateFiles('Bash', { command }, v.ports));
  });

  test('a Python heredoc or sed that would change an existing note’s classification is refused', async () => {
    const v = vault();
    const py = (script) => `python3 - <<'PY'\n${script}\nPY`;
    const sub = `.replace("classification: secret", "classification: public")`;
    for (const command of [
      `sed -i '' 's/classification: secret/classification: public/' ${v.plan}`,
      `sed -i.bak -e 's/^classification:.*/classification: public/' plan.md`,
      py(`p = "${v.plan}"\nt = open(p).read()\nopen(p, "w").write(t${sub})`),
      py(`from pathlib import Path\np = Path("${v.plan}")\np.write_text(p.read_text()${sub})`),
      py(
        `open("${v.top}/new.md", "w").write("classification: Own")\nopen("${v.plan}", "a").write("classification: public")`,
      ),
      py(`p = "${v.top}/new.md"\np = "${v.plan}"\nopen(p, "w").write("classification: public")`),
      py(`for p in ["${v.plan}"]:\n    open(p, "w").write("classification: public")`),
      py(`import os\nos.replace("${v.top}/new.md", "${v.plan}")  # classification`),
      py(`import shutil\nshutil.copy("${v.top}/x.md", "${v.plan}")  # classification`),
      py(`import subprocess\nsubprocess.run(["sed", "-i", "", "s/secret/public/", "${v.plan}"])  # classification`),
      py(`exec("open('${v.plan}', 'w').write('classification: public')")`),
      py(`o = open\no("${v.plan}", "w").write("classification: public")`),
      py(`import os as o\no.rename("${v.top}/new.md", "${v.plan}")  # classification`),
      py(`def f(p):\n    open(p, "w").write("classification: public")\nf("${v.plan}")`),
      py(`m = "w"\nopen("${v.top}/new.md", m).write("classification: Own")`),
      py(`open(f"${v.top}/{chr(112)}lan.md", "w").write("classification: public")`),
      `cd ${v.top} && python3 - <<PY\nopen("$F", "w").write("classification: public")\nPY`,
      `python3 script.py <<'PY'\nopen("${v.top}/new.md", "w").write("classification: Own")\nPY`,
    ])
      refusedWith(await guardGateFiles('Bash', { command }, v.ports), classificationRefusal());
  });

  test('a command the guard cannot read is refused when it names it', async () => {
    const v = vault();
    for (const command of [
      `python3 - <<'PY'\nopen("${v.top}/new.md", "w").write("classification: Own")\nnever closed`,
      `python3 - <<'PY'\nopen("${v.top}/new.md", "w").write("classification: Own)\nPY`,
      `python3 - <<'PY'\nopen("${v.top}/new.md", "w").write("""classification: Own\nPY`,
      `cat > ${v.top}/new.md <<EOF\nclassification: $(date)\nEOF`,
      `echo "classification: Own > ${v.top}/new.md`,
    ])
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

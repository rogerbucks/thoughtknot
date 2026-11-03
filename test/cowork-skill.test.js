// The Copilot Cowork skill (editor spec §46, cowork_skill, cowork_core_only, cowork_same_bytes, cowork_drawing,
// cowork_ceiling, cowork_no_server). A SKILL.md with a companion script lets Cowork read, check, draw and edit the graph
// blocks of notes kept in Microsoft 365:
// - it keeps within Cowork's limits and gives the same readings and problems as the core, on shared cases;
// - every reading, check, layout and edit comes from the library, and its prose states no notation rule of its own;
// - an edit gives the bytes the other hosts write, and nothing is written before the person approves it;
// - the drawing is an SVG and a PNG beside the note and a card, and one that cannot be drawn says why and gives text;
// - some notes are refused before they are read. They are one above the ceiling, one at the highest classification,
//   one holding a credential, and one whose classification cannot be read. A labelled note keeps its label;
// - the package names no connector, holds no secret, and its script makes no network call.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import {
  addedNear,
  addThing,
  deleted,
  gqlBlocks,
  gqlSpans,
  linkedTo,
  propertySet,
  quickLine,
  readNote,
  renamed,
  replaceBlock,
  sha256,
} from '@thoughtknot/core';
import { apply, approvalFor, clear, COWORK_LIMITS, draw, propose, read } from '../packages/cowork/src/cowork.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COWORK = join(ROOT, 'packages/cowork');
const SKILL = join(COWORK, 'skill/thoughtknot-graph-notes');
const sample = readFileSync(join(ROOT, 'test-vault/Sample graph note.md'), 'utf8');
const labelled = (level, text = sample) => `---\nclassification: ${level}\n---\n${text}`;
const open = labelled('Public');

const filesUnder = (dir) =>
  readdirSync(dir, { recursive: true })
    .map(String)
    .filter((p) => statSync(join(dir, p)).isFile())
    .map((p) => join(dir, p));
const sourceFiles = () =>
  filesUnder(COWORK).filter((f) => /\/(src|bin)\/.*\.ts$/.test(f) && !f.includes('node_modules'));
const skillFiles = () => filesUnder(SKILL);
/** The companion script's own answer to a command, run as Cowork runs it. */
const cli = (command, file, ...args) =>
  JSON.parse(
    execFileSync(process.execPath, [join(COWORK, 'bin/thoughtknot.ts'), command, file, ...args], { encoding: 'utf8' }),
  );

describe('the skill keeps within Cowork limits and gives the core readings and problems', () => {
  test('SKILL.md is a skill: front matter, a name and a description, within the line limit', () => {
    const text = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
    const front = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';
    const name = /^name: (.+)$/m.exec(front)?.[1] ?? '';
    const description = /^description: (.+)$/m.exec(front)?.[1] ?? '';
    assert.match(name, /^[a-z0-9-]{1,64}$/);
    assert.ok(description.length > 40 && description.length <= 1024, 'a description that says when to use it');
    assert.ok(!/[<>]/.test(description), 'no angle brackets in the description');
    assert.ok(text.split('\n').length <= COWORK_LIMITS.skillLines, 'within the line limit');
    assert.equal(name, 'thoughtknot-graph-notes', 'the folder in the .skill file is named for it');
  });

  test('every file the skill carries is small, and the companion files are the ones SKILL.md names', () => {
    let total = 0;
    for (const f of skillFiles()) {
      const size = statSync(f).size;
      assert.ok(size <= COWORK_LIMITS.fileBytes, `${f} is within the file limit`);
      total += size;
    }
    assert.ok(total <= COWORK_LIMITS.packageBytes);
    const text = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
    for (const named of text.match(/reference\/[\w.-]+\.md/g) ?? [])
      assert.ok(existsSync(join(SKILL, named)), `${named} exists`);
  });

  test('on a shared case it gives the readings and the problems the core gives', () => {
    const reading = readNote(gqlBlocks(open).map((b) => b.text));
    const got = read(open);
    const [drawing] = reading.graphs.values();
    assert.equal(got.graphs.length, reading.graphs.size);
    assert.deepEqual(
      got.graphs[0].things.map((t) => t.key),
      drawing.boxes.map((b) => b.key),
    );
    assert.deepEqual(
      got.graphs[0].links.map((l) => [l.from, l.reading, l.to]),
      drawing.links.map((l) => [l.from, l.reading, l.to]),
    );
    const real = reading.problems.filter((p) => p.severity !== 'hint');
    assert.ok(real.length > 0, 'the shared case has a problem to give');
    assert.deepEqual(
      got.problems.map((p) => p.message),
      real.map((p) => p.message),
    );
    for (const p of got.problems) assert.ok(p.line > 0, 'each problem is on a line of the note');
  });

  test('a note with no graph is said so, never read as empty', () => {
    const got = read('Just words, no graph.\n');
    assert.deepEqual(got.graphs, []);
    assert.ok(got.why);
  });
});

describe('the skill takes everything from the library', () => {
  test('its code imports only the library, node and itself', () => {
    for (const f of sourceFiles()) {
      for (const m of readFileSync(f, 'utf8').matchAll(/(?:import|from)\s+(?:[^'"]*from\s+)?['"]([^'"]+)['"]/g)) {
        const spec = m[1];
        assert.ok(
          spec === '@thoughtknot/core' || spec.startsWith('node:') || /^\.\.?\//.test(spec),
          `${f} imports ${spec}`,
        );
      }
    }
  });

  test('its prose states no notation rule of its own', () => {
    for (const f of skillFiles().filter((p) => p.endsWith('.md'))) {
      const text = readFileSync(f, 'utf8');
      assert.ok(!/\([a-z_]+\s*:\s*[A-Z]/.test(text), `${f} writes no thing in the notation`);
      assert.ok(!/\)-\[:|\]->/.test(text), `${f} writes no link in the notation`);
      assert.ok(!/\b(MATCH|SOURCE|SCHEMA|ElementType)\b/.test(text), `${f} names no keyword of the notation`);
      assert.ok(!/```\s*gql/i.test(text.replace(/`gql`/g, '')), `${f} shows no block of the notation`);
    }
  });
});

describe('an edit gives the same bytes as the other hosts, and only after approval', () => {
  // the shared cases: the library's own edit, written back by the library's own replaceBlock, as the other hosts write it
  const reading = readNote(gqlBlocks(open).map((b) => b.text));
  const texts = [...reading.texts];
  const keys = [...reading.graphs.get('reader').boxes.map((b) => b.key)];
  const written = (made) => {
    assert.ok(!('reason' in made), JSON.stringify(made));
    const span = gqlSpans(open)[made.block];
    const w = replaceBlock(open, { line: span.open, text: span.text }, made.now);
    assert.ok(w.ok);
    return w.note;
  };
  const cases = {
    rename: [
      { do: 'rename', thing: 'large_reader', text: 'Big e-ink reader' },
      () => written(renamed(texts, 'reader', 'large_reader', 'Big e-ink reader')),
    ],
    'add-child': [
      { do: 'add-child', thing: 'tablet', text: 'Cheap case' },
      () => written(addedNear(reading, 'reader', 'tablet', 'child', 'Cheap case')),
    ],
    'add-sibling': [
      { do: 'add-sibling', thing: 'tablet', text: 'Phone' },
      () => written(addedNear(reading, 'reader', 'tablet', 'sibling', 'Phone')),
    ],
    delete: [{ do: 'delete', thing: 'costs_nothing' }, () => written(deleted(texts, 'reader', 'costs_nothing'))],
    link: [
      { do: 'link', from: 'a4_pages', to: 'tablet' },
      () => written(linkedTo(reading, 'reader', 'a4_pages', 'tablet')),
    ],
    set: [
      { do: 'set', thing: 'tablet', prop: 'price', value: '120' },
      () => written(propertySet(reading, 'reader', 'tablet', 'price', '120')),
    ],
    line: [{ do: 'line', line: 'tablet -> Charger' }, () => written(quickLine(reading, 'reader', 'tablet -> Charger'))],
    new: [
      { do: 'new', text: 'A stand', kind: 'Option' },
      () => {
        const at = texts.findIndex((t) => /graph: reader/.test(t));
        const added = addThing(reading, 'reader', texts[at], { text: 'A stand', kind: 'Option' });
        return written({ block: at, now: added.text });
      },
    ],
  };
  for (const [name, [ask, expected]] of Object.entries(cases))
    test(`${name}: the bytes are the library's, and the approval is for them`, () => {
      assert.ok(keys.length > 0);
      const made = propose(open, ask);
      assert.ok('after' in made, JSON.stringify(made));
      assert.equal(made.after, expected());
      assert.equal(made.approve, approvalFor(open, made.after));
      assert.ok(made.after.startsWith('---\nclassification: Public\n---\n'), 'the label is kept as it was');
    });

  test('a note written with Windows line endings keeps them', () => {
    const crlf = open.replace(/\n/g, '\r\n');
    const made = propose(crlf, { do: 'rename', thing: 'large_reader', text: 'Big e-ink reader' });
    assert.ok('after' in made);
    assert.ok(!/[^\r]\n/.test(made.after), 'every line ending is still a pair');
  });

  test('a proposal writes nothing, and an edit is written only with its own approval', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cowork-edit-'));
    try {
      const file = join(dir, 'note.md');
      writeFileSync(file, open);
      const ask = { do: 'rename', thing: 'large_reader', text: 'Big e-ink reader' };
      const run = (command, ...args) => cli(command, file, ...args);
      const proposed = run('propose', '--edit', JSON.stringify(ask));
      assert.equal(readFileSync(file, 'utf8'), open, 'nothing is written by a proposal');
      assert.ok(proposed.approve && proposed.now && proposed.was);
      const refused = run('apply', '--edit', JSON.stringify(ask), '--approve', sha256('some other edit'));
      assert.equal(refused.written, false);
      assert.equal(readFileSync(file, 'utf8'), open, 'nothing is written without its own approval');
      assert.equal(run('apply', '--edit', JSON.stringify(ask)).written, false, 'nothing is written with no approval');
      const done = run('apply', '--edit', JSON.stringify(ask), '--approve', proposed.approve);
      assert.equal(done.written, true);
      assert.equal(readFileSync(file, 'utf8'), propose(open, ask).after);
      const again = apply(readFileSync(file, 'utf8'), ask, proposed.approve);
      assert.ok('refused' in again, 'the approval does not carry to the note as it now is');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('an approval is for one edit of one note: another edit or another note is refused', () => {
    const ask = { do: 'rename', thing: 'large_reader', text: 'Big e-ink reader' };
    const other = { do: 'rename', thing: 'large_reader', text: 'Huge e-ink reader' };
    const approve = propose(open, ask).approve;
    assert.ok('write' in apply(open, ask, approve));
    assert.ok('refused' in apply(open, other, approve), 'another edit');
    assert.ok('refused' in apply(`${open}\nMore words.\n`, ask, approve), 'another note');
  });

  test('an edit that is not an object is a usage answer in JSON, never a crash', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cowork-usage-'));
    try {
      const file = join(dir, 'note.md');
      writeFileSync(file, open);
      for (const bad of ['null', '0', '"x"', '[]']) {
        let out = '';
        try {
          execFileSync(process.execPath, [join(COWORK, 'bin/thoughtknot.ts'), 'propose', file, '--edit', bad], {
            encoding: 'utf8',
            stdio: 'pipe',
          });
        } catch (error) {
          out = error.stdout;
        }
        assert.ok(JSON.parse(out).error, `${bad} is said to be a usage mistake`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('an edit the library refuses is a refusal with its reason, never a write', () => {
    const made = propose(open, { do: 'rename', thing: 'no_such_thing', text: 'x' });
    assert.ok('refused' in made && made.refused.length > 0);
    assert.ok('refused' in propose(open, { do: 'unknown' }));
    assert.ok('refused' in propose(open, { do: 'rename', thing: 'tablet' }), 'a missing field is said');
  });
});

describe('the drawing is files beside the note and a card, never blank', () => {
  test('a shared case gives an SVG, a PNG that decodes, a card and the graph as text', async () => {
    const made = await draw(open, 'Public');
    assert.ok(made.svg?.startsWith('<svg'), 'an SVG');
    assert.ok(made.png, 'a PNG');
    const png = Buffer.from(made.png);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    const width = png.readUInt32BE(16),
      height = png.readUInt32BE(20);
    assert.ok(width >= 800 && height >= 100);
    const idat = png.indexOf('IDAT');
    const data = inflateSync(png.subarray(idat + 4, idat + 4 + png.readUInt32BE(idat - 4)));
    assert.equal(data.length, (width * 3 + 1) * height, 'its pixels are all there');
    assert.ok(new Set(data).size > 20, 'it is not a blank picture');
    assert.match(made.card, /7 things, 7 links/);
    assert.match(made.card, /Public/, "the card names the note's classification");
    assert.ok(made.text.length > 1, 'and the graph as text');
  });

  test('the files are written beside the note by the script', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cowork-draw-'));
    try {
      const file = join(dir, 'note.md');
      writeFileSync(file, open);
      const got = cli('draw', file);
      assert.deepEqual(
        got.files.map((f) => f.slice(dir.length + 1)),
        ['note.svg', 'note.png'],
      );
      assert.ok(existsSync(join(dir, 'note.svg')) && existsSync(join(dir, 'note.png')));
      assert.equal(readFileSync(file, 'utf8'), open, 'the note is untouched');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a different file already beside the note is kept unless the person says to replace it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cowork-keep-'));
    try {
      const file = join(dir, 'note.md');
      writeFileSync(file, open);
      writeFileSync(join(dir, 'note.png'), "the person's own picture");
      const kept = cli('draw', file);
      assert.deepEqual(
        kept.kept.map((f) => f.slice(dir.length + 1)),
        ['note.png'],
      );
      assert.equal(readFileSync(join(dir, 'note.png'), 'utf8'), "the person's own picture");
      assert.deepEqual(
        cli('draw', file, '--replace').files.map((f) => f.slice(dir.length + 1)),
        ['note.svg', 'note.png'],
      );
      assert.notEqual(readFileSync(join(dir, 'note.png'), 'utf8'), "the person's own picture");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a note that cannot be drawn says why and gives text, with no files', async () => {
    const made = await draw('No graph here.\n', null);
    assert.ok(made.why, 'it says why');
    assert.ok(made.text.length > 0 && made.card.includes(made.why), 'the card and the text say it');
    assert.equal(made.svg, undefined);
    assert.equal(made.png, undefined);
  });
});

describe('the note is held to its classification and the ceiling before it is read', () => {
  test('a note with no classification is refused, by default, with the reason', () => {
    const got = clear(sample);
    assert.equal(got.open, false);
    assert.ok('refuse' in got && /classification/i.test(got.refuse));
  });

  test('a note at the highest classification is refused, whatever the settings', () => {
    const got = clear(labelled('Restricted'), {
      aiModels: [{ name: 'Claude', purpose: '', ceiling: 'Restricted', endpoint: '', model: '', keyName: '' }],
    });
    assert.ok('refuse' in got);
  });

  test('a classification that cannot be read for certain is refused', () => {
    assert.ok('refuse' in clear('---\nclassification: [Public, Internal]\n---\nA note.\n'));
  });

  test('a credential is refused at any classification', () => {
    const key = 'AKIA' + 'IOSFODNN7EXAMPLE';
    const got = clear(labelled('Public', `${sample}\naws_access_key_id = ${key}\n`));
    assert.ok('refuse' in got, JSON.stringify(got));
    assert.ok(!JSON.stringify(got).includes(key), 'what it says never holds the credential');
  });

  test('a note above the ceiling asks first, and a yes for its digest lets it in', () => {
    const note = labelled('Internal');
    const asked = clear(note);
    assert.ok('ask' in asked && asked.digest === sha256(note));
    const yes = clear(note, {}, asked.digest);
    assert.equal(yes.open, true);
    assert.equal(clear(note, {}, sha256('another note')).open, false, 'a yes for another note is no yes');
  });

  test('nothing is read into the conversation from a refused note, by the script', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cowork-gate-'));
    try {
      const file = join(dir, 'note.md');
      writeFileSync(file, sample);
      for (const command of ['read', 'check', 'draw']) {
        const got = cli(command, file);
        assert.equal(got.read, false);
        assert.ok(!JSON.stringify(got).includes('Which device'), `${command} says nothing the note says`);
      }
      assert.ok(!existsSync(join(dir, 'note.svg')), 'and draws nothing');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('the skill leaves Microsoft 365 labels in force: it tells the person, and keeps the label bytes', () => {
    const text = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
    assert.match(text, /sensitivity label/);
    assert.match(text, /does not replace the sensitivity label/);
    const made = propose(labelled('Public'), { do: 'rename', thing: 'tablet', text: 'A tablet' });
    assert.ok('after' in made && made.after.startsWith('---\nclassification: Public\n---\n'));
  });
});

describe('the skill needs no server of ours', () => {
  test('its package names no connector, holds no secret and its code makes no network call', () => {
    const all = [...skillFiles(), ...sourceFiles(), join(COWORK, 'package.json'), join(COWORK, 'esbuild.config.mjs')];
    for (const f of all) {
      const text = readFileSync(f, 'utf8');
      assert.ok(!/\bmcpServers\b|\bconnector\b.*\bhttps?:/i.test(text), `${f} names no connector`);
      assert.ok(!/(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"][^'"]{8,}/i.test(text), `${f} holds no secret`);
    }
    for (const f of sourceFiles()) {
      const text = readFileSync(f, 'utf8');
      assert.ok(
        !/node:(?:https?|net|tls|dgram|dns|http2)\b|\bfetch\s*\(|XMLHttpRequest|WebSocket|https?:\/\//.test(text),
        `${f} makes no network call`,
      );
    }
    const names = JSON.parse(readFileSync(join(COWORK, 'package.json'), 'utf8')).dependencies;
    assert.deepEqual(Object.keys(names), ['@thoughtknot/core'], 'the library is its one dependency');
  });
});

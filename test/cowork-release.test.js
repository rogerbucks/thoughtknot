// The Copilot Cowork skill is built from the repository and published with each library release (editor spec §46,
// cowork_released). A person downloads it from the release page and adds it to Cowork, or to Claude.
// - The release and the nightly build it, checksum it and attach it, after the library's packages.
// - It is a zip with one folder, `thoughtknot-graph-notes/`: SKILL.md, the reference it names, the companion script,
//   LICENSE and THIRD_PARTY_NOTICES.md.
// - The companion script is built from the library at the tagged version, and runs on a note with nothing installed.
// - The same SKILL.md loads as a Claude skill: its front matter holds a name and a description, and it names no host.
// Proved on a .skill built for the test, read back with a zip reader written here.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, inflateRawSync } from 'node:zlib';
import { FOLDER, packSkill, skillName } from '../scripts/cowork-release.mjs';
import { read } from './repository/repo.js';

/** The files of a zip, by name, each checked against the checksum the zip gives it. */
function unzip(bytes) {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = bytes.readUInt16LE(end + 10);
  let at = bytes.readUInt32LE(end + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    assert.equal(bytes.readUInt32LE(at), 0x02014b50, 'a central directory entry');
    const method = bytes.readUInt16LE(at + 10);
    const crc = bytes.readUInt32LE(at + 16);
    const packed = bytes.readUInt32LE(at + 20);
    const nameLength = bytes.readUInt16LE(at + 28);
    const extra = bytes.readUInt16LE(at + 30) + bytes.readUInt16LE(at + 32);
    const local = bytes.readUInt32LE(at + 42);
    const name = bytes.toString('utf8', at + 46, at + 46 + nameLength);
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const data = bytes.subarray(start, start + packed);
    const content = method === 8 ? inflateRawSync(data) : data;
    assert.equal(crc32(content), crc, `${name}'s checksum`);
    files.set(name, content);
    at += 46 + nameLength + extra;
  }
  return files;
}

const VERSION = '0.7.2';

describe('the release and the nightly attach the Cowork skill', () => {
  for (const workflow of ['.github/workflows/release.yml', '.github/workflows/nightly.yml']) {
    test(`${workflow} builds the .skill, checksums it and attaches it`, () => {
      const text = read(workflow);
      const build = text.indexOf('node scripts/cowork-release.mjs --out .');
      assert.ok(build > 0, 'it builds the .skill');
      assert.ok(build > text.indexOf('node scripts/library-release.mjs'), 'after the library it is built from');
      const sums = text.split('\n').find((line) => line.includes('sha256sum'));
      const create = text.split('\n').find((line) => line.includes('gh release create'));
      assert.match(sums, /thoughtknot-cowork-\$\w+\.skill/, 'it is in SHA256SUMS');
      assert.match(create, /thoughtknot-cowork-\$\w+\.skill/, 'it is attached to the release');
      assert.ok(build < text.indexOf('gh release create'), 'built before the release is made');
      assert.ok(text.includes('thoughtknot-*.skill'), 'it is carried between the jobs');
    });
  }

  test('its name carries its version', () => {
    assert.equal(skillName('0.8.0'), 'thoughtknot-cowork-0.8.0.skill');
  });
});

describe('the .skill the release builds', { timeout: 300_000 }, () => {
  let dir, files, file;
  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'cowork-release-'));
    file = await packSkill({ version: VERSION, out: dir });
    files = unzip(readFileSync(file));
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  test('is one folder with SKILL.md, its reference, the companion script, LICENSE and the notices', () => {
    assert.equal(file.slice(dir.length + 1), skillName(VERSION));
    assert.deepEqual(
      [...files.keys()].sort(),
      [
        `${FOLDER}/LICENSE`,
        `${FOLDER}/SKILL.md`,
        `${FOLDER}/THIRD_PARTY_NOTICES.md`,
        `${FOLDER}/reference/commands.md`,
        `${FOLDER}/scripts/thoughtknot.mjs`,
      ].sort(),
    );
  });

  test("its SKILL.md is the repository's, byte for byte", () => {
    assert.equal(
      files.get(`${FOLDER}/SKILL.md`).toString(),
      readFileSync(join(import.meta.dirname, '../packages/cowork/skill/thoughtknot-graph-notes/SKILL.md'), 'utf8'),
    );
  });

  test('the same SKILL.md reads as a Claude skill: a name and a description, no host named', () => {
    const text = files.get(`${FOLDER}/SKILL.md`).toString();
    const front = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';
    const keys = front.split('\n').map((l) => l.split(':')[0]);
    assert.deepEqual(keys, ['name', 'description'], 'only what a Claude skill reads');
    assert.equal(/^name: (.+)$/m.exec(front)[1], FOLDER, "the folder is the skill's name");
    assert.ok(!/copilot|cowork|microsoft/i.test(front), 'the front matter names no host');
  });

  test('its companion script is built from the library at the tagged version, and runs with nothing installed', () => {
    const script = files.get(`${FOLDER}/scripts/thoughtknot.mjs`).toString();
    assert.ok(script.startsWith(`// built from @thoughtknot/core ${VERSION}\n`), 'it names the library version');
    const work = mkdtempSync(join(tmpdir(), 'cowork-run-'));
    try {
      writeFileSync(join(work, 'thoughtknot.mjs'), script);
      const note = join(work, 'note.md');
      writeFileSync(
        note,
        "---\nclassification: Public\n---\n```gql\n// graph: g\n(a:Thing {name: 'A'}),\n(b:Thing {name: 'B'}),\n(a)-[:LINKS]->(b)\n```\n",
      );
      const got = JSON.parse(
        execFileSync(process.execPath, [join(work, 'thoughtknot.mjs'), 'read', note], { encoding: 'utf8', cwd: work }),
      );
      assert.equal(got.read, true);
      assert.equal(got.graphs[0].things.length, 2);
      const drawn = JSON.parse(
        execFileSync(process.execPath, [join(work, 'thoughtknot.mjs'), 'draw', note], { encoding: 'utf8', cwd: work }),
      );
      assert.deepEqual(
        drawn.files.map((f) => f.slice(work.length + 1)),
        ['note.svg', 'note.png'],
      );
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  test("its script imports nothing but node's own modules", () => {
    const script = files.get(`${FOLDER}/scripts/thoughtknot.mjs`).toString();
    for (const m of script.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm))
      assert.ok(m[1].startsWith('node:'), `it imports ${m[1]}`);
  });
});

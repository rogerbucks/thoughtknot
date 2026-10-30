// Where a reader picture sits in a note, and whether it is up to date (editor spec §62). The picture is linked by one
// Markdown image line straight after its gql block. Its file is named after the note and the graph, ending
// .thoughtknot.svg. It names itself as ThoughtKnot's with the fingerprint of the text drawn. Only that is read from it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ALT_MOST,
  isPictureFile,
  madeByThoughtKnot,
  pictureAlt,
  pictureFileName,
  pictureFingerprint,
  pictureHref,
  pictureLine,
  pictureLines,
  pictureLinkOf,
  pictureMark,
  pictureState,
  pictureTarget,
  pictureTexts,
  withPictureLine,
  withoutPictureLines,
} from '../src/reader-picture-note.ts';

const NOTE = [
  '# People',
  '',
  '```gql',
  '// graph: people',
  "(alice:Person {name: 'Alice'})-[:KNOWS]->(bob:Person {name: 'Bob'})",
  '```',
  'Some text.',
  '',
  '```gql',
  '// graph: places',
  "(home:Place {name: 'Home'})",
  '```',
].join('\n');

describe('a reader picture’s name and link', () => {
  // proves: picture_for_readers
  test('is named after the note and the graph, ending .thoughtknot.svg, safe on every platform', () => {
    assert.equal(pictureFileName('Work/People.md', 'people'), 'People.people.thoughtknot.svg');
    assert.equal(pictureFileName('My: notes?.md', 'g'), 'My-notes.g.thoughtknot.svg');
    assert.ok(isPictureFile('a/b/People.people.thoughtknot.svg'));
    assert.ok(!isPictureFile('a/b/People.svg'), 'an SVG of someone else’s is not ours');
  });

  // proves: picture_for_readers
  test('is linked relative to the note, as GitHub and every Markdown reader resolve it, and read back the same', () => {
    const cases = [
      ['People.md', 'attachments/People.people.thoughtknot.svg', 'attachments/People.people.thoughtknot.svg'],
      ['Work/People.md', 'Work/People.people.thoughtknot.svg', 'People.people.thoughtknot.svg'],
      [
        'Work/Team/People.md',
        'attachments/My note (1).thoughtknot.svg',
        '../../attachments/My%20note%20%281%29.thoughtknot.svg',
      ],
    ];
    for (const [note, picture, href] of cases) {
      assert.equal(pictureHref(note, picture), href);
      assert.equal(pictureTarget(note, href), picture);
    }
  });
});

describe('the image line after a block', () => {
  const line = pictureLine('Graph people: 2 things [and] 1 link.', 'People.people.thoughtknot.svg');

  // proves: picture_for_readers
  test('is a plain Markdown image, its alt on one line with its brackets escaped', () => {
    assert.equal(line, '![Graph people: 2 things \\[and\\] 1 link.](People.people.thoughtknot.svg)');
    assert.equal(pictureLinkOf(line), 'People.people.thoughtknot.svg');
    assert.equal(pictureLinkOf('![a picture](holiday.png)'), null, 'an image of the person’s own is never ours');
    assert.equal(pictureLinkOf('see ![x](a.thoughtknot.svg) here'), null, 'only a line alone');
  });

  // proves: picture_for_readers
  test('goes straight after the block’s closing fence, in place of the one there, keeping the note’s line endings', () => {
    const once = withPictureLine(NOTE, 0, line);
    const lines = once.split('\n');
    assert.equal(lines[6], line, 'straight after the fence');
    assert.equal(lines[7], 'Some text.', 'the rest kept');
    assert.equal(withPictureLine(once, 0, line), once, 'twice is once');
    assert.deepEqual(pictureLines(once), [{ block: 0, line: 6, href: 'People.people.thoughtknot.svg' }]);
    const crlf = withPictureLine(NOTE.replace(/\n/g, '\r\n'), 0, line);
    assert.equal(crlf.split('\n')[6], `${line}\r`, 'with the note’s \\r');
    assert.ok(withPictureLine(NOTE, 1, line).endsWith(`\`\`\`\n${line}`), 'the last block gets one too');
    assert.equal(
      withPictureLine('```gql\n// graph: g\n(a)', 0, line),
      '```gql\n// graph: g\n(a)',
      'none after an unclosed block',
    );
  });

  // proves: picture_for_readers
  test('is taken away alone, and only the ones asked for', () => {
    const both = withPictureLine(
      withPictureLine(NOTE, 0, line),
      1,
      pictureLine('Places', 'People.places.thoughtknot.svg'),
    );
    assert.equal(withoutPictureLines(both), NOTE);
    assert.equal(
      withoutPictureLines(both, (p) => p.block === 1),
      withPictureLine(NOTE, 0, line),
    );
    const own = NOTE.replace('# People', '![a picture](holiday.thoughtknot.svg)');
    assert.equal(withoutPictureLines(own), own, 'a line not straight after a block is the person’s');
  });
});

describe('whether a picture is up to date', () => {
  const texts = pictureTexts(NOTE, 'people');

  // proves: picture_kept_in_step
  test('is the fingerprint of the blocks of its graph alone, and of the note it names', () => {
    assert.equal(texts.length, 1);
    assert.match(texts[0], /alice/);
    const print = pictureFingerprint('People.md', texts);
    assert.match(print, /^[0-9a-f]{16}$/);
    assert.equal(pictureFingerprint('People.md', pictureTexts(NOTE, 'people')), print, 'the same text, the same print');
    const edited = NOTE.replace("'Bob'", "'Robert'");
    assert.notEqual(pictureFingerprint('People.md', pictureTexts(edited, 'people')), print, 'an edit changes it');
    const other = NOTE.replace("'Home'", "'House'");
    assert.equal(
      pictureFingerprint('People.md', pictureTexts(other, 'people')),
      print,
      'another graph’s edit does not',
    );
    const styled = `${NOTE}\n\`\`\`gql\n// graph: people_look · STYLE ON people\n\`\`\`\n`;
    assert.equal(pictureTexts(styled, 'people').length, 2, 'a style on it counts');
    assert.notEqual(pictureFingerprint('Moved/People.md', texts), print, 'a note moved names another place');
  });

  // proves: picture_kept_in_step, picture_never_read
  test('is read only from the picture’s own mark: none, current, old, or not made by ThoughtKnot', () => {
    const print = pictureFingerprint('People.md', texts);
    const ours = `<svg>\n${pictureMark(print)}<text>anything at all</text></svg>`;
    assert.equal(pictureState(null, print), 'missing');
    assert.equal(pictureState(ours, print), 'current');
    assert.equal(pictureState(ours, '0123456789abcdef'), 'stale');
    assert.equal(pictureState('<svg><text>mine</text></svg>', print), 'not-ours');
    assert.ok(madeByThoughtKnot(ours));
    assert.ok(!madeByThoughtKnot('<svg/>'), 'only a file that names itself as ours may be overwritten or removed');
  });
});

describe('the alt text', () => {
  // proves: picture_self_explaining
  test('is the plain-language reading on one line, cut between words to a set length', () => {
    assert.equal(pictureAlt(['Graph g: 2 things.', 'Alice.']), 'Graph g: 2 things. Alice.');
    const long = pictureAlt(Array.from({ length: 200 }, (_, i) => `Thing number ${i}.`));
    assert.ok(long.length <= ALT_MOST, `${long.length} characters`);
    assert.ok(long.endsWith('…'));
    assert.doesNotMatch(long, / …$/, 'no space before the ellipsis');
  });
});

describe('the shared cases, which the Python reader runs too', () => {
  const cases = JSON.parse(readFileSync(new URL('./reader-picture-cases.json', import.meta.url), 'utf8'));

  // proves: picture_same_everywhere
  test('give the same names, links, fingerprints, states and lines as the table says', () => {
    for (const c of cases.fileNames) assert.equal(pictureFileName(c.note, c.graph), c.name, c.note);
    for (const c of cases.links) {
      assert.equal(pictureHref(c.note, c.picture), c.href, c.picture);
      assert.equal(pictureTarget(c.note, c.href), c.back, c.href);
    }
    for (const c of cases.texts) {
      assert.deepEqual(pictureTexts(cases.note, c.graph), c.texts, c.graph);
      assert.equal(pictureFingerprint('Work/Team.md', c.texts), c.fingerprint, c.graph);
    }
    for (const c of cases.states) assert.equal(pictureState(c.existing, c.fingerprint), c.state);
    for (const c of cases.linesOf) assert.equal(pictureLinkOf(c.line), c.href, c.line);
    for (const c of cases.alts) assert.equal(pictureAlt(c.sentences, c.most), c.alt);
    assert.equal(pictureLine(cases.pictureLine.alt, cases.pictureLine.href), cases.pictureLine.line);
    assert.deepEqual(pictureLines(cases.note), cases.pictureLines);
    for (const c of cases.withLine)
      assert.equal(withPictureLine(cases.note, c.block, '![new](n.thoughtknot.svg)'), c.note, `block ${c.block}`);
    assert.equal(withoutPictureLines(cases.note), cases.without);
  });
});

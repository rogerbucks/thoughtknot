// Finding links in text (editor spec §18, links_shown, safe_to_click). Each kind of link is found with where it is
// written, what it names and what it shows. Only notes, files, web and mail addresses are ever opened: any other scheme,
// however it is disguised, is refused. Text full of openers that never close is read in one pass.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  attachmentType,
  destinationRefused,
  leavingWords,
  linkKind,
  linksIn,
  linkTo,
  refusedWords,
} from '../src/link-scan.ts';

/** The parts of each link in `text` that say what it is: written, target, label, kind and whether embedded. */
const seen = (text) =>
  linksIn(text).map(({ written, target, label, kind, embed, opens }) => ({
    written,
    target,
    label,
    kind,
    embed,
    opens,
  }));

describe('each kind of link is found, with what it names and shows', () => {
  test('a wikilink with a heading and an alias names its note, opens at the heading and shows the alias', () => {
    assert.deepEqual(seen('See [[Plans#Budget|the plans]] now.'), [
      {
        written: '[[Plans#Budget|the plans]]',
        target: 'Plans',
        label: 'the plans',
        kind: 'note',
        embed: false,
        opens: 'Plans#Budget',
      },
    ]);
  });

  test('an embed of a picture is a file, written with `!`', () => {
    const [link] = seen('![[photo.png]]');
    assert.equal(link.kind, 'file');
    assert.equal(link.embed, true);
    assert.equal(link.target, 'photo.png');
  });

  test('a Markdown link names its decoded destination and shows its label', () => {
    const [link] = linksIn('A [map](Maps/Big%20Map.md) here');
    assert.equal(link.target, 'Maps/Big Map.md');
    assert.equal(link.label, 'map');
    assert.equal(link.markdown, true);
  });

  test('a bare web address is a web link, and where it sits in the text is kept, line by line', () => {
    const text = 'first line\nthen https://example.org/a and more';
    const [link] = linksIn(text);
    assert.equal(link.kind, 'web');
    assert.equal(text.slice(link.start, link.end), link.written);
    assert.equal(text.slice(link.targetAt.start, link.targetAt.end), link.target);
  });

  test('several links on one line come back in the order written', () => {
    assert.deepEqual(
      linksIn('[[A]] and [[B]] and [[C]]').map((l) => l.target),
      ['A', 'B', 'C'],
    );
  });

  test('a link with no closing mark is no link, and does not hide the one after it', () => {
    assert.deepEqual(
      linksIn('[[Never closed and [[Closed]]').map((l) => l.target),
      ['Closed'],
    );
  });
});

describe('only notes, files, web and mail addresses are opened (safe_to_click)', () => {
  test('a note, a file, a web and a mail address are each their own kind', () => {
    assert.equal(linkKind('Plans'), 'note');
    assert.equal(linkKind('Docs/report.pdf'), 'file');
    assert.equal(linkKind('https://example.org'), 'web');
    assert.equal(linkKind('mailto:me@example.org'), 'mail');
  });

  test('any other scheme is refused, however it is disguised', () => {
    for (const target of ['javascript:alert(1)', 'java\tscript:alert(1)', 'javascript&#58;alert(1)', ' JAVASCRIPT:x'])
      assert.equal(linkKind(target), 'refused', target);
    assert.equal(linkKind('//elsewhere.example'), 'refused');
    assert.equal(linkKind('file:///etc/passwd'), 'refused');
  });

  test('a Markdown destination whose scheme is percent-encoded is refused once decoded', () => {
    assert.equal(destinationRefused('javascript%3Aalert(1)'), true);
    assert.equal(destinationRefused('Maps/Big%20Map.md'), false);
  });

  test('a rendered link is judged as a written one is', () => {
    assert.equal(linkTo('javascript:alert(1)').kind, 'refused');
    const note = linkTo('Plans#Budget');
    assert.equal(note.kind, 'note');
    assert.equal(note.target, 'Plans');
    assert.equal(note.opens, 'Plans#Budget');
  });
});

describe('what a link is, said plainly', () => {
  test('the type of a vault file in words, and null for a note', () => {
    assert.equal(attachmentType('a/b/photo.JPG'), 'image');
    assert.equal(attachmentType('data.csv'), 'CSV file');
    assert.equal(attachmentType('report.pdf'), 'PDF');
    assert.equal(attachmentType('Plans'), null);
    assert.equal(attachmentType('.hidden'), null);
  });

  test('a link that leaves the vault says where it goes; one in the vault says nothing; a refused one says so', () => {
    assert.match(leavingWords(linkTo('https://example.org')), /example\.org/);
    assert.match(leavingWords(linkTo('mailto:me@example.org?subject=hi')), /me@example\.org/);
    assert.doesNotMatch(leavingWords(linkTo('mailto:me@example.org?subject=hi')), /subject/);
    assert.equal(leavingWords(linkTo('Plans')), null);
    assert.match(refusedWords(linkTo('javascript:x')), /javascript:x/);
  });
});

describe('text full of openers that never close (spec §9)', () => {
  test('is read in one pass, and finds the link at its end', { timeout: 5000 }, () => {
    const text = `${'[[ x ('.repeat(50000)}[[End]]`;
    assert.deepEqual(
      linksIn(text).map((l) => l.target),
      ['End'],
    );
  });
});

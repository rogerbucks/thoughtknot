// The image line after a graph block shows the picture in a plain Markdown reader (editor spec ES§62,
// picture_for_readers). A reader with no plug-in is a CommonMark renderer, so the note is rendered with one.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { marked } from 'marked';
import { pictureAlt, pictureHref, pictureLine, withPictureLine } from '../../core/src/reader-picture-note.ts';

const NOTE = '# People\n\n```gql\n// graph: people\n(a:Person {name: "A"})\n```\n\nSome text.\n';

describe('a Markdown reader with no plug-in', () => {
  // proves: picture_for_readers
  test('shows the picture where the image line is, with the words as its alternative', () => {
    const href = pictureHref('Notes/People.md', 'Notes/People.people.thoughtknot.svg');
    const alt = pictureAlt(['Graph people: 1 thing [and] 0 links.']);
    const html = marked.parse(withPictureLine(NOTE, 0, pictureLine(alt, href)));
    assert.match(html, /<img src="People\.people\.thoughtknot\.svg" alt="Graph people: 1 thing \[and\] 0 links\.">/);
    assert.ok(html.indexOf('<img') > html.indexOf('</code></pre>'), 'straight after the block, before the text');
    assert.ok(html.indexOf('<img') < html.indexOf('Some text.'));
  });

  // proves: picture_for_readers
  test('shows a picture in another folder by a link that works from the note', () => {
    const href = pictureHref('Notes/People.md', 'attachments/My note (1).thoughtknot.svg');
    const html = marked.parse(pictureLine('a picture', href));
    assert.match(html, /<img src="\.\.\/attachments\/My%20note%20%281%29\.thoughtknot\.svg" alt="a picture">/);
  });
});

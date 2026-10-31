// A picture of a graph for readers without ThoughtKnot (editor spec §62). It is the export's image of the whole graph,
// in fixed light colours on its own page. It has its title, its legend and a line saying ThoughtKnot drew it, from which
// note and when. Its description is the plain-language reading cut to length. A graph too large is its overview, saying
// what is left out. A classified note is asked about first. The same text gives the same bytes.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from '../src/engine.ts';
import { readNote } from '../src/drawing.ts';
import { PALETTES } from '../src/palette.ts';
import { chosen, directions, svgOf } from '../src/render.ts';
import {
  PICTURE_MOST_THINGS,
  drawnPictureLines,
  notePictures,
  pictureBlocks,
  readerPicture,
  withoutDrawnPictures,
} from '../src/reader-picture.ts';
import {
  ALT_MOST,
  madeByThoughtKnot,
  pictureFingerprint,
  pictureHref,
  pictureLinkOf,
  pictureState,
  pictureTexts,
  withPictureLine,
} from '../src/reader-picture-note.ts';

const engine = await loadEngine();
/** A host's layout, laid out here on the thread. */
const layout = async (d, theme) => {
  const laid = directions(d);
  return chosen(
    laid,
    laid.map((x) => svgOf(engine, x.dot, d.routing)),
    PALETTES[theme],
  );
};

const BLOCK = `// graph: team
(ann:Person {name: 'Ann'}),
(bob:Person {name: 'Bob'}),
(desk:Place {name: 'Desk'}),
(ann)-[:ASKS]->(bob),
(bob)-[:SITS_AT]->(desk)`;
const TEXT = `# Team\n\n\`\`\`gql\n${BLOCK}\n\`\`\`\n`;
/** The words an SVG says, its wrapped lines joined by a space. */
const said = (svg) => svg.replace(/<\/tspan><tspan[^>]*>/g, ' ').replace(/<[^>]+>/g, '\n');
const SETTINGS = { classifications: ['Public', 'Internal', 'Confidential'], exportAsksAbove: 'Internal' };
const input = (over = {}) => ({
  reading: readNote([BLOCK]),
  graph: 'team',
  note: 'Work/Team.md',
  text: TEXT,
  date: '2026-10-30',
  layout,
  noteClassification: null,
  settings: SETTINGS,
  ...over,
});

describe('a reader picture', () => {
  // proves: picture_for_readers
  test('is an SVG file to link by one image line after the block, named after the note and the graph', async () => {
    const { picture } = await readerPicture(input());
    assert.match(picture.svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.equal(picture.fileName, 'Team.team.thoughtknot.svg');
    const href = pictureHref('Work/Team.md', `attachments/${picture.fileName}`);
    const note = withPictureLine(TEXT, 0, picture.line(href));
    const after = note.split('\n')[note.split('\n').indexOf('```', 3) + 1];
    assert.equal(pictureLinkOf(after), '../attachments/Team.team.thoughtknot.svg');
    assert.ok(after.startsWith('![Graph team: 3 things, 2 links.'), 'its alt text the reading');
  });

  // proves: picture_self_explaining
  test('carries its title, legend, who drew it from which note and when, its own page, and its reading as alt text', async () => {
    const { picture } = await readerPicture(input());
    const { svg } = picture;
    assert.match(svg, /<title>team<\/title>/, 'its title');
    assert.ok((svg.match(/class="legend-swatch"/g) ?? []).length >= 2, 'a legend entry for each kind');
    assert.match(
      said(svg),
      /\nDrawn by ThoughtKnot from Work\/Team\.md, 30 Oct 2026\n/,
      'who drew it, from where, when',
    );
    assert.match(
      svg,
      new RegExp(`<rect x="0" y="0" width="\\d+" height="\\d+" fill="${PALETTES.light.page}"/>`),
      'its page',
    );
    assert.doesNotMatch(svg, /var\(--|color-mix/, 'no theme colour a reader outside Obsidian could not read');
    assert.match(
      svg,
      /<desc>Graph team: 3 things, 2 links\. Ann is a Person\.[^<]*<\/desc>/,
      'the reading, for screen readers',
    );
    assert.ok(picture.alt.length <= ALT_MOST);
  });

  // proves: picture_kept_in_step
  test('names itself as ThoughtKnot’s with the fingerprint of its text, and the same text gives the same bytes', async () => {
    const a = (await readerPicture(input())).picture,
      b = (await readerPicture(input())).picture;
    assert.equal(a.svg, b.svg, 'byte for byte');
    assert.ok(madeByThoughtKnot(a.svg));
    assert.equal(a.fingerprint, pictureFingerprint('Work/Team.md', pictureTexts(TEXT, 'team')));
    assert.equal(pictureState(a.svg, a.fingerprint), 'current', 'nothing to write while the text is unchanged');
    const edited = TEXT.replace("'Bob'", "'Robert'"),
      after = (await readerPicture(input({ text: edited, reading: readNote([BLOCK.replace("'Bob'", "'Robert'")]) })))
        .picture;
    assert.equal(pictureState(a.svg, after.fingerprint), 'stale', 'an edit makes the old picture out of date');
    assert.match(after.svg, />Robert</);
  });

  // proves: picture_never_read
  test('is made from the text alone: no picture file is an input, so changing or deleting one changes nothing', async () => {
    const { picture } = await readerPicture(input());
    assert.ok(
      !Object.keys(input()).some((k) => /picture|svg|file/i.test(k)),
      'nothing of the old picture is asked for',
    );
    assert.equal(
      pictureState('<svg>tampered</svg>', picture.fingerprint),
      'not-ours',
      'a file changed by hand is not ours',
    );
    const reading = readNote([BLOCK]);
    assert.deepEqual([...reading.graphs.keys()], ['team'], 'the note reads the same with or without a picture');
  });

  // proves: picture_big_graph
  test('of a graph too large to draw is its overview, with a line saying what is left out', async () => {
    const n = PICTURE_MOST_THINGS + 20;
    const big = [
      '// graph: big',
      ...Array.from({ length: n }, (_, i) => `(t${i}:${i % 2 ? 'Odd' : 'Even'} {name: 'T ${i}'}),`),
      '(t0)-[:NEXT]->(t1)',
    ].join('\n');
    const asked = [];
    const spy = (d, theme) => (asked.push(d), layout(d, theme));
    const { picture } = await readerPicture(
      input({ reading: readNote([big]), graph: 'big', text: `\`\`\`gql\n${big}\n\`\`\`\n`, layout: spy }),
    );
    assert.equal(asked.length, 0, 'never laid out thing by thing');
    assert.equal(picture.overview, true);
    const words = said(picture.svg);
    assert.match(
      words,
      new RegExp(
        `\\n${n} things left out of this picture, too many to read one by one: it shows them as \\d+ groups?\\n`,
      ),
    );
    assert.match(words, /\nDrawn by ThoughtKnot from Work\/Team\.md/);
    assert.doesNotMatch(picture.svg, /<desc><\/desc>/, 'never blank');
  });

  // proves: picture_big_graph
  test('whose layout refuses is its overview too, and one no longer wanted is nothing', async () => {
    const refused = async () => ({ reason: 'timed-out', ms: 5000 });
    assert.equal((await readerPicture(input({ layout: refused }))).picture.overview, true);
    assert.equal(await readerPicture(input({ layout: async () => null })), null);
  });

  // proves: picture_classified
  test('of a note classified above the level is asked about first, and made once the user says yes', async () => {
    const ask = await readerPicture(input({ noteClassification: 'Confidential' }));
    assert.match(ask.ask, /classified Confidential, above Internal/);
    assert.ok('picture' in (await readerPicture(input({ noteClassification: 'Confidential', confirmed: true }))));
    assert.ok(
      'picture' in (await readerPicture(input({ noteClassification: 'Public' }))),
      'at or below it, no question',
    );
  });

  // proves: picture_for_readers
  test('of a graph with nothing in it is none, and says why', async () => {
    const { nothing } = await readerPicture(input({ graph: 'missing' }));
    assert.match(nothing, /nothing/i);
  });
});

describe('the pictures of a whole note', () => {
  const NOTE = [
    '```gql',
    BLOCK,
    '```',
    '```gql',
    '// graph: team_look · STYLE ON team',
    '```',
    '```gql',
    '// graph: team_ink · SKETCH ON team',
    "(d1:Text {x: 5, y: 5, text: 'Ask Bob first'})",
    '```',
    '```gql',
    '// graph: team · MORE',
    "(cat:Pet {name: 'Cat'})",
    '```',
  ].join('\n');

  // proves: picture_for_readers
  test('go after the first block of each graph drawn as a graph, never after a style or a drawings block', () => {
    assert.deepEqual(pictureBlocks(NOTE), [{ block: 0, graph: 'team' }]);
    assert.deepEqual(pictureBlocks('```gql\n// graph: g\n```\n```gql\n// graph: h\n(a)\n```'), [
      { block: 0, graph: 'g' },
      { block: 1, graph: 'h' },
    ]);
  });

  // proves: picture_hidden_when_drawn
  test('a host hides the picture line after a block it draws, and keeps one after a style block', () => {
    const lined = NOTE.replace(
      '```\n```gql\n// graph: team_look',
      '```\n![Team](Team.team.thoughtknot.svg)\n```gql\n// graph: team_look',
    ).replace(
      '// graph: team_look · STYLE ON team\n```',
      '// graph: team_look · STYLE ON team\n```\n![Look](Team.look.thoughtknot.svg)',
    );
    assert.deepEqual(drawnPictureLines(lined), [lined.split('\n').indexOf('![Team](Team.team.thoughtknot.svg)')]);
    const shown = withoutDrawnPictures(lined);
    assert.doesNotMatch(shown, /!\[Team\]/);
    assert.match(shown, /!\[Look\]/);
    assert.equal(withoutDrawnPictures(NOTE), NOTE, 'a note with no picture line is left as it is');
  });

  // proves: picture_for_readers, picture_self_explaining, sketch_reader_picture
  test('are each drawn with the note’s drawings over them', async () => {
    const [one, ...rest] = await notePictures({
      text: NOTE,
      note: 'Team.md',
      date: '2026-10-30',
      layout,
      noteClassification: null,
      settings: SETTINGS,
    });
    assert.equal(rest.length, 0);
    assert.equal(one.block, 0);
    assert.match(one.decision.picture.svg, /Ask Bob first/, 'the drawings are on it (§70)');
  });
});

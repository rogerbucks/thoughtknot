// No meaning is carried by colour alone (editor spec §44, colour_never_alone; WCAG 1.4.1), held across the whole style
// sheet. test/colour-alone.test.js checks the places a colour once stood alone. This one stops a new one: each rule of a
// style sheet that sets a colour for a state (an `.is-…` class) must set a line, a weight or a sign too, or be listed
// below with the word or icon that carries the same meaning and the file that makes it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CHANGE_LOOKS } from '../packages/core/src/changes-view.ts';
import { read } from './repository/repo.js';
import { rulesOf, SHEETS } from './repository/sheet-rules.js';

const COLOUR = /^(color|background(-color)?|border(-[a-z]+)*-color|outline-color|fill|stroke|accent-color)$/;
const CUE =
  /^(text-decoration(-style|-line)?|border(-[a-z]+)*-style|stroke-dasharray|stroke-width|content|font-style|font-weight|outline(-style|-width)?|box-shadow)$/;

/** Each state rule that is colour alone in the sheet, with where its word or icon is made: [file, text the file holds]. */
const CARRIED = {
  '.thoughtknot-proposal-checked.is-failed': [
    ['packages/core/src/display/proposals/proposal-strip.ts', "word('proposal.check-fails'"],
    [
      'packages/core/src/proposal-card-source-words.ts',
      "'proposal.check-fails': 'The graph spec’s check of this change set fails",
    ],
  ],
  '.thoughtknot-proposal-row.is-add': [
    ['packages/core/src/proposal-source-words.ts', "'proposal.said.add': 'Added: {change}'"],
  ],
  '.thoughtknot-proposal-row.is-change': [
    ['packages/core/src/proposal-source-words.ts', "'proposal.said.change': 'Changed: {change}'"],
  ],
  '.thoughtknot-proposal-row.is-remove': [
    ['packages/core/src/proposal-source-words.ts', "'proposal.said.remove': 'Removed: {change}'"],
  ],
  '.thoughtknot-proposal-row.is-accepted': [
    ['packages/core/src/proposal-card-source-words.ts', "'proposal.accepted-by': 'Accepted by {who} on {day}'"],
  ],
  '.thoughtknot-proposal-row.is-rejected': [
    ['packages/core/src/proposal-card-source-words.ts', "'proposal.rejected-by': 'Rejected by {who} on {day}'"],
  ],
  '.thoughtknot-badge.is-calm': [
    ['packages/core/src/display/graph-view/view-bar.ts', "'check-circle'"],
    ['packages/core/src/display/graph-view/view-bar.ts', "word('bar.no-problems')"],
  ],
  '.thoughtknot-badge.is-error': [
    ['packages/core/src/display/graph-view/view-bar.ts', "'alert-triangle'"],
    ['packages/core/src/display/graph-view/view-bar.ts', "word('bar.problems'"],
  ],
  '.thoughtknot-line-sign.is-error': [
    ['packages/core/src/display/editor/text-picture.ts', "sign === '✖' ? ' is-error'"],
  ],
  '.thoughtknot-fixbar .is-error': [
    ['test/colour-alone.test.js', 'by the sign in the fix bar: ✖ for an error, ⚠ for a warning'],
  ],
};

/** The state rules (an `.is-…` class, outside a media query) of the sheets that set a colour and nothing else to tell by. */
function colourOnly() {
  const found = new Set();
  for (const sheet of SHEETS)
    for (const rule of rulesOf(sheet).filter((r) => !r.media)) {
      const props = rule.declarations.map(([p]) => p);
      if (!props.some((p) => COLOUR.test(p)) || props.some((p) => CUE.test(p))) continue;
      for (const s of rule.selectors.filter((x) => /\.is-[a-z]/.test(x))) found.add(s);
    }
  return [...found].sort();
}

describe('a state told by colour in the style sheets has a word, an icon or a line too', () => {
  // proves: colour_never_alone
  test('every state rule that sets only a colour is listed with what carries its meaning', () => {
    const missing = colourOnly().filter((s) => !(s in CARRIED));
    assert.deepEqual(
      missing,
      [],
      'a state told by colour alone: add a line, a weight or a sign, or list it here with its word',
    );
  });

  // proves: colour_never_alone
  test('each listed rule is still in the sheets, and its word or icon is still made', () => {
    const live = new Set(colourOnly());
    for (const [selector, carriers] of Object.entries(CARRIED)) {
      assert.ok(live.has(selector), `${selector} is no longer colour alone: take it off the list`);
      for (const [file, text] of carriers) assert.ok(read(file).includes(text), `${selector}: ${file} lacks ${text}`);
    }
  });
});

describe('a change is told from another by more than its hue', () => {
  // proves: colour_never_alone
  test('each kind of change has a line style or a font style, and no two are alike', () => {
    const marks = Object.entries(CHANGE_LOOKS);
    assert.deepEqual(marks.map(([k]) => k).sort(), ['add', 'change', 'remove']);
    const told = marks.map(([k, look]) => {
      assert.ok(look.line || look.format, `${k} is told by its hue alone`);
      return `${look.line ?? ''}/${look.format ?? ''}`;
    });
    assert.equal(new Set(told).size, told.length, told.join(' '));
  });
});

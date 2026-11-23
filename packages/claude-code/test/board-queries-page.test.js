// AI queries on a whiteboard on the browser editor's page (editor spec ES§75, on the board of ES§45). It is the page
// the phone app runs. The page has no AI, so a board there gets hand filters, saved queries reopened, and their marks.
// Requirements: ai_query_highlight, ai_query_saved and ai_query_replay.
// - The board's Filter button opens the panel over the board's graph. Nothing is asked in words there.
// - A saved query opens with nothing sent and marks its cards. Ask again is not offered, and the panel says why.
// The page runs as built, in a DOM, against the real server.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { until } from '../../obsidian/test/host/load-plugin.js';
import { cleanUp } from './editor-page-support.js';
import { livePage } from './editor-page-live.js';

after(cleanUp);

/** Gives jsdom's window the structuredClone every browser the page runs in has, Safari on the phone too. */
const browserLike = (window) => {
  window.structuredClone = structuredClone;
};

const fence = (body) => ['```gql', body, '```'].join('\n');
const NOTE = [
  '# Work',
  fence(
    [
      '// graph: plan · BOARD ON work',
      "(a:Sticky {x: 0, y: 0, text: 'Roof', graph: 'roof'}),",
      "(b:Sticky {x: 200, y: 0, text: 'Walls', graph: 'walls'}),",
      "(c:Sticky {x: 400, y: 0, text: 'Floor', graph: 'floor'}),",
      "(d:Sticky {x: 0, y: 200, text: 'Ask the builder'})",
    ].join('\n'),
  ),
  fence(
    [
      '// graph: work',
      "(roof:Task {name: 'Roof', status: 'late'}), (walls:Task {name: 'Walls', status: 'done'}),",
      "(floor:Task {name: 'Floor', status: 'late'}), (roof)-[:NEEDS]->(walls)",
    ].join('\n'),
  ),
  fence(
    [
      '// graph: work_style · STYLE work',
      "(named_1:NamedFilter {name: 'Late', kind: 'Task', when: 'status == \"late\"'}),",
      "(query_1:SavedQuery {name: 'Late', filter: 'Late', words: '[\"late tasks\"]', show: 'highlight', locked: false})",
    ].join('\n'),
  ),
  '',
].join('\n');

describe('a board on the browser editor’s page, which has no AI', () => {
  // proves: ai_query_saved
  // proves: ai_query_replay
  // proves: ai_query_highlight
  test('reopens a saved query with nothing sent and marks its cards; it says why Ask again is not offered', async () => {
    const page = await livePage(NOTE, { before: browserLike });
    try {
      const board = () => page.doc.querySelector('.gn-boards .thoughtknot-board');
      await until(() => board()?.querySelector('[data-item="a"]'), 8000);
      const filter = board().querySelector(
        '.thoughtknot-board-queries-bar button[aria-label="Filter by kind or link"]',
      );
      assert.ok(filter, 'the board has a Filter button');
      filter.click();
      const panel = () => board().querySelector('.thoughtknot-filter-ask');
      const saved = () => panel()?.querySelector('[data-saved="Late"]');
      await until(() => saved(), 8000);
      assert.equal(panel().querySelector('[name="filter-ask"]'), null, 'no box to ask an AI in');
      const named = (root, label) => root.querySelector(`button[aria-label="${label}"]`);
      assert.equal(named(saved(), 'Ask again'), null, 'no Ask again');
      assert.match(
        panel().querySelector('.thoughtknot-saved-queries-no-again').textContent,
        /Ask again is not offered/,
        'its absence is said, never just missing',
      );
      named(saved(), 'Open').click();
      await until(() => panel().querySelectorAll('.thoughtknot-query').length === 1, 8000);
      assert.match(panel().querySelector('[role="status"]').textContent, /Late/, 'it says which query opened');
      const marked = () =>
        Array.from(board().querySelectorAll('svg [data-item].thoughtknot-query-marked')).map((g) =>
          g.getAttribute('data-item'),
        );
      await until(() => marked().length === 2, 8000);
      assert.deepEqual(marked().sort(), ['a', 'c'], 'the cards on late tasks are marked');
      assert.equal(board().querySelectorAll('svg .thoughtknot-query-ring').length, 6, 'three rings on each');
      assert.match(board().querySelector('.thoughtknot-board-queries-said').textContent, /Show all/);
      assert.equal(page.file(), NOTE, 'the note is untouched');
    } finally {
      await page.stop();
    }
  });
});

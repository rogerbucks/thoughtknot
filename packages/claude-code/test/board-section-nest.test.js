// A board inside a board, and a board proposed, on the browser editor's page (editor spec §45, board_nested,
// board_proposed). The page runs as built, in a DOM, against the real server. Each edit is written to the note on disk.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { until } from '../../obsidian/test/host/load-plugin.js';
import { cleanUp } from './editor-page-support.js';
import { livePage } from './editor-page-live.js';

after(cleanUp);

const NESTED = [
  '# Ideas',
  '```gql',
  '// graph: ideas · BOARD',
  "(v:View {x: 0, y: 0, w: 400, h: 300, board: 'plan'})",
  '```',
  '',
  '```gql',
  '// graph: plan · BOARD',
  "(b:Sticky {x: 10, y: 20, text: 'Book it'})",
  '```',
  '',
].join('\n');

describe('a board inside a board on the browser editor’s page', () => {
  // proves: board_nested
  test('is entered by zooming in on its view, left by zooming out or a pinch, and the trail is a way back', async () => {
    const page = await livePage(NESTED);
    try {
      const boards = () => page.doc.querySelector('.gn-boards');
      const vp = () => boards().querySelector('.thoughtknot-viewport');
      const on = (id) =>
        boards()?.querySelector(`.thoughtknot-board > .thoughtknot-viewport > svg > [data-item="${id}"]`);
      const wheel = (deltaY) =>
        vp().dispatchEvent(
          new page.window.WheelEvent('wheel', { deltaY, clientX: 150, clientY: 120, bubbles: true, cancelable: true }),
        );
      const trail = () => boards().querySelector('.thoughtknot-board-trail');
      await until(() => on('v'), 8000);
      await until(() => on('v')?.querySelector('.thoughtknot-board-view-picture [data-item="b"]'), 8000);
      assert.equal(trail(), null, 'no trail on a board opened from the list');
      wheel(100);
      assert.ok(on('v'), 'zooming out of the outermost board stays on it');

      for (let i = 0; i < 8 && on('v'); i++) wheel(-100);
      await until(() => !on('v') && boards().querySelector('.thoughtknot-board [data-item="b"]'), 8000);
      assert.equal(trail().querySelector('button').textContent, 'ideas');
      assert.equal(trail().querySelector('[aria-current="true"]').textContent, 'plan');
      assert.equal(page.file(), NESTED, 'going in writes nothing');

      // out until the whole inner board is in view, then once more
      for (let i = 0; i < 12 && !on('v'); i++) wheel(100);
      await until(() => on('v'), 8000);
      assert.equal(trail(), null, 'back out on the board it sits on');

      vp().focus();
      vp().dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      vp().dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await until(() => !on('v') && trail(), 8000);
      trail().querySelector('button').click();
      await until(() => on('v'), 8000);
      assert.equal(page.file(), NESTED);

      // on touch: in by Enter again, then two fingers drawn together on the whole board go back out
      vp().focus();
      vp().dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await until(() => !on('v') && trail(), 8000);
      const touch = (type, pointerId, clientX) =>
        vp().dispatchEvent(
          new page.window.PointerEvent(type, {
            pointerId,
            pointerType: 'touch',
            clientX,
            clientY: 200,
            bubbles: true,
            cancelable: true,
          }),
        );
      const pinchOut = () => {
        touch('pointerdown', 1, 100);
        touch('pointerdown', 2, 400);
        touch('pointermove', 2, 250);
        touch('pointerup', 1, 100);
        touch('pointerup', 2, 250);
      };
      for (let i = 0; i < 6 && !on('v'); i++) pinchOut();
      await until(() => on('v'), 8000);
      assert.equal(trail(), null, 'a pinch came back out');
    } finally {
      await page.stop();
    }
  });
});

const TEAM = [
  '# Team',
  '```gql',
  '// graph: team',
  "(ann:Person {name: 'Ann'}), (bob:Person {name: 'Bob'}), (acme:Company {name: 'Acme'}),",
  '(ann)-[:KNOWS]->(bob), (ann)-[:WORKS_AT]->(acme)',
  '```',
  '',
  '```gql',
  '// graph: ideas · BOARD ON team',
  "(a:Sticky {x: 0, y: 0, text: 'Ann'})",
  '```',
  '',
].join('\n');

describe('a board proposed on the browser editor’s page', () => {
  // proves: board_proposed
  test('is shown with what each item came from, written only when kept, and dropped without a trace', async () => {
    const page = await livePage(TEAM);
    try {
      const boards = () => page.doc.querySelector('.gn-boards');
      const draft = () => boards()?.querySelector('.thoughtknot-board-draft');
      const press = (words) =>
        Array.from(boards().querySelectorAll('button'))
          .find((b) => b.textContent === words)
          .click();
      await until(() => boards()?.querySelector('.thoughtknot-board [data-item="a"]'), 8000);
      press('Propose a board from the graph');
      await until(() => draft()?.querySelector('[data-item="view1"]'), 8000);
      assert.match(draft().querySelector('p').textContent, /team_views\. Nothing is written until you keep it/);
      assert.equal(draft().querySelectorAll('.thoughtknot-board-draft-cited li').length, 4);
      assert.match(draft().querySelector('.thoughtknot-board-draft-cited li').textContent, /note1: The graph team/);
      assert.equal(page.file(), TEAM, 'a proposal writes nothing');
      assert.equal(draft().querySelector('.thoughtknot-board-tools [data-tool="sticky"]'), null, 'it is read only');

      press('Not this one');
      await until(() => !draft() && boards().querySelector('.thoughtknot-board [data-item="a"]'), 8000);
      assert.equal(page.file(), TEAM, 'dropped, nothing was written');

      press('Propose a board from the graph');
      await until(() => draft(), 8000);
      press('Keep this board');
      await until(() => /graph: team_views · BOARD ON team/.test(page.file()), 8000);
      assert.ok(page.file().startsWith(TEAM.trimEnd()), 'the note as it was comes first');
      await until(
        () => !draft() && boards().querySelector('summary').textContent === 'Boards: team_views, 2 of 2',
        8000,
      );
    } finally {
      await page.stop();
    }
  });
});

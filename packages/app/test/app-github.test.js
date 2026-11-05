// Sending a note to GitHub from the desktop app (spec §48, github_repo_access, github_repo_writes_reviewed).
// - The GitHub button opens a panel of settings, kept in the window's storage, never in a note.
// - In the editor it sends the open note: the show-before-send screen comes first, and only Send lets it go.
// - Every gh call goes through the app's one gh command, and a call off the list never reaches it.
// - A phone has no GitHub button: gh runs on a computer only.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { ghCallRefusal } from '@thoughtknot/core';
import { cleanUpApp, emptyFolder, fakeInvoke } from './app-window.js';
import { GITHUB_KEY, githubButton, keptSettings, showOutgoing } from '../src/app-github.ts';
import { tauriGh } from '../src/tauri-gh.ts';
import { startApp } from '../src/app-start.ts';
import { until } from '../../obsidian/test/host/load-plugin.js';

after(cleanUpApp);

const NOTE = '---\nclassification: Public\n---\n# Trip\n\n```gql\n// graph: trip\n(a:Place)\n```\n';
const SHA = 'a'.repeat(40);

/** The app's commands over `folder`, with `run_gh` answered by a GitHub in memory. `calls` keeps each gh call. */
function appWithGitHub(folder, own = null) {
  const inner = fakeInvoke(folder, null, own);
  const branches = new Map([['main', new Map()]]);
  const calls = [];
  const pulls = [];
  const ok = (v) => ({ code: 0, stdout: JSON.stringify(v), stderr: '' });
  const missing = { code: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)' };
  const invoke = async (command, args) => {
    if (command !== 'run_gh') return inner(command, args);
    calls.push(args);
    assert.equal(ghCallRefusal(args.args, args.input), null, 'only calls on the list reach the command');
    const [, , , , method, address] = args.args;
    const body = args.input ? JSON.parse(args.input) : null;
    const [path, query = ''] = address.split('?');
    const rest = path.split('/').slice(3);
    if (rest[0] === 'git' && rest[1] === 'ref')
      return branches.has(rest.slice(3).join('/')) ? ok({ object: { sha: SHA } }) : missing;
    if (rest[0] === 'git' && rest[1] === 'refs') {
      branches.set(body.ref.replace('refs/heads/', ''), new Map(branches.get('main')));
      return ok({});
    }
    if (rest[0] === 'pulls') {
      pulls.push(body);
      return ok({ number: 3, html_url: 'https://github.com/ada/graphs/pull/3' });
    }
    const file = decodeURIComponent(rest.slice(1).join('/'));
    if (method === 'GET') {
      const text = branches.get(query.replace('ref=', ''))?.get(file);
      return text === undefined
        ? missing
        : ok({ type: 'file', sha: SHA, content: Buffer.from(text).toString('base64') });
    }
    branches.get(body.branch).set(file, Buffer.from(body.content, 'base64').toString('utf8'));
    return ok({ content: { sha: 'b'.repeat(40) } });
  };
  return { invoke, calls, branches, pulls };
}

function windowFor() {
  const { window } = new JSDOM('<!doctype html><body><main id="gn-app"></main></body>', {
    url: 'https://app.invalid/',
  });
  return window;
}

/** Opens the panel in a window over `folder` with `note` open; `answer` is what the show-before-send screen says. */
function panel(folder, note, answer = true) {
  const window = windowFor();
  const app = appWithGitHub(folder);
  const shown = [];
  const button = githubButton({
    doc: window.document,
    invoke: app.invoke,
    store: window.localStorage,
    note,
    show: async (s) => (shown.push(s), answer),
  });
  window.document.body.append(button);
  button.click();
  const dialog = window.document.querySelector('dialog.gn-app-github');
  const byLabel = (text) =>
    [...dialog.querySelectorAll('label')]
      .find((l) => l.textContent.includes(text))
      .querySelector('input, textarea, select');
  const type = (text, value) => {
    const c = byLabel(text);
    c.value = value;
    c.dispatchEvent(new window.Event('input'));
  };
  const press = (text) => [...dialog.querySelectorAll('button')].find((b) => b.textContent === text).click();
  const status = () => dialog.querySelector('[role=status]').textContent;
  return { window, dialog, app, shown, type, press, status, byLabel };
}

test('the panel keeps its settings in the window, says what is wrong, and sends nothing until they are right', () => {
  const p = panel(emptyFolder(), 'Trip.md');
  assert.match(p.dialog.querySelector('[role=alert]').textContent, /Pick a repository/);
  const send = [...p.dialog.querySelectorAll('button')].find((b) => b.textContent === 'Send this note');
  assert.equal(send.disabled, true);
  p.type('Repositories', 'ada/graphs');
  assert.equal(p.dialog.querySelector('[role=alert]').textContent, '');
  assert.equal(send.disabled, false);
  assert.deepEqual(keptSettings(p.window.localStorage).repos, ['ada/graphs']);
  assert.match(p.window.localStorage.getItem(GITHUB_KEY), /thoughtknot\/graphs/);
  p.type('Branch the changes go on', 'main');
  assert.match(p.dialog.querySelector('[role=alert]').textContent, /main branch/);
  assert.equal(send.disabled, true);
});

test('Send this note shows what goes first, then commits it on the branch; a review is asked for the same way', async () => {
  const folder = emptyFolder();
  writeFileSync(join(folder, 'Trip.md'), NOTE);
  const p = panel(folder, 'Trip.md');
  p.type('Repositories', 'ada/graphs');
  p.press('Send this note');
  await until(() => /Sent to/.test(p.status()), 4000);
  assert.equal(p.shown.length, 1);
  assert.equal(p.shown[0].title, 'Send this new note to GitHub?');
  assert.ok(p.shown[0].diff.some((l) => l.kind === 'add' && l.text === '# Trip'));
  assert.equal(p.app.branches.get('thoughtknot/graphs').get('Trip.md'), NOTE);
  assert.equal(p.app.branches.get('main').size, 0, 'main is never written');
  p.press('Ask for a review');
  await until(() => /Pull request 3/.test(p.status()), 4000);
  assert.deepEqual([p.app.pulls[0].head, p.app.pulls[0].base], ['thoughtknot/graphs', 'main']);
});

test('Cancel on the show-before-send screen sends nothing at all', async () => {
  const folder = emptyFolder();
  writeFileSync(join(folder, 'Trip.md'), NOTE);
  const p = panel(folder, 'Trip.md', false);
  p.type('Repositories', 'ada/graphs');
  p.press('Send this note');
  await until(() => /chose not to send/.test(p.status()), 4000);
  assert.ok(
    p.app.calls.every((c) => c.args[4] === 'GET'),
    'only reads were made',
  );
  assert.equal(p.app.branches.size, 1);
});

test('a note above the allowed level is refused, and never shown or sent', async () => {
  const folder = emptyFolder();
  writeFileSync(join(folder, 'Plan.md'), '---\nclassification: Confidential\n---\n# Plan\n');
  const p = panel(folder, 'Plan.md');
  p.type('Repositories', 'ada/graphs');
  p.press('Send this note');
  await until(() => /Confidential/.test(p.status()), 4000);
  assert.equal(p.shown.length, 0);
  assert.ok(p.app.calls.every((c) => c.args[4] === 'GET'));
});

test('the show-before-send screen: rows, lines marked + and -, Cancel focused first, Escape cancels', async () => {
  const window = windowFor();
  const doc = window.document;
  const shown = {
    title: 'Send this change to GitHub?',
    rows: [['Repository', 'ada/graphs']],
    diff: [
      { kind: 'remove', text: 'old' },
      { kind: 'add', text: 'new' },
    ],
    count: 1,
  };
  const yes = showOutgoing(doc, shown);
  const dialog = doc.querySelector('dialog.gn-app-outgoing');
  assert.equal(dialog.getAttribute('aria-labelledby'), 'gn-outgoing-title');
  assert.equal(dialog.querySelector('pre').textContent, '- old\n+ new');
  assert.equal(doc.activeElement.textContent, 'Cancel');
  dialog.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(await yes, false);
  assert.equal(doc.querySelector('dialog'), null);
  const second = showOutgoing(doc, { ...shown, diff: null, count: 900 });
  assert.match(doc.querySelector('dialog').textContent, /900 lines/);
  [...doc.querySelectorAll('dialog button')].find((b) => b.textContent === 'Send').click();
  assert.equal(await second, true);
});

test('a gh call off the list never reaches the app’s command; a missing gh is said in words', async () => {
  const asked = [];
  const run = tauriGh(async (command, args) => {
    asked.push(command);
    throw 'gh-missing';
  });
  await assert.rejects(run(['auth', 'token']), /may not run that gh call/);
  assert.deepEqual(asked, []);
  await assert.rejects(
    run(['api', '--hostname', 'github.com', '--method', 'GET', 'repos/ada/graphs/git/ref/heads/main']),
    /gh, GitHub’s command line, is not installed/,
  );
});

test('the list of notes has the GitHub button on a computer, and none on a phone', async () => {
  const folder = emptyFolder();
  for (const [own, expected] of [
    [null, 1],
    ['Documents', 0],
  ]) {
    const window = windowFor();
    await startApp(window.document, appWithGitHub(folder, own).invoke, () => {});
    await until(() => window.document.querySelector('#gn-app button'), 4000);
    assert.equal(window.document.querySelectorAll('.gn-app-github-open').length, expected, `own folder ${own}`);
  }
});

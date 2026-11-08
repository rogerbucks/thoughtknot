// The developer site (ES§41, developer_site):
// - Made from the repository: the library docs, the graph format spec and the nightly builds.
// - Its words come from one catalogue, every word used and none missing.
// - WCAG 2.2 AA in the light and the dark scheme, by the same check as the home page.
// - Its nightly page is kept out of search engines: a noindex tag here, and a Disallow and no sitemap place at the root.
// - It is served from dev/ of the home page's site, at thoughtknot.app/dev/ (Roger, 6 Nov 2026).
// - Mirrors for a right-to-left language.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { THEMES, audit, openWindow, pageStyleFor } from './repository/wcag.js';
import { path, read, readJSON } from './repository/repo.js';
import { renderSite } from '../scripts/site.mjs';
import {
  DEV_SITE_URL,
  INDEXED,
  NIGHTLY,
  nightlies,
  renderDeveloperSite,
  specSections,
} from '../scripts/developer-site.mjs';

const PAGES = ['index.html', 'libraries.html', 'spec.html', NIGHTLY];
const releases = [
  { tagName: '0.8.0', publishedAt: '2026-11-04T10:00:00Z', isPrerelease: false },
  { tagName: '0.8.1-nightly.20261105', publishedAt: '2026-11-05T18:00:00Z', isPrerelease: true },
  { tagName: '0.8.1-nightly.20261106', publishedAt: '2026-11-06T18:00:00Z', isPrerelease: true },
];
const sources = {
  layout: read('site-dev/layout.html'),
  pages: Object.fromEntries(PAGES.map((n) => [n, read(`site-dev/${n}`)])),
  catalogue: readJSON('site-dev/words.json'),
  libraryApi: readJSON('requirements/graph-spec-library-api.json'),
  specVersion: readJSON('requirements/graph-spec-version.json'),
  specGql: read('requirements/graph-spec.gql'),
  releases,
  sha: 'abc1234',
  today: '2026-11-06',
};
const made = (more = {}) => renderDeveloperSite({ ...sources, ...more });
const doc = (html) => openWindow(html).window.document;

describe('the site is made from the repository', () => {
  const files = made();

  // proves: developer_site
  test('shows every operation of the libraries, in both languages', () => {
    const text = doc(files['libraries.html']).body.textContent;
    for (const o of sources.libraryApi.operations) {
      assert.ok(text.includes(o.js), o.js);
      assert.ok(text.includes(o.py), o.py);
    }
    assert.match(text, /Raised as: ProfileError\./);
  });

  test('shows the graph spec’s version, its changes and every section', () => {
    const text = doc(files['spec.html']).body.textContent;
    assert.ok(text.includes(`Current version: ${sources.specVersion.version}`));
    assert.ok(text.includes(sources.specVersion.changelog[0].what));
    const sections = specSections(sources.specGql);
    assert.ok(sections.length > 20, `${sections.length} sections`);
    for (const s of sections) assert.ok(text.includes(s.title), s.title);
  });

  test('names the newest stable release, and lists the nightlies newest first', () => {
    assert.match(doc(files['index.html']).body.textContent, /Latest stable release: 0\.8\.0/);
    const rows = [...doc(files[NIGHTLY]).querySelectorAll('tbody td a')].map((a) => a.textContent);
    assert.deepEqual(rows, ['0.8.1-nightly.20261106', '0.8.1-nightly.20261105']);
    assert.deepEqual(
      nightlies([{ tagName: 'x', publishedAt: '1', isPrerelease: false }]),
      [],
      'a stable release is never a nightly',
    );
  });

  test('says so when there is no nightly', () => {
    const text = doc(made({ releases: [] })[NIGHTLY]).body.textContent;
    assert.match(text, /No nightly builds are listed yet\./);
  });

  test('escapes what the sources hold, so a title is text and never markup', () => {
    const specGql = "(s1:Section {id: 'spec:\u00a71', num: '1', title: '<b>x</b>'}),";
    const page = made({ specGql })['spec.html'];
    assert.match(page, /&lt;b&gt;x&lt;\/b&gt;/);
  });

  test('leaves no placeholder, and refuses a word nothing uses or a page names but the catalogue lacks', () => {
    for (const page of PAGES) assert.doesNotMatch(files[page], /\{\{|\}\}|\{(version|sha|date|sections|specVersion)\}/);
    const words = { ...sources.catalogue.words, 'extra.word': 'x' };
    assert.throws(() => made({ catalogue: { ...sources.catalogue, words } }), /extra\.word/);
    const lacking = { ...sources.catalogue.words };
    delete lacking['index.heading'];
    assert.throws(() => made({ catalogue: { ...sources.catalogue, words: lacking } }), /index\.heading/);
  });

  test('takes its direction from the catalogue, so a right-to-left language mirrors', () => {
    assert.match(files['index.html'], /<html lang="en-GB" dir="ltr">/);
    assert.match(made({ catalogue: { ...sources.catalogue, language: 'ar' } })['index.html'], /dir="rtl"/);
  });
});

describe('the nightly pages are kept out of search engines', () => {
  const files = made();

  test('the nightly page asks not to be indexed and has no canonical address', () => {
    const d = doc(files[NIGHTLY]);
    assert.equal(d.querySelector('meta[name="robots"]').content, 'noindex, nofollow');
    assert.equal(d.querySelector('link[rel="canonical"]'), null);
  });

  test('the stable pages are indexed, each at its own canonical address, under thoughtknot.app/dev/', () => {
    assert.equal(DEV_SITE_URL, 'https://thoughtknot.app/dev/');
    for (const page of INDEXED) {
      const d = doc(files[page]);
      assert.equal(d.querySelector('meta[name="robots"]'), null, page);
      assert.equal(d.querySelector('link[rel="canonical"]').href, DEV_SITE_URL + (page === 'index.html' ? '' : page));
      assert.ok(d.title.length <= 70, d.title);
    }
  });

  test('the home page’s robots.txt disallows the nightly page and its sitemap lists the stable ones only', () => {
    const root = renderSite({
      template: read('site/index.html'),
      privacy: read('site/privacy.html'),
      demo: read('site/demo.html'),
      catalogue: readJSON('site/words.json'),
      version: '0.8.0',
      sha: 'abc1234',
      today: '2026-11-06',
      minApp: readJSON('manifest.json').minAppVersion,
    });
    assert.match(root['robots.txt'], new RegExp(`^Disallow: /dev/${NIGHTLY.replace('.', '\\.')}$`, 'm'));
    assert.doesNotMatch(root['sitemap.xml'], /nightly/);
    for (const page of INDEXED) {
      const loc = DEV_SITE_URL + (page === 'index.html' ? '' : page);
      assert.ok(root['sitemap.xml'].includes(`<loc>${loc}</loc>`), loc);
    }
  });
});

describe('everyone can use it', () => {
  const sheet = read('site/site.css');

  for (const page of PAGES)
    for (const theme of THEMES)
      test(`${page} meets WCAG 2.2 AA in the ${theme} scheme`, async () => {
        const { style, variables } = pageStyleFor(sheet, theme);
        const html = made()[page].replace('<link rel="stylesheet" href="site.css" />', `<style>${style}</style>`);
        const r = await audit(openWindow(html), theme, variables['--page']);
        assert.ok(r.rules > 10, `${r.rules} rules ran`);
        assert.deepEqual(r.problems, []);
      });

  test('every page opens with a skip link to its main content', () => {
    for (const page of PAGES) {
      const d = doc(made()[page]);
      assert.equal(d.querySelector('body a').getAttribute('href'), '#content', page);
      assert.equal(d.querySelector('main').id, 'content');
      assert.equal(d.querySelectorAll('h1').length, 1, page);
    }
  });
});

describe('the command', () => {
  test('writes the pages and the stylesheet', () => {
    const out = mkdtempSync(join(tmpdir(), 'developer-site-'));
    try {
      const file = join(out, 'releases.json');
      writeFileSync(file, JSON.stringify(releases));
      const site = join(out, 'site');
      const r = spawnSync(
        process.execPath,
        [
          path('scripts/developer-site.mjs'),
          '--out',
          site,
          '--sha',
          'abc1234',
          '--date',
          '2026-11-06',
          '--releases',
          file,
        ],
        { encoding: 'utf8' },
      );
      assert.equal(r.status, 0, r.stderr);
      for (const f of [...PAGES, 'site.css', 'icon.svg']) assert.ok(readFileSync(join(site, f)), f);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  test('the home page’s build puts the site in dev/, and leaves it out with --no-dev', () => {
    const out = mkdtempSync(join(tmpdir(), 'developer-site-in-home-'));
    try {
      const run = (...more) =>
        spawnSync(
          process.execPath,
          [path('scripts/site.mjs'), '--out', out, '--no-demo', '--date', '2026-11-06', ...more],
          {
            encoding: 'utf8',
          },
        );
      assert.equal(run().status, 0);
      const page = readFileSync(join(out, 'dev', 'libraries.html'), 'utf8');
      assert.match(page, /<link rel="canonical" href="https:\/\/thoughtknot\.app\/dev\/libraries\.html" \/>/);
      assert.match(
        readFileSync(join(out, 'llms.txt'), 'utf8'),
        /\[Developer site\]\(https:\/\/thoughtknot\.app\/dev\/\)/,
      );
      rmSync(join(out, 'dev'), { recursive: true });
      assert.equal(run('--no-dev').status, 0);
      assert.throws(() => readFileSync(join(out, 'dev', 'index.html')), /ENOENT/);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});

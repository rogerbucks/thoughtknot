#!/usr/bin/env node
// Makes the developer site from the repository (ES§41, developer_site). Its pages show the graph libraries'
// operations, the graph format spec's version, changes and sections, and the nightly builds. It is the home page's
// sibling. It takes its words from site-dev/words.json and its style from site/site.css, and it refuses a word that is
// missing or unused. The stable pages are for search engines. The nightly page is kept out of them three ways: a
// noindex tag, a Disallow in robots.txt and no place in the sitemap. .github/workflows/developer-site.yml runs it.
//
// Usage:
//   node scripts/developer-site.mjs --out DIR [--sha SHA] [--date YYYY-MM-DD] [--releases FILE] [--url URL]
//
// --releases is `gh release list --json tagName,publishedAt,isPrerelease` saved to a file. --url is the site's address.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml, fillPages, latestVersion, withPlaceholders } from './site.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'https://github.com/rogerbucks/thoughtknot';

/** The developer site's address: the project's second domain, kept apart from the home page. */
export const DEV_SITE_URL = 'https://thoughtknot.dev/';
/** The home page, which the site links to. */
const PRODUCT_URL = 'https://thoughtknot.app/';
/** The pages a search engine may index, and the one it may not. */
export const INDEXED = ['index.html', 'libraries.html', 'spec.html'];
export const NIGHTLY = 'nightly.html';
/** How many nightly builds the page lists; the nightly job keeps seven. */
const NIGHTLIES_SHOWN = 7;

const RIGHT_TO_LEFT = new Set(['ar', 'dv', 'fa', 'he', 'ps', 'ur', 'yi']);
/** Words the script fills itself, because they hold a value or show only sometimes. */
const OWN_WORDS = ['spec.withdrawn', 'libraries.problem.raised', 'nightly.none'];

const row = (cells) => `            <tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
const code = (text) => `<code>${escapeHtml(text)}</code>`;

/** The sections of the graph spec, from the lines of requirements/graph-spec.gql that declare one. */
export function specSections(gql) {
  return [...gql.matchAll(/\(\w+:Section \{id: '[^']*', num: '([^']+)', title: '([^']+)'\}\)/g)].map((m) => ({
    num: m[1],
    title: m[2],
  }));
}

/** The nightly builds among `releases`, newest first and at most `limit`. */
export function nightlies(releases, limit = NIGHTLIES_SHOWN) {
  return releases
    .filter((r) => r.isPrerelease)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, limit);
}

/** Every file of the site, by name, from the sources it is made of. */
export function renderDeveloperSite({
  layout,
  pages,
  catalogue,
  libraryApi,
  specVersion,
  specGql,
  releases,
  sha,
  today,
  url = DEV_SITE_URL,
}) {
  const lang = catalogue.language;
  const sections = specSections(specGql);
  const stable = latestVersion(releases, 'none yet');
  const nights = nightlies(releases);
  const placeholders = {
    version: stable,
    sha,
    date: today,
    sections: String(sections.length),
    specVersion: specVersion.version,
  };
  const filled = (key, more = {}) => withPlaceholders(catalogue.words[key], { ...placeholders, ...more });
  const words = Object.fromEntries(
    Object.entries(catalogue.words)
      .filter(([k]) => !OWN_WORDS.includes(k))
      .map(([k]) => [k, filled(k)]),
  );
  const withdrawn = specVersion.withdrawn.map((w) =>
    escapeHtml(filled('spec.withdrawn', { num: w.section, note: w.note })),
  );
  const content = {
    operations: libraryApi.operations
      .map((o) => row([code(o.operation), code(o.js), code(o.py), escapeHtml(o.takes.join('; ')), escapeHtml(o.gives)]))
      .join('\n'),
    changes: specVersion.changelog
      .map((c) => `          <li>${escapeHtml(`${c.version}, ${c.date}: ${c.what}`)}</li>`)
      .join('\n'),
    sections: sections.map((s) => row([escapeHtml(`§${s.num}`), escapeHtml(s.title)])).join('\n'),
    withdrawn: withdrawn.join(' '),
    nightlies: nights
      .map((r) =>
        row([
          `<a href="${REPO}/releases/tag/${encodeURIComponent(r.tagName)}">${escapeHtml(r.tagName)}</a>`,
          escapeHtml(r.publishedAt.slice(0, 10)),
        ]),
      )
      .join('\n'),
    none: nights.length ? '' : escapeHtml(catalogue.words['nightly.none']),
    stable: escapeHtml(stable),
  };
  const meta = {
    'index.html': ['index.title', 'index.description'],
    'libraries.html': ['libraries.title', 'libraries.description'],
    'spec.html': ['spec.title', 'spec.description'],
    [NIGHTLY]: ['nightly.title', 'nightly.description'],
  };
  const templates = {};
  for (const [name, [title, description]] of Object.entries(meta)) {
    // The page's own markup goes into the layout before any word is filled, so one pass checks every word.
    templates[name] = layout
      .replace('{{@content}}', pages[name])
      .replace('{{@page-title}}', `{{${title}}}`)
      .replace('{{@page-description}}', `{{${description}}}`);
  }
  const values = {
    lang: escapeHtml(lang),
    dir: RIGHT_TO_LEFT.has(lang.split('-')[0]) ? 'rtl' : 'ltr',
    repo: REPO,
    product: PRODUCT_URL,
    ...content,
    'page-head': '',
  };
  // The head differs per page: the stable ones say where they live; the nightly one asks not to be indexed.
  const perPage = {};
  for (const name of Object.keys(templates)) {
    perPage[name] =
      name === NIGHTLY
        ? '<meta name="robots" content="noindex, nofollow" />'
        : `<link rel="canonical" href="${escapeHtml(url + (name === 'index.html' ? '' : name))}" />`;
    templates[name] = templates[name].replace('{{@page-head}}', perPage[name]);
  }
  values['raised-line'] = escapeHtml(filled('libraries.problem.raised', { raised: libraryApi.problem.raised_as }));
  const out = fillPages(templates, words, values);
  return {
    ...out,
    'robots.txt': `User-agent: *\nAllow: /\nDisallow: /${NIGHTLY}\n\nSitemap: ${url}sitemap.xml\n`,
    'sitemap.xml': [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...INDEXED.map(
        (n) =>
          `  <url>\n    <loc>${escapeHtml(url + (n === 'index.html' ? '' : n))}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`,
      ),
      '</urlset>',
      '',
    ].join('\n'),
    '.nojekyll': '',
  };
}

const flag = (args, name) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const out = flag(args, '--out');
  if (!out) throw new Error('give the folder for the site: --out DIR');
  const text = (rel) => readFileSync(join(ROOT, rel), 'utf8');
  const releasesFile = flag(args, '--releases');
  const files = renderDeveloperSite({
    layout: text('site-dev/layout.html'),
    pages: Object.fromEntries(
      ['index.html', 'libraries.html', 'spec.html', NIGHTLY].map((n) => [n, text(`site-dev/${n}`)]),
    ),
    catalogue: JSON.parse(text('site-dev/words.json')),
    libraryApi: JSON.parse(text('requirements/graph-spec-library-api.json')),
    specVersion: JSON.parse(text('requirements/graph-spec-version.json')),
    specGql: text('requirements/graph-spec.gql'),
    releases: releasesFile ? JSON.parse(readFileSync(releasesFile, 'utf8')) : [],
    sha: (flag(args, '--sha') ?? 'main').slice(0, 7),
    today: flag(args, '--date') ?? new Date().toISOString().slice(0, 10),
    url: flag(args, '--url') ?? DEV_SITE_URL,
  });
  mkdirSync(out, { recursive: true });
  for (const [name, body] of Object.entries(files)) writeFileSync(join(out, name), body);
  for (const name of ['site.css', 'icon.svg']) copyFileSync(join(ROOT, 'site', name), join(out, name));
}

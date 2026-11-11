#!/usr/bin/env node
// Makes the project's home page from the repository (spec §41, landing_page). It fills site/index.html with the words
// of site/words.json, the version of the newest stable release and the commit it came from. Beside it goes what search
// engines and AI assistants read: structured data, a sitemap, a robots file and an llms.txt. The picture is the user
// guide's own, taken by scripts/wiki-screens.mjs. .github/workflows/pages.yml runs it and publishes the folder.
//
// Usage:
//   node scripts/site.mjs --out DIR [--sha SHA] [--date YYYY-MM-DD] [--releases FILE] [--images DIR] [--url URL]
//     [--no-demo] [--no-dev]
//
// --releases is `gh release list --json tagName,publishedAt,isPrerelease` saved to a file; without it the version is
// the manifest's. --images is the folder scripts/wiki-screens.mjs wrote: its card.png is shown when it is there. --url
// is the page's address, for another domain; the project's own, thoughtknot.app, is the default. The live demo
// (scripts/site-demo.mjs) is built into demo/ unless --no-demo is given. The developer site
// (scripts/developer-site.mjs) is built into dev/ unless --no-dev is given.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOTS } from './wiki-screens.mjs';
import { buildDemo } from './site-demo.mjs';
import { escapeHtml, fillPages, fillTemplate, latestVersion, withPlaceholders } from './site-pages.mjs';

export { escapeHtml, fillPages, fillTemplate, latestVersion, withPlaceholders };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'https://github.com/rogerbucks/thoughtknot';
const WIKI = `${REPO}/wiki`;
const LICENCE = 'https://www.mozilla.org/en-US/MPL/2.0/';

/** The page's address, the project's own domain served by GitHub Pages, used when no other is given. */
export const SITE_URL = 'https://thoughtknot.app/';

/**
 * What the demo page may load and run (site_demo): its own files only. Its scripts may start workers from their own
 * text, and compile no WebAssembly: the layout engine and Import's SQLite reader are plain code. It sends nothing
 * anywhere, so a fetch, a form or a frame from elsewhere is refused by the browser as well as by the code.
 */
export const DEMO_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "worker-src 'self' blob:",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' data: blob:",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/** The developer site's pages a search engine may index, in dev/ (scripts/developer-site.mjs). */
const DEV_PAGES = ['', 'libraries.html', 'spec.html'];

/** The languages written right to left, by their primary code. */
const RIGHT_TO_LEFT = new Set(['ar', 'dv', 'fa', 'he', 'ps', 'ur', 'yi']);

/** The guide's picture the page shows, by its name in scripts/wiki-screens.mjs. */
const PICTURE = 'card';

/** A PNG's width and height, from its header, so the page keeps the picture's place before it loads. */
export function pngSize(bytes) {
  if (bytes.length < 24 || bytes.toString('latin1', 12, 16) !== 'IHDR') throw new Error('not a PNG picture');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** JSON for inside a <script>: no "<" can end the element early. */
const scriptJson = (data) => JSON.stringify(data, null, 2).replace(/</g, '\\u003c');

/** The structured data a search engine reads: the software, its version, its licence and its price. */
function structuredData({ description, url, version, image }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'ThoughtKnot',
    description,
    url,
    applicationCategory: 'ProductivityApplication',
    applicationSubCategory: 'Obsidian plugin',
    operatingSystem: 'Windows, macOS, Linux, iOS, Android',
    softwareVersion: version,
    license: LICENCE,
    codeRepository: REPO,
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    ...(image ? { screenshot: `${url}${image.file}` } : {}),
  };
}

/** The llms.txt of llmstxt.org: what the project is, then where an assistant reads more. */
function llmsText({ words, url }) {
  return [
    '# ThoughtKnot',
    '',
    `> ${words['page.description']}`,
    '',
    words['hero.lede'],
    '',
    '## Docs',
    '',
    `- [How to use ThoughtKnot](${WIKI}/How-to-use-ThoughtKnot): the guide, in plain words, with pictures`,
    `- [Roadmap](${WIKI}/Roadmap): what is done and what comes next`,
    `- [Releases](${REPO}/releases): the plugin's files and both libraries, for each version`,
    `- [Source code](${REPO}): the plugin, the core and the graph format libraries in JavaScript and Python`,
    `- [Discussions](${REPO}/discussions): help, questions and ideas, open to everyone`,
    '',
    '## Optional',
    '',
    `- [Home page](${url}): this page for people`,
    `- [Live demo](${url}demo.html): ThoughtKnot in the browser, drawing the project's own graphs`,
    `- [Developer site](${url}dev/): the graph libraries, the graph format spec and the nightly builds`,
    `- [Privacy](${url}privacy.html): what ThoughtKnot keeps, where, and how to delete it`,
    `- [Licence](${LICENCE}): Mozilla Public License 2.0`,
    '',
  ].join('\n');
}

/**
 * Every file of the site but the ones copied as they are, by name. These are the home page, the privacy page, the demo,
 * robots.txt, sitemap.xml and llms.txt. The last is .nojekyll, which tells GitHub Pages to publish the folder as it is.
 * `template` is site/index.html, `privacy` site/privacy.html and `demo` site/demo.html. `catalogue` is site/words.json;
 * `image` is {file, alt, width, height} or null.
 */
export function renderSite({
  template,
  privacy,
  demo,
  catalogue,
  version,
  sha,
  today,
  minApp,
  url = SITE_URL,
  image = null,
}) {
  const lang = catalogue.language;
  const words = Object.fromEntries(
    Object.entries(catalogue.words).map(([k, w]) => [k, withPlaceholders(w, { version, sha, date: today, minApp })]),
  );
  const description = words['page.description'];
  const values = {
    lang: escapeHtml(lang),
    dir: RIGHT_TO_LEFT.has(lang.split('-')[0]) ? 'rtl' : 'ltr',
    locale: escapeHtml(lang.replace('-', '_')),
    url: escapeHtml(url),
    repo: REPO,
    'demo-policy': DEMO_POLICY,
    wiki: WIKI,
    'structured-data': scriptJson(structuredData({ description, url, version, image })),
    'image-meta': image
      ? `<meta property="og:image" content="${escapeHtml(url + image.file)}" />\n    <meta property="og:image:alt" content="${escapeHtml(image.alt)}" />`
      : '',
    'image-figure': image
      ? `<figure class="shot"><img src="${escapeHtml(image.file)}" alt="${escapeHtml(image.alt)}" width="${image.width}" height="${image.height}" /></figure>`
      : '',
  };
  return {
    ...fillPages({ 'index.html': template, 'privacy.html': privacy, 'demo.html': demo }, words, values),
    // The developer site lives in dev/ (developer_site). Its nightly page is the one a search engine may not index.
    'robots.txt': `User-agent: *\nAllow: /\nDisallow: /dev/nightly.html\n\nSitemap: ${url}sitemap.xml\n`,
    'sitemap.xml': [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...[url, `${url}privacy.html`, `${url}demo.html`, ...DEV_PAGES.map((page) => `${url}dev/${page}`)].map(
        (loc) => `  <url>\n    <loc>${escapeHtml(loc)}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`,
      ),
      '</urlset>',
      '',
    ].join('\n'),
    'llms.txt': llmsText({ words, url }),
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
  const json = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
  const releasesFile = flag(args, '--releases');
  const releases = releasesFile ? JSON.parse(readFileSync(releasesFile, 'utf8')) : [];
  const images = flag(args, '--images');
  const picture = images && join(images, `${PICTURE}.png`);
  const shown = picture && existsSync(picture);
  const files = renderSite({
    template: readFileSync(join(ROOT, 'site/index.html'), 'utf8'),
    privacy: readFileSync(join(ROOT, 'site/privacy.html'), 'utf8'),
    demo: readFileSync(join(ROOT, 'site/demo.html'), 'utf8'),
    catalogue: json('site/words.json'),
    version: latestVersion(releases, json('manifest.json').version),
    minApp: json('manifest.json').minAppVersion,
    sha: (flag(args, '--sha') ?? 'main').slice(0, 7),
    today: flag(args, '--date') ?? new Date().toISOString().slice(0, 10),
    url: flag(args, '--url') ?? SITE_URL,
    image: shown
      ? { file: `${PICTURE}.png`, alt: SHOTS.find((s) => s.name === PICTURE).alt, ...pngSize(readFileSync(picture)) }
      : null,
  });
  mkdirSync(out, { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(out, name), text);
  for (const name of ['site.css', 'icon.svg']) copyFileSync(join(ROOT, 'site', name), join(out, name));
  if (shown) copyFileSync(picture, join(out, `${PICTURE}.png`));
  if (!args.includes('--no-demo')) await buildDemo(join(out, 'demo'));
  if (!args.includes('--no-dev')) {
    const { writeDeveloperSite } = await import('./developer-site.mjs');
    const url = flag(args, '--url') ?? SITE_URL;
    writeDeveloperSite({
      out: join(out, 'dev'),
      releases,
      sha: flag(args, '--sha') ?? 'main',
      today: flag(args, '--date'),
      url: `${url}dev/`,
    });
  }
}

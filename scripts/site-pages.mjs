// The helpers the home page and the developer site share (ES§41, landing_page, developer_site).
// They escape text, fill a page's words and values from a catalogue, and name the newest stable release.
// scripts/site.mjs re-exports them.

export const escapeHtml = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** `text` with each {name} filled from `values`; a name `values` lacks is left as it is. */
export const withPlaceholders = (text, values) =>
  text.replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(values, name) ? values[name] : whole));

/**
 * Each of `templates`, by its file name, with each {{key}} replaced by the word `words` gives it and each {{@name}} by
 * `values[name]`. Words are escaped as text. Values are markup the site makes itself and are put in as they are.
 * Throws on a key or a name with nothing to fill it, and on a word no page uses. So the catalogue and the pages never
 * drift apart.
 */
export function fillPages(templates, words, values) {
  const used = new Set();
  const fill = (template) =>
    template.replace(/\{\{(@?)([\w.-]+)\}\}/g, (_whole, at, key) => {
      if (at) {
        if (!Object.hasOwn(values, key)) throw new Error(`the page names {{@${key}}}, which nothing fills`);
        return values[key];
      }
      if (!Object.hasOwn(words, key)) throw new Error(`the page names {{${key}}}, which the catalogue lacks`);
      used.add(key);
      return escapeHtml(words[key]);
    });
  const pages = Object.fromEntries(Object.entries(templates).map(([name, template]) => [name, fill(template)]));
  const unused = Object.keys(words).filter((k) => !used.has(k));
  if (unused.length) throw new Error(`words not used by the page: ${unused.join(', ')}`);
  return pages;
}

/** One page, `template`, filled as `fillPages` fills each. */
export const fillTemplate = (template, words, values) => fillPages({ page: template }, words, values).page;

/** The newest stable release's version from `gh release list` entries, never a pre-release; `fallback` if none. */
export function latestVersion(releases, fallback) {
  const stable = releases
    .filter((r) => !r.isPrerelease && /^v?\d+\.\d+\.\d+$/.test(r.tagName))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return stable.length ? stable[0].tagName.replace(/^v/, '') : fallback;
}

// The repository's settings that live on GitHub and nowhere in the code: the default branch's whole ruleset and the Pages
// settings (OPS-8). `node scripts/public-readiness.mjs --settings --export` writes both to .github/settings/ (an admin,
// with the GitHub CLI, before each release: RELEASING.md). `--settings` then holds GitHub's copy against the committed
// one, whole, so a rule loosened by hand shows as a difference, not only a missing required check.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SETTINGS_DIR = '.github/settings';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['build_type', 'source', 'https_enforced', 'cname', 'public'];
const RULESET = ['name', 'target', 'enforcement', 'conditions', 'rules', 'bypass_actors'];
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));

/** A ruleset as GitHub reads it back, without the ids and dates that differ between copies. */
export const plainRuleset = (ruleset) => pick(ruleset, RULESET);
/** The Pages settings that are a choice, not a state: not the build status, nor the URL, nor the dates. */
export const plainPages = (pages) => pick(pages, PAGES);

const committed = (name, root) => {
  const file = join(root, SETTINGS_DIR, name);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
};

/** The ruleset on the default branch, read whole (the list gives each ruleset without its rules). */
export const defaultRulesetOf = (gh, repo) => {
  const found = gh([`repos/${repo}/rulesets`]).find((r) => r.target === 'branch' && r.enforcement === 'active');
  return found && gh([`repos/${repo}/rulesets/${found.id}`]);
};

/** Reads both from GitHub, writes them, says so, and gives the exit code. */
export function exportFrom(gh, repo, log) {
  for (const f of exportSettings({ ruleset: defaultRulesetOf(gh, repo), pages: gh([`repos/${repo}/pages`]) }))
    log(`exported ${f}`);
  return 0;
}

/** Writes both settings files from GitHub's own answers. Returns the paths written. */
export function exportSettings({ ruleset, pages }, root = ROOT) {
  mkdirSync(join(root, SETTINGS_DIR), { recursive: true });
  const files = { 'ruleset.json': plainRuleset(ruleset), 'pages.json': plainPages(pages) };
  return Object.entries(files).map(([name, body]) => {
    writeFileSync(join(root, SETTINGS_DIR, name), `${JSON.stringify(body, null, 2)}\n`);
    return `${SETTINGS_DIR}/${name}`;
  });
}

/**
 * The two whole-setting entries for `WANTED`: each wants the committed copy (null until one is exported, which is a
 * difference) and reads GitHub's. `gh` and `defaultRuleset` come from the caller, which owns the GitHub CLI.
 */
export function wholeSettings({ gh, quiet, defaultRuleset, root = ROOT }) {
  const entry = (name, file, read, write) => ({
    name,
    phase: 'always',
    want: committed(file, root),
    read: (repo) => {
      const live = read(repo);
      return live ? (file === 'pages.json' ? plainPages(live) : plainRuleset(live)) : null;
    },
    write,
  });
  return [
    entry('default branch ruleset: the whole ruleset', 'ruleset.json', defaultRuleset, (repo) => {
      const want = committed('ruleset.json', root);
      const live = defaultRuleset(repo);
      if (!want || !live) throw new Error(`export the settings first: ${SETTINGS_DIR}/ruleset.json is not there`);
      gh(['-X', 'PUT', `repos/${repo}/rulesets/${live.id}`], want);
    }),
    entry(
      'pages settings',
      'pages.json',
      (repo) => quiet(() => gh([`repos/${repo}/pages`])),
      (repo) => {
        const want = committed('pages.json', root);
        if (!want) throw new Error(`export the settings first: ${SETTINGS_DIR}/pages.json is not there`);
        gh(['-X', 'PUT', `repos/${repo}/pages`], { build_type: want.build_type, https_enforced: want.https_enforced });
      },
    ),
  ];
}

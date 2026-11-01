// The repository's settings that live on GitHub and nowhere in the code: the default branch's whole ruleset and the Pages
// settings (OPS-8). `node scripts/public-readiness.mjs --settings --export` writes both to .github/settings/ (an admin,
// with the GitHub CLI, before each release: RELEASING.md). `--settings` then holds GitHub's copy against the committed
// one. It holds the whole ruleset, so a rule loosened by hand shows, not only a missing required check.
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
 * The two whole-setting entries for `WANTED`: each wants the committed copy and reads GitHub's. Until a copy is exported,
 * there is nothing to hold GitHub against. The entry then reads as what it wants. So the release and the weekly settings
 * check do not fail for a file nobody has made yet. Pages that cannot be read are not compared either: there may be no
 * site, or the token may not see it. `gh` and `defaultRuleset` come from the caller, which owns the GitHub CLI.
 */
export function wholeSettings({ gh, quiet, defaultRuleset, root = ROOT }) {
  const entry = (name, file, plain, read, write) => {
    const want = committed(file, root);
    return {
      name,
      phase: 'always',
      want,
      read: (repo) => {
        const live = want && read(repo);
        return want && (live ? plain(live) : file === 'pages.json' ? want : null);
      },
      write: (repo) => {
        if (!want) throw new Error(`export the settings first: ${SETTINGS_DIR}/${file} is not there`);
        write(repo, want);
      },
    };
  };
  return [
    entry('default branch ruleset: the whole ruleset', 'ruleset.json', plainRuleset, defaultRuleset, (repo, want) =>
      gh(['-X', 'PUT', `repos/${repo}/rulesets/${defaultRuleset(repo).id}`], want),
    ),
    entry(
      'pages settings',
      'pages.json',
      plainPages,
      (repo) => quiet(() => gh([`repos/${repo}/pages`])),
      (repo, want) =>
        gh(['-X', 'PUT', `repos/${repo}/pages`], { build_type: want.build_type, https_enforced: want.https_enforced }),
    ),
  ];
}

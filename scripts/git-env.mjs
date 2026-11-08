// The environment a child process gets once git's own hook variables are taken out of it.
//
// git exports GIT_DIR, GIT_INDEX_FILE, GIT_WORK_TREE and others to every hook, and does so from a linked worktree in
// particular. A test that then runs `git init` and `git config` in a folder of its own still writes to the repository
// GIT_DIR names. On 8 Nov 2026 a push from a worktree ran such a test from the pre-push hook. It set core.bare, the
// user name and the email in the real .git/config, and git broke in every checkout.
//
// Every GIT_* variable is dropped, so none that git adds later slips through. The few kept only say how to reach a
// remote or which editor to open.

/** The GIT_* variables a child may keep: they say how to talk to a remote or a person, never which repository. */
export const KEPT_GIT_VARIABLES = new Set([
  'GIT_EDITOR',
  'GIT_SEQUENCE_EDITOR',
  'GIT_PAGER',
  'GIT_SSH',
  'GIT_SSH_COMMAND',
  'GIT_ASKPASS',
  'GIT_TERMINAL_PROMPT',
]);

/** A copy of `env` without git's hook variables: every GIT_* name but those in KEPT_GIT_VARIABLES. */
export function withoutGitHookEnv(env = process.env) {
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    if (k.startsWith('GIT_') && !KEPT_GIT_VARIABLES.has(k)) continue;
    out[k] = v;
  }
  return out;
}

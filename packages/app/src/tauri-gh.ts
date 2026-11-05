// The person's own gh, run by the app's one gh command (spec §48, github_repo_access). The Rust checks each call
// against its list before gh starts (src-tauri/src/gh.rs). The same list is checked here first. So a call off it never
// reaches the Rust. `invoke` is handed in, so nothing here imports Tauri and the tests hand in their own.
import { ghCallRefusal, word, type GhRun, type WordKey } from '@thoughtknot/core';
import type { Invoke } from './tauri-files.ts';

/** What the Rust says, in the words the person reads. */
const SAID: Record<string, WordKey> = {
  'gh-missing': 'repo.gh.missing',
  'computer-only': 'repo.gh.computer-only',
};

/** gh, as the core's repository host runs it, through the app's `run_gh` command. */
export const tauriGh =
  (invoke: Invoke): GhRun =>
  async (args, input) => {
    const refused = ghCallRefusal(args, input ?? null);
    if (refused) throw new Error(refused);
    try {
      return (await invoke('run_gh', { args: [...args], input: input ?? null })) as Awaited<ReturnType<GhRun>>;
    } catch (e) {
      const said = e instanceof Error ? e.message : String(e);
      const key = SAID[said];
      throw new Error(key ? word(key) : said);
    }
  };

// What a vault lets a public reviewer have (editor spec ES§19, ai_private_default and ai_public_names_only; Roger, 7 Nov
// 2026, R7). Nothing until the person chooses: a note goes to a private reviewer only. They may let a public reviewer
// see names, kinds and links, or the note's text as well. Each is chosen after seeing what one real note would send,
// and each is taken back in one step. Kept in the plugin's settings, which Obsidian keeps for each vault.
import type { Option } from './settings.ts';

/** What a public reviewer may have: nothing, names, kinds and links, or the note's text as well. */
export type AiPublic = 'off' | 'names' | 'note';

/** What the vault lets a public reviewer have. */
export interface ReachSettings {
  aiPublic: AiPublic;
}

/** Nothing: a note goes to a private reviewer only. */
export const DEFAULT_REACH: ReachSettings = { aiPublic: 'off' };

/** The option, as the settings page shows it, with the AI models. */
export const REACH_OPTIONS: Option[] = [
  {
    key: 'aiPublic',
    section: 'AI models',
    name: 'Public reviewers in this vault',
    sentence:
      'What a cloud model may be sent from this vault. Off until you choose. You see what one of your notes would send first, and you can turn it off at any time.',
    choices: [
      { value: 'off', name: 'Off: private reviewers only' },
      { value: 'names', name: 'Names, kinds and links only' },
      { value: 'note', name: 'Note text as well' },
    ],
  },
];

/** The setting read back from what was saved, anything unknown read as off. */
export function reachFrom(s: Record<string, unknown>): ReachSettings {
  const p = s.aiPublic;
  return { aiPublic: p === 'names' || p === 'note' ? p : DEFAULT_REACH.aiPublic };
}

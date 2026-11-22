// What a note opens on (editor spec ES§76, board_first_default). The whiteboard is the default view. A person may make
// the graph their default instead. A note's own choice, the graph first again (board_main_screen), wins over the
// setting. Host-free and pure.
import type { Option } from './settings.ts';

/** What a note opens on: its whiteboard, or its graph drawn first, as before. */
export type FirstView = 'board' | 'graph';

/** The setting of what a note opens on. */
export interface FirstViewSettings {
  firstView: FirstView;
}

/** The whiteboard, until the person chooses the graph. */
export const DEFAULT_FIRST_VIEW: FirstViewSettings = { firstView: 'board' };

/** The option, as the settings page shows it. */
export const FIRST_VIEW_OPTIONS: Option[] = [
  {
    key: 'firstView',
    section: 'Drawing',
    name: 'Notes open on',
    sentence:
      'What a note opens on: its whiteboard, or its graph drawn first. A note you turned to its graph stays so.',
    choices: [
      { value: 'board', name: 'The whiteboard' },
      { value: 'graph', name: 'The graph' },
    ],
  },
];

/** The setting read back from what was saved, anything unknown read as the whiteboard. */
export function firstViewFrom(s: Record<string, unknown>): FirstViewSettings {
  return { firstView: s.firstView === 'graph' ? 'graph' : 'board' };
}

/** What a note opens on: its own choice when it made one, else the setting. */
export function opensOn(s: FirstViewSettings, noteChoice: FirstView | null | undefined): FirstView {
  return noteChoice === 'board' || noteChoice === 'graph' ? noteChoice : s.firstView;
}

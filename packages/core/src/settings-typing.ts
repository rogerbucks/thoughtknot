// When the drawing is drawn again as a block is typed (editor spec §4, redraw_while_typing; risk NEURO-7). By default
// it is redrawn a little after each pause in typing, keeping its zoom and its boxes where they were. Some people
// find any change in the picture while they think too much. They can hold it as it was until they press Done, or,
// in the edit pane, until they leave the text.
import type { Option } from './settings.ts';

/** When the drawing is redrawn while a block is typed: after each pause, the default, or only once done. */
export type RedrawSetting = 'pause' | 'done';

/** The settings of typing in a block. */
export interface TypingSettings {
  /** When the drawing is redrawn while a block is typed (redraw_while_typing). */
  redrawWhileTyping: RedrawSetting;
}

/** Redrawn after each pause in typing. */
export const DEFAULT_TYPING: TypingSettings = { redrawWhileTyping: 'pause' };

/** The options, in the order the settings page shows them. */
export const TYPING_OPTIONS: Option[] = [
  {
    key: 'redrawWhileTyping',
    section: 'Formatting',
    name: 'Redraw while typing',
    sentence:
      'When the drawing changes as you type a graph. Either way it keeps its zoom, and the boxes you did not change stay where they were.',
    choices: [
      { value: 'pause', name: 'After each pause in typing' },
      { value: 'done', name: 'When I press Done or leave the text' },
    ],
  },
];

/** The typing settings read back from what was saved, anything unknown left as the default. */
export function typingFrom(s: Record<string, unknown>): TypingSettings {
  const r = s.redrawWhileTyping;
  return { redrawWhileTyping: r === 'pause' || r === 'done' ? r : DEFAULT_TYPING.redrawWhileTyping };
}

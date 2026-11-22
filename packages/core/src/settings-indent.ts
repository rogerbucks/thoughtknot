// How a line the editor writes is indented (ES§21): the option, and the text each choice writes. Host-free and pure.
import type { Option } from './settings.ts';

/** How a line the editor writes is indented. */
export type Indent = 'two' | 'four' | 'tab';

/** The option, as the settings page shows it. */
export const INDENT_OPTION: Option = {
  key: 'indent',
  section: 'Formatting',
  name: 'Indent',
  sentence: 'How the editor indents the later lines of a thing it writes.',
  choices: [
    { value: 'two', name: 'Two spaces' },
    { value: 'four', name: 'Four spaces' },
    { value: 'tab', name: 'A tab' },
  ],
};

/** The text an indent setting writes. */
export const indentText = (indent: Indent): string => (indent === 'two' ? '  ' : indent === 'tab' ? '\t' : '    ');

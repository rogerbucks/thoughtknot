// What the editor pane says while there is nothing to draw (risk UX-8): one line to start with, an example of it, and a
// link to the guide. So a new reader does not meet a blank pane and a parser error with no way to begin.
import { word } from '@thoughtknot/core';

/** Where the user guide is. */
export const GUIDE_URL = 'https://github.com/rogerbucks/thoughtknot/wiki/How-to-use-ThoughtKnot';

/** Adds the empty pane's words to `host`: what to start with, an example of it, and a link to the guide. */
export function nothingYet(host: HTMLElement): void {
  host.createEl('p', { cls: 'thoughtknot-quiet', text: word('pane.nothing-yet') });
  host.createEl('p', { cls: 'thoughtknot-quiet thoughtknot-example-line', text: word('pane.example') });
  const guide = host.createEl('p', { cls: 'thoughtknot-quiet' });
  guide.createEl('a', {
    text: word('pane.guide'),
    attr: { href: GUIDE_URL, target: '_blank', rel: 'noopener noreferrer' },
  });
}

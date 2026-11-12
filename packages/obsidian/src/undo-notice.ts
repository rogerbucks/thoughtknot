// A toast that says what was written, with an Undo button that takes exactly that write back (editor spec §3,
// reading_view_metadata). Each write says what it wrote, and one undo takes it back. Pressing Undo says what it did.
import { Notice } from 'obsidian';
import { word } from '@thoughtknot/core';

/** How long the toast stays, in milliseconds, so there is time to press Undo. */
const STAYS = 8000;

/** Shows `said`, with Undo when there is an `undo`; pressing it takes the write back and says so. */
export function noticeWithUndo(said: string, undo?: () => Promise<string>): void {
  if (!undo) {
    new Notice(said);
    return;
  }
  const words = createFragment();
  words.createSpan({ text: `${said} ` });
  const button = words.createEl('button', { text: word('meta.undo'), cls: 'thoughtknot-notice-undo' });
  const notice = new Notice(words, STAYS);
  button.addEventListener('click', () => {
    notice.hide();
    void undo().then((back) => new Notice(back));
  });
}

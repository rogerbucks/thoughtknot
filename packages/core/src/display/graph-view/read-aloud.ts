// Reading aloud what the details say (editor spec §69, view_reading_support). Under a view preset for reading, the
// details of a thing or link have a button that reads them aloud. It uses the device's own voice, so nothing leaves
// the device, and is offered only where the device has one. A second press stops it.
import { READING_CLASS, word } from '@thoughtknot/core';
import { button } from '../button.ts';

/** A window that may have the device's own voice. */
type Voiced = Window & {
  speechSynthesis?: SpeechSynthesis;
  SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance;
};

/**
 * A button in `head` that reads aloud `title` and then the words of `body`, as they are when it is pressed. None
 * unless the page is marked for reading and the device has a voice.
 */
export function readAloudButton(head: HTMLElement, title: string, body: HTMLElement): HTMLButtonElement | null {
  const win = head.win as Voiced,
    voice = win.speechSynthesis;
  if (!voice || !win.SpeechSynthesisUtterance || !win.document?.body?.classList?.contains(READING_CLASS)) return null;
  const b = button(head, word('details.read-aloud'), 'volume-2', () => {
    if (voice.speaking) return voice.cancel();
    if (win.SpeechSynthesisUtterance)
      voice.speak(new win.SpeechSynthesisUtterance(`${title}. ${body.textContent ?? ''}`.trim()));
  });
  b.addClass('thoughtknot-read-aloud');
  return b;
}

// The send sheet on a phone (editor spec ES§19, app_ai_send_sheet; ES§40, phone_touch_ready). It is the step before
// every send: a sheet from the foot of the screen that fits a hand. It shows exactly what will be sent, byte for byte,
// and to which model and address. The person may pick another of the models offered, and the sheet shows that one's
// request instead. Nothing is sent until they tap Send, and Send sends exactly what is shown, once (core ai.ts). Cancel
// has the focus first, and Escape cancels. Its buttons are 44 by 44 or more (phone.css).
import { AI_PURPOSES, boardMakeAsk, confirmSend, word } from '@thoughtknot/core';
import type { ModelChoice, PreparedSend, SendRefused, SendResult } from '@thoughtknot/core';
import type { BoardDraft } from '@thoughtknot/core/display/board/board-draft';
import type { AppAi } from './app-ai-host.ts';

/** What a board is asked for: proposing changes, as the spec names the purpose. */
const PURPOSE = AI_PURPOSES[1] ?? '';

/** What the sheet is opened on: the models offered, and the request for one of them. */
export interface SheetAsk {
  choices: ModelChoice[];
  /** The request for the model named, made ready; or why it may not go. */
  prepare(model: string): Promise<PreparedSend | SendRefused>;
}

const el = <K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls: string, text?: string) => {
  const e = doc.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** Where the sheet goes: the page's main part, so it takes the page's touch sizes. */
const placeOf = (doc: Document): HTMLElement => doc.getElementById('gn-page') ?? doc.body;

/**
 * Opens the sheet for `ask`, on its first model. `done` is called once: with what came of the send, or null when the
 * person cancelled or nothing could be sent. Returns the sheet.
 */
export async function openSendSheet(
  doc: Document,
  ai: AppAi,
  ask: SheetAsk,
  done: (result: SendResult | null) => void,
): Promise<HTMLElement> {
  const sheet = el(doc, 'div', 'gn-ai-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  const title = el(doc, 'h2', 'gn-ai-sheet-title', word('app.ai.sheet.title'));
  title.id = 'gn-ai-sheet-title';
  sheet.setAttribute('aria-labelledby', title.id);
  const pick = el(doc, 'select', 'gn-ai-sheet-model');
  pick.setAttribute('aria-label', word('app.ai.sheet.model'));
  for (const c of ask.choices)
    pick.append(Object.assign(doc.createElement('option'), { value: c.name, textContent: c.name }));
  const to = el(doc, 'p', 'gn-ai-sheet-to');
  const summary = el(doc, 'ul', 'gn-ai-sheet-summary');
  const sent = el(doc, 'pre', 'gn-ai-sheet-sent');
  sent.setAttribute('aria-label', word('app.ai.sheet.exactly'));
  sent.tabIndex = 0;
  const said = el(doc, 'p', 'gn-ai-sheet-said');
  said.setAttribute('role', 'status');
  const buttons = el(doc, 'div', 'gn-ai-sheet-buttons');
  const cancel = el(doc, 'button', 'gn-ai-sheet-cancel', word('ai.cancel'));
  const send = el(doc, 'button', 'gn-ai-sheet-send', word('ai.send'));
  cancel.type = send.type = 'button';
  // Send is there only once a request is shown
  send.disabled = true;
  buttons.append(cancel, send);
  sheet.append(title, pick, to, summary, sent, said, buttons);

  let prepared: PreparedSend | null = null;
  let over = false;
  const finish = (result: SendResult | null) => {
    if (over) return;
    over = true;
    sheet.remove();
    done(result);
  };
  // what the sheet shows is the request for the model picked, and Send is there only while there is one to send
  const show = async () => {
    prepared = null;
    send.disabled = true;
    const p = await ask.prepare(pick.value);
    if ('refused' in p) {
      to.textContent = '';
      summary.replaceChildren();
      sent.textContent = '';
      said.textContent = p.refused;
      return;
    }
    prepared = p;
    to.textContent = word('app.ai.sheet.to', { model: p.model.name, address: p.to });
    summary.replaceChildren(...p.summary.map((line) => el(doc, 'li', '', line)));
    sent.textContent = p.body;
    said.textContent = '';
    send.disabled = false;
  };
  pick.addEventListener('change', () => void show());
  cancel.addEventListener('click', () => finish(null));
  sheet.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') finish(null);
  });
  send.addEventListener('click', () => {
    const p = prepared;
    if (!p || over) return;
    // the yes is to exactly what is shown, and good once: a second tap sends nothing more
    prepared = null;
    send.disabled = cancel.disabled = pick.disabled = true;
    said.textContent = word('app.ai.sheet.sending', { model: p.model.name });
    void ai.send(p, confirmSend(p)).then(finish, (e: unknown) => {
      said.textContent = e instanceof Error ? e.message : String(e);
      cancel.disabled = false;
    });
  });
  placeOf(doc).append(sheet);
  if (!ask.choices.length) {
    said.textContent = word('app.ai.sheet.no-model');
  } else await show();
  cancel.focus();
  return sheet;
}

/**
 * The board's way to ask an AI for a board (ES§45, board_proposed), through the sheet. The whole of `graph` goes with
 * the person's words. Nothing while AI is off, so the board offers no box. `got` takes the board proposed; `say` says
 * why nothing came.
 */
export function boardAskOf(
  doc: Document,
  ai: AppAi,
  note: { readonly text: string; readonly path: string },
  graph: string | undefined,
  got: (board: BoardDraft) => void,
  say: (why: string) => void,
): ((words: string) => void) | undefined {
  if (!graph || ai.setup.aiUse !== 'on' || !ai.choices(PURPOSE).length) return undefined;
  return (words) => {
    const ask = (model: string) => {
      const made = boardMakeAsk(
        { settings: ai.settings(), level: null, model, note: note.text, notePath: note.path },
        graph,
        words,
      );
      return 'refused' in made ? Promise.resolve(made) : ai.prepare(made);
    };
    void openSendSheet(doc, ai, { choices: ai.choices(PURPOSE), prepare: ask }, (result) => {
      if (!result) return;
      if ('board' in result) return got(result.board);
      say('failed' in result ? result.failed : 'refused' in result ? result.refused : word('app.ai.sheet.no-board'));
    });
  };
}

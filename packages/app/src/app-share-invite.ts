// Inviting someone to a shared vault, and joining one (editor spec §45, board_access: people join by an encrypted
// invitation). The owner picks a trusted device, what that person may do, and a board. The invitation is text, sealed
// for that one device, so it can travel by any means. The guest pastes it and reads the inviter's fingerprint first,
// because nothing else says who sent it. Joining is a press of its own.
import { word } from '@thoughtknot/core';
import { Sharing, type NotJoined } from '@thoughtknot/sync/sharing';
import { make, printOf } from './app-share-dom.ts';

const ROLES = ['view', 'comment', 'edit'] as const;
const field = (doc: Document, label: string, control: HTMLElement) => {
  const wrap = make(doc, 'label', { className: 'gn-app-field' });
  wrap.append(make(doc, 'span', { textContent: label }), control);
  return wrap;
};
const said = (e: NotJoined) =>
  e === 'has-vault'
    ? 'app.share.has-vault'
    : e === 'not-for-this-device'
      ? 'app.share.not-for-you'
      : 'app.share.not-an-invitation';

/** What the owner can do after trusting a device: invite it. For a guest: the line that says what they joined. */
export async function inviteView(doc: Document, sharing: Sharing, status: HTMLElement): Promise<HTMLElement> {
  const view = make(doc, 'div');
  if (sharing.joined) {
    const { as, board, from } = sharing.joined;
    const line = word('app.share.you-joined', {
      as: word(`app.share.role-${as}`),
      board: board || word('app.share.every-board'),
      fingerprint: await printOf(from),
    });
    view.append(make(doc, 'p', { textContent: line }));
    return view;
  }
  view.append(make(doc, 'h3', { textContent: word('app.share.invite') }));
  if (!sharing.trusted.length) {
    view.append(make(doc, 'p', { textContent: word('app.share.trust-first') }));
    return view;
  }
  const device = make(doc, 'select');
  for (const key of sharing.trusted)
    device.append(make(doc, 'option', { value: key, textContent: await printOf(key) }));
  const role = make(doc, 'select');
  for (const r of ROLES) role.append(make(doc, 'option', { value: r, textContent: word(`app.share.role-${r}`) }));
  role.value = 'view';
  const board = make(doc, 'input', { type: 'text' });
  const out = make(doc, 'textarea', { readOnly: true, rows: 4, hidden: true });
  const outLabel = field(doc, word('app.share.invitation'), out);
  outLabel.hidden = true;
  const makeButton = make(doc, 'button', { type: 'button', textContent: word('app.share.invite-make') });
  makeButton.addEventListener('click', () => {
    void sharing.invite(board.value.trim(), role.value as (typeof ROLES)[number], device.value).then((text) => {
      out.value = text ?? '';
      out.hidden = outLabel.hidden = text === undefined;
      if (text !== undefined) out.focus();
    });
  });
  view.append(
    field(doc, word('app.share.invite-device'), device),
    field(doc, word('app.share.invite-role'), role),
    field(doc, word('app.share.invite-board'), board),
    makeButton,
    outLabel,
  );
  return view;
}

/** A device with keys and no vault yet: its public key to give out, and the field for the invitation it is sent. */
export async function joinView(
  doc: Document,
  sharing: Sharing,
  status: HTMLElement,
  again: () => Promise<void>,
): Promise<HTMLElement> {
  const view = make(doc, 'div');
  const mine = make(doc, 'textarea', { readOnly: true, rows: 3, value: sharing.publicKey });
  const paste = make(doc, 'textarea', { rows: 4 });
  const says = make(doc, 'p', { hidden: true });
  const check = make(doc, 'p', { textContent: word('app.share.check-sender'), hidden: true });
  const read = make(doc, 'button', { type: 'button', textContent: word('app.share.read-invitation') });
  const accept = make(doc, 'button', { type: 'button', textContent: word('app.share.accept'), hidden: true });
  read.addEventListener('click', () => {
    void (async () => {
      const i = Sharing.read(paste.value);
      says.hidden = check.hidden = accept.hidden = !i;
      if (!i) {
        status.textContent = word('app.share.not-an-invitation');
        return;
      }
      status.textContent = '';
      says.textContent = word('app.share.invitation-says', {
        fingerprint: await printOf(i.fromKey),
        as: word(`app.share.role-${i.as}`),
        board: i.board || word('app.share.every-board'),
      });
      accept.focus();
    })();
  });
  accept.addEventListener('click', () => {
    void (async () => {
      const i = Sharing.read(paste.value);
      const refused = await sharing.accept(paste.value);
      if (refused) status.textContent = word(said(refused));
      else {
        const name = await printOf(i?.fromKey ?? '');
        await again();
        status.textContent = word('app.share.joined', { fingerprint: name });
      }
    })();
  });
  view.append(
    make(doc, 'p', { textContent: word('app.share.join-sentence') }),
    field(doc, word('app.share.my-key'), mine),
    make(doc, 'p', { textContent: word('app.share.fingerprint', { fingerprint: await printOf(sharing.publicKey) }) }),
    field(doc, word('app.share.paste-invitation'), paste),
    read,
    says,
    check,
    accept,
  );
  return view;
}

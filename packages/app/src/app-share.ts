// Starting a shared vault from the desktop and phone app (editor spec §45, board_access; ES§40, mesh_vpn_sync).
// - A Share button opens a panel. One press starts a shared vault: the keys are made here, kept here, and never shown.
// - The panel shows this device's public key and a fingerprint to read aloud. The owner gives the key to the people
//   they invite, and checks it over the phone.
// - Another device is trusted by pasting its public key. Only a trusted device is ever sent anything.
// - Nothing is sent from this panel. The keys are kept by a `Keeper`, in the window's IndexedDB (app-share-keeper.ts).
import { word } from '@thoughtknot/core';
import type { Found } from '@thoughtknot/sync/remote';
import { Sharing, type Keeper } from '@thoughtknot/sync/sharing';
import { make, printOf } from './app-share-dom.ts';
import { inviteView, joinView } from './app-share-invite.ts';
import { linkView } from './app-share-link.ts';
import { offersView } from './app-share-offers.ts';

export interface SharePanelOptions {
  doc: Document;
  /** Where the keys are kept between runs; none where the window cannot keep them. */
  keeper: Keeper | undefined;
  /** Called with the vault once it is started or opened, so the rest of the window can use it. */
  started?: (sharing: Sharing) => void;
  /** Looks at what this machine has for sharing; nothing where the window cannot look. */
  find?: () => Promise<Found>;
}

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** The Share button, and the panel it opens. */
export function shareButton(o: SharePanelOptions): HTMLButtonElement {
  const button = make(o.doc, 'button', {
    type: 'button',
    textContent: word('app.share.open'),
    className: 'gn-app-share-open',
  });
  button.addEventListener('click', () => void openPanel(o, button));
  return button;
}

async function openPanel(o: SharePanelOptions, opener: HTMLElement): Promise<void> {
  const { doc, keeper } = o;
  const dialog = make(doc, 'dialog', { className: 'gn-app-share' });
  const heading = make(doc, 'h2', { id: 'gn-share-title', textContent: word('app.share.heading') });
  dialog.setAttribute('aria-labelledby', heading.id);
  const status = make(doc, 'p', { className: 'gn-app-status' });
  status.setAttribute('role', 'status');
  const body = make(doc, 'div');
  const close = make(doc, 'button', { type: 'button', textContent: word('editor.done') });
  const shut = () => {
    dialog.remove();
    opener.focus();
  };
  close.addEventListener('click', shut);
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    shut();
  });
  dialog.append(heading, make(doc, 'p', { textContent: word('app.share.sentence') }), body, status, close);
  doc.body.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');

  let focus: HTMLElement = close;
  const show = async (sharing: Sharing): Promise<void> => {
    const again = () => show(sharing);
    body.replaceChildren(
      await (sharing.hasVault ? vaultView(doc, sharing, status, again, o.find) : joinView(doc, sharing, status, again)),
    );
    o.started?.(sharing);
  };
  const joinButton = make(doc, 'button', { type: 'button', textContent: word('app.share.join') });
  const startButton = make(doc, 'button', { type: 'button', textContent: word('app.share.start') });
  startButton.addEventListener('click', () => {
    startButton.disabled = true;
    void (async () => {
      try {
        await show(await Sharing.start(keeper!));
        status.textContent = word('app.share.started');
      } catch (e) {
        status.textContent = word('app.share.failed', { why: why(e) });
        startButton.disabled = false;
      }
    })();
  });
  joinButton.addEventListener('click', () => {
    joinButton.disabled = true;
    void Sharing.prepare(keeper!).then(show, (e: unknown) => {
      status.textContent = word('app.share.failed', { why: why(e) });
      joinButton.disabled = false;
    });
  });
  try {
    if (!keeper) status.textContent = word('app.share.no-keeper');
    else {
      const kept = await Sharing.open(keeper);
      if (kept) await show(kept);
      else {
        body.append(startButton, ' ', joinButton);
        focus = startButton;
      }
    }
  } catch (e) {
    status.textContent = word('app.share.failed', { why: why(e) });
  }
  (body.querySelector('textarea') ?? focus).focus();
}

/** The started vault: this device's public key, who is trusted, and the field to trust another device. */
async function vaultView(
  doc: Document,
  sharing: Sharing,
  status: HTMLElement,
  again: () => Promise<void>,
  find?: () => Promise<Found>,
) {
  const view = make(doc, 'div');
  const mine = make(doc, 'textarea', { readOnly: true, rows: 3, value: sharing.publicKey });
  const label = make(doc, 'label', { className: 'gn-app-field' });
  label.append(make(doc, 'span', { textContent: word('app.share.my-key') }), mine);
  const print = make(doc, 'p', {
    textContent: word('app.share.fingerprint', { fingerprint: await printOf(sharing.publicKey) }),
  });
  const trustedHeading = make(doc, 'h3', { textContent: word('app.share.trusted') });
  const list = make(doc, 'ul');
  for (const key of sharing.trusted) {
    const name = await printOf(key);
    const stop = make(doc, 'button', { type: 'button', textContent: word('app.share.stop') });
    stop.setAttribute('aria-label', word('app.share.stop-one', { fingerprint: name }));
    stop.addEventListener('click', () => void sharing.distrust(key).then(again));
    list.append(make(doc, 'li', { textContent: `${name} ` }));
    list.lastElementChild?.append(stop);
  }
  const none = make(doc, 'p', { textContent: word('app.share.none-trusted'), hidden: sharing.trusted.length > 0 });
  const add = make(doc, 'textarea', { rows: 3 });
  const addLabel = make(doc, 'label', { className: 'gn-app-field' });
  addLabel.append(make(doc, 'span', { textContent: word('app.share.add') }), add);
  const trust = make(doc, 'button', { type: 'button', textContent: word('app.share.trust') });
  trust.addEventListener('click', () => {
    void (async () => {
      const refused = await sharing.trust(add.value);
      if (refused) status.textContent = word(refused === 'own-key' ? 'app.share.own-key' : 'app.share.not-a-key');
      else {
        const name = await printOf(add.value.replace(/\s+/g, '').toLowerCase());
        await again();
        status.textContent = word('app.share.now-trusted', { fingerprint: name });
      }
    })();
  });
  view.append(
    label,
    print,
    trustedHeading,
    list,
    none,
    addLabel,
    trust,
    await inviteView(doc, sharing, status),
    linkView(doc, sharing, status),
    offersView(doc, sharing, await (find?.().catch(() => ({})) ?? {}), status),
  );
  return view;
}

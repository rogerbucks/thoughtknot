// Starting a shared vault from the desktop and phone app (editor spec §45, board_access; ES§40, mesh_vpn_sync).
// - A Share button opens a panel. One press starts a shared vault: the keys are made here, kept here, and never shown.
// - The panel shows this device's public key and a fingerprint to read aloud. The owner gives the key to the people
//   they invite, and checks it over the phone.
// - Another device is trusted by pasting its public key. Only a trusted device is ever sent anything.
// - Nothing is sent from this panel. The keys are kept by a `Keeper`, in the window's IndexedDB (app-share-keeper.ts).
import { word } from '@thoughtknot/core';
import { Sharing, fingerprint, fromHex, type Keeper } from '@thoughtknot/sync/sharing';

export interface SharePanelOptions {
  doc: Document;
  /** Where the keys are kept between runs; none where the window cannot keep them. */
  keeper: Keeper | undefined;
  /** Called with the vault once it is started or opened, so the rest of the window can use it. */
  started?: (sharing: Sharing) => void;
}

const make = <K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, props: Record<string, unknown> = {}) =>
  Object.assign(doc.createElement(tag), props);

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** The fingerprint of a public key written in hexadecimal. */
const printOf = async (hex: string): Promise<string> => fingerprint(fromHex(hex) ?? new Uint8Array());

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
    body.replaceChildren(await vaultView(doc, sharing, status, () => show(sharing)));
    o.started?.(sharing);
  };
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
  try {
    if (!keeper) status.textContent = word('app.share.no-keeper');
    else {
      const kept = await Sharing.open(keeper);
      if (kept) await show(kept);
      else {
        body.append(startButton);
        focus = startButton;
      }
    }
  } catch (e) {
    status.textContent = word('app.share.failed', { why: why(e) });
  }
  (body.querySelector('textarea') ?? focus).focus();
}

/** The started vault: this device's public key, who is trusted, and the field to trust another device. */
async function vaultView(doc: Document, sharing: Sharing, status: HTMLElement, again: () => Promise<void>) {
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
  view.append(label, print, trustedHeading, list, none, addLabel, trust);
  return view;
}

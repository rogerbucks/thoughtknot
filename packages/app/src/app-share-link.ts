// Where the link to the other device runs (editor spec ES§40, mesh_vpn_sync). The person writes the address this device
// listens at and the address of the other device, both on their mesh VPN. They are kept with the keys, on this device
// only. The link starts the next time a note opens. Nothing is sent from this screen.
import { word } from '@thoughtknot/core';
import type { Sharing } from '@thoughtknot/sync/sharing';
import { make } from './app-share-dom.ts';

const field = (doc: Document, label: string, control: HTMLElement) => {
  const wrap = make(doc, 'label', { className: 'gn-app-field' });
  wrap.append(make(doc, 'span', { textContent: label }), control);
  return wrap;
};

/** The two addresses, each in a field, and the button that keeps them. */
export function linkView(doc: Document, sharing: Sharing, status: HTMLElement): HTMLElement {
  const view = make(doc, 'div');
  const listen = make(doc, 'input', { type: 'text', value: sharing.link.listen ?? '' });
  const dial = make(doc, 'input', { type: 'text', value: sharing.link.dial ?? '' });
  const save = make(doc, 'button', { type: 'button', textContent: word('app.share.link-save') });
  save.addEventListener('click', () => {
    void sharing.setLink({ listen: listen.value, dial: dial.value }).then(() => {
      status.textContent = word('app.share.link-saved');
    });
  });
  view.append(
    make(doc, 'h3', { textContent: word('app.share.link') }),
    make(doc, 'p', { textContent: word('app.share.link-sentence') }),
    field(doc, word('app.share.link-listen'), listen),
    field(doc, word('app.share.link-dial'), dial),
    save,
  );
  return view;
}

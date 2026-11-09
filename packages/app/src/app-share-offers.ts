// What this machine offers for sharing, said in words and taken one offer at a time (editor spec ES§40, five_layer_stack;
// Roger, 9 Nov 2026: swap a part for a system the person has, and never silently). Nothing is switched until the person
// presses Use on that offer. The address it replaces is said back, so it can be written again above. Nothing is sent.
import { word } from '@thoughtknot/core';
import { accepted, offers, type Found } from '@thoughtknot/sync/remote';
import type { Sharing } from '@thoughtknot/sync/sharing';
import { make } from './app-share-dom.ts';

/** The port a device listens at when an offer fills in its address: the one the link screen's examples use. */
export const OFFER_PORT = 4040;

/** The offers for what was found, each with a button that takes that one offer. Said plainly when there are none. */
export function offersView(doc: Document, sharing: Sharing, found: Found, status: HTMLElement): HTMLElement {
  const view = make(doc, 'div', { className: 'gn-app-offers' });
  view.append(make(doc, 'h3', { textContent: word('app.share.offers') }));
  const all = offers(found).filter((o) => o.part === 'transport');
  if (all.length === 0) {
    view.append(make(doc, 'p', { textContent: word('app.share.offers-none') }));
    return view;
  }
  const list = make(doc, 'ul');
  for (const offer of all) {
    const address = `${offer.detail}:${OFFER_PORT}`;
    const name = found.vpns?.find((v) => v.address === offer.detail)?.name ?? '';
    const use = make(doc, 'button', { type: 'button', textContent: word('app.share.offer-use') });
    const item = make(doc, 'li', { textContent: `${word('app.share.offer-vpn', { name, address: offer.detail })} ` });
    const inUse = () => sharing.link.listen === address;
    const settle = () => {
      use.disabled = inUse();
      if (inUse()) use.textContent = word('app.share.offer-in-use');
    };
    settle();
    use.addEventListener('click', () => {
      // only an offer the person took is applied: the set is just this one
      if (accepted(all, new Set([offer.id])).length === 0) return;
      const before = sharing.link.listen;
      void sharing.setLink({ listen: address, dial: sharing.link.dial }).then(() => {
        status.textContent = before
          ? word('app.share.offer-used', { address, before })
          : word('app.share.offer-used-first', { address });
        settle();
      });
    });
    item.append(use);
    list.append(item);
  }
  view.append(list);
  return view;
}

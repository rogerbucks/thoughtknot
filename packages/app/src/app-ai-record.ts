// The record of sends on a phone (editor spec ES§19, app_ai_record; record_every_send). Each send is recorded whatever
// came of it. It says when, to which model and address, the digest and size of what went, and how much of the graph.
// It says what came back too. Never the text sent. The record is kept on this device only, in the window's own storage. It is never in the vault
// or anything that syncs, because it says what was sent. The last 200 are kept. The person reads it in the More view.
import { formatCount, word } from '@thoughtknot/core';
import type { SendRecord } from '@thoughtknot/core';
import type { SendLog } from './app-ai-host.ts';

/** How many sends the record keeps: the oldest is let go when one more is recorded. */
export const SENDS_KEPT = 200;

/** The key the record is kept under, in this device's storage. */
export const SENDS_KEY = 'thoughtknot.ai.sends';

/** One record as kept: only its own fields, so nothing else rides in. */
const kept = (r: SendRecord): SendRecord => ({
  id: String(r.id),
  at: String(r.at),
  model: String(r.model),
  to: String(r.to),
  digest: String(r.digest),
  size: Number(r.size) || 0,
  scope: { kind: r.scope.kind, things: Number(r.scope.things) || 0, links: Number(r.scope.links) || 0 },
  outcome: r.outcome,
  ...(r.why !== undefined && { why: String(r.why) }),
});

const isRecord = (v: unknown): v is SendRecord =>
  !!v && typeof v === 'object' && typeof (v as SendRecord).id === 'string' && !!(v as SendRecord).scope;

/** The record of sends in `storage`, this device's own: never the vault's. A record that cannot be read is empty. */
export function deviceSendLog(storage: Pick<Storage, 'getItem' | 'setItem'>, most = SENDS_KEPT): SendLog {
  const list = (): SendRecord[] => {
    try {
      const read: unknown = JSON.parse(storage.getItem(SENDS_KEY) ?? '[]');
      return Array.isArray(read) ? read.filter(isRecord) : [];
    } catch {
      return [];
    }
  };
  return {
    list,
    add: (record) => {
      const all = [...list(), kept(record)].slice(-most);
      try {
        storage.setItem(SENDS_KEY, JSON.stringify(all));
      } catch {
        // a store that is full or refused keeps what it had: the send itself has gone already
      }
    },
  };
}

/** One send, in words: when, to whom, how much, and what came of it. */
export function sendSaid(r: SendRecord): string {
  const outcome = r.outcome === 'answered' ? word('app.ai.record.answered') : word('app.ai.record.failed');
  return word('app.ai.record.line', {
    at: r.at.replace('T', ' ').replace(/Z$/, ' UTC'),
    model: r.model,
    to: r.to,
    size: formatCount(r.size),
    outcome,
  });
}

/**
 * The record in the More view: a part of its own that opens to the sends made from this device, newest first. It is
 * read afresh each time it opens.
 */
export function recordSection(doc: Document, log: SendLog): HTMLElement {
  const part = doc.createElement('details');
  part.className = 'gn-ai-record';
  const head = doc.createElement('summary');
  const list = doc.createElement('ol');
  list.className = 'gn-ai-record-list';
  const fill = () => {
    const sends = log.list();
    head.textContent = word('app.ai.record.title', { count: sends.length });
    list.replaceChildren(
      ...(sends.length
        ? [...sends].reverse().map((r) => {
            const item = doc.createElement('li');
            item.textContent = sendSaid(r);
            item.title = word('app.ai.record.digest', { digest: r.digest });
            return item;
          })
        : [Object.assign(doc.createElement('li'), { textContent: word('app.ai.record.none') })]),
    );
  };
  part.addEventListener('toggle', () => part.open && fill());
  fill();
  const where = doc.createElement('p');
  where.className = 'gn-ai-quiet';
  where.textContent = word('app.ai.record.where');
  part.append(head, where, list);
  return part;
}

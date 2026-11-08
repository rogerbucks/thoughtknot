// The live link between two devices at a shared board (editor spec ES§45 and ES§40; board_live_together, mesh_vpn_sync,
// encrypted_everywhere). It joins a board seat to the owner's other device over channels the host opens on the mesh
// VPN. Nothing crosses a channel in the clear. Records go through `Peer`, one fresh sealed session for each exchange.
// Presence goes over its own channel, sealed the same way with a fresh session. Only trusted devices get past the
// first message. A device serves the other's channels, and dials its own to send.
import { Session, EPHEMERAL_BYTES, SALT_BYTES } from './session.ts';
import { Peer } from './peer.ts';
import type { Channel } from './peer.ts';
import type { DeviceKeys } from './keys.ts';
import type { Shelf } from './store.ts';
import type { Link } from './shared-board.ts';

const KEY_BYTES = 65;
/** The first message of a records channel: the device key, then the one-time key and salt. */
const RECORDS_HELLO = KEY_BYTES + EPHEMERAL_BYTES + SALT_BYTES;
/** The first message of a presence channel: the same, and one more byte that marks it. */
const PRESENCE_HELLO = RECORDS_HELLO + 1;
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/** A channel whose first message has been read, to tell a presence channel from a records one. */
function routed(raw: Channel): Promise<{ presence: boolean; channel: Channel }> {
  return new Promise((resolve) => {
    let first = true;
    let ended = false;
    let heard: ((m: Uint8Array) => void) | undefined;
    let closed: (() => void) | undefined;
    const kept: Uint8Array[] = [];
    const channel: Channel = {
      send: (m) => raw.send(m),
      close: () => raw.close(),
      listen(h, c) {
        heard = h;
        closed = c;
        for (const m of kept.splice(0)) h(m);
        if (ended) c();
      },
    };
    raw.listen(
      (m) => {
        if (first) {
          first = false;
          kept.push(m);
          resolve({ presence: m.length === PRESENCE_HELLO, channel });
        } else if (heard) heard(m);
        else kept.push(m);
      },
      () => {
        ended = true;
        closed?.();
      },
    );
  });
}

/**
 * `raw` as a sealed channel to a trusted device, or why not. Every message is sealed to this session and its order.
 * A message that does not open ends the channel.
 */
export function sealedChannel(
  keys: DeviceKeys,
  trusted: readonly Uint8Array[],
  raw: Channel,
): Promise<Channel | { refused: string }> {
  return new Promise((resolve) => {
    const begun = Session.begin();
    let session: Session | undefined;
    let ready!: (s: Session | undefined) => void;
    const opened = new Promise<Session | undefined>((r) => (ready = r));
    let queue = Promise.resolve();
    let sending = Promise.resolve();
    let heard: ((m: Uint8Array) => void) | undefined;
    let closed: (() => void) | undefined;
    const kept: Uint8Array[] = [];
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      raw.close();
      closed?.();
    };
    const channel: Channel = {
      send: (m) => {
        sending = sending
          .then(async () => {
            const s = await opened;
            if (s) raw.send(await s.seal(m));
          })
          .catch(() => {});
      },
      listen(h, c) {
        heard = h;
        closed = c;
        for (const m of kept.splice(0)) h(m);
        if (ended) c();
      },
      close: () => raw.close(),
    };
    const refuse = (why: string) => {
      raw.close();
      ready(undefined);
      resolve({ refused: why });
    };
    const take = async (message: Uint8Array) => {
      if (!session) {
        const theirs = message.slice(0, KEY_BYTES);
        const whole = message.length === PRESENCE_HELLO;
        if (!whole || same(theirs, keys.publicKey) || !trusted.some((t) => same(t, theirs)))
          return refuse('a device that is not one of the owner’s');
        session = await Session.open(keys, theirs, await begun, message.slice(KEY_BYTES, RECORDS_HELLO));
        ready(session);
        return resolve(channel);
      }
      let plain: Uint8Array;
      try {
        plain = await session.open(message);
      } catch {
        return end();
      }
      if (heard) heard(plain);
      else kept.push(plain);
    };
    raw.listen(
      (m) => {
        queue = queue.then(() => take(m)).catch(end);
      },
      () => {
        queue = queue.then(() => {
          ended = true;
          if (!session) refuse('the other device closed the channel before it was sealed');
          else closed?.();
        });
      },
    );
    void begun.then((b) => raw.send(Uint8Array.from([...keys.publicKey, ...b.hello, 1])));
  });
}

const words = new TextEncoder();
const text = new TextDecoder();

/** The live link of one device to another, for a board seat. */
export class MeshLink implements Link {
  readonly #keys: DeviceKeys;
  readonly #shelf: Shelf;
  readonly #trusted: readonly Uint8Array[];
  readonly #dial: () => Promise<Channel>;
  #presence: Promise<Channel | { refused: string }> | undefined;
  #heard: ((message: string) => void) | undefined;
  #arrived: (() => void) | undefined;

  /** A link for the device with `keys`, holding `shelf`, that talks only to `trusted` devices. `dial` opens a channel to the other. */
  constructor(keys: DeviceKeys, shelf: Shelf, trusted: readonly Uint8Array[], dial: () => Promise<Channel>) {
    this.#keys = keys;
    this.#shelf = shelf;
    this.#trusted = trusted;
    this.#dial = dial;
  }

  async exchange(): Promise<void> {
    const synced = await new Peer(this.#keys, this.#shelf, this.#trusted).sync(await this.#dial());
    if ('got' in synced && synced.got > 0) this.#arrived?.();
  }

  send(message: string): void {
    this.#presence ??= this.#dial().then((raw) => sealedChannel(this.#keys, this.#trusted, raw));
    const opened = this.#presence;
    void opened.then((c) => {
      if ('refused' in c) this.#presence = undefined;
      else c.send(words.encode(message));
    });
  }

  listen(heard: (message: string) => void, arrived: () => void): void {
    this.#heard = heard;
    this.#arrived = arrived;
  }

  /** Takes in the channels the other device dials, until `stop`. `accept` gives the next channel, and fails once stopped. */
  serve(accept: () => Promise<Channel>): { stop(): void } {
    let stopped = false;
    void (async () => {
      while (!stopped) {
        const raw = await accept().catch(() => undefined);
        if (!raw) break;
        void this.#take(raw);
      }
    })();
    return { stop: () => void (stopped = true) };
  }

  async #take(raw: Channel): Promise<void> {
    const { presence, channel } = await routed(raw);
    if (!presence) {
      const synced = await new Peer(this.#keys, this.#shelf, this.#trusted).sync(channel);
      if ('got' in synced && synced.got > 0) this.#arrived?.();
      return;
    }
    const sealed = await sealedChannel(this.#keys, this.#trusted, channel);
    if (!('refused' in sealed))
      sealed.listen(
        (m) => this.#heard?.(text.decode(m)),
        () => {},
      );
  }
}

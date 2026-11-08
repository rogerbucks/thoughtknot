// The CRDT for a host that cannot run it (editor spec ES§40 and ES§41, crdt_transport, standalone_app). The app window
// may not run WebAssembly, so its notes are Automerge texts in Rust, and this class asks for them over calls. It keeps
// the text of each note, which the layers above read at once. It also keeps every change in the store, as the other
// build does. So a device on either build reads the other's records. Bytes cross as hexadecimal text.
import type { Anchor, Crdt, Made } from './crdt.ts';
import { actorOf } from './crdt.ts';
import type { Store } from './store.ts';

/** A call to the host: the command, and its arguments by name. The app gives one over Tauri's invoke. */
export type RemoteCall = (command: string, args: Record<string, unknown>) => Promise<unknown>;

const hex = (bytes: Uint8Array): string => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (text: string): Uint8Array => Uint8Array.from(text.match(/../g) ?? [], (h) => parseInt(h, 16));

/** What a merge brought, as the host says it. */
type Joined = { base: string; ours: string; theirs: string; merged: string };

/** The notes of one device, kept by the host and answered over `call`, with every change also kept in `store`. */
export class RemoteCrdt implements Crdt {
  readonly #call: RemoteCall;
  readonly #store: Store;
  readonly device: string;
  readonly #texts = new Map<string, string>();
  #actor = '';

  constructor(call: RemoteCall, store: Store, device: string) {
    this.#call = call;
    this.#store = store;
    this.device = device;
  }

  async open(note: string, text = ''): Promise<string> {
    this.#actor ||= await actorOf(this.device);
    const records = (await this.#store.records(note)).map(hex);
    const opened = (await this.#call('crdt_open', { note, actor: this.#actor, records, text })) as {
      text: string;
      first: string | null;
    };
    if (opened.first) await this.#store.add(note, this.device, unhex(opened.first));
    this.#texts.set(note, opened.text);
    return opened.text;
  }

  text(note: string): string {
    const text = this.#texts.get(note);
    if (text === undefined) throw new Error(`The note ${note} is not open.`);
    return text;
  }

  async splice(note: string, from: number, to: number, text: string, author: string): Promise<void> {
    this.text(note);
    const made: Made = { author, device: this.device };
    const change = (await this.#call('crdt_splice', {
      note,
      from,
      to,
      insert: text,
      message: JSON.stringify(made),
      time: Math.floor(Date.now() / 1000),
    })) as string;
    await this.#store.add(note, this.device, unhex(change));
    this.#texts.set(note, (await this.#call('crdt_text', { note })) as string);
  }

  async merge(note: string): Promise<Joined | undefined> {
    this.text(note);
    const records = (await this.#store.records(note)).map(hex);
    const joined = (await this.#call('crdt_merge', { note, records })) as Joined | null;
    if (!joined) return undefined;
    this.#texts.set(note, joined.merged);
    return joined;
  }

  async hasBeen(note: string, text: string): Promise<boolean> {
    return (await this.#call('crdt_has_been', { note, text })) as boolean;
  }

  async anchor(note: string, place: number): Promise<Anchor> {
    return (await this.#call('crdt_anchor', { note, place })) as Anchor;
  }

  async place(note: string, anchor: Anchor): Promise<number> {
    return (await this.#call('crdt_place', { note, anchor })) as number;
  }

  async history(note: string): Promise<Made[]> {
    return ((await this.#call('crdt_history', { note })) as string[]).map((m) => JSON.parse(m) as Made);
  }
}

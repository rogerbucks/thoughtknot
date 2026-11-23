// AI on the phone app (editor spec ES§19, app_ai_host). The iPhone app is a host for AI as the Obsidian plug-in is. The
// core keeps every rule, as it does there (core ai.ts):
// - nothing is sent while AI is off, which it is until the person turns it on in the More view (ai_off_until_chosen);
// - a note above a model's ceiling, at the highest level or holding a credential is refused, with why (model_ceiling);
// - the exact request is shown in the send sheet first, and only Send on exactly that sends it, once (seen_before_sent);
// - every send is recorded on this device, whatever came of it (record_every_send);
// - an answer is only ever a proposal (answers_are_proposals).
// A model the person runs may be reached by its name on their own network, such as a Tailscale name: the core counts
// one there as their own (ai_private_is_own). The app hands in the ports below on its window before the page starts.
// The page holds no key and reaches no network itself: the app's ports do, only when the person taps Send or Test.
import { aiModel, classificationOf, modelChoices, prepareSend, sendPrepared } from '@thoughtknot/core';
import type {
  AiModel,
  Confirmation,
  HostModel,
  ModelChoice,
  PreparedSend,
  SendAsk,
  SendRecord,
  SendRefused,
  SendResult,
  Settings,
  Transport,
} from '@thoughtknot/core';

/**
 * A model's key, kept in the device's own secure store under its name, for the model's address only: never in the
 * vault or the app's settings. The page never reads it back. A request names it by its mark (`keyMark`), and the
 * device writes it in, only for that address (the plug-in's Requests.swift).
 */
export interface AiKeys {
  /** Whether a key is kept under the name: the key is not read. */
  has(name: string): Promise<boolean>;
  /** Keeps the key under the name, for the model at `address` only. */
  set(name: string, key: string, address: string): Promise<void>;
  forget(name: string): Promise<void>;
}

/** What a request's header holds in place of the key kept under `name`: the device writes the key in for it. */
export const keyMark = (name: string): string => `{{keychain:${name}}}`;

/** The AI setup this device keeps: AI on or off, the models, and what unlabelled notes count as. Never a key. */
export interface AiSetup {
  aiUse: 'on' | 'off';
  aiModels: AiModel[];
  /** The level a note with no classification counts as; left out, the highest (unclassified_strictest). */
  aiUnlabelled?: string;
  /** The highest classification of note the phone's own model may be sent; left out, the level below the highest. */
  onDeviceCeiling?: string;
}

/** Where the setup is kept: in this device's own storage, never the vault. */
export interface SetupStore {
  read(): AiSetup | null;
  write(setup: AiSetup): void;
}

/** The record of sends, kept on this device only (app_ai_record): the newest last. */
export interface SendLog {
  add(record: SendRecord): void;
  list(): SendRecord[];
}

/** The phone's own model where it has one (app_ai_on_device), and the transport that asks it on the device. */
export interface OnDeviceModel {
  model: HostModel;
  transport: Transport;
}

/** What the app hands the page so the phone can host AI. */
export interface AppAiPorts {
  setup: SetupStore;
  keys: AiKeys;
  /** Sends one request to a model's address: the one way a note leaves the phone for a model. */
  transport: Transport;
  /** Asks an address with no body, for Test, and gives what it answered: no note goes. */
  probe(url: string, headers: Record<string, string>): Promise<{ status: number; text: string }>;
  record: SendLog;
  /**
   * The phone's own model, or null where it has none. `ceiling` is the one the person set, or the default: the
   * classification below the highest.
   */
  onDevice(ceiling: string): Promise<OnDeviceModel | null>;
}

/** The name of the window's property the app puts its ports on. */
export const AI_PORTS = 'thoughtknotAi';

/**
 * The ports the app put on the page's window, or none: then the page offers no AI. The app may put them there as a
 * promise, as it learns first whether this device is one that hosts AI. One that fails is none.
 */
export async function aiPortsOf(win: Window): Promise<AppAiPorts | undefined> {
  const given = (win as Window & { [AI_PORTS]?: AppAiPorts | Promise<AppAiPorts | undefined> })[AI_PORTS];
  return given ? Promise.resolve(given).catch(() => undefined) : undefined;
}

/** The note's classification, as the core reads its front matter. One that cannot be read counts above every level. */
export function levelOf(note: string): string | null {
  const c = classificationOf(note);
  return c.kind === 'given' ? c.level : c.kind === 'unknown' ? 'unreadable' : null;
}

/** What a send is asked for, with what the host fills in left out: the settings, the level, the phone's own model. */
export type PhoneAsk = Omit<SendAsk, 'settings' | 'level' | 'host' | 'sends' | 'secrets'>;

/** The setup as it is read: nothing kept means AI off and no model. */
const setupOf = (store: SetupStore): AiSetup => store.read() ?? { aiUse: 'off', aiModels: [] };

/** The default ceiling of the phone's own model: the classification below the highest, which no model is sent. */
export const onDeviceDefault = (levels: string[]): string => levels.at(-2) ?? levels[0] ?? '';

/** AI on this phone: the settings, the models offered, a send made ready, and a send. */
export class AppAi {
  readonly ports: AppAiPorts;
  private readonly base: Settings;
  private readonly own: OnDeviceModel | null;

  private constructor(ports: AppAiPorts, base: Settings, own: OnDeviceModel | null) {
    this.ports = ports;
    this.base = base;
    this.own = own;
  }

  /** The phone's own model, where it has one, with the ceiling the person set for it. */
  get onDevice(): OnDeviceModel | null {
    const ceiling = this.setup.onDeviceCeiling;
    return this.own && ceiling && this.levels.includes(ceiling)
      ? { ...this.own, model: { ...this.own.model, ceiling } }
      : this.own;
  }

  /** The classifications a note may carry, lowest first. */
  get levels(): string[] {
    return this.base.classifications;
  }

  /** AI on this phone, once it is known whether the phone has a model of its own. */
  static async start(ports: AppAiPorts, base: Settings): Promise<AppAi> {
    const setup = setupOf(ports.setup);
    const ceiling = setup.onDeviceCeiling ?? onDeviceDefault(base.classifications);
    const own = await ports.onDevice(ceiling).catch(() => null);
    return new AppAi(ports, base, own);
  }

  /** The setup as this device keeps it. */
  get setup(): AiSetup {
    return setupOf(this.ports.setup);
  }

  /** Keeps a changed setup on this device. Each model keeps only its own fields, so no key rides in with one. */
  save(setup: AiSetup): void {
    const levels = this.base.classifications;
    this.ports.setup.write({
      aiUse: setup.aiUse === 'on' ? 'on' : 'off',
      aiModels: setup.aiModels.map((m) => aiModel(m as AiModel & Record<string, unknown>, levels)),
      ...(setup.aiUnlabelled && levels.includes(setup.aiUnlabelled) && { aiUnlabelled: setup.aiUnlabelled }),
      ...(setup.onDeviceCeiling &&
        levels.includes(setup.onDeviceCeiling) && { onDeviceCeiling: setup.onDeviceCeiling }),
    });
  }

  /** The editor's settings with this device's AI setup over them. */
  settings(): Settings {
    const s = this.setup;
    const levels = this.base.classifications;
    return {
      ...this.base,
      aiUse: s.aiUse === 'on' ? 'on' : 'off',
      aiModels: s.aiModels.map((m) => aiModel(m as AiModel & Record<string, unknown>, levels)),
      ...(s.aiUnlabelled && levels.includes(s.aiUnlabelled) && { aiUnlabelled: s.aiUnlabelled }),
    };
  }

  /** The models offered for `purpose`, in order: the phone's own first, then the person's private ones, then the rest. */
  choices(purpose: string): ModelChoice[] {
    const settings = this.settings();
    const own = this.onDevice ? { name: this.onDevice.model.name } : null;
    const offered = modelChoices(settings, purpose, own);
    // the phone's own model needs AI on but no other model set up, as the core's prepareSend allows
    return offered.length || !own || settings.aiUse !== 'on'
      ? offered
      : [{ name: own.name, source: 'host', forPurpose: true }];
  }

  /** Whether `model` is the phone's own. */
  isOnDevice(model: string): boolean {
    return !!this.onDevice && this.onDevice.model.name === model;
  }

  /**
   * The exact request for `ask`, ready for the send sheet; or why nothing may be sent. The page holds no key, so the
   * device looks for the model's key in what would go, as it sends, and refuses it there (Requests.swift).
   */
  prepare(ask: PhoneAsk): Promise<PreparedSend | SendRefused> {
    return Promise.resolve(
      prepareSend({
        ...ask,
        settings: this.settings(),
        level: levelOf(ask.note),
        ...(this.onDevice && { host: this.onDevice.model }),
        sends: this.ports.record.list(),
      }),
    );
  }

  /**
   * Sends a prepared request, once the person tapped Send on exactly it. Its header names the key by its mark only: the
   * device writes the key in. The send is recorded on this device whatever came of it.
   */
  async send(p: PreparedSend, yes: Confirmation | undefined): Promise<SendResult> {
    const own = this.isOnDevice(p.model.name) ? this.own : null;
    const key = !own && p.model.keyName ? keyMark(p.model.keyName) : null;
    const result = await sendPrepared(p, yes, { transport: own ? own.transport : this.ports.transport, key });
    if ('record' in result) this.ports.record.add(result.record);
    return result;
  }
}

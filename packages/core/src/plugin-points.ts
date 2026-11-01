// What a plug-in adds through each extension point, and why each is refused (editor spec §43, plugin_interface). The
// registry (plugins.ts) checks each with these as it is added. It also lists the host's abilities a manifest may name
// (plugin_manifest_limits). A plug-in is given those it names and no other.
import type { DataInfo, ExportedData } from './export-data-model.ts';
import type { NoteStorage } from './note-storage.ts';
import type { Fetched } from './sources.ts';
import type { FilesOffer } from './plugin-files.ts';
import type { ExtensionPoint } from './plugins.ts';

const WORD = /^[a-z][a-z0-9-]*$/;

/** A data export a plug-in adds: the format's word, its name as offered, its file's extension and media type, and the writer. */
export interface DataExporter {
  /** The word the format is chosen by, lower case: `csv`. */
  format: string;
  /** What the format is called where it is offered: `CSV`. */
  title: string;
  /** The file name's extension, without its dot. */
  extension: string;
  /** The media type the file is shared as. */
  mime: string;
  /** The data written in this format. */
  write: (data: ExportedData, info: DataInfo) => string;
}

/** A place notes are kept that a plug-in adds, such as a server or a cloud drive (§41, storage_contract). */
export interface StorageBackend {
  /** The word it is chosen by, lower case: `webdav`. */
  name: string;
  /** What it is called where it is offered: `WebDAV`. */
  title: string;
  /** A store of the notes kept there, each read and written as `NoteStorage` promises. */
  open: () => NoteStorage;
}

/** A command a plug-in adds, which a host offers in its command list and menus. */
export interface PluginCommand {
  /** Its id, under its plug-in's own: `acme.tags.count`. */
  id: string;
  /** What it is called where it is offered, in the host's language. */
  title: string;
  /**
   * Does what the command does, given what the host chose it on, if anything: a file in a menu, say. It may take time,
   * and a host that waits for it runs it with `runCommandAsync`.
   */
  run: (given?: unknown) => void | Promise<void>;
  /** Whether it is offered now, such as while a drawing is open; a host offers it only when this says so. Always, when not given. */
  available?: () => boolean;
}

/**
 * The element a panel is drawn in, as the core sees it. The core has no DOM, so it names only the direction. A host
 * hands in its own element, set to read in the host's direction, and a panel may take it as an `HTMLElement`.
 */
export interface PanelRoot {
  dir: string;
}

/** A panel a plug-in adds, which a host shows beside a graph, as a sidebar or a pane is. */
export interface PluginPanel {
  /** Its id, under its plug-in's own: `acme.tags.list`. */
  id: string;
  /** What it is called where it is offered, in the host's language. */
  title: string;
  /** Draws the panel into `el`, which the host made and set to read in its direction. */
  render(el: PanelRoot): void;
}

/** A graph as a source or step gives it back: its text, as a .gql file holds it, and its class, if it says one. */
export interface GivenGraph {
  text: string;
  classification?: string;
}

/** A place graphs are read from that a plug-in adds, such as a database; what it gives back is a joined graph. */
export interface PluginSource {
  /** The word it is chosen by, lower case: `acme`. A graph is read from it by a place, as `acme:<target>`. */
  scheme: string;
  /** What it is called where it is offered, in the host's language. */
  title: string;
  /** The graph at `target`. */
  read: (target: string) => GivenGraph | Promise<GivenGraph>;
  /**
   * Only a built-in source of a host has it: what is found at `target` for the note at `from`. It reads the person's
   * own notes and files. It says a missing or moved place, so a block can name it. Its graph is the person's own.
   */
  fetch?: (target: string, from: string) => Fetched | Promise<Fetched>;
}

/** A step a plug-in adds that makes a graph from others, such as a merge; what it gives back is a joined graph. */
export interface PluginStep {
  /** Its id, under its plug-in's own: `acme.db.merge`. */
  id: string;
  /** What it is called where it is offered, in the host's language. */
  title: string;
  /** The graph made from `inputs`, each with its text and class. */
  run: (inputs: readonly GivenGraph[]) => GivenGraph | Promise<GivenGraph>;
}

/** The host's abilities a plug-in may ask for in its manifest, each given only to one that names it. */
export const HOST_ABILITIES = ['notice', 'settings', 'secrets', 'files'] as const;

/** One of the host's abilities. */
export type HostAbility = (typeof HOST_ABILITIES)[number];

/**
 * What each ability is: a brief notice, the plug-in's own settings and secrets, and the host's notes. They are the
 * host's own (display/host.ts, `Host`), which the core does not import, so the shapes are said again here.
 */
export interface HostAbilities {
  notice: (message: string) => void;
  /** The plug-in's settings: one JSON value, kept by the host for this plug-in alone. */
  settings: { load: () => Promise<unknown>; save: (value: unknown) => Promise<void> };
  /** The plug-in's own secrets, each read by its name under the plug-in's id: `acme.one.token`. */
  secrets: { get: (name: string) => string | null | Promise<string | null> };
  /** The notes at or below the ceiling the person set for the plug-in; its changes wait for the person. */
  files: NoteStorage;
}

/** Why a data export a plug-in adds is refused, or null when it is accepted. */
export function exporterProblem(e: DataExporter, taken: Map<string, string>): string | null {
  if (!WORD.test(e.format)) return `the format "${e.format}" is not a lower-case word`;
  if (taken.has(e.format)) return `the format "${e.format}" is already added by ${taken.get(e.format)}`;
  if (!e.title.trim()) return `the format "${e.format}" has no title`;
  if (!WORD.test(e.extension)) return `the extension "${e.extension}" is not a lower-case word`;
  if (!/^[a-z]+\/[a-z0-9.+-]+$/.test(e.mime)) return `the media type "${e.mime}" is not one`;
  if (typeof e.write !== 'function') return `the format "${e.format}" has no writer`;
  return null;
}

/** Why a storage backend a plug-in adds is refused, or null when it is accepted. */
export function backendProblem(b: StorageBackend, taken: Map<string, string>): string | null {
  if (!WORD.test(b.name)) return `the storage "${b.name}" is not named by a lower-case word`;
  if (taken.has(b.name)) return `the storage "${b.name}" is already added by ${taken.get(b.name)}`;
  if (!b.title.trim()) return `the storage "${b.name}" has no title`;
  if (typeof b.open !== 'function') return `the storage "${b.name}" cannot be opened`;
  return null;
}

/** Why a command the plug-in `pluginId` adds is refused, or null when it is accepted. */
export function commandProblem(c: PluginCommand, pluginId: string, taken: Map<string, string>): string | null {
  const word = c.id.startsWith(`${pluginId}.`) ? c.id.slice(pluginId.length + 1) : '';
  if (!WORD.test(word)) return `the command "${c.id}" is not named ${pluginId}.<word>`;
  if (taken.has(c.id)) return `the command "${c.id}" is added already`;
  if (!c.title.trim()) return `the command "${c.id}" has no title`;
  if (typeof c.run !== 'function') return `the command "${c.id}" does nothing`;
  if (c.available !== undefined && typeof c.available !== 'function')
    return `the command "${c.id}" has an available that is not a function`;
  return null;
}

/** Why a panel the plug-in `pluginId` adds is refused, or null when it is accepted. */
export function panelProblem(c: PluginPanel, pluginId: string, taken: Map<string, string>): string | null {
  const word = c.id.startsWith(`${pluginId}.`) ? c.id.slice(pluginId.length + 1) : '';
  if (!WORD.test(word)) return `the panel "${c.id}" is not named ${pluginId}.<word>`;
  if (taken.has(c.id)) return `the panel "${c.id}" is added already`;
  if (!c.title.trim()) return `the panel "${c.id}" has no title`;
  if (typeof c.render !== 'function') return `the panel "${c.id}" draws nothing`;
  return null;
}

/** Why a graph source a plug-in adds is refused, or null when it is accepted. */
export function sourceProblem(s: PluginSource, taken: Map<string, string>, builtIn = false): string | null {
  if (!WORD.test(s.scheme)) return `the source "${s.scheme}" is not named by a lower-case word`;
  if (taken.has(s.scheme)) return `the source "${s.scheme}" is already added by ${taken.get(s.scheme)}`;
  if (!s.title.trim()) return `the source "${s.scheme}" has no title`;
  if (typeof s.read !== 'function') return `the source "${s.scheme}" reads nothing`;
  if (s.fetch !== undefined && !builtIn)
    return `the source "${s.scheme}" reads as the person's own, which only a built-in may`;
  if (s.fetch !== undefined && typeof s.fetch !== 'function') return `the source "${s.scheme}" fetches nothing`;
  return null;
}

/** Why a graph step the plug-in `pluginId` adds is refused, or null when it is accepted. */
export function stepProblem(s: PluginStep, pluginId: string, taken: Map<string, string>): string | null {
  const word = s.id.startsWith(`${pluginId}.`) ? s.id.slice(pluginId.length + 1) : '';
  if (!WORD.test(word)) return `the step "${s.id}" is not named ${pluginId}.<word>`;
  if (taken.has(s.id)) return `the step "${s.id}" is added already`;
  if (!s.title.trim()) return `the step "${s.id}" has no title`;
  if (typeof s.run !== 'function') return `the step "${s.id}" does nothing`;
  return null;
}

/** The host's abilities a registry may hand out; settings are made for each plug-in, kept apart from the others'. */
export interface HostOffer {
  notice?: HostAbilities['notice'];
  settingsFor?: (pluginId: string) => HostAbilities['settings'];
  secrets?: HostAbilities['secrets'];
  /** The notes, given to each plug-in through the note gate (plugin-files.ts, TRUST-16). */
  files?: FilesOffer;
}

/**
 * The host's secrets as one plug-in sees them: only those named under its own id, such as `acme.one.token`. Any other
 * name, an AI model's key or another plug-in's, gives null, and the host is never asked for it (TRUST-15).
 */
export const ownSecrets = (store: HostAbilities['secrets'], pluginId: string): HostAbilities['secrets'] =>
  Object.freeze({
    get: (name: string) =>
      name.startsWith(`${pluginId}.`) && name.length > pluginId.length + 1 ? store.get(name) : null,
  });

/** What a registry is made with: the host's abilities, how long a call may run, and the clock it is timed by. */
export interface RegistryOptions {
  /** What the host offers; a plug-in naming an ability it does not offer is refused. */
  host?: HostOffer;
  /** In milliseconds; `PLUGIN_TIME_LIMIT` unless set. */
  timeLimit?: number;
  /** The time now, in milliseconds; `Date.now` unless set. */
  now?: () => number;
  /** The version of each extension point this host has; `POINT_VERSIONS` unless set. */
  pointVersions?: Partial<Record<ExtensionPoint, string>>;
  builtIn?: boolean;
}

/** A plug-in that was stopped, and why. */
export interface StoppedPlugin {
  plugin: string;
  why: string;
}

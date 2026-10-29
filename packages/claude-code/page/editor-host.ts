// The whole host the browser editor gives the core (editor spec §41, host_contract_published; risk ARCH-1). Its parts
// are split between the page and its server. This puts the real ones together: the page's display and layouts, and
// the server's notes, drafts and settings. test/host-adapters.test.js holds them to the one contract, as it holds
// Obsidian's. The page follows no link of a card's note yet, so its links find nothing. No secret is held either:
// Claude is the only AI the browser editor offers (cc_claude_only).
import { word } from '@thoughtknot/core';
import type { NoteStorage } from '@thoughtknot/core';
import type { Host } from '@thoughtknot/core/display/host';
import type { LinkHost } from '@thoughtknot/core/display/link-host';
import { browserHost } from './browser-host.ts';
import { pageLayouts } from './layout-runner.ts';

/** Where the server keeps drafts, as its `DraftShelf` does (server/note-drafts.ts). */
export interface EditorDrafts {
  keep: (key: string, draft: { text: string; against: null }) => Promise<{ ok: true } | { ok: false; why: string }>;
  take: (key: string) => Promise<{ text: string } | null>;
  clear: (key: string) => Promise<void>;
}

/** The parts the editor runs with: the page's window, and the server's notes, drafts and settings. */
export interface EditorParts {
  win: Window & { Worker: typeof Worker };
  /** The vault's notes, as the server's `folderStorage` keeps them. */
  files: NoteStorage;
  drafts: EditorDrafts;
  /** The settings as the server tells the page them (server/page-settings.ts). */
  settings: unknown;
}

/** A card's links on the page, which follows none yet: each finds nothing, and none is created. */
const noLinks = (path: string): LinkHost => ({
  path,
  broken: [],
  found: () => false,
  open: () => {},
  hover: () => {},
  render: async (markdown, el) => void (el.textContent = markdown),
  cameBack: () => undefined,
  create: async () => false,
});

/** The editor's parts as the one host interface. */
export function editorHost({ win, files, drafts, settings }: EditorParts): Host {
  const layouts = pageLayouts(win);
  return {
    display: browserHost(win),
    links: noLinks,
    settings: {
      load: async () => settings,
      save: () => Promise.reject(new Error(word('server.settings-read-only'))),
      readOnly: true,
    },
    secrets: { get: () => null },
    files,
    drafts: {
      read: async (key) => (await drafts.take(key))?.text ?? null,
      keep: async (key, text) => {
        const kept = await drafts.keep(key, { text, against: null });
        if (!kept.ok) throw new Error(kept.why);
      },
      clear: (key) => drafts.clear(key),
    },
    layout: { draw: (drawing, owner) => layouts.draw(drawing, owner) },
  };
}

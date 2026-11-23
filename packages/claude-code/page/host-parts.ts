// What a host may add to the page (editor spec ES§19, app_ai_host). The phone app adds its AI this way: a group of the
// More view, and the board's way to ask. The page itself holds none of it. So a page no host adds to, as in Claude
// Code or VS Code, offers no model (cc_claude_only). The host puts a function on the window before the page starts.
import type { Settings } from '@thoughtknot/core';
import type { BoardAskOf } from './board-section.ts';

/** What the page hands a host's parts: the page, its settings, the note, and its way to say something. */
export interface HostPartsAsk {
  doc: Document;
  settings: Settings;
  note: { readonly text: string; readonly path: string };
  say: (text: string) => void;
  /** Draws the boards again, so a change in the host's part shows on them. */
  changed: () => void;
}

/** What a host adds: a part of the More view, and the board's way to ask its AI. Either may be left out. */
export interface HostParts {
  section?: HTMLElement;
  askOf?: BoardAskOf;
}

/** The name of the window's property the host puts its function on. */
export const HOST_PARTS = 'thoughtknotHostParts';

/** The host's parts for this page, or none. A host whose parts fail adds none. */
export async function hostPartsOf(win: Window, ask: HostPartsAsk): Promise<HostParts> {
  const make = (win as Window & { [HOST_PARTS]?: (ask: HostPartsAsk) => Promise<HostParts> | HostParts })[HOST_PARTS];
  if (!make) return {};
  try {
    return await make(ask);
  } catch {
    return {};
  }
}

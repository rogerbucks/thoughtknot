// The marks the person's settings put on a window's page: a still view, plain words and easier reading (ES§69, NEURO-9).
// Obsidian has more than one window once a pop-out is open, and each has a page of its own. So every window is marked,
// the one the plug-in opened in and each pop-out from the moment it opens. Each is unmarked when the plug-in stops.
import type { Plugin } from 'obsidian';
import { markBody } from '@thoughtknot/core';
import type { Settings } from '@thoughtknot/core';

/** The classes the settings put on a page's body, so that stopping can take them off again. */
const MARKS = ['thoughtknot-still', 'thoughtknot-reading', 'thoughtknot-easier-reading'];

/** Marks every window's page for the person's settings, and takes the marks off when the plug-in stops. */
export class WindowMarks {
  private readonly docs = new Set<Document>();

  constructor(
    owner: Plugin,
    private readonly settings: () => Pick<Settings, 'viewPreset' | 'easierReading'>,
  ) {
    this.docs.add(activeDocument);
    owner.registerEvent(
      owner.app.workspace.on('window-open', (win) => {
        this.docs.add(win.doc);
        this.mark();
      }),
    );
    owner.registerEvent(owner.app.workspace.on('window-close', (win) => void this.docs.delete(win.doc)));
    owner.register(() => this.clear()); // the marks come off when the plug-in stops
    this.mark();
  }

  /** Marks every window's body for the settings as they are now. */
  mark(): void {
    for (const doc of this.docs) markBody(doc.body, this.settings());
  }

  /** Takes the marks off every window, and forgets them. */
  private clear(): void {
    for (const doc of this.docs) doc.body.classList.remove(...MARKS);
    this.docs.clear();
  }
}

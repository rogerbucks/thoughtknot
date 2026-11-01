// Whether a graph's picture for readers is up to date, for the card's bar to say (editor spec §62,
// picture_hidden_when_drawn). It reads the note's picture line after the graph's block and the file it links. A file
// whose fingerprint matches the block's text is up to date. The bar asks again each time the pictures are kept.
import {
  pictureBlocks,
  pictureFingerprint,
  pictureLines,
  pictureState,
  pictureTarget,
  pictureTexts,
} from '@thoughtknot/core';
import type { Events } from 'obsidian';
import type { PictureStatus } from '@thoughtknot/core/display/graph-view/view-options';
import type ThoughtKnotPlugin from '../main';
import { exportText } from '../export/vault-write';
import { noteText } from '../storage/plugin-notes';
import { PICTURES_KEPT } from './pictures';

/** Up to date, out of date, or null when the graph's block has no picture line in the note `text` at `path`. */
export async function stateOf(
  text: string,
  path: string,
  graph: string,
  read: (path: string) => Promise<string | null>,
): Promise<'current' | 'stale' | null> {
  const block = pictureBlocks(text).find((b) => b.graph === graph)?.block;
  const line = pictureLines(text).find((p) => p.block === block);
  if (block === undefined || !line) return null;
  const state = pictureState(
    await read(pictureTarget(path, line.href)),
    pictureFingerprint(path, pictureTexts(text, graph)),
  );
  return state === 'current' ? 'current' : 'stale';
}

/** What the card of `graph` in the note at `path` asks to say whether its picture is up to date. */
export function pictureStatus(plugin: ThoughtKnotPlugin, path: string, graph: string): PictureStatus {
  return {
    state: async () => stateOf((await noteText(plugin.app, path)) ?? '', path, graph, (p) => exportText(plugin, p)),
    watch: (then) => {
      // the plugin's own event, which the workspace's typed list does not name
      const events: Events = plugin.app.workspace;
      const ref = events.on(PICTURES_KEPT, (kept) => kept === path && then());
      return () => plugin.app.workspace.offref(ref);
    },
  };
}

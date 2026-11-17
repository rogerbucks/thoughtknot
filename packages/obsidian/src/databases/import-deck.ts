// A PowerPoint deck brought into the note in front, as one board with a frame to each slide (editor spec ES§45,
// board_exchange). The deck was read in the document worker under its time limit. Here its pictures are kept among the
// note's attachments, under free names so nothing is overwritten, by the vault's own writer. The file is never written.
import { Notice } from 'obsidian';
import type { TFile } from 'obsidian';
import { deckBlock, deckBoard, withImport, word } from '@thoughtknot/core';
import type { PptxRead } from '@thoughtknot/core';
import { vaultOps } from '../export/vault-write';
import type ThoughtKnotPlugin from '../main';
import { changeVaultNote } from '../storage/plugin-notes';

/** Writes the board the deck makes into `note`, and says what was left out; or says why nothing was written. */
export async function addDeck(
  plugin: ThoughtKnotPlugin,
  note: TFile,
  file: TFile,
  deck: PptxRead,
  graph: string,
): Promise<boolean> {
  const failed = (why: string) => new Notice(word('import.failed', { file: file.basename, why }));
  const made = deckBoard(deck, graph, file.path);
  if ('refused' in made) {
    failed(made.refused);
    return false;
  }
  const ops = vaultOps(plugin);
  const done = await deckBlock(made, async (picture) => {
    try {
      const path = await plugin.app.fileManager.getAvailablePathForAttachment(picture.name, note.path);
      await ops.write(path, picture.bytes);
      return path;
    } catch {
      return null;
    }
  });
  await changeVaultNote(plugin.app, note.path, (now) => withImport(now, done.block));
  new Notice([word('import.deck.done', { graph, file: file.path, note: note.basename }), ...done.notes].join(' '));
  return true;
}

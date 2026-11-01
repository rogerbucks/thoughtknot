// What drawing a gql block reads of where it is drawn (spec §3; CODE-10). Obsidian's reading view hands in its own
// context for a code block. Live Preview has none, so it makes one of these from the card. Both are this type, with no
// cast between them. A field the drawing starts to read is added here, and the compiler then asks Live Preview for it.
import type { Component, MarkdownSectionInformation } from 'obsidian';

/** The fields of Obsidian's code block context that drawing a block uses. */
export interface BlockContext {
  /** The path of the note the block is in. */
  sourcePath: string;
  /** Where the block is in its note, and the note's text; null when the host cannot say, so the card is read-only. */
  getSectionInfo(el: HTMLElement): MarkdownSectionInformation | null;
  /** Keeps `child` loaded while the block is drawn, and unloads it with the block. */
  addChild(child: Component): void;
}

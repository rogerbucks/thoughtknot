// What a board needs of the host it is opened in (editor spec ES§45, board_view). Kept apart so board-view.ts stays
// small.
import type { Palette } from '@thoughtknot/core';

import type { BoardChange } from '../../board-edit.ts';
import type { Together } from '../../board-together.ts';
import type { ArrangeHooks } from './board-arrange-bar.ts';
import type { Nested } from './board-nest.ts';
import type { Pictures } from './board-images.ts';
import type { Viewer } from './board-view-items.ts';
import type { BeginHost } from './board-ways.ts';
import type { BoardQueryHost } from './board-queries.ts';

/** What a board needs of its host. */
export interface BoardHost extends Nested {
  /** The colours to draw in. */
  palette: Palette;
  /** Writes an edit to the board block in the note; resolves to the block as now written, or why it was refused. */
  write?: (change: BoardChange) => Promise<{ text: string } | { refused: string }>;
  /** What names this board in its host, such as its note and name, so its view is kept when it is drawn again. */
  key: string;
  /** The seat of this person at a shared board: the others are drawn over it, and the edits go through it. */
  together?: Together;
  /** Where the linked items go by the graph; with it the board offers an Arrange by graph button. */
  arrange?: ArrangeHooks['arrange'];
  /** Draws each View item's graph live from the note; without it a view shows only its frame. */
  views?: Viewer;
  /** Keeps and shows the pictures of the board; without it an Image item shows only its frame and name. */
  images?: Pictures;
  /** What the ways to begin on an empty board open (board_first_ways_in): text to graph and import. */
  begin?: BeginHost;
  /** The graph a board on one asks about, with an AI where there is one; with it the board offers its Filter (ES§75). */
  queries?: BoardQueryHost;
}

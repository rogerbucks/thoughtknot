// What a whiteboard's AI queries need in Obsidian (editor spec ES§75, on the board of ES§45). A board on a graph asks
// about that graph, read from the note when its Filter first opens. Words go to an AI only through the send dialog,
// under the rules of ES§19, and only while AI is on. Saved filters and queries are those of the graph's style.
import { boardGraphIn } from '@thoughtknot/core/display/board/board-queries';
import type { BoardQueryHost } from '@thoughtknot/core/display/board/board-queries';
import type ThoughtKnotPlugin from './main';
import { describeFor } from './ai/rule-describe';
import { namedFor } from './filter-saving';
import { noteText } from './storage/plugin-notes';

/** The queries of a board in note `path`, which saves nothing while `readOnly`. */
export function boardQueriesFor(plugin: ThoughtKnotPlugin, path: string, readOnly: () => boolean): BoardQueryHost {
  return async (board) => {
    const note = board.on ? await noteText(plugin.app, path) : null;
    const read = note && board.on ? boardGraphIn(note, board.on, await plugin.sharedSchemas()) : null;
    if (!read || !board.on) return null;
    const describe = describeFor(plugin, path, board.on);
    const named = namedFor(plugin, path, board.on, read.style, readOnly);
    return { graph: read.graph, named, ...(describe && { describe }) };
  };
}

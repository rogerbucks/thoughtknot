// Asking an AI for a board, from the board pane (spec ES§45, board_proposed). The person's words go through the send
// dialog, as every send does (ES§19). The model is named and the exact request is shown. Only a Send pressed on exactly
// that sends it, once, and records it. What comes back is a proposed board: it is shown, and written only when kept.
import { Notice } from 'obsidian';
import { aiReady, boardMakeAsk, gqlBlocks, readNote, word } from '@thoughtknot/core';
import type { BoardDraft } from '@thoughtknot/core/display/board/board-draft';
import type ThoughtKnotPlugin from '../main';
import { levelFor } from './ai';
import { SendDialog } from './send-dialog';
import { noteText } from '../storage/plugin-notes';

/** The pane's way to ask for a board, or nothing while AI is off (ai_off_until_chosen): the box is then not offered. */
export function boardAskFor(
  plugin: ThoughtKnotPlugin,
  path: string,
  graph: string | null,
  got: (b: BoardDraft) => void,
) {
  if (!graph || 'off' in aiReady(plugin.settings)) return undefined;
  return (words: string) => void openBoardMake(plugin, path, graph, words, got);
}

/** Opens the send dialog on note `path`, the whole of `graph` chosen, with the person's `words` as the question. */
async function openBoardMake(
  plugin: ThoughtKnotPlugin,
  path: string,
  graph: string,
  words: string,
  got: (board: BoardDraft) => void,
): Promise<void> {
  const file = plugin.app.vault.getFileByPath(path);
  if (!file) return;
  const note = (await noteText(plugin.app, path)) ?? '';
  const shared = await plugin.sharedSchemas();
  const blocks = gqlBlocks(note).map((b) => b.text);
  if (!readNote(blocks, undefined, shared).world[graph]) return void new Notice(word('ai.suggest.no-graph', { graph }));
  const rule = {
    ask: (base: Parameters<typeof boardMakeAsk>[0], g: string, asked: string) => boardMakeAsk(base, g, asked),
    fill: (answer: object, _model: string, done: () => void) => {
      if ('board' in answer) got(answer.board as BoardDraft);
      done();
    },
  };
  new SendDialog(plugin, file, note, levelFor(plugin, file, note), shared, {
    graph,
    things: [],
    question: words,
    rule,
  }).open();
}

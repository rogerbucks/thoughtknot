// Levels your AI names, saved in the AI block beside the graph, never in the graph block (editor spec §19, ai_block;
// R8). The block names the reviewer, private or public (R7), and the time. The save is one edit that one undo takes
// back, offered on its toast. The graph as the dialog read it must still be the graph in the note, else nothing is
// written and the toast says why.
import { aiReviewIn, graphSpanOf, isPrivate, levelsReview, word, writeAiBlock } from '@thoughtknot/core';
import type { AiModel, ChangeInput } from '@thoughtknot/core';
import type { App, TFile } from 'obsidian';
import { noticeWithUndo } from '../undo-notice';
import { vaultChanger, writeMetaBlock } from '../reading-view-metadata';

/** Saves the levels `changes` name for `graph` of `file`, as the dialog read it in `note`, found by `model`. */
export async function saveLevels(
  dialog: { app: App; close: () => void },
  [file, note, graph]: readonly [TFile, string, string],
  { changes }: { changes: readonly ChangeInput[] },
  model: AiModel,
): Promise<void> {
  const { app } = dialog;
  const shown = graphSpanOf(note, graph)?.text ?? '';
  const head = {
    by: model.name,
    reviewer: isPrivate(model) ? ('private' as const) : ('public' as const),
    at: `${new Date().toISOString().slice(0, 16)}Z`,
  };
  const review = levelsReview(changes, graph, head, aiReviewIn(note, graph));
  const w = await writeMetaBlock(vaultChanger(app, file), graph, 'AI', writeAiBlock(review), shown);
  noticeWithUndo(w.undo ? word('ai-block.saved', { model: model.name }) : w.said, w.undo);
  dialog.close();
}

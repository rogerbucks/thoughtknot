// The send dialog's row that chooses the model to ask (spec §19). The model set up for proposing changes comes first.
// The row says what the model is for and its ceiling, or the destination matrix row it is held to.
import { Setting } from 'obsidian';
import { modelChoices, purposeWords, word } from '@thoughtknot/core';
import type { Settings } from '@thoughtknot/core';

/** The purpose a send from the dialog is for: the model set up for it is offered first. */
export const PURPOSE = 'Proposing changes';

/** The models that may be asked, in `el`, `model` chosen; `chosen` is told of the one picked. */
export function drawModelRow(el: HTMLElement, settings: Settings, model: string, chosen: (name: string) => void): void {
  const choices = modelChoices(settings, PURPOSE);
  const now = settings.aiModels.find((m) => m.name === model);
  const purpose = now ? purposeWords(now.purpose) || word('ai.model.no-purpose') : '';
  new Setting(el)
    .setName(word('ai.model'))
    .setDesc(
      now
        ? now.matrixRow
          ? word('ai.model.matrix', { purpose, row: now.matrixRow })
          : word('ai.model.ceiling', { purpose, ceiling: now.ceiling })
        : '',
    )
    .addDropdown((d) => {
      for (const c of choices)
        d.addOption(c.name, c.forPurpose ? word('ai.model.for-proposing', { name: c.name }) : c.name);
      d.setValue(model).onChange(chosen);
    });
}

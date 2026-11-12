// The view preset panel, drawn (editor spec ES§69, view_presets_portable). It is the core's `PresetPanel` shown as a
// picker and its rows, for any host that has a page of its own. The panel holds what is said and done. This only draws
// it and tells it what was picked or pressed. A host calls `refresh` whenever the panel's owner has changed.
import { word } from '@thoughtknot/core';
import type { PresetPanel } from '@thoughtknot/core';
import { button } from './button.ts';

/** The drawn panel: draw it again once what it shows has changed. */
export interface PresetPanelView {
  refresh: () => void;
}

/** Draws `panel` at the end of `parent`. */
export function presetPanelView(parent: HTMLElement, panel: PresetPanel): PresetPanelView {
  const section = parent.createEl('section', {
    cls: 'thoughtknot-presets',
    attr: { 'aria-label': word('settings.view-preset.name') },
  });
  const refresh = (): void => {
    section.empty();
    section.createEl('h2', { text: word('settings.view-preset.name') });
    const pick = section.createEl('select', { attr: { 'aria-label': word('settings.view-preset.name') } });
    for (const s of panel.choices())
      pick.createEl('option', {
        text: s.name,
        value: s.id,
        attr: s.id === panel.shown() ? { selected: 'selected' } : {},
      });
    pick.addEventListener('change', () => panel.pick(pick.value));
    const mine = panel.shownOwn();
    if (mine) {
      const call = section.createEl('p');
      const name = call.createEl('input', {
        type: 'text',
        value: mine.name,
        attr: { 'aria-label': word('settings.own-presets.rename.name') },
      });
      const label = word('settings.own-presets.rename');
      button(call, label, 'check', () => panel.renameOwn(mine.id, name.value), label);
      button(call, word('settings.own-presets.delete'), 'trash', () => panel.deleteOwn(mine.id));
    }
    const list = section.createEl('ul');
    for (const row of [...panel.rows(), ...panel.ownRows()]) {
      const item = list.createEl('li');
      if (row.action) button(item, row.name, 'check', row.action, row.name);
      else item.createEl('strong', { text: row.name });
      if (row.desc) item.createSpan({ text: ` ${row.desc}` });
    }
  };
  refresh();
  return { refresh };
}

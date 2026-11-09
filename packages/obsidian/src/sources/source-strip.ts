// Where a drawing's data comes from (editor spec §7 view_of_another_note, §20 gql_file_source).
// A line above a card drawn from another note or a .gql file names it. For a note it has a button that opens it,
// as a tap on a link would. What it says is read where it is written, so this is the way to change it.
// A plug-in's source is named by its word and place, with no button: it is changed where the plug-in keeps it.
import { word } from '@thoughtknot/core';
import type { GraphSource } from '@thoughtknot/core';
import type ThoughtKnotPlugin from '../main';
import { saveMapping } from './source-read';
import { proseGraph } from '../ai/ai';

/** The source's name as the strip and its button say it: a note by its link, a file by its path. */
const shortName = (s: GraphSource) => s.target.replace(/\.md$/i, '');

/**
 * Puts the line saying where the data comes from at the top of `parent`: "Drawn from the note Trip" with Open Trip, or
 * "Drawn from the file Graphs/trip.gql". `from` is the path of the note the card is in, which a link is found from.
 */
export function sourceStrip(
  parent: HTMLElement,
  plugin: ThoughtKnotPlugin,
  source: GraphSource,
  from: string,
): HTMLElement {
  const strip = parent.createDiv({ cls: 'thoughtknot-source' });
  // a plug-in's source is named by its word and place, and has nothing in the vault to open
  if (source.kind === 'plugin') {
    strip.createSpan({ text: word('blocks.source-strip-plugin', { name: `${source.scheme ?? ''}:${source.target}` }) });
    return strip;
  }
  strip.createSpan({
    text: word('blocks.source-strip', { kind: source.kind, name: shortName(source) }),
  });
  if (source.kind === 'note') {
    const name = shortName(source);
    const open = strip.createEl('button', {
      text: word('blocks.source-open', { name }),
      attr: { 'aria-label': word('blocks.source-open', { name }), type: 'button' },
    });
    open.addEventListener('click', () => void plugin.app.workspace.openLinkText(source.target, from));
  }
  return strip;
}

/** A sentence saying why nothing is drawn, read out as it appears. */
export function sourceAlert(parent: HTMLElement, text: string): HTMLElement {
  return parent.createDiv({ cls: 'thoughtknot-banner', attr: { role: 'alert' }, text });
}

/**
 * A table with no mapping yet (connector_mapping_written). It shows the sentence saying so and the mapping proposed,
 * in full. A button saves it beside the table. A person applies it; nothing is drawn from the table until then. A file
 * already at that place is opened, never written over. `saved` draws the card again once it is written.
 */
export function mappingProposal(
  parent: HTMLElement,
  plugin: ThoughtKnotPlugin,
  note: string,
  proposal: { place: string; text: string },
  saved?: () => void,
): HTMLElement {
  const box = sourceAlert(parent, note);
  const shown = box.createEl('details');
  shown.createEl('summary', { text: word('blocks.mapping-proposed') });
  shown.createEl('pre', { text: proposal.text });
  const save = box.createEl('button', {
    text: word('blocks.mapping-save', { place: proposal.place }),
    attr: { type: 'button' },
  });
  save.addEventListener('click', () => {
    void (async () => {
      if (await saveMapping(plugin, proposal.place, proposal.text)) saved?.();
      else await plugin.app.workspace.openLinkText(proposal.place, '');
    })();
  });
  return box;
}

/**
 * A .txt place (connector_text_proposed). It shows the sentence saying its words are drawn only as a proposal. Its
 * button opens text to graph on them, for the note at `from`. While AI is off, the button says so.
 */
export function proseAsk(
  parent: HTMLElement,
  plugin: ThoughtKnotPlugin,
  note: string,
  prose: { place: string; text: string },
  from: string,
): HTMLElement {
  const box = sourceAlert(parent, note);
  const ask = box.createEl('button', {
    text: word('blocks.text-propose', { place: prose.place }),
    attr: { type: 'button' },
  });
  ask.addEventListener('click', () => void proseGraph(plugin, from, prose));
  return box;
}

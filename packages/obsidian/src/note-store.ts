// The local store of notes too big to read at once, in Obsidian (editor spec §53, scale_in_parts; way E, step 7). A
// card past the read limits reads its note into the store a part at a time, and is drawn as its overview from there.
// The store is kept in memory. Its rows are also kept in this device's own database, so a note seen before opens
// without a reading. A note gone or moved leaves both, and is read again when next drawn.
import { MeshIndex, keptName, memoryBackend, partsRefusal, storedGraphs } from '@thoughtknot/core';
import { pastPartsHint } from '@thoughtknot/core/display/refusal-banner';
import type { KeptPlace } from '@thoughtknot/core';
import { indexedPlace } from '@thoughtknot/core/display/editor/kept-place';
import type { Refusal } from '@thoughtknot/core';
import { readOnlyHere } from '@thoughtknot/core/display/graph-view/placement';
import { showStoredMassive } from './massive-card';
import type ThoughtKnotPlugin from './main';

/** Each plugin's store, made the first time a card needs it. */
const stores = new WeakMap<ThoughtKnotPlugin, MeshIndex>();

/** The plugin's store, which follows notes as they are moved or deleted. */
function storeOf(plugin: ThoughtKnotPlugin): MeshIndex {
  const kept = stores.get(plugin);
  if (kept) return kept;
  const made = new MeshIndex(memoryBackend());
  // a note gone or moved leaves the store, and its kept rows go too
  const forget = (path: string) => {
    made.remove(path);
    void keptPlace()
      ?.remove(keptName(path))
      .catch(() => undefined);
  };
  plugin.registerEvent(plugin.app.vault.on('rename', (_, old) => forget(old)));
  plugin.registerEvent(plugin.app.vault.on('delete', (f) => forget(f.path)));
  stores.set(plugin, made);
  return made;
}

/** Where the rows of notes read in parts are kept between sessions: this device's own database, never the vault. */
let kept: KeptPlace | undefined | null = null;
const keptPlace = (): KeptPlace | undefined => (kept === null ? (kept = indexedPlace(window)) : kept);

/** A block on its own, written as a note of one block, as the store reads notes. */
const fenced = (source: string): string => `\`\`\`gql\n${source}\n\`\`\`\n`;

/** Where a card's graph is: its note's path and text (none when Obsidian gives no section), its block and graph. */
export interface InParts {
  path: string;
  note: string | undefined;
  source: string;
  graph: string;
}

/**
 * Shows a graph refused as too large to read at once as its overview, at the top of `card`, read in parts into the
 * store. The card's text and why are drawn first, so they show while it is read, and stay if it cannot be. Nothing is
 * shown for any other refusal.
 */
export async function overviewInParts(
  plugin: ThoughtKnotPlugin,
  card: HTMLElement,
  at: InParts,
  why: Refusal,
): Promise<void> {
  const over = 'limit' in why ? why.limit : undefined;
  if (over !== 'text-bytes' && over !== 'text-lines') return;
  const slot = card.createDiv();
  card.prepend(slot);
  // Obsidian does its own work between parts, so it keeps answering
  const pause = () => new Promise<void>((done) => window.setTimeout(done, 0));
  // a block shown on its own is kept apart from its note's other blocks, so they never take each other's place
  const [note, text] = at.note === undefined ? [`${at.path} · ${at.graph}`, fenced(at.source)] : [at.path, at.note];
  const past = partsRefusal(text);
  if (past) return void pastPartsHint(slot, past);
  try {
    const ix = storeOf(plugin);
    const stored = (await storedGraphs(ix, note, text, pause, keptPlace())).get(at.graph);
    // a block shown on its own is not edited here: its note's text was not given
    const editing = at.note === undefined ? null : { ix, path: at.path, note: at.note, graph: at.graph };
    if (stored) showStoredMassive(plugin, slot, stored, editing && { ...editing, readOnly: readOnlyHere(card) });
    else slot.remove();
  } catch (e) {
    slot.remove(); // the text and why are still there
    console.error('ThoughtKnot: a note could not be read in parts', e);
  }
}

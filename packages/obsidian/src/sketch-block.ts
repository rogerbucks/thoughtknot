// Drawings over a graph in Obsidian (editor spec §70), and the other blocks folded away. The drawings block is never
// drawn as a graph: it is folded away, saying how many drawings it holds, and opens to its text. The graph's card draws
// the drawings, and each one made there is written to the note here, against the note as it is when written.
import {
  gqlBlocks,
  namesSharedSchema,
  noteWithProposal,
  readSketch,
  sketchEdit,
  sketchInNote,
  sketchOf,
  sketchProposal,
  styleOf,
  PALETTES,
  word,
} from '@thoughtknot/core';
import type { Sketch, SketchChange } from '@thoughtknot/core';
import { renderCode } from '@thoughtknot/core/display/code';
import type { SketchHost } from '@thoughtknot/core/display/graph-view/sketch-tool';
import { readInHostDirection } from '@thoughtknot/core/display/host';
import type ThoughtKnotPlugin from './main';
import { renderStyleBlock } from './style-block';
import { changeVaultNote, noteText } from './storage/plugin-notes';

/** A block never drawn as a graph, folded: a style block or a drawings block. False for any other. */
export function renderFoldedBlock(el: HTMLElement, source: string, note: string): boolean {
  const styled = styleOf(source),
    sketched = sketchOf(source);
  if (styled) {
    const all = gqlBlocks(note).map((b) => b.text);
    renderStyleBlock(el, source, styled, all.includes(source) ? all : [...all, source]);
  } else if (sketched) renderSketchBlock(el, source, sketched.on);
  return !!(styled || sketched);
}

/** The drawings block, folded: how many it holds, or its problems, and its text inside. */
export function renderSketchBlock(el: HTMLElement, source: string, on: string): void {
  const { sketch, problems } = readSketch(source);
  const fold = readInHostDirection(el.createEl('details', { cls: 'thoughtknot-style' }));
  fold.createEl('summary', {
    text: problems.length
      ? word('sketch.summary-problems', { graph: on, count: problems.length })
      : word('sketch.summary', { graph: on, count: sketch.items.length }),
  });
  renderCode(fold, source);
}

/** The drawings over `graph` in the note at `path`, as `note` holds them now, and how to change them. */
export function sketchingFor(plugin: ThoughtKnotPlugin, path: string, graph: string, note?: string): SketchHost {
  return {
    sketch: note === undefined ? null : (sketchInNote(note, graph)?.sketch ?? null),
    palette: PALETTES.obsidian,
    write: async (change: SketchChange) => {
      let out: { sketch: Sketch } | { refused: string } = { refused: word('blocks.note-gone') };
      await changeVaultNote(plugin.app, path, (now) => {
        const r = sketchEdit(now, graph, change);
        if ('refused' in r) {
          out = r;
          return now;
        }
        out = { sketch: sketchInNote(r.note, graph)?.sketch ?? { name: '', on: graph, items: [] } };
        return r.note;
      });
      return out;
    },
    propose: (marks) => proposeSketch(plugin, path, graph, marks),
  };
}

/** The marks of the card's drawing, for where each drawing lies. */
type Marks = Parameters<NonNullable<SketchHost['propose']>>[0];

/**
 * The drawings over `graph` offered as things and links (sketch_to_graph). It is a proposal written beside the graph,
 * which a person accepts or rejects there as any other. Resolves to what came of it, in words.
 */
async function proposeSketch(plugin: ThoughtKnotPlugin, path: string, graph: string, marks: Marks): Promise<string> {
  let said = word('blocks.note-gone');
  const text = (await noteText(plugin.app, path, { shown: true })) ?? '';
  const shared = gqlBlocks(text).some((b) => namesSharedSchema(b.text)) ? await plugin.sharedSchemas() : [];
  await changeVaultNote(plugin.app, path, (now) => {
    const on = sketchInNote(now, graph);
    const r = on ? sketchProposal(now, on.sketch, marks, { at: new Date().toISOString(), shared }) : null;
    const written = r && 'proposal' in r ? noteWithProposal(now, r.proposal) : null;
    if (typeof written === 'string') said = word('sketch.proposed');
    else if (r && 'nothing' in r) said = r.nothing;
    else if (r || written) said = word('sketch.refused', { why: (written ?? (r as { refused: string })).refused });
    return typeof written === 'string' ? written : now;
  });
  return said;
}

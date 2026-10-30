// The image line of a reader picture, hidden where the plugin draws its block (editor spec §62,
// picture_hidden_when_drawn). The live graph then shows once. In reading view the picture is hidden in the section
// straight after the block. In Live Preview the line is marked, and the stylesheet hides the picture in it. A picture
// line after a block the plugin does not draw, or one a person wrote elsewhere, is left as it is.
import { StateField } from '@codemirror/state';
import type { EditorState, Extension, Range } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import type { MarkdownPostProcessorContext } from 'obsidian';
import { pictureBlocks, pictureLines, pictureLinkOf } from '@thoughtknot/core';
import type ThoughtKnotPlugin from '../main';

/** The class that hides a picture the plugin draws live. */
export const HIDDEN_PICTURE = 'thoughtknot-picture-hidden';

/** The 0-based lines of `text` that are picture lines after a block the plugin draws. */
export function hiddenLines(text: string): number[] {
  const drawn = new Set(pictureBlocks(text).map((b) => b.block));
  return pictureLines(text)
    .filter((p) => drawn.has(p.block))
    .map((p) => p.line);
}

/** The file name a link ends in, its escapes undone. */
const fileOf = (link: string) =>
  decodeURIComponent(link.split(/[?#]/)[0] ?? '')
    .split('/')
    .pop() ?? '';

/** Hides, in reading view, each picture in the section straight after a block the plugin draws. */
export function hideInReadingView(plugin: ThoughtKnotPlugin): void {
  plugin.registerMarkdownPostProcessor((el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
    const info = ctx.getSectionInfo(el);
    if (!info || !hiddenLines(info.text).includes(info.lineStart)) return;
    const line = info.text.split('\n')[info.lineStart] ?? '';
    const name = fileOf(pictureLinkOf(line.replace(/\r$/, '')) ?? '');
    for (const pic of Array.from(el.querySelectorAll<HTMLElement>('img, .internal-embed'))) {
      const src = pic.getAttribute('src') ?? '';
      if (name && fileOf(src.replace(/^app:\/\/[^/]*\//, '')) === name) pic.addClass(HIDDEN_PICTURE);
    }
  });
}

/** The line marks of a document: each picture line after a drawn block. */
function marks(state: EditorState): DecorationSet {
  const doc = state.doc;
  const out: Range<Decoration>[] = hiddenLines(doc.toString()).map((n) =>
    Decoration.line({ class: HIDDEN_PICTURE }).range(doc.line(n + 1).from),
  );
  return Decoration.set(out, true);
}

/** Live Preview's marks on the picture lines, kept as the note changes. */
export function hideInLivePreview(): Extension {
  return StateField.define<DecorationSet>({
    create: marks,
    update: (was, tr) => (tr.docChanged ? marks(tr.state) : was),
    provide: (f) => EditorView.decorations.from(f),
  });
}

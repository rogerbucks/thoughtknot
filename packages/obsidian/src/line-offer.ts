// The offer beside a loose line, in the note's own editor (editor spec §47, line_to_gql_offer). A loose line is one in
// a graph block that the library cannot read. In Source mode, where the block's lines are shown as typed, the line
// with the caret gets a small button at its end:
// - Convert to GQL, when code converts it (line_to_gql_code);
// - Convert with AI, when code cannot and AI is on (line_to_gql_ai). It opens the send dialog on the line, so the
//   send keeps the rules of §19.
// Either way the GQL it would become is shown first, and nothing changes until Accept is pressed. In Live Preview the
// block is a card, and its text field offers the same conversion as a fix of the line's problem (help.ts).
import { Modal, Notice, Setting, editorInfoField, editorLivePreviewField } from 'obsidian';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { StateField, Transaction } from '@codemirror/state';
import type { EditorState } from '@codemirror/state';
import { aiOnFor, convertLine, lineOffer, word } from '@thoughtknot/core';
import type ThoughtKnotPlugin from './main';
import { lineWithAi } from './ai/ai';

/** The review before a line is changed: the line as typed, the GQL it becomes, and Accept. */
export class LineReview extends Modal {
  constructor(
    plugin: ThoughtKnotPlugin,
    private readonly typed: string,
    private readonly gql: string,
    private readonly accept: () => void | Promise<void>,
  ) {
    super(plugin.app);
  }

  override onOpen(): void {
    this.setTitle(word('line-gql.review'));
    const el = this.contentEl;
    el.createEl('p', { text: word('line-gql.review-was') });
    el.createEl('pre', { cls: 'thoughtknot-line-typed', text: this.typed });
    el.createEl('p', { text: word('line-gql.review-becomes') });
    el.createEl('pre', { cls: 'thoughtknot-line-gql', text: this.gql });
    new Setting(el)
      .addButton((b) =>
        b
          .setButtonText(word('line-gql.accept'))
          .setCta()
          .onClick(async () => {
            await this.accept();
            this.close();
          }),
      )
      .addButton((b) => b.setButtonText(word('ai.cancel')).onClick(() => this.close()));
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}

/**
 * Converts 0-based `line` of the editor's note by code: shows the GQL, and on Accept puts it in place of the line as
 * one step one undo takes back. Nothing is written if the note changed meanwhile.
 */
export function convertInEditor(plugin: ThoughtKnotPlugin, view: EditorView, line: number): void {
  const note = view.state.doc.toString();
  const out = convertLine(note, line);
  if ('refused' in out) return void new Notice(out.refused);
  const typed = view.state.doc.line(line + 1).text;
  new LineReview(plugin, typed.trim(), out.gql, () => {
    if (view.state.doc.toString() !== note) return void new Notice(word('line-gql.changed'));
    const added = out.note.split('\n').length - note.split('\n').length;
    const insert = out.note
      .split('\n')
      .slice(line, line + added + 1)
      .join('\n');
    const at = view.state.doc.line(line + 1);
    view.dispatch({
      changes: { from: at.from, to: at.to, insert },
      annotations: Transaction.userEvent.of('input.convert'),
    });
  }).open();
}

/** The button at the end of a loose line. */
class OfferButton extends WidgetType {
  constructor(
    readonly by: 'code' | 'ai',
    readonly line: number,
    private readonly act: (view: EditorView, line: number, by: 'code' | 'ai') => void,
  ) {
    super();
  }

  override eq(other: OfferButton): boolean {
    return other.by === this.by && other.line === this.line;
  }

  override toDOM(view: EditorView): HTMLElement {
    const said = word(this.by === 'code' ? 'line-gql.offer' : 'line-gql.offer-ai');
    const tip = word('line-gql.offer-tip');
    const b = createDiv().createEl('button', { cls: 'thoughtknot-line-offer', text: said });
    b.remove();
    b.setAttribute('title', tip);
    b.setAttribute('aria-label', `${said}. ${tip}`);
    // pressing it keeps the caret where it is, so the offer stays on the line it was for
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => {
      e.preventDefault();
      this.act(view, this.line, this.by);
    });
    return b;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

/** The offer for the caret's line: a button at its end, or none. Live Preview draws blocks as cards: none there. */
function offersOf(
  state: EditorState,
  aiOn: () => boolean,
  act: (view: EditorView, line: number, by: 'code' | 'ai') => void,
): DecorationSet {
  if (state.field(editorLivePreviewField, false)) return Decoration.none;
  const at = state.doc.lineAt(state.selection.main.head);
  const offer = lineOffer(state.doc.toString(), at.number - 1, aiOn());
  if (!offer || 'refused' in offer) return Decoration.none;
  const widget = new OfferButton(offer.by, at.number - 1, act);
  return Decoration.set([Decoration.widget({ widget, side: 1 }).range(at.to)]);
}

/** The 1-based line the caret is on. */
const caretLine = (s: EditorState) => s.doc.lineAt(s.selection.main.head).number;

/** Convert with AI: the send dialog on the line, the AI command's own, so the send keeps the rules of §19. */
function askAi(plugin: ThoughtKnotPlugin, view: EditorView, line: number): void {
  const path = view.state.field(editorInfoField, false)?.file?.path;
  if (path) void lineWithAi(plugin, path, view.state.doc.toString(), line);
}

/**
 * The editor extension that offers to convert a loose line. The offer is worked out again only when the text changes
 * or the caret moves to another line.
 */
export function lineOffers(plugin: ThoughtKnotPlugin) {
  const act = (view: EditorView, line: number, by: 'code' | 'ai') =>
    by === 'code' ? convertInEditor(plugin, view, line) : askAi(plugin, view, line);
  const aiOn = () => aiOnFor(plugin.settings);
  return StateField.define<DecorationSet>({
    create: (s) => offersOf(s, aiOn, act),
    update: (deco, tr) =>
      tr.docChanged || caretLine(tr.startState) !== caretLine(tr.state) ? offersOf(tr.state, aiOn, act) : deco,
    provide: (f) => EditorView.decorations.from(f),
  });
}

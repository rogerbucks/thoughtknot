// The board as the main screen in Obsidian (editor spec §45, board_main_screen). A note with graphs opens with its board
// beside it, in a view of the plugin's own. It shows the note's board in front, under the list of its boards. A note
// with no board shows a starter board with a view of each graph, written to the note only once it is changed.
// Until the person first chooses, one line says what changed,
// with a way back: the note alone, as before. The command Open the note's board brings it back. The choice is kept
// in this vault on this device.
import { ItemView, TFile } from 'obsidian';
import type { ViewStateResult, WorkspaceLeaf } from 'obsidian';
import { arrangerOf, gqlBlocks, openingBoard, PALETTES, viewerOf, withStarter, word } from '@thoughtknot/core';
import {
  boardFromGraph,
  draftFor,
  proposeBoard,
  showBoardDraft,
  withBoardKept,
} from '@thoughtknot/core/display/board/board-draft';
import {
  boardInFront,
  boardListChanged,
  boardNames,
  boardTrail,
  enterBoard,
  glideIn,
  leaveBoard,
  putInFront,
  showBoardList,
} from '@thoughtknot/core/display/board/board-list';
import { boardEditInNote, boardOf, showBoard } from '@thoughtknot/core/display/board/board-view';
import type ThoughtKnotPlugin from './main';
import { boardAskFor } from './ai/board-make';
import type { HostCommand } from './host-commands';
import { changeVaultNote, noteText } from './storage/plugin-notes';

/** The board pane's view type. */
export const BOARD_PANE = 'thoughtknot-board';
/** Where the choice of what comes first is kept, in this vault on this device. */
const FIRST_KEY = 'thoughtknot-board-first';

/** The person's choice: 'board' or 'note', or null before they first chose. */
function chosen(plugin: ThoughtKnotPlugin): string | null {
  const v: unknown = plugin.app.loadLocalStorage(FIRST_KEY);
  return typeof v === 'string' ? v : null;
}

/** Keeps the person's choice of what comes first. */
function choose(plugin: ThoughtKnotPlugin, first: 'board' | 'note'): void {
  plugin.app.saveLocalStorage(FIRST_KEY, first);
}

/** The boards a note opens on: those written, else its starter board alone, else an empty one (ES§76). */
function boardsIn(note: string): { name: string; text: string; starter: boolean }[] {
  const written = gqlBlocks(note).flatMap((b) => {
    const name = boardOf(b.text)?.name;
    return name === undefined ? [] : [{ name, text: b.text, starter: false }];
  });
  if (written.length) return written;
  const s = openingBoard(note, (t) => !!boardOf(t));
  return s ? [s] : [];
}

/** The board pane: the board of one note, drawn again whenever the note changes. */
export class BoardPane extends ItemView {
  path = '';
  private readonly plugin: ThoughtKnotPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: ThoughtKnotPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return BOARD_PANE;
  }
  getDisplayText(): string {
    return word('board.pane-title');
  }
  override getIcon(): string {
    return 'layout-dashboard';
  }
  override getState(): Record<string, unknown> {
    return { path: this.path };
  }

  override async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const path = (state as { path?: unknown }).path;
    if (typeof path === 'string' && path !== this.path) {
      this.path = path;
      await this.draw();
    }
    await super.setState(state, result);
  }

  override async onOpen(): Promise<void> {
    this.registerEvent(
      this.app.vault.on('modify', (f) => {
        if (f instanceof TFile && f.path === this.path) void this.draw();
      }),
    );
    await Promise.resolve();
  }

  /** The board proposed for the note, shown in place of its board in front; kept, it is written to the note. */
  private proposed(root: HTMLElement, draft: NonNullable<ReturnType<typeof draftFor>>, path: string): void {
    const app = this.app;
    showBoardDraft(root, draft, {
      key: path,
      palette: PALETTES.obsidian,
      views: viewerOf(async () => (await noteText(app, path)) ?? '', PALETTES.obsidian),
      keep: async (d) => {
        await changeVaultNote(app, path, (now) => {
          const kept = withBoardKept(now, d);
          putInFront(path, kept.name);
          return kept.note;
        });
        return null;
      },
      done: () => void this.draw(),
    });
  }

  /** The note's board drawn afresh, with the line about the change until the person first chose. */
  async draw(): Promise<void> {
    const path = this.path;
    const note = (await noteText(this.app, path)) ?? '';
    if (path !== this.path) return;
    const root = this.contentEl;
    root.empty();
    root.addClass('thoughtknot', 'thoughtknot-board-pane');
    if (chosen(this.plugin) === null) {
      const line = root.createEl('p', { cls: 'thoughtknot-board-first', text: `${word('page.board-first')} ` });
      const back = line.createEl('button', { text: word('board.pane-note-alone'), attr: { type: 'button' } });
      back.addEventListener('click', () => {
        choose(this.plugin, 'note');
        this.leaf.detach();
      });
    }
    const boards = boardsIn(note);
    const names = boards.map((b) => b.name);
    const board = boards.find((b) => b.name === boardInFront(path, names));
    if (!board) {
      root.createEl('p', { cls: 'thoughtknot-board-pane-empty', text: word('board.pane-empty') });
      return;
    }
    const app = this.app;
    // the note as a change is made to: with its starter board written first, when that is the board shown
    const base = (now: string) => (board.starter && !boardNames(now).length ? withStarter(now, board.text) : now);
    const on = boardOf(board.text)?.on ?? null;
    showBoardList(root, {
      key: path,
      names,
      current: board.name,
      open: () => void this.draw(),
      propose: () => {
        const d = on ? boardFromGraph(note, on) : { refused: word('board.view.no-graph') };
        if ('refused' in d) return d.refused;
        proposeBoard(path, d);
        void this.draw();
        return null;
      },
      askAi: boardAskFor(this.plugin, path, on, (d) => {
        proposeBoard(path, d);
        void this.draw();
      }),
      change: async (ask) => {
        let refused: string | null = word('blocks.note-gone');
        await changeVaultNote(app, path, (now) => {
          const r = boardListChanged(base(now), board.name, ask);
          refused = 'refused' in r ? r.refused : null;
          if ('refused' in r) return now;
          putInFront(path, r.name);
          return r.note;
        });
        return refused;
      },
    });
    // a board proposed is shown in place of the board in front, until it is kept or dropped (board_proposed)
    const draft = draftFor(path);
    if (draft) return this.proposed(root, draft, path);
    const holder = root.createDiv();
    glideIn(holder, path);
    showBoard(holder, board.text, {
      palette: PALETTES.obsidian,
      key: `${path}\n${board.name}`,
      write: async (change) => {
        let out: { text: string } | { refused: string } = { refused: word('blocks.note-gone') };
        await changeVaultNote(app, path, (now) => {
          const r = boardEditInNote(base(now), board.name, change);
          out = 'refused' in r ? r : { text: r.text };
          return 'refused' in r ? now : r.note;
        });
        return out;
      },
      arrange: board.starter ? undefined : arrangerOf(async () => (await noteText(app, path)) ?? '', board.name),
      views: viewerOf(async () => (await noteText(app, path)) ?? '', PALETTES.obsidian),
      // zooming in on a view of a board goes into it, and zooming out comes back (board_nested)
      nest: {
        depth: boardTrail(path).length,
        text: (inner) => boards.find((b) => b.name === inner)?.text,
        keyOf: (inner) => `${path}\n${inner}`,
        enter: (inner) => {
          enterBoard(path, board.name, inner);
          void this.draw();
        },
        leave: () => {
          leaveBoard(path);
          void this.draw();
        },
      },
    });
  }
}

/** Opens the board pane beside the note at `path`, or shows that note in the one open; the note keeps the focus. */
export async function openBoard(plugin: ThoughtKnotPlugin, path: string): Promise<void> {
  const ws = plugin.app.workspace;
  const leaf = ws.getLeavesOfType(BOARD_PANE)[0] ?? ws.getLeaf('split', 'vertical');
  await leaf.setViewState({ type: BOARD_PANE, state: { path }, active: false });
}

/** Whether a note has a board to open on: its own, a starter board, or an empty one (ES§76, board_first_new_note). */
function hasBoard(note: string): boolean {
  return boardsIn(note).length > 0;
}

/** Opens each note on its board, beside it, unless the person chose the note alone. */
export function followNotes(plugin: ThoughtKnotPlugin): void {
  plugin.registerEvent(
    plugin.app.workspace.on('file-open', (file) => {
      if (!(file instanceof TFile) || file.extension !== 'md' || chosen(plugin) === 'note') return;
      void noteText(plugin.app, file.path).then((note) => {
        if (note !== null && hasBoard(note)) void openBoard(plugin, file.path);
      });
    }),
  );
}

/** The command Open the note's board: the board first again, for the note in front. */
export function boardCommand(plugin: ThoughtKnotPlugin): HostCommand {
  return {
    id: 'open-board',
    title: word('board.pane-open'),
    run: async () => {
      choose(plugin, 'board');
      const file = plugin.app.workspace.getActiveFile();
      if (file) await openBoard(plugin, file.path);
    },
  };
}

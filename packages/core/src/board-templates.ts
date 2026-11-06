// Board templates (editor spec §45, board_templates). A mind map, an affinity map, a two by two matrix, a flow and a
// retrospective each start a board. Each is itself a note with a board block in it. So it opens, edits and saves like
// any board. The person's own copy is plain text. Pure and host-free.
import type { Board, BoardItem, BoardKind } from './board.ts';
import { writeBoard } from './board.ts';
import { word } from './words.ts';

/** The templates a board can start from. */
export const TEMPLATES = ['mindmap', 'affinity', 'matrix', 'flow', 'retro'] as const;

/** One template. */
export type TemplateId = (typeof TEMPLATES)[number];

/** The name of a template, in words. */
export function templateName(id: TemplateId): string {
  switch (id) {
    case 'mindmap':
      return word('board.tpl.mindmap');
    case 'affinity':
      return word('board.tpl.affinity');
    case 'matrix':
      return word('board.tpl.matrix');
    case 'flow':
      return word('board.tpl.flow');
    case 'retro':
      return word('board.tpl.retro');
  }
}

/** A board of items placed on a grid, joined as given. */
const made = (name: string, items: BoardItem[], links: [string, string][]): Board => ({
  name,
  on: null,
  items,
  connectors: links.map(([from, to]) => ({ from, to })),
});

/** An item with its place, size and words. */
const at = (id: string, kind: BoardKind, x: number, y: number, text: string, w?: number, h?: number): BoardItem => {
  const item: BoardItem = { id, kind, x, y, text, more: {} };
  if (w !== undefined) item.w = w;
  if (h !== undefined) item.h = h;
  return item;
};

/** The frames of a template, one in a row, each with a sticky note inside it ready to be written over. */
function columns(name: string, titles: string[], note: string): Board {
  const items: BoardItem[] = [];
  titles.forEach((title, i) => {
    items.push(at(`frame${i + 1}`, 'Frame', i * 460, 0, title, 420, 400));
    items.push(at(`sticky${i + 1}`, 'Sticky', i * 460 + 30, 70, note));
  });
  return made(name, items, []);
}

/** The board a template starts, named `name`. */
export function templateBoard(id: TemplateId, name: string = id): Board {
  switch (id) {
    case 'mindmap': {
      const branch = word('board.tpl.branch');
      const at4 = [
        [-360, -240],
        [360, -240],
        [-360, 240],
        [360, 240],
      ];
      const items = [
        at('centre', 'Shape', 0, 0, word('board.tpl.centre'), 200, 100),
        ...at4.map(([x, y], i) => at(`branch${i + 1}`, 'Sticky', x as number, y as number, branch)),
      ];
      return made(
        name,
        items,
        [1, 2, 3, 4].map((i) => ['centre', `branch${i}`]),
      );
    }
    case 'affinity': {
      const items = [1, 2, 3, 4, 5, 6].map((i) =>
        at(`sticky${i}`, 'Sticky', (i - 1) * 190, 0, word('board.tpl.idea'), 170, 120),
      );
      const group = word('board.tpl.group');
      [0, 1, 2].forEach((i) => items.push(at(`frame${i + 1}`, 'Frame', i * 380, 200, group, 340, 300)));
      return made(name, items, []);
    }
    case 'matrix': {
      const quads = [
        ['board.tpl.big-bets', 0, 0],
        ['board.tpl.quick-wins', 1, 0],
        ['board.tpl.avoid', 0, 1],
        ['board.tpl.fill-ins', 1, 1],
      ] as const;
      const items = quads.map(([key, c, r], i) => at(`frame${i + 1}`, 'Frame', c * 420, r * 320, word(key), 400, 300));
      items.push(at('impact', 'Text', 0, -60, word('board.tpl.impact'), 400, 40));
      items.push(at('effort', 'Text', 840, 0, word('board.tpl.effort'), 200, 40));
      return made(name, items, []);
    }
    case 'flow': {
      const items = [
        at('start', 'Shape', 0, 0, word('board.tpl.start'), 140, 80),
        at('step', 'Shape', 220, 0, word('board.tpl.step'), 140, 80),
        at('decision', 'Shape', 440, 0, word('board.tpl.decision'), 160, 80),
        at('end', 'Shape', 680, 0, word('board.tpl.end'), 140, 80),
      ];
      return made(name, items, [
        ['start', 'step'],
        ['step', 'decision'],
        ['decision', 'end'],
      ]);
    }
    case 'retro':
      return columns(
        name,
        [word('board.tpl.well'), word('board.tpl.improve'), word('board.tpl.actions')],
        word('board.tpl.idea'),
      );
  }
}

/** A new note for a template: its name as the heading, then the board block, in the note's own text. */
export function templateNote(id: TemplateId, name: string = id): string {
  return `# ${templateName(id)}\n\n\`\`\`gql\n${writeBoard(templateBoard(id, name))}\n\`\`\`\n`;
}

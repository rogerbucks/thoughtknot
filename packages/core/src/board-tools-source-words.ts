// The words of a board's tool rail, in UK English (editor spec §45, board_tools). display-source-words.ts keeps them
// with the rest.

/** The words of the tool rail, by key, in UK English. */
export const BOARD_TOOLS_SOURCE_WORDS = {
  'board.tools': 'Board tools',
  'board.tools.show': 'Tool in use: {tool}. Show the tools',
  'board.tools.hide': 'Tool in use: {tool}. Hide the tools',
  'board.tool.choose': 'Choose',
  'board.tool.choose.tip': 'Choose: press an item to choose it, drag it to move it',
  'board.tool.hand': 'Pan',
  'board.tool.hand.tip': 'Pan: drag anywhere to move the view; nothing on the board moves',
  'board.tool.sticky': 'Sticky note',
  'board.tool.sticky.tip': 'Sticky note: press where it goes, then type',
  'board.tool.text': 'Text',
  'board.tool.text.tip': 'Text: press where it goes, then type',
  'board.tool.shape': 'Shape',
  'board.tool.shape.tip': 'Shape: press where it goes',
  'board.tool.frame': 'Frame',
  'board.tool.frame.tip': 'Frame: press where it goes; it sits behind the items in it',
  'board.tool.connect': 'Connector',
  'board.tool.connect.tip': 'Connector: press one item, then another, to join them. Esc stops',
  'board.tool.picked': '{tool} tool.',
  'board.tool.from': 'Joining from {id}: press the item to join it to.',
  'board.tool.stopped': 'Stopped joining.',
} as const;

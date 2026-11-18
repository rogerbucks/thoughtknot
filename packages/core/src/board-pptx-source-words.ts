// The words of reading a PowerPoint presentation as a board, in UK English (editor spec ES§45, board_exchange). They
// say why a presentation was not read, and what was left out when it was. source-words.ts keeps these with every
// other word.

/** The words of reading a presentation, by key, in UK English. */
export const BOARD_PPTX_SOURCE_WORDS = {
  'reading.pptx.not-pptx': 'This file is not a PowerPoint presentation (.pptx), so it was not read.',
  'reading.pptx.old-or-encrypted':
    'This is an old PowerPoint file (.ppt) or one with a password. Save it as a .pptx with no password in PowerPoint, then import that.',
  'reading.pptx.too-large': 'This presentation is larger than is read safely, so it was not read.',
  'reading.pptx.too-many-slides': 'This presentation holds more than {most} slides, so it was not read.',
  'reading.pptx.text-too-long': 'A text in this presentation holds more than {most} characters, so it was not read.',
  'reading.pptx.damaged': 'This presentation is damaged, so it was not read.',
  'reading.pptx.empty': 'This presentation holds no slides, so there is nothing to import.',
  'reading.pptx.left': 'Left out: {things}.',
  'reading.pptx.notes-title': 'Speaker notes, slide {n}',
  'reading.pptx.left.charts': { one: '{count} chart', other: '{count} charts' },
  'reading.pptx.left.smartart': { one: '{count} SmartArt diagram', other: '{count} SmartArt diagrams' },
  'reading.pptx.left.objects': { one: '{count} embedded object', other: '{count} embedded objects' },
  'reading.pptx.left.media': { one: '{count} video or sound clip', other: '{count} video or sound clips' },
  'reading.pptx.left.lines': { one: '{count} line or arrow', other: '{count} lines and arrows' },
  'reading.pptx.left.pictures': {
    one: '{count} picture that is not a PNG, JPEG, GIF or WebP, or is too large',
    other: '{count} pictures that are not PNG, JPEG, GIF or WebP, or are too large',
  },
  'reading.pptx.left.unsaved': {
    one: '{count} picture that could not be saved',
    other: '{count} pictures that could not be saved',
  },
  'reading.pptx.look':
    'Colours, fonts, backgrounds, animations, transitions, picture crops and turns were not kept: the words, pictures and places were.',
  'page.import-document.done':
    'Added the text of {file} to the note. It is text only: pictures and layout are left out.',
  'page.import-document.copied': 'Text copied from {file}.',
  'page.import-deck.done': 'Added the board {graph}, a frame to each slide, from {file}.',
} as const;

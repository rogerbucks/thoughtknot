// The settings page's words, in UK English (editor spec §42, words_catalogue). Each option of settings.ts is here by
// its key, with its name, its sentence and each choice by its value. The settings page says them from here
// (settings-words.ts), and settings-words.test.js holds them to the options. source-words.ts keeps them with every
// other word.

/** Each settings option's words, by key, in UK English. */
export const SETTINGS_SOURCE_WORDS = {
  'settings.strictness.name': 'Strictness',
  'settings.strictness.sentence': 'How strictly a graph is read against standard GQL.',
  'settings.strictness.standard': 'Standard',
  'settings.strictness.standard.sentence': 'Every departure from standard GQL is an error.',
  'settings.strictness.forgiving': 'Forgiving',
  'settings.strictness.forgiving.sentence': 'A slip is read as meant, reported as a warning, and offered its fix.',
  'settings.strictness.simplified': 'Simplified',
  'settings.strictness.simplified.sentence': 'The departures chosen below are allowed as written.',
  'settings.allowed.name': 'Allowed in Simplified',
  'settings.allowed.sentence':
    'The ways Simplified lets a graph leave standard GQL as written. An engine or an export still gets standard GQL.',
  'settings.allowed.missing-comma': 'A missing comma',
  'settings.allowed.missing-comma.sentence':
    'A pattern may end its line without the comma standard GQL needs before the next one.',
  'settings.allowed.trailing-comma': 'A comma with nothing after it',
  'settings.allowed.trailing-comma.sentence':
    'The last pattern of a block may end with a comma, as while the next one is being typed.',
  'settings.allowed.bare-type': 'A link type without its colon',
  'settings.allowed.bare-type.sentence':
    'A link may name its type without the colon, such as [KNOWS], when the graph has one type of that name.',
  'settings.ai-use.name': 'Use AI models',
  'settings.ai-use.sentence':
    'Whether the editor may send anything to an AI model. Even when on, nothing is sent until you send it. It goes only to a model set up below, once you have seen exactly what it will send.',
  'settings.ai-use.off': 'Off: nothing is ever sent',
  'settings.ai-use.on': 'On: send only when I say',
  'settings.classifications.name': 'Classifications',
  'settings.classifications.sentence': 'The classifications a note may carry, lowest first, one per line.',
  'settings.ai-unlabelled.name': 'Unlabelled notes count as',
  'settings.ai-unlabelled.sentence':
    'The classification a note with no classification counts as when it would be sent to an AI model. The most sensitive until you choose: nothing at it is ever sent, so an unlabelled note goes to no model.',
  'settings.ai-repo-unlabelled.name': 'Unlabelled repository files count as',
  'settings.ai-repo-unlabelled.sentence':
    'The classification a file of a note’s repository with no classification counts as, when you review its change with Claude. The lowest until you choose a stricter one.',
  'settings.ai-models.name': 'AI models',
  'settings.ai-models.sentence':
    'Each AI model the editor may ask, and its purpose. Each has a ceiling: the highest classification of note it may be sent, or a row of the destination matrix.',
  'settings.ai-matrix-note.name': 'Destination matrix note',
  'settings.ai-matrix-note.sentence':
    'The note that holds the vault’s destination matrix, by its path. A model can then take a row of it in place of a ceiling.',
  'settings.ai-class-map.name': 'Matrix classes',
  'settings.ai-class-map.sentence':
    'Classes of the matrix that go by another name than a classification, one per line as matrix name: classification. A class matched by neither is flagged and never sent.',
  'settings.section.language': 'Language',
  'settings.language.name': 'Language',
  'settings.language.sentence': 'The language the editor speaks: the same as the app it runs in, or one chosen here.',
  'settings.language.host': 'Same as the app',
  'settings.language.en-gb': 'English (UK)',
  'settings.indent.name': 'Indent',
  'settings.indent.sentence': 'How the editor indents the later lines of a thing it writes.',
  'settings.indent.two': 'Two spaces',
  'settings.indent.four': 'Four spaces',
  'settings.indent.tab': 'A tab',
  'settings.view-preset.name': 'View preset',
  'settings.view-preset.sentence':
    'A way of seeing graphs, named by what it helps with. It sets the Drawing settings below, each still yours to change.',
  'settings.view-preset.default': 'Default',
  'settings.view-preset.default.sentence': 'A drawing in rows by its flow, with an outline beside it.',
  'settings.view-preset.focus': 'Focus support',
  'settings.view-preset.focus.sentence':
    'The selected thing and its near links stand out; the rest is faded, not hidden.',
  'settings.view-preset.calm': 'Calm and predictable',
  'settings.view-preset.calm.sentence': 'Nothing moves by itself, and the drawing is laid out again only when you ask.',
  'settings.view-preset.detail': 'Detail first',
  'settings.view-preset.detail.sentence': 'Every label and property shown, in an order you can scan.',
  'settings.view-preset.big-picture': 'Big picture first',
  'settings.view-preset.big-picture.sentence': 'Groups first, folded into one box each, opened as you go in.',
  'settings.view-preset.reading': 'Reading support',
  'settings.view-preset.reading.sentence':
    'Short labels with wider spacing, the full words when you select one, and the outline one key away.',
  'settings.view-preset.preview': 'Before you use {name}',
  'settings.view-preset.line': '{name}: {from} becomes {to}.',
  'settings.view-preset.nothing': 'No other setting changes.',
  'settings.view-preset.use': 'Use this preset',
  'settings.view-preset.keep': 'Keep as it was',
  'settings.view-preset.undo': 'Undo the preset change',
  'settings.view-preset.undo.sentence': 'Puts back {name} and every setting the change turned.',
  'settings.view-preset.own': 'Your own',
  'settings.view-preset.own.sentence': 'The preset you brought in from a file, below.',
  'settings.own-preset.name': 'Your own view preset',
  'settings.own-preset.sentence':
    'Paste the text of a view preset file to use it as Your own. It is checked first. Export writes the preset in use, as you have set it, to a file.',
  'settings.own-preset.taken': 'Read in: {name}. Pick Your own above to use it.',
  'settings.own-preset.problem': 'Not used: {why}',
  'settings.own-preset.export': 'Export the preset in use',
  'settings.own-preset.export.sentence': 'Writes it to one small file, to bring into ThoughtKnot on another device.',
  'settings.own-preset.exported': 'View preset written to {path}',
  'view-preset.imported': 'Imported preset',
  'view-preset.not-json': 'This file is not a view preset: it is not JSON.',
  'view-preset.not-preset': 'This file is not a view preset: it does not say {format}.',
  'view-preset.less-motion': 'Your device asks for less motion, so nothing moves.',
  'view-preset.more-contrast': 'Your device asks for more contrast, so colours are stronger.',
  'settings.direction.name': 'Direction',
  'settings.direction.sentence':
    'Which way a drawing runs: the best fit, or always one of the directions the locked style allows.',
  'settings.direction.best': 'Best fit',
  'settings.direction.lr': 'Left to right',
  'settings.direction.tb': 'Top to bottom',
  'settings.focus-depth.name': 'Focus reaches',
  'settings.focus-depth.sentence':
    'How far focus reaches from a selected thing: its own links, or those of the things at their other ends too.',
  'settings.focus-depth.one': 'One step',
  'settings.focus-depth.two': 'Two steps',
  'settings.labels-by-zoom.name': 'Hide labels too small to read',
  'settings.labels-by-zoom.sentence':
    'Whether a link’s label shows only when zoomed in far enough to read it; a graph’s View menu can change it.',
  'settings.labels-by-zoom.on': 'On',
  'settings.labels-by-zoom.off': 'Off',
  'settings.fold-hubs.name': 'Fold busy things',
  'settings.fold-hubs.sentence':
    'Whether a thing with many links draws them folded into one stub marked with their count; a graph’s View menu can change it.',
  'settings.fold-hubs.on': 'On',
  'settings.fold-hubs.off': 'Off',
  'settings.fold-groups.name': 'Fold groups',
  'settings.fold-groups.sentence':
    'Whether each group draws as one box showing how many things it holds; a graph’s View menu can change it.',
  'settings.fold-groups.on': 'On',
  'settings.fold-groups.off': 'Off',
  'settings.merge-links.name': 'Bundle links between groups',
  'settings.merge-links.sentence':
    'Whether links running between the same two groups share one trunk; a graph’s View menu can change it.',
  'settings.merge-links.on': 'On',
  'settings.merge-links.off': 'Off',
  'settings.own-layout.name': 'Lay out with ThoughtKnot',
  'settings.own-layout.sentence':
    'Whether ThoughtKnot lays graphs out itself, the default. Off lays them out with Graphviz, as before.',
  'settings.own-layout.on': 'On',
  'settings.own-layout.off': 'Off',
  'settings.kind-lanes.name': 'Lanes by kind',
  'settings.kind-lanes.sentence':
    'Whether kinds that link in order each get a lane, or a plane in space; a graph’s View menu can change it.',
  'settings.kind-lanes.on': 'On',
  'settings.kind-lanes.off': 'Off',
  'settings.note-callouts.name': 'Draw notes as callouts',
  'settings.note-callouts.sentence':
    'Whether each note written above a thing or link is drawn on the drawing as a callout, joined to its thing by a dashed line. Off unless you turn it on; a note always shows in its thing’s details.',
  'settings.note-callouts.on': 'On',
  'settings.note-callouts.off': 'Off',
  'settings.mini-map.name': 'Mini-map',
  'settings.mini-map.sentence':
    'A small copy of the whole drawing with the part in view outlined; tap or drag it to move the view. Shown never, only when the drawing is bigger than its view, or always.',
  'settings.mini-map.off': 'Off',
  'settings.mini-map.auto': 'When the drawing does not fit',
  'settings.mini-map.always': 'Always',
  'settings.details-open.name': 'Keep the details open',
  'settings.details-open.sentence':
    'Whether the details panel stays open beside the drawing, or below it where the card is narrow. While nothing is chosen, it shows a summary of the graph. Off unless you turn it on.',
  'settings.details-open.on': 'On',
  'settings.details-open.off': 'Off',
  'settings.drawing-height.name': 'Tallest drawing in a note',
  'settings.drawing-height.sentence':
    'How much of the window a drawing in a note may take. A taller one is fitted inside, so the rest of the note stays in reach.',
  'settings.drawing-height.half': 'Half the window',
  'settings.drawing-height.most': 'Three quarters of the window',
  'settings.drawing-height.none': 'No limit',
  'settings.export-theme.name': 'Export theme',
  'settings.export-theme.sentence':
    'The colours an exported image is drawn in, fixed so it reads the same outside Obsidian.',
  'settings.export-theme.light': 'Light',
  'settings.export-theme.dark': 'Dark',
  'settings.companion-note.name': 'Companion note',
  'settings.companion-note.sentence':
    'Whether an export saved into the vault also gets a short note linking the image to its source.',
  'settings.companion-note.off': 'No companion note',
  'settings.companion-note.on': 'Write a companion note',
  'settings.export-folder.name': 'Export folder',
  'settings.export-folder.sentence':
    'The vault folder exports are saved in; left empty, an export is saved next to its note.',
  'settings.export-asks-above.name': 'Ask before exporting above',
  'settings.export-asks-above.sentence':
    'Exports of a note above this classification ask you first. Choose one of the classifications set above.',
  'settings.picture-folders.name': 'Pictures for readers without ThoughtKnot',
  'settings.picture-folders.sentence':
    'Notes in these folders get a picture after each graph, so GitHub and other Markdown apps show it. Part folders with commas; write / for the whole vault. Left empty, a note gets pictures only once you turn them on for it.',
  'settings.picture-folder.name': 'Picture folder',
  'settings.picture-folder.sentence':
    'The vault folder the pictures are kept in. Left empty, they go where Obsidian keeps new attachments.',
  'settings.decider.name': 'Your name on decisions',
  'settings.decider.sentence':
    'The name recorded when you accept or reject a change in a proposal. It is kept exactly as you type it. Left empty, it is recorded as “you”.',
} as const;

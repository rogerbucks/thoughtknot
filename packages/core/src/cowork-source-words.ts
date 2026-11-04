// The Copilot Cowork skill's own words, in UK English (editor spec §46, words_catalogue). The skill's companion script
// says them to the person through Cowork. They say why a note is not read into the conversation, what a proposal
// changes, and why a drawing is text. source-words.ts keeps these with every other word.

/** The Copilot Cowork skill's own words, by key, in UK English. */
export const COWORK_SOURCE_WORDS = {
  'cowork.no-graph': 'No graph in this note.',
  'cowork.refused': 'This note is not read into the conversation. {why}',
  'cowork.ask': 'This note needs your yes first. {why}',
  'cowork.card': '{graph}: {things}, {links}. {problems}.',
  'cowork.card.things': { one: '{count} thing', other: '{count} things' },
  'cowork.card.links': { one: '{count} link', other: '{count} links' },
  'cowork.card.problems': { one: '{count} problem', other: '{count} problems' },
  'cowork.card.class': 'Classification: {level}. Give the drawing files the same sensitivity label as the note.',
  'cowork.card.unlabelled':
    'The note has no classification. Give the drawing files the same sensitivity label as the note.',
  'cowork.not-drawn': 'Not drawn: {why} The graph is given as text.',
  'cowork.png-text': {
    one: 'The PNG draws plain letters, digits and punctuation only: {count} other character is drawn as a question mark. The SVG shows it.',
    other:
      'The PNG draws plain letters, digits and punctuation only: {count} other characters are drawn as a question mark. The SVG shows them all.',
  },
  'cowork.draw.kept':
    'These files are already there and differ, so they were left as they are. Ask the user, and run draw again with --replace to replace them.',
  'cowork.proposal': 'Proposal: {what}. Nothing is written until you approve it.',
  'cowork.text-graph.proposal':
    'Proposal: {count} changes to graph {graph} from the text. Nothing is written until you approve it.',
  'cowork.proposal.no-change': 'That edit changes nothing.',
  'cowork.proposal.refused': 'Nothing to propose: {why}',
  'cowork.apply.written': 'Written to the note.',
  'cowork.apply.not-approved': 'Not written: the approval is not for this edit of this note as it is now.',
  'cowork.edit.unknown': 'Not an edit the skill knows: {edit}. It knows {known}.',
  'cowork.edit.missing': 'The {edit} edit needs {needs}.',
  'cowork.edit.block': 'block {block}, line {line}',
  'cowork.usage': 'Usage: thoughtknot <read|check|draw|propose|apply|text-to-graph> <note> [options].',
  'cowork.note-unreadable': 'The note could not be read as text.',
} as const;

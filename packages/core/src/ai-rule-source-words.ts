// The words of a rule described to an AI (editor spec §56, rule_look_describe), in UK English (words_catalogue). They say
// why a request or an answer is refused. ai-source-words.ts keeps them with the other AI words.

/** The words of describing a rule, by key, in UK English. */
export const AI_RULE_SOURCE_WORDS = {
  'ai.rule.no-words': 'Write what you want to see first: nothing is asked without your words.',
  'ai.rule.graph-name': 'A graph is named with one word of letters, digits and underscores.',
  'ai.rule.no-rule': 'The answer holds no rule, or holds something else too.',
  'ai.rule.on': 'The answer does not say whether the rule is on things or on links.',
  'ai.rule.of': 'The graph has no kind or link type called {of}.',
  'ai.rule.too-many': 'The answer holds more than {most} tests.',
  'ai.rule.not-test': 'Test {n} is not a test of a property, a comparison and a value.',
  'ai.rule.field': 'Test {n} names a property the graph does not have.',
  'ai.rule.op': 'Test {n} has no comparison. It must be one of: {ops}.',
  'ai.rule.value': 'Test {n} has no value, or a value that is not plain text, a number, true or false.',
  'ai.rule.number': 'Test {n} compares by size, which only a number can take.',
  'ai.rule.look': 'The answer gives a colour, a badge or a line that is not one word.',
  'ai.rule.title': 'Ask an AI model to fill in a rule',
  'ai.rule.sentence':
    'Your words are sent with the whole graph, as shown below. The answer only fills in the rule form.',
  'ai.rule.filled': '{model} filled in the rule. Check what it finds, then try or save it.',
} as const;

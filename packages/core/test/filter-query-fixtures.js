// What the AI query tests share (editor spec ES§75). A small graph of tasks, the choices it fills, and two filters.
// The drawing they are shown on, too. Every send uses a fake transport, so no test reaches the network.
import { readNote } from '../src/drawing.ts';
import { gqlBlocks } from '../src/blocks.ts';
import { ruleChoices } from '../src/rule-builder.ts';
import { settingsFrom } from '../src/settings.ts';

export const GRAPH = [
  '// graph: work',
  "(roof:Task {name: 'Roof', status: 'late', cost: 80}),",
  "(walls:Task {name: 'Walls', status: 'done', cost: 60}),",
  "(floor:Task {name: 'Floor', status: 'late', cost: 20}),",
  "(sam:Person {name: 'Sam'}),",
  '(sam)-[:OWNS]->(roof), (roof)-[:NEEDS]->(walls)',
].join('\n');
export const NOTE = `# Work\n\n\`\`\`gql\n${GRAPH}\n\`\`\`\n`;
/** The graph read from `text`, the work graph by default. */
export const graphOf = (text = GRAPH) => readNote([text]).world.work;
export const G = graphOf();
export const CHOICES = ruleChoices(readNote(gqlBlocks(NOTE).map((b) => b.text)).world.work);

/** Late tasks: roof and floor. */
export const LATE = { on: 'things', of: 'Task', tests: [{ field: 'status', op: 'is', value: 'late' }] };
/** Tasks that cost more than 40: roof and walls. */
export const DEAR = { on: 'things', of: 'Task', tests: [{ field: 'cost', op: 'more', value: '40' }] };
/** The rule an AI gives for late tasks, as rule-describe.ts reads it. */
export const LATE_RULE = { kind: 'Task', when: 'status == "late"', means: 'Late tasks' };

export const BOXES = { boxes: ['roof', 'walls', 'floor', 'sam'].map((key, i) => ({ key, x: i * 100, y: 0 })) };
export const EDGES = [
  { from: 'sam', to: 'roof', type: 'OWNS' },
  { from: 'roof', to: 'walls', type: 'NEEDS' },
];
export const NONE = { forward: null, hidden: { things: new Set(), edges: new Set() } };

const LOCAL = {
  name: 'Local',
  purpose: 'Proposing changes',
  ceiling: 'Internal',
  endpoint: 'http://localhost:11434/v1/chat/completions',
  model: 'llama3',
  keyName: '',
};
/** What every query send is asked with: AI on, one local model, the note Internal. */
export const BASE = {
  settings: settingsFrom({ aiUse: 'on', aiPublic: 'note', aiModels: [LOCAL] }),
  model: 'Local',
  note: NOTE,
  notePath: 'Work.md',
  level: 'Internal',
};

/** A fake transport that answers with `content` as the model's message, and keeps what was sent in `sent`. */
export function answering(content, sent = []) {
  return async (request) => {
    sent.push(request);
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    return { status: 200, text: JSON.stringify({ choices: [{ message: { content: text } }] }) };
  };
}

/** An answer from the model: a filter of late tasks. */
export const LATE_ANSWER = {
  on: 'things',
  of: 'Task',
  tests: [{ field: 'status', op: 'is', value: 'late' }],
  badge: 'clock',
  means: 'Late tasks',
};

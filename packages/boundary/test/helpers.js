// What the boundary tests share. A note whose graph holds a bit of everything the boundary rules act on, and a
// setting to send it under. Test support only — nothing here ships.
import { readSetting } from '../src/index.ts';

export const NOTE = 'Work/Shop.md';

/** A shop: a product, one made with AI help, one tagged secret, the owner's profile, and a link an AI proposed. */
export const TEXT = `# Shop

What we sell this month.

\`\`\`gql
// graph: shop
(w:Product {name: 'Widget', price: 10}),
(g:Product {name: 'Gadget', price: 12, ai_assisted: TRUE}),
(m:Product {name: 'Margin plan', tags: 'secret, finance'}),
(me:Profile {density: 'calm'}),
(w)-[:SOLD_WITH {proposer_kind: 'model'}]->(g),
(w)-[:SOLD_WITH]->(m)
\`\`\`
`;

/** A setting named `name` with the AI rule `ai`, redacting things tagged secret. */
export function setting(ai = 'label', more = {}) {
  const read = readSetting({ name: 'Acme', ai, redact: [{ tag: 'secret' }], ...more });
  if (!read.ok) throw new Error(read.problem.code);
  return read.setting;
}

// Keys in what would cross (editor spec §40, boundary_contract, encrypted_everywhere). A parcel holding any key is
// refused whole. Nothing is quietly cut out: a key in the content means something went wrong, and the person must see it.
// - The library's fixed shapes (graph spec §51): private keys, access and API keys, tokens, passwords, card numbers.
// - A private key written as a JSON Web Key: one with a `kty` and its private part `d`.
// - The sync package's own keys say only that they are keys when written out. That word crossing still means a key
//   was put where content goes.
import gs from '@thoughtknot/graph-spec';

/** The kinds of key a JSON Web Key and a written-out sync key are named by. */
export const JWK_PRIVATE = 'a private key (JSON Web Key)';
export const SYNC_KEY = 'a sync key';

const JWK = /"kty"\s*:\s*"[A-Za-z]+"[^}]*"d"\s*:\s*"[\w-]{16,}"|"d"\s*:\s*"[\w-]{16,}"[^}]*"kty"\s*:/;
// what keys.ts writes in a key's place in a log, JSON or an export
const SYNC_MARK = /\[ThoughtKnot key: never shown\]/;

/** The kinds of key `text` holds, each once and in words, never the text that matched. */
export function keysIn(text: string): string[] {
  const found = new Set<string>(gs.secretsIn(text));
  if (JWK.test(text)) found.add(JWK_PRIVATE);
  if (SYNC_MARK.test(text)) found.add(SYNC_KEY);
  return [...found];
}

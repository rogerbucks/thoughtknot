// The contract's cases as a file, for a store written in another language (editor spec ES§53, scale_parts_store_swap).
// The desktop app's store is in Rust, and its tests read this file. `node parts-store-fixture.js --write` writes it
// again from the memory store's answers, after a change to the contract.
import { writeFileSync } from 'node:fs';
import { contractCases } from '../src/parts-store-contract.ts';

/** Where the file is kept. */
export const FIXTURE = new URL('./fixtures/parts-store-contract.json', import.meta.url);

/** The file's text, as the memory store answers now. */
export const fixtureText = async () => JSON.stringify(await contractCases()) + '\n';

if (process.argv.includes('--write')) writeFileSync(FIXTURE, await fixtureText());

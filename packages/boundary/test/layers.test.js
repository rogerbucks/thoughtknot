// The personal and corporate layers (editor spec §40, corporate_personal_split). The personal layer is the
// open-source engine and tooling the owner controls. It works on its own: with every download blocked, it reads, draws
// and makes a parcel. The corporate layer is a setting, plain data. The same content renders the same in either layer.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { draw, loadEngine, readNote } from '@thoughtknot/core';
import { makeParcel, readSetting } from '../src/index.ts';
import { NOTE } from './helpers.js';

const PLAIN =
  "# Plan\n\n```gql\n// graph: plan\n(a:Step {name: 'Design'}),\n(b:Step {name: 'Build'}),\n(a)-[:THEN]->(b)\n```\n";

/** Runs `work` with every way to download something a trap, and gives back what it made and each attempt. */
async function offline(work) {
  const attempts = [];
  const saved = { fetch: globalThis.fetch, XMLHttpRequest: globalThis.XMLHttpRequest, WebSocket: globalThis.WebSocket };
  const trap = (kind) =>
    class {
      constructor() {
        attempts.push(kind);
        throw new Error(`${kind} blocked`);
      }
    };
  globalThis.fetch = (url) => (attempts.push(`fetch ${url}`), Promise.reject(new Error('blocked')));
  globalThis.XMLHttpRequest = trap('XMLHttpRequest');
  globalThis.WebSocket = trap('WebSocket');
  try {
    return { made: await work(), attempts };
  } finally {
    Object.assign(globalThis, saved);
  }
}

describe('corporate_personal_split', () => {
  // proves: corporate_personal_split
  test('the personal layer works fully with downloads blocked, and the same content renders in both layers', async () => {
    const { made, attempts } = await offline(async () => {
      const engine = await loadEngine();
      const personal = draw(readNote([PLAIN.split('```gql\n')[1].split('\n```')[0]]).graphs.get('plan'), engine).svg;
      const read = readSetting({ name: 'Acme' });
      const crossing = makeParcel({ path: NOTE, text: PLAIN }, read.setting, { engine, date: '2026-10-29' });
      return { personal, crossing };
    });
    assert.deepEqual(attempts, [], 'nothing was downloaded');
    assert.ok(made.crossing.ok);
    const corporate = made.crossing.parcel.files.find((f) => f.path === 'plan.svg').text;
    assert.match(corporate, /<svg/);
    assert.equal(corporate, made.personal, 'the corporate copy draws as the personal one does');
  });

  // proves: corporate_personal_split
  test('the corporate layer is a setting, plain data; the personal layer is open source with nothing from work', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    assert.equal(pkg.license, 'MPL-2.0');
    assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['@thoughtknot/core', '@thoughtknot/graph-spec']);
    const setting = readSetting(
      JSON.parse(JSON.stringify({ name: 'Acme', ai: 'remove', redact: [{ label: 'Salary' }] })),
    );
    assert.ok(setting.ok, 'a workplace is described by a file of data, never by code of its own');
  });
});

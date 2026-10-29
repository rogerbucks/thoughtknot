// The web layer (editor spec §40, web_layer_separate): a separate, secure layer, hosted where the owner controls,
// apart from the stores on each device. It is built from a parcel alone, as static files, and serves views with no
// server and no device's store behind it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadEngine } from '@thoughtknot/core';
import { makeParcel, readSetting } from '@thoughtknot/boundary';
import { MemoryStore, VaultKey, syncedOver } from '../../sync/src/index.ts';
import { CONTENT_POLICY, buildSite } from '../src/index.ts';

const NOTE = 'Work/Shop.md';
const TEXT =
  "# Shop\n\n```gql\n// graph: shop\n(w:Product {name: 'Widget'}),\n(g:Product {name: 'Gadget', ai_assisted: TRUE}),\n(w)-[:SOLD_WITH]->(g)\n```\n";
const engine = await loadEngine();
const { setting } = readSetting({ name: 'Acme' });

/** A device's notes, kept sealed in its store, and the parcel of one note read from them. */
async function device() {
  const store = new MemoryStore();
  const notes = syncedOver(store, await VaultKey.create(), 'desktop');
  await notes.open(NOTE, TEXT);
  const crossing = makeParcel({ path: NOTE, text: notes.read(NOTE).text }, setting, { engine, date: '2026-10-29' });
  return { store, notes, parcel: crossing.parcel };
}

describe('web_layer_separate', () => {
  // proves: web_layer_separate
  test('the web layer serves views without hosting any device’s local store', async () => {
    const { store, notes, parcel } = await device();
    const site = buildSite(parcel);
    assert.deepEqual(
      site.map((f) => f.path),
      ['index.html', 'site.css', NOTE, 'shop.svg', 'manifest.json'],
    );
    const page = site[0].text;
    assert.match(page, /<img src="shop\.svg" alt="Picture of the graph shop">/, 'the view is served');
    assert.match(page, /labelled &quot;AI-assisted&quot;/, 'it says what is AI-made');

    // nothing the device keeps reaches the site: no sealed record, no hidden name
    const served = site.map((f) => f.text).join('\n');
    for (const [name, byDevice] of store.files) {
      assert.ok(!served.includes(name), 'no hidden note name');
      for (const records of byDevice.values())
        for (const r of records) assert.ok(!served.includes(Buffer.from(r).toString('base64')), 'no sealed record');
    }
    // a store, a synced note or a hand-made look-alike is refused
    for (const notParcel of [store, notes, { kind: 'parcel', files: [], manifest: {} }, null])
      assert.throws(() => buildSite(notParcel), /a parcel only/);
  });

  // proves: web_layer_separate
  test('it is static, read-only and secure: no script, no server, nothing fetched from elsewhere', async () => {
    const { parcel } = await device();
    const page = buildSite(parcel)[0].text;
    assert.ok(page.includes(`content="${CONTENT_POLICY}"`));
    assert.match(CONTENT_POLICY, /default-src 'none'/);
    assert.doesNotMatch(CONTENT_POLICY, /script-src|unsafe/);
    assert.doesNotMatch(page, /<script|<form|<iframe|https?:\/\//i);

    const src = readdirSync(new URL('../src', import.meta.url)).map((f) =>
      readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8'),
    );
    for (const code of src) {
      assert.doesNotMatch(code, /from ['"](node:|@thoughtknot\/sync)/, 'no server module and no store');
      assert.doesNotMatch(code, /createServer|\.listen\(/);
    }
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    assert.deepEqual(Object.keys(pkg.dependencies), ['@thoughtknot/boundary']);
  });

  test('what the note says is shown as text, never as markup', async () => {
    const { setting: s } = readSetting({ name: '<Acme>' });
    const crossing = makeParcel({ path: 'x.md', text: '<img src=x onerror=alert(1)>\n' }, s, { date: '2026-10-29' });
    const page = buildSite(crossing.parcel)[0].text;
    assert.ok(!page.includes('<img src=x'));
    assert.ok(page.includes('&lt;Acme&gt;'));
  });
});

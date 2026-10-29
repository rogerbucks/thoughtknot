// Portable, with no server (editor spec §40, portable_no_servers). The system works offline, on iOS, macOS and the web,
// and in corporate settings with no server installed.
// - Offline: every way to the network is a trap. A note is read, drawn, sent across the boundary and built into a web
//   page, and no trap is touched. The desktop and phone app loads only its own files.
// - No server: nothing a corporate install runs listens for connections. The library, the boundary, the web layer,
//   the plug-ins and the app hold no server, and the app's Rust carries no server crate. Sync between devices uses a
//   channel the host gives it, such as a mesh VPN, and listens on nothing (packages/sync/GUIDE.md).
// - The Claude Code host is a developer's tool that a person starts on their own machine. It is never part of a
//   corporate install, so its local page server is left out.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { draw, loadEngine, readNote } from '@thoughtknot/core';
import { makeParcel, readSetting } from '@thoughtknot/boundary';
import { buildSite } from '@thoughtknot/web';
import { read, readJSON, sourceFiles } from './repository/repo.js';

const TEXT =
  "# Plan\n\n```gql\n// graph: plan\n(a:Step {name: 'Design'}),\n(b:Step {name: 'Build'}),\n(a)-[:THEN]->(b)\n```\n";
const SERVER =
  /\bcreateServer\b|\.listen\(\s*\d|\bfrom\s+['"]node:(http|https|net|http2)['"]|\bDeno\.serve\b|\bBun\.serve\b/;
const SERVER_CRATES = /^\s*(axum|actix-web|warp|hyper|tiny_http|rocket|tide|poem)\s*=/m;
const DEVELOPER_TOOL = 'packages/claude-code/';

describe('portable_no_servers', () => {
  // proves: portable_no_servers
  test('the app works offline: read, drawn, sent and built into a page with the network shut', async () => {
    const tried = [];
    const saved = {
      fetch: globalThis.fetch,
      WebSocket: globalThis.WebSocket,
      XMLHttpRequest: globalThis.XMLHttpRequest,
    };
    globalThis.fetch = (url) => (tried.push(String(url)), Promise.reject(new Error('offline')));
    globalThis.WebSocket = globalThis.XMLHttpRequest = function () {
      tried.push('socket');
      throw new Error('offline');
    };
    try {
      const engine = await loadEngine();
      const drawn = draw(readNote([TEXT.split('```gql\n')[1].split('\n```')[0]]).graphs.get('plan'), engine);
      assert.match(drawn.svg, /<svg/);
      const crossing = makeParcel({ path: 'Plan.md', text: TEXT }, readSetting({ name: 'Acme' }).setting, { engine });
      assert.ok(buildSite(crossing.parcel).some((f) => f.path === 'plan.svg'));
    } finally {
      Object.assign(globalThis, saved);
    }
    assert.deepEqual(tried, []);
    // the desktop and phone app loads only its own files
    const { csp } = readJSON('packages/app/src-tauri/tauri.conf.json').app.security;
    assert.match(csp, /default-src 'self'/);
    assert.doesNotMatch(csp, /https?:\/\/(?!ipc\.localhost)/);
  });

  // proves: portable_no_servers
  test('a corporate install starts no server', () => {
    const shipped = sourceFiles().filter((f) => !f.startsWith(DEVELOPER_TOOL));
    assert.ok(
      shipped.some((f) => f.startsWith('packages/web/')) && shipped.some((f) => f.startsWith('packages/sync/')),
    );
    for (const f of shipped) assert.doesNotMatch(read(f), SERVER, `${f} would start a server`);
    assert.doesNotMatch(read('packages/app/src-tauri/Cargo.toml'), SERVER_CRATES);
  });
});

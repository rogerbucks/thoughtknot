// The rendering spec (editor spec §73, render_spec_written): the page that says how a graph gets onto the screen. It is
// wiki/Rendering-spec.md. It carries a version and names the eight layers, each with what it takes and gives. It
// lists the rules and the scoreboard checks, and logs a line for its version. Pure: the real page is read, nothing else.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { exists, read } from './repository/repo.js';

const PAGE = 'wiki/Rendering-spec.md';
const page = exists(PAGE) ? read(PAGE) : '';

/** The layers, from the store down to the painters, then the camera and the controls. */
const LAYERS = ['L0 Store', 'L1 Scene', 'L2 Layout', 'L3 Detail', 'L4 Marks', 'L5 Painters', 'L6 Camera', 'L7 Chrome'];

/** The section of the page under `heading`, up to the next heading of its level. */
const section = (heading) => page.split(/^## /m).find((part) => part.startsWith(`${heading}\n`)) ?? '';

describe('the rendering spec', () => {
  test('carries a version and the date it was set', () => {
    assert.match(page, /^\*\*Version \d+\.\d+, \d{1,2} \w+ \d{4}\.\*\*/m);
  });

  test('names each of the eight layers, with what it takes, what it gives and what it never does', () => {
    const layers = section('The layers');
    assert.match(layers, /\| Layer \| Its job \| Takes \| Gives \| Never \|/);
    for (const layer of LAYERS) assert.match(layers, new RegExp(`^\\| ${layer} \\|( [^|]+ \\|){4}$`, 'm'), layer);
  });

  test('lists its rules, numbered, the one-way rule first', () => {
    const rules = section('The rules');
    assert.match(rules, /^1\. \*\*One way down\.\*\*/m);
    assert.ok((rules.match(/^\d+\. \*\*/gm) ?? []).length >= 9);
  });

  test('says how each scoreboard check passes', () => {
    const board = section('The scoreboard');
    for (const check of ['Labels that overlap', 'Controls over the drawing', 'Things moved by a zoom'])
      assert.match(board, new RegExp(`^\\| ${check} \\| 0`, 'm'), check);
  });

  test('logs a line for the version it carries', () => {
    const version = page.match(/^\*\*Version (\d+\.\d+),/m)?.[1];
    assert.ok(version);
    assert.match(section('Change log'), new RegExp(`^\\| ${version.replace('.', '\\.')} \\|`, 'm'));
  });
});

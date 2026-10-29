// Each layer imports only the layers below it (editor spec §43, layers_checked). The layers come from
// requirements/architecture.gql: the graph format library, the core, the display layer, then the plug-ins and the apps.
// scripts/layers.mjs reads every import of the shipped code and names each one that crosses a layer the wrong way. A
// package is used by its name, never reached into by a relative path (risk ARCH-3). So a host keeps to what the core
// exports: `@thoughtknot/core`, its `display/*` and its `hosts/*`.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deepImports, layerProblems, repoFiles } from '../scripts/layers.mjs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const ARCHITECTURE = read('requirements/architecture.gql');

/** The problems of a made-up repository: its files and their text. */
const problemsOf = (files) =>
  layerProblems(Object.keys(files), (f) => files[f], ARCHITECTURE).map((p) => `${p.file} → ${p.imports}`);

describe('each layer imports only the layers below it', () => {
  test('the repository as committed has no import that crosses a layer the wrong way', () => {
    assert.deepEqual(layerProblems(repoFiles(), read, ARCHITECTURE), []);
  });

  test('the core importing the display layer is reported, and the display layer importing the core is not', () => {
    const files = {
      'packages/core/src/a.ts': "import { b } from './display/b.ts';",
      'packages/core/src/display/b.ts': "import { c } from '../c.ts';",
      'packages/core/src/c.ts': 'export const c = 1;',
    };
    assert.deepEqual(problemsOf(files), ['packages/core/src/a.ts → packages/core/src/display/b.ts']);
  });

  test('the graph format library importing an app is reported, through a package name too', () => {
    const files = {
      'packages/obsidian/package.json': '{"name": "@thoughtknot/obsidian", "exports": {".": "./src/main.ts"}}',
      'packages/obsidian/src/main.ts': 'export const m = 1;',
      'packages/graph-spec/src/x.js': "const m = import('@thoughtknot/obsidian');",
    };
    assert.deepEqual(problemsOf(files), ['packages/graph-spec/src/x.js → packages/obsidian/src/main.ts']);
  });

  test('tests and their support are left out: they may reach any layer', () => {
    const files = {
      'packages/core/test/a.test.js': "import { b } from '../src/display/b.ts';",
      'packages/core/src/display/b.ts': 'export const b = 1;',
    };
    assert.deepEqual(problemsOf(files), []);
  });
});

describe('a package is used by its name, never reached into', () => {
  const deep = (files) => deepImports(Object.keys(files), (f) => files[f]).map((d) => `${d.file} → ${d.imports}`);

  test('the repository as committed reaches into no other package by a relative path', () => {
    assert.deepEqual(deepImports(repoFiles(), read), []);
  });

  test('a host reaching into the core by a relative path is reported, in every way an import is written', () => {
    const files = {
      'packages/vscode/src/a.ts': [
        "import { t } from '../../core/src/words.ts';",
        "export { x } from '../../core/src/x.ts';",
        "const w = import('../../core/src/layout-worker.ts');",
        "import '../../core/src/side.ts';",
      ].join('\n'),
      'packages/claude-code/page/b.ts': "const g = require('../../graph-spec/src/graph-spec-check.js');",
    };
    assert.deepEqual(deep(files), [
      'packages/claude-code/page/b.ts → packages/graph-spec/src/graph-spec-check.js',
      'packages/vscode/src/a.ts → packages/core/src/layout-worker.ts',
      'packages/vscode/src/a.ts → packages/core/src/side.ts',
      'packages/vscode/src/a.ts → packages/core/src/words.ts',
      'packages/vscode/src/a.ts → packages/core/src/x.ts',
    ]);
  });

  test('the package name, a path inside the same package, tests and build scripts are not', () => {
    const files = {
      'packages/vscode/src/a.ts':
        "import { t } from '@thoughtknot/core';\nimport { h } from '@thoughtknot/core/display/host';",
      'packages/claude-code/page/b.ts': "import { s } from '../server/start-server.ts';",
      'packages/vscode/test/c.test.js': "import { t } from '../../core/src/words.ts';",
      'packages/vscode/esbuild.config.mjs': "import page from '../claude-code/esbuild.page.mjs';",
    };
    assert.deepEqual(deep(files), []);
  });
});

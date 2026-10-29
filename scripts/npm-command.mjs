// npm as this Node runs it: the program and its arguments, for spawnSync or execFileSync. On Windows npm is npm.cmd,
// which Node starts only through a shell (since CVE-2024-27980), so npm's own script is run by Node instead. Under an
// npm script npm names that script; otherwise it is where Node keeps it. Where neither is found, plain `npm` is run.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const NPM_CLI = [
  process.env.npm_execpath,
  join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  join(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
].find((file) => file && /npm-cli\.js$/.test(file) && existsSync(file));

/** The program to start and its arguments, to run npm with `args`. */
export const npmCommand = (args) => (NPM_CLI ? [process.execPath, [NPM_CLI, ...args]] : ['npm', args]);

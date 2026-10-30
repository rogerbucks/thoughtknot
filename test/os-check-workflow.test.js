// The tests on macOS and Windows (.github/workflows/os-check.yml). A checkout and a test run there read files, and
// the output of other programs, as on Linux. Spec §41, standalone_app: it is tested on Linux, macOS and Windows.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('the tests on macOS and Windows', () => {
  test('check out every text file with LF line ends, as a Windows checkout turns them into CRLF', () => {
    const attributes = read('.gitattributes');
    assert.match(attributes, /^\* text=auto eol=lf$/m);
    // a third-party text is kept as its makers wrote it
    assert.match(attributes, /^licences\/texts\/automerge\/serde-wasm-bindgen\.MIT\.txt -text$/m);
  });

  test("read Node's output in Python as UTF-8, not in Windows' own code page", () => {
    const python = read('.github/workflows/os-check.yml').split(/^ {2}python:$/m)[1];
    assert.ok(python, 'the python job');
    assert.match(python, /^ {6}PYTHONUTF8: '1'$/m);
  });

  test("the suite's parity tests read Python's output as UTF-8 too", () => {
    const suite = read('.github/workflows/os-check.yml')
      .split(/^ {2}suite:$/m)[1]
      .split(/^ {2}python:$/m)[0];
    assert.match(suite, /^ {10}PYTHONUTF8: '1'$/m);
  });
});

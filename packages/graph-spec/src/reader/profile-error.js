// The error a block outside the document profile gives: its line, what is wrong, the fix, and its stable code.
'use strict';

// ── the document profile reader (gql_profile.py) ───────────────────────────────────────────────
// Where the fix is one insertion, `at` is the character on the line it goes before (0-based). `code` is the problem's
// stable code (editor spec §42, problem_codes). It is given in problem-codes.json and is the same from the Python
// reader.
class ProfileError extends Error {
  /**
   * @param {number} line
   * @param {string} message
   * @param {string} fix
   * @param {number} [at]
   * @param {string} [code]
   */
  constructor(line, message, fix, at, code) {
    super(`line ${line}: ${message} — ${fix}`);
    this.line = line;
    this.msg = message;
    this.fix = fix;
    /** @type {number | undefined} */
    this.at = at;
    /** @type {string | undefined} */
    this.code = code;
    if (at === undefined) delete this.at;
    if (code === undefined) delete this.code;
  }
}

module.exports = { ProfileError };

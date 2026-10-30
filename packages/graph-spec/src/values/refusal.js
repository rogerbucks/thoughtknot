// A refusal of the library outside the reader: a call handed what it cannot work on, with a stable code (API-8).
'use strict';

// The reader's problems are ProfileErrors (reader/profile-error.js), each with its GN code. Every other refusal is a
// Refusal, with its GR code from refusal-codes.json. So a caller tells one from another by its code, not its words.
// The message is the same as before the code was given, so what a person reads does not change.
class Refusal extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'Refusal';
    this.code = code;
  }
}

/** A refusal with its code and its message, for a `throw`. */
const refused = (/** @type {string} */ code, /** @type {string} */ message) => new Refusal(code, message);

module.exports = { Refusal, refused };

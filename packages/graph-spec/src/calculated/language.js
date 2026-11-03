// The calculated-value language (editor spec §57, requirements/calc-language.md): an expression read into a tree, and
// units written as `USD/h`. Its Python twin is graphspec/engine/calculated/language.py.
'use strict';

const { refused } = require('../values/refusal.js');

/** @typedef {Record<string, number>} Unit A unit as symbols and their powers: USD per hour is `{USD: 1, h: -1}`. */
/**
 * @typedef {{ t: 'num', v: number } | { t: 'name', n: string } | { t: 'neg', a: Tree }
 *   | { t: 'bin', op: string, a: Tree, b: Tree }
 *   | { t: 'roll', fn: string, dir: 'out' | 'in', type: string, prop: string | null }} Tree An expression read.
 */
/** The most characters an expression holds, and how deep its brackets go. */
const CALC_LIMITS = Object.freeze({ chars: 1000, nesting: 64 });
const ROLLS = new Set(['sum', 'count', 'avg', 'min', 'max']);
const TOKEN = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_]\w*)|([-+*/()<.]))/y;

/** The reason an expression is refused, as a person reads it. */
const said = (/** @type {string} */ expr, /** @type {string} */ why) =>
  `the expression ${JSON.stringify(expr.slice(0, 40))} ${why} (editor spec §57)`;

/**
 * An expression read into a tree, or a Refusal (GR19) saying why not.
 * @param {unknown} source
 * @returns {Tree}
 */
function parse(source) {
  if (typeof source !== 'string' || !source.trim()) throw refused('GR19', said(String(source ?? ''), 'is empty'));
  const expr = source;
  if (expr.length > CALC_LIMITS.chars)
    throw refused('GR19', said(expr, `is longer than ${CALC_LIMITS.chars} characters`));
  /** @type {[string, string | number][]} */
  const toks = [];
  let pos = 0;
  while (pos < expr.length && expr.slice(pos).trim()) {
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(expr);
    if (!m || TOKEN.lastIndex === pos)
      throw refused('GR19', said(expr, `holds ${JSON.stringify(expr.slice(pos).trim().slice(0, 12))}`));
    toks.push(m[1] !== undefined ? ['num', Number(m[1])] : m[2] !== undefined ? ['name', m[2]] : ['op', m[3] ?? '']);
    pos = TOKEN.lastIndex;
  }
  let i = 0,
    depth = 0;
  const isOp = (/** @type {[string, string | number] | undefined} */ t, /** @type {string} */ o) =>
    t !== undefined && t[0] === 'op' && t[1] === o;
  const take = () => {
    const t = toks[i++];
    if (t === undefined) throw refused('GR19', said(expr, 'ends too soon'));
    return t;
  };
  /** @template T @param {() => T} within @returns {T} */
  const deeper = (within) => {
    if (++depth > CALC_LIMITS.nesting) throw refused('GR19', said(expr, `goes more than ${CALC_LIMITS.nesting} deep`));
    try {
      return within();
    } finally {
      depth--;
    }
  };
  const word = () => {
    const t = take();
    if (t[0] !== 'name') throw refused('GR19', said(expr, `has ${JSON.stringify(t[1])} where a name goes`));
    return String(t[1]);
  };
  /** @param {string} fn @returns {Tree} */
  const roll = (fn) => {
    take(); // the bracket
    const dir = isOp(toks[i], '<') ? (take(), 'in') : 'out';
    const type = word();
    let prop = null;
    if (isOp(toks[i], '.')) {
      take();
      prop = word();
    }
    if (!isOp(take(), ')')) throw refused('GR19', said(expr, 'has a bracket left open'));
    if (fn !== 'count' && prop === null) throw refused('GR19', said(expr, `asks ${fn} of links with no property`));
    if (fn === 'count' && prop !== null)
      throw refused('GR19', said(expr, 'counts links, which have no property to name'));
    return { t: 'roll', fn, dir, type, prop };
  };
  /** @returns {Tree} */
  const atom = () => {
    const [kind, v] = take();
    if (kind === 'num') return { t: 'num', v: Number(v) };
    if (kind === 'op' && v === '(') {
      return deeper(() => {
        const out = sum();
        if (!isOp(take(), ')')) throw refused('GR19', said(expr, 'has a bracket left open'));
        return out;
      });
    }
    if (kind === 'name') {
      if (isOp(toks[i], '(')) {
        if (!ROLLS.has(String(v))) throw refused('GR19', said(expr, `calls ${JSON.stringify(v)}`));
        return roll(String(v));
      }
      return { t: 'name', n: String(v) };
    }
    throw refused('GR19', said(expr, `has ${JSON.stringify(v)} where a value goes`));
  };
  /** @returns {Tree} */
  const unary = () => (isOp(toks[i], '-') ? (take(), deeper(() => ({ t: 'neg', a: unary() }))) : atom());
  /** @returns {Tree} */
  const product = () => {
    let a = unary();
    while (isOp(toks[i], '*') || isOp(toks[i], '/')) a = { t: 'bin', op: String(take()[1]), a, b: unary() };
    return a;
  };
  /** @returns {Tree} */
  const sum = () => {
    let a = product();
    while (isOp(toks[i], '+') || isOp(toks[i], '-')) a = { t: 'bin', op: String(take()[1]), a, b: product() };
    return a;
  };
  const tree = sum();
  const left = toks[i];
  if (left !== undefined) throw refused('GR19', said(expr, `has ${JSON.stringify(left[1])} after its end`));
  return tree;
}

// ── units: a unit is {symbol: power}, written `USD/h` ─────────────────────────────────────────────
/** A unit written as text, such as `USD/h`, read into symbols and powers. @param {unknown} text @returns {Unit} */
function unitOfText(text) {
  /** @type {Unit} */
  const u = {};
  if (typeof text !== 'string') return u;
  let next = 1;
  for (const part of text.split(/([*/])/)) {
    const symbol = part.trim();
    if (part === '*') next = 1;
    else if (part === '/') next = -1;
    else if (symbol) {
      u[symbol] = (u[symbol] ?? 0) + next;
      next = 1;
    }
  }
  for (const k of Object.keys(u)) if (u[k] === 0) delete u[k];
  return u;
}
/** A unit written the one way: top symbols sorted joined by *, then / and the bottom ones. @param {Unit} u */
function unitText(u) {
  const power = (/** @type {string} */ k) => Math.abs(u[k] ?? 0);
  const side = (/** @type {string[]} */ keys) =>
    keys
      .sort()
      .map((k) => (power(k) === 1 ? k : `${k}^${power(k)}`))
      .join('*');
  const top = Object.keys(u).filter((k) => (u[k] ?? 0) > 0),
    bottom = Object.keys(u).filter((k) => (u[k] ?? 0) < 0);
  return side(top) + (bottom.length ? `/${side(bottom)}` : '');
}
/** @param {Unit} u */
const shown = (u) => unitText(u) || 'a plain number';
/** @param {Unit} a @param {Unit} b @param {number} sign */
function unitTimes(a, b, sign) {
  const u = { ...a };
  for (const [k, p] of Object.entries(b)) u[k] = (u[k] ?? 0) + sign * p;
  for (const k of Object.keys(u)) if (u[k] === 0) delete u[k];
  return u;
}
/** @param {Unit} a @param {Unit} b */
const sameUnit = (a, b) => unitText(a) === unitText(b);

module.exports = { CALC_LIMITS, parse, unitOfText, unitText, shown, unitTimes, sameUnit };

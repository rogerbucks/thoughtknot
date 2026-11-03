// Calculated values (editor spec §57, calc_in_schema, calc_by_tools, calc_gaps_said, calc_loops_flagged). Its Python
// twin is graphspec/engine/calculated/calculated.py, and test/calculated-cases.json holds both to the same answers.
//
// A kind's schema declares a `Calculated` thing. Its `of` is the kind and its `name` the property. Its `is` is an
// expression, as requirements/calc-language.md says, and its `unit` is optional. A `Quantity` thing gives a stored
// number its unit. Every thing of the kind then has the property. It is worked out here each time. It is never typed,
// never by an AI, and never written into the note text. A reader may keep it as a cache whose `basis` says what it
// was worked out from.
//
// - A value lacking an input is a gap (value null) and counts how many inputs it lacked. A total of a set counts the
//   gaps and never counts one as zero.
// - Adding values of different units is refused, with the reason.
// - A value that depends on itself is a loop (value null) naming the things in it. The rest still work out.
'use strict';

const { hash16 } = require('../hashing/canonical-json.js');
const { Refusal } = require('../values/refusal.js');
const { CALC_LIMITS, parse, unitOfText, unitText, shown, unitTimes, sameUnit } = require('./language.js');
const { calculatedOf, declarations } = require('./declared.js');

/** @typedef {import('./language.js').Tree} Tree */
/** @typedef {import('./language.js').Unit} Unit */

/** @typedef {[string, string, string, Record<string, unknown>]} PlainEdge A link: from, type, to, its properties. */
/**
 * @typedef {object} PlainGraph The plain graph the rules run on (graph/graph.js), as far as this file reads it.
 * @property {Map<string, [Set<string>, Record<string, unknown>]>} nodes
 * @property {(label: string) => string[]} labelled
 * @property {(id: string) => Record<string, unknown>} p
 * @property {(id: string, type?: string) => PlainEdge[]} out
 * @property {(id: string, type?: string) => PlainEdge[]} inc
 */
/**
 * @typedef {object} Val A value part way through working out.
 * @property {number | null} v The number, or null for a gap, a loop or a refusal.
 * @property {Unit} u
 * @property {number} m How many inputs it lacked.
 * @property {string[] | null} loop The things in the loop it depends on.
 * @property {string | null} ref Why it was refused.
 */
/**
 * @typedef {object} Declaration A Calculated or Quantity thing.
 * @property {string} id
 * @property {unknown} of
 * @property {unknown} name
 * @property {unknown} is
 * @property {unknown} unit
 * @property {[string, string][]} flags
 */
/** @typedef {[string, unknown][]} Reads What a value was worked out from: each property read, and what it held. */

/** @param {Unit} [u] @returns {Val} */
const gap = (u = new Map()) => ({ v: null, u, m: 1, loop: null, ref: null });
/** @param {number} v @param {Unit} [u] @returns {Val} */
const lone = (v, u = new Map()) => ({ v, u, m: 0, loop: null, ref: null });
/** @param {string[] | null | undefined} a @param {string[] | null | undefined} b */
const union = (a, b) => [...new Set([...(a || []), ...(b || [])])].sort();

/**
 * Two operands made one when either is a loop or a refusal, else null (the caller works the numbers).
 * @param {Val} a @param {Val} b @returns {Val | null}
 */
function blocked(a, b) {
  if (a.loop || b.loop) return { v: null, u: new Map(), m: a.m + b.m, loop: union(a.loop, b.loop), ref: null };
  if (a.ref || b.ref) return { v: null, u: new Map(), m: a.m + b.m, loop: null, ref: a.ref || b.ref };
  return null;
}

/** Works out the calculated values of one graph, remembering each so it is worked out once. */
class Calculation {
  /** @param {PlainGraph} graph */
  constructor(graph) {
    this.graph = graph;
    const { calc, units, byName } = declarations(graph);
    this.calc = calc;
    this.units = units;
    this.byName = byName;
    /** @type {Map<string, { val: Val, reads: Reads }>} */
    this.memo = new Map();
    /** The `thing|name` keys being worked out now, so a value that meets itself is a loop. @type {string[]} */
    this.stack = [];
    /** @type {Map<string, Tree | Refusal>} */
    this.trees = new Map();
  }

  /** @param {Declaration} d */
  treeOf(d) {
    let t = this.trees.get(d.id);
    if (t === undefined) {
      try {
        t = parse(d.is);
      } catch (e) {
        if (!(e instanceof Refusal)) throw e;
        t = e;
      }
      this.trees.set(d.id, t);
    }
    return t;
  }

  /** @param {string} id */
  labelsOf(id) {
    return [...(this.graph.nodes.get(id)?.[0] ?? [])].sort();
  }

  /** The calculated declaration that gives this thing this property, if any. @param {string} id @param {string} name */
  declOf(id, name) {
    for (const l of this.labelsOf(id)) {
      const d = this.calc.get(`${l}|${name}`);
      if (d) return d;
    }
    return null;
  }

  /** @param {string} id @param {string} name */
  storedUnit(id, name) {
    for (const l of this.labelsOf(id)) {
      const text = this.units.get(`${l}|${name}`);
      if (text !== undefined) return unitOfText(text);
    }
    return null;
  }

  /** The unit every declaration of this name agrees on, else none. @param {string} name */
  anyUnit(name) {
    const set = this.byName.get(name);
    const only = set && set.size === 1 ? [...set][0] : undefined;
    return only === undefined ? new Map() : unitOfText(only);
  }

  /**
   * One thing's property: a stored number, or a calculated one worked out.
   * @param {string} id @param {string} name @param {Reads} reads @returns {Val}
   */
  valueOf(id, name, reads) {
    const d = this.declOf(id, name);
    if (d) {
      const r = this.result(id, name, d);
      reads.push(...r.reads);
      return r.val;
    }
    const p = this.graph.p(id)[name];
    reads.push([`${id}.${name}`, p === undefined ? null : p]);
    const u = this.storedUnit(id, name) ?? new Map();
    if (p === undefined || p === null) return gap(u);
    if (typeof p !== 'number' || !Number.isFinite(p))
      return { v: null, u, m: 0, loop: null, ref: `${name} of ${id} is not a number` };
    return lone(p, u);
  }

  /** @param {string} id @param {string} name @param {Declaration} d @returns {{ val: Val, reads: Reads }} */
  result(id, name, d) {
    const key = `${id}|${name}`;
    const memoed = this.memo.get(key);
    if (memoed) return memoed;
    const at = this.stack.indexOf(key);
    if (at >= 0) {
      const members = this.stack.slice(at).map((k) => k.slice(0, k.lastIndexOf('|')));
      return { val: { v: null, u: new Map(), m: 0, loop: union(members, []), ref: null }, reads: [] };
    }
    this.stack.push(key);
    /** @type {Reads} */
    const reads = [];
    const tree = this.treeOf(d);
    /** @type {Val} */
    let val =
      tree instanceof Refusal
        ? { v: null, u: new Map(), m: 0, loop: null, ref: tree.message }
        : this.run(tree, id, reads);
    this.stack.pop();
    // a declared unit must agree with the one the expression gives; a plain number takes the declared unit
    if (!val.loop && !val.ref && typeof d.unit === 'string' && d.unit.trim()) {
      const want = unitOfText(d.unit);
      if (unitText(val.u) === '') val = { ...val, u: want };
      else if (!sameUnit(val.u, want))
        val = { ...val, v: null, ref: `${name} works out in ${shown(val.u)} but is declared in ${shown(want)}` };
    }
    const out = { val, reads };
    this.memo.set(key, out);
    return out;
  }

  /** @param {Tree} t @param {string} id @param {Reads} reads @returns {Val} */
  run(t, id, reads) {
    switch (t.t) {
      case 'num':
        return lone(t.v);
      case 'name':
        return this.valueOf(id, t.n, reads);
      case 'neg': {
        const a = this.run(t.a, id, reads);
        return a.v === null ? a : { ...a, v: -a.v };
      }
      case 'bin':
        return this.sums(t, this.run(t.a, id, reads), this.run(t.b, id, reads));
      default:
        return this.roll(t, id, reads);
    }
  }

  /** Two operands put together by `+ - * /`, with their units. @param {Extract<Tree, { t: 'bin' }>} t @param {Val} a @param {Val} b @returns {Val} */
  sums(t, a, b) {
    const stop = blocked(a, b);
    if (stop) return stop;
    const m = a.m + b.m;
    if (t.op === '+' || t.op === '-') {
      if (!sameUnit(a.u, b.u))
        return {
          v: null,
          u: new Map(),
          m,
          loop: null,
          ref:
            t.op === '+'
              ? `cannot add ${shown(a.u)} and ${shown(b.u)}`
              : `cannot take ${shown(b.u)} from ${shown(a.u)}`,
        };
      return {
        v: a.v === null || b.v === null ? null : t.op === '+' ? a.v + b.v : a.v - b.v,
        u: a.u,
        m,
        loop: null,
        ref: null,
      };
    }
    const u = unitTimes(a.u, b.u, t.op === '*' ? 1 : -1);
    if (a.v === null || b.v === null) return { v: null, u, m, loop: null, ref: null };
    if (t.op === '/' && b.v === 0) return { v: null, u, m, loop: null, ref: 'it divides by zero' };
    return { v: t.op === '*' ? a.v * b.v : a.v / b.v, u, m, loop: null, ref: null };
  }

  /** @param {Extract<Tree, { t: 'roll' }>} t @param {string} id @param {Reads} reads @returns {Val} */
  roll(t, id, reads) {
    const g = this.graph;
    const links = t.dir === 'out' ? g.out(id, t.type).map((e) => e[2]) : g.inc(id, t.type).map((e) => e[0]);
    if (t.fn === 'count') return lone(links.length);
    const prop = t.prop ?? '';
    /** @type {Val[]} */
    const have = [];
    let gaps = 0,
      m = 0;
    /** @type {string[] | null} */
    let loop = null;
    /** @type {string | null} */
    let ref = null;
    for (const to of links) {
      const v = g.nodes.has(to) ? this.valueOf(to, prop, reads) : gap();
      if (v.loop) loop = union(loop, v.loop);
      else if (v.ref) ref = ref || v.ref;
      else if (v.v === null) gaps++;
      else {
        have.push(v);
        m += v.m;
      }
    }
    if (loop) return { v: null, u: new Map(), m: 0, loop, ref: null };
    if (ref) return { v: null, u: new Map(), m: 0, loop: null, ref };
    const first = have[0];
    for (const v of have.slice(1))
      if (first && !sameUnit(v.u, first.u))
        return {
          v: null,
          u: new Map(),
          m: 0,
          loop: null,
          ref: `cannot ${t.fn} ${shown(first.u)} with ${shown(v.u)}`,
        };
    const u = first ? first.u : this.anyUnit(prop);
    m += gaps;
    if (!have.length) return { v: t.fn === 'sum' && !links.length ? 0 : null, u, m, loop: null, ref: null };
    const nums = have.map((v) => v.v ?? 0);
    const total = nums.reduce((s, n) => s + n, 0);
    const picked = { sum: total, avg: total / nums.length, min: Math.min(...nums), max: Math.max(...nums) };
    return { v: picked[/** @type {'sum' | 'avg' | 'min' | 'max'} */ (t.fn)], u, m, loop: null, ref: null };
  }
}

/**
 * @typedef {object} CalculatedValue One calculated value.
 * @property {number | null} value The number, or null for a gap, a loop or a refusal.
 * @property {string} unit
 * @property {number} missing How many inputs it lacked.
 * @property {string[] | null} loop The things in the loop it depends on.
 * @property {string | null} refusal Why it was refused.
 * @property {string} basis What it was worked out from, hashed.
 */

/**
 * Every thing's calculated values. `ids` limits it to those things. The answer is `{ values, problems }`: values by
 * thing and property name, each `{ value, unit, missing, loop, refusal, basis }`; problems are declarations that
 * cannot be used. The graph is only read.
 * @param {PlainGraph} graph
 * @param {string[]} [ids]
 * @returns {{ values: Record<string, Record<string, CalculatedValue>>, problems: [string, string, string][] }}
 */
function calculate(graph, ids) {
  const work = new Calculation(graph);
  /** @type {Map<string, Map<string, CalculatedValue>>} */
  const values = new Map();
  /** @type {[string, string, string][]} */
  const problems = [];
  for (const d of calculatedOf(graph)) for (const f of d.flags) problems.push([d.id, f[0], f[1]]);
  const wanted = ids ? new Set(ids) : null;
  for (const [id, [labels]] of graph.nodes) {
    if (wanted && !wanted.has(id)) continue;
    for (const label of [...labels].sort())
      for (const [key, d] of work.calc)
        if (key.startsWith(`${label}|`)) {
          const name = String(d.name);
          if (work.declOf(id, name) !== d) continue;
          const { val, reads } = work.result(id, name, d);
          const own = values.get(id) ?? new Map();
          values.set(id, own);
          own.set(name, {
            value: val.v,
            unit: unitText(val.u),
            missing: val.m,
            loop: val.loop,
            refusal: val.ref,
            basis: hash16([d.is, d.unit ?? null, reads]),
          });
        }
  }
  return {
    values: Object.fromEntries([...values].map(([id, own]) => [id, Object.fromEntries(own)])),
    problems,
  };
}

/**
 * The keys (`thing|name`) of kept values no longer what they would be worked out as now: stale or unknown.
 * @param {PlainGraph} graph
 * @param {Record<string, { basis?: string }>} cache
 * @returns {string[]}
 */
function staleCalculated(graph, cache) {
  const now = calculate(graph).values;
  /** @type {string[]} */
  const stale = [];
  for (const [key, entry] of Object.entries(cache || {})) {
    const cut = key.lastIndexOf('|'),
      thing = key.slice(0, cut),
      cur = Object.hasOwn(now, thing) ? now[thing]?.[key.slice(cut + 1)] : undefined;
    if (!cur || !entry || entry.basis !== cur.basis) stale.push(key);
  }
  return stale.sort();
}

module.exports = { CALC_LIMITS, calculatedOf, calculate, staleCalculated };

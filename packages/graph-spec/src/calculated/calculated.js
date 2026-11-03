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

// ── what a schema declares ────────────────────────────────────────────────────────────────────────
/**
 * The Calculated and Quantity things of a graph, each with what is wrong with it.
 * @param {PlainGraph} graph
 * @returns {Declaration[]}
 */
function calculatedOf(graph) {
  const decl = (/** @type {string} */ label) =>
    graph
      .labelled(label)
      .sort()
      .map((id) => {
        const p = graph.p(id),
          /** @type {[string, string][]} */
          flags = [];
        if (typeof p['of'] !== 'string' || !p['of']) flags.push(['calc-no-kind', '']);
        if (typeof p['name'] !== 'string' || !p['name']) flags.push(['calc-unnamed', '']);
        if (label === 'Calculated') {
          try {
            parse(p['is']);
          } catch (e) {
            if (!(e instanceof Refusal)) throw e;
            flags.push(['calc-unreadable', e.message]);
          }
        }
        return {
          id,
          of: p['of'] ?? null,
          name: p['name'] ?? null,
          is: label === 'Calculated' ? (p['is'] ?? null) : null,
          unit: p['unit'] ?? null,
          flags,
        };
      });
  return [...decl('Calculated'), ...decl('Quantity')];
}

/**
 * What a graph's declarations give to look up: the calculated ones and every unit by kind and name.
 * @param {PlainGraph} graph
 */
function declarations(graph) {
  /** `${kind}|${name}` -> declaration @type {Map<string, Declaration>} */
  const calc = new Map();
  /** `${kind}|${name}` -> unit text @type {Map<string, string>} */
  const units = new Map();
  /** name -> the units written for it @type {Map<string, Set<string>>} */
  const byName = new Map();
  for (const d of calculatedOf(graph)) {
    if (typeof d.of !== 'string' || typeof d.name !== 'string' || !d.of || !d.name) continue;
    const key = `${d.of}|${d.name}`;
    if (d.is !== null && !calc.has(key)) calc.set(key, d);
    if (typeof d.unit === 'string' && d.unit.trim()) {
      units.set(key, d.unit);
      const seen = byName.get(d.name) ?? new Set();
      byName.set(d.name, seen.add(unitText(unitOfText(d.unit))));
    }
  }
  return { calc, units, byName };
}

/** @param {Unit} [u] @returns {Val} */
const gap = (u = {}) => ({ v: null, u, m: 1, loop: null, ref: null });
/** @param {number} v @param {Unit} [u] @returns {Val} */
const lone = (v, u = {}) => ({ v, u, m: 0, loop: null, ref: null });
/** @param {string[] | null | undefined} a @param {string[] | null | undefined} b */
const union = (a, b) => [...new Set([...(a || []), ...(b || [])])].sort();

/**
 * Two operands made one when either is a loop or a refusal, else null (the caller works the numbers).
 * @param {Val} a @param {Val} b @returns {Val | null}
 */
function blocked(a, b) {
  if (a.loop || b.loop) return { v: null, u: {}, m: a.m + b.m, loop: union(a.loop, b.loop), ref: null };
  if (a.ref || b.ref) return { v: null, u: {}, m: a.m + b.m, loop: null, ref: a.ref || b.ref };
  return null;
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
  const { calc, units, byName } = declarations(graph);
  /** @type {Record<string, Record<string, CalculatedValue>>} */
  const values = {};
  /** @type {[string, string, string][]} */
  const problems = [];
  /** @type {Map<string, { val: Val, reads: Reads }>} */
  const memo = new Map();
  /** @type {string[]} */
  const stack = [];
  /** @type {Map<string, Tree | Refusal>} */
  const trees = new Map();
  for (const d of calculatedOf(graph)) for (const f of d.flags) problems.push([d.id, f[0], f[1]]);
  const treeOf = (/** @type {Declaration} */ d) => {
    let t = trees.get(d.id);
    if (t === undefined) {
      try {
        t = parse(d.is);
      } catch (e) {
        if (!(e instanceof Refusal)) throw e;
        t = e;
      }
      trees.set(d.id, t);
    }
    return t;
  };
  const labelsOf = (/** @type {string} */ id) => [...(graph.nodes.get(id)?.[0] ?? [])].sort();
  const declOf = (/** @type {string} */ id, /** @type {string} */ name) => {
    for (const l of labelsOf(id)) {
      const d = calc.get(`${l}|${name}`);
      if (d) return d;
    }
    return null;
  };
  const storedUnit = (/** @type {string} */ id, /** @type {string} */ name) => {
    for (const l of labelsOf(id)) {
      const text = units.get(`${l}|${name}`);
      if (text !== undefined) return unitOfText(text);
    }
    return null;
  };
  const anyUnit = (/** @type {string} */ name) => {
    const set = byName.get(name);
    const only = set && set.size === 1 ? [...set][0] : undefined;
    return only === undefined ? {} : unitOfText(only);
  };

  /**
   * One thing's property: a stored number, or a calculated one worked out.
   * @param {string} id @param {string} name @param {Reads} reads @returns {Val}
   */
  function valueOf(id, name, reads) {
    const d = declOf(id, name);
    if (d) {
      const r = result(id, name, d);
      reads.push(...r.reads);
      return r.val;
    }
    const p = graph.p(id)[name];
    reads.push([`${id}.${name}`, p === undefined ? null : p]);
    const u = storedUnit(id, name) ?? {};
    if (p === undefined || p === null) return gap(u);
    if (typeof p !== 'number' || !Number.isFinite(p))
      return { v: null, u, m: 0, loop: null, ref: `${name} of ${id} is not a number` };
    return lone(p, u);
  }

  /** @param {string} id @param {string} name @param {Declaration} d @returns {{ val: Val, reads: Reads }} */
  function result(id, name, d) {
    const key = `${id}|${name}`;
    const memoed = memo.get(key);
    if (memoed) return memoed;
    const at = stack.indexOf(key);
    if (at >= 0) {
      const members = stack.slice(at).map((k) => k.slice(0, k.lastIndexOf('|')));
      return { val: { v: null, u: {}, m: 0, loop: union(members, []), ref: null }, reads: [] };
    }
    stack.push(key);
    /** @type {Reads} */
    const reads = [];
    const tree = treeOf(d);
    /** @type {Val} */
    let val = tree instanceof Refusal ? { v: null, u: {}, m: 0, loop: null, ref: tree.message } : run(tree, id, reads);
    stack.pop();
    // a declared unit must agree with the one the expression gives; a plain number takes the declared unit
    if (!val.loop && !val.ref && typeof d.unit === 'string' && d.unit.trim()) {
      const want = unitOfText(d.unit);
      if (unitText(val.u) === '') val = { ...val, u: want };
      else if (!sameUnit(val.u, want))
        val = { ...val, v: null, ref: `${name} works out in ${shown(val.u)} but is declared in ${shown(want)}` };
    }
    const out = { val, reads };
    memo.set(key, out);
    return out;
  }

  /** @param {Tree} t @param {string} id @param {Reads} reads @returns {Val} */
  function run(t, id, reads) {
    switch (t.t) {
      case 'num':
        return lone(t.v);
      case 'name':
        return valueOf(id, t.n, reads);
      case 'neg': {
        const a = run(t.a, id, reads);
        return a.v === null ? a : { ...a, v: -a.v };
      }
      case 'bin': {
        const a = run(t.a, id, reads),
          b = run(t.b, id, reads);
        const stop = blocked(a, b);
        if (stop) return stop;
        const m = a.m + b.m;
        if (t.op === '+' || t.op === '-') {
          if (!sameUnit(a.u, b.u))
            return {
              v: null,
              u: {},
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
      default:
        return roll(t, id, reads);
    }
  }

  /** @param {Extract<Tree, { t: 'roll' }>} t @param {string} id @param {Reads} reads @returns {Val} */
  function roll(t, id, reads) {
    const links = t.dir === 'out' ? graph.out(id, t.type).map((e) => e[2]) : graph.inc(id, t.type).map((e) => e[0]);
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
      const v = graph.nodes.has(to) ? valueOf(to, prop, reads) : gap();
      if (v.loop) loop = union(loop, v.loop);
      else if (v.ref) ref = ref || v.ref;
      else if (v.v === null) gaps++;
      else {
        have.push(v);
        m += v.m;
      }
    }
    if (loop) return { v: null, u: {}, m: 0, loop, ref: null };
    if (ref) return { v: null, u: {}, m: 0, loop: null, ref };
    const first = have[0];
    for (const v of have.slice(1))
      if (first && !sameUnit(v.u, first.u))
        return { v: null, u: {}, m: 0, loop: null, ref: `cannot ${t.fn} ${shown(first.u)} with ${shown(v.u)}` };
    const u = first ? first.u : anyUnit(prop);
    m += gaps;
    if (!have.length) return { v: t.fn === 'sum' && !links.length ? 0 : null, u, m, loop: null, ref: null };
    const nums = have.map((v) => v.v ?? 0);
    const total = nums.reduce((s, n) => s + n, 0);
    const picked = { sum: total, avg: total / nums.length, min: Math.min(...nums), max: Math.max(...nums) };
    return { v: picked[/** @type {'sum' | 'avg' | 'min' | 'max'} */ (t.fn)], u, m, loop: null, ref: null };
  }

  const wanted = ids ? new Set(ids) : null;
  for (const [id, [labels]] of graph.nodes) {
    if (wanted && !wanted.has(id)) continue;
    for (const label of [...labels].sort())
      for (const [key, d] of calc)
        if (key.startsWith(`${label}|`)) {
          const name = String(d.name);
          if (declOf(id, name) !== d) continue;
          const { val, reads } = result(id, name, d);
          const own = values[id] ?? (values[id] = {});
          own[name] = {
            value: val.v,
            unit: unitText(val.u),
            missing: val.m,
            loop: val.loop,
            refusal: val.ref,
            basis: hash16([d.is, d.unit ?? null, reads]),
          };
        }
  }
  return { values, problems };
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
      cur = now[key.slice(0, cut)]?.[key.slice(cut + 1)];
    if (!cur || !entry || entry.basis !== cur.basis) stale.push(key);
  }
  return stale.sort();
}

module.exports = { CALC_LIMITS, calculatedOf, calculate, staleCalculated };

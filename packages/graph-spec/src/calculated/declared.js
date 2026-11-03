// What a schema declares for calculated values (editor spec §57): the Calculated and Quantity things of a graph, and the
// lookups the engine in calculated.js uses. Its Python twin is the top of graphspec/engine/calculated/calculated.py.
'use strict';

const { Refusal } = require('../values/refusal.js');
const { parse, unitOfText, unitText } = require('./language.js');

/** @typedef {import('./calculated.js').PlainGraph} PlainGraph */
/** @typedef {import('./calculated.js').Declaration} Declaration */

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

module.exports = { calculatedOf, declarations };

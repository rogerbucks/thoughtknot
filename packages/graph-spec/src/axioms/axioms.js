// The graph spec's axioms (editor spec §64, axioms_checker; GS8): the few laws every valid graph obeys, and one check
// that finds each one a graph breaks. A broken axiom is reported with its place, the axiom in its words and a fix,
// under its stable code. It never stops a graph being read or drawn. The laws of an operation, such as a join, cannot
// be seen in one graph: the generated-graph tests hold those. Its Python twin is graphspec/rules/axioms.py, and
// test/axiom-cases.json holds both to the same answers.
'use strict';

const TABLE = require('./axioms.json');
const { RANGE } = require('../rules/certainty.js');
const { untyped } = require('../rules/types.js');
const { projectsBack } = require('../rules/projection.js');
const { schemaFor } = require('../graph/graph.js');

/** The axioms, in order: id, name, plain, formal, code, checked, message and fix. */
const AXIOMS = TABLE.axioms;
const BY_ID = new Map(AXIOMS.map((a) => [a.id, a]));

/** A template's {name}s filled from `parts`. */
const fill = (template, parts) => template.replace(/\{(\w+)\}/g, (_, k) => String(parts[k]));

/** One broken axiom: its id and code, the graph, the place, the axiom in its words, and the message and fix. */
function broken(id, graph, place, parts = {}) {
  const a = BY_ID.get(id);
  const all = { graph, place, ...parts };
  return { axiom: id, code: a.code, graph, place, law: a.plain, message: fill(a.message, all), fix: fill(a.fix, all) };
}

const thing = (id) => `thing '${id}'`;
const link = ([from, type, to]) => `link ${from}-[:${type}]->${to}`;

// A1: each node is held under its own id
function identity(g, name) {
  const out = [];
  for (const [key, [, props]] of g.nodes)
    if (props.id !== key) out.push(broken('A1', name, thing(key), { key, id: props.id ?? '' }));
  return out;
}

// A2: every link starts and ends at a thing the graph holds
function twoEnds(g, name) {
  const out = [];
  for (const e of g.edges)
    for (const [end, id] of [
      ['start', e[0]],
      ['far', e[2]],
    ])
      if (!g.nodes.has(id)) out.push(broken('A2', name, link(e), { end, id }));
  return out;
}

// A3: every node and link has a declared type. A draft, with no schema, works its types out from its data (§5).
function declaredTypes(world, name) {
  const g = world[name];
  const own = g.labelled('ElementType').length > 0;
  const [schemaName, shared] = schemaFor(world, name);
  if (!own && !schemaName) return [];
  const [labels, edges] = untyped(g, shared);
  const out = [];
  for (const [id, [own]] of g.nodes)
    for (const l of [...own].sort()) if (labels.includes(l)) out.push(broken('A3', name, thing(id), { type: l }));
  for (const e of g.edges) if (edges.includes(e[1])) out.push(broken('A3', name, link(e), { type: e[1] }));
  return out;
}

// A4: written out as the flat projection and read back, the graph is the same
function sameText(g, name) {
  let why;
  try {
    if (projectsBack(g, name)) return [];
    why = 'it reads back as a different graph';
  } catch {
    why = 'the flat projection cannot write it'; // the same words from both readers, whatever refused it
  }
  return [broken('A4', name, `graph ${name}`, { why })];
}

// A7: a likelihood is a word on the scale, and a range runs from low to high
function certainty(g, name) {
  const out = [];
  for (const [id, [, p]] of g.nodes) {
    const from = p.likelihood,
      to = p.likelihood_to;
    if (from === undefined && to === undefined) continue;
    const off = [from, to].filter((w) => w !== undefined && !(w in RANGE));
    if (off.length) out.push(broken('A7', name, thing(id), { why: `'${off[0]}', which is not on the scale` }));
    else if (from !== undefined && to !== undefined && RANGE[from][0] > RANGE[to][1])
      out.push(broken('A7', name, thing(id), { why: `range '${from}' to '${to}', which runs from high to low` }));
  }
  return out;
}

// A8: each item has at most one successor, and successors never loop
function history(g, name) {
  const out = [];
  const next = new Map(); // item -> its successors
  for (const [succ, type, item] of g.edges) {
    if (type !== 'SUPERSEDES') continue;
    if (!next.has(item)) next.set(item, []);
    next.get(item).push(succ);
  }
  for (const [item, succs] of [...next].sort(([a], [b]) => (a < b ? -1 : 1)))
    if (succs.length > 1)
      out.push(broken('A8', name, thing(item), { why: `has ${succs.length} successors: ${succs.sort().join(', ')}` }));
  const reported = new Set();
  for (const start of [...next.keys()].sort()) {
    const seen = [start];
    let at = start;
    while (next.has(at) && next.get(at).length === 1) {
      at = next.get(at)[0];
      if (at === start) {
        const loop = [...seen].sort();
        if (!reported.has(loop[0])) {
          reported.add(loop[0]);
          out.push(broken('A8', name, thing(loop[0]), { why: `is superseded in a loop: ${loop.join(', ')}` }));
        }
        break;
      }
      if (seen.includes(at)) break;
      seen.push(at);
    }
  }
  return out;
}

/** The checks, one per axiom a single graph can break, in the axioms' order. Each takes (world, name). */
const CHECKS = {
  A1: (w, n) => identity(w[n], n),
  A2: (w, n) => twoEnds(w[n], n),
  A3: declaredTypes,
  A4: (w, n) => sameText(w[n], n),
  A7: (w, n) => certainty(w[n], n),
  A8: (w, n) => history(w[n], n),
};

/**
 * Every axiom graph `name` of the world breaks, in the axioms' order. A graph that breaks none gives []. Options:
 * `off` names axioms whose check is switched off, as a safeguard test does (§17, axioms_safeguards).
 */
function axioms(world, name, options = {}) {
  const off = new Set(options.off || []);
  const out = [];
  for (const a of AXIOMS) {
    if (!CHECKS[a.id] || off.has(a.id)) continue;
    // a graph with a link that has no end cannot be written out, so A4 waits until A1 and A2 hold
    if (a.id === 'A4' && out.some((b) => b.axiom === 'A1' || b.axiom === 'A2')) continue;
    out.push(...CHECKS[a.id](world, name));
  }
  return out;
}

module.exports = { AXIOMS, axioms };

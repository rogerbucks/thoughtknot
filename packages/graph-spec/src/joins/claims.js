// §21 joins: the joined result being built, and the claims recorded on it.
'use strict';

/** @typedef {any} Value A property value as a join holds it: a profile value, or a list of them. */
/** @typedef {{ labels: Set<string>, props: Record<string, Value>, stated_in?: string[] }} JoinNode A thing joined. */
/** @typedef {{ key: any[], props: Record<string, Value> }} JoinEdge A relationship by its key [from, type, to, ident]. */
/** @typedef {{ id: string, nodes: Map<string, JoinNode>, edges: Map<string, JoinEdge> }} JoinDoc A document read to join. */
/**
 * @typedef {object} Joined The joined result. It holds its things and relationships, and the documents behind each. It
 * holds its claims, its report rows, and the pairs and paradoxes of claims that contradict.
 * @property {Map<string, JoinNode>} nodes
 * @property {Map<string, JoinEdge>} edges
 * @property {Map<string, string[]>} src
 * @property {Map<string, string[]>} esrc
 * @property {Map<string, Record<string, any>>} claims
 * @property {any[][]} report
 * @property {string[][]} pairs
 * @property {any[][]} paradoxes
 */
const short = (/** @type {string} */ d) => d.split(':')[1];
// An empty join. It holds its nodes and relationships, and the documents behind each value and relationship (src,
// esrc). It holds its claims and report rows, and the pairs and paradoxes of claims that contradict.
/** @returns {Joined} */
function newJ() {
  return {
    nodes: new Map(),
    edges: new Map(),
    src: new Map(),
    esrc: new Map(),
    claims: new Map(),
    report: [],
    pairs: [],
    paradoxes: [],
  };
}
// Adds to the join a contested claim, stated in the documents given, and returns its id. The id is made from the
// subject, what is claimed and the documents, sorted. So the same claim made twice is one. p adds or overrides fields.
/**
 * @param {Joined} joined @param {string} subject @param {string} what @param {string[]} docs
 * @param {any[][]} about @param {Record<string, any>} [p]
 */
function addClaim(joined, subject, what, docs, about, p) {
  const ds = docs.slice().sort(),
    cid = `claim:join/${subject}/${what}@${ds.map(short).join('+')}`;
  joined.claims.set(
    cid,
    Object.assign(
      {
        id: cid,
        likelihood: 'cannot-judge',
        confidence: 'low',
        status: 'contested',
        rule: 'rule:join@1',
        stated_in: ds.join(' '),
        _about: about,
        _docs: ds,
      },
      p || {},
    ),
  );
  return cid;
}
// Two claim ids in order, so a pair of contradicting claims is written one way whichever was found first.
const sortedPair = (/** @type {string} */ a, /** @type {string} */ b) => (a < b ? [a, b] : [b, a]);

module.exports = { newJ, addClaim, sortedPair };

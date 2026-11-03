"""Calculated values match the JavaScript library's on every shared case.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_calculated

The cases are packages/graph-spec/test/calculated-cases.json (editor spec §57, calc_engines_agree):
a graph, a call and the answer it must give. Both libraries work out the same value, unit, missing
count and loop for each.
"""

import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from graphspec.engine.calculated.calculated import calculate, stale_calculated  # noqa: E402
from graphspec.rules.plain_graph import Graph  # noqa: E402

CASES = os.path.join(ROOT, "packages", "graph-spec", "test", "calculated-cases.json")

with open(CASES, encoding="utf-8") as f:
    SHARED = json.load(f)["cases"]

CALLS = {"calculate": calculate, "staleCalculated": stale_calculated}


def graph_of(s):
    nodes = {i: (frozenset(labels), {"id": i, **props}) for i, labels, props in s["nodes"]}
    return Graph(nodes, [(a, t, b, p[0] if p else {}) for a, t, b, *p in s["edges"]])


class CalculatedAgree(unittest.TestCase):
    def test_every_shared_case(self):
        for c in SHARED:
            with self.subTest(c["name"]):
                got = CALLS[c["call"]](graph_of(c["graph"]), *c["args"])
                self.assertEqual(json.loads(json.dumps(got)), c["expected"])

    def test_reading_leaves_the_graph_as_it_was(self):
        g = graph_of(SHARED[0]["graph"])
        before = json.dumps([sorted(g.nodes), g.edges], default=sorted)
        calculate(g)
        self.assertEqual(json.dumps([sorted(g.nodes), g.edges], default=sorted), before)


if __name__ == "__main__":
    unittest.main()

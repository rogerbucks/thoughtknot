"""A rule's look runs as a lens, and finds what the JavaScript library finds, on every shared case.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_rule_looks

The cases are packages/graph-spec/test/rule-look-cases.json (editor spec §56, rule_look_when): a
look's `when` is run as a lens query, of things or of links, so both engines give it the same
things.
"""

import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from graphspec.engine.lenses.saved_lenses import query_links, query_things, run_lens  # noqa: E402
from graphspec.rules.plain_graph import Graph  # noqa: E402

CASES = os.path.join(ROOT, "packages", "graph-spec", "test", "rule-look-cases.json")

with open(CASES, encoding="utf-8") as f:
    SHARED = json.load(f)["cases"]


def graph_of(s):
    """The plain graph of a shared case."""
    nodes = {i: (frozenset(labels), {"id": i, **props}) for i, labels, props in s["nodes"]}
    return Graph(nodes, [(e[0], e[1], e[2], e[3] if len(e) > 3 else {}) for e in s["edges"]])


def run(case):
    """A shared case's call; runLens takes its last argument as options."""
    g = graph_of(case["graph"])
    if case["call"] == "runLens":
        *args, options = case["args"]
        return run_lens(g, *args, **options)
    return {"queryThings": query_things, "queryLinks": query_links}[case["call"]](g, *case["args"])


class SharedCases(unittest.TestCase):
    def test_every_case_gives_its_recorded_answer(self):
        for case in SHARED:
            with self.subTest(case["name"]):
                self.assertEqual(json.loads(json.dumps(run(case))), case["expected"])


class RuleLooks(unittest.TestCase):
    def test_a_when_finds_exactly_what_the_same_lens_finds(self):
        by_name = {c["name"]: c for c in SHARED}
        when = run(by_name["a when on a kind finds the things the same lens finds"])
        lens = run(by_name["the lens itself finds the same things"])
        self.assertEqual(when, lens["things"])


if __name__ == "__main__":
    unittest.main()

"""The graph spec's axioms (editor spec §64, axioms_checker; GS8): graphspec/rules/axioms.py.
Each break in packages/graph-spec/test/axiom-cases.json is found with its place, the axiom in its
words and a fix, under its code, as the JavaScript library finds it
(packages/graph-spec/test/axioms.test.mjs). The words here are the table's,
packages/graph-spec/src/axioms/axioms.json.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_axioms
"""

import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import gql_profile as gp  # noqa: E402
import graph_rules as gr  # noqa: E402
from graphspec.rules.axioms import AXIOMS, axioms  # noqa: E402


def _json(*parts):
    with open(os.path.join(ROOT, "packages", "graph-spec", *parts), encoding="utf-8") as f:
        return json.load(f)


CASES = _json("test", "axiom-cases.json")["cases"]
TABLE = _json("src", "axioms", "axioms.json")["axioms"]


def world_of(c):
    if "blocks" in c:
        st = gp.Store()
        for lines in c["blocks"]:
            st.apply("\n".join(lines))
        return gr.World.from_store(st)
    graphs = {}
    for name, g in c["graphs"].items():
        nodes = {
            n.get("key", n["props"]["id"]): (frozenset(n["labels"]), n["props"])
            for n in g["nodes"]
        }
        graphs[name] = gr.Graph(nodes, [tuple(e) for e in g["links"]])
    return gr.World(graphs)


class AxiomsChecker(unittest.TestCase):
    def test_each_case(self):
        for c in CASES:
            with self.subTest(c["name"]):
                self.assertEqual(axioms(world_of(c), c["graph"]), c["answer"])

    def test_the_words_are_the_tables(self):
        self.assertEqual(
            [(a, law, code, message, fix) for a, law, code, message, fix in AXIOMS],
            [(t["id"], t["plain"], t["code"], t["message"], t["fix"]) for t in TABLE],
        )

    def test_a_check_switched_off_finds_nothing(self):
        c = next(x for x in CASES if x["name"].startswith("A8"))
        self.assertTrue(axioms(world_of(c), c["graph"]))
        self.assertEqual(axioms(world_of(c), c["graph"], off=("A8",)), [])


if __name__ == "__main__":
    unittest.main()

"""The axioms fit together (editor spec §64, axioms_consistent; GS8). A search over generated
graphs (tests/axiom_graphs.py, smallest) is the small solver:
- it finds a graph with things, links, a range and a successor that keeps every axiom, so the
  axioms do not clash;
- for each axiom one graph can break, it finds a graph that breaks it and keeps every other, so no
  axiom follows from the rest unnoticed.
The four laws of an operation (A5, A6, A9, A10) cannot be broken in one graph. The table notes each
as checked 'generated', and the generated-graph tests hold them.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_axioms_model
"""

import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)

from graphspec.rules.axioms import axioms  # noqa: E402

import axiom_graphs as ag  # noqa: E402

with open(
    os.path.join(ROOT, "packages", "graph-spec", "src", "axioms", "axioms.json"), encoding="utf-8"
) as f:
    TABLE = json.load(f)["axioms"]


def broken(w):
    """The axioms a world's graph g breaks, as a set of ids."""
    return {p["axiom"] for p in axioms(w, "g")}


class AxiomsConsistent(unittest.TestCase):
    def test_a_graph_keeps_every_axiom(self):
        g = ag.smallest(
            lambda g: (
                g["schema"]
                and len(g["things"]) >= 3
                and g["links"]
                and g["supersedes"]
                and any("likelihood" in t for t in g["things"])
                and not broken(ag.world_of_text(ag.text(g)))
            )
        )
        self.assertEqual(broken(ag.world_of_text(ag.text(g))), set())

    def test_each_axiom_one_graph_can_break_is_broken_alone_by_some_graph(self):
        for axiom in ag.PLANTABLE:
            g = ag.smallest(lambda g, axiom=axiom: broken(ag.plant(g, axiom)) == {axiom})
            self.assertEqual(broken(ag.plant(g, axiom)), {axiom})

    def test_every_axiom_is_checked_in_a_graph_or_noted_as_a_law_of_an_operation(self):
        by_where = {}
        for a in TABLE:
            by_where.setdefault(a["checked"], []).append(a["id"])
        self.assertEqual(by_where["graph"], ag.PLANTABLE)
        self.assertEqual(by_where["generated"], ["A5", "A6", "A9", "A10"])


if __name__ == "__main__":
    unittest.main()

"""The relationships view as Mermaid draws written groups as subgraphs, like the JavaScript one.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_mermaid_groups

The cases are packages/graph-spec/test/mermaid-group-cases.json (editor spec §31;
wiki/Mermaid-mapping-review.md, gap G1). Both libraries write each expected text, byte for byte.
"""

import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from graphspec.rules.plain_graph import Graph  # noqa: E402
from graphspec.rules.views import mermaid_graph  # noqa: E402

CASES = os.path.join(ROOT, "packages", "graph-spec", "test", "mermaid-group-cases.json")

with open(CASES, encoding="utf-8") as f:
    SHARED = json.load(f)["cases"]


def graph_of(case):
    """The plain graph of a shared case."""
    nodes = {i: (frozenset(labels), {"id": i}) for i, labels in case["nodes"]}
    return Graph(nodes, [(s, t, d, {}) for s, t, d in case["edges"]])


class SharedCases(unittest.TestCase):
    def test_every_case_gives_its_recorded_text(self):
        for case in SHARED:
            with self.subTest(case["name"]):
                self.assertEqual(mermaid_graph(graph_of(case)), case["expected"])

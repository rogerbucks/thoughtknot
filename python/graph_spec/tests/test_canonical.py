"""A graph's one canonical form and how it is hashed (editor spec §51, spec_canonical_form;
requirements/graph-spec-canonical.md). The same graph written two ways gives one hash, and
different graphs give different ones. The cases are shared with the JavaScript reader
(packages/graph-spec/test/canonical.test.mjs), which also records the hash of each group.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_canonical
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

with open(
    os.path.join(ROOT, "packages", "graph-spec", "test", "canonical-cases.json"), encoding="utf-8"
) as f:
    CASES = json.load(f)


def hash_of(block):
    """This library's canonical hash of the graph g the block writes."""
    st = gp.Store()
    st.apply(block)
    return gr.canon(gr.World.from_store(st)["g"])


class SpecCanonicalForm(unittest.TestCase):
    def test_a_graph_written_several_ways_gives_the_recorded_hash(self):
        for group in CASES["same"]:
            for block in group["blocks"]:
                self.assertEqual(hash_of(block), group["hash"], f"{group['name']}: {block}")

    def test_different_graphs_give_different_hashes(self):
        for pair in CASES["different"]:
            a, b = pair["blocks"]
            self.assertNotEqual(hash_of(a), hash_of(b), pair["name"])


if __name__ == "__main__":
    unittest.main()

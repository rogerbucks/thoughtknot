"""The three-way join of two revisions over their base (§21, same_join_every_author; CODE-2).

Each branch the join takes has a case, written with its intended answer: both sides agree, one
side changed, both changed differently, and a removal against a change with hold on and off. The
cases are packages/graph-spec/test/merge3-cases.json, which the JavaScript library answers too
(packages/graph-spec/test/merge3.test.mjs).

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_merge3
"""

import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import graph_spec as gs  # noqa: E402
import graph_rules as gr  # noqa: E402
from graphspec.engine.joining.restating import raw_props  # noqa: E402

with open(
    os.path.join(HERE, "..", "..", "..", "packages", "graph-spec", "test", "merge3-cases.json"),
    encoding="utf-8",
) as f:
    CASES = json.load(f)["cases"]


def block(doc_id, lines):
    """A document of `lines`, as a revision of the base unless it is the base."""
    revision = "" if doc_id == "doc:base" else " · revision of doc:base"
    head = f"// graph: shop · document {doc_id} · schema s1 · as of 2026-10-01{revision}"
    return "\n".join([head, *lines])


def answer(c):
    """A case's answer in the cases' shape: rows, contested claims, things and relationships."""
    old = gs.PARSER
    gs.PARSER = "profile"  # the portable reader, as the JavaScript join reads its documents
    try:
        with tempfile.TemporaryDirectory() as d:
            config, log = gs.config_from({}), []

            def read(name, doc_id, lines, base=None):
                p = os.path.join(d, f"{name}.md")
                with open(p, "w", encoding="utf-8") as f:
                    f.write(f"```gql\n{block(doc_id, lines)}\n```\n")
                doc = gs.parse(p)
                if base is None:
                    doc["_raw"] = raw_props(doc)
                doc = gs.normalise(doc, log, config, base)
                gs.validate(doc, log, config)
                return doc

            base = read("base", "doc:base", c["base"])
            a = read("a", "doc:a", c["a"], base)
            b = read("b", "doc:b", c["b"], base)
            joined = gs.join3(base, a, b, config, (), hold=c.get("hold", True))
    finally:
        gs.PARSER = old
    nv = gr.norm
    return {
        "rows": sorted([[r[0], str(r[1]), str(r[2])] for r in log + joined["report"]], key=gr.jcs),
        "claims": {k: c["status"] for k, c in joined["claims"].items()},
        "nodes": {
            k: {x: nv(v) for x, v in n["props"].items()} for k, n in joined["nodes"].items()
        },
        "edges": [f"{k[0]}-{k[1]}->{k[2]}" for k in joined["edges"]],
    }


class Merge3(unittest.TestCase):
    def test_each_case(self):
        for c in CASES:
            with self.subTest(c["name"]):
                self.assertEqual(answer(c), c["answer"])


if __name__ == "__main__":
    unittest.main()

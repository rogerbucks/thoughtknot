"""The notation's grammar, in a form a program can read (editor spec §51, spec_grammar).

requirements/graph-spec-grammar.json holds the graph line, the containers and the value types. The
cases in packages/graph-spec/test/grammar-cases.json are made from it by the JavaScript test, with
a fixed seed, each with the JavaScript reader's answer. This reader must give every case the same
answer, read each value type and container as the grammar says, and refuse each text outside the
grammar with its code.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_grammar
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

with open(os.path.join(ROOT, "requirements", "graph-spec-grammar.json"), encoding="utf-8") as f:
    GRAMMAR = json.load(f)
with open(
    os.path.join(ROOT, "packages", "graph-spec", "test", "grammar-cases.json"), encoding="utf-8"
) as f:
    CASES = json.load(f)


def reads(block):
    """This library's answer: the refusal's code and line, or each graph's canonical form."""
    try:
        st = gp.Store()
        st.apply(block)
        world = gr.World.from_store(st)
        return {"graphs": {g: gr.canon(world[g]) for g in sorted(st.graphs)}}
    except gp.ProfileError as e:
        return {"refused": [e.code, e.line]}


class SpecGrammar(unittest.TestCase):
    def test_every_case_is_read_as_the_javascript_reader_reads_it(self):
        # a plain loop, never subTest: the tests-first replay counts a test by its own result
        for c in CASES["cases"]:
            self.assertEqual(reads(c["text"]), c["answer"], c["text"])
        self.assertTrue(any("graphs" in c["answer"] for c in CASES["cases"]), "some are read")
        self.assertTrue(any("refused" in c["answer"] for c in CASES["cases"]), "and some refused")

    def test_every_value_type_is_read(self):
        for v in GRAMMAR["values"]:
            answer = reads(f"// graph: g\n(a:T {{id: 'a', v: {v['example']}}})")
            self.assertIn("graphs", answer, v["type"])

    def test_each_container_is_read_or_refused_as_the_grammar_says(self):
        for c in GRAMMAR["containers"]:
            answer = reads(c["text"])
            if c["answer"] == "read":
                self.assertIn("graphs", answer, c["kind"])
            else:
                self.assertEqual(answer["refused"][0], c["answer"], c["kind"])

    def test_text_outside_the_grammar_is_refused_with_its_code(self):
        for o in GRAMMAR["outside"]:
            self.assertEqual(reads(o["text"]).get("refused", [None])[0], o["code"], o["name"])


if __name__ == "__main__":
    unittest.main()

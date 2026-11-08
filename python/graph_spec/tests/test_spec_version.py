"""The Graph Spec version a block is written to (editor spec §51, spec_version_in_files). A block
may name it on its graph line, as '· spec 1.0'. The reader reads its own major, an older one, or
none named. It refuses a newer major with GN107 and a fix that says to upgrade. The cases are
shared with the JavaScript reader (packages/graph-spec/test/spec-version.test.mjs).

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_spec_version
"""

import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from graphspec.reader.lexer import ProfileError  # noqa: E402
from graphspec.reader.store import Store  # noqa: E402

CASES_FILE = os.path.join(
    HERE, "..", "..", "..", "packages", "graph-spec", "test", "spec-version-cases.json"
)
with open(CASES_FILE, encoding="utf-8") as f:
    CASES = json.load(f)


class SpecVersionInFiles(unittest.TestCase):
    def test_each_shared_case(self):
        for c in CASES["cases"]:
            with self.subTest(c["name"]):
                store = Store()
                if "code" in c:
                    with self.assertRaises(ProfileError) as caught:
                        store.apply(c["block"])
                    self.assertEqual(caught.exception.code, c["code"])
                    self.assertIn("newer than this reader", str(caught.exception))
                    self.assertIn("upgrade", caught.exception.fix)
                    continue
                store.apply(c["block"])
                self.assertEqual(len(store.graph("g")["nodes"]), c["things"])

    def test_the_refusal_names_both_versions(self):
        with self.assertRaises(ProfileError) as caught:
            Store().apply("// graph: g · spec 2.5\n(a:T)")
        self.assertIn("Graph Spec 2.5", str(caught.exception))
        self.assertIn(f"Graph Spec {CASES['implements']}", str(caught.exception))


if __name__ == "__main__":
    unittest.main()

"""TRUST-9 (security_fix_rule, cc_classified_asks): a document's class is read as the core's
gate reads it. It comes only from a top-level key of its front matter. A doubled or unreadable one
is unknown, and refused. The cases are the core's, packages/core/test/classification-cases.json,
so the two readers agree on each.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_classification
"""

import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import graph_spec as gs  # noqa: E402
from graphspec.engine.documents.classification import classification_of  # noqa: E402

with open(
    os.path.join(ROOT, "packages", "core", "test", "classification-cases.json"), encoding="utf-8"
) as f:
    CASES = json.load(f)["cases"]


class Classification(unittest.TestCase):
    def test_each_shared_case_is_read_as_the_core_reads_it(self):
        for c in CASES:
            with self.subTest(c["name"]):
                want = {"kind": c["kind"]}
                if c["kind"] == "given":
                    want["level"] = c["level"]
                self.assertEqual(classification_of(c["text"]), want)

    def test_a_document_s_class_is_given_none_or_refused(self):
        with tempfile.TemporaryDirectory() as d:
            for c in CASES:
                path = os.path.join(d, "note.md")
                with open(path, "w", encoding="utf-8", newline="") as f:
                    f.write(c["text"])
                with self.subTest(c["name"]):
                    if c["kind"] == "unknown":
                        with self.assertRaisesRegex(ValueError, "refused"):
                            gs.document_class(path)
                    else:
                        want = c["level"] if c["kind"] == "given" else "Unmoderated"
                        self.assertEqual(gs.document_class(path), want)


if __name__ == "__main__":
    unittest.main()

"""The Python reader names, links and fingerprints a reader picture as the apps do (editor spec
§62, picture_same_everywhere, picture_kept_in_step). The cases are
packages/core/test/reader-picture-cases.json, the table the core's reader-picture-note.test.js runs
too. So the apps, the command line and this reader never take turns rewriting a picture.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_reader_picture
"""

import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from graphspec.reader import reader_picture as rp  # noqa: E402

with open(
    os.path.join(ROOT, "packages", "core", "test", "reader-picture-cases.json"), encoding="utf-8"
) as f:
    CASES = json.load(f)


class SharedCases(unittest.TestCase):
    # proves: picture_same_everywhere
    def test_names_links_fingerprints_states_and_lines_match_the_core(self):
        for c in CASES["fileNames"]:
            self.assertEqual(rp.picture_file_name(c["note"], c["graph"]), c["name"], c["note"])
        for c in CASES["links"]:
            self.assertEqual(rp.picture_href(c["note"], c["picture"]), c["href"], c["picture"])
            self.assertEqual(rp.picture_target(c["note"], c["href"]), c["back"], c["href"])
        note = CASES["note"]
        for c in CASES["texts"]:
            self.assertEqual(rp.picture_texts(note, c["graph"]), c["texts"], c["graph"])
            self.assertEqual(
                rp.picture_fingerprint("Work/Team.md", c["texts"]), c["fingerprint"], c["graph"]
            )
        for c in CASES["states"]:
            self.assertEqual(rp.picture_state(c["existing"], c["fingerprint"]), c["state"])
        for c in CASES["linesOf"]:
            self.assertEqual(rp.picture_link_of(c["line"]), c["href"], c["line"])
        for c in CASES["alts"]:
            self.assertEqual(rp.picture_alt(c["sentences"], c["most"]), c["alt"])
        line = CASES["pictureLine"]
        self.assertEqual(rp.picture_line(line["alt"], line["href"]), line["line"])
        self.assertEqual(rp.picture_lines(note), CASES["pictureLines"])
        for c in CASES["withLine"]:
            self.assertEqual(
                rp.with_picture_line(note, c["block"], "![new](n.thoughtknot.svg)"),
                c["note"],
                f"block {c['block']}",
            )
        self.assertEqual(rp.without_picture_lines(note), CASES["without"])

    # proves: picture_kept_in_step
    def test_a_picture_is_ours_and_current_only_by_its_own_mark(self):
        mark = rp.picture_mark("0123456789abcdef")
        self.assertTrue(rp.made_by_thoughtknot(f"<svg>{mark}</svg>"))
        self.assertFalse(rp.made_by_thoughtknot("<svg/>"))
        self.assertEqual(rp.picture_state(f"<svg>{mark}</svg>", "0123456789abcdef"), "current")


if __name__ == "__main__":
    unittest.main()
